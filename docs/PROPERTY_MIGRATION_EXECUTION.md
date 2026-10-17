# Property operations migration · development execution

**APPLIED ONCE / VERIFIED / ALL PROPERTY FEATURES DISABLED.** October16,2026,
America/Chicago. Owner approval referenced `d9836b4` and the exact file/bundle below.
Release1.0 remains **NOT READY / NOT AUTHORIZED**. PR#1 stays draft/unmerged.

## Authorized operation and exact result

| Item                              | Evidence                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| Migration                         | `20261017005322_property_operations.sql`                                                 |
| File SHA-256                      | `c345bdf178c9339dba7ba2707c74233bcfae9a2d2b59abf148f4b7ffff35780c`                       |
| Approved one-file bundle SHA-256  | `0fadce830aa3c08ecfd9b715f282272687eee845a0fc6ce635fad3a5a7190fe9`                       |
| Full eleven-file canonical bundle | `15a2b9c67766564e91efe7cf3347a7138a10b1a722a5d295ce1f7f3613a2f17e`                       |
| Final CLI2.121.0 dry run          | PASS;exit0;5.029seconds;exactly one file;seeds[];roles[];skip-vault                      |
| Apply                             | PASS;exit0;8.159seconds;one attempt;no timeout or retry                                  |
| Hosted history                    | 11 entries;original10 records/statements unchanged                                       |
| New history contents              | 50 stored statements match approved SQL tokens, preserving quoted/dollar-quoted contents |

Only the existing approved development target was used, freshly verified through
connected metadata and authenticated Management GET. The pinned CLI applied:

```text
supabase db push --skip-vault --project-ref <approved-development-target> --yes
```

The automatic confirmation implements the owner's explicit exact execution approval;
it does not widen the scope. All11 local SQL files and canonical bundle hashes were
checked immediately beforehand. No include-all/seed/role flags, Vault update,
repair/reset, application provisioning or additional migration was used. Approved
Keychain credential stayed in process memory and a child environment; no credential
was printed or persisted in a new file. Raw target/log/data evidence stays ignored
under `.staging/property-execution/`, with restricted file permissions.

## Preflight and post-install verification

Preflight matched10 historical files/hosted history,468 catalog fingerprints,
69 column ACLs and24 default-privilege records. A local comparison initially failed
because a six-record application-only query was compared to the24-record whole-DB
baseline. Execution stopped; a corrected read-only full-scope query matched all24,
with zero ACL changes. A separate private wrapper field-name mismatch also stopped
locally before invoking the CLI; it was corrected against the verified evidence.
Neither guard failure caused a hosted write or an extra dry-run/apply attempt.

Post-install catalog has **500 fingerprints**, exactly matching the independently
reconstructed native PostgreSQL17 schema. Changes are the approved eight private
tables/eight functions and supporting indexes/triggers. Existing service_locations,
job_expenses and job_change_orders gain the reviewed composite indexes. No additional
object or permission drift was found.

| Verification                                                 | Actual result                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| New private tables                                           | 8 present;8 empty;RLS enabled on every table;no permissive policy                                                         |
| Tenant foreign keys                                          | 17 valid;tenant references include organization;zero missing covering FK indexes                                          |
| Client table privileges                                      | Zero SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for anon/authenticated/service_role                          |
| Private functions                                            | 8 fixed empty search paths;only3 checked entry points authenticated EXECUTE;helpers have none;anon/service_role have none |
| Existing column grants                                       | 69,unchanged                                                                                                              |
| Existing business data                                       | Count/content fingerprints identical across all79 existing public/private tables                                          |
| Generated public types                                       | Unchanged apart from one trailing blank line;no private property projection;local regeneration produces no diff           |
| Auth/API                                                     | Saved configuration hashes unchanged;signup/anonymous sign-in off;MFA,redirects and leak protection preserved             |
| HTTP perimeter                                               | Anonymous organization SELECT denied42501;private profile406/PGRST106;only public exposed                                 |
| Identities / verified TOTP / sessions                        | 22 /4 /0,unchanged                                                                                                        |
| Active platform grants / release grants / provider workloads | 0 /0 /0,unchanged                                                                                                         |
| Public Storage buckets                                       | 0,unchanged                                                                                                               |

