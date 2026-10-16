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

Action A continuity (October 16): exactly 22 confirmed synthetic Auth identities
exist; credentials are in macOS Keychain, private UID mapping under ignored
.staging/action-a/identities.json. Genuine owner-assisted TOTP is COMPLETE (4/4),
with fresh real AAL2/identity verification, no pending factors and all sessions
signed out. Never rerun creation/reset/re-enrollment. Later login challenges the
existing factor with the owner's actual current code; never extract seeds.
No company, membership, private grant or deployment is authorized by Action A.
Read docs/ACTION_A_RESULT.md. Action B is now authorized, but blocked at the missing Action C platform bootstrap.
Action C and D remain unapproved; stop before hosted writes and read
docs/ACTION_B_RESULT.md.

Product identity: Propel Contractor Suite by Eagle Vision. Use only the owner-
supplied unchanged PNG documented in docs/BRANDING.md. Preserve contractor brands,
original README, repository/hosted identities, Keychain labels and historical SQL.
Never substitute/redraw the logo or mistake a visual change for release permission.

C1 is PREPARATION ONLY: read docs/ACTION_C1_REVIEW.md and the ignored exact review
bundle before any continuation. Do not execute the grant without separate owner
approval of that exact operation/hash. Require fresh genuine operator AAL2 and
no-drift checks; keep operator outside tenant memberships. Maximum 30-minute
operator-enforced window, early exact-UID deactivation and verified session cleanup;
there is no native grant TTL. Broader C/D grants/deployments remain unapproved.

C1 execution approval now EXISTS for operation SHA-256
37cc9657fd57aef122d96d4fb1156e5ebfdc012ad7f361fdb114e34073401b3d.
Read docs/ACTION_C1_EXECUTION.md before the older review-only checkpoint. Do not
repeat this approval request. Activation still needs fresh genuine owner-assisted
operator AAL2 and refreshed drift checks; first stale AAL1 wait was closed with
zero grants/sessions. Preserve the pending local handoff and inspect private state
before any retry. No organization/grant creation has occurred at this checkpoint.

Latest continuity (October 16): C1 executed once and is now INACTIVE; never replay
its grant or three-company provisioning. Action B core 723 authenticated cases pass;
existing 22 identities/four factors are preserved and all sessions closed. Native
Leaked Password Protection is separately approved, enabled and verified. Read
CURRENT_BUILD_STATE.md and the latest result documents before historical checkpoints.
Action D is PREPARATION ONLY: reviewed 28c7d5e artifacts and a target-bound manual
draft API proposal exist in docs/ACTION_D_REVIEW.md / ACTION_D_ARTIFACTS.json and
ignored .staging/action-d/. No upload, runtime/site variable, callback, new grant or
hosted acceptance change is authorized by preparation. Preserve production build
rejection and Private/all-deploy team protection. Do not replace the reviewed
function-metadata upload with an ordinary stale-cache CLI no-build deployment.

Action D execution update supersedes preparation-only status: owner approved the
exact frozen upload. One manual preview exists; four ZIPs uploaded, no primary
publication. Provider returned HTTP500 on same-ID manifest finalization and remains
uploading. Read docs/ACTION_D_EXECUTION.md and private execution state before any
continuation. Do not rerun creation, rebuild/substitute files, publish, change
settings or create a replacement. Read-only diagnostics first; runtime perimeter
and connected acceptance remain blocked/not run. All tenant/Auth/MFA/off controls
are unchanged; no owner session has been created for this attempt.

Action D recovery investigation: read docs/ACTION_D_RECOVERY.md. Only the original
pending deploy is in exact-site inventory; enriched project-summary alternate ID
returned404 and is not a replacement to follow. Static registry empty; dashboard
shows four registered functions despite empty deploy available-functions. No ready
app or verified runtime variables. Preserve original500 evidence limits. Support-first
review; no recovery PUT/POST, deletion, replacement or settings change without exact
new authorization. Do not run historical mutation helpers or rebuild the package.

Netlify support update: diagnosis-only packet submitted and acknowledged; accurate
scope confirmation sent in same ticket. Read docs/ACTION_D_SUPPORT.md and ignored
support correspondence; do not duplicate submission. No agent diagnosis yet and no
repair/requeue/retry/replacement/settings operation approved. Retain ticket metadata
privately and review exact later corrective recommendation with owner before writes.

Local provider continuation: read docs/RELEASE_PROVIDER_FOUNDATION.md. New payment
schema is server/payments/schema.proposed.sql, NOT an approved migration or control
role. Never apply it or widen grants from local test results. Existing nine-migration
bundle and frozen Action D package remain unchanged. New worker byte client needs
an independently authorized service; ingestion503 stays. Signing is sandbox-only,
legalExecutionEnabled=false; communication preparation cannot send. No provider,
DNS/hosted call, worker grant or deployment authorization comes from this work.

