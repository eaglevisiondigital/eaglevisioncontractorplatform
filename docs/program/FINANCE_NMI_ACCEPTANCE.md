# Finance, NMI and reconciliation acceptance inventory

Date: 2026-11-01. Workstream owner: Payments, Billing, Accounting & Profitability;
integration owner: Main Codex. Feature IDs: **FIN-001, FIN-002, INT-001**.
Reviewed source: `dc7ed7c2db3cf8ff78a3d6f09098a1b623622874` on
`codex/program-finance-readiness`, based on `codex/phase-1-foundation`.
Authority: owner-directed parallel **local** engineering and read-only inventory.
No financial execution, provider call, credential, new schema or hosted action.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Evidence and status

Status applies to the named capability, not its entire product row. Local test
fixtures, hosted schema installation, earlier authenticated core acceptance and
genuine payment-provider acceptance are different evidence. Nothing here refreshes
a hosted account, grants permission or certifies legal, tax or payroll compliance.

| Feature / capability                                                                             | Exact source and existing data                                                                                                                                                                                                                                                                                                                                                                                                                                | UI / evidence                                                                                                                                                                                                         | Supported status and remaining gap                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIN-001 estimate amounts, tax snapshots, discounts and proposed deposit/milestone/dated schedule | `calculateEstimate`, `validateEstimate` in `src/domain/estimating/calculation.ts:218,52`; `EstimateInput`, `SchedulePart` in `src/domain/estimating/types.ts:47,40`; `Phase3Repository.save/issue/history` in `src/lib/phase3.ts:932,1029,1150`. Existing `estimate_versions`, `estimate_tax_policies`, `estimate_schedule_proposals`.                                                                                                                        | `/preview` → Estimates/Catalog; `tests/estimating.test.ts`, `tests/database/phase3.test.ts`; earlier core result below.                                                                                               | LOCAL plus retained HOSTED internal core acceptance. Proposed schedule is not an invoice, debt or mandate; actual customer financial conversion remains blocked.                                                                                                                              |
| FIN-001 invoice, one-time synthetic authorization, capture, refund, ledger                       | `ReleasePreview.apply` in `src/domain/release/preview.ts:52` (invoice at199, payment at251); `Invoice`, `Authorization`, `PaymentEvent`, `LedgerEntry`, `invoiceBalance`, `verifyLedger` in `src/domain/release/types.ts:43,50,57,67,138,160`. Existing `release_invoices`, `release_authorizations`, `release_payment_events`, `release_ledger_entries`; immutable snapshot from exact signed test contract.                                                 | `/preview/release`; `src/components/release/ReleaseApp.tsx:188` verifies ledger before displaying reconciliation; `tests/release-preview.test.ts`, `tests/database/release.test.ts`, `tests/browser/release.spec.ts`. | LOCAL synthetic flow. Private internal-release hosted positive workflow was explicitly BLOCKED in Action B. No genuine invoice/consent/contract conversion or provider authority. Ordinary Invoices/Payments remain hidden.                                                                   |
| FIN-001 token reference and gateway capture                                                      | `captureReferencedToken`, `SandboxTokenVault` in `server/payments/token-reference.ts:27,17`; `SandboxGateway.capture`, `minorDecimal` in `server/payments/sandbox.ts:120,56`; NMI fixed sale endpoint at272, optional Authorize.Net at245.                                                                                                                                                                                                                    | No ordinary payment UI; injected server ports only. `tests/payment-token-reference.test.ts`, `tests/payments-sandbox.test.ts`.                                                                                        | LOCAL controlled transports only. Vault is an interface, not deployed secret custody; actual hosted tokenization, merchant-specific token compatibility and customer authority missing. USD-only adapter is narrower than generic currency-aware estimates.                                   |
| FIN-001 refunds and durable reconciliation                                                       | `SandboxRefundGateway.refund` in `server/payments/refunds.ts:69`; `RestrictedSandboxStore` in `server/payments/control-store.ts:25` (`recordObservation:133`, `transactions:148`, `reconcile:152`); `reconcileStatement` in `server/payments/reconciliation.ts:13`. `ProviderControl.command` in `server/providers/control.ts:30`.                                                                                                                            | No live UI or enabled adapter. `tests/payments-refunds.test.ts`, `tests/database/payment-provider-store.test.ts`, restricted-command tests.                                                                           | LOCAL. Durable reservations/results/observations/inbox/reconciliation exist; genuine provider responses, statements, settlement and independent reconciliation NOT RUN. A succeeded capture is not a settled payment. UNKNOWN holds, never replay.                                            |
| FIN-001 signed payment events                                                                    | `receiveSandboxPaymentWebhook` in `server/payments/webhook-inbox.ts:11`; `nmiPaymentWebhook`, `authorizeNetWebhook` in `server/providers/webhooks.ts:29,11`. Server-resolved merchant binding; raw-body hash and exact event inbox.                                                                                                                                                                                                                           | `tests/provider-webhooks.test.ts`; durable inbox negatives in payment-store tests.                                                                                                                                    | LOCAL only. Receiver deployment, merchant subscriptions/keys, real callback/abuse/tenant acceptance missing. Authenticated event is evidence for independent reads, not direct ledger posting.                                                                                                |
| FIN-002 cost-to-complete and profit warnings                                                     | `baselineFromEstimate`, `purchaseMatches`, `jobFinancials` in `src/domain/jobs/financials.ts:85,124,152`; `Phase3Repository.jobs/submitExpense/reviewExpense/projection` at1455,1566,1612,1647. Existing `jobs`, `job_expenses`, `job_expense_reviews`, `job_change_orders`, `job_change_approvals`.                                                                                                                                                          | `/preview` → Jobs; `tests/jobs-workforce.test.ts`; earlier genuine internal-core record.                                                                                                                              | LOCAL plus retained HOSTED internal core acceptance. Original revenue excludes tax; commitments/payments/credits avoid double counting; projected profit is not final when costs are incomplete. “Profit Guard” product expansion beyond these existing warnings is DESIGN.                   |
| FIN-002 time, labor and payroll preparation                                                      | `preparePayroll`, `payrollCsv`, `validateTime`, `employerBoundary` in `src/domain/workforce/payroll.ts:114,294,72,334`; `Phase3Repository.workforce/payroll/adjustPayroll` at1709,1956,2085. Existing `worker_profiles`, `labor_rates`, `time_entries`, `time_reviews`, `payroll_periods`, `payroll_adjustments`.                                                                                                                                             | `/preview` → Workforce/Jobs; `tests/jobs-workforce.test.ts`, native workforce tests.                                                                                                                                  | LOCAL plus retained HOSTED internal core acceptance; locked preparation and later append-only adjustments exist. No statutory withholding/filing/disbursement, jurisdictional compliance or payroll-provider integration. Billing value, cash wages, burden and imputed cost remain distinct. |
| FIN-002 / INT-001 purchasing and supplier costs                                                  | `compareSuppliers`, `quoteExtension`, `draftCostLines` in `src/domain/property/comparison.ts:133,76,222`; `unbilledRows`, `prepareMaterialDecision` in `src/domain/property/unbilled.ts:21,93`; `Phase3Repository.recordPurchasedMaterials` at1347; `PropertyRepository.decide/applyCosts` in `src/lib/property.ts:1011,986`. Existing expense/material-line relationships, private supplier comparisons, unbilled decisions and supplemental invoice drafts. | `/preview` → Supplier comparison, Jobs → unbilled review; `tests/property-operations.test.ts` and property DB/browser cases.                                                                                          | LOCAL reviewed quotes and source comparisons, not live purchase orders or inventory reservations. Supplemental drafts await separately verified authorization; no automatic new receivable. Historical property schema installation does not certify runtime acceptance.                      |
| INT-001 live suppliers                                                                           | `SupplierConnector`, `supplierConnectors` in `server/property/supplier-connectors.ts:6,20`.                                                                                                                                                                                                                                                                                                                                                                   | Each connector returns503; no provider account, scraper or quote client.                                                                                                                                              | DESIGN interface only. Retailer IDs are proposed targets, not certified integrations or available account entitlements.                                                                                                                                                                       |
| INT-001 accounting, payouts, disputes                                                            | No accounting adapter, bank-payout executor, dispute workflow or authoritative external chart mapping found in `src/`, `server/`, `tests/`. `reconcileStatement` matches exact capture/refund transaction facts only.                                                                                                                                                                                                                                         | README required scope; B006 proposed requirements.                                                                                                                                                                    | UNKNOWN implementation / DESIGN requirements. Reporting or equality of transaction net is not proof of bank funding, fee allocation, chargeback resolution or successful accounting synchronization.                                                                                          |
| FIN-001 communications / billing reminders                                                       | `prepareTenantNotification` in `server/communications/preparation.ts:191`; `DurableEmailPreparation` in `server/communications/persistence.ts:19`; existing provider email sender/outbox/event/suppression objects.                                                                                                                                                                                                                                           | Disabled-only preparation, tests in communication/provider suites.                                                                                                                                                    | LOCAL preparation, no sending. No payment-aware cadence/reminder engine; B002 remains PROPOSED. Messages require exact current invoice balance/holds plus separate sender/consent/outbox/delivery acceptance.                                                                                 |

