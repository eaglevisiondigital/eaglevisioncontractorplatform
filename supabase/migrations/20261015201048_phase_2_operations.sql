-- Phase 2 operational foundation. Local/disposable validation only.
begin;
alter table public.organizations add column status text not null default 'active' check(status in ('onboarding','active','suspended'));
alter table public.organizations add column subscription_plan text not null default 'pilot' check(subscription_plan in ('pilot','standard','professional'));
alter table public.memberships add column staff_type text not null default 'office_manager' check(staff_type in ('estimator','office_manager','field_staff'));
create table public.company_modules(
 organization_id uuid not null references public.organizations(id), module text not null check(module in ('crm','intake','team','settings','documents','estimates','contracts','invoices','payments')),
 enabled boolean not null default false, primary key(organization_id,module),
 check(module not in ('payments','invoices') or not enabled)
);
create table public.company_settings(
 organization_id uuid primary key references public.organizations(id),
 business_address text not null default '' check(length(business_address)<=500),
 contact_email text not null default '' check(length(contact_email)<=254),
 contact_phone text not null default '' check(length(contact_phone)<=40),
 website text not null default '' check(website='' or website ~ '^https://[^[:space:]]+$'),
 service_areas text not null default '' check(length(service_areas)<=2000),
 specialties text not null default '' check(length(specialties)<=2000),
 license_metadata text not null default '' check(length(license_metadata)<=2000),
 insurance_metadata text not null default '' check(length(insurance_metadata)<=2000),
 estimate_prefix text not null default 'EST' check(estimate_prefix ~ '^[A-Z0-9-]{1,12}$'),
 estimate_next_number bigint not null default 1 check(estimate_next_number between 1 and 999999999),
 default_terms text not null default '' check(length(default_terms)<=10000),
 expiration_days integer not null default 30 check(expiration_days between 1 and 365),
 material_markup_bps integer not null default 0 check(material_markup_bps between 0 and 100000),
 labor_rate_minor bigint not null default 0 check(labor_rate_minor between 0 and 100000000),
 currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 intake_enabled boolean not null default false,
 service_categories text[] not null default array['General inquiry'] check(cardinality(service_categories) between 1 and 30 and length(array_to_string(service_categories,','))<=2000),
 updated_at timestamptz not null default now()
);
create function private.initialize_company() returns trigger language plpgsql security definer set search_path='' as $$
 begin
  insert into public.company_settings(organization_id) values(new.id);
  insert into public.company_modules(organization_id,module,enabled)
   select new.id,m,m in ('crm','intake','team','settings','documents') from unnest(array['crm','intake','team','settings','documents','estimates','contracts','invoices','payments']) m;
  return new;
 end
$$;
revoke all on function private.initialize_company() from public,anon,authenticated;
create trigger initialize_company after insert on public.organizations for each row execute function private.initialize_company();
insert into public.company_settings(organization_id) select id from public.organizations;
insert into public.company_modules(organization_id,module,enabled) select id,m,m in ('crm','intake','team','settings','documents') from public.organizations cross join unnest(array['crm','intake','team','settings','documents','estimates','contracts','invoices','payments']) m;

create or replace function private.has_role(org uuid, roles public.staff_role[] default array['owner','admin','staff']::public.staff_role[])
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.memberships m join public.organizations o on o.id=m.organization_id
  where m.organization_id=org and o.status='active' and m.user_id=auth.uid() and m.active and m.role=any(roles)
  and (m.role='staff' or coalesce(auth.jwt()->>'aal','')='aal2')
 )
$$;
create function private.can(org uuid, capability text) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org) and exists(
  select 1 from public.memberships m where m.organization_id=org and m.user_id=auth.uid()
  and (m.role in ('owner','admin') or (capability in ('crm','intake','documents') and m.staff_type in ('estimator','office_manager')))
 ) and exists(select 1 from public.company_modules cm where cm.organization_id=org and cm.module=capability and cm.enabled)
$$;
revoke all on function private.can(uuid,text) from public,anon;
grant execute on function private.can(uuid,text) to authenticated;

