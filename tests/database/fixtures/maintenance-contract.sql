-- TEST FIXTURE ONLY. Not a migration/proposal/executor. Refuse every non-harness database.
do $$begin
 if current_database() !~ '^ev_test_[a-f0-9]{32}$' or current_setting('server_version_num')::integer/10000<>17 then
  raise exception 'Workstream 2A requires a disposable native PostgreSQL 17 harness';
 end if;
end$$;
create schema maintenance_2a_test;
revoke all on schema maintenance_2a_test from public,anon,authenticated,service_role;
create table maintenance_2a_test.items(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 customer_id uuid not null,location_id uuid not null,report_id uuid not null,
 report_version integer not null check(report_version>0),finding_id text not null check(length(finding_id) between 1 and 100),
 revision integer not null default 0 check(revision>=0),priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 assignee_id uuid,follow_up_on date check(follow_up_on is null or isfinite(follow_up_on)),review text not null default 'pending' check(review in ('pending','reviewed')),
 scheduled_visit_id uuid,updated_by uuid not null,updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,customer_id,location_id,report_id,report_version,finding_id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,report_id) references private.inspection_reports(organization_id,id),
 foreign key(organization_id,assignee_id) references public.memberships(organization_id,user_id),
 foreign key(organization_id,updated_by) references public.memberships(organization_id,user_id),
 foreign key(organization_id,scheduled_visit_id) references private.inspection_visits(organization_id,id)
);
create index maintenance_2a_queue on maintenance_2a_test.items(organization_id,location_id,review,priority,follow_up_on,id);
create index maintenance_2a_assignee on maintenance_2a_test.items(organization_id,assignee_id,follow_up_on,id);
create table maintenance_2a_test.notes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,item_id uuid not null,revision integer not null check(revision>0),
 request_id uuid not null,author_id uuid not null,text text not null check(length(trim(text)) between 1 and 2000),recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,item_id,revision),foreign key(organization_id,item_id) references maintenance_2a_test.items(organization_id,id),
 foreign key(organization_id,author_id) references public.memberships(organization_id,user_id)
);
create table maintenance_2a_test.receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,item_id uuid not null,request_id uuid not null,
 actor_id uuid not null,command jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,request_id),foreign key(organization_id,item_id) references maintenance_2a_test.items(organization_id,id),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id),
 check(jsonb_typeof(command)='object' and jsonb_typeof(result)='object')
);
-- Evidence fidelity only. No authenticated INSERT/confirmation API is supplied in 2A.
-- A future checked review writer must recompute from current DB rows, not accept client archives.
create table maintenance_2a_test.repair_archives(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,item_id uuid not null,
 estimate_id uuid not null,draft_version_id uuid not null,draft_revision integer not null check(draft_revision>0),
 source_line_id uuid not null,preparation_id uuid not null,archive_text text not null check(octet_length(archive_text)<=1048576),
 captured_at timestamptz not null default clock_timestamp(),
 unique(organization_id,item_id,draft_revision),
 foreign key(organization_id,item_id) references maintenance_2a_test.items(organization_id,id),
 foreign key(organization_id,estimate_id,draft_version_id) references public.estimate_versions(organization_id,estimate_id,id)
);
create index maintenance_2a_archive_target on maintenance_2a_test.repair_archives(organization_id,estimate_id,draft_version_id,draft_revision);


-- Cover every new composite FK with a tenant-leading index, not only queue reads.
create index maintenance_2a_report on maintenance_2a_test.items(organization_id,report_id);
create index maintenance_2a_updated_by on maintenance_2a_test.items(organization_id,updated_by);
create index maintenance_2a_scheduled on maintenance_2a_test.items(organization_id,scheduled_visit_id);
create index maintenance_2a_note_author on maintenance_2a_test.notes(organization_id,author_id);
create index maintenance_2a_receipt_item on maintenance_2a_test.receipts(organization_id,item_id);
create index maintenance_2a_receipt_actor on maintenance_2a_test.receipts(organization_id,actor_id);

create function maintenance_2a_test.eligible(org uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.property_connected_session();
 perform 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null and not u.is_anonymous and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share;
 if not found then return false;end if;
 return private.has_role(org) and private.can(org,'crm')
 and exists(select 1 from private.property_features where organization_id=org and enabled)
 and exists(select 1 from public.company_modules where organization_id=org and module='estimates' and enabled) and exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=auth.uid() and m.active
 and (m.role in ('owner','admin') or (m.role='staff' and m.staff_type in ('office_manager','estimator'))));
