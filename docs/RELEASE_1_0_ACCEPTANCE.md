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

| Required module                             | Implementation                                                                                                     | Hosted validation                                                  | Security evidence / remaining gate                                                                                                                                | Third-party dependencies                                                                          | Launch ready |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------ |
| Company onboarding / branding / Super Admin | Checked provisioning/memberships, MFA, profiles; approved Propel logo and independent contractor branding          | Partial: Auth/TOTP and three-company setup PASS                    | 22 identities/four factors preserved; temporary C1 revoked with same-AAL2 denial; three owner memberships; full tenant/member/revocation acceptance NOT RUN       | Fresh company-owner MFA for remaining roles/domain tests; broader private grants still separate   | No           |
| CRM / public intake                         | CRM, locations, consent, assignments; intake gated                                                                 | Pending                                                            | Local tenant/CAPTCHA/idempotency; hosted origins/rate limits pending                                                                                              | Turnstile test credentials; Netlify runtime                                                       | No           |
| Professional estimates                      | Editor, integer pricing, tax reference, immutable internal issue/revision and branded preview                      | Pending                                                            | Local arithmetic/concurrency/customer projection; real PostgREST pending                                                                                          | Reviewed jurisdictional tax policy; branded export acceptance                                     | No           |
| Smart Material Import                       | Review/pricing/parsers, scanner/gateway adapters, durable worker SQL/CAS and metadata store; ingestion remains503  | Pending                                                            | Local malformed files, source schema, leases/CAS/concurrency/revocation; actual bytes/Storage/scanner/isolation/AI pending                                        | Approved byte gateway, isolated worker/scanner/model, credentials, retention/orphan cleanup       | No           |
| Customer approvals                          | Default-off internal published offers and immutable accept/decline/change decisions; internal sink delivery        | Pending                                                            | Local scope/privacy/revocation/consent/revision tests; genuine Auth/portal and independent consent review pending                                                 | Reviewed customer identity/consent policy; actual external delivery remains disabled              | No           |
| Contracts / signatures                      | Internal immutable contracts and exact-document typed test signatures; production module disabled                  | Pending                                                            | Local hash/consent/immutability and tenant denials; legal/template/provider signature evidence still pending                                                      | Approved legal templates and signature-provider sandbox/evidence validation                       | No           |
| Invoicing / branded invoices                | Internal branded invoice/print from signed test scope; immutable numbering and tax/receivable ledger               | Pending                                                            | Local invoice provenance, currency/reconciliation and concurrent numbering; credit-note/change-order conversion and hosted acceptance pending                     | Reviewed tax/branding/export, credit-note/change-order conversion and independent review          | No           |
| Authorized payments / schedules             | Proposed deposit/schedules, one-time synthetic authorization/capture/refund; sandbox-only gateway adapters unwired | Pending                                                            | Local ceilings/idempotency/concurrency/refunds/UNKNOWN outcomes; genuine tokenization, durable provider intent store, webhooks and sandbox reconciliation pending | Separate per-company Authorize.Net/NMI sandbox accounts, approved calls and provider/legal review | No           |
| Job expenses / profitability                | Immutable baseline, commitments/paid/credits, review, authorized changes, projections                              | Pending                                                            | Local cross-tenant/duplicates/revisions; hosted expense receipts and authorization pending                                                                        | Approved document pipeline; accounting/export review                                              | No           |
| Workforce timekeeping                       | Clock/break/switch, timesheets, supervision, corrections                                                           | Pending                                                            | Local overlap/DST/revocation/locking; hosted sessions/concurrency pending                                                                                         | Company policy and classification review                                                          | No           |
| Labor costing                               | Cash/burden/imputed/billing, job aggregates, single posting source                                                 | Pending                                                            | Local arithmetic and payroll privacy; connected posting/reconciliation pending                                                                                    | Independently reviewed costing rules                                                              | No           |
| Payroll preparation                         | Weekly calculations, deductions input, export, locked periods/adjustments                                          | Pending                                                            | Local cross-job overtime/locks; jurisdictional and payroll-provider validation pending                                                                            | Payroll specialist review; export-only approved provider contract                                 | No           |
| Tenant-branded communications               | Tenant sender configuration stays unverified; prepared messages use internal sink only                             | Pending                                                            | Local sender-domain match and no self-verification; actual SPF/DKIM/DMARC/provider verification, consent/suppression/delivery webhooks pending                    | Per-company verified domain/provider identity, credentials and approved sandbox/sink              | No           |
| Operational readiness / recovery            | Approved development target, nine applied reviewed migrations, guarded harness/runbook                             | Partial: baseline/C1 setup PASS; full connected acceptance pending | Saved Auth/API hardening, RLS/grants/advisors verified; domain, independent security/load/recovery and deployed perimeter still pending                           | Reviewed exact Action C/D approvals; separate clean production database before outside access     | No           |

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

## Current Action B / Propel checkpoint

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

## Action B owner-session continuation checkpoint

Current connected evidence: 56 GET-only anonymous/configuration checks PASS/0 FAIL;
company owners 0/3 fresh MFA completed; authenticated employee/domain cases NOT RUN.
No new company, membership or domain fixture writes after C1. The prepared fixed
core scenario passed 687 disposable LOCAL contract cases and retains nine BLOCKED
groups; these are not hosted QA or full 50-table acceptance. All module launch
statuses remain No. See ACTION_B_CONNECTED_RESULT.md for owner handoff, exact
pending coverage and Pro-or-higher native leaked-password remediation proposal.
No settings/grants/deployment changes are authorized by this checkpoint.
