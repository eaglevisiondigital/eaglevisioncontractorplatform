# Release 1.0 provider integration readiness

**Independent review update (October16, base230f5b8): NO-GO for the exact pending
migration.** M1 expiry-during-lock-wait and M2 terminal SQL-NULL result were
reproduced. The original readiness evidence below remains historical; no apply or
activation is recommended. See [PROVIDER_MIGRATION_FINAL_REVIEW.md](PROVIDER_MIGRATION_FINAL_REVIEW.md)
for the unchanged hash, hosted drift comparison, dry run, three failing assertions
and containment plan. Correct/review a successor before requesting execution.

October 16, 2026 · continuation of `93982ba` · internal engineering only.
**Release 1.0 is NOT READY / NOT AUTHORIZED.** PR #1 stays draft. No hosted
migration, credential lookup, provider sandbox execution, deployment repair,
communication, signature execution, financial transaction or payroll operation
was performed in this increment. Existing contractor branding and owner logo
are unchanged. Earlier hosted core acceptance is preserved, not extended by these
local results.

## Approval matrix

| Integration | Implemented and locally verified                                                                                                                                                                                        | Ready for genuine sandbox testing                                                                                  | Blocked by credentials / infrastructure                                                                                                                                                                                           | Independent review still required                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payments    | Formal private schema; restricted workload commands; durable intent/capture/refund/inbox/observations; immutable reconciliation with snapshot CAS; UNKNOWN holds; fixed sandbox runner                                  | Runner builds and offline plan works. Capture/refund adapters are prepared, **not activated or provider accepted** | Reviewed/applied forward migration; dedicated scoped TLS database identities; independent authorization creation; approved test merchants; hosted tokenization/profile lifecycle; callbacks; real statement vectors               | Security/capability review, merchant/PCI/tokenization scope, authorization/invoice provenance, refund/settlement/fees/disputes reconciliation and financial review        |
| DocuSign    | Demo REST read adapter; current signer authentication port; disabled embedded-view plan; raw Connect HMAC + durable inbox; private immutable evidence hashes and create-only object port                                | Read/ceremony contracts prepared. No real envelope or signing ceremony tested                                      | Demo integration/account/OAuth consent/token; checked binding creation; approved callback; private immutable object service; independent PDF/CMS validator and trust policy                                                       | Authentication/consent and template/legal/jurisdiction review; certificate roots, timestamp and OCSP/CRL policy; retention/legal hold and independent security acceptance |
| Email       | Domain evidence, versioned sender bindings, disabled-only outbox, deduplication, durable suppression; scoped Svix facts; exact approved DNS checks                                                                      | Domain verification/preparation contracts prepared; **no sender/send activation**                                  | Approved tenant account/domain and exact DNS records, resolver, Keychain/secret management, checked profile-binding workflow; authenticated callback/delivery bindings                                                            | Domain ownership/alignment, permissions/consent, privacy/retention, deliverability and independent sending review                                                         |
| Documents   | Real RS256 workload verification with pinned public keys; quarantine/staging service boundary; current lease/scanner/full-validator checkpoints; bounded identity/runtime policy; exact-version orphan cleanup contract | Local integration contracts only; **actual runtime acceptance not ready**                                          | Approved workload issuer/key lifecycle, scoped byte service and object catalog, container/runtime enforcement, current malware engine/signatures, neutral extraction gateway + actual provider, Storage and orphan reconciliation | Sandbox escape/egress/resource tests, malware/format corpus, model accuracy/uncertainty, data-processing/retention and independent tenant/Storage review                  |

A cell saying “prepared” does not authorize execution or count as provider PASS.
All four integrations remain hidden/unwired from ordinary financial execution.

## Forward migration and restricted execution

`supabase/migrations/20261016185108_provider_sandbox_persistence.sql` is a formal
**unapplied** forward migration, created through the pinned Supabase CLI. The
historical SQL proposal is now a non-executable pointer. Exact SHA-256 and pending
bundle hash live in `PROVIDER_MIGRATION_REVIEW.json`. The approved historical
nine-file bundle and its checksum remain unchanged. `migrations:check` verifies
both sets independently and rejects any unlisted/drifting migration. It does not
approve either a hosted action or the new file. Local test/type catalogs apply
all ten files; hosted development still has the original nine.

