-- Reviewed foundation only. Apply to disposable development databases first.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create type public.staff_role as enum ('owner','admin','staff');
create type public.industry_template as enum ('property_services','construction','roofing');

create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(name) between 1 and 160),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 industry public.industry_template not null,
 primary_color text not null default '#247364' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
 accent_color text not null default '#dfb461' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
 business_info jsonb not null default '{}' check (jsonb_typeof(business_info) = 'object'),
 logo_document_id uuid,
 created_at timestamptz not null default now()
);
create table public.memberships (
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id),
 role public.staff_role not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key (organization_id,user_id)
);
create index memberships_user on public.memberships(user_id,organization_id) where active;
create table private.platform_admins (
 user_id uuid primary key references auth.users(id), active boolean not null default true
);
alter table private.platform_admins enable row level security;

-- Narrow internal lookup avoids recursive membership policies. No client mutation grants.
-- Authorization uses database rows and signed AAL, never user-editable metadata.
create function private.has_role(org uuid, roles public.staff_role[] default array['owner','admin','staff']::public.staff_role[])
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.memberships m where m.organization_id = org
  and m.user_id = auth.uid() and m.active and m.role = any(roles)
  and (m.role = 'staff' or coalesce(auth.jwt()->>'aal','') = 'aal2')
 )
$$;
revoke all on function private.has_role(uuid, public.staff_role[]) from public, anon;
grant execute on function private.has_role(uuid, public.staff_role[]) to authenticated;
create function private.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'aal','') = 'aal2'
 and exists(select 1 from private.platform_admins p where p.user_id = auth.uid() and p.active)
$$;
revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;
create function public.platform_access() returns boolean language sql stable security invoker set search_path = '' as $$
 select private.is_platform_admin()
$$;
revoke all on function public.platform_access() from public, anon;
grant execute on function public.platform_access() to authenticated;

create table public.customers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 display_name text not null check (length(display_name) between 1 and 200),
 email text check(email is null or length(email) <= 254), phone text check(phone is null or length(phone) <= 40),
 created_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.service_locations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 customer_id uuid not null, address_line1 text not null, address_line2 text,
 city text not null, region text not null, postal_code text not null, country_code text not null check(country_code ~ '^[A-Z]{2}$'),
 created_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create table public.intake_requests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 customer_id uuid, service_location_id uuid, assigned_to uuid,
 summary text not null check(length(summary) between 1 and 5000),
 status text not null default 'new' check(status in ('new','reviewing','qualified','closed')),
 source text not null default 'staff' check(source in ('staff','website')),
 created_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,service_location_id) references public.service_locations(organization_id,id),
 foreign key(organization_id,assigned_to) references public.memberships(organization_id,user_id)
);
create table public.documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_name text not null unique,
 display_name text not null check(length(display_name) between 1 and 255),
 content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 byte_size bigint not null check(byte_size between 1 and 10485760),
 visibility text not null default 'internal' check(visibility in ('internal','customer')),
 scan_status text not null default 'quarantined' check(scan_status in ('quarantined','clean','rejected')),
 created_at timestamptz not null default now(), unique(organization_id,id),
 check(object_name = organization_id::text || '/' || id::text)
);
alter table public.organizations add constraint tenant_logo foreign key(id,logo_document_id) references public.documents(organization_id,id);
create table public.activity_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid, action text not null, entity_type text not null, entity_id uuid not null,
 occurred_at timestamptz not null default now()
);
create index activity_tenant_time on public.activity_events(organization_id,occurred_at desc);
-- Non-secret routing metadata only; no bank details, PAN, CVV or provider credentials.
create table private.merchant_configurations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 provider text not null, merchant_reference text not null,
 environment text not null check(environment in ('sandbox','live')),
 status text not null default 'pending_review' check(status in ('pending_review','approved','suspended')),
 unique(organization_id,provider,environment)
);
alter table private.merchant_configurations enable row level security;

-- Remove inherited/default API grants before opening narrow access paths.
revoke all on public.organizations, public.memberships, public.customers, public.service_locations,
 public.intake_requests, public.documents, public.activity_events from anon, authenticated;
grant select on public.organizations, public.memberships, public.customers, public.service_locations,
 public.intake_requests, public.documents, public.activity_events to authenticated;
