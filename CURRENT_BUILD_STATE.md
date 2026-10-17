# Propel Contractor Suite by Eagle Vision · current build state

## Latest: property hosted preflight recovered · separate approval required

Read [PROPERTY_PREFLIGHT_RECOVERY.md](docs/PROPERTY_PREFLIGHT_RECOVERY.md) and
PROPERTY_PREFLIGHT_RESULT.json. The unchanged pending20261017005322 SQL/hash/bundle
now has a successful exact-target CLI2.121.0 dry run:exit0,3.944seconds, exactly
one migration, no seeds/roles, skip-vault. Existing approved Keychain credential
was used only in child-process memory. Automatic CLI credential discovery stalls
on read-only whoami; the in-memory credential path works. Underlying cause remains
unverified; no reset, credential creation or key/settings repair was performed.

Both existing public key formats work on Auth and table-specific PostgREST probes.
Earlier root401s targeted the restricted OpenAPI endpoint and were not proof of
invalid keys. Public organization SELECT is correctly denied42501; private profile
is rejected406/PGRST106 with only public exposed. Saved Auth/API hashes match;
public signup/anonymous sign-in remain off, MFA/redirects/leak protection preserved.

Fresh/post-dry-run history10 and468 catalog fingerprints match;69 column ACLs match.
Property schema absent,22 identities/four factors/zero sessions/grants/workloads;
security0 WARN/ERROR,28 INFO and existing performance4 WARN/79 INFO unchanged.
Technical GO for separately approved dormant schema execution, not execution
permission. Exact file c345bdf1… and pending bundle0fadce83… remain UNAPPLIED /
NOT AUTHORIZED in PROPERTY_MIGRATION_REVIEW.json. No media/features/wrappers/providers,
Netlify action or outside access. Release1.0 NOT READY / NOT AUTHORIZED; PR#1 draft.

## Latest: property schema review · corrected / hosted execution NO-GO

Read [PROPERTY_MIGRATION_SECURITY_REVIEW.md](docs/PROPERTY_MIGRATION_SECURITY_REVIEW.md)
and PROPERTY_CONNECTED_AUTHORIZATION.md. Original f345 proposal reproduced nine
negative failures: NULL CAS bypasses, disabled-module financial projection, report
customer/property provenance and supplemental amount mismatch. Corrected constraints,
post-lock wall-clock session checks and command locks pass all regressions.

Formal pending migration:20261017005322_property_operations.sql; file SHA-256
c345bdf178c9339dba7ba2707c74233bcfae9a2d2b59abf148f4b7ffff35780c.
Exact pending/full bundles are in docs/PROPERTY_MIGRATION_REVIEW.json. All ten
historical files/manifests and public types remain unchanged; hosted history is10.
Eight private/default-off tables and eight fixed-path functions add no public
wrappers, features, Storage, roles or provider capabilities.

Verification:666 local PASS/43 native-only skips;318 native PostgreSQL17 PASS;
63 browser PASS;26 frozen checks PASS (counts overlap). Fresh ten-file native schema
matches actual hosted468 catalog/69 column-ACL records without drift. Security
0 WARN/ERROR,28 INFO; existing performance4 WARN/79 INFO unchanged.

Hosted execution is NO-GO: target-bound CLI dry run stalled with zero output and
was terminated; two public-client HTTP probes returned401 Invalid API key, so API
profile isolation remains unverified. Do not rotate keys/reset Auth/widen grants
as a workaround. Resolve these read-only preflights, then request separate exact
execution approval. No hosted write, grant, session, deployment or provider call.
All media/connected property/customer billing gates remain disabled; Release1.0
NOT READY / NOT AUTHORIZED and PR#1 stays draft.

## Latest: property operations / smart procurement · local implementation

Owner direction now includes surveys, media, comparisons and unbilled review in
Release1.0 work. NMI is preferred initially; Authorize.Net remains optional. Both
gateways are disabled and owner account access is pending. Read
[PROPERTY_OPERATIONS_VALIDATION.md](docs/PROPERTY_OPERATIONS_VALIDATION.md).

Implemented synthetic contractor inspection/recurrence/checklist/review/immutable
report workflows, private media controls, four-supplier acquisition comparisons,
existing-job unbilled decisions and pending supplemental invoice drafts, plus a
unified client projection using the existing release engine. Existing estimating,
job expense and financial records are reused; no new financial execution path.

One hash-inventoried SQL proposal under server/property/ creates8 private tables
and checked commands; it is NOT a hosted or approved migration. Existing10 SQL
files, generated public types, approved logo and frozen Netlify artifacts remain
unchanged. New connected navigation/API/persistence and all media upload/playback
are disabled. Local synthetic UI is not hosted acceptance or genuine customer
consent. No hosted/provider/Netlify/account/grant/session operation occurred.

