# Workstream 2A · durable maintenance foundation

October 29, 2026 · base `c8f09754f122fb2212f05d4a1d1ef9f06f787dbd`.
**LOCAL CONTRACT / DISPOSABLE DATABASE VALIDATION ONLY.** No migration, connected
executor, application persistence switch or operational activation is supplied.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Implemented package

`server/property/maintenance-persistence.ts` defines a narrow caller-bound port for
exact-source reads, explicit manual edits, follow-up draft preparation and read-only
receipt reconciliation. Strict validation rejects extra authority/financial fields,
invalid identities, dates, enums and revisions. It reuses MaintenanceSource,
MaintenanceEdit, MaintenanceRecord, priorities and date rules. No actor ID is accepted
as a command field. The eventual trusted adapter must derive the actor from genuine
current server authority; choosing a company, property or UI role never supplies it.
There is deliberately no connected implementation or import from the application.

`tests/helpers/maintenance-native-store.ts` implements that port ONLY against the
new disposable `maintenance_2a_test` fixture. The fixture refuses non-harness database
names and anything other than native PostgreSQL 17. The existing engine creates a
random temporary database via a temporary Unix socket locally, or the isolated
loopback CI PostgreSQL service. No arbitrary URL, credential lookup or hosted option.
Only the thirteen historical SQL files are installed in this NEW disposable DB;
the pending customer migration is not loaded by this suite. No existing database or
migration history is changed. Test features, synthetic identities and grants exist
only in this discarded database, not the approved development project.

The executable SQL fixture provides exact-source coordination, append-only notes,
immutable receipts, actor/time metadata and metadata-only audit through the existing
audit trigger. CAS and request locks protect simultaneous staff writes. Explicit
follow-up preparation calls the EXISTING private property command, atomically
retaining its one normal inspection-draft reference and receipt. No parallel visit
store, scheduler, dispatch, estimating engine or financial operation is introduced.
For this bounded test contract, the follow-up plan must be the exact originating plan;
other same-property plans remain a future reviewed integration decision.

`server/property/repair-evidence-archive.ts` encodes bounded private evidence and
rehydrates it using the existing six-section readiness engine. It verifies sequence,
exact origin/target, individual requests, calculation/policy receipts and historical
snapshots; it never trusts a saved 6/6 counter. Native fixture archives reference
existing estimate/version rows and exact source/line identity. Original source and
calculation snapshots and measured quantity/unit/reference records survive a real
reader-process restart. Current saved draft or policy changes produce stale review
while retaining original receipts. Existing application rules also cover relevant
catalog, source and date changes. The encoding is not a signature or a safe public
archive-import API; a fully forged, internally consistent archive cannot establish
historical actor authority or measurement truth.

**Archive INSERT is fixture-owner seeding only, not an authenticated confirmation
writer.** Current SQL source/target checks and private read guards are tested, but
production repair reservation, readiness-write authorization and their atomic
integration into ordinary estimate save/issue/duplicate are NOT implemented here.
These are explicit blockers rather than simulated operational passes. The current
synthetic PropertyRepository/Phase3Repository guards remain unchanged and working.

## Existing capability inventory

| Existing capability                                        | Reused authority or relationship                                                              | Gap identified                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| CRM customers/service_locations                            | Composite organization/customer/location keys                                                 | No second property/customer store needed                                                                |
| private inspection_plans / inspection_visits               | Current plan CAS, real plan/date uniqueness, existing create_visit command                    | Maintenance coordination references are absent                                                          |
| private inspection_reports                                 | Immutable ID/version/customer/property and published finding JSON                             | Finding IDs are JSON entries, not independent FK rows; require exactly one exact ID in that report      |
| Memberships, organization/module gates, Auth sessions      | Current rows, role/AAL rules and post-wait expiry checks                                      | A new maintenance boundary must additionally check banned/deleted/anonymous/unconfirmed principal state |
| Estimates / estimate_versions / lines / policies / catalog | Existing integer engine, draft revision, issued immutability and composite keys               | No durable maintenance repair origin/attempt or six-section history                                     |
| Audit/activity events                                      | Existing append-only metadata trigger                                                         | Keep private note text, snapshots, costs and employee information out of general audit                  |
| PropertyRepository and Phase3Repository                    | Exact-source triage, repair review/attempt guards, conservative attention, six-section engine | Their maintenance Maps and closure-based repair bindings vanish on application restart                  |
| Approved contractor/customer React views                   | Existing session repositories, privacy projections and navigation                             | No UI replacement or connected persistence binding in 2A                                                |

