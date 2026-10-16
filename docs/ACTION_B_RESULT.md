# Propel Contractor Suite by Eagle Vision · Action B

**AUTHORIZED; BLOCKED BEFORE HOSTED WRITES.** The owner approved Action B only.
Action A remains complete. Actions C and D are not approved. Release 1.0 remains
closed and NOT READY / NOT AUTHORIZED; PR #1 remains draft/unmerged.

## Exact created counts

| Record type                             | Created this action |                               Hosted total at stop |
| --------------------------------------- | ------------------: | -------------------------------------------------: |
| Organizations                           |      0 of 3 planned |                                                  0 |
| Memberships / employee roles            |                   0 |                                                  0 |
| Synthetic domain test records           |                   0 |                        No fixture writes attempted |
| Auth identities                         |                   0 |                          22 confirmed nonanonymous |
| Verified TOTP factors                   |               0 new | 4 existing, one per designated privileged identity |
| Platform / release-test / worker grants |           0 / 0 / 0 |                                          0 / 0 / 0 |

No CRM, property, request, estimate, material, job, purchase, time or payroll-
preparation record was created. No new login/MFA challenge was necessary to
identify the deterministic missing-grant prerequisite; hosted sessions remain zero.

## Results — distinguish checks from authenticated acceptance

| Check                                              | Result  | Evidence / limit                                                                                                                                            |
| -------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Designated development target                      | PASS    | Read-only project details match the approved target; healthy PostgreSQL 17.11                                                                               |
| Existing identities                                | PASS    | 22 confirmed nonanonymous users; no creation/reset invoked                                                                                                  |
| Existing MFA factors                               | PASS    | Each designated privileged alias has one verified TOTP; zero pending factors                                                                                |
| Application RLS / private table access             | PASS    | 63/63 tables retain RLS; zero private tables with client DML/read privileges                                                                                |
| Checked provisioning entrypoint                    | PASS    | Hosted public wrapper remains invoker and calls the private checked function                                                                                |
| Required platform authority                        | BLOCKED | Hosted provision_company requires is_platform_admin; its predicate requires signed AAL2 AND an active private.platform_admins row; there are zero such rows |
| Public Auth restrictions                           | PASS    | Real settings endpoint: signup disabled, email enabled, phone disabled; no setting changed                                                                  |
| Migration history / bundle                         | PASS    | Exactly the same nine hosted versions; local reviewed bundle checksum matches                                                                               |
| Authenticated PostgREST/RPC workflow tests         | NOT RUN | Stopped at the grant prerequisite, without provisioning or a service-role bypass                                                                            |
| Tenant positives/negatives, roles/revocation       | NOT RUN | Require genuine company/member fixtures; empty tables cannot prove isolation                                                                                |
| Financial calculations / immutable records / audit | NOT RUN | No connected domain fixtures; earlier local tests are not hosted acceptance                                                                                 |
| Secure document ingestion / source positives       | BLOCKED | Approved scanner, isolated worker, byte transport and AI infrastructure remain unavailable; ingestion stays disabled                                        |
| Internal customer release workflows                | BLOCKED | Exact private release-environment/test grants need separate Action C review; real signature execution remains excluded                                      |
| Protected Netlify deployment                       | NOT RUN | Action D is not approved                                                                                                                                    |

No authenticated acceptance cases passed or failed in this run: **0 PASS / 0 FAIL;
NOT RUN due to the provisioning blocker.** The read-only PASS rows above are
prerequisite checks, not a full tenant/security certification. No discovered test
failure is hidden as BLOCKED; the blocker is missing authorized infrastructure
permission. No hosted writes or authorization changes were attempted.

## Why provisioning stopped

`public.provision_company` retains the real caller through its invoker wrapper.
`private.provision_company` raises SQLSTATE 42501 when the current caller fails
`private.is_platform_admin()`. Genuine AAL2 alone is insufficient: the latter also
requires an active row in `private.platform_admins` for the authenticated operator.
The plan explicitly assigns that bootstrap to Action C. Action B approval does not
authorize it. Do not insert organizations/memberships directly, use an Auth Admin
key as a domain caller, fabricate claims or bypass this gate through SQL.

## Recommended next action

Review and separately authorize a narrowly scoped Action C platform bootstrap for
the existing platform-only operator. Keep its exact UID in the ignored private
mapping, give it no company membership, define the operator-enforced expiry and
revocation procedure (the current table has no native expiry), and validate the
exact proposed row before applying it. Do not infer approval for the additional
release-test/environment or worker grants from a platform-only bootstrap.

Then resume the already-authorized Action B with a fresh genuine owner-assisted
operator AAL2 session and the checked provisioning/member/domain RPCs. Recheck that
no companies were created before retrying; create exactly three, never duplicates.
Full imports/internal customer workflows may remain explicitly BLOCKED until their
separate infrastructure/grants exist. No Action D deployment, outside access,
messages, real signatures/payments, payroll execution or production change is
permitted by this result.
