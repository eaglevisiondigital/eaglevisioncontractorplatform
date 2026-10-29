# Bounded development roadmap

October 29, 2026 · continuation of existing implementation, not a new architecture.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

The owner approved Phase A and Package 1 at07f3e6b; bounded local Phase B is now
integrated into /preview Property Operations. The full original module inventory,
canonical session repositories and locked customer portal are preserved. See
CONTRACTOR_BACK_OFFICE_PHASE_B.md. Earlier visual-approval holds are superseded for
this scope; no second design approval is required.

Next preparation package: **Workstream 2 — durable maintenance triage**. Inventory
current source/review/scheduling/CAS/UNKNOWN receipt contracts and define persistence,
retention and restart/concurrency acceptance. Reuse existing records; do not introduce
SQL, hosted execution or a parallel property/task system from this roadmap. Any
migration or connected activation requires its own exact review/authorization.
Biller Genie-inspired accounts-receivable improvements are reserved for the next
product-planning checkpoint, with no feature/integration work authorized here.

These workstreams organize future packages. Each package must identify its actual
missing behavior, existing models/components, acceptance evidence, prerequisites and
specific authorization. This roadmap authorizes no hosted operation, migration,
credential retrieval, provider call, sending, financial execution, deploy or merge.

| Workstream                                                       | Reuse and next bounded acceptance target                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contractor and customer experience completion                 | Approved contractor Phase B is integrated locally; preserve the locked customer portal and full original module navigation while completing bounded experience acceptance.                                                                                                                   |
| 2. Durable property operations and secure connected acceptance   | Reuse PropertyRepository, CRM locations, scheduling, exact source/repair provenance and CAS. Design durable triage only after the local workflow is accepted; separately review any forward schema or connected package. Never replay historical/P1 artifacts.                               |
| 3. Customer estimate delivery, review and authorization          | Reuse immutable issued versions and safe projections. Complete separately gated delivery/access and genuine nonfinancial preference acceptance before any broader contractual authority.                                                                                                     |
| 4. Contracts, e-signature and document execution                 | Reuse accepted scope, document preparation and sandbox signing foundation. Genuine signature/legal acceptance, credentials and provider execution remain separate gates.                                                                                                                     |
| 5. Branded invoices, payment schedules and NMI-first integration | Reuse estimate/job baselines, invoice preparation and payment intent controls. NMI remains preferred, Authorize.Net optional; genuine consent, merchant binding, reviewed legal/tax configuration and exact sandbox authorization precede calls.                                             |
| 6. Secure documents/media and supplier integrations              | Reuse quarantine/import/worker contracts, private reports and manual quote comparison. Validate actual scanner/runtime/Storage before lifting 503 gates. Supplier feeds require an independently reviewed adapter and source authority.                                                      |
| 7. Tenant-specific communications and notifications              | Reuse existing outbox/preparation and branding. Prove tenant recipient/sender binding, consent and uncertain-result containment before separately authorized sending.                                                                                                                        |
| 8. Job, workforce, payroll-preparation and reporting acceptance  | Reuse existing job/cost/time/payroll preparation and append-only corrections. Complete real workflow/concurrency/privacy/reporting acceptance and independent payroll/tax review; preparation is never disbursement.                                                                         |
| 9. Recovery, clean production and full Release 1.0 acceptance    | Complete authentic two-Mac pairing/ACK/supervision/independent-loss recovery without repeating completed setup. Keep Netlify support read-only and frozen deployment blocked. Separate clean production provisioning and full security/workflow acceptance precede explicit launch approval. |

The nine streams are coordinated acceptance work, not reasons to halt unrelated
permitted local development. None may silently drop required Release 1.0 scope or
claim a simulated/localhost pass as physical-device or hosted acceptance.
