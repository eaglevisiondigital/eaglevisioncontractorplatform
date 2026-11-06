# Recorded-cost selector custody

**Local source correction only. Release1.0 NOT READY / NOT AUTHORIZED.**

The isolated package starts at `6bf1f2be786e6d9c052d87e5f759a4312782be70`.
It changes only `src/lib/workflows/recorded-cost-requirements.ts`, this document
and `tests/cycle33-recorded-cost-selector-custody.test.ts`. Existing canonical
engines, financial calculations, native readers and navigation own all authority.

## Demonstrated problem and correction

`inspectRecordedCostSource` captured the input's own-data `kind` and `id`, then
discarded those values and passed the original input to the inner reader. A
descriptor-based input could present `ISSUED_SCOPE` at that first capture and
`SAVED_TAX_REVIEW` at the second. Actual original branded sources returned the
second original requirement instead of the first captured selection.

The wrapper now narrows the captured ID to a string and the kind to the original
four literal source kinds, then passes those captured primitives in an ordinary
record to the unchanged `inspectCostCoverageSource`. No type cast supplies runtime
trust. The wrapper's original current-source guard and the inner reader's original
source, identity, uniqueness and final-currentness guards remain in place. The
returned object remains the original admitted row; captured values do not become
authorization, financial evidence or a second source owner.

## Observed local evidence

All executions used Node24.20.0, the existing pinned dependencies, original
30-second test/hook budgets, `--maxWorkers=2` and `--retry=0`. The selected parent
regressions failed before any runtime edit. The later new-file run is a separate
execution, not an aggregate with that parent report.

| Execution                                                | Actual result            | Private raw SHA256                                                 |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| Parent, first-capture counterexample on all three brands | 0PASS /3FAIL /19filtered | `c650254530894b6a4a6ef0c1d8aa8cb6cab5abfbd7f9f5cc2c5748d94c6542b9` |
| Corrected source, complete new test file                 | 22PASS /0FAIL /0skipped  | `88cb8669eaa1964f80a23cfdec5fe107d6929e5369662fe2c80e4bcf307d3e75` |

The 22 cases exercise both changing ID and changing kind/ID pairs, ordinary exact
row identity, original canonical category totals and independent invoice evidence,
actual native owner revocation during capture, withdrawn confirmation, stale
canonical state before selector access, cross-company and sibling-job IDs, getter
and malformed inputs, default-OFF boundaries and original UNKNOWN
navigation with one invoked callback and no replay. Ordinary reads leave canonical
job/workforce and original financial sources unchanged; no expense review or
financial command is invoked by the selector.

Private command/report files remain under
`.staging/program-cycle33/evidence/v1-closeout-next/finance-selector/`. The parent
and corrected reports have distinct paths. Execution was in the isolated author
worktree with its new test and runtime change present, not a final clean combined
candidate or a hosted acceptance run. No previously successful application cohort
was manually rerun. Browser, combined source admission and exact-head CI evidence
remain separate Main responsibilities.

## Authority limits

No store, engine, writer, receipt, adapter, route, ledger calculation or UI is added.
Invoice requirements remain independent and `NO_GO` in the exercised sources;
selection cannot prove posting, cost completeness, payment, issuance, settlement,
customer acceptance or completion. Revoked or stale original views remain denied;
UNKNOWN retains its original exact-read-only/no-replay boundary.

Original branding, designs, migrations and all P1/customer14/4B, Auth/MFA, NMI,
Netlify, recovery and production gates remain unchanged. No hosted mutation,
provider action, financial execution, dispatch, communications, restoration,
deployment or merge is authorized or performed.
