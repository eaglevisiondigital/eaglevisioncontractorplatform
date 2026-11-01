# Sales estimate-to-contract handoff candidate

Date: 2026-11-01. Feature IDs: EST-001, EST-002, SAL-001, COM-001, UX-001.
Exact parent: PR7 `7fc529d1a1c68fd349e70410d79ef8a21cf0e475`.
Branch: `codex/program-sales-approval-handoff`. Uncommitted candidate pending main
integration review; no CI, hosted or release claim. Release 1.0 remains **NOT READY /
NOT AUTHORIZED**.

## Audited gap and implemented behavior

Actual `ReleasePreview.publish_offer` retains `customerPreview` selling scope and
`decide_offer` records its immutable accepted/declined/change-requested test receipt.
Its existing synthetic `create_contract` consumes that offer scope. The ordinary
Estimates view has no read-only staff handoff that separates exact source/receipt
matching from missing contractual terms, genuine identity, delivery and signing
acceptance. This candidate fills that review gap with an unmounted component and
reader. It does not call `create_contract` or change any engine/projection.

`readSalesApprovalHandoff` consumes existing Phase3Repository, Operations current
synthetic membership/CRM relationships and the actual ReleasePreview instance.
Caller selection must name organization, actor, estimate, immutable issued version,
customer, property and exact offer/receipt IDs. Null references remain missing; no
latest/nearest/replacement selection. `projectIssuedReview` remains unchanged and
issued-only. Canonical `customerPreview` supplies the same scope the existing
contract engine consumes; no copied calculation, approval ledger or transaction
layer is introduced. Notes from customer responses are deliberately not projected.

Exact source, current estimate, offer and receipt identities and full snapshot
agreement are checked before returning detached safe selling scope. Primitive/date
admission rejects object-valued fields, invalid dates and non-test consent. Scope
hashing reuses existing `documentHash`; after hashing, source/current data and the
actual release workspace are reread and compared, and current eligible staff/CRM
are checked after the final await. A mismatched, denied, missing source or changing
read returns UNKNOWN without source/receipt data. Receipt absence, stale current
version, expired source/offer, decline and changes requested remain visible blockers.
Reload is exact read-only inspection; it issues no commands and never replays.

A matched accepted **test preference** is labeled `scope_matched`; contract execution
is always `BLOCKED`. Issued-estimate terms are displayed separately from UNVERIFIED
approved contract terms. Genuine customer identity, signing consent/evidence,
jurisdiction/template review, customer delivery and operational custody remain
UNVERIFIED. A local scope hash proves none of them. Existing issued history and
original receipts remain unchanged; no contract/signature/job/invoice/authorization/
payment/ledger/message is created by the reader or component.

## Composition, ownership and local demonstration

Only new reader/component/scoped CSS/test files and this record are owned here.
There is no App/Estimates mount, route/menu change, schema, migration, repository
interface, global style, approved customer/contractor UI or artwork edit. Main owns
shared build state, decisions, acceptance register and features:check integration.
This exact older PR7 parent does not contain features:check; main must run the current
combined checker and protected-hash review without backporting unrelated tooling.

The component defaults OFF and also requires an existing synthetic repository.
The standalone **test document** additionally requires DEV, an exact environment
flag and literal loopback; it is excluded from the ordinary production App build.
From this worktree:

```sh
VITE_SALES_HANDOFF_TEST=true npm run dev -- --host 127.0.0.1 --port 4196 --strictPort
```

Open `http://127.0.0.1:4196/tests/browser/fixtures/sales-handoff.html`. Choose a
contractor and test preference, then explicitly press **Prepare local test evidence**.
This uses actual create/issue/offer/decision APIs in controlled local fixtures.
Inspect scope and exact references; use the development fault controls followed by
**Reload exact evidence** to review stale, denied and failed reads. Reload/browser
restart loses fixture state. This is not genuine Auth, durable custody or customer
approval. The test document never imports App or any connected credential factory.
Stop the foreground server when finished; no persistent execution is installed.

## Validation and limits

Focused application command:

```sh
npx vitest run tests/sales-approval-handoff.test.ts tests/sales-contract-handoff.test.ts tests/release-preview.test.ts tests/customer-access.test.ts
```

The new suite covers all three contractors, exact scope/hash/receipt/version,
current source, foreign customer/property/company/actor/version, declined/changes,
missing references, expiry, newer draft, immutable issued history, detached safe
fields, object-valued primitives, invalid/future evidence, revoked staff after the
last await, default-off/connected rejection and no downstream writes. Relevant
retained handoff/release/customer-access cases are compatibility checks, not a new
Foundation baseline run. An initial test fixture incorrectly used saveLocation's
void result; corrected to an exact existing CRM read without an API change.

`tests/browser/sales-handoff.spec.ts` compiles the actual unmounted component and
controlled real-engine fixture. Its three scenarios run in Desktop Chrome/iPad Mini/
iPhone13 projects: all companies and exact references, keyboard details/focus,
axe/overflow/privacy/no external requests; declined/changes/missing/stale/UNKNOWN
and revoked staff; held source response followed by company switch. The first
browser run reproduced inherited dt contrast4.16:1; the new scoped dt now uses the
existing #1c2d36 text token. No locked/global style or axe assertion was weakened.
Visual screenshot review then caught the global shell's fixed header height causing
mobile overlap; a scoped static/auto-height header and vertical-containment
regression correct it. The test's exact accessible combobox locator was also corrected. Test-only bundle
explicit DEV/flag defines do not change the real production gate.

Screenshots are ignored local synthetic evidence:
`artifacts/phase3/{desktop,tablet,mobile}-sales-handoff-{sample-property,sample-construction,sample-roofing}.png`.
Final local evidence: **28 new cases / 66 focused application cases PASS** across
four files; **9/9 actual browser cases PASS** across all three viewports, all three
companies, zero exercised axe/width-overflow/vertical-overlap failures and no external
requests. Desktop and corrected mobile screenshots were visually inspected. Strict
types, focused ESLint, changed-file Prettier, diff whitespace and local build PASS.
The documented flagged DEV/loopback demonstration was also opened in actual Chromium
and its real accepted test receipt/scope rendered; the foreground server was stopped.
No existing tracked parent file changed. Main records exact delivery SHA/automatic
CI after review; no inherited green claim applies to these new files.

Point-in-time scope reads are labeled with as-of time; external membership/source
changes require an exact reload, and no action can be executed from a snapshot.
Axe applies only to exercised states. No physical-device or genuine hosted acceptance.
Rollback removes these new unmounted files; no migration/data recovery is needed.
All13/pending customer14/original4B/broker/frozenP1/four artifacts/approvals,
recovery/NMI/Auth/2A–2F/billing/financial/provider/Netlify/executor/production/
deployment/merge restrictions remain intact. No hosted action, credential retrieval,
customer communication, operational signature or financial execution is authorized.
