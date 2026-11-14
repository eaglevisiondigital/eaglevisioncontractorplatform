-- UNAPPLIED FORWARD PROPOSAL. Disposable native PostgreSQL only.
-- Requires exact reviewed #467 invoice draft/issuance SQL and original provider
-- schema. No runtime grants, provisioner, route, invoice/payment or installation
-- authority. Existing business records, attempts and receipts remain authoritative.
begin;
create role propel_commercial_payment_guard_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage,create on schema private to propel_commercial_payment_guard_owner;

-- Legacy authorizations stay immutable and untouched. New capture admission
-- requires all four typed identities; human evidence notes are never parsed.
alter table private.sandbox_gateway_authorizations
 add column invoice_source_version_id uuid,
 add column invoice_source_hash text,
 add column invoice_revision integer,
 add column invoice_issue_command_id uuid,
 add constraint commercial_payment_source_complete check(
  (invoice_source_version_id is null and invoice_source_hash is null and invoice_revision is null and invoice_issue_command_id is null)
  or (invoice_source_version_id is not null and invoice_source_hash is not null and invoice_source_hash~'^[a-f0-9]{64}$' and invoice_revision is not null and invoice_revision>0 and invoice_issue_command_id is not null)),
 add constraint commercial_payment_revision foreign key(organization_id,invoice_id,invoice_revision)
 references private.commercial_invoice_draft_revisions(organization_id,invoice_id,revision);
create index commercial_payment_authority_invoice on private.sandbox_gateway_authorizations(organization_id,invoice_id,invoice_revision);

grant select(organization_id,id,customer_id,source_version_id,source_hash,currency,amount_minor,current_revision,issued_revision,issue_command_id)
 on private.commercial_invoice_drafts to propel_commercial_payment_guard_owner;
grant update(id) on private.commercial_invoice_drafts to propel_commercial_payment_guard_owner;
create policy commercial_payment_read on private.commercial_invoice_drafts for select to propel_commercial_payment_guard_owner using(true);
create policy commercial_payment_lock on private.commercial_invoice_drafts for update to propel_commercial_payment_guard_owner using(true) with check(false);
grant select(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,expires_at,revoked_at,invoice_source_version_id,invoice_source_hash,invoice_revision,invoice_issue_command_id)
 on private.sandbox_gateway_authorizations to propel_commercial_payment_guard_owner;
grant update(id) on private.sandbox_gateway_authorizations to propel_commercial_payment_guard_owner;
create policy commercial_payment_read on private.sandbox_gateway_authorizations for select to propel_commercial_payment_guard_owner using(true);
create policy commercial_payment_lock on private.sandbox_gateway_authorizations for update to propel_commercial_payment_guard_owner using(true) with check(false);
grant select(organization_id,invoice_id,kind,status,amount_minor) on private.sandbox_gateway_attempts to propel_commercial_payment_guard_owner;
create policy commercial_payment_read on private.sandbox_gateway_attempts for select to propel_commercial_payment_guard_owner using(true);
create index commercial_payment_invoice_capacity on private.sandbox_gateway_attempts(organization_id,invoice_id) where kind='capture' and status<>'declined';
create index commercial_payment_invoice_uncertain on private.sandbox_gateway_attempts(organization_id,invoice_id) where status in ('pending','unknown');

create function private.commercial_payment_capture_guard() returns trigger
 language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare a record;h record;used numeric;
begin
 if new.kind<>'capture' then return new;end if;
 -- Lock-only serialization does not refresh a repeatable-read snapshot. Deny
 -- such sessions rather than silently relying on a stale aggregate.
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Commercial capture requires read committed isolation' using errcode='42501';end if;
 select organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,expires_at,revoked_at,invoice_source_version_id,invoice_source_hash,invoice_revision,invoice_issue_command_id
  into a from private.sandbox_gateway_authorizations where organization_id=new.organization_id and id=new.authorization_id for share;
 if not found or a.kind<>'capture' or a.merchant_id<>new.merchant_id or a.invoice_id<>new.invoice_id or a.amount_minor<>new.amount_minor or a.request_digest<>new.request_digest or a.currency<>'USD'
  or a.invoice_source_version_id is null or a.invoice_source_hash is null or a.invoice_revision is null or a.invoice_issue_command_id is null or a.revoked_at is not null or a.expires_at<=clock_timestamp()
  then raise exception 'Exact issued invoice payment authority required' using errcode='42501';end if;
 -- One invoice lock serializes reservations across different merchant configs.
 -- The original immutable issued header, not a new estimate, is the payment scope.
 select organization_id,id,customer_id,source_version_id,source_hash,currency,amount_minor,current_revision,issued_revision,issue_command_id
  into h from private.commercial_invoice_drafts where organization_id=new.organization_id and id=new.invoice_id for update;
 if not found or h.issued_revision is null or h.issued_revision<>h.current_revision or h.issued_revision<>a.invoice_revision
  or h.customer_id<>a.customer_id or h.source_version_id<>a.invoice_source_version_id or h.source_hash<>a.invoice_source_hash
  or h.issue_command_id<>a.invoice_issue_command_id or h.currency<>'USD' or h.amount_minor<=0
  then raise exception 'Exact original issued invoice required' using errcode='42501';end if;
 -- A new identity must not act as a replacement for an ambiguous original
 -- payment, even when nominal amount remains below the invoice ceiling.
 if exists(select 1 from private.sandbox_gateway_attempts where organization_id=new.organization_id and invoice_id=new.invoice_id and status in ('pending','unknown'))
  then raise exception 'Unresolved original invoice payment; exact reconciliation only' using errcode='42501';end if;
 select coalesce(sum(amount_minor),0) into used from private.sandbox_gateway_attempts
  where organization_id=new.organization_id and invoice_id=new.invoice_id and kind='capture' and status<>'declined';
 if used+new.amount_minor>h.amount_minor then raise exception 'Commercial invoice capture capacity exceeded' using errcode='42501';end if;
 -- A row wait must not extend the separate provider authorization lease.
 if a.revoked_at is not null or a.expires_at<=clock_timestamp() then raise exception 'Commercial payment authority expired after wait' using errcode='42501';end if;
 return new;
end$$;
alter function private.commercial_payment_capture_guard() owner to propel_commercial_payment_guard_owner;
revoke all on function private.commercial_payment_capture_guard() from public,anon,authenticated,service_role;
create trigger commercial_payment_capture_guard before insert on private.sandbox_gateway_attempts for each row execute function private.commercial_payment_capture_guard();
revoke create on schema private from propel_commercial_payment_guard_owner;
commit;
