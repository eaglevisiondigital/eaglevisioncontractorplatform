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

## 2026-10-15 · Phase 3 and active additions

1. Preserve the existing feature branch/draft PR and all Phase 1/2 features. The
   user added Smart Material Import, Job Financial Dashboard, then Workforce Time
   Tracking/Labor Costing/Payroll Preparation to the active phase. Implement the
   labor/time model and costing before its UI. Hosted validation remains deferred.
2. Implement internal estimating and cost preparation without financial execution.
   Internal issue and job approval are not customer acceptance. Store customer
   change authorization references only after explicit management attestation.
3. Use exact minor units, thousandth quantities and basis points; mirror calculation
   v1 in TS and SQL with differential tests. Preserve immutable issued scope and
   optimistic draft revisions. Numbering is transactionally allocated per company.
4. Keep AI provider-neutral. Evaluate Azure Document Intelligence, Google Document AI
   and Claude PDF/vision behind a strict versioned extraction gateway; select no live
   vendor/model by assumption. Compatible spreadsheets initially mean the documented
   UTF-8 CSV format, not arbitrary XLSX/macros. See docs/MATERIAL_IMPORT.md.
5. Do not weaken existing uploads. Build quarantine/scanner/validator/store interfaces,
   bounded image/PDF decoders, a literal CSV implementation, explicit synthetic fixtures and review/approval.
   Keep the deployed ingestion endpoint fail-closed until approved worker/scanner,
   validator isolation, provider credentials and integration evidence exist.
6. Price materials with line > supplier > company overrides; fixed markup applies
   to an extended line. Keep supplier costs and markup internal even for lump sums.
   Never silently correct uncertain extraction. Every selected row requires review.
7. Separate original estimate imports from job receipt imports. Bind approvals and
   per-row mappings to tenant/job; prevent duplicate job source hashes and repeated
   approval-row use. Match purchases manually using source IDs or normalized
   description/unit candidates. No extraction or expense can raise customer billing.
8. Capture an immutable original job budget. Model commitments, paid costs, credits,
   forecasts, internal scope, proposed additions and approved changes separately.
   Review expenses and authorization explicitly. Forecast profit includes economic
   labor and remains projected while costs, commitments or reviews are incomplete.
9. Use one approved labor posting source. Worker profiles choose time, invoice or
   imputed costing. Invoice-costed contractors generate no time cash fees; time-costed
   workers cannot also enter subcontractor invoices. Estimated loaded rates are
   comparison data, not an additional actual cost. Billing value is not revenue.
10. Workweeks belong to the employer timezone, across jobs and overhead. Use the
    pinned Temporal polyfill for browser/reference DST arithmetic and PostgreSQL
    timezone arithmetic on the server. Paid and unpaid breaks are distinct. Lock
    policy/worker operations to reject overlap and serialize payroll preparation.
11. Keep classification/rate review and legal status distinct. Support configurable
    weekly overtime and salary allocation as preparation only. Daily overtime,
    jurisdictional break/minimum-wage rules, salary adjustments and statutory
    deductions require independent compliance/provider validation before payroll use.
12. Approved time corrections append history. Locked periods cannot be reopened;
    later financial adjustments enter the next preparation and job cost posting once.
    Restrict rates/deductions/exports to payroll administrators, expose aggregate job
    labor costs to estimators, and own/assigned-team time to workers/supervisors.
13. Reuse separate merchant configurations for eventual Authorize.Net or NMI sandbox
    adapters. No provider charge code, automatic 3.85% surcharge, delivery, signature,
    payroll execution or production deployment is part of this phase.
14. Browser regression tests build first and serve the production bundle on an
    isolated local preview port. This avoids development hot reload invalidating
    in-memory fixture repositories mid-test. Workspace readiness is bound to the
    repository and company identity before child operations render.

## 2026-10-15 · Phase 3A and owner Release 1.0 policy

1. Owner established that Phases 1/2/3 are internal milestones, not releases. No
   outside contractor, employee or customer access until the complete Release 1.0
   workflow is substantially complete, tested, secure and explicitly launch-approved.
   Maintain docs/RELEASE_1_0_ACCEPTANCE.md across all required modules/evidence.
2. Preserve working modules. Hide unfinished Contracts/Invoices/Payments and add
   an additive SQL disabled constraint including Contracts (previously configurable).
   Keep production Netlify builds blocked; isolated previews need specific internal
   build configuration plus separate protected-site/deployment approval.
3. Audit hosted resources read-only. Existing Eagle Vision Supabase remains empty
   and unapproved as staging; no branch was created. No clearly named platform site
   was identified in Netlify. Existing marketing/unrelated sites are not reused.
   GitHub environments/secrets were empty and classic main protection absent;
   settings changes and hosted actions remain separate approval items.
4. Prepare offline hashed migration plans, expiring private target manifests,
   read-only SQL verification, real-session three-company SELECT/RPC assertion
   tooling and migration/rollback/acceptance procedures. No automatic remote CI,
   project linking, migration, seeding, deployment or cleanup. Empty fixture controls
   fail instead of claiming tenant isolation. Hosted case data/run remain pending.
5. Extend server-side document contracts with authenticated bounded scanner gateway
   and leased/fenced/retry-limited worker orchestration. Implementing real private
   CAS/control persistence, sandbox infrastructure and provider approval requires a
   separately approved integration phase. Ingestion503 and denied uploads remain.
6. Preserve future tenant-specific merchant, branded invoice and verified sender
   routing. No actual sender/provider connection, customer communication, financial
   execution, payroll execution, production merge/deploy or external access occurred.
