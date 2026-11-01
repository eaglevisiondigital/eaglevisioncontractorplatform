-- WORKSTREAM2E DISPOSABLE PG17 ONLY. Not an operational migration or service.
do $$begin if current_database() !~ '^ev_test_[a-f0-9]{32}$' or current_setting('server_version_num')::integer/10000<>17 then raise exception 'Disposable native PG17 required';end if;end$$;
create schema maintenance_2e_test;
revoke all on schema maintenance_2e_test from public,anon,authenticated,service_role;
-- Composite parent added only to this disposable copy; original2C source is unchanged.
alter table maintenance_2c_test.capabilities add unique(organization_id,id);
create table maintenance_2e_test.approvals(
 organization_id uuid not null,capability_id uuid not null,issuer_name name not null,
 primary key(organization_id,capability_id),unique(capability_id),
 foreign key(organization_id,capability_id) references maintenance_2c_test.capabilities(organization_id,id)
);
create table maintenance_2e_test.claims(
 id uuid not null unique,organization_id uuid not null,capability_id uuid not null,step text not null,
 request_id uuid not null,actor_id uuid not null,session_id uuid not null,source jsonb not null,command jsonb not null,args jsonb not null,
 runtime_name name not null,backend_pid integer not null,backend_start timestamptz not null,transaction_id bigint not null,
 burn_sequence regclass not null,recorded_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,capability_id,step),
 unique(organization_id,request_id,step),unique(organization_id,capability_id,step,id),
 foreign key(organization_id,capability_id) references maintenance_2e_test.approvals(organization_id,capability_id),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id),
 foreign key(session_id) references auth.sessions(id),
 check(jsonb_typeof(source)='object' and jsonb_typeof(command)='object' and jsonb_typeof(args)='array')
);
create index authority_2e_actor on maintenance_2e_test.claims(organization_id,actor_id);
create index authority_2e_session on maintenance_2e_test.claims(session_id);
create index authority_2e_source on maintenance_2e_test.claims(organization_id,md5(source::text));
create table maintenance_2e_test.outcomes(
 organization_id uuid not null,capability_id uuid not null,step text not null,claim_id uuid not null,
 result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,capability_id,step),
 foreign key(organization_id,capability_id,step,claim_id) references maintenance_2e_test.claims(organization_id,capability_id,step,id)
);
do $$declare t text;begin foreach t in array array['approvals','claims','outcomes'] loop
 execute format('alter table maintenance_2e_test.%I enable row level security',t);
 execute format('alter table maintenance_2e_test.%I force row level security',t);
 execute format('revoke all on maintenance_2e_test.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable before update or delete on maintenance_2e_test.%I for each row execute function private.release_immutable()',t);
 execute format('create trigger metadata_audit after insert on maintenance_2e_test.%I for each row execute function private.audit_change()',t);
end loop;end$$;
create function maintenance_2e_test.current_cap(cap uuid,issuing boolean) returns maintenance_2c_test.capabilities language plpgsql volatile security definer set search_path='' as $$
declare c maintenance_2c_test.capabilities;a maintenance_2e_test.approvals;begin
 select * into c from maintenance_2c_test.capabilities where id=cap;select * into a from maintenance_2e_test.approvals where capability_id=cap;
 if c.id is null or a.capability_id is null or c.organization_id is distinct from a.organization_id or c.revoked_at is not null or c.expires_at<=clock_timestamp() or (issuing and a.issuer_name is distinct from session_user) or (not issuing and c.login_name is distinct from session_user) then raise exception 'Current exact2E authority required' using errcode='42501';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.actor_id,'session_id',c.session_id,'aal',c.aal,'exp',floor(extract(epoch from c.expires_at)))::text,true);
 if issuing then perform maintenance_2b_test.authority(c.organization_id);end if;return c;
end$$;
create function maintenance_2e_test.exact_step(c maintenance_2c_test.capabilities,step text,args jsonb) returns void language plpgsql set search_path='' as $$declare cmd jsonb;begin
 if jsonb_typeof(args) is distinct from 'array' or octet_length(args::text)>2097152 then raise exception 'Bounded exact arguments required';end if;
 cmd:=case when c.purpose='readiness' then c.command->'reservation' else c.command end;
 if c.purpose='maintenance' and step='execute' and args=jsonb_build_array(c.command) then return;
 elsif c.purpose='repair' and step in ('reserve','claim','finish') and args=jsonb_build_array(cmd) then return;
 elsif c.purpose='readiness' and step='review_intent' and args=jsonb_build_array(cmd,c.command->'review') then return;
 elsif c.purpose='readiness' and step='append_review' and jsonb_array_length(args)=3 and args->0=cmd and c.approved_review is not null and ((args->2)-'recorded_at')=(c.approved_review-'recorded_at') then return;
 end if;raise exception 'Exact approved operation required' using errcode='42501';end$$;
