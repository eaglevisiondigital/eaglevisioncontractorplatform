-- WORKSTREAM 2B TEST FIXTURE ONLY. Never a migration or an operational adapter.
do $$begin
 if current_database() !~ '^ev_test_[a-f0-9]{32}$' or current_setting('server_version_num')::integer/10000<>17 then
 raise exception 'Disposable native PostgreSQL 17 required';end if;
end$$;
create schema maintenance_2b_test;
revoke all on schema maintenance_2b_test from public,anon,authenticated,service_role;
create table maintenance_2b_test.reservations(
 id uuid primary key,organization_id uuid not null,item_id uuid not null,actor_id uuid not null,
 command jsonb not null check(jsonb_typeof(command)='object'), source_snapshot jsonb not null,
 plan_id uuid not null,job_id uuid,baseline_version_id uuid,
 estimate_id uuid not null,draft_version_id uuid not null,line_id uuid not null,
 recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,item_id),unique(organization_id,estimate_id),unique(organization_id,draft_version_id),unique(organization_id,line_id),
 foreign key(organization_id,item_id) references maintenance_2a_test.items(organization_id,id),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id),
 foreign key(organization_id,plan_id) references private.inspection_plans(organization_id,id),
 foreign key(organization_id,job_id) references public.jobs(organization_id,id),
 foreign key(organization_id,baseline_version_id) references public.estimate_versions(organization_id,id),
 check((job_id is null)=(baseline_version_id is null))
);
create index repair_2b_actor on maintenance_2b_test.reservations(organization_id,actor_id);
create index repair_2b_plan on maintenance_2b_test.reservations(organization_id,plan_id);
create index repair_2b_job on maintenance_2b_test.reservations(organization_id,job_id);
create index repair_2b_baseline on maintenance_2b_test.reservations(organization_id,baseline_version_id);
create table maintenance_2b_test.events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,reservation_id uuid not null,
 state text not null check(state in ('reserved','attempting','prepared')),actor_id uuid not null,
 recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,reservation_id,state),foreign key(organization_id,reservation_id) references maintenance_2b_test.reservations(organization_id,id),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id)
);
create index repair_2b_event_actor on maintenance_2b_test.events(organization_id,actor_id);
-- Target FK exists only AFTER creation; reserved non-existent identities must remain retainable.
create table maintenance_2b_test.bindings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,reservation_id uuid not null,
 estimate_id uuid not null,draft_version_id uuid not null,result jsonb not null,
 unique(organization_id,reservation_id),unique(organization_id,estimate_id,draft_version_id),
 foreign key(organization_id,reservation_id) references maintenance_2b_test.reservations(organization_id,id),
 foreign key(organization_id,estimate_id,draft_version_id) references public.estimate_versions(organization_id,estimate_id,id)
);
create table maintenance_2b_test.reviews(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,reservation_id uuid not null,request_id uuid not null,
 sequence integer not null check(sequence>0),actor_id uuid not null,review jsonb not null,
 unique(organization_id,request_id),unique(organization_id,reservation_id,sequence),
 foreign key(organization_id,reservation_id) references maintenance_2b_test.reservations(organization_id,id),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id)
);
create index repair_2b_review_actor on maintenance_2b_test.reviews(organization_id,actor_id);
create table maintenance_2b_test.review_intents(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,reservation_id uuid not null,request_id uuid not null,actor_id uuid not null,
 request jsonb not null,recorded_at timestamptz not null default clock_timestamp(),
 unique(organization_id,request_id),foreign key(organization_id,reservation_id) references maintenance_2b_test.reservations(organization_id,id),
 foreign key(organization_id,actor_id) references public.memberships(organization_id,user_id)
);
create index repair_2b_intent_reservation on maintenance_2b_test.review_intents(organization_id,reservation_id);
create index repair_2b_intent_actor on maintenance_2b_test.review_intents(organization_id,actor_id);
-- Transaction-local permit rows cannot be written by clients or controlled by a GUC.
-- Created/removed inside checked functions; never returned or retained on success.
create table maintenance_2b_test.permits(
 organization_id uuid not null,reservation_id uuid not null,transaction_id bigint not null,
 primary key(organization_id,reservation_id),
 foreign key(organization_id,reservation_id) references maintenance_2b_test.reservations(organization_id,id)
);
create function maintenance_2b_test.authority(org uuid) returns void language plpgsql volatile security definer set search_path='' as $$begin
 perform 1 from public.organizations where id=org for share;
 perform 1 from public.memberships where organization_id=org and user_id=auth.uid() for share;
 perform 1 from private.property_features where organization_id=org for share;
 perform 1 from public.company_modules where organization_id=org order by module for share;
 if not maintenance_2a_test.eligible(org) or not private.can(org,'estimates') then raise exception 'Current repair reviewer required' using errcode='42501';end if;
 perform private.property_connected_session();