alter table public.customers add column customer_type text not null default 'residential' check(customer_type in ('residential','commercial'));
alter table public.customers add column preferred_contact text not null default 'email' check(preferred_contact in ('email','phone','sms'));
alter table public.intake_requests add column service_category text not null default 'General inquiry' check(length(service_category)<=120);
alter table public.intake_requests add column preferred_appointment text not null default '' check(length(preferred_appointment)<=500);
alter table public.intake_requests add column contact_preference text not null default 'email' check(contact_preference in ('email','phone','sms'));
alter table public.intake_requests add column updated_at timestamptz not null default now();
create index customer_search_email on public.customers(organization_id,lower(email));
create index customer_search_phone on public.customers(organization_id,phone);
create index intake_queue on public.intake_requests(organization_id,status,created_at desc);
create index intake_assignment on public.intake_requests(organization_id,assigned_to);
create index locations_customer on public.service_locations(organization_id,customer_id);
create index intake_customer on public.intake_requests(organization_id,customer_id);
create index intake_location on public.intake_requests(organization_id,service_location_id);
create table public.customer_notes(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), customer_id uuid not null,
 body text not null check(length(body) between 1 and 5000), created_by uuid default auth.uid(), created_at timestamptz not null default now(),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index notes_customer on public.customer_notes(organization_id,customer_id,created_at desc);
create table public.communication_consents(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), customer_id uuid not null,
 email_allowed boolean not null, sms_allowed boolean not null,
 policy_version text not null check(length(policy_version) between 1 and 80), source text not null check(source in ('staff','website')),
 recorded_by uuid default auth.uid(), recorded_at timestamptz not null default now(),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index consent_customer on public.communication_consents(organization_id,customer_id,recorded_at desc);
create table public.lead_notifications(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), intake_request_id uuid not null,
 created_at timestamptz not null default now(),
 foreign key(organization_id,intake_request_id) references public.intake_requests(organization_id,id)
);
create index notifications_tenant on public.lead_notifications(organization_id,created_at desc);
create table private.staff_invitations(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 email text not null check(email=lower(trim(email)) and length(email)<=254 and email like '%@%'),
 role public.staff_role not null check(role in ('admin','staff')), staff_type text not null check(staff_type in ('estimator','office_manager','field_staff')),
 token_hash bytea not null unique, created_by uuid not null, created_at timestamptz not null default now(), expires_at timestamptz not null,
 accepted_at timestamptz, revoked_at timestamptz
);
create index invitation_tenant on private.staff_invitations(organization_id,created_at desc);
create table private.platform_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),actor_id uuid not null,
 action text not null, occurred_at timestamptz not null default now()
);
create index platform_event_time on private.platform_events(organization_id,occurred_at desc);
create trigger immutable_platform_events before update or delete on private.platform_events for each row execute function private.reject_audit_mutation();
create trigger no_platform_event_truncate before truncate on private.platform_events for each statement execute function private.reject_audit_mutation();

-- Replace broad staff CRM policies with capability- and assignment-based policies.
do $$ declare t text; cap text; begin
 foreach t in array array['customers','service_locations','intake_requests'] loop
  execute format('drop policy tenant_read on public.%I',t);
  execute format('drop policy tenant_insert on public.%I',t);
  execute format('drop policy tenant_update on public.%I',t);
  execute format('drop policy tenant_delete on public.%I',t);
  cap:=case when t='intake_requests' then 'intake' else 'crm' end;
  execute format('create policy tenant_delete on public.%I for delete to authenticated using(private.can(organization_id,%L) and private.has_role(organization_id,array[''owner'',''admin'']::public.staff_role[]))',t,cap);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check(private.can(organization_id,%L))',t,cap);
  execute format('create policy tenant_update on public.%I for update to authenticated using(private.can(organization_id,%L)) with check(private.can(organization_id,%L))',t,cap,cap);
 end loop;
end $$;
create policy tenant_read on public.customers for select to authenticated using(private.can(organization_id,'crm'));
create policy tenant_read on public.service_locations for select to authenticated using(private.can(organization_id,'crm'));
create policy tenant_read on public.intake_requests for select to authenticated using(private.can(organization_id,'intake') or (private.has_role(organization_id) and assigned_to=auth.uid() and exists(select 1 from public.company_modules cm where cm.organization_id=intake_requests.organization_id and cm.module='intake' and cm.enabled)));
drop policy documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated using(private.can(organization_id,'documents'));
drop policy organizations_update on public.organizations;
create policy organizations_update on public.organizations for update to authenticated using(private.can(id,'settings')) with check(private.can(id,'settings'));