Final regression:653 local PASS/38 native-only skips,300 native PostgreSQL17 PASS,
63 responsive browser PASS and26 frozen-artifact checks PASS (counts overlap).
Formatting/types/hash checks PASS; detailed evidence is in the validation report. Next: review the
proposal and connected adapter authorization; then separately approve an exact
formal development migration/acceptance scope. Scanning/storage, genuine customer
change-to-invoice consent/conversion, provider integration and independent release
validation remain blockers. Release1.0 NOT READY / NOT AUTHORIZED; PR#1 draft.

## Latest: Authorize.Net account selection / read-only / unverified

Base0ceac3e preserved. Read docs/AUTHORIZE_NET_ACCOUNT_SELECTION.md. No existing
Eagle Vision-controlled sandbox account could be verified: browser inventory had
no merchant session, official sandbox opened at its login page, two connected
Gmail message-ID-only searches returned0 results, and four exact metadata-only
Keychain lookups returned item-not-found. These limited searches do not establish
that no account exists. Owner manual identification/sign-in is pending; no secret
was requested/retrieved, account created, login submitted or provider API called.

Prepared one private unconfigured/disabled merchant candidate for the existing
synthetic property-services tenant, plus credential-purpose/custody and independent
invoice/consent/token/profile/workload plans. No Keychain item was created and
actual custody/account permissions remain unverified. All provider capabilities
stay off; no Supabase/Netlify/settings/grant/binding/financial/email action occurred.
Three additional synthetic routing regressions cover endpoint override and capture/
refund redirects. Final validation counts are in the account-selection report.

Next: owner manually opens/signs in to the official sandbox for non-secret account
metadata inspection, or identifies which controlled account/email to inspect. If
no account exists, creation needs separate approval. Key retrieval/generation/storage,
provider configuration, merchant/workload binding and transactions each remain
separately controlled. Release1.0 stays NOT READY / NOT AUTHORIZED; PR#1 draft.

## Previous: sandbox activation readiness / no activation

Base97e861f preserved. New offline sandbox planner, a guard-only dormant workload
proposal/containment compiler,14 plan tests and6 SQL proposal tests are implemented.
Read docs/SANDBOX_ACTIVATION_READINESS.md for per-provider gates and private exact
S0 proposal references. No credential reader, hosted executor, provider call,
new migration, grant/login, binding, Netlify action or UI/branding change was added.

Fresh actual hosted read: exact development identity/healthy state,10 history
entries and468 application catalog fingerprints match the applied record;16 private
provider tables empty;0 provider roles/workloads/authorizations/merchants/sender/
agreement bindings/active platform grants/public buckets;22 identities/4 verified
factors/0 sessions. Security0 WARN/ERROR with28 intentional INFO; existing performance
4 WARN/21 FK/57 unused-index/1 connection INFO remain. No advisor cleanup performed.

Local check597 PASS/33 native-only skips; native PostgreSQL17 database271 PASS,
including existing expiry/concurrency cases and6 new compiled-proposal cases.
Final format/browser/frozen-package results are in the readiness report. This is
local/read-only evidence, not genuine provider acceptance or workload login proof.

First provider candidate: one existing synthetic property-services company and one
owner-selected Authorize.Net sandbox account. Checked genuine invoice/consent,
hosted Accept UI ceremony/one-use token vault, callback receiver and exact capability
bootstrap remain blockers. NMI, DocuSign demo and verified-domain email remain
independent/off. Smallest next owner scope: select the sandbox account and approve read-only
account verification/credential custody, no transaction or hosted grant. Local
checked tokenization/provenance work retains existing development authority.

Property surveys/recurrence/drone-photo-video/client reports, manual supplier
comparison and unbilled review are PLANNED against existing modules in
PROPERTY_PROCUREMENT_PLAN.md, not implemented in this readiness increment. Earlier
local development authorization persists; expanded Release1.0 inclusion/scheduling
needs a separate owner decision. Existing supplemental invoice conversion remains
required/blocked. Release1.0 stays NOT READY / NOT AUTHORIZED and PR#1 draft.

## Previous: corrected provider migration APPLIED / providers DISABLED

The owner explicitly authorized the exact57f2aa1 migration/hash/bundle and the
development target. Refreshed identity/history/hash/catalog/column/default-grant
checks and one-file dry run passed. The CLI applied20261016185108 once, exit0,
13.113seconds/no timeout/no retry, no seeds/role files/Vault update. Read
[PROVIDER_MIGRATION_EXECUTION.md](docs/PROVIDER_MIGRATION_EXECUTION.md).

Hosted history now has10 entries; original nine and stored statements unchanged.
All68 new stored statements match the approved source.468 hosted application
catalog records match the tested native schema;16 new private tables are empty,
RLS/default deny,101 validated constraints/26 FKs,40 new-table indexes plus the
merchant tenant index,32 enabled triggers and7 revoked fixed-path functions.
Effective client/service table/function grants are zero. Existing63 table data
digests and214 public definition/ACL records are unchanged. Official public types
match51 tables/55 functions/2 enums; local types:check PASS.

