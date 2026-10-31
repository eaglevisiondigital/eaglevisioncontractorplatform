# Phase 4A · connected customer lifecycle integration contract

October 31, 2026 · audited base `ba21dcad313cc6f5d5a8f63a8dedbf0c850e71dc`.
**Local preparation complete. Connected execution NO-GO. Release 1.0 NOT READY / NOT AUTHORIZED.**

This is the single forward integration specification after completed local 3A–3E.
It does not introduce another synthetic transaction layer. The next package is the
implementation slice in section F, not another lifecycle planning package. Historical
documents retain their original evidence; this contract governs the connected handoff.
No project identifiers, sessions, private correspondence or credentials were retrieved.
Hosted state was not refreshed and no new hosted PASS is claimed.

## October 31 continuation · C1–C3/F implemented locally

[Workstream4B](CUSTOMER_REQUESTS_PERSISTENCE.md) now implements the first slice through
a separate default-deny forward proposal after unchanged14, actual native persistence,
committed attempt custody, exact reads and staff queue. The inventory below preserves
its Phase4A checkpoint. Fourteen itself remains two-choice/unapplied; only the separate
unapplied4B extension adds notes/change requests. Operational broker/ownership/grants/
Auth/target acceptance remains NO-GO. Next is the smallest separately approved genuine
internal request→receipt→staff read after existing gates, not another synthetic layer
or automatic C4–C6 expansion.

## A. Implemented foundations and exact limits

