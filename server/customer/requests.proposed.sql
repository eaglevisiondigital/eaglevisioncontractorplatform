-- WORKSTREAM 4B FORWARD LOCAL PROPOSAL; unchanged thirteen + customer fourteen required.
-- Default deny. No hosted installation, broker, principal provisioning or grants.
begin;
do $$begin if current_setting('server_encoding')<>'UTF8' then raise exception 'UTF8 required';end if;end$$;
create table private.customer_request_principals(
 organization_id uuid not null references public.organizations(id),id uuid not null default gen_random_uuid(),
 customer_id uuid not null,location_id uuid not null,issuer_name name not null,executor_name name not null,
 user_id uuid not null,session_id uuid not null,expires_at timestamptz not null,auth_expires_at timestamptz not null,revoked_at timestamptz,
 primary key(organization_id,id),unique(id),unique(issuer_name,executor_name),
 unique(organization_id,id,customer_id,location_id,user_id,session_id),
 foreign key(organization_id,customer_id,user_id) references public.portal_identities(organization_id,customer_id,user_id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 -- Session IDs are evidence, not FKs: genuine Auth logout must remain able to delete sessions.
 check(issuer_name<>executor_name),
 check(isfinite(expires_at) and isfinite(auth_expires_at) and expires_at<=auth_expires_at and (revoked_at is null or isfinite(revoked_at)))
);
create index customer_request_principal_mapping on private.customer_request_principals(organization_id,customer_id,user_id);
create index customer_request_principal_location on private.customer_request_principals(organization_id,location_id,customer_id);
create index customer_request_principal_session on private.customer_request_principals(session_id);
create table private.customer_request_intents(
 organization_id uuid not null,id uuid not null,principal_id uuid not null,customer_id uuid not null,location_id uuid not null,
 user_id uuid not null,session_id uuid not null,publication_id uuid not null,estimate_id uuid not null,version_id uuid not null,
 scope_sha256 text not null,request_sha256 text not null,choice text not null,acknowledgment text not null,
 executor_name name not null,backend_pid integer not null,backend_start timestamptz not null,transaction_id bigint not null,
 burn_sequence regclass not null,expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,id),unique(organization_id,user_id,id),
 unique(organization_id,customer_id,location_id,user_id,version_id),
 foreign key(organization_id,principal_id,customer_id,location_id,user_id,session_id) references private.customer_request_principals(organization_id,id,customer_id,location_id,user_id,session_id),
 foreign key(organization_id,publication_id) references private.customer_estimate_access(organization_id,id),
 foreign key(organization_id,estimate_id) references public.estimates(organization_id,id),
 foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id),
 check(scope_sha256 ~ '^[a-f0-9]{64}$' and request_sha256 ~ '^[a-f0-9]{64}$'),
 check(choice in ('approve_review','decline_review','request_changes_review')),
 check(acknowledgment in ('review-only-v1','review-only-v2'))
);
create index customer_request_intent_principal on private.customer_request_intents(organization_id,principal_id,customer_id,location_id,user_id,session_id);
create index customer_request_intent_publication on private.customer_request_intents(organization_id,publication_id);
create index customer_request_intent_version on private.customer_request_intents(organization_id,version_id);
create index customer_request_intent_estimate on private.customer_request_intents(organization_id,estimate_id);
create table private.customer_request_outcomes(
 organization_id uuid not null,request_id uuid not null,decision_id uuid not null,recorded_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,request_id),
 foreign key(organization_id,request_id) references private.customer_request_intents(organization_id,id),
 foreign key(organization_id,decision_id) references private.customer_review_decisions(organization_id,id)
);
create index customer_request_outcome_decision on private.customer_request_outcomes(organization_id,decision_id);
alter table private.customer_review_decisions drop constraint customer_review_decisions_choice_check;
alter table private.customer_review_decisions add constraint customer_review_decisions_choice_check check(choice in ('approve_review','decline_review','request_changes_review'));
alter table private.customer_review_decisions drop constraint customer_review_decisions_acknowledgment_check;
alter table private.customer_review_decisions add constraint customer_review_decisions_acknowledgment_check check(acknowledgment in ('review-only-v1','review-only-v2'));
alter table private.customer_review_decisions add column note text not null default '',add column command_id uuid,add column request_sha256 text;
alter table private.customer_review_decisions add foreign key(organization_id,command_id) references private.customer_request_intents(organization_id,id),
 add check((command_id is null and request_sha256 is null and note='' and choice in ('approve_review','decline_review')) or (command_id is not null and request_sha256 ~ '^[a-f0-9]{64}$')),
 add check((choice='request_changes_review' and char_length(note) between 1 and 2000 and acknowledgment='review-only-v2') or (choice<>'request_changes_review' and note=''));
