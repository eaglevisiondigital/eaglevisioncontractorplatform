# Engineering instructions

Synthetic Intel compatibility correction: the first public ZIP's Setup failed on
the actual Monterey/CPython3.14.2 device; no pairing/R0 case started. Read
docs/TWO_COMPUTER_REHEARSAL_COMPATIBILITY.md. The corrected ZIP uses only the separate
rehearsal-requirements.lock (cryptography48.0.1/CFFI2.1.1/pycparser3.11 wheel hashes).
Never downgrade operational requirements.lock or private recovery from this repair.
Setup and every launcher enforce exact dependencies/native cipher availability;
no compilation/unpinned fallback. Preserve prior owner evidence/P1/all13 migrations.

October21 synthetic rehearsal continuity: read docs/TWO_COMPUTER_REHEARSAL.md and
its validation record. Public deterministic ZIP/launchers now compose the existing
recovery components over direct private-LAN encrypted transport, synthetic data only.
Owner retains Monterey; stop Ubuntu troubleshooting. Preserve25 completed offline
passes and prior Python/hash/network evidence. Do not claim actual two-device PASS
from localhost/SIGKILL tests. No private capsules or privileged Monterey credentials;
no hosted adapter in the ZIP. Do not change frozen P1/all13 historical SQL or ask for
duplicate fixture approval. Actual device rehearsal, maintained operational custody
and separately exact hosted verification remain gates; Release1.0 stays closed.

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

Property/procurement implementation continuity:

- Read docs/PROPERTY_OPERATIONS_VALIDATION.md and PROPERTY_OPERATIONS_PROPOSAL.json.
  NMI is preferred; Authorize.Net optional; neither activates. New scope is required
  Release1.0 work, with hosted/media/consent acceptance still blocking launch.
- New schema is server/property/schema.proposed.sql, outside the10 historical
  migrations. Never apply it hosted or enable feature rows/private/public wrappers
  from local passes. Native tests use disposable fixture grants only.
- Preserve allowlisted immutable reports and explicit customer mappings; private
  findings/costs/drafts never enter client projections. Media stays quarantined and
  all upload/playback503. Do not claim actual scanning or camera/segment acceptance.
- Quote comparisons are reviewed manual data, not retailer feeds; unknowns cannot
  win. Proposed supplemental prices require scope/return/duplicate review and
  cannot post customer balances or material expense twice. Production consent and
  change-to-invoice conversion require later independent implementation/acceptance.

Property schema review continuity:

- Read docs/PROPERTY_MIGRATION_SECURITY_REVIEW.md and
  PROPERTY_CONNECTED_AUTHORIZATION.md. Original f345 proposal is rejected; corrected
  proposal/formal migration share SHA c345bdf1… in PROPERTY_MIGRATION_REVIEW.json.
- Preserve all ten historical migrations. New20261017005322 is UNAPPLIED / NOT
  AUTHORIZED; no public wrappers, feature activation or provider/Storage changes.
- Preserve positive non-NULL CAS, exact report/draft provenance, tenant/parent
  immutability and post-wait wall-clock session guards. Native concurrency is required.
- Hosted execution is NO-GO: CLI dry run produced zero output before termination;
  existing modern/legacy public API keys returned401 before profile checking.
  Diagnose read-only and repeat successful preflights before separate exact approval.
  Do not rotate/reset keys/Auth or widen access to bypass these blockers.
- Local/SQL/hosted-read evidence is not real connected property/media acceptance.
  Keep all ingestion/playback and supplemental customer debt execution disabled.

Property preflight recovery supersedes the preceding NO-GO checkpoint:

- Read docs/PROPERTY_PREFLIGHT_RECOVERY.md and PROPERTY_PREFLIGHT_RESULT.json.
  One-file CLI dry run now PASS; existing public and legacy keys work. Root OpenAPI
  access is secret-only; test public/private profiles on zero-limit table requests.
  Never follow a response hint to GRANT anonymous table access.
