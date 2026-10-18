-- LOCAL REVIEW PROPOSAL ONLY. Not a migration; no hosted application or grants authorized.
begin;
create table private.customer_estimate_access (
 organization_id uuid not null references public.organizations(id),id uuid not null default gen_random_uuid(),
 customer_id uuid not null,location_id uuid not null,user_id uuid not null,version_id uuid not null,
 source_report_id uuid,finding_id text,source_line_id uuid,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,revoked_at timestamptz,
 approval_reference text not null check(length(trim(approval_reference)) between 1 and 500),
 primary key(organization_id,id),
 check(isfinite(created_at) and isfinite(expires_at) and expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
 check(revoked_at is null or (isfinite(revoked_at) and revoked_at>=created_at)),
 check((source_report_id is null and finding_id is null and source_line_id is null) or (source_report_id is not null and finding_id is not null and source_line_id is not null and length(trim(finding_id)) between 1 and 100)),
 foreign key(organization_id,customer_id,user_id) references public.portal_identities(organization_id,customer_id,user_id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,version_id) references public.estimate_versions(organization_id,id),
 foreign key(organization_id,source_report_id) references private.inspection_reports(organization_id,id),
 foreign key(organization_id,version_id,source_line_id) references public.estimate_lines(organization_id,version_id,id)
);
alter table private.customer_estimate_access enable row level security;
revoke all on private.customer_estimate_access from public,anon,authenticated,service_role;
create unique index customer_estimate_current on private.customer_estimate_access(organization_id,customer_id,location_id,user_id,version_id) where revoked_at is null;
create index customer_estimate_actor on private.customer_estimate_access(user_id,organization_id,customer_id,location_id);
create index customer_estimate_mapping on private.customer_estimate_access(organization_id,customer_id,user_id);
create index customer_estimate_location on private.customer_estimate_access(organization_id,location_id,customer_id);
create index customer_estimate_line on private.customer_estimate_access(organization_id,version_id,source_line_id);
create index customer_estimate_report on private.customer_estimate_access(organization_id,source_report_id);
create function private.customer_access_invariant() returns trigger language plpgsql security definer set search_path='' as $$declare v public.estimate_versions;begin
 if tg_op='DELETE' then raise exception 'Access evidence is append-only';end if;
 if tg_op='UPDATE' then
  if old.revoked_at is not null or new.revoked_at is null or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then raise exception 'Revoke only; no extension or scope change';end if;return new;
 end if;
 if new.created_at>clock_timestamp() or new.expires_at<=clock_timestamp() or new.expires_at>clock_timestamp()+interval '15 minutes' or new.revoked_at is not null then raise exception 'Current bounded access required';end if;
 select * into v from public.estimate_versions where organization_id=new.organization_id and id=new.version_id and customer_id=new.customer_id and status='issued' for share;
 if v.id is null or (v.location_id=new.location_id or (v.location_id is null and exists(
  select 1 from private.inspection_plans p join public.jobs j on j.organization_id=p.organization_id and j.id=p.job_id
  join public.estimate_versions b on b.organization_id=j.organization_id and b.id=j.baseline_version_id
  where p.organization_id=new.organization_id and p.customer_id=new.customer_id and p.location_id=new.location_id and b.estimate_id=v.estimate_id and b.customer_id=new.customer_id))) is not true then raise exception 'Issued customer/property scope required';end if;
 if new.source_report_id is not null and not exists(select 1 from private.inspection_reports r where r.organization_id=new.organization_id and r.id=new.source_report_id and r.customer_id=new.customer_id and r.location_id=new.location_id and exists(select 1 from jsonb_array_elements(r.snapshot->'findings') f where f->>'id'=new.finding_id)) then raise exception 'Published customer-visible finding required';end if;
 if new.source_line_id is not null and not exists(select 1 from public.estimate_lines l where l.organization_id=new.organization_id and l.version_id=new.version_id and l.id=new.source_line_id and (l.calculation->>'included')::boolean) then raise exception 'Included issued source line required';end if;
 if new.expires_at<=clock_timestamp() then raise exception 'Current bounded access required';end if;
 return new;
end$$;
revoke all on function private.customer_access_invariant() from public,anon,authenticated,service_role;
create trigger customer_access_invariant before insert or update or delete on private.customer_estimate_access for each row execute function private.customer_access_invariant();
create trigger customer_access_audit after insert or update or delete on private.customer_estimate_access for each row execute function private.audit_change();

create function private.customer_portal_guard(p_org uuid,p_customer uuid,p_location uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.property_connected_session();
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null for share;if not found then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform 1 from public.memberships where user_id=auth.uid() and active for share;
 if found or exists(select 1 from private.platform_admins where user_id=auth.uid() and active) then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform 1 from public.organizations where id=p_org and status='active' for share;if not found then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform 1 from private.property_features where organization_id=p_org and enabled for share;if not found then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform 1 from public.company_modules where organization_id=p_org and module='estimates' and enabled for share;if not found then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform 1 from public.portal_identities where organization_id=p_org and customer_id=p_customer and user_id=auth.uid() and active for share;if not found then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform 1 from public.service_locations where organization_id=p_org and id=p_location and customer_id=p_customer for share;if not found then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform private.property_connected_session();
end$$;
revoke all on function private.customer_portal_guard(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.customer_estimate_review(p_org uuid,p_customer uuid,p_location uuid,p_version uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.customer_estimate_access;v public.estimate_versions;result jsonb;begin
 perform private.customer_portal_guard(p_org,p_customer,p_location);
 select * into a from private.customer_estimate_access where organization_id=p_org and customer_id=p_customer and location_id=p_location and user_id=auth.uid() and version_id=p_version and revoked_at is null and expires_at>clock_timestamp() for share;
 if a.id is null then raise exception 'Customer access unavailable' using errcode='42501';end if;
 select * into v from public.estimate_versions where organization_id=p_org and id=p_version and customer_id=p_customer and status='issued' for share;
 if v.id is null then raise exception 'Customer access unavailable' using errcode='42501';end if;
 result:=jsonb_build_object('organization_id',p_org,'customer_id',p_customer,'location_id',p_location,'version_id',v.id,'estimate_id',v.estimate_id,'version_number',v.version_number,
 'source_report_id',a.source_report_id,'finding_id',a.finding_id,'source_line_id',a.source_line_id,'review_state',case when (v.payload->>'expires_on')::date<(clock_timestamp() at time zone 'UTC')::date then 'expired' else 'awaiting_action' end,
 'scope',jsonb_build_object('name',v.payload->'project'->'name','description',v.payload->'project'->'description','currency',v.payload->>'currency','expires_on',v.payload->>'expires_on','notes',v.payload->>'customer_notes','terms',v.payload->>'terms',
 'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',l->>'id','description',l->>'description','quantity_milli',l->'quantity_milli','unit',l->>'unit','amount_minor',c->'subtotal_minor') order by pos),'[]'::jsonb) from jsonb_array_elements(v.payload->'lines') with ordinality q(l,pos) join lateral jsonb_array_elements(v.calculation->'lines') c on c->>'id'=l->>'id' where (c->>'included')::boolean),
 'subtotal_minor',v.calculation->'subtotal_minor','discount_minor',v.calculation->'discount_minor','tax_minor',v.calculation->'tax_minor','total_minor',v.calculation->'total_minor'),
 'mode','internal-development','read_only',true);
 perform private.customer_portal_guard(p_org,p_customer,p_location);
 if a.expires_at<=clock_timestamp() then raise exception 'Customer access unavailable' using errcode='42501';end if;
 return result;