Underlying schema references, unchanged: estimating migration
`20261015204729` (versions:53, schedule proposals:87); job financials
`20261015210546` (jobs:2, expenses:19, reviews:34); workforce `20261015210856`
(rates:20, time:28, payroll periods:45); internal workflow `20261016024502`
(invoices:65, events:78, ledger:88); provider persistence `20261016185108`
(authorizations:16, attempts:30, settlements:49, inbox:89, workloads:117,
observations:151, reconciliations:165, restricted command:182); property operations
`20261017005322` (supplier comparisons:34, supplemental drafts:51).
These are evidence references, not installation instructions. All thirteen historical
migrations and pending customer fourteen remain unchanged.

Retained acceptance:

- `docs/PROVIDER_MIGRATION_EXECUTION.md` and `PROVIDER_MIGRATION_REVIEW.json`
  record an earlier exact development **schema-only** apply from source
  `57f2aa1e682a9d0ce6b82d5c8eaf904959eb0517`, hash
  `5dd07b079a591b433fa7ab432fd841026de91a1cd3f1d3a722bef500aa9fd32d`.
  Providers, merchant authorizations and workloads remained off. Older proposal-only
  sections in readiness/foundation documents are historical, not current installation status.
- `docs/ACTION_B_CONNECTED_RESULT.md` records723 genuine authenticated core cases,
  including existing estimate/job/workforce fixture acceptance and locked payroll
  preparation. It expressly excludes private release financial workflows and real
  providers. That historical synthetic-data acceptance is not refreshed by this task.
