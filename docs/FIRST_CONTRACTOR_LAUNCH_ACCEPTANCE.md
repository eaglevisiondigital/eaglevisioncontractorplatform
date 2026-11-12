# First contractor: invoice-to-settlement acceptance

Owner priority, November12,2026: Saul 2 Paul Builders LLC, DBA Saul 2 Paul Builders
& Gutters. Merchant approval through Eagle Vision Payments/PayProTec is owner-reported;
VAR sheet/gateway boarding remains pending. Contractor2 is Cunningham Construction,
also owner-reported merchant APPROVED with VAR/NMI PENDING. Contractor1 remains first;
Contractor2 uses the same contracts and separate merchant binding, without delaying1.
`tests/fixtures/first-launch-merchants.ts` supplies only fictional disabled identities
for both launch positions; neither is a real contractor account or merchant mapping. No merchant IDs, credentials, VAR sheet,
customer records or contractor account are created or published by this record.

Decision: **NO-GO for contractor onboarding, invoice issuance or live payments.**
This is a scoped overlay on the existing25-feature register, not a replacement
architecture or new acceptance baseline. Existing source contracts remain authoritative.
Baseline PR353 `5ed25588d2a78239e306b157a1510d41474cd81a` is not production source.

## Minimum proposed first release and actual evidence

| Required capability                        | Existing implementation/evidence                                                                                                                                                | First-contractor GO/NO-GO and exact missing acceptance                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant/merchant onboarding                 | Multi-company identity/configuration contracts; merchant-scoped sandbox adapters                                                                                                | NO-GO. Privately verify legal entity/DBA, authorized operator, correct merchant/processor, USD/card capabilities, sandbox/live separation, secrets and settlement destination. Merchant underwriting approval alone does not activate software.                                                                                                                         |
| Genuine staff/customer authority           | Current membership/AAL2/security contracts; existing customer/issued-scope readers                                                                                              | NO-GO. Real Auth/MFA, current revocation, exact tenant/customer/invoice/source access and negative cross-company acceptance are unaccepted. No browser selector or metadata authorization.                                                                                                                                                                              |
| Invoice issuance and customer presentation | `ReleaseRepository` routes samples to `ReleasePreview`, connected internal tests to `release_command`; signed-test-contract invoice and receivable/sales/tax calculations exist | NO-GO. Existing internal-test invoices/signatures/consent are not commercial invoices. Approve/implement the canonical operational invoice authority, immutable source/tax/version/number, CAS, duplicate prevention, Save/reopen, correct customer access and separately authorized delivery. Preserve genuine agreement prerequisites; do not promote test contracts. |
| Customer payment entry/capture             | Server-only fixed-sandbox `SandboxGateway`, opaque-token resolver and merchant-bound reservation contract                                                                       | NO-GO. No accepted customer-hosted tokenization flow or production adapter. Verify provider-approved NMI test account, real token lifecycle, explicit customer consent, exact invoice balance, transaction identity, authorization/decline/timeout and no raw PAN/CVV through Propel.                                                                                   |
| Durable one-use financial custody          | Restricted SQL store, original authorization/claim/UNKNOWN contracts; provider schema development installation verified                                                         | NO-GO. Exact operational writer/grants/authorization, invoice provenance, atomic receipt/ACK, current revocation and independent rollback-resistant custody remain unaccepted. PR348–353 laboratory/AWS preparation is not AWS or operational acceptance.                                                                                                               |
| Webhooks, UNKNOWN and receipts             | Raw-body NMI HMAC verifier; durable inbox contract; normalized results and read/reconciliation ports                                                                            | NO-GO. Dedicated signed ingress and actual provider event vectors/replay/out-of-order tests unaccepted. Webhook authentication alone never posts money. No verified operational customer payment-receipt generation/reopen/delivery path. A receipt must reflect exact confirmed state; capture is not settlement. Never retry UNKNOWN or replace its identity.         |
| Reconciliation, refunds and exceptions     | Local integer capture/refund reconciliation; settlement observations/snapshot CAS; settled-capture refund reservation holds uncertain capacity                                  | NO-GO. Real provider reports, fees/net settlement, duplicates/missing/conflicting rows, settlement destination and refund/void/dispute handling unaccepted. Refund adapter is sandbox-only; pre-settlement void is not supplied by it. Approve a bounded manual exception process where automation is deferred, with independent financial acceptance.                  |
| Recoverable/releasable service             | Historical approved designs/security/migration evidence; original recovery registers                                                                                            | NO-GO. Genuine matched recovery, independent custody, remaining physical scenarios, current target/source security review and separately approved clean deployment required. Frozen Netlify deployment stays untouched.                                                                                                                                                 |

