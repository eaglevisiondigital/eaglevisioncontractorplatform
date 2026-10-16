# Propel Contractor Suite by Eagle Vision · Action B

**PARTIALLY EXECUTED — COMPANY SETUP PASS; FULL ACCEPTANCE NOT RUN.**
October 16, 2026. The separately approved narrow C1 bootstrap unblocked the checked
platform setup. It was revoked immediately afterward. Broader Action C and Action D
remain unapproved; Release 1.0 remains closed and PR #1 draft/unmerged.

Latest continuation: fresh owner MFA is pending (0/3). Real GET-only preflight
56 PASS/0 FAIL; prepared core scenario 687 LOCAL contract cases PASS, nine groups
BLOCKED; hosted authenticated scenario NOT RUN. No additional tenant records were
written. See ACTION_B_CONNECTED_RESULT.md for the exact current handoff and limits.
Counts below remain the completed C1 platform setup totals.

## Exact created counts

| Record                                                                           |       Created | Final hosted state                                                                  |
| -------------------------------------------------------------------------------- | ------------: | ----------------------------------------------------------------------------------- |
| Organizations                                                                    |             3 | Straight Edge Property Services; Cunningham Construction; Sample Roofing Contractor |
| Owner memberships                                                                |             3 | One intended existing owner per company; active                                     |
| Other staff/customer permissions                                                 |             0 | Remaining Action B roles not assigned                                               |
| Company settings / module rows                                                   |        3 / 27 | Internal pilot configuration; contracts/invoices/payments OFF                       |
| Platform / tenant audit events                                                   |        6 / 66 | Checked setup and existing append-only triggers                                     |
| CRM/properties/requests/estimates/materials/jobs/purchases/time/payroll fixtures |             0 | Subsequent domain acceptance NOT RUN                                                |
| Auth identities / factors                                                        | 0 new / 0 new | Existing 22 confirmed identities and four verified TOTP factors preserved           |
| C1 platform row                                                                  |             1 | Retained inactive; zero active grants and zero operator memberships/sessions        |
| Release-test / worker grants                                                     |         0 / 0 | Not approved                                                                        |

## Results

| Check                                                                  | Result  | Evidence / limit                                                                                                                                 |
| ---------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Checked platform provisioning/configuration                            | PASS    | Six normal-authenticated RPC successes, three intended owners, active pilot state verified                                                       |
| Genuine operator AAL2                                                  | PASS    | Current confirmed identity/verified claims/factor and sole fresh hosted session matched the private roster                                       |
| Temporary platform cleanup                                             | PASS    | Exact reviewed deactivation; same AAL2 platform_access=false and company_metrics 42501 before logout; independent inactive-row/zero-session read |
| Existing Auth/factors/migrations                                       | PASS    | Full identity/factor fingerprints unchanged; same nine versions; no Auth/API change                                                              |
| RLS/private table access/module gates                                  | PASS    | 63/63 RLS, zero private client table privileges, financial modules disabled                                                                      |
| Cross-tenant positives/negatives and operator tenant-data denial       | NOT RUN | Requires actual tenant domain fixtures and current owner/member sessions; setup alone is insufficient                                            |
| Employee roles, membership revocation and concurrency                  | NOT RUN | Only the three initial owner memberships exist                                                                                                   |
| Financial arithmetic, immutable snapshots and detailed audit integrity | NOT RUN | No connected domain records; local test history is not hosted evidence                                                                           |
| Document/Storage positive ingestion and extraction                     | BLOCKED | Scanner, isolated worker, byte transport and approved AI remain unavailable                                                                      |
| Internal customer release workflows                                    | BLOCKED | Separate private environment/test authorization remains unapproved                                                                               |
| Protected Netlify deployment                                           | NOT RUN | Action D not approved                                                                                                                            |

No C1 acceptance assertion failed. The six setup RPC successes and two explicit
post-revocation denials passed; this is not full Action B tenant/domain acceptance.
See ACTION_C1_EXECUTION.md for exact timestamps, advisor findings and private
evidence boundaries. Security advisor has one leaked-password-protection warning;
no remediation was silently applied. Existing four RLS performance warnings remain.

## Next authorized continuation

Preserve the three companies and the existing private mapping. Do not provision
again or rerun the bootstrap: its INSERT rejects the retained inactive grant row.
Use the existing company owners with fresh genuine owner-assisted MFA to establish
remaining tenant roles through checked membership/invitation workflows and run the
already-approved synthetic domain fixtures. Accounts/factors must not be recreated
or reset. Keep scanner/private-release cases BLOCKED and Action D NOT RUN until
separately authorized. Never use service-role/SQL domain writes to bypass controls.

Historical note: the initial Action B attempt stopped with zero companies because
it lacked the then-unapproved platform bootstrap. C1 approval/execution supersedes
that blocker for setup only; it does not expand the continuing scope or privileges.
No deployment, external communication, live signature/payment/payroll execution,
production change, outside access or merge occurred.