end$$;
revoke all on function private.customer_estimate_review(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.customer_portal_discover() returns jsonb language plpgsql security definer set search_path='' as $$declare b record;v_ids jsonb;can_report boolean;items jsonb:='[]';begin
 perform private.property_connected_session();
 for b in select organization_id,customer_id,location_id from private.property_report_access where user_id=auth.uid() and revoked_at is null and expires_at>clock_timestamp()
 union select organization_id,customer_id,location_id from private.customer_estimate_access where user_id=auth.uid() and revoked_at is null and expires_at>clock_timestamp()
 order by organization_id,customer_id,location_id limit 21 loop
  perform private.customer_portal_guard(b.organization_id,b.customer_id,b.location_id);
  can_report:=false;
  -- Lock and recheck report authority independently; never turn it into estimate authority.
  if exists(select 1 from private.property_report_access where organization_id=b.organization_id and customer_id=b.customer_id and location_id=b.location_id and user_id=auth.uid() and revoked_at is null and expires_at>clock_timestamp()) then
   perform private.property_published_reports(b.organization_id,b.customer_id,b.location_id,null);can_report:=true;
  end if;
  v_ids:='[]';
  select coalesce(jsonb_agg(version_id order by version_id),'[]'::jsonb) into v_ids from private.customer_estimate_access where organization_id=b.organization_id and customer_id=b.customer_id and location_id=b.location_id and user_id=auth.uid() and revoked_at is null and expires_at>clock_timestamp();
  -- Each candidate is checked through the same full read boundary, including post-wait expiry.
  declare v text;begin for v in select jsonb_array_elements_text(v_ids) loop perform private.customer_estimate_review(b.organization_id,b.customer_id,b.location_id,v::uuid);end loop;end;
  if not can_report and jsonb_array_length(v_ids)=0 then raise exception 'Customer access unavailable' using errcode='42501';end if;
  items:=items||jsonb_build_array(jsonb_build_object('organization_id',b.organization_id,'customer_id',b.customer_id,'location_id',b.location_id,
   'company_name',(select name from public.organizations where id=b.organization_id),'primary_color',(select primary_color from public.organizations where id=b.organization_id),
   'property_label',(select address_line1 from public.service_locations where organization_id=b.organization_id and id=b.location_id),'reports',can_report,'version_ids',v_ids));
 end loop;
 if jsonb_array_length(items)>20 then raise exception 'Customer access unavailable' using errcode='42501';end if;
 perform private.property_connected_session();
 for b in select * from jsonb_to_recordset(items) as x(organization_id uuid,customer_id uuid,location_id uuid,reports boolean,version_ids jsonb) loop
  if b.reports and not exists(select 1 from private.property_report_access a where a.organization_id=b.organization_id and a.customer_id=b.customer_id and a.location_id=b.location_id and a.user_id=auth.uid() and a.revoked_at is null and a.expires_at>clock_timestamp()) then raise exception 'Customer access unavailable' using errcode='42501';end if;
  if (select count(*) from private.customer_estimate_access a where a.organization_id=b.organization_id and a.customer_id=b.customer_id and a.location_id=b.location_id and a.user_id=auth.uid() and a.revoked_at is null and a.expires_at>clock_timestamp() and a.version_id::text in (select jsonb_array_elements_text(b.version_ids)))<>jsonb_array_length(b.version_ids) then raise exception 'Customer access unavailable' using errcode='42501';end if;
 end loop;
 return jsonb_build_object('user_id',auth.uid(),'contexts',items,'mode','internal-development');
end$$;
revoke all on function private.customer_portal_discover() from public,anon,authenticated,service_role;
create function public.customer_portal_discover() returns jsonb language sql security invoker set search_path='' as $$select private.customer_portal_discover()$$;
create function public.customer_estimate_review(p_org uuid,p_customer uuid,p_location uuid,p_version uuid) returns jsonb language sql security invoker set search_path='' as $$select private.customer_estimate_review(p_org,p_customer,p_location,p_version)$$;
revoke all on function public.customer_portal_discover(),public.customer_estimate_review(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- No EXECUTE grants, provisioning command, mutation, activation or client table policies.
commit;
