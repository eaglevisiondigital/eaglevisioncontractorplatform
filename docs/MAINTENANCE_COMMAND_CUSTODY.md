# Workstream 2C · caller custody and restricted local command service

October 29, 2026 · base `9219ef98a92e337b762b3df9c67eee9c0f3ee6fe`.
**TEST-ONLY / DISPOSABLE NATIVE POSTGRESQL17.** Release 1.0 remains
**NOT READY / NOT AUTHORIZED**. No operational migration, hosted identity/service,
public connected route, credential retrieval, provider call, deployment or merge.

## Executable composition and reproduction

Run the bounded new package with an existing local PG17 installation and Node24:

```sh
npm run test:maintenance-native -- --workstream=2c
npx vitest run tests/command-custody.test.ts
```

The existing runner starts its own private temporary PostgreSQL17 cluster, disables
TCP, installs exactly thirteen historical migrations in a new random database and
loads the existing 2A/2B fixtures plus `maintenance-service.sql`. Customer fourteen
is excluded. It compiles `tests/helpers/maintenance-command-process.ts` using the
already pinned Vite into an ignored disposable directory, provisions exact synthetic
capabilities/LOGINs, starts actual independent Node processes and removes its own
roles/database/bundles/journals/cluster afterward. No dependency download or application
URL, Keychain, real password, token or session reader. CI uses only its existing
isolated loopback PostgreSQL17 service with synthetic test credentials. Arbitrary
hosts, databases, owner identities and invalid socket paths are rejected by the worker.

The process is a real sequential **stdio command service**, not an HTTP route or a
callback standing in for process loss. It reports ready, reads bounded newline JSON
and emits bounded private protocol results. Input is capped before collecting an
unbounded line; oversized/truncated input is rejected without creating an intent.
There is no autonomous replay loop, startup queue draining, issue command or general
SQL API. Normal messages have exactly `operation` and `command`; operation is execute
or reconcile. A command is `{kind, command}` using the existing MaintenanceCommand,
RepairReservationRequest or ReadinessAppendCommand. Source identity and request UUID
are those existing contracts, never inferred from text or selected roles.

`NativeMaintenanceFixture` and `NativeRepairService` remain byte-identical. A narrow
query bridge sends their fixed command steps through the new capability gateway;
the integer estimate engine, exact repair provenance, six-section validation,
ordinary-estimate fixture guards and current-authority checks are reused. No duplicate
CRM/property, inspection, estimate, scheduler or financial system. Existing product
routes and approved contractor/customer interfaces remain unchanged and session-only.

## Actual least-privilege boundary and explicit trust limits

| Identity                                             | Exact disposable privileges                                                                                               | Explicitly denied                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Service LOGIN, random per test capability            | CONNECT in the test harness, catalog/identity reads, USAGE of maintenance_2c_test and EXECUTE of command(uuid,text,jsonb) | No superuser/CREATEDB/CREATEROLE/BYPASSRLS/inheritance/memberships; no direct application/private-table reads or DML; no raw 2A/2B helper calls, capability provisioning or role switching |
| Gateway owner, dedicated random NOLOGIN              | USAGE of 2A/2B/2C schemas; EXECUTE of a fixed listed set of checked helpers; ownership of the one gateway function        | No LOGIN, superuser, role/database creation, BYPASSRLS, application DML or persistent schema CREATE                                                                                        |
| Harness provisioner / existing checked helper owners | Existing disposable bootstrap authority only                                                                              | Never used as the runtime service connection or a public connected identity                                                                                                                |

Startup independently checks the LOGIN's nonprivileged attributes, lack of inherited
role membership and absence of estimate DML. Runtime authority is derived from a
private immutable capability matching PostgreSQL **session_user**. The row fixes
actor, existing synthetic session, AAL, organization, purpose, full exact command,
engine-approved readiness evidence and expiry. Only one-way revocation is mutable.
The ordinary client cannot read/provision/change a capability, substitute another
LOGIN's capability or manufacture authority with request.jwt.claims, search_path,
actor IDs, company IDs or role fields. All gateway/helpers have an empty search path
and qualified objects; no user-controlled function name or dynamic command SQL.
Capability lookup and final row-lock checkpoint reject expired/revoked authority.