- CLI automatic credential discovery stalls; approved Keychain read plus credential
  in child-process memory works. No persistent export/reset/new key is authorized.
- All ten hosted/local migrations, catalog, ACLs, saved Auth/API configuration and
  corrected pending SQL/hash remain unchanged. Technical GO permits requesting
  separate exact execution approval only. Migration UNAPPLIED / NOT AUTHORIZED;
  no features, public wrappers, media, providers, deployment or outside access.

Property migration execution supersedes the preceding unapplied checkpoint:

- Read docs/PROPERTY_MIGRATION_EXECUTION.md before earlier review/preflight notes.
  Owner-approved c345bdf1…/0fadce83… applied20261017005322 once;history now11.
  Preserve all11 SQL files and all original manifests;never replay/reset/repair.
  - Eight property tables empty/private/RLS;3 checked entry points remain unexposed/off.
    No feature row,customer grant,public wrapper,media or provider was activated.
- Offline checkers accept only the exact applied dormant record,not activation or
  replay. Keep the six negative applied-record integrity tests.
- New duplicate-index performance warning on service_locations needs separate
  dependency-aware forward review;no ad-hoc DROP or applied SQL edits.
- PROPERTY_CONNECTED_TEST_PLAN.md/CASES.json prepare72 genuine cases,zero executed.
  Review public invoker wrappers/connected repository and report-only authorization
  before exact feature/fixture/grant approvals;never silently enable broader release
  customer commands. Keep media503,financial execution and outside access disabled.

## P0 continuity

Read docs/PROPERTY_P0_SECURITY_REVIEW.md and PROPERTY_P0_MIGRATION_REVIEW.json. Two new LOCAL_ONLY_NOT_AUTHORIZED forward migrations and three unwired adapters exist; hosted history remains11. Never treat generated pending RPC types or local tests as hosted function availability. Preserve dedicated report-only leases, current Auth session/post-wait guards, private tables and all off gates. Existing72 scenarios are NOT RUN; private offline proposal includes75 positive steps/57 domain rows plus audit and three explicit synthetic expenses. No fixture/feature/lease/assignment/session activation or index DROP is authorized by P0. Preserve all11 historical SQL/manifests and frozen Netlify deployment.

## P0 final preflight continuity

Read docs/PROPERTY_P0_FINAL_PREFLIGHT.md and PROPERTY_P0_PREFLIGHT_RESULT.json. Exact two-file dry run PASS (2.121.0,exit0,no seeds/roles,skip-vault);hosted remains11 and pending SQL is unchanged. Technical GO is not execution permission. Refresh exact target/history/catalog/ACL/Auth/API/index gates before any separately authorized apply. Two migrations are not bundle-atomic;on partial success stop and request exact recovery approval,no automatic retry/history repair or unapproved containment writes. Features/mappings/leases/fixtures/providers/media/Netlify remain off/unchanged;72 hosted cases NOT RUN.

## Action D recovery execution continuity

Read docs/ACTION_D_RECOVERY_EXECUTION.md before historical recovery notes. New owner-approved same-ID nine-static-file-first repair STOPPED at the first file PUT422/no records matched. Zero confirmed uploads/registry entries,zero manifest attempts/function reuploads/new deploys/publications;existing deployment still uploading. Do not rerun this or earlier helpers,reverse order,repair/requeue/change settings without separate exact approval. Private follow-up packet is prepared NOT SENT;monitor remains read-only. Private configured protection is not passing runtime perimeter evidence. P0 two-file preflight PASS remains unapplied/unauthorized;hosted history11.

## P0 execution and Netlify follow-up continuity

