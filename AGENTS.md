# Engineering instructions

Read README.md first (product source of truth), then CURRENT_BUILD_STATE.md,
ARCHITECTURE.md, SECURITY_MODEL.md and DECISIONS.md before making changes.

- This is a multi-company platform, never a Straight Edge-specific deployment.
- Use a `codex/` feature branch and draft PR. Never merge or deploy production
  without explicit authorization. Never apply hosted migrations without approval.
- Public repository: no secrets, customer data, private project references, bank
  details, infrastructure exports or provider credentials in commits or logs.
- TypeScript strict mode; format with Prettier; pinned npm versions and lockfile.
- Every tenant-owned table needs organization_id, RLS, explicit grants, indexed
  tenant access and composite tenant foreign keys. Negative SQL tests are blockers.
- Browser selection, paths and user_metadata never confer authorization. Keep
  private schema out of the API. Never use a service key in request-scoped APIs.
- Organization and membership changes use the checked Phase 2 RPCs with current
  grants and MFA. Platform-grant bootstrap remains a reviewed operator operation.
  Do not open generic CRUD endpoints for memberships or private tables.
- Admin/owner and platform access require AAL2. Keep control-plane grants distinct
  from customer-data access. Audit events are append-only and contain no row PII.
- Storage stays private. Do not enable uploads/signed issuance before quarantine,
  size/type/content checks, scanner integration and authorization tests exist.
- Financial modules are design-only. No live charges, messages, raw card data or
  automatic 3.85% surcharge. Require approved provider/legal/tax configuration.
- Run `npm run check`, `npm run format:check` and `npm run test:browser` for relevant
  changes. Add meaningful regression tests for permission changes. Report limits.
- Update build state and decisions with every phase. Preserve the original README.

Phase 2 continuation rules:

- Read docs/PHASE2_VALIDATION.md. The user explicitly deferred hosted validation;
  no existing hosted project is approved as disposable. Keep project refs out of Git.
- Public intake stays off until CAPTCHA/gateway keys are configured for an approved
  test environment. Never add a client-side or deployed development CAPTCHA bypass.
- No arbitrary organization ID from public form data; resolve published slug only.
- Invitation links target verified existing accounts and never send email/SMS.
- Run types:check; regenerate with types:generate after schema changes. Native
  PostgreSQL 17 and PGlite must agree. Preserve private storage/quarantine gates.
