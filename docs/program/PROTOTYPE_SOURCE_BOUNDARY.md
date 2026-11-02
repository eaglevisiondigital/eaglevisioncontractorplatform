# Local expansion source boundary

Main owns `Phase3Repository.readSyntheticPrototypeSources` and
`src/lib/program/prototype-source.ts`. The additive sample-only read composes existing
Operations/CRM, estimate history, catalog, jobs and workforce state synchronously.
It introduces no business record, schema, writer or connected branch. Only a current,
unique active synthetic owner/admin can read an exact tenant/customer/property/
estimate/version and optional issued-baseline job. Direct input is pinned from exact
own primitive fields; accessors and serializers are denied before source reads.

The exported projection is strictly allowlisted, immutable and internal-staff-only:
existing IDs/revisions, canonical estimate total, scope descriptions/units/quantities,
active catalog metadata, optional canonical job financials and minimal worker/time
IDs. No private notes, contacts, unit/supplier costs, rates, payroll or deductions.
Canonical job aggregate costs are staff data and must never enter customer-safe packs.
A missing historical location snapshot is explicitly UNKNOWN; current exact CRM and
payload association still must exist. A contradictory snapshot is rejected.

The public SHA describes content, not permission or durable custody. A private
session WeakMap binds the exact object to its actual repository, original live
confirmation and source fingerprint. A clone/import cannot confer that binding.
Capture and exact read-only reconciliation both await public hashing before a final
synchronous current-source/access checkpoint. There is no await after that checkpoint.
Source edits, role revocation or confirmation withdrawal deny output. No automatic
replacement, retry, mutation or process-refresh durability is claimed.

Independent review reproduced two pre-fix races around asynchronous capture. The fix
replaced multi-await source assembly with one actual synchronous source snapshot;
permanent tests exercise real existing-engine saves during the remaining public hash
boundary, reconciliation, gate withdrawal and absence of asynchronous read seams.
The historical defect is retained as characterization evidence, never counted as a
passing security control. Final independent review and combined composition evidence
are recorded in the Cycle-five delivery review.
