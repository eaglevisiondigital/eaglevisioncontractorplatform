-- Durable control plane only. No Storage upload/read policy, HTTP ingestion or scanner activation.
begin;
create table private.material_worker_grants(
 organization_id uuid not null references public.organizations(id),user_id uuid not null references auth.users(id),active boolean not null default true,expires_at timestamptz not null,
 approval_reference text not null check(length(trim(approval_reference))>=8),scanner_engines text[] not null check(cardinality(scanner_engines)>0),validator_versions text[] not null check(cardinality(validator_versions)>0),extractors text[] not null check(cardinality(extractors)>0),primary key(organization_id,user_id)
);
create index worker_grant_user on private.material_worker_grants(user_id,organization_id);
create table private.material_processing_jobs(
 organization_id uuid not null,source_id uuid not null,created_by uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','processing','complete','rejected')),attempt integer not null default 0 check(attempt between 0 and 3),
 not_before timestamptz not null default now(),lease uuid,leased_by uuid references auth.users(id),expires_at timestamptz,
 scan_evidence jsonb,validator_evidence jsonb,last_error text check(last_error is null or last_error='processing_failed'),created_at timestamptz not null default now(),
 primary key(organization_id,source_id),foreign key(organization_id,source_id) references public.material_import_sources(organization_id,id)
);
create index processing_claim on private.material_processing_jobs(organization_id,status,not_before,expires_at);
alter table private.material_worker_grants enable row level security;alter table private.material_processing_jobs enable row level security;
revoke all on private.material_worker_grants,private.material_processing_jobs from public,anon,authenticated;
create function private.queue_material_source(p_org uuid,p_source uuid) returns void language plpgsql security definer set search_path='' as $$
 declare source public.material_import_sources;b public.material_import_batches;
 begin
 if not private.can(p_org,'estimates') then raise exception 'Estimating access denied' using errcode='42501';end if;
 perform 1 from public.organizations where id=p_org for update;
 perform 1 from public.memberships where organization_id=p_org and user_id=auth.uid() for share;
 if not private.can(p_org,'estimates') then raise exception 'Estimating access revoked' using errcode='42501';end if;
 select * into source from public.material_import_sources where organization_id=p_org and id=p_source;
 select * into b from public.material_import_batches where organization_id=p_org and id=source.batch_id;
 if source.id is null or source.provenance<>'live' or source.status<>'quarantined' or b.status<>'review' or b.created_by<>auth.uid() then raise exception 'Quarantined owned source required';end if;
 if exists(select 1 from private.material_processing_jobs where organization_id=p_org and source_id=p_source) then return;end if;
 if (select count(*) from private.material_processing_jobs where organization_id=p_org and status in ('pending','processing'))>=100 then raise exception 'Processing quota reached';end if;
 -- Object metadata presence is not a scan attestation; the worker must verify actual bytes/hash.
 if not exists(select 1 from storage.objects where bucket_id='material-quarantine' and name=p_org::text||'/'||p_source::text) then raise exception 'Quarantine upload unavailable';end if;
 insert into private.material_processing_jobs(organization_id,source_id,created_by) values(p_org,p_source,auth.uid());
 insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(p_org,auth.uid(),'material.queued','material_import_sources',p_source);
 end$$;
