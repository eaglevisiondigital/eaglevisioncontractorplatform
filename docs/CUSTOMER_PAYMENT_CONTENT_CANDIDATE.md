# Customer payment content candidate

Isolated child of #453 `ef5743c508965296e9a41d17e60b410c7528bac0`.
The unmounted `CustomerPaymentView` adds a reusable working read-only payment
status and receipt renderer. It does not mount beside or relabel the commercial
invoice in the application. The commercial issuance invoice has no accepted
billing foreign-key bridge to the release ledger: that integration remains HELD.
The existing commercial invoice view therefore retains unverified payment state.

## Canonical fictional source only

`readCustomerPayment` accepts an actual existing `ReleasePreview` instance and a
local current-access/clock port. It verifies exact tenant, customer, property,
invoice and issued-version context, then follows the canonical invoice → contract
→ offer → issued-version relationships and original document hash. All three
selling snapshots must equal `customerPreview` of that exact version. Capture
and refund events must retain their original authorization relationship.

The unchanged `projectSyntheticFinancialExport` verifies complete original invoice
postings, event coverage, event/ledger provenance, refunds and reconciliation using
`verifyLedger` and `invoiceBalance`. Only its reconciled complete summary produces
UNPAID, PARTIALLY_PAID or PAID labels, explicitly marked **synthetic invoice only**.
An empty complete event set with the original invoice postings can prove an unpaid
synthetic invoice. Missing postings, unknown outcomes or incomplete evidence never
fall back to an assumed zero payment or the invoice total as balance.

Receipts are allowlisted original canonical capture/refund event references, amounts
and dates. Refunds retain their adjusted capture reference and do not rewrite prior
receipts. Full refund returns the synthetic balance to unpaid while retaining both
events. Neither a receipt nor PAID establishes real provider execution, settlement,
fees, deposit, bank movement or a customer payment receipt for a commercial invoice.
No provider response, GET result, callback, URL or supplied paid flag is accepted.

## Currentness and privacy

Snapshots are detached/frozen and qualified through a module-private weak reference;
a copied or fabricated object cannot be presented as a qualified result. Exact local
session identity/access and canonical source bytes are checked before/after awaited
hashes and financial verification, and at render/disclosure. Source change, session
replacement/revocation, deadline expiry or clock rollback invalidates the original
snapshot permanently. A fresh explicit read can observe later canonical evidence;
there is no mutation, automatic retry or command to replay. The local deadline is
bounded to five minutes; a finite component timer removes content at expiry.
Loading, denied and UNKNOWN views hide old amounts and receipts.

This is a trusted **fictional local** source/clock/session contract, not genuine
Auth, a server API, or protection against hostile code replacing the canonical
engine in the same JavaScript realm. Genuine current customer access/revocation,
trusted server reads and complete operational source coverage remain mandatory
before customer use. The renderer exports no authorization IDs, command keys,
private scope, costs, internal notes, contact details or session identifier.

## Payment links and held operations

The synthetic link contract has no href, token, navigation or provider resolver;
its exact deadline is visible and its open control is disabled. The view exposes
native keyboard-accessible source and receipt disclosures. No financial writer,
SQL/schema/grant, durable store, engine, application route, network request or new
financial calculation is added. Delivery/resend/cancel/correction remain held in
the existing invoice contract, without sender, queue or callbacks.

Real use needs separate accepted commercial billing linkage, server-side current
customer/session authority, exact tenant/customer/invoice/merchant/currency/amount
and expiry/revocation binding, private token custody, verified provider evidence and
payment/receipt/settlement acceptance. Saul 2 Paul and Cunningham require independent
bindings. This candidate grants none of those approvals. Release 1.0 remains NO-GO.

## Validation

New unit cases exercise unpaid, partial, paid, refund/full-refund accounting through
the existing engine, immutable original receipts, exact context/current session,
missing/duplicate/foreign postings/events, source substitution, authorization
conflict, revocation during hashing, forged snapshots and privacy. Dedicated new
browser cases cover only this behavior: desktop/mobile receipt/link disclosures,
keyboard operation, Axe, unwrapped amounts/no page overflow, pending/UNKNOWN/
revoked/expired state removal, automatic local expiry and no outside requests.
The accepted #453 17 unit/four browser and #451 native/presentation suites are not
repeated or reclassified by these tests. Test commands:

```sh
node node_modules/vitest/vitest.mjs run tests/customer-payment-contract.test.ts
node node_modules/@playwright/test/cli.js test -c playwright.customer-payment.config.ts
```