alter table private.customer_review_decisions add unique(organization_id,command_id,id);
alter table private.customer_request_outcomes add foreign key(organization_id,request_id,decision_id) references private.customer_review_decisions(organization_id,command_id,id);
create index customer_decision_command on private.customer_review_decisions(organization_id,command_id);
create index customer_request_staff_queue on private.customer_review_decisions(organization_id,recorded_at desc,id desc) where choice='request_changes_review' and command_id is not null;
-- No new business ledger: only exact command metadata and result references above.
do $$declare t text;begin foreach t in array array['customer_request_principals','customer_request_intents','customer_request_outcomes'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable before update or delete on private.%I for each row execute function private.release_immutable()',t);
 execute format('create trigger metadata_audit after insert on private.%I for each row execute function private.audit_change()',t);
end loop;end$$;
-- Principal identity is immutable; only exact revocation is permitted to a trusted
-- provisioner. No runtime CRUD or reset/rebind endpoint is provided.
create function private.customer_request_body(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare n text;k text;begin
 perform private.est_object(p,array['organization_id','customer_id','location_id','version_id','publication_id','scope_sha256','choice','note','acknowledgment','request_id']);
 if octet_length(p::text)>16384 then raise exception 'Bounded request required';end if;
 if (select count(*) from jsonb_object_keys(p))<>10 then raise exception 'Complete request required';end if;
 if jsonb_typeof(p->'note') is distinct from 'string' or jsonb_typeof(p->'choice') is distinct from 'string' then raise exception 'Exact customer request required';end if;
 -- ECMAScript trim whitespace; PostgreSQL UTF8 char_length counts Unicode code points.
 n:=btrim(p->>'note',E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
 if p->>'choice' not in ('approve_review','decline_review','request_changes_review') or p->>'scope_sha256' !~ '^[a-f0-9]{64}$' or p->>'acknowledgment' not in ('review-only-v1','review-only-v2') or
 ((p->>'choice'='request_changes_review') and (char_length(n) not between 1 and 2000 or p->>'acknowledgment'<>'review-only-v2')) or
 ((p->>'choice'<>'request_changes_review') and n<>'') then raise exception 'Customer explanation invalid';end if;
 if exists(select 1 from jsonb_each(p) x where jsonb_typeof(x.value)<>'string') then raise exception 'Exact string fields required';end if;
 perform (p->>'organization_id')::uuid,(p->>'customer_id')::uuid,(p->>'location_id')::uuid,(p->>'version_id')::uuid,(p->>'publication_id')::uuid,(p->>'request_id')::uuid;
 foreach k in array array['organization_id','customer_id','location_id','version_id','publication_id','request_id'] loop p:=jsonb_set(p,array[k],to_jsonb((p->>k)::uuid::text));end loop;
 return jsonb_set(p,'{note}',to_jsonb(n));
end$$;
create function private.customer_request_roles_ok(p_issuer name,p_executor name) returns boolean language sql stable security definer set search_path='' as $$
 select p_issuer<>p_executor and (select count(*) from pg_roles r where r.rolname in(p_issuer,p_executor) and r.rolcanlogin and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolinherit and not r.rolbypassrls and not exists(select 1 from pg_auth_members m where m.member=r.oid))=2
$$;
revoke all on function private.customer_request_roles_ok(name,name) from public,anon,authenticated,service_role;
create function private.customer_request_principal_integrity() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Principal evidence is retained';end if;
 if tg_op='UPDATE' then
  if old.revoked_at is not null or new.revoked_at is null or not isfinite(new.revoked_at) or new.revoked_at>clock_timestamp() or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then raise exception 'Revoke only; no principal rebind';end if;return new;
 end if;
 if new.revoked_at is not null or new.expires_at<=clock_timestamp() or new.expires_at>clock_timestamp()+interval '15 minutes' or not private.customer_request_roles_ok(new.issuer_name,new.executor_name) or not exists(select 1 from auth.sessions where id=new.session_id and user_id=new.user_id and (not_after is null or not_after>clock_timestamp())) then raise exception 'Current bounded independent principals required';end if;
 return new;
end$$;
revoke all on function private.customer_request_principal_integrity() from public,anon,authenticated,service_role;
drop trigger immutable on private.customer_request_principals;
create trigger principal_integrity before insert or update or delete on private.customer_request_principals for each row execute function private.customer_request_principal_integrity();
create trigger principal_revocation_audit after update on private.customer_request_principals for each row execute function private.audit_change();
create function private.customer_request_principal(p_id uuid,p_issuer boolean) returns private.customer_request_principals language plpgsql volatile security definer set search_path='' as $$declare b private.customer_request_principals;begin
 perform private.customer_runtime_guard('requests');
 select * into b from private.customer_request_principals where id=p_id and case when p_issuer then issuer_name=session_user else executor_name=session_user end;
 if b.id is null or b.revoked_at is not null or b.expires_at<=clock_timestamp() or not private.customer_request_roles_ok(b.issuer_name,b.executor_name) or b.auth_expires_at<=clock_timestamp() or not has_function_privilege(session_user,case when p_issuer then 'private.customer_request_claim(uuid,jsonb,jsonb)' else 'private.customer_record_review_request(uuid,jsonb)' end,'EXECUTE') then raise exception 'Current server principal required' using errcode='42501';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b.user_id,'session_id',b.session_id,'aal','aal1','exp',floor(extract(epoch from b.expires_at)))::text,true);
 return b;
end$$;
create function private.customer_request_reference(c private.customer_request_intents) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object(
 'schema','customer-request-v2','organization_id',c.organization_id,'customer_id',c.customer_id,'location_id',c.location_id,'user_id',c.user_id,
 'version_id',c.version_id,'publication_id',c.publication_id,'request_id',c.id,'scope_sha256',c.scope_sha256,'request_sha256',c.request_sha256,'choice',c.choice,'acknowledgment',c.acknowledgment)$$;
create function private.customer_request_claim(p_principal uuid,p jsonb,p_tx jsonb) returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='1500ms' as $$
declare b private.customer_request_principals;a private.customer_estimate_access;c private.customer_request_intents;r jsonb;seq text;begin
 b:=private.customer_request_principal(p_principal,true);p:=private.customer_request_body(p);
 if (p->>'organization_id')::uuid is distinct from b.organization_id or (p->>'customer_id')::uuid is distinct from b.customer_id or (p->>'location_id')::uuid is distinct from b.location_id then raise exception 'Exact principal property required';end if;
 perform private.customer_portal_guard(b.organization_id,b.customer_id,b.location_id);
 perform private.est_object(p_tx,array['pid','backend_start','transaction_id']);
 perform pg_stat_clear_snapshot();
 if not exists(select 1 from pg_stat_activity where datname=current_database() and pid=(p_tx->>'pid')::integer and usename=b.executor_name and backend_start=(p_tx->>'backend_start')::timestamptz and backend_xid::text::bigint=mod((p_tx->>'transaction_id')::bigint,4294967296) and xact_start is not null) or pg_xact_status((p_tx->>'transaction_id')::xid8) is distinct from 'in progress' then raise exception 'Exact active consumer transaction required';end if;
 -- Separate issuer namespace never waits on the consumer's publication/version lock.
 if not pg_try_advisory_xact_lock(hashtextextended('customer-request-tenant:'||b.organization_id::text,0)) then raise exception 'Claim busy; reconcile only';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('customer-request-claim:'||b.organization_id::text||':'||b.user_id::text||':'||(p->>'version_id'),0)) then raise exception 'Claim busy; read-only reconciliation required';end if;
 if exists(select 1 from private.customer_request_intents where organization_id=b.organization_id and ((customer_id=b.customer_id and location_id=b.location_id and user_id=b.user_id and version_id=(p->>'version_id')::uuid) or id=(p->>'request_id')::uuid)) or exists(select 1 from private.customer_review_decisions where organization_id=b.organization_id and customer_id=b.customer_id and location_id=b.location_id and user_id=b.user_id and version_id=(p->>'version_id')::uuid) then raise exception 'Existing target; reconcile only';end if;
 select * into a from private.customer_estimate_access where organization_id=b.organization_id and id=(p->>'publication_id')::uuid and user_id=b.user_id and customer_id=b.customer_id and location_id=b.location_id and version_id=(p->>'version_id')::uuid and revoked_at is null;
 if a.id is null or a.expires_at<=clock_timestamp() or a.scope_sha256 is distinct from p->>'scope_sha256' then raise exception 'Exact current publication required';end if;
 r:=private.customer_issued_review(b.organization_id,b.customer_id,b.location_id,a.version_id,a.source_report_id,a.finding_id,a.source_line_id);
 if r->>'review_state'<>'awaiting_action' or (r-'review_state'-'mode'-'read_only') is distinct from a.scope_snapshot then raise exception 'Issued source changed';end if;
 if a.expires_at<=clock_timestamp() or b.expires_at<=clock_timestamp() then raise exception 'Publication expired';end if;
 if (select count(*) from private.customer_request_intents where organization_id=b.organization_id)>=10000 then raise exception 'Bounded custody capacity';end if;
 seq:='customer_once_'||replace(gen_random_uuid()::text,'-','');execute format('create sequence private.%I start 1 maxvalue 2 cache 1 no cycle',seq);
 execute format('revoke all on sequence private.%I from public,anon,authenticated,service_role',seq);
 insert into private.customer_request_intents(organization_id,id,principal_id,customer_id,location_id,user_id,session_id,publication_id,estimate_id,version_id,scope_sha256,request_sha256,choice,acknowledgment,executor_name,backend_pid,backend_start,transaction_id,burn_sequence,expires_at)
 values(b.organization_id,(p->>'request_id')::uuid,b.id,b.customer_id,b.location_id,b.user_id,b.session_id,a.id,(r->>'estimate_id')::uuid,a.version_id,a.scope_sha256,encode(sha256(convert_to(p::text,'UTF8')),'hex'),p->>'choice',p->>'acknowledgment',b.executor_name,(p_tx->>'pid')::integer,(p_tx->>'backend_start')::timestamptz,(p_tx->>'transaction_id')::bigint,('private.'||seq)::regclass,least(b.expires_at,a.expires_at)) returning * into c;
 perform private.customer_portal_guard(b.organization_id,b.customer_id,b.location_id);
 return private.customer_request_reference(c);
