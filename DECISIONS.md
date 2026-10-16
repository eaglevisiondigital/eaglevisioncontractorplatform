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

## 2026-10-15 · owner-approved development and internal Release 1.0 workflow

1. Owner explicitly approved the EXISTING contractor Supabase project for INTERNAL
   DEVELOPMENT; a new staging project is no longer required. Record identifiers
   privately, not in the public repository. Designation is not permission for
   hosted migrations/deployment/configuration/identity or provider execution.
2. Provision and independently validate a separate CLEAN production DB before
   outside access/launch. Never promote/restore synthetic development data into
   production. Release 1.0, production deploy, merge and outside access remain gated.
3. Read-only identity/config review verified empty Supabase and all-deploy Netlify
   team-login metadata. Auth signup/automatic table exposure remain on; redirects
   remain localhost defaults. These require reviewed hardening; no setting changed.
   Current anonymous404 does not prove an application/function perimeter works.
4. Build a default-off internal laboratory over the same tenant architecture,
   separate from disabled production modules. Operator-managed expiring grants and
   verified Auth/current-role MFA/customer mappings govern connected access. Sample
   role switching is synthetic only. No service-role generic request API or fallback.
5. Preserve immutable customer-safe issued scope through offers, decisions, test
   electronic consent/contracts, branded invoices, explicit one-time synthetic
   payments, refunds and balanced receivable/sales/tax/clearing records. Root locks
   serialize acceptance/revision; accepted scope cannot be republished as duplicate
   full-contract billing. Existing job/labor/payroll calculations are unchanged.
6. Real email delivery remains off. Tenant sender configuration is unverified until
   independent provider proof; changes reset status. Internal sinks are not sent
   messages. Legal/e-sign-provider validation, credit-note/change-order conversion,
   real sender/webhook workflows and hosted acceptance remain release dependencies.
7. Implement fixed-endpoint sandbox-only Authorize.Net/NMI token adapters with
   exact money, scope binding, required durable reservation contract and UNKNOWN
   outcomes. No actual provider call, tokenization UI or authoritative provider
   intent-store/reconciliation integration. Synthetic consent cannot authorize it.
8. Implement private durable document lease/CAS SQL and Supabase metadata adapter;
   strict extraction unknown-field rejection and late grant checks. Keep bytes and
   metadata separate: staged clean objects remain private until valid CAS. Approved
   object transport, isolated runtime, real scanner/AI and retention cleanup remain
   gates. Preserve all upload denials and ingestion503.
9. Review all nine unapplied migrations using the public offline digest bundle,
   checked for drift in CI. The first seven historical files remain unchanged.
   Auth/Storage SQL fixtures never run hosted. Actual identities/TOTP/HTTP acceptance
   and protected deploy require separate concrete action authorization.

### Sandbox authority must survive asynchronous boundaries unchanged

Copy/freeze primitive gateway configuration, credentials and capture inputs before
any reservation await. Use canonical explicit digest fields rather than caller
property order; recheck expiry before transport. Treat invalid reservation/replay
metadata as a hard failure. Expiry after a successful reservation is persisted as
UNKNOWN with no provider request, requiring explicit operator reconciliation rather
than an unsafe automatic retry. Eleven synthetic regression cases cover mutation,
expiry, canonical binding and invalid stored metadata. No migration or activation
is part of this follow-up; the nine-file reviewed migration bundle is unchanged.

### Execute only the approved development bundle · October 16

Owner explicitly authorized the nine-file checksum at reviewed018ef8b. Verified
clean commit, unchanged bundle, empty application/history/Auth/Storage baseline,
settings and protected Netlify identity; compared the CLI dry-run's exact ordered
list/no seeds/no roles before applying with explicit target and skip-vault. All nine
versions now agree hosted/local. Do not repeat or edit these historical migrations.
Post-migration catalog/advisors/types are recorded in DEVELOPMENT_MIGRATION_RESULT.md.
Official RPC types differ only in nullable argument/no-argument generator conventions;
normalization preserves names, defaults, table nullability, enums and return types.
Do not overwrite committed types or claim connected workflow acceptance. Performance
findings require separately reviewed forward changes. After extra action-time owner
confirmation, dashboard Auth/API saves completed and persisted. A broader default-ACL
cleanup was rejected and not applied; do not retry it indirectly or claim all
PostgreSQL defaults were removed. Outside access,
identity provisioning, protected deploy, provider execution and production remain gated.

