# Sales accepted-scope reference · Cycle four

Date: November 1, 2026. Owner: `/root/cycle4_sales`. Branch:
`codex/program-approved-scope-reference`, exact parent PR11
`4460c4a200e00c1b976a2305e04c3c01e1c386f5`. Feature IDs: EST-001, EST-002,
SAL-001, COM-001, UX-001. This is an isolated local review candidate, not merged,
issued, delivered or operationally accepted. Release1.0 remains **NOT READY /
NOT AUTHORIZED**. Main owns the master register and exact SHA/CI evidence.

## Implemented gap

The existing Cycle-three handoff reads exact issued scope and actual accepted,
declined or change-requested `ReleasePreview` receipts. Its point-in-time result
could not retain a stable immutable accepted-scope reference or independently
verify retained evidence against original sources. This package extends that
same module/component. It creates no estimate, customer, contract, approval store,
ledger, new engine or transaction layer.

`captureSalesApprovedScopeReference` requires explicit primitive confirmation and
the exact scope hash displayed to the staff reviewer. Only a current, unexpired
exact issued version with an accepted **local test preference** can be retained.
Missing/foreign/stale/declined/changed/unavailable evidence blocks capture. It
performs two complete existing Phase3/CRM/ReleasePreview reads around hashing,
with current eligible staff/property checks after waits. It executes no command.

The reference contains only allowlisted evidence:

- Fixed local review schema/mode and responsible synthetic reviewer reference.
- Exact organization/customer/property/estimate/estimate-number/issued-version,
  version-number, saved lock revision and issue timestamp.
- The existing canonical customer-facing selling scope and its SHA-256 hash:
  approved branding/contact facts, customer/property reference, project, allowed
  descriptions/quantities/units/line amounts, subtotal/discount/tax/total, proposed
  schedule, customer-facing notes/terms and visible attachment metadata.
- Exact original offer ID/create/expiry and accepted test receipt ID/offer/decision/
  `internal-test-v1` consent/recorded time. Response notes are excluded.
- `contract_execution: BLOCKED` and SHA-256 integrity of all content above.

Nested scope objects are reconstructed instead of serializing internal source
objects. Internal costs, supplier prices, payroll/workforce fields, margin, private
notes, response explanation and repair/readiness evidence stay outside the reference.
No second calculation is added: `projectIssuedReview`, `customerPreview` and existing
issued calculations remain authoritative. The issued-only guard and ordinary repair
restrictions remain unchanged. No repair authorization callback or issuer is called.
The same exact content has the same integrity hash; repeated retention creates no
business record or downstream action.

The reference and every nested object/array are frozen and detached. Draft changes
cannot mutate it. The component holds it only in the same tab; refresh loses it.
A hash proves local integrity, not genuine customer identity, legal approval,
signature, delivery or durable custody. The API name "approved scope" identifies
the accepted local test preference only.

## Independent verification and presentation

`verifySalesApprovedScopeReference` pins caller target and retained primitive data
before the first wait. Bounded own-data descriptor copying rejects getters, function
fields, extra/non-enumerable/symbol/array fields, primitive wrappers and malformed
data without invoking `toJSON` or string coercion. Key insertion order does not
change identity and rejected contents are never echoed.

Verification rebuilds expected content from the same exact original version,
offer and receipt, checks all content/hash and rereads current original sources
after hashing. A caller-recomputed hash does not grant source authority. It never
selects a newer estimate, offer, receipt, customer or property.

- `current`: exact original evidence remains current; contract execution BLOCKED.
- `stale`: original scope/receipt still match, but a later draft/current version or
  expiry blocks further use. Original reference bytes remain unchanged.
- `unknown`: source denial/loss/conflict/drift, wrong context or altered reference.
  Only exact read-only verification is allowed; no replay/replacement command.

The existing unmounted/default-OFF handoff adds explicit review confirmation,
**Retain review-only scope reference**, immutable identity/hash details and
**Verify retained exact reference**. Stale results disable capture. UNKNOWN results
immediately hide source/reference facts. Reload/verification can inspect original
references again without authorizing execution. Late source/capture results cannot
restore a prior contractor context. No contract, work order, invoice, payment
mandate, customer URL, recipient or sending capability is created.

The section reuses existing scoped handoff CSS, contractor primary color, typography,
surfaces and touch controls. No App route/menu, repository API, shared engine,
global token, approved portal/back-office UI or artwork changes.

## Local demonstration

From this worktree run the existing explicit DEV/loopback test harness:

```sh
VITE_SALES_HANDOFF_TEST=true npm run dev -- --host 127.0.0.1 --port 4196 --strictPort
```

Open `http://127.0.0.1:4196/tests/browser/fixtures/sales-handoff.html`. Choose any of
three contractors, explicitly prepare actual local test evidence, inspect issued
scope, check the review-only confirmation and retain the reference. Independently
verify it. Collapsed fault controls can prepare a newer private draft, fail reads
or revoke the reviewer. Verify/reload to see stale/UNKNOWN with no source replacement.
Declined/change-requested/missing evidence cannot be retained. These are controlled
local fixtures, never connected production actions. Stop the foreground server
after review; no persistent background process is installed.

## Validation

```sh
npx vitest run tests/sales-approved-scope-reference.test.ts tests/sales-approval-handoff.test.ts tests/sales-contract-handoff.test.ts tests/release-preview.test.ts tests/customer-access.test.ts
```

The new tests cover all three companies, canonical values, immutable original
versions, deterministic/full hashes, explicit confirmation/reviewed hash, foreign
exact IDs, declined/change-requested/missing receipts, expired/newer drafts,
altered/forged/extra data, key order, inherited serializers/getters, caller mutation
before awaits, actual membership downgrade/revocation while awaiting, connected
denial, source loss/drift and no contract/signature/job/invoice/payment/ledger/
message side effects. No new privileged callback is invoked.

Actual-component browser tests exercise keyboard capture/verification in all three
brands, stale/UNKNOWN visibility, unchanged reference facts after a new draft,
lost source/revoked staff, company changes during both source reads and capture,
default OFF, privacy/no external requests, axe and responsive containment on
desktop/tablet/mobile. An initial new assertion mixed innerText with textContent;
its correction compares rendered text consistently and retains full unchanged-fact
validation. Final source bytes pass **39 new / 105 focused application cases**
and **15/15 actual responsive browser cases**, including all three brands. Full
ESLint, strict types, full Prettier, local build and diff whitespace checks pass.
Desktop and mobile section screenshots were visually inspected; no overflow,
contrast or vertical overlap regression was observed in the exercised states.

Ignored local screenshot evidence:
`artifacts/phase3/{desktop,tablet,mobile}-sales-approved-scope-{sample-property,sample-construction,sample-roofing}.png`
and matching `-sales-approved-scope-reference-` section captures. Screenshots contain
synthetic evidence only and are not committed. Main independently reviews combined
source/type/isolation/accessibility/ownership/protected integrity.

This older exact PR11 parent has no `features:check`; main runs the current combined
checker instead of copying unrelated tooling. No dependency/lockfile, schema or
migration changes. All13/customer14/original4B/P1/four/approvals/2A–2F/billing/locked
UIs/Netlify/executor, recovery/NMI/Auth/provider/financial/hosted/communication/deploy/
merge gates remain. No credentials, hosted mutation, message or provider execution.
