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

### October 16 · submit diagnosis-only Netlify support request

Owner explicitly authorized the redacted prepared support packet. Use the existing
Netlify web form/private account channel; retain identifiers/correspondence privately.
Support acknowledged receipt and requested scope confirmation for agent routing;
confirm the accurate summary in the same thread, restating no corrective action.
No extra owner confirmation is needed for this necessary diagnosis-only routing
reply. Receipt/confirmation is not a root-cause finding or verified agent assignment.
No repair/requeue/retry/replacement/publish/delete/settings action is authorized.
Document any later recommendation exactly for separate owner approval. No duplicate
request or automatic monitoring. See docs/ACTION_D_SUPPORT.md.

### October 16 · advance provider foundations locally while deployment is blocked

Preserve the pending Netlify deployment, original frozen artifacts and approved
migration bundle. Build server components with synthetic injected transports and
local SQL only; no new public function, provider credentials or activation flags.
Worker byte service is a separately authorized implementation dependency, not an
SSRF-capable object URL or Storage-policy bypass. Normalize image metadata and
recheck authority before AI after remote staging.

Implement sandbox payment reservation/refund/receipt persistence as an explicit SQL
proposal outside migrations. A separate provider authorization/digest is required;
laboratory consent cannot authorize it. No privileged request client/control role.
UNKNOWN stays unretryable and reserves refundable capacity; settlement is a separate
immutable fact. SQL strips no data silently: unexpected result fields are rejected.
Use NMI payment nonce-dot-body signing, not the unrelated underwriting signature.

Advance sandbox signature evidence and DocuSign draft preparation without certifying
legal signatures or implementing live sending. Preserve exact signed bytes and
source/signer/account/consent binding; durable evidence store and cryptographic/legal
review remain gates. Tenant sender verification is account/domain/profile-bound;
receipts expire and never verify existing hosted profiles. Prepare escaped messages
only, delivery disabled; actual outbox/DNS/inbox/suppression remain reviewed work.
See docs/RELEASE_PROVIDER_FOUNDATION.md. All existing branding and release controls
remain; independent review and exact later target/provider actions require approval.

## Provider readiness: separate schema from activation

- Promote the payment proposal to one formal forward migration for local review;
  preserve the exact approved historical nine-file manifest. Record the new hash
  separately as PENDING_REVIEW_NOT_AUTHORIZED. No hosted execution is implied.
- Use private fixed command functions under a separately reviewed, tenant/service/
  scope-bound database LOGIN, not an owner/service key or browser JWT. No role,
  grant, authorization, sender/delivery binding or agreement binding is bootstrapped
  by the migration. Genuine consent/invoice/accepted-scope provenance remains a gate.
- Persist provider observations/reconciliation as immutable evidence; never retry
  UNKNOWN, clear refund capacity or edit original attempts automatically. Compare
  exact integers and reject stale transaction snapshots, keeping unresolved counts.
- Persist email preparation with a database-disabled delivery state and conservative
  suppression; retain no rendered address/body/bearer-link data in the outbox/audit.
- DocuSign uses demo-only read preparation and immutable create-only evidence;
  application AAL2 and provider/legal authentication are distinct. Require independent
  PDF/CMS/trust/timestamp/OCSP/CRL validation. No legally valid signature is claimed.
- Verify document workload signatures against pinned expiring public-key trust;
  never follow JWT key URLs. Isolated runtime enforcement/object catalog/scanner/AI
  and orphan cleanup remain separately provisioned and independently verified gates.
- Sandbox runner defaults to an offline NOT RUN plan. Exact private approval hash,
  approved test account, scoped Keychain secrets and durable authority are required
  before real calls. Synthetic transports can never count as provider acceptance.
- Bound test-file workers/setup timeout for multiple disposable migration catalogs;
  retain explicit independent-connection native PostgreSQL concurrency tests.

Read docs/PROVIDER_INTEGRATION_READINESS.md and its approval matrix before continuing.
Netlify support diagnosis is pending; no deployment repair is authorized.

