-- UNAPPLIED forward reader only. No new ledger, writer, public/customer route or runtime grants.
begin;
create role propel_invoice_payment_reader_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage,create on schema private to propel_invoice_payment_reader_owner;
grant execute on function private.require_provider_workload(uuid,uuid,text) to propel_invoice_payment_reader_owner;
grant select(organization_id,id,provider,environment,status),update(id) on private.merchant_configurations to propel_invoice_payment_reader_owner;
create policy invoice_payment_merchant_read on private.merchant_configurations for select to propel_invoice_payment_reader_owner using(true);
create policy invoice_payment_merchant_lock on private.merchant_configurations for update to propel_invoice_payment_reader_owner using(true) with check(false);
grant select(organization_id,id,customer_id,source_version_id,source_hash,currency,amount_minor,current_revision,issued_revision,issue_command_id) on private.commercial_invoice_drafts to propel_invoice_payment_reader_owner;
create policy invoice_payment_header_read on private.commercial_invoice_drafts for select to propel_invoice_payment_reader_owner using(true);
grant select(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,invoice_source_version_id,invoice_source_hash,invoice_revision,invoice_issue_command_id) on private.sandbox_gateway_authorizations to propel_invoice_payment_reader_owner;
create policy invoice_payment_authorization_read on private.sandbox_gateway_authorizations for select to propel_invoice_payment_reader_owner using(true);
grant select(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,capture_key,amount_minor,request_digest,status,result,created_at) on private.sandbox_gateway_attempts to propel_invoice_payment_reader_owner;
create policy invoice_payment_attempt_read on private.sandbox_gateway_attempts for select to propel_invoice_payment_reader_owner using(true);
create function private.commercial_invoice_payment_receipt(p_org uuid,p_merchant uuid,p_provider text,p_invoice uuid,p_customer uuid,p_version uuid,p_hash text,p_revision integer,p_issue uuid,p_key uuid,p_authorization uuid,p_digest text,p_kind text,p_capture uuid) returns jsonb
 language plpgsql security definer set search_path='' set lock_timeout='1500ms' as $$