Readiness capabilities are compiled by the **trusted test provisioner using the
existing canonical engine** for an exact request. Runtime still reloads current
context and validates with that engine under locks; the SQL gateway additionally
matches the exact engine-approved section/input/actor/calculation, excluding only
the server-stamped recording time. A restricted SQL caller cannot bypass the engine
by forging another section, quantity reference, note or a saved 6/6 counter. Current
saved evidence must still match at the existing SQL append boundary. This is an
exact-command laboratory capability, not a new operational approval workflow.

**The transitive trust boundary is not fully deprivileged.** Capability/resource-lock
helpers and existing 2A/2B/historical SECURITY DEFINER functions retain the trusted
fixture/bootstrap owners. The NOLOGIN gateway has only their listed EXECUTE grants;
request LOGINs cannot call them directly. Replacing/reviewing that entire privilege
graph is still required before an operational migration/service. A harness owner can
alter SQL, disable triggers or provision other commands; these tests do not protect
against that trusted owner. Local Unix-socket trust and CI's synthetic DB password
prove SQL privileges, not authenticated human identity. No signed Supabase JWT/Auth/
MFA, public transport authentication or production principal-verifier PASS is claimed.

## Durable caller-side custody

`server/property/command-custody.ts` is an unwired Node24 utility. Its SQLite file is
an **intent/receipt journal only**, not a second application database. The owned 0700
private directory and 0600 database/WAL files remain outside Git and generic logs.
Symlink/permission substitution rejects. SQLite WAL, synchronous FULL, fullfsync,
explicit directory sync and immediate write transactions make the local commit precede
transmission. No network operation follows a failed custody commit. A real competing
SQLite writer test verifies that failure path. No application dependency/lock changes.

An immutable intent retains original UUID, exact source tuple, purpose, expected CAS,
full canonical command/fingerprint, capability binding and local timestamp. Repair
commands retain the reserved estimate/version/source-line IDs. Readiness commands
retain the exact saved revision/snapshot/section/measurement request. Object key order
is canonicalized; array order and snapshot strings stay exact. Non-JSON/coerced and
oversized data rejects. Stored metadata is checked against the retained body before
dispatch. SQL update/delete triggers reject changes to intents and history.

Append-only events record retained, transmitting, acknowledged, uncertain and exact
committed reconciliation, with explicit reserve/prepare phases. A durable reservation
acknowledgment precedes the separate preparation phase. A transmission marker commits
before the first corresponding SQL command call, including the initial reservation.
A crash/failure after that marker stays held even when a test proves no remote write.
Failed local acknowledgment cannot erase the earlier transmitting marker.

An existing request can only reconcile; it is never automatically resumed, resent or
replaced. An unknown exact source blocks another request UUID or purpose in the same
journal. Two independent processes sharing custody have one transmission winner.
Changed payload/capability under an existing UUID rejects. Remote read-only
reconciliation requires the original request and current SQL authority before a local
committed receipt can be appended. Missing remote receipts remain **UNDETERMINED** and
cannot clear a hold. Even a reservation acknowledged before a crash is not silently
advanced into creation. There is no reset, cancel, delete, new-ID fallback, estimate-name
search or internal-note parser.

Per-command and receipt bounds are 1MiB, with at most 1,000 intents, 64 events per intent
and a 64MiB SQLite page budget. Capacity exhaustion stops rather than truncating or
purging evidence. These are lab bounds, not legal retention policy. Journal hashes
check fidelity, not authentication against a malicious filesystem owner. Plaintext
synthetic private records require separate encryption/key custody/backup/retention
review before operational use. Disk-full, corrupt storage, power failure, disk loss
and database-server recovery are not certified by process tests.

## Cross-resource concurrency review

Within the composed gateway, commands take a tenant coordination advisory lock,
request/source locks, company settings, originating plan, exact report/CRM location,
maintenance item, reservation, estimate/version, job/baseline, tax policy and referenced
catalog locks in a fixed order. These resource locks precede current principal/session/
member/module checks. Re-entering the unchanged helpers therefore does not acquire
those resource locks after holding earlier authority locks. Referenced catalog IDs
are ordered. Same-company composed commands serialize; different tenants retain
separate scope. The lab favors safety over throughput and is not a load acceptance run.

Authority-only revocations may commit while a command waits for a resource. Current
principal/session/member/capability/clock checks then deny completion. The final
capability share lock serializes revocation with success; a separate native test holds
that row until after the underlying command executes, revokes it and proves the entire
transaction/receipt rolls back. No early duplicate-success path bypasses these guards.

