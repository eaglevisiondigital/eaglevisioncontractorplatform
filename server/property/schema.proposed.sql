-- Forward-only property operations: dormant private schema, no data or activation.
-- PENDING OWNER EXECUTION APPROVAL. Preserve all ten historical migrations.
-- No feature rows, public wrappers, Storage policies, logins or provider grants.
begin;
create table private.property_features(organization_id uuid primary key references public.organizations(id),enabled boolean not null default false);
create unique index property_location_customer on public.service_locations(organization_id,id,customer_id);
create unique index property_expense_job on public.job_expenses(organization_id,job_id,id);
create table private.inspection_plans(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),customer_id uuid not null,location_id uuid not null,job_id uuid,
 name text not null check(length(trim(name)) between 1 and 200),cadence text not null check(cadence in ('once','weekly','monthly','custom')),interval_days integer not null check(interval_days between 1 and 365),timezone text not null,starts_on date not null,checklist jsonb not null,lock_revision integer not null default 1 check(lock_revision>0),
 unique(organization_id,id),foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(organization_id,job_id) references public.jobs(organization_id,id)
);
create index inspection_plan_customer on private.inspection_plans(organization_id,customer_id);
create index inspection_plan_location on private.inspection_plans(organization_id,location_id,customer_id);
create index inspection_plan_schedule on private.inspection_plans(organization_id,starts_on desc,id);
create index inspection_plan_job on private.inspection_plans(organization_id,job_id);
create table private.inspection_visits(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,plan_id uuid not null,visited_on date not null,phase text not null check(phase in ('before','during','after')),status text not null default 'draft' check(status in ('draft','submitted','published')),content jsonb not null,lock_revision integer not null default 1 check(lock_revision>0),created_by uuid not null default auth.uid(),
 unique(organization_id,id),unique(organization_id,plan_id,visited_on),foreign key(organization_id,plan_id) references private.inspection_plans(organization_id,id)
);
create index inspection_visit_history on private.inspection_visits(organization_id,visited_on desc,id);
create table private.inspection_reports(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,visit_id uuid not null,customer_id uuid not null,location_id uuid not null,version integer not null check(version>0),snapshot jsonb not null,published_by uuid not null default auth.uid(),published_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,visit_id,version),foreign key(organization_id,visit_id) references private.inspection_visits(organization_id,id),foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id)
);
create index inspection_report_customer on private.inspection_reports(organization_id,customer_id,published_at desc,id);
create index inspection_report_history on private.inspection_reports(organization_id,published_at desc,id);
create index inspection_report_location on private.inspection_reports(organization_id,location_id,customer_id);
create table private.property_media(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,visit_id uuid not null,filename text not null check(length(filename) between 1 and 200 and filename!~'[/\\]'),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),mime text not null check(mime in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')),byte_size bigint not null check(byte_size between 8 and 262144000),kind text not null check(kind in ('photo','video','drone_photo','drone_video')),phase text not null check(phase in ('before','during','after')),visibility text not null default 'internal' check(visibility in ('internal','customer')),
 status text not null default 'quarantined' check(status='quarantined'),created_by uuid not null default auth.uid(),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,visit_id,sha256),foreign key(organization_id,visit_id) references private.inspection_visits(organization_id,id),check((kind in ('photo','drone_photo') and mime like 'image/%' and byte_size<=3145728) or (kind in ('video','drone_video') and mime like 'video/%'))
);
create table private.supplier_comparisons(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,estimate_version_id uuid not null,snapshot jsonb not null,created_by uuid not null default auth.uid(),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),foreign key(organization_id,estimate_version_id) references public.estimate_versions(organization_id,id)
);
create index comparison_history on private.supplier_comparisons(organization_id,created_at desc,id);
create index comparison_version on private.supplier_comparisons(organization_id,estimate_version_id);
create unique index property_change_job on public.job_change_orders(organization_id,job_id,id);
create table private.unbilled_decisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,job_id uuid not null,expense_id uuid not null,revision integer not null check(revision>0),disposition text not null check(disposition in ('absorbed','included','proposed','deferred')),reason text not null check(length(trim(reason)) between 1 and 1000),scope_line_id uuid,pricing jsonb not null,selling_minor bigint not null check(selling_minor between 0 and 9000000000000),presentation text not null check(presentation in ('itemized','package')),description text not null check(length(trim(description)) between 1 and 1000),change_id uuid,reviewed_by uuid not null default auth.uid(),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,expense_id,revision),foreign key(organization_id,job_id,expense_id) references public.job_expenses(organization_id,job_id,id),foreign key(organization_id,job_id) references public.jobs(organization_id,id),foreign key(organization_id,job_id,change_id) references public.job_change_orders(organization_id,job_id,id),check((disposition='proposed' and change_id is not null) or (disposition<>'proposed' and change_id is null and selling_minor=0))
);
create index unbilled_history on private.unbilled_decisions(organization_id,created_at desc,id);
create index unbilled_expense on private.unbilled_decisions(organization_id,job_id,expense_id);
create unique index unbilled_decision_change on private.unbilled_decisions(organization_id,id,change_id);
create unique index unbilled_proposal_once on private.unbilled_decisions(organization_id,expense_id) where change_id is not null;
create index unbilled_change on private.unbilled_decisions(organization_id,job_id,change_id);
-- A reviewable invoice draft linked to the EXISTING change order. Not a receivable.
create table private.supplemental_invoice_drafts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,decision_id uuid not null,change_id uuid not null,customer_id uuid not null,currency text not null check(currency~'^[A-Z]{3}$'),selling_minor bigint not null check(selling_minor between 0 and 9000000000000),description text not null,presentation text not null check(presentation in ('itemized','package')),status text not null default 'awaiting_customer_authorization' check(status='awaiting_customer_authorization'),
 unique(organization_id,id),unique(organization_id,change_id),unique(organization_id,decision_id) include(change_id),foreign key(organization_id,decision_id,change_id) references private.unbilled_decisions(organization_id,id,change_id),foreign key(organization_id,change_id) references public.job_change_orders(organization_id,id),foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index supplemental_customer on private.supplemental_invoice_drafts(organization_id,customer_id);
