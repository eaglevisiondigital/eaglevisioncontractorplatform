# Propel Contractor Suite — feature acceptance register

Date: 2026-11-01. Integrator: main Codex. Confirmed remote source baseline:
`dc7ed7c2db3cf8ff78a3d6f09098a1b623622874`. The original eighteen scope IDs are
preserved and seven existing cross-cutting capabilities are now separately recorded.
This is an implementation/evidence inventory, not operational or release acceptance.

The owner authorized isolated parallel local development. No hosted mutation,
migration, credential use, financial/provider/communication activation, deployment
or merge is authorized. **Release 1.0 remains NOT READY / NOT AUTHORIZED.**

## Evidence contract

[Machine-readable records](FEATURE_ACCEPTANCE_EVIDENCE.json) retain every owner,
scope/design/local/hosted/release state, exact source/test anchor, source baseline SHA,
retained validation record, CI identity, route, underlying object, risk, dependency,
next acceptance and approval boundary. `npm run features:check` verifies citations,
unique IDs, original-scope coverage and an acyclic dependency graph. Qualified table names must exist in unchanged local migration source; this does not prove hosted installation. It computes
current file SHA-256 and line references without reading private trees or following
symlinks. A valid citation does not mean a test ran or passed.

SCOPE/DESIGN/LOCAL/CI/HOSTED/RELEASE remain separate. LOCAL partial means a real
bounded implementation exists with retained local evidence, while the full capability
has gaps. NONE means the broader feature has no verified implementation, even when
a related primitive exists. HOSTED blocked/not accepted does not erase historical
Action B core connected acceptance; it means the entire listed capability has not
passed current operational acceptance. New branch changes require their own CI.

Retained common baseline CI:
[Foundation 41270357940](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41270357940)
at `69548b1c328d9ae557953c2ca3904576f88f0d74`: 1606 application cases passed,
321 native-only cases skipped in that job, 661 native PostgreSQL cases and 234 browser
cases passed in their respective jobs. This is retained evidence, not a rerun or
certification of the new packages. QA-001 has no prior CI claim. Current branch/PR
results belong in [delivery status](PROGRAM_DELIVERY_STATUS.md).

## Reconciled capability inventory