Development migration evidence is historical but actual: see
[provider execution](PROVIDER_MIGRATION_EXECUTION.md), migration SHA256
`5dd07b079a591b433fa7ab432fd841026de91a1cd3f1d3a722bef500aa9fd32d`.
It does not authorize another SQL installation or prove current production state.
The [provider readiness](PROVIDER_INTEGRATION_READINESS.md) latest checkpoint
supersedes its older unapplied-schema paragraphs; all providers remain disabled.

## Demonstrated correction in this candidate

`server/payments/sandbox.ts` accepted NMI response `id:"0"` as successful despite
its own stored-result validation, refunds and reconciliation rejecting that identity.
New regression fails on the unchanged parent: succeeded/"0" rather than unknown/null.
The narrow correction keeps the existing UNKNOWN finish/reconciliation path and
prevents a second dispatch when the store holds the outcome. No response-contract
redesign, provider endpoint, SQL, authorization, ledger, dependency or UI changes.
Fake transport/store proof is not actual NMI behavior or independently durable custody.

## Bounded NMI acceptance, after separate exact approvals

1. VAR/boarding: privately bind the exact contractor merchant and approved processor,
   provider-issued test environment/capabilities and credential custodians. Obtain
   real v5 response/report/webhook contracts; provisional strict fixtures are not PASS.
2. Operational prerequisites: independently review current tenant Auth/MFA, invoice
   authority, installed writer/bypass inventory, dedicated least-privilege workload,
   customer consent, one-use custody/immutable receipt and recovery. No protected SQL
   or adapter activation under this planning/correction scope.
3. Approve a private sandbox acceptance manifest: exact tenant/merchant/customer/test
   invoice/token source, USD amount, one capture, key/digest, UTC expiry, recipient
   restrictions, request limit, evidence and STOP rules. Existing runner at
   `scripts/provider-sandbox-acceptance.ts` is OFFLINE by default; its execute switch
   and credential retrieval remain forbidden without exact operation approval.
4. Verify tokenized entry, approved and declined responses with distinct authorized
   attempts; same-key repetition causes no second charge. Test simultaneous requests,
   changed payload/key, cross-company token/credential substitution, revocation,
   process loss, timeout and late ACK. UNKNOWN permits exact read-only reconciliation,
   not another attempt or inferred failure. No real card data or customer charges.
5. Separately approve callback/report acceptance: exact raw-body signature, wrong
   key/body/merchant, duplicate ID/digest conflict, delayed/out-of-order events;
   independently fetch provider facts and match original transaction/amount/currency.
   Prove receipt Save/reopen and ledger/invoice consistency without email activation.
6. Only after provider-confirmed settlement, separately approve a bounded partial
   refund, capacity/duplicate/UNKNOWN tests and exact reversing reconciliation.
   Validate pre-settlement void/exception handling and fees/net deposit evidence.
7. A clean separate production database and its exact schema/grants/identity acceptance
   are required; do not promote the historical development installation.
   Independent acceptance and source-bound release review precede any production
   configuration, real invoice delivery, live payment/refund or deployment approval.
   Sandbox success cannot authorize production by changing a flag.

## Shortest safe critical path / owner decisions

