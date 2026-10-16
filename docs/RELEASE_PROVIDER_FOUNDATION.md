# Release 1.0 · local provider foundation continuation

## Superseding readiness increment

The original sections below describe base93982ba. Their proposal-only SQL and
missing-persistence statements are historical. The proposal is now a pointer to
one **unapplied** formal forward migration, recorded separately from the unchanged
historical nine-file approval. Read
[PROVIDER_INTEGRATION_READINESS.md](PROVIDER_INTEGRATION_READINESS.md) for current
restricted commands, durable persistence, provider/runtime gates and exact setup.
No hosted migration, grant or provider execution is authorized by that preparation.

**LOCAL IMPLEMENTATION / LIVE INTEGRATIONS DISABLED / RELEASE NOT READY.**
October 16, 2026. Continues cc46509 in draft PR #1. No Netlify, Supabase, DNS or
execution-provider write/call was made. The pending deployment and original frozen
14-file package remain unchanged; this newer source is not a replacement package.

## Document processing

The existing quarantine/CAS pipeline now snapshots the job/lease, copies external
bytes and rechecks current authorization before scan, validation, normalization and
AI transmission. Revocation during clean-byte staging prevents AI submission.
The scan engine allowlist is copied/frozen rather than caller-mutable.

`server/materials/objects.ts` implements the bounded, digest-checked workload byte
client over an explicit neutral gateway protocol. Fixed read/stage routes carry
only server-resolved organization/source/digest/size and opaque lease authority;
no object URL, upsert or staff credential. The independent service must authenticate
the workload and atomically recheck its capability; the client is not that service.
Read responses are bounded to3MiB; clean receipts bind exact object key and digest.
A failed SQL CAS must leave any staged object unreadable until orphan cleanup.

The image normalizer decodes/auto-orients a bounded single image, then writes PNG
without EXIF/GPS/XMP. Original bytes remain the private evidence source. Normalized
output must pass the existing size/type envelope. Images cannot go to AI without
normalization; PDFs/CSV retain the full existing validators. The extraction gateway
now validates the neutral schema itself, rejects unexpected response fields/types,
bounds input/output and disallows credentials/query/fragment in endpoint URLs.
Literal uncertain values and review requirements are preserved; no price invention.

Tests join the real byte-client/scanner-client/extraction-client/store orchestration
using **synthetic transports**. They do not prove real malware scanning, actual
Storage behavior, native-parser isolation or real model accuracy. Ingestion remains
unconditionally503. There is no new upload, signed download or HTTP worker endpoint.
The previously approved nine migrations are unchanged; no worker grant is added.

## Sandbox payments and durable controls

The original capture adapters are preserved, with explicit Authorize.Net USD wire
currency. New refund adapters use only the fixed sandbox endpoints. Authorize.Net
refunds require original transaction plus provider customer/payment-profile IDs;
no PAN/last-four/CVV route is implemented. NMI uses original-payment refund endpoint
and exact decimal serialization; zero-amount full-refund shorthand is prohibited.
Opaque token-reference resolution now binds tenant, customer, merchant, provider,
sandbox mode and expiry before the existing capture adapter. The vault is a trusted
server port, not implemented/provisioned secret storage; one-use resolution must
atomically bind consumption to the durable intent key. Inputs/configuration are
snapshotted. Outages, malformed responses and uncertain
outcomes become UNKNOWN, never an automatic retry or fake decline/success.

`PostgresSandboxIntentStore` implements the existing reservation contract plus
refund reservations and a durable webhook receipt inbox. Every transaction uses
a dedicated connection and locks current approved sandbox merchant first, then
authorization/capture. It requires a separate private provider authorization bound
to exact request digest, tenant, merchant, customer/invoice, operation and amount.
Internal laboratory consent cannot populate or authorize this control path.

A process interruption after reservation remains pending/UNKNOWN across store
restart; another key cannot reuse its authorization. Pending/UNKNOWN refunds hold
capacity. Refunds require a matching **settled** capture, same customer/invoice/
merchant and remaining capacity. A successful capture response alone is not
settlement. SQL and adapter enforce immutable terminal outcomes and append-only
audit/settlement/inbox facts; conflicting adjustments require future reviewed
reconciliation, not editing original records. Provider result JSON has an explicit
SQL projection: no extra provider fields or supplier/customer payloads.

**Database proposal only:** `server/payments/schema.proposed.sql` defines four
private RLS tables, composite tenant references/indexes, explicit client revokes,
mutation guards and existing content-free audit triggers. Local tests load all
nine real migrations, then this proposal in a disposable database. This file is
outside `supabase/migrations` and is not included in MIGRATION_BUNDLE.json or
normal deployment. Public generated types therefore remain unchanged.

The proposal has no API/RPC, client grant, seed/authorization creation workflow,
secret loader or workload role. The SQL adapter accepts only a trusted isolated
transaction connection; do not install an owner/service-role connection into a
request-scoped function. Before promotion, design/review the restricted control
service identity/RLS policies or checked RPCs, independent genuine customer/provider
authorization and production-invoice provenance. The proposal's invoice UUID is
an immutable authorization reference, not permission to convert a laboratory invoice
into a genuine payment authorization. Create/review a new migration only under
separate target-specific approval; do not append this file to the old approved
bundle automatically. Its SHA-256 for local review is
`3eb87a28cbd61ed5389002491c17b852a42a1776470cbf157daa11409031125c`.