| ID / owner   | Capability                                                                        | Design / local evidence         | Hosted / release              | Next acceptance                                                                                                |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SEC-001 / A0 | Tenant isolation, RLS, MFA and role authority                                     | Existing design / LOCAL partial | blocked / NOT AUTHORIZED      | Close exact independent recovery and broker/security acceptance prerequisites without reopening grants.        |
| SEC-002 / A0 | Independent recovery, containment and no replay                                   | Existing design / LOCAL partial | blocked / NOT AUTHORIZED      | Run only the existing owner-operated physical rehearsal once qualifying hardware is available.                 |
| CRM-001 / A2 | Leads, intake, customer and service-location CRM                                  | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Review paginated customer/location selection without creating duplicate CRM.                                   |
| EST-001 / A2 | Canonical estimating, immutable issued versions and revisions                     | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Review PR2 frozen-offer projection fix; retain exact request/source/version identity.                          |
| EST-002 / A5 | Customer decision, committed admission, durable receipt and eligible staff reader | Existing design / LOCAL partial | blocked / NOT AUTHORIZED      | After recovery/P1-on13, separately review unchanged14 and exact4B+broker ownership/hash/grants/mapping/target. |
| SAL-001 / A2 | Contracts, e-sign sandbox and change-order foundation                             | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Review cross-module source immutability in PR2; separately specify genuine signing acceptance.                 |
| FLD-001 / A3 | Inspection plans, visits, maintenance triage and repair readiness                 | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Review isolated schedule projection in separate field PR; preserve approved workspace.                         |
| FLD-002 / A3 | Schedule viewing, timekeeping, dispatch and offline field work                    | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Review the default-OFF read-only visit timeline; define one exact follow-up handoff before any dispatch.       |
| FIN-001 / A4 | Invoice schedules, tokenized payment and reconciliation foundations               | Existing design / LOCAL partial | blocked / NOT AUTHORIZED      | Review PR3 exact event-to-posting verifier fix and finite NMI acceptance plan.                                 |
| FIN-002 / A4 | Job profitability, purchasing and accounting scope                                | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Keep existing cost engine; specify accounting export/reconciliation boundaries before adapters.                |
| CUS-001 / A5 | Branded portal, report history, attention, comparison and search                  | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Preserve locked portal; review shared projection changes through exact provenance tests.                       |
| CUS-002 / A5 | Property Passport, warranty and proof-of-work expansion                           | Scope only                      | not_accepted / NOT AUTHORIZED | Specify a single customer-safe service-evidence projection over existing objects; no new property store.       |
| GRO-001 / A6 | Maintenance revenue and recurring-program expansion                               | Scope only                      | not_accepted / NOT AUTHORIZED | Define consented program enrollment independently of visit recurrence and financial execution.                 |
| GRO-002 / A6 | Reviews, referrals, follow-ups and booking automation                             | Scope only                      | not_accepted / NOT AUTHORIZED | Specify bounded consent and manual-review contracts before implementation.                                     |
| AI-001 / A6  | Voice-to-estimate, Copilot, answering and storm-mode scope                        | Scope only                      | not_accepted / NOT AUTHORIZED | Define one bounded human-confirmed draft input with evaluation/privacy criteria; remain default OFF.           |
| INT-001 / A7 | Supplier, accounting, calendar and telephony interfaces                           | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Inventory exact provider interfaces; choose one non-network export/import contract after owner priority.       |
| UX-001 / A8  | Shared accessible responsive design and approved branding                         | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Use documented shared contracts; review responsive screenshots and existing exact-brand regressions.           |
| OPS-001 / A0 | Release, protected Netlify replacement and operational acceptance                 | Existing design / LOCAL partial | blocked / NOT AUTHORIZED      | Retain original evidence; request exact hosted scope only after independently proven prerequisites.            |
| PLT-001 / A1 | Organization settings, roles, audit and platform administration                   | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Use checked organization/membership RPCs; inventory settings/import/export gaps without generic CRUD.          |
| DOC-001 / A1 | Private documents and quarantine controls                                         | Existing design / LOCAL partial | blocked / NOT AUTHORIZED      | Retain quarantine/default-off controls; separately review actual worker/scanner/provider acceptance.           |
| MAT-001 / A7 | Smart Material Import and reviewed customer-safe material lines                   | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Reuse reviewed import engine and exact line provenance; do not add a parallel product/price system.            |
| JOB-001 / A3 | Immutable job baselines, costs and approved change tracking                       | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Preserve original baseline and cost engine while specifying exact future work-order handoffs.                  |
| WRK-001 / A3 | Workforce, overtime and payroll preparation                                       | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Preserve existing engine; define actual assignment/availability interfaces before dispatch.                    |
| COM-001 / A2 | Verified sender preparation, escaped templates and internal sinks                 | Existing design / LOCAL partial | blocked / NOT AUTHORIZED      | Retain exact scope/hash/source and separate explicit delivery authorization.                                   |
| QA-001 / A8  | Feature evidence, source ownership inventory and release-label checks             | Existing design / LOCAL partial | not_accepted / NOT AUTHORIZED | Run features:check in normal CI; inspect exact branch run and retain honest unknown gaps.                      |

## Exact implementation, interface and acceptance records

### SEC-001 · A0 · Tenant isolation, RLS, MFA and role authority

Source: `src/lib/operations.ts` → `export class Operations`; `SECURITY_MODEL.md` → `# Security model · Phase 2`.

Tests: `tests/database/isolation.test.ts` → enables RLS on every application table, including private tables.

Retained records: [ACTION_B_CONNECTED_RESULT.md](ACTION_B_CONNECTED_RESULT.md).

UI: `/preview`; `/internal-release (operator gated)`. Objects/contracts: public.organizations; public.memberships; private grants; tenant composite foreign keys.

Limits: 723 retained core connected cases do not certify the new customer broker or every module. Historical helper/installer TCB, core CREATE/statistics and genuine new lifecycle Auth remain unverified.

Dependencies: None within this register. Next: Close exact independent recovery and broker/security acceptance prerequisites without reopening grants.

### SEC-002 · A0 · Independent recovery, containment and no replay

Source: `docs/TWO_COMPUTER_REHEARSAL.md` → `# Two-Mac synthetic recovery rehearsal`.

Tests: `tests/property-p1-backup.test.ts` → never permits a session without positive authenticated backup acknowledgment.

