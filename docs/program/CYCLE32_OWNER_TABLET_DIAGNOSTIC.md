# Cycle32 · original failed-tablet diagnostic

Original Main PR242 exact `7b377aeffac11855a5dfdfaa86719078e70a5260`, dedicated
run41915289330 remains FAIL. Its original C21 roofing-example desktop case passed
29,383ms; tablet timed out30,973ms under the unchanged30,000ms case budget,
two configured/actual paired workers and zero retries. The final tablet click began
26,334ms and took4,775ms. Its aria-current assertion began31,110ms, after context
teardown began30,141ms. This is observed total-case budget exhaustion, not proof of
a permanent wrong route or a sole application/environment cause. All previously
successful804application cases and9development+3OFF browser cases remain separate;
none is repeated by this diagnostic.

## Isolated original attempt

The new push-only diagnostic checks out the exact failed7b application separately
from current observer tooling. Original application HEAD/tree, clean tracked bytes,
test/config/lock/package hashes and unchanged timing/helper/source-probe hashes are
checked before and after. Node24.22.2 and Ubuntu24.04 match the observed failed run.
The signed-Ubuntu helper remains strict and unchanged. Complete Chromium dependencies
are checked with a nonmutating dry run and pipefail; no unrelated APT feeds or new
mirror priorities are admitted.

Only the original failed tablet case is collected and attempted:
`tests/browser/cycle21-canonical-corrections.spec.ts:282`, exact title
`canonical task cost plan corrections and exact history navigation / roofing-example`,
case ID `77c237965d0f5d0b4278-9002f75e57cf4314f9b8`.
Its original configuration, assertions and30second budget remain unchanged.
`--workers=2 --retries=0` is retained, with `--trace=on` and the existing read-only
Cycle30 timing reporter as observability only. No browser/application injection or
product correction is introduced. The already passing desktop case is excluded.

One selected project means **one actual worker**, despite two configured workers.
This changes concurrency relative to the original paired run. A supplementary
single-project PASS cannot prove original paired stability or repair the historical
failure. Tracing itself may affect timing. A failure, incomplete installation,
missing trace or absent result stays explicit rather than becoming a PASS.

The job retains the original fifteen-minute diagnostic job bound. Actual raw
collection, result, timing, trace, safe source shape and before/after bindings are
always uploaded. The evidence validator requires one exact original case, one
actual attempt, retry0, no skipped/flaky coverage, a real trace and current source
identity; it retains the actual passed/failed/timedOut outcome. It never promotes
this observation to whole-Foundation or release acceptance.

## Current evidence and restrictions

The new hosted diagnostic is NOT RUN until actual artifacts are inspected. Local
validation is limited to workflow syntax, original hashes and read-only collection;
no application/browser assertions, successful CI checks or recovery baselines are
repeated. Four inline Node blocks compile; formatting and exact original hashes
pass. Read-only collection confirms one original tablet case with its exact ID and
30second budget. An initial overanchored grep selected zero cases before assertions;
the corrected original-pattern selector is now checked by exact case identity.
Independent review precedes publication.

No original case, configuration, budget, helper, trust rule, product component or
protected source is changed. No merge, deployment, hosted business mutation,
credential, schema, restoration, dispatch, financial or communication action is
authorized. Release1.0 remains NOT READY / NOT AUTHORIZED.