| Existing source                                                                                                                                                                                                                | Reusable implementation                                                                                                                                                                                                                                                                 | Operational limit                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`; `src/server/context.ts`; `netlify/functions/organization-context.mts`                                                                                                                                           | Ordinary staff Auth bootstrap; caller-bound `getUser`, active membership and RLS-backed organization context.                                                                                                                                                                           | A selected company or browser `getSession` is not command authority. The context reader is not a lifecycle mutation gateway or live-session/one-shot issuer.                                                                                                                                 |
| `src/lib/customer-access.ts`, `customer-decision.ts`, `customer-connected.ts`                                                                                                                                                  | Strict discovered customer/property/version contexts; allowlisted issued review; explicit two-choice decision; actual pinned Supabase SDK, explicit-token Auth verification, genuine session-status RPC, bounded transport, default-off capabilities, no SDK retries and UNKNOWN holds. | Unwired preparation: no customer login/refresh broker, mounted connected customer workflow or durable attempt custody. Token adoption does not authenticate itself.                                                                                                                          |
| Pending `20261018144833_customer_authorization_release_readiness.sql`; `server/customer/{schema,workflow}.proposed.sql`                                                                                                        | Server-owned exact recipient publications, safe snapshots/hash, current customer guard, immutable review decisions, transactional uniqueness, receipt/context/revocation RPCs.                                                                                                          | **UNAPPLIED**. Runtime reads/publishing/decisions and login are false; execution grants revoked. Choices are only `approve_review` / `decline_review`; no customer note/change-request field.                                                                                                |
| Historical `20261016024502_release_1_internal_workflow.sql`; `src/lib/release.ts`                                                                                                                                              | Existing portal identity relationships; internal-test offers/decisions/notes and internal sink. `ReleasePreview` powers actual local 3A/3E receipts.                                                                                                                                    | `release_decisions.changes_requested` and its note belong to operator-granted **internal-test** authority. Do not promote its offers, contracts, invoices or payment semantics into the operational customer ledger.                                                                         |
| Historical `20261015204729_phase_3_estimating.sql`; `src/lib/phase3.ts`; `src/domain/estimating/`                                                                                                                              | Existing customers, estimates, versions, lines, totals, history and `save_estimate`, `revise_estimate`, `issue_estimate`. Integer calculation rules, saved tax snapshots, issued immutability and draft lock revision.                                                                  | SQL has no durable customer-request/packet origin or one-shot revised-issuance authority. Existing ordinary revision is not exact-request idempotency and can select a specified issued source. Local customer/repair guards must stay active.                                               |
| `src/lib/customer-change-workspace.ts`, `customer-revision-packets.ts`, `customer-issuance-readiness.ts`, `customer-revised-estimate-loop.ts`; `src/components/phase3/CustomerChangeRequests.tsx` and existing estimate editor | Actual local request→review→same-engine draft→allowlisted comparison/immutable packet→BLOCKED readiness→separate synthetic issuance/internal offer→own version receipt.                                                                                                                 | Same-tab memory, opaque local reviews and hashes are not genuine Auth, restart-safe custody, issuance permission or delivery. Refresh loses the demonstration.                                                                                                                               |
| `src/domain/customer/review.ts`, `src/domain/estimating/revision-packet.ts`; property report projections/history                                                                                                               | `projectIssuedReview` stays issued-only; narrow `projectRevisionScope` and canonical comparisons exclude private estimating fields; exact report/version/finding relationships.                                                                                                         | A draft-safe packet projection is not an issued review. Source hashes must use an explicitly versioned canonical encoding; a browser JSON hash must not be equated with PostgreSQL `jsonb::text` hashing.                                                                                    |
| `server/communications/{preparation,persistence,dns}.ts`; `server/providers/control.ts`; historical `20261016185108_provider_sandbox_persistence.sql`                                                                          | Profile-bound sender/domain proof, approved DNS verification, escaped HTML/text preparation, document authorization port, private domain/outbox/binding/event/suppression metadata.                                                                                                     | Outbox `delivery='disabled'`; runtime only prepares and records verified events. No send, delivery claim, provider binding creation or recipient override. Actual sender/DNS/recipient-purpose resolver, secure customer access and operational worker custody are unverified/unprovisioned. |

The historical `save_estimate` rechecks `private.can` after acquiring resource locks;
`issue_estimate` and `revise_estimate` contain their explicit permission check before
those locks. Their existing guards are not the complete post-wait/live-session
customer-lifecycle authority required below. Forward integration must close these
reachable writer gaps, rather than assume a TypeScript guard protects direct RPCs.

All thirteen historical SQL files and customer fourteen remain byte-for-byte unchanged.
None of the new forward requirements below is implemented operational SQL in this package.

## B. Local preparation delivered and missing reusable code

`src/lib/customer-reconciliation.ts` adds an **unwired read-only adapter**, composed
with existing `PreparedCustomerAccess`, `PreparedCustomerDecision.load` and the actual
`ConnectedCustomerSdk` read interfaces. It snapshots a strict retained reference:
schema, authenticated UID, customer/property/version and exact original decision
request (organization, publication, server scope hash, choice, acknowledgment, request ID).
The reference carries no token, note, authority or storage implementation.

Fresh Auth/session verification and discovery must authorize that same tuple; the
existing strict review/context parsers must agree. Only an exact publication/hash/
request/choice receipt returns `confirmed`. A missing receipt is `undetermined`;
another receipt/source is `conflict`; invalid input, denied/expired access, malformed
data, changed identity or transport failure is `unavailable`. Each remains **UNKNOWN**,
with `replay_allowed:false` and `mutation_performed:false`. No mutation interface or
request-ID generator is exposed. Closing invalidates pending reads and unsubscribes
its listeners without closing the shared SDK.

The adapter can be reconstructed with an externally retained exact reference. It
does **not** retain that reference across process/browser loss, implement an intent
journal, or reconcile a decision after its publication expires: existing
`customer_decision_context` requires currently authorized unexpired access. It cannot
substitute a newer publication or infer nonexecution from absence. A future historical
receipt-only RPC must address that gap without reopening expired document access.

Missing locally implementable pieces, in dependency order: operational request DTO/
receipt and durable custody port; caller-bound request command/read adapter; authenticated
staff request queue projection; request-linked existing-engine revision adapter; strict
durable packet archive adapter; guarded server issuance operation; then authorized
communication preparation/delivery composition. Existing 3A–3E domain code and UI
remain reusable; do not mount these operational paths before acceptance/approval.

## Exact operational flow and transition acceptance

For every row, browser selection is presentation only. Server guards validate current
actor/session, organization/module, CRM customer/property and composite source identity.
Every mutation records its exact immutable source and current lock revision; post-wait
and final checks precede commit. Missing evidence never authorizes a replacement ID.

| Transition / existing interface                                                                                                                                                          | Actor and durable binding                                                                                                                                                                                                                                                                                                                                        | CAS / isolation / uncertainty and required acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Genuine customer → issued review**. `ConnectedCustomerSdk.identityPort`, `PreparedCustomerAccess`, `customer_portal_discover`, `customer_estimate_review`; pending fourteen guards. | Confirmed, nonanonymous, unbanned customer; current genuine session; active `portal_identities` and exact CRM location. Staff/platform identities excluded. Explicit owner/admin AAL2 publication binds org/customer/location/user/issued version and optional exact published inspection/line; 15-minute maximum access.                                        | Current signed UID/session and discovery before/after reads; server access expires/revokes independently. No URL/mapping alone grants access. Accept negative foreign tuple/version, staff crossover, unconfirmed/banned/deleted user, revoked session/mapping, expiry and lock-wait revocation cases. Requires approved login/session custody and separately scoped publication/activation.                                                                                                                                                           |
| **2. Issued review → durable change request**. Existing two-choice `customer_decision_context` / `customer_record_decision`, prepared decision layer; local 3A receipt semantics.        | Current customer explicitly confirms exact published version/scope. Extend **existing** `private.customer_review_decisions` for nonfinancial request-changes choice and bounded safe explanation, preserving old rows/choices. Retain server request ID, publication, snapshot/hash, actor/session, timestamp and immutable receipt.                             | One decision per exact customer/user/version and one request ID/body; no inferred note-to-scope changes. New durable pre-dispatch custody and exact read-only receipt/status lookup required. Concurrent conflicting choices reject; repeat/UNKNOWN only reconciles. Accept note boundaries/escaping, identical-body identity, wrong pub/hash/recipient, concurrent requests, lost acknowledgment and process death; absence remains UNKNOWN.                                                                                                          |
| **3. Request → authenticated staff review**. Local `CustomerChangeWorkspace.review`, current staff memberships; existing server context/property session helpers.                        | A current active owner/admin with AAL2 or estimator/office-manager allowed by `private.can(org,'estimates')`; exact durable request/receipt/source/customer/property returned by a narrow staff queue reader. Staff notes separate from customer evidence.                                                                                                       | Final current eligible membership/user/session/module after waits. No arbitrary table access. Accept revoked/inactive/foreign role, own vs foreign customer/property, unchanged original note/receipt, and staff-only-field exclusion from customer responses. New staff request projection/review receipt needed; no request fabrication from UI.                                                                                                                                                                                                     |
| **4. Reviewed request → durable private revised draft**. Existing Phase3Repository and SQL `revise_estimate`, `save_estimate`.                                                           | Explicit current staff confirmation binds actual request/receipt/publication/issued source and source estimate current-version CAS. Durable origin references the same estimate, new existing-engine version, initial lock revision and reviewer; source issued payload/lines/calculation remain immutable.                                                      | New exact-request revision wrapper and origin uniqueness: one request → one revised draft; reject stale source/current version, wrong property, repair origin or pending/UNKNOWN attempt. Existing ordinary revision does not provide these guards. Guard all ordinary revision/duplicate/save/issue/job-baseline paths for this durable origin. Accept real PostgreSQL concurrent staff actions, old versions, tax recalculation rules and interruption; exact reads find original result, never replay.                                              |
| **5. Saved draft → immutable reviewed packet**. `CustomerRevisionPackets`, `projectRevisionScope`, canonical comparison.                                                                 | Staff explicitly reviews clean saved editor state; server reloads exact source/request/customer/property, current draft/version/lock, referenced tax/catalog/policy. Store allowlisted original/revised scope, structured differences, canonical selling amounts/tax/discount, customer terms, source report identity, reviewer/time, schema/hash and packet ID. | Append-only private snapshot, unique exact request/draft/lock/content; both current-source CAS and packet-review CAS. Subsequent saved edits stale eligibility, never rewrite history. Accept dirty editor, races, changed tax/source/catalog, private-field injection, identical/changed/new/removed lines, frozen old packet bytes and restart. No customer URL or response to private packet.                                                                                                                                                       |
| **6. Reviewed packet → controlled server issuance**. Existing issue calculation/version transition; local 3E invariants only as behavior reference.                                      | Separate genuine owner/admin AAL2 confirmation and server-owned one-shot command bound to request, draft ID/lock, packet ID/hash, canonical scope, source receipt/issued version/customer/property, current tax/terms/expiry and current staff.                                                                                                                  | New authority and forward guards required; ordinary issue remains blocked for customer revisions until reviewed replacement exists. Durably commit the exact attempt before invoking mutation; transactional current checks/locks and immutable issued result. No process restart/new request/packet bypass after UNKNOWN. Accept raw ordinary-RPC bypass tests, revocation after resource wait, stale packet/source/tax, cross-tenant and concurrent issuers, crash at every boundary and exact result read. No contract/work/financial side effects. |
| **7. Issued version → authorized delivery**. Existing publication and communication preparation, provider control/outbox.                                                                | Separate staff action selects the exact **issued** revision; current authenticated recipient mapping and bounded publication; verified tenant sender, purpose-specific recipient consent/suppression and exact version/document. Durable prepared content digest, access reference, outbox identity and sender config/version.                                   | Never auto-send on save/packet/issue. Require separately approved delivery claim/provider binding and independently verified protected access. One provider attempt, exact provider account/message receipt; loss/timeout UNKNOWN and read-only reconciliation. Accept revocation/expiry before dispatch, suppression races, wrong account/message/webhook, content/config drift, duplicate event and restart; never turn internal_sink into delivered evidence.                                                                                       |
| **8. Delivered/accessible version → own version-specific response**. Issued-only projection, fourteen review ledger/receipts and proposed note extension.                                | Same current authenticated customer guard and exact new publication/version; separate explicit nonfinancial review preference/request. Original issued version/request/packet/decision retained. Delivery status cannot authenticate a customer.                                                                                                                 | No carried-forward original approval/request; no auto fourth revision. Existing per-version uniqueness preserved; new source gets its own receipt. Accept old-version replay, new version with wrong old hash/receipt, expired access, cross-property and changed session, lost response and restart. A receipt never authorizes work, signature, invoice, debt or payment.                                                                                                                                                                            |

## C. Forward-only database/server requirements (not an executable migration)

Implement only the first slice's subset next; do not create a parallel estimate,
customer, property, decision ledger or provider outbox.

| Change                                                   | Exact required invariants and security                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1 · extend fourteen's decision ledger**               | Add a distinct nonfinancial request-changes choice and immutable customer-safe explanation. Existing approve/decline receipts remain valid. Explanation required only for request changes: valid UTF-8, trim edge whitespace, no Unicode rewriting, nonempty, maximum 2,000 Unicode code points; return exact server-accepted text. Existing 3A is not changed here. Strict allowlisted argument shape, acknowledgment version and server canonical body identity must include choice and note. Reuse existing pub/scope/version/customer/user/session columns, compound FKs and per-version/request unique guards. No raw client table grants.                                                                                                                                                                                                                        |
| **C2 · lifecycle command custody metadata**              | Private tenant-owned exact intent/phase/receipt metadata, not a second business ledger. Bind request ID, verified actor/session, operation kind, org/customer/property/estimate/version/publication and canonical request digest; reference committed decision/result. Unique logical operation/target prevents new-ID bypass. Commit one submission claim **before** dispatch in a separate transaction; do not rely on a rollbackable marker in the business transaction. Restricted caller gateway and SQL writer must enforce that claim, not trust client phase strings. Existing/pending/UNKNOWN after restart only reconcile; a crashed unused claim cannot automatically resume. No tokens, provider credentials, note text or row PII in custody/audit. Trust/provisioning and least-privilege review are acceptance gates, not inherited from disposable 2E. |
| **C3 · exact read-only status and staff request reader** | Customer lookup uses genuine current identity and retained exact org/customer/property/version/publication/request/body identity, including safe note semantics. Receipt-only lookup may survive document expiry under an explicit historical-visibility rule: current exact customer mapping/CRM required, reject revoked mapping/session/user; return only own receipt and request evidence, never republish expired scope. Staff reader separately requires current eligible estimates membership and source/property binding. No broad customer ledger list or client-supplied UID authority. Missing/denied/mismatched result is UNKNOWN/unavailable, not failed or retryable.                                                                                                                                                                                    |
| **C4 · revision provenance and packet archive**          | Private exact decision/source→existing draft relationship and immutable allowlisted packet archive, compound tenant FKs to current objects, unique per-request draft and per-draft-revision packet identities. Stored reviewer/session/command references, canonical encoding/schema version and safe snapshot hash. Snapshot reproducibility does not prove review or authority. Forward checked wrappers compose existing calculations/version methods and enforce live-source/current-staff/CAS/repair restrictions.                                                                                                                                                                                                                                                                                                                                                |
| **C5 · issuance result/authority**                       | Private one-shot issuer-committed exact command, immutable result references same draft now issued. No browser-mintable capability, rollback/savepoint/new-ID bypass, broad service-role request path or automatic phase continuation. Forward guard every reachable ordinary/internal/raw writer, duplicate path and job baseline path; negative tests must prove guards. Reuse engine totals/tax/version transition. SQL/server final authority cannot depend on in-memory origin Maps.                                                                                                                                                                                                                                                                                                                                                                              |
| **C6 · delivery/access integration**                     | Extend existing email outbox/control with reviewed single-claim dispatch/result identity; bind exact version/publication, recipient-purpose consent evidence revision and sender config/content digest. Existing `delivery='disabled'` remains until separately approved forward schema and provider activation. Preserve event/suppression monotonicity and tenant/account/message uniqueness; no new outbox. Publication revocation and expiry remain independent from issued immutability.                                                                                                                                                                                                                                                                                                                                                                          |

First-slice wire contract to implement (proposed names, no RPC added here):
`customer_record_review_request` accepts only the frozen command reference plus
`organization_id`, `publication_id`, `scope_sha256`, `choice`, `note`,
`acknowledgment:'review-only-v2'` and the once-allocated `request_id`. Choices are
`approve_review`, `decline_review` and `request_changes_review`; only the last permits
and requires a nonempty note. The server, not the note text, selects the exact issued
source via the publication. It returns an allowlisted immutable receipt with decision/
request/publication/version/customer/property identity, choice, accepted note,
server scope/request digests and recorded time. `customer_review_request_receipt`
reads that exact retained command/source identity; `customer_change_request_queue`
is the separately authorized staff-only projection. These names describe the forward
contract, not an existing available endpoint. Existing v1 two-choice receipts/readers
remain compatible; the old write RPC remains revoked until it enforces the same
custody/writer guards. New writer permission is not a blanket grant on all fourteen
RPCs. Claim acquisition/commit belongs to the restricted authenticated gateway, with
actor/session/target independently checked by SQL; browser-supplied claims cannot
create or resume authority. Provisioning that gateway is a separate reviewed action.

Every new private tenant-owned record requires `organization_id`, forced/default-deny
RLS as appropriate, no PUBLIC/anon/authenticated/service-role CRUD grants, explicit
least-privileged command grants, indexed tenant lookups and composite tenant foreign
keys. SECURITY DEFINER helpers use fixed empty search paths and restricted owners;
API wrappers remain narrow. Use one global documented lock order across customer,
publication, estimate/version, membership and command rows. Recheck live authority
after resource waits; reconcile by exact immutable identity with no mutation path.
Migration review must include PGlite **and native PostgreSQL 17** grants/catalog,
concurrency, rollback/savepoint, raw-writer and generated-type parity. Operational
SQL, service binding and privilege provisioning require their own reviewed package.

## D. Genuine identity/access and migration sequence

1. Preserve completed Action A/B/C1 identities/factors/provisioning and inactive C1;
   do not recreate users, reenroll factors or replay grants. Staff request commands
   derive UID from genuine Auth, verify current live `auth.sessions` row and expiry,
   current confirmed/nonanonymous/nonbanned/nondeleted user, active tenant membership,
   allowed estimates role/module and AAL2 for owner/admin. Control-plane grants do
   not confer tenant/customer access.
2. Complete independent recovery/pairing/maintained custody and existing exact frozen
   P1 prerequisites. Original P1 approval remains valid for **exactly thirteen-history**
   operation SHA-256 `01b96075d2f04acef730114427bc595986a1f0ce2720ed7fd3c9e84e304e141a`.
   Do not ask for duplicate P1 approval or install fourteen to work around its history
   guard. No physical-device PASS is implied by completed software setup.
3. After P1, separately review/authorize exact customer fourteen file/bundle and
   default-deny installation. File SHA-256
   `e3157e004c464fb2a4ab69e7a3a335a81d6bbbb0556d74234f3884f56d784ed1`;
   bundle `30e5f91b9e1148e6195b09f98988e132729a6708634caca48b3388fa96da25d2`.
   Installing it grants no login, publication, mapping, lease or decision authority.
4. Review the first slice's **new forward extension after fourteen** independently;
   never edit fourteen or older files. Review exact migration hash, SQL privileges,
   generated types, adapter/custody trust and restore plan before any hosted request.
   Separate explicit authorization is required for mapping existing internal test
   customer identities, bounded access/publication, feature/execute grants and genuine
   internally operated acceptance. No outside customer gets access from test approval.
5. Implement/review narrowly scoped customer session acquisition/renewal/signout
   custody: no URL token/tenant identity, public signup, auto-refresh fallback or
   sample data in connected routes. Explicit expiry, CSRF/origin/XSS controls, token
   secrecy, rotation/revocation and server session checks must pass before mounting.
   No credentials/session creation or Auth configuration changes occurred here.

Official current Auth guidance confirms `session_id` maps to `auth.sessions`, while
revoked access JWTs can remain valid until expiry. This supports retaining the existing
DB live-session guard rather than treating JWT parsing as revocation verification.
See [sessions](https://supabase.com/docs/guides/auth/sessions) and
[signout](https://supabase.com/docs/guides/auth/signout). Grants control API reachability
and RLS controls rows; both must be checked ([API security](https://supabase.com/docs/guides/api/securing-your-api)).
The [changelog](https://supabase.com/changelog) was reviewed October 31; no dependency,
Auth configuration or hosted update was performed. SDK remains pinned at 2.118.0.

## E. Genuine delivery prerequisites

Reuse `verifyTenantSender`, approved DNS evidence, `prepareTenantNotification`,
`DurableEmailPreparation` and existing private email records. `VerifiedSender` is
currently a process-local, profile-bound expiring proof; a reconstructed object/hash
is not proof after restart. Reverify through separately authorized provider/DNS reads
or a reviewed durable verification record before any future dispatch. Existing
`CommunicationRepository.load` exposes generic consent/suppression booleans; it does
not yet resolve durable **estimate-ready-purpose** consent evidence. A profile or
company email setting alone is not verified sender authority.

Before dispatch, independently prove all of these for the same organization:

- Current tenant-owned provider account, sender/domain and configuration version;
  actual verified provider domain plus approved current SPF/DKIM/DMARC evidence.
- Verified CRM recipient resolved server-side, exact active customer identity and
  purpose-specific consent/legal basis evidence with timestamp/revision/revocation;
  current durable suppression immediately before dispatch. Never accept a browser
  recipient override or clear complaint/bounce suppression on a later delivered event.
- Exact issued document/version and customer/property, canonical safe content hash,
  explicit bounded publication and protected application access. A message link is
  navigation to authenticated exact-version access, never bearer authority, public
  storage, automatic login or a route carrying credentials. Expired/revoked access
  gives no scope; no leak via logs/referrer/cache/error or expired-link fallback.
- Durable existing outbox preparation, one server-owned dispatch claim committed
  before provider I/O, exact tenant/account/provider-message identity and verified
  webhook binding. Same idempotency key aids lookup but **does not permit retry after
  UNKNOWN**. No automatic resend/replacement on timeout or provider key expiry.
- Read-only provider/result reconciliation after crash, failed/unknown delivery
  evidence retained, bounded expiration/revocation and append-only audit without PII.
  Provider accepted, delivered, customer viewed and customer responded are distinct.

No sender/DNS/provider validation call, email, internal sink action, outbox mutation
or secure customer link was created by 4A. Netlify Private/all-deploy protection and
runtime access verification remain independent gates; a prepared packet is not
publication. Contracts, signatures, work, invoices, receivables and payments stay off.

## F. One implementation-ready next slice · persisted customer requests

**Implement 4B: exact authenticated review-preference/change-request persistence and
receipt reconciliation, with a read-only eligible-staff request queue.** Reuse fourteen's
ledger/publication/guards and existing SDK/prepared reader. Do not include revised
draft creation, packets, issuance, delivery or another synthetic workflow in this slice.

Concrete implementation outputs:

1. A separately reviewed forward **local proposal**, C1–C3 only, default-deny with
   unchanged fourteen dependency. Extend its decision RPC semantics with versioned
   safe explanation/body identity; add exact historical receipt/status and staff queue
   projections. No general ledger CRUD. Reuse estimates/versions/CRM, not release-test
   decisions. New methods/types must leave existing two-choice clients compatible.
2. Caller-bound request command adapter with server-owned durable pre-dispatch intent/
   single claim and exact read-only reconciliation port. Durable source tuple/digest
   survives process loss; current authentication must be reacquired, never persisted
   as a capability. Every existing/UNKNOWN intent reconciles only, including a crash
   before business write; no automatic retry, new ID or newly leased-publication bypass.
3. Reuse approved customer explanation/confirmation and staff Estimates components
   through guarded, default-off operational interfaces. Do not redesign or open routes;
   keep local 3A–3E examples separate. A durable actual receipt drives the staff reader,
   rather than a constructed sample request. No staff revision mutation in 4B.

Required acceptance, initially disposable/local and later repeated on the exact
separately authorized internal target with genuine internally operated identities:

- All three companies, authorized own versions/property and cross-tenant/customer/
  property/UID rejection; staff/platform/customer separation, role/AAL2/session expiry,
  ban/deletion/revocation before/after lock waits and module/capability default denial.
- Exact original snapshot/hash/pub/version/request and safe accepted note/receipt;
  Unicode/2,000-character/blank/HTML/script cases and no costs/staff notes/workforce
  fields; approve/decline compatibility and no inferred repair or financial authority.
- Native concurrent conflicting requests/claims, source changes, request digest reuse,
  immutable source/decision/audit, no direct/raw writer or RLS/grant bypass. Existing
  per-version uniqueness across renewed publications must block duplicate requests.
- Separate-process interruption before/after intent commit, claim commit, business
  commit and acknowledgment; restart exact reconciliation with no resubmission. No
  receipt is UNKNOWN, not failed. Historical own receipt can be read after publication
  expiry under C3; revoked mapping or foreign UID cannot retrieve it.
- Actual pinned SDK/PostgREST contracts, default-off connected UI, approved desktop/
  tablet/mobile/keyboard/accessibility and exact staff receipt handoff; no issue, send,
  contracts/jobs/invoices/debt/payment, hosted/provider or outside-access side effect.

**Approval requirements:** 4A grants local preparation only. A 4B implementation
direction may authorize this local proposal/code/tests, never application. Hosted
installation needs original recovery/P1 prerequisites, separate exact fourteen and
forward-extension hash approvals, then separate exact grants/mapping/publication/
internally operated Auth acceptance authorization and verified protected runtime.
No credentials, real customer access or communications are needed for 4A. Actual
external delivery and launch remain later distinct approvals. Do not repeat the 4A
review as another documentation-only workstream.

## Verification and preservation

See `CONNECTED_CUSTOMER_LIFECYCLE_VALIDATION.json` for focused protocol, regression,
types/lint/build/format/integrity and normal automatic CI evidence. Fake transport
tests exercise genuine existing SDK interfaces; they do not prove genuine sessions,
hosted grants, durability, expiry behavior of a live provider or operational acceptance.
No UI, historical/pending SQL, source compiler, generated type, dependency, P1 artifact,
Netlify package/executor, maintenance 2A–2F or billing enhancement was changed.
Locked brands/Propel artwork and original README remain unchanged. Recovery/Netlify
workstreams remain independent unresolved gates, not a reason to repeat their tests.
No hosted action, credential read, deployment, publication, customer communication,
financial action or merge. **Release 1.0 remains NOT READY / NOT AUTHORIZED.**
