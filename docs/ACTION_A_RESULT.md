# Action A result · October 16, 2026

**IDENTITIES COMPLETE; STOPPED FOR OWNER-ASSISTED TOTP.** Exactly 22 synthetic
Supabase Auth identities were created under the owner's Action A authorization.
No company, membership, tenant permission, private grant or deployment was created.
Release 1.0 remains closed and NOT READY / NOT AUTHORIZED; PR #1 stays draft/unmerged.

| Check                                      | Verified result                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Approved roster                            | 22 distinct identities: 7 × 3 companies plus platform-only operator                                     |
| Auth creation                              | 22/22 successful Auth Admin createUser calls, email_confirm=true, non-deliverable .test emails, no mail |
| Independent verification                   | Auth Admin listUsers exact UID set/confirmed status; hosted SQL: 22 confirmed nonanonymous users        |
| Password persistence                       | 22 encrypted macOS Keychain records; metadata-only count verification; no password read-back            |
| MFA enrollment/verification                | 0/4; STOP before human QR scanning/challenge verification                                               |
| Sessions                                   | 0; no password login or fabricated JWT used                                                             |
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

## Owner handoff — human interaction required

Four existing accounts require genuine TOTP:

- platform-operator
- pilot-1-owner (Straight Edge test owner)
- pilot-2-owner (Cunningham test owner)
- pilot-3-owner (roofing test owner)

Passwords are in macOS Keychain service **Eagle Vision Contractor Acceptance
Development**, labeled **EV synthetic development: <alias>**. The private email/UID
mapping is ignored `.staging/action-a/identities.json`. No password is in that file.
Owner access to a stored password may require normal Keychain authentication.

When the owner is ready, use the connected local MFA component with the actual
existing identity, perform password login, record the AAL1 denial, enroll TOTP,
have the owner scan into an independent authenticator and enter its current code
for challengeAndVerify. Verify server-returned AAL2 and fresh getUser identity;
record only status/evidence references. No QR seed screenshots, mocked factors,
hardcoded OTPs or JWT claims. Stop again on any required owner authentication.
No MFA factors or sessions were created in this run because human participation
is required at that stage. Do not report MFA verified until all four genuinely pass.

Action A authorization remains valid for that continuation. Actions B/C/D (company
fixtures, private grants and deployment) remain separately unapproved. Existing
Auth/API/MFA settings and private Storage policies must be preserved. No outside
person receives any account or access.
