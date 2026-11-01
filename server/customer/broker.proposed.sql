-- LOCAL FORWARD BROKER REVIEW after unchanged customer14 + requests.proposed.sql.
-- No runtime activation, roles, credentials, hosted install or public API grants.
begin;
create table private.customer_broker_admissions (
 organization_id uuid not null references public.organizations(id),id uuid not null default gen_random_uuid(),
 principal_id uuid not null,customer_id uuid not null,location_id uuid not null,user_id uuid not null,session_id uuid not null,
 publication_id uuid not null,version_id uuid not null,scope_sha256 text not null,request_sha256 text not null,
 choice text not null,acknowledgment text not null,executor_name name not null,
 backend_pid integer not null,backend_start timestamptz not null,transaction_id bigint not null,
 expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,id),unique(organization_id,user_id,version_id),unique(organization_id,principal_id),
 foreign key(organization_id,principal_id,customer_id,location_id,user_id,session_id) references private.customer_request_principals(organization_id,id,customer_id,location_id,user_id,session_id),
 foreign key(organization_id,customer_id,user_id) references public.portal_identities(organization_id,customer_id,user_id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,publication_id) references private.customer_estimate_access(organization_id,id),
 foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id),
 check(scope_sha256 ~ '^[a-f0-9]{64}$' and request_sha256 ~ '^[a-f0-9]{64}$'),
 check(choice in('approve_review','decline_review','request_changes_review')),
 check(acknowledgment='review-only-v2'),check(isfinite(expires_at))
);
create index customer_broker_admission_principal on private.customer_broker_admissions(organization_id,principal_id,customer_id,location_id,user_id,session_id);
create index customer_broker_admission_mapping on private.customer_broker_admissions(organization_id,customer_id,user_id);
create index customer_broker_admission_location on private.customer_broker_admissions(organization_id,location_id,customer_id);
create index customer_broker_admission_publication on private.customer_broker_admissions(organization_id,publication_id,user_id);
create index customer_broker_admission_version on private.customer_broker_admissions(organization_id,version_id);
alter table private.customer_broker_admissions enable row level security;
alter table private.customer_broker_admissions force row level security;
revoke all on private.customer_broker_admissions from public,anon,authenticated,service_role;
create trigger immutable before update or delete on private.customer_broker_admissions for each row execute function private.release_immutable();
create trigger metadata_audit after insert on private.customer_broker_admissions for each row execute function private.audit_change();

-- This assertion is accepted ONLY from server-controlled registrar/read LOGINs,
-- never PostgREST/browser roles. Genuine Auth verification is the broker's TCB.
create function private.customer_broker_endpoint(p_kind text) returns void language plpgsql stable security definer set search_path='' as $$declare expected name;begin
 expected:=case when p_kind='registrar' then 'customer4b_registrar' when p_kind='reader' then 'customer4b_reader' else null end;
 if expected is null or session_user<>expected or not exists(select 1 from pg_roles r where r.rolname=expected and r.rolcanlogin and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolinherit and not r.rolbypassrls and not exists(select 1 from pg_auth_members m where m.member=r.oid) and not exists(select 1 from pg_class c where c.relowner=r.oid) and not exists(select 1 from pg_proc f where f.proowner=r.oid)) or exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname in('public','private','auth') and t.relkind in('r','p') and (has_table_privilege(expected,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(expected,t.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) or has_function_privilege(expected,'private.customer_request_claim(uuid,jsonb,jsonb)','EXECUTE') or has_function_privilege(expected,'private.customer_record_review_request(uuid,jsonb)','EXECUTE') or (p_kind='reader' and has_function_privilege(expected,'private.customer_broker_admit(jsonb,jsonb,name,name,jsonb)','EXECUTE')) or (p_kind='registrar' and has_function_privilege(expected,'private.customer_broker_staff_read(jsonb,uuid)','EXECUTE')) then raise exception 'Restricted server endpoint role required';end if;
end$$;
revoke all on function private.customer_broker_endpoint(text) from public,anon,authenticated,service_role;
create function private.customer_broker_identity(p jsonb) returns void language plpgsql volatile security definer set search_path='' as $$begin
 perform private.est_object(p,array['user_id','session_id','aal','expires_at']);
 if (select count(*) from jsonb_object_keys(p))<>4 or p->>'aal' not in('aal1','aal2') or jsonb_typeof(p->'expires_at')<>'number' or (p->>'expires_at')::numeric<>floor((p->>'expires_at')::numeric) or (p->>'expires_at')::numeric<=extract(epoch from clock_timestamp()) then raise exception 'Current authenticated assertion required';end if;
 perform (p->>'user_id')::uuid,(p->>'session_id')::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p->>'user_id','session_id',p->>'session_id','aal',p->>'aal','exp',(p->>'expires_at')::numeric)::text,true);
 perform private.property_connected_session();
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and not is_anonymous and (banned_until is null or banned_until<=clock_timestamp());
 if not found then raise exception 'Verified current user required';end if;
