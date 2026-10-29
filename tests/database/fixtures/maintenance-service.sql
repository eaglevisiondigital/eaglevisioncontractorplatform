-- WORKSTREAM 2C DISPOSABLE FIXTURE ONLY. No migration, public route or production identity.
do $$begin
 if current_database() !~ '^ev_test_[a-f0-9]{32}$' or current_setting('server_version_num')::integer/10000<>17 then raise exception 'Disposable native PostgreSQL17 required';end if;
end$$;
create schema maintenance_2c_test;
revoke all on schema maintenance_2c_test from public,anon,authenticated,service_role;
create table maintenance_2c_test.capabilities(
 id uuid primary key,organization_id uuid not null,login_name name not null,actor_id uuid not null,session_id uuid not null,
 aal text not null check(aal in ('aal1','aal2')),purpose text not null check(purpose in ('maintenance','repair','readiness')),
 command jsonb not null,approved_review jsonb,expires_at timestamptz not null,revoked_at timestamptz,
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id),
 foreign key(session_id) references auth.sessions(id),
 check(jsonb_typeof(command)='object')
);
create index maintenance_2c_actor on maintenance_2c_test.capabilities(organization_id,actor_id);
create index maintenance_2c_session on maintenance_2c_test.capabilities(session_id);
create index maintenance_2c_login on maintenance_2c_test.capabilities(login_name,id);
alter table maintenance_2c_test.capabilities enable row level security;
alter table maintenance_2c_test.capabilities force row level security;
revoke all on maintenance_2c_test.capabilities from public,anon,authenticated,service_role;
create function maintenance_2c_test.immutable_capability() returns trigger language plpgsql set search_path='' as $$begin
 if TG_OP='DELETE' or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or old.revoked_at is not null or new.revoked_at is null then raise exception 'Immutable capability; revocation only';end if;return new;
end$$;
create trigger immutable_capability before update or delete on maintenance_2c_test.capabilities for each row execute function maintenance_2c_test.immutable_capability();
create function maintenance_2c_test.capability(cap uuid) returns maintenance_2c_test.capabilities language plpgsql volatile security definer set search_path='' as $$declare c maintenance_2c_test.capabilities;begin
 select * into c from maintenance_2c_test.capabilities where id=cap and login_name=session_user;
 if c.id is null or c.revoked_at is not null or c.expires_at<=clock_timestamp() then raise exception 'Current exact local capability required' using errcode='42501';end if;
 -- No principal, session, organization, role or AAL from caller claims is authoritative.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',c.actor_id,'session_id',c.session_id,'aal',c.aal,'exp',floor(extract(epoch from c.expires_at)))::text,true);
 return c;