The migration adds sixteen private tables: six payment tables, one workload table,
six email tables and three agreement tables. Every table has organization scope,
RLS with no client policy, explicit client revokes, indexed tenant/composite foreign
keys and content-free audit triggers. Service-role grants are explicitly revoked
when that role exists. No public function, exposed schema, company module, Auth
setting, Storage policy, existing data, role, login, capability row or EXECUTE grant
is added. Generated public types are unchanged after regeneration.

The only future runtime entry points are three fixed private command functions:
`sandbox_gateway_control`, `provider_email_control`, `provider_agreement_control`.
All default EXECUTE privileges are revoked. A separately approved deployment would
use a **dedicated database LOGIN**, no membership in other database roles, no
SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB, no table DML, and only private-schema USAGE
plus EXECUTE on its one required command. Session-mode/direct TLS must preserve
`session_user`; real hosted behavior is unverified. No service-role or owner
connection belongs in a request-scoped function. No command can create a workload,
merchant authorization, sender binding, delivery binding or agreement binding.

Each call independently checks the database-authenticated `session_user` against
an exact tenant/service/scope capability with a SQL-enforced maximum30minute lifetime, absolute expiry and revocation
status. JWTs, SET ROLE, user metadata, browser selection and request tenant values
cannot substitute for this identity. Capability rows are locked through the
command; email commands serialize across identities on sender configuration;
payments serialize on merchant; agreements lock their binding and current portal/
confirmed signer/company authority. Revocation becomes effective after any current
atomic command completes. New calls fail after expiry or revocation. Human
application RPC/MFA boundaries and control-plane separation remain unchanged.

Capability activation is deliberately **not** included in this migration approval
request. Before any later activation, prepare exact role name, TLS connection,
minimal grants, one tenant/service/scope row, approval digest and a maximum
30-minute window, plus supervised revoke/connection-close verification. Revoke
by setting that row's `revoked_at`, then independently prove commands denied,
close its connection pool, revoke EXECUTE/USAGE and retire its credential under the
separately reviewed operation. No role or row currently exists by this increment.

Review/rollback procedure:

1. Independently review the exact forward SQL/hash, grants, SD function owner and
   its fixed search paths/parameters. Compare live history and drift **read-only**
   against the original nine before proposing a target-specific dry run/apply.
2. Review advisor/catalog output on a disposable PostgreSQL17 database and the
   negative/concurrency tests. No Auth/Storage bootstrap/mock runs on hosted data.
3. Obtain separate approval for a concrete target-specific migration operation;
   only then run the documented dry run, inspect its exact one-file plan and apply.
   Do not replay the original nine, use an unreviewed `--include-all`, or treat
   this file's presence as authorization.
4. Migration is transactional. Before runtime activation, containment is keeping
   all capabilities absent, EXECUTE revoked and all provider/UI gates disabled.
   After any provider attempt, preserve immutable evidence and UNKNOWN reservations;
   never drop/truncate tables, edit outcomes or clear refund holds as rollback.
   Any schema rollback is a separately reviewed forward migration, after export/
   retention review. Do not alter historical migration history.

Payment invoice IDs and accepted-decision IDs remain independent immutable
references awaiting a reviewed production-valid provenance/consent workflow.
They cannot turn internal laboratory invoices/consent/signatures into provider
execution authority. The restricted commands deliberately cannot issue that authority.

## Durable payment acceptance

`RestrictedSandboxStore` implements capture/refund reservations, immutable completion,
verified webhook inbox, transaction snapshots, independent statement observations
and persisted reconciliation through the restricted SQL boundary. The earlier
`PostgresSandboxIntentStore` is retained as a direct-SQL disposable reference;
**do not wire it to application owner connections**.

Each authorization is bound to exact tenant, merchant, customer, invoice, provider,
operation, integer USD amount, request digest and expiry. One authorization cannot
be reused under a new key. Pending/UNKNOWN survives process restart and never
resubmits automatically. A refund requires a matching successful **settled** capture
and its own authorization. Pending/UNKNOWN refunds reserve capacity. Provider IDs
cannot be attributed twice to successful attempts under one merchant. Webhooks
verify raw signatures and record digest/event identity before acknowledgment;
they never post ledger cash or manufacture settlement.

