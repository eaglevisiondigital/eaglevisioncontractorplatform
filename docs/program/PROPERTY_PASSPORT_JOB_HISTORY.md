# Property Passport · existing job documentation

Feature: `CUS-002`, extending the existing `CUS-001`/`FLD-001` evidence sources.
Date: 2026-11-01. Branch: `codex/program-passport-job-history`.
Exact parent: PR #9 / `081532fa1e7ec06d0bc9c02700ba018070a0cb2c`.
Status: **LOCAL isolated implementation; unwired and default OFF**. CI: **UNKNOWN**.
HOSTED: **NOT AUTHORIZED**. Release 1.0: **NOT READY / NOT AUTHORIZED**.

`src/domain/property/passport-job-history.ts` adds a functioning, read-only job
documentation snapshot and exact-reference reader. The existing Passport foundation,
customer preview, CRM relationship check, Phase3 job/history readers,
`projectIssuedReview`/`customerPreview` allowlist and `documentHash` remain the
authoritative sources. No App import, route, component, CSS, persistence, new business
record, schema, completion ledger or adapter is introduced. Synthetic admission is
explicit `{ enabled: true }`; omission is OFF. Non-sample repositories are refused.

## Working behavior

`createPropertyPassportJobHistory(model, boundary, admission)` reads the active
customer's exact organization/customer/property and current `context.version_ids`.
Existing customer review parsing establishes the exact authorized estimate/version
set before existing history reads. The raw issued version number and narrow safe
scope must also match the current authorized customer review exactly. A job from the internal organization-wide job
reader is eligible only when its immutable baseline version ID is in that set.
The issued version must have exact organization, estimate, customer snapshot,
payload customer, issued status, positive version and issued timestamp. Duplicate
job/version/baseline identities fail closed. A private draft, another customer's job
or a similar address/name does not become visible through the global list.

Property association requires the issued payload's exact location ID. When the
historical issued payload location is null, the existing immutable plan `job_id`
must supply the exact organization/customer/property/job binding. The narrow
existing `projectIssuedReview` job-binding input is reused. Sorted exact source
plan IDs are retained in the safe source and digest. Missing or ambiguous property
provenance cannot fall back to a current CRM address, description or latest job.

The result contains the existing inspection foundation plus allowlisted job
identity, issued version/date, project name/description and included line
ID/description/quantity/unit. Financial amounts, costs, margins, private notes,
workforce, rates, customer explanations, terms, readiness and media URLs do not
cross the boundary. Whole jobs, estimates, visits, CRM records and financial
objects are never serialized. Malformed safe fields are rejected as primitives;
private added fields remain outside the projection and are never frozen or passed
to serializers.

Some existing sample versions have no `location_snapshot`, including versions with
a payload location ID. This package does not edit those immutable records or invent
an issued address from current CRM. `immutable_property_snapshot.status` remains
`UNKNOWN` when absent. A present source snapshot must match the exact location and
primitive address fields before its narrow allowlist can be retained.

Every job/report association is exact published report ID + version -> report
`visit_id` -> unique same-organization visit -> unique exact same-property plan ->
immutable plan `job_id`. The source report reference, visit ID and plan ID remain
visible in the snapshot. Missing/ambiguous/foreign links produce explicit
`unknown_report_links` with status `UNKNOWN`; a report stays in the independent
published-inspection foundation without being assigned to a guessed job.

Each job reference includes a SHA-256 digest of its detached safe issued source and
property provenance; the complete snapshot has its own SHA-256 digest. The module
rechecks active admission, context, current CRM, authorized versions, exact published
evidence and safe job sources after async reads/hashing. Changed or denied sources
reject the snapshot. No archive, new identity or persistent side effect is retained.

`readPropertyPassportJobEvidence(model, reference, admission)` pins the exact
primitive identity before await, validates named fields independent of insertion
order and reuses current source projection. It never serializes/freezes a caller's
reference or invokes inherited serializers. Missing, malformed, denied, revoked,
changed-digest or foreign evidence returns `UNKNOWN` with no payload. Disabled
admission remains a disabled error. A retained hash/reference is not a grant.
Changed fallback plan provenance also changes the source digest, conservatively
making an older reference UNKNOWN rather than silently reassigning it.

## Evidence meaning

Documentation status records available published evidence only. An after-stage
report, a checked completion-documentation item, job metadata claiming completion,
an empty finding list or an absent later concern never verifies physical work.
`physical_completion`, `warranty`, `customer_approval` and `physical_proof_of_work`
remain `UNVERIFIED`; `history_completeness` remains `UNKNOWN`. Recorded documentation
does not approve a contract, repair, warranty, payment or staff/customer action.
Synthetic selection and a local hash do not establish genuine Auth or durable custody.
Published literal text is retained as text; this package adds no HTML renderer.

## Local validation and rollback

`tests/program-passport-job-history.test.ts` adds 58 focused cases. Positive cases
use actual existing CRM/customer preview, issued versions, job baselines and
inspection publish workflows for all three brands. Negative fault injection covers
foreign tenant/customer/property/version, revoked/stale/denied context, malformed
private/safe fields, duplicate identity, exact missing/ambiguous report lineage,
async source/admission drift, digest bindings, immutability, reference key order,
inherited serializers and caller mutation across await. Repository/customer/financial
state and writer spies confirm no preparation, issuance, source selection or writes.
No immutable address snapshot was fabricated for the positive fixtures.

- 122 application cases PASS: 58 new and 64 directly related Passport foundation,
  published-history and customer-preview cases.
- Strict TypeScript (local build), full lint, full `format:check`, generated
  database type consistency, `features:check` and local production build PASS.
  Feature/source checks do not infer CI, hosted or operational acceptance.
- No UI changed; browser/axe/physical-device acceptance is not claimed. No unrelated
  recovery, native SQL or Netlify baseline was rerun.

Only the new module, focused test and this document belong to this package. Main
owns shared contracts, design, register and combined evidence; Field alone owns
its narrow assignment retention work. This branch has no shared-source edits.
Rollback removes the three unwired files, with no data or migration to reverse.
There is no connected activation, credential, physical completion, customer message,
provider/financial execution, hosted action, deployment or merge authorization.
All13/customer14/original4B/P1/four/approvals/2A–2F/billing/recovery/NMI/Auth/
Netlify/executor and locked UI/artwork gates remain independent and unchanged.
