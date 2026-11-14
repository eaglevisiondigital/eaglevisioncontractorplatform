# Unapplied NMI token-boundary fixture correction

Parent: source-author PR #439, `38bc1bce05075fc0e858554947e195d8dded3c4a`.
Target: only `tests/nmi-two-merchant-token-boundary.test.ts`, mode `100644`.
Patch SHA-256: `d67d40d9ba916bf776c3415ab0ecf2ff8de709f84cc356861c719e6144d13db0`.
Before: `e61ccf5a059bdf5116387176d1afcbf1b0d596f47c7091e72ea42c800def4fff`.
Proposed: `784666767e8938875300e0c37759f4cc745861218033a9c4e01bdeda86abea47`.

The actual approved one-line gateway author places the same existing intent key in
`order_details.order_id`. The retained two-merchant fixture still expects the old
top-level key. This one-file proposal corrects that expectation and explicitly
requires the old top-level key to be absent. All original 13 case identities,
tenant/customer/token scope, reserve/finish receipt, private-token exclusion,
wrong-merchant, expiry and UNKNOWN assertions remain. No timeout, skip or budget
changes are proposed.

This fixture is protected: the immutable
`docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json` pins its original `1199a062` source
and `e61ccf5a` hash. The current launch guard rejects a changed fixture; neither
existing finite helper admits it. It therefore stays unchanged here. This proposal
contains no checker/admission patch and invents no future fixture-author commit.
The existing source author, its approval and the historical manifest remain exact.

The qualifier reuses the earlier NMI proposal's captured Git-blob inventory and
disposable archive pattern. It verifies exact #439 parent, one-file delta, patch,
source hashes and regular modes, checks every current parent-tracked file, applies
only the reviewed fixture patch in a removed archive, and rechecks all 2,409 other
parent-tracked files. Tests use the existing injected transports and fictional
merchant fixtures. No provider requests or credentials are used.

Actual local evidence, with the existing pinned dependencies:

- Negative first: the original two cases fail at their old body-shape assertion;
  the same two names pass after the exact fixture patch. Filtered cases remain
  filtered in both runs.
- The original eight-file regression selection: **149 PASS, 0 FAIL, 0 skipped**
  against actual #439 source plus only the proposed fixture correction.
- Fifteen separate qualifier controls: **15 PASS**, including unknown/mixed frame,
  patch/record rebind, parent/delta/mode/authored-byte and source-patch denial.
- Original G8 remains unchanged and exits 1 with
  `Exact finite payment response source required`, as required for the unadmitted
  current source. Passing business regressions does not grant source admission.
- TypeScript, scoped lint and proposal formatting pass. No native PostgreSQL,
  browser, hosted, provider or broad Foundation rerun is claimed.

```sh
node node_modules/vitest/vitest.mjs run tests/nmi-token-boundary-fixture-proposal.test.ts --maxWorkers=1
node proposals/nmi-token-boundary-fixture/qualify.mjs --regressions
```

Next is an owner decision on this exact one-file fixture source-author patch.
After an approved real fixture author exists, any finite source/checker admission
proposal must bind that actual commit and require separate exact approval. No
actual fixture application, source admission, integration promotion, SQL/grant,
tenant/merchant binding, financial execution, recovery, provider, deployment or
merge authority follows from this proposal. Independent operational custody is not
established by these tests. Commercial D1–D3/Auth/VAR/NMI and all existing gates
remain open. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
