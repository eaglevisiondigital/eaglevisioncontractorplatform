begin;
create table public.jobs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(trim(name)) between 1 and 200),
 estimate_id uuid not null,baseline_version_id uuid not null,baseline jsonb not null,projection jsonb not null,lock_revision integer not null default 1,
 approved_by uuid not null default auth.uid(),created_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,baseline_version_id),unique(organization_id,estimate_id),
 foreign key(organization_id,estimate_id) references public.estimates(organization_id,id),
 foreign key(organization_id,estimate_id,baseline_version_id) references public.estimate_versions(organization_id,estimate_id,id)
);
alter table public.material_import_batches add constraint import_job foreign key(organization_id,job_id) references public.jobs(organization_id,id);
alter table public.material_import_sources add constraint source_job foreign key(organization_id,job_id) references public.jobs(organization_id,id);
create unique index purchase_source_digest on public.material_import_sources(organization_id,job_id,sha256) where job_id is not null;
alter table public.material_import_approvals add constraint approval_job foreign key(organization_id,job_id) references public.jobs(organization_id,id);
create table public.job_assignments(
 organization_id uuid not null,job_id uuid not null,user_id uuid not null,active boolean not null default true,
 primary key(organization_id,job_id,user_id),foreign key(organization_id,job_id) references public.jobs(organization_id,id),
 foreign key(organization_id,user_id) references public.memberships(organization_id,user_id)
);
create index job_assignment_member on public.job_assignments(organization_id,user_id);
create table public.job_expenses(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,job_id uuid not null,submitted_by uuid not null default auth.uid(),submitted_at timestamptz not null default now(),
 purchase_key text not null check(length(trim(purchase_key)) between 1 and 160),supplier text not null check(length(trim(supplier)) between 1 and 200),reference text not null check(length(trim(reference)) between 1 and 200),
 category text not null check(category in ('materials','labor','subcontractors','equipment','other')),kind text not null check(kind in ('commitment','payment','credit')),
 amount_minor bigint not null check(amount_minor between 1 and 9000000000000),description text not null check(length(trim(description)) between 1 and 500),
 labor_worker_id uuid,estimate_line_id uuid,quantity_milli bigint check(quantity_milli between 1 and 1000000000),unit text,unit_cost_minor bigint check(unit_cost_minor between 0 and 1000000000),
 material_import_line_ids uuid[] not null default '{}',document_ids uuid[] not null default '{}',material_approval_id uuid,adjusts_expense_id uuid,
 unique(organization_id,id),foreign key(organization_id,job_id) references public.jobs(organization_id,id),
 foreign key(organization_id,material_approval_id) references public.material_import_approvals(organization_id,id),
 foreign key(organization_id,adjusts_expense_id) references public.job_expenses(organization_id,id)
);
create unique index expense_document_unique on public.job_expenses(organization_id,job_id,lower(trim(supplier)),lower(trim(reference)));
create index expense_job on public.job_expenses(organization_id,job_id,submitted_at,id);
create index expense_approval on public.job_expenses(organization_id,material_approval_id);
create index expense_adjusts on public.job_expenses(organization_id,adjusts_expense_id);
create table public.job_expense_reviews(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,job_id uuid not null,submission_id uuid not null,
 decision text not null check(decision in ('approved','rejected')),reason text not null check(length(trim(reason)) between 1 and 1000),reviewed_by uuid not null default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,submission_id),foreign key(organization_id,job_id) references public.jobs(organization_id,id),foreign key(organization_id,submission_id) references public.job_expenses(organization_id,id)
);
create index expense_review_job on public.job_expense_reviews(organization_id,job_id);
create table public.job_change_orders(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,job_id uuid not null,description text not null check(length(trim(description)) between 1 and 1000),
 revenue_minor bigint not null check(revenue_minor between 0 and 9000000000000),cost_minor bigint not null check(cost_minor between 0 and 9000000000000),category text not null check(category in ('materials','labor','subcontractors','equipment','other')),
 status text not null check(status in ('internal','proposed')),created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,job_id) references public.jobs(organization_id,id),check(status<>'internal' or revenue_minor=0)
);
create index change_job on public.job_change_orders(organization_id,job_id);
create table public.job_change_approvals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,change_id uuid not null,
 authorization_reference text not null check(length(trim(authorization_reference)) between 1 and 1000),approved_by uuid not null default auth.uid(),approved_at timestamptz not null default now(),
 unique(organization_id,change_id),foreign key(organization_id,change_id) references public.job_change_orders(organization_id,id)
);
create table public.job_expense_material_lines(organization_id uuid not null,approval_id uuid not null,line_id uuid not null,expense_id uuid not null,primary key(organization_id,approval_id,line_id),foreign key(organization_id,approval_id) references public.material_import_approvals(organization_id,id),foreign key(organization_id,expense_id) references public.job_expenses(organization_id,id));
create index expense_material_record on public.job_expense_material_lines(organization_id,expense_id);
alter table public.job_expense_material_lines enable row level security;revoke all on public.job_expense_material_lines from public,anon,authenticated;grant select on public.job_expense_material_lines to authenticated;create policy material_expense_read on public.job_expense_material_lines for select to authenticated using(private.can(organization_id,'estimates'));
create trigger immutable_mapping before update or delete on public.job_expense_material_lines for each row execute function private.reject_audit_mutation();
create function private.job_member(org uuid,job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org) and exists(select 1 from public.company_modules where organization_id=org and module='estimates' and enabled)
 and (private.can(org,'estimates') or exists(select 1 from public.job_assignments where organization_id=org and job_id=job and user_id=auth.uid() and active))