Read docs/PROPERTY_P0_EXECUTION.md and ACTION_D_SUPPORT_FOLLOWUP.md before prior checkpoints. Owner-approved exact two-file P0 bundle applied once;hosted history13,all13 SQL bytes immutable. Original11/data/Auth/API unchanged;report-access table empty/default deny,wrappers installed but features/mappings/leases absent,adapters unwired. Never replay apply/cleanup or interpret recorded applied metadata as activation authority. All72 hosted property cases NOT RUN. One separately authorized diagnosis-only same-ticket reply SENT,no new provider findings/repair permission. Preserve frozen blocked deploy;no retry/reorder/provider repair/settings/publication without exact new approval. Release1.0 NOT READY / NOT AUTHORIZED;PR#1 draft.

## P1 final preparation continuity

Read docs/PROPERTY_P1_ACCEPTANCE_REVIEW.md and PROPERTY_P1_REVIEW.json. Proposal hash01b96075… binds75 fixture steps/57 rows,69 probes and three feature controls;UNEXECUTED/NOT AUTHORIZED. Exact IDs,payloads,control SQL and713 composite-primary-key original-row guards are ignored under .staging/property-p1/package/. Never overwrite/recompile/substitute the reviewed package or replay P0 migrations. All13 SQL/history and off gates unchanged. P1 temporary features have no TTL:require supervised30-minute window,exact partial-safe deactivation,session sign-out and independent zero-active verification under future approval. Exclusive local attempt/UUID journal is not authorization;UNKNOWN stops,never retries. Hosted72 tracking0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN;extra checklist/quantity/credit/JWT-expiry fixtures and all P2/media need separate scope. No customers/leases/mappings/permissions activated. P2 requires exact mapping/15-minute report-only lease and feature reactivation review,never broad release grants. No hosted fixture/session/grant,Netlify/provider/media/production action or merge from preparation.

## P1 execution authorization and mandatory stop

Read docs/PROPERTY_P1_EXECUTION.md and PROPERTY_P1_EXECUTION_RESULT.json. Owner
approved exact01b96075… operation, but mandatory preflight STOPPED: no P1 connected
executor or independently verified cleanup process. No Auth sign-in,feature row,
fixture/probe RPC,domain record or audit append occurred. Fresh read-only13 history,
514 catalog,713 original composite-key rows,18 actors,22 identities/four factors/
zero sessions and all off controls match. Hosted0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN.
Do not request duplicate approval of unchanged scope; first implement/review exact-
package executor,durable journal recovery and independent bounded cleanup,then
refresh mandatory preflight and owner-assisted MFA. Never run old Action B fixtures
or overwrite the frozen package to bypass prerequisites. Release1.0 stays closed.

## P1 executor implementation continuity

Read docs/PROPERTY_P1_EXECUTOR_READINESS.md and its JSON before the older missing-
executor checkpoint. New server/property/execution contains the genuine caller-bound
executor,composed private handoff,read verifier and independent cleanup process.
Offline property:p1-inspect has no execute/login option. No hosted Auth/MFA/feature/
fixture/grant action occurred;hosted0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN unchanged.
Frozen operation/four artifacts and all13 SQL bytes remain immutable. Never rewrite
historical hostedExecutor:false metadata or replay old Action B fixtures.
Future action-time gates:exact fresh reference/713-row preflight,owner-assisted
existing-factor MFA,cleanup-only pending AAL1 custody before TOTP,same-session AAL2,
15 exact live staff sessions,independent cleanup and supervised60-second renewals.
Worker heartbeat5seconds;wall/monotonic cleanup starts minute29;no native featureTTL.
UNKNOWN or failed reconciliation stops;read-only journal recovery never replays.
No automatic second cleanup attempt. Human recovery remains mandatory for host/
database/Auth outage. Existing unchanged P1 approval persists;current implementation
stops before activation. P2/media/providers/Netlify/production/outside access remain off.

## P1 adversarial readiness audit