The installed private property schema has eight domain/control tables, none suited
to storing coordination notes or a repair-attempt journal. Reusing report snapshots,
visit internal_notes, supplier comparisons, unbilled decisions, generic customer notes
or audit text for that purpose would change immutable evidence or mix authorities.
Minimal dedicated coordination metadata is necessary. No new property, inspection,
customer, task system or ledger is proposed.

## Persistence contract and concurrency

An item is keyed by organization, customer, CRM location, report ID, exact published
version and finding ID. Publication identity never collapses into wording similarity,
latest mutable visit state or an inferred physical issue. Staff priority is independent
of reported severity. Review is only pending/reviewed; scheduled is derived from one
explicit draft reference. There is no resolved/completed/approved/paid field. A later
report that omits a finding does not change the earlier coordination record.

Commands bind a UUID, the full source, expected maintenance revision and exact input.
The server supplies actor and wall-clock timestamp. Notes are append-only rows with
per-item revision, request, author and timestamp; earlier notes cannot be edited or
deleted, including through ordinary fixture-owner DML. Repeating the same final note
is rejected. Corrections must append a new note. Responsibility references an active
same-company membership; it is not a workforce/job assignment grant.

One command runs per transaction. An organization/request lock prevents UUID reuse
across targets, then an exact-source lock serializes first creation and edits. Resource
locks precede the final current authority checks, so a revocation committed while a
writer waits is seen before any effects. Parent/target validation and positive plan
CAS precede existing visit creation. Membership, organization/module/feature, Auth
session and expiry checks run before response, including duplicate and reconciliation
paths. Duplicate exact requests return the original receipt only after current
permission checks; changed input or actor under that UUID rejects. Competing employees
at the same revision have exactly one winner. The losing transaction cannot leave a
note, draft, receipt or audit fragment.

The fixture uses private SECURITY DEFINER commands with an empty search path, all
identifiers qualified, no dynamic input SQL, no PUBLIC/anon/service-role execution,
no direct client DML grants, RLS enabled/forced, and staff-only read defense. Its
owner can still alter SQL or disable triggers; this is not operator-resistant storage.
No production privilege grant is proposed as approved by these tests.

The thirteen-history session helper checks session existence/expiry but does not
by itself deny all banned/deleted users. Native negative cases exposed this. The
NEW fixture boundary locks and checks current auth.users state in addition to the
existing session and membership guards. Historical helpers/migrations are untouched.
A future maintenance implementation cannot rely on session_id or stale signed role
claims alone. Genuine JWT/HTTP/Auth/MFA acceptance remains BLOCKED.

## Unknown operations and restart evidence

A future caller must persist the immutable intent/request/source BEFORE transmission.
2A deliberately supplies no operational intent service. A lost or interrupted response
is UNKNOWN; there is no retry loop, new request-ID fallback or substitute target.
Read-only reconciliation checks the exact command AND original actor under current
authority. An exact committed receipt returns its retained result. No receipt returns
**undetermined**, not proof of rollback and not permission to repeat the operation.
Revoked actors cannot read receipts to bypass access checks.