22 identities/4 verified factors/0 sessions and their nonsecret identity/MFA
metadata fingerprints are unchanged. Internal release mode disabled; platform/
release-test/material-worker grants zero; financial modules/approved merchants/
verified senders/public buckets zero. All provider tables/capabilities remain empty.
No provider credential, role/grant, live financial/email/signature/payroll action,
Netlify/production change, merge or outside access. Release1.0 stays closed.

Actual hosted advisors: security0 WARN/ERROR,28 intentional private/no-policy INFO.
Performance4 existing WARN,21 existing FK INFO,57 unused-index INFO and1 Auth
strategy INFO. No advisor remediation was authorized or applied. These are actual
post-migration findings, distinct from earlier native and synthetic test results.

Fresh local continuity verification:577 PASS/33 native-only skips from npm check;
types/format/migration/build checks,7 offline integrity cases and26 original frozen
package checks PASS. No UI or migration SQL edit; these are not hosted provider tests.

The original nine-file bundle remains frozen; the separate provider manifest now
records DEVELOPMENT_APPLIED_PROVIDER_DISABLED. All10 SQL files are immutable;
never replay/edit/reset/repair history. Offline integrity checking is not execution
or activation authority. Next: independently review a precise provider-specific
sandbox identity/capability/provenance/connection operation and seek separate owner
authorization. All provider/deployment/release activation gates remain in force.

## Previous: provider security remediation (base7ee2c16)

M1/M2 are corrected in the still-unapplied forward migration. Workload identity
is locked before fresh wall-time validation; all24 successful command branches
pass a common final checkpoint. Payment authorization/intent, email sender/domain
and agreement binding authority are checked after relevant waits. Expired commands
roll back financial/provider/audit effects. Terminal states now require an explicit
non-NULL valid result object at table level; immutable outcomes/UNKNOWN/refund
holds remain. No provider, public API, grant, runtime gate or branding activation.

Read [PROVIDER_MIGRATION_REMEDIATION.md](docs/PROVIDER_MIGRATION_REMEDIATION.md).
Corrected SQL SHA256:5dd07b079a591b433fa7ab432fd841026de91a1cd3f1d3a722bef500aa9fd32d;
pending bundle:231fa367a176bc329c983fa9d7154d814d0469278209edeca8712229870c750e.
All nine historical migrations are unchanged. The old9588 hash remains NO-GO;
the corrected hash is **GO for requesting separate development migration approval**,
not authorized for hosted execution. Release1.0 remains NOT READY / NOT AUTHORIZED.

Validation:577 local PASS/33 native-only skips;265 PostgreSQL17 PASS/zero skips,
including22 new real lock-wait races with stale transaction timestamps and27
portable financial-integrity cases;13 prior-review adversarial checks now PASS.
The unchanged old SQL independently reproduces10 PASS/3 FAIL. All counts overlap.
51 responsive browser checks and26 frozen-package checks PASS; types regenerated
without public type changes; lint/types/build/migration integrity PASS.

Read-only hosted application catalog422 records remains identical; stored nine
migration statement arrays match exactly. Fresh explicit-target CLI dry run lists
only the corrected file, seeds/roles empty. Post-dry-run history remains nine;
provider tables/grants remain absent. Existing advisor/security/performance results
are unchanged and do not validate the unapplied schema. No Netlify operation.

Next: owner review of the corrected target-specific schema-only operation, then
separate execution authorization and post-apply verification. Provider/workload/
signature/email/document activation and deployment remain separate blocked scopes.

## Previous: independent provider migration review — NO-GO (base230f5b8)

The exact proposed migration hash matches, but independent PostgreSQL17 testing
found an in-flight capability-expiry gap (M1) and a terminal SQL-NULL result
constraint defect (M2). **Do not apply this hash.** The reviewed SQL and all nine
historical migrations are unchanged. No hosted migration, provider identity/grant,
activation or Netlify operation occurred. Release1.0 stays NOT READY / NOT AUTHORIZED.

Read [PROVIDER_MIGRATION_FINAL_REVIEW.md](docs/PROVIDER_MIGRATION_FINAL_REVIEW.md).
Read-only hosted comparison: nine history entries,422 matching application catalog
records and69 matching column ACLs; no unexpected application drift. Pinned CLI
dry run PASS: exactly one proposed file, no seeds/roles. Final hosted state remains
nine migrations/63 tables/zero proposed provider tables/zero active platform admins.
Security advisors:0 WARN/ERROR,12 intentional INFO; existing performance notices
remain (4 WARN,64 INFO). New-schema hosted advisors are NOT RUN because unapplied.

Existing native suite:216 PASS/zero skips. Independent adversarial checks:10 PASS,
3 FAIL across M1/M2; these failures are not covered by the passing regression suite.
Actual lock-wait reservations occurred after expiry; explicit concurrent row
revocation correctly denied. NULL result was reproduced through local owner DML;
the restricted command rejects it and workloads lack direct DML. All fixtures and
test roles/grants were disposable/local. Raw evidence stays ignored/private.

