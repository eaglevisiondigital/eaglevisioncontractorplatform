-- LOCAL REVIEW PROPOSAL ONLY. Apply only after schema.proposed.sql in disposable tests.
-- No hosted migration, feature, mapping, permission or financial activation.
begin;
alter table private.customer_estimate_access
 add column published_by uuid not null references auth.users(id),
 add column request_id uuid not null,
 add column scope_sha256 text not null check(scope_sha256 ~ '^[a-f0-9]{64}$'),
 add column scope_snapshot jsonb not null check(jsonb_typeof(scope_snapshot)='object'),
 add column repair_link_reviewed boolean not null;
create unique index customer_publication_request on private.customer_estimate_access(organization_id,published_by,request_id);
create index customer_publication_publisher on private.customer_estimate_access(published_by);

create function private.customer_publisher_guard(p_org uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.customer_runtime_guard('publishing');
 perform private.property_connected_session();perform private.property_guard(p_org);
 if not private.has_role(p_org,array['owner','admin']::public.staff_role[]) then raise exception 'Customer publication denied' using errcode='42501';end if;
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and is_anonymous is false and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'Customer publication denied' using errcode='42501';end if;
end$$;
revoke all on function private.customer_publisher_guard(uuid) from public,anon,authenticated,service_role;

create function private.customer_publication_source(p_org uuid,p_customer uuid,p_location uuid,p_user uuid,p_version uuid,p_report uuid,p_finding text,p_line uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform private.customer_publisher_guard(p_org);
 perform 1 from auth.users where id=p_user and email_confirmed_at is not null and deleted_at is null and is_anonymous is false and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found or exists(select 1 from public.memberships where user_id=p_user and active) or exists(select 1 from private.platform_admins where user_id=p_user and active) then raise exception 'Customer publication denied' using errcode='42501';end if;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=p_customer and user_id=p_user and active for share;
 if not found then raise exception 'Customer publication denied' using errcode='42501';end if;
 perform 1 from public.service_locations where organization_id=p_org and id=p_location and customer_id=p_customer for share;
 if not found then raise exception 'Customer publication denied' using errcode='42501';end if;
 r:=private.customer_issued_review(p_org,p_customer,p_location,p_version,p_report,p_finding,p_line);
 if r->>'review_state'<>'awaiting_action' then raise exception 'Estimate expired';end if;
 perform private.customer_publisher_guard(p_org);
 return r-'review_state'-'mode'-'read_only';
end$$;
revoke all on function private.customer_publication_source(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.customer_publication_integrity() returns trigger language plpgsql security definer set search_path='' as $$declare s jsonb;begin
 if new.published_by is distinct from auth.uid() or new.repair_link_reviewed is distinct from true then raise exception 'Explicit staff review required';end if;
 s:=private.customer_publication_source(new.organization_id,new.customer_id,new.location_id,new.user_id,new.version_id,new.source_report_id,new.finding_id,new.source_line_id);
 if new.scope_snapshot is distinct from s or new.scope_sha256 is distinct from encode(sha256(convert_to(s::text,'UTF8')),'hex') then raise exception 'Publication source changed';end if;
 if new.expires_at<=clock_timestamp() then raise exception 'Publication expired';end if;
 return new;
end$$;
revoke all on function private.customer_publication_integrity() from public,anon,authenticated,service_role;
create trigger z_customer_publication_integrity before insert on private.customer_estimate_access for each row execute function private.customer_publication_integrity();

create function private.customer_publication_preview(p_org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare s jsonb;begin
 perform private.customer_publisher_guard(p_org);
 perform private.est_object(p,array['customer_id','location_id','user_id','version_id','source_report_id','finding_id','source_line_id']);
 s:=private.customer_publication_source(p_org,(p->>'customer_id')::uuid,(p->>'location_id')::uuid,(p->>'user_id')::uuid,(p->>'version_id')::uuid,(p->>'source_report_id')::uuid,p->>'finding_id',(p->>'source_line_id')::uuid);
 return jsonb_build_object('scope',s,'scope_sha256',encode(sha256(convert_to(s::text,'UTF8')),'hex'),'repair_recommendation',(select f from private.inspection_reports r cross join lateral jsonb_array_elements(r.snapshot->'findings') f where r.organization_id=p_org and r.id=(p->>'source_report_id')::uuid and f->>'id'=p->>'finding_id'));
end$$;
revoke all on function private.customer_publication_preview(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.customer_publish_estimate(p_org uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare s jsonb;a private.customer_estimate_access;expiry timestamptz;begin
 perform private.customer_publisher_guard(p_org);
 perform private.est_object(p,array['customer_id','location_id','user_id','version_id','source_report_id','finding_id','source_line_id','scope_sha256','request_id','expires_at','review_acknowledged','approval_reference']);
 if p->'review_acknowledged' is distinct from 'true'::jsonb or p->>'request_id' is null then raise exception 'Explicit staff review required';end if;
 -- Immutable parent uses a shared lock: never invert decision access->version locks.
 perform 1 from public.estimate_versions where organization_id=p_org and id=(p->>'version_id')::uuid for share;
 s:=private.customer_publication_source(p_org,(p->>'customer_id')::uuid,(p->>'location_id')::uuid,(p->>'user_id')::uuid,(p->>'version_id')::uuid,(p->>'source_report_id')::uuid,p->>'finding_id',(p->>'source_line_id')::uuid);
 if p->>'scope_sha256' is distinct from encode(sha256(convert_to(s::text,'UTF8')),'hex') then raise exception 'Publication source changed';end if;
 expiry:=(p->>'expires_at')::timestamptz;
 if expiry is null or not isfinite(expiry) or expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '15 minutes' then raise exception 'Bounded publication required';end if;
 select * into a from private.customer_estimate_access where organization_id=p_org and published_by=auth.uid() and request_id=(p->>'request_id')::uuid for update;
 if a.id is not null then
  if a.scope_snapshot is distinct from s or a.user_id is distinct from (p->>'user_id')::uuid or a.expires_at is distinct from expiry or a.approval_reference is distinct from p->>'approval_reference' or a.revoked_at is not null or a.expires_at<=clock_timestamp() then raise exception 'Publication replay conflict';end if;
 else
  insert into private.customer_estimate_access(organization_id,customer_id,location_id,user_id,version_id,source_report_id,finding_id,source_line_id,expires_at,approval_reference,published_by,request_id,scope_sha256,scope_snapshot,repair_link_reviewed)
  values(p_org,(p->>'customer_id')::uuid,(p->>'location_id')::uuid,(p->>'user_id')::uuid,(p->>'version_id')::uuid,(p->>'source_report_id')::uuid,p->>'finding_id',(p->>'source_line_id')::uuid,expiry,p->>'approval_reference',auth.uid(),(p->>'request_id')::uuid,p->>'scope_sha256',s,true) on conflict do nothing returning * into a;
  if a.id is null then
   select * into a from private.customer_estimate_access where organization_id=p_org and published_by=auth.uid() and request_id=(p->>'request_id')::uuid for update;
   if a.id is null or a.scope_snapshot is distinct from s or a.user_id is distinct from (p->>'user_id')::uuid or a.expires_at is distinct from expiry or a.approval_reference is distinct from p->>'approval_reference' or a.revoked_at is not null then raise exception 'Publication replay conflict';end if;
  end if;
 end if;
 perform private.customer_publisher_guard(p_org);
 if a.expires_at<=clock_timestamp() then raise exception 'Publication expired';end if;
 return jsonb_build_object('publication_id',a.id,'scope_sha256',a.scope_sha256,'expires_at',a.expires_at);
end$$;
revoke all on function private.customer_publish_estimate(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.customer_revoke_publication(p_org uuid,p_publication uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.customer_publisher_guard(p_org);
 perform 1 from private.customer_estimate_access where organization_id=p_org and id=p_publication for update;
 if not found then raise exception 'Customer publication denied' using errcode='42501';end if;
 update private.customer_estimate_access set revoked_at=clock_timestamp() where organization_id=p_org and id=p_publication and revoked_at is null;
 perform private.customer_publisher_guard(p_org);
end$$;
revoke all on function private.customer_revoke_publication(uuid,uuid) from public,anon,authenticated,service_role;

create table private.customer_review_decisions(
 organization_id uuid not null references public.organizations(id),id uuid not null default gen_random_uuid(),
 publication_id uuid not null,customer_id uuid not null,location_id uuid not null,user_id uuid not null,version_id uuid not null,
 request_id uuid not null,choice text not null check(choice in ('approve_review','decline_review')),
 acknowledgment text not null check(acknowledgment='review-only-v1'),
 scope_sha256 text not null check(scope_sha256 ~ '^[a-f0-9]{64}$'),scope_snapshot jsonb not null check(jsonb_typeof(scope_snapshot)='object'),
 auth_session_id uuid not null,recorded_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,id),unique(organization_id,user_id,request_id),unique(organization_id,customer_id,location_id,user_id,version_id),
 foreign key(organization_id,publication_id) references private.customer_estimate_access(organization_id,id),
 foreign key(organization_id,customer_id,user_id) references public.portal_identities(organization_id,customer_id,user_id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id)
);
alter table private.customer_review_decisions enable row level security;
revoke all on private.customer_review_decisions from public,anon,authenticated,service_role;
create index customer_decision_publication on private.customer_review_decisions(organization_id,publication_id);
create index customer_decision_mapping on private.customer_review_decisions(organization_id,customer_id,user_id);
create index customer_decision_version on private.customer_review_decisions(organization_id,version_id);
create index customer_decision_location on private.customer_review_decisions(organization_id,location_id,customer_id);

create function private.customer_decision_integrity() returns trigger language plpgsql security definer set search_path='' as $$declare a private.customer_estimate_access;s jsonb;begin
 if tg_op<>'INSERT' then raise exception 'Customer review evidence is immutable';end if;
 perform private.customer_runtime_guard('decisions');
 if new.user_id is distinct from auth.uid() or new.auth_session_id is distinct from (auth.jwt()->>'session_id')::uuid then raise exception 'Customer review denied' using errcode='42501';end if;
 perform private.customer_portal_guard(new.organization_id,new.customer_id,new.location_id);
 select * into a from private.customer_estimate_access where organization_id=new.organization_id and id=new.publication_id and customer_id=new.customer_id and location_id=new.location_id and user_id=new.user_id and version_id=new.version_id and revoked_at is null for update;
 if a.id is null or a.expires_at<=clock_timestamp() then raise exception 'Customer review denied' using errcode='42501';end if;
 s:=private.customer_estimate_review(new.organization_id,new.customer_id,new.location_id,new.version_id);
 if s->>'review_state'<>'awaiting_action' or new.scope_snapshot is distinct from (s-'review_state'-'mode'-'read_only') or new.scope_sha256 is distinct from a.scope_sha256 or new.scope_snapshot is distinct from a.scope_snapshot or new.recorded_at>clock_timestamp() or new.recorded_at<a.created_at or not isfinite(new.recorded_at) then raise exception 'Customer review evidence mismatch';end if;
 perform private.customer_portal_guard(new.organization_id,new.customer_id,new.location_id);
 if a.expires_at<=clock_timestamp() then raise exception 'Customer review expired';end if;
 return new;
end$$;
revoke all on function private.customer_decision_integrity() from public,anon,authenticated,service_role;
create trigger customer_decision_integrity before insert or update or delete on private.customer_review_decisions for each row execute function private.customer_decision_integrity();
create trigger customer_decision_audit after insert on private.customer_review_decisions for each row execute function private.audit_change();

create function private.customer_decision_context(p_org uuid,p_customer uuid,p_location uuid,p_version uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;a private.customer_estimate_access;d private.customer_review_decisions;begin
 r:=private.customer_estimate_review(p_org,p_customer,p_location,p_version);
 select * into a from private.customer_estimate_access where organization_id=p_org and customer_id=p_customer and location_id=p_location and user_id=auth.uid() and version_id=p_version and revoked_at is null for share;
 if a.id is null or a.expires_at<=clock_timestamp() or a.scope_snapshot is distinct from (r-'review_state'-'mode'-'read_only') then raise exception 'Customer review denied' using errcode='42501';end if;
 select * into d from private.customer_review_decisions where organization_id=p_org and customer_id=p_customer and location_id=p_location and user_id=auth.uid() and version_id=p_version;
 perform private.customer_portal_guard(p_org,p_customer,p_location);
 if a.expires_at<=clock_timestamp() then raise exception 'Customer review expired';end if;
 return jsonb_build_object('publication_id',a.id,'scope_sha256',a.scope_sha256,'review',r,'decision',case when d.id is null then null else jsonb_build_object('id',d.id,'request_id',d.request_id,'choice',d.choice,'recorded_at',d.recorded_at,'scope_sha256',d.scope_sha256) end,'financial_execution',false);
end$$;
revoke all on function private.customer_decision_context(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.customer_record_decision(p_org uuid,p_publication uuid,p_digest text,p_choice text,p_ack text,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a private.customer_estimate_access;d private.customer_review_decisions;r jsonb;begin
 perform private.customer_runtime_guard('decisions');
 perform private.property_connected_session();
 -- Same publication lock serializes conflicting decisions; uniqueness also covers renewed publications.
 select * into a from private.customer_estimate_access where organization_id=p_org and id=p_publication and user_id=auth.uid() and revoked_at is null for update;
 if a.id is null then raise exception 'Customer review denied' using errcode='42501';end if;
 perform private.customer_portal_guard(p_org,a.customer_id,a.location_id);
 if a.expires_at<=clock_timestamp() or p_digest is distinct from a.scope_sha256 or p_choice is null or p_choice not in ('approve_review','decline_review') or p_ack is distinct from 'review-only-v1' or p_request is null then raise exception 'Customer review denied' using errcode='42501';end if;
 r:=private.customer_estimate_review(p_org,a.customer_id,a.location_id,a.version_id);
 if r->>'review_state'<>'awaiting_action' then raise exception 'Estimate expired';end if;
 insert into private.customer_review_decisions(organization_id,publication_id,customer_id,location_id,user_id,version_id,request_id,choice,acknowledgment,scope_sha256,scope_snapshot,auth_session_id)
 values(p_org,a.id,a.customer_id,a.location_id,auth.uid(),a.version_id,p_request,p_choice,p_ack,p_digest,a.scope_snapshot,(auth.jwt()->>'session_id')::uuid) on conflict do nothing;
 select * into d from private.customer_review_decisions where organization_id=p_org and customer_id=a.customer_id and location_id=a.location_id and user_id=auth.uid() and version_id=a.version_id;
 if d.id is null or d.publication_id is distinct from a.id or d.request_id is distinct from p_request or d.choice is distinct from p_choice or d.scope_sha256 is distinct from p_digest then raise exception 'Customer decision replay conflict';end if;
 perform private.customer_portal_guard(p_org,a.customer_id,a.location_id);
 if a.expires_at<=clock_timestamp() then raise exception 'Customer review expired';end if;
 return jsonb_build_object('id',d.id,'request_id',d.request_id,'choice',d.choice,'recorded_at',d.recorded_at,'scope_sha256',d.scope_sha256);
end$$;
revoke all on function private.customer_record_decision(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;

create function public.customer_publication_preview(p_org uuid,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.customer_publication_preview(p_org,p)$$;
create function public.customer_publish_estimate(p_org uuid,p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.customer_publish_estimate(p_org,p)$$;
create function public.customer_revoke_publication(p_org uuid,p_publication uuid) returns void language sql security invoker set search_path='' as $$select private.customer_revoke_publication(p_org,p_publication)$$;
create function public.customer_decision_context(p_org uuid,p_customer uuid,p_location uuid,p_version uuid) returns jsonb language sql security invoker set search_path='' as $$select private.customer_decision_context(p_org,p_customer,p_location,p_version)$$;
create function public.customer_record_decision(p_org uuid,p_publication uuid,p_digest text,p_choice text,p_ack text,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$select private.customer_record_decision(p_org,p_publication,p_digest,p_choice,p_ack,p_request)$$;
revoke all on function public.customer_publication_preview(uuid,jsonb),public.customer_publish_estimate(uuid,jsonb),public.customer_revoke_publication(uuid,uuid),public.customer_decision_context(uuid,uuid,uuid,uuid),public.customer_record_decision(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
-- No EXECUTE grants or RLS client policies. No invoice, contract, job-change or balance mutation.
create function private.customer_publication_receipt(p_org uuid,p_request uuid,p_publication uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare a private.customer_estimate_access;begin
 perform private.customer_publisher_guard(p_org);
 select * into a from private.customer_estimate_access where organization_id=p_org and ((p_publication is null and published_by=auth.uid() and request_id=p_request) or (p_request is null and id=p_publication)) for share;
 perform private.customer_publisher_guard(p_org);
 if a.id is null then return null;end if;
 return jsonb_build_object('publication_id',a.id,'scope_sha256',a.scope_sha256,'expires_at',a.expires_at,'revoked',a.revoked_at is not null);
end$$;
revoke all on function private.customer_publication_receipt(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.customer_publication_receipt(p_org uuid,p_request uuid,p_publication uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.customer_publication_receipt(p_org,p_request,p_publication)$$;
revoke all on function public.customer_publication_receipt(uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- Forward-only hardening of an existing report implementation; ACLs unchanged.
create or replace function private.property_published_reports(p_org uuid,p_customer uuid,p_location uuid,p_before uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access_id uuid; expiry timestamptz; cursor_time timestamptz; result jsonb;begin
 perform private.property_connected_session();
 perform 1 from public.organizations where id=p_org and status='active' for share;if not found then raise exception 'Report access denied' using errcode='42501';end if;
 perform 1 from private.property_features where organization_id=p_org and enabled for share;if not found then raise exception 'Property reports disabled' using errcode='42501';end if;
 perform 1 from public.company_modules where organization_id=p_org and module='estimates' and enabled for share;if not found then raise exception 'Property reports disabled' using errcode='42501';end if;
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and is_anonymous is false and (banned_until is null or banned_until<=clock_timestamp()) for share;if not found then raise exception 'Verified identity required' using errcode='42501';end if;
 perform 1 from public.memberships where organization_id=p_org and user_id=auth.uid() and active for share;
 if exists(select 1 from public.memberships where organization_id=p_org and user_id=auth.uid() and active and role in ('owner','admin')) and coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA required' using errcode='42501';end if;
 if (exists(select 1 from public.memberships where user_id=auth.uid() and active) or exists(select 1 from private.platform_admins where user_id=auth.uid() and active)) and not private.has_role(p_org) then raise exception 'Report access denied' using errcode='42501';end if;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=p_customer and user_id=auth.uid() and active for share;if not found then raise exception 'Customer mapping denied' using errcode='42501';end if;
 select id,expires_at into access_id,expiry from private.property_report_access where organization_id=p_org and customer_id=p_customer and location_id=p_location and user_id=auth.uid() and revoked_at is null and expires_at>clock_timestamp() for share;
 if access_id is null then raise exception 'Report lease denied' using errcode='42501';end if;
 if p_before is not null then select published_at into cursor_time from private.inspection_reports where organization_id=p_org and customer_id=p_customer and location_id=p_location and id=p_before;if cursor_time is null then raise exception 'Report cursor denied' using errcode='42501';end if;end if;
 result:=jsonb_build_object('organization_id',p_org,'customer_id',p_customer,'location_id',p_location,'reports',(
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'published_at',r.published_at,'snapshot',r.snapshot) order by r.published_at desc,r.id desc),'[]'::jsonb)
 from (select * from private.inspection_reports where organization_id=p_org and customer_id=p_customer and location_id=p_location and (p_before is null or (published_at,id)<(cursor_time,p_before)) order by published_at desc,id desc limit 50)r),
 'media','[]'::jsonb,'mode','internal-development','report_only',true);
 perform private.property_connected_session();
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and is_anonymous is false and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found or ((exists(select 1 from public.memberships where user_id=auth.uid() and active) or exists(select 1 from private.platform_admins where user_id=auth.uid() and active)) and not private.has_role(p_org)) then raise exception 'Report access denied' using errcode='42501';end if;
 if expiry<=clock_timestamp() then raise exception 'Report lease expired' using errcode='42501';end if;
 return result;
end$$;

create function private.customer_property_reports(p_org uuid,p_customer uuid,p_location uuid,p_before uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform private.customer_portal_guard(p_org,p_customer,p_location);
 r:=private.property_published_reports(p_org,p_customer,p_location,p_before);
 perform private.customer_portal_guard(p_org,p_customer,p_location);return r;
end$$;
revoke all on function private.customer_property_reports(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.customer_property_reports(p_org uuid,p_customer uuid,p_location uuid,p_before uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.customer_property_reports(p_org,p_customer,p_location,p_before)$$;
revoke all on function public.customer_property_reports(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
commit;
