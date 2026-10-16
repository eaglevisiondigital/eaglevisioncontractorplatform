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
- Internal estimating, job costs and payroll preparation are authorized by Phase 3.
  Customer financial execution remains disabled: no live charges, messages, raw
  card data, payroll disbursement or automatic 3.85% surcharge. Require reviewed
  provider/legal/tax configuration before any later execution phase.
- Run `npm run check`, `npm run format:check` and `npm run test:browser` for relevant
  changes. Add meaningful regression tests for permission changes. Report limits.
- Update build state and decisions with every phase. Preserve the original README.

Phase 2 continuation rules:

- Read docs/PHASE2_VALIDATION.md and docs/CONNECTED_DEVELOPMENT.md. Earlier hosted
  deferral is historical: the owner now approved the existing contractor project
  for internal development. Specific hosted actions still need review/authorization.
  Keep project refs out of Git.
- Public intake stays off until CAPTCHA/gateway keys are configured for an approved
  test environment. Never add a client-side or deployed development CAPTCHA bypass.
- No arbitrary organization ID from public form data; resolve published slug only.
- Invitation links target verified existing accounts and never send email/SMS.
- Run types:check; regenerate with types:generate after schema changes. Native
  PostgreSQL 17 and PGlite must agree. Preserve private storage/quarantine gates.

Phase 3 continuation rules:

- Read docs/MATERIAL_IMPORT.md and docs/PHASE3_VALIDATION.md. Preserve all three
  active additions: Smart Material Import, job profitability, workforce/payroll prep.
- Keep estimate engine v1 integer rules and immutable issued versions/job baselines.
- Never enable real ingestion with fixture verdicts or a frontend flag. The 503 gate
  requires approved scanner/full validators/isolated worker and integration evidence.
- Do not expose rates/deductions to estimators or field workers; aggregate job labor
  and own/assigned-team time are separate projections. No double labor posting.
- Approved/locked records require append-only corrections. Test real PostgreSQL
  concurrent writes in addition to PGlite. Never treat these tests as hosted QA.
- Classification selection is not legal proof. Weekly overtime/preparation does not
  imply jurisdictional payroll compliance, statutory withholding or disbursement.

Release 1.0 policy and Phase 3A continuation rules:

- Read docs/RELEASE_1_0_ACCEPTANCE.md, docs/PHASE3A_STAGING.md and
  docs/PHASE3A_WORKER.md. Phases 1/2/3/3A are INTERNAL milestones only.
- No outside contractor, employee or customer gets access before complete Release
  1.0 workflow acceptance/security and explicit owner launch approval. Internal
  synthetic test-role accounts are operated only by authorized internal engineers.
- Keep the Release 1.0 checklist current across implementation, hosted evidence,
  security, third-party dependencies and launch readiness. Required unfinished
  modules cannot be dropped from release scope or presented as launch-ready.
- Hide unfinished modules and enforce server controls. Contracts/invoices/payments
  are database-disabled. Netlify production builds fail closed; changing the guard
  requires explicit launch approval. Local npm builds remain available for testing.
- No hosted target/Netlify site is implicitly staging. Manifest validation is not
  permission. Only separately approved isolated target/actions may be executed.
- Keep staging manifests/session JWTs/evidence under ignored .staging/ or approved
  secret management. Never run SQL Auth/Storage mocks on hosted Supabase.
- Scanner/worker adapters use local synthetic contract tests only. Durable control
  store is now implemented locally (see connected rules below); actual scanner,
  worker sandbox and real AI are not verified/provisioned.
  Do not claim hosted acceptance or change ingestion503 based on local CI success.

Connected development continuation rules (owner decision, October 15, 2026):

- Read docs/CONNECTED_DEVELOPMENT.md, docs/MIGRATION_REVIEW.md and
  docs/MIGRATION_BUNDLE.json. The existing owner-designated Supabase project is
  approved INTERNAL DEVELOPMENT; do not require a new staging project. Exact
  supplied target IDs stay in ignored .staging/connected-development-target.json.
- Designation is not migration/deployment/configuration/provisioning/provider-call
  permission. Review and obtain action-specific authorization before hosted writes.
  Netlify team-login protection must cover all deploys, aliases, files and APIs.
- Before outside access/launch, provision a SEPARATE CLEAN production DB and
  independently validate it. Never promote/restore/copy synthetic development data
  into production. Production release remains NOT READY / NOT AUTHORIZED.
- /preview/release is explicit synthetic data. Connected /internal-release and
  /portal/internal require expiring operator-managed grants and server authority;
  never add a connected role switch or sample fallback. Ordinary financial modules
  remain disabled. Internal test consent/ledger do not constitute real execution.
- Keep the reviewed migration bundle current; npm run migrations:check is in check.
  Never alter the first seven historical migrations or run Auth/Storage mocks hosted.
- Durable worker SQL/CAS and Supabase adapter are implemented locally; approved
  scoped byte transport/isolated runtime/scanner/AI and actual Storage remain gates.
  Do not widen Storage policies or activate ingestion503 based on fixture evidence.
- Gateway adapters are sandbox-only, unwired and tested with synthetic transports.
  Their durable intent store must validate genuine provider-specific authorization;
  synthetic laboratory consent cannot authorize a gateway call. Never retry UNKNOWN.
- No external sending, real agreements/charges, payroll execution, production deploy,
  merge or outside access without the applicable explicit owner approval.

Action A continuity (October 16): exactly 22 confirmed synthetic Auth identities now
exist; credentials are in macOS Keychain, private UID mapping under ignored
.staging/action-a/identities.json. Never rerun creation or provision another roster.
Genuine owner-assisted TOTP remains 0/4 and requires human participation. No company,
membership, private grant or deployment is authorized by Action A. Read
docs/ACTION_A_RESULT.md; existing Action A authorization covers only the remaining
MFA continuation. Preserve the stop on required owner authentication/confirmation.