end$$;
create function private.customer_request_exact(p_principal uuid,p jsonb) returns private.customer_request_intents language plpgsql volatile security definer set search_path='' as $$declare b private.customer_request_principals;c private.customer_request_intents;begin
 b:=private.customer_request_principal(p_principal,false);
 select * into c from private.customer_request_intents where organization_id=b.organization_id and id=(p->>'request_id')::uuid and principal_id=b.id;
 if c.id is null or c.expires_at<=clock_timestamp() or c.executor_name is distinct from session_user or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or not exists(select 1 from pg_stat_activity where pid=pg_backend_pid() and backend_start=c.backend_start) or exists(select 1 from private.customer_request_outcomes where organization_id=c.organization_id and request_id=c.id) then raise exception 'Committed exact unused claim required; UNKNOWN/reconcile only';end if;
 return c;
end$$;
create or replace function private.customer_decision_integrity() returns trigger language plpgsql security definer set search_path='' as $$declare c private.customer_request_intents;a private.customer_estimate_access;s jsonb;begin
 if tg_op<>'INSERT' then raise exception 'Customer review evidence is immutable';end if;
 select * into c from private.customer_request_intents where organization_id=new.organization_id and id=new.command_id;
 if c.id is null or c.executor_name is distinct from session_user or c.transaction_id<>txid_current() or c.backend_pid<>pg_backend_pid() or currval(c.burn_sequence)<>1 or c.user_id is distinct from auth.uid() or c.id is distinct from new.request_id or c.request_sha256 is distinct from new.request_sha256 or c.publication_id is distinct from new.publication_id or c.version_id is distinct from new.version_id or c.choice is distinct from new.choice or c.acknowledgment is distinct from new.acknowledgment or c.customer_id is distinct from new.customer_id or c.location_id is distinct from new.location_id or c.session_id is distinct from new.auth_session_id then raise exception 'Independent command custody required' using errcode='42501';end if;
 if c.scope_sha256 is distinct from new.scope_sha256 or c.request_sha256 is distinct from encode(sha256(convert_to(private.customer_request_body(jsonb_build_object('organization_id',new.organization_id,'customer_id',new.customer_id,'location_id',new.location_id,'version_id',new.version_id,'publication_id',new.publication_id,'scope_sha256',new.scope_sha256,'choice',new.choice,'note',new.note,'acknowledgment',new.acknowledgment,'request_id',new.request_id))::text,'UTF8')),'hex') then raise exception 'Exact request body required';end if;
 perform private.customer_portal_guard(new.organization_id,new.customer_id,new.location_id);
 select * into a from private.customer_estimate_access where organization_id=new.organization_id and id=new.publication_id and revoked_at is null for update;
 if a.id is null or a.expires_at<=clock_timestamp() then raise exception 'Current publication required';end if;
 s:=private.customer_estimate_review(new.organization_id,new.customer_id,new.location_id,new.version_id);
 if s->>'review_state'<>'awaiting_action' or new.scope_snapshot is distinct from (s-'review_state'-'mode'-'read_only') or new.scope_snapshot is distinct from a.scope_snapshot or new.scope_sha256 is distinct from a.scope_sha256 or new.recorded_at>clock_timestamp() or new.recorded_at<a.created_at or c.expires_at<=clock_timestamp() then raise exception 'Exact issued scope required';end if;
 return new;