end$$;
create function maintenance_2b_test.current_source(c jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s jsonb:=c->'source';org uuid:=(s->>'organization_id')::uuid;p private.inspection_plans;i maintenance_2a_test.items;r private.inspection_reports;j public.jobs;v public.estimate_versions;plan uuid;
begin
 plan:=maintenance_2a_test.bind_source(s);
 select * into i from maintenance_2a_test.items where organization_id=org and report_id=(s->>'report_id')::uuid and report_version=(s->>'report_version')::integer and finding_id=s->>'finding_id' for update;
 select * into p from private.inspection_plans where organization_id=org and id=plan for share;
 select * into r from private.inspection_reports where organization_id=org and id=(s->>'report_id')::uuid;
 if i.id is null or i.review<>'reviewed' or i.revision is distinct from (c->>'maintenance_revision')::integer or p.id is distinct from (c->>'plan_id')::uuid or p.lock_revision is distinct from (c->>'plan_revision')::integer or p.job_id is distinct from (c->>'job_id')::uuid then raise exception 'Reviewed maintenance/plan revision changed';end if;
 if p.job_id is not null then
 select * into j from public.jobs where organization_id=org and id=p.job_id for share;
 select * into v from public.estimate_versions where organization_id=org and estimate_id=j.estimate_id and id=j.baseline_version_id for share;
 if j.id is null or v.id is null or v.status<>'issued' or v.customer_id is distinct from (s->>'customer_id')::uuid or (v.location_id is not null and v.location_id is distinct from (s->>'location_id')::uuid) or j.baseline_version_id is distinct from (c->>'job_baseline_version_id')::uuid then raise exception 'Exact issued job baseline unavailable';end if;
 elsif c->>'job_baseline_version_id' is not null then raise exception 'Unexpected job baseline';end if;
 perform maintenance_2b_test.authority(org);
 return r.snapshot;
end$$;
create function maintenance_2b_test.reserve(c jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid:=(c->'source'->>'organization_id')::uuid;q uuid:=(c->>'request_id')::uuid;old maintenance_2b_test.reservations;snapshot jsonb;item uuid;
begin
 perform private.est_object(c,array['request_id','source','maintenance_revision','plan_id','plan_revision','job_id','job_baseline_version_id','estimate_id','draft_version_id','line_id','payload']);
 if q is null or octet_length(c::text)>1048576 then raise exception 'Bounded exact request required';end if;
 perform private.est_int(c->'maintenance_revision',1,2147483646);perform private.est_int(c->'plan_revision',1,2147483646);
 perform pg_advisory_xact_lock(hashtextextended(org::text||q::text,0));
 perform pg_advisory_xact_lock(hashtextextended((c->'source')::text,0));
 -- Duplicate reads use current authority but retain the original historical request/revisions.
 select * into old from maintenance_2b_test.reservations where organization_id=org and id=q;
 if old.id is not null then
 perform maintenance_2a_test.bind_source(c->'source');perform maintenance_2b_test.authority(org);
 if old.command is distinct from c or old.actor_id is distinct from auth.uid() then raise exception 'Reservation UUID reused with different input/actor';end if;
 return to_jsonb(old);
 end if;
 snapshot:=maintenance_2b_test.current_source(c);
 select id into item from maintenance_2a_test.items where organization_id=org and report_id=(c->'source'->>'report_id')::uuid and report_version=(c->'source'->>'report_version')::integer and finding_id=c->'source'->>'finding_id';
 if exists(select 1 from maintenance_2b_test.reservations where organization_id=org and item_id=item) then raise exception 'Exact source already reserved; reconcile only';end if;
 if c->'payload'->>'customer_id' is distinct from c->'source'->>'customer_id' or c->'payload'->>'location_id' is distinct from c->'source'->>'location_id' or (select count(*) from jsonb_array_elements(c->'payload'->'lines') l where l->>'id'=c->>'line_id')<>1 then raise exception 'Reserved source line/customer/property mismatch';end if;
 perform private.estimate_context(org,c->'payload');
 insert into maintenance_2b_test.reservations(id,organization_id,item_id,actor_id,command,source_snapshot,plan_id,job_id,baseline_version_id,estimate_id,draft_version_id,line_id)
 values(q,org,item,auth.uid(),c,snapshot,(c->>'plan_id')::uuid,(c->>'job_id')::uuid,(c->>'job_baseline_version_id')::uuid,(c->>'estimate_id')::uuid,(c->>'draft_version_id')::uuid,(c->>'line_id')::uuid) returning * into old;
 insert into maintenance_2b_test.events(organization_id,reservation_id,state,actor_id) values(org,q,'reserved',auth.uid());
 perform maintenance_2b_test.authority(org);return to_jsonb(old);
end$$;
create function maintenance_2b_test.exact_reservation(c jsonb) returns maintenance_2b_test.reservations language plpgsql volatile security definer set search_path='' as $$declare r maintenance_2b_test.reservations;begin
 select * into r from maintenance_2b_test.reservations where organization_id=(c->'source'->>'organization_id')::uuid and id=(c->>'request_id')::uuid for update;
 -- Internal resource lock only; callers MUST check authority after their last resource wait. No client EXECUTE.
 if r.id is null or r.command is distinct from c then raise exception 'Exact retained reservation unavailable';end if;return r;
end$$;
create function maintenance_2b_test.claim(c jsonb) returns void language plpgsql volatile security definer set search_path='' as $$declare r maintenance_2b_test.reservations;begin
 r:=maintenance_2b_test.exact_reservation(c);
 if r.actor_id is distinct from auth.uid() then raise exception 'Exact preparing actor required';end if;
 if exists(select 1 from maintenance_2b_test.events where organization_id=r.organization_id and reservation_id=r.id and state in ('attempting','prepared')) then raise exception 'Attempt retained; UNKNOWN never retries';end if;
 perform maintenance_2b_test.current_source(c);
 insert into maintenance_2b_test.events(organization_id,reservation_id,state,actor_id) values(r.organization_id,r.id,'attempting',auth.uid());
 perform maintenance_2b_test.authority(r.organization_id);
end$$;
create function maintenance_2b_test.finish(c jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r maintenance_2b_test.reservations;settings public.company_settings;context jsonb;p jsonb:=c->'payload';result jsonb;
begin
 r:=maintenance_2b_test.exact_reservation(c);
 if r.actor_id is distinct from auth.uid() then raise exception 'Exact preparing actor required';end if;
 if not exists(select 1 from maintenance_2b_test.events where organization_id=r.organization_id and reservation_id=r.id and state='attempting') or exists(select 1 from maintenance_2b_test.events where organization_id=r.organization_id and reservation_id=r.id and state='prepared') then raise exception 'One explicit claimed attempt required';end if;
 select * into settings from public.company_settings where organization_id=r.organization_id for update;
 if maintenance_2b_test.current_source(c) is distinct from r.source_snapshot then raise exception 'Published evidence changed';end if;
 if exists(select 1 from public.estimates where id=r.estimate_id or (organization_id=r.organization_id and creation_key=r.id)) or exists(select 1 from public.estimate_versions where id=r.draft_version_id) then raise exception 'Reserved target collision; reconcile only';end if;
 if exists(select 1 from jsonb_array_elements(p->'lines') l where l->>'import_approval_id' is not null) then raise exception 'Separate fresh material review required';end if;
 context:=private.estimate_context(r.organization_id,p);
 insert into maintenance_2b_test.permits values(r.organization_id,r.id,txid_current());
 -- Reserved identities use the existing context/calculation and child writer, not a new estimate engine.
 insert into public.estimates(id,organization_id,estimate_number,project_name,customer_id,currency,creation_key,creation_hash)
 values(r.estimate_id,r.organization_id,settings.estimate_prefix||'-'||lpad(settings.estimate_next_number::text,greatest(5,length(settings.estimate_next_number::text)),'0'),p->'project'->>'name',(p->>'customer_id')::uuid,p->>'currency',r.id,sha256(convert_to(p::text,'UTF8')));
 update public.company_settings set estimate_next_number=estimate_next_number+1 where organization_id=r.organization_id;
 insert into public.estimate_versions(id,organization_id,estimate_id,version_number,customer_id,location_id,tax_policy_id,payload,calculation,company_snapshot,customer_snapshot,location_snapshot,tax_policy_snapshot,attachment_snapshots)
 values(r.draft_version_id,r.organization_id,r.estimate_id,1,(p->>'customer_id')::uuid,(p->>'location_id')::uuid,(p->>'tax_policy_id')::uuid,p,context->'calculation',context->'company_snapshot',context->'customer_snapshot',context->'location_snapshot',context->'tax_policy_snapshot',context->'attachment_snapshots');
 perform private.replace_estimate_children(r.organization_id,r.draft_version_id,p,context->'calculation');
 update public.estimates set current_version_id=r.draft_version_id,total_minor=(context->'calculation'->>'total_minor')::bigint where id=r.estimate_id;
 result:=jsonb_build_object('estimate_id',r.estimate_id,'draft_version_id',r.draft_version_id,'line_id',r.line_id,'request_id',r.id);
 insert into maintenance_2b_test.bindings(organization_id,reservation_id,estimate_id,draft_version_id,result) values(r.organization_id,r.id,r.estimate_id,r.draft_version_id,result);
 insert into maintenance_2b_test.events(organization_id,reservation_id,state,actor_id) values(r.organization_id,r.id,'prepared',auth.uid());
 delete from maintenance_2b_test.permits where organization_id=r.organization_id and reservation_id=r.id;
 perform maintenance_2b_test.authority(r.organization_id);return result;
end$$;
-- Guards are fixture-only additions, NEVER replacements/edits of historical SQL.
create function maintenance_2b_test.protect_version() returns trigger language plpgsql security definer set search_path='' as $$declare r maintenance_2b_test.reservations;begin
 if TG_OP='DELETE' then raise exception 'Repair target deletion blocked';end if;
 select * into r from maintenance_2b_test.reservations x where x.organization_id=new.organization_id and
 (x.estimate_id=new.estimate_id or x.draft_version_id=new.id or exists(select 1 from jsonb_array_elements(new.payload->'lines') l where l->>'id'=x.line_id::text)) limit 1;
 if r.id is null then return new;end if;
 if new.estimate_id<>r.estimate_id or new.id<>r.draft_version_id or new.status<>'draft' or new.customer_id<>(r.command->'source'->>'customer_id')::uuid or new.location_id is distinct from (r.command->'source'->>'location_id')::uuid or (select count(*) from jsonb_array_elements(new.payload->'lines') l where l->>'id'=r.line_id::text)<>1 or not exists(select 1 from maintenance_2b_test.permits where organization_id=r.organization_id and reservation_id=r.id and transaction_id=txid_current()) then raise exception 'Bound repair requires checked save; issue/revise/duplicate blocked';end if;
 return new;
end$$;
create trigger repair_2b_bound_version before insert or update on public.estimate_versions for each row execute function maintenance_2b_test.protect_version();
create function maintenance_2b_test.protect_parent() returns trigger language plpgsql security definer set search_path='' as $$declare r maintenance_2b_test.reservations;begin
 select * into r from maintenance_2b_test.reservations where organization_id=new.organization_id and estimate_id=new.id;
 if r.id is not null and (new.status<>'draft' or (new.current_version_id is not null and new.current_version_id<>r.draft_version_id) or not exists(select 1 from maintenance_2b_test.permits where organization_id=r.organization_id and reservation_id=r.id and transaction_id=txid_current())) then raise exception 'Bound repair parent requires checked writer';end if;return new;
end$$;
create trigger repair_2b_bound_parent before insert or update on public.estimates for each row execute function maintenance_2b_test.protect_parent();
create function maintenance_2b_test.reconcile(c jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare r maintenance_2b_test.reservations;b maintenance_2b_test.bindings;v public.estimate_versions;e public.estimates;begin
 select * into r from maintenance_2b_test.reservations where organization_id=(c->'source'->>'organization_id')::uuid and id=(c->>'request_id')::uuid for share;
 if r.id is null then
 perform maintenance_2a_test.bind_source(c->'source');perform maintenance_2b_test.authority((c->'source'->>'organization_id')::uuid);
 return jsonb_build_object('status','undetermined');end if;
 if r.command is distinct from c or r.actor_id is distinct from auth.uid() then raise exception 'Exact preparing request/actor required';end if;
 select * into b from maintenance_2b_test.bindings where organization_id=r.organization_id and reservation_id=r.id;
 if b.id is null then
 perform maintenance_2a_test.bind_source(c->'source');perform maintenance_2b_test.authority(r.organization_id);
 return jsonb_build_object('status','undetermined','estimate_id',r.estimate_id,'draft_version_id',r.draft_version_id);end if;
 select * into e from public.estimates where organization_id=r.organization_id and id=r.estimate_id for share;
 select * into v from public.estimate_versions where organization_id=r.organization_id and estimate_id=r.estimate_id and id=r.draft_version_id for share;
 perform maintenance_2a_test.bind_source(c->'source');perform maintenance_2b_test.authority(r.organization_id);
 if e.id is null or v.id is null or e.current_version_id is distinct from r.draft_version_id or v.customer_id is distinct from (c->'source'->>'customer_id')::uuid or v.location_id is distinct from (c->'source'->>'location_id')::uuid or (select count(*) from jsonb_array_elements(v.payload->'lines') l where l->>'id'=r.line_id::text)<>1 then return jsonb_build_object('status','undetermined');end if;
 return jsonb_build_object('status','committed','receipt',b.result);
end$$;
create function maintenance_2b_test.readiness_context(c jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r maintenance_2b_test.reservations;v public.estimate_versions;e public.estimates;policy jsonb;catalog jsonb;history jsonb;origin jsonb;finding jsonb;
begin
 r:=maintenance_2b_test.exact_reservation(c);
 if not exists(select 1 from maintenance_2b_test.bindings where organization_id=r.organization_id and reservation_id=r.id) then raise exception 'Committed exact target required';end if;
 select * into e from public.estimates where organization_id=r.organization_id and id=r.estimate_id for update;
 select * into v from public.estimate_versions where organization_id=r.organization_id and estimate_id=r.estimate_id and id=r.draft_version_id for update;
 if e.id is null or v.id is null or e.current_version_id is distinct from v.id or e.status<>'draft' or v.status<>'draft' then raise exception 'Current retained repair draft required';end if;
 perform 1 from public.estimate_tax_policies where organization_id=r.organization_id and id=v.tax_policy_id for share;
 select to_jsonb(p)-'created_at' into policy from public.estimate_tax_policies p where organization_id=r.organization_id and id=v.tax_policy_id;
 perform 1 from public.catalog_items x where x.organization_id=r.organization_id and exists(select 1 from jsonb_array_elements(v.payload->'lines') l where l->>'catalog_item_id'=x.id::text) order by x.id for share;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into catalog from public.catalog_items x where x.organization_id=r.organization_id and exists(select 1 from jsonb_array_elements(v.payload->'lines') l where l->>'catalog_item_id'=x.id::text);
 perform maintenance_2b_test.current_source(c);
 select coalesce(jsonb_agg(review order by sequence),'[]') into history from maintenance_2b_test.reviews where organization_id=r.organization_id and reservation_id=r.id;
 select x into finding from jsonb_array_elements(r.source_snapshot->'findings') x where x->>'id'=c->'source'->>'finding_id';
 origin:=jsonb_build_object('source',c->'source','job_id',r.job_id,'estimate_id',r.estimate_id,'draft_version_id',r.draft_version_id,'draft_version_number',1,'line_id',r.line_id,'prepared_by',r.actor_id,'prepared_at',r.recorded_at,'preparation_id',r.id);
 perform maintenance_2b_test.authority(r.organization_id);
 return jsonb_build_object('context',jsonb_build_object('bundle',private.estimate_bundle(r.organization_id,r.estimate_id,r.draft_version_id),'origin',origin,'evidence',jsonb_build_object('finding',finding,'visited_on',r.source_snapshot->'visited_on','suggested_scope',coalesce(finding->'recommendation',finding->'description'),'job_baseline_version_id',r.baseline_version_id),'policy',policy,'catalog',catalog,'as_of',(clock_timestamp() at time zone 'UTC')::date::text),'history',history,'actor',auth.uid());
end$$;
create function maintenance_2b_test.review_intent(c jsonb,req jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r maintenance_2b_test.reservations;i maintenance_2b_test.review_intents;old maintenance_2b_test.reviews;begin
 r:=maintenance_2b_test.exact_reservation(c);perform maintenance_2b_test.readiness_context(c);
 select * into i from maintenance_2b_test.review_intents where organization_id=r.organization_id and request_id=(req->>'request_id')::uuid;
 if i.id is not null then
 if i.reservation_id<>r.id or i.actor_id<>auth.uid() or i.request is distinct from req then raise exception 'Readiness UUID reused with different input/actor';end if;
 select * into old from maintenance_2b_test.reviews where organization_id=r.organization_id and request_id=i.request_id;
 if old.id is not null then return jsonb_build_object('status','committed','review',old.review);end if;
 raise exception 'Readiness UNKNOWN hold; read-only reconciliation only';end if;
 if exists(select 1 from maintenance_2b_test.review_intents pending where pending.organization_id=r.organization_id and pending.reservation_id=r.id and not exists(select 1 from maintenance_2b_test.reviews done where done.organization_id=pending.organization_id and done.reservation_id=pending.reservation_id and done.request_id=pending.request_id)) then raise exception 'Existing readiness UNKNOWN hold; no new request IDs';end if;
 insert into maintenance_2b_test.review_intents(organization_id,reservation_id,request_id,actor_id,request) values(r.organization_id,r.id,(req->>'request_id')::uuid,auth.uid(),req);
 perform maintenance_2b_test.authority(r.organization_id);return jsonb_build_object('status','claimed');
end$$;
-- Private trusted fixture service only; NEVER grant to a request client. Canonical TS engine
-- validates the request under the same transaction/locks; SQL rechecks context and sequence.
create function maintenance_2b_test.append_review(c jsonb,expected jsonb,review_value jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r maintenance_2b_test.reservations;current jsonb;old maintenance_2b_test.reviews;req jsonb:=review_value->'request';n integer;begin
 r:=maintenance_2b_test.exact_reservation(c);current:=maintenance_2b_test.readiness_context(c);
 if current is distinct from expected or review_value->>'actor' is distinct from auth.uid()::text or (req->>'snapshot')::jsonb is distinct from current->'context' then raise exception 'Current canonical review evidence required';end if;
 select * into old from maintenance_2b_test.reviews where organization_id=r.organization_id and request_id=(req->>'request_id')::uuid;
 if old.id is not null then
 if old.reservation_id<>r.id or old.actor_id<>auth.uid() or old.review->'request' is distinct from req then raise exception 'Review UUID reused with different evidence/actor';end if;return old.review;end if;
 if not exists(select 1 from maintenance_2b_test.review_intents where organization_id=r.organization_id and reservation_id=r.id and request_id=(req->>'request_id')::uuid and actor_id=auth.uid() and request=req) then raise exception 'Exact durable review intent required';end if;
 n:=jsonb_array_length(current->'history');
 if (req->>'expected_sequence')::integer is distinct from n or (review_value->>'sequence')::integer is distinct from n+1 or (req->>'lock_revision')::integer is distinct from (current->'context'->'bundle'->'version'->>'lock_revision')::integer then raise exception 'Readiness sequence/revision changed';end if;
 review_value:=jsonb_set(review_value,'{recorded_at}',to_jsonb(clock_timestamp()));
 insert into maintenance_2b_test.reviews(organization_id,reservation_id,request_id,sequence,actor_id,review) values(r.organization_id,r.id,(req->>'request_id')::uuid,n+1,auth.uid(),review_value);
 perform maintenance_2b_test.authority(r.organization_id);return review_value;
end$$;
create function maintenance_2b_test.save_draft(c jsonb,revision integer,p jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$declare r maintenance_2b_test.reservations;result jsonb;begin
 r:=maintenance_2b_test.exact_reservation(c);perform maintenance_2b_test.readiness_context(c);
 insert into maintenance_2b_test.permits values(r.organization_id,r.id,txid_current());
 result:=private.save_estimate(r.organization_id,r.estimate_id,r.draft_version_id,revision,p);
 delete from maintenance_2b_test.permits where organization_id=r.organization_id and reservation_id=r.id;
 perform maintenance_2b_test.authority(r.organization_id);return result;
end$$;
do $$declare t text;begin foreach t in array array['reservations','events','bindings','reviews','review_intents','permits'] loop
 execute format('alter table maintenance_2b_test.%I enable row level security',t);
 execute format('alter table maintenance_2b_test.%I force row level security',t);
 execute format('revoke all on maintenance_2b_test.%I from public,anon,authenticated,service_role',t);
 if t<>'permits' then
 execute format('create trigger append_only before update or delete on maintenance_2b_test.%I for each row execute function private.release_immutable()',t);
 execute format('create trigger metadata_audit after insert or update or delete on maintenance_2b_test.%I for each row execute function private.audit_change()',t);
 end if;
end loop;end$$;
revoke all on all functions in schema maintenance_2b_test from public,anon,authenticated,service_role;
