# P0 · final two-migration development preflight

October 17, 2026, America/Chicago. Reviewed application/SQL commit `7e472b7`.
**PREFLIGHT PASS. Technical GO for separate exact development execution approval.
Neither migration has been applied. Execution and activation remain NOT AUTHORIZED.**

## Exact package and operation

The connected project metadata confirms the exact owner-designated healthy development
project and original project name. Its private target matches the approved target,
existing application endpoint and the explicit CLI target; no production target or
implicit local link is used. Exact target IDs, credentials and raw evidence remain
under ignored `.staging/property-p0-preflight/`, never Git. PR #1 stays draft.

Pinned Supabase CLI **2.121.0** version and `db push --help` were freshly checked.
No upgrade, login/reset, key rotation, database link or configuration push occurred.
All13 local SQL files equal the reviewed commit; original11 hashes/manifests remain
unchanged. The two pending files, in order:

- `20261017024327_property_connected_readiness.sql`
  SHA-256 `6bb0b9bf22ec1079d7aa5f74c6e33e14534cc54e30e9034c33949f786cfd3ac9`.
- `20261017024328_property_duplicate_index_cleanup.sql`
  SHA-256 `3603fe0482f46b9733a0321cd9009cb1f291993fcbede7132e1bdf721776fdfc`.

Pending bundle SHA-256: `5349a3b175a55bd6f360819c7942fc74f69d9a29c1765a058e20df1319df6dea`.
Installed11 bundle: `15a2b9c67766564e91efe7cf3347a7138a10b1a722a5d295ce1f7f3613a2f17e`.
Full proposed13 bundle: `ef6151b4c111f3907205feff27b6f343e34d785e4364209ad7a9f85f2b4ff12d`.
Canonical bundle hash is SHA-256 of JSON.stringify of ordered `{file,sha256}` entries,
without whitespace. The exact **proposed, unexecuted** target-bound operation JSON
has SHA-256 `c7d69d870cf9afc0979614957b3c1d60691ccfa524df7cc32b8bd2e440cbd6ff`. This digest does not confer execution permission.

The approved existing macOS Keychain credential was read through the established
process, decoded/validated only in memory and passed only to the CLI child environment.
No credential was printed, exported to disk, copied into a report, reset or created.
The one dry run used:

```text
node_modules/.bin/supabase db push --dry-run --skip-vault --project-ref <approved-development-target>
```

**Exit0;5.697seconds;no timeout/retry.** Exact CLI result:

```json
{
  "dryRun": true,
  "migrations": [
    "20261017024327_property_connected_readiness.sql",
    "20261017024328_property_duplicate_index_cleanup.sql"
  ],
  "seeds": [],
  "roles": []
}
```

There is no `roles.sql`; configured seed paths are empty. No include-all/seed/role,
auto-confirmation, Vault update, apply/reset/repair or support-ticket flag was used.
The CLI's successful planning message is not an application result.

## Before/after security and drift evidence

| Boundary                                                                               | Fresh result, unchanged after dry run                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosted migration history                                                               | 11 exact entries including names/stored statements; matches saved post-install baseline                                                                      |
| Application schema, RLS, functions, indexes, constraints and effective ACL definitions | 500 catalog fingerprints match approved installed/native schema                                                                                              |
| Column/default privileges                                                              | 69 column ACL records and24 default ACL records unchanged                                                                                                    |
| Business data                                                                          | 79 prior business-table count/content digests unchanged                                                                                                      |
| Schema privileges                                                                      | Four schema ACL records unchanged before/after                                                                                                               |
| Saved Auth/API configuration                                                           | Complete approved hashes unchanged; public schema only; leak protection on                                                                                   |
| Auth restrictions                                                                      | Signup/anonymous sign-in off; email verification,TOTP enrollment/verification and high-AAL restrictions preserved                                            |
| Public API                                                                             | Zero-limit anonymous organization SELECT denied401/42501; private profile rejected406/PGRST106                                                               |
| Preserved identities and factors                                                       | 22 identities,four verified TOTP factors;zero sessions                                                                                                       |
| Off controls                                                                           | Zero property feature/customer mapping rows;report-access table/public wrappers absent;zero active platform/release grants/provider workloads/public buckets |
| Security advisors                                                                      | 0 WARN/ERROR;36 intentional private default-deny INFO                                                                                                        |
| Performance advisors                                                                   | 5 WARN/93 INFO;four existing Auth-RLS initplan warnings and the reviewed duplicate-index warning                                                             |

No response hint to GRANT anonymous SELECT was followed. Root OpenAPI access was
not used as a key validity test. No new user login or genuine property Auth case
was run. Settings were checked again after the dry run. Data/ACL/history equality
also independently confirms that the dry run did not apply these migrations.

Current findings remain scoped: [duplicate index](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)
and [Auth RLS initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).
The latter four warnings and the known broader future-default privilege cleanup
are outside this operation. This preflight does not authorize their remediation.

## Index dependencies, query and concurrency evidence

`location_customer_unique` is valid/ready UNIQUE and backs the original unique
constraint plus four installed tenant FKs. Preserve it. `property_location_customer`
is an identical valid/ready UNIQUE btree with no constraint or dependency consumer.
The cleanup DO block checks both definitions, retained constraint and absence of
redundant dependencies before ordinary non-CASCADE DROP. No historical SQL changes.

