# Cycle 6 Field workflow · exact local job evidence

Owner: `/root/cycle5_operations` / Field. Branch `codex/cycle6-field`.
Exact source-composition base: `857299483bd2d9423e75632b1209fed0fe65be43`.
This is a separate local-only candidate against coordination draft PR #38,
`codex/program-cycle-six`; original reviewed PRs remain unmerged.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working implementation and integration interface

`readFieldWorkflow(repo, target, { day, timezone }, admission)` accepts Main's
actual shared `PropertyRepository` and exact `PrototypeTarget`, including a non-null
existing job ID. That repository must contain the same actual Operations and Phase3
instances used by the journey. Exact strict current enabled/confirmed admission is
required; synthetic owner/admin source authorization is reused, never inferred from
browser selection or a route.

The new named `FieldWorkflow` panel takes:

```ts
{
  repo: PropertyRepository;
  target: PrototypeTarget;
  day: string;
  timezone: string;
  enabled?: boolean;
  onReport?: (target: FieldWorkflowHandoff) => void;
  onProofOfWork?: (target: FieldWorkflowHandoff) => void;
}
```

It is independently default OFF and requires Vite DEV, explicit enablement and
literal HTTP(S) loopback. Main owns its separate local route/mount; this branch does
not modify App, original modules, repositories, global styles or approved interfaces.
The panel's load button and current confirmation read actual job/issued scope,
CRM customer/property, crew relationships, recorded day evidence and exact published
report cards. Original source report/version details open locally with separate factual
observations and maintenance recommendations. An optional Proof of Work callback
hands the exact existing source to the destination; it does not prepare, publish or
send a packet automatically.

`openFieldWorkflowReport(view, { report_id, published_version })` checks the original
retained view and current evidence, then returns the safe original report and:

```ts
{
  (organization_id,
    customer_id,
    location_id,
    job_id,
    estimate_id,
    issued_version_id,
    issued_version_number,
    report_id,
    published_version);
}
```

This handoff is navigation context only. The existing customer/Proof of Work destination
must independently admit its actual model's current property and authorized issued
version set. There is no customer-model fabrication, new authorization mapping, URL,
recipient, media lookup or delivery. Missing or ambiguous report linkage provides no
handoff and never selects a newer or similar source.

## Existing source composition

The implementation calls existing `readFieldWorkOrders`, `fieldWorkOrderBinding`,
`readTechnicianDayBoard`, shared `readPrototypeSource` and `projectPublishedHistory`.
No duplicate capacity calculation, work-order store, scheduling model, customer,
inspection or estimate engine exists. The actual published association is:

`report ID + published version → report.visit_id → visit.plan_id → plan.job_id`

Every step must match the exact organization, customer, property and selected job.
Customer-safe published projections exclude private notes and hidden findings. The
issued scope excludes private estimate input/costs; no supplier, payroll or margin
records enter the panel. Only exact linked reports are included, with honest
available-record coverage limits. Mutable visits never replace historical report
bodies, and an after-phase/checklist does not establish physical completion.

The selected day reuses the existing technician-day reader. Date-only visits retain
TIME UNKNOWN. Recorded timestamps retain their exact source identity and open-end
uncertainty. Proposed hours are not supplied by this bounded read-only package, so
capacity and actual availability remain UNKNOWN. It performs no assignment, scheduling,
dispatch, report editing/publication, time posting or financial command. Existing
explicit proposal/assignment workflows remain separate and unchanged.

## Current evidence, privacy and uncertainty

Strict own-data input validation rejects getters/serializers/symbols, absent or foreign
identities and invalid dates/zones. Original target, day and confirmation remain live
across awaits. The final shared synchronous source checkpoint is followed by current
job/baseline/crew/member/CRM/plan/visit/report fence checks using existing synthetic
readers; no awaited work follows the terminal check. No private fingerprint is
rendered or transferred.

The returned view is deeply frozen and contains a content SHA-256. A digest proves
content fidelity, not authority, verified physical condition or durable custody.
`verifyFieldWorkflow` and source navigation accept only the retained session object.
Stale, missing, denied or uncertain current evidence returns UNKNOWN/no replacement;
there is no automatic replay, reassociation, retry or newest-record fallback. Existing
source/report bytes remain unchanged after later source edits. Refresh/process loss
is not durable recovery.

The panel owns its repository/target/day/enablement identity and clears old results
when those props change without requiring a parent key. Current confirmation can be
withdrawn during a pending read. Epoch/liveness checks discard late results after
selection changes or unmount. Source detail receives keyboard focus. Loading, empty,
unknown/error and no-crew states use semantic status/alert text, source identities
wrap, and the two-column layout stacks at the existing 760px contractor breakpoint.

## Focused evidence

- 34 new actual-repository application cases PASS across all three companies;
  **175 PASS** with retained day-board/crew-capacity/work-order suites.
- Tests cover exact shared source/job/crew/customer/property/report/version handoff,
  original report projection and hidden-field exclusion, zero-crew/no-report/empty-day
  states, explicit UNKNOWN availability, no writer calls or source changes, default
  OFF and connected rejection, foreign IDs/roles, actual staff revocation, wrong or
  unrelated report/version, cloned retained evidence, published-history immutability,
  malformed input, live target/day/confirmation changes, actual job/report/crew changes
  during final waits, UNKNOWN and no replacement/replay.
- Strict TypeScript, generated type consistency, owned-file ESLint with no warnings,
  format, build, shared feature/design contracts and whitespace checks PASS.
- Protected comparison: 128 public frozen hashes, five approved design/artwork hashes
  and thirteen source bindings match without drift. Protected aggregate:
  `1bdf4fde01e40a76fb5cff044721dc411e562af3dd848c28e3cb62b970e95b3a`.
- Main owns actual combined desktop/tablet/mobile, three-brand, keyboard/axe and
  navigation regression evidence. This branch does not claim those runs before Main
  exercises the integrated mount. No new standalone route or screenshot is invented.

```sh
npx vitest run tests/program-field-workflow.test.ts tests/field-day-board.test.ts tests/field-crew-capacity.test.ts tests/field-work-orders.test.ts
```

All thirteen historical migrations, pending customer14/original4B, frozen P1/four
artifacts/approvals, 2A–2F/billing, approved branding, Netlify archive/executor/recovery,
NMI/genuine Auth/provider/financial/communication/hosted/production/deploy/merge gates
remain unchanged. No protected migration, credential, hosted mutation, customer
communication, dispatch, payment, deployment or merge occurs.