### Separate preflight evidence from connected acceptance

Add a GET-only preflight with explicit private target/read-action reference/expiry
and modern publishable key; never infer tenant security from empty tables. Real
preflight56PASS/0FAIL is independent of future22-identity/three-company acceptance.
Plan genuine human TOTP via the existing component, no fabricated JWT/factors.
Keep account creation, fixtures/workflow writes, private grants and protected deploy
as four reviewed actions. No hosted writes are authorized by this preparation.

Independent privilege review found no current object exposure requiring immediate
broad revocation. Review narrow future-object defaults separately; leave existing
RPC/service/provider-owned privileges intact. Do not bypass the previous rejection.
Exclude private .staging evidence from lint/format as well as Git, so local generated
catalog artifacts cannot contaminate checks. Full connected matrix, blockers and
Netlify404 limitation are recorded in CONNECTED_ACCEPTANCE_PLAN.md/the checklist.

### Fail before account creation when credential storage is unavailable

Action A now has owner authorization, but the secure Keychain preflight did not
complete. Stop before createUser, do not fall back to plaintext files/logs/argv,
and do not perform human MFA silently. Auth Admin read access works; zero accounts
or permissions were created. Preserve the stopped private run record and require
a working approved secret store plus fresh drift check before controlled retry.
See ACTION_A_RESULT.md; no need to repeat the existing Action A authorization.

### Action A controlled retry and genuine MFA handoff

The first secure-storage stop was a local string-only parser bug, not evidence of
Keychain unavailability. Correct typed parsing/explicit credential projection and
validation-only valid/malformed checks preceded a fresh zero-user drift check and
controlled retry. Exactly 22 confirmed synthetic Auth users and 22 encrypted Keychain
records now exist; no password file/log/argv persistence and no grants/company data.
Stop at genuine human TOTP: 0/4 verified, 0 sessions. Never recreate the roster or
fabricate MFA. Preserve the existing Action A approval for owner-assisted continuation;
Actions B/C/D remain unapproved. See ACTION_A_RESULT.md for exact evidence/handoff.

### Action A completion with genuine owner participation

Reuse the existing 22 identities and Keychain passwords; no creation/reset or role
assignment. A temporary loopback-only helper signs in with a publishable Auth client
and reuses the existing MFA component. The owner scans each genuine QR and enters
the code directly. All four identities passed fresh Auth identity, signature-verified
claims, AAL2 and verified-factor checks; independent SQL confirms four verified
factors, no pending factors and no remaining sessions after sign-out. Stop/close
the helper; retain only status evidence. AAL1 platform denial also lacked grants,
so it cannot alone establish MFA-only enforcement. Actions B/C/D remain unapproved;
full tenant/workflow acceptance and Release 1.0 launch remain pending.

### Action B stops at separately controlled platform bootstrap

The owner authorized company/member/domain fixtures through checked RPCs only.
Hosted inspection confirms that provisioning requires AAL2 and an active private
platform_admins row; no row exists. Action C explicitly owns that bootstrap and
remains unapproved. Stop without domain writes, logins or a service-role/SQL bypass.
Record 0 organizations/memberships/domain fixtures created; connected cases NOT RUN,
with infrastructure/grant dependencies BLOCKED and read-only checks separately PASS.
Do not request Action B approval again; review a narrow platform-only Action C row
with operator-enforced expiry/revocation before resuming. See ACTION_B_RESULT.md.

### Final Propel visual identity

The owner supplied the emerald/mint PNG after the missing-asset handoff. Copy it
unchanged and verify its hash; centralize Propel Contractor Suite by Eagle Vision
identity across all platform surfaces/metadata while preserving contractor-specific
branding. Keep repository/package/infrastructure identifiers, historical migrations,
original README and existing MFA factor/Keychain identities stable. Rebrand locally
and provide actual responsive screenshots; no deployment or release permission.
See BRANDING.md.

