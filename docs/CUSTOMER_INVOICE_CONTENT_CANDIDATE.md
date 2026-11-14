# Customer issued-invoice content candidate

Isolated child of #451 `844ae8adf12b789d37c9f49189df631ac1d2209b`.
`CustomerInvoiceView` is unmounted: no App import, customer route, login, database
reader, payment provider, communication callback or persistent store is added.

The component presents an exact issued number/date/revision, contractor and
customer/property context, selling lines, discount, tax and invoice total. It
reuses #451 `presentIssuedInvoice`, `parseCustomerReview`, original integer money
formatting and the approved transparent Propel logo. The test source projects
`customerPreview`/`projectIssuedReview` over a fictional immutable estimate using
the original calculation engine. Missing line evidence stays UNKNOWN; the title
never substitutes for line items or tax details. Matching included lines/totals
are not a new calculation or accounting record.

An explicit native disclosure shows the original source version and issuance
receipt. A user may download a detached JSON snapshot only when exact line
evidence is present. It contains no memo, costs, actor, request hash, raw source
hash, customer contact or payment credentials. An issuance receipt never becomes
a customer payment receipt. Payment state is always unverified and payment links
remain null. Delivery, resend, cancellation and correction expose finite held
requirements with disabled controls; no operation is dispatched or queued.

## Read contract and held authority

`CustomerInvoiceReader` is an interface only. The pure decoder admits only
`fictional-local` mode and requires exact tenant/customer/property/invoice/version,
source-hash reference, revision, branding and canonical safe-scope total/currency
bindings. JSON accessors, expanded private fields and contradictory sources deny.
Viewer changes and loading/UNKNOWN/denied reads hide the previous content.

These comparisons do **not** authenticate a customer or recompute the private SQL
source hash from a customer-safe subset. A future approved server reader must
independently authenticate current access, verify the existing private source hash
and return its exact safe issued projection. No such reader, Auth/mapping grant,
receipt proof, link or connection factory is implemented here. Fixture digest
tokens and issued rows are explicitly fictional local evidence, not genuine SQL
issuance or customer authority. The unmounted component accepts no raw private
EstimateVersion or arbitrary website/logo URL.

Before real customer use: separately approve the #451 protected guard/source,
issuance SQL/role installation, current customer access and immutable read
authority, exact server-safe source projection, any payment/receipt reader and
delivery/consent/resend/cancellation/correction writers. D1–D3, A01–A12, original
recovery/P1/customer14/broker, merchant/provider and release gates remain unchanged.
Saul 2 Paul and Cunningham require independent accepted tenant/customer/merchant
bindings; these tests use existing fictional contractor examples only.

## Validation

New contract tests cover exact line/source/branding boundaries, positive-total
conflict, missing source, context changes, own-data validation and immutable safe
export. They do not rerun #451's 21 presentation cases or native issuance suite.
The dedicated Playwright fixture is injected into an intercepted local document;
it creates no application route and starts only a finite loopback Vite server.
Desktop/mobile tests exercise all three retained contractor palettes, keyboard
source disclosure, Axe, overflow, unwrapped currency, JSON download, pending and
UNKNOWN reads and no outside requests. Screenshots are engineering evidence, not
visual approval or physical-device acceptance.

```sh
node node_modules/vitest/vitest.mjs run tests/customer-invoice-contract.test.ts
node node_modules/@playwright/test/cli.js test -c playwright.customer-invoice.config.ts
```

Release 1.0 remains **NOT READY / NOT AUTHORIZED**. All canonical parent files and
approved styles/artwork remain unchanged.