Fresh disposable PostgreSQL17.11 run: **68 PASS,zero skips** (65 property authorization/
concurrency cases and three index tests). The index test uses5,000 rows across two
companies, EXPLAIN ANALYZE BUFFERS, unchanged result rows and the retained constraint
index after cleanup. Foreign-tenant FK writes remain denied. A held row lock causes
the actual two-second cleanup lock timeout/rollback, preserving the duplicate;
after release it succeeds, and child FK writes still serialize against parent locks.
Native post-install reconstruction also produces the expected514 catalog fingerprints.
No hosted index was dropped and no hosted write/lock race was attempted. A read-only
snapshot found no existing service-location locks; this is not a future lock guarantee.

The cleanup migration uses `lock_timeout=2s`, `statement_timeout=10s` and a transaction.
The readiness migration performs ordinary DDL/FK creation and has no explicit lock
timeout in its approved bytes. A quiet, supervised development maintenance window
is required before later execution. Do not add SQL/timeouts to the reviewed files
or imply that the entire two-file package is covered by the cleanup's timeout.

## Proposed execution procedure · separate approval required

1. Obtain owner authorization for these exact two SQL/hash/bundle values and target
   operation. Reconfirm the quiet maintenance window and authorized supervision.
2. Refresh project identity, reviewed SQL bytes, all11 stored history records,
   catalog/ACL/default/data/Auth/API/gates, advisors and index dependencies/locks.
   Require exactly the same two pending files and empty seeds/roles in a fresh dry run.
   Stop on any discrepancy, new unexpected finding or record; never widen the scope.
3. Only after authorization, use the approved Keychain process and the exact proposed
   command below, once, in the repository holding the unchanged reviewed package:

```text
node_modules/.bin/supabase db push --skip-vault --project-ref <approved-development-target>
```

No executable apply helper was created by preflight. The private operation JSON
records one attempt, expected11-to13 history, both file digests, no seeds/roles or
activation, and stop/partial-success controls. There are no fixtures, credentials,
service identities, provider bindings, report leases or customer mappings in scope.

## Prepared post-install verification

Private `post-install.sql` is READ ONLY and prepared,not executed. Compare the full
catalog to independently reconstructed PostgreSQL17 expected514-object evidence;
re-run the existing catalog/column/default/schema/data/gate/settings reads as well.

- Require13 migration-history entries,first11 identical and exact new SQL statements
  matching both approved files. Do not repair/reset history to make it match.
- Require one new empty private table `property_report_access`,RLS enabled,zero
  policies/client table grants,three triggers,five indexes and validated tenant/
  portal-mapping FKs. All eight existing property tables stay empty and unchanged.
- Require six new fixed-empty-path functions:three public SECURITY INVOKER wrappers
  executable only by authenticated;two private checked helpers executable by
  authenticated;the private trigger helper has no client EXECUTE. Verify effective
  privileges for PUBLIC/anon/authenticated/service_role and absence of direct table
  access. All prior functions/RLS/grants remain unchanged.
- Require duplicate absent,original constraint index valid/ready,all four existing
  FK consumers preserved plus the new report-lease FK. No table/record deletion.
- Require79 prior data fingerprints,69 column ACLs,24 default ACLs and saved Auth/API
  settings unchanged;feature rows,mappings,leases,workloads and sessions remain zero.
  API private profile stays excluded;no feature/customer/media invocation is implied.
- Re-run security/performance advisors. Investigate any new WARN/ERROR;expect the
  duplicate warning to disappear while four existing Auth-RLS warnings remain.
  New private-default-deny/unused-index INFO may reflect the dormant table/indexes;
  do not remediate by adding policies or grants. Record actual results precisely.

This does not authorize genuine hosted property acceptance. All72 cases remain
NOT RUN;mapping-only/report-lease review,exact synthetic fixtures/features and
owner-assisted existing-factor MFA require their own approvals. Adapters stay
unwired and media stays503. No broad financial customer grant may substitute.

## Containment and partial completion

These are two separate migrations,not a guaranteed all-or-nothing bundle. If readiness
succeeds and cleanup fails,stop,record actual history (potentially12),inspect catalog,
locks and gates read-only,and obtain exact recovery approval. Do not rerun automatically,
reverse the first migration,drop the access table or alter history. A client timeout
is not proof that a server operation was canceled;verify history/state independently.

With feature/mapping/lease rows absent,the prepared wrappers remain fail-closed. Keep
them off;preserve immutable reports,financial records and audit history. Unexpected
rows/access/schema state require stop and owner review,not unapproved UPDATE/DELETE/
REVOKE/termination or an improvised repair. Index restoration or wrapper containment
DDL would require a separately reviewed forward operation and owner authorization.

No migration,feature/lease/mapping/fixture/grant,provider credential/call,media,
Netlify repair/deployment,external message,payroll,production or merge occurred.
Release1.0 remains **NOT READY / NOT AUTHORIZED**;the frozen blocked deployment is intact.

Current fresh checks:68 native PASS;generated types/migration/proposal integrity and
formatting pass. Application/SQL are unchanged from7e472b7,whose broader regression
record remains708 local PASS/49 native-only skips,339 native PASS,63 browser PASS and
four GitHub checks PASS. Those full suites were not newly rerun for this documentation-
only preflight;counts overlap and are not hosted acceptance.

Smallest next owner decision: approve the exact two-file dormant development
operation and supervised maintenance window. No execution follows from technical GO.

References: [CLI dry run](https://supabase.com/docs/reference/cli/supabase-db-push),
[credential custody](https://supabase.com/docs/reference/cli/supabase-login),
[PostgreSQL DROP INDEX](https://www.postgresql.org/docs/17/sql-dropindex.html).
The current Supabase changelog was checked;the announced TLS cipher retirement
on November10 does not require changing this Node24/CLI preflight configuration.
