# Cycle 7 · booking and rescheduling review

Owner: `/root/cycle5_operations`. Branch `codex/cycle7-booking-scheduling`.
The owner authorized this bounded implementation after independent Cycle 6 baseline
review was CLEAR. Main owns the default-OFF loopback mount and combined browser
evidence. This adds only a source reader, read-only review facade, scoped form,
focused tests and this document. Existing engines, data owners and approved screens
remain unchanged. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working local form

`BookingScheduling` takes `{repo,target,sourceVisitId,day,timezone,enabled}`. Main
passes its actual shared `PropertyRepository`, exact `PrototypeTarget` and existing
`scheduled_visit_id`. The component is OFF unless development, the explicit enabled
flag and literal HTTP loopback all match the existing field preview guard.

1. Explicitly load the original current visit and its assigned job crew.
2. Choose an existing assigned technician and civil day. Optional paired start/end
   times and proposed working hours use the original plan's timezone.
3. Enter a short unsaved review note and confirm the exact proposal inputs.
4. Review canonical capacity/conflict evidence, original-versus-proposed dates and
   exact retained job/property/visit/plan/issued-version references.
5. Explicitly check the exact retained immutable review without replacing it.

Loading, unprepared, unavailable/UNKNOWN and unassigned-crew states are explicit.
All labels are keyboard accessible; results move focus to their heading. Inputs
withdraw confirmation and hide prior results. Repository/tenant/property/visit/day
context replacement resets this component even without a parent React key, and
late results are discarded. CSS is scoped to `.booking-scheduling`; desktop uses
paired fields/comparison and mobile stacks them with touch-sized controls.

The note is actual human input, rendered as text. It is not fabricated inspection
evidence, a published note or a saved offline record. The existing Operations
experiment requires nonempty explicit text; the facade preserves that requirement
and never weakens its parser or substitutes an invented observation.

## Existing sources and canonical calculations

`readBookingSchedulingSource(repo,target,sourceVisitId,gate)` reads the original
shared prototype and retained work-order producers. It validates exact existing
tenant/customer/property/job/issued estimate, visit/plan revisions, current reviewer
and crew relationships. Its allowlisted frozen projection contains job/property
labels, exact references, original recorded date/timezone and assigned crew labels.
No costs, supplier data, payroll, private contractor notes or unrelated records are
projected. Private source fingerprints remain only in session WeakMaps.

`readBookingScheduling(repo,target,input,gate)` requires that exact retained source
object as `input.source`, plus primitive `source_visit_id`, `day`, `timezone`,
`worker_id`, `review_note`, `start`, `end`, `hours_start` and `hours_end` fields.
Missing, copied, imported, foreign or stale sources reject. The original form
source is never silently upgraded to a newer revision at submit time.

Same-day review calls the existing `reviewOperationsExperiments`, which already
uses `reviewCrewDayCapacity`. Route stops are empty and no capture UI is exposed;
the actual human review note remains an unsaved proposal. The narrow view projects
only its canonical booking/capacity results and original visit references. It does
not calculate capacity again or create a parallel booking engine.

An alternate-day review calls that same canonical crew-capacity engine using a
**JOB_WINDOW with `visit_id:null`**. The existing engine correctly requires a
visit-bound window to match the recorded visit's date. This wrapper preserves that
rule: original visit/plan identity, revisions and date remain immutable provenance,
while the alternate date is labeled **UNSAVED JOB WINDOW RESCHEDULE**. No visit is
moved or created. Date-only visits retain timing UNKNOWN.

Civil-day lengths and invalid/nonexistent/repeated daylight-saving times use the
existing Temporal capacity functions. This bounded form reviews one civil day;
overnight proposals are rejected rather than silently clipped or reinterpreted.
Recorded overlaps, proposed working hours and outside-hours minutes come from
canonical integer/minute arithmetic. An open/invalid recorded segment yields
UNKNOWN coverage, never a reliable no-conflict claim.

## Freshness, uncertainty and authority

Strict own-data fields reject getters, serializers, symbols and custom prototypes
before consuming caller content. Live target/input/gate checks follow awaits.
Current shared source, property/plan/visit/report, membership, assignment and
retained work-order checks run after the final source hash; no await follows the
terminal synchronous check. Actual final-hash plan/selection/confirmation races
are denied. Current synthetic owner/admin admission remains narrower than dispatch
or general operational staff authorization.

The inherited workforce limitation remains explicit: cross-job recorded evidence
is **CAPTURED NOT ATOMIC**, historical coverage is **AVAILABLE RECORDS ONLY** and
actual availability is always **UNKNOWN**. Absence of an overlap never grants
availability, scheduling or dispatch authority. The wrapper adds no new global
workforce reader or atomicity claim.

`reconcileBookingScheduling(view)` accepts only the exact retained session object.
Matching available evidence returns CURRENT REVIEW ONLY; denial, lost reads,
changed inputs/revisions, revoked staff, copied objects or absent bindings return
UNKNOWN with `replacement:null` and `replay:FORBIDDEN`. The original bytes/hash stay
unchanged. The UI never retries automatically; a fresh source load is an explicit
read, not replay of a booking mutation. There is no booking mutation to resume.

All schedule/reschedule/assignment/dispatch/message/financial/replay actions are
false. Reviews have no booking ID, database row, customer delivery URL, durable
custody, queue, timer, background worker or browser-online replay. Refresh loses
session evidence. There is no publication, verified completion, enrollment,
customer authorization, invoice, debt or payment effect.

## Focused verification

**57 new / 188 related application cases PASS**, including all three actual shared local
journey companies, same-day/alternate-day/date-only, real recorded-time conflicts,
outside/missing hours, exact source relationships and immutable source/report/job
preservation. Tests cover foreign IDs/repositories, wrong same-company job/visit,
copied sources, current admin revocation, crew/visit edits, malformed accessors,
invalid day/time/paired inputs, both DST transitions, final-await races, lost reads,
frozen retained bytes, strict privacy and writer spies proving no side effects.
An actual other-job time change during the final source hash proves the inherited
captured-workforce limit; subsequent exact reconciliation is UNKNOWN, never a
claim of atomic availability. Strict/generated types, owned lint with no warnings,
formatting, build and feature checks pass. All 128 protected hashes, five design
locks and thirteen source bindings match the reviewed source contract.

```sh
npx vitest run tests/cycle7-booking-scheduling.test.ts tests/program-operations-experiments.test.ts tests/field-crew-capacity.test.ts tests/program-prototype-source.test.ts
```

Main records actual browser/mobile/axe/navigation evidence at the integrated exact
head. This document does not claim browser acceptance from unit tests alone.

All13/customer14/original4B/broker/P1/four artifacts/approvals/2A–2F/proposed billing,
approved artwork/interfaces, Netlify archive/executor/recovery, NMI/genuine Auth,
provider/financial/communication/hosted/production/deploy/merge gates remain intact.
No protected migration, credentials, hosted action, message, financial execution,
dispatch, deployment, merge or persistent background execution is introduced.
