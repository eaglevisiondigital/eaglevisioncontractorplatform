# Cycle 9 · multi-job weekly crew operating review

Owner `/root/cycle9_field_growth`; isolated branch `codex/cycle9-portfolio-scheduling`
from exact shared foundation `c3bbfebd8467263f851d7b27ab68eb20c5db4df7`, parent
Cycle8 `fe813ed261ad56fffb91ca15ac2aa41a92a8847e`. Five additive owned paths only;
Main owns mounting, shared contracts, combined independent review/browser evidence
and registers. Draft base `codex/program-cycle-nine`; no merge or promotion.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working board

`PortfolioScheduling` accepts `{sources:OperatingSources,enabled?:false,onSelectJob?}`.
The unique accessible region is **Multi-job weekly scheduling**. Existing DEV,
explicit enabled flag and HTTP loopback admission remain required. Four actual jobs,
three customers/properties, two actual assigned technicians and two jobs sharing one
property use Main's one existing Operations/Phase3/Property repository set. Handles
are identities into those objects, never a duplicate schedule/customer/job store.

`readPortfolioScheduling(sources,input,gate)` captures exact current original handles
and admits each exact customer/property/issued-version/job/original visit through
existing booking/prototype/field readers. It calls the canonical technician-day reader
once per each of seven civil days, placing all admitted jobs' detached proposals into
the same capacity calculation. It does not sum independent per-job availability or
reimplement overlap arithmetic. Dates preserve actual DST day lengths and reject
nonexistent/repeated wall times through existing Temporal validation.

The user selects a week, exact job and technician filters, confirms review, and sees
customer/property/job cards, seven daily lanes, recorded visits/time, original source
versions and canonical conflict indicators. Exact shared job/visit/time/worker IDs
are deduplicated; conflicting source identity denies rather than guessing. A no-event
result is **not availability**. Original visits retain their dates, plan IDs/revisions,
job and property. An alternate day is a detached job window with no new visit.

An optional expanded review form adds explicit unsaved timed windows and proposed
working hours for the named first existing assigned technician of each selected job.
The user can inspect cross-job conflicts and clear proposals. Neither a click nor
proposed hours assigns work, changes crew, moves an appointment or reserves capacity.
The original job-to-crew relationship is not visit-specific dispatch authority.

`job_id`/`worker_id` filters affect displayed events only. Canonical capacity continues
to account for authorized company records and all separately confirmed proposals;
that basis is visible, and counts explicitly describe admitted jobs. The model is
**ADMITTED_JOBS_AVAILABLE_RECORDS_ONLY**, not an exhaustive company or history claim.
All actual availability is **UNKNOWN**, workforce source capture is **CAPTURED NOT
ATOMIC**, and no global lock or atomic crew reservation is claimed.

## Exact navigation and uncertainty

`openPortfolioSchedulingJob(view,job_id)` admits only an exact retained displayed job
and returns its original company/customer/property/job/estimate/issued-version identity
for the optional Main selection callback. Existing shared source checks, strict
own-data input parsing and original-input fences run after awaits, after the final
hash and before navigation. No fuzzy/current-newest/property substitution occurs.

`reconcilePortfolioScheduling(view)` checks only an exact retained session snapshot.
Unavailable, revoked, copied or stale evidence returns UNKNOWN, replacement null and
replay FORBIDDEN. It never applies a proposal, reacquires authority or mutates a source.
Frozen bytes/hash do not change after source edits. Refresh/process loss is not durable
custody, genuine Auth or supervision. Offline/source synchronization, Storm Mode and
Contractor Network labels explicitly assume no external crew or capacity and grant
no operational actions; existing engines remain authoritative.

Scoped styles retain approved contractor palette variables, warm cards, readable
source IDs, 46px controls, visible labels, source heading focus, status/alert/loading/
empty/OFF states and stacked mobile lanes. No global/locked CSS, artwork or original
approved portal/back-office layout changes. Late responses are discarded after
context/input replacement and pending gates are revoked on unmount or edit.

## Focused verification

**37 new application cases PASS.** All three approved companies exercise four real
jobs/three customers/properties/two workers, shared-property identities, exact source
navigation, canonical shared-worker cross-job conflicts, duplicate windows/worker
lanes, filter context, date-only UNKNOWN, empty weeks and actual DST day lengths.
Negative cases cover foreign filters/proposal IDs/composition/property associations,
duplicate handles, revoked actual reviewer, copied snapshots, strict getter/symbol/
serializer/sparse-row data, invalid date/range/time inputs, original live input/target/
gate/container mutation during canonical reads, actual plan mutation at the terminal
body hash, and lost reads with no replay or writer. Original property/jobs/releases
and assignment/time/visit/publish writer spies remain unchanged.

```sh
npx vitest run tests/cycle9-portfolio-scheduling.test.ts
npx tsc --noEmit
npx eslint src/lib/workflows/portfolio-scheduling.ts src/components/workflows/PortfolioScheduling.tsx tests/cycle9-portfolio-scheduling.test.ts
```

Main records actual combined desktop/tablet/mobile, all-brand, keyboard/axe and
source-selection browser evidence; application tests alone do not claim visual PASS.
No hosted activity, credentials, migration/schema/store, live dispatch, messages,
contracts, financial execution, deployment, merge or persistent worker. Preserve
all historical migrations/customer14/4B/P1/four artifacts/approvals/2A–2F/proposed
billing, locked experiences/artwork, Netlify/executor/recovery/MFA/NMI/Auth/provider/
financial/hosted/production and release gates.