Fresh npm check:550 PASS/11 native-only skips; lint/types/public types/migration
integrity/build PASS. All skipped native cases ran in the216 native PASS.
Formatting/diff/private-reference checks PASS; no UI change/browser rerun.

Next: authorize local correction of the reviewed successor, add the missing
regressions, rehash/review and repeat the dry run before any separate development
execution approval. Capabilities/provider calls/deployment remain separate approvals.
Earlier readiness evidence below is historical and does not override this NO-GO.

## Previous: provider integration readiness (base93982ba)

**Release1.0 remains NOT READY / NOT AUTHORIZED.** Local engineering now includes
one formal UNAPPLIED forward migration, restricted tenant/service-scoped database
commands, durable payment/refund/statement reconciliation, disabled-only email
persistence/suppression/domain evidence, immutable sandbox agreement evidence and
DocuSign demo read/ceremony preparation, plus RS256 workload verification and isolated
document-service/orphan-cleanup contracts. All runtime/provider activation remains
disabled. No UI/branding redesign or hosted mutation occurred.

Read docs/PROVIDER_INTEGRATION_READINESS.md and
[the separate pending migration manifest](docs/PROVIDER_MIGRATION_REVIEW.json).
The approved historical nine-file checksum is unchanged. Migration
20261016185108 is local only and needs independent review and exact owner approval;
it creates no roles, grants or activation rows. Local public types are unchanged.
The original frozen deployment package is separate and unchanged. Netlify agent
findings remain pending; no repair or duplicate submission was attempted.

Final validation:550 local PASS /11 native-only skips;216 PostgreSQL17 PASS,
51 responsive browser PASS and26 frozen-package PASS. Counts overlap. Precise
blockers and evidence are in the readiness report.
Do not infer genuine provider, hosted perimeter, live signature/payment/email or
outside-access acceptance from synthetic local tests. Smallest next action:
independent review of the one forward migration and restricted authority model,
then preparation of an exact development-target migration operation for approval.
Capability activation/provider calls/deployment remain separate approvals.

The previous foundation checkpoint below is historical; its SQL proposal and missing
persistence statements are superseded by this readiness increment.

## Governing release policy and latest internal milestone

Local Release 1.0 provider continuation is complete as an INTERNAL foundation
increment (base cc46509). Added scoped document byte transport, metadata-free image
normalization and pre-AI authority checkpoints; sandbox signature evidence/hash/
identity/consent ports and DocuSign draft planning; scoped token references, sandbox
refunds, PostgreSQL
intent/refund/inbox control adapter, provider HMAC and statement reconciliation;
tenant/account-bound domain verification and disabled-only branded notifications.
No UI redesign, live integration activation, hosted operation, new endpoint or
provider credential. The existing blocked deploy/frozen14-file package is preserved.

Validation: npm check **495 PASS / 10 native-only skips**, including lint/types/
generated types, original nine-migration checksum and build; native PostgreSQL17
**187 PASS**, including those concurrency cases (overlaps local suite); responsive
browser **51 PASS**; frozen package/operation/logo integrity **26 PASS**. Format/diff
and public private-reference checks PASS. Initial disposable native setup encountered
a parallel global-role creation race; precreating roles as CI does resolved it and
the final full native run passes. This is local synthetic evidence, not hosted QA.

Payment schema is server/payments/schema.proposed.sql: four private RLS tables,
explicit revokes/composite tenant keys/immutable records, tested only in disposable
DBs. It is NOT in the migration bundle and has no approved control identity/API.
Review/generate a new migration and workload authorization separately before any
hosted action. No laboratory consent may authorize a provider call. Signature store,
genuine provider identity/certificate validation/legal review, DNS resolver/outbox/
suppression persistence and actual isolated byte/scanner/AI service remain dependencies.
Current signature output legalExecutionEnabled=false; messages delivery=disabled;
ingestion503 and existing DB financial/payroll/release gates remain. See
docs/RELEASE_PROVIDER_FOUNDATION.md for exact implementation and remaining gates.

Netlify diagnosis-only support request is SUBMITTED and ACKNOWLEDGED. The existing
private support channel returned a ticket at17:44:32UTC; its accurate scope summary
was confirmed by same-thread reply at17:45:20UTC for agent routing. Ticket/response/
SENT evidence remains ignored/private. No agent diagnosis or corrective proposal
received yet; no repeat ticket needed. Latest deploy read17:43UTC remains uploading.
No repair/requeue/retry/replacement/publication/deletion/settings change is approved.
Read docs/ACTION_D_SUPPORT.md and private correspondence before continuing. Release
stays closed; PR remains draft. Support approval changes no deployment/security gate.

