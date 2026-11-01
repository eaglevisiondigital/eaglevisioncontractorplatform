# Phase 3A · isolated staging readiness and hosted acceptance

## Effective owner update — connected development

The owner now approves the EXISTING contractor Supabase project as INTERNAL
DEVELOPMENT with the supplied protected Netlify staging site. A separate staging
Supabase project is no longer required. Earlier “existing target unapproved” and
new-staging-project requirements below are historical and superseded by
**CONNECTED_DEVELOPMENT.md**. Exact IDs remain private. Auth/API hardening,
migration execution, synthetic identity provisioning, provider calls and deployment
still require action-specific review/authorization. None occurred.

A separate CLEAN production DB must be provisioned and independently validated
before outside access/launch. Never promote/restore this synthetic development DB.
Use the current nine-file MIGRATION_REVIEW.md / MIGRATION_BUNDLE.json rather than
an older seven-file plan. development:* scripts alias the existing staging tooling;
internal-development manifests require separate-clean-production policy and prohibit
promotion. A future production ref belongs on the private forbidden-target list.

The supplied Netlify identity is verified with team login required on ALL deploys.
No application protection was proven by the current404; repeat real root/alias/
asset/function perimeter tests after a separately authorized protected deployment.
Current Auth signup and auto-table exposure remain on and need hardening; TOTP is
on, default localhost URL/no redirects remain. No security settings were changed.

## Status and read-only inventory · October 15, 2026

**Engineering preparation available; hosted acceptance BLOCKED / NOT RUN.**
Release 1.0 is NOT READY. Internal milestones do not authorize outside access; see
RELEASE_1_0_ACCEPTANCE.md. The existing Supabase project is not approved staging.

Read-only connector audit found the Eagle Vision Supabase project healthy on
PostgreSQL 17.11, with zero public tables, buckets, migration entries, Edge Functions
and development branches. No hosted configuration was changed. This does not prove
Auth, mail delivery, network restrictions, backups or Data API settings are safe.
Those settings require explicit inspection of the eventually approved target.
Private project/account identifiers and inventory exports are deliberately omitted.
Unrelated projects and the separate Straight Edge marketing website are not staging.

Netlify inventory exposes no clearly named contractor-platform project. The existing
marketing sites must not be reused. No environment values were retrieved, no site
was connected and no build/deploy was triggered. Exact repository linkage and
protected site configuration must be confirmed when the owner selects the target.

GitHub repository is public; PR #1 remains open/draft on codex/phase-1-foundation.
CI is secretless and local-only, with no deployment or hosted migration workflow.
Repository environment list and Actions secret-name list were empty. The classic
main branch-protection API reported “Branch not protected.” Rulesets/organization
policies and external Git integrations were not exhaustively audited. Configure
required reviews/checks and protected internal staging approval after authorization.
No GitHub settings were modified. CI success is not release approval.

## Prepared tooling (no hosted calls by default)

- `npm run staging:plan`: offline ordered migration filenames, individual SHA-256
  digests and a bundle digest. Includes the additive release-control migration;
  never links a project, runs SQL, deploys or accesses credentials.
- Copy config/staging/manifest.example.json into **.staging/manifest.json** (ignored).
  An internal operator fills only the explicitly approved isolated target, distinct
  synthetic company IDs, all non-staging forbidden refs, approval evidence reference
  and expiry within seven days. The template is deliberately invalid until reviewed.
  Never place tokens, evidence exports or infrastructure references in tracked files.
- `EV_STAGING_MANIFEST` points to that private file. `npm run staging:validate`
  validates identity/expiry/three-company shape offline. It cannot establish that
  an approval exists or the target is actually isolated; the operator must verify.
- `npm run staging:verify` is opt-in real Auth + PostgREST SELECT-only acceptance.
  It requires `EV_STAGING_READ_APPROVAL` equal to the actual approval reference,
  `EV_STAGING_PUBLISHABLE_KEY`, and three owner session JWTs named by the manifest.
  Obtain real AAL2 sessions using real Auth/TOTP, never forge a JWT/SQL claim.
  The harness verifies distinct Auth identities, AAL2, every public tenant table's
  positive control and all six ordered cross-company read denials, plus anonymous
  denials. Empty fixtures/schema errors fail; absence is never called isolation.