declare m record;r record;answer jsonb:=jsonb_build_object('outcome','UNKNOWN');
begin
 perform private.require_provider_workload(p_org,p_merchant,'payment');
 if p_provider is null or p_provider not in ('nmi','authorize_net') or p_invoice is null or p_customer is null or p_version is null or p_hash is null or p_hash!~'^[a-f0-9]{64}$' or p_revision is null or p_revision<1 or p_issue is null or p_key is null or p_authorization is null or p_digest is null or p_digest!~'^[a-f0-9]{64}$' or p_kind is null or p_kind not in ('capture','refund') or (p_kind='capture' and p_capture is not null) or (p_kind='refund' and p_capture is null) then raise exception 'Exact original invoice and payment identity required' using errcode='42501';end if;
 select organization_id,id,provider,environment,status into m from private.merchant_configurations where organization_id=p_org and id=p_merchant for share;
 if not found or m.provider is distinct from p_provider or m.environment<>'sandbox' or m.status<>'approved' then raise exception 'Current exact sandbox merchant required' using errcode='42501';end if;
 -- One statement reads the original attempt, its immutable authority, original
 -- capture (for refund), typed capture-source authority and immutable issued header.
 select x.status,x.result,x.amount_minor,x.created_at into r
 from private.sandbox_gateway_attempts x
 join private.sandbox_gateway_authorizations a on a.organization_id=x.organization_id and a.id=x.authorization_id
 join private.sandbox_gateway_attempts c on c.organization_id=x.organization_id and c.idempotency_key=case when x.kind='capture' then x.idempotency_key else x.capture_key end
 join private.sandbox_gateway_authorizations b on b.organization_id=c.organization_id and b.id=c.authorization_id
 join private.commercial_invoice_drafts h on h.organization_id=x.organization_id and h.id=x.invoice_id
 where x.organization_id=p_org and x.merchant_id=p_merchant and x.invoice_id=p_invoice and x.idempotency_key=p_key and x.authorization_id=p_authorization and x.request_digest=p_digest and x.kind=p_kind and x.capture_key is not distinct from p_capture
 and a.merchant_id=p_merchant and a.invoice_id=p_invoice and a.customer_id=p_customer and a.provider=p_provider and a.kind=x.kind and a.amount_minor=x.amount_minor and a.currency='USD' and a.request_digest=x.request_digest
 and (x.kind='capture' or ((a.invoice_source_version_id is null and a.invoice_source_hash is null and a.invoice_revision is null and a.invoice_issue_command_id is null) or (a.invoice_source_version_id=p_version and a.invoice_source_hash=p_hash and a.invoice_revision=p_revision and a.invoice_issue_command_id=p_issue)))
 and c.merchant_id=p_merchant and c.invoice_id=p_invoice and c.kind='capture' and (x.kind='capture' or (c.status='succeeded' and c.result->>'provider'=p_provider and c.result->>'currency'='USD' and c.result->>'mode'='sandbox'))
 and b.merchant_id=p_merchant and b.invoice_id=p_invoice and b.customer_id=p_customer and b.provider=p_provider and b.kind='capture' and b.amount_minor=c.amount_minor and b.request_digest=c.request_digest and b.currency='USD'
 and b.invoice_source_version_id=p_version and b.invoice_source_hash=p_hash and b.invoice_revision=p_revision and b.invoice_issue_command_id=p_issue
 and h.customer_id=p_customer and h.source_version_id=p_version and h.source_hash=p_hash and h.current_revision=p_revision and h.issued_revision=p_revision and h.issue_command_id=p_issue and h.currency='USD' and h.amount_minor>0;
 if found and r.created_at<=clock_timestamp() then
  if (r.status='pending' and r.result is null) or
   (r.status in ('succeeded','declined','unknown') and jsonb_typeof(r.result)='object' and r.result ?& array['status','provider','transactionId','amountMinor','currency','mode'] and r.result-array['status','provider','transactionId','amountMinor','currency','mode']='{}'::jsonb and r.result->>'status'=r.status and r.result->>'provider'=p_provider and r.result->>'currency'='USD' and r.result->>'mode'='sandbox' and jsonb_typeof(r.result->'amountMinor')='number' and (r.result->>'amountMinor')::numeric=r.amount_minor and ((r.status='succeeded' and jsonb_typeof(r.result->'transactionId')='string' and r.result->>'transactionId'~'^[a-zA-Z0-9_-]{1,100}$' and r.result->>'transactionId'<>'0') or (r.status in ('declined','unknown') and r.result->'transactionId'='null'::jsonb))) then
   -- Explicit minimal projection: no provider transaction ID, names, notes,
   -- tokens, authorization evidence, balances or inferred settlement/cancellation.
   answer:=jsonb_build_object('outcome','LINKED','organizationId',p_org,'merchantConfigId',p_merchant,'provider',p_provider,'mode','sandbox','invoiceId',p_invoice,'customerId',p_customer,'sourceVersionId',p_version,'sourceHash',p_hash,'revision',p_revision,'issueCommandId',p_issue,'attemptKey',p_key,'authorizationId',p_authorization,'requestDigest',p_digest,'kind',p_kind,'captureKey',p_capture,'status',r.status,'amountMinor',r.amount_minor,'currency','USD','attemptedAt',to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  end if;
 end if;
 perform private.require_provider_workload(p_org,p_merchant,'payment');
 return answer;
end$$;
alter function private.commercial_invoice_payment_receipt(uuid,uuid,text,uuid,uuid,uuid,text,integer,uuid,uuid,uuid,text,text,uuid) owner to propel_invoice_payment_reader_owner;
revoke all on function private.commercial_invoice_payment_receipt(uuid,uuid,text,uuid,uuid,uuid,text,integer,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke create on schema private from propel_invoice_payment_reader_owner;
commit;