Action D read-only recovery investigation is complete; the original preview remains
UPLOADING (14:39:02 UTC final read). Deploy-specific file registry is empty despite
nine expected entries. Dashboard registers all four functions and the expected
material-import route; deploy API available-functions remains empty. No ready app,
remote variable/hash verification or perimeter acceptance. Original500 diagnostic
body/request ID was not retained; deploy logs yielded zero entries. Root cause is
unresolved registration/processing, not proven provider-only failure. Support-first
review and conditional same-ID repair are prepared; no write retry/replacement,
publication, deletion or settings change is approved. See docs/ACTION_D_RECOVERY.md.
All 14 files/archive/operation/logo are unchanged; offline 26 PASS. No Supabase calls,
sessions or tenant changes during recovery. Release stays closed.

Action D execution is AUTHORIZED but PROVIDER BLOCKED. Exactly one manual preview
record was created for the frozen28c7d5e package, four reviewed function ZIPs uploaded,
and primary publication stayed absent. The provider omitted the optional draft
response field; independent exact-site/context/publication reads verified the
existing nonproduction preview before continuation. Same-ID finalization with the
identical manifest then returned HTTP500; further writes stopped. At13:10UTC it
remained uploading with no required hashes/ready timestamp. See
docs/ACTION_D_EXECUTION.md and ignored execution evidence; do not create a second
deploy, rebuild, publish or replay the initial upload script. Deployed perimeter
acceptance BLOCKED; connected browser/owner MFA NOT RUN. Current Private/all-deploy
team protection, zero site/shared variables, unchanged Auth/API/database gates,
22 identities/four factors/zero sessions verified. Release remains closed.

Action D PREPARATION is complete, not execution approval. Exact application source
28c7d5e is packaged privately: eight frontend files, four portable Node24 functions,
metadata and unchanged Netlify configuration. Public per-file hashes and the exact
proposed draft API upload are in docs/ACTION_D_ARTIFACTS.json and ACTION_D_REVIEW.md.
Dashboard Private production/previews and connector team-login/all-deploy metadata
were independently verified; Git unlinked, site/shared environments empty. Supabase Auth/API
fingerprints and all default-off database gates remain unchanged. Deployed app/asset/
API perimeter and connected browser acceptance remain NOT RUN; no upload/settings
change occurred. Local check 375 PASS / 9 native-only skips, browser 51 PASS, packaged
function 16 PASS, exported guard 4 PASS and offline operation 26 PASS. Exact upload,
three deploy-scoped runtime values and protected acceptance need separate approval.

Owner-approved development Leaked Password Protection is now ENABLED and saved
(October 16). Exact one-field Auth PATCH and independent GET verification passed;
all other 242 returned Auth settings and the entire API configuration are unchanged.
Independent database fingerprints confirm identities/password verifiers/factors/
sessions/memberships/private authorizations/RLS/policies/grants unchanged: 22 users,
four verified factors, zero sessions. Security advisor now reports zero WARN/ERROR
and 12 informational default-deny private-table notices. No password/account/session
operation or deployment. See docs/LEAKED_PASSWORD_PROTECTION_RESULT.md.

Action B core connected acceptance now PASSES: 687 genuine authenticated core
cases plus 36 supplemental staff cases = 723 PASS / 0 FAIL. Real GET-only boundary
checks passed 56/56 before AND after populated fixtures. Nine scanner/positive-
Storage/private-release groups remain BLOCKED; full 50-table and protected connected
browser/deployment acceptance remain NOT RUN. This is not full Release 1.0 approval.

Existing three companies were reused. Added 15 memberships (18 total; 15 active,
three revoked), 15 accepted invitations, 219 retained domain fixture rows and 354
activity events (420 total). Includes six customers/locations/estimates/jobs, nine
estimate versions/worker profiles/rates, 12 expenses/reviews, 51 time segments,
33 time reviews and three locked payroll-preparation periods. No billing approval,
customer message, document object, provider execution or new private grant.

All three owners completed genuine existing-factor MFA and exact hosted session
binding. Normal employee/customer Auth and checked invitation/member/domain APIs
were used; same-JWT revocation, six ordered tenant pairs, immutable records and
12 paired concurrent PostgREST cases passed. Per-company wages120400, burden24080
and owner imputed10000 reconcile; payroll execution false, profit remains projected.
All 21 distinct actors and three supplemental sign-ins were globally signed out;
independent reads confirm zero sessions/open clocks. Helpers stopped.

C1 stays inactive, with zero operator memberships; no bootstrap replay. Existing
22 identities/four verified factors and nine migration versions are unchanged.
All 63 application tables retain RLS and private client table privileges are zero.
Financial modules and release environment remain disabled. Auth/API/branding and
Netlify protection were not changed. Read docs/ACTION_B_CONNECTED_RESULT.md and
docs/ACTION_B_RESULT.md; do not replay the fixture-creation scenario.

