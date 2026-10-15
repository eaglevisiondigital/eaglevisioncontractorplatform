# Phase 1 architecture

## Product and deployment

README.md remains the product requirements. One React/TypeScript Vite application
serves many independent companies. Netlify hosts static assets and request-scoped
server functions; Supabase supplies Auth, PostgreSQL and private Storage. No tenant
requires its own deployment. Routes identify surfaces, not permissions:

| Surface                          | Route                              | Authority                                               |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| Platform entry and company admin | `/`, `/app`                        | Supabase Auth + current database membership             |
| Eagle Vision control plane       | `/super-admin`                     | Explicit private platform grant + AAL2                  |
| Public company intake            | `/intake`                          | Disabled, separate future validated submission endpoint |
| Customer portal                  | `/portal`                          | Disabled, future customer identity/resource grants      |
| Sample company/control plane     | `/preview`, `/preview/super-admin` | Synthetic local display data only                       |

There is no real data in preview mode. Connected mode reads authorized organization
profiles only; customer/intake/document interfaces are shells. CRUD UI is Phase 2.
A platform grant permits company-profile visibility, not blanket customer access.
The protected `/api/organization-context?organization_id=<uuid>` endpoint validates
Auth and queries membership and profile under the caller's JWT and RLS. It holds
no service-role credential. Functions emit no-store and non-sensitive errors.

## Domain relationships

Organizations own memberships, customers, service locations, intake requests,
documents and activity events. Memberships map Auth users to owner/admin/staff
roles and active status. A user can belong to many organizations. Company profile
fields cover branding, private logo reference, contact/business JSON and industry
(property services, construction, roofing); JSON should gain a versioned validated
schema as editing is introduced. Logos remain private until approved publication.
The UI uses validated hex colors and initials; remote logos are not fetched.

Composite `(organization_id, id)` foreign keys prevent references into another
company. Intake assignment references membership within the same organization.
Intake is an internal record now; anonymous clients cannot insert. Active staff
can read/create/update CRM records; only owner/admin can delete. Profile updates
are owner/admin only. Provisioning creates organizations/memberships through
reviewed operator SQL, never a browser bypass. Merchant configuration metadata
stays in the private schema with no client grant.

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

## Runtime configuration and verification

See [development guide](docs/DEVELOPMENT.md). Browser keys are public publishable
keys only; server functions receive separate runtime environment values. Private
provider credentials must later be resolved from an approved secret manager. No
hosted Supabase/Netlify resource is assumed. CI runs type, lint, formatting,
PostgreSQL RLS, server, money and browser/accessibility checks without secrets.
PGlite executes actual PostgreSQL policies using a local Auth/Storage contract
harness. It does not emulate the Supabase HTTP services. A disposable Supabase
stack must also pass Auth, Storage HTTP, MFA and advisor checks before release.

## Growth boundaries

Add pagination, tenant-leading indexes, per-tenant quotas and rate limits as CRUD
arrives. Keep public intake, portal and administrative APIs separate. Add an outbox
for consent-aware delivery and background scanning; payment workers require
idempotent inbox/outbox processing and reconciliation. Do not add per-company
forks. Tenant subscriptions/module entitlement evaluation remains a future domain.
