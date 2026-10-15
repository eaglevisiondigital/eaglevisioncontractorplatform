# Security model · Phase 2

## Authorization and threats

Protect against guessed IDs, forged company context, user_metadata role claims,
self-promotion, stale memberships, unverified identity merging, replayed invitation/
intake tokens, unsafe documents and confused platform authority. PostgreSQL RLS,
explicit table/column/function grants, immutable tenant IDs and composite foreign
keys enforce scope independently of React. Every application/private table has RLS.

Owner/admin and platform access require signed JWT AAL2. Staff access additionally
checks their database job scope. No role is taken from user-editable metadata.
Membership/creator revocation, organization suspension and module deactivation take
effect on the next database statement. Real session revocation/recovery, recent-MFA
policy and TOTP integration remain part of deferred hosted validation. Auth user
deletion alone does not revoke issued access tokens. Public signup and anonymous
sign-in are disabled in local Supabase configuration; hosted settings are unverified.

## Permission boundaries

| Resource/action                                 | Estimator / office staff                              | Field staff                 | Owner/admin AAL2                                | Platform AAL2                                          | Anonymous/customer without membership   |
| ----------------------------------------------- | ----------------------------------------------------- | --------------------------- | ----------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| Organization/profile                            | Own company read                                      | Own company read            | Own company read/update selected profile fields | Company profiles read/configure via checked operations | Published intake profile only           |
| CRM/customers/locations/notes                   | Own company read/create/update; append notes          | Deny                        | Own company read/create/update                  | Deny without separate membership                       | Deny                                    |
| Intake                                          | Own company read/create/update and checked assignment | Assigned requests read only | Own company management                          | Deny without membership                                | Checked gateway submission only         |
| Delete CRM/intake                               | Deny                                                  | Deny                        | Own company, when module enabled                | Deny without membership                                | Deny                                    |
| Team role/invitation operations                 | Deny                                                  | Deny                        | Checked hierarchy; owner controls admin roles   | Checked owner assignment/revocation                    | Own eligible invitation acceptance only |
| Settings                                        | Deny                                                  | Deny                        | Own enabled settings module                     | No private settings bypass                             | Deny                                    |
| Clean documents                                 | Own company with enabled module                       | Deny                        | Own enabled module                              | Deny without membership                                | Deny                                    |
| Audit                                           | Deny                                                  | Deny                        | Own company activity                            | Platform administrative events                         | Deny                                    |
| Usage metrics                                   | No cross-company access                               | No cross-company access     | No cross-company access                         | Aggregate company counts only                          | Deny                                    |
| File writes / scan status / financial execution | Deny                                                  | Deny                        | Deny                                            | Deny                                                   | Deny                                    |

Platform-grant bootstrap and verified Auth identity provisioning remain reviewed
operator operations. Existing invited identities can accept through the UI. The
application has no generic elevated CRUD API or Auth-admin service key. Platform
users who separately hold a company membership receive only that membership's
company-data permissions. There is no automatic impersonation.

## Privileged database code and audit

Public RPCs are SECURITY INVOKER. Narrow private SECURITY DEFINER implementations
use empty search_path, fully qualified objects, explicit grants and live authorization
checks. Default PUBLIC function execution is revoked. Private tables have explicit
revocations and are excluded from the API schema. Anonymous private-schema usage
exists only to invoke the public-profile and gateway implementation functions;
it confers no private table or other function privileges.

The public-profile lookup intentionally serves an allowlisted published profile.
The intake gateway intentionally authenticates a server-only random capability,
not an end-user login. It cannot read/modify arbitrary CRM records. CAPTCHA and
trusted-IP HMAC happen server-side; clients never receive the capability secret.
Database/operator/provider log access and bind-parameter logging require review
before hosted use so secrets cannot be captured through infrastructure diagnostics.

Audit triggers append actor/action/entity/time atomically without row payloads.
Platform actions have a separate immutable event stream. Clients cannot forge,
modify, delete or truncate events. Consent history is append-only and provenance
is assigned by checked staff/public operations. Database owners can alter schema
or triggers; independently retained exports are needed before claiming operator-
resistant audit. Retention, deletion and legal holds are not implemented yet.

## Invitations and owner protection

Invitation creation is role-limited, hashed-token, 72-hour expiry and single-use.
Acceptance matches verified Auth email (not JWT user_metadata), current creator
eligibility, active organization/team module and privileged-role MFA. A preexisting
membership is never overwritten by accepting an invitation. Administrators cannot
create/promote owners or administrators; owners may manage administrators. Company
staff cannot revoke owners. Platform owner revocation serializes on the organization
and preserves at least one active owner. Tokens use URL fragments and are displayed
only at creation; no customer/employee messages are sent.

## Public intake and abuse controls

Only published company-slug profiles are public. The submission handler rejects
client organization IDs/unknown fields, cross-origin JSON, oversized streaming
bodies, honeypot values, malformed payloads and incorrect contact consent. Turnstile
is verified with expected hostname and action and a timeout. Trusted IP comes only
from Netlify runtime context, never forwarded headers supplied by the caller.
Store only HMAC fingerprints, not raw IPs. Database limits are durable and atomic,
with two-hour cleanup of rate buckets. Monitor HTTP 403/429/503 and protected rate
buckets in the approved hosting environment; alert routing is not configured here.

Idempotency is scoped to resolved tenant and payload hash; changed-payload key reuse
is rejected. Successful submissions create a new unverified contact rather than
merging into a known customer, preventing identity poisoning and cross-tenant
existence disclosure. Public responses contain no customer/request IDs or records.
Consent does not authorize marketing or any actual messaging. Public intake remains
off until all server verification/gateway configuration is supplied and approved.

## Documents and secrets

The private `company-documents` bucket remains 10 MiB maximum, PDF/JPEG/PNG/WebP only.
Object names must match trusted tenant/document metadata. Reads require current
module/capability authorization and clean scan status. Logo assignment additionally
requires a clean, same-company raster image. No browser uploads, replacements,
deletes, scan-state changes or public logo publishing are permitted. Customer
visibility flags do not grant portal access. Controlled signed-link issuance and
scan workers remain unimplemented. Never add a permissive second Storage policy.

Browser VITE variables contain publishable credentials only. Gateway, rate-HMAC and
verification secrets belong solely in approved Functions runtime secret storage.
No service-role key, PAN/CVV, bank credentials or merchant-provider secrets are used
or collected by this phase. Invoices/payments cannot be enabled through module
configuration; no charge/surcharge/delivery endpoints exist. HTTPS, CSP, framing
protection, no-sniff/referrer headers and no-store function responses are configured.
CSP allows only the verification provider's required script/frame/connect origin.
Intake can be linked; embedding remains blocked pending origin-allowlist design.

## Validation and release gates

Local tests execute the actual SQL policies on native PostgreSQL 17.11 and PGlite,
including forged IDs, role escalation, revoked access, three-company routing,
customer denial, MFA requirements, private documents, consent and audit immutability.
Browser and HTTP-client tests supplement SQL checks. They do not prove real Supabase
Auth/TOTP, PostgREST grants or Storage HTTP configuration. Those checks and advisors
after migration are explicitly deferred by the user. See docs/PHASE2_VALIDATION.md.
No production deployment or migration is approved by this document.

References checked October 15, 2026:
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[MFA](https://supabase.com/docs/guides/auth/auth-mfa),
[Storage policies](https://supabase.com/docs/guides/storage/security/access-control).
