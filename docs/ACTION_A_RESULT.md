# Action A result · October 16, 2026

**ACTION A COMPLETE: 22 IDENTITIES; 4/4 GENUINE TOTP VERIFIED.** Exactly 22 synthetic
Supabase Auth identities were created under the owner's Action A authorization.
No company, membership, tenant permission, private grant or deployment was created.
Release 1.0 remains closed and NOT READY / NOT AUTHORIZED; PR #1 stays draft/unmerged.

| Check                                      | Verified result                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Approved roster                            | 22 distinct identities: 7 × 3 companies plus platform-only operator                                     |
| Auth creation                              | 22/22 successful Auth Admin createUser calls, email_confirm=true, non-deliverable .test emails, no mail |
| Independent verification                   | Auth Admin listUsers exact UID set/confirmed status; hosted SQL: 22 confirmed nonanonymous users        |
| Password persistence                       | 22 existing encrypted Keychain records; four credentials retrieved only in memory for genuine login     |
| MFA enrollment/verification                | 4/4 genuine owner-assisted TOTP factors verified; no pending factors                                    |
| Sessions                                   | 0 remaining; all four genuine password/MFA sessions signed out                                          |
| Companies/memberships                      | 0/0                                                                                                     |
| Platform/release/workload grants           | 0/0/0                                                                                                   |
| Public signup                              | Remains disabled; actual settings endpoint: HTTP 200 / disable_signup=true                              |
| Phone provider                             | Remains disabled; email provider remains enabled                                                        |
| Deployment/payments/messages/payroll/merge | None performed                                                                                          |

## Secure handling and corrected first attempt

The initial zero-account stop was caused by a parsing bug in the local operator
helper: string-only JSON casting received boolean/null roster fields. The earlier
report incorrectly treated this as evidence that Keychain was unavailable. That
assessment is superseded. No identity was created during the first attempt.

The helper now decodes a typed credential structure safely, receives only alias/
email/password fields and rejects malformed input without crashing. Validation-only
checks passed for the 22-entry mixed-metadata roster and a malformed fixture before
retrying. A fresh hosted zero-user/company/grant check and inspection of the stopped
private record preceded the controlled retry. The old record was archived, not
silently replaced. Do not blindly rerun creation now: the 22 accounts already exist.

Generated unique random passwords were persisted through native Security.framework
with UI prompts disabled before any Auth creation. Passwords crossed stdin only,
never argv/environment/logs/plaintext files. No broad Keychain application-access
exception was added. The existing Auth Admin key was read through the official
Supabase CLI into process memory, not printed/persisted; no API key was created.
Creation used the real Auth Admin API with email_confirm=true, not signup/invite/
magic-link mail, SQL Auth mocks or role metadata. Confirmation is internal synthetic
attestation, not independent proof of a real person's identity.

## Genuine owner-assisted MFA results

The owner used an independent authenticator to scan each real Supabase enrollment
QR and entered its current code directly in the local interface. The existing
`src/Mfa.tsx` component performed `enroll` and `challengeAndVerify`; it was not
modified. No identity was created, replaced, reset or assigned permissions.

| Account                                              | Real AAL2 | Intended confirmed nonanonymous identity | Verified TOTP |
| ---------------------------------------------------- | --------- | ---------------------------------------- | ------------- |
| Straight Edge test owner (`pilot-1-owner`)           | PASS      | PASS                                     | 1             |
| Cunningham test owner (`pilot-2-owner`)              | PASS      | PASS                                     | 1             |
| Sample Roofing test owner (`pilot-3-owner`)          | PASS      | PASS                                     | 1             |
| Eagle Vision platform operator (`platform-operator`) | PASS      | PASS                                     | 1             |

For every account, verification used fresh real Auth `getUser`, signature-verified
`getClaims`, `getAuthenticatorAssuranceLevel` and `listFactors`, matching the
intended existing UID/email against the private roster. The accepted session had
signed AAL2 and one verified TOTP factor. Each account first completed real password
login at AAL1 with the confirmed intended identity; `platform_access` returned false.
Because no platform grant exists, that denial does not independently isolate the
MFA requirement from the missing-grant requirement. No authenticated tenant/workflow
acceptance is inferred from this enrollment evidence.

Independent hosted SQL confirms 22 confirmed nonanonymous users, exactly four
verified TOTP factors (one per designated identity), zero pending factors and zero
remaining Auth sessions. Companies, memberships, platform grants, release-test
grants and worker grants remain zero. All 63 application tables retain RLS; private
table client privileges remain zero. Public signup remains disabled; email remains
enabled and phone disabled. No Auth/API configuration was changed during enrollment.

## Credential, session and interface handling

The existing passwords were retrieved through the native macOS Keychain command
with stdout captured only in the local helper's memory pipe. They were never
printed, logged, placed in command arguments, exported to a file or sent to the
browser. The publishable-client password login went directly to the approved
Supabase Auth target. The temporary interface bound only to loopback and enforced
exact Host/Origin, no-store responses and denied private file access. Negative
checks returned 404 for the private roster and 403 for an originless sign-in POST.
Only genuine local sessions reached the browser; each was signed out after owner
verification. The temporary interface was then closed and its process stopped.

No QR/seed, password, OTP or session token entered Git, GitHub, screenshots, logs or
test reports. Status-only private evidence is ignored
`.staging/action-a/mfa-results.json`; existing UID mapping remains in
`.staging/action-a/identities.json`. Credentials remain in Keychain service
**Eagle Vision Contractor Acceptance Development**, labels
**EV synthetic development: <alias>**. The private helper now refuses to start again
when all four MFA results are complete. Future authentication must challenge the
existing verified factor with actual owner participation, not re-enroll or extract
an authenticator seed.

## Remaining gates

Action A is complete. Actions B/C/D (company fixtures, private grants and protected
deployment) remain separately unapproved and untouched. Full three-company tenant,
role, revocation, PostgREST/Storage and domain workflow acceptance is still pending.
Release 1.0 stays closed and NOT READY / NOT AUTHORIZED. PR #1 remains draft/unmerged.