do $$declare t text;begin foreach t in array array['property_features','inspection_plans','inspection_visits','inspection_reports','property_media','supplier_comparisons','unbilled_decisions','supplemental_invoice_drafts'] loop
 execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable_tenant before update on private.%I for each row execute function private.prevent_tenant_move()',t);
 execute format('create trigger property_audit after insert or update or delete on private.%I for each row execute function private.audit_change()',t);
 if t in ('inspection_reports','property_media','supplier_comparisons','unbilled_decisions','supplemental_invoice_drafts') then execute format('create trigger property_immutable before update or delete on private.%I for each row execute function private.release_immutable()',t);end if;
 end loop;end $$;
create function private.validate_inspection(p jsonb) returns void language plpgsql immutable set search_path='' as $$declare x jsonb;begin
 perform private.est_object(p,array['summary','internal_notes','checklist','findings']);perform private.est_text(p->'summary',1,2000);perform private.est_text(p->'internal_notes',0,4000);
 if jsonb_typeof(p->'checklist') is distinct from 'array' or jsonb_array_length(p->'checklist')>100 or jsonb_typeof(p->'findings') is distinct from 'array' or jsonb_array_length(p->'findings')>100 then raise exception 'Inspection limits';end if;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p->'checklist')) or (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p->'findings')) then raise exception 'Duplicate inspection item';end if;
 for x in select * from jsonb_array_elements(p->'checklist') loop perform private.est_object(x,array['id','label','required','completed']);perform private.est_text(x->'id',1,100);perform private.est_text(x->'label',1,200);if jsonb_typeof(x->'required') is distinct from 'boolean' or jsonb_typeof(x->'completed') is distinct from 'boolean' then raise exception 'Checklist values';end if;end loop;
 for x in select * from jsonb_array_elements(p->'findings') loop perform private.est_object(x,array['id','category','location','severity','description','recommendation','customer_visible']);perform private.est_text(x->'id',1,100);perform private.est_text(x->'category',1,100);perform private.est_text(x->'location',1,200);perform private.est_text(x->'description',1,1000);perform private.est_text(x->'recommendation',1,1000);if coalesce(x->>'severity','') not in ('low','moderate','urgent') or jsonb_typeof(x->'customer_visible') is distinct from 'boolean' then raise exception 'Finding values';end if;end loop;
end $$;
revoke all on function private.validate_inspection(jsonb) from public,anon,authenticated,service_role;
-- These invariants also protect narrowly reviewed maintenance inserts. Database
-- owners can still alter/disable triggers; this is not operator-resistant storage.
create function private.property_report_snapshot(p jsonb,p_day date,p_phase text)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 perform private.validate_inspection(p);
 if p_day is null or not isfinite(p_day) or coalesce(p_phase,'') not in ('before','during','after') then raise exception 'Invalid report visit';end if;
 return jsonb_build_object('summary',p->'summary','visited_on',p_day,'phase',p_phase,
 'checklist',(select coalesce(jsonb_agg(jsonb_build_object('label',x->'label','completed',x->'completed')),'[]') from jsonb_array_elements(p->'checklist') x),
 'findings',(select coalesce(jsonb_agg(jsonb_build_object('id',x->'id','category',x->'category','location',x->'location','severity',x->'severity','description',x->'description','recommendation',x->'recommendation')),'[]') from jsonb_array_elements(p->'findings') x where x->'customer_visible'='true'::jsonb),'media','[]'::jsonb);