### C1 preparation is not execution authority

Verify the platform-only operator's exact private roster UID/email against hosted
Auth without printing identifiers. Prepare one guarded INSERT and exact-UID
active=false cleanup, with both concrete SQL hashes and target binding in ignored
operator evidence. Public SQL templates contain placeholders and no execution path.
A fresh genuine AAL2 session is required before activation/platform RPCs; no account
or MFA reset. Use a 30-minute maximum supervised window, revoke earlier after setup
or error. The current table has no TTL; do not claim autonomous expiry or rely on
logout to invalidate existing JWTs. Test the SQL in isolated fixtures and require
real same-session denial plus independent read-back during eventual cleanup. No
hosted activation/revocation/Action B resume until separate exact owner approval.

### C1 approved execution waits for fresh human MFA

The owner approved the exact reviewed target-bound operation hash. Reverify all
roster UIDs, factors, SQL hashes, migrations, saved Auth boundaries and independent
cleanup channels. Keep grant/provisioning unarmed until genuine existing-factor
AAL2 and the reviewed five-minute session limit pass. Close an unattended stale
AAL1 wait rather than weaken the guard; preserve its record and reset the local
sign-in handoff without requesting the same approval again. No grant or company
write occurred. See ACTION_C1_EXECUTION.md for current state and fixed RPC/cleanup
plan; broader private grants/deployment remain unapproved.

### C1 executed once; revoke before tenant-domain continuation

The owner completed genuine existing-factor MFA. The reviewed stale-session guard
rejected earlier authentication waits without grant activation; it was preserved.
A fresh exact operator session passed all checks. Activate only the approved one-row
operation, provision/configure exactly three companies using normal caller RPCs,
then immediately deactivate the row and prove denial with the same AAL2 session
before global sign-out. Actual window was 08:46:00–08:46:40 UTC October 16, 2026,
well below 30 minutes. Independent reads confirm inactive grant, no operator
membership/session and unchanged 22 identities/four factors/nine migrations.
Retain the inactive row and evidence; never replay the INSERT or duplicate tenants.
Continue approved Action B under fresh human-assisted company-owner sessions.
Full tenant/role/domain acceptance is NOT RUN; scanner/private-release dependencies
remain BLOCKED and deployment NOT RUN. Record the leaked-password-protection advisor
warning separately without changing saved Auth controls or claiming launch security.
See ACTION_C1_EXECUTION.md and ACTION_B_RESULT.md. Release remains closed.

### Action B owner sessions and fixed core acceptance plan

Reuse the three C1 companies and existing owner/employee identities. No operator
reactivation or new private grant. Challenge existing owner factors through a
loopback-only helper with all credentials/sessions in memory, then use checked
invitations and ordinary JWT/RLS APIs for company fixtures. Validate the fixed
scenario against disposable local SQL first; label its 687 cases LOCAL, retain
nine scanner/positive-object/private-release BLOCKED groups and do not weaken the
full 50-table harness. Current real GET-only preflight is 56 PASS/0 FAIL; fresh
owner MFA is still pending, authenticated domain cases NOT RUN and new rows zero.
Review native Pro-or-higher leaked-password protection; no setting/billing change
without separate approval. See ACTION_B_CONNECTED_RESULT.md for safe continuation.

### Action B core executed; preserve fixtures and blocked release boundaries

Three owners completed genuine existing-factor MFA. Verify exact real Auth/AAL2/
session bindings, then execute the fixed normal-client scenario once. Actual core
687 PASS/0 FAIL plus supplemental staff read-only36 PASS/0 FAIL; anonymous boundary
56 checks passed before/after populated fixtures. Do not relabel the preceding
687-case LOCAL dry run as this hosted evidence. Retain 15 new memberships (three
revoked), 15 accepted invitations, 219 domain rows and 354 audit events; never replay
the fixture creation plan or delete unfavorable/immutable records. Exact independent
financial/security counts and all-session sign-out are verified. No new company,
identity, factor, private grant, Auth setting or schema was introduced; C1 inactive.