The native suite launches separate actual Node child processes against the same
disposable PostgreSQL DB. One commits and exits without delivering its receipt; a
new process reads the retained item/receipt. Another is SIGKILLed while idle in an
uncommitted transaction after the edit or follow-up operation: PostgreSQL detects
the disconnected client and rolls back all changes. The test reconciles without a
second command. This proves representative client-process persistence and transaction
rollback, not browser reload integration, a DB-server outage, disk-loss recovery,
maintained operational custody or the independent two-Mac acceptance gate.

Repair preparation needs its own durable reservation/target receipt protocol before
operational use. Persist exact reviewed source/maintenance/plan revisions, reviewer,
expected baseline, request and reserved estimate/version/line IDs; one source may
reserve one target. Keep PREPARING/UNKNOWN held through restart. Only an explicit
exact-target read may classify a committed result. An absent target or failed read
never authorizes creating another draft. Do not serialize executable authorization
closures or recover by estimate-name/internal-note parsing. Existing estimating
creation_key and saved revision are useful primitives, not repair authority.

## Minimal non-executable schema design for separate review

No forward migration SQL is generated. The following is a design, not an application
schema, execution plan, approved grant or promotion of the fixture SQL.

| Record                       | Required keys and invariants                                                                                                                                                                                       | Index/retention requirements                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintenance coordination     | UUID; organization; exact source tuple UNIQUE; composite CRM/report/member/visit FKs; finite follow-up date; manual enums; bounded revision; immutable source                                                      | Tenant/property/status/priority/follow-up and tenant/assignee/date indexes; no cross-tenant unindexed FK                                      |
| Private notes                | Organization/item FK; item revision/request UNIQUE; author membership FK; bounded text; server timestamp; append-only                                                                                              | Tenant/item/revision history; correction by append, no automatic delete                                                                       |
| Command receipts             | Organization/request UNIQUE; item FK; actor; exact command fingerprint plus retained result; timestamp; append-only                                                                                                | Tenant/request and tenant/item history; retain through all uncertain holds and audit/legal review                                             |
| Repair reservation / binding | Organization/exact-source UNIQUE; immutable request/review/preparer/target/version/line identities; plan/maintenance revision and issued baseline evidence; PREPARING/PREPARED/UNKNOWN; CAS                        | Tenant/source and tenant/target uniqueness; FKs to existing estimates/version/jobs; no second estimate table                                  |
| Readiness evidence           | Organization/binding FK; history sequence and request UNIQUE; saved revision; section/decision/attestation/note; exact source/policy/referenced catalog/calculation snapshots; structured measurements; actor/time | Tenant/binding/sequence and tenant/version/revision; append-only historic evidence, evaluate current state rather than overwrite old receipts |

The four fixture tables demonstrate triage/notes/receipts and archive fidelity; they
are not the final operational schema for the last two design rows. Archive target
checks/parent locking prevent target substitution within the fixture. A real binding
must also enforce repair restrictions in every ordinary estimate entry point and
retain historical revisions without permitting customer publication/issuance.

All tenant parents require organization_id, composite FKs/UNIQUE keys, explicit
revoked privileges and default-deny RLS before any separately reviewed wrapper. JSON
finding, line and measurement identities need checked relational validation inside
the same transaction; a report FK alone is insufficient. Keep all new tables in an
unexposed private schema, not the Data API. No generic CRUD/JSON import endpoint.
Review multi-resource lock order, current principal/assignment checks after waits,
statement-time expiry and every early-success path on native PostgreSQL.

Retain private evidence and audit under restricted access with backups and documented
retention/legal-hold handling. Do not invent a legal retention period. Bound payloads,
notes, history and receipt sizes; reject instead of truncate or silently drop history.
No cascading deletion from a removed member/customer/report may erase held evidence.
PII erasure/correction, archive encryption, backup/restore, access logs and retention
purge authority require separate policy/security review before a service operates.