alter table public.service_locations add constraint location_customer_unique unique(organization_id,id,customer_id);
alter table public.intake_requests add constraint intake_location_customer foreign key(organization_id,service_location_id,customer_id) references public.service_locations(organization_id,id,customer_id);

-- Sensitive intake workflow columns are changed only by the checked assignment RPC.
revoke update on public.intake_requests from authenticated;
grant update(summary,service_category,preferred_appointment,contact_preference) on public.intake_requests to authenticated;
-- Creation grants are column-limited to prevent fabricated timestamps and source attribution.
revoke insert on public.intake_requests from authenticated;
grant insert(organization_id,customer_id,service_location_id,summary,service_category,preferred_appointment,contact_preference) on public.intake_requests to authenticated;

do $$ declare t text; begin
 foreach t in array array['company_modules','company_settings','customer_notes','communication_consents','lead_notifications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['staff_invitations','platform_events'] loop execute format('alter table private.%I enable row level security',t); end loop;
end $$;
create policy modules_read on public.company_modules for select to authenticated using(private.has_role(organization_id) or private.is_platform_admin());
create policy settings_read on public.company_settings for select to authenticated using(private.can(organization_id,'settings'));
create policy settings_update on public.company_settings for update to authenticated using(private.can(organization_id,'settings')) with check(private.can(organization_id,'settings'));
grant update(business_address,contact_email,contact_phone,website,service_areas,specialties,license_metadata,insurance_metadata,estimate_prefix,estimate_next_number,default_terms,expiration_days,material_markup_bps,labor_rate_minor,currency,intake_enabled,service_categories) on public.company_settings to authenticated;
create policy notes_read on public.customer_notes for select to authenticated using(private.can(organization_id,'crm'));
create policy notes_insert on public.customer_notes for insert to authenticated with check(private.can(organization_id,'crm'));
grant insert(organization_id,customer_id,body) on public.customer_notes to authenticated;
create policy consent_read on public.communication_consents for select to authenticated using(private.can(organization_id,'crm'));
-- Recorded by checked RPC, never client-supplied actor, policy version or timestamp.
create policy notifications_read on public.lead_notifications for select to authenticated using(private.can(organization_id,'intake'));

create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
 declare r jsonb; org uuid; entity uuid;
 begin
  if TG_OP='DELETE' then r:=to_jsonb(old); else r:=to_jsonb(new); end if;
  org:=case when TG_TABLE_NAME='organizations' then (r->>'id')::uuid else (r->>'organization_id')::uuid end;
  entity:=coalesce((r->>'id')::uuid,(r->>'user_id')::uuid,org);
  insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(org,auth.uid(),lower(TG_OP),TG_TABLE_NAME,entity);
  if TG_OP='DELETE' then return old; end if; return new;
 end
$$;
do $$ declare t text; begin
 foreach t in array array['company_settings','company_modules','customer_notes','communication_consents'] loop
  execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
  execute format('create trigger immutable_tenant before update on public.%I for each row execute function private.prevent_tenant_move()',t);
 end loop;
end $$;
create trigger immutable_consents before update or delete on public.communication_consents for each row execute function private.reject_audit_mutation();

-- All privileged implementations live in private; public wrappers retain caller context.
create function private.provision_company(p_name text,p_slug text,p_industry public.industry_template,p_owner uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare org uuid;
 begin
  if not private.is_platform_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=p_owner and email_confirmed_at is not null) then raise exception 'Owner account is not eligible'; end if;
  insert into public.organizations(name,slug,industry,status) values(p_name,p_slug,p_industry,'onboarding') returning id into org;
  insert into public.memberships(organization_id,user_id,role) values(org,p_owner,'owner');
  insert into private.platform_events(organization_id,actor_id,action) values(org,auth.uid(),'organization.provisioned');
  return org;
 end
$$;
create function public.provision_company(p_name text,p_slug text,p_industry public.industry_template,p_owner uuid) returns uuid language sql security invoker set search_path='' as $$ select private.provision_company(p_name,p_slug,p_industry,p_owner) $$;
create function private.configure_company(p_org uuid,p_status text,p_plan text,p_modules jsonb,p_owner uuid default null) returns void language plpgsql security definer set search_path='' as $$
 declare item record;
 begin
  if not private.is_platform_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.organizations where id=p_org for update;
  if not found then raise exception 'Organization unavailable'; end if;
  if jsonb_typeof(p_modules)<>'object' or p_modules is null then raise exception 'Invalid modules'; end if;
  update public.organizations set status=p_status,subscription_plan=p_plan where id=p_org;
  for item in select * from jsonb_each(p_modules) loop
   if item.key not in ('crm','intake','team','settings','documents','estimates','contracts','invoices','payments') or jsonb_typeof(item.value)<>'boolean' then raise exception 'Invalid module'; end if;
   update public.company_modules set enabled=(item.value::text)::boolean where organization_id=p_org and module=item.key;
  end loop;
  if p_owner is not null then
   if not exists(select 1 from auth.users where id=p_owner and email_confirmed_at is not null) then raise exception 'Owner account is not eligible'; end if;
   insert into public.memberships(organization_id,user_id,role) values(p_org,p_owner,'owner') on conflict(organization_id,user_id) do update set role='owner',active=true;
  end if;
  insert into private.platform_events(organization_id,actor_id,action) values(p_org,auth.uid(),'organization.configured');
 end
$$;
create function public.configure_company(p_org uuid,p_status text,p_plan text,p_modules jsonb,p_owner uuid default null) returns void language sql security invoker set search_path='' as $$ select private.configure_company(p_org,p_status,p_plan,p_modules,p_owner) $$;
create function private.company_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
  if not private.is_platform_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('organization_id',o.id,'members',(select count(*) from public.memberships m where m.organization_id=o.id and active),'customers',(select count(*) from public.customers c where c.organization_id=o.id),'new_requests',(select count(*) from public.intake_requests i where i.organization_id=o.id and status='new'),'documents',(select count(*) from public.documents d where d.organization_id=o.id))) from public.organizations o),'[]'::jsonb);
 end
