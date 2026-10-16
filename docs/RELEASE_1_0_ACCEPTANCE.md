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

| Required module                             | Implementation                                                                                                          | Hosted validation | Security evidence / remaining gate                                                                                                                                | Third-party dependencies                                                                          | Launch ready |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------ |
| Company onboarding / branding / Super Admin | Internal checked provisioning, memberships, MFA, profiles, settings                                                     | Pending           | Local RLS/role/revocation; real Auth/TOTP and identity lifecycle pending                                                                                          | Isolated Supabase Auth; reviewed identity bootstrap                                               | No           |
| CRM / public intake                         | CRM, locations, consent, assignments; intake gated                                                                      | Pending           | Local tenant/CAPTCHA/idempotency; hosted origins/rate limits pending                                                                                              | Turnstile test credentials; Netlify runtime                                                       | No           |
| Professional estimates                      | Editor, integer pricing, tax reference, immutable internal issue/revision and branded preview                           | Pending           | Local arithmetic/concurrency/customer projection; real PostgREST pending                                                                                          | Reviewed jurisdictional tax policy; branded export acceptance                                     | No           |
| Smart Material Import                       | Review/pricing/parsers, scanner/gateway adapters, durable worker SQL/CAS and metadata store; ingestion remains503       | Pending           | Local malformed files, source schema, leases/CAS/concurrency/revocation; actual bytes/Storage/scanner/isolation/AI pending                                        | Approved byte gateway, isolated worker/scanner/model, credentials, retention/orphan cleanup       | No           |
| Customer approvals                          | Default-off internal published offers and immutable accept/decline/change decisions; internal sink delivery             | Pending           | Local scope/privacy/revocation/consent/revision tests; genuine Auth/portal and independent consent review pending                                                 | Reviewed customer identity/consent policy; actual external delivery remains disabled              | No           |
| Contracts / signatures                      | Internal immutable contracts and exact-document typed test signatures; production module disabled                       | Pending           | Local hash/consent/immutability and tenant denials; legal/template/provider signature evidence still pending                                                      | Approved legal templates and signature-provider sandbox/evidence validation                       | No           |
| Invoicing / branded invoices                | Internal branded invoice/print from signed test scope; immutable numbering and tax/receivable ledger                    | Pending           | Local invoice provenance, currency/reconciliation and concurrent numbering; credit-note/change-order conversion and hosted acceptance pending                     | Reviewed tax/branding/export, credit-note/change-order conversion and independent review          | No           |
| Authorized payments / schedules             | Proposed deposit/schedules, one-time synthetic authorization/capture/refund; sandbox-only gateway adapters unwired      | Pending           | Local ceilings/idempotency/concurrency/refunds/UNKNOWN outcomes; genuine tokenization, durable provider intent store, webhooks and sandbox reconciliation pending | Separate per-company Authorize.Net/NMI sandbox accounts, approved calls and provider/legal review | No           |
| Job expenses / profitability                | Immutable baseline, commitments/paid/credits, review, authorized changes, projections                                   | Pending           | Local cross-tenant/duplicates/revisions; hosted expense receipts and authorization pending                                                                        | Approved document pipeline; accounting/export review                                              | No           |
| Workforce timekeeping                       | Clock/break/switch, timesheets, supervision, corrections                                                                | Pending           | Local overlap/DST/revocation/locking; hosted sessions/concurrency pending                                                                                         | Company policy and classification review                                                          | No           |
| Labor costing                               | Cash/burden/imputed/billing, job aggregates, single posting source                                                      | Pending           | Local arithmetic and payroll privacy; connected posting/reconciliation pending                                                                                    | Independently reviewed costing rules                                                              | No           |
| Payroll preparation                         | Weekly calculations, deductions input, export, locked periods/adjustments                                               | Pending           | Local cross-job overtime/locks; jurisdictional and payroll-provider validation pending                                                                            | Payroll specialist review; export-only approved provider contract                                 | No           |
| Tenant-branded communications               | Tenant sender configuration stays unverified; prepared messages use internal sink only                                  | Pending           | Local sender-domain match and no self-verification; actual SPF/DKIM/DMARC/provider verification, consent/suppression/delivery webhooks pending                    | Per-company verified domain/provider identity, credentials and approved sandbox/sink              | No           |
| Operational readiness / recovery            | Approved existing development designation, read-only settings audit, nine-file reviewed bundle, guarded harness/runbook | Pending           | Local CI/catalog/role tests; Auth hardening, real HTTP, hosted advisors, independent security/load/recovery/accessibility pending                                 | Reviewed exact hosted actions; separate clean production database before launch/outside access    | No           |

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

October16 schema milestone: approved nine-file development bundle applied; all51
public/12 private application tables have RLS, private Storage/default-off gates
verified and official types compared. Security advisor zeroWARN/ERROR; performance
follow-up remains. Auth/API saves await automatic-review action-time confirmation.
This does not change any module's hosted workflow/launch readiness. See
DEVELOPMENT_MIGRATION_RESULT.md for exact versions and remaining acceptance gates.
