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

| Required module                             | Implementation                                                                                  | Hosted validation | Security evidence / remaining gate                                                                                       | Third-party dependencies                                                            | Launch ready |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------ |
| Company onboarding / branding / Super Admin | Internal checked provisioning, memberships, MFA, profiles, settings                             | Pending           | Local RLS/role/revocation; real Auth/TOTP and identity lifecycle pending                                                 | Isolated Supabase Auth; reviewed identity bootstrap                                 | No           |
| CRM / public intake                         | CRM, locations, consent, assignments; intake gated                                              | Pending           | Local tenant/CAPTCHA/idempotency; hosted origins/rate limits pending                                                     | Turnstile test credentials; Netlify runtime                                         | No           |
| Professional estimates                      | Editor, integer pricing, tax reference, immutable internal issue/revision and branded preview   | Pending           | Local arithmetic/concurrency/customer projection; real PostgREST pending                                                 | Reviewed jurisdictional tax policy; branded export acceptance                       | No           |
| Smart Material Import                       | Synthetic review/pricing + parser/provider/scanner/worker contracts; real ingestion remains 503 | Pending           | Local malformed files, scan failures, lease fencing; real scanning, worker persistence/isolation/Storage pending         | Approved scanner, isolated worker/control store, AI gateway/model, retention policy | No           |
| Customer approvals                          | Not implemented; internal issue is not acceptance                                               | Not run           | Authenticated scoped links, expiry, consent and immutable acceptance evidence required                                   | Reviewed customer identity/consent policy                                           | No           |
| Contracts / signatures                      | Design only; hidden and database-disabled                                                       | Not run           | Approved snapshot conversion, jurisdictional templates, signature evidence, immutable artifacts required                 | Legal templates, approved signature-provider sandbox                                | No           |
| Invoicing / branded invoices                | Design only; hidden and database-disabled                                                       | Not run           | Authorized selling-price projection, immutable issue, credit notes and balance reconciliation required                   | Reviewed tax/business branding and invoice export                                   | No           |
| Authorized payments / schedules             | Token/per-company merchant design only; hidden and database-disabled                            | Not run           | Explicit authorization, idempotency, verified webhooks, tenant routing, reconciliation and legal fee policy required     | Separate per-company Authorize.Net/NMI sandbox accounts; provider/legal approval    | No           |
| Job expenses / profitability                | Immutable baseline, commitments/paid/credits, review, authorized changes, projections           | Pending           | Local cross-tenant/duplicates/revisions; hosted expense receipts and authorization pending                               | Approved document pipeline; accounting/export review                                | No           |
| Workforce timekeeping                       | Clock/break/switch, timesheets, supervision, corrections                                        | Pending           | Local overlap/DST/revocation/locking; hosted sessions/concurrency pending                                                | Company policy and classification review                                            | No           |
| Labor costing                               | Cash/burden/imputed/billing, job aggregates, single posting source                              | Pending           | Local arithmetic and payroll privacy; connected posting/reconciliation pending                                           | Independently reviewed costing rules                                                | No           |
| Payroll preparation                         | Weekly calculations, deductions input, export, locked periods/adjustments                       | Pending           | Local cross-job overtime/locks; jurisdictional and payroll-provider validation pending                                   | Payroll specialist review; export-only approved provider contract                   | No           |
| Tenant-branded communications               | Design only; no sending endpoints                                                               | Not run           | Company sender identity, consent/preference, tenant routing, delivery ledger and webhook verification required           | Per-company verified sender/domain; sandbox/sink; provider review                   | No           |
| Operational readiness / recovery            | Local CI, staging plan, read-only audit, guarded harness and rollback runbook                   | Pending           | Independent security review, load/resource/retention/backup-restore drills, accessibility and incident response required | Approved isolated hosting, protected GitHub environment and reviewer                | No           |

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
