# Eagle Vision Payments · phased design

## Current owner direction · NMI preferred / providers disabled

NMI is now preferred for the initial implementation, with owner account access
expected separately. Authorize.Net remains optional and independently supported.
Earlier Authorize.Net-first sequencing below is historical. No credential, merchant
binding, workload, tokenization or transaction is activated by this preference.
Continue local property/procurement work without waiting for either provider. See
PROPERTY_OPERATIONS_VALIDATION.md for the new local scope and outstanding gates.

Eagle Vision Payments orchestrates an approved gateway; it is not an acquiring
bank. Every organization has a separately authorized merchant and settlement
relationship. Phase 1 has no provider adapter, credential, live API or charge code.

## Phase gates

1. Foundation (now): private non-secret merchant metadata, disabled capabilities,
   integer Money contract, authorization boundaries and this design.
2. Provider selection and sandbox onboarding: approve processor/merchant agreement,
   jurisdiction and eligible rails; store credentials in approved server-only
   secrets. Enforce provider + tenant + environment routing. Merchant references
   are opaque IDs, not bank or card details. Validate sandbox/live separation.
3. Hosted tokenization: gateway-hosted fields or redirect captures card/ACH data;
   application receives only an opaque provider token, approved display metadata
   and explicit consent/evidence. Tokens are bound to tenant, merchant, customer
   and environment. Never accept or log PAN/CVV or raw bank account fields.
4. Authorization and execution: dedicated server command requires current tenant
   role/MFA, customer authorization, invoice/schedule ownership, integer amount,
   explicit currency and approved merchant. Unique `(tenant, operation, key)`
   idempotency constraint records request hash; reject key reuse with a changed
   payload. Commit command/outbox atomically; retry providers with the same key.
5. Webhooks and ledger: verify raw-body signatures and timestamp/replay window
   before parsing trusted events; map provider account/event to configured merchant
   and tenant server-side. Unique provider/account/environment/event ID inbox,
   amount/currency validation, allowed state transitions and row locking prevent
   duplicate effects. Handle delayed and out-of-order events. Post balanced,
   immutable per-currency journal entries; refunds use reversing entries. Reconcile
   provider settlements, fees, refunds and disputes independently of browser state.
6. Scheduled execution: signed customer agreement defines amount/limits, dates,
   timezone, rail and cancellation/revocation. Scheduler rechecks authorization,
   mandate, merchant status, balance and retries. No schedule authorizes itself.
   Test concurrency, partial payments, overpayment, retries and webhook races.

## Tax and fee policy

No unconditional 3.85% surcharge. A proposed fee is disabled unless a versioned
policy has legal and processor approval for the company, jurisdiction, rail and
card funding type. Disallowed debit/prepaid surcharges are rejected; unknown
funding types fail closed. Enforce applicable credit network/jurisdiction limits,
actual cost ceiling and disclosures/consent. Tax uses approved jurisdiction- and
contract-type rules. Snapshot the approved policy and calculation inputs with each
issued document. Do not represent the typed Money helper as a tax/fee calculator.

## Required configuration before sandbox work

Select provider, ownership model, account onboarding, capabilities, supported
currencies/rails, webhook signing mechanism, token scope, idempotency semantics,
refund/dispute flow and settlement reports. Configure secret manager, separate
sandbox/live accounts, signature secrets, operational alerts, reconciliation and
retention. Confirm PCI scope, legal terms and fee/tax policy with qualified parties.
Do not enable live capabilities by flipping frontend flags; server and operational
approvals must implement the actual gates. No production resource exists by
assumption in this repository.

## Phase 3 continuation

Authorize.Net and NMI are future sandbox adapter candidates with separate company
merchant configurations. Estimate payment schedules, job expense records, payroll
preparation and billable-hour values are internal data, not executable transactions.
Snapshot-derived contracts/invoices must retain tenant/currency/issued-version
identity and separately approved change orders. No delivery, acceptance, signature,
charge, refund, payout or payroll execution is enabled. A processing-cost assumption
(even 3.85%) is never an unconditional customer surcharge.

## Internal Release 1.0 development — no provider activation

The internal laboratory now implements customer-safe signed-test scope/invoices,
proposed deposit/schedule, explicit one-time synthetic authorization, idempotent
synthetic captures/refunds and exact receivable/sales/tax/clearing reconciliation.
These records are not real funds, gateway receipts or payroll and do not post to
existing job expenses. Ordinary payment/invoice/contract execution modules remain
server-disabled; internal access needs operator test grants and current authority.

server/payments/sandbox.ts adds Authorize.Net/NMI gateway-token adapters with fixed
sandbox endpoints, exact USD decimal serialization, tenant/merchant/authorization
binding, required durable idempotency-reservation contract and bounded response
projection. Timeout/malformed/provider errors are UNKNOWN, never blindly retried.
No production URL/mode or raw card entry is supported. Actual credentials/calls,
secure hosted tokenization UI, authoritative provider intent store and verified
webhook/reconciliation integration remain unconfigured/unverified. Synthetic
laboratory consent cannot be reused to authorize an actual sandbox gateway call.

Provider sources checked October 15, 2026: [Authorize.Net API reference](https://developer.authorize.net/api/reference/index.html),
[NMI current sale API](https://docs.nmi.com/reference/create-sale-v5),
[NMI hosted tokenization component](https://docs.nmi.com/docs/payment-component).
No provider SDK names were guessed/installed from placeholder documentation.
Approve per-company sandbox merchants, credentials, callback strategy and explicit
sandbox test calls separately. Team-login-protected Netlify cannot simply become
public to receive callbacks; review a minimal authenticated/signed dedicated ingress
without weakening app perimeter protection. Production routing, legal fee/tax review,
actual authorization and Release 1.0 clean-production acceptance remain separate gates.

Sandbox adapter follow-up: configuration/credentials and capture inputs are copied
and frozen before asynchronous work. A canonical explicit digest binds all intent
fields and the token hash, irrespective of caller key order. Authority expiry is
rechecked after reservation; an expired reservation records UNKNOWN without a
provider call. Invalid reservation states and malformed stored transaction metadata
fail closed. These are local synthetic transport tests, not gateway validation.

## October16 local sandbox continuation

New sandbox refund adapters, PostgreSQL durable intent/refund/inbox adapter,
provider-specific raw-body signatures and statement reconciliation are implemented
and tested locally. SQL is an explicit unapplied proposal outside the approved
migration bundle, without a request-scoped client, control role or public RPC.
Genuine provider authorization/invoice provenance and sandbox account calls remain
unverified. Standalone opaque-token captures do not automatically supply the profile
references required by the restrictive Authorize.Net refund adapter. Settlement,
UNKNOWN resolution and financial execution stay separate reviewed gates. See
RELEASE_PROVIDER_FOUNDATION.md for exact scope and source references. No activation.
