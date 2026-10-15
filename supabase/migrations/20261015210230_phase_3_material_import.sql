-- Private source workflow. No browser uploads or production scanner bypass.
begin;
create table public.material_import_preferences(
 organization_id uuid primary key references public.organizations(id),mode text not null default 'pass_through' check(mode in ('pass_through','percent','fixed')),
 value bigint not null default 0 check(value between 0 and 9000000000000),check((mode<>'percent' or value<=100000) and (mode<>'pass_through' or value=0))
);
create table public.material_import_batches(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),estimate_id uuid not null,
 job_id uuid,purpose text not null default 'estimate' check(purpose in ('estimate','purchase')),status text not null default 'review' check(status in ('review','approved')),lock_revision integer not null default 1,
 created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,estimate_id) references public.estimates(organization_id,id)
);
create index import_batch_estimate on public.material_import_batches(organization_id,estimate_id);
create table public.material_import_sources(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,batch_id uuid not null,
 job_id uuid,filename text not null check(length(trim(filename)) between 1 and 200),mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp','text/csv')),
 byte_size integer not null check(byte_size between 8 and 3145728),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 status text not null default 'quarantined' check(status in ('quarantined','clean','rejected','failed')),
 provenance text not null default 'live' check(provenance in ('live','synthetic_fixture')),scan_evidence jsonb,extraction jsonb,provider_metadata jsonb,
 created_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,batch_id,sha256),
 foreign key(organization_id,batch_id) references public.material_import_batches(organization_id,id),
 check(status<>'clean' or (scan_evidence is not null and (scan_evidence->>'verdict') is not distinct from 'clean' and (scan_evidence->>'sha256') is not distinct from sha256))
);
create index import_source_batch on public.material_import_sources(organization_id,batch_id);
create table public.material_import_approvals(
 id uuid primary key,organization_id uuid not null,batch_id uuid not null,estimate_id uuid not null,
 job_id uuid,approved_by uuid not null default auth.uid(),approved_at timestamptz not null default now(),review_snapshot jsonb not null,source_snapshots jsonb not null,
 estimate_lines jsonb not null,cost_minor bigint not null,price_minor bigint not null,currency text not null,
 unique(organization_id,id),unique(organization_id,batch_id),
 foreign key(organization_id,batch_id) references public.material_import_batches(organization_id,id),
 foreign key(organization_id,estimate_id) references public.estimates(organization_id,id)
);
create index approval_estimate on public.material_import_approvals(organization_id,estimate_id);
create trigger immutable_approval before update or delete on public.material_import_approvals for each row execute function private.reject_audit_mutation();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('material-quarantine','material-quarantine',false,3145728,array['application/pdf','image/jpeg','image/png','image/webp','text/csv']),
 ('material-clean','material-clean',false,3145728,array['application/pdf','image/jpeg','image/png','image/webp','text/csv']);
-- There are no client insert/update/delete policies and no quarantine read policy.
create policy material_clean_read on storage.objects for select to authenticated using(bucket_id='material-clean' and exists(
 select 1 from public.material_import_sources s where name=s.organization_id::text||'/'||s.id::text and s.status='clean' and private.can(s.organization_id,'estimates')));
