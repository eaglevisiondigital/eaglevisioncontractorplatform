# P0 development execution · applied, features disabled

October 17, 2026, America/Chicago. Owner-authorized exact two-file development operation,
from checkpoint `a9b6a22`, SQL reviewed at `7e472b7`. **APPLIED / VERIFIED once.**
All13 migration files are immutable history. This supersedes prior P0 unapplied /
unauthorized checkpoints; it does not authorize activation, replay or outside access.

## Approved bytes and execution

| Migration                                             | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `20261017024327_property_connected_readiness.sql`     | `6bb0b9bf22ec1079d7aa5f74c6e33e14534cc54e30e9034c33949f786cfd3ac9` |
| `20261017024328_property_duplicate_index_cleanup.sql` | `3603fe0482f46b9733a0321cd9009cb1f291993fcbede7132e1bdf721776fdfc` |

Approved two-file bundle SHA-256:
`5349a3b175a55bd6f360819c7942fc74f69d9a29c1765a058e20df1319df6dea`.
All13 local files equal reviewed source bytes; original11 remain unchanged.

Fresh project identity/health,11 history entries,500 catalog fingerprints,69 column
ACLs,24 defaults,four schema ACLs,79 business-table digests,eight empty property
tables,Auth/API settings,identity/MFA/session fingerprints and index dependencies
passed. Security/performance categories matched the previous baseline. Zero active
client transactions and zero relevant locks established a quiet development window.
The local CLI help initially hit a sandbox telemetry-file permission error; the
approved execution context resolved that local error before any database operation.

Pinned CLI2.121.0 dry run: **exit0,33.183seconds**, exactly the two ordered files,
zero seeds/roles. A second read-only snapshot matched the first after the dry run.
Approved Keychain credential stayed in process memory/child environment, never a
command argument,report or persistent export. Explicit target and `--skip-vault`
were used; no link,config push,include-all,role/seed,reset/history repair or auto-retry.

```text
node_modules/.bin/supabase db push --skip-vault --project-ref <approved-development-target>
```

Application: **exit0,7.961seconds,one attempt,zero retries**, exact two-file JSON
result,no seeds/roles. Eight read-only lock observations,including the quiet check,
recorded no blocked lock. The supervised process had a55second watchdog and no
monitor error/timeout. Neither migration was edited. No Netlify operation was part
of this execution. Private target-bound authorization,logs,lock snapshots and raw
fingerprint evidence are under ignored `.staging/property-p0-execution/`.

## Independent hosted verification

- History **13**, original11 entries/names/stored statements unchanged. The new25
  and6 stored statements match the exact reviewed SQL token streams.
- Full **514-object** application catalog equals independently reconstructed native
  PostgreSQL17 evidence,including definitions,RLS,policies,triggers,indexes and ACLs.
- New `private.property_report_access`: empty,RLS on,zero policies,three triggers,
  five indexes,three validated composite tenant/customer/property foreign keys.
  All21 effective table privilege checks for anon/authenticated/service_role deny.
- Six new postgres-owned empty-search-path functions:three public SECURITY INVOKER
  wrappers,authenticated-only;two checked private authenticated helpers;one private
  trigger helper with no client EXECUTE. PUBLIC/anon/service_role execution absent.
  Exact reviewed session/current-membership/MFA/CAS/resource checks are preserved.
- Redundant `property_location_customer` index absent. Original
  `location_customer_unique` remains valid/ready,with six validated constraint/FK
  consumers:original unique plus four prior FKs and the new report-lease FK.
- All79 prior business-table digests,69 column grants,24 default ACLs,four schema
  ACLs,eight empty property tables and full Auth identity/factor/session fingerprints
  unchanged. **22 identities,four verified TOTP factors,zero sessions**.
- Property features,customer mappings,report leases,active platform/release grants,
  provider workloads and public buckets remain zero. No customer/estimate/job/
  workforce/financial/audit fixture or authorization row was written.
- Saved Auth/API hashes unchanged:signup/anonymous sign-in off,email verification,
  TOTP/high-AAL and leaked-password protection preserved;private schema excluded.
  Actual anonymous zero-limit table GET denied401/42501;private-profile GET denied
  406/PGRST106. No suggested anonymous GRANT was followed.

These are hosted schema/configuration/boundary checks,not genuine owner/customer
property workflow acceptance. No authenticated session or feature row was created.

## Advisors and remaining security findings

Security: **0 WARN/ERROR,37 INFO** (private RLS tables with no policy,including the
new dormant table; intentionally default deny).

Performance: **4 WARN,96 INFO**. Reviewed duplicate-index warning removed. Existing
four [Auth RLS initplan warnings](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
remain;INFO includes21 unindexed-FK,74 unused-index and one Auth-connection notice.
The three additional unused-index notices reflect dormant report-access indexes.
No unrelated ACL/default privilege/policy/index remediation was performed.

Migration metadata/checker now records only this exact applied dormant scope.
Negative integrity tests reject missing evidence,activation,mappings/leases,wrong
history/versions/bundle and changed installed SQL even with recomputed metadata.
This offline check is never future hosted execution or replay permission.

## Acceptance, containment and next approval

**PASS:** exact migration execution and independent catalog/grant/data/settings/
index verification. **FAIL:**0 hosted verification failures. **BLOCKED:**connected
activation and scanner/media/protected runtime dependencies. **NOT RUN:**all72
three-company property workflow cases. No provider acceptance is inferred.

Do not rollback/drop/replay applied history. Preserve authorization/audit/financial
records. Any unexpected later state requires read-only investigation and a separately
reviewed forward containment operation;no automatic repair. Report access requires
both an exact customer mapping and finite report-only lease plus current verified
Auth session/feature/resource checks. Broader financial grants cannot substitute.

Smallest next database approval:review the existing exact P1 synthetic fixture/
feature/mapping/report-only lease package and cleanup/scope,then authorize it
separately with owner-assisted existing-factor MFA. Preserve original records;
no platform bootstrap or new identities are needed. Media remains503,adapters
unwired,customer financial execution disabled. Netlify repair waits on the existing
support ticket and separate corrective authorization.

Release1.0 **NOT READY / NOT AUTHORIZED**;PR#1 remains draft/unmerged. No deployment,
outside access,provider/merchant/workload activation,email/signing/payroll execution.
See PROPERTY_CONNECTED_TEST_PLAN.md for the72 pending cases and the execution JSON
for exact machine-readable results. Local regression results are appended below.

## Local regression results for this execution record

- `npm run check`: **719 PASS /49 native-only skips**;lint,strict types,generated
  public types,migration/proposal integrity and local build pass. Includes11 new
  applied-record integrity regressions. No application/runtime feature changed.
- Disposable PostgreSQL17.11 focused property suite: **68 PASS /0 skips**,including
  RLS/report permissions,revoked/expired sessions,real wait/concurrency races and
  dependency/lock/query-plan index checks. This focused suite is not a rerun of
  every native-only case in the wider application suite.
- `npm run test:browser` with isolated loopback4177 config: **63 PASS**,desktop/
  tablet/mobile;owner preview untouched. These are local synthetic browser tests.
- Frozen Action D offline verification:**26 PASS**,all14 files/archive/manifest/
  original logo preserved. No deployment,repair or substitution occurred.
- Formatting,types,migration integrity and diff/private-reference checks pass.
  Counts overlap and must not be summed;none substitutes for the72 pending genuine
  hosted property workflow cases or independent release/security acceptance.