The Action B run initially reported a leaked-password warning; the separately
approved Auth-only remediation above resolves it. Performance findings from that
run remain: four RLS warnings, 21 unindexed foreign keys, 43 unused indexes and one
Auth connection notice. No subscription, billing or performance remediation.
Next: exact private-release grant/scanner infrastructure review, separately approved
protected deployment and independent acceptance. Broader C/D remain unapproved.
Earlier checkpoints below describe their historical runs, not current totals.

The owner supplied the exact approved logo. The local product rebrand is
Propel Contractor Suite by Eagle Vision, using the unchanged emerald/mint PNG.
Contractor white-label branding, repository/infrastructure identities and all
security/release gates are preserved. See docs/BRANDING.md for asset provenance,
verification and local desktop/mobile previews. Original README is preserved.
Validation: npm check PASS (354 tests / nine native-only skips), 51 responsive
browser cases PASS, exact logo hash / ten entrypoints / tenant colors verified.
Formatting/diff checks pass; no connected Action B acceptance is inferred.

Action A is COMPLETE: the existing 22 confirmed synthetic identities are preserved;
all four designated privileged accounts completed genuine owner-assisted TOTP and
real AAL2 / fresh confirmed-identity verification. Independent hosted SQL confirms
one verified TOTP per privileged account, no pending factors and zero remaining
sessions after sign-out. Companies, memberships and all private grants remain zero;
63/63 application tables retain RLS and private client table privileges remain zero.
Public signup remains disabled; no Auth/API settings were changed. The temporary
loopback MFA interface is closed/stopped. Do not recreate/reset identities or
re-enroll completed factors. See docs/ACTION_A_RESULT.md. Action B is authorized but blocked on the separate Action C platform bootstrap;
Action D remains unapproved and full three-company acceptance is pending.

Connected-acceptance preparation: independently reverified saved Auth/API/MFA
settings and existing grants. Real anonymous/read-only API preflight56PASS/0FAIL;
no hosted identity, fixture or grant writes. Offline22-identity roster, genuine
human TOTP and four separate action approvals, role/domain/Storage evidence matrix
and protected-deploy procedure are in docs/CONNECTED_ACCEPTANCE_PLAN.md. Local
suite354PASS/9native-only skips; no new SQL. Broader default-ACL cleanup is not
necessary for existing-schema acceptance; review a narrow future-object change
separately. Netlify metadata intact; root404 is not deployed perimeter proof.

Latest: the owner-approved nine-file bundle was applied to the verified internal
development target after commit/checksum/drift/CLI dry-run verification. All nine
versions match;51 public and12 private tables have RLS; private buckets/grants and
default-off release gates verified. Official hosted types match after documented
RPC generator convention normalization. No Auth users or companies were created.
Owner-confirmed Auth/API hardening saves are complete and verified: signup OFF,
exact internal redirects, public-only schema exposure and automatic exposure OFF. See
docs/DEVELOPMENT_MIGRATION_RESULT.md for exact versions, advisor findings and gates.
The earlier pre-migration statements below are historical and superseded here.

**Production Release 1.0: NOT READY / NOT AUTHORIZED.** Phases 1, 2, 3 and 3A are
internal engineering milestones only. No outside contractor, employee or customer
may receive access before the complete Release 1.0 workflow is substantially
complete, tested, secure and explicitly approved for launch. No phase completion,
CI pass, target manifest or staging approval authorizes external access or launch.
See docs/RELEASE_1_0_ACCEPTANCE.md for every required module's implementation,
hosted evidence, security, third-party dependencies and launch status.

The owner now approves the EXISTING contractor Supabase project as internal
DEVELOPMENT. A separate staging DB is no longer required. This supersedes the older
“existing project not approved” statements in historical validation records. Exact
project/site IDs are in ignored .staging/connected-development-target.json. Before
outside access/launch, provision and independently validate a SEPARATE CLEAN
production database. Never promote or restore this synthetic development DB into it.

Read-only identity/settings review confirmed healthy PostgreSQL17.11 and zero
application tables, migrations, Auth users/sessions/MFA factors, buckets and objects.
TOTP is enabled; public signup and automatic table exposure remain ON, with default
localhost:3000 Auth URL and no redirect allowlist. These need reviewed hardening.
Netlify reports team-login protection on ALL deploys; current anonymous HTTPS404
contains no app, so deployed perimeter/API protection is not yet proven. No hosted
settings/data, migration, account, provider or deployment was changed.

New default-off internal Release 1.0 workflow: customer-safe immutable offers,
accept/decline/change decisions, contracts and exact-document typed test signatures,
branded print invoices, proposed deposits/schedules, explicit one-time synthetic
payment authorization, idempotent captures/refunds and sales/tax/receivable ledger.
Tenant email configuration stays unverified; delivery uses an INTERNAL SINK only.
Normal Contracts/Invoices/Payments navigation and production switches remain disabled.