All eight tenant-owned tables are private, default deny and empty. The existing
SECURITY DEFINER owner boundary intentionally bypasses ordinary RLS only through
checked commands; no FORCE-RLS or protection against a database owner disabling
triggers is claimed. Supabase real caller/session verification remains mandatory.
No hosted Auth mocks, forged JWTs, fixtures or temporary application grants were used.

## Advisors and remaining risk

Security: **0 WARN/ERROR;36 INFO**. The previous28 intentional private RLS-without-
policy entries gain8 for the new default-deny tables. Do not add permissive policies
to silence these findings.

Performance: **5 WARN;93 INFO**. Four existing auth-RLS initplan warnings remain.
One new duplicate-index warning identifies `location_customer_unique` and
`property_location_customer` on service_locations. This is present in the exact
approved SQL and tested schema, not an unreviewed post-install change. Both remain
in place; no cleanup/drop was authorized. It adds index maintenance/storage overhead,
not customer data access. A separately reviewed forward cleanup must check FK/index
dependencies before removing a redundant index; never edit the applied migration.
[Supabase duplicate-index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

INFO:21 existing unindexed FKs,71 unused indexes (previous57) and one absolute Auth
connection setting. All17 new FKs are indexed. Advisor findings are recorded, not
silently accepted as launch certification. Existing performance cleanup and independent
security/accounting validation remain separate gates.

## Regression evidence and acceptance limits

- `npm run check`: **672 PASS /43 native-only skips**;lint,strict types,generated
  public types,migration/proposal hashes and build PASS. Six new offline integrity
  tests deny missing evidence,feature activation,wrappers,extra migrations and
  changed applied SQL even if manifest hashes are recomputed.
- Native PostgreSQL17.11: **318 PASS /zero skips**;all43 native-only cases included,
  counts overlap. Includes47 property cases and10 actual property concurrency cases.
- Browser regression: **63 PASS** across desktop/tablet/mobile;isolated loopback preview only.
- Formatting PASS and26 frozen-artifact offline checks PASS;no network or deployment.

PASS: actual installation/catalog/grants/RLS/data/hash/type/Auth/API checks and
executed local/native regressions. FAIL: no unresolved executed application or
security-test failure; initial local guard mismatches are described above.
BLOCKED: connected wrappers/repository,approved feature/fixture scope,customer-report
authorization,scanner/Storage/transcoding/AI/media services and genuine supplemental
consent/invoice conversion. NOT RUN: genuine authenticated property workflow cases,
actual document/media processing,customer billing or provider execution. The migration
checks are not hosted cross-tenant application acceptance.

## Next package and preserved restrictions

[PROPERTY_CONNECTED_TEST_PLAN.md](PROPERTY_CONNECTED_TEST_PLAN.md) and
PROPERTY_CONNECTED_TEST_CASES.json prepare24 cases per company/72 planned executions,
all NOT RUN. They cover weekly/monthly inspections,damage/repair review,immutable
published reports,four suppliers,original/actual materials,returns/duplicates,
management unbilled decisions and nonpayable supplemental drafts. No fixtures were
written. Public wrapper design and connected repository must be reviewed before
future hosted testing. Report access must not silently enable unrelated existing
internal-release customer commands; assess a report-only authorization boundary.

No feature row,public RPC,customer mapping/test lease,worker grant,media upload/
playback,provider integration,customer invoice/payment,communications,payroll,
Netlify operation,production deployment,outside access or PR merge was enabled.
Property feature table remains empty; legal/financial modules stay disabled.
Historical SQL comments are frozen and may describe earlier pending approval;
this report/manifest are authoritative about the completed one-time execution.

Never replay/reset/repair the11-file history. Containment preserves reports,
financial decisions,drafts and audit history: keep features empty/off and no
public wrappers; any later activation/lease/EXECUTE revocation requires an exact
reviewed operation. Do not DROP/TRUNCATE data or mutate immutable financial evidence.
The smallest next scope is local review of the caller-preserving connected adapter/
report-only authorization package and the duplicate-index cleanup proposal; all
hosted activation or further migration execution still needs separate approval.