end$$;
create function private.customer_request_receipt_row(d private.customer_review_decisions) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object(
 'id',d.id,'request_id',d.request_id,'organization_id',d.organization_id,'customer_id',d.customer_id,'location_id',d.location_id,'version_id',d.version_id,'publication_id',d.publication_id,
 'estimate_id',v.estimate_id,'version_number',v.version_number,'choice',d.choice,'note',d.note,'recorded_at',d.recorded_at,'scope_sha256',d.scope_sha256,'request_sha256',coalesce(d.request_sha256,encode(sha256(convert_to(private.customer_request_body(jsonb_build_object('organization_id',d.organization_id,'customer_id',d.customer_id,'location_id',d.location_id,'version_id',d.version_id,'publication_id',d.publication_id,'scope_sha256',d.scope_sha256,'choice',d.choice,'note',d.note,'acknowledgment',d.acknowledgment,'request_id',d.request_id))::text,'UTF8')),'hex')))
 from public.estimate_versions v where v.organization_id=d.organization_id and v.id=d.version_id$$;
create function private.customer_record_review_request(p_principal uuid,p jsonb) returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='1500ms' as $$
declare c private.customer_request_intents;b private.customer_request_principals;a private.customer_estimate_access;d private.customer_review_decisions;begin
 c:=private.customer_request_exact(p_principal,p);
 -- Nontransactional burn survives statement errors, savepoints and full rollback.
 if nextval(c.burn_sequence)<>1 then raise exception 'Attempt spent; UNKNOWN/reconcile only';end if;
 p:=private.customer_request_body(p);
 if c.request_sha256 is distinct from encode(sha256(convert_to(p::text,'UTF8')),'hex') then raise exception 'Exact claimed body required';end if;
 select * into a from private.customer_estimate_access where organization_id=c.organization_id and id=c.publication_id for update;
 b:=private.customer_request_principal(p_principal,false);
 perform 1 from private.customer_request_principals where organization_id=c.organization_id and id=p_principal for share;
 b:=private.customer_request_principal(p_principal,false);
 perform private.customer_portal_guard(c.organization_id,c.customer_id,c.location_id);
 if a.id is null or a.revoked_at is not null or a.expires_at<=clock_timestamp() or c.expires_at<=clock_timestamp() then raise exception 'Current publication required';end if;
 insert into private.customer_review_decisions(organization_id,publication_id,customer_id,location_id,user_id,version_id,request_id,choice,acknowledgment,scope_sha256,scope_snapshot,auth_session_id,note,command_id,request_sha256)
 values(c.organization_id,c.publication_id,c.customer_id,c.location_id,c.user_id,c.version_id,c.id,c.choice,c.acknowledgment,c.scope_sha256,a.scope_snapshot,c.session_id,p->>'note',c.id,c.request_sha256) returning * into d;
 insert into private.customer_request_outcomes(organization_id,request_id,decision_id) values(c.organization_id,c.id,d.id);
 perform private.customer_portal_guard(c.organization_id,c.customer_id,c.location_id);
 perform private.customer_request_principal(p_principal,false);
 if c.expires_at<=clock_timestamp() then raise exception 'Request expired';end if;
 return jsonb_build_object('reference',private.customer_request_reference(c),'outcome','confirmed','custody','claimed-v2','receipt',private.customer_request_receipt_row(d),'replay_allowed',false,'financial_execution',false);
