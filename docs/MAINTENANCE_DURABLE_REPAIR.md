# Workstream 2B · durable repair reservations and readiness writes

October 29, 2026 · base `5474730e43ce4a22f147791c7416b29a27dd824f`.
**TEST-ONLY / DISPOSABLE NATIVE POSTGRESQL 17.** No operational migration, connected
adapter, hosted service or UI persistence switch. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**. Workstream 2A evidence remains valid and unmodified.

## Implemented boundary

The unwired `server/property/repair-persistence.ts` contract reuses the existing
MaintenanceSource, EstimateInput and RepairReadinessRequest. Strict source/UUID/
positive-revision/size validation rejects caller actors, issue flags, counters and
substituted customer/property/line identity. No credentials, URL or application route.
Its only implementation is `tests/helpers/repair-native-service.ts` against the
new `tests/database/fixtures/repair-contract.sql`, layered on the existing 2A fixture.

The fixture refuses anything except a fresh random harness database on PG17. The
runner installs exactly thirteen historical migrations; customer fourteen is excluded.
Its six private tables contain only coordination: immutable reservations, preparation
events, exact-target binding receipts, readiness intents/reviews and transient checked-
writer permits. Existing CRM, plans, published reports, jobs, estimates, versions,
lines, tax policies and catalog remain the actual referenced records. No parallel
property, estimating, scheduler, customer or financial system. Composite tenant FKs,
FK-prefix indexes, RLS enabled/forced and revoked client privileges are verified.
Reserved identities cannot have target FKs before creation; the committed binding
adds the exact existing-estimate/version composite FK after successful creation.

**This is a trusted fixture service using the disposable harness owner.** All new SQL
functions, including append/finish helpers, are revoked from authenticated, anonymous
and service roles; no wrappers or request-client DML exist. The service derives the
reviewer from the fixture's current principal, never a command actor. A genuine
production principal verifier and a least-privileged command identity are not supplied.
Raw fixture-owner SQL can bypass the TypeScript engine or disable triggers: neither
fixture code nor archives are an authenticated public import/write API. Simulated
claims exercise installed SQL authority rules, not signed JWT/Auth/MFA/HTTP acceptance.

## Reservation, one-shot preparation and reconciliation

1. Generate and retain one immutable request containing exact organization/customer/
   CRM property/report/version/finding, reviewed maintenance CAS, plan CAS, optional
   plan-linked job/immutable issued baseline, proposed scope, request UUID and reserved
   estimate/version/source-line UUIDs. No name search or note parsing supplies identity.
2. `reserve` validates current reviewed source and staff authority and commits the
   immutable reservation plus server actor/time receipt. One reservation per exact
   source and one target per reservation; competing employees cannot create two.
   Exact reservation replay returns its original receipt after current authorization;
   changed command/actor under that UUID rejects.
3. `prepareOnce` commits an `attempting` event **before** the asynchronous target
   transaction. It then executes one finish call. There is no retry loop, attempt
   reset, new-ID fallback or restart-resume method. Finish helpers are internal trusted
   operations, not externally callable endpoints. An interrupted claimed attempt stays
   UNKNOWN even if a test demonstrates that its transaction rolled back.
4. Final creation rechecks current source/CRM/review/plan/job bindings and duplicates
   after waits. Reserved IDs are inserted into the EXISTING estimate/version tables
   using existing estimate_context/calculation and child writer; numbering advances
   only atomically with creation. Existing imported-material approvals cannot be
   transferred into this creation. The existing create_estimate cannot accept reserved
   IDs, so the fixture contains the minimal reserved-ID insertion orchestration, not
   another calculation engine or a modification of historical creation SQL.
5. Read-only reconciliation accepts the original exact command and preparing actor,
   checks current access and the reserved exact target/line/receipt. An absent initial
   reservation, absent binding or missing target is **UNDETERMINED**, not failure or
   permission to create another draft. Inaccessible evidence fails closed. Reads do
   not append events, advance a state or clear uncertainty. Restart readers never send
   finish again. Broader operational intent custody before the initial reserve request
   itself is still a 2C gap; callers must not infer safety to resend from an absent row.

## Guarded readiness append

The service locks the exact reservation, saved estimate/version, current referenced
policy/catalog and source resources, then checks current principal/session/company/
membership/module/feature authority. Banned, deleted, anonymous and unconfirmed users
are excluded. Existing owner/admin AAL2 and eligible office-staff rules are preserved;
field staff and foreign companies cannot append. Current checks run after resource
waits and again before returning, including duplicate paths. No UI selection confers
permission. A native test caught an early authority-lock ordering defect; resource
waits now precede those locks, allowing a committed revocation to be observed.

The existing six-section engine validates exact saved revision, snapshot, tax/calculation,
referenced catalog, sequence, decision/note and structured per-line quantity/unit/
measurement reference. A committed immutable intent precedes the asynchronous append;
final append reloads/validates under the same transaction locks. Receipt UUIDs and
history CAS prevent duplicate/stale writes. Exact committed duplicates return their
original receipt; an outstanding intent without a receipt holds the whole reservation
against replacement request IDs. `reconcileReadiness` is a read of the exact request/
actor only. There is no automatic retry or uncertainty-clearing command.

