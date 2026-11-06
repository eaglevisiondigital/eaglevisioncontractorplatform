# C16 exact test-successor correction

**Separate draft correction after Main #274 at
`3660a7e6e3d260f0cef54200f723074278f155d7`; no merge or release acceptance.**

## Demonstrated hosted failure

The corrected full-history checkout reached the original C16 application tests on
Advanced #272 at `841434d09524b6d6725aa2c7afc60a3a36cff24b`, run
`42251295981`, and Main #274 at the exact head above, run `42252403420`.
Each artifact contains the same **440 identities: 439 PASS, one FAIL, no skips or
todos**. Source preflight passed. C16 build and browser steps were skipped.

The sole failure is the existing case at `tests/cycle16-integration.test.ts:567`,
“the combined candidate contains the exact thirty disjoint author blobs recorded
at their final review heads.” Its direct current-file hash expected the original
add-on source `b3c6d6f20aa38d00f88a9987b30117f945c341cda5c591d16d5b8f671a5b60cf`.
The actual source is the separately reviewed privacy correction
`f6c2be0f5a14722190c4103e606ce9b2ef168b2630147f96baf5cb4fee76036a`,
sole-parent author `99e112a7cf669dfde03fdd69dbdbce2e74ef2fd4`.
Failure durations were 8.603 and 10.762 ms. This is a test-contract incompatibility,
not evidence of a deadline, runtime privacy regression or failed history repair.
Original results remain FAIL; this draft does not relabel them.

## Explicit correction and source authority

Test-only author `8e634b247e09ee589d3a797f5fbfb4651c7146e5` has sole parent
`3660a7e6e3d260f0cef54200f723074278f155d7` and modifies only the existing C16 test.
It retains all 36 test identities, the six-package/five-file/30-distinct-source
assertions and the other 29 direct hash comparisons. Only the literal original
add-on path, author `fecfcf104e7f3988a53c85a77353824edfa6f85b` and original
SHA may use the existing strict `admitCycle33V1Published` proof. That proof must
return the exact six-field `99e112a7…` source identity and no business authority.
It verifies original bytes/blob, sole-parent M1/A2 author, regular modes, exact
current bytes, new and original companions and fresh current reads.

The original C16 index is unchanged:
`8cf7783a93dfb523b175bc793813ea28c3ab4dacbadc45453e09317d7da045be`.
Its review-commit field remains `9b73bdf733dec476a6ce7899ffd48d6a61140e8b`.
That commit does not contain the original test path, so it is **not** represented
as the test's publisher. Actual original test publisher
`d62aa76ae03d64863c12dc92ce6f030e37974518` contains raw SHA
`e92bf92bf96a87b7005ab715406ae424e2f2ccb4ec28da45a3cfc14412f4b247`, Git blob
`f5ba8b49ff15520dc6170fac1e2984d6f80b382d`, equal to the unchanged Main parent.
The new test SHA is
`4390f6bf0595f4cd7b34bba2d2364fba80748e0227a36dc28dd897f417e53fd5`, blob
`0ce51ed8d35be7406f044896a6b89fa10d15cd39`.

Main's build-only admission pins that one test author, sole parent, M1 delta,
original publisher/raw bytes/blob, exact new raw bytes/blob, original index hash
and current index/test reads. The C16 independent-file route also requires its
unchanged historical review field. Replacing the old metadata with the new hash
does not bypass admission. Every other mismatch keeps the original denial.
No original source pin, manifest, native implementation or approval is updated.

## Local verification and independent review

The failed case alone reproduced **0 PASS / 1 FAIL / 35 filtered**, then passed
**1 PASS / 0 FAIL / 35 filtered** with unchanged identity. The other 439 hosted
passes were not manually rerun. RED JSON SHA is
`7b7b84de8bbfd9fc9c1a5a857978511ff0da4ef8b40909ae53dca37679c8219c`; GREEN JSON SHA is
`571fbff80b4b5c737fd0f4503b82e0fd8bc73df7659e5a8b042a1f6e53c8bf64`.
The new finite-guard suite passed **36/36**, no skips, todos or runtime errors;
raw JSON SHA
`7a267b7a6d0d7a41586040d490225614e7f261d7ce03774a1a22e620e8cdc1c4`.
It covers real immutable Git evidence, wrong paths and metadata, current-hash
forgery, author types/parents/deltas/modes, original/new object drift, missing
current files, changed index, fresh reads and actual consumer denials.
C16 and C24 source CLI checks passed after admission. These are local, scoped
results, not complete GitHub Foundation or C16 acceptance.