Provider-specific raw-body HMAC verification is implemented for Authorize.Net and
NMI payments. NMI payments use `Webhook-Signature` over nonce + dot + body, distinct
from NMI underwriting's similarly named signature scheme. The nonce is not assumed
to be a timestamp. Authorize.Net binds the configured webhook/subscription ID.
The receiver resolves tenant/merchant from trusted key configuration, verifies
before parsing and commits a deduplicated event ID/body digest before success.
It does not store raw webhook/customer payloads or apply financial transitions.
Durable duplicate identity with changed bytes is rejected. Statement reconciliation
compares transaction IDs, kind, currency and exact integer amounts, including
returns/refunds, missing/unexpected/conflicting rows. It never marks a job's profit
final or posts cash automatically.

Remaining provider gaps: actual SDK/HTTP/schema vectors and sandbox calls; vault/
hosted tokenization/profile lifecycle; authoritative invoice/consent mapping;
settlement-report ingestion and audited UNKNOWN resolution; approved callback
infrastructure/secret rotation; fees/disputes and independent financial review.
NMI response fixtures are conservative contracts, not verified real v5 responses.
The current opaque-token capture flow does not itself create the Authorize.Net
profiles required for this restrictive refund path. That lifecycle remains gated.

## Agreements and signature evidence

A neutral sandbox provider port/gateway and DocuSign demo **draft plan** now exist.
The plan has `status=created` and makes no API call, envelope send or notification.
Accepted estimate/decision/template/consent versions, original PDF digest, tenant,
customer, signer user/email, provider identity/account/envelope/recipient and preparation/
expiry times form the immutable binding. Current store authorization is rechecked
around evidence retrieval and before append. Missing, wrong-account, changed-source,
unsigned, expired or revoked evidence is rejected.

Original, signed and certificate PDFs are bounded/parsed and hashed independently.
Signed bytes are never flattened/resaved. The append-store port requires atomic
current-authority/version CAS and private immutable object persistence; replay must
be identical, conflicting completion cannot overwrite original evidence. The
sandbox result explicitly carries `legalExecutionEnabled=false` and is not wired
to existing internal test-signature records, production agreements or invoices.
DocuSign Connect raw-body Base64 HMAC verification is available as a separate
notification-authentication primitive; webhook status is never sufficient proof
of an executed agreement.

**Not completed or certified:** genuine signature vendor gateway/API integration,
durable agreement evidence-store implementation, embedded signer identity/consent
and authentication ceremony, signed-PDF cryptographic/certificate-chain validation,
legal/jurisdiction templates, retention/legal holds and independent review. A parsed
PDF or synthetic certificate is not evidence of a legally valid signature. The
neutral gateway schema is our contract, not a claimed DocuSign response schema.

## Tenant-verified communication preparation

The server-side domain reader checks a tenant/account-bound credential against the
exact Resend domain ID/name and verified status, plus current independent SPF/DKIM/
DMARC evidence. DNS checks are an injected trusted port, not implemented/live here.
Receipts are opaque, server-only, expire after15minutes and bind the complete profile
version; copying a receipt or editing the sender profile invalidates it.

Message preparation reloads current tenant/customer authority, verified contact,
consent and suppression. It uses the company's own sender/reply address, name and
color; body data is projected/escaped into HTML and plain text, without arbitrary
HTML, private costs or recipient overrides. Deterministic tenant/document/purpose/
profile-version keys prepare durable outbox deduplication. Every prepared message
returns `delivery=disabled` and `providerRequest=null`: no send operation exists.

Resend/Svix raw-body ID/timestamp signatures are validated with bounded payloads
and freshness before mapping a message-scoped event. Output is content-free event
facts. Bounce/complaint facts require durable suppression; older delivered events
must not clear suppression. Actual outbox/inbox+suppression transactions, domain
ownership/account provisioning, DNS resolver, verified sending, safe expiring portal
links/templates and provider delivery acceptance remain separate dependencies.
Resend's24-hour provider idempotency retention cannot replace a durable local
outbox or authorize an UNKNOWN retry. Existing company email profiles remain
unverified; these local test receipts do not update them.

## Regression evidence and approval gates

Final local results: **495 PASS / 10 native-only skips** in npm check; **187 PASS**
in native PostgreSQL17; **51 PASS** desktop/tablet/mobile; **26 PASS** original
frozen-package integrity checks; format/diff/private-reference checks PASS. The
initial local native harness role-creation race was fixed by precreating roles
as CI already does; the final native suite passes.
PGlite/full application, native PostgreSQL17 and desktop/tablet/mobile suites are
local synthetic evidence; their overlapping test counts must not be added together.
The original frozen package/operation/logo still pass26 offline checks. No dependency
or lockfile change, hosted migration, grant, provider credential, outside access,
deployment write, support follow-up, real signature/payment/message/payroll or merge.

Before activation: independent code/security review; exact new migration/control
role and storage service design; isolated scanner/parser/gateway runtime and cleanup;
provider sandbox accounts/credentials and explicitly authorized test calls; real
signature/merchant/domain/consent verification; protected deployed acceptance;
reconciliation/operational failure testing; clean separate production database and
independent full Release1.0 acceptance with express owner launch approval.

## Primary provider references reviewed October16

- [Authorize.Net payment/profile/refund semantics](https://developer.authorize.net/api/reference/features/customer-profiles.html)
  and [webhook verification](https://developer.authorize.net/api/reference/features/webhooks.html).
- [NMI v5 refunds](https://docs.nmi.com/reference/refund-payment-v5) and
  [payment webhook structure/signature](https://docs.nmi.com/reference/overview).
- [DocuSign draft envelope API](https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/create/)
  and [Connect HMAC](https://www.docusign.com/blog/developers/manually-authenticating-hmac-signatures-docusign-connect-webhook-configurations).
- [Resend domain retrieval](https://resend.com/docs/api-reference/domains/get-domain)
  and [idempotency retention](https://resend.com/changelog/idempotency-keys).

The adapters and tests are engineering implementation, not provider/legal approval.