- `node scripts/staging-readiness.mts workflows` additionally requires
  `EV_STAGING_WRITE_APPROVAL`, plus ignored `EV_STAGING_SCENARIOS` JSON. This opt-in
  internal RPC assertion runner is for separately approved **synthetic writes only**.
  Operator-authored cases must cover all six domains for all three companies.
  Steps have unique IDs, allowlisted internal RPCs, manifest-bound `p_org`, session
  env names and exact expected response assertions or PostgreSQL error codes.
  `{"$ref":"create.version.id"}` references an earlier response; no evaluation,
  URL fetching or arbitrary SQL is supported. All actors are verified with Auth.
  The runner has no live financial, messaging, signature or deployment RPCs.
  Transport tests are synthetic and must not be reported as real extraction/tests.
- scripts/sql/staging-verification.sql is a read-only post-migration catalog check.
  Review empty violation results, three private buckets, expected read-only Storage
  policies and zero enabled unfinished modules. Run hosted advisors separately.

Readiness tooling never seeds identities, sends invitations, enrolls MFA, runs
migrations or deletes hosted fixtures. The manifest is a guardrail, not authorization.
Protect local session files with owner-only permissions; use short-lived sessions,
no shell tracing, no response-body logging, no public CI artifacts and revoke after
acceptance. Re-run expired approvals/sessions through the normal operator process.

## Configuration and approval checklist (separate hosted actions)

1. Owner explicitly selects/approves a new isolated Supabase project or isolated
   branch and a separate protected Netlify site, budget/region/retention and internal
   operator access. No outside staff/customers. Identify forbidden production refs
   privately; confirm project identity independently in the dashboards.
2. Separately approve the reviewed commit and migration bundle. Pin CLI from the
   lockfile. Keep scoped Management API credentials/DB password in approved secret
   storage; no global shared credential or provider secret in browser variables.
   Audit Data API exposes public only (not private); explicit grants/RLS remain.
   Auth redirects must list only isolated origins; disable public signup and all
   outbound mail/SMS paths. Create synthetic verified identities without sending.
   Enable real TOTP and confirm actual AAL1 denial/AAL2 success.
