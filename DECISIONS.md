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
