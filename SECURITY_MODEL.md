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

## Phase 3 security extensions

- Every estimate/catalog/import/job/workforce table enables RLS and uses tenant
  indexes and composite tenant foreign keys. Authenticated clients receive narrow
  SELECT grants; financial/time mutations use checked invoker RPC entrypoints and
  private definer implementations with empty search paths. Private helpers are
  revoked from clients. Organization status, module activation and live membership
  are checked. Owner/admin and payroll actions require signed AAL2. User metadata,
  selected company, source text and UI roles cannot confer permission.
- Estimators/office staff may manage drafts/catalogs/job projections. Internal
  issue, job-baseline approval, expense review, customer-change approval and payroll
  administration require company owner/admin MFA. Assigned field staff submit
  expenses and own time; assigned supervisors review team time without rates,
  deductions or payroll snapshots. Revocation removes access. Super Admin remains
  separate and gains no implicit company financial or workforce access.
- Estimate and import approvals preserve immutable financial provenance. Issued
  versions/children, job baselines, approvals, expenses/reviews, time reviews,
  effective rates, locked payroll periods and adjustment history cannot be rewritten.
  Optimistic checks, row locks, partial uniqueness and idempotency protect stale or
  concurrent writes. No generic browser table writes can bypass these operations.
- `material-quarantine` has no client read/write policy. `material-clean` is private;
  authorized estimating staff read only source objects marked scan-clean. Existing
  `company-documents` uploads/replacement/deletion remain denied. Metadata creation
  never grants byte access. No browser/service-role credential endpoint is added.
- The worker pipeline verifies object tenant/source path, byte size and SHA-256,
  requires an approved scanner with a current matching clean verdict, then full
  content validation, before authorized file release or extraction. Scan failures,
  outages, mismatches and corrupt content fail closed. Magic signatures alone are
  not full validation. Bounded real-byte image/PDF decoders and literal CSV validation are implemented
  locally; real scanner/isolated-worker infrastructure is not provisioned; `/api/material-import` always returns 503.
  Selecting files/camera input stores only a local filename list, not an upload.
- Synthetic extraction fixtures are explicitly labeled; they never attest that a
  real file passed scanning or AI. Connected issue rejects synthetic provenance.
  Extraction treats documents as inert untrusted data, never tool instructions.
  Provider output is bounded and schema validated; ambiguous prices stay nullable.
  Literal CSV parsing never evaluates formulas. Unsupported spreadsheets are denied.
- Customer-facing preview projections omit supplier costs, margins, markup, internal
  notes, receipts, workforce wages and deductions. No delivery, acceptance, invoice,
  payment, payroll withholding/deposit/filing/disbursement endpoint exists. A manual
  change-order authorization reference is management evidence, not a generated
  signature or customer consent. Payment schedules and billing value are proposals.

Local SQL tests emulate Auth JWT/Storage policy contracts and include native
PostgreSQL concurrent transactions. Actual Auth/TOTP, PostgREST, Storage HTTP,
scanner/gateway operation and post-migration hosted advisors remain UNVERIFIED.
Use the approved isolated validation procedure in docs/PHASE2_VALIDATION.md plus
Phase 3 extensions; never run migrations against an assumed disposable hosted project.

## Phase 3A and Release 1.0 policy

Outside access is prohibited until full Release 1.0 acceptance/security and explicit
owner launch approval. Internal engineering phase completion is not permission to
provision external staff/customers, merge, deploy production or execute transactions.
The release checklist tracks all required modules and hosted/compliance dependencies.
Unfinished contracts/invoices/payments are hidden and database-constrained disabled;
production Netlify builds are unconditionally rejected by the committed guard.
Future enablement needs reviewed backend work and explicit authorization, not UI flags.

Prepared staging harnesses require an expiring explicitly approved isolated target,
forbidden non-staging refs and synthetic-only three-company context. Read acceptance
uses real verified Auth identities/AAL2 plus positive/negative PostgREST controls on
every public tenant table. Internal RPC tests additionally require explicit synthetic-
write approval and an allowlisted plan. Neither mode is executed by CI or silently
against existing resources. Manifests prove shape, not actual operator authorization;
identity and isolation require independent verification. No admin/service key is used.
No response bodies/tokens/payroll data enter reports or public artifacts.

The new malware adapter authenticates HTTPS, refuses redirects and bounds time,
bytes and evidence. Worker orchestration fences expired/stale jobs and rechecks
revocation before publication; a real persistence implementation must recheck these
conditions atomically at CAS, not trust a prior authorization check. Real store,
scanner signatures, worker isolation and AI remain unverified. Local synthetic mocks
cannot prove provider operation, malware efficacy or cross-service transactions.
The material-import endpoint remains 503 and no upload/storage policy is widened.