end $$;
revoke all on function private.property_report_snapshot(jsonb,date,text) from public,anon,authenticated,service_role;
create function private.property_record_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.inspection_visits;plan private.inspection_plans;j public.jobs;e public.job_expenses;d private.unbilled_decisions;c public.job_change_orders;customer uuid;currency text;net numeric;sell numeric;
begin
 if TG_TABLE_NAME='inspection_plans' then
  if TG_OP='UPDATE' and (new.id is distinct from old.id or new.customer_id is distinct from old.customer_id or new.location_id is distinct from old.location_id or new.job_id is distinct from old.job_id) then raise exception 'Inspection plan bindings are immutable';end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) or not isfinite(new.starts_on) then raise exception 'Invalid plan schedule';end if;
  perform private.validate_inspection(jsonb_build_object('summary',new.name,'internal_notes','','checklist',new.checklist,'findings','[]'::jsonb));
  if new.job_id is not null and not exists(select 1 from public.jobs x join public.estimate_versions b on b.organization_id=x.organization_id and b.id=x.baseline_version_id where x.organization_id=new.organization_id and x.id=new.job_id and b.customer_id=new.customer_id) then raise exception 'Job/customer mismatch';end if;
 elsif TG_TABLE_NAME='inspection_visits' then
  if TG_OP='UPDATE' and (new.id is distinct from old.id or new.plan_id is distinct from old.plan_id or new.visited_on is distinct from old.visited_on or new.phase is distinct from old.phase or new.created_by is distinct from old.created_by) then raise exception 'Visit bindings are immutable';end if;
  if not isfinite(new.visited_on) then raise exception 'Invalid visit date';end if;
  perform private.validate_inspection(new.content);
 elsif TG_TABLE_NAME='inspection_reports' then
  select * into v from private.inspection_visits where organization_id=new.organization_id and id=new.visit_id for update;
  select * into plan from private.inspection_plans where organization_id=new.organization_id and id=v.plan_id for share;
  if v.id is null or plan.id is null or new.customer_id is distinct from plan.customer_id or new.location_id is distinct from plan.location_id or v.status<>'submitted' then raise exception 'Report source/customer/property mismatch';end if;
  if exists(select 1 from jsonb_array_elements(v.content->'checklist') x where x->'required'='true'::jsonb and x->'completed'<>'true'::jsonb) then raise exception 'Required checklist incomplete';end if;
  if new.snapshot is distinct from private.property_report_snapshot(v.content,v.visited_on,v.phase) or new.version<>(select coalesce(max(r.version),0)+1 from private.inspection_reports r where r.organization_id=new.organization_id and r.visit_id=v.id) then raise exception 'Report snapshot/version mismatch';end if;
 elsif TG_TABLE_NAME='unbilled_decisions' then
  select * into j from public.jobs where organization_id=new.organization_id and id=new.job_id for update;
  select * into e from public.job_expenses where organization_id=new.organization_id and job_id=j.id and id=new.expense_id and category='materials' and kind='payment';
  if j.id is null or e.id is null or not exists(select 1 from public.job_expense_reviews where organization_id=new.organization_id and job_id=j.id and submission_id=e.id and decision='approved') then raise exception 'Approved material purchase required';end if;
  if new.revision<>(select coalesce(max(x.revision),0)+1 from private.unbilled_decisions x where x.organization_id=new.organization_id and x.expense_id=e.id) then raise exception 'Review revision mismatch';end if;
  perform private.est_object(new.pricing,array['mode','value']);perform private.est_int(new.pricing->'value',0,9000000000000);
  if coalesce(new.pricing->>'mode','') not in ('pass_through','percent','fixed') or (new.pricing->>'mode'='pass_through' and (new.pricing->>'value')::numeric<>0) or (new.pricing->>'mode'='percent' and (new.pricing->>'value')::numeric>100000) then raise exception 'Invalid markup';end if;
  if (new.disposition='included' or new.scope_line_id is not null) and not exists(select 1 from jsonb_array_elements(j.baseline->'lines') x where x->>'id'=new.scope_line_id::text) and not exists(select 1 from public.job_change_orders x join public.job_change_approvals a on a.organization_id=x.organization_id and a.change_id=x.id where x.organization_id=new.organization_id and x.job_id=j.id and x.id=new.scope_line_id) then raise exception 'Existing authorized scope required';end if;
  if new.disposition='proposed' then
   net:=e.amount_minor-coalesce((select sum(x.amount_minor) from public.job_expenses x join public.job_expense_reviews y on y.organization_id=x.organization_id and y.job_id=x.job_id and y.submission_id=x.id and y.decision='approved' where x.organization_id=new.organization_id and x.job_id=j.id and x.adjusts_expense_id=e.id and x.kind='credit'),0);
   perform private.est_int(to_jsonb(net),1,9000000000000);
   if exists(select 1 from public.job_expenses x join public.job_expense_reviews y on y.organization_id=x.organization_id and y.job_id=x.job_id and y.submission_id=x.id and y.decision='approved' where x.organization_id=new.organization_id and x.job_id=j.id and x.id<>e.id and x.kind='payment' and trim(regexp_replace(lower(x.supplier),'[^a-z0-9]+',' ','g'))=trim(regexp_replace(lower(e.supplier),'[^a-z0-9]+',' ','g')) and trim(regexp_replace(lower(x.purchase_key),'[^a-z0-9]+',' ','g'))=trim(regexp_replace(lower(e.purchase_key),'[^a-z0-9]+',' ','g'))) then raise exception 'Resolve purchase overlap before proposal';end if;
   sell:=private.est_money(net+case new.pricing->>'mode' when 'fixed' then (new.pricing->>'value')::numeric when 'percent' then round(net*(new.pricing->>'value')::numeric/10000) else 0 end);
   select * into c from public.job_change_orders where organization_id=new.organization_id and job_id=j.id and id=new.change_id;
   if c.id is null or c.status<>'proposed' or c.category<>'materials' or c.cost_minor<>0 or c.revenue_minor<>sell or new.selling_minor<>sell then raise exception 'Supplemental scope/price mismatch';end if;
  end if;
 elsif TG_TABLE_NAME='supplemental_invoice_drafts' then
  select * into d from private.unbilled_decisions where organization_id=new.organization_id and id=new.decision_id and change_id=new.change_id;
  select * into j from public.jobs where organization_id=new.organization_id and id=d.job_id for share;
  select b.customer_id,b.payload->>'currency' into customer,currency from public.estimate_versions b where b.organization_id=new.organization_id and b.id=j.baseline_version_id;
  if d.id is null or j.id is null or new.customer_id is distinct from customer or new.currency is distinct from currency or new.selling_minor is distinct from d.selling_minor or new.description is distinct from d.description or new.presentation is distinct from d.presentation then raise exception 'Supplemental invoice provenance mismatch';end if;
 end if;
 return new;
