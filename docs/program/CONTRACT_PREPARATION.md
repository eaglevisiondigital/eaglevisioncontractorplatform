# Contract preparation checklist · Cycle 5 Sales

Feature: A2 sales preparation. Branch `codex/program-contract-preparation` starts
at exact draft PR18 `ed3a099207ad3e29b3b1e70aba2fc809664a60bb`.
Owner: `/root/cycle5_sales`; main owns integration and delivery. Local synthetic
review only. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working implementation

The optional existing SalesApprovalHandoff section now composes a four-part review
of its actual retained issued-scope reference: scope/canonical totals, accepted
LOCAL-TEST receipt, recorded estimate terms/dates and the preparation boundary.
A separate final confirmation enables **Prepare staff contract review**. No
automatic preparation occurs on capture, save or checking an individual item.
The section defaults OFF, including when the original handoff is enabled.

`sales-contract-preparation.ts` calls the unchanged existing exact-reference
verifier/capture methods. Current eligible staff and actual CRM company/customer/
property/estimate/version/offer/receipt relationships are rechecked across source
waits and after hashing. The exact saved current issued version and lock revision
are required. A newer private draft, changed selected option, version, scope,
customer/property, expiration, missing source or revoked staff denies preparation.
No latest-version substitution or source inference is used.

Preparation returns one deeply frozen detached snapshot with:

- The exact original C4 reference, including canonical customer-facing amounts,
  issued scope/terms/dates, exact source/receipt identities and integrity hashes.
- Four explicit checklist confirmations, responsible synthetic reviewer and time.
- Stable SHA-256 evidence over sorted own primitive data, independent of caller
  field order. No caller getter or serializer is executed to admit evidence.
- UNVERIFIED contract legal-reference/document-hash and signature requirements
  using existing Contract/Signature field names, genuine identity and custody.
- Contract execution **BLOCKED**, without creating a Contract or Signature.

The existing canonical estimating engine remains authoritative. This module does
not recalculate amounts, invent legal wording, infer approval, construct a second
estimate/contract store or invoke any release command. Issued originals and the
customer's actual test receipt remain unchanged. Private costs, margins, workforce,
staff-only notes and customer response notes never enter the snapshot.

Exact read-only verification returns current, stale or UNKNOWN. Later drafts never
alter retained preparation; a stale result retains original facts with a clear
warning. Missing/denied/altered evidence returns UNKNOWN and hides source details.
The UI holds a failed attempt, prevents duplicate preparation before awaiting and
allows only exact verification of an existing snapshot. It never retries a command
or selects a replacement. Repository, target and reference changes reset checklist/
snapshot state; late responses cannot restore old contractor evidence. All of this
is same-tab memory, not durable command custody or process-crash acceptance.

## Demonstration

Use the existing explicit DEV/loopback harness from this branch:

```sh
VITE_SALES_HANDOFF_TEST=true npm run dev -- --host 127.0.0.1 --port 4196 --strictPort
```

Open `http://127.0.0.1:4196/tests/browser/fixtures/sales-handoff.html`.
Choose any contractor, prepare actual local test-engine evidence, review and retain
its exact scope reference. Expand **Controlled evidence fault controls** and opt
into **Enable preparation checklist**. Complete four reviews and the separate
confirmation, then prepare and verify the immutable staff snapshot. Fault controls
exercise a newer draft, revoked reviewer, failed/held reads and company changes.
The harness creates only the already-reviewed local fixture offer/test receipt;
preparation itself invokes no writer. No customer URL or operational route exists.
Stop the foreground server after review.

## Focused validation

```sh
npx vitest run tests/sales-contract-preparation.test.ts tests/sales-approved-scope-reference.test.ts tests/sales-approval-handoff.test.ts tests/sales-contract-handoff.test.ts
npm run build
npx playwright test --config tests/program/playwright.sales-preparation.config.ts
```

**37 new /109 related application cases PASS.** Actual source fixtures exercise all
three companies, canonical values, exact request/receipt/version identity, real
selected-option edits, missing/expired/stale/UNKNOWN, actual final-read membership
downgrade, changed confirmation, altered/private fields, malicious getters and
inherited serializers, immutability and absence of command/contract/signature/job/
financial/message side effects. Initial hash verification exposed inconsistent
field ordering; canonical sorted own-data hashing corrected it without weakening
the integrity assertions.

**12 new /27 related responsive browser cases PASS** on desktop/tablet/mobile.
All three palettes, explicit keyboard review/preparation, canonical source and term
display, source privacy, disabled repeat action, stale/UNKNOWN visibility, revoked
staff, held responses/context reset, default OFF, zero axe violations, zero page
overflow and no external requests pass in exercised states. Existing 15 handoff
browser cases remain passing. Strict types, generated-type integrity, ESLint,
full Prettier, local build and diff whitespace checks pass. The 128-path public
protected manifest and all five design files/thirteen source bindings match.
These checks prove local behavior only, not universal accessibility or hosted QA.

Real ignored synthetic screenshots are in
`artifacts/phase3/{desktop,tablet,mobile}-contract-preparation-{sample-property,sample-construction,sample-roofing}.png`
and matching `-contract-preparation-snapshot-` images. Desktop and mobile snapshot
captures were visually inspected. No global styles, approved page design, artwork,
App route, engine, library verifier, dependency, schema or migration was changed.

## Integration and remaining dependencies

Owned new library/component/test/config/document files and a narrow existing
handoff UI/CSS/test-harness extension compose after exact PR18. No shared contracts
or protected sources are owned by this branch. Main reviews and applies only this
bounded descendant diff for disposable combined validation; no PR merge is allowed.
Rollback removes the opt-in section and new pure preparation module only.

Actual contract generation/signature needs separately approved jurisdictional
templates and legal references, genuine identity/consent/signature evidence,
delivery, operational custody, exact command authorization and connected acceptance.
No legal sufficiency, genuine customer approval, signing, work, financial or delivery
authority is claimed. Recovery/P1-on13/separate14/exact4B+broker, all13/customer14/
original4B/P1/four/approvals/2A–2F/billing/locked UIs, frozen Netlify/executor,
NMI/Auth/provider/financial/communication/hosted/deploy/merge gates remain intact.
