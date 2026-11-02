# Cycle 11 · crew assignment and disposable command lab

Status: local synthetic implementation only. Parent: exact
`b6ac4fc28c5a50d2029db4a5a69d345af0e3f35b`. Main owns the common brief's
whitespace-only formatting patch. No operational or hosted capability is enabled.

## Working browser review

`CrewAssignmentLab` admits one actual job, current assigned technician, original
property visit and immutable issued baseline from the existing `OperatingSources`.
Its default-OFF DEV/explicit-flag/HTTP-loopback gate precedes source access. The
existing canonical portfolio scheduling and capacity engines provide conflict,
working-hours and workload evidence; no schedule/calculation engine is duplicated.
Original visit/plan/job revisions, customer/property/company IDs and source hashes
remain exact. Proposed windows and hours are human proposals. Availability remains
UNKNOWN, including date-only visits and missing working-hours evidence.

The retained source capture, original caller input, confirmation, live repositories,
eligible synthetic staff and model identities are checked after awaited work and
again after final read reconciliation. A stale or copied admission is UNKNOWN.
Source detail opens the exact job/customer/property/issued version and can navigate
to the existing job workflow. Company/model replacement with equal IDs withdraws
old presentation. Labels, focus destinations, wrapping IDs, scoped contractor
palette, 44px controls and stacked mobile cards reuse the approved design contract.
The browser has no Node import, durable writer, storage adapter or reservation
button. The admission is review evidence, never a scheduling capability.

## Actual durable transaction model — server tests only

`server/field-lab/crew-transaction.ts` uses built-in Node 24 `node:sqlite`, a private
throwaway `propel-crew-lab-*` temporary directory, and the fixed `custody.sqlite`
file. Explicit `enabled` and `test_only` flags are required. Initialize the lab once
with `prepareCrewLab` before starting concurrent workers. File creation is exclusive
and no-follow with mode 0600; arbitrary files, symlinks and unrecognized existing
SQLite databases are rejected before mutation. Existing labs require the exact
application/version marker and four metadata table names.

These tables store only command custody, original source references, reservation
interval metadata, lane revision and immutable receipts. They are not canonical
work orders, assignments, visits, schedules, a general task store or a migration.
No production/connected importer, CLI, endpoint or network transport is supplied.

1. Validate strict own-data envelope, SHA-256 binding, source IDs/revisions, no
   authority flags and the exact trusted admission witness.
2. Acquire `BEGIN IMMEDIATE`, then revalidate the original live command and trusted
   source witness **after the lock wait**. Commit the permanent attempt claim with
   SQLite WAL and `synchronous=FULL` before the reservation transaction.
3. Acquire the write lock again and revalidate source. Compare the exact company,
   worker and day revision. Calculate overlaps using the existing canonical
   `calculateCrewCapacity` function over prior lab reservations and the proposal.
4. Reserve only if source, CAS, canonical requirements and conflicts permit it;
   atomically write the next revision and exact hash-bound receipt. Otherwise retain
   a factual rejection receipt when safe to do so. No canonical business writer runs.
5. The logical original company/job/visit hold survives command-ID, worker, day,
   revision and note changes. Existing or ambiguous attempts only read the exact
   retained command/receipt; no retry, replay, automatic continuation or replacement.

Missing receipt/database, corruption, changed command/source, receipt write failure,
process interruption and lost acknowledgment retain UNKNOWN. Absence is never
interpreted as failed execution. A committed exact receipt may be read after restart;
a pending claim stays held after restart. Read-only reconciliation verifies exact
command and envelope identity, receipt integrity, job/worker/day identity and
revision transition; it never synthesizes a replacement receipt.

## Trust and durability limits

The callback returns the hash of an independently retained current source admission;
its implementation and the local test provisioner are trusted. Child-process tests
use an explicit controlled synthetic witness file, **not** genuine Auth, remote
source attestation or operational staff authority. The callback is synchronous and
checked under the SQLite lock and immediately before commit. Canonical repositories
and global Auth do not share that database transaction. Atomic source revocation,
operational custody, hostile same-user filesystem mutation, restore protection,
independent power/network recovery and genuine dispatch remain unverified. A local
SQLite commit and process-loss test do not prove physical-device recovery.

Session/browser review is not crash-durable. Only the isolated test database's
metadata/receipts have demonstrated process-restart persistence. No reservation
synchronization, automatic rescheduling or dispatch exists.

## Focused proof

The dedicated suite exercises all three existing contractor brands, source navigation,
immutable issued versions, safe projection/no business writer, canonical shared-worker
overlap and adjacent windows, CAS, actual concurrent child processes, actual SIGKILL
after claim and after receipt commit, source revocation across a real write-lock
wait, lost acknowledgments, actual SQLite receipt-write refusal, exact reconciliation,
no command/worker/day replacement bypass, malformed/accessor inputs, wrong admission
witness, revoked staff, final-await source/input/gate/model changes, missing hours,
receipt corruption, OFF gates, arbitrary private files and symlink rejection.

Main owns combined desktop/tablet/mobile browser, axe and integration evidence.
All protected historical code, migrations, approved interfaces/artwork, original
P1/four artifacts, customer14/4B, Netlify/executor, recovery, NMI/MFA/Auth, provider,
financial and communication restrictions remain unchanged. No hosted writes,
credentials, dispatch, payments, messages, deployment or merge. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.