Provider observations append evidence, not edits to outcomes. Only exact matching
successful captures with a settled observation gain settlement evidence. UNKNOWN
resolution remains independent operator review; no retry/release method exists.
Reconciliation reads a bounded merchant transaction snapshot and persists an
independently SQL-computed comparison. Changed snapshots fail CAS; duplicate IDs,
fractional minor units and cross-tenant statements fail. Missing, unexpected,
conflicting and unresolved rows are distinct. BigInt/SQL integer arithmetic is
preserved; unresolved costs/transactions cannot be labeled final profit or balanced.
The command rejects oversized reports; reviewed pagination is needed beyond the
current bounded batch, rather than silently truncating a report.

Build the offline runner with `node scripts/build-provider-acceptance.mjs`, then
`node .staging/provider-readiness/runner.mjs plan`. These read no credentials and
make no network call. A later explicitly approved operation can use
`--execute-approved <private-manifest-path> <exact-sha256>`. This is **not presently
authorized**. The runner has no synthetic transport or success fallback: it calls
only the real fixed provider sandbox endpoints through the existing adapters,
uses the restricted store, and repeats the exact durable key without another
provider request. Capture and refund are separate operation manifests. An uncertain
result is BLOCKED, never a fake decline/success or automated retry. A previously
recorded result without a new provider call is NOT RUN for genuine fresh acceptance.

Private manifest fields: sandbox mode, provider-approved-test-account attestation,
owner approval reference, expiry within30minutes, operation, exact merchant+intent
bindings and approved Keychain service/account identifiers. Keep mode0600 under
`.staging/provider-readiness/`. Account attestation is evidence to review, not legal
or technical proof by itself. Keychain JSON is captured only in memory; it contains
matching tenant/merchant/provider, dedicated workload database URL + CA, provider
sandbox credential and (capture only) freshly minted opaque token. No PAN/CVV or
last-four fields, environment secret fallback, raw provider logs or secret report
exports. The CLI never creates authorizations, grants, identities or fixtures.

Remaining real acceptance must separately prove approved-token issuance, exact
request/response vectors, approval/decline/timeout behavior, raw signed callback
and replay, provider-reported settlement, partial/refused refunds, financial
reconciliation, key rotation/revocation and cross-company credential isolation.
No real provider report/query schema or webhook endpoint was certified here.
NMI strict response fixtures remain provisional until genuine v5 responses are
reviewed. Authorize.Net refund profile IDs are not created by opaque-token capture;
profile/vault lifecycle is a separate dependency, with no raw card workaround.

## DocuSign preparation and evidence

`DocusignSandboxReader` uses fixed demo eSignature GET paths for envelope, recipients,
signed document1 and certificate of completion. Account/envelope/recipient/client
user/email/status are bound to immutable scope, and original bytes come from the
trusted original store and must hash exactly. No create/send or recipient-view
HTTP method exists. The embedded-view **plan** requires a trusted server verifier
of genuine current Auth identity, confirmed email, AAL2, session/revocation and portal
customer authority. It expires within60seconds and stays `dispatchEnabled=false`.
Its remaining name/consent/CSRF/provider-authentication requirements are explicit.
Do not treat DocuSign `authenticationMethod=none` as provider ID verification.

A PDF trust-validator implementation is mandatory for demo evidence reading. It
must independently check PDF byte ranges/CMS signatures, approved certificate
chain/roots, trusted timestamp, OCSP/CRL policy at signing time and account/envelope/
recipient evidence. UNKNOWN revocation or mismatched bytes fails closed. A parsed
certificate-of-completion PDF and valid Connect HMAC are not certificate-chain
validation. Actual validator, root lifecycle and legal validity remain unverified.

`DurableAgreementStore` writes private create-only, content-addressed signed and
certificate objects, rechecks authority around each stage and commits an immutable
binding/hash CAS. Identical completion is idempotent; conflicting evidence cannot
overwrite it. Failed CAS leaves unreadable staged orphans, subject to separately
reviewed retention/legal-hold cleanup. Signed bytes are never flattened/resaved.
Connect JSON SIM notifications authenticate raw HMAC before scope parsing and commit
a deduplicated inbox receipt; they are only triggers for independent reads. Legacy
XML and additional signer/document layouts need their own reviewed parser/binding.
All evidence remains sandbox with `legal_execution_enabled=false`.

