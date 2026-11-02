# Existing-source cost-to-complete review · Cycle 5

Feature IDs: FIN-002 / UX-001. Branch: `codex/program-cost-to-complete`.
Exact parent PR17: `fe9d9ff593dbbed175ac69de1bd44fa1d25725bc`.
Owner: `/root/cycle5_finance`. Release 1.0 **NOT READY / NOT AUTHORIZED**.

## Working local feature

The existing flagged job-margin demo now offers a separate explicit cost review.
The existing `LocalJobMarginReader` owns current sample owner/admin authorization,
exact organization/job/revision/issued estimate/customer/property/currency binding,
current CRM checks and two matching job/issued/workforce captures. Its shared capture
is reused; no alternate job calculator, expense ledger, store or provider port exists.

`readCompletion` defaults OFF and requires exact own primitive `enabled:true` and
`confirmed:true` values. It rechecks the original admission after each awaited source
and current membership after jobs/history/workforce/each CRM page and before returning.
Getters, symbols, additional fields and truthy nonbooleans do not grant admission.
Revocation, stale revisions, mismatches or source drift fail closed. Missing exact
issued/job/labor evidence returns UNKNOWN with amounts, expense rows and labor IDs
withheld. It never chooses the latest or a similar source as a replacement.

The new detached allowlisted review decomposes the already validated canonical margin
projection into recorded expense/locked labor, unpaid commitments and saved remaining
forecast. Cost to complete is unpaid commitments plus remaining forecast; projected
total adds recorded cost once. The sums use bounded BigInt minor units and must equal
the existing canonical projected cost. Currency is unchanged; no conversion, unit
pricing recomputation, ratio or new profitability calculation is introduced.

The canonical `jobFinancials` remains authoritative for commitment/payment/credit
netting, approved changes, labor and forecasts. For a source-recorded commitment of
10,000, payment of 4,000 and exact approved credit of 1,000, it reports recorded 3,000,
unpaid commitment 6,000 and projected 9,000 before a separate remaining forecast.
The review does not subtract the payment twice. Forecast is still additive: it is
not silently reconciled with an unpaid commitment. Staff must review any overlap.
A zero remaining value or management-declared costs complete is never verified
physical completion, all-cost capture, final profit or settlement.

Each expense row retains exact expense/review/estimate-line/adjusted-expense IDs,
kind, category, amount, recorded quantity/unit, timestamps and approved/pending/rejected
inclusion. Pending/rejected amounts are excluded from canonical costs. Credits remain
linked internal cost adjustments. Finite positive integer quantities and bounded
integer unit-cost metadata are checked without using them to recalculate amounts.
No supplier name, private expense description/review reason, payroll rate, deduction,
contact data or raw workforce record is serialized into the review.

## Honest provider provenance

Existing job expenses have no exact release invoice/payment-event relationship.
There is no void expense kind. The review therefore retains void, refund and
settlement UNKNOWN with no event IDs. A credit does not prove a provider refund;
a payment-kind expense does not establish bank payment. Unrelated ReleasePreview
captures/refunds are never substituted or queried to invent job/settlement mapping.
No ledger, invoice, provider, payroll, authorization or other financial action is
performed. This absence is a source dependency, not an acceptance PASS.

## Local demonstration

```sh
VITE_JOB_MARGIN_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4188 --strictPort
```

Open `http://127.0.0.1:4188/preview-job-margin-demo.html` in this Finance worktree.
The existing DEV + exact flag + literal loopback gate remains unchanged. App and
connected customer/staff routes do not mount this component. The optional component
extension itself defaults OFF; only the gated development harness explicitly enables
it. The ordinary production build has no new entry or connected capability.

1. Select any approved sample company. Explicitly confirm the selected saved revision,
   then choose **Review exact cost to complete**. Exact evidence receives keyboard
   focus. Inspect totals, coverage, expense decisions and provider UNKNOWNs.
2. Use **Prepare synthetic commitment and credit example** to create the source
   example through existing sample expense/review methods. This is a labeled manual
   test-only action, not provider execution. The new saved revision clears prior
   evidence and requires a fresh explicit review.
3. Expand an expense to inspect its exact original adjustment/review IDs. Clear or
   uncheck the review; switch company/source/role; old evidence disappears immediately.
   The test-only pause/release controls exercise a real awaited job reader. Pending
   results are discarded after confirmation withdrawal, context change or unmount.
4. Toggle the missing exact job, default-OFF reader or optional extension. Missing
   evidence is visibly UNKNOWN; denial withholds previous private figures. Re-enabling
   never restores prior confirmation or review. The existing margin-warning and floor
   controls retain their original meanings and behavior.

The warm panels, palette, focus controls and responsive layout extend the existing
scoped Finance CSS. No locked customer/back-office stylesheet, approved logo, global
token, navigation, shared schema or canonical engine changes. State is in this tab
only: freezing detached objects does not establish refresh/crash durability or Auth.

## Focused proof and remaining acceptance

- 37 new source/confirmation/coverage/credit/privacy/unit/stale/role cases plus all
  67 previous margin cases; existing canonical job/workforce and financial export/
  reconciliation tests: **215 application cases PASS across five files**.
- **9 browser cases PASS**, desktop/tablet/mobile and all three approved palettes:
  six retained margin cases plus three actual cost-review cases. Explicit keyboard
  review/focus, exact source/credit detail, unchecking, paused real-source reads,
  contractor/role context changes, UNKNOWN/error/OFF and extension removal were tested.
  Full axe scans, page-overflow and external-request assertions found zero violations.
  These bounded local tests do not establish genuine device/hosted accessibility.
- Actual screenshots are under
  `artifacts/finance/job-cost-completion-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`
  and matching `job-cost-completion-detail-*` region captures. Screenshots/dependencies/
  build output are excluded from source commits. Desktop construction and mobile
  roofing detail screenshots were visually inspected: source IDs wrap, controls
  remain readable and scoped contractor color is retained.
- Strict types, generated types, lint, formatting and build are checked. All 128
  public paths in the coordination Cycle4 protected-source manifest match exactly.
  No completed recovery, Netlify, native maintenance or operational provider suite is
  repeated. Exact final CI evidence belongs in the Main source-bound delivery register.

The eight original NMI gates remain UNVERIFIED and unchanged (SHA-256
`3ebd06cafa0bff35dd5db2d860d2d6e00be3d5e12d84ff2df38a6ca44e01ed8b`). Operational
readiness/execution/credentials/provider/hosted flags remain false. NMI merchant,
token, Auth, reconciliation/settlement and legal/tax acceptance require their separate
actual evidence. No new NMI simulation or provider activity is part of this package.

All thirteen migrations, pending customer14, original4B/P1/four frozen artifacts,
approvals, protected UI/artwork,2A–2F, six proposed billing enhancements, Netlify
archive/executor and recovery/Auth/NMI/provider/financial/hosted/deploy/merge gates
remain unchanged. Further real job-to-payment linkage needs an authoritative source
contract and separate review; this local extension grants no financial authority.