end$$;
create function maintenance_2a_test.bind_source(s jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=(s->>'organization_id')::uuid;report private.inspection_reports;plan uuid;
begin
 perform private.est_object(s,array['organization_id','customer_id','location_id','report_id','report_version','finding_id']);
 perform private.est_int(s->'report_version',1,2147483647);perform private.est_text(s->'finding_id',1,100);
 -- Resource locks precede current authority checks: no early success path after waits.
 select * into report from private.inspection_reports r where r.organization_id=org and r.id=(s->>'report_id')::uuid
 and r.customer_id=(s->>'customer_id')::uuid and r.location_id=(s->>'location_id')::uuid and r.version=(s->>'report_version')::integer for share;
 if report.id is null or (select count(*) from jsonb_array_elements(report.snapshot->'findings') f where f->>'id'=s->>'finding_id')<>1 then raise exception 'Exact published maintenance source unavailable';end if;
 select p.id into plan from private.inspection_visits v join private.inspection_plans p on p.organization_id=v.organization_id and p.id=v.plan_id
 where v.organization_id=org and v.id=report.visit_id and p.customer_id=report.customer_id and p.location_id=report.location_id for share of p;
 if plan is null then raise exception 'Report plan/customer/property binding unavailable';end if;
 perform 1 from public.service_locations where organization_id=org and id=report.location_id and customer_id=report.customer_id for share;
 if not found then raise exception 'CRM property binding unavailable';end if;
 perform private.property_connected_session();perform private.property_guard(org);
 if not maintenance_2a_test.eligible(org) or not private.can(org,'crm') then raise exception 'Current maintenance reviewer required' using errcode='42501';end if;
 return plan;
end$$;
create function maintenance_2a_test.read_item(s jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i maintenance_2a_test.items;result jsonb;
begin
 perform maintenance_2a_test.bind_source(s);
 select * into i from maintenance_2a_test.items where organization_id=(s->>'organization_id')::uuid and customer_id=(s->>'customer_id')::uuid and location_id=(s->>'location_id')::uuid
 and report_id=(s->>'report_id')::uuid and report_version=(s->>'report_version')::integer and finding_id=s->>'finding_id';
 result:=jsonb_build_object('source',s,'updated_by',i.updated_by,'updated_at',i.updated_at,'record',jsonb_build_object(
 'revision',coalesce(i.revision,0),'priority',coalesce(i.priority,'normal'),'assignee_id',i.assignee_id,'follow_up_on',coalesce(i.follow_up_on::text,''),
 'review',coalesce(i.review,'pending'),'scheduled_visit_id',i.scheduled_visit_id,'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'author_id',n.author_id,'text',n.text,'recorded_at',n.recorded_at) order by n.revision) from maintenance_2a_test.notes n where n.organization_id=i.organization_id and n.item_id=i.id),'[]'::jsonb)));
 perform private.property_connected_session();return result;
end$$;
create function maintenance_2a_test.reconcile(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb:=c->'source';r maintenance_2a_test.receipts;
begin
 perform maintenance_2a_test.bind_source(s);
 select * into r from maintenance_2a_test.receipts where organization_id=(s->>'organization_id')::uuid and request_id=(c->>'request_id')::uuid;
 if r.id is null then return jsonb_build_object('status','undetermined');end if;
 if r.command is distinct from c or r.actor_id is distinct from auth.uid() then raise exception 'Exact command/actor receipt required';end if;
 perform private.property_connected_session();return jsonb_build_object('status','committed','receipt',r.result);
end$$;
create function maintenance_2a_test.execute(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb:=c->'source';org uuid:=(s->>'organization_id')::uuid;q uuid:=(c->>'request_id')::uuid;
 i maintenance_2a_test.items;r maintenance_2a_test.receipts;input jsonb:=c->'input';plan private.inspection_plans;source_plan uuid;visit uuid;note text;result jsonb;now_at timestamptz;
begin
 perform private.est_object(c,array['request_id','source','expected_revision','action','input']);
 if q is null then raise exception 'Request UUID required';end if;
 perform private.est_int(c->'expected_revision',0,2147483646);
 -- A single command per transaction. Exact receipts serialize even if a UUID is reused across sources.
 perform pg_advisory_xact_lock(hashtextextended(org::text||q::text,0));
 perform pg_advisory_xact_lock(hashtextextended(s::text,0));
 if c->>'action'='follow_up' then
  perform private.est_object(input,array['plan_id','plan_revision','visited_on']);
  select * into plan from private.inspection_plans where organization_id=org and id=(input->>'plan_id')::uuid for update;
 end if;
 source_plan:=maintenance_2a_test.bind_source(s);
 select * into r from maintenance_2a_test.receipts where organization_id=org and request_id=q;
 if r.id is not null then
  if r.actor_id is distinct from auth.uid() or r.command is distinct from c then raise exception 'Request UUID reused with different command/actor';end if;
  perform private.property_connected_session();return r.result;
 end if;
 insert into maintenance_2a_test.items(organization_id,customer_id,location_id,report_id,report_version,finding_id,updated_by)
 values(org,(s->>'customer_id')::uuid,(s->>'location_id')::uuid,(s->>'report_id')::uuid,(s->>'report_version')::integer,s->>'finding_id',auth.uid()) on conflict do nothing;
 select * into i from maintenance_2a_test.items where organization_id=org and customer_id=(s->>'customer_id')::uuid and location_id=(s->>'location_id')::uuid
 and report_id=(s->>'report_id')::uuid and report_version=(s->>'report_version')::integer and finding_id=s->>'finding_id' for update;
 if i.revision is distinct from (c->>'expected_revision')::integer then raise exception 'Maintenance item changed; reload';end if;
 if c->>'action'='edit' then
  perform private.est_object(input,array['priority','assignee_id','follow_up_on','review','note']);
  perform private.est_text(input->'note',0,2000);perform private.est_text(input->'follow_up_on',0,10);
  if coalesce(input->>'priority','') not in ('low','normal','high','urgent') or coalesce(input->>'review','') not in ('pending','reviewed') or not(input ? 'assignee_id') then raise exception 'Invalid manual coordination';end if;
  if input->>'assignee_id' is not null then
   perform 1 from public.memberships where organization_id=org and user_id=(input->>'assignee_id')::uuid and active for share;
   if not found then raise exception 'Inactive or foreign responsibility';end if;
  end if;
  if input->>'follow_up_on'<>'' and ((input->>'follow_up_on')!~'^\d{4}-\d{2}-\d{2}$' or not isfinite((input->>'follow_up_on')::date)) then raise exception 'Invalid follow-up date';end if;
  note:=trim(input->>'note');
  if note<>'' and exists(select 1 from maintenance_2a_test.notes n where n.organization_id=org and n.item_id=i.id and n.author_id=auth.uid() and n.text=note and n.revision=(select max(x.revision) from maintenance_2a_test.notes x where x.organization_id=org and x.item_id=i.id)) then raise exception 'Identical private note already recorded';end if;
  update maintenance_2a_test.items set revision=revision+1,priority=input->>'priority',assignee_id=(input->>'assignee_id')::uuid,
   follow_up_on=nullif(input->>'follow_up_on','')::date,review=input->>'review',updated_by=auth.uid(),updated_at=clock_timestamp() where id=i.id returning * into i;
  if note<>'' then insert into maintenance_2a_test.notes(organization_id,item_id,revision,request_id,author_id,text) values(org,i.id,i.revision,q,auth.uid(),note);end if;
 elsif c->>'action'='follow_up' then
  perform private.est_int(input->'plan_revision',1,2147483647);
  if plan.id is null or plan.id is distinct from source_plan or plan.customer_id<>i.customer_id or plan.location_id<>i.location_id or plan.lock_revision is distinct from (input->>'plan_revision')::integer
   or i.review<>'pending' or i.scheduled_visit_id is not null then raise exception 'Exact current source plan and pending unscheduled item required';end if;
  if coalesce(input->>'visited_on','')!~'^\d{4}-\d{2}-\d{2}$' or not isfinite((input->>'visited_on')::date) then raise exception 'Invalid inspection date';end if;
  visit:=(private.property_command(org,'create_visit',plan.id,null,jsonb_build_object('visited_on',input->'visited_on','phase','after'))->>'id')::uuid;
  update maintenance_2a_test.items set revision=revision+1,scheduled_visit_id=visit,updated_by=auth.uid(),updated_at=clock_timestamp() where id=i.id returning * into i;
 else raise exception 'No repair, completion or financial command is implemented';end if;
 -- Recheck after every resource wait and before a successful response, including replay.
 perform private.property_connected_session();perform private.property_guard(org);
 if not maintenance_2a_test.eligible(org) then raise exception 'Reviewer revoked';end if;
 now_at:=clock_timestamp();
 result:=jsonb_build_object('request_id',q,'source',s,'revision',i.revision,'actor_id',auth.uid(),'recorded_at',now_at,'scheduled_visit_id',i.scheduled_visit_id);
 insert into maintenance_2a_test.receipts(organization_id,item_id,request_id,actor_id,command,result,recorded_at) values(org,i.id,q,auth.uid(),c,result,now_at);
 return result;
end$$;
create function maintenance_2a_test.immutable_source() returns trigger language plpgsql set search_path='' as $$begin
 if (new.id,new.organization_id,new.customer_id,new.location_id,new.report_id,new.report_version,new.finding_id) is distinct from
 (old.id,old.organization_id,old.customer_id,old.location_id,old.report_id,old.report_version,old.finding_id) or new.revision<>old.revision+1 then raise exception 'Immutable maintenance source/revision';end if;return new;
end$$;
create trigger immutable_source before update on maintenance_2a_test.items for each row execute function maintenance_2a_test.immutable_source();
do $$declare t text;begin foreach t in array array['items','notes','receipts','repair_archives'] loop
 execute format('alter table maintenance_2a_test.%I enable row level security',t);
 execute format('alter table maintenance_2a_test.%I force row level security',t);
 execute format('revoke all on maintenance_2a_test.%I from public,anon,authenticated,service_role',t);
 execute format('create policy staff_read on maintenance_2a_test.%I for select to authenticated using(maintenance_2a_test.eligible(organization_id))',t);
 execute format('create trigger metadata_audit after insert or update or delete on maintenance_2a_test.%I for each row execute function private.audit_change()',t);
 if t<>'items' then execute format('create trigger append_only before update or delete on maintenance_2a_test.%I for each row execute function private.release_immutable()',t);end if;
end loop;end$$;
revoke all on all functions in schema maintenance_2a_test from public,anon,authenticated,service_role;
-- Grants exist ONLY inside this temporary test schema. No public wrappers or app wiring.
grant usage on schema maintenance_2a_test to authenticated;
grant execute on function maintenance_2a_test.eligible(uuid),maintenance_2a_test.read_item(jsonb),maintenance_2a_test.execute(jsonb),maintenance_2a_test.reconcile(jsonb) to authenticated;

create function maintenance_2a_test.archive_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb:=new.archive_text::jsonb;c jsonb:=a->'context';o jsonb:=c->'origin';i maintenance_2a_test.items;v public.estimate_versions;r private.inspection_reports;
begin
 select * into i from maintenance_2a_test.items where organization_id=new.organization_id and id=new.item_id for update;
 select * into v from public.estimate_versions where organization_id=new.organization_id and estimate_id=new.estimate_id and id=new.draft_version_id for share;
 select * into r from private.inspection_reports where organization_id=i.organization_id and id=i.report_id;
 if exists(select 1 from maintenance_2a_test.repair_archives x where x.organization_id=new.organization_id and x.item_id=new.item_id and (x.estimate_id,x.draft_version_id,x.source_line_id,x.preparation_id) is distinct from (new.estimate_id,new.draft_version_id,new.source_line_id,new.preparation_id)) then raise exception 'Retained repair target is immutable';end if;
 if i.id is null or v.id is null or r.id is null or v.status<>'draft' or v.lock_revision<>new.draft_revision
 or v.customer_id<>i.customer_id or v.location_id is distinct from i.location_id
 or o->'source' is distinct from jsonb_build_object('organization_id',i.organization_id,'customer_id',i.customer_id,'location_id',i.location_id,'report_id',i.report_id,'report_version',i.report_version,'finding_id',i.finding_id)
 or o->>'estimate_id' is distinct from new.estimate_id::text or o->>'draft_version_id' is distinct from new.draft_version_id::text
 or o->>'line_id' is distinct from new.source_line_id::text or o->>'preparation_id' is distinct from new.preparation_id::text
 or (select count(*) from jsonb_array_elements(v.payload->'lines') l where l->>'id'=new.source_line_id::text)<>1
 or c->'bundle'->'version'->'payload' is distinct from v.payload or c->'bundle'->'version'->'calculation' is distinct from v.calculation
 or c->'evidence'->'finding' is distinct from (select x from jsonb_array_elements(r.snapshot->'findings') x where x->>'id'=i.finding_id)
 or c->'evidence'->'visited_on' is distinct from r.snapshot->'visited_on' then raise exception 'Archive source/current saved estimate mismatch';end if;
 return new;
end$$;
create trigger archive_integrity before insert on maintenance_2a_test.repair_archives for each row execute function maintenance_2a_test.archive_integrity();
revoke all on function maintenance_2a_test.archive_integrity() from public,anon,authenticated,service_role;
create function maintenance_2a_test.read_archive(s jsonb,a uuid) returns text language plpgsql security definer set search_path='' as $$declare result text;begin
 perform maintenance_2a_test.bind_source(s);
 select r.archive_text into result from maintenance_2a_test.repair_archives r join maintenance_2a_test.items i on i.organization_id=r.organization_id and i.id=r.item_id
 where r.id=a and i.organization_id=(s->>'organization_id')::uuid and i.customer_id=(s->>'customer_id')::uuid and i.location_id=(s->>'location_id')::uuid and i.report_id=(s->>'report_id')::uuid and i.report_version=(s->>'report_version')::integer and i.finding_id=s->>'finding_id';
 if result is null then raise exception 'Exact private archive unavailable';end if;
 perform private.property_connected_session();return result;
end$$;
revoke all on function maintenance_2a_test.read_archive(jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_2a_test.read_archive(jsonb,uuid) to authenticated;