## Connected-development internal workflow boundary

The owner-approved existing Supabase target is development only. Before outside
access, production must be separately provisioned clean and independently validated;
synthetic development DB promotion/restoration is prohibited. Hosted action review
and Netlify all-deploy team-login protection remain mandatory. Current signup/auto-
table-exposure defaults and localhost Auth redirects need separately approved hardening.
No settings were changed. A current anonymous404 is not deployed protection evidence.

The new test workspace is default-off and unavailable to ordinary members/platform
admins without expiring private operator test grants. Staff need verified identities,
current owner/admin estimating membership and AAL2. Customers need verified Auth plus
an exact active tenant/customer link. Table RLS and invoker/private checked commands
enforce those same boundaries; no customer policy is added to raw estimates, supplier
sources, CRM, workers, rates or payroll. Customer-safe snapshots contain selling
scope only. UI role simulation exists solely in the in-memory synthetic route.

Mutations lock and recheck grants, organization/module/membership and customer links
so concurrent revocation cannot be bypassed with a previously evaluated flag.
Acceptance locks the estimate root against concurrent revision. Decisions/contracts/
signatures/invoices/authorizations/events/ledger/messages are immutable; source hashes,
explicit consent, uniqueness, idempotency, invoice locks, refund ceilings and atomic
number allocation guard state transitions. Accepted scope cannot produce duplicate
full-contract invoices through revision. Corrections/conversion require new reviewed
scope; no existing issued/job/payroll snapshot is rewritten.

Provider adapters are server-only sandbox contracts, with no callable charge route.
Fixed sandbox endpoints, token-only input/unknown-field rejection, current approval,
tenant/merchant binding and durable reservation requirements prevent live fallback.
Timeouts/malformed/provider errors stay UNKNOWN; no success-shaped response or blind
retry. Provider output is projected to minimal transaction metadata, never raw card
response fields. No real provider call or live execution was made. Sender profiles
stay unverified through staff APIs; internal sinks cannot send externally.

Private document-workload grants are separate from human roles. Worker SQL uses
lease tokens, expiry, allowed engines/validators/models, source/current-creator
permissions and atomic CAS. Metadata/private queue access never grants object-byte
access. No browser quarantine/clean upload policy was added. Source becomes clean
only after approved evidence, a private clean object and strict extraction validation.
Clients cannot attest clean scanning or create workload grants. Actual Storage byte
transport, isolation, scanner efficacy, independent provider evidence and retention/
cleanup remain unverified. Ingestion still unconditionally503.

Sandbox adapter follow-up: immutable request/configuration snapshots prevent
caller mutation during reservation from substituting tenant, merchant, amount,
credentials or token after validation. Canonical digest ordering preserves stable
idempotency binding. Expiry during reservation produces UNKNOWN without transport;
there is no automatic retry. Stored success identifiers are bounded/validated,
non-success identifiers must be null and unknown reservation states cannot execute.
The trusted durable intent store and real provider validation remain prerequisites.

Hosted development schema verification (October16): all63 application tables have
RLS, every public table has policies, no public definers or unsafe private definer
search paths exist, clients have no private table privileges and buckets are private.
Security advisors have12 informational private-table/no-policy findings, zero
warnings/errors. Four performance policy warnings need a separate reviewed forward
change. Owner-confirmed dashboard Auth/API hardening is now saved and verified:
signup OFF, exact internal redirects, public-only API schema, automatic exposure OFF.
Broader default-ACL cleanup was rejected and not applied; provider-managed and
residual non-API defaults remain as documented in the execution report.
No real Auth/MFA/Storage/three-company acceptance has been performed yet. See
docs/DEVELOPMENT_MIGRATION_RESULT.md; empty tables are not positive isolation proof.

Independent acceptance preflight: saved Auth/MFA/redirect/API controls and current
ACLs reverified;56 real read-only checks passed. Anonymous table denial requires
expected permission errors, not2xx/empty or5xx. Storage empty bucket listing is
only non-disclosure evidence, not object or tenant isolation. No current PUBLIC
public-function EXECUTE or client TRUNCATE grant found. Broader future-default ACL
cleanup is advisable defense in depth, not needed to test the existing reviewed
schema. No rejected action was retried. New privileged TOTP seeds/session tokens
must never enter logs/CI; actual identity/factor/fixture/grant writes need separate
approval. Details and unrun cases: docs/CONNECTED_ACCEPTANCE_PLAN.md.
