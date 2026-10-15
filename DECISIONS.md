# Engineering decisions

## 2026-10-15 · Phase 1

1. Preserve README.md as product source of truth. Initial repository was PUBLIC,
   with one README commit and no implementation, CI or infrastructure config.
   Keep it public; no visibility changes requested or made.
2. Use one React/TypeScript deployment, shared-schema PostgreSQL and organization
   RLS. Separate deployments per contractor are rejected as a scaling model.
3. Use current database memberships rather than user metadata or client context.
   Privileged company and platform access requires AAL2. Platform profile access
   does not silently bypass company customer/document policies.
4. Restrict provisioning and membership changes to reviewed operator workflows in
   Phase 1. No self-service role assignment or service-role HTTP API.
5. Use a private schema for platform grants and non-secret merchant routing.
   Only narrow internal lookups use SECURITY DEFINER; request APIs retain RLS.
6. Composite tenant foreign keys prevent cross-company relationship attacks.
   Audit metadata is appended transactionally without copying PII payloads.
7. Defer file writes until scanning exists. Private bucket read requires clean
   document metadata and company membership. No signed URLs are issued now.
8. Financial modules are designed, not live schema/workflows. No charges, schedules,
   customer communications or automatic 3.85% surcharge. Tokenization and separate
   merchant relationships are mandatory. See docs/PAYMENTS.md.
9. PGlite provides repeatable SQL RLS tests without credentials/Docker. Tests use a
   documented Auth/Storage contract harness; disposable Supabase integration and
   advisors remain an explicit release gate, not a claimed result.
10. Sample workspace is an explicit preview route with synthetic data. Connected
    mode never falls back to sample companies. Branding is data-driven; schemas
    support property services, construction and roofing from the start.
11. Pin dependencies and commit lockfile. CI is secretless and does not deploy or
    apply hosted migrations. Automated accessibility supplements manual review.
12. Phase numbering here: Phase 2 intake/CRM; Phase 3 estimates; Phase 4 contracts/
    portal/delivery; Phase 5 payments. README's suggested sequence remains the
    detailed feature ordering; these implementation groupings do not drop scope.

## 2026-10-15 · Phase 2A + 2B

1. The user explicitly deferred hosted validation and selected local-only work.
   Existing hosted resources remain read-only. No development branch existed;
   unrelated projects were not reused and no project was created. Do not apply
   these migrations to the existing project without new, environment-specific approval.
2. Preserve Phase 1. Extend coarse owner/admin/staff roles with estimator,
   office_manager and field_staff job scopes rather than duplicate authorization
   systems. Company status and module switches are enforced in SQL, not just nav.
3. Permit provisioning and membership changes only through narrow checked RPCs.
   Public entrypoints are security invoker; privileged implementations are private,
   explicitly granted and validate live grants plus AAL2. No generic service-role API.
4. Invite existing verified identities through expiring single-use links. Store token
   hashes; match verified Auth email, require MFA for administrator acceptance and
   recheck creator eligibility. No outbound email; new identity onboarding remains
   an approved provisioning process. Protect the last active company owner.
5. Public intake resolves an enabled company slug in the database. A server-only
   gateway capability permits only atomic intake creation; no general anon table
   writes. CAPTCHA, trusted-runtime IP HMAC, durable rate limiting and idempotency
   are mandatory. Publishing a profile alone does not enable submissions.
6. Never merge public submissions into an existing CRM identity based on unverified
   email/phone. Show possible duplicates only to authorized company staff. Consent
   is an immutable history; no external communication is implied by storing it.
7. Select/display only clean, company-owned private logo images. No upload pipeline
   exists; public branded intake uses initials. Support linked public forms; iframe
   embedding stays blocked by CSP until an origin allowlist design is approved.
8. Generate types from the actual disposable catalog, including tables, columns,
   enums and public RPC signatures. Check drift in CI. Native PostgreSQL 17.11 and
   PGlite 18.6 produce identical types; official hosted generation remains a release gate.
9. Extend CI with a disposable PostgreSQL 17 container in addition to PGlite and
   desktop/tablet/mobile browser tests. Test drivers allow only temporary Unix
   sockets or the fixed loopback CI container, never arbitrary hosted URLs.
10. Keep financial execution, invoices/payment module activation, uploads, customer
    portal access and all external messaging disabled. Subscription configuration
    is not billing. Next feature phase is estimates after hosted acceptance.
