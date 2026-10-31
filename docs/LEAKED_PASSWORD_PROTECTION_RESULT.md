# Propel Contractor Suite · development leaked-password protection

**COMPLETE · October 16, 2026.** Owner-approved Auth option only. Release 1.0 remains
NOT READY / NOT AUTHORIZED; draft PR #1 remains unmerged and outside access closed.

## Exact operation and saved verification

- Verified the privately pinned owner-designated development project and current
  configuration before execution; native protection is supported by its Pro plan.
- At **09:42:55 UTC**, completed official Management API Auth PATCH with exactly
  `{ "password_hibp_enabled": true }`. No other setting was submitted.
- Independent post-write Auth GET confirmed **enabled=true**, with exactly one
  changed key: `password_hibp_enabled`. All other **242 returned Auth settings**
  match their pre-write canonical fingerprint. Public signup stays disabled;
  existing MFA, identity requirements and redirect restrictions are unchanged.
- Independent PostgREST GET matches its entire pre-write fingerprint; exposed
  schemas remain public-only. No API/grant/schema change.
- Credentials and raw configurations stayed in memory. Private evidence contains
  hashes/status only under ignored `.staging/`; no passwords, sessions, TOTP secrets,
  provider credentials or private infrastructure identifiers are committed.

## Independent preservation and advisor checks

At **09:46 UTC**, database read-only before/after equality checks all passed:
identity set, password verifiers, MFA factors, sessions, memberships, private
platform/release/worker authorizations, RLS flags, policies and table grants.
**22 original identities, four verified factors and zero sessions are preserved.**
No identity creation, password reset/screening, MFA reset or session operation ran.

Security advisors rerun after the saved change: **0 ERROR / 0 WARN / 12 INFO**.
The leaked-password finding is absent. Remaining informational findings are the
existing private tables with RLS enabled and no client policies, intentionally
default-deny; no policy change was made. See
[Supabase's notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Previous performance findings were not modified by this Auth-only action.

## Limits and next actions

Password-rejection behavior tests are **NOT RUN**: this approval excludes account,
password and session changes. Existing passwords were not submitted to a screening
service. This configuration/advisor result is not complete security certification.
No application/schema changes required product/browser regression runs; documentation
formatting, diff and unchanged migration-bundle checks are recorded with this change.

Continue separately reviewed blocked scanner/private-release acceptance and protected
deployment planning. No broader grant, provider connection, real communication,
payment/signature/payroll execution, deployment, production change or merge occurred.
A clean independently validated production database and explicit launch approval
remain mandatory. Historical Action B results remain 723 authenticated PASS / 0 FAIL;
its blocked and NOT RUN groups are unchanged.

Official references:
[Auth configuration API](https://supabase.com/docs/reference/api/v1-update-auth-service-config),
[native password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