do $$ declare t text;begin foreach t in array array['material_import_preferences','material_import_batches','material_import_sources','material_import_approvals'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 execute format('create policy estimating_read on public.%I for select to authenticated using(private.can(organization_id,''estimates''))',t);
 execute format('create trigger tenant_immutable before update on public.%I for each row execute function private.prevent_tenant_move()',t);
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 end loop;end $$;
grant insert(organization_id,mode,value),update(mode,value) on public.material_import_preferences to authenticated;
create policy preference_insert on public.material_import_preferences for insert to authenticated with check(private.can(organization_id,'estimates') and private.has_role(organization_id,array['owner','admin']::public.staff_role[]));
create policy preference_update on public.material_import_preferences for update to authenticated using(private.can(organization_id,'estimates') and private.has_role(organization_id,array['owner','admin']::public.staff_role[])) with check(private.can(organization_id,'estimates') and private.has_role(organization_id,array['owner','admin']::public.staff_role[]));
create function private.begin_material_import(p_org uuid,p_estimate uuid,p_files jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare batch uuid;f jsonb;source uuid;begin
 if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
 perform 1 from public.estimates where organization_id=p_org and id=p_estimate and status='draft' for update;if not found then raise exception 'Current draft unavailable';end if;
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 10 then raise exception 'Select 1 to 10 sources';end if;
 if (select count(*) from public.material_import_batches where organization_id=p_org and status='review')>=20 then raise exception 'Resolve pending imports before adding more';end if;
 insert into public.material_import_batches(organization_id,estimate_id) values(p_org,p_estimate) returning id into batch;
 for f in select * from jsonb_array_elements(p_files) loop
 perform private.est_object(f,array['filename','mime','byte_size','sha256']);
 insert into public.material_import_sources(organization_id,batch_id,filename,mime,byte_size,sha256) values(p_org,batch,private.est_text(f->'filename',1,200),f->>'mime',private.est_int(f->'byte_size',8,3145728),f->>'sha256') returning id into source;
 end loop;
 return jsonb_build_object('batch_id',batch,'sources',(select jsonb_agg(to_jsonb(s)) from public.material_import_sources s where organization_id=p_org and batch_id=batch));end
$$;
create function public.begin_material_import(p_org uuid,p_estimate uuid,p_files jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.begin_material_import(p_org,p_estimate,p_files) $$;
create function private.material_markup(cost numeric,pricing jsonb) returns numeric language plpgsql immutable set search_path='' as $$
 declare mode text;value numeric;begin
 perform private.est_object(pricing,array['mode','value']);mode:=pricing->>'mode';value:=private.est_int(pricing->'value',0,9000000000000);
 if mode='pass_through' and value=0 then return 0;elsif mode='percent' and value<=100000 then return round(cost*value/10000);elsif mode='fixed' then return value;else raise exception 'Invalid material pricing';end if;end
$$;
create function private.approve_material_import(p_org uuid,p_batch uuid,p_lock integer,p_review jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare b public.material_import_batches;s public.material_import_sources;r jsonb;original jsonb;pricing jsonb;qty numeric;unitcost numeric;cost numeric;markup numeric;totalcost numeric:=0;totalprice numeric:=0;
 approval uuid:=gen_random_uuid();lines jsonb:='[]';ids jsonb:='[]';seen uuid[]:='{}';lineid uuid;canonical jsonb;currency text;source_snapshots jsonb;begin
 if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
 select * into b from public.material_import_batches where organization_id=p_org and id=p_batch for update;
 if b.id is null or b.status<>'review' or b.lock_revision is distinct from p_lock then raise exception 'Import changed or already approved';end if;
 if b.purpose='estimate' then perform 1 from public.estimates where organization_id=p_org and id=b.estimate_id and status='draft' for update;if not found then raise exception 'Draft unavailable';end if;else perform 1 from public.jobs where organization_id=p_org and id=b.job_id for update;if not found then raise exception 'Purchase job unavailable';end if;end if;
 if p_review is null or octet_length(p_review::text)>2097152 then raise exception 'Material review payload exceeds limit';end if;
 if p_review->'reviewed' is distinct from 'true'::jsonb then raise exception 'Explicit review required';end if;
 select e.currency into currency from public.estimates e where e.organization_id=p_org and e.id=b.estimate_id;
 if p_review->>'currency' is distinct from currency or coalesce(p_review->>'presentation','') not in ('itemized','package') then raise exception 'Currency or presentation invalid';end if;
 if jsonb_typeof(p_review->'lines')<>'array' or jsonb_array_length(p_review->'lines') not between 1 and 200 then raise exception 'Material line limit';end if;
 -- Caller-supplied sources, raw values, confidence and warnings are never trusted as source evidence.
 if not exists(select 1 from public.material_import_sources where organization_id=p_org and batch_id=b.id) or exists(select 1 from public.material_import_sources where organization_id=p_org and batch_id=b.id and (status<>'clean' or extraction is null)) then raise exception 'Sources await clean scan and extraction';end if;
 for r in select * from jsonb_array_elements(p_review->'lines') loop
 if r->'selected' is distinct from 'true'::jsonb then continue;end if;
 if r->'acknowledged' is distinct from 'true'::jsonb then raise exception 'Every selected line requires review acknowledgement';end if;
 lineid:=private.est_id(r->'id');if lineid=any(seen) then raise exception 'Duplicate reviewed line';end if;seen:=array_append(seen,lineid);
 select * into s from public.material_import_sources where organization_id=p_org and batch_id=b.id and id=private.est_id(r->'source_id') and status='clean';
 if s.id is null or s.extraction->>'currency' is distinct from currency then raise exception 'Source or currency unavailable';end if;
 select x into original from jsonb_array_elements(s.extraction->'lines') x where x->>'id'=r->'original'->>'id';if original is null then raise exception 'Original extracted row unavailable';end if;
 -- Avoid selecting the same source row twice under new client IDs.
 if exists(select 1 from jsonb_array_elements(p_review->'lines') x where x->'selected'='true'::jsonb and x->>'source_id'=r->>'source_id' and x->'original'->>'id'=r->'original'->>'id' and x->>'id'<>r->>'id') then raise exception 'Duplicate source selection';end if;
 qty:=private.est_int(r->'quantity_milli',1,1000000000);unitcost:=private.est_int(r->'unit_cost_minor',0,1000000000);perform private.est_text(r->'vendor',1,200);perform private.est_text(r->'description',1,500);
 if coalesce(r->>'unit','') not in ('each','sq_ft','linear_ft','roofing_square','bundle','cubic_yard','hour','day','lump_sum') then raise exception 'Confirm material unit';end if;
 cost:=private.est_money(round(qty*unitcost/1000));pricing:=coalesce(nullif(r->'pricing','null'::jsonb),p_review->'supplier_pricing'->(r->>'vendor'),p_review->'company_pricing');markup:=private.material_markup(cost,pricing);
 totalcost:=private.est_money(totalcost+cost);totalprice:=private.est_money(totalprice+cost+markup);ids:=ids||jsonb_build_array(lineid);
 canonical:=jsonb_build_object('id',gen_random_uuid(),'kind','material','description',r->>'description','quantity_milli',qty,'unit',r->>'unit','unit_cost_minor',unitcost,'unit_price_minor',unitcost,'markup_bps',0,'taxable',false,'option_id',null,'catalog_item_id',null,'internal_note','','fixed_markup_minor',markup,'import_approval_id',approval,'material_import_line_ids',jsonb_build_array(lineid));lines:=lines||jsonb_build_array(canonical);
 end loop;
 if jsonb_array_length(lines)=0 then raise exception 'Select material lines';end if;
 if p_review->>'presentation'='package' then
 perform private.est_text(p_review->'package_description',1,500);if totalcost>1000000000 or totalprice>1000000000 then raise exception 'Package exceeds unit limit';end if;
 lines:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','material','description',p_review->>'package_description','quantity_milli',1000,'unit','lump_sum','unit_cost_minor',totalcost,'unit_price_minor',totalprice,'markup_bps',0,'taxable',false,'option_id',null,'catalog_item_id',null,'internal_note','','fixed_markup_minor',0,'import_approval_id',approval,'material_import_line_ids',ids));end if;
 select jsonb_agg(to_jsonb(x)) into source_snapshots from public.material_import_sources x where organization_id=p_org and batch_id=b.id;
 insert into public.material_import_approvals(id,organization_id,batch_id,estimate_id,review_snapshot,source_snapshots,estimate_lines,cost_minor,price_minor,currency,job_id) values(approval,p_org,b.id,b.estimate_id,p_review-'sources',source_snapshots,lines,totalcost,totalprice,currency,b.job_id);
 update public.material_import_batches set status='approved',lock_revision=lock_revision+1 where id=b.id;
 return jsonb_build_object('approval_id',approval,'estimate_lines',lines,'cost_minor',totalcost,'price_minor',totalprice);end
$$;
create function public.approve_material_import(p_org uuid,p_batch uuid,p_lock integer,p_review jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.approve_material_import(p_org,p_batch,p_lock,p_review) $$;
-- Validate every imported line against its immutable tenant/estimate-bound approval on every save/issue.
create function private.check_material_approvals(org uuid,estimate uuid,p jsonb,issuing boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
 declare l jsonb;a public.material_import_approvals;expected jsonb;begin
 for l in select * from jsonb_array_elements(p->'lines') where value->>'import_approval_id' is not null loop
 select * into a from public.material_import_approvals where organization_id=org and id=(l->>'import_approval_id')::uuid and estimate_id=estimate;
 if a.id is null or a.job_id is not null then raise exception 'Approved material source unavailable';end if;
 select x into expected from jsonb_array_elements(a.estimate_lines) x where x->>'id'=l->>'id';
 -- Package description, internal note and taxable selection remain editable; financial provenance does not.
 if expected is null or (l-array['description','internal_note','taxable']) is distinct from (expected-array['description','internal_note','taxable']) then raise exception 'Imported pricing changed; create a new reviewed approval';end if;
 if (select count(*) from jsonb_array_elements(p->'lines') x where x->>'import_approval_id'=a.id::text)<>jsonb_array_length(a.estimate_lines) then raise exception 'Approved material scope is incomplete';end if;
 if exists(select 1 from public.material_import_sources s where s.organization_id=org and s.batch_id=a.batch_id and (s.status<>'clean' or (issuing and s.provenance<>'live'))) then raise exception 'Material source unverified for issue';end if;
 end loop;end
$$;
create function private.apply_material_import(p_org uuid,p_estimate uuid,p_version uuid,p_lock integer,p_approval uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a public.material_import_approvals;p jsonb;begin
 if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
 select * into a from public.material_import_approvals where organization_id=p_org and estimate_id=p_estimate and id=p_approval;if a.id is null or a.job_id is not null then raise exception 'Approval unavailable';end if;
 select payload into p from public.estimate_versions where organization_id=p_org and estimate_id=p_estimate and id=p_version and status='draft';if p is null then raise exception 'Draft unavailable';end if;
 if exists(select 1 from jsonb_array_elements(p->'lines') x where x->>'import_approval_id'=a.id::text) then raise exception 'Materials already added';end if;
 p:=jsonb_set(p,'{lines}',(p->'lines')||a.estimate_lines);return private.save_estimate(p_org,p_estimate,p_version,p_lock,p);end
$$;
create function public.apply_material_import(p_org uuid,p_estimate uuid,p_version uuid,p_lock integer,p_approval uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.apply_material_import(p_org,p_estimate,p_version,p_lock,p_approval) $$;
create function private.approve_and_apply_material_import(p_org uuid,p_batch uuid,p_batch_lock integer,p_estimate uuid,p_version uuid,p_lock integer,p_review jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare a jsonb;begin
 if not private.can(p_org,'estimates') or not exists(select 1 from public.material_import_batches where organization_id=p_org and id=p_batch and estimate_id=p_estimate and purpose='estimate') then raise exception 'Estimate import unavailable';end if;
 a:=private.approve_material_import(p_org,p_batch,p_batch_lock,p_review);return private.apply_material_import(p_org,p_estimate,p_version,p_lock,(a->>'approval_id')::uuid);end$$;
create function public.approve_and_apply_material_import(p_org uuid,p_batch uuid,p_batch_lock integer,p_estimate uuid,p_version uuid,p_lock integer,p_review jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.approve_and_apply_material_import(p_org,p_batch,p_batch_lock,p_estimate,p_version,p_lock,p_review)$$;
-- No worker credential, service-role endpoint, or client mutation grant is created here.
-- Operators must provision an isolated scanner/validator worker before any real file processing.
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('material_markup','check_material_approvals') loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('approve_and_apply_material_import','begin_material_import','approve_material_import','apply_material_import') loop execute format('revoke all on function %s from public,anon',f.sig);execute format('grant execute on function %s to authenticated',f.sig);end loop;
end $$;
commit;