create function public.queue_material_source(p_org uuid,p_source uuid) returns void language sql security invoker set search_path='' as $$select private.queue_material_source(p_org,p_source)$$;
create function private.validate_worker_extraction(e jsonb) returns void language plpgsql immutable set search_path='' as $$
 declare line jsonb;k text;value jsonb;seen text[]:='{}';
 begin
 perform private.est_object(e,array['schema_version','vendor','quoted_on','currency','total_text','lines','warnings']);
 if e->'schema_version' is distinct from '1'::jsonb or jsonb_typeof(e->'lines') is distinct from 'array' or jsonb_typeof(e->'warnings') is distinct from 'array' then raise exception 'Malformed extraction';end if;
 if jsonb_array_length(e->'lines') not between 1 and 200 or jsonb_array_length(e->'warnings')>50 or octet_length(e::text)>1048576 then raise exception 'Extraction limit';end if;
 foreach k in array array['vendor','quoted_on','currency','total_text'] loop
 value:=e->k;if value is null or (value<>'null'::jsonb and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>300)) then raise exception 'Invalid extraction header';end if;end loop;
 if e->>'currency' is not null and e->>'currency' !~ '^[A-Z]{3}$' then raise exception 'Invalid currency';end if;
 if e->>'quoted_on' is not null then perform private.est_date(e->'quoted_on');end if;
 for value in select * from jsonb_array_elements(e->'warnings') loop perform private.est_text(value,0,1000);end loop;
 for line in select * from jsonb_array_elements(e->'lines') loop
 perform private.est_object(line,array['id','description','sku','quantity_text','unit_text','unit_cost_text','extension_text','confidence','reference']);
 k:=private.est_text(line->'id',1,200);if k=any(seen) then raise exception 'Duplicate extraction row';end if;seen:=array_append(seen,k);perform private.est_text(line->'description',1,500);
 foreach k in array array['sku','quantity_text','unit_text','unit_cost_text','extension_text'] loop value:=line->k;if value is null or (value<>'null'::jsonb and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>200)) then raise exception 'Invalid extracted text';end if;end loop;
 value:=line->'confidence';if value is null or (value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or (value#>>'{}')::numeric not between 0 and 1)) then raise exception 'Invalid confidence';end if;
 perform private.est_object(line->'reference',array['page','sheet','cell','excerpt']);perform private.est_text(line->'reference'->'excerpt',0,1000);
 if line->'reference'->'page' is distinct from 'null'::jsonb then perform private.est_int(line->'reference'->'page',1,1000);end if;
 foreach k in array array['sheet','cell'] loop value:=line->'reference'->k;if value is null or (value<>'null'::jsonb and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>200)) then raise exception 'Invalid extraction reference';end if;end loop;
 end loop;
 end$$;
create function private.material_worker_control(p_org uuid,p_operation text,p_source uuid default null,p_lease uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
 declare g private.material_worker_grants;j private.material_processing_jobs;s public.material_import_sources;b public.material_import_batches;m public.memberships;e jsonb;v jsonb;provider jsonb;
 begin
 if p_operation not in ('claim','checkpoint','release','save','complete','fail','retry') then raise exception 'Unsupported worker operation';end if;
 select * into g from private.material_worker_grants where organization_id=p_org and user_id=auth.uid() and active and expires_at>now() for share;
 perform 1 from private.release_environment where singleton and mode='internal-development' for share;
 if g.user_id is null or not found then
 if p_operation='retry' then return 'false'::jsonb;end if;raise exception 'Worker denied' using errcode='42501';end if;
 perform 1 from public.organizations where id=p_org and status='active' for share;if not found then raise exception 'Organization unavailable' using errcode='42501';end if;
 perform 1 from public.company_modules where organization_id=p_org and module='estimates' and enabled for share;if not found then raise exception 'Module unavailable' using errcode='42501';end if;
 if p_operation='claim' then
 -- Recover a committed extraction after a lost completion acknowledgement without reprocessing bytes.
 update private.material_processing_jobs jobs set status='complete',lease=null,leased_by=null,expires_at=null where jobs.organization_id=p_org and jobs.status='processing' and jobs.expires_at<=now() and exists(select 1 from public.material_import_sources src where src.organization_id=p_org and src.id=jobs.source_id and src.status='clean' and src.extraction is not null);
 update private.material_processing_jobs jobs set status='rejected',last_error='processing_failed',lease=null,leased_by=null,expires_at=null where jobs.organization_id=p_org and jobs.status='processing' and jobs.expires_at<=now() and jobs.attempt>=3;
 select * into j from private.material_processing_jobs where organization_id=p_org and (p_source is null or source_id=p_source) and attempt<3 and ((status='pending' and not_before<=now()) or (status='processing' and expires_at<=now())) order by created_at,source_id for update skip locked limit 1;
 if j.source_id is null then return 'null'::jsonb;end if;
 else
 select * into j from private.material_processing_jobs where organization_id=p_org and source_id=p_source for update;
 if j.source_id is null or j.status<>'processing' or j.lease is distinct from p_lease or j.leased_by is distinct from auth.uid() or j.expires_at<=now() then
 if p_operation='retry' then return 'false'::jsonb;end if;raise exception 'Stale or expired worker lease' using errcode='42501';end if;
 end if;
 select * into s from public.material_import_sources where organization_id=p_org and id=j.source_id;
 select * into b from public.material_import_batches where organization_id=p_org and id=s.batch_id for share;
 select * into m from public.memberships where organization_id=p_org and user_id=j.created_by for share;
 if b.id is null or b.status<>'review' or s.provenance<>'live' or m.user_id is null or not m.active or not(m.role in ('owner','admin') or m.staff_type in ('estimator','office_manager')) then raise exception 'Source permission revoked' using errcode='42501';end if;
 insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(p_org,auth.uid(),'material.worker.'||p_operation,'material_import_sources',s.id);
 if p_operation='claim' then
 if s.status<>'quarantined' then raise exception 'Quarantined source required';end if;
 update private.material_processing_jobs set status='processing',attempt=attempt+1,lease=gen_random_uuid(),leased_by=auth.uid(),expires_at=now()+interval '120 seconds',scan_evidence=null,validator_evidence=null where organization_id=p_org and source_id=j.source_id returning * into j;
 return jsonb_build_object('token',j.lease,'attempt',j.attempt,'expiresAt',extract(epoch from j.expires_at)*1000,'job',jsonb_build_object('organizationId',p_org,'sourceId',s.id,'objectKey',p_org::text||'/'||s.id::text,'sha256',s.sha256,'mime',s.mime,'size',s.byte_size));
 elsif p_operation='checkpoint' then return 'true'::jsonb;
 elsif p_operation='release' then
 perform private.est_object(p_payload,array['scan','validator']);e:=p_payload->'scan';v:=p_payload->'validator';perform private.est_object(e,array['verdict','sha256','engine','signatureVersion','scannedAt']);perform private.est_object(v,array['id','sha256']);
 if e->>'verdict' is distinct from 'clean' or e->>'sha256' is distinct from s.sha256 or v->>'sha256' is distinct from s.sha256 or not coalesce(e->>'engine'=any(g.scanner_engines),false) or not coalesce(v->>'id'=any(g.validator_versions),false) then raise exception 'Unapproved scan or validator evidence';end if;
 perform private.est_text(e->'signatureVersion',1,200);if e->>'scannedAt' is null or abs(extract(epoch from now()-(e->>'scannedAt')::timestamptz))>900 then raise exception 'Stale scan evidence';end if;
 -- Remain quarantined until the clean object AND schema-validated extraction are committed.
 update private.material_processing_jobs set scan_evidence=e,validator_evidence=v where organization_id=p_org and source_id=j.source_id;return 'true'::jsonb;
 elsif p_operation='save' then
 perform private.est_object(p_payload,array['extraction','provider']);provider:=p_payload->'provider';perform private.est_object(provider,array['id','model']);perform private.est_text(provider->'id',1,200);perform private.est_text(provider->'model',1,200);
 if j.scan_evidence is null or j.validator_evidence is null or not coalesce((provider->>'id')||':'||(provider->>'model')=any(g.extractors),false) or s.status<>'quarantined' then raise exception 'Validated evidence and approved provider required';end if;
 if not exists(select 1 from storage.objects where bucket_id='material-clean' and name=p_org::text||'/'||s.id::text) then raise exception 'Private clean object unavailable';end if;
 perform private.validate_worker_extraction(p_payload->'extraction');
 update public.material_import_sources set status='clean',scan_evidence=j.scan_evidence,extraction=p_payload->'extraction',provider_metadata=provider where organization_id=p_org and id=s.id;
 return 'true'::jsonb;
 elsif p_operation='complete' then
 if s.status<>'clean' or s.extraction is null then raise exception 'Completed extraction required';end if;
 update private.material_processing_jobs set status='complete',lease=null,leased_by=null,expires_at=null where organization_id=p_org and source_id=j.source_id;return 'true'::jsonb;
 elsif p_operation='fail' then
 update private.material_processing_jobs set last_error='processing_failed' where organization_id=p_org and source_id=j.source_id;return 'true'::jsonb;
 elsif p_operation='retry' then
 if s.status='clean' and s.extraction is not null then update private.material_processing_jobs set status='complete',lease=null,leased_by=null,expires_at=null where organization_id=p_org and source_id=j.source_id;
 else
 update private.material_processing_jobs set status=case when attempt>=3 then 'rejected' else 'pending' end,not_before=now()+make_interval(secs=>30*power(2,attempt-1)::integer),last_error='processing_failed',lease=null,leased_by=null,expires_at=null where organization_id=p_org and source_id=j.source_id;
 if j.attempt>=3 then update public.material_import_sources set status='failed' where organization_id=p_org and id=s.id and status='quarantined';end if;
 end if;return 'true'::jsonb;
 else raise exception 'Unsupported worker operation';end if;
 end$$;
create function public.material_worker_control(p_org uuid,p_operation text,p_source uuid default null,p_lease uuid default null,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.material_worker_control(p_org,p_operation,p_source,p_lease,p_payload)$$;
revoke all on function private.queue_material_source(uuid,uuid),public.queue_material_source(uuid,uuid),private.material_worker_control(uuid,text,uuid,uuid,jsonb),public.material_worker_control(uuid,text,uuid,uuid,jsonb),private.validate_worker_extraction(jsonb) from public,anon,authenticated;
grant execute on function private.queue_material_source(uuid,uuid),public.queue_material_source(uuid,uuid),private.material_worker_control(uuid,text,uuid,uuid,jsonb),public.material_worker_control(uuid,text,uuid,uuid,jsonb) to authenticated;
commit;
