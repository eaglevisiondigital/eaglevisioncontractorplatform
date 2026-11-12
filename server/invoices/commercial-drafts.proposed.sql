-- UNAPPLIED FORWARD PROPOSAL. Draft records only; no invoice issuance, debt, payment,
-- customer publication, application factory or route. Separate exact installation
-- and D1/D2/D3 authorization remain mandatory. Native disposable fixtures only now.
begin;
create role propel_commercial_draft_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role propel_commercial_draft_runtime nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema private,public,auth to propel_commercial_draft_owner;
grant create on schema private to propel_commercial_draft_owner;
grant usage on schema private to propel_commercial_draft_runtime;
grant execute on function auth.uid(),auth.jwt() to propel_commercial_draft_owner;
-- SELECT FOR SHARE requires UPDATE privilege on at least one column. These exact
-- column grants belong only to a trusted NOLOGIN definer owner, never runtime.
grant select(id,email_confirmed_at,deleted_at,is_anonymous,banned_until) on auth.users to propel_commercial_draft_owner;
grant select(id,user_id,not_after) on auth.sessions to propel_commercial_draft_owner;
grant select(id,status) on public.organizations to propel_commercial_draft_owner;
grant select(organization_id,user_id,active,role) on public.memberships to propel_commercial_draft_owner;
grant select(id,organization_id) on public.customers to propel_commercial_draft_owner;
grant select(id,organization_id,customer_id) on public.service_locations to propel_commercial_draft_owner;
grant select(id,organization_id,status,current_version_id) on public.estimates to propel_commercial_draft_owner;
grant select on public.estimate_versions to propel_commercial_draft_owner;
grant update(id) on auth.users,auth.sessions,public.organizations,public.customers,public.service_locations,public.estimates,public.estimate_versions to propel_commercial_draft_owner;
grant update(user_id) on public.memberships to propel_commercial_draft_owner;
-- Existing source rows remain private to current callers; only the new NOLOGIN
-- owner gains these finite source-reading policies, with command Auth checks below.
create policy commercial_draft_source on public.organizations for select to propel_commercial_draft_owner using(true);
create policy commercial_draft_source on public.memberships for select to propel_commercial_draft_owner using(true);
create policy commercial_draft_source on public.customers for select to propel_commercial_draft_owner using(true);
create policy commercial_draft_source on public.service_locations for select to propel_commercial_draft_owner using(true);
create policy commercial_draft_source on public.estimates for select to propel_commercial_draft_owner using(true);
create policy commercial_draft_source on public.estimate_versions for select to propel_commercial_draft_owner using(true);

-- Row-lock qualification only: actual source updates remain denied by WITH CHECK(false).
create policy commercial_draft_source_lock on public.organizations for update to propel_commercial_draft_owner using(true) with check(false);
create policy commercial_draft_source_lock on public.memberships for update to propel_commercial_draft_owner using(true) with check(false);
create policy commercial_draft_source_lock on public.customers for update to propel_commercial_draft_owner using(true) with check(false);
create policy commercial_draft_source_lock on public.service_locations for update to propel_commercial_draft_owner using(true) with check(false);
create policy commercial_draft_source_lock on public.estimates for update to propel_commercial_draft_owner using(true) with check(false);
create policy commercial_draft_source_lock on public.estimate_versions for update to propel_commercial_draft_owner using(true) with check(false);

create table private.commercial_draft_authorities(
 organization_id uuid not null references public.organizations(id),actor_id uuid not null references auth.users(id),
 expires_at timestamptz not null,revoked_at timestamptz,review_reference text not null check(length(trim(review_reference)) between 1 and 500),
 primary key(organization_id,actor_id)
);
create table private.commercial_invoice_drafts(
 organization_id uuid not null references public.organizations(id),id uuid not null,customer_id uuid not null,location_id uuid,
 source_version_id uuid not null,source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 currency text not null check(currency='USD'),amount_minor bigint not null check(amount_minor between 0 and 9000000000000),
 current_revision integer not null check(current_revision>0),created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,id),unique(organization_id,source_version_id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,location_id,customer_id) references public.service_locations(organization_id,id,customer_id),
 foreign key(organization_id,source_version_id) references public.estimate_versions(organization_id,id)
);
create index commercial_draft_customer on private.commercial_invoice_drafts(organization_id,customer_id,id);
create index commercial_draft_location on private.commercial_invoice_drafts(organization_id,location_id,customer_id);
create index commercial_draft_source on private.commercial_invoice_drafts(organization_id,source_version_id);
create table private.commercial_invoice_draft_revisions(
 organization_id uuid not null,invoice_id uuid not null,revision integer not null check(revision>0),
 title text not null check(length(trim(title)) between 1 and 200 and length(title)<=200 and octet_length(title)<=800),memo text not null check(length(memo)<=2000),
 actor_id uuid not null references auth.users(id),recorded_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,invoice_id,revision),
 foreign key(organization_id,invoice_id) references private.commercial_invoice_drafts(organization_id,id)
);
alter table private.commercial_invoice_drafts add foreign key(organization_id,id,current_revision)
 references private.commercial_invoice_draft_revisions(organization_id,invoice_id,revision) deferrable initially deferred;