Provider audit review fixed a direct-database attribution hazard: such a workload
can set JWT-related settings. New provider triggers therefore never use auth.uid()
for a human actor. Successful guarded commands append the database capability ID,
and entity changes use content-free events with actor_id NULL. A negative regression
proves fabricated JWT sub claims cannot forge a human provider audit event. Existing
application audit functions and hosted data/policies are unchanged. Capability
lifetime is SQL-constrained to30minutes, with immutable expiry and current-time
checks; extending access requires a separately reviewed new identity/capability.

## October16 · exact provider migration review is NO-GO

Review the requested hash without silently repairing its bytes. Native PostgreSQL17
reproduced expiry while waiting on an unchanged workload/merchant row: a command
admitted before expiry can reserve after expiry. A row lock serializes tuple
revocation but does not reevaluate wall time automatically. Define any bounded
in-flight completion exception explicitly; strict expiry requires current-time
checks after waits/before new effects, including related authorization/binding
boundaries. Existing expired-at-entry/revocation tests do not cover this race.

Terminal status/result CHECKs also permit SQL NULL through UNKNOWN; the normal
finish command rejects it and workloads have no DML. Enforce the durable table
invariant independently before approval. Keep financial evidence append-only.

The exact SQL/history remain unchanged. Hosted nine-migration/catalog/column-grant
comparison and one-file CLI dry run PASS;216 native regression tests PASS while
three additional assertions FAIL (two distinct findings). Passing earlier suites
do not override these failures. Keep schema-only activation separate: no provider
role, private grant, binding or capability is authorized. Correct a successor only
under subsequent local-remediation scope; require new hash/review and separate
hosted execution approval. Preserve audit history via containment/forward fixes,
never deletion/reset/outcome editing. See docs/PROVIDER_MIGRATION_FINAL_REVIEW.md.

## October16 · remediate the unapplied provider migration under owner approval

Correct only the pending forward SQL, preserving all nine approved historical
files. Keep the original rejected hash/reproduction as evidence and compute new
file/bundle hashes. Guard capability identity with FOR UPDATE then compare the
locked row to clock_timestamp; repeat pure validation after resource locks and
at one centralized successful exit for every read/replay/write branch. Audit once
in each caller with the returned capability UUID, avoiding extra audit effects in
the guard. Final rejection rolls back DML/audit after implicit lock waits.

Recheck payment authorization/request expiry including refund waits, exact email
sender/domain authority and agreement binding after portal/signer/company waits.
No new reservation gets an in-flight expiry grace. Existing outcome persistence
does not retry UNKNOWN or clear holds; expired workloads require reviewed recovery.
Enforce non-NULL terminal objects through a named CHECK and retain projection and
immutable-trigger defenses, including trusted owner maintenance paths.

Commit49 new regressions:22 native lock races and27 portable result/permission
cases. Keep transaction time stale and observe real waits, then assert no provider/
financial/audit residue. Reuse the unchanged original-review harness for a separate
adversarial pass: old10 PASS/3 FAIL, corrected13 PASS/0 FAIL. Full577 local/265
native/51 responsive browser and26 frozen checks pass (counts overlap).

Recommend GO only for separate dormant development migration approval of the new
hash. Dry-run success never authorizes apply, private grants or provider execution.
Statement checkpoints cannot certify long explicit transactions, outgoing calls,
hard COMMIT deadlines or external legal/security review. Preserve supervisor
timeouts/cancellation and all provider/clean-production/release gates. Read
docs/PROVIDER_MIGRATION_REMEDIATION.md; no hosted/Netlify/financial operation occurred.

## October16 · execute the exact corrected dormant development migration

The owner explicitly authorized57f2aa1/hash5dd07b07…/bundle231fa367… for the named
development target. Recheck clean source, all nine historical files/statement arrays,
target,422 catalog records/69 column ACLs/24 default-privilege records and one-file
CLI plan before applying. Use pinned CLI with explicit target and skip-vault;
no seeds/roles/reset/repair or replay. Supervise and bound the process group; no
automatic retry on timeout or uncertain response. Apply completed once, exit0.