In parallel: obtain VAR/gateway test capability and complete D1 responsibilities,
D2 transaction/receipt custody and D3 matched recovery/independent protection decisions.
Owner is Business/Source Owner; sole-operator staffing direction does not assign
remaining technical roles or establish independent review/custody. Cleanup supervision
remains proposed until exact approval. All A01–A12 remain NOT RUN, and their original
request/receipt/staff-read slice does not itself approve financial execution.

Next specific owner inputs: supply the VAR sheet through approved private custody;
complete the missing D1 assignments and exact D2/D3 decisions. Preparation is already
authorized. The next execution approval must identify the specific operational
invoice/payment implementation, target, source hashes, grants, acceptance operations
and stop conditions; it cannot be a blanket NMI activation approval.
Preserve original recovery -> valid approved P1-on13 -> separately reviewed
customer14 -> original4B/broker prerequisites wherever those components participate;
no blanket reauthorization or bypass. Customer intake SQL remains HELD.

After those predecessors: bounded sandbox acceptance -> financial/security/recovery
sign-off -> exact production setup/deployment approval -> separately bounded first
commercial invoice/payment/receipt/settlement acceptance. No stage auto-advances.

Defer: Authorize.Net, ACH, saved-card/recurring billing, installments, surcharges,
automatic refunds/payouts, payroll, marketing, AI/Voice/Receptionist, procurement,
Storm Mode, Contractor Network and trade extensions. Manual evidence-backed invoice
preparation can avoid making the full Field/Maintenance ecosystem mandatory; it
cannot invent work, customer agreement, tax approval or invoice authority.

Production route/secret configuration, target drift and real merchant/provider state
were not inspected. Current genuine contractor payment acceptance is NOT RUN.
Release1.0 remains NOT READY / NOT AUTHORIZED. No account, hosted mutation, protected
SQL, financial action, communication, deployment, merge or recovery was performed.