create table private.commercial_invoice_draft_receipts(
 organization_id uuid not null,command_id uuid not null,invoice_id uuid not null,revision integer not null,
 actor_id uuid not null references auth.users(id),request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,command_id),unique(organization_id,invoice_id,revision),
 foreign key(organization_id,invoice_id,revision) references private.commercial_invoice_draft_revisions(organization_id,invoice_id,revision)
);
do $$declare t text;begin
 foreach t in array array['commercial_draft_authorities','commercial_invoice_drafts','commercial_invoice_draft_revisions','commercial_invoice_draft_receipts'] loop
 execute format('alter table private.%I owner to propel_commercial_draft_owner',t);
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role,propel_commercial_draft_runtime',t);
 execute format('create policy owner_only on private.%I for all to propel_commercial_draft_owner using(true) with check(true)',t);
 end loop;
end$$;
create function private.commercial_draft_immutable() returns trigger language plpgsql set search_path='' as $$begin
 raise exception 'Commercial draft audit history is immutable' using errcode='42501';
end$$;
alter function private.commercial_draft_immutable() owner to propel_commercial_draft_owner;
revoke all on function private.commercial_draft_immutable() from public,anon,authenticated,service_role;
create trigger immutable_revision before update or delete on private.commercial_invoice_draft_revisions for each row execute function private.commercial_draft_immutable();
create trigger immutable_receipt before update or delete on private.commercial_invoice_draft_receipts for each row execute function private.commercial_draft_immutable();