## Email persistence, verification and suppression

Independent private sender bindings tie configuration version/profile digest,
tenant provider account/domain and expiry/revocation. A domain receipt cannot
promote the existing public company profile to verified. Domain facts bind to the
same current reviewed version. The opaque receipt still requires account-bound
provider verification and current exact approved SPF/DKIM/DMARC evidence. DNS checks
support exact TXT contracts; CNAME/provider-specific layouts and alignment must be
reviewed before selecting actual DNS records. No lookup or sending was performed.

Durable preparation rechecks document authority, verified recipient, consent,
current profile and suppression. The outbox stores only IDs and content digests;
rendered bodies/addresses/portal bearer links are not persisted or audited. Its only
possible delivery value is **disabled**. The event path requires a separately
approved provider-message/outbox binding, which this command cannot create. Verified
bounce/complaint events atomically append suppression; delivered events cannot clear
it. Suppression is conservative for that tenant/customer/provider account; a verified
contact change or unsuppression needs a separately reviewed correction workflow.
There is no send, delivery claim, arbitrary recipient override or suppression-clear
method. Real delivery remains NOT RUN, including any provider test-recipient mode.

## Isolated document integration

`WorkloadJwtVerifier` verifies real RS256 signatures against a pinned, short-lived
operator-supplied public JWKS snapshot. It rejects token-supplied key URLs, algorithm
substitution, wrong issuer/audience/subject/tenant/source, expired/future/overlong
claims and weak/private keys. No live discovery or fallback trust exists. Configure
key rotation/revocation, approved workload issuance and nonpublic audiences before
activation; these controls do not create a Supabase worker grant.

`IsolatedDocumentService` checks workload identity, runtime attestation and current
source/lease before byte read, after read and around stage. Bytes must match exact
size/digest. Staging additionally requires current approved clean scanner and full
validator evidence; attempt-versioned objects remain private until existing fenced
SQL completion. Retry/recovery retains the existing three-attempt durable lease/CAS
and backoff logic; stale attempts cannot publish. No fixture verdict activates this
service. The existing material HTTP endpoint remains unconditionally503.

Required runtime policy is exported in code: nonroot65532, read-only root, drop all
capabilities/no-new-privileges,512MiB RAM,1CPU,64PIDs,32MiB tmpfs,60second job limit,
one concurrent job, approved egress only and existing3MiB source/three-attempt caps.
These are requirements for the independently provisioned runtime, **not enforcement
by JavaScript timeouts**. `assertRuntime` must fail absent verified configuration.
Native parsers/scanner/AI must run behind that boundary, not in an unconstrained
Netlify request function. A sandbox image/digest and host are not selected/provisioned.

Orphan cleanup accepts only staged-clean exact object versions older than24hours.
Its catalog must hold the authoritative metadata lock and recheck current lease,
committed references and legal holds through conditional version deletion. The
algorithm never deletes originals, referenced evidence or recent objects. Actual
catalog/object implementations and failure-injection/Storage acceptance are blocked;
there is no cleanup schedule, object deletion or retention change in this increment.

## Exact external setup and owner decisions

| Provider      | Required private configuration / credentials                                                                                                                                                                                                                        | Next owner decision / approval                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authorize.Net | Approved sandbox merchant per company; API Login ID/Transaction Key, public Accept.js Client Key + authorized origin, Signature Key/webhook subscription, account identity evidence; token/profile secret references                                                | Sandbox account approval; tokenization/vault/profile and independent customer authorization/provenance design; exact limited test/callback/report actions                            |
| NMI           | Provider-issued **sandbox-only** merchant private API key; account/processor/currency mapping; Payment Component/Collect.js tokenization key/origin; payments webhook signing key; approved v5 account/response/report vectors                                      | Validate test-account availability/permissions and token/refund lifecycle; exact test operations; request provider clarification where sandbox/report vectors are unavailable        |
| DocuSign      | Developer/demo account and account UUID; integration key; approved OAuth flow/consent and secret-manager token lifecycle; allowed redirect URL, Connect HMAC keys/config; approved recipient identity policy                                                        | Embedded signer policy and sandbox-only envelope/notification scope; isolated validator/trust anchors/retention; separately approved demo ceremony and legal review                  |
| Email         | Company-owned account/domain IDs, restricted account credential and webhook secret; verified sender/reply addresses; exact provider DNS records; trusted DNS resolver, private sender binding and contact/document authority                                        | Ownership/alignment/consent policy; approve read-only domain verification first; separately approve any test sending (currently disabled)                                            |
| Documents     | Workload issuer/audience/subject/public key lifecycle; scoped byte/object service, staged-object catalog; approved malware engine/signature-update source; isolated image/runtime digest; neutral AI gateway credential/model/provider/data-region/retention policy | Choose/provision isolated runtime, scanner and extraction provider after data/security review; exact workload/Storage grant and fixture/corpus acceptance, never frontend activation |