end$$;
-- All composed resource commands take the same tenant coordination lock, then resource
-- locks before authority. Administrative revocation is a separate authority-only write;
-- multi-resource admin transactions must also take resource locks before authority.
create function maintenance_2c_test.lock_scope(cap uuid) returns void language plpgsql volatile security definer set search_path='' as $$
declare c maintenance_2c_test.capabilities;cmd jsonb;s jsonb;plan uuid;target uuid;version uuid;p jsonb;begin
 c:=maintenance_2c_test.capability(cap);cmd:=case when c.purpose='readiness' then c.command->'reservation' else c.command end;s:=cmd->'source';
 perform pg_advisory_xact_lock(hashtextextended('maintenance2c:'||c.organization_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(c.organization_id::text||coalesce(cmd->>'request_id',''),0));
 perform pg_advisory_xact_lock(hashtextextended(s::text,0));
 perform 1 from public.company_settings where organization_id=c.organization_id for update;
 select v.plan_id into plan from private.inspection_reports r join private.inspection_visits v on v.organization_id=r.organization_id and v.id=r.visit_id where r.organization_id=c.organization_id and r.id=(s->>'report_id')::uuid;
 perform 1 from private.inspection_plans where organization_id=c.organization_id and id=plan for update;
 perform 1 from private.inspection_reports where organization_id=c.organization_id and id=(s->>'report_id')::uuid for share;
 perform 1 from public.service_locations where organization_id=c.organization_id and id=(s->>'location_id')::uuid for share;
 perform 1 from maintenance_2a_test.items where organization_id=c.organization_id and report_id=(s->>'report_id')::uuid and report_version=(s->>'report_version')::integer and finding_id=s->>'finding_id' for update;
 perform 1 from maintenance_2b_test.reservations where organization_id=c.organization_id and id=(cmd->>'request_id')::uuid for update;
 target:=(cmd->>'estimate_id')::uuid;version:=(cmd->>'draft_version_id')::uuid;
 perform 1 from public.estimates where organization_id=c.organization_id and id=target for update;
 perform 1 from public.estimate_versions where organization_id=c.organization_id and id=version for update;
 select payload into p from public.estimate_versions where organization_id=c.organization_id and id=version;
 if p is null then p:=cmd->'payload';end if;
 perform 1 from public.jobs where organization_id=c.organization_id and id=(cmd->>'job_id')::uuid for share;
 perform 1 from public.estimate_versions where organization_id=c.organization_id and id=(cmd->>'job_baseline_version_id')::uuid for share;
 perform 1 from public.estimate_tax_policies where organization_id=c.organization_id and id=(p->>'tax_policy_id')::uuid for share;
 perform 1 from public.catalog_items x where x.organization_id=c.organization_id and exists(select 1 from jsonb_array_elements(p->'lines') l where l->>'catalog_item_id'=x.id::text) order by x.id for share;
 c:=maintenance_2c_test.capability(cap); -- Fresh capability and wall time AFTER every resource wait.
 perform maintenance_2a_test.bind_source(s);perform maintenance_2b_test.authority(c.organization_id);
end$$;
-- Lock the capability only at the final checkpoint, after resource waits. This
-- serializes a committed revocation against success without blocking earlier revocation.
create function maintenance_2c_test.final_capability(cap uuid) returns maintenance_2c_test.capabilities language plpgsql volatile security definer set search_path='' as $$begin
 perform 1 from maintenance_2c_test.capabilities where id=cap and login_name=session_user for share;
 return maintenance_2c_test.capability(cap);
end$$;
-- Gateway is owned below by a dedicated NOLOGIN executor with no application DML or DDL.
-- Its only transitive operations are these fixed, checked fixture functions.
create function maintenance_2c_test.command(cap uuid,step text,args jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c maintenance_2c_test.capabilities;cmd jsonb;s jsonb;result jsonb;expected_review jsonb;begin
 c:=maintenance_2c_test.capability(cap);cmd:=case when c.purpose='readiness' then c.command->'reservation' else c.command end;s:=cmd->'source';
 if (s->>'organization_id')::uuid is distinct from c.organization_id or jsonb_typeof(args) is distinct from 'array' or octet_length(args::text)>2097152 then raise exception 'Exact bounded command required';end if;
 -- Pure preflight rejects a command mismatch before the caller retains a new intent.
 -- This supplies no mutation permission and does not replace post-resource/final checks.
 if step='validate' then
  if args is distinct from jsonb_build_array(c.command) then raise exception 'Command capability mismatch' using errcode='42501';end if;
  c:=maintenance_2c_test.final_capability(cap);perform maintenance_2b_test.authority(c.organization_id);return 'null'::jsonb;
 end if;
 perform maintenance_2c_test.lock_scope(cap);
 if c.purpose='maintenance' and jsonb_array_length(args)=1 and args->0=c.command then
  if step='execute' then result:=maintenance_2a_test.execute(args->0);
  elsif step='reconcile' then result:=maintenance_2a_test.reconcile(args->0);
  else raise exception 'Maintenance step denied';end if;
 elsif c.purpose='maintenance' and step='read_item' and args=jsonb_build_array(s) then result:=maintenance_2a_test.read_item(s);
 elsif c.purpose='repair' and args=jsonb_build_array(cmd) then
  if step='reserve' then result:=maintenance_2b_test.reserve(cmd);
  elsif step='claim' then perform maintenance_2b_test.claim(cmd);result:='null';
  elsif step='finish' then result:=maintenance_2b_test.finish(cmd);
  elsif step='reconcile' then result:=maintenance_2b_test.reconcile(cmd);
  elsif step='readiness_context' then result:=maintenance_2b_test.readiness_context(cmd);
  else raise exception 'Repair step denied';end if;
 elsif c.purpose='readiness' and args->0=cmd then
  if step='readiness_context' and jsonb_array_length(args)=1 then result:=maintenance_2b_test.readiness_context(cmd);
  elsif step='review_intent' and args=jsonb_build_array(cmd,c.command->'review') then result:=maintenance_2b_test.review_intent(cmd,args->1);
  elsif step='append_review' and jsonb_array_length(args)=3 then
   -- The harness provisions this exact canonical-engine-approved review. A limited SQL
   -- command identity cannot manufacture another section/measurement/note/calculation.
   expected_review:=c.approved_review;
   if expected_review is null or ((args->2)-'recorded_at') is distinct from (expected_review-'recorded_at') then raise exception 'Exact engine-validated review capability required';end if;
   result:=maintenance_2b_test.append_review(cmd,args->1,args->2);
  else raise exception 'Readiness step denied';end if;
 else raise exception 'Command capability mismatch' using errcode='42501';end if;
 c:=maintenance_2c_test.final_capability(cap);perform maintenance_2b_test.authority(c.organization_id);
 return result;
end$$;
revoke all on all functions in schema maintenance_2c_test from public,anon,authenticated,service_role;
-- Dynamic role names exist only for this random disposable DB; removed by test teardown.
do $$declare executor text:='maintenance_2c_exec_'||substr(current_database(),9);begin
 execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls',executor);
 execute format('grant usage on schema maintenance_2c_test,maintenance_2a_test,maintenance_2b_test to %I',executor);
 execute format('grant execute on function maintenance_2c_test.capability(uuid),maintenance_2c_test.lock_scope(uuid),maintenance_2c_test.final_capability(uuid) to %I',executor);
 execute format('grant execute on function maintenance_2a_test.execute(jsonb),maintenance_2a_test.reconcile(jsonb),maintenance_2a_test.read_item(jsonb),maintenance_2a_test.bind_source(jsonb) to %I',executor);
 execute format('grant execute on function maintenance_2b_test.reserve(jsonb),maintenance_2b_test.claim(jsonb),maintenance_2b_test.finish(jsonb),maintenance_2b_test.reconcile(jsonb),maintenance_2b_test.readiness_context(jsonb),maintenance_2b_test.review_intent(jsonb,jsonb),maintenance_2b_test.append_review(jsonb,jsonb,jsonb),maintenance_2b_test.authority(uuid) to %I',executor);
 execute format('grant create on schema maintenance_2c_test to %I',executor);
 execute format('alter function maintenance_2c_test.command(uuid,text,jsonb) owner to %I',executor);
 execute format('revoke create on schema maintenance_2c_test from %I',executor);
end$$;