Representative resource administration takes resource/coordination locks before
changing authority. A guarded estimate save explicitly participates in that protocol;
a waiting review sees its new revision and rejects old evidence. Tax/catalog changes,
plan CAS changes and maintenance-versus-readiness races are exercised on actual native
waits/transactions, without PGlite or mocked clocks. Failed operations retain custody
and cannot leave partial evidence, an extra visit or another repair target.

**This is not universal deadlock acceptance for arbitrary existing writers.** Old
standalone SQL/helpers and arbitrary multi-resource administrative transactions do
not automatically join the new protocol. Direct connected/ordinary writers remain
unwired/blocked. An independent review must integrate all required paths and authority-
lock order, bound contention/timeouts and validate realistic concurrency before a
service is operational. No historical SQL was edited to assert that integration.

## Executed evidence and limits

**38 native PostgreSQL17 service/security/restart cases and 20 application custody
cases pass**. Native coverage includes all three contractor contexts, real restricted
LOGINs, wrong actor/company/command, private/client denial, duplicate identity, SQL
function-owner/search-path checks, raw forged readiness, real SQLite custody-write
failure, two independent service processes and actual PostgreSQL resource waits with
revocation/expiry and changed plan/estimate/tax/catalog evidence.

| Required interruption                    | Actual observed behavior after process termination/restart                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Before intent persistence                | No intent or remote mutation; reconciliation rejects absent original custody             |
| Durable intent before transmission       | Original intent retained, no remote receipt, UNDETERMINED; repeated execute reads only   |
| Request committed, response lost         | Transmitting retained; exact receipt reconciles without another mutation                 |
| Reservation committed before creation    | Exact reserved IDs retained remotely/locally; no estimate and no automatic continuation  |
| Open creation transaction                | SIGKILL rolls back target/binding/permit, prior attempt stays UNKNOWN; no retry          |
| Committed creation before acknowledgment | One exact target and receipt survive; restart only reads/reconciles                      |
| Open readiness append                    | SIGKILL rolls back review; remote/local intents hold and replacement UUID rejects        |
| Saved estimate changed                   | Original receipt remains historical; current review is stale, never a cached ready count |
| Staff permission revoked                 | Restart cannot reconcile private evidence; journal hold remains and no write occurs      |
| Complete service termination             | New PID opens the same SQLite journal and exact SQL bindings; startup sends no commands  |

These are whole **Node service-process** interruption/restart tests, not merely a
prevalidated SQL callback. The service itself runs the canonical readiness engine.
They do not prove DB-server restart, fsync behavior under real power loss, disk/backup
recovery, authenticated browser persistence or independent physical two-Mac recovery.
No physical-device PASS or hosted acceptance is implied.

Strict/generated types, lint, format, build and migration/property/customer integrity
pass. **202 protected existing paths** (including all original src/server/SQL/recovery/
assets/CI and the reused 2A/2B fixtures/helpers/suites) and four frozen P1 artifact
hashes remain unchanged. Existing approved UIs, original README, artwork, financial/
workforce engines and npm lock remain byte-identical. Previously completed baselines
were not repeated locally; existing CI runs automatically on push. See
MAINTENANCE_COMMAND_CUSTODY_VALIDATION.json for counts and the updated approval register.

## Remaining gates and proposed 2D

No operational migration or production adapter/identity, public connected route,
service deployment, hosted Auth/grant/feature/customer mapping/lease, provider/financial/
media/Netlify operation, outside access, production action or merge. Customer UI remains
session-only/closed to connected activation. Frozen P1 stays unchanged against thirteen
migrations before customer fourteen or history expansion; existing approval persists.
Financial issue/publication/work/contract/invoice/payment/debt and repair-completion
inference remain disabled. Structured measurements remain staff attestations.
Independent two-Mac recovery and genuine connected acceptance remain separate gates.

Smallest proposed **2D**: independently review this exact service/custody/SQL privilege
graph, hostile capability/transport inputs, all participating lock orders and UNKNOWN
custody recovery. Produce an executable local adversarial acceptance matrix and a
non-executable forward integration/containment review. Genuine Auth binding, operational
schema bytes and activation would still need their own exact review/authorization.
No service promotion, migration or new financial feature follows from this recommendation.
Biller Genie-inspired AR remains held for product planning.

Reference checks: [PostgreSQL17 SECURITY DEFINER rules](https://www.postgresql.org/docs/17/sql-createfunction.html)
and [SQLite synchronization](https://sqlite.org/pragma.html#pragma_synchronous).
Node24 SQLite availability was verified directly on the installed runtime and in the
independent worker processes; the versioned Node documentation endpoint was unavailable.
