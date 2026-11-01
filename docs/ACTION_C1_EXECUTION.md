# Propel Contractor Suite · C1 execution result

**COMPLETE — GRANT REVOKED AND OPERATOR SIGNED OUT.** October 16, 2026.
The owner-approved operation
`37cc9657fd57aef122d96d4fb1156e5ebfdc012ad7f361fdb114e34073401b3d`
was executed once against the designated internal development database. Broader
Action C grants, Action D and launch remain unapproved. Continue draft PR #1.

## Execution and exact counts

The supervised window began **08:46:00.308 UTC** (03:46:00.308 America/Chicago),
with an absolute 09:16:00.308 UTC deadline. Activation was read back at
08:46:03.376 UTC. Cleanup completed at **08:46:40.204 UTC**, about 40 seconds
after the window began, immediately after the third company's configuration.
There is no database TTL; actual revocation was executed and independently read.

| Created record                                         | Count | Final state                                                                                                 |
| ------------------------------------------------------ | ----: | ----------------------------------------------------------------------------------------------------------- |
| Organizations                                          |     3 | Straight Edge Property Services; Cunningham Construction; Sample Roofing Contractor; active internal pilots |
| Memberships                                            |     3 | One existing designated owner per company; no operator membership                                           |
| Company settings                                       |     3 | Initialized by existing provisioning trigger                                                                |
| Module settings                                        |    27 | Six internal modules enabled per company; contracts/invoices/payments disabled                              |
| Platform audit events                                  |     6 | Three organization.provisioned and three organization.configured                                            |
| Tenant activity events                                 |    66 | 36 inserts and 30 updates from checked setup/triggers                                                       |
| Temporary platform authorization                       |     1 | Retained, inactive; zero active platform authorizations                                                     |
| Auth identities / MFA factors                          | 0 new | Existing 22 identities and four verified TOTP factors unchanged                                             |
| CRM/material/job/purchase/time/payroll domain fixtures |     0 | NOT RUN in C1; subsequent Action B work                                                                     |
| Other private authorizations                           |     0 | No release-test or material-worker grant                                                                    |

The pre-existing disabled release-environment singleton was not created or enabled
by C1. No migrations, Auth/API settings, RLS policies or table grants changed.

## Verified results

| Check                                                   | Result  | Evidence / limit                                                                                                                                                             |
| ------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact target/operator/SQL                               | PASS    | Private roster UID/email, concrete SQL hashes and owner-approved operation binding match; target healthy PostgreSQL 17.11                                                    |
| Reviewed baseline                                       | PASS    | Same nine migration versions; zero company/member/platform/release-test/worker rows before activation                                                                        |
| Existing identity/factor preservation                   | PASS    | Full UID/email and factor-ID/user-ID fingerprints match before/after; 22 users, four verified TOTP, zero pending                                                             |
| Fresh genuine MFA/session                               | PASS    | Owner entered existing User 4 code; real Auth getUser/getClaims/AAL2 and factor checks match exact sole hosted AAL2 session, created within five minutes                     |
| Independent cleanup availability                        | PASS    | Separate official CLI UPDATE authority verified before activation; exact reviewed revocation executed through that channel                                                   |
| Exact grant read-back                                   | PASS    | Exactly one active approved operator row; zero operator memberships and no other private grants                                                                              |
| Checked company workflows                               | PASS    | Six successful normal-authenticated RPCs: three provision_company and three configure_company; returned organization state independently matches intended owners/status/plan |
| Platform authority                                      | PASS    | Genuine caller platform_access=true before each provisioning operation; no service-role application client                                                                   |
| Immediate revocation                                    | PASS    | Exact reviewed SQL retained the row inactive; independent database read confirms zero active platform rows                                                                   |
| Same-session revocation checks                          | PASS    | Before logout, previous genuine AAL2 caller platform_access=false and company_metrics denied with SQLSTATE 42501                                                             |
| Session closure                                         | PASS    | Global operator sign-out succeeded; local session cleared and independent auth.sessions count for operator is zero; helper stopped                                           |
| RLS/private privileges/financial gates                  | PASS    | All 63 application tables retain RLS; zero private client table privileges; zero enabled contracts/invoices/payments modules                                                 |
| Full tenant/role/revocation/domain/financial acceptance | NOT RUN | C1 setup does not prove connected customer-data isolation; requires current company-owner sessions, remaining memberships and domain fixtures                                |
| Scanned document processing                             | BLOCKED | Approved scanner, isolated worker, byte transport and AI infrastructure unavailable; ingestion remains disabled                                                              |
| Internal customer release workflows                     | BLOCKED | Additional exact private environment/test grants require separate review/approval                                                                                            |
| Protected deployment                                    | NOT RUN | Action D not approved; no Netlify changes                                                                                                                                    |

No failed acceptance assertion occurred in the executed C1 checks. Two earlier
owner-authentication waits exceeded the reviewed session-age limit and were signed
out without activation. Their closed private evidence is retained; the freshness
guard was not weakened. No code, seed, QR, password or JWT is in public evidence.
The six setup RPC successes and two explicit post-revocation denials are genuine
hosted evidence, not local SQL mocks or complete Action B certification.

## Advisors and remaining findings

Post-execution security advisor: 12 informational private-table/no-policy findings
(expected default-deny private tables) and one warning: leaked-password protection
disabled. No automatic settings remediation is authorized by C1. Review the feature
and project availability separately; retain the strong synthetic Keychain passwords.
[Password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance advisor: four existing per-row Auth/RLS warnings, 21 unindexed foreign
keys, 65 unused indexes and one absolute Auth-connection allocation notice. These
are findings for independent review, not permission to alter historical migrations
or remove tenant indexes based on an almost-empty development database.
[RLS performance guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
[foreign-key index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Continuation

Do not rerun the bootstrap or duplicate the three organizations. The reviewed
INSERT deliberately rejects the retained inactive row. Keep the private IDs in
ignored execution evidence; use the existing company owners with fresh genuine
MFA for the already-approved Action B membership and domain workflows. Owner
participation is required for their current codes. Test positive and negative
PostgREST/role/revocation/immutability/financial cases before claiming acceptance.
Scanner-dependent cases and private internal-release cases stay explicitly BLOCKED;
Action D stays unapproved. Netlify protection and the original nine migrations are
preserved. Release 1.0 remains NOT READY / NOT AUTHORIZED and PR #1 draft/unmerged.

## Local continuity validation

After recording the hosted result, npm run check passed: lint, strict types,
generated-type comparison, unchanged nine-file migration bundle, 375 tests passed
and nine native-only cases skipped, plus local production build. Formatting and
git diff checks passed. No application/SQL/UI implementation changed; the native
PostgreSQL and browser suites were not rerun for this documentation-only checkpoint.
Those local tests are distinct from the hosted C1 evidence above. Private execution
and independent verification evidence remain ignored with restrictive permissions.

Subsequent Action B update: the three owners completed fresh genuine MFA; 723
actual authenticated core/supplemental cases passed and all sessions are closed.
C1 remains inactive and must not be replayed. The fixture counts above describe
C1 only; current domain/member inventory, blocked groups and security findings
are in ACTION_B_CONNECTED_RESULT.md. Broader private grants/deployment remain
unapproved; Release 1.0 is still closed.
