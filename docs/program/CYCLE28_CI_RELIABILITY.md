# Cycle 28 · exact CI and diagnostic-contract correction

No final-head C27 failure has been demonstrated at the latest independent
snapshot: exact `5f74b8ff5385560330cb94717c17338ed0c10f44` has20 successful
workflows and3 running at14:38Z. C27 push integration succeeded; PR integration
and both Foundations remain distinct pending outcomes. No successful or pending
check was manually restarted.

The new C28 combined local run contains177 cases:176 PASS and one retained C27
source-lineage assertion failure. The checker correctly denied changed current
bytes after warming immutable Git facts, but its new C28 denial text omitted the
retained `fixed Cycle27` diagnostic contract. The correction changes only that
new denial message to identify both the original lineage and exact C28 author.
The retained assertion, strict bytes/parent/delta/mode/source checks and all
original tests remain unchanged. The exact failed case passes under its unchanged
budget;19 deselected cases are not counted as additional passes. No business
runtime, permission, source admission or cache policy is loosened.

This branch also carries the finite six-author C28 source-lineage metadata needed
by reviewed feature drafts. It contains no native business changes. Main retains
the176 successful cases and independently binds the corrected helper before
recording final combined acceptance. Changed-source automatic CI is separate
from a manual rerun; no original CI outcome is replaced.

Historical Cycle18 run41677657862 artifact13253335545 was retrieved read-only:
446/446 focused application tests PASS;21 browser cases PASS and9 FAIL, with
zero skips/flakes. Eight fail clicking Today’s priorities and one clicking
Advanced task review at the original15-second action limit, after the element
resolved visible/enabled/stable and scrolling completed. This does not uniquely
prove a runner or product cause. Earlier C22 retained-pane render-cost corrections
remain preserved; the original nine failures are never relabelled.

The separate historical Foundation45-minute cancellations remain CANCELLED.
Original399-case browser supplement191 has397 PASS/2 deadline failures at30s;
follow-up199 has2 PASS with an explicitly different90s budget and no changed
assertions/application. That is supplementary evidence, not repair or replacement
of the original failures. Earlier truncated Vitest failures without final exception
details remain unresolved. No test timeout was increased in this package.

No `.github/workflows/ci.yml`, original test/config, frozen artifact, migration,
design, release or operational control changes. No hosted mutation, credential,
adapter, deployment, merge, dispatch, financial action or communication.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.