Supabase schema application, capability activation, sandbox provider calls, verified
email sending and deployed callback infrastructure are distinct approvals. No
blanket activation is requested. Clean separate production database, independent
full release/security acceptance and express launch approval remain mandatory.

## Netlify support and next action

The existing diagnosis ticket (number retained privately) was checked October16: only the
acknowledgment and two confirmations were present; **no agent findings**. The extra
confirmation was already in the existing thread; no duplicate ticket or follow-up
was sent. No deployment/provider repair or configuration call occurred. An hourly read-only
heartbeat now checks the existing support thread and notifies only on meaningful
new findings; no automatic replies or corrective operations are allowed. Preserve
the existing pending deployment and frozen package. Support advice will require
exact corrective scope/hash/risks and separate approval before any repair.

The smallest next step is **independent review of this one forward migration and
its restricted identity/authority model**. After that review, prepare an exact
development-target dry-run/application operation for owner authorization. It must
not include logins/grants, provider calls or deployment. Do not request sandbox
activation until genuine invoice/consent and checked binding workflows are reviewed.
See `PROVIDER_MIGRATION_REVIEW.json` for the precise pending bytes.

## Evidence

Final test counts are recorded below. Local
PGlite/native/browser cases overlap and are not hosted/provider acceptance. Any
synthetic transport, certificate, DNS record or sandbox credential string in a unit
test is a fixture, never successful production extraction/signing/sending/payment.

Primary documentation reviewed: [Supabase function privileges](https://supabase.com/docs/guides/database/functions),
[Authorize.Net reporting](https://developer.authorize.net/api/reference/features/transaction-reporting.html),
[NMI v5 migration/authentication](https://docs.nmi.com/docs/payment-migration-playbook),
[NMI sale](https://docs.nmi.com/reference/create-sale-v5) / [refund](https://docs.nmi.com/reference/refund-payment-v5),
[DocuSign recipient view](https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopeviews/createrecipient/),
[certificate distinctions](https://www.docusign.com/blog/developers/demystifying-docusign-certificates-developers) and
[public certificate references](https://www.docusign.com/trust/compliance/public-certificates).
These sources inform preparation; no vendor/legal/security certification is implied.

Final local evidence for this readiness increment: **550 PASS /11 native-only skips**
from npm check (lint, strict types, unchanged generated public types, separate
historical/pending migration hashes and build PASS); **216 native PostgreSQL17 PASS**,
including all11 skipped/native concurrency cases; **51 desktop/tablet/mobile PASS**;
**26 frozen-package integrity PASS**. Counts overlap and must not be summed.
Formatting/diff/private-reference checks PASS. An initial concurrent full-catalog
run hit10second hook timeouts; bounded workers/30second hooks resolved resource
contention and the final full/native runs pass. No provider/hosted acceptance is inferred.

Provider audit review fixed a direct-database attribution hazard: such a workload
can set JWT-related settings. New provider triggers therefore never use auth.uid()
for a human actor. Successful guarded commands append the database capability ID,
and entity changes use content-free events with actor_id NULL. A negative regression
proves fabricated JWT sub claims cannot forge a human provider audit event. Existing
application audit functions and hosted data/policies are unchanged. Capability
lifetime is SQL-constrained to30minutes, with immutable expiry and current-time
checks; extending access requires a separately reviewed new identity/capability.

Document service scope comparison uses exact allowed fields and value equality,
independent of JSON property order; extra metadata cannot alter an object adapter's
behavior. The regression includes reordered input and rejects extra bucket fields.
