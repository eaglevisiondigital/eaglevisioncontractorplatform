/** READ ONLY, proposal only. No authorization/reservation/token/link is created.
 * A real restricted reader/EXECUTE grant remains separately unimplemented. */
export const CUSTOMER_CAPTURE_LIFECYCLE_QUERY = `select jsonb_build_object(
 'organizationId',h.organization_id,'invoiceId',h.id,'customerId',h.customer_id,
 'sourceVersionId',h.source_version_id,'sourceHash',h.source_hash,'revision',h.issued_revision,
 'issuanceReceiptId',h.issue_command_id,'invoiceAmountMinor',h.amount_minor::text,
 'authorizationId',a.id,'merchantConfigId',a.merchant_id,'provider',a.provider,
 'authorityKind',a.kind,'amountMinor',a.amount_minor::text,'currency',a.currency,
 'requestDigest',a.request_digest,'authorityRevoked',a.revoked_at is not null,
 'authorityExpired',a.expires_at<=clock_timestamp(),
 'merchantApproved',m.status='approved' and m.environment='sandbox' and m.provider=a.provider,
 'uncertainInvoice',exists(select 1 from private.sandbox_gateway_attempts z where z.organization_id=h.organization_id and z.invoice_id=h.id and z.status in ('pending','unknown')),
 'attempt',case when x.idempotency_key is null then null else jsonb_build_object(
  'key',x.idempotency_key,'authorizationId',x.authorization_id,'merchantConfigId',x.merchant_id,
  'invoiceId',x.invoice_id,'kind',x.kind,'amountMinor',x.amount_minor::text,
  'requestDigest',x.request_digest,'status',x.status,'result',x.result) end
 ) result
 from private.commercial_invoice_drafts h
 join private.sandbox_gateway_authorizations a on a.organization_id=h.organization_id and a.invoice_id=h.id
 join private.merchant_configurations m on m.organization_id=a.organization_id and m.id=a.merchant_id
 left join private.sandbox_gateway_attempts x on x.organization_id=a.organization_id and x.authorization_id=a.id
 where h.organization_id=$1::uuid and h.id=$2::uuid and a.id=$3::uuid and a.merchant_id=$4::uuid
 and h.customer_id=$5::uuid and a.customer_id=h.customer_id and a.kind='capture'
 and h.source_version_id=$6::uuid and h.issued_revision=$7::integer and h.current_revision=h.issued_revision
 and h.issue_command_id=$8::uuid and h.currency='USD' and h.amount_minor>0
 and a.invoice_source_version_id=h.source_version_id and a.invoice_source_hash=h.source_hash
 and a.invoice_revision=h.issued_revision and a.invoice_issue_command_id=h.issue_command_id
 and a.request_digest=$9::text and a.amount_minor=$10::bigint and a.currency='USD'`;