- Retained ancestor CI: `69548b1c328d9ae557953c2ca3904576f88f0d74`, Foundation
  [41270357940](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41270357940),
  reported1,606 application/661 native/234 browser passes. Counts overlap feature
  suites; they are not extra finance cases. This new finance diff has no CI claim
  until its own reviewed commit runs. Main Codex owns final CI/PR linkage.

## Working correction and focused evidence

The original `verifyLedger` could label an invoice reconciled from the receivable
sum even when its capture posting referenced a nonexistent event. The new test
failed against unchanged source: expected an exception, received acceptance.
A compensated capture/refund pair could also conceal swapped/missing/duplicated
postings while leaving the same net balance.

The existing verifier now requires one exact synthetic payment event per event
posting, same amount and correct capture/refund account direction; duplicate row
IDs/events, reused/missing/foreign event references and noninvoice account pairs
fail closed. It retains the original integer balance/tenant/customer/currency checks,
immutable sources, event types and schema. It is a local projection integrity check,
not authenticated source custody or financial authorization. It neither rewrites
records nor attempts to repair discrepancies.

Executed against this reviewable finance package:

- `vitest run tests/program-finance-reconciliation.test.ts tests/release-preview.test.ts tests/payments-refunds.test.ts tests/payments-sandbox.test.ts tests/payment-token-reference.test.ts`: **88 PASS**, including19 new cases.
- New coverage: all three companies; canonical discount/tax/schedule through safe
  invoice and tax-exclusive job baseline; exact capture/reversing refund; immutable
  inputs; nonexistent/foreign/swapped/missing/duplicated event evidence; per-event
  amount/tenant/customer/currency/provider/kind; exact statement IDs despite equal
  totals; BigInt aggregate above safe-number range.
- Existing `tests/browser/release.spec.ts`: **6 PASS** on isolated loopback4177,
  desktop/tablet/mobile; each full flow visits all three companies. Includes axe,
  overflow, print invoice, synthetic capture/refund and ordinary financial-module
  closure. No UI was redesigned or new browser authorization added.
- `npm run build`: strict TypeScript and Vite PASS. Focused ESLint, Prettier and
  `git diff --check` PASS. No migration/native suite rerun was needed: no SQL or
  permission changed. Existing durable/native evidence is retained above.

## Shared integration contracts

These bind existing types; they create no new store, event bus or operational API.