create function private.commercial_draft_actor(p_org uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();session_id uuid;claims jsonb:=auth.jwt();begin
 if actor is null or claims->>'aal' is distinct from 'aal2' or jsonb_typeof(claims->'exp') is distinct from 'number' then raise exception 'Current AAL2 invoice draft actor required' using errcode='42501';end if;
 begin session_id:=(claims->>'session_id')::uuid;exception when others then raise exception 'Current invoice draft session required' using errcode='42501';end;
 perform 1 from public.organizations where id=p_org and status='active' for share;if not found then raise exception 'Draft organization denied' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and email_confirmed_at is not null and deleted_at is null and not is_anonymous and (banned_until is null or banned_until<=clock_timestamp()) for share;if not found then raise exception 'Current invoice actor denied' using errcode='42501';end if;
 perform 1 from auth.sessions where id=session_id and user_id=actor and (not_after is null or not_after>clock_timestamp()) for share;if not found then raise exception 'Current invoice session denied' using errcode='42501';end if;
 perform 1 from public.memberships where organization_id=p_org and user_id=actor and active and role in ('owner','admin') for share;if not found then raise exception 'Current invoice membership denied' using errcode='42501';end if;
 perform 1 from private.commercial_draft_authorities where organization_id=p_org and actor_id=actor and revoked_at is null and expires_at>clock_timestamp() for share;if not found then raise exception 'Reviewed invoice draft authority required' using errcode='42501';end if;
 if (claims->>'exp')::numeric<=extract(epoch from clock_timestamp()) or not exists(select 1 from auth.sessions where id=session_id and user_id=actor and (not_after is null or not_after>clock_timestamp())) or not exists(select 1 from private.commercial_draft_authorities where organization_id=p_org and actor_id=actor and revoked_at is null and expires_at>clock_timestamp()) then raise exception 'Invoice draft authority expired after wait' using errcode='42501';end if;
 return actor;
end$$;
alter function private.commercial_draft_actor(uuid) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_draft_actor(uuid) from public,anon,authenticated,service_role,propel_commercial_draft_runtime;

create function private.commercial_draft_projection(p_org uuid,p_invoice uuid,p_command uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare h private.commercial_invoice_drafts;r private.commercial_invoice_draft_revisions;c private.commercial_invoice_draft_receipts;begin
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice;
 if not found then raise exception 'Exact invoice draft unavailable' using errcode='42501';end if;
 if p_command is null then
 select * into r from private.commercial_invoice_draft_revisions where organization_id=p_org and invoice_id=p_invoice and revision=h.current_revision;
 select * into c from private.commercial_invoice_draft_receipts where organization_id=p_org and invoice_id=p_invoice and revision=h.current_revision;
 else
 select * into c from private.commercial_invoice_draft_receipts where organization_id=p_org and invoice_id=p_invoice and command_id=p_command;
 if not found then raise exception 'Exact draft command receipt unavailable' using errcode='42501';end if;
 select * into r from private.commercial_invoice_draft_revisions where organization_id=p_org and invoice_id=p_invoice and revision=c.revision;
 end if;
 if r.revision is null or c.command_id is null then raise exception 'Incomplete invoice draft receipt' using errcode='42501';end if;
 return jsonb_build_object('invoiceId',h.id,'organizationId',h.organization_id,'customerId',h.customer_id,'locationId',h.location_id,'sourceVersionId',h.source_version_id,'sourceHash',h.source_hash,
 'sourceCurrent',exists(select 1 from public.estimate_versions original where original.id=h.source_version_id and original.organization_id=h.organization_id and original.status='issued' and exists(select 1 from public.estimates parent where parent.organization_id=original.organization_id and parent.id=original.estimate_id and parent.status='issued' and parent.current_version_id=original.id) and original.customer_id=h.customer_id and original.location_id is not distinct from h.location_id and original.payload->>'currency'=h.currency and (original.calculation->>'total_minor')::numeric=h.amount_minor and encode(sha256(convert_to(jsonb_build_object('version',original.id,'customer',original.customer_id,'location',original.location_id,'payload',original.payload,'calculation',original.calculation,'tax_policy',original.tax_policy_snapshot)::text,'UTF8')),'hex')=h.source_hash and not exists(select 1 from public.estimate_versions newer where newer.organization_id=h.organization_id and newer.estimate_id=original.estimate_id and newer.status='issued' and newer.version_number>original.version_number)),
 'revision',r.revision,'title',r.title,'memo',r.memo,'currency',h.currency,'amountMinor',h.amount_minor,'state','draft',
 'receipt',jsonb_build_object('id',c.command_id,'invoiceId',h.id,'organizationId',h.organization_id,'customerId',h.customer_id,'sourceVersionId',h.source_version_id,'commandId',c.command_id,'revision',c.revision,'requestHash',c.request_hash,'actorId',c.actor_id));
end$$;
alter function private.commercial_draft_projection(uuid,uuid,uuid) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_draft_projection(uuid,uuid,uuid) from public,anon,authenticated,service_role,propel_commercial_draft_runtime;

create function private.commercial_invoice_draft_write(p_org uuid,p_invoice uuid,p_command uuid,p_expected_revision integer,p_customer uuid,p_location uuid,p_version uuid,p_title text,p_memo text) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare actor uuid;v public.estimate_versions;h private.commercial_invoice_drafts;c private.commercial_invoice_draft_receipts;hash text;source_hash text;next_revision integer;begin
 actor:=private.commercial_draft_actor(p_org);
 if p_invoice is null or p_command is null or p_version is null or p_expected_revision is null or p_expected_revision<0 or p_customer is null or p_title is null or length(p_title)>200 or octet_length(p_title)>800 or length(trim(p_title)) not between 1 and 200 or p_memo is null or length(p_memo)>2000 then raise exception 'Invalid invoice draft command';end if;
 -- Serialize the original command even before invoice creation; this is ordinary
 -- DB transaction locking, not independent rollback-resistant one-use custody.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||'/'||p_command::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||'/'||p_invoice::text,0));
 actor:=private.commercial_draft_actor(p_org);
 hash:=encode(sha256(convert_to(jsonb_build_array(p_org,p_invoice,p_command,p_expected_revision,p_customer,p_location,p_version,p_title,p_memo,actor)::text,'UTF8')),'hex');
 select * into c from private.commercial_invoice_draft_receipts where organization_id=p_org and command_id=p_command;
 if found then
 if c.invoice_id<>p_invoice or c.actor_id<>actor or c.request_hash<>hash then raise exception 'Invoice draft command identity conflict' using errcode='40001';end if;
 return private.commercial_draft_projection(p_org,p_invoice,p_command);
 end if;
 select * into v from public.estimate_versions where organization_id=p_org and id=p_version;
 if not found then raise exception 'Exact issued source unavailable' using errcode='42501';end if;
 perform 1 from public.estimates where organization_id=p_org and id=v.estimate_id and status='issued' and current_version_id=p_version for share;
 if not found then raise exception 'Current issued estimate parent required' using errcode='42501';end if;
 select * into v from public.estimate_versions where organization_id=p_org and id=p_version and status='issued' for share;
 if not found or v.customer_id is distinct from p_customer or v.location_id is distinct from p_location or v.payload->>'currency' is distinct from 'USD' or v.calculation->>'total_minor' is null or (v.calculation->>'total_minor')::numeric not between 0 and 9000000000000 or trunc((v.calculation->>'total_minor')::numeric)<>(v.calculation->>'total_minor')::numeric then raise exception 'Current USD issued source required' using errcode='42501';end if;
 if exists(select 1 from public.estimate_versions where organization_id=p_org and estimate_id=v.estimate_id and status='issued' and version_number>v.version_number) then raise exception 'Invoice draft source superseded' using errcode='40001';end if;
 perform 1 from public.customers where organization_id=p_org and id=v.customer_id for share;if not found then raise exception 'Current source customer required' using errcode='42501';end if;
 if v.location_id is not null then perform 1 from public.service_locations where organization_id=p_org and id=v.location_id and customer_id=v.customer_id for share;if not found then raise exception 'Current source property required' using errcode='42501';end if;end if;
 source_hash:=encode(sha256(convert_to(jsonb_build_object('version',v.id,'customer',v.customer_id,'location',v.location_id,'payload',v.payload,'calculation',v.calculation,'tax_policy',v.tax_policy_snapshot)::text,'UTF8')),'hex');
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice for update;
 if p_expected_revision=0 then
 if found then raise exception 'Invoice draft already exists' using errcode='40001';end if;
 insert into private.commercial_invoice_drafts(organization_id,id,customer_id,location_id,source_version_id,source_hash,currency,amount_minor,current_revision,created_by)
 values(p_org,p_invoice,v.customer_id,v.location_id,v.id,source_hash,'USD',(v.calculation->>'total_minor')::bigint,1,actor);
 next_revision:=1;
 else
 if not found or h.current_revision<>p_expected_revision or h.source_version_id<>p_version or h.source_hash<>source_hash or h.customer_id<>v.customer_id or h.location_id is distinct from v.location_id then raise exception 'Invoice draft source or revision changed' using errcode='40001';end if;
 next_revision:=p_expected_revision+1;
 end if;
 actor:=private.commercial_draft_actor(p_org);
 insert into private.commercial_invoice_draft_revisions(organization_id,invoice_id,revision,title,memo,actor_id) values(p_org,p_invoice,next_revision,p_title,p_memo,actor);
 insert into private.commercial_invoice_draft_receipts(organization_id,command_id,invoice_id,revision,actor_id,request_hash) values(p_org,p_command,p_invoice,next_revision,actor,hash);
 if p_expected_revision>0 then update private.commercial_invoice_drafts set current_revision=next_revision where organization_id=p_org and id=p_invoice;end if;
 return private.commercial_draft_projection(p_org,p_invoice,p_command);
