# Production Release 1.0 acceptance checklist

**Launch status: NOT READY / NOT AUTHORIZED.** Owner policy recorded October 15, 2026. Phases 1, 2, 3 and 3A are internal engineering milestones, not separate
production releases. No outside contractor, employee or customer may receive access
until the complete Release 1.0 workflow is substantially complete, fully tested,
secure and expressly approved for launch. Synthetic employee/customer accounts are
operated only by the owner/authorized internal engineering team in isolation.

Passing CI, a draft PR, a company being marked active, an environment variable or a
hosted test approval does not authorize launch or outside access. No merge,
production deployment, real communications/payments or payroll execution is approved.
Release approval and any execution-provider approval must be explicit and recorded.

Update every row with dated evidence/commit, private evidence reference, reviewer
and unresolved findings as implementation/acceptance proceeds. “Local” means SQL
contract fixtures and synthetic browser data, not hosted integration or certification.
Every row must reach its release criteria; incomplete modules stay hidden and
server-disabled. Do not remove a required module to declare the release complete.

| Required module                             | Implementation                                                                                                             | Hosted validation                                             | Security evidence / remaining gate                                                                                                                                                        | Third-party dependencies                                                                          | Launch ready |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------ |
| Company onboarding / branding / Super Admin | Checked provisioning/memberships, MFA, profiles; approved Propel logo and independent contractor branding                  | Core Auth/MFA/company/member/revocation PASS                  | 22 users/four factors preserved; C1 inactive; 18 memberships/three revoked; complete outside onboarding/release review pending                                                            | Broader exact private grants and independent launch validation remain separate                    | No           |
| CRM / public intake                         | CRM, locations, consent, assignments; intake gated                                                                         | Core connected CRM/assignment PASS; public intake pending     | Real positive/negative tenant and role tests; CAPTCHA/gateway/deployed origin/rate acceptance still pending                                                                               | Turnstile test credentials; Netlify runtime                                                       | No           |
| Professional estimates                      | Editor, integer pricing, tax reference, immutable internal issue/revision and branded preview                              | Core connected create/save/issue/revise/concurrency PASS      | Real integer totals, idempotency, immutable versions and foreign references passed; production customer acceptance/export still pending                                                   | Reviewed jurisdictional tax policy; branded export acceptance                                     | No           |
| Smart Material Import                       | Review/pricing/parsers, scoped byte client, image normalization, scanner/AI adapters and worker CAS; ingestion503          | BLOCKED: scanner/source/positive-object infrastructure        | Existing quarantine/source gates preserved; no forged clean rows or full source/Storage acceptance                                                                                        | Approved byte gateway, isolated worker/scanner/model, credentials, retention/orphan cleanup       | No           |
| Customer approvals                          | Default-off internal published offers and immutable accept/decline/change decisions; internal sink delivery                | Pending                                                       | Local scope/privacy/revocation/consent/revision tests; genuine Auth/portal and independent consent review pending                                                                         | Reviewed customer identity/consent policy; actual external delivery remains disabled              | No           |
| Contracts / signatures                      | Immutable internal contracts plus sandbox provider evidence ports/DocuSign draft plan; production disabled                 | Pending                                                       | Local hash/consent/immutability and tenant denials; legal/template/provider signature evidence still pending                                                                              | Approved legal templates and signature-provider sandbox/evidence validation                       | No           |
| Invoicing / branded invoices                | Internal branded invoice/print from signed test scope; immutable numbering and tax/receivable ledger                       | Pending                                                       | Local invoice provenance, currency/reconciliation and concurrent numbering; credit-note/change-order conversion and hosted acceptance pending                                             | Reviewed tax/branding/export, credit-note/change-order conversion and independent review          | No           |
| Authorized payments / schedules             | Synthetic schedules/ledger; sandbox capture/refunds, PostgreSQL intent/inbox proposal and statement reconciliation unwired | Pending                                                       | Local ceilings/idempotency/concurrency/refunds/UNKNOWN outcomes; durable control proposal tested locally; real tokenization, authorization, provider callbacks/settlements remain pending | Separate per-company Authorize.Net/NMI sandbox accounts, approved calls and provider/legal review | No           |
| Job expenses / profitability                | Immutable baseline, commitments/paid/credits, review, authorized changes, projections                                      | Core connected expense/credit/baseline/projection PASS        | Real duplicate/over-credit/role/concurrency/proposal-only billing checks; scanned receipt and final reporting pending                                                                     | Approved document pipeline; accounting/export review                                              | No           |
| Workforce timekeeping                       | Clock/break/switch, timesheets, supervision, corrections                                                                   | Core connected clock/time/role/revocation/concurrency PASS    | Real breaks, midnight offsets, assigned/own visibility, overlaps and immutable locked time; complete independent/jurisdictional review pending                                            | Company policy and classification review                                                          | No           |
| Labor costing                               | Cash/burden/imputed/billing, job aggregates, single posting source                                                         | Core connected job-labor reconciliation PASS                  | Exact cash/burden/imputed costs, wages versus owner economic time and private rates tested; independent costing review pending                                                            | Independently reviewed costing rules                                                              | No           |
| Payroll preparation                         | Weekly calculations, deductions input, export, locked periods/adjustments                                                  | Core connected preview/lock/privacy PASS; execution OFF       | 40 regular +2 overtime field hours per company, exact totals and locking passed; statutory/provider/export acceptance pending                                                             | Payroll specialist review; export-only approved provider contract                                 | No           |
| Tenant-branded communications               | Sender reader/DNS-evidence gate, expiring profile-bound receipts, escaped preparation and signed event facts; no sending   | Pending                                                       | Local sender-domain match and no self-verification; actual SPF/DKIM/DMARC/provider verification, consent/suppression/delivery webhooks pending                                            | Per-company verified domain/provider identity, credentials and approved sandbox/sink              | No           |
| Operational readiness / recovery            | Approved development target, nine applied reviewed migrations, guarded harness/runbook                                     | Core API acceptance PASS; deployed perimeter/recovery pending | 723 authenticated cases and 56 boundary checks before/after; RLS/grants/zero-session cleanup; leak-password warning resolved; performance findings remain                                 | Reviewed exact Action C/D approvals; separate clean production database before outside access     | No           |

