-- LOCAL REVIEW PROPOSAL ONLY. Not in the approved migration bundle; never auto-apply.
-- Dedicated future sandbox control service only. No exposed RPC or client grant.
create unique index sandbox_merchant_tenant_id on private.merchant_configurations(organization_id,id);
create table private.sandbox_gateway_authorizations (
 organization_id uuid not null references public.organizations(id),
 id uuid not null, merchant_id uuid not null, customer_id uuid not null,
 invoice_id uuid not null, provider text not null check(provider in ('authorize_net','nmi')),
 kind text not null check(kind in ('capture','refund')), amount_minor bigint not null check(amount_minor between 1 and 9000000000000),
 currency text not null check(currency='USD'), request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
 evidence_reference text not null check(length(evidence_reference) between 8 and 200),
 expires_at timestamptz not null, revoked_at timestamptz,
 primary key(organization_id,id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create index sandbox_authorization_customer on private.sandbox_gateway_authorizations(organization_id,customer_id);
create index sandbox_authorization_merchant on private.sandbox_gateway_authorizations(organization_id,merchant_id);
create table private.sandbox_gateway_attempts (
 id uuid not null default gen_random_uuid(),
 organization_id uuid not null, idempotency_key uuid not null, authorization_id uuid not null,
 merchant_id uuid not null, invoice_id uuid not null,
 kind text not null check(kind in ('capture','refund')), capture_key uuid,
 amount_minor bigint not null check(amount_minor between 1 and 9000000000000),
 request_digest text not null check(request_digest ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','succeeded','declined','unknown')),
 result jsonb, created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,idempotency_key), unique(organization_id,authorization_id),
 foreign key(organization_id,authorization_id) references private.sandbox_gateway_authorizations(organization_id,id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id),
 foreign key(organization_id,capture_key) references private.sandbox_gateway_attempts(organization_id,idempotency_key),
 check((kind='capture' and capture_key is null) or (kind='refund' and capture_key is not null)),
 check((status='pending' and result is null) or (status<>'pending' and jsonb_typeof(result)='object'))
);
create index sandbox_attempt_merchant on private.sandbox_gateway_attempts(organization_id,merchant_id);
create index sandbox_attempt_capture on private.sandbox_gateway_attempts(organization_id,capture_key);
create table private.sandbox_gateway_settlements (
 id uuid not null default gen_random_uuid(),
 organization_id uuid not null, capture_key uuid not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), primary key(organization_id,capture_key),
 foreign key(organization_id,capture_key) references private.sandbox_gateway_attempts(organization_id,idempotency_key)
);
create function private.protect_sandbox_attempt() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Immutable gateway attempt'; end if;
 if old.status<>'pending' or new.status='pending' or
 (to_jsonb(new)-'status'-'result') is distinct from (to_jsonb(old)-'status'-'result') then
  raise exception 'Immutable gateway attempt';
 end if;
 return new;
end $$;
revoke all on function private.protect_sandbox_attempt() from public,anon,authenticated;
create trigger protect_sandbox_attempt before update or delete on private.sandbox_gateway_attempts
for each row execute function private.protect_sandbox_attempt();
create trigger protect_sandbox_settlement before update or delete on private.sandbox_gateway_settlements
for each row execute function private.release_immutable();
-- Only revocation is mutable. Re-approval is a new authorization, never un-revoke.
create function private.protect_gateway_authorization() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Immutable gateway authorization'; end if;
 if old.revoked_at is not null or new.revoked_at is null or
 (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then
  raise exception 'Immutable gateway authorization';
 end if;
 return new;
end $$;
revoke all on function private.protect_gateway_authorization() from public,anon,authenticated;
create trigger protect_gateway_authorization before update or delete on private.sandbox_gateway_authorizations
for each row execute function private.protect_gateway_authorization();
do $$ declare t text; begin
 foreach t in array array['sandbox_gateway_authorizations','sandbox_gateway_attempts','sandbox_gateway_settlements'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
  execute format('create trigger audit_gateway after insert or update or delete on private.%I for each row execute function private.audit_change()',t);
 end loop;
end $$;
create table private.sandbox_gateway_inbox (
 id uuid not null default gen_random_uuid(), organization_id uuid not null,
 merchant_id uuid not null, event_id text not null check(length(event_id) between 1 and 100),
 body_digest text not null check(body_digest ~ '^[a-f0-9]{64}$'), received_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,merchant_id,event_id),
 foreign key(organization_id,merchant_id) references private.merchant_configurations(organization_id,id)
);
alter table private.sandbox_gateway_inbox enable row level security;
revoke all on private.sandbox_gateway_inbox from public,anon,authenticated;
create trigger immutable_gateway_inbox before update or delete on private.sandbox_gateway_inbox for each row execute function private.release_immutable();
create trigger audit_gateway after insert on private.sandbox_gateway_inbox for each row execute function private.audit_change();
-- Result projection is enforced in SQL too: no provider payload/PII may be stored.
alter table private.sandbox_gateway_attempts add constraint sandbox_result_projection check (
 result is null or coalesce(
  result ?& array['status','provider','transactionId','amountMinor','currency','mode'] and
  result-array['status','provider','transactionId','amountMinor','currency','mode']='{}'::jsonb and
  result->>'status'=status and result->>'provider' in ('authorize_net','nmi') and
  result->>'mode'='sandbox' and result->>'currency'='USD' and
  jsonb_typeof(result->'amountMinor')='number' and (result->>'amountMinor')::numeric=amount_minor and
  ((status='succeeded' and jsonb_typeof(result->'transactionId')='string' and
    result->>'transactionId' ~ '^[a-zA-Z0-9_-]{1,100}$' and result->>'transactionId'<>'0') or
   (status in ('unknown','declined') and result->'transactionId'='null'::jsonb)),false)
);