$$;
create function public.company_metrics() returns jsonb language sql stable security invoker set search_path='' as $$ select private.company_metrics() $$;
create function private.platform_activity() returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
  if not private.is_platform_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(r) from (select id,organization_id,actor_id,action,occurred_at from private.platform_events order by occurred_at desc limit 100) r),'[]'::jsonb);
 end
$$;
create function public.platform_activity() returns jsonb language sql stable security invoker set search_path='' as $$ select private.platform_activity() $$;

create function private.create_invitation(p_org uuid,p_email text,p_role public.staff_role,p_staff_type text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare invitation uuid; token text:=gen_random_uuid()::text; actor_role public.staff_role;
 begin
  if not private.can(p_org,'team') then raise exception 'Access denied' using errcode='42501'; end if;
  select role into actor_role from public.memberships where organization_id=p_org and user_id=auth.uid();
  if p_role='owner' or (p_role='admin' and actor_role<>'owner') then raise exception 'Role escalation denied' using errcode='42501'; end if;
  insert into private.staff_invitations(organization_id,email,role,staff_type,token_hash,created_by,expires_at)
   values(p_org,lower(trim(p_email)),p_role,p_staff_type,sha256(convert_to(token,'UTF8')),auth.uid(),now()+interval '72 hours') returning id into invitation;
  insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(p_org,auth.uid(),'invitation.created','staff_invitations',invitation);
  return jsonb_build_object('id',invitation,'token',token,'expires_in_hours',72);
 end
$$;
create function public.create_invitation(p_org uuid,p_email text,p_role public.staff_role,p_staff_type text) returns jsonb language sql security invoker set search_path='' as $$ select private.create_invitation(p_org,p_email,p_role,p_staff_type) $$;
create function private.list_invitations(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin
  if not private.can(p_org,'team') then raise exception 'Access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(r) from (select id,email,role,staff_type,expires_at,accepted_at,revoked_at from private.staff_invitations where organization_id=p_org order by created_at desc limit 100) r),'[]'::jsonb);
 end
$$;
create function public.list_invitations(p_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_invitations(p_org) $$;
create function private.accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
 declare invitation private.staff_invitations; verified_email text;
 begin
  if auth.uid() is null then raise exception 'Access denied' using errcode='42501'; end if;
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into invitation from private.staff_invitations where token_hash=sha256(convert_to(p_token,'UTF8')) for update;
  if invitation.id is null or verified_email is null or invitation.email<>verified_email or invitation.expires_at<=now() or invitation.accepted_at is not null or invitation.revoked_at is not null then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if not exists(select 1 from public.organizations where id=invitation.organization_id and status='active') or not exists(select 1 from public.company_modules where organization_id=invitation.organization_id and module='team' and enabled) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if not exists(select 1 from public.memberships where organization_id=invitation.organization_id and user_id=invitation.created_by and active and (role='owner' or (role='admin' and invitation.role='staff'))) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if invitation.role='admin' and coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA required' using errcode='42501'; end if;
  if exists(select 1 from public.memberships where organization_id=invitation.organization_id and user_id=auth.uid()) then raise exception 'Membership already exists'; end if;
  insert into public.memberships(organization_id,user_id,role,staff_type) values(invitation.organization_id,auth.uid(),invitation.role,invitation.staff_type);
  update private.staff_invitations set accepted_at=now() where id=invitation.id;
  insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(invitation.organization_id,auth.uid(),'invitation.accepted','staff_invitations',invitation.id);
  return invitation.organization_id;
 end
$$;
create function public.accept_invitation(p_token text) returns uuid language sql security invoker set search_path='' as $$ select private.accept_invitation(p_token) $$;
create function private.manage_member(p_org uuid,p_user uuid,p_active boolean,p_role public.staff_role,p_staff_type text) returns void language plpgsql security definer set search_path='' as $$
 declare actor public.staff_role; target public.staff_role;
 begin
  if not private.can(p_org,'team') or p_user=auth.uid() then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.organizations where id=p_org for update;
  select role into actor from public.memberships where organization_id=p_org and user_id=auth.uid();
  select role into target from public.memberships where organization_id=p_org and user_id=p_user for update;
  if target is null or target='owner' or p_role='owner' or (actor<>'owner' and (target='admin' or p_role='admin')) then raise exception 'Role escalation denied' using errcode='42501'; end if;
  update public.memberships set active=p_active,role=p_role,staff_type=p_staff_type where organization_id=p_org and user_id=p_user;
 end
$$;
create function public.manage_member(p_org uuid,p_user uuid,p_active boolean,p_role public.staff_role,p_staff_type text) returns void language sql security invoker set search_path='' as $$ select private.manage_member(p_org,p_user,p_active,p_role,p_staff_type) $$;
create function private.revoke_invitation(p_org uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
  if not private.can(p_org,'team') then raise exception 'Access denied' using errcode='42501'; end if;
  update private.staff_invitations set revoked_at=now() where id=p_id and organization_id=p_org and accepted_at is null;
  if not found then raise exception 'Invitation unavailable'; end if;
  insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id) values(p_org,auth.uid(),'invitation.revoked','staff_invitations',p_id);
 end
$$;
create function public.revoke_invitation(p_org uuid,p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.revoke_invitation(p_org,p_id) $$;
create function private.assign_intake(p_org uuid,p_id uuid,p_assignee uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
 begin
  if not private.can(p_org,'intake') then raise exception 'Access denied' using errcode='42501'; end if;
  if p_assignee is not null and not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_assignee and active) then raise exception 'Assignee unavailable'; end if;
  update public.intake_requests set assigned_to=p_assignee,status=p_status,updated_at=now() where organization_id=p_org and id=p_id;
  if not found then raise exception 'Request unavailable'; end if;
 end
$$;
create function public.assign_intake(p_org uuid,p_id uuid,p_assignee uuid,p_status text) returns void language sql security invoker set search_path='' as $$ select private.assign_intake(p_org,p_id,p_assignee,p_status) $$;
create function private.record_consent(p_org uuid,p_customer uuid,p_email boolean,p_sms boolean) returns void language plpgsql security definer set search_path='' as $$
 begin
  if not private.can(p_org,'crm') then raise exception 'Access denied' using errcode='42501'; end if;
  insert into public.communication_consents(organization_id,customer_id,email_allowed,sms_allowed,policy_version,source) values(p_org,p_customer,p_email,p_sms,'contact-v1','staff');
 end
$$;
create function public.record_consent(p_org uuid,p_customer uuid,p_email boolean,p_sms boolean) returns void language sql security invoker set search_path='' as $$ select private.record_consent(p_org,p_customer,p_email,p_sms) $$;

-- Explicitly enumerate every exported RPC grant; SECURITY DEFINER never in public.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('provision_company','configure_company','company_metrics','platform_activity','create_invitation','list_invitations','accept_invitation','manage_member','revoke_invitation','assign_intake','record_consent') loop
  execute format('revoke all on function %s from public,anon',f.sig);
  execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;

create table private.intake_gateway_keys(key_hash bytea primary key,active boolean not null default true);
create table private.intake_rate_limits(organization_id uuid not null references public.organizations(id),fingerprint text not null,window_start timestamptz not null,attempts integer not null,primary key(organization_id,fingerprint,window_start));
create table private.intake_submissions(organization_id uuid not null references public.organizations(id),idempotency_key uuid not null,payload_hash bytea not null,intake_request_id uuid not null,primary key(organization_id,idempotency_key));
alter table private.intake_gateway_keys enable row level security;
alter table private.intake_rate_limits enable row level security;
alter table private.intake_submissions enable row level security;

create function private.intake_profile(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',o.name,'slug',o.slug,'primary_color',o.primary_color,'accent_color',o.accent_color,'industry',o.industry,'service_categories',s.service_categories,'consent_version','contact-v1')
 from public.organizations o join public.company_settings s on s.organization_id=o.id
 where o.slug=p_slug and o.status='active' and s.intake_enabled
 and exists(select 1 from public.company_modules m where m.organization_id=o.id and module='intake' and enabled)
$$;
create function public.intake_profile(p_slug text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.intake_profile(p_slug) $$;

-- Capability-authenticated gateway, not a general anonymous insert API.
-- CAPTCHA and trusted IP hashing happen server-side before this RPC.
create function private.submit_intake_gateway(p_gateway_key text,p_slug text,p_payload jsonb,p_fingerprint text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare org uuid; customer uuid; location uuid; request_id uuid; attempts integer; prior bytea; categories text[]; payload_hash bytea:=sha256(convert_to(p_payload::text,'UTF8'));
 begin
  if p_gateway_key is null or length(p_gateway_key)<32 or not exists(select 1 from private.intake_gateway_keys where key_hash=sha256(convert_to(p_gateway_key,'UTF8')) and active) then raise exception 'Gateway unavailable' using errcode='42501'; end if;
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_key is null then raise exception 'Invalid gateway request'; end if;
  select o.id,s.service_categories into org,categories from public.organizations o join public.company_settings s on s.organization_id=o.id where o.slug=p_slug and o.status='active' and s.intake_enabled
   and exists(select 1 from public.company_modules m where m.organization_id=o.id and module='intake' and enabled);
  if org is null then return jsonb_build_object('status','unavailable'); end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16000 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','email','phone','address','city','region','postal_code','country_code','property_type','service_category','description','preferred_appointment','contact_preference','email_consent','sms_consent','consent_version')) then raise exception 'Invalid intake'; end if;
  if coalesce(length(trim(p_payload->>'name')),0) not between 1 and 200
   or coalesce(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_payload->>'email')>254
   or coalesce(length(p_payload->>'phone'),0) not between 5 and 40
   or coalesce(length(trim(p_payload->>'address')),0) not between 1 and 500
   or coalesce(length(trim(p_payload->>'city')),0) not between 1 and 120
   or coalesce(length(trim(p_payload->>'region')),0) not between 1 and 120
   or coalesce(length(p_payload->>'postal_code'),0) not between 1 and 30
   or coalesce(p_payload->>'country_code','') !~ '^[A-Z]{2}$'
   or coalesce(p_payload->>'property_type','') not in ('residential','commercial')
   or not coalesce((p_payload->>'service_category')=any(categories),false)
   or coalesce(length(trim(p_payload->>'description')),0) not between 10 and 5000
   or coalesce(length(p_payload->>'preferred_appointment'),0)>500
   or coalesce(p_payload->>'contact_preference','') not in ('email','phone','sms')
   or coalesce(jsonb_typeof(p_payload->'email_consent'),'')<>'boolean'
   or coalesce(jsonb_typeof(p_payload->'sms_consent'),'')<>'boolean'
   or coalesce(p_payload->>'consent_version','')<>'contact-v1'
   or (p_payload->>'contact_preference'='sms' and p_payload->>'sms_consent'<>'true')
   or (p_payload->>'contact_preference'='email' and p_payload->>'email_consent'<>'true') then raise exception 'Invalid intake'; end if;
  -- Serialize same-company submissions to enforce idempotency without duplicate CRM rows.
  perform pg_advisory_xact_lock(hashtextextended(org::text,0));
  select s.payload_hash into prior from private.intake_submissions s where s.organization_id=org and idempotency_key=p_key;
  if found then
   if prior<>payload_hash then raise exception 'Idempotency key conflict'; end if;
   return jsonb_build_object('status','accepted');
  end if;
  insert into private.intake_rate_limits(organization_id,fingerprint,window_start,attempts) values(org,p_fingerprint,date_trunc('minute',now()),1)
   on conflict(organization_id,fingerprint,window_start) do update set attempts=private.intake_rate_limits.attempts+1 returning private.intake_rate_limits.attempts into attempts;
  if attempts>5 or (select coalesce(sum(r.attempts),0) from private.intake_rate_limits r where r.organization_id=org and r.fingerprint=p_fingerprint and r.window_start>now()-interval '1 hour')>30 then return jsonb_build_object('status','rate_limited'); end if;
  -- Never auto-merge based on unverified public contact details. Staff identify duplicates in-tenant.
  insert into public.customers(organization_id,display_name,email,phone,customer_type,preferred_contact) values(org,trim(p_payload->>'name'),lower(trim(p_payload->>'email')),p_payload->>'phone',p_payload->>'property_type',p_payload->>'contact_preference') returning id into customer;
  insert into public.service_locations(organization_id,customer_id,address_line1,city,region,postal_code,country_code) values(org,customer,p_payload->>'address',p_payload->>'city',p_payload->>'region',p_payload->>'postal_code',p_payload->>'country_code') returning id into location;
  insert into public.intake_requests(organization_id,customer_id,service_location_id,summary,source,service_category,preferred_appointment,contact_preference) values(org,customer,location,p_payload->>'description','website',p_payload->>'service_category',coalesce(p_payload->>'preferred_appointment',''),p_payload->>'contact_preference') returning id into request_id;
  insert into public.communication_consents(organization_id,customer_id,email_allowed,sms_allowed,policy_version,source,recorded_by) values(org,customer,(p_payload->>'email_consent')::boolean,(p_payload->>'sms_consent')::boolean,'contact-v1','website',null);
  insert into public.lead_notifications(organization_id,intake_request_id) values(org,request_id);
  insert into private.intake_submissions values(org,p_key,payload_hash,request_id);
  delete from private.intake_rate_limits where window_start<now()-interval '2 hours';
  return jsonb_build_object('status','accepted');
 end
$$;
create function public.submit_intake_gateway(p_gateway_key text,p_slug text,p_payload jsonb,p_fingerprint text,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.submit_intake_gateway(p_gateway_key,p_slug,p_payload,p_fingerprint,p_key) $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('intake_profile','submit_intake_gateway') loop
  execute format('revoke all on function %s from public',f.sig);
  execute format('grant execute on function %s to anon,authenticated',f.sig);
 end loop;
end $$;
-- Anonymous schema usage is needed only to reach the capability/profile functions.
-- No private tables or unrelated private functions are granted.
grant usage on schema private to anon;

-- Validate logo references; uploads remain denied until a scanner exists.
create function private.validate_company_logo() returns trigger language plpgsql security definer set search_path='' as $$
 begin
  if new.logo_document_id is not null and not exists(select 1 from public.documents where organization_id=new.id and id=new.logo_document_id and scan_status='clean' and content_type in ('image/jpeg','image/png','image/webp')) then raise exception 'Logo must be a clean company image'; end if;
  return new;
 end
$$;
revoke all on function private.validate_company_logo() from public,anon,authenticated;
create trigger valid_company_logo before insert or update of logo_document_id on public.organizations for each row execute function private.validate_company_logo();
create function public.save_company_profile(p_org uuid,p_profile jsonb,p_settings jsonb) returns void language plpgsql security invoker set search_path='' as $$
 declare s public.company_settings; o public.organizations;
 begin
  if not private.can(p_org,'settings') then raise exception 'Access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_profile)<>'object' or jsonb_typeof(p_settings)<>'object' or p_profile is null or p_settings is null
   or exists(select 1 from jsonb_object_keys(p_profile) k where k not in ('name','industry','primary_color','accent_color','logo_document_id'))
   or exists(select 1 from jsonb_object_keys(p_settings) k where k not in ('business_address','contact_email','contact_phone','website','service_areas','specialties','license_metadata','insurance_metadata','estimate_prefix','estimate_next_number','default_terms','expiration_days','material_markup_bps','labor_rate_minor','currency','intake_enabled','service_categories')) then raise exception 'Invalid settings'; end if;
  select * into o from public.organizations where id=p_org for update;
  select * into s from public.company_settings where organization_id=p_org for update;
  if s.organization_id is null then raise exception 'Settings unavailable'; end if;
  o:=jsonb_populate_record(o,p_profile); s:=jsonb_populate_record(s,p_settings);
  update public.organizations set name=o.name,industry=o.industry,primary_color=o.primary_color,accent_color=o.accent_color,logo_document_id=o.logo_document_id where id=p_org;
  update public.company_settings set business_address=s.business_address,contact_email=s.contact_email,contact_phone=s.contact_phone,website=s.website,service_areas=s.service_areas,specialties=s.specialties,license_metadata=s.license_metadata,insurance_metadata=s.insurance_metadata,estimate_prefix=s.estimate_prefix,estimate_next_number=s.estimate_next_number,default_terms=s.default_terms,expiration_days=s.expiration_days,material_markup_bps=s.material_markup_bps,labor_rate_minor=s.labor_rate_minor,currency=s.currency,intake_enabled=s.intake_enabled,service_categories=s.service_categories where organization_id=p_org;
 end
$$;
revoke all on function public.save_company_profile(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_company_profile(uuid,jsonb,jsonb) to authenticated;

revoke all on all tables in schema private from public,anon,authenticated;
alter table private.intake_submissions add constraint submission_request_tenant foreign key(organization_id,intake_request_id) references public.intake_requests(organization_id,id);
alter table public.service_locations add constraint location_field_bounds check(length(address_line1) between 1 and 500 and coalesce(length(address_line2),0)<=500 and length(city) between 1 and 120 and length(region) between 1 and 120 and length(postal_code) between 1 and 30);
create function private.revoke_owner(p_org uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
  if not private.is_platform_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from public.organizations where id=p_org for update;
  if (select count(*) from public.memberships where organization_id=p_org and role='owner' and active)<=1 then raise exception 'An active owner must remain'; end if;
  update public.memberships set active=false where organization_id=p_org and user_id=p_user and role='owner' and active;
  if not found then raise exception 'Owner unavailable'; end if;
  insert into private.platform_events(organization_id,actor_id,action) values(p_org,auth.uid(),'owner.revoked');
 end
$$;
create function public.revoke_owner(p_org uuid,p_user uuid) returns void language sql security invoker set search_path='' as $$ select private.revoke_owner(p_org,p_user) $$;
revoke all on function private.revoke_owner(uuid,uuid),public.revoke_owner(uuid,uuid) from public,anon;
grant execute on function private.revoke_owner(uuid,uuid),public.revoke_owner(uuid,uuid) to authenticated;

-- Narrow column grants also protect IDs, creation timestamps and provenance.
revoke insert,update on public.customers,public.service_locations from authenticated;
grant insert(organization_id,display_name,email,phone,customer_type,preferred_contact) on public.customers to authenticated;
grant update(display_name,email,phone,customer_type,preferred_contact) on public.customers to authenticated;
grant insert(organization_id,customer_id,address_line1,address_line2,city,region,postal_code,country_code) on public.service_locations to authenticated;
grant update(address_line1,address_line2,city,region,postal_code,country_code) on public.service_locations to authenticated;
alter table public.company_settings add constraint nonempty_categories check(array_position(service_categories,null) is null and not (''=any(service_categories)));
alter table public.communication_consents alter column recorded_at set default clock_timestamp();
commit;
