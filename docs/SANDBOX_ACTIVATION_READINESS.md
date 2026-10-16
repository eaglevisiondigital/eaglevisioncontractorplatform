# Sandbox activation readiness · review package

October 16, 2026 · implementation base `97e861f`. **REVIEW ONLY. No activation
is authorized or performed. Release 1.0 NOT READY / NOT AUTHORIZED.** Draft PR #1
stays open. The ten historical migrations, approved logo and frozen blocked Netlify
package are unchanged. This increment prioritizes readiness; the newly requested
property/media/procurement additions are planned in PROPERTY_PROCUREMENT_PLAN.md,
not represented as implemented or accepted.

## Current hosted evidence

A fresh read verified the exact privately designated development project identity
and ACTIVE_HEALTHY state. All **468 application catalog fingerprints** match the
post-execution record: table columns/constraints/indexes/RLS/policies/triggers,
function definitions and table/function ACLs. Ten history entries remain, ending
in `20261016185108_provider_sandbox_persistence`; no migration was applied/repaired.
All **16 provider tables are empty**. Merchant configurations, workloads, payment
authorizations, sender/agreement bindings, active platform grants and public buckets
are zero. The 22 Auth identities, four verified factors and zero sessions remain.
Counts are read-only observations, not positive provider/credential acceptance.
No Auth configuration or factor was accessed/changed by this work.