end$$;
-- Compatibility keeps v1 arguments/receipt shape, but not an unclaimed writer bypass.
create or replace function private.customer_record_decision(p_org uuid,p_publication uuid,p_digest text,p_choice text,p_ack text,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c private.customer_request_intents;r jsonb;begin
 if p_choice not in ('approve_review','decline_review') or p_ack is distinct from 'review-only-v1' then raise exception 'Legacy two-choice request required';end if;
 select * into c from private.customer_request_intents where organization_id=p_org and id=p_request;
 if c.id is null then raise exception 'Committed custody required';end if;
 r:=private.customer_record_review_request(c.principal_id,jsonb_build_object('organization_id',p_org,'customer_id',c.customer_id,'location_id',c.location_id,'version_id',c.version_id,'publication_id',p_publication,'scope_sha256',p_digest,'choice',p_choice,'note','','acknowledgment',p_ack,'request_id',p_request));
 return (r->'receipt')-'organization_id'-'customer_id'-'location_id'-'version_id'-'publication_id'-'estimate_id'-'version_number'-'note'-'request_sha256';
end$$;
create function private.customer_review_request_receipt(p_org uuid,p_ref jsonb) returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='1500ms' as $$declare c private.customer_request_intents;d private.customer_review_decisions;begin
 perform private.est_object(p_ref,array['schema','organization_id','customer_id','location_id','user_id','version_id','publication_id','request_id','scope_sha256','request_sha256','choice','acknowledgment']);
 if (select count(*) from jsonb_object_keys(p_ref))<>12 or exists(select 1 from jsonb_each(p_ref) where jsonb_typeof(value)<>'string') or p_ref->>'schema' is distinct from 'customer-request-v2' or p_ref->>'scope_sha256' !~ '^[a-f0-9]{64}$' or p_ref->>'request_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'Exact retained reference required';end if;
 perform private.customer_request_body((p_ref-'schema'-'user_id'-'request_sha256')||jsonb_build_object('note',case when p_ref->>'choice'='request_changes_review' then 'reference validation' else '' end));
 perform private.customer_portal_guard(p_org,(p_ref->>'customer_id')::uuid,(p_ref->>'location_id')::uuid);
 if (p_ref->>'user_id')::uuid is distinct from auth.uid() or (p_ref->>'organization_id')::uuid is distinct from p_org then raise exception 'Own exact receipt required' using errcode='42501';end if;
 select * into c from private.customer_request_intents where organization_id=p_org and id=(p_ref->>'request_id')::uuid and user_id=auth.uid() for share;
 if c.id is not null and private.customer_request_reference(c) is distinct from p_ref then raise exception 'Exact receipt reference required';end if;
 if c.id is not null then select d0.* into d from private.customer_request_outcomes o join private.customer_review_decisions d0 on d0.organization_id=o.organization_id and d0.id=o.decision_id where o.organization_id=p_org and o.request_id=c.id and d0.user_id=c.user_id and d0.customer_id=c.customer_id and d0.location_id=c.location_id and d0.version_id=c.version_id and d0.publication_id=c.publication_id and d0.request_sha256=c.request_sha256;end if;
 -- Pre-extension v1 rows are actual receipts, not retroactively minted claims.
 if c.id is null then
  select * into d from private.customer_review_decisions where organization_id=p_org and user_id=auth.uid() and request_id=(p_ref->>'request_id')::uuid and command_id is null;
  if d.id is not null and (d.customer_id is distinct from (p_ref->>'customer_id')::uuid or d.location_id is distinct from (p_ref->>'location_id')::uuid or d.version_id is distinct from (p_ref->>'version_id')::uuid or d.publication_id is distinct from (p_ref->>'publication_id')::uuid or d.scope_sha256 is distinct from p_ref->>'scope_sha256' or d.choice is distinct from p_ref->>'choice' or d.acknowledgment is distinct from p_ref->>'acknowledgment' or private.customer_request_receipt_row(d)->>'request_sha256' is distinct from p_ref->>'request_sha256') then raise exception 'Exact legacy receipt required';end if;
 end if;
 perform private.customer_portal_guard(p_org,(p_ref->>'customer_id')::uuid,(p_ref->>'location_id')::uuid);
 return jsonb_build_object('reference',p_ref,'outcome',case when d.id is null then 'UNKNOWN' else 'confirmed' end,'custody',case when d.id is null then 'unconfirmed' when d.command_id is null then 'legacy-v1' else 'claimed-v2' end,'receipt',case when d.id is null then null else private.customer_request_receipt_row(d) end,'replay_allowed',false,'financial_execution',false);
end$$;
create function private.customer_change_request_queue(p_org uuid) returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='1500ms' as $$declare r jsonb;begin
 perform private.customer_runtime_guard('requests');perform private.property_connected_session();perform private.property_guard(p_org);
 if not private.can(p_org,'estimates') then raise exception 'Current estimating staff required' using errcode='42501';end if;
 perform 1 from public.memberships where organization_id=p_org and user_id=auth.uid() and active for share;
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and not is_anonymous and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'Verified staff required';end if;
 select coalesce(jsonb_agg(x.entry order by x.recorded_at desc,x.id desc),'[]'::jsonb) into r from (
 select d.id,d.recorded_at,jsonb_build_object('receipt',private.customer_request_receipt_row(d),'customer_name',u.display_name,'property_label',l.address_line1,'project_name',v.payload->'project'->>'name') entry
 from private.customer_review_decisions d join private.customer_request_outcomes o on o.organization_id=d.organization_id and o.decision_id=d.id
 join public.customers u on u.organization_id=d.organization_id and u.id=d.customer_id
 join public.service_locations l on l.organization_id=d.organization_id and l.id=d.location_id and l.customer_id=d.customer_id
 join public.estimate_versions v on v.organization_id=d.organization_id and v.id=d.version_id and v.customer_id=d.customer_id
 where d.organization_id=p_org and d.choice='request_changes_review' and d.command_id is not null order by d.recorded_at desc,d.id desc limit 50)x;
 perform private.property_connected_session();perform private.property_guard(p_org);
 if not private.can(p_org,'estimates') then raise exception 'Current estimating staff required';end if;
 return jsonb_build_object('organization_id',p_org,'requests',r,'limited',true,'financial_execution',false);
end$$;
create function private.customer_review_request_status(p_org uuid,p_body jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare p jsonb;r jsonb;begin
 p:=private.customer_request_body(p_body);
 if (p->>'organization_id')::uuid is distinct from p_org then raise exception 'Exact organization required';end if;
 r:=(p-'note')||jsonb_build_object('schema','customer-request-v2','user_id',auth.uid(),'request_sha256',encode(sha256(convert_to(p::text,'UTF8')),'hex'));
 return private.customer_review_request_receipt(p_org,r);
end$$;
create function public.customer_review_request_status(p_org uuid,p_body jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.customer_review_request_status(p_org,p_body)$$;
revoke all on function private.customer_review_request_status(uuid,jsonb),public.customer_review_request_status(uuid,jsonb) from public,anon,authenticated,service_role;
-- Exact checked API readers only. No runtime EXECUTE grants in this proposal.
create function public.customer_review_request_receipt(p_org uuid,p_ref jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.customer_review_request_receipt(p_org,p_ref)$$;
create function public.customer_change_request_queue(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$select private.customer_change_request_queue(p_org)$$;
revoke all on function private.customer_request_body(jsonb),private.customer_request_principal(uuid,boolean),private.customer_request_reference(private.customer_request_intents),private.customer_request_claim(uuid,jsonb,jsonb),private.customer_request_exact(uuid,jsonb),private.customer_decision_integrity(),private.customer_request_receipt_row(private.customer_review_decisions),private.customer_record_review_request(uuid,jsonb),private.customer_record_decision(uuid,uuid,text,text,text,uuid),private.customer_review_request_receipt(uuid,jsonb),private.customer_change_request_queue(uuid),public.customer_review_request_receipt(uuid,jsonb),public.customer_change_request_queue(uuid) from public,anon,authenticated,service_role;
commit;
