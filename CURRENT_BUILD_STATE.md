# Current build state · October 15, 2026 · Phase 2A + 2B

## Review and environment boundary

Continue `codex/phase-1-foundation` and [draft PR #1](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/pull/1).
Phase 1 architecture and original README are preserved. Repository is PUBLIC:
never commit hosted project identifiers, credentials, customer data or exports.
No merge, production deployment, hosted migration, live charge or actual customer
communication has occurred.

The user explicitly chose **complete locally; defer hosted validation** after
inventory showed no Eagle Vision development branches and no Docker executable.
The existing Eagle Vision hosted project was inspected read-only; it is not an
approved disposable environment. No project/branch was created or modified.
A later inspection found native PostgreSQL 17, so an independent temporary local
cluster with TCP disabled was used for migration/security validation.

## Completed functionality

- Super Admin: atomic company/verified-owner provisioning, onboarding/active/
  suspended status, subscription configuration, module activation, additional owner
  assignment, owner revocation with last-owner protection, aggregate metrics and
  immutable platform administrative audit. No automatic company-customer access.
- Company settings: independent colors, clean private logo selection/display,
  address/contact, areas/specialties, license/insurance metadata, estimate numbering,
  draft terms/expiration, materials/labor defaults, currency and intake categories.
  Profile/settings saves are atomic. No upload or merchant-secret collection.
- Team: owner/admin authorization plus estimator, office-manager and field-staff
  job scopes; expiring single-use email-bound invitation links, acceptance using
  verified Auth identity, MFA for privileged roles, link revocation, role updates
  and immediate membership revocation. No email is sent. New Auth accounts still
  require reviewed identity provisioning; invitations target existing accounts.
- CRM: tenant-scoped contact create/read/update, residential/commercial designation,
  multiple editable service locations, search/type filters, pagination, duplicate
  identification confined to the current tenant, internal notes, inquiry and
  append-only consent history. No unsafe automatic identity merging.
- Public intake: company-slug routing, branded linked forms, contact/job/property/
  service/availability fields, explicit contact preferences and consent. Server
  checks origin, body limit, honeypot and Turnstile hostname/action. Narrow gateway
  RPC resolves the tenant and atomically creates customer/location/request/consent/
  in-app notification. Durable IP-HMAC rate limits and idempotency protect writes.
- Intake review/assignment/status and new-lead dashboard; attachments, external
  notifications, financial execution and customer portal access remain disabled.
- Independent synthetic preview workspaces for all three pilots, including
  end-to-end public request → correct contractor → assignment. Preview changes
  stay in memory and reset on full reload; connected mode never uses demo records.
- Catalog-derived TypeScript tables/enums/RPC types, drift check, typed Supabase
  client and CI coverage on both PGlite and native PostgreSQL 17.

## Verification results

- `npm run check`: lint, strict types, catalog type drift, **66 tests passed**
  (47 database security/operational, 4 server-context, 11 intake/validation,
  2 money/capability and 2 preview-repository tests), production build passed.
- Native PostgreSQL **17.11**: **47/47 database tests passed** plus identical
  catalog-derived TypeScript output. Independent databases used Auth/Storage
  contract fixtures; no Supabase HTTP services were started.
- PGlite **0.5.10 / PostgreSQL 18.6**: same committed migrations and SQL tests.
- Browser suite: **24/24 passed** across desktop, tablet and mobile, including
  CRM/consent/locations, branded intake/assignment, settings/team, control-plane
  provisioning/configuration, overflow and axe WCAG A/AA checks. Desktop/mobile
  screenshots visually inspected. Automated checks do not certify all accessibility.
- Existing Phase 1 GitHub CI was verified passing before work. Updated CI adds an
  isolated PostgreSQL 17 container job and repeats type/security/browser checks.
- Hosted read-only advisors: no security findings on the **empty public schema**;
  one informational Auth connection-allocation performance finding. This does not
  validate the unapplied application schema. See docs/PHASE2_VALIDATION.md.

## Infrastructure dependencies and remaining acceptance gates

1. Approved disposable Supabase stack/project: apply both migrations there only;
   run real Auth/password/TOTP, JWT/session, PostgREST grants/RLS and private Storage
   HTTP tests and advisors after migration; regenerate official Supabase types and
   compare. Hosted acceptance remains explicitly incomplete by user direction.
2. Bootstrap a platform operator, three synthetic companies and verified test Auth
   users through an approved identity process. Privileged UI requires AAL2. No real
   accounts were created and no customer addresses were used.
3. Configure Netlify preview Functions/build environments, Auth allowlists, HTTPS,
   Turnstile site/secret/hostname, independent gateway/rate-limit secrets and gateway
   hash registration in the disposable database. Public intake is disabled by
   default until all gates are satisfied. No site was linked or deployed.
4. Full service scanning/quarantine, malware/content validation, retention/legal
   holds and controlled upload/download issuance before attachments. Logos can
   reference only already-clean company images; public intake uses initials.
5. Consent-approved notification delivery and email account onboarding remain
   disabled. Invitation links require controlled manual sharing, never automatic
   email/SMS. Configure operational alerts for intake HTTP 403/429/503 before release.
6. Production-grade session revocation/recovery, invitation account onboarding,
   backup/restore, concurrency/load review and audit retention/export remain gates.
7. Payments, invoicing and subscriptions billing are not implemented. Subscription
   values are configuration only. Merchant onboarding, legal/tax/processor review
   and tokenization/reconciliation remain later-phase requirements.

## Recommended Phase 3

First close the deferred disposable-Supabase validation gate. Then build tenant-
scoped estimate drafts, catalog/material/labor defaults, immutable estimate
versions/options and internal previews. Use the saved settings; do not enable
customer delivery, execution, tax/fee collection or payments without their approvals.