Nine source/positive-object/private-release groups stay BLOCKED, with full matrix,
protected browser/perimeter and independent launch/provider/jurisdictional validation
NOT RUN. 723 core passes are not launch approval. Review exact later grants/scanner
infrastructure, supported Pro-or-higher leaked-password remediation and separate
Action D before advancing those gates. See ACTION_B_CONNECTED_RESULT.md; all later
privileged owner work requires fresh genuine MFA, not stored session tokens.

Leaked-password remediation entitlement review: read-only lookup confirms current
Pro support, so no plan upgrade is required for the documented native option.
Recommend separately approving only that Auth toggle plus disposable rejection
validation; preserve all existing controls and accounts. No settings/billing change.

### October 16 · enable only owner-approved native leaked-password protection

Use the official Management API's one-field `password_hibp_enabled: true` PATCH on
the privately pinned development target after verifying current Pro entitlement,
signup/API boundaries and the exact current configuration. Compare independent
before/after reads: only that field changed among 243 returned Auth fields; API
configuration and all database identity/password/factor/session/permission/security
fingerprints stayed unchanged. Security advisor warning cleared; 12 informational
private-table notices remain. No account/password/session operations, grants,
policies, deployment or billing changes were authorized or performed. Keep credentials
and raw configurations in memory; retain only hashes/status in ignored evidence.
Existing-password tests and disposable account tests remain NOT RUN under this
limited approval. Record the result without claiming Release 1.0 readiness.

### October 16 · freeze Action D artifacts without deployment authority

Export application 28c7d5e, use its exact lockfile and privately verified development
browser configuration, preserve the approved PNG and production build rejection.
Build portable v2 Node24 functions without workspace symlinks; verify unpacked
fail-closed behavior with zero outbound requests. Record SHA-256 hashes publicly,
while targets/browser configuration and prepared operation remain ignored/private.
Independently read Netlify dashboard Private production/previews, unlinked Git and
empty site environment; reverify Supabase Auth/API/database gates without sessions
or changes. Never infer runtime perimeter proof from configuration or a404.

Propose official file-digest draft creation with explicit runtime/route/bootstrap
metadata and three Functions-scope deploy-specific values. Current CLI function
cache expires after two minutes and stale ZIP fallback loses metadata, so ordinary
no-build deployment is not an interchangeable reviewed action. No remote build,
primary/alias publish, site change, callback wildcard or new grant. Fresh effective
shared-environment/protection review, exact operation approval, internal Netlify
operator and owner-assisted MFA precede later protected acceptance. Existing callback
settings support current password/TOTP; new redirect flows need separate review.
See docs/ACTION_D_REVIEW.md; no deployment or launch occurred.

### October 16 · stop writes on the pending Action D provider failure

Owner authorized one exact frozen draft upload. Verify all hashes, target, current
Private/all-deploy protection, empty site/shared environments and unchanged saved
Supabase gates. Create once; an omitted optional draft response field initially
paused uploads. Independent real reads verified manual deploy-preview and no primary
publication before continuing that same ID with four reviewed function ZIPs. Never
claim the missing field was returned true. Same-ID finalization sent the identical
approved manifest and received HTTP500; stop further writes and preserve the pending
record, rather than recreate/rebuild/publish. No ready state, runtime security or
connected browser pass is claimed. Keep all original hashes and private evidence,
read-only diagnostics first and separate review for changed/replacement actions.
See docs/ACTION_D_EXECUTION.md. Existing identities/factors/zero sessions, RLS,
permissions and execution gates are independently unchanged; release stays closed.

### October 16 · diagnose the original deploy without recovery writes

Preserve the original pending ID/package and separate provider projections: four
Functions in deploy-scoped dashboard, no available functions in deploy metadata,
zero files in deploy-specific registry, and no historical deploy-log entries.
The original500 body/request ID was discarded; do not retry writes to obtain it.
Direct digest deploys post-process automatically; CLI manifest update occurs before
blob upload, so the earlier post-upload PUT is not a universally required finalizer.
Root cause remains unresolved; recommend owner-authorized Netlify diagnosis before
any separately reviewed same-ID repair. Prepare private support/conditional-operation
reviews without executing or messaging. No replacement, publish, settings change,
Supabase call or hosted acceptance claim. See docs/ACTION_D_RECOVERY.md.