end$$;
alter function private.commercial_invoice_draft_write(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_invoice_draft_write(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role,propel_commercial_draft_runtime;
create function private.commercial_invoice_draft_create(p_org uuid,p_invoice uuid,p_command uuid,p_customer uuid,p_location uuid,p_version uuid,p_title text,p_memo text) returns jsonb language sql security definer set search_path='' as $$select private.commercial_invoice_draft_write(p_org,p_invoice,p_command,0,p_customer,p_location,p_version,p_title,p_memo)$$;
create function private.commercial_invoice_draft_save(p_org uuid,p_invoice uuid,p_command uuid,p_expected_revision integer,p_customer uuid,p_location uuid,p_version uuid,p_title text,p_memo text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if p_expected_revision is null or p_expected_revision<1 then raise exception 'Saved revision required';end if;
 return private.commercial_invoice_draft_write(p_org,p_invoice,p_command,p_expected_revision,p_customer,p_location,p_version,p_title,p_memo);
end$$;
create function private.commercial_invoice_draft_read(p_org uuid,p_invoice uuid,p_command uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$begin
 perform private.commercial_draft_actor(p_org);
 return private.commercial_draft_projection(p_org,p_invoice,p_command);
end$$;
alter function private.commercial_invoice_draft_create(uuid,uuid,uuid,uuid,uuid,uuid,text,text) owner to propel_commercial_draft_owner;
alter function private.commercial_invoice_draft_save(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text) owner to propel_commercial_draft_owner;
alter function private.commercial_invoice_draft_read(uuid,uuid,uuid) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_invoice_draft_create(uuid,uuid,uuid,uuid,uuid,uuid,text,text),private.commercial_invoice_draft_save(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text),private.commercial_invoice_draft_read(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.commercial_invoice_draft_create(uuid,uuid,uuid,uuid,uuid,uuid,text,text),private.commercial_invoice_draft_save(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text),private.commercial_invoice_draft_read(uuid,uuid,uuid) to propel_commercial_draft_runtime;
revoke create on schema private from propel_commercial_draft_owner;
commit;