Actual assignments: `/root/cycle25_finance_intelligence_resume` authored the M1
test and new guard regressions; `/root` owns admission, workflow and registers;
`/root/cycle33_independent_review` independently reviewed the test and support;
`/root/v1_independent_combined_review` independently reviews the final candidate.
Test review SHA:
`4c4b10ddb2f93f986deceb14a323d9c5f032b7a40096e7c7adf25162742cc4e1`.
Support review SHA:
`1327d35908ce44fa63677c12e542dbdbb376fef12bb95b0a2746ca105c5f07c3`.

The C16 workflow retains its original 35-minute job budget, original 440-case
command/assertions, original workers, build/browser steps, pinned dependencies
and signed-package trust. It separately requires all 36 new guard cases with
zero retries and no filtering/skips. New-head GitHub outcomes must be observed
independently; Main #274, feature heads and old runs do not inherit those results.

## Other coverage and operational boundaries

Main #274's push integration run `42252393748` passed at exact
`3660a7e6e3d260f0cef54200f723074278f155d7`, tree
`b68a68442e7932142c37a746c679c2f00736c6a2`. Downloaded artifact
`20e5e6dc774d2b4cadc0304645807e7f31d0e444a63ffc748fb0be9d62a7cbfa`
contains **687 unique passing application cases in 26 files / 10 reports, nine
three-brand responsive journeys, three production-OFF cases, 63 PNG/source pairs
and nine keyboard journeys with 369 trusted events**. Original browser budgets
and zero retries remain exact. Before/final evidence binds 13 admissions and 68
unchanged Git file hashes; final evidence explicitly says full_foundation_pass=false.
The collector's 76 captured plus two execution-bound runtime files are scoped
evidence, not a complete transitive runtime inventory or visual approval. Root's
read-only artifact proof is
`6b4cbbb8cc094b43fe6b50f5d137b826a21cda5e9891259d8d06b0c8e701c55d`.
PR-event, child-head and new correction results remain separate. This focused
success does not imply complete Foundation. Parent #267 retained 19 PASS /
2 CANCELLED and #268 retained 25 PASS / 6 CANCELLED. Original 45-minute Foundation
cutoffs and the historical 270 PASS versus 249 PASS / 21 FAIL remain unresolved
as recorded; coarse timing/resource evidence does not establish an exclusive cause.

Finance #270 at `6759bae679512ce832d27f7f5005d6aa76b701dd` has two distinct
cancelled isolated browser jobs: technician run `42251294309` and maintenance
handoff run `42251294430`. Each reached its original eight-minute job limit
during Chromium dependency installation; browser assertions were NOT RUN and
artifacts are absent. Azure Ubuntu font download retries are observed, with no
terminal signature/package error establishing a specific repair. No matching
same-head success was found. Main's different browser scope does not fill these gaps.

See [V1 Essential / Optional / Post-Launch matrix](CYCLE33_V1_SCOPE_MATRIX.md) and
[D1–D3 owner decisions](CYCLE33_OPERATIONAL_DECISIONS.md). All eleven accountable
role assignments remain UNASSIGNED; A01–A12 remain NOT_RUN. Preserve the November4
owner-witnessed main synthetic network-loss PASS only. Duplicate recovery remains
UNKNOWN/UNVERIFIED; both private run folders stay intact and no consumed attempt
is replayed. Remaining physical cases use the original kit and distinct fresh
attempts only where its original procedure permits.

No merge, deployment, hosted mutation, credential/schema/operational adapter,
restoration, payment, communication or live dispatch is authorized or performed.
**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