Post-apply history has10 unchanged/expected entries;68 new stored statements and
468 native/hosted catalog records match. Verify16 empty private RLS tables,101
constraints/26 FKs,40 new-table indexes/one existing merchant index,32 triggers,
7 owner-only fixed-path functions, zero API/service privileges and unchanged63
table data digests/214 public API/type records. Identity/MFA/off snapshots match.
Do not substitute migration success for genuine provider Auth/RPC/Storage testing.

Keep original nine-file approval frozen and record the one-file applied provider
bundle separately. Offline checker distinguishes historical pending vs recorded
development-applied states and checks matching execution metadata; neither state
can authorize a new hosted action. All10 SQL files are immutable history now.
Security0 WARN/ERROR,28 intentional INFO; existing4 performance WARN remain, plus
21 FK/57 unused-index/1 connection INFO. No unrelated remediation or configuration
change. No provider identity, credential/grant/binding/call, deployment or outside
access. Next exact provider activation/provenance/connection review remains separate.
See docs/PROVIDER_MIGRATION_EXECUTION.md and private execution evidence.

## October16 · prepare activation without creating provider authority

Prioritize the latest sandbox-readiness request at base97e861f. Preserve local
implementation authorization for property/media/comparison/unbilled additions, but
record this increment as planning for those modules, not completed implementation.
No new schema or historical migration edit. Map additions into existing tenant,
property/job/import/expense/change-order/ledger modules; never duplicate databases.
Owner must decide expanded media/procurement release inclusion; existing supplemental
billing conversion cannot be dropped from required Release1.0 financial acceptance.

Separate a dormant15-minute guard-only diagnostic role proposal from any provider
command/merchant/token/consent grant. Compiler validates UUID/role/TTL and emits
exact private grant/containment hashes without secret/network/execute capability.
Starting NOLOGIN ensures the package is unusable until a separate reviewed secure
credential/LOGIN operation. Store approved scope digest only after owner approves
that digest and exact SQL; a matching digest alone confers no authority. Terminate
exact-role sessions before waiting on locked revocation rows; retain audit/evidence.

Use Authorize.Net hosted Accept UI tokenization for the current opaqueData capture
adapter; Accept Hosted performs a payment itself and must not be double-captured.
Treat independent NMI Payment Component/v5 compatibility and test-account evidence
as gates. No real merchant or provenance bootstrap is ready: invoice UUID and
free-text evidence are not a checked customer financial authorization workflow.
Prepare123USD capture/23USD settled refund/net100USD as proposed test values only.
Separate settlement/refund and future lease approvals; never auto-renew UNKNOWN.

Keep DocuSign legal execution false, email SQL-delivery disabled, ingestion503 and
private media inaccessible. Isolated signature trust, tenant domain verification,
minimal signed webhook receiver and controlled document/video runtime remain
external/security gates. No protection exception, local tunnel or frozen-package
change is implied. Read docs/SANDBOX_ACTIVATION_READINESS.md for approval matrix.

## October16 · sandbox account discovery does not authorize credentials

At base0ceac3e, owner approved preparation/read-only account selection only. Inspect
available browser sessions, connected Gmail message IDs and exact Keychain item
attributes, never credential values/bodies/autofill/keys. Official sandbox redirected
to its logintest login page; no account session. Searches/metadata presence checks
found no evidence in their narrow scopes; account existence/control stays unknown,
not “no account exists.” Native attribute-only helper never requests secret bytes
or permits interaction; earlier constrained query errors cannot prove absence.

Prepare one disabled/unconfigured tenant-specific candidate privately, with null
merchant reference/account evidence. Do not copy diagnostic probe IDs into a payment
merchant binding. Document separate credential purposes/custody, no generated keys
or Keychain writes. Owner manual login may enable later non-secret read inspection;
account creation/recovery/key generation/rotation/custody/provider APIs remain
separate scopes. Sandbox Live Mode terminology is not production authorization;
production Test Mode never proves a sandbox account. Profile validation may cause
provider-side validation/receipt behavior and is not read-only.

Add three synthetic capture/refund endpoint/redirect regressions; no runtime,
SQL, UI, approved branding or frozen package changes. No real gateway call, hosted
DB read/write, login, role/grant/binding, Netlify/support operation or outside access.
Read docs/AUTHORIZE_NET_ACCOUNT_SELECTION.md for precise evidence/limits/owner steps.
