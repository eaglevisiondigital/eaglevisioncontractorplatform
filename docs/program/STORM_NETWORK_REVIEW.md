# Storm Mode and Contractor Network · bounded local review

Owner: A3 / `/root/cycle5_operations`. Branch `codex/program-storm-network`.
Exact parent: coordination draft PR #27,
`d53a902df498cca0053ec33b3514a708000a9748`. Implements assignment 15 from the
owner's Cycle 5 plan `3bf2e0cfca691cb164e1c42290ccf09ad6804c8a`.
This is an isolated unmerged candidate. Release 1.0 remains **NOT READY / NOT
AUTHORIZED**.

## Working prototype

`src/lib/program/storm-network-review.ts` implements
`prepareStormNetworkReview` and `reconcileStormNetworkReview`. It is unwired and
OFF without exact current explicit confirmation. Only a current eligible synthetic
owner/admin may inspect an exact existing CRM customer/property/estimate/version
and optional actual issued-baseline job through the shared `readPrototypeSource`.
There is no App route, UI, listener, feed, provider adapter or background process.

The reviewer supplies an incident label, optional reported date, an existing manual
maintenance priority, explicit reported-condition codes and exact included scope
line IDs. Existing `maintenancePriorities` and `maintenanceDate` are reused. The
prototype turns those selections into focused staff-review tasks with exact source
references and visible limits. It never parses wording to infer a finding, predicts
weather, determines damage severity, rewrites an inspection or infers completion.
The priority is an explicit human selection, not an emergency or safety assessment.
Conditions are human reports, not verified observations or published findings.

The same immutable result includes a useful **sharing-content allowlist preview**:
organization/property/estimate/version/job IDs, exact revisions and selected source
line IDs. Customer identity, names, addresses, contacts, workers, text descriptions,
notes, costs, margins, amounts, documents, geography and incident details are absent
from that content. The complete review is staff-only. Its IDs-only content has
recipient `null`, SAME TENANT INTERNAL REVIEW ONLY audience and BLOCKED delivery.
It is not a public link, export, permission grant or message. No partner is discovered,
matched, authenticated or vetted. No cross-tenant record or network access exists.

Actual job association is stated only when the shared source proves the exact issued
baseline. An unselected job stays NOT SELECTED. Missing historical property snapshot,
historical coverage, physical condition/completion, weather/disaster provenance,
contractor identity/vetting, safety/legal acceptance and genuine authentication remain
UNKNOWN, UNVERIFIED or NOT PROVIDED. A selected estimate line is scope context, not
proof of a particular physical condition.

## Source, integrity and uncertainty

The strict input projection accepts only bounded primitive own-data fields and plain
bounded arrays. Extra fields, symbols, accessors, serializers, duplicate/foreign/
excluded line IDs, unsupported sharing purposes and malformed dates/priorities deny.
The exact target and original live confirmation are pinned and rechecked across
awaits; changing the selected property while a hash is pending denies the result.

The shared source snapshot and its digest bind current organization/member/customer/
property/version/lock/job provenance. A second digest binds the exact result content.
No internal `EstimateVersion`, private estimate payload, job financials or workforce
object is serialized into the result. After every awaited consumer hash and source
verification, `assertPrototypeSourceCurrentNow` performs the final synchronous
current-source/role/confirmation checkpoint. No awaited work follows that checkpoint.
Actual draft and job edits during the final verification wait are tested and denied.

A result is deeply frozen. Subsequent source or human-selection changes do not alter
it. Exact read-only reconciliation returns CURRENT REVIEW ONLY, STALE for observed
changes, or UNKNOWN when evidence/current eligibility is unavailable or the exact
session binding was lost. Every reconciliation has `replacement: null` and
`replay: FORBIDDEN`. No new source discovery, replacement, retry or external action
occurs. A copied/imported object cannot import authority. The ephemeral WeakMap
binding is lost on refresh/process loss; it is not durable custody.

## Focused validation

- 56 new application cases pass; 78 pass including the unchanged shared-source
  suite. Actual existing repositories are exercised for all three contractor brands.
- Positive proof covers exact issued-source/customer/property/job/revision identity,
  structured human-report tasks, manual priorities, IDs-only content, frozen bytes,
  independent SHA recomputation and exact current read-only reconciliation.
- Negative proof covers default OFF/connected denial; foreign org/actor/customer/
  property/estimate/version/job; revoked administrative staff; estimator/field denial;
  foreign, duplicate and actual excluded-option scope lines; malformed inputs,
  getters/serializers/symbols; stale drafts; missing acknowledgments; lost binding;
  live selection/confirmation changes; real saves during both final consumer digest
  waits; actual issued-job revision changes; and reconciliation races.
- Existing save/issue/job/time/assignment writers are spied, unchanged actual job and
  estimate history is asserted, and private/contact/financial/incident data exclusion
  is checked separately from harmless redaction-label text.
- Strict TypeScript, owned ESLint, generated type consistency, shared feature/design
  contract checker, formatting, build and whitespace checks pass. The shared checker
  validates retained register/source contracts; it does not grant new acceptance.
- Independent main contract comparison: all 128 protected files, five locked design
  files and thirteen design bindings match; aggregate
  `1bdf4fde01e40a76fb5cff044721dc411e562af3dd848c28e3cb62b970e95b3a`.
- No UI is added, and no new browser/responsive/accessibility evidence is claimed.

```sh
npx vitest run tests/program-storm-network-review.test.ts tests/program-prototype-source.test.ts
```

## Combined-source compatibility

The unassessed-incident regression compares `property_snapshot` to the exact actual
`readPrototypeSource` projection. The initial isolated parent has no historical
location snapshot and reports UNKNOWN; the retained C2/C3 composed estimating source
records its actual CRM snapshot and reports RECORDED. The test requires exact source
lineage in either source tree; it does not accept a union of arbitrary statuses or
change module behavior. An unassessed physical condition remains UNVERIFIED regardless
of whether the CRM location was recorded.

## Separate future gates

[Cycle-five research](CYCLE5_EXPANSION_RESEARCH.md) records the public primary
privacy/safety context. Data minimization does not grant sharing authority, and
public disaster-fraud guidance is not a contractor-vetting service. Live weather,
incident feeds, partner discovery, cross-tenant sharing, actual access grants,
authentication, safety/legal policy, messaging and durable recovery require separate
review and authorization. This prototype does not instantiate those services.

All13/customer14/original4B/broker/P1/four artifacts/approvals/2A–2F/billing,
Netlify archive/executor/recovery, NMI/genuine Auth/provider/financial/communication/
hosted/production/deploy/merge gates and approved branding remain intact. No schema,
store, business ledger, financial calculation engine, protected migration, credential,
hosted mutation, customer message, payment, deployment or merge is added or executed.