| Customer portal | Default-off protected internal portal with actual-caller RPCs and explicit synthetic preview | Pending | Expiring private test grants, current customer mapping, no raw cost/workforce projection; real Auth/HTTP and production portal acceptance pending | Reviewed identity/consent/secure delivery, clean production and independent security review | No |

## Cross-cutting release gates

- [ ] Complete all required modules end to end for property services, construction
      and roofing without separate deployments or shared merchant/sender identities.
- [ ] Pass three-company Auth/TOTP, PostgREST, Storage, connected browser and worker
      acceptance, including negative role/MFA/module/revocation/customer tests.
- [ ] Review security/performance advisors after migrations; resolve or explicitly
      accept documented findings. Independently review tenant and payroll privacy.
- [ ] Verify feature controls at UI, API and database boundaries; no frontend flag
      can unlock a backend capability. Unsupported direct routes return no data.
- [ ] Validate legal/tax/classification/payroll/signature/processor obligations.
      Payroll execution is outside preparation and needs its own explicit approval.
- [ ] Prove no raw card data; no automatic 3.85% surcharge; separate company tokens,
      settlement configuration, branding, invoice identity and communications.
- [ ] Complete migration/restore rehearsal, monitoring, retention/orphan cleanup,
      rate limits, incident response and accountable internal operational ownership.
- [ ] Obtain explicit owner launch approval tied to the reviewed commit, environment,
      acceptance evidence and intended outside-access scope. Only then separately
      authorize merge/production deployment and approved live integrations.

See PHASE3A_STAGING.md for the next internal gate. Nothing in this checklist enables
an endpoint or grants any hosted/production authority.

## Latest internal progress and environment decision

The existing contractor Supabase project is now approved as internal DEVELOPMENT;
no separate staging DB is required. Exact action approvals remain pending. Before
outside access/launch, provision and independently validate a separate CLEAN
production database; never promote/restore synthetic development data into it.

See CONNECTED_DEVELOPMENT.md, MIGRATION_REVIEW.md / MIGRATION_BUNDLE.json and
CONNECTED_VALIDATION.md. /preview/release demonstrates internal end-to-end synthetic
scope, consent, invoice, deposit/capture/refund and reconciliation for all three
companies; /internal-release and /portal/internal are actual-caller interfaces but
default off without reviewed operator grants. This is not a production release.
Actual sender/provider callbacks, provider-specific authorization/intent persistence,
secure tokenization/byte ingestion, signature/legal compliance, credit-note/change-
order invoice conversion, hosted/independent testing and clean production remain
required. Local fixtures/CI success do not satisfy those gates.

October 16 schema milestone: approved nine-file development bundle applied; all51
public/12 private application tables have RLS, private Storage/default-off gates
verified and official types compared. Security advisor zeroWARN/ERROR; performance
follow-up remains. Owner-confirmed Auth/API dashboard saves completed and were
verified after reload; broader default-ACL changes were rejected/not applied.
This does not change any module's hosted workflow/launch readiness. See
DEVELOPMENT_MIGRATION_RESULT.md for exact versions and remaining acceptance gates.