/preview/release demonstrates all three industries with explicit synthetic actor
controls. /internal-release and /portal/internal use actual Auth/RPCs, expiring
operator grants, current owner/admin AAL2 or exact verified customer links. Connected
roles are server-selected. No synthetic fallback, private cost/payroll projection,
external email, real agreement or provider transaction is enabled. Accepted scope
cannot be revised and republished as duplicate full-contract billing; change-order
invoice conversion remains future reviewed work.

Added sandbox-only Authorize.Net/NMI token adapters with fixed test endpoints,
exact USD decimal serialization, tenant/merchant/authorization binding, idempotency
store contract and UNKNOWN outcomes without automatic retry. No actual provider call,
credential, tokenization UI or authoritative provider intent-store integration exists;
synthetic invoice consent cannot authorize a gateway call.

Added private durable document jobs/workload grants, fenced expiring claims,
revocation-locked CAS, bounded retries, strict extraction schema and a Supabase
processing-store adapter. Real secure byte gateway, isolated worker deployment,
scanner/AI validation and retention/orphan cleanup remain gates. Ingestion stays503,
Storage writes stay denied and no real scan/extraction success is simulated.

**Nine migrations await separate execution approval**, including the first seven
preserved files and two new internal-workflow/worker-control files. See
MIGRATION_REVIEW.md / MIGRATION_BUNDLE.json, development:plan and migrations:check.
No hosted migration/deploy is authorized by designation alone. See
CONNECTED_DEVELOPMENT.md for precise Auth/API hardening, identity/TOTP/fixture,
protected deploy and connected acceptance actions. The full Release 1.0 checklist
remains NOT READY: legal/signature-provider, genuine sandbox payments/webhooks,
verified sender delivery, full connected acceptance and clean production are pending.

Sandbox follow-up: immutable configuration/request snapshots now preserve the
validated tenant, merchant, amount and token across reservation waits. Canonical
digests, post-reservation expiry checks and invalid replay/reservation rejection
are covered by eleven new tests. No SQL or hosted configuration changed.

Latest local evidence is recorded in docs/CONNECTED_VALIDATION.md; Phase 3A counts
are historical. Read
**docs/PHASE3A_STAGING.md** for the exact next isolated actions/approvals and recovery
procedure. Keep the existing feature branch and draft PR #1. The Phase 3 implementation
record below remains valid; its validation counts are historical.

## Review boundary and session continuity