| Boundary          | Contract to preserve                                                                                                                                                                                                                                                                | Reject / hold                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money and tax     | Integer minor units plus explicit currency; exact BigInt arithmetic; `calculateEstimate` engine1 and saved tax snapshot; schedule residual belongs to final installment. Tax payable is separate from tax-exclusive sales/job revenue. USD-only gateway conversion at its boundary. | Fractions, unsafe integers, cross-currency sums, implicit conversion, current policy substituted for issued snapshot, schedule treated as a mandate, unapproved fees.                   |
| Business source   | Exact organization/customer/service-location/job/estimate/version and immutable snapshot identity. Preserve contract/invoice/authorization/event references; nullable location does not create ownership.                                                                           | Text similarity or equal amount used as identity; another tenant's payer/token/job; altered issued source; duplicate debt or parallel financial ledger.                                 |
| Payment intent    | Existing `SandboxIntent`: tenant+merchant+provider+environment, invoice, authorization, immutable integer USD amount, expiry and durable key/digest. Token references also bind customer; no raw payment fields or logged nonce.                                                    | New key after pending/UNKNOWN, changed payload under same key, reuse authorization, expired/revoked merchant/customer authority, browser-supplied privileged identity.                  |
| Provider evidence | Server-resolved merchant account/environment; exact transaction/event ID and raw-body digest; persist inbox before acknowledgment; append independent observation with source digest/as-of time. NMI nonce is not a timestamp.                                                      | Payload tenant as authority, signature alone as settlement, duplicate or changed event, stale current-workload authority, conflicting/out-of-order facts silently overwriting evidence. |
| Reconciliation    | Exact transaction kind/ID/currency/amount against bounded current durable snapshot; persist report identity/hash and CAS. Additional bank batch/gross/fee/net/date/allocation contracts need review.                                                                                | Equal net alone, amount-only matches, pending/UNKNOWN counted as settled, missing statement rows counted as zero, partial reports claimed complete.                                     |
| Purchasing        | Existing quote/source/SKU/spec/unit/pack/stock/time plus explicit equivalence/assignment; approved expense and exact source line/credit/material IDs; reuse job ledger once.                                                                                                        | Quoted stock treated as reserved; fuzzy match accepted automatically; incomplete acquisition cost labeled cheapest; invoice draft treated as issued debt.                               |
| Workforce         | Exact tenant/worker/job, effective rate/policy, employer timezone/week, approved time, immutable locked period and append-only correction. Restrict private rates/deductions and separate cash/burden/imputed/billing value.                                                        | Reposting locked labor, invoice-costed contractor wages counted twice, payroll CSV treated as disbursement/legal classification, customer projection leaking rates.                     |

Missing cross-module mappings: authoritative real invoice/accepted-scope/mandate
provenance into provider authorizations; production token-vault and custody lifecycle;
payer/delegate authority distinct from property viewing; exact purchase order→receipt→
expense/credit approval mapping; reviewed change order→invoice allocation; provider
batch→gross/fee/refund/dispute/net→bank deposit; accounting chart/tax/customer/job
external IDs, export direction/cursor/idempotency/conflict rules. None is inferred
from a similarly named record or implemented by a second ledger here.

## Finite provider acceptance order, all later actions separately authorized

NMI is preferred; Authorize.Net remains optional with entirely independent merchant,
keys, token/profile scope, provider authorization and account/report acceptance.
Neither preference authorizes an account change or financial call.

1. **Current local evidence:** review this diff and existing reserve/finish/inbox/
   observation/reconciliation contracts. Keep default-off payment flags and all
   connected customer/financial routes closed. Recovery/P1/customer14/4B gates
   remain their separate original sequences; no duplicate approval request.
2. **Account and settlement readiness review:** owner identifies an exact sandbox
   provider account per company and evidence of control, processor/acquirer,
   currency/rail entitlements, settlement recipient ownership, cutoffs/timezone,
   funding/report availability and fee/refund/dispute policies. Actual IDs and
   bank evidence stay private. No account, key or binding is created by this inventory.
   `AUTHORIZE_NET_ACCOUNT_SELECTION.md` records optional-account availability as
   UNVERIFIED; NMI account access expected is not verified merchant readiness.
3. **Security/provenance package:** review genuine current Auth/MFA and exact
   invoice/customer/merchant authority, hosted tokenization origin and immutable
   token-reference consumption, dedicated restricted TLS database identity,
   scoped grants/max30minute workload, callback signature/inbox/egress/abuse and
   independent reporting ports. Privileged helper/installer trust and operational
   custody need acceptance. Synthetic internal consent cannot populate authority.
