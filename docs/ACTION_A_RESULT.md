# Action A attempt · October16, 2026

**STOPPED BEFORE IDENTITY CREATION.** Owner authorized exactly22 synthetic Auth
identities and genuine owner-assisted TOTP for the three owners/platform operator.
The authorization excludes companies, memberships/tenant permissions, private
grants, deployments and execution. Existing authorization remains valid; this is
an operational credential-storage blocker, not a request to repeat that approval.

## Verified results

| Check                                         | Result                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Approved alias roster                         | 22 distinct planned identities;4 require TOTP                                                    |
| Auth Admin access                             | PASS, actual read-only listUsers returned0 users                                                 |
| Public signup restriction                     | PASS, actual settings endpoint disable_signup=true                                               |
| Secure password persistence                   | STOP: noninteractive macOS Keychain storage did not complete; metadata-only query found0 records |
| Auth identities created                       | 0 of22; no identity creation succeeded                                                           |
| Genuine TOTP factors enrolled/verified        | 0 of4; owner interaction has not begun                                                           |
| Sessions/companies/memberships/private grants | All remain0 in post-attempt hosted SQL verification                                              |
| Deployment/payments/messages/payroll/merge    | None performed                                                                                   |

The operator attempted secure native Keychain persistence with UI prompts disabled,
before any hosted creation. Passwords existed only in process memory and were
passed to the helper over stdin; no plaintext password file, command-line argument,
log or public artifact was written. The stored Supabase management credential was
used through the official CLI; the existing Auth Admin key remained in process
memory and was neither printed nor persisted. No new API key was created.

After the provisioning preflight stopped, diagnostics were read-only: CLI record
field names/labels, actual Auth Admin user count and Keychain attributes/count only.
No password was read back, no Keychain prompt was operated, and no hosted creation
was retried. The original helper's detailed OS write error was not retained, so do
not assert a specific Keychain failure cause. Its metadata query returned item-not-
found, not a stored-password result. The failed preflight generated no Auth changes.

## Required next step

Provide/configure an approved working operator credential store before retrying
Action A. The current method failed safely; do not replace it with plaintext .env/
JSON credentials, passwords in command arguments or public CI secrets. An owner
may need to unlock/authorize Keychain or choose another approved secret manager.
Confirm storage succeeds before any account creation; inspect the ignored stopped
run record and recheck Auth users0 before an explicitly controlled retry. Never
blindly rerun a stopped creation script or replace existing accounts.

Then create the22 confirmed .test identities through Auth Admin createUser without
mail, independently verify the exact roster, and STOP for human authenticator
scanning/challenge verification when needed. Do not invent MFA/AAL2 or claim that
email_confirm=true independently proves real-world identity; these are explicitly
synthetic internally attested test accounts. TOTP QR seeds must never enter evidence.

Private operational code/evidence resides under ignored `.staging/action-a/`;
there are no credentials in this public document. Release1.0 remains closed and
NOT READY / NOT AUTHORIZED. ActionsB/C/D are still unapproved and untouched.