end$$;
create function private.customer_broker_runtime_role(p_role name,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select p_kind in('issuer','executor') and exists(select 1 from pg_roles r where r.rolname=p_role and r.rolcanlogin and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolinherit and not r.rolbypassrls and not exists(select 1 from pg_auth_members m where m.member=r.oid)
 and not exists(select 1 from pg_class c where c.relowner=r.oid) and not exists(select 1 from pg_proc f where f.proowner=r.oid) and not exists(select 1 from pg_namespace n where n.nspowner=r.oid)
 and has_function_privilege(p_role,case when p_kind='issuer' then 'private.customer_request_claim(uuid,jsonb,jsonb)' else 'private.customer_record_review_request(uuid,jsonb)' end,'EXECUTE')
 and not has_function_privilege(p_role,case when p_kind='issuer' then 'private.customer_record_review_request(uuid,jsonb)' else 'private.customer_request_claim(uuid,jsonb,jsonb)' end,'EXECUTE')
 and not has_function_privilege(p_role,'private.customer_broker_admit(jsonb,jsonb,name,name,jsonb)','EXECUTE')
 and not has_function_privilege(p_role,'private.customer_broker_staff_read(jsonb,uuid)','EXECUTE')
 and not exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname in('public','private','auth') and t.relkind in('r','p') and (has_table_privilege(p_role,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(p_role,t.oid,'SELECT,INSERT,UPDATE,REFERENCES'))))
$$;
create function private.customer_broker_role_review(p_role name,p_kind text) returns boolean language plpgsql stable security definer set search_path='' as $$begin
 perform private.customer_broker_endpoint('registrar');
 return private.customer_broker_runtime_role(p_role,p_kind);
end$$;
revoke all on function private.customer_broker_role_review(name,text) from public,anon,authenticated,service_role;
create function private.customer_broker_transaction(p_executor name,p_tx jsonb) returns void language plpgsql volatile security definer set search_path='' as $$begin
 perform private.est_object(p_tx,array['pid','backend_start','transaction_id']);
 if (select count(*) from jsonb_object_keys(p_tx))<>3 then raise exception 'Exact session-pinned transaction required';end if;
 perform pg_stat_clear_snapshot();
 if not exists(select 1 from pg_stat_activity where datname=current_database() and pid=(p_tx->>'pid')::int and usename=p_executor and backend_start=(p_tx->>'backend_start')::timestamptz and backend_xid::text::bigint=mod((p_tx->>'transaction_id')::bigint,4294967296) and xact_start is not null) or pg_xact_status((p_tx->>'transaction_id')::xid8) is distinct from 'in progress' then raise exception 'Current separate consumer required';end if;
end$$;
create function private.customer_broker_admit(p_actor jsonb,p jsonb,p_issuer name,p_executor name,p_tx jsonb) returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='1500ms' as $$
declare a private.customer_estimate_access;b jsonb;r jsonb;pid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();expiry timestamptz;begin
 perform private.customer_broker_endpoint('registrar');
 perform private.customer_runtime_guard('requests');perform private.customer_broker_identity(p_actor);
 perform private.est_object(p,array['organization_id','publication_id','choice','note','acknowledgment','confirmed']);
 if (select count(*) from jsonb_object_keys(p))<>6 or p->'confirmed' is distinct from 'true'::jsonb or p->>'acknowledgment' is distinct from 'review-only-v2' then raise exception 'Explicit exact review required';end if;
 if not private.customer_broker_runtime_role(p_issuer,'issuer') or not private.customer_broker_runtime_role(p_executor,'executor') then raise exception 'Separate least-privileged runtime roles required';end if;
 perform private.customer_broker_transaction(p_executor,p_tx);
 select * into a from private.customer_estimate_access where organization_id=(p->>'organization_id')::uuid and id=(p->>'publication_id')::uuid and user_id=auth.uid() for share;
 if a.id is null or a.revoked_at is not null or a.expires_at<=clock_timestamp() then raise exception 'Own exact current publication required';end if;
 perform private.customer_portal_guard(a.organization_id,a.customer_id,a.location_id);
 r:=private.customer_issued_review(a.organization_id,a.customer_id,a.location_id,a.version_id,a.source_report_id,a.finding_id,a.source_line_id);
 if r->>'review_state'<>'awaiting_action' or (r-'review_state'-'mode'-'read_only') is distinct from a.scope_snapshot then raise exception 'Immutable issued source required';end if;
 b:=private.customer_request_body(jsonb_build_object('organization_id',a.organization_id,'customer_id',a.customer_id,'location_id',a.location_id,'version_id',a.version_id,'publication_id',a.id,'scope_sha256',a.scope_sha256,'request_id',rid,'choice',p->>'choice','note',p->>'note','acknowledgment',p->>'acknowledgment'));
 if not pg_try_advisory_xact_lock(hashtextextended('customer-broker:'||a.organization_id::text||':'||a.user_id::text||':'||a.version_id::text,0)) then raise exception 'Admission busy; UNKNOWN/reconcile only';end if;
 if exists(select 1 from private.customer_broker_admissions where organization_id=a.organization_id and user_id=a.user_id and version_id=a.version_id) or exists(select 1 from private.customer_review_decisions where organization_id=a.organization_id and user_id=a.user_id and version_id=a.version_id) then raise exception 'Existing target; read-only reconciliation only';end if;
 if (select count(*) from private.customer_broker_admissions where organization_id=a.organization_id)>=10000 then raise exception 'Admission capacity reached';end if;
 expiry:=least(a.expires_at,to_timestamp((p_actor->>'expires_at')::double precision),clock_timestamp()+interval '5 minutes');
 insert into private.customer_request_principals(organization_id,id,customer_id,location_id,issuer_name,executor_name,user_id,session_id,expires_at,auth_expires_at) values(a.organization_id,pid,a.customer_id,a.location_id,p_issuer,p_executor,a.user_id,(p_actor->>'session_id')::uuid,expiry,to_timestamp((p_actor->>'expires_at')::double precision));
 insert into private.customer_broker_admissions(organization_id,id,principal_id,customer_id,location_id,user_id,session_id,publication_id,version_id,scope_sha256,request_sha256,choice,acknowledgment,executor_name,backend_pid,backend_start,transaction_id,expires_at)
 values(a.organization_id,rid,pid,a.customer_id,a.location_id,a.user_id,(p_actor->>'session_id')::uuid,a.id,a.version_id,a.scope_sha256,encode(sha256(convert_to(b::text,'UTF8')),'hex'),b->>'choice',b->>'acknowledgment',p_executor,(p_tx->>'pid')::int,(p_tx->>'backend_start')::timestamptz,(p_tx->>'transaction_id')::bigint,expiry);
 perform private.customer_broker_identity(p_actor);perform private.customer_portal_guard(a.organization_id,a.customer_id,a.location_id);
 perform private.customer_broker_endpoint('registrar');
 if expiry<=clock_timestamp() then raise exception 'Admission expired';end if;
 return jsonb_build_object('principal',pid,'body',b);
end$$;
create function private.customer_broker_claim_integrity() returns trigger language plpgsql security definer set search_path='' as $$declare a private.customer_broker_admissions;begin
 select * into a from private.customer_broker_admissions where organization_id=new.organization_id and id=new.id;
 if a.id is null or a.principal_id is distinct from new.principal_id or a.customer_id is distinct from new.customer_id or a.location_id is distinct from new.location_id or a.user_id is distinct from new.user_id or a.session_id is distinct from new.session_id or a.publication_id is distinct from new.publication_id or a.version_id is distinct from new.version_id or a.scope_sha256 is distinct from new.scope_sha256 or a.request_sha256 is distinct from new.request_sha256 or a.choice is distinct from new.choice or a.acknowledgment is distinct from new.acknowledgment or a.executor_name is distinct from new.executor_name or a.backend_pid is distinct from new.backend_pid or a.backend_start is distinct from new.backend_start or a.transaction_id is distinct from new.transaction_id or a.expires_at<=clock_timestamp() then raise exception 'Committed exact broker admission required';end if;
 return new;
end$$;
create trigger z_broker_admission before insert on private.customer_request_intents for each row execute function private.customer_broker_claim_integrity();
create function private.customer_broker_receipt(p_actor jsonb,p_org uuid,p_publication uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare a private.customer_broker_admissions;r jsonb;begin
 perform private.customer_broker_endpoint('reader');
 perform private.customer_broker_identity(p_actor);
 select * into a from private.customer_broker_admissions where organization_id=p_org and publication_id=p_publication and user_id=auth.uid();
 if a.id is null then raise exception 'Retained admission unavailable; UNKNOWN';end if;
 r:=jsonb_build_object('schema','customer-request-v2','organization_id',a.organization_id,'customer_id',a.customer_id,'location_id',a.location_id,'user_id',a.user_id,'version_id',a.version_id,'publication_id',a.publication_id,'request_id',a.id,'scope_sha256',a.scope_sha256,'request_sha256',a.request_sha256,'choice',a.choice,'acknowledgment',a.acknowledgment);
 r:=private.customer_review_request_receipt(p_org,r);
 perform private.customer_broker_identity(p_actor);perform private.customer_broker_endpoint('reader');return r;
end$$;
create function private.customer_broker_staff_read(p_actor jsonb,p_org uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare r jsonb;begin
 perform private.customer_broker_endpoint('reader');
 perform private.customer_broker_identity(p_actor);r:=private.customer_change_request_queue(p_org);perform private.customer_broker_identity(p_actor);perform private.customer_broker_endpoint('reader');return r;
end$$;
revoke all on function private.customer_broker_identity(jsonb),private.customer_broker_runtime_role(name,text),private.customer_broker_transaction(name,jsonb),private.customer_broker_admit(jsonb,jsonb,name,name,jsonb),private.customer_broker_claim_integrity(),private.customer_broker_receipt(jsonb,uuid,uuid),private.customer_broker_staff_read(jsonb,uuid) from public,anon,authenticated,service_role;
commit;
