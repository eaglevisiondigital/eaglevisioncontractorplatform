# Cycle 33: retained Cycle 17 closeout source compatibility

Base: `67cf66072e3aeeb4bbe645cda7385257bb3f9978` (draft PR #284).
This package changes one retained test and adds this record. It changes no
application source, historical manifest, workflow, assertion budget or release
control.

## Demonstrated failure

Both final-head Foundation logs recorded the retained case
`Cycle16 closeout preserves child cancellations separately from actual successful combined-source coverage`
as failed before their 45-minute job deadlines. Those incomplete logs contain no
terminal assertion messages, so the cancellation's exclusive cause remains
unproved.

An isolated run of only that case on the unchanged base produced **0 PASS / 1 FAIL
/ 44 filtered** in the original 45-case file. The actual assertion compared the
current advanced workflow digest `3a784566054c6b746fadf1d0b212bd763e638a64a21ec6d5d75cdf39d56784d9`
with original PR #117's digest
`b3c6d6f20aa38d00f88a9987b30117f945c341cda5c591d16d5b8f671a5b60cf`.
This is a source-compatibility assertion failure, not a test timeout or a
demonstrated application authorization defect.

## Bounded correction

Only original PR #117's literal
`src/lib/workflows/addon-readiness-guide.ts` entry uses the existing
`admitCycle33V1Published` validator. The case still explicitly requires its
original PR, path and digest. The validator verifies original published commit
`fecfcf104e7f3988a53c85a77353824edfa6f85b` and blob
`804819c35a5429e9433bd0379eb654b0b277262f`, then applies the existing finite
`99e112a7cf669dfde03fdd69dbdbce2e74ef2fd4` →
`1d8202fb3825950b458a2a4ed330406f0a207665` source lineage. Exact author parents,
regular modes, deltas, original/new companions and fresh current bytes remain
mandatory. The result must retain all six original source-only metadata fields,
including `business_authority: false` and `restore_adapter: false`.

All other 29 original owned-file comparisons and the original Foundation-workflow
hash assertions remain direct comparisons. Every original case identity and the
45-case count remain unchanged. The original closeout JSON and Cycle 17 delivery
index retain their original hashes and historical results. No arbitrary hash,
ancestry or path exception is added.

## Actual local evidence

Only the failing case was executed; none of the other 44 cases was rerun.

| Evidence               | Actual result                                      | Raw JSON SHA-256                                                   |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| Unchanged parent       | 0 PASS / 1 FAIL / 44 filtered                      | `6f2d153ef8622fd127d99eb4549ff9a63db56fc33b86c974445dac4eb7dcf509` |
| Initial corrected test | 0 PASS / 1 new-test expectation FAIL / 44 filtered | `140ee0599359e8e410fde63330112773f15b202c20fa458f713790eed754d737` |
| Final corrected test   | 1 PASS / 0 FAIL / 44 filtered                      | `092a42c12fd45cf8b12e989cfd846db1d5e7d412420a92a318f36fc9563a393e` |

The intermediate new assertion spread an additional historical metadata field
into an exact object comparison. The final assertion selects the intended PR,
path and digest explicitly; the historical field remains unchanged. It is not
counted as a product failure or concealed as a passing run.

Final scoped ESLint, Prettier and diff checks pass; strict TypeScript passes.
The original 30-second test/hook budgets and zero-retry policy remain unchanged.
No browser test or previously successful cohort was rerun.

## Remaining acceptance

The modified test itself requires a separately reviewed, literal test-successor
admission in Main's build-time source checker before claiming combined source
acceptance. This package does not rewrite the historical test digest. Hosted CI
for this correction is pending; the original Foundation cancellations and
historical Cycle 18/270-cohort failures remain separate evidence. A failed-only
local PASS does not establish a 45-case PASS, full Foundation PASS, visual
approval, physical recovery or operational acceptance.

No merges, deployment, hosted mutation, restoration adapter, financial action,
dispatch or customer communication is authorized. Release 1.0 remains **NOT READY
/ NOT AUTHORIZED**.
