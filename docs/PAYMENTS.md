# Eagle Vision Payments · phased design

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
