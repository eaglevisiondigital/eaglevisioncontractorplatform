# Workstream 3E · complete local revised-estimate customer loop

October 30, 2026 · base `6193d0f4061b57be820e1264f01ca6e01aa6c93d`.
**IMPLEMENTED · LOCAL SYNTHETIC ONLY. Release 1.0 NOT READY / NOT AUTHORIZED.**

## Working demonstration

Open http://127.0.0.1:4173/preview/property-portal in one tab (`npm run build`,
then `npm run preview -- --host 127.0.0.1 --port 4173` if needed).

1. In **Estimates & repairs**, record an actual **Request changes version 2** with
   an explanation and explicit synthetic acknowledgment. Use **Development-only
   preview controls → Open local staff estimate review** to enter existing `/preview`
   **Estimates**. Review/confirm the exact receipt and prepare its private version 3.
2. Edit/save through the existing builder. **Revision comparison & packet** compares
   the immutable issued source with this saved draft. Confirm/prepare the 3C packet;
   choose **Issuance readiness & delivery dry run**, then explicitly **Review Issuance
   Requirements**. That 3D review remains **BLOCKED** for genuine execution.
3. The separate **Return revised estimate to customer review** panel shows the exact
   original receipt/source, version 3, saved lock revision, packet/hash and canonical
   selling-scope hash. Separately check its synthetic issuance confirmation and choose
   **Issue exact version 3 — synthetic only**. The same version ID becomes issued;
   no offer, customer response or real delivery occurs automatically.
4. In the resulting issued view, explicitly check **Prepare this exact synthetic
   issued version in the internal sink only** and choose **Prepare internal-only
   offer**. This calls the existing ReleasePreview `publish_offer` once. Its channel
   is `internal_sink`, and actual delivery is **none**. No sender, address, external
   customer URL, email, SMS, provider request or outbox is resolved or created.
5. **Review revised version in local customer portal → Estimates & repairs** shows
   issued versions 1/2/3, the original version-2 request/receipt, the revised selling
   scope/price/notes/terms, and exact-ID changes between versions 2 and 3. Version 3
   initially awaits its own response; earlier preferences never carry forward.
6. Choose **Preview approve version 3**, **Preview decline version 3** or **Request
   changes version 3**. The existing bounded explanation, acknowledgment, confirmation
   and version-specific decision engine record a new immutable receipt. Version 2
   remains unchanged. A further change request is visible to staff but cannot create
   version 4; another revision workflow is outside this package.
7. Reload/new tab loses this heap and resets to the original examples. This is not
   genuine Auth, persistent approval, crash-safe custody or actual customer delivery.

All three approved contractor brands and desktop/tablet/mobile work. Original routes,
module navigation, palette, typography and artwork are retained. New controls use
existing notices/fields/buttons, with scoped contrast and wrapping styles only. Prior
versions' two-version presentation is unchanged until a third issued version exists.

## Exact synthetic boundary and existing engines

`CustomerRevisedEstimateLoop` composes actual3A receipts, confirmed3B provenance,
verified3C packet and recorded current3D source facts. It uses an opaque review claim
and a distinct explicit3E confirmation. It does not reinterpret the3D BLOCKED verdict
as approval, nor infer changes from the customer's note.

`Phase3Repository.issueSyntheticCustomerRevision` rejects connected repositories,
foreign packet/repository claims, ordinary estimates, wrong source or version, repair
origins, dirty/live-closed editors, stale locks/packets, changed canonical calculation,
changed local tax, expired drafts and ineligible/revoked staff. Only exact source
version2 → existing saved version3 is supported. The original request/offer, tenant,
customer, CRM location, source version, packet UUID/SHA-256 and canonical safe selling
scope are checked again synchronously after hashing and immediately before mutation.
The same existing sample transition helper now serves ordinary sample issuance and
this narrow operation; identity, line IDs, payload, canonical amounts, saved revision
and immutable original history are retained. Ordinary `issue` still rejects customer
revisions and repair drafts before any RPC. Connected RPC/SQL contracts are unchanged.
No second estimating engine, property/customer system, schema or ledger is introduced.

Private exact issuance provenance binds attempt UUID, original receipt/offer/source,
version3 and saved revision, packet/hash, scope hash, reviewer and timestamp. Reads
validate retained issued/current/history/source identity, current staff and CRM.
Original packet and3D result bytes/hashes remain unchanged. Old review-only evidence
is historical after issuance; it is never rewritten into a capability.

The portal retains one existing ReleasePreview instance before attempting the exact
newly issued version's offer. Only a validated offer plus its exact internal-sink
message makes that version visible. The existing issued-only safe projection and
exact-ID comparison remain authoritative. An original inspection source association
is retained only when its exact original source line remains; removing it never
assigns another line to that finding. Customer views exclude costs, margins, supplier/
payroll fields, staff notes, issuance review records and private packet/readiness data.

## One-shot custody and UNKNOWN

