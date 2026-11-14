-- UNAPPLIED additive development proposal. Disposable native PostgreSQL only.
-- Requires the exact reviewed commercial-drafts.proposed.sql; NOT a migration,
-- application route, customer publication, debt posting, payment or delivery grant.
begin;
create role propel_commercial_issue_runtime nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema private to propel_commercial_issue_runtime;
grant create on schema private to propel_commercial_draft_owner;

-- Extend the canonical draft header; original revisions and command receipts stay
-- immutable. No parallel invoice/ledger is introduced. Numbering is deliberately
-- UUID-derived, not a promise of chronological/gapless statutory numbering.
alter table private.commercial_invoice_drafts
 add column issued_revision integer,
 add column invoice_number text,
 add column issue_command_id uuid,
 add column issued_actor_id uuid references auth.users(id),
 add column issued_at timestamptz,
 add column issue_request_hash text,
 add constraint commercial_issue_complete check(
  (issued_revision is null and invoice_number is null and issue_command_id is null and issued_actor_id is null and issued_at is null and issue_request_hash is null)
  or (issued_revision is not null and issued_revision=current_revision and invoice_number is not null and invoice_number='INV-'||replace(id::text,'-','') and issue_command_id is not null and issued_actor_id is not null and issued_at is not null and issue_request_hash is not null and issue_request_hash~'^[a-f0-9]{64}$' and amount_minor>0)),
 add constraint commercial_issue_number unique(organization_id,invoice_number),
 add constraint commercial_issue_command unique(organization_id,issue_command_id);

-- Draft authority alone is insufficient to issue. A separately reviewed operator
-- must bind this exact invoice/revision/hash/actor before any future acceptance.
-- No provisioner, runtime DML, operational role assumption or seeds are granted.
create table private.commercial_issue_authorities(
 organization_id uuid not null,invoice_id uuid not null,actor_id uuid not null references auth.users(id),
 revision integer not null check(revision>0),source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),
 expires_at timestamptz not null,revoked_at timestamptz,
 review_reference text not null check(length(trim(review_reference)) between 1 and 500),
 primary key(organization_id,invoice_id,actor_id),
 foreign key(organization_id,invoice_id,revision) references private.commercial_invoice_draft_revisions(organization_id,invoice_id,revision)
);
alter table private.commercial_issue_authorities owner to propel_commercial_draft_owner;
alter table private.commercial_issue_authorities enable row level security;
alter table private.commercial_issue_authorities force row level security;
revoke all on private.commercial_issue_authorities from public,anon,authenticated,service_role,propel_commercial_draft_runtime,propel_commercial_issue_runtime;
create policy owner_only on private.commercial_issue_authorities for all to propel_commercial_draft_owner using(true) with check(true);

create function private.commercial_issued_immutable() returns trigger language plpgsql set search_path='' as $$begin
 if old.issued_revision is not null then raise exception 'Issued invoice is immutable' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end$$;
alter function private.commercial_issued_immutable() owner to propel_commercial_draft_owner;
revoke all on function private.commercial_issued_immutable() from public,anon,authenticated,service_role,propel_commercial_draft_runtime,propel_commercial_issue_runtime;
create trigger commercial_issued_immutable before update or delete on private.commercial_invoice_drafts for each row execute function private.commercial_issued_immutable();

-- The original draft writer shares the command lock but cannot know a future
-- issuance column. Enforce bidirectional non-rebinding at its existing receipt.
create function private.commercial_issue_command_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from private.commercial_invoice_drafts where organization_id=new.organization_id and issue_command_id=new.command_id) then raise exception 'Issue command cannot become draft command' using errcode='40001';end if;
 return new;
end$$;
alter function private.commercial_issue_command_guard() owner to propel_commercial_draft_owner;
revoke all on function private.commercial_issue_command_guard() from public,anon,authenticated,service_role,propel_commercial_draft_runtime,propel_commercial_issue_runtime;
create trigger commercial_issue_command_guard before insert on private.commercial_invoice_draft_receipts for each row execute function private.commercial_issue_command_guard();