## Connected acceptance checkpoint · October 16, 2026

Detailed cases,22-identity roster, genuine TOTP procedure, fixture/grant scopes,
protected-deploy procedure and privilege assessment: CONNECTED_ACCEPTANCE_PLAN.md.
Starting commit0df0fc9; this checkpoint adds read-only tooling only.

| Evidence                                        | Exact latest result                                                  | Full acceptance status                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Persisted Auth/MFA/redirect/API settings        | PASS, independently reloaded; no changes                             | Configuration only                                                                             |
| Current API grants/private boundary             | PASS, SQL catalogs;0 users/companies                                 | Nonempty role/tenant controls NOT RUN                                                          |
| Real read-only Auth/PostgREST/Storage preflight | 56 PASS /0 FAIL                                                      | Anonymous boundary only; not three-company acceptance                                          |
| Synthetic identities/genuine TOTP               | 0 created /0 enrolled                                                | Action A authorized; BLOCKED: working secure credential store and human TOTP                   |
| Three-company role/revocation/domain workflows  | 0 authenticated cases run                                            | BLOCKED: identities, ActionB fixtures/write approval and ActionC grants                        |
| Storage objects/import worker positives         | 0 object cases run                                                   | BLOCKED: approved fixture writes, provenance/worker/scanner infrastructure                     |
| Netlify protection metadata                     | PASS, team login/all deploys                                         | Anonymous root404 is INCONCLUSIVE; app/assets/API perimeter NOT RUN                            |
| Protected application deploy                    | 0 performed                                                          | BLOCKED: separate ActionD commit/artifact/site approval                                        |
| Broader default-privilege cleanup               | REVIEW COMPLETE;0 SQL changes                                        | Not required for existing-schema acceptance; future-object defense-in-depth review recommended |
| Local preparation suite                         | 354 PASS /9 native-only skips; lint/types/checksum/build/format PASS | Local evidence only; native144/browser48 preceding results retained                            |

No current connected preflight failures were observed. NOT RUN/BLOCKED and404
must never be counted as PASS for authenticated workflow, cross-tenant Storage or
perimeter acceptance. All required modules remain launch-ready **No**. No identity,
fixture, private grant, configuration write, deployment or provider call occurred
in this preparation checkpoint. Earlier execution/configuration reports remain valid.

Action A update: owner authorized identity creation/TOTP, but the attempt stopped
without creating identities because secure Keychain persistence did not complete.
0/22 identities and0/4 TOTP verified; all company/grant counts remain 0. Identity
approval is no longer the blocker; approved working credential storage and later
human TOTP interaction are required. See ACTION_A_RESULT.md. Actions B/C/D remain
separately unapproved. No authenticated acceptance case is now passing by inference.

Latest Action A result supersedes the zero-account attempt:22/22 confirmed synthetic
identities created and 22 Keychain records verified. First stop was a local parsing
bug, now corrected. Genuine TOTP 0/4, sessions 0; STOPPED for owner participation.
Company/membership/private-grant counts all0. No authenticated three-company case
has passed yet. Use existing accounts; do not recreate or claim MFA complete.
See ACTION_A_RESULT.md. Actions B/C/D remain separately unapproved.

Latest Action A completion supersedes the pending MFA statements above: all four
privileged synthetic identities completed genuine owner-assisted TOTP and verified
real AAL2/confirmed identity. Independent SQL: 22 confirmed users, four verified
TOTP factors, zero pending factors/sessions; companies/memberships/private grants
remain zero. No full authenticated tenant/domain case is inferred. The temporary
local interface is closed/stopped; no secrets or QR captures entered evidence.
Actions B/C/D remain separately unapproved. See ACTION_A_RESULT.md.

## Historical pre-bootstrap Action B / Propel checkpoint

Action B is authorized but BLOCKED before provisioning: the required private
platform-admin bootstrap is Action C and remains unapproved. Created: 0 companies,
0 memberships, 0 domain fixtures. Real authenticated PostgREST/RPC domain cases
are NOT RUN (0 passing / 0 failing), not certified by empty-table checks. Read-only
preflight confirms 22 confirmed identities, four verified TOTP factors, no pending
factors/sessions, 63/63 RLS tables and zero private client table privileges.
Scanner-backed material positives and private internal customer grants remain
BLOCKED; deployment is NOT RUN/unapproved. See ACTION_B_RESULT.md.