Security advisors: **0 WARN/ERROR**, 28 intentional private/default-deny RLS INFO.
Performance: four existing Auth initplan WARN, 21 FK INFO, 57 unused-index INFO,
one Auth connection strategy INFO; unchanged from the applied-schema report.
[Private default-deny notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [Auth initplan warning](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).
No cleanup is authorized. These catalog observations do not recertify every hosted
Auth/API dashboard setting or real Storage HTTP behavior.

## Approval matrix

| Component         | Implemented and locally verified                                                                                      | Genuine sandbox status                                                                            | Credentials / account dependencies                                                                                                                                                                      | Exact next approval boundary                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workload identity | Installed wall-time/row-lock guard; fixed-path commands; offline diagnostic compiler and containment SQL tests        | BLOCKED: no login or credential; no real workload connection                                      | Development direct TLS host/CA, dedicated SCRAM credential in approved Keychain/secret manager, supervised operator                                                                                     | Optional S0 dormant diagnostic package below; credential installation/LOGIN and genuine connection are separate reviewed operations                                                                         |
| Authorize.Net     | Sandbox capture/refund adapters, durable reserve/finish, inbox, observations and reconciliation; token-reference port | BLOCKED: hosted ceremony/vault and genuine invoice/consent workflow absent                        | One owner-approved sandbox account for one existing synthetic property-services company; API Login ID/Transaction Key; public Client Key; Signature Key; account identity/settlement/report permissions | S1 account/origin approval; S2 checked customer/invoice/token binding implementation and review; S3 exact merchant/workload/authorization writes; S4 bounded capture; S5 reports/refund/webhooks separately |
| NMI               | Independent REST-v5 sandbox adapter, refund/inbox/report contracts                                                    | BLOCKED: provider-approved sandbox and Payment Component/token compatibility unverified           | Independent NMI sandbox account/private REST API key, Payment Component public key/origin, payment webhook signing secret and report permissions                                                        | Separate NMI account, payload/version/token lifecycle and exact-operation review; never share Authorize.Net tokens or bindings                                                                              |
| DocuSign          | Demo REST evidence reader, AAL2 signer ceremony plan, immutable evidence/CAS and Connect HMAC                         | BLOCKED: signer authority adapter, trust validator and private objects not independently verified | Developer/demo account UUID, integration key, approved OAuth flow/consent/secret rotation, Connect HMAC, exact envelope/recipient and return origin                                                     | Read-only demo account/evidence first; envelope creation or ceremony dispatch separately scoped; legal signing remains disabled even after demo acceptance                                                  |
| Tenant email      | Profile-bound domain receipts; disabled-only durable outbox; signature/event/suppression ports                        | BLOCKED: company domain/account/DNS and delivery receiver unverified                              | Tenant-owned provider account/domain, restricted verification credential, exact DNS records, trusted resolver and webhook secret                                                                        | Read-only account/DNS verification only first; DNS writes/bindings/event fixtures separately reviewed; external sending needs future code/schema and explicit approval                                      |
| Documents / media | Existing source quarantine, bounded parser/scanner/AI/byte-service contracts, leases/fencing and orphan policy        | BLOCKED: approved scanner, isolated runtime, object service, model and video pipeline             | See PROPERTY_PROCUREMENT_PLAN.md; no provider selected or credential assumed                                                                                                                            | Isolated infrastructure selection/review, exact workload/storage policies and corpus acceptance before changing ingestion503 or authorizing any playback                                                    |

“Ready for genuine testing” means a specified test plan, not execution readiness.
No service currently meets all credential, provenance, callback and approval gates.
Independent security review is needed for privileged bootstraps, vault/customer
binding, callbacks, SSRF/egress and tenant revocation. Legal/signature/tax/processor/
financial review remains separate; payroll execution is never part of this package.

## S0 · smallest proposed hosted operation: dormant identity probe

Private exact scope is `.staging/sandbox-activation/probe-review.private.json`, with
reviewed proposed SQL siblings and their SHA-256 hashes. It selects the **existing**
Straight Edge Property Services synthetic organization from the preserved C1 result;
it does not provision a company or use another company's identity. One fresh scope
UUID is diagnostic only, not a merchant. One capability UUID and role are fixed in
the private proposal. No passwords, tokens or provider credentials are in that file.

The compiler `server/providers/activation-plan.ts` has no network/secret/execution
capability. `npm run sandbox:plan` takes no arguments and prints a non-executing
plan. Its presence or a matching hash is never owner authorization.

Proposed S0 preparation, **NOT EXECUTED**:

1. Refresh target identity, ten exact SQL hashes/history/catalog/column/default ACLs,
   all off gates and absence of the exact proposed role/scope; stop on any drift.
   Verify proposed organization UUID/name/industry against current hosted metadata.
2. Under a separately approved operator transaction, create exactly one **NOLOGIN**,
   NOINHERIT/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS role,
   connection limit1. Set statement/lock/idle-in-transaction limits5s/2s/5s.
3. Grant only private schema USAGE and
   `private.require_provider_workload(uuid,uuid,text)` EXECUTE. No table privilege,
   provider command, role membership, platform admin or release-test/worker grant.
4. Insert exactly one diagnostic `provider_workloads` row, service=payment and the
   private exact scope; created_at=current wall time, expires_at=created_at+900s.
   Its approval_sha256 stores the canonical proposed **scope digest**, which the
   owner must approve alongside exact SQL hashes. This digest is not proof of approval.
   The guard cannot exercise this lease while the role remains NOLOGIN.
5. Record actual activation/expiry UTC and local times. No native automatic login
   shutdown/termination is implied by lease expiry or role VALID UNTIL. SQL requires
   a capability created no more than30minutes before expiry; policy here is15minutes.

This dormant preparation alone is deliberately **not** a usable sandbox identity.
A second precise credential-installation/LOGIN operation must be reviewed, including
in-memory SCRAM/password transport to the designated Keychain, no argv/env/log/file
fallback, certificate/hostname verification, actual session_user and role membership
checks, and operator containment authority. It is **not implemented or authorized**
by these files. Do not execute S0 now merely to leave a dormant role behind.

Genuine connection acceptance after that distinct approval: positive exact-scope
identity guard; deny foreign organization, foreign scope, email/agreement service,
SET ROLE/JWT spoofing, revoked/expired capability and direct table/command access.
No provider API or merchant row is needed. Use autocommit, no open application
transactions or pools that change session identity. Prefer direct TLS; any pooler
requires independent proof of actual session_user, revocation and backend cleanup.
A role can weaken its own timeout defaults; operator process/network deadlines
must independently enforce bounds. PostgreSQL connection limit is not a rate limiter.

### Verified containment design

Revoke immediately on completion/error, at operator deadline or before expiry.
The exact companion SQL first commits NOLOGIN/password NULL and removal of the
single EXECUTE/schema grants; then terminates only that exact role's backends;
then marks only the exact tenant/capability/role/scope row revoked. This ordering
avoids waiting on the capability row before stopping the transaction holding it.
No deletion, DROP OWNED, historical mutation, un-revoke or automatic renewal.

An authorized operator must supervise with an independent connection able to
perform and verify containment. If termination, privilege, password removal or row
revocation fails, stop and report; no automatic grant retry. Verify role NOLOGIN,
boolean-only password-null state, no memberships/ACLs/backends, one revoked lease,
new-login/guard denial and unchanged identities/factors/financial gates. Retain
content-free approval/operation evidence privately. Do not claim password or TLS
validation from the local SQL identity simulation.

## S1–S5 · first payment acceptance, separately approved

Candidate: same single existing property-services synthetic organization, **one
Authorize.Net sandbox merchant only**. No account exists in current database;
owner must select/verify a real test account before any filled merchant operation.
Proposed first exact case: USD **123 minor units ($1.23)** capture; identical
idempotency replay yields zero extra provider calls. After independent settlement
proof and a new approval/lease if needed: partial refund **23 minor units ($0.23)**,
expected net **100 minor units ($1.00)** before provider-reported fees. Never assume
settlement, fees, token persistence or successful refund from these example amounts.
No tax, installment, recurring charge, ACH, surcharge or automatic retry is included.
Decline vectors and further amounts require their own exact account/test approval.

### Hosted tokenization and customer authority

Use Authorize.Net's hosted **Accept UI payment information form** with the sandbox
script `https://jstest.authorize.net/v3/AcceptUI.js`, not merchant-hosted card inputs.
The resulting opaqueData token is one-use and has a15-minute provider validity;
server policy must bind it more narrowly to one tenant/merchant/customer/intent and
expire it no later than the ceremony/consent. This option matches the existing
capture adapter. **Accept Hosted is a different flow that itself processes the
transaction**; do not run Accept Hosted and then capture its result again.
[Accept.js / hosted information form](https://developer.authorize.net/api/reference/features/acceptjs.html),
[Accept Hosted workflow](https://developer.authorize.net/api/reference/features/accept-hosted.html).

Before implementation/activation, review a one-use server ceremony: genuine Auth
getUser/session/AAL and current tenant customer mapping, CSRF state, exact approved
invoice/scope/amount/currency/merchant, immutable authorization evidence and expiry.
The browser may return only opaque token + ceremony reference to the future scoped
receiver; it cannot choose customer/merchant/amount/provider or create vault rows.
Provider form handles card fields; our app/logs/analytics/reports never receive PAN,
CVV or expiry. Store only a private token reference; encrypted transient nonce is
consumed atomically with the same intent key. Reject replay with a new key, expired
nonce, other customer, other merchant, changed consent and changed amount. Provider
nonce merchant binding alone does not authenticate a Propel customer.

`SandboxTokenVault` is a port, not a provisioned vault. The current standalone runner
accepts a private operator-supplied token and proves only its stated single call/
durable replay scope. It is **not approved for end-to-end customer tokenization**.
Do not execute it until the checked ceremony/vault/provenance path is implemented
and independently reviewed. No provider key in VITE; loading scripts/CSP/origin
changes require a later reviewed application artifact, never the frozen deploy.

### Exact database authority model and bootstrap gap

A separate payment role would receive only USAGE private and EXECUTE on
`private.sandbox_gateway_control(uuid,uuid,text,jsonb)`, one expiring payment lease
for the exact merchant and tenant; **not** the S0 probe role or direct table access.
The function bundles reserve/finish/webhook/observe/transactions/reconcile actions;
EXECUTE is not action-specific. Scope plus independently approved, amount-bound
capture/refund authorizations limit financial actions. No other service scope.

Merchant approval and customer/invoice authorization creation currently have **no
checked application workflow**. The schema's authorization invoice_id is a UUID,
not a foreign key to a genuine receivable; SQL verifies equality with the immutable
operator authorization, not economic validity of that receivable. `evidence_reference`
is not itself consent proof. This is a **NO-GO for payment activation**, not permission
to insert arbitrary rows. Implement/review exact issued-invoice/accepted-scope/
customer-consent/token bindings before preparing real authorization INSERTs.
Internal laboratory consents/invoices cannot supply that authority.

A later filled operation must bind account identity/merchant configuration to the
chosen tenant, one synthetic customer and invoice, exact consent hash, request
digest, UUID idempotency key,123USD, absolute approval/intent expiry and call budget.
Refund binds the original settled transaction, same customer/invoice/merchant and
separate23USD authority. Profile creation/retrieval needed by the current
Authorize.Net refund adapter requires independent provider account/permission review;
never store raw last-four/card expiry as a workaround or claim profile readiness.

### Webhooks, results and reconciliation

No working provider callback URL exists. Preserve protected Netlify team-login on
all routes/assets/functions. Provider webhooks cannot satisfy interactive team login.
Choose a **separately approved isolated minimal receiver**, with no application UI
or tenant-data read routes; do not exempt the existing site or open a local tunnel
without exact approval. It needs pinned account routing, raw-body bounds, trusted
signature key, durable tenant inbox, dedup/conflicting replay rejection, spend/rate
limits and minimal logs. A verified webhook is a trigger for an independent provider
read, never a paid-invoice/ledger instruction. No receiver is provisioned here.

Authorize.Net: verify raw-body SHA512 HMAC against Signature Key, then fetch exact
account transaction/settlement evidence and compare amount/currency/customer intent.
NMI: use its **payment** webhook nonce/raw-body HMAC contract; underwriting signatures
are different. Confirm current account/version vectors before genuine acceptance.
A nonce is not assumed to be a timestamp. Duplicate and changed-payload events,
wrong key/account, malformed/oversize and out-of-order delivery must fail safely.

Reserve must commit before the outgoing request; no long transaction spanning a
provider call. Same durable key always replays; pending/UNKNOWN never retry, including
new keys. On timeout or expiry after a provider result, preserve the hold and require
independent provider inquiry/reconciliation under a newly reviewed lease. Terminal
results remain immutable; reconciliation observations cannot rewrite UNKNOWN or
release refund holds. Supervisor deadlines do not guarantee an external request
was cancelled. Compare gross capture123, refund23 and net100 with genuine provider
statements; record actual fees/settlement separately, no invented fee arithmetic.
[Authorize.Net reporting](https://developer.authorize.net/api/reference/features/transaction-reporting.html).

## Independent NMI preparation

Use NMI Payment Component for new integrations after reviewing its REST-v5 token
contract; Collect.js is an existing option but not a basis for assuming token
compatibility. [NMI Payment Component](https://docs.nmi.com/docs/payment-component),
[Collect.js guidance](https://docs.nmi.com/docs/collectjs).
Existing v5 adapter endpoints and authentication remain separately sandbox-only.
Verify provider-issued sandbox base URL, supported tokenization key, merchant
processor/currency, sale/refund/report fields, webhook key and approved test vectors.
No shared customer profile, Authorize.Net nonce, merchant credential or fabricated
provider success. Mirror the123/23USD scenario only after independent NMI approval.

## DocuSign demo and tenant communications

DocuSign: choose demo-only account/OAuth flow/consent and rotation; approved return
origin and one-use state; verified current AAL2/session/customer/email mapping,
immutable accepted estimate/decision/PDF hash, account/envelope/recipient/clientUserId
binding and explicit electronic-consent version. Current code prepares a ceremony;
`authenticationMethod=none` describes app-controlled authentication, not provider ID
verification. Dispatch/envelope creation remains absent/disabled. Require independent
signer policy/legal review before deciding identity verification requirements.

Connect verifies raw HMAC/account/envelope, persists inbox, independently reads
completed status/recipient and exact documents. Separate isolated CMS/PDF validator
must verify byte ranges, all signatures, approved trust anchors, timestamp and
revocation policy; a parsed PDF, CoC PDF or HMAC is not signature/legal validation.
Stage original/signed/CoC bytes create-only under private content-addressed names,
recheck authority, immutable CAS hashes/evidence, legal holds and orphan cleanup.
No playback/download link or legal execution is enabled. [DocuSign HMAC](https://developers.docusign.com/platform/webhooks/connect/hmac/).

Email: tenant-owned provider account + domain/subdomain, exact From/Reply-To and
sender version/profile digest; account/domain ownership proof and approved SPF,
DKIM and aligned DMARC records. Read existing DNS before requesting any DNS writes;
never copy generic example records or create a second SPF. Current validator supports
exact TXT contracts only; provider CNAME/MX layouts need reviewed extensions. Current
policy requires quarantine/reject DMARC; do not weaken it to make verification pass.
[Verified domains](https://resend.com/docs/dashboard/domains/introduction).

Persist independent sender binding only after separate approval; current domain
receipt cannot self-verify a public profile. Outbox preparation checks current
customer/document authority, consent, sender revision and suppression. SQL delivery
can only equal disabled; preparing an outbox row cannot send. Signed provider events
need a reviewed message/outbox binding and atomic inbox; acknowledge only after
durable verification/receipt. Bounce/complaint suppression persists through old
“delivered” events. No raw address/content/portal bearer link in audit/public logs;
never log all raw events. Sending, retry dispatcher and unsuppression require later
code/security approval. No sending or domain change is authorized by the skill used.

## Results and next decision

Local/PG/security result counts are appended after validation below. PASS, FAIL,
BLOCKED and NOT RUN must remain separate. None of the provider plans or synthetic
responses count as genuine acceptance. No UI change requires new screenshots in
this readiness increment; prior responsive workflows are regression-tested.

**Smallest next owner authorization:** after selecting the single Authorize.Net
sandbox merchant for the existing synthetic company, approve read-only account
identity/configuration verification and credential custody through the approved
secret-management process, with no transaction, binding, database grant or callback
registration. Local checked tokenization/consent/vault implementation already has
local development authority; it needs no repeated permission. If database transport proof is desired
first, independently review the exact private S0 files and credential/containment
operation; S0 is not a shortcut to payment authorization. Broader provider activation
is NO-GO until the provenance, token vault and isolated callback gates pass.

### Final verification for this readiness increment

| Result                             | Count / evidence                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS · local check                 | 597 tests,33 native-only skips; lint/strict types/catalog-generated types/frozen10-file hashes/build PASS                                                                                                      |
| PASS · native PostgreSQL17         | 271 database tests,zero skips, including22 existing real expiry/lock-wait races and6 new exact compiled probe/containment tests                                                                                |
| PASS · responsive regression       | 51 desktop/tablet/mobile browser cases; existing UI/branding unchanged                                                                                                                                         |
| PASS · original deployment package | 26 offline manifest/file/archive/function/environment-scope checks; no network                                                                                                                                 |
| PASS · read-only hosted boundaries | 468 fingerprints;16 empty RLS/default-deny tables;7 safe owner/path functions;0 client/service command/table/MAINTAIN grants and0 column ACLs; exact existing synthetic company/proposed-role absence verified |
| PASS · offline plan                | No arguments,credential reads,network,hosted writes or activation path;14 plan cases plus6 SQL cases (included in counts above)                                                                                |
| PASS · hygiene                     | Formatting,diff,private-identifier scan and generated-type/migration integrity                                                                                                                                 |
| FAIL                               | 0 failures in final executed suites                                                                                                                                                                            |
| BLOCKED                            | Genuine hosted workload login/TLS,customer vault/provenance,provider credentials/accounts,callback infrastructure,signature trust,verified sender/scanner/media services                                       |
| NOT RUN                            | Proposed S0 SQL,credential installation,any provider call/transaction/refund/email/signature,new module acceptance,Storage/media processing or hosted deployment/perimeter tests                               |

Counts overlap and must not be added. The33 local skips run in the native suite;
none is treated as genuine provider acceptance. Private evidence includes
`.staging/sandbox-activation/hosted-readiness.private.json` and the exact proposed
scope/grant/revoke files. Provider findings contain no newly introduced security
advisor warning; installed performance findings remain unresolved. No Netlify API
request, support message or blocked-deployment modification occurred in this work.

Workload authority is deliberately independent of staff membership/AAL and ordinary
application role selection. Human membership revocation alone does not revoke a
provider lease. Suspension/incident procedures must explicitly revoke the exact
workloads and provider authorizations/bindings and verify termination; do not claim
that hiding a module, signing a human out or changing JWT metadata contains an
already authenticated database service. Independently review this operational
coupling before any real provider capability.