3. Netlify Builds: NODE_VERSION=24; VITE_SUPABASE_URL and
   VITE_SUPABASE_PUBLISHABLE_KEY point only to the approved staging project.
   Functions: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY same target. Keep
   PUBLIC_INTAKE_ENABLED=false; no gateway/CAPTCHA/provider credentials initially.
   Configure `EV_ISOLATED_STAGING_BUILD=approved-internal-only` in **Builds scope**
   for the approved deploy-preview/branch-deploy only, BRANCH codex/* or staging.
   The committed guard rejects production context unconditionally, even with that
   variable set. It does not replace site access protection or deployment approval.
   Configure password/team protection before any approved internal preview deploy,
   verify unauthenticated requests and APIs are blocked and no indexed public access.
   Never share a staging password/session with an outside contractor or employee.
4. For a later intake-only test, separately approve Turnstile test site/secret,
   exact hostname/origin, independent gateway and HMAC secrets, and reviewed scoped
   DB gateway hash. Functions scope is required; TOML build variables do not supply
   runtime secrets. Keep messaging disabled and all test inputs synthetic.
5. For document processing, approve every gate in MATERIAL_IMPORT.md and
   PHASE3A_WORKER.md. Credentials do not activate ingestion: endpoint remains 503.
   Scanner/gateway/control store identities, resource-isolated workers and storage
   transitions require deployment/integration work and explicit activation review.
6. Authorize a protected staging GitHub environment, required reviewers, required
   local checks and narrowly scoped secrets only if a manual hosted workflow is
   later approved. Do not add automatic deploys on push/PR/main. Confirm external
   Supabase/Netlify Git integrations cannot auto-deploy the draft branch.

## Migration procedure (prepared, NOT executed hosted)

1. Freeze reviewed commit; run check/format/browser/native PG17 and `staging:plan`.
   Retain plan digest privately with approval. Never edit historical migrations.
2. Independently verify approved staging identity and current migration history.
   Fresh targets expect no history. A partially migrated/nonempty target requires
   an explicit drift review. Never use --include-all/history repair to hide drift.
3. Inspect pinned CLI help before actual execution. The reviewed syntax supports
   `supabase db push --project-ref <approved-ref> --dry-run --skip-vault` and
   `supabase migration list --project-ref <approved-ref>`. Dry-run is not permission
   to execute; --skip-vault avoids the CLI's vault updates. Run only after target
   approval; keep secrets out of command arguments/history/logging where possible.
4. Compare dry-run versions/order against offline digest and current history.
   Separately approve `db push --project-ref <approved-ref> --skip-vault` for that
   exact target/commit. Never include seed/roles, reset, migrate production, or run
   tests/database/bootstrap.sql: local mocked Auth/Storage are not hosted schemas.
5. Verify recorded history, SQL catalog script, bucket privacy/policies, public
   grants/private exposure and advisors. Compare official generated public types
   structurally (nullability/RPC signatures/enums) to committed catalog-derived
   types; formatting output differs. Any real drift is a blocker, not auto-overwrite.
6. Only then provision synthetic acceptance fixtures with reviewed checked RPC/UI
   and approved internal operator tooling. Record no real financial/customer data.
   Hosted migrations/config remain outside this PR's performed actions.

## Three-company connected acceptance matrix (NOT RUN)

Prepare distinct accounts and fixtures for **Straight Edge Property Services**,
**Cunningham Construction**, **Sample Roofing Contractor**. Each company needs an
owner/admin AAL2, estimator, office supervisor, assigned field worker, unassigned
staff, revoked user and nonmember customer identity. Also a platform-only AAL2 user.
Do not give these accounts to outside people. Use .test addresses and synthetic
contact/price/payroll information. Same item names and supplier references across
companies deliberately expose accidental shared lookup/cache keys.

Seed at least one authorized row in **every** table named by tenantTables in
server/staging/acceptance.ts. This includes reviewed expenses, approved clean
import source/approval/row mapping, options/schedules/attachments, supervisors,
locked payroll plus later adjustment. Real scan-clean fixtures must go through an
approved worker; never mark an uploaded real file clean via SQL or a fixture flag.
Until that worker exists, the full SELECT suite is blocked, rather than vacuously
passing missing positive controls. Clean synthetic operator fixtures can validate
Storage/RLS independently but cannot establish real document processing acceptance.

| Domain                    | Connected positive path / exact assertions                                                                                                                                       | Negative / consistency cases                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding / CRM / intake | Provision via platform AAL2; activate internal synthetic tenants; unique profiles/logos; create customer/location; approved CAPTCHA test routes to correct tenant                | Six ordered tenant pairs; foreign IDs/locations, forged metadata, AAL1 admin, revoked membership, disabled module/suspended org; platform-only cannot read business data                                                   |
| Estimates                 | create_estimate → save_estimate → issue_estimate → revise_estimate; exact engine-v1 price/tax/discount/schedule values; historical snapshot unchanged                            | Concurrent number allocation/stale save, foreign customer/catalog/tax/document, unknown financial fields, issued mutation and private-cost customer projection                                                             |
| Supplier imports          | begin_material_import → quarantined state; approved worker processes two PDFs/photo/CSV from multiple vendors → explicit reviewed approval/apply; exact line/total/markup values | Client scan-state/byte writes, pre-scan/foreign reads, corrupt/encrypted/active PDF, scanner outage/stale evidence/digest mismatch, ambiguous quantity/cost, duplicate/replayed source, stale approval; no automatic issue |
| Job expenses              | approve_job from internal issued snapshot; submit_job_expense → review_job_expense; commitment/payment/credit exposure; reviewed purchase against assigned job                   | Foreign job/source/worker, duplicate supplier reference/source row, credit greater than paid, source purpose mismatch; proposed addition cannot increase billing; authorized CO immutable                                  |
| Timekeeping               | record_time / submit_time / review_time; time_clock switch and breaks; own/assigned-team visibility; immutable correction                                                        | Real separate-session concurrent overlaps/open clocks; midnight/DST/offset precision; foreign/unassigned job, revoked supervisor/worker, locked period, no rate exposure                                                   |
| Labor costing             | job_labor_summary before and after locked preparation; exact cash + burden + imputed, billing value separate, posted once                                                        | Estimator sees aggregate only; no rates/deductions; invoice-costed worker not time cash; foreign RPC denied, revision cannot change baseline                                                                               |
| Payroll preparation       | prepare_payroll preview → lock complete closed reviewed week; export exact regular/OT across jobs and overhead; later adjust_payroll enters next period once                     | AAL1, field/supervisor/estimator rate access denied; partial week/unreviewed/open clock/salary rate change rejected; concurrent lock, immutable snapshot/deductions and no execution                                       |
| Storage / worker          | Actual Storage HTTP: authorized clean bytes, same digest; private logo; job-scoped receipt                                                                                       | Anonymous, cross-tenant, quarantine, revoked member, replacement/delete and all browser writes denied; stale lease cannot publish; failure stays unavailable                                                               |
| Internal connected UI     | Three-company desktop/tablet/mobile, real sessions, server errors, branding and exact customer-safe preview                                                                      | No synthetic fallback; no hidden unfinished nav; direct unsupported URLs leak no data; accessibility/manual keyboard and screen reader                                                                                     |

Author workflow JSON using Step schema in server/staging/workflows.ts. Example
step: `{ "id":"create", "rpc":"create_estimate", "args":{"p_org":"<pilot-uuid>","p_payload":"<complete EstimateInput object>","p_key":"<new-uuid>"}, "tokenEnv":"EV_STAGE_PROPERTY_JWT", "expect":{"assertions":[{"path":"version.status","equals":"draft"}]}}`.
Next steps reference `create.estimate.id`, `create.version.id`, and
`create.version.lock_revision`. Replace the placeholder string with the actual
versioned input object; expected arithmetic must be independently calculated.
Assertions may compare exact values or validate a scalar UUID/safe integer/array;
void RPCs returning HTTP204 are checked as null. Group scenarios by module/company.
Use exact SQLSTATE assertions for deliberate
denials. Review the case plan before granting synthetic-write approval. The harness
is prepared; the operator-specific connected case data and actual hosted run remain
pending target/fixture provisioning. It does not claim all matrix cases automated.

## Stop, rollback and recovery

No automatic destructive down migration or hosted cleanup is provided. Before any
approved staging migration, record baseline history and confirm backup/restore
availability, retention, restore permissions and access-protection settings. New
empty staging can be discarded/recreated **only with separate owner authorization**;
never reset the existing hosted project. Backup restore drills must target another
approved isolated environment and preserve no production/user data here.

On migration failure: stop application/worker writes, retain redacted error/version
and inspect actual history/catalog. Do not assume all earlier files rolled back;
transaction boundaries differ per file/CLI. Prefer an additive reviewed forward fix
and repeat local+hosted acceptance. Do not repair history or rewrite a successful
migration to make the history look clean.

On app/worker regression: disable internal site access and worker claim capability,
keep ingestion503/intakeoff, revoke only isolated worker/provider credentials after
review, and roll back to the last compatible staging artifact only after schema
compatibility review. Immutable issued estimates, baselines, approved costs and
payroll snapshots must never be edited/deleted to undo a deployment. Test-only
corrections remain append-only. Real migrations, rollback deploys, resets and
credential changes are separate hosted actions requiring explicit authorization.

Collect a private evidence index: commit/bundle digest, exact target approval,
operator/time, Auth/TOTP/HTTP results, advisor reports, screenshots, scanner/model/
signature versions, resource/lease/failure tests and unresolved findings. Public docs
contain only synthetic summaries. No launch claim until Release 1.0 checklist and
explicit owner launch approval are complete.

Sources checked: [Supabase environments](https://supabase.com/docs/guides/deployment/managing-environments),
[Supabase deployment](https://supabase.com/docs/guides/deployment),
[Netlify variables](https://docs.netlify.com/build/environment-variables/overview/).
Current changelog reviewed for November 10 TLS cipher deprecation; modern clients
are required. No hosted action was taken in response.
