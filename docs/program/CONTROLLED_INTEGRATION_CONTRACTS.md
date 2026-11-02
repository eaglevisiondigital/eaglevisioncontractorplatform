# Controlled integration mapping contracts · Cycle 5

Feature IDs: INT-001 / FIN-001 / FLD-002 / GRO-001.
Owner: `/root/cycle5_profit_guard` (separate second assignment).
Branch: `codex/program-integration-contracts`. Exact parent: Finance PR #25,
`93cfe019ec422450c8662ccc5ccbaa06c7f03729`.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working local contracts

The new unmounted module provides three executable review functions over existing
repositories. Each defaults OFF, requires explicit original confirmation and current
sample owner/admin membership, and denies connected Operations before source reads.
It adds no business store, schema, service, SDK, network port, API request, credential,
external account identifier or background worker. The controlled mappings do not claim
provider compatibility or operational readiness.

### Accounting dry-run mapping

`reviewControlledAccountingMapping` selects the exact issued version, contract,
invoice, customer, recorded property-or-null, currency and as-of time from an actual
`ReleasePreview`. It checks the original offer/version relationship. It sends only
the selected existing financial objects into the unchanged
`projectSyntheticFinancialExport`, which calls the existing ledger verifier and
preserves capture/refund/adjustment IDs, saved tax/discount amounts and integer units.
No calculator, financial record or posting engine is duplicated.

The reviewer supplies four distinct, bounded local aliases for the existing receivable,
sales, tax-payable and synthetic-clearing accounts. Successful complete synthetic
reconciliation produces one mapped reference per original ledger row with exact
source ledger/event/refund-adjustment identity, decimal minor-unit string, unchanged
currency and debit/credit aliases. These references are not new financial postings.
There is no invoice/customer creation or transaction import. Incomplete, UNKNOWN or
conflicting evidence produces no mapped rows or summary. An absent selected invoice
remains UNKNOWN rather than choosing another one.

Aliases are human-controlled fixture labels, not QuickBooks account IDs or an external
chart of accounts. QuickBooks/API/import compatibility, chart mapping approval,
accountant/tax review, genuine authentication and external customer/invoice identity
remain UNVERIFIED. External IDs are null. Merchant funding, voids, refund settlement,
fees, disputes and bank deposits remain UNKNOWN. A synthetic reversing refund is not
a settled real refund. Generic source currency is retained; no conversion is performed.
The existing USD-only sandbox statement reconciler is not given fabricated merchant or
transaction IDs to claim independent reconciliation.

### Calendar field mapping

`reviewControlledCalendarMapping` reads the actual `PropertyRepository` plan and visit,
with exact current tenant/customer/property, plan/visit IDs and revisions. It emits the
recorded date, timezone, cadence and visit status as a calendar mapping candidate.
Start/end instants, availability and external calendar-event ID remain null/UNKNOWN.
A date-only inspection is never converted into a timed appointment or booking. The
function creates no plan, visit, technician assignment, availability record or dispatch.
Private checklist/finding/note/customer-address content is excluded. Missing, foreign,
ambiguous or stale source selection is denied; no replacement event is invented.

### Communication admission mapping

`reviewControlledCommunicationMapping` confirms an actual same-company customer and
reads existing `Operations.customerHistory` consent records. It references exact
record IDs and recorded email/SMS preference separately. Latest contradictory records
at the same timestamp remain UNKNOWN. Missing records produce no evidence IDs.
Recorded opt-out is preserved; recorded allowance alone does not allow sending.

For email it maps unresolved requirements to the existing typed `CommunicationContext` fields:
verified contact, consent, suppression and tenant sender profile. SMS preparation has no such reviewed source
contract here and remains explicitly UNVERIFIED with no email-field substitution.
It never constructs
a send-capable context, resolves a recipient, copies contact details, renders a message,
prepares an outbox or invokes the sender. Purpose-specific consent, current suppression,
verified contact and sender remain UNVERIFIED. The result always says **NO_GO** with
all execution flags false. The email-best-practices guidance was used to keep preference,
suppression and sending admission distinct; it grants no communication authority.

The existing consent source is asynchronous and has no atomic final read API. Two
captured consent footprints must match, but current consent coverage remains UNKNOWN,
including when a later change occurs during hashing. Exact read-only reconciliation
can observe a changed footprint and return STALE. Unchanged async evidence never
becomes current operational consent or a send permission.

## Immutable evidence and uncertainty

All results use strict own-field parsing with no input accessors/serializers/symbols,
primitive enums and bounded text. Safe output is allowlisted, detached, frozen and
SHA-256-bound. Raw customer contact, private notes, workforce/rates and financial costs
are excluded. The task-specific customer IDs are source references, not authorization.

Accounting and calendar capture actual existing synchronous read snapshots before
awaits and repeat them after hashing, followed by original confirmation and current
membership. Real refund/plan changes or staff revocation during a hash deny the result.
`reconcileControlledIntegrationReview` performs exact read-only source comparison,
returns `CURRENT_LOCAL_SOURCE`, `STALE` or `UNKNOWN`, and always `replacement:null`.
Current local source is a statement about the retained synthetic record snapshot; it
never upgrades financial coverage, provider schema, consent or authority. The previous
result/hash remain immutable. Copied or rehydrated objects remain UNKNOWN. There is
no replay, replacement ID, sync queue, automatic writer or delivery attempt.

A private in-memory WeakMap retains only review associations for exact rechecks; it is
not a parallel business store or refresh/process-crash durability. These local fixtures
and synthetic staff checks are not genuine Auth, durable custody or provider acceptance.

## Focused verification

```sh
npx vitest run tests/program-controlled-integration-contracts.test.ts \
  tests/program-finance-export.test.ts \
  tests/program-finance-reconciliation.test.ts tests/release-preview.test.ts
```

The new tests use actual existing Operations/Phase3/PropertyRepository records and
ReleasePreview commands to create the reviewed test financial source, then assert the
mapping makes no commands or other changes. They cover all three companies; exact
capture/refund/ledger identity and tax/discount totals; partial/UNKNOWN/conflicting
sources; property/customer/tenant/currency isolation; default-off/current staff; strict
input defenses; private-field exclusion; actual source edits/revocation during hashes;
immutable/no-replacement evidence; date-only calendar states; separate SMS/email
preferences, opt-out, missing/ambiguous/drifting consent and blocked sending.

**50 new / 140 combined application cases PASS.** Strict types, generated types,
full lint, formatting, build and diff checks **PASS**. No new UI is mounted,
so this package claims no new browser, responsive or accessibility result. Existing
approved designs and functional routes are unchanged. The older Finance parent has
no coordinator `features:check` script/register; Main owns source registration and
combined evidence checks. The coordinator's existing 128 protected-file and five-file/
thirteen-binding design contracts are checked directly against this worktree without
copying those coordination-only files into a reviewed older parent.

The eight original NMI gates remain UNVERIFIED and unchanged. No actual merchant,
statement, payment provider, NMI token, callback, settlement or accounting API is
contacted. Independent provider and accountant acceptance remain separate requirements.
No completed recovery, Netlify, hosted or native maintenance suite is repeated.

All13/customer14/original4B/P1/four artifacts/approvals, locked UIs and branding,
2A–2F, six proposed billing additions, Netlify/executor/recovery, NMI/Auth/financial/
provider/communication/hosted/production/deployment/merge gates remain intact.
No protected migration, hosted mutation, genuine customer access, financial execution,
customer communication, deployment, publication or merge is authorized or performed.