Propel Contractor Suite by Eagle Vision uses the exact owner-supplied logo for
local product presentation; contractor white-label contexts remain independent.
Local responsive screenshots/tests are branding evidence only. They do not fulfill
connected acceptance or launch authorization. See BRANDING.md.

Historical C1 preparation checkpoint (superseded below): PASS for read-only operator identity/factor/baseline
checks and isolated SQL contract tests; grant/cleanup SQL prepared privately with
30-minute maximum operator-enforced expiration (no native TTL). Hosted activation,
revocation and real same-session denial remain NOT RUN / awaiting separate exact
owner approval and fresh genuine AAL2. Action B remains BLOCKED; no company/member
fixtures or broader private grants exist. See ACTION_C1_REVIEW.md.

Historical pre-execution MFA checkpoint (superseded below): approval was received for the exact reviewed operation hash.
Preflight target/roster/factor/migration/hash/cleanup-channel checks PASS. Genuine
fresh operator AAL2 is awaiting owner entry; a stale AAL1 wait was closed with
zero sessions/grants verified. Activation/provisioning/revocation remain NOT RUN;
no company/member fixtures or connected workflow pass is claimed. Do not repeat
C1 execution approval. See ACTION_C1_EXECUTION.md.

## October 16 C1 execution evidence

See ACTION_C1_EXECUTION.md: exact approved grant activated once; three companies and
three owner memberships created by six genuine authenticated setup RPCs; exact
revocation, same-AAL2 platform/metrics denial and zero operator sessions verified.
Grant window lasted approximately 40 seconds. All identities/factors/migrations and
RLS/private-table boundaries preserved. No domain fixtures or full tenant/financial
acceptance yet. C1 is complete, not a launch or broader Action C/D approval.
Security advisor: one leaked-password-protection warning and 12 informational
private-table notices; four performance RLS warnings remain. Independently review
these before launch. No settings/schema remediation performed. Every module remains
launch-ready No; continue approved Action B with existing company owners and genuine
fresh MFA. No duplicate provisioning or bootstrap replay.

## Action B connected acceptance result

Genuine hosted results: **723 authenticated PASS / 0 FAIL** (687 core +36 staff
supplement), and 56 anonymous/Auth/API checks PASS before AND after fixtures.
Three current owner AAL2 sessions were independently bound; all 21 distinct actors
and three supplementary sign-ins were globally closed, with zero Auth sessions
verified. Existing three companies reused; added 15 memberships, 15 accepted
invitations, 219 retained domain rows and 354 activity events. C1 remains inactive.
All identities/factors/nine migrations/RLS/private boundaries preserved.

Nine groups remain BLOCKED: scanned sources/receipts, positive Storage and private
internal-release workflows for each company. Full 50-table, protected connected
browser/mobile/perimeter and independent launch/provider/payroll-jurisdiction review
remain NOT RUN. The private runner's NOT RUN=0 covers only its selected core scope.
No module is launch-ready by this evidence alone. Native leaked-password protection
and four performance RLS warnings remain unresolved; no Auth/schema remediation
was applied. See ACTION_B_CONNECTED_RESULT.md for exact counts, finances and limits.
No broader private grants, outside access, deployment, real execution or merge.

## October 16 · approved development Auth security remediation

**PASS:** native Leaked Password Protection enabled and persisted through the exact
one-field approved operation. Other Auth/API configuration, all existing users,
password verifiers, MFA factors, sessions and tenant/database permissions are
unchanged. Security advisors: zero WARN/ERROR; 12 intentional private-table INFO
notices remain. The historical leaked-password finding above is resolved by this
separate action. Earlier performance findings are unchanged/unremediated.

**NOT RUN:** password-rejection behavior tests, which would require separately
approved disposable account/password operations; no such operation is implied.
No release module, deployment, private grant or outside-access status changes.
Release 1.0 remains NOT READY / NOT AUTHORIZED; existing blocked/NOT RUN acceptance
and provider/production dependencies remain. See LEAKED_PASSWORD_PROTECTION_RESULT.md.

## October 16 · Action D package prepared, deployment NOT RUN

**PASS (preparation/local):** exact 28c7d5e export and development configuration,
14-file frozen package with public hashes, owner logo unchanged, four portable
Node24 functions, production-build denial, dashboard Private production/previews
and all-deploy metadata, unlinked Git/site environment audit, unchanged Supabase
Auth/API/database gates. Local 375 PASS / 9 native-only skips, responsive browser 51 PASS,
packaged function 16 PASS, exported guard 4 PASS and offline operation 26 PASS.

