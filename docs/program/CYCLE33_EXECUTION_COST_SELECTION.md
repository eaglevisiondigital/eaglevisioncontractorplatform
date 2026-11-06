# Cycle33 execution · current canonical cost selection

Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Source and demonstrated defect

This package has exact parent `762e6fa590d3ef9366052db0df34bb02485973c3`
(draft #260). Only existing `src/lib/workflows/cost-coverage-path.ts` changes,
with one new regression file and this document.

The original cost-source reader checked current native access before parsing the
caller selector, then returned an exact immutable cost row without another current
check. Through the recorded-cost facade, a descriptor Proxy revoked the actual native
owner during the second/final selector capture. The row still returned although the
original recorded-cost requirements then failed their current-access guard. A private
probe on the clean unchanged parent recorded `captures:2`, `revoked:true`,
`disclosed:true`, `originalCurrent:false`. All three brands reproduced the disclosure.

## One-line existing-engine correction

The existing original `assertCostCoveragePathCurrent(view)` now also runs after
strict captured-selector validation and unique row resolution, immediately before
return. The before-input guard remains in place. This makes executable-input effects
precede a final original authority/source fence, without adding a parser, store,
engine, cache, receipt, writer, calculation or financial permission. Exact IDs remain
required; property order and presentation text confer no authority. Original native
continuation, callback lease and post-await UNKNOWN guards remain unchanged.

## Observed local tests

Isolated author-worktree tests used pinned dependencies, Node24.20.0, one worker,
original30-second test/hook budgets and no retries. These are local modified-author
results, not clean combined, hosted, responsive-browser or device acceptance.

- Unchanged-parent three-brand regression: **0 PASS / 3 FAIL / 19 filtered**.
  Raw JSON SHA-256:
  `6a53ca356b599098ad99d331b7abda2123e43dfba5c58cdbf3641b79316fe929`.
- Corrected source: **82 PASS / 0 FAIL / 0 skipped**, comprising22 new cases,
  the complete unchanged Cycle22 cost-coverage-path file34 and unchanged Cycle24
  cost-coverage-actions file26. Raw JSON SHA-256:
  `2184ebdbcb1fd74bd19d571da849e93cd89daa4619c643799d7e4547fcfe6c1d`.

New cases cover all three brands: facade and original-reader descriptor revocation,
exact canonical integer cost/profit copying, unposted labor uncertainty, independent
invoice requirements, own-accessor privacy, foreign/literal source denial, current
foreign-company rejection, actual native material review/source staleness and fresh
recorded event identity, and original callback-time revocation returning UNKNOWN
without a second callback. OFF denies source getters. Ordinary inspections invoke
no native time/material/property writers. No new test assertion was weakened and
no successful CI,267-case package, browser or offline recovery suite was rerun.

Scoped lint, strict types, formatting and diff-check exits are retained privately
before author freeze. Main owns independent source review, finite exact-source
admission, combined verification, draft publication and current-head CI.

## Limits

Canonical job totals remain copied from the original cost engine, without per-entry
allocation. Approved or recorded time does not establish posted/locked labor cost;
unverified labor is not zero cost. Internal material review is not purchasing,
payment or settlement. Every original invoice prerequisite remains independent;
selection cannot issue an invoice, create debt or establish customer acceptance.
Durable receipt/provider evidence remains UNVERIFIED and financial execution false.

No hosted mutation, operational Auth, provider activation, schema/migration,
restoration adapter, payment, dispatch, communications, merge or deployment is
authorized. All P1/customer14/4B, MFA/Auth, recovery, NMI/settlement, protected design,
Netlify and release restrictions remain intact.