Provider-readiness continuation rules:

- Read docs/PROVIDER_INTEGRATION_READINESS.md and PROVIDER_MIGRATION_REVIEW.json.
  One new forward migration is LOCAL ONLY, not covered by the original nine-file
  authorization. Preserve both manifests; no hosted action or grant is implied.
- Provider command identities must be dedicated nonprivileged database LOGINS with
  exact expiring tenant/service/scope capabilities. No owner/service-key connection
  in HTTP APIs; no bypass via role/JWT/GUC. Activation requires separate exact review.
- Genuine invoice/consent/accepted-scope and sender/delivery bindings must use reviewed
  checked workflows; never populate them from internal laboratory consents.
- Sandbox runner defaults to offline plan. No provider calls without approved test
  accounts/credentials and exact action approval. UNKNOWN is never automatically retried.
- DocuSign CoC/HMAC/parsed PDF is not cryptographic/legal signature validation. Email
  outbox remains SQL-disabled. Worker JWT tests do not certify runtime/scanner/Storage.
- Preserve the frozen blocked Netlify package. Support recommendations require a new
  exact corrective authorization; no retry/replacement/deletion/publication is implied.

Provider-security remediation continuity:

- Read docs/PROVIDER_MIGRATION_REMEDIATION.md and the updated separate manifest.
  Old9588 SQL is rejected; the corrected pending file remains UNAPPLIED / NOT
  AUTHORIZED despite technical GO for a separate development approval request.
- Preserve lock-then-wall-time and final command checkpoints; no early success
  path may bypass them. Terminal result CHECKs must reject SQL NULL as well as
  malformed JSON through both commands and maintenance. Never weaken UNKNOWN holds.
- Run tests/database/provider-expiry.test.ts on native PostgreSQL17:22 real wait/
  stale-transaction-time cases cannot be replaced with PGlite or clock mocks.
  Private provider roles/grants exist only in disposable test fixtures; no hosted
  workload activation or execution approval is implied by any passing suite.

Provider-migration execution continuity:

- Read docs/PROVIDER_MIGRATION_EXECUTION.md before the earlier unapplied snapshots.
  Owner-authorized corrected hash5dd07b07… was applied once to development; hosted
  history is now10. Preserve all10 SQL files, the frozen original nine-file bundle
  and the separately recorded applied provider bundle. Never replay/reset/repair.
- All16 provider tables remain empty/private/default deny; no provider identity,
  grant, credential, binding or capability was activated. Schema approval does not
  authorize sandbox calls, Netlify recovery, production or outside access.
- The offline migration checker accepts recorded development-applied metadata only
  when it matches the exact reviewed bytes/scope and providers-disabled state.
  It is an integrity check, never a hosted execution or future activation permit.

Sandbox-readiness continuation:

- Read docs/SANDBOX_ACTIVATION_READINESS.md and PROPERTY_PROCUREMENT_PLAN.md.
  New offline planner/compiler has no hosted executor or credential reader.
- Private .staging/sandbox-activation/ probe files are PROPOSED / NOT AUTHORIZED.
  Never execute them or provision credentials/LOGIN/capabilities from local passes.
  Guard-only NOLOGIN preparation is distinct from real provider command authority.
- No checked genuine invoice/consent/token-vault bootstrap exists yet. Do not use
  laboratory financial records or free-text evidence to authorize provider calls.
- Accept UI nonce flow differs from Accept Hosted processing. Keep NMI independent;
  never reuse another gateway's tokens/accounts. Protected Netlify is unchanged.
- Property/media/comparison/unbilled additions are planned this increment; local
  implementation authorization persists, with expanded release scheduling undecided.
  Reuse tenant/property/job/import/expense/change/invoice models and all off gates.

Authorize.Net selection continuation:

- Read docs/AUTHORIZE_NET_ACCOUNT_SELECTION.md and private selection evidence.
  Account availability/control remains UNVERIFIED; owner manual sandbox login is
  pending. No credential value was retrieved and no provider call or binding made.
- Exact-host/label metadata absence does not prove no account/other Passwords entry.
  Do not retrieve/generate/rotate/store keys, create accounts or submit login under
  preparation/read-only selection scope. Owner enters credentials personally.
- Prepared private merchant candidate is disabled/unconfigured, not executable
  SQL or an approved binding. Sandbox Live Mode is provider test terminology;
  never treat production Test Mode as a sandbox. Preserve all activation gates.