There is one session attempt per estimate/request; both coordinator and estimating
boundary reserve before awaiting. A second/concurrent issuance, generic retry or
replacement identity cannot pass. Issuance acknowledgment loss retains UNKNOWN and
cannot prepare an offer. **Read exact issuance / offer status** only reads the reserved
issuance, original packet/hash, exact issued version and retained offer engine. Missing
records stay undetermined. A found issuance can settle that exact outcome; preparing
its internal offer still requires a separate explicit action. No reconciliation
method issues or publishes, and no absent result is interpreted as failure.

Internal-offer preparation has a separate pre-await hold. Lost acknowledgment keeps
its exact engine and version; no second `publish_offer`, replacement or automatic
continuation. Exact reconciliation can reveal a retained matching offer, without
sending or replaying. Expired drafts/offers reject new actions. Existing version-
specific customer pending/UNKNOWN guards and exact receipt reconciliation remain.
The new response cannot modify the original receipt or issued versions, and cannot
invoke contracts, signatures, jobs, invoices, receivables, payments or debt.

These are in-memory laboratory controls, not an authenticated or durable operational
transaction boundary. Same-owner code tampering, crash/refresh recovery, genuine
identity, legal/tax suitability and real delivery remain outside the evidence.

## Verification and visual evidence

See [validation](CUSTOMER_REVISED_ESTIMATE_LOOP_VALIDATION.json). **161 focused application cases (31 new) and81 unique browser cases (12 new) pass**. Final21-case browser verification passes with60 other prior regression cases retained; zero axe/overflow findings. Strict/generated types, lint, build, formatting and integrity checks pass.513 protected existing tracked files and frozen artifacts match. Focused application
checks cover actual3A→3B→3C→3D→3E, all3 companies, unchanged originals/calculation/line
identity, approve/decline/change-request receipts, no version4, duplicate/concurrent/
pending/UNKNOWN, current staff/tax/CAS/source/repair/privacy and no network/financial
side effects. Actual browser tests cover all3 brands and viewports, complete same-tab
flow, separate receipt rendering, exact source binding, keyboard controls, refresh,
closed connected paths, accessibility and overflow. Relevant existing UI/domain
regressions are retained; unrelated completed recovery/Netlify/security suites are
not rerun locally. Normal automatic GitHub CI remains broader verification.

Real, unedited browser captures under ignored `artifacts/property/`:
`revised-loop-{desktop|tablet|mobile}-{sample-property|sample-construction|sample-roofing}-{confirmation|internal-offer|customer-v3|response}[-viewport].png`.
CI collects these through the existing screenshot artifact. No mockup or generated art.

Initial browser checks found contrast on the new panel's labels; scoped styles fixed
it. Existing approve/decline form names omit the button's Preview prefix; the test
selector was corrected. No axe rule, timeout, assertion or permission was relaxed.

## Preserved release boundaries

Thirteen historical migrations, pending unapplied customer14, frozen P1 operation/
four artifacts/owner approvals, original Netlify archive/executor, maintenance2A–2F
operational gates and six PROPOSED billing enhancements remain unchanged. Approved
shells/logo/brand assets stay intact. No credential retrieval, genuine Auth, hosted
DB/configuration/write, migration, recipient lookup, external sending, financial/
provider execution, deployment, publication, recovery acceptance or GitHub merge.
Release1.0 remains **NOT READY / NOT AUTHORIZED**; draft PR#1 remains unmerged.

## Next finite package · connected lifecycle integration review

Recommend one bounded integration package, not more synthetic layers. First identify
and review these minimum dependencies; implementation/activation needs separate exact
owner authorization, and cannot infer approval from this laboratory:

| Gate                | Minimum implementation and independently verified exit evidence                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | Genuine current staff Auth/AAL2 where required, current eligible tenant membership; authenticated customer identity bound to exact customer/property, independent of browser selection.                                                                        |
| Persistence/custody | Server-owned durable request/receipt, packet and issuance/offer attempt identity; transactional CAS/unique guards, append-only history, unknown/outage/restart reconciliation. No local heap or synthetic2E fixture promoted as operational authority.         |
| Issuance            | Reviewed server command using canonical version transition, current tax/terms/expiry and exact packet/source binding; preserve repair holds and published originals. No browser token can grant it.                                                            |
| Customer access     | Separately reviewed customer14/mapping/lease/publication controls after frozen P1 prerequisites on13 history; exact expiring recipient-access authorization and negative tenant/property/version tests. Connected routes remain closed until their gates pass. |
| Delivery            | Verified contractor sender/domain, verified exact recipient, consent/preferences/suppression, protected link and scoped provider adapter; durable idempotency, exact receipt and UNKNOWN handling. Internal sink never counts as delivery.                     |
| Acceptance          | Finite isolated-target end-to-end tests, source/privacy/revocation/expiry/concurrency/outage/security evidence and owner action-specific sign-off. Independent recovery and Netlify remain separate unresolved gates.                                          |

Exit is a reviewed, target-specific integration/authorization contract identifying
which narrow server/persistence/access adapters can be implemented next, with all
financial/contracts/signature/work authority still disabled. No deployment, schema
application, recipient access or communication activation is authorized by this plan.