Read docs/PROPERTY_P1_INDEPENDENT_AUDIT.md and PROPERTY_P1_SUPERVISED_RUNBOOK.md before the older implementation checkpoint. Audit read-only evidence matches13 migrations/514 catalog/713 originals/18 actors/22 identities/four factors/zero sessions and all off settings. Preserve frozen operation/four artifacts. New command gate settles pending credential custody before cleanup,blocks late activation;quote validity rechecks after waits,invalid receipt states reject,SIGHUP contains. Automatic approval review rejected the live-target cleanup-process probe;it was NOT RUN or retried. Operational deactivation/logout/recovery and genuine MFA remain unverified;NO-GO activation until later supervised gates pass. Existing unchanged-scope approval persists,no duplicate approval. No hosted writes/sign-ins/MFA,Netlify/provider/media/P2/outside action from this audit.

P1 audit reconciliation also binds exact entity type, receipt ID and event multiplicity; same-tenant UUID substitution is not accepted as valid audit provenance.

## Monterey independent recovery preparation

Read docs/PROPERTY_P1_MONTEREY_RECOVERY.md and its JSON. recovery/monterey is an offline-only Python standard-library preparation kit,no network/credential reader/hosted CLI. Never wire its mock seam to real credentials or repackage the rejected cleanup probe. Private three-file capsule copies exact frozen operation/plan/deactivation only;no activation SQL,secrets or primary journal. Durable second-Mac one-shot state is independent;proposed Auth scope=local requires separate protocol/hosted approval and preserves unrelated sessions. Primary Node24,global cleanup,13 migrations and P1 operation remain unchanged. Monterey OS maintenance/hardware/network,TLS,secure session escrow/live adapter and exact hosted verification are NOT VERIFIED;P1 activation stays NO-GO. No accounts,grants,Auth/cleanup calls,Netlify/provider/production action or merge.

## Independent recovery completion

Read docs/PROPERTY_P1_RECOVERY_COMPLETION.md and its JSON before the historical
offline-only checkpoint. Fixed HTTPS, encrypted custody/mailboxes and foreground
supervision are now locally implemented. No hosted call, credential retrieval or
installation, session or probe occurred. Do not install secrets on Monterey;
require maintained independent OS/power/network and reviewed custody. Primary
requires backup intent/session/owner-upgrade ACKs; unknown Auth creation blocks
activation and cannot be revoked by UID. New local-logout protocol preserves
unrelated sessions and requires separate exact hosted verification. No generic SQL,
Auth refresh/delete, new grants or automatic UNKNOWN retries. Preserve frozen P1
and all13 SQL; existing unchanged-scope approval persists. The rejected probe is
still prohibited; exact future hosted verification needs separate authorization.
Device pairing, scoped PAT custody, real MFA/recovery remain NOT VERIFIED; P1
activation NO-GO; Release1.0 NOT READY / NOT AUTHORIZED.

## P1 reconfirmed authorization · operational gate still blocked

Read docs/PROPERTY_P1_REAUTHORIZATION_PREFLIGHT.md before attempting the repeated
P1 authorization. Approved01b96075… scope persists; local artifact/13 SQL/source
checks pass. No maintained recovery device/custody/pairing/actual logout or complete
operator window was verified; no project request, credential read, Auth/MFA,
fixture/feature or cleanup write occurred. Do not claim fresh713/22/four/global-off
verification. Stop before hosted sign-in until independent recovery prerequisites
and separately exact recovery verification approval are satisfied. No duplicate
fixture approval, old probe retry, Monterey secret installation or scope expansion.

## P1-R0 device readiness

Read docs/PROPERTY_P1_R0_DEVICE_READINESS.md and its JSON. Owner checklist and
standalone device_facts.py are prepared; actual maintained computer/operator are
not identified/available/verified. Helper intake is not readiness PASS or physical
attestation. Keep hardware output private;no passwords/serials/recovery keys/MFA.
Do not install credentials on Monterey,run R0 on primary-only processes and claim
independence,or generate Phase C operation/hash before actual Phase B passes.
R0 cases0 PASS/0 FAIL/7 BLOCKED/0 NOT RUN;P1 tracker unchanged. Existing exact P1
approval persists. No hosted session/probe/feature/database/Netlify/provider action.

## P1-R0 owner device confirmation · October18

