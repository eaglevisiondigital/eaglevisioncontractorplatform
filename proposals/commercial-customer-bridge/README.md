# Commercial customer read and issuance-receipt bridge proposal

Isolated child of #458 `40f807e639c64ae040cda7951f21d7d6f4b2bbaf`.
All parent files remain unchanged. This is unmounted, default-off development code:
no SQL, grants, factory, public route, credentials, provider or sending operations.

## Working increment

`commercialCustomerReadProposal` composes the existing opaque CustomerBrokerAuth
verification, an explicit trusted `unwired-test-port`, and the existing
`customerInvoiceSnapshot`/`presentIssuedInvoice`/canonical customer-safe scope parser.
The public target contains only retained tenant/customer/property/invoice/issued-version/revision
and branding fields. A private source hash is rejected in the client target/request/response;
only the trusted server mapping supplies its validated digest after Auth. The server
constructs the full private viewer internally for the unchanged source decoder. Exact
retained identity, private source digest and
same current user/session must agree. Auth is rechecked before and after each of
three awaited mapping checks. Two original issued-record/source reads must agree
byte-for-byte as own JSON data. Getters/proxies, source/mapping changes, expired or
revoked sessions and mixed identity deny. A five-second overall bound aborts stalled
reads; no late outcome becomes success. No fallback to a staff-only SQL result exists.

The trusted port has **no operational implementation**. `authorize` must atomically
check the current customer mapping/access and exact retained source context on the
server; a copied DTO, supplied hash or browser selection cannot provide authority.
`readIssued` must use an accepted least-privilege reader and verify the original
private source hash before projecting its safe scope. Repeated client/server reads
are consistency checks, not global atomic revocation or independent durable custody.
The ordinary code does not appoint an operator, grant customer access, or claim that
current production Auth/SQL has passed. AAL2 is retained conservatively for this
proposal. Unit fixtures use the existing SDK with controlled fake transport only.

Only a strict customer-safe response leaves the proposed bridge: original issued
header, original **issuance receipt** identifier, read/expiry timestamps and fixed
UNKNOWN payment/disabled-link/delivery flags. It excludes staff actor, request hash,
raw source hash, session, bearer, contact information, costs and private notes.
A safe response expires within thirty seconds. The pure client controller clears
prior content while reading, rejects stale or foreign responses, ignores aborted
out-of-order results and hides changed context. Restoring context cannot resurrect the old receipt;
only an explicit successful new read clears that visibility fence. Observed pending context
drift invalidates its generation and aborts the in-flight read synchronously, without
render-time notifications. Restoring context before an old response resolves cannot
revive it. Pending drift also clears loading rather than trapping the restored target. Reopen means another exact read;
it never repeats an invoice command. The component's finite expiry timer clears
content and is removed on unmount.

`CommercialCustomerReceipt` provides explicit exact reopen and native keyboard
issuance-receipt disclosure. It complements the existing invoice viewer rather than
repeating its lines/layout/download. The original #453 viewer requires a raw staff
receipt before its internal decoder strips private fields. This safe bridge cannot
feed that raw contract to a real browser, nor fabricate actor/request-hash fields.
An accepted future composition must extract/reuse a safe renderer through separately
reviewed source changes. Original #453 viewing/download and #458 synthetic payment
presentation remain untouched and disconnected from this commercial read proposal.

## Financial truth and disabled contracts

The existing proposed commercial SQL reader is staff-only and returns
`paymentState='unverified'`. There is no accepted commercial invoice → payment ledger
foreign-key bridge, customer financial projection, cancellation or dispute writer.
Therefore **all commercial financial status is UNKNOWN**. The suite rejects supplied
unpaid, partially-paid, paid, refunded, cancelled and disputed claims, a synthetic
release-ledger attachment, arbitrary URLs and fabricated payment receipts. Absence
of an event cannot establish unpaid or a balance. An issuance receipt is not a
payment receipt. No invoiceBalance call over synthetic release events is used here.

Payment-link creation/expiry/revocation, delivery and resend expose disabled controls
only: no href, token, recipient resolution, sender, queue or command exists. Actual
payment status needs an independently accepted commercial billing linkage and
allowlisted canonical event/ledger/receipt reader. Cancellation/dispute/refund states
need their original authorized canonical writers/read projections; this proposal
invents none. Merchant/provider/settlement evidence, genuine current customer Auth,
current mapping/read RPC, exact grants and private source verification remain held.
Saul 2 Paul and Cunningham require separate accepted bindings. D1–D3, A01–A12,
recovery/P1/customer14/broker and all financial/hosted/release gates remain intact.

## Verification scope

New unit tests cover exact successful read/reopen, UNKNOWN financial status, safe
receipt serialization, default-off behavior, all six unsupported status claims,
foreign tenant/customer/property/source/invoice/mapping/user/session, unavailable/
expired/revoked Auth/access, revocation during the last mapping await, source change,
missing lines, accessors/proxies, context drift, bounded late reads, stale response,
client cancellation/out-of-order handling and disabled controls.

New browser cases use the **actual proposed Node bridge** with controlled Auth and
mapping/source fixtures to produce its safe response. Only that allowlist and a
fictional target enter the injected browser fixture. Desktop/mobile exercise the
new reopen/receipt/UNKNOWN behavior, keyboard disclosure, Axe, no overflow, pending/
revoked/mixed/context denial and automatic thirty-second expiry. No application
route or external request is used. Existing #453/#458 suites and native issuance
SQL cases are not repeated as new coverage.

```sh
node node_modules/vitest/vitest.mjs run tests/commercial-customer-bridge.test.ts
node node_modules/@playwright/test/cli.js test -c playwright.commercial-customer.config.ts
```

Public Auth/API guidance was checked against the [Supabase changelog](https://supabase.com/changelog.md),
[current sessions](https://supabase.com/docs/guides/auth/sessions) and
[API security](https://supabase.com/docs/guides/api/securing-your-api).
No project, credential, account, SQL installation or provider endpoint was queried.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
