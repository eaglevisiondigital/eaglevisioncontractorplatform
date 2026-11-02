# Cycle 8 · weekly crew scheduling review

Owner: `/root/cycle5_operations`; branch `codex/cycle8-weekly-crew` from exact
reviewed parent `a20f11855388e7cf8283294a3775e1c86a2cc66e` / draft PR49. Its successful
Foundation checks are preserved without manual restart. Five new owned files only;
Main owns mounting, shared contracts, design, browser acceptance and registers.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working board and original sources

`WeeklyCrew` accepts `{sources:LocalJourney, enabled?:false}`. It reuses Main's same
actual Operations/Phase3/Property instances and exact tenant/customer/property/job/
issued version, scheduled visit and current synthetic reviewer. The component is
OFF outside explicit development + enabled + literal HTTP loopback. The unique
accessible region is **Weekly crew scheduling review**.

Choose a week-start civil date, confirm and review seven calendar days in the actual
source timezone. The board exposes assigned-technician and day filters, exact source
details/focus, recorded-date/time labels, unsaved proposal inputs and useful empty,
loading/error/OFF states. Mobile stacks readable lane/forms; scoped styles reset
global header geometry and preserve approved contractor colors/artwork.

The board covers **only the selected exact job/property and assigned crew**, not a
complete company schedule. `readWeeklyCrew(sources,input,gate)` composes the existing
booking source reader, retained work orders and seven `readTechnicianDayBoard` calls.
Each day uses the existing crew-capacity engine exactly once. No capacity algorithm,
property/appointment store, assignment queue or scheduling writer is duplicated.

Input contains `week_start`, source `timezone`, optional exact `worker_id` filter
(`''` means all assigned crew) and at most14 primitive `proposals`. Each proposal
names its day, exact original visit and assigned worker plus paired optional start/
end/working-hour times. Date-only evidence stays UNKNOWN. A different day becomes
an **unsaved JOB_WINDOW** with `visit_id:null`; the original visit/plan/date/revisions
remain immutable provenance. No original visit is moved or created. Canonical
Temporal validation rejects malformed, nonexistent/repeated DST and out-of-week
times. Valid DST civil days retain their actual1380/1500-minute lengths.

Source details preserve customer/property/job/issued-version/visit/plan and recorded
time IDs/revisions. They do not fabricate report IDs or imply published inspection
evidence where only a scheduling draft exists. No private cost, margin, payroll,
supplier data, private contractor notes or unrelated customer rows are projected.
Authorized office review may cite existing cross-job time conflict IDs through the
canonical capacity reader. Available workforce evidence is **CAPTURED NOT ATOMIC**;
actual availability is always **UNKNOWN** and source coverage is explicitly partial.

## Immutable snapshots and read-only concurrency/CAS review

`reconcileWeeklyCrew(view)` accepts only the exact retained session object. It
returns CURRENT REVIEW ONLY or UNKNOWN with `replacement:null`, replay FORBIDDEN.
No new ID, mutation, automatic source replacement or command continuation occurs.
Original bytes/hash remain unchanged after subsequent input/source edits.

`compareWeeklyCrewSnapshots(a,b,{expected_first_sha256,expected_second_sha256},gate)`
checks exact retained references, current eligible staff, same source/job/property/
issued version/week/timezone and an actor-independent hash of actual source/crew/
visit revisions. Wrong expected hashes produce CAS REFERENCE MISMATCH. Revoked,
stale, copied or unavailable source evidence stays UNKNOWN. Current matching
snapshots are combined only for canonical read-only proposal conflict calculation.
No lock is acquired, no assignment is written and neither proposal is applied.

Actual distinct eligible synthetic staff are tested. The UI captures two snapshots
from its current reviewer and explicitly labels SAME SYNTHETIC REVIEWER; it never
claims independent human supervision. Each snapshot was separately confirmed;
editing a later proposal does not silently rewrite the earlier retained snapshot.
Comparison requires separate confirmation. UNKNOWN is terminal in the panel and
offers only an exact retained read check, with no automatic retry or replay.

Strict own-data parsing rejects hooks/accessors/symbols. Selection, proposals,
repository identity, source revisions and current gates are checked after awaits;
the terminal shared source/property/assignment/member checks run after the final
hash, with no await afterward. Seven snapshots do not establish global atomicity,
genuine Auth, durable process-loss custody, availability or dispatch authority.
Refresh loses this in-memory review; all schedule/assignment/dispatch/write/
message/financial/replay actions remain false.

## Verification

**40 focused application cases PASS**, including all three actual journey companies,
seven-day/year/DST boundaries, canonical proposal/recorded conflicts, missing times,
exact alternative-day provenance, privacy and writer-spy/original state/history/
financial preservation. Real two-staff source/CAS, foreign identifiers/composition,
revocation, stale visit, copied snapshots, strict malformed input, final-await races,
lost reads and UNKNOWN/no replacement are exercised.

```sh
npx vitest run tests/cycle8-weekly-crew.test.ts tests/cycle7-booking-scheduling.test.ts tests/field-day-board.test.ts tests/field-crew-capacity.test.ts
```

Main records actual desktop/tablet/mobile/all-brand/keyboard/axe evidence at the
integrated head; unit tests alone do not claim browser or visual acceptance.
Preserve all128 protected hashes, five design locks/thirteen bindings, all13/customer14/
original4B/broker/P1/four artifacts/approvals/2A–2F/proposedbilling, approved interfaces,
Netlify/executor/recovery/NMI/Auth/provider/financial/communication/hosted/deploy/merge
gates. No credentials, migration, hosted action, message, payment, deployment, merge
or persistent background execution is introduced.