end $$;
revoke all on function private.property_record_integrity() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['inspection_plans','inspection_visits','inspection_reports','unbilled_decisions','supplemental_invoice_drafts'] loop
  execute format('create trigger property_integrity before insert or update on private.%I for each row execute function private.property_record_integrity()',t);
 end loop;
end $$;
-- PostgREST verifies the token on entry; recheck its signed expiry after SQL waits.
create function private.property_session_guard() returns void language plpgsql
security definer set search_path='' as $$declare expiry jsonb:=auth.jwt()->'exp';begin
 if auth.uid() is null or expiry is null or jsonb_typeof(expiry)<>'number' or expiry::text!~'^[0-9]{1,12}$' then raise exception 'Authenticated expiring session required' using errcode='42501';end if;
 if expiry::text::numeric<=extract(epoch from clock_timestamp()) then raise exception 'Session expired' using errcode='42501';end if;
end $$;
revoke all on function private.property_session_guard() from public,anon,authenticated,service_role;
create function private.property_guard(p_org uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.property_session_guard();
 perform 1 from private.property_features where organization_id=p_org and enabled for share;if not found then raise exception 'Property operations disabled' using errcode='42501';end if;
 perform 1 from public.organizations where id=p_org and status='active' for share;
 if not found or not private.has_role(p_org) then raise exception 'Property access denied' using errcode='42501';end if;
 perform 1 from public.company_modules where organization_id=p_org and module='estimates' and enabled for share;if not found then raise exception 'Estimating disabled' using errcode='42501';end if;
 perform 1 from public.company_modules where organization_id=p_org and module='crm' for share;
 perform 1 from public.memberships where organization_id=p_org and user_id=auth.uid() and active for share;if not found or not private.has_role(p_org) then raise exception 'Membership revoked' using errcode='42501';end if;
end $$;
revoke all on function private.property_guard(uuid) from public,anon,authenticated,service_role;
create function private.property_command(p_org uuid,p_action text,p_id uuid,p_lock integer,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare plan private.inspection_plans;v private.inspection_visits;j public.jobs;e public.job_expenses;r uuid;rev integer;snapshot jsonb;net numeric;sell numeric;q jsonb;l jsonb;version public.estimate_versions;change uuid;customer uuid;
begin
 perform private.property_guard(p_org);
 if p_action in ('save_visit','submit_visit','publish_visit','revise_visit','update_plan','unbilled_review') and (p_lock is null or p_lock<1) then raise exception 'Current positive revision required';end if;
 if coalesce(jsonb_typeof(p),'')<>'object' or pg_column_size(p)>131072 then raise exception 'Invalid property command';end if;
 if p_action='create_plan' then
 if not private.can(p_org,'estimates') or not private.can(p_org,'crm') then raise exception 'Plan management denied' using errcode='42501';end if;
 perform private.est_object(p,array['customer_id','location_id','job_id','name','cadence','interval_days','timezone','starts_on','checklist']);
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p->>'timezone') then raise exception 'Unknown timezone';end if;
 if p->>'job_id' is not null and not exists(select 1 from public.jobs x join public.estimate_versions b on b.organization_id=x.organization_id and b.id=x.baseline_version_id where x.organization_id=p_org and x.id=(p->>'job_id')::uuid and b.customer_id=(p->>'customer_id')::uuid) then raise exception 'Job/customer mismatch';end if;
 perform private.validate_inspection(jsonb_build_object('summary',p->'name','internal_notes','','checklist',p->'checklist','findings','[]'::jsonb));
 insert into private.inspection_plans(organization_id,customer_id,location_id,job_id,name,cadence,interval_days,timezone,starts_on,checklist) values(p_org,(p->>'customer_id')::uuid,(p->>'location_id')::uuid,(p->>'job_id')::uuid,p->>'name',p->>'cadence',private.est_int(p->'interval_days',1,365),p->>'timezone',(p->>'starts_on')::date,p->'checklist') returning id into r;
 elsif p_action='update_plan' then
 if not private.can(p_org,'estimates') or not private.can(p_org,'crm') then raise exception 'Plan management denied';end if;
 select * into plan from private.inspection_plans where organization_id=p_org and id=p_id for update;
 perform private.property_session_guard();
 if plan.id is null or plan.lock_revision is distinct from p_lock then raise exception 'Plan changed';end if;
 perform private.est_object(p,array['name','cadence','interval_days','timezone','starts_on','checklist']);
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p->>'timezone') then raise exception 'Unknown timezone';end if;
 perform private.validate_inspection(jsonb_build_object('summary',p->'name','internal_notes','','checklist',p->'checklist','findings','[]'::jsonb));
 update private.inspection_plans set name=private.est_text(p->'name',1,200),cadence=p->>'cadence',interval_days=private.est_int(p->'interval_days',1,365),timezone=p->>'timezone',starts_on=(p->>'starts_on')::date,checklist=p->'checklist',lock_revision=lock_revision+1 where organization_id=p_org and id=plan.id;r:=plan.id;
 elsif p_action='quote_snapshot' then
 if not private.can(p_org,'estimates') then raise exception 'Estimating denied';end if;
 perform private.est_object(p,array['quotes']);
 select * into version from public.estimate_versions where organization_id=p_org and id=p_id and status='issued' for share;if not found then raise exception 'Immutable issued scope required';end if;
 if jsonb_typeof(p->'quotes') is distinct from 'array' or jsonb_array_length(p->'quotes') not between 1 and 4 or (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p->'quotes')) then raise exception 'Select 1 to 4 distinct suppliers';end if;
 for q in select * from jsonb_array_elements(p->'quotes') loop
 perform private.est_object(q,array['id','name','store','account_price_note','source_reference','quoted_at','expires_at','currency','shipping_minor','pickup_minor','tax_bps','lines']);perform private.est_text(q->'name',1,200);perform private.est_text(q->'source_reference',1,500);
 perform private.est_text(q->'id',1,100);perform private.est_text(q->'store',0,200);perform private.est_text(q->'account_price_note',0,500);perform private.est_text(q->'quoted_at',10,40);perform private.est_text(q->'expires_at',10,40);
 if q->'shipping_minor'<>'null'::jsonb then perform private.est_int(q->'shipping_minor',0,9000000000000);end if;
 if q->'pickup_minor'<>'null'::jsonb then perform private.est_int(q->'pickup_minor',0,9000000000000);end if;
 if q->'tax_bps'<>'null'::jsonb then perform private.est_int(q->'tax_bps',0,10000);end if;
 if not(q ?& array['shipping_minor','pickup_minor','tax_bps']) then raise exception 'Quote unknowns must be explicit';end if;
 if q->>'currency' is distinct from version.payload->>'currency' or (q->>'expires_at')::timestamptz<=clock_timestamp() or (q->>'quoted_at')::timestamptz>clock_timestamp() then raise exception 'Quote expiry/currency';end if;
 if jsonb_typeof(q->'lines') is distinct from 'array' or jsonb_array_length(q->'lines')>100 or (select count(*)<>count(distinct value->>'line_id') from jsonb_array_elements(q->'lines')) then raise exception 'Quote rows';end if;
 for l in select * from jsonb_array_elements(q->'lines') loop
 perform private.est_object(l,array['line_id','sku','specification','unit','pack_quantity_milli','pack_price_minor','available_packs','equivalent_approved']);perform private.est_int(l->'pack_quantity_milli',1,1000000000);perform private.est_int(l->'pack_price_minor',0,9000000000000);
 perform private.est_text(l->'sku',0,100);perform private.est_text(l->'specification',1,1000);perform private.est_text(l->'unit',1,30);
 if not(l ? 'available_packs') or jsonb_typeof(l->'equivalent_approved') is distinct from 'boolean' then raise exception 'Quote review fields';end if;
 if l->'available_packs'<>'null'::jsonb then perform private.est_int(l->'available_packs',0,1000000000);end if;
 if not exists(select 1 from jsonb_array_elements(version.payload->'lines') x where x->>'id'=l->>'line_id' and x->>'kind' in ('material','product','allowance')) then raise exception 'Foreign material line';end if;
 end loop;end loop;
 insert into private.supplier_comparisons(organization_id,estimate_version_id,snapshot) values(p_org,p_id,p) returning id into r;
 elsif p_action='unbilled_review' then
 if not private.has_role(p_org,array['owner','admin']::public.staff_role[]) or not private.can(p_org,'estimates') then raise exception 'Management review denied';end if;
 perform private.est_object(p,array['expense_id','disposition','reason','scope_line_id','pricing','presentation','description']);perform private.est_object(p->'pricing',array['mode','value']);
 select * into j from public.jobs where organization_id=p_org and id=p_id for update;perform private.property_session_guard();if j.id is null or j.lock_revision is distinct from p_lock then raise exception 'Job changed';end if;
 select * into e from public.job_expenses where organization_id=p_org and job_id=j.id and id=(p->>'expense_id')::uuid and category='materials' and kind='payment';
 if not found or not exists(select 1 from public.job_expense_reviews where organization_id=p_org and submission_id=e.id and decision='approved') then raise exception 'Approved material purchase required';end if;
 if exists(select 1 from private.unbilled_decisions where organization_id=p_org and expense_id=e.id and change_id is not null) then raise exception 'Already proposed';end if;
 net:=e.amount_minor-coalesce((select sum(x.amount_minor) from public.job_expenses x join public.job_expense_reviews y on y.organization_id=x.organization_id and y.submission_id=x.id and y.decision='approved' where x.organization_id=p_org and x.adjusts_expense_id=e.id and x.kind='credit'),0);
 perform private.est_int(to_jsonb(net),0,9000000000000);perform private.est_int(p->'pricing'->'value',0,9000000000000);
 if coalesce(p->'pricing'->>'mode','') not in ('pass_through','percent','fixed') or (p->'pricing'->>'mode'='pass_through' and (p->'pricing'->>'value')::numeric<>0) or (p->'pricing'->>'mode'='percent' and (p->'pricing'->>'value')::numeric>100000) then raise exception 'Invalid markup';end if;
 sell:=0;change:=null;
 if p->>'disposition'='included' and not exists(select 1 from jsonb_array_elements(j.baseline->'lines') x where x->>'id'=p->>'scope_line_id') and not exists(select 1 from public.job_change_orders c join public.job_change_approvals a on a.organization_id=c.organization_id and a.change_id=c.id where c.organization_id=p_org and c.job_id=j.id and c.id=(p->>'scope_line_id')::uuid) then raise exception 'Existing authorized scope required';end if;
 if p->>'disposition'='proposed' then
 if net<=0 or exists(select 1 from public.job_expenses x join public.job_expense_reviews y on y.organization_id=x.organization_id and y.submission_id=x.id and y.decision='approved' where x.organization_id=p_org and x.job_id=j.id and x.id<>e.id and x.kind='payment' and lower(trim(x.supplier))=lower(trim(e.supplier)) and trim(regexp_replace(lower(x.purchase_key),'[^a-z0-9]+',' ','g'))=trim(regexp_replace(lower(e.purchase_key),'[^a-z0-9]+',' ','g'))) then raise exception 'Resolve credit/overlap before proposal';end if;
 sell:=private.est_money(net+case p->'pricing'->>'mode' when 'fixed' then (p->'pricing'->>'value')::numeric when 'percent' then round(net*(p->'pricing'->>'value')::numeric/10000) else 0 end);
 change:=private.propose_job_change(p_org,j.id,jsonb_build_object('description',p->>'description','revenue_minor',sell,'cost_minor',0,'category','materials','status','proposed'));
 end if;
 select coalesce(max(revision),0)+1 into rev from private.unbilled_decisions where organization_id=p_org and expense_id=e.id;
 insert into private.unbilled_decisions(organization_id,job_id,expense_id,revision,disposition,reason,scope_line_id,pricing,selling_minor,presentation,description,change_id) values(p_org,j.id,e.id,rev,p->>'disposition',private.est_text(p->'reason',1,1000),(p->>'scope_line_id')::uuid,p->'pricing',sell,p->>'presentation',private.est_text(p->'description',1,1000),change) returning id into r;
 if change is not null then
 select b.customer_id into customer from public.estimate_versions b where b.organization_id=p_org and b.id=j.baseline_version_id;
 insert into private.supplemental_invoice_drafts(organization_id,decision_id,change_id,customer_id,currency,selling_minor,description,presentation) values(p_org,r,change,customer,j.baseline->>'currency',sell,p->>'description',p->>'presentation');end if;
 update public.jobs set lock_revision=lock_revision+1 where organization_id=p_org and id=j.id;
 else
 if p_action='create_visit' then select * into plan from private.inspection_plans where organization_id=p_org and id=p_id for update;
 else select * into v from private.inspection_visits where organization_id=p_org and id=p_id for update;select * into plan from private.inspection_plans where organization_id=p_org and id=v.plan_id for share;end if;
 if plan.job_id is not null then perform 1 from public.job_assignments where organization_id=p_org and job_id=plan.job_id and user_id=auth.uid() for share;end if;
 perform private.property_session_guard();
 if plan.id is null or not(private.can(p_org,'estimates') or (plan.job_id is not null and private.job_member(p_org,plan.job_id))) then raise exception 'Visit access denied' using errcode='42501';end if;
 if p_action='create_visit' then
 perform private.est_object(p,array['visited_on','phase']);
 insert into private.inspection_visits(organization_id,plan_id,visited_on,phase,content) values(p_org,plan.id,(p->>'visited_on')::date,p->>'phase',jsonb_build_object('summary',plan.name,'internal_notes','','checklist',plan.checklist,'findings','[]'::jsonb)) returning id into r;
 else
 if v.id is null or v.lock_revision is distinct from p_lock then raise exception 'Visit changed';end if;
 if p_action='save_visit' then if v.status<>'draft' then raise exception 'Visit locked';end if;perform private.validate_inspection(p);update private.inspection_visits set content=p,lock_revision=lock_revision+1 where organization_id=p_org and id=v.id;r:=v.id;
 elsif p_action='submit_visit' then perform private.est_object(p,'{}');if v.status<>'draft' then raise exception 'Visit locked';end if;perform private.validate_inspection(v.content);update private.inspection_visits set status='submitted',lock_revision=lock_revision+1 where organization_id=p_org and id=v.id;r:=v.id;
 elsif p_action='publish_visit' then
 perform private.est_object(p,'{}');if not private.has_role(p_org,array['owner','admin']::public.staff_role[]) or v.status<>'submitted' then raise exception 'Submitted management review required';end if;
 if exists(select 1 from jsonb_array_elements(v.content->'checklist') x where x->'required'='true'::jsonb and x->'completed'<>'true'::jsonb) then raise exception 'Required checklist incomplete';end if;
 select coalesce(max(rp.version),0)+1 into rev from private.inspection_reports rp where rp.organization_id=p_org and rp.visit_id=v.id;
 snapshot:=private.property_report_snapshot(v.content,v.visited_on,v.phase);
 insert into private.inspection_reports(organization_id,visit_id,customer_id,location_id,version,snapshot) values(p_org,v.id,plan.customer_id,plan.location_id,rev,snapshot) returning id into r;
 update private.inspection_visits set status='published',lock_revision=lock_revision+1 where organization_id=p_org and id=v.id;
 elsif p_action='revise_visit' then perform private.est_object(p,'{}');if v.status<>'published' or not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Published management revision required';end if;update private.inspection_visits set status='draft',lock_revision=lock_revision+1 where organization_id=p_org and id=v.id;r:=v.id;
 else raise exception 'Unsupported property action';end if;end if;end if;
 perform private.property_guard(p_org);
 if p_action in ('create_plan','update_plan','quote_snapshot','unbilled_review') and not private.can(p_org,'estimates') then raise exception 'Estimating revoked';end if;
 return jsonb_build_object('id',r);