-- Trusted issuer entry: no runtime EXECUTE. Commits on a DIFFERENT connection before
-- the runtime query. Caller hashes/flags/SQLite text are never accepted as authority.
create function maintenance_2e_test.issue(cap uuid,step text,args jsonb,tx jsonb) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare c maintenance_2c_test.capabilities;cmd jsonb;s jsonb;q uuid;claim uuid:=gen_random_uuid();seq text;prior text;begin
 c:=maintenance_2e_test.current_cap(cap,true);perform maintenance_2e_test.exact_step(c,step,args);
 cmd:=case when c.purpose='readiness' then c.command->'reservation' else c.command end;s:=cmd->'source';q:=case when c.purpose='readiness' then (c.command->'review'->>'request_id')::uuid else (cmd->>'request_id')::uuid end;
 perform private.est_object(tx,array['pid','backend_start','transaction_id']);
 -- Clear cached activity and inspect under narrow trusted definer, not pg_read_all_stats grants.
 perform pg_stat_clear_snapshot();
 if not exists(select 1 from pg_stat_activity where pid=(tx->>'pid')::integer and datname=current_database() and usename=c.login_name and backend_start=(tx->>'backend_start')::timestamptz and backend_xid::text::bigint=mod((tx->>'transaction_id')::bigint,4294967296) and xact_start is not null) or pg_xact_status((tx->>'transaction_id')::xid8) is distinct from 'in progress' then raise exception 'Exact active runtime transaction required';end if;
 -- Issuer-only namespace: never wait on runtime-held resource/2C coordination locks.
 perform pg_advisory_xact_lock(hashtextextended('maintenance2e-issuer-tenant:'||c.organization_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('maintenance2e-issuer:'||s::text,0));
 if (s->>'organization_id')::uuid is distinct from c.organization_id then raise exception 'Exact source organization required';end if;
 if exists(select 1 from maintenance_2e_test.claims x where x.organization_id=c.organization_id and x.request_id=q and (x.capability_id<>cap or x.step=issue.step)) then raise exception 'Immutable command/phase already claimed; reconcile only';end if;
 if exists(select 1 from maintenance_2e_test.claims x join maintenance_2c_test.capabilities p on p.id=x.capability_id where x.organization_id=c.organization_id and x.source=s and x.capability_id<>cap and not exists(select 1 from maintenance_2e_test.outcomes o where o.capability_id=x.capability_id and o.step=case p.purpose when 'maintenance' then 'execute' when 'repair' then 'finish' else 'append_review' end)) then raise exception 'UNKNOWN exact-source hold; no replacement';end if;
 if (select count(*) from maintenance_2e_test.claims where organization_id=c.organization_id)>=1000 then raise exception 'Bounded claim capacity exceeded';end if;
 prior:=case step when 'claim' then 'reserve' when 'finish' then 'claim' when 'append_review' then 'review_intent' end;
 if prior is not null and not exists(select 1 from maintenance_2e_test.outcomes where capability_id=cap and outcomes.step=prior) then raise exception 'Exact prior phase outcome required';end if;
 -- MVCC source/CAS checks only: final locked source checks remain in reused commands.
 -- Taking source locks here would invert an open runtime readiness transaction.
 if not exists(select 1 from private.inspection_reports r join private.inspection_visits v on v.organization_id=r.organization_id and v.id=r.visit_id join private.inspection_plans p on p.organization_id=v.organization_id and p.id=v.plan_id join public.service_locations l on l.organization_id=r.organization_id and l.id=r.location_id and l.customer_id=r.customer_id where r.organization_id=c.organization_id and r.id=(s->>'report_id')::uuid and r.version=(s->>'report_version')::integer and r.customer_id=(s->>'customer_id')::uuid and r.location_id=(s->>'location_id')::uuid and (select count(*) from jsonb_array_elements(r.snapshot->'findings') f where f->>'id'=s->>'finding_id')=1) then raise exception 'Exact published source required';end if;
 if c.purpose='maintenance' and coalesce((select revision from maintenance_2a_test.items where organization_id=c.organization_id and report_id=(s->>'report_id')::uuid and report_version=(s->>'report_version')::integer and finding_id=s->>'finding_id'),0) is distinct from (cmd->>'expected_revision')::integer then raise exception 'Maintenance CAS changed';end if;
 if c.purpose<>'maintenance' and (not exists(select 1 from maintenance_2a_test.items where organization_id=c.organization_id and report_id=(s->>'report_id')::uuid and finding_id=s->>'finding_id' and revision=(cmd->>'maintenance_revision')::integer and review='reviewed') or not exists(select 1 from private.inspection_plans where organization_id=c.organization_id and id=(cmd->>'plan_id')::uuid and lock_revision=(cmd->>'plan_revision')::integer)) then raise exception 'Source/plan CAS changed';end if;
 if c.purpose='readiness' and not exists(select 1 from public.estimate_versions where organization_id=c.organization_id and id=(cmd->>'draft_version_id')::uuid and lock_revision=(c.command->'review'->>'lock_revision')::integer) then raise exception 'Saved revision changed';end if;
 seq:='once_'||replace(claim::text,'-','');execute format('create sequence maintenance_2e_test.%I start 1 maxvalue 2 cache 1 no cycle',seq);
 execute format('revoke all on sequence maintenance_2e_test.%I from public,anon,authenticated,service_role',seq);
 insert into maintenance_2e_test.claims(id,organization_id,capability_id,step,request_id,actor_id,session_id,source,command,args,runtime_name,backend_pid,backend_start,transaction_id,burn_sequence)
 values(claim,c.organization_id,cap,step,q,c.actor_id,c.session_id,s,c.command,args,c.login_name,(tx->>'pid')::integer,(tx->>'backend_start')::timestamptz,(tx->>'transaction_id')::bigint,('maintenance_2e_test.'||seq)::regclass);
 perform 1 from maintenance_2c_test.capabilities where id=cap for share;
 perform maintenance_2e_test.current_cap(cap,true);return claim;
end$$;
create function maintenance_2e_test.claim_for_command(cap uuid,step text,args jsonb) returns maintenance_2e_test.claims language plpgsql volatile security definer set search_path='' as $$
declare c maintenance_2c_test.capabilities;x maintenance_2e_test.claims;begin
 c:=maintenance_2e_test.current_cap(cap,false);perform maintenance_2e_test.exact_step(c,step,args);
 select * into x from maintenance_2e_test.claims where organization_id=c.organization_id and capability_id=cap and claims.step=claim_for_command.step;
 if x.id is null or x.args is distinct from args or x.command is distinct from c.command or x.actor_id is distinct from c.actor_id or x.session_id is distinct from c.session_id or x.runtime_name is distinct from session_user or x.transaction_id<>txid_current() or x.backend_pid<>pg_backend_pid() or not exists(select 1 from pg_stat_activity where pid=pg_backend_pid() and backend_start=x.backend_start) or exists(select 1 from maintenance_2e_test.outcomes where capability_id=cap and outcomes.step=claim_for_command.step) then raise exception 'Committed exact unused claim required; reconcile only' using errcode='42501';end if;
 return x;end$$;
create function maintenance_2e_test.command(cap uuid,step text,args jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c maintenance_2c_test.capabilities;x maintenance_2e_test.claims;result jsonb;begin
 c:=maintenance_2e_test.current_cap(cap,false);
 if step='coordinate' and args=jsonb_build_array(c.command) then perform maintenance_2c_test.lock_scope(cap);return 'null';end if;
 if step in ('validate','read_item','reconcile','readiness_context') then return maintenance_2c_test.command(cap,step,args);end if;
 x:=maintenance_2e_test.claim_for_command(cap,step,args);
 -- Nontransactional consume also survives SAVEPOINT rollback; private sequence OID
 -- comes only from immutable issuer record. Never a caller flag, hash, or reset API.
 if nextval(x.burn_sequence)<>1 then raise exception 'One-shot attempt spent; UNKNOWN/reconcile only';end if;
 result:=maintenance_2c_test.command(cap,step,args);
 insert into maintenance_2e_test.outcomes values(c.organization_id,cap,step,x.id,result,clock_timestamp());
 perform maintenance_2c_test.final_capability(cap);perform maintenance_2e_test.current_cap(cap,false);perform maintenance_2b_test.authority(c.organization_id);
 return result;end$$;
revoke all on all functions in schema maintenance_2e_test from public,anon,authenticated,service_role;
do $$declare executor text:='maintenance_2e_exec_'||substr(current_database(),9);begin
 execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',executor);
 execute format('grant usage on schema maintenance_2e_test to %I',executor);

 -- Narrow definer sequence burn/outcome append stays in a helper, not direct table rights.
end$$;
alter function maintenance_2e_test.command(uuid,text,jsonb) rename to command_core;
create function maintenance_2e_test.command(cap uuid,step text,args jsonb) returns jsonb language sql volatile security definer set search_path='' as $$select maintenance_2e_test.command_core(cap,step,args)$$;
revoke all on function maintenance_2e_test.command(uuid,text,jsonb) from public,anon,authenticated,service_role;
do $$declare executor text:='maintenance_2e_exec_'||substr(current_database(),9);begin
 execute format('grant execute on function maintenance_2e_test.command_core(uuid,text,jsonb) to %I',executor);
 execute format('grant create on schema maintenance_2e_test to %I',executor);
 execute format('alter function maintenance_2e_test.command(uuid,text,jsonb) owner to %I',executor);
 execute format('revoke create on schema maintenance_2e_test from %I',executor);
end$$;