Continue `codex/phase-1-foundation` and [draft PR #1](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/pull/1).
The repository is PUBLIC. Preserve the original README and existing Phase 1/2
architecture/features. No merge, production deployment, hosted migration, live
charge, external customer delivery/real-agreement signature, payroll execution or actual customer message
is authorized or has been performed. Never commit credentials, real worker pay,
customer documents, hosted project identifiers or sensitive infrastructure exports.

The earlier local-only decision is superseded by the approved internal development
designation. Hosted action approvals remain pending; nothing hosted was written.
Local tests use PGlite and an independent disposable PostgreSQL 17.11 cluster with
TCP disabled. Actual Supabase Auth/TOTP/PostgREST/Storage acceptance and hosted
advisors remain unverified. See docs/PHASE2_VALIDATION.md for that pending gate.

The active Phase 3 scope includes the original professional estimating request and
all additions: Smart Material Import; Job Cost Tracking & Profitability; Workforce
Time Tracking, Labor Costing & Payroll Preparation. These extend the shared platform
for independent contractors, including Straight Edge, Cunningham and roofing firms.

## Implemented

- Preserved company/platform shells, tenant branding, provisioning/configuration,
  role/MFA and membership revocation, invitations, CRM/locations/notes/consents,
  public intake CAPTCHA/gateway gates and in-app request review/assignment.
- Professional estimating: company catalog and templates, material/product/labor/
  service/allowance lines, exact quantity/currency arithmetic, cost/markup/explicit
  selling price, exclusive options/add-ons, discounts, tax references, dates,
  private/customer notes, terms, clean attachments and reconciled schedule proposals.
  Numbered drafts use optimistic saves; duplicate/revision/archive/history and
  internal issuance preserve immutable snapshots. Branded customer preview is an
  allowlist excluding private supplier/pricing/workforce information.
- Smart Material Import: multiple supplier/source records, editable canonical rows
  with literal extraction evidence, SKU/date/quantity/unit/cost, confidence, source
  references, independent arithmetic and warnings. Explicit review/acknowledgement,
  line/supplier/company pricing overrides and persistent company defaults. Approved
  itemized or lump-sum scope retains private cost/provenance. Atomic approval/apply
  and source validation prevent stale or forged financial scope.
- Secure source architecture: private quarantine/clean buckets, no client uploads
  or quarantine reads, SHA-256/object-path checks, scanner/validator/provider/store
  contracts, HTTPS extraction gateway, real bounded image/PDF validation and literal
  CSV parser/template. Synthetic fixtures are labeled; live ingestion returns 503.
- Jobs: immutable original issued-estimate baseline, original/authorized revenue
  and costs, commitments/paid expenses/credits, pending management review, supplier
  duplicate references, receipt source digest/row guards, manual purchase matching,
  variance warnings, remaining forecasts, thresholds and projected contribution.
  Approved customer changes require management-attested authorization; proposals
  never raise billing. Approved changes add their expected cost to the forecast.
- Workforce: company worker classifications and time/invoice/imputed costing,
  immutable effective rates, reviewed timezone/workweek policy and approved overhead.
  Mobile clock-in/out, paid/unpaid breaks, atomic job/task switching, manual entries,
  own/assigned-team visibility, supervisors, submission/review, immutable corrections
  and audited manager recovery for missed clock-outs.
- Labor and payroll preparation: exact elapsed time/DST, weekly overtime across all
  jobs/overhead, separate cash/burden/imputed/estimated/billing amounts, weekly salary
  allocation, manual deduction inputs, CSV exports, immutable locked periods and
  later financial adjustments. Only locked preparation posts job labor once;
  invoice-costed contractors cannot also produce time cash fees. Payroll rates and
  deductions are restricted; job dashboards receive aggregates.
- Four unapplied Phase 3 migrations; regenerated typed tables/RPCs; lazy-loaded
  operational UI; expanded local SQL, arithmetic, parser, pipeline, repository and
  responsive browser coverage. CI includes native PostgreSQL concurrency checks.

## Validation and review artifacts

See docs/PHASE3_VALIDATION.md for final commands, counts and test limits. Screenshots
are generated under ignored `artifacts/phase3/` for desktop/tablet/mobile and uploaded
as synthetic CI artifacts. They cover all three estimate builders/previews, import
review, job financials, time clock, timesheets, payroll preparation and labor reports.

## Explicit limits / unresolved dependencies

1. **Live ingestion/extraction is not enabled or verified.** Durable SQL/CAS and the metadata adapter exist locally; approved byte transport,
   scanner and isolated worker deployment are not provisioned; no AI vendor/model/credentials are
   selected. Real image/PDF/CSV parser tests do not establish malware coverage or
   sandbox isolation. The deployed endpoint always returns 503, including if keys
   are set. Complete docs/MATERIAL_IMPORT.md before activation review.
2. Compatible spreadsheets initially mean the documented UTF-8 supplier CSV format.
   XLSX/macros/Office files are unsupported. All file/camera selection currently
   remains local; sample extraction only uses explicit synthetic fixtures.
3. Hosted Auth/MFA, PostgREST/Storage HTTP, deployed Netlify runtime and advisors
   remain deferred. Tests emulate those SQL contracts; they do not prove hosted
   integration. The existing development target is approved; scoped action approval, hardening,
   migrations and synthetic identities are needed.
4. Worker classification, break policy, tax treatment, salary preparation and weekly
   overtime configuration require independent legal/payroll review. Daily overtime,
   jurisdiction-specific wage rules, statutory deduction calculation, filings,
   deposits and disbursements are not implemented. Salary allocation requires complete
   reviewed weekly time; this is not an autonomous payroll system.
5. Worker profiles require existing company-member identities; new account identity
   onboarding remains the Phase 2 approved provisioning dependency. Policy/classification/
   cost-source changes after time exists require a reviewed versioned migration.
6. Imported estimates require fresh reviewed imports when duplicated; source-bound
   prices cannot become generic templates. Credits currently represent returns
   against recorded paid purchases; unpaid commitment cancellation needs a separate
   reviewed adjustment workflow. Matching purchase keys and customer authorization
   evidence remain explicit staff responsibilities.
7. Interactive lists are bounded; extend server filtering/pagination and reporting
   aggregation before high-volume production use. Only the default-off internal test portal/consent/synthetic ledger is implemented;
   external communication, real execution/signatures, tax filing and provider processing
   remain unavailable.

## Recommended next engineering phase

Next: review and authorize the exact development migration bundle and Auth/API
hardening, then identity/TOTP/fixtures and protected internal deployment. Validate
real Auth/Storage/RLS/MFA,
provision approved scanner/worker/gateway, run adversarial document corpus and load
checks, and obtain workforce/tax/classification review. Complete ingestion and
reporting acceptance before production consideration. Internal Phase 4 can then consume
immutable issued scope plus authorized changes for contracts/invoices; keep gateway
sandbox onboarding (Authorize.Net/NMI) and payroll execution separately gated.

Final local evidence for this readiness increment: **550 PASS /11 native-only skips**
from npm check (lint, strict types, unchanged generated public types, separate
historical/pending migration hashes and build PASS); **216 native PostgreSQL17 PASS**,
including all11 skipped/native concurrency cases; **51 desktop/tablet/mobile PASS**;
**26 frozen-package integrity PASS**. Counts overlap and must not be summed.
Formatting/diff/private-reference checks PASS. An initial concurrent full-catalog
run hit10second hook timeouts; bounded workers/30second hooks resolved resource
contention and the final full/native runs pass. No provider/hosted acceptance is inferred.