end $$;
revoke all on function private.property_command(uuid,text,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.property_command(uuid,text,uuid,integer,jsonb) to authenticated;
create function private.property_portal(p_org uuid,p_customer uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare financial jsonb;result jsonb;begin
 perform private.property_session_guard();
 perform 1 from private.property_features where organization_id=p_org and enabled for share;if not found then raise exception 'Portal disabled';end if;
 perform private.release_lock_actor(p_org);
 if not private.release_customer(p_org,p_customer) then raise exception 'Customer denied' using errcode='42501';end if;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=p_customer and user_id=auth.uid() and active for share;if not found then raise exception 'Customer mapping revoked';end if;
 financial:=private.release_workspace(p_org);
 result:=jsonb_build_object('reports',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'location_id',location_id,'version',version,'published_at',published_at,'snapshot',snapshot) order by published_at),'[]') from (select * from private.inspection_reports where organization_id=p_org and customer_id=p_customer order by published_at desc limit 200) recent),
 'estimates',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(financial->'release_offers') x where x->>'customer_id'=p_customer::text),
 'contracts',(select coalesce(jsonb_agg(jsonb_build_object('id',x->'id','document',x->'document','document_hash',x->'document_hash')),'[]') from jsonb_array_elements(financial->'release_contracts') x where x->>'customer_id'=p_customer::text),
 'approved_changes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,'selling_minor',c.revenue_minor)),'[]') from (select c.id,c.description,c.revenue_minor from public.job_change_orders c join public.job_change_approvals a on a.organization_id=c.organization_id and a.change_id=c.id join public.jobs j on j.organization_id=c.organization_id and j.id=c.job_id join public.estimate_versions b on b.organization_id=j.organization_id and b.id=j.baseline_version_id where c.organization_id=p_org and b.customer_id=p_customer order by c.created_at desc,c.id limit 200) c),
 'internal_test',true,'mode','internal-development',
 'invoices',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(financial->'release_invoices') x where x->>'customer_id'=p_customer::text),'media','[]'::jsonb);
 perform private.property_session_guard();
 if not exists(select 1 from private.release_test_users where organization_id=p_org and user_id=auth.uid() and actor='customer' and expires_at>clock_timestamp()) or not private.release_customer(p_org,p_customer) then raise exception 'Portal lease expired or revoked';end if;
 return result;