Owner identified the independent Monterey device and reports25/25 offline recovery
passes,hotspot and two website checks. Preserve these;do not repeat intake/tests
unnecessarily or call the device unidentified. Exact hardware/runtime facts stay
private. No privileged Monterey credentials. Seven actual cross-device cases remain
BLOCKED;offline passes/browsing are not pairing/ACK/supervision/machine-loss proof.
Prefer borrowed maintained Mac with the small existing kit;native encrypted Linux
on the Air is only a separately reviewed candidate,no install/credential approval.
Read docs/PROPERTY_P1_R0_DEVICE_READINESS.md. Preserve all13 SQL/frozen P1/approval;
Phase C exact hosted verification follows genuine Phase B PASS,not an old probe retry.

## P2 local report continuation · October18

Read docs/PROPERTY_P2_LOCAL_READINESS.md and PROPERTY_P1_GAPS_REVIEW.json. Report-only
UI/parser/caller-bound reader and nine-group offline P2 planner are local preparation;
connected routes stay closed. No new migration or duplicate CRM/financial store.
Real P2 requires actual post-P1 reports,exact customer mapping/15-minute lease/feature/
cleanup/session package and separate approval. Twelve extra staff cases are an
unfrozen proposal,never part of approved P1. Keep frozen artifacts/all13 SQL/history
and hosted0/0/24/48 unchanged;no simulated Auth claims presented as hosted proof.
Owner confirms original25 passes/two hash checks/hotspot,FileVault off,new encrypted
kit unrehearsed;preserve evidence privately,no Monterey credentials or OS replacement.

## Customer login/review local preparation · October18

Read docs/CUSTOMER_PORTAL_LOGIN_REVIEW.md and CUSTOMER_PORTAL_PROPOSAL.json. New
customer discovery/read contracts and /preview/customer-portal are local only;
connected routes/auth SDK binding remain absent. Separate server/customer SQL is
NOT a migration;all client EXECUTE/DML revoked,no activation approval. Do not apply
it or fixture grants hosted. Report-only leases never authorize estimates;issued
versions need exact separate publication/access and repair report/finding/line
provenance. Genuine approval/decline persistence remains disabled;synthetic
preferences cannot become debt,contracts,invoices or payments. Preserve13 SQL,
frozen P1,original records,hosted0/0/24/48 and recovery/Netlify boundaries.

## Customer authorization audit and workflow preparation · October18

Read docs/CUSTOMER_AUTHORIZATION_SECURITY_REVIEW.md and its validation record before
older customer snapshots. Corrected read SQL and separate workflow SQL are LOCAL
PROPOSALS,not migrations/activation permission. Preserve banned/deleted/anonymous
Auth checks,final discovery role checks and post-wait wall time. Proposed publishing
requires exact issued scope/digest/customer/property/repair selection and owner/admin
AAL2;all wrappers/table access remain revoked. Immutable review preferences are not
financial/signature/change authorization. UNKNOWN never auto-retries. Preserve13 SQL,
frozen P1 and all recovery/Netlify/provider boundaries;hosted0/0/24/48 unchanged.

## Customer authorization release preparation · October18

Read docs/CUSTOMER_AUTHORIZATION_RELEASE_REVIEW.md,its migration/validation records
and separate approval register before older proposal checkpoints. One formal LOCAL
pending migration adds default-disabled customer workflows;all13 historical bytes
stay immutable. Never apply it,grant execution,change hardcoded capabilities,sign in
customers or activate callbacks/mappings/leases from local passes. Preserve exact
caller/session binding,post-wait guards,ban/deletion/role checks,shared immutable
parent locks,conflict-safe receipts and UNKNOWN no-retry semantics. Closed customer
routes must not initialize staff Auth. Execute unchanged P1 against13 history
before customer14;do not modify frozen P1 or ask duplicate approval. P2 fixture IDs
need genuine P1 reports first. No rejected recovery probe,Netlify/provider/media/
financial/production action or merge is authorized by this local preparation.