grant update(name,industry,primary_color,accent_color,business_info,logo_document_id) on public.organizations to authenticated;
grant insert, update, delete on public.customers, public.service_locations, public.intake_requests to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.service_locations enable row level security;
alter table public.intake_requests enable row level security;
alter table public.documents enable row level security;
alter table public.activity_events enable row level security;
create policy organizations_read on public.organizations for select to authenticated
 using(private.has_role(id) or private.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
 using(private.has_role(id,array['owner','admin']::public.staff_role[]))
 with check(private.has_role(id,array['owner','admin']::public.staff_role[]));
create policy memberships_read on public.memberships for select to authenticated using(private.has_role(organization_id));

-- Every child reference includes organization_id; IDs alone never establish ownership.
do $$ declare t text; begin
 foreach t in array array['customers','service_locations','intake_requests'] loop
  execute format('create index %I on public.%I(organization_id)', t || '_tenant',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using(private.has_role(organization_id))',t);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check(private.has_role(organization_id))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using(private.has_role(organization_id)) with check(private.has_role(organization_id))',t);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using(private.has_role(organization_id,array[''owner'',''admin'']::public.staff_role[]))',t);
 end loop;
end $$;
create policy documents_read on public.documents for select to authenticated using(private.has_role(organization_id));
create index documents_tenant on public.documents(organization_id);
create policy activity_read on public.activity_events for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']::public.staff_role[]));

-- Tenant ownership is immutable, even for users with memberships in both companies.
create function private.prevent_tenant_move() returns trigger language plpgsql set search_path = '' as $$
 begin
  if new.organization_id is distinct from old.organization_id then
   raise exception 'Tenant ownership is immutable';
  end if;
  return new;
 end
$$;
revoke all on function private.prevent_tenant_move() from public, anon, authenticated;
do $$ declare t text; begin
 foreach t in array array['memberships','customers','service_locations','intake_requests','documents','merchant_configurations'] loop
  execute format('create trigger immutable_tenant before update on %I.%I for each row execute function private.prevent_tenant_move()',case when t = 'merchant_configurations' then 'private' else 'public' end,t);
 end loop;
end $$;

-- Append audit metadata atomically, without duplicating customer PII into logs.
create function private.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
 declare record_data jsonb; org uuid; entity uuid;
 begin
  if TG_OP = 'DELETE' then record_data := to_jsonb(old); else record_data := to_jsonb(new); end if;
  if TG_TABLE_NAME = 'organizations' then org := (record_data->>'id')::uuid;
  else org := (record_data->>'organization_id')::uuid; end if;
  entity := coalesce((record_data->>'id')::uuid,(record_data->>'user_id')::uuid);
  insert into public.activity_events(organization_id,actor_id,action,entity_type,entity_id)
   values(org,auth.uid(),lower(TG_OP),TG_TABLE_NAME,entity);
  if TG_OP = 'DELETE' then return old; end if;
  return new;
 end
$$;
revoke all on function private.audit_change() from public, anon, authenticated;
do $$ declare t text; begin
 foreach t in array array['organizations','memberships','customers','service_locations','intake_requests','documents','merchant_configurations'] loop
  execute format('create trigger audit_change after insert or update or delete on %I.%I for each row execute function private.audit_change()',case when t = 'merchant_configurations' then 'private' else 'public' end,t);
 end loop;
end $$;
create function private.reject_audit_mutation() returns trigger language plpgsql set search_path = '' as $$
 begin raise exception 'Activity events are append-only'; end
$$;
revoke all on function private.reject_audit_mutation() from public, anon, authenticated;
create trigger immutable_activity before update or delete on public.activity_events for each row execute function private.reject_audit_mutation();
create trigger no_activity_truncate before truncate on public.activity_events for each statement execute function private.reject_audit_mutation();

-- No browser uploads or object mutations until server quarantine/scanning exists.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('company-documents','company-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy clean_tenant_documents on storage.objects for select to authenticated using(
 bucket_id = 'company-documents' and exists (
  select 1 from public.documents d where d.object_name = name and d.scan_status = 'clean'
  and private.has_role(d.organization_id)
 )
);
commit;