Retained records: [TWO_COMPUTER_REHEARSAL_VALIDATION.json](TWO_COMPUTER_REHEARSAL_VALIDATION.json); [PROPERTY_P1_R0_DEVICE_READINESS.md](PROPERTY_P1_R0_DEVICE_READINESS.md).

UI: No mounted operational route. Objects/contracts: Frozen P1 operation and four artifacts; credential-free two-device rehearsal.

Limits: Prior 25 offline passes and completed setup are not physical pairing/primary-loss acceptance. Supported encrypted independent hardware, power/network and human supervision remain pending.

Dependencies: SEC-001. Next: Run only the existing owner-operated physical rehearsal once qualifying hardware is available.

### CRM-001 · A2 · Leads, intake, customer and service-location CRM

Source: `src/lib/operations.ts` → `export class Operations`.

Tests: `tests/operations-preview.test.ts` → paginates and filters synthetic CRM records without mixing company workspaces.

Retained records: [PHASE2_VALIDATION.md](PHASE2_VALIDATION.md); [ACTION_B_CONNECTED_RESULT.md](ACTION_B_CONNECTED_RESULT.md).

UI: `/preview > Customers`; `/preview > Leads`. Objects/contracts: public.customers; public.service_locations; public.jobs; public.intake_requests.

Limits: Existing local CRM is implemented; first-page lookup limits and connected lifecycle acceptance need bounded follow-up. Public intake remains gated by approved CAPTCHA and infrastructure.

Dependencies: SEC-001. Next: Review paginated customer/location selection without creating duplicate CRM.

### EST-001 · A2 · Canonical estimating, immutable issued versions and revisions

Source: `src/lib/phase3.ts` → `export class Phase3Repository`; `src/domain/estimating/calculation.ts` → `export function calculateEstimate`.

Tests: `tests/estimating.test.ts` → rounds unit price before extension and reconciles payment shares.

Retained records: [PHASE3_VALIDATION.md](PHASE3_VALIDATION.md); [CUSTOMER_ESTIMATE_REVISIONS.md](CUSTOMER_ESTIMATE_REVISIONS.md).

UI: `/preview > Estimates`. Objects/contracts: public.estimates; public.estimate_versions; canonical integer calculation.

Limits: Local estimating exists; issued-safe customer scope requires exact immutable source. Revision, repair-origin and connected issuance guards stay closed.

Dependencies: CRM-001. Next: Review PR2 frozen-offer projection fix; retain exact request/source/version identity.

### EST-002 · A5 · Customer decision, committed admission, durable receipt and eligible staff reader

Source: `server/customer/broker.ts` → `export class CustomerRequestBroker`.

Tests: `tests/customer-broker.test.ts` → actual SDK getUser plus live session creates only an opaque server proof.

Retained records: [CUSTOMER_BROKER_INTEGRATION.md](CUSTOMER_BROKER_INTEGRATION.md); [CUSTOMER_BROKER_VALIDATION.json](CUSTOMER_BROKER_VALIDATION.json).

UI: `No connected App route; disposable PG17 composition only`. Objects/contracts: Existing private decision ledger; customer14 publication; separate 4B/broker proposals.

Limits: Native process-loss and fixture SDK evidence are not genuine hosted Auth or operational custody. UNKNOWN permits exact read only; no replay, rebind, replacement ID or publication bypass.

Dependencies: EST-001, SEC-002. Next: After recovery/P1-on13, separately review unchanged14 and exact4B+broker ownership/hash/grants/mapping/target.

### SAL-001 · A2 · Contracts, e-sign sandbox and change-order foundation

Source: `server/contracts/signing.ts` → `export class SignatureSandboxGateway`; `src/domain/jobs/financials.ts` → `export interface ChangeOrder`.

Tests: `tests/signature-provider.test.ts` → binds sandbox completion to original bytes, signer, consent, account and immutable evidence hashes.

Retained records: [PROVIDER_INTEGRATION_READINESS.md](PROVIDER_INTEGRATION_READINESS.md); [PHASE3_VALIDATION.md](PHASE3_VALIDATION.md).

UI: `/preview/release (explicit synthetic sandbox)`. Objects/contracts: Immutable estimate scope; private signature evidence; job change orders.

