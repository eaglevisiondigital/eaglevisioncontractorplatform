# Source-bound Operations experiments · Cycle 5

Owner: A3 / `/root/cycle5_operations`. Branch:
`codex/program-operations-experiments`. Exact parent: draft PR #23,
`389771df7e2ad79017aa45b73d6b726773e3bc8e`. Implements owner assignment 10
from coordination plan `3bf2e0cfca691cb164e1c42290ccf09ad6804c8a`.
This isolated candidate is not merged or promoted. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.

## Functioning, unwired implementation

`src/lib/operations-experiments.ts` provides `reviewOperationsExperiments` and
`reconcileOperationsExperiment`. The default-OFF entry requires exact live
`{ enabled: true, confirmed: true }` and a current synthetic owner, admin or office
manager. It rejects connected repositories before reading sources. No App route,
UI, public booking intake, network listener, background worker or provider is added.
It operates on actual retained `readFieldWorkOrders` cards, not fabricated job,
customer, location, technician, inspection-plan or visit records.

One confirmed review produces three useful, immutable outputs:

- **Booking candidate review:** an exact existing job/visit/technician candidate and
  optional human-proposed times are checked with the unchanged
  `reviewCrewDayCapacity`/`calculateCrewCapacity` engine. The result distinguishes
  reported day conflicts, outside proposed hours, unknown hours, no reported day
  conflict and date-only UNKNOWN. These describe the proposed day, not actual
  technician availability. Availability always remains UNKNOWN and booking remains
  BLOCKED. No calendar reservation or scheduling mutation occurs.
- **Route ordering experiment:** returns the exact selected visit/property source
  references in the human-supplied order, with explicit stop positions. Duplicate
  stops are rejected. Geography is UNAVAILABLE, travel time UNKNOWN and optimization
  NOT PERFORMED; no addresses are geocoded or fabricated travel minutes calculated.
  This is a bounded route-input experiment, not a route optimizer or dispatch list.
- **Offline field capture proposal:** freezes a bounded staff-only note against the
  exact job/issued baseline/customer/property/plan/visit revisions. It is an UNSAVED
  FIELD NOTE PROPOSAL held only in the returned session object. It does not save or
  publish an inspection, time entry, assignment or completion report. Refresh or
  process loss destroys its retained-object binding; crash durability is NOT
  PROVIDED. Physical completion remains UNVERIFIED.

Every output includes an SHA-256 over its exact allowlisted content. The digest
shows content fidelity, not permission, authentic observation, custody or durable
storage. No invoice, payment, debt, customer approval or contract is created.

## Identity, live confirmation and uncertainty

Inputs use strict own-data descriptors, exact primitive IDs, bounded plain arrays
and bounded note text. Extra fields, symbols, accessors, serializers, missing values,
cloned source cards and foreign cards deny without invoking caller getters. A
candidate and route/capture stop must refer to the exact current visit and assigned
technician on the selected civil day. Times and DST behavior reuse the existing
canonical capacity parser. Date-only evidence never becomes an invented shift.

The complete input fingerprint and current office role are rechecked after every
await, including the content-digest wait. Existing Field source reads are compared
before and after review. A final synchronous fence uses existing `syntheticJob`,
`syntheticJobAssignments`, `syntheticMemberships`, `syntheticProperty` and
`PropertyRepository.read` to verify current job/issued baseline, crew, property,
plan and visit revisions. No awaited work follows that final check. Private source
fingerprints stay in an ephemeral WeakMap and never enter the returned projection.
No repository interface or calculation engine is changed.

Exact read-only reconciliation accepts only the retained frozen proposal object.
It returns CURRENT REVIEW ONLY for matching available source, STALE for an observed
proposal/source change, and UNKNOWN when current source or eligibility is unavailable,
acknowledgment is uncertain or the object binding was lost. Every result has
`replacement: null` and `replay: FORBIDDEN`. It never resumes, queues, saves, retries,
replaces or sends the capture. Browser online state is not consulted and never grants
replay or synchronization permission. Unrelated late source changes can conservatively
invalidate a review; no complete historical coverage or operational availability is
claimed.

The note is explicitly staff-only. Existing private inspection notes, supplier prices,
job cost/margin data, payroll rates and financial records are excluded from the
returned projection. The implementation uses existing tenant/property ownership;
there is no second business store, schema, scheduling engine or offline database.

## Focused validation

- 52 new application tests pass against actual repositories across all three sample
  companies. Coverage includes exact source references, SHA/frozen content, supplied
  multi-stop ordering, canonical overlap/union/outside-hours arithmetic, date-only
  and missing-hours UNKNOWN, stale immutable captures, exact reconciliation,
  default-OFF/connected denial, foreign actors/cards/technicians/property visits,
  cloned/mutated cards, malformed descriptor/array/time/date/zone/note input,
  live input/confirmation withdrawal, actual staff revocation and source edits during
  hashing and the final asynchronous reader. Source writers are spied and unchanged
  actual property/job/assignment state is asserted.
- 193 application tests pass with retained day-board, crew-capacity and work-order
  suites. Existing Field behavior and capacity mathematics remain unchanged.
- Strict TypeScript, generated database-type consistency, owned-file ESLint,
  formatting, production build and whitespace checks pass.
- Independent main contract comparison: all 128 protected source hashes, five locked
  design hashes and thirteen design bindings match. Protected aggregate:
  `1bdf4fde01e40a76fb5cff044721dc411e562af3dd848c28e3cb62b970e95b3a`.
- No UI is added, so this package claims no new browser, responsive or accessibility
  acceptance. Existing Field visual evidence is retained, not rerun or reclassified.

Run focused proof with:

```sh
npx vitest run tests/program-operations-experiments.test.ts tests/field-day-board.test.ts tests/field-crew-capacity.test.ts tests/field-work-orders.test.ts
```

## Remaining dependencies and preservation

A real online booking service needs genuine current authentication/authorization,
reviewed availability and scheduling custody, and separately approved installation
and acceptance. Real routing needs reviewed travel/geography sources and constraints.
Offline persistence/synchronization needs separate durable custody, exact conflict
policy and independent recovery acceptance; an online hint cannot settle UNKNOWN.
These are unresolved dependencies, not authority granted by this experiment.

All thirteen historical migrations, pending customer14, original4B/broker, frozen
P1/four artifacts/approvals, 2A–2F, billing proposals, Netlify archive/executor/recovery,
NMI/genuine Auth/provider/financial/communication/hosted/production/deploy/merge gates
and approved customer/contractor branding remain unchanged. No protected file,
credential, hosted mutation, message, payment, migration, deployment or merge occurs.
