# Platform architecture · Phase 2 operational foundation

## Shared deployment and separate surfaces

README.md remains the product source of truth. The Phase 1 architecture is
preserved: one React/TypeScript Vite deployment serves many independent companies,
Netlify supplies static hosting and request-scoped functions, and Supabase supplies
Auth, PostgreSQL and private Storage. No per-contractor fork or deployment.

| Surface                     | Route                                                        | Authority                                                   |
| --------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Company administration      | `/`, `/app`                                                  | Current active membership; admin/owner AAL2                 |
| Eagle Vision control plane  | `/super-admin`                                               | Explicit private platform grant and AAL2                    |
| Public company intake       | `/intake/<company-slug>`                                     | Published profile; checked server gateway for submission    |
| Customer portal             | `/portal`                                                    | Reserved; no resource grants or records exposed             |
| Synthetic previews          | `/preview`, `/preview/super-admin`, `/preview/intake/<slug>` | In-memory examples only, reset on reload                    |
| Staff invitation acceptance | `/join#token=<one-time-token>`                               | Verified invited account, eligibility and role-specific MFA |

Company mode loads only the user's own memberships. Platform users receive profile
visibility and aggregate usage, not implicit access to customers or files. Route
and company selection are context, never authorization. Connected mode never falls
back to synthetic data. Browser reads/CRUD retain the caller's JWT and database RLS.
The protected organization-context function also validates the session with Auth.

## Organization and operational data

Organizations own memberships, configurable module entitlements, structured company
settings, customers, service locations, intake requests, notes, consent events,
lead notifications, documents and activity. Coarse roles remain owner/admin/staff;
staff job scopes add estimator/office_manager/field_staff. Privileged access requires
AAL2. Suspension and module switches are enforced by database predicates.

Composite tenant foreign keys and immutable tenant IDs prevent cross-company
references or transfers. Intake location/customer combinations must agree. Narrow
column grants protect record IDs, creation timestamps and consent attribution.
Settings and profile saves are atomic. Company settings include brand/logo metadata,
contact/area/specialty/license/insurance information, estimate defaults and materials/
labor configuration. These defaults do not perform estimation, tax or payment work.

Customer CRUD uses bounded search, type filters and stable paginated ordering.
Duplicate identification stays within the selected tenant. Public submissions never
auto-merge identities based on unverified contact details. Consent is an append-only
history; notes, inquiries and consent comprise the customer timeline. Changes append
minimal activity metadata without copying customer payloads into audit logs.

## Privileged operations

Public security-invoker RPCs call narrowly granted private implementations for
company provisioning/configuration, owner assignment/revocation, team invitations,
role changes and inquiry assignment. Each checks current grants, organization status,
module capability and required MFA. Private platform events record administrative
actions separately from company activity. At least one active owner must remain.
Metrics expose counts, not customer fields. Subscription plans are configuration,
not billing. New verified identities and the first platform grant require reviewed
identity/operator provisioning; no Auth-admin service key is exposed by the app.

Invitation tokens are random, stored as hashes, valid for 72 hours and single-use.
Acceptance matches the verified Auth email, rechecks the creator's current authority
and requires MFA for administrative roles. Links use fragments to avoid server URL
logs. Links are created for controlled manual sharing; no actual email/SMS is sent.

## Public intake boundary

The public profile RPC exposes only a company's deliberately published branding,
industry and service categories. Public form data contains no organization UUID.
The Netlify handler validates origin, bounded JSON, field allowlist, honeypot,
Turnstile hostname/action and runtime-supplied client IP. It hashes IP with an
independent server HMAC secret, then invokes a narrow gateway-capability RPC.

The gateway resolves an active, enabled published company slug, checks payload/
consent, applies durable limits and idempotency, and creates customer, location,
request, consent and in-app lead notification atomically. Five requests/minute and
30/hour per company/fingerprint are enforced; retries of the same payload/key do
not create duplicate records. No existing customer identity is revealed or merged.
Public intake is disabled by default until disposable-environment configuration is
approved. Forms are linked from contractor sites; iframe embedding remains blocked
until an origin allowlist is designed. No file input or external messaging exists.

## Planned lifecycle modules (not live tables or APIs)

| Module    | Planned model and invariants                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimates | Estimate root, immutable numbered versions, line/options, quantity/cost/markup, discount and approved tax-policy snapshot. Accepted versions locked; changes create a version/change order.   |
| Contracts | Jurisdiction/versioned legal templates, approved estimate snapshot, consent, signature sessions, evidence and executed artifact hash. Executed records immutable.                             |
| Invoices  | Draft/issued/part-paid/paid/void state machine, line/tax snapshots and explicit currency; issued corrections use credit notes.                                                                |
| Schedules | Separate authorized deposit/milestone/date installments, sum validation, timezone, cancellation and retry state. A schedule alone never authorizes a charge.                                  |
| Payments  | Per-company merchant routing, gateway method tokens, explicit customer authorization, idempotency record and verified provider events.                                                        |
| Ledger    | Append-only balanced journal entries in integer minor units by currency; reversal entries, no edits; reconcile provider gross/fee/net and settlement separately.                              |
| Documents | Private immutable object/version metadata, quarantine scan, ownership, customer/internal visibility, controlled links, retention and legal holds. Foundation metadata and read policies only. |

Phase 1 implements only foundation tables, Money validation and disabled capability
flags for these future workflows. There are no financial mutation endpoints. See
[payments design](docs/PAYMENTS.md) for review gates and event processing.

## Documents and deployment configuration

The Phase 1 private bucket/quarantine boundary remains. Only clean tenant-owned
objects can be read. Internal company logos use authorized downloads and local blob
URLs; public intake uses initials. No upload/replacement/deletion policies, public
bucket or signed download issuance is introduced. Financial modules remain planned.

Only public Supabase keys belong in browser variables. Server-only gateway, HMAC
and CAPTCHA secrets use hosting Functions scope and approved secret storage; only
the gateway hash is registered in the database. Request-scoped APIs never use a
service-role key. CSP explicitly permits the verification provider and image blob
URLs. Public forms, company administration, portal and platform control remain
separate entry points.

## Testing, types and growth

Catalog-derived tables/enums/RPC types and a typed Supabase client are generated
from committed migrations and checked for drift. PGlite and native PostgreSQL 17
produce identical types and SQL-policy results. CI tests both engines plus desktop,
tablet and mobile flows. The harness provides Auth/Storage SQL contracts, not real
Supabase HTTP services. Real Auth/TOTP, PostgREST, Storage and post-migration advisors
remain a release gate. See docs/PHASE2_VALIDATION.md and docs/DEVELOPMENT.md.

Next extend estimates and catalog/versioning after the deferred hosted gate. Add
reviewed identity onboarding, retention/export, concurrency/load validation and
consent-aware delivery only within their approved scope. No production deployment,
hosted migration or live workflow is implied by this implementation.