**NOT RUN:** actual draft creation/function invocation, 27-path-per-host deployed
anonymous/team perimeter and connected browser/mobile scenarios. **BLOCKED:** same
scanner/positive-object/private-release positives as Action B. No additional grant
is authorized, and no required release module becomes launch-ready. Next: review
and separately authorize the exact private draft API operation and three deploy-only
Functions values in ACTION_D_REVIEW.md/ACTION_D_ARTIFACTS.json. No callback change,
site setting, deployment, outside access or production approval is implied.

## October 16 · Action D authorized attempt, provider blocked

**PASS:** exact frozen hashes/operation, existing target and Private/all-deploy
configuration, no Git/site/shared variable change, four function transport uploads,
primary publication absent and independent unchanged Supabase/Auth/data/permission
gates. **FAIL:** same-ID identical-manifest finalization returned HTTP500. **BLOCKED:**
ready application and actual anonymous app/asset/API perimeter; provider remains
uploading. **NOT RUN:** connected deployed browser/roles/owner MFA. No session was
created and no earlier local/API count is relabeled as deployed acceptance.

One existing preview record only; do not recreate/rebuild/promote or weaken access.
See ACTION_D_EXECUTION.md for exact scope, times, private evidence and read-only
next diagnostics. All required modules remain launch-ready No; original scanner,
private-release, provider and clean-production dependencies remain. Owner Action D
approval is not launch, merge, production or outside-access approval.

## October 16 · Action D read-only recovery review

**PASS:** unchanged14-file package/archive/operation/logo and26 offline checks;
current connector all-deploy team login; exact-site inventory contains only original
pending deploy. **FINDING:** deploy-specific file registry empty; four function
registrations visible in dashboard but absent from deploy available-functions;
variables/runtime metadata unverified. **FAIL (historical):** manifest PUT500, original
body/request ID not retained. **BLOCKED:** uploading state, hosted byte/config and
perimeter verification; provider diagnosis/approved repair. **NOT RUN:** deployed
browser/role/MFA/function acceptance. No hosted writes, retries, new deploys,
Supabase calls or support messages. See ACTION_D_RECOVERY.md for support packet and
conditional same-ID review; release remains NOT READY / NOT AUTHORIZED.

## October 16 · Netlify diagnosis request submitted

**PASS:** existing-channel redacted support submission, receipt/ticket acknowledgement
and verified SENT scope confirmation for agent routing. Exact ticket/correspondence
retained privately. **PENDING:** actual agent diagnosis/corrective recommendation.
**BLOCKED:** original uploading preview, hosted perimeter/runtime/browser acceptance.
No deployment recovery operation or outside access authorized. See ACTION_D_SUPPORT.md;
Release 1.0 remains NOT READY / NOT AUTHORIZED and PR #1 draft.

## October16 · local provider foundation continuation

| Scope          | Implementation/evidence                                                                                                                | Hosted/provider status                                                                                                                   | Launch ready |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Documents      | Scoped byte-client, metadata-free image normalization, pre-AI revocation checks and scanner/AI orchestration tests                     | NOT RUN: real byte service, isolated parser/scanner/AI and Storage; ingestion503                                                         | No           |
| Agreements     | Sandbox accepted-scope/signer/account/consent binding, signed/certificate hashes, draft plan and evidence-store port                   | BLOCKED: durable evidence persistence, actual provider ceremony and cryptographic/legal verification; legal execution false              | No           |
| Payments       | Fixed sandbox refund adapters; PostgreSQL intent/refund/inbox proposal; raw HMAC and exact statement reconciliation                    | NOT RUN: schema promotion/control identity, token/profile lifecycle, genuine authorization, provider callbacks/settlements; no execution | No           |
| Communications | Tenant/account domain reader + DNS-evidence port, opaque expiring receipt, consent/suppression/escaped branding and signed event facts | NOT RUN: actual domain/DNS validation, durable outbox/suppression, provider sending; delivery disabled                                   | No           |

Local final validation: **495 PASS / 10 native-only skips**, native PostgreSQL17
**187 PASS** (overlapping cases; includes concurrent writes), **51 responsive browser
PASS**, **26 original frozen-package checks PASS**, formatting/types/migration/diff/
private-reference checks PASS. Native local harness role-creation race corrected to
match CI setup before the final passing run. No new hosted/security/provider evidence.
See RELEASE_PROVIDER_FOUNDATION.md; the explicit SQL proposal is outside the unchanged
nine-migration approval. Original blocked deployment is preserved; no retry or
replacement. Required modules remain in scope and Release1.0 stays closed/draft.