A future forward-only change must be independently reviewed against the actual
then-approved history. Complete frozen P1 against thirteen migrations first; preserve
the pending customer-fourteen decision as its own gate. Do not silently insert a new
maintenance migration into that history. Package reviewed bytes and containment plan
separately, start default-disabled with no activation/grants/backfill, and never edit
historical SQL. Partial application stops for exact recovery review. Containment is
revoking the separately authorized new capability/entry point, preserving records and
UNKNOWN holds; no automatic destructive rollback, DROP or history repair.

## Validation and reproduction

**40 new native cases, 122 focused application cases and 6 browser cases pass**.
All 211 protected existing paths and four frozen artifact hashes are unchanged.
Use `MAINTENANCE_DURABLE_VALIDATION.json` for final counts/limits and
`MAINTENANCE_DURABLE_APPROVAL_REGISTER.json` for future action boundaries. New tests:

- `tests/maintenance-persistence.test.ts`: strict input contract, evidence replay,
  all three contractor examples, current/stale history and customer/issue restrictions.
- `tests/database/maintenance-persistence.test.ts`: native-only actual current-history
  FK, staff, RLS, CAS/concurrency, duplicate, note, follow-up, revocation/expiry, unknown,
  child-process and archive tests. Without the native harness these are visibly SKIPPED,
  not replaced with PGlite or mocks. CI runs them in its existing PostgreSQL 17 job.
- The existing focused Phase B browser journey covers all companies/viewports/modules,
  shared CRM, exact reference pixels and locked customer-portal isolation. Product
  source/styles/artwork remain byte-identical to the approved base.

Application check: `npx vitest run tests/maintenance-persistence.test.ts`.
Reproducible native check: `npm run test:maintenance-native`. It requires an existing
local PostgreSQL 17 installation (optional PG17_BIN local binary directory), starts a
private temporary Unix-socket cluster with TCP disabled, runs only the new native
suite and stops/removes that owned cluster. It never reads an application URL or
credential and never downloads binaries. CI uses its existing separate native job.
Native check: `EV_TEST_PG_SOCKET=<dedicated temporary socket> npx vitest run
 tests/database/maintenance-persistence.test.ts --maxWorkers=1` using PostgreSQL 17,
user ev_test, port55477, TCP disabled and a fresh random database from the existing
engine. The child-process probe permits only a socket named
`/private/tmp/propel-maintenance-pg-<random>` or the explicit isolated CI service.
Do not point this suite at any development/hosted application database.

Initial native failures identified an incorrect audit-table test selector, the
missing principal-state boundary and a fixture tax comparison retaining created_at
which the existing SQL snapshot intentionally excludes. Corrected fixture code uses
the existing policy projection and proves native SQL/TypeScript calculation equality;
no estimating/readiness engine or historical migration was weakened.

## Next package and blocked acceptance

Workstream 2B: implement and adversarially validate **test-only durable repair-attempt
reservation and readiness append commands**, reusing this exact source contract and
existing estimate engine. Bind reserved target identities and current reviewer CAS;
prove crash-before/after-commit and policy/catalog changes across restart, and enforce
ordinary issue/duplicate/save boundaries before considering a connected adapter.
This is the smallest missing implementation beyond the triage/evidence foundation.
It still requires its own bounded owner direction; no hosted migration or service
activation follows from 2A. Biller Genie-inspired AR remains held for product planning.

Operational service deployment, genuine Auth/session/MFA/HTTP checks, durable client
intent custody, actual multi-user UI persistence, repair/readiness writers, clean
production and independent recovery remain BLOCKED / NOT RUN. No hosted access,
credential retrieval, real session, migration, provider/financial action, Netlify
change, deployment or merge occurred. Existing owner/P1 approvals persist unchanged.

## Reference material checked

The design uses the existing repository as its primary authority. PostgreSQL 17
[row-security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and
[locking](https://www.postgresql.org/docs/17/explicit-locking.html) documentation
inform the RLS/transaction review; the [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [changelog](https://supabase.com/changelog) were checked for relevant platform
changes. No hosted tool, CLI migration or application service was contacted.
