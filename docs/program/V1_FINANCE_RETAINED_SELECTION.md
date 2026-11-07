# Finance selection after an unrelated saved change

This bounded contractor refresh improvement starts from exact draft302,
`523afd4ef17d5502b6e0e39a4df86bdaa7bba23b`. Ownership is only the existing
`recorded-cost-requirements.ts` and `cost-coverage-actions.ts`, one new regression
file and this note. No component, interface, business engine, store, schema,
operational adapter or financial writer is added.

## Demonstrated duplicate selection

The existing CostCoverageActions refresh reads current requirements, compares its
previous selection and clears the old verification/confirmation. Its native
`refreshCostCoverageActionSelection` previously required the earlier requirements
to remain CURRENT. An unrelated saved material review or forecast changes the job
revision, so that check cleared even a byte-identical selected time row before the
existing canonical comparison could inspect it. The contractor had to select the
same time source again after reloading the original cost controls.

All three actual contractor fixtures reproduce this without executable inputs or
mocked authorization. The tests use native `reviewExpense` and `projection` calls.
Before the failing assertion, they prove that the selected time row and recorded
time evidence are unchanged, the customer/property/job/estimate/issued identity is
identical, the original member is active and the job revision changed from2to3.
The earlier CURRENT check rejects, while the existing authorized historical-access
and canonical comparison guards accept the original source. The original refresh
still returns `STALE_SOURCE_RESELECT_REQUIRED` with no selection.

## Original access, fresh current facts

The new access-only guard first checks the existing requirements-reader WeakSet
before reading any property. It then calls the original
`assertCostCorrectionReviewAccess`, which validates both retained saved cost and
exercise handles, current exact membership/role, original repository/root/entry
owners and immutable issued identity. It adds no binding or custody registry.

The retained local FinancialCasework detail uses that same original
Operations/Phase3/property/release and owner/admin role/staff-type authority
family. It has no separate connected financial permission or customer lease.
Historical detail is never declared CURRENT, adopted as a current financial read
or used to construct fresh action facts.

Only the two checks of the **before** handle in the existing refresh use access
rather than mutable freshness. The ordinary requirements CURRENT guard and all
its other consumers are unchanged. The original canonical comparison still
requires exact repository/job identity. The fresh current view is checked before
and after comparison/validation; only its byte-identical current row can retain
the presentation key. Its current job revision supplies the new input.

Reverification remains required and previous confirmation remains false. Fresh
canonical cost totals, missing-cost coverage and independent invoice prerequisites
are still evaluated by their original owners. Changed selected rows still clear.
Copied opaque reads, withdrawn earlier admission, revoked staff, another job or
company and OFF admission remain denied. A retained UNKNOWN navigation attempt
cannot be reopened by refresh, confirmation restoration or a new read.

The existing Cycle26 tests intentionally clear a changed selected material row;
this change preserves that behavior. It preserves an unchanged exact source after
an unrelated save, without retaining verification, approval or a navigation lease.

## Actual source-based evidence

Only the new test file and the directly affected original financial-refresh
regression file are executed. Original30-second test/hook budgets, one worker and
retry0 remain unchanged. No original191/21 cohort or successful old-head CI is
rerun. Local Node24.20.0 is not new-head hosted acceptance.

| Execution                                            | Actual result            | Raw private report SHA256                                          |
| ---------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| Untouched302 native source, complete new file        | 21PASS /6FAIL /0filtered | `9ef1df3f460b70dbe3d3dfee813781139d6efc45e243ad231e18c65ff140d052` |
| Corrected native source, unchanged complete new file | 27PASS /0FAIL /0filtered | `14bf7e8bbca217231d2d25ba2051b1a3e078452565bd26a98da66a40e24f8f06` |

The directly affected original `cycle26-financial-coverage.test.ts` first
reports13PASS/1FAIL/0filtered. The sole failure is brand0's changed-selected-material
case exceeding the unchanged30-second deadline, without an assertion failure.
Raw SHA256: `166bdbf718236e2bb120c3380137b560515855eae32559613e3445d9b80adca4`.
One supplementary execution of only that unchanged failed case reports
1PASS/0FAIL/13filtered in3703ms under the same budget, raw
`4dad3b255f7d69a6ea5849f92d690f49a0c9a3ede26a8e827ab11f661efdf3c7`.
The thirteen successful original cases are not rerun. Source, assertions and
configuration are unchanged between those executions. This supplies a passing
outcome for each original case across separate executions; it is not one14PASS
run or a repair of the original deadline. Its exclusive cause remains UNKNOWN.

The six ordinary-source observations are retained separately: parent
`35640c065e3c08aeecb135eff81566534eb529cd81989be6e0a9637fca7989b9`,
corrected `55483fcfb04284250dad8d5a5b13401df3b2e6908e600e77e2fe113d590b35bb`.
The new file also covers changed selected material, real owner revocation,
independent before/current admission, same-property sibling jobs, another company,
copied wrappers, OFF admission, no business/network writers and UNKNOWN no replay.
Unposted cost coverage remains UNKNOWN; invoice preparation remains NO_GO where
original prerequisites are missing. Invoice issuance and financial execution are
false. No inquiry/job relationship or customer approval is invented.

## Preserved boundaries

Main owns shared source admission, contracts, registers, workflows and combined
verification. Author results do not supply clean combined-source, new-head CI,
browser accessibility, visual, genuine Auth/MFA or operational acceptance.

Original tests/pins/shared metadata,128 protected files, five design locks and
thirteen bindings remain unchanged. Eleven D1 roles are UNASSIGNED; D2/D3 remain
separate; A01–A12 NOT_RUN. The November4 main synthetic loss PASS remains scoped
to that owner-witnessed case. Duplicate recovery remains UNKNOWN/UNVERIFIED; both
private folders and consumed attempts are untouched.

Preserve original recovery/P1-on13/customer14/4B, Auth/MFA, NMI/provider/financial,
communication, Netlify, design, production, deployment and merge gates. No hosted
mutation, credentials, operational restoration, payments, messages or dispatch.
**Release1.0 remains NOT READY / NOT AUTHORIZED.**
