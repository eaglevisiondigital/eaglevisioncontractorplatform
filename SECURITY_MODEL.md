# Security model and Phase 1 limitations

## Threats and authorization

Protect against guessed IDs, forged tenant selections, malicious user_metadata,
self-promotion, stale memberships, privilege escalation, unsafe uploads and forged
financial events. PostgreSQL RLS plus explicit grants enforce access independently
of React. Default API grants are revoked for application tables. Anonymous access
is denied. Owner/admin membership and all platform grants require signed JWT AAL2;
staff roles allow AAL1. The sign-in screen provides TOTP enrollment/verification.
Disable public signup and anonymous sign-in; reviewed provisioning is required.

Authorization checks live membership rows, so role revocation takes effect on the
next database statement. Tokens must still be validated by Auth at server entry;
user deletion alone does not revoke issued tokens. Before sensitive future
operations, require recent MFA/session validation, bounded JWT lifetime, revocation
and reauthentication policy. Never trust user_metadata for roles. A platform grant
does not confer membership or access to company customers, files or activity.

Internal membership and platform lookup functions are SECURITY DEFINER with empty
search_path, fully qualified names and narrow execute grants. They cannot mutate
anything. The public platform_access wrapper is SECURITY INVOKER. Trigger functions
have no client execute grant. Audit triggers atomically append action/entity/actor/
time, not customer payloads. Clients cannot forge, alter, delete or truncate audit
records. Database owners can alter triggers/schema: export to independently
controlled retention storage before claiming tamper resistance against operators.

## Permissions

| Operation                                       | Staff                  | Owner/admin AAL2                        | Platform AAL2             | Anonymous |
| ----------------------------------------------- | ---------------------- | --------------------------------------- | ------------------------- | --------- |
| Company profiles                                | Own company read       | Own company read/update selected fields | All company profiles read | Deny      |
| Membership list                                 | Own company read       | Own company read                        | Deny without membership   | Deny      |
| Customer/location/intake read/create/update     | Own company            | Own company                             | Deny without membership   | Deny      |
| Customer/location/intake delete                 | Deny                   | Own company                             | Deny without membership   | Deny      |
| Document metadata                               | Own company read       | Own company read                        | Deny without membership   | Deny      |
| Clean document object read                      | Own company            | Own company                             | Deny without membership   | Deny      |
| Upload/replace/delete or scan-status update     | Deny                   | Deny                                    | Deny                      | Deny      |
| Audit read                                      | Deny                   | Own company                             | Deny without membership   | Deny      |
| Grants, provisioning and merchant configuration | Reviewed operator only | Reviewed operator only                  | Reviewed operator only    | Deny      |

A user who separately holds platform and membership grants receives each permitted
scope. No automatic impersonation is implemented. Hard deletes are constrained by
references; production retention and archive workflows are future work.

## Files

The `company-documents` bucket is private, capped at 10 MiB, and restricted to PDF,
JPEG, PNG and WebP. The object name is exactly `<organization UUID>/<document UUID>`
and must match trusted metadata. Only clean metadata and current membership permit
object reads. No object write policies exist. Future uploads must validate actual
file signatures, quarantine and scan before a privileged worker marks clean.
Customer visibility does not authorize portal access yet. Signed links are bearer
capabilities; future issuance must check resource grants and use short expiry.
Access changes do not revoke already issued signed URLs. Never make the bucket
public or introduce a permissive second Storage policy.

## Secrets, payments and deployment

Only publishable Supabase keys belong in VITE variables. No service key is used in
Phase 1. Never store PAN/CVV, banking credentials or provider keys in database
profiles, browser bundles, tests, public docs or logs. No payment provider is wired;
no payment/surcharge/notification endpoints exist. CSP, framing protection,
no-sniff and referrer restrictions are configured; HTTPS is a hosting prerequisite.
Function responses set their own headers. Custom Supabase domains will require a
reviewed CSP allowlist update. No production deployment or migration is authorized.

## Release gates

Negative SQL tests must pass for anonymous, staff, administrators, revoked members,
platform grants, multiple tenants and forged references. Run hosted Auth/Storage/
PostgREST integration, MFA end-to-end, database advisors, dependency scanning,
backup/restore and access reviews in a disposable development environment before
production. Tests using the harness prove SQL policy behavior, not hosted-service
configuration. Rate limits/CAPTCHA, scan workers, consent, legal retention and
provider review remain gates for their respective later phases.

References checked October 15, 2026:
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
The [TLS changelog](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
announces removal of older TLS 1.2 ciphers November 10, 2026; supported modern
browsers and Node 24 are the runtime baseline.