JSONB object ordering is not evidence. The adapter normalizes request key ordering
and checks the retained SQL calculation for semantic equality with the existing
integer engine before giving it canonical engine ordering. It does not replace a
changed calculation to make review pass. Snapshot strings and array order remain
exact. SQL rechecks the complete current context, actor, sequence, revision and intent;
no stored 6/6 count is accepted. Retained notes/receipts are append-only; server time
is authoritative. History and snapshots are bounded, private and never published.

Checked saves preserve exact customer/property/source line and CAS through the
existing save engine. Saved scope/quantity/cost/terms, tax or referenced-catalog
changes make previous confirmations stale while retaining history. Missing/inactive
catalog, unreviewed tax, bad calculations and incomplete measurements block relevant
confirmations. Structured measurement references are staff attestations, not independent
measurement truth or authenticated historical evidence.

## Ordinary estimate integration: proved only in the fixture

Fixture-only triggers on existing estimate/version tables enforce checked-writer
permits without a client-settable GUC. Ordinary save, duplicate, revise, issue and
archive paths cannot escape an exact repair binding; source-line/customer/property
substitution rejects. Safe saves use the existing private.save_estimate under a permit
created/removed inside its checked transaction. Failed writes roll back permits and
all partial effects. Six of six never authorizes issue, publication, job/work approval,
contracts, invoices, payments or debt. The existing issued linked job baseline remains
byte-identical and its immutable trigger rejects changes.

**Historical operational SQL has none of these fixture guards.** Their tests are not
production enforcement. All ordinary-path integration remains BLOCKED outside this
disposable environment until separately reviewed forward schema/command enforcement
covers every path and is explicitly authorized. A manually authored unrelated estimate
with different IDs has no repair provenance; wording similarity never binds it. No
claim is made that these guards detect semantically similar unbound estimates.

## Verification and reproduction

- **48 new native PostgreSQL17 cases pass**: all three companies, valid/invalid source/
  property/job baseline, real competing transactions, CAS, exact/changed UUIDs, role/
  principal/AAL, actual lock waits with membership/account/session revocation and real
  JWT wall-clock expiry, private client-denial, append-only records/FK indexes, saved/
  policy/catalog staleness, structured measurement checks, original report privacy,
  ordinary estimate guards and child-process interruption/restart.
- **24 new application contract cases pass**; strict TypeScript, generated types,
  lint, build, formatting and all migration/property/customer integrity checks pass.
- **195 protected existing product/server/SQL/recovery/asset/CI/config paths** remain
  byte-identical, including both approved UIs, estimating/workforce/payroll code,
  thirteen historical migrations and pending customer migration. Four private frozen
  P1 artifact hashes match. Original README, logo, locks and approvals are preserved.
- Unchanged browser, platform and recovery baselines were not repeated locally.
  Existing GitHub workflows run automatically on push; CI results are reported on
  the actual new commit, not by restarting older successful checks.

```sh
npm run test:maintenance-native -- --workstream=2b
npx vitest run tests/repair-persistence.test.ts
```

The native command reuses the existing owned, self-cleaning local PG17 cluster with
TCP disabled; no application URL or credential is read. Without native environment,
the native cases visibly skip, never fall back to PGlite/clock mocks. Default existing
`npm run test:maintenance-native` now includes both 2A and 2B for later combined runs.
The isolated CI PostgreSQL17 job discovers both automatically without a workflow edit.

Fault probes use actual separate Node processes: commit then exit without delivering
repair/readiness receipts; SIGKILL before initial reservation commit, after durable
claim before target creation, and during open target/readiness transactions. New
reader processes recover committed evidence; uncommitted writes roll back. Readiness
fault probes receive an already engine-validated review from the trusted parent to
exercise SQL transaction persistence; separate service tests validate the engine and
principal boundary. This is not DB-server restart, crash-consistent disk/backup testing,
a real operating service restart, authenticated browser persistence or the independent
two-Mac recovery rehearsal. No physical-device PASS is claimed.

## Remaining approval and 2C scope

See MAINTENANCE_DURABLE_APPROVAL_REGISTER.json. No executable operational migration,
nonprivileged production adapter/service, public endpoint, UI durability or signed
principal verification is implemented. No hosted Auth/session/grant/feature/mapping/
lease, provider, financial, Netlify, deploy, production, outside-access or merge action.
Frozen P1 must run unchanged against thirteen migrations before considering customer
fourteen or maintenance history expansion. Existing P1 approval is not requested again.
Recovery and connected acceptance remain separate unfinished gates; AR stays held.

Smallest proposed **2C**: compose the existing ports into a test-only least-privileged
local command service with durable pre-send intent custody (including reserve itself),
exact command/actor reconciliation and full service-process restart tests. Remove the
harness-owner execution assumption, review mixed resource/admin lock order and retain
all UNKNOWN holds. No operational migration, genuine Auth binding or hosted activation
follows; 2C requires its own bounded owner direction.

Reference checks: PostgreSQL17 [locking](https://www.postgresql.org/docs/17/explicit-locking.html),
Supabase [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [changelog](https://supabase.com/changelog). The Markdown changelog fetch was
unavailable; the public HTML changelog was checked. No platform upgrade or hosted
service call was needed for this native fixture work.
