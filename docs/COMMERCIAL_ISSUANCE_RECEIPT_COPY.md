# Local issuance-receipt reference copy

Isolated child of #462 `3491412a8bdc3db70e44bca4ef743de21c0c5ec4`.
The additive `IssuanceReceiptDownloadAction` is one native action beside the existing
receipt component, not a new panel, route, invoice, payment receipt or business store.
Every parent byte remains unchanged. The component is unmounted in the application.

## Actual behavior

An explicitly displayed, current issued receipt is required before copying.
`downloadIssuanceReceipt` invokes the existing `CommercialCustomerReadController.open`
for every action. That controller always invokes its injected reader; it has no
internal cache. When configured with #462's proposed bridge, the repeated read uses
its original opaque Auth/current mapping/source checks. Complete original public
invoice/header and issuance-receipt facts must match before and after the await.
An unknown/denied/expired result, altered original receipt or header, changed
customer/tenant/context, cancelled scope or competing read causes no local output.
An interrupted action cannot borrow another read's ready result.

The refreshed observation must be at least the action start and strictly newer than
the displayed observation. This is a conservative cached-port/replay guard, **not
proof of genuine Auth or server recency based on clock ordering**. A legitimate
same-millisecond observation is denied too; no timestamp is rewritten or automatic
retry performed. A later explicit current read is required. Operational Auth and
trusted current reads remain independent prerequisites.

The output is a deterministic JSON **issuance-receipt reference only**: public
organization/customer/property/invoice/source-version/revision/number and original
issuance receipt/date, read timestamps, UNKNOWN financial state and disabled
link/delivery/resend/correction/cancellation flags. It excludes invoice scope, line
items, amounts, costs, staff identities, request/private source hashes, tokens,
sessions, contact details and any claimed customer payment or delivery receipt.
The UUID-derived filename is fixed; no path, URL or recipient is supplied.

The native download uses only a local Blob URL, revoked after the request. The
announcement says the copy was requested and saving is controlled by the browser;
it does not attest a saved file or delivery. A file cannot serve as ongoing access,
payment proof, full invoice, durable custody, evidence of work or an operational
receipt. Private source hashes remain server-owned and never enter the copy.

## Lifetime and ambiguous results

The action rechecks the exact current response after asynchronous reread and
serialization, immediately before output. One transient per-controller busy fence
prevents competing local copy clicks. A temporary reader subscription rejects a
second read transition or withdrawn source during that same action, then is removed.
These are local UI fences, not a new business attempt owner or durable command log.

A commit-phase `useLayoutEffect` installs the action's mount/controller lifetime.
Unmounting or switching controllers aborts that lifetime; no old pending action
may output or update completion state later. Cancellation does not invalidate the
shared reader or clear another consumer's valid result. A competing read likewise
retains its own result while the interrupted copy fails. The ordinary reader and
all original UNKNOWN/reconciliation rules remain unchanged.

## Verification and limits

New unit cases use the actual proposed #462 bridge with controlled Auth/mapping/
source ports and confirm that each successful copy performs another six Auth,
three mapping and two issued-source reads. They cover fixed safe output, explicit
repeat reads, tenant/context substitution, receipt/header substitution, unavailable
and revoked Auth, cached/tied/expired observations, stalled/late outcomes, duplicate
copy actions, action cancellation, competing reader results and output uncertainty.

New desktop/mobile browser cases add this action beside the unchanged receipt view.
A Playwright-only intercepted loopback read invokes the actual Node bridge with
controlled Auth/mapping ports on **each read**; no public application endpoint is
created and no browser-generated observation time is used. The tests download only
fictional JSON into Playwright-managed temporary artifacts. They verify keyboard
operation, Axe, responsive layout, safe file contents, additional controlled Auth
calls, substitution/UNKNOWN/revocation/expiry denial, competing reads, true unmount
and committed controller replacement, no late files and no outside requests.

```sh
node node_modules/vitest/vitest.mjs run tests/issuance-receipt-download.test.ts
node node_modules/@playwright/test/cli.js test -c playwright.issuance-receipt-download.config.ts
```

Accepted #453/#458/#462/native suites are not rerun as new coverage. Neither these
fixtures nor the local file copy prove genuine Auth, operational customer reads,
merchant/provider execution, settlement or an installed commercial financial mapping.
Delivery/resend/correction/cancellation writers and actual payment links remain OFF.
No SQL/grants, tenant setup, real message/payment, hosted action, merge, deployment
or recovery occurs. Saul 2 Paul and Cunningham retain their separate acceptance
dependencies. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