create function private.commercial_issue_projection(p_org uuid,p_invoice uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare h private.commercial_invoice_drafts;r private.commercial_invoice_draft_revisions;begin
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice;
 if not found or h.issued_revision is null then raise exception 'Issued invoice unavailable' using errcode='42501';end if;
 select * into r from private.commercial_invoice_draft_revisions where organization_id=p_org and invoice_id=p_invoice and revision=h.issued_revision;
 if not found then raise exception 'Issued revision unavailable' using errcode='42501';end if;
 -- Explicit allowlist. No memo, internal costs, customer contact, Auth material,
 -- source payload or bank/merchant configuration. Staff read is NOT client access.
 return jsonb_build_object('state','issued','paymentState','unverified','invoiceId',h.id,'organizationId',h.organization_id,
  'customerId',h.customer_id,'locationId',h.location_id,'sourceVersionId',h.source_version_id,'sourceHash',h.source_hash,
  'revision',h.issued_revision,'number',h.invoice_number,'title',r.title,'currency',h.currency,'amountMinor',h.amount_minor,
  'issuedAt',to_char(h.issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'receipt',jsonb_build_object('commandId',h.issue_command_id,'actorId',h.issued_actor_id,'requestHash',h.issue_request_hash));
end$$;
alter function private.commercial_issue_projection(uuid,uuid) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_issue_projection(uuid,uuid) from public,anon,authenticated,service_role,propel_commercial_draft_runtime,propel_commercial_issue_runtime;

create function private.commercial_invoice_issue(p_org uuid,p_invoice uuid,p_command uuid,p_revision integer,p_customer uuid,p_location uuid,p_version uuid,p_source_hash text) returns jsonb
 language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare actor uuid;h private.commercial_invoice_drafts;a private.commercial_issue_authorities;request_hash text;result jsonb;begin
 actor:=private.commercial_draft_actor(p_org);
 if p_invoice is null or p_command is null or p_revision is null or p_revision<1 or p_customer is null or p_version is null or p_source_hash is null or p_source_hash!~'^[a-f0-9]{64}$' then raise exception 'Exact issuance identity required' using errcode='22023';end if;
 -- Same command/invoice lock namespace and order as the original draft writer.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||'/'||p_command::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text||'/'||p_invoice::text,0));
 actor:=private.commercial_draft_actor(p_org);
 request_hash:=encode(sha256(convert_to(jsonb_build_array('issue-v1',p_org,p_invoice,p_command,p_revision,p_customer,p_location,p_version,p_source_hash,actor)::text,'UTF8')),'hex');
 select * into a from private.commercial_issue_authorities where organization_id=p_org and invoice_id=p_invoice and actor_id=actor for share;
 if not found or a.revision<>p_revision or a.source_hash<>p_source_hash or a.revoked_at is not null or a.expires_at<=clock_timestamp() then raise exception 'Exact separately reviewed issuance authority required' using errcode='42501';end if;
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice;
 if not found then raise exception 'Exact draft required' using errcode='42501';end if;
 if h.issued_revision is not null then
  if h.issue_command_id<>p_command or h.issued_actor_id<>actor or h.issue_request_hash<>request_hash then raise exception 'Original issuance identity required; do not replace' using errcode='40001';end if;
  result:=private.commercial_issue_projection(p_org,p_invoice);
  perform private.commercial_draft_actor(p_org);
  if a.expires_at<=clock_timestamp() then raise exception 'Issuance authority expired after wait' using errcode='42501';end if;
  return result;
 end if;
 -- Retain original writer's source lock ordering and final source check.
 perform 1 from public.estimates e join public.estimate_versions v on v.organization_id=e.organization_id and v.estimate_id=e.id
  where v.organization_id=p_org and v.id=p_version for share of e;
 perform 1 from public.estimate_versions where organization_id=p_org and id=p_version for share;
 perform 1 from public.customers where organization_id=p_org and id=p_customer for share;
 if p_location is not null then perform 1 from public.service_locations where organization_id=p_org and id=p_location and customer_id=p_customer for share;end if;
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice for update;
 if h.issued_revision is not null or h.current_revision<>p_revision or h.customer_id<>p_customer or h.location_id is distinct from p_location or h.source_version_id<>p_version or h.source_hash<>p_source_hash or h.amount_minor<=0
  or (private.commercial_draft_projection(p_org,p_invoice,null)->>'sourceCurrent')::boolean is distinct from true then raise exception 'Current exact draft revision and issued source required' using errcode='40001';end if;
 if exists(select 1 from private.commercial_invoice_draft_receipts where organization_id=p_org and command_id=p_command) then raise exception 'Draft command cannot become issue command' using errcode='40001';end if;
 select * into a from private.commercial_issue_authorities where organization_id=p_org and invoice_id=p_invoice and actor_id=actor for share;
 if not found or a.revision<>p_revision or a.source_hash<>p_source_hash or a.revoked_at is not null or a.expires_at<=clock_timestamp() then raise exception 'Exact separately reviewed issuance authority required' using errcode='42501';end if;
 update private.commercial_invoice_drafts set issued_revision=p_revision,invoice_number='INV-'||replace(id::text,'-',''),issue_command_id=p_command,issued_actor_id=actor,issued_at=clock_timestamp(),issue_request_hash=request_hash where organization_id=p_org and id=p_invoice;
 result:=private.commercial_issue_projection(p_org,p_invoice);
 perform private.commercial_draft_actor(p_org);
 if a.expires_at<=clock_timestamp() then raise exception 'Issuance authority expired after wait' using errcode='42501';end if;
 return result;
end$$;
alter function private.commercial_invoice_issue(uuid,uuid,uuid,integer,uuid,uuid,uuid,text) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_invoice_issue(uuid,uuid,uuid,integer,uuid,uuid,uuid,text) from public,anon,authenticated,service_role,propel_commercial_draft_runtime;
grant execute on function private.commercial_invoice_issue(uuid,uuid,uuid,integer,uuid,uuid,uuid,text) to propel_commercial_issue_runtime;

create function private.commercial_invoice_issued_read(p_org uuid,p_invoice uuid,p_command uuid default null) returns jsonb
 language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$declare actor uuid;h private.commercial_invoice_drafts;result jsonb;begin
 actor:=private.commercial_draft_actor(p_org);
 select * into h from private.commercial_invoice_drafts where organization_id=p_org and id=p_invoice;
 if not found or h.issued_revision is null or (p_command is not null and (h.issue_command_id<>p_command or h.issued_actor_id<>actor)) then raise exception 'Exact original issuance receipt required' using errcode='42501';end if;
 result:=private.commercial_issue_projection(p_org,p_invoice);
 perform private.commercial_draft_actor(p_org);
 return result;
end$$;
alter function private.commercial_invoice_issued_read(uuid,uuid,uuid) owner to propel_commercial_draft_owner;
revoke all on function private.commercial_invoice_issued_read(uuid,uuid,uuid) from public,anon,authenticated,service_role,propel_commercial_draft_runtime;
grant execute on function private.commercial_invoice_issued_read(uuid,uuid,uuid) to propel_commercial_issue_runtime;
revoke create on schema private from propel_commercial_draft_owner;
commit;