4. **Exact sandbox preparation approval:** only a later target/hash/tenant/account/
   actions/time/containment authorization may permit secret custody, role/grant,
   merchant/authorization binding or hosted tokenization. These are separate from
   schema installation. No production test-mode account may substitute for sandbox.
5. **Bounded genuine token/capture acceptance:** after separately authorized
   preparation, test the exact provider-hosted token and source-bound immutable
   intent, approval/decline/loss/timeout, concurrent duplicate and changed-key
   rejection. Retain actual redacted wire/result evidence. Strict NMI response
   fixtures remain provisional until independently checked; never relax parsing to
   manufacture success. No automatic retry after ambiguous execution.
6. **Independent reports and callbacks:** separately approve exact read-only
   transaction/settlement report retrieval and bounded callback tests. Validate raw
   signature/replay/deduplication/account binding and delayed/out-of-order events.
   Match provider transaction and settlement independently; callback success is not
   bank funding. Resolve UNKNOWN by exact read/review, never a replacement charge.
7. **Separate settled-refund acceptance:** exact original settled capture, same
   tenant/customer/invoice/merchant, independent refund authority, bounded amount
   and pending refund capacity. Authorize.Net additionally requires valid stored
   customer/payment profile IDs; current opaque-token capture does not create them.
   Refused/lost/partial refund evidence remains immutable. Zero full-refund shortcut
   is deliberately unsupported. ACH, vault reuse/recurring and voids need their own
   reviewed scope; they are not fallback strategies.
8. **Financial/accountant and release acceptance:** independently reconcile gross,
   fees, taxes, refunds, chargebacks, bank deposit and each approved accounting
   mapping, including suspense/unknown/cutoff exceptions. Review processor, tax,
   surcharge, legal and payroll implications before reliance. Live/production
   activation and outside access require separate complete Release1.0 authorization.

Public documentation checked read-only2026-11-01:
[NMI Payment Component](https://docs.nmi.com/docs/payment-component) recommends
hosted token capture with server REST processing; its current examples contain
placeholder package names, so no package name is inferred or installed.
[NMI sale](https://docs.nmi.com/reference/create-sale-v5) combines authorization and
capture and documents `x.xx` amounts; its duplicate window is not our durable
exact-intent guarantee. [NMI refund](https://docs.nmi.com/reference/refund-payment-v5)
requires a previously settled payment.
[NMI webhook overview](https://docs.nmi.com/reference/overview) documents raw
nonce-dot-body HMAC, event IDs and processor-dependent chargeback events; do not
invent a timestamp window or universal dispute support.
[NMI reports](https://support.nmi.com/hc/en-gb/articles/15274363136785-Transaction-Reports)
provide transaction facts; the actual merchant/report/settlement/bank mapping is
unverified. [Authorize.Net Accept.js](https://developer.authorize.net/api/reference/features/acceptjs.html)
distinguishes hosted and merchant-hosted capture, returning a one-use nonce;
[reporting](https://developer.authorize.net/api/reference/features/transaction-reporting.html)
separates batches/unsettled/details. Documentation describes capability, not our
PCI eligibility, account entitlement or genuine provider acceptance.

## Integration, containment and next assignment

Reviewable changes are only this inventory, the19-case finance contract suite and
the existing `verifyLedger` source reader. No new public contract/type/schema,
provider client, price/fee rule, posting, navigation or capability is introduced.
The stricter reader can turn previously misleading green reconciliation into an
error; that is intended. Preserve suspect evidence for review; never clear holds,
rewrite sources or auto-correct a posted ledger to recover a success label.
Rollback of this local presentation reader does not remove or replay records;
any future financial correction must be a separately reviewed append-only operation.

Next safe assignment: independent review of the exact invoice/event/ledger regression
and complete the existing source-specific merchant/report/token acceptance contract;
implementation of missing mapping/provenance needs its own bounded task. No provider
account is required to integrate this local correctness fix. B001–B006 in
`BILLING_ENHANCEMENTS_PROPOSED.json` remain **PROPOSED** with ownerFeatureApproval=false;
this work does not authorize AR, reminders, multi-property payer sharing, autopay,
payment-plan negotiation or accounting connector expansion. P1/four artifacts,
all13/customer14/4B, approvals, locked UIs,2A–2F, recovery and Netlify remain protected.