Limits: Contract/sandbox source already exists; legal execution, provider identity and genuine consent are not accepted. Ordinary contracts and real signatures remain disabled.

Dependencies: EST-001. Next: Review cross-module source immutability in PR2; separately specify genuine signing acceptance.

### FLD-001 · A3 · Inspection plans, visits, maintenance triage and repair readiness

Source: `src/lib/property.ts` → `export class PropertyRepository`.

Tests: `tests/property-operations.test.ts` → recurrence stays anchored across month ends and DST without shifting local visit dates.

Retained records: [PROPERTY_OPERATIONS_VALIDATION.md](PROPERTY_OPERATIONS_VALIDATION.md); [MAINTENANCE_FOLLOW_UP_VALIDATION.json](MAINTENANCE_FOLLOW_UP_VALIDATION.json); [REPAIR_SCOPE_READINESS_VALIDATION.json](REPAIR_SCOPE_READINESS_VALIDATION.json).

UI: `/preview > Property Operations`. Objects/contracts: CRM service location; private inspection plans/visits/reports; exact maintenance source/CAS; existing estimate repair origin.

Limits: Staff review/scheduling/readiness never prove physical repair or customer authorization. 2A-2F disposable persistence does not establish operational writer custody.

Dependencies: CRM-001. Next: Review isolated schedule projection in separate field PR; preserve approved workspace.

### FLD-002 · A3 · Schedule viewing, timekeeping, dispatch and offline field work

Source: `src/lib/phase3.ts` → `recordTime`; `src/domain/workforce/payroll.ts` → `export function preparePayroll`.

Tests: `tests/jobs-workforce.test.ts` → rejects overlaps across jobs, including open clocks and breaks.

Retained records: [PHASE3_VALIDATION.md](PHASE3_VALIDATION.md).

UI: `/preview > Workforce`; `Proposed isolated /preview/field-scheduling in separate draft PR`. Objects/contracts: Existing jobs/assignments/time entries/breaks; employer week and policy.

Limits: Existing timekeeping is executable locally; sample job assignment does not retain dispatch. Operational crew scheduling, offline conflict custody and proof-of-work remain UNKNOWN.

Dependencies: FLD-001. Next: Review the default-OFF read-only visit timeline; define one exact follow-up handoff before any dispatch.

### FIN-001 · A4 · Invoice schedules, tokenized payment and reconciliation foundations

Source: `src/domain/release/types.ts` → `export function verifyLedger`; `src/domain/platform.ts` → `export const paymentCapabilities`.

Tests: `tests/payments-sandbox.test.ts` → formats currency exactly without floating-point multiplication.

Retained records: [PROVIDER_INTEGRATION_READINESS.md](PROVIDER_INTEGRATION_READINESS.md); [BILLING_ENHANCEMENTS_PROPOSED.json](BILLING_ENHANCEMENTS_PROPOSED.json).

UI: `/preview/release (synthetic only)`. Objects/contracts: Existing internal/sandbox invoice and payment events; ledger entries; merchant configuration.

Limits: No live charge, invoice, receivable, settlement, payout or provider execution authority. NMI merchant/tokenization/consent/custody acceptance and all six billing enhancements remain unaccepted/PROPOSED.

Dependencies: EST-001. Next: Review PR3 exact event-to-posting verifier fix and finite NMI acceptance plan.

### FIN-002 · A4 · Job profitability, purchasing and accounting scope

Source: `src/domain/jobs/financials.ts` → `export function jobFinancials`.

Tests: `tests/jobs-workforce.test.ts` → forecasts include remaining costs and approved labor only once.

Retained records: [PHASE3_VALIDATION.md](PHASE3_VALIDATION.md).

UI: `/preview > Jobs`. Objects/contracts: Existing job baseline; expenses/events; approved labor summary; purchase matching.

Limits: Profitability is implemented locally; external accounting and purchase-order lifecycle are not certified. Incomplete cost inputs cannot be labeled final; no automatic customer billing.

Dependencies: EST-001. Next: Keep existing cost engine; specify accounting export/reconciliation boundaries before adapters.

### CUS-001 · A5 · Branded portal, report history, attention, comparison and search

Source: `src/domain/customer/review.ts` → `export function projectIssuedReview`.

