# Current build state · October 15, 2026

## Scope and review status

Phase 1 foundation implemented on `codex/phase-1-foundation`, based on the original
README-only `main`. Repository visibility inspected: PUBLIC. README preserved.
This is a draft engineering foundation, not a production-ready contractor system.
No merge, production deployment, hosted migration, charge, customer message or
real financial/customer-data modification has been performed.

## Implemented

- React + strict TypeScript + Vite, responsive company and platform shells,
  independent tenant branding examples and industry choices; separated public
  intake and portal placeholders. Explicit sample-only preview routes.
- Supabase publishable-key environment model, password sign-in and TOTP UI,
  caller-scoped protected Netlify organization-context function.
- Local migration: organizations, owner/admin/staff memberships, customers,
  service locations, intake requests, document metadata, immutable activity,
  private platform grants and non-secret merchant routing configuration.
- Tenant RLS, composite tenant foreign keys, narrow grants, admin/platform AAL2,
  database membership revocation, private clean-only object read policy and
  quarantined document defaults. No browser file writes or privileged endpoints.
- Versioned financial/document architecture and phased tokenized payments plan;
  live charges, schedules and surcharges disabled with no execution endpoints.
- CI, pinned dependencies/lockfile, lint, formatting, unit, server, SQL integration,
  desktop/mobile and automated accessibility tests. All required continuity docs.

## Verification

- `npm run check`: lint, strict types, 30 tests (24 PostgreSQL RLS/security,
  4 protected server tests, 2 Money/capability tests) and production build passed.
- `npm run format:check`: passed.
- Browser tests cover desktop and mobile navigation, context changes, disabled
  financial module, surface separation, page overflow and axe accessibility.
  All 6 browser checks passed. CI runs the same checks.
- `npm audit --omit=dev`: zero known runtime vulnerabilities at implementation time.
- No Docker or configured disposable Supabase project was present. SQL ran on
  actual PostgreSQL through PGlite with explicit Auth/Storage contract fixtures.
  Supabase HTTP services, live MFA and database advisors were not executed.

## Unresolved dependencies and release gates

1. Approved disposable Supabase environment: verify full migration against managed
   schemas, real Auth/TOTP, PostgREST grants/RLS, Storage HTTP and database advisors.
   Generate schema-derived TypeScript types once the reference schema is deployed.
2. Reviewed tenant/user provisioning and invitations, attributed operator audit,
   company settings validation/editing, tenant customer/intake CRUD and pagination.
3. Netlify site/account configuration and preview runtime/build variables, HTTPS,
   Auth redirect allowlists, deployment locking and isolated preview resources.
   No site was created or linked; do not auto-deploy production from this branch.
4. Document quarantine scanner, content validation, controlled upload/download
   issuance, customer resource grants, retention/legal holds and recovery testing.
5. Consent-aware notification providers, email setup and delivery audit before
   public intake confirmation or estimate delivery. No messages are sent now.
6. Payment-provider selection, sandbox merchant onboarding, secret management,
   tokenization, signed webhooks, idempotency, ledger, reconciliation and legal/
   processor/tax approval before any live workflow. See docs/PAYMENTS.md.
7. Production readiness review: MFA end-to-end, rate limits, session revocation,
   monitoring, incident response, backup/restore and tenant access review.

## Next engineering phase

Phase 2: first verify foundation on a disposable Supabase stack, then implement
reviewed organization/staff onboarding and tenant-scoped CRM/intake CRUD, validated
company profile editing, public intake abuse/consent controls and document scanning.
Continue estimates, portal/contracts and sandbox payments in later phases. Keep
customer/internal documents and platform/customer authorities separate.