$$;
revoke all on function private.job_member(uuid,uuid) from public,anon;grant execute on function private.job_member(uuid,uuid) to authenticated;
create function private.protect_job_baseline() returns trigger language plpgsql set search_path='' as $$begin
 if new.organization_id<>old.organization_id or new.baseline is distinct from old.baseline or new.estimate_id<>old.estimate_id or new.baseline_version_id<>old.baseline_version_id or new.approved_by<>old.approved_by then raise exception 'Job baseline is immutable';end if;return new;end$$;
revoke all on function private.protect_job_baseline() from public,anon,authenticated;
create trigger immutable_baseline before update on public.jobs for each row execute function private.protect_job_baseline();
do $$declare t text;begin foreach t in array array['jobs','job_assignments','job_expenses','job_expense_reviews','job_change_orders','job_change_approvals'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 if t='job_expenses' then execute 'create policy job_read on public.job_expenses for select to authenticated using(private.can(organization_id,''estimates'') or (submitted_by=auth.uid() and private.job_member(organization_id,job_id)))';
 elsif t='job_assignments' then execute 'create policy job_read on public.job_assignments for select to authenticated using(private.can(organization_id,''estimates'') or (user_id=auth.uid() and private.has_role(organization_id)))';
 else execute format('create policy job_read on public.%I for select to authenticated using(private.can(organization_id,''estimates''))',t);end if;
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 if t not in ('jobs','job_assignments') then execute format('create trigger immutable_record before update or delete on public.%I for each row execute function private.reject_audit_mutation()',t);end if;
 end loop;end$$;
create function private.approve_job(p_org uuid,p_version uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare v public.estimate_versions;line jsonb;c jsonb;category text;costs jsonb:='{"materials":0,"labor":0,"subcontractors":0,"equipment":0,"other":0}';result uuid;begin
 if not private.can(p_org,'estimates') or not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Job approval denied' using errcode='42501';end if;
 select * into v from public.estimate_versions where organization_id=p_org and id=p_version and status='issued';if v.id is null then raise exception 'Immutable issued estimate required';end if;
 -- Internal management approval only; does not represent customer acceptance or create a charge.
 for line in select * from jsonb_array_elements(v.payload->'lines') loop
 select x into c from jsonb_array_elements(v.calculation->'lines') x where x->>'id'=line->>'id';if c->'included'<>'true'::jsonb then continue;end if;
 category:=case when line->>'kind'='labor' then 'labor' when line->>'kind' in ('material','product','allowance') then 'materials' else 'other' end;
 costs:=jsonb_set(costs,array[category],to_jsonb((costs->>category)::numeric+(c->>'cost_minor')::numeric));end loop;
 insert into public.jobs(organization_id,estimate_id,name,baseline_version_id,baseline,projection) values(p_org,v.estimate_id,v.payload->'project'->>'name',v.id,
 jsonb_build_object('issued_version_id',v.id,'revenue_minor',v.calculation->'net_minor','costs',costs,'lines',(select jsonb_agg(l) from jsonb_array_elements(v.payload->'lines') l where exists(select 1 from jsonb_array_elements(v.calculation->'lines') x where x->>'id'=l->>'id' and x->'included'='true'::jsonb)),'currency',v.payload->>'currency'),
 jsonb_build_object('remaining',costs,'overrun_bps',1000,'erosion_bps',500,'costs_complete',false)) returning id into result;return result;end$$;
create function public.approve_job(p_org uuid,p_version uuid) returns uuid language sql security invoker set search_path='' as $$select private.approve_job(p_org,p_version)$$;
create function private.submit_job_expense(p_org uuid,p_job uuid,p_expense jsonb) returns uuid language plpgsql security definer set search_path='' as $$
 declare id uuid;doc uuid;j public.jobs;matched jsonb;approval public.material_import_approvals;begin
 if not private.job_member(p_org,p_job) then raise exception 'Job submission denied' using errcode='42501';end if;
 select * into j from public.jobs where organization_id=p_org and jobs.id=p_job for update;if j.id is null then raise exception 'Job unavailable';end if;
 perform private.est_object(p_expense,array['purchase_key','supplier','reference','category','kind','amount_minor','description','estimate_line_id','quantity_milli','unit','unit_cost_minor','document_ids','material_approval_id','adjusts_expense_id','labor_worker_id','material_import_line_ids']);
 if p_expense->>'category'='labor' then raise exception 'Labor must use the approved workforce ledger';end if;
 if p_expense->>'category'='subcontractors' and not exists(select 1 from public.worker_profiles where organization_id=p_org and worker_profiles.id=(p_expense->>'labor_worker_id')::uuid and cost_source='invoice' and active) then raise exception 'Subcontractor invoices require an invoice-costed worker';end if;
 if p_expense->>'labor_worker_id' is not null and p_expense->>'category'<>'subcontractors' then raise exception 'Worker invoices must use subcontractor category';end if;
 if p_expense->>'estimate_line_id' is not null and not exists(select 1 from jsonb_array_elements(j.baseline->'lines') x where x->>'id'=p_expense->>'estimate_line_id') then raise exception 'Budget line unavailable';end if;
 if jsonb_typeof(p_expense->'document_ids')<>'array' or jsonb_array_length(p_expense->'document_ids')>10 then raise exception 'Attachment limit';end if;
 for doc in select value::text::uuid from jsonb_array_elements_text(p_expense->'document_ids') loop
 if not exists(select 1 from public.documents where organization_id=p_org and documents.id=doc and scan_status='clean') then raise exception 'Clean receipt unavailable';end if;end loop;
 if p_expense->>'material_approval_id' is not null then
 select * into approval from public.material_import_approvals where organization_id=p_org and material_import_approvals.id=(p_expense->>'material_approval_id')::uuid;
 if approval.id is null or approval.job_id is distinct from p_job then raise exception 'Reviewed material approval unavailable';end if;
 if jsonb_typeof(p_expense->'material_import_line_ids') is distinct from 'array' or jsonb_array_length(p_expense->'material_import_line_ids')<>1 then raise exception 'Select one approved material source row per expense';end if;
 select x into matched from jsonb_array_elements(approval.review_snapshot->'lines') x where x->>'id'=p_expense->'material_import_line_ids'->>0 and x->'selected'='true'::jsonb;
 if matched is null or p_expense->>'supplier' is distinct from matched->>'vendor' or (p_expense->>'amount_minor')::numeric<>round((matched->>'quantity_milli')::numeric*(matched->>'unit_cost_minor')::numeric/1000) then raise exception 'Purchase must match approved supplier and cost';end if;
 if exists(select 1 from public.job_expense_material_lines where organization_id=p_org and approval_id=approval.id and line_id=(matched->>'id')::uuid) then raise exception 'Material source row already recorded';end if;end if;
 if p_expense->>'kind'='credit' and not exists(select 1 from public.job_expenses e join public.job_expense_reviews r on r.organization_id=e.organization_id and r.submission_id=e.id and r.decision='approved' where e.organization_id=p_org and e.job_id=p_job and e.id=(p_expense->>'adjusts_expense_id')::uuid and e.kind='payment' and lower(trim(e.purchase_key))=lower(trim(p_expense->>'purchase_key')) and lower(trim(e.supplier))=lower(trim(p_expense->>'supplier'))) then raise exception 'Credit requires its approved purchase';end if;
 insert into public.job_expenses(organization_id,job_id,purchase_key,supplier,reference,category,kind,amount_minor,description,estimate_line_id,quantity_milli,unit,unit_cost_minor,document_ids,material_approval_id,adjusts_expense_id,labor_worker_id,material_import_line_ids)
 values(p_org,p_job,lower(trim(private.est_text(p_expense->'purchase_key',1,160))),private.est_text(p_expense->'supplier',1,200),private.est_text(p_expense->'reference',1,200),p_expense->>'category',p_expense->>'kind',private.est_int(p_expense->'amount_minor',1,9000000000000),private.est_text(p_expense->'description',1,500),(p_expense->>'estimate_line_id')::uuid,(p_expense->>'quantity_milli')::bigint,p_expense->>'unit',(p_expense->>'unit_cost_minor')::bigint,array(select jsonb_array_elements_text(p_expense->'document_ids'))::uuid[],(p_expense->>'material_approval_id')::uuid,(p_expense->>'adjusts_expense_id')::uuid,(p_expense->>'labor_worker_id')::uuid,array(select jsonb_array_elements_text(coalesce(p_expense->'material_import_line_ids','[]')))::uuid[]) returning job_expenses.id into id;
 if approval.id is not null then insert into public.job_expense_material_lines(organization_id,approval_id,line_id,expense_id) values(p_org,approval.id,(matched->>'id')::uuid,id);end if;
 return id;end$$;
create function public.submit_job_expense(p_org uuid,p_job uuid,p_expense jsonb) returns uuid language sql security invoker set search_path='' as $$select private.submit_job_expense(p_org,p_job,p_expense)$$;
create function private.review_job_expense(p_org uuid,p_job uuid,p_expense uuid,p_decision text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare e public.job_expenses;paid numeric;committed numeric;id uuid;begin
 if not private.can(p_org,'estimates') or not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Expense review denied' using errcode='42501';end if;
 perform 1 from public.jobs where organization_id=p_org and jobs.id=p_job for update;
 select * into e from public.job_expenses where organization_id=p_org and job_id=p_job and job_expenses.id=p_expense;if e.id is null then raise exception 'Expense unavailable';end if;
 if p_decision='approved' then
 if exists(select 1 from public.job_expenses x join public.job_expense_reviews r on r.organization_id=x.organization_id and r.submission_id=x.id and r.decision='approved' where x.organization_id=p_org and x.job_id=p_job and lower(trim(x.supplier))=lower(trim(e.supplier)) and x.purchase_key=e.purchase_key and x.category<>e.category) then raise exception 'Purchase category conflict';end if;
 if e.kind='credit' then select coalesce(sum(case when x.kind='payment' then x.amount_minor when x.kind='credit' then -x.amount_minor else 0 end),0) into paid from public.job_expenses x join public.job_expense_reviews r on r.organization_id=x.organization_id and r.submission_id=x.id and r.decision='approved' where x.organization_id=p_org and x.job_id=p_job and lower(trim(x.supplier))=lower(trim(e.supplier)) and x.purchase_key=e.purchase_key;
 if e.amount_minor>paid then raise exception 'Credit exceeds paid purchase';end if;end if;end if;
 insert into public.job_expense_reviews(organization_id,job_id,submission_id,decision,reason) values(p_org,p_job,e.id,p_decision,private.est_text(to_jsonb(p_reason),1,1000)) returning job_expense_reviews.id into id;
 update public.jobs set lock_revision=lock_revision+1 where organization_id=p_org and jobs.id=p_job;return id;end$$;
create function public.review_job_expense(p_org uuid,p_job uuid,p_expense uuid,p_decision text,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.review_job_expense(p_org,p_job,p_expense,p_decision,p_reason)$$;
create function private.update_job_projection(p_org uuid,p_job uuid,p_lock integer,p_projection jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare key text;begin
 if not private.can(p_org,'estimates') then raise exception 'Job management denied' using errcode='42501';end if;
 perform private.est_object(p_projection,array['remaining','overrun_bps','erosion_bps','costs_complete']);perform private.est_object(p_projection->'remaining',array['materials','labor','subcontractors','equipment','other']);
 foreach key in array array['materials','labor','subcontractors','equipment','other'] loop perform private.est_int(p_projection->'remaining'->key,0,9000000000000);end loop;
 perform private.est_int(p_projection->'overrun_bps',0,100000);perform private.est_int(p_projection->'erosion_bps',0,10000);if jsonb_typeof(p_projection->'costs_complete')<>'boolean' then raise exception 'Invalid completion flag';end if;
 update public.jobs set projection=p_projection,lock_revision=lock_revision+1 where organization_id=p_org and jobs.id=p_job and lock_revision=p_lock;if not found then raise exception 'Job changed; reload';end if;end$$;
create function public.update_job_projection(p_org uuid,p_job uuid,p_lock integer,p_projection jsonb) returns void language sql security invoker set search_path='' as $$select private.update_job_projection(p_org,p_job,p_lock,p_projection)$$;
create function private.propose_job_change(p_org uuid,p_job uuid,p_change jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare id uuid;begin
 if not private.can(p_org,'estimates') then raise exception 'Change proposal denied' using errcode='42501';end if;
 perform 1 from public.jobs where organization_id=p_org and jobs.id=p_job for update;if not found then raise exception 'Job unavailable';end if;
 perform private.est_object(p_change,array['description','revenue_minor','cost_minor','category','status']);
 insert into public.job_change_orders(organization_id,job_id,description,revenue_minor,cost_minor,category,status) values(p_org,p_job,private.est_text(p_change->'description',1,1000),private.est_int(p_change->'revenue_minor',0,9000000000000),private.est_int(p_change->'cost_minor',0,9000000000000),p_change->>'category',p_change->>'status') returning job_change_orders.id into id;return id;end$$;
create function public.propose_job_change(p_org uuid,p_job uuid,p_change jsonb) returns uuid language sql security invoker set search_path='' as $$select private.propose_job_change(p_org,p_job,p_change)$$;
create function private.approve_job_change(p_org uuid,p_change uuid,p_authorization text) returns void language plpgsql security definer set search_path='' as $$declare c public.job_change_orders;begin
 if not private.can(p_org,'estimates') or not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Customer billing approval denied' using errcode='42501';end if;
 select * into c from public.job_change_orders where organization_id=p_org and id=p_change and status='proposed';if c.id is null then raise exception 'Proposed change unavailable';end if;
 perform 1 from public.jobs where organization_id=p_org and id=c.job_id for update;
 insert into public.job_change_approvals(organization_id,change_id,authorization_reference) values(p_org,p_change,private.est_text(to_jsonb(p_authorization),1,1000));
 update public.jobs set projection=jsonb_set(projection,array['remaining',c.category],to_jsonb(private.est_money((projection->'remaining'->>c.category)::numeric+c.cost_minor))),lock_revision=lock_revision+1 where organization_id=p_org and id=c.job_id;end$$;
create function public.approve_job_change(p_org uuid,p_change uuid,p_authorization text) returns void language sql security invoker set search_path='' as $$select private.approve_job_change(p_org,p_change,p_authorization)$$;
create function private.assign_job(p_org uuid,p_job uuid,p_user uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.can(p_org,'estimates') or not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Assignment denied' using errcode='42501';end if;
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_user and active) then raise exception 'Active worker membership required';end if;
 insert into public.job_assignments(organization_id,job_id,user_id,active) values(p_org,p_job,p_user,p_active) on conflict(organization_id,job_id,user_id) do update set active=excluded.active;end$$;
create function public.assign_job(p_org uuid,p_job uuid,p_user uuid,p_active boolean) returns void language sql security invoker set search_path='' as $$select private.assign_job(p_org,p_job,p_user,p_active)$$;
create function private.begin_job_material_import(p_org uuid,p_job uuid,p_files jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare j public.jobs;estimate uuid;batch uuid;f jsonb;begin
 if not private.job_member(p_org,p_job) then raise exception 'Job import denied' using errcode='42501';end if;
 select * into j from public.jobs where organization_id=p_org and id=p_job for update;if j.id is null then raise exception 'Job unavailable';end if;
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) not between 1 and 10 then raise exception 'Select 1 to 10 files';end if;
 select estimate_id into estimate from public.estimate_versions where organization_id=p_org and id=j.baseline_version_id;
 insert into public.material_import_batches(organization_id,estimate_id,job_id,purpose) values(p_org,estimate,p_job,'purchase') returning id into batch;
 for f in select * from jsonb_array_elements(p_files) loop perform private.est_object(f,array['filename','mime','byte_size','sha256']);
 insert into public.material_import_sources(organization_id,batch_id,job_id,filename,mime,byte_size,sha256) values(p_org,batch,p_job,private.est_text(f->'filename',1,200),f->>'mime',private.est_int(f->'byte_size',8,3145728),f->>'sha256');end loop;
 return jsonb_build_object('batch_id',batch);end$$;
create function public.begin_job_material_import(p_org uuid,p_job uuid,p_files jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.begin_job_material_import(p_org,p_job,p_files)$$;
create function private.record_reviewed_purchase(p_org uuid,p_job uuid,p_batch uuid,p_lock integer,p_review jsonb,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare approval jsonb;r jsonb;source public.material_import_sources;expense uuid;result jsonb:='[]';begin
 if not private.can(p_org,'estimates') then raise exception 'Purchase review denied' using errcode='42501';end if;
 if p_kind not in ('commitment','payment') or not exists(select 1 from public.material_import_batches where organization_id=p_org and id=p_batch and job_id=p_job and purpose='purchase') then raise exception 'Purchase batch unavailable';end if;
 approval:=private.approve_material_import(p_org,p_batch,p_lock,p_review);
 for r in select * from jsonb_array_elements(p_review->'lines') where value->'selected'='true'::jsonb loop
 select * into source from public.material_import_sources where organization_id=p_org and batch_id=p_batch and id=(r->>'source_id')::uuid;
 expense:=private.submit_job_expense(p_org,p_job,jsonb_build_object('purchase_key',source.sha256,'supplier',r->>'vendor','reference',source.sha256||':'||(r->'original'->>'id'),'category','materials','kind',p_kind,'amount_minor',round((r->>'quantity_milli')::numeric*(r->>'unit_cost_minor')::numeric/1000),'description',r->>'description','estimate_line_id',r->'estimate_line_id','quantity_milli',r->'quantity_milli','unit',r->>'unit','unit_cost_minor',r->'unit_cost_minor','document_ids','[]'::jsonb,'material_approval_id',approval->>'approval_id','material_import_line_ids',jsonb_build_array(r->>'id'),'adjusts_expense_id',null,'labor_worker_id',null));result:=result||jsonb_build_array(expense);end loop;return result;end$$;
create function public.record_reviewed_purchase(p_org uuid,p_job uuid,p_batch uuid,p_lock integer,p_review jsonb,p_kind text) returns jsonb language sql security invoker set search_path='' as $$select private.record_reviewed_purchase(p_org,p_job,p_batch,p_lock,p_review,p_kind)$$;
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('record_reviewed_purchase','begin_job_material_import','approve_job','submit_job_expense','review_job_expense','update_job_projection','propose_job_change','approve_job_change','assign_job') loop
 execute format('revoke all on function %s from public,anon',f.sig);execute format('grant execute on function %s to authenticated',f.sig);end loop;end$$;
commit;