Tests: `tests/property-attention.test.ts` → groups repeated identifiers conservatively, distinguishes observations and recommendations, retains all exact sources.

Retained records: [PROPERTY_PORTAL_PHASE_B_VALIDATION.json](PROPERTY_PORTAL_PHASE_B_VALIDATION.json); [INSPECTION_HISTORY_SEARCH_VALIDATION.json](INSPECTION_HISTORY_SEARCH_VALIDATION.json).

UI: `/preview/property-portal`; `/preview/property-portal-design`. Objects/contracts: CRM customer/location; immutable published reports/findings; allowlisted issued estimate scope.

Limits: Approved presentation is locked; missing/access-limited history is not complete coverage. No connected login, publication, preference authority or inferred repair.

Dependencies: CRM-001, EST-001. Next: Preserve locked portal; review shared projection changes through exact provenance tests.

### CUS-002 · A5 · Property Passport, warranty and proof-of-work expansion

Source: `docs/PRODUCT_PROGRAM_2026.md` → `Property Passport`.

Tests: No implemented feature test identified; absence is not PASS..

Retained records: [PRODUCT_PROGRAM_2026.md](PRODUCT_PROGRAM_2026.md).

UI: No mounted operational route. Objects/contracts: Reuse existing CRM location, report/version, job and private media contracts.

Limits: Published inspection history is not a complete Property Passport, warranty or verified completion system. Media quarantine, consent, access and retention gates remain unmet.

Dependencies: CUS-001, FLD-001. Next: Specify a single customer-safe service-evidence projection over existing objects; no new property store.

### GRO-001 · A6 · Maintenance revenue and recurring-program expansion

Source: `docs/PRODUCT_PROGRAM_2026.md` → `recurring maintenance`.

Tests: No implemented feature test identified; absence is not PASS..

Retained records: [BILLING_ENHANCEMENTS_PROPOSED.json](BILLING_ENHANCEMENTS_PROPOSED.json).

UI: No mounted operational route. Objects/contracts: Existing inspection recurrence; proposed consent/billing linkage.

Limits: Inspection cadence already exists; paid program enrollment/consent/billing is not implemented acceptance. Six billing proposals stay PROPOSED; no AR or customer obligations.

Dependencies: FLD-001, FIN-001. Next: Define consented program enrollment independently of visit recurrence and financial execution.

### GRO-002 · A6 · Reviews, referrals, follow-ups and booking automation

Source: `docs/PRODUCT_PROGRAM_2026.md` → `followups, reviews, referrals`.

Tests: No implemented feature test identified; absence is not PASS..

Retained records: [PRODUCT_PROGRAM_2026.md](PRODUCT_PROGRAM_2026.md).

UI: No mounted operational route. Objects/contracts: Reuse CRM and communications preparation; no duplicate lead store.

Limits: No verified automated sending, consent/opt-out provider pipeline or external booking.

Dependencies: CRM-001. Next: Specify bounded consent and manual-review contracts before implementation.

### AI-001 · A6 · Voice-to-estimate, Copilot, answering and storm-mode scope

Source: `docs/PRODUCT_PROGRAM_2026.md` → `voice-to-estimate`.

Tests: No implemented feature test identified; absence is not PASS..

Retained records: [PHASE3A_WORKER.md](PHASE3A_WORKER.md).

UI: No mounted operational route. Objects/contracts: Existing estimate draft and quarantine/extraction contracts.

Limits: Material extraction interfaces do not constitute an accepted voice agent/Copilot. No real AI/provider activation, autonomous financial decisions or customer messages.

Dependencies: EST-001. Next: Define one bounded human-confirmed draft input with evaluation/privacy criteria; remain default OFF.

### INT-001 · A7 · Supplier, accounting, calendar and telephony interfaces

Source: `server/property/supplier-connectors.ts` → `export const supplierConnectors`.

Tests: `tests/provider-webhooks.test.ts` → uses NMI payment nonce dot raw-body, not the unrelated underwriting protocol.

Retained records: [PROVIDER_INTEGRATION_READINESS.md](PROVIDER_INTEGRATION_READINESS.md); [PROPERTY_OPERATIONS_VALIDATION.md](PROPERTY_OPERATIONS_VALIDATION.md).

UI: No mounted operational route. Objects/contracts: Existing supplier connector contracts; provider-specific webhook envelope; merchant reference.