Primary provider references checked November12:
[NMI sale](https://docs.nmi.com/reference/create-sale-v5),
[refund](https://docs.nmi.com/reference/refund-payment-v5),
[Payment Component](https://docs.nmi.com/docs/payment-component),
[payment webhook verification](https://docs.nmi.com/reference/overview).

## Exact candidate validation and open failure

Parent new regression:1FAIL, response id"0" incorrectly succeeded. Corrected seven
application suites123PASS, then the added two-fixture test brings payment-sandbox
scope to36PASS. Independent payment/refund/token/webhook77PASS; independent added
fixture1PASS. These counts overlap and must not be added as distinct coverage.
PGlite three database suites71PASS/4native-only skips. Native PostgreSQL17 runs the
same75cases:74PASS/1FAIL, with all4native concurrency cases executed and passing.
The unchanged failure is provider-control.test.ts "requires current domain
verification and rejects arbitrary domain facts", line363: outbox(d) resolved where
rejection was expected. It remains OPEN, not reclassified or hidden. The fixture
uses two wall-clock checkedAt timestamps and SQL orders by checked_at DESC,id DESC;
a timestamp tie is a possible explanation, not a demonstrated sole cause. No
protected SQL or original database assertion/budget was changed. Invoice-message
acceptance cannot be claimed clean while this is unresolved.

Existing synthetic release browser6PASS across desktop/tablet/mobile, including
accessibility and hidden live controls. Initial browser launch was blocked by local
sandbox EPERM; approved loopback-only rerun used unchanged tests/budgets and passed.
Typecheck/build/scoped lint/format/features/Cycle6 protected128 hashes PASS.
No real provider/hosted/payment/production durability evidence was produced.

## Superseding native diagnosis and invoice evidence correction

The historical354 native74PASS/1FAIL remains recorded above. Controlled equal-time
observations with fixedUUIDs now reproduce both ordering outcomes: the SQL contract
is checked_at DESC,id DESC, NOT insertion order. Original helper used Date.now twice
without guaranteeing a later second observation. Its unchanged freshness rejection
assertion now receives strictly increasing, explicit synthetic observation times.
No SQL or freshness threshold/budget/assertion is changed. Added equal-time tests
characterize UUID arbitration, and late-arriving older checkedAt is rejected even
with the higherUUID. Native original75 plus3new cases =78PASS, zero skipped.
This closes the nondeterministic test precondition. It does NOT repair runtime ties
or prove that equal timestamps imply chronology. If operational policy requires
latest-arrival or rejecting ambiguous tied evidence, the protected SQL design needs
separate exact review/authorization; no such change is made here.

The existing invoiceBalance calculator reproduced4failures accepting duplicate
invoice event IDs, duplicate command keys, unknown kind and wrong provider. It now
rejects them before arithmetic, reusing the existing invoice/event contracts. Direct
negative tenant/customer/currency regressions cover the presentation calculation.
Original synthetic capture/refund/ledger behavior remains. This fixes false local
balance presentation; it neither creates a financial writer nor proves commercial
invoice revision/durability. Existing internal test invoices derive immutably from
signed test contracts; genuine invoice preparation persistence/revision/reopening
requires a separately authorized canonical operational writer/schema scope. Do not
add a sample-only draft store or edit issued commercial scope as a substitute.

After D1–D3 return and original prerequisites, the first proposed operational slice
remains the selected CustomerRequestBroker.submit review-only request -> immutable
receipt/ACK -> currently authorized staff read. Exact authorization must bind original
source SHA/target/tenant/actor, dedicated registrar/issuer/consumer identities and
commits, genuine Auth/AAL2/current revocation, reviewed grants/writer-bypass inventory,
independent fence/custody, UNKNOWN no replay and matched recovery acceptance. This
slice does not authorize invoice issuance/payment; their provenance, balance,
customer tokenization, receipt and settlement acceptance follow separately.

Security/recovery workstream remains preparation-only: November4owner-witnessed main
synthetic network-loss PASS preserved; duplicate recovery UNKNOWN/UNVERIFIED, both
private folders/consumed attempts untouched. No independent recovery/AWS custody or
A01–A12 acceptance inferred. Saul2Paul remains first; Cunningham reuses the same
strictly separate merchant and tenant contracts only after its own acceptance.
Broader Field/Customer and Finance/Growth work is on separate branches, never a
prerequisite silently added to this launch candidate.

Successor verification: controlled tie diagnosis scope77PASS before monotonic fixture
repair; final native78PASS after repair, all original75assertions retained. Invoice
balance parent4FAIL; corrected related app66PASS before3additional tenant/customer/
currency tests; final release/provider-control PGlite44PASS/1native-only skip.
Independent release-preview10PASS before those3additional negatives. Original
responsive release journeys6PASS at the changed source; TypeScript/build/scoped
lint/format/features/protected128PASS. These are overlapping scopes, not a summed
acceptance count. No real invoice Save/reopen or genuine hosted acceptance claimed.

Issue357 successor: existing capture validation is shared before token-reference
lookup. Seven malformed-intent parent regressions fail; corrected payment/token/
refund73PASS independently73PASS. Actual gateway invalid-currency case makes zero
vault/reservation/transport calls. This is a source-level pre-consumption fix, not
provider acceptance or proof of valid invoice ownership. Genuine operational invoice
creation/revision/reopening remains held: protected financial execution constraints
and commercial authority are not changed or bypassed by this implementation.

Next owner authorization checkpoints remain ordered: complete actual D1/D2/D3 and
original receipt/recovery prerequisites; approve the exact bound review-only broker
acceptance; then approve a separate source/hash/target-bound commercial invoice
writer/draft-CAS/reopen/customer-read implementation and required forward schema/
grants. Its scope excludes issuance, NMI credentials/activation, sends and payments
unless separately named and independently accepted. Two private VAR/gateway bindings
are external dependencies; Cunningham never inherits Saul2Paul's merchant authority.