end $$;
revoke all on function private.property_portal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.property_portal(uuid,uuid) to authenticated;
create function private.property_workspace(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; management boolean;begin
 perform private.property_guard(p_org);management:=private.can(p_org,'estimates');
 perform 1 from public.job_assignments where organization_id=p_org and user_id=auth.uid() for share;
 result:=jsonb_build_object('plans',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from private.inspection_plans p where p.organization_id=p_org and (management or private.job_member(p_org,p.job_id)) order by p.starts_on desc,p.id limit 200) x),
 'visits',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select v.* from private.inspection_visits v join private.inspection_plans p on p.organization_id=v.organization_id and p.id=v.plan_id where v.organization_id=p_org and (management or private.job_member(p_org,p.job_id)) order by v.visited_on desc,v.id limit 200) x));
 if management then
 result:=result||jsonb_build_object('reports',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from private.inspection_reports where organization_id=p_org order by published_at desc,id limit 200) x),'comparisons',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from private.supplier_comparisons where organization_id=p_org order by created_at desc,id limit 200) x));end if;
 if private.has_role(p_org,array['owner','admin']::public.staff_role[]) then
 result:=result||jsonb_build_object('material_reviews',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from private.unbilled_decisions where organization_id=p_org order by created_at desc,id limit 200) x),'supplemental_drafts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from private.supplemental_invoice_drafts where organization_id=p_org order by id limit 200) x));end if;
 perform private.property_guard(p_org);return result;
end $$;
revoke all on function private.property_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function private.property_workspace(uuid) to authenticated;
commit;