Limits: Supplier connectors are disabled interfaces; calendar/phone/accounting operational adapters unverified. Contract tests do not authorize calls, credentials, ingestion or provider execution.

Dependencies: CRM-001. Next: Inventory exact provider interfaces; choose one non-network export/import contract after owner priority.

### UX-001 · A8 · Shared accessible responsive design and approved branding

Source: `src/domain/brand.ts` → `export const productBrand`; `src/styles.css` → `:root`.

Tests: `tests/browser/branding.spec.ts` → approved Propel asset and product identity cover platform surfaces while tenant brands stay independent.

Retained records: [BRANDING.md](BRANDING.md); [CONTRACTOR_BACK_OFFICE_PHASE_B_VALIDATION.json](CONTRACTOR_BACK_OFFICE_PHASE_B_VALIDATION.json).

UI: `/preview`; `/preview/property-portal`; `/preview/contractor-design`. Objects/contracts: CompanyProfile; existing global/scoped tokens and components.

Limits: Approved customer/back-office layouts and original artwork are locked. New isolated schedule preview requires explicit visual integration review before promotion.

Dependencies: None within this register. Next: Use documented shared contracts; review responsive screenshots and existing exact-brand regressions.

### OPS-001 · A0 · Release, protected Netlify replacement and operational acceptance

Source: `server/netlify/read-only-inventory.ts` → `InventoryEvidence`.

Tests: `tests/netlify-replacement.test.ts` → rejects a broadened approval record or an owner-labelled synthetic permit.

Retained records: [NETLIFY_REPLACEMENT_EXECUTOR_VALIDATION.json](NETLIFY_REPLACEMENT_EXECUTOR_VALIDATION.json); [RELEASE_1_0_ACCEPTANCE.md](RELEASE_1_0_ACCEPTANCE.md).

UI: No mounted operational route. Objects/contracts: Original frozen archive/config/body; read-only inventory; fake-only bounded executor.

Limits: No live mutation adapter, exact execution approval or independent dashboard-protection PASS. Physical recovery, operational Auth/custody/provider/release gates remain closed.

Dependencies: SEC-002, EST-002, FIN-001. Next: Retain original evidence; request exact hosted scope only after independently proven prerequisites.

### PLT-001 · A1 · Organization settings, roles, audit and platform administration

Source: `src/domain/platform.ts` → `export const modules`; `src/lib/operations.ts` → `export class Operations`.

Tests: `tests/database/isolation.test.ts` → enables RLS on every application table, including private tables.

Retained records: [PHASE2_VALIDATION.md](PHASE2_VALIDATION.md); [ACTION_B_CONNECTED_RESULT.md](ACTION_B_CONNECTED_RESULT.md).

UI: `/preview > Company settings`. Objects/contracts: public.organizations; public.memberships; private platform grants; audit events.

Limits: Core retained hosted evidence is partial; platform grants never confer customer data access. Subscriptions, observability/export lifecycle require feature-specific acceptance.

Dependencies: SEC-001. Next: Use checked organization/membership RPCs; inventory settings/import/export gaps without generic CRUD.

### DOC-001 · A1 · Private documents and quarantine controls

Source: `server/materials/pipeline.ts` → `export function validateEnvelope`.

Tests: `tests/material-worker.test.ts` → scanner gateway sends bounded raw bytes and accepts only authenticated contract evidence.

Retained records: [PHASE3A_VALIDATION.md](PHASE3A_VALIDATION.md).

UI: No mounted operational route. Objects/contracts: Private Storage objects; quarantine jobs; durable worker control.

Limits: Local worker/scanner contracts are not a provisioned scanner, isolated workload or accepted real Storage flow. Uploads/signed issuance and ingestion503 remain blocked.

Dependencies: SEC-001. Next: Retain quarantine/default-off controls; separately review actual worker/scanner/provider acceptance.

### MAT-001 · A7 · Smart Material Import and reviewed customer-safe material lines

Source: `src/domain/materials/import.ts` → `export function customerMaterialLine`.

Tests: `tests/materials.test.ts` → retains multi-supplier documents, literal costs and source references.

Retained records: [MATERIAL_IMPORT.md](MATERIAL_IMPORT.md); [PHASE3_VALIDATION.md](PHASE3_VALIDATION.md).

