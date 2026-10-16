# Propel Contractor Suite · C1 execution checkpoint

**EXECUTION AUTHORIZED; WAITING FOR FRESH OWNER-ASSISTED AAL2.**
The owner explicitly approved operation
`37cc9657fd57aef122d96d4fb1156e5ebfdc012ad7f361fdb114e34073401b3d`
for the designated internal development project. Do not ask for the same approval
again. The approved one-row grant and exact-UID revocation SQL are unchanged.
The earlier preparation-only status in ACTION_C1_REVIEW.md is historical; its
scope, five-minute session-freshness guard and 30-minute maximum remain binding.

## Verified before activation

- Exact operator UID/email and all 22 Auth UIDs match the private Action A roster.
- Four intended privileged identities remain confirmed/nonanonymous. Four verified
  TOTP factors remain; zero pending factors. Private identity/factor fingerprints
  were captured for final comparison without exporting secrets or identifiers.
- Zero platform/release-test/worker grants, organizations and memberships.
- Original nine migration versions and reviewed checksum match. Saved signup/email/
  phone restrictions, private RLS/client privileges and platform predicates match.
- Primary database bootstrap/revocation authority and independent official CLI
  cleanup channel both verified read-only. No service-role domain client is used.
- Private SQL hashes, target binding, scope digest and file permissions match the
  approved operation. Approval is recorded under ignored `.staging/c1-execution/`.

## Human authentication handoff

A private loopback-only form challenges the existing operator factor. Passwords
are retrieved through Keychain into process memory; authenticated tokens remain
only in the local server's memory, not browser storage or files. There is no
factor-enrollment/reset endpoint and no browser-exposed platform provisioning API.
The supervising agent controls approved fixed RPCs over a private Unix socket.

The first password sign-in waited past the reviewed five-minute freshness limit
before owner code entry. It was signed out globally and independently verified:
zero Auth sessions and zero platform rows; no grant transaction ran. That
closed authentication-only record is preserved privately. The local page was
reset to fresh Keychain sign-in; the owner must click sign-in when ready, enter the
current existing-factor code, verify, and promptly signal the supervising agent.
No new execution approval is required for this fresh authentication continuation.

Current baseline at the reset: **22 identities, four verified TOTP factors,
zero sessions, zero platform grants, zero companies and zero memberships**.
Grant activation, provisioning, grant revocation and same-AAL2 post-revocation
verification remain **NOT RUN**. No connected domain acceptance is claimed.

## Execution controls already prepared

After owner code verification, the agent must match fresh real Auth getUser,
verified claims/AAL2 and the exact sole hosted session against the private roster,
then repeat the no-drift checks before activation. Start the fixed 30-minute
window immediately before the exact approved grant; never reset it on retry.

The fixed normal-authenticated application plan provisions exactly three companies
and their intended existing owner accounts through provision_company, then checked
configure_company for active pilot status and internal CRM/intake/team/settings/
documents/estimates only. Contracts/invoices/payments remain disabled. No operator
membership or additional private grant is created. Each response/state is verified;
no ambiguous provisioning call is retried.

The helper attempts the exact approved CLI revocation immediately after the third
company's platform setup, on any error, or at the fixed deadline. An in-process
watchdog is supplemental, not guaranteed database expiry. The supervising agent
must remain available with the independent database channel and verify actual
inactive grant state, same-AAL2 platform/metrics denial, global operator sign-out,
zero sessions and unchanged identity/factor fingerprints. No activation is allowed
without continuous supervision and available cleanup channels.

The existing grant table still has no TTL. Broader Action C grants and Action D
remain unapproved. Scanner/import positives and full three-company role/domain
acceptance remain separate dependencies. No external messaging, real signatures,
financial/payroll execution, deployment, outside access or merge is authorized.