UI: `/preview > Smart Material Import`. Objects/contracts: Existing source documents; review lines; estimate input and import provenance.

Limits: Synthetic import/review is executable; real ingestion/provider acceptance remains blocked. Supplier prices and internal margins never enter customer scope.

Dependencies: EST-001, DOC-001. Next: Reuse reviewed import engine and exact line provenance; do not add a parallel product/price system.

### JOB-001 · A3 · Immutable job baselines, costs and approved change tracking

Source: `src/domain/jobs/financials.ts` → `export function baselineFromEstimate`.

Tests: `tests/jobs-workforce.test.ts` → baseline retains original selected estimate revenue and material/labor cost.

Retained records: [PHASE3_VALIDATION.md](PHASE3_VALIDATION.md).

UI: `/preview > Jobs`. Objects/contracts: Existing jobs; immutable job baseline; expense events/change orders.

Limits: Job baseline is local/retained-core evidence, not customer authorization or dispatch. Locked costs require append-only corrections.

Dependencies: EST-001. Next: Preserve original baseline and cost engine while specifying exact future work-order handoffs.

### WRK-001 · A3 · Workforce, overtime and payroll preparation

Source: `src/domain/workforce/payroll.ts` → `export function preparePayroll`.

Tests: `tests/jobs-workforce.test.ts` → combines overtime across multiple jobs and overhead in one employer week.

Retained records: [PHASE3_VALIDATION.md](PHASE3_VALIDATION.md).

UI: `/preview > Workforce`. Objects/contracts: Time entries/breaks; worker rates; payroll preparation records.

Limits: Approved preparation is not legal classification, statutory compliance or payroll disbursement. Private rates/deductions excluded from field/customer views.

Dependencies: JOB-001. Next: Preserve existing engine; define actual assignment/availability interfaces before dispatch.

### COM-001 · A2 · Verified sender preparation, escaped templates and internal sinks

Source: `server/communications/preparation.ts` → `export async function prepareTenantNotification`.

Tests: `tests/communications-preparation.test.ts` → prepares tenant-branded escaped HTML and text but cannot send an email.

Retained records: [PROVIDER_INTEGRATION_READINESS.md](PROVIDER_INTEGRATION_READINESS.md).

UI: `/preview/release (internal sink only)`. Objects/contracts: Existing communication outbox/preparation; verified sender evidence; internal sink.

Limits: Prepared content is not sent/delivered evidence or a live customer URL. No credential loader, provider execution, real recipient resolution or consent inferred.

Dependencies: EST-001. Next: Retain exact scope/hash/source and separate explicit delivery authorization.

### QA-001 · A8 · Feature evidence, source ownership inventory and release-label checks

Source: `scripts/feature-evidence.mjs` → `export function validateFeatureEvidence`.

Tests: `tests/program-feature-evidence.test.ts` → validates exact citations without upgrading local evidence into CI, hosted or release acceptance.

Retained records: [SHARED_CONTRACTS.md](program/SHARED_CONTRACTS.md).

UI: No mounted operational route. Objects/contracts: Read-only public source hashes; stable feature IDs and evidence references.

Limits: Source/anchor presence does not prove execution, test success, genuine Auth or release. Cross-worktree changes remain separate draft PRs; no automatic integration or deployment.

Dependencies: UX-001. Next: Run features:check in normal CI; inspect exact branch run and retain honest unknown gaps.

## First-wave changes remain isolated

- A2 sales: draft PR #2 detaches and allowlists customer offer source snapshots, with
  actual CRM → issued estimate → internal offer/decision/contract regression evidence.
- A4 finance: draft PR #3 hardens the existing verifier against missing, swapped,
  duplicate or incomplete event/posting provenance. No new ledger or execution.
- A3 field: draft PR #4 adds the isolated default-OFF read-only schedule over existing
  plan/visit/maintenance sources. Actual dispatch and offline work remain UNKNOWN.
- A8 coordination: evidence checks/shared contracts and source inventory in a separate
  draft PR. These branches are review candidates, not silently integrated into PR #1.

The original thirteen migrations, pending customer14, original4B and broker proposals,
frozen P1 operation/four artifacts, Netlify archive/executor, locked interfaces,
approvals, 2A–2F and six PROPOSED billing enhancements remain unchanged.
