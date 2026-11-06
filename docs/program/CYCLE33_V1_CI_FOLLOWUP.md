# V1 draft CI follow-up · exact failures and narrow corrections

This is a normal follow-up to Main274's first head
`db42d434fa9ed0b4dec02fdb59a8712e40833137`, not a rewrite or relabeling of its CI.
Native source-only authors and all five runtime corrections remain unchanged.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## C16 · required Git history before integrity checks

Advanced272 exact `42f2b83004edd0d5fee0d381c43e81b437576f81`, PR run42233428000,
job127944799136 fails at the C16 integrity step before Vitest. The retained C11
checker reports `Reviewed Cycle11 source changed: src/lib/workflows/sync-admission-review.ts`.
Install, typecheck and feature checks passed; application/build/browser steps were
SKIPPED and no C16 results artifact exists. Finance270 exact
`2d2f662eac257fd82e4eae456efc0a348dc95928`, run42233415219/job127944757699
shows the same pretest failure. Neither result is an application test failure or
PASS. Hosted checkout explicitly uses depth1; the nested error text alone did not
prove its cause.

Controlled local same-head comparison held Advanced42f HEAD/tree, native/helper/
checker/package/lock/config/workflow bytes, clean tracked source and Node24.20.0
fixed. With depth1 the same C16 command failed at that C11 guard and exact original/
forward/native Git object lookups returned128. Fetching only full Git history from
the same public local Git source, without changing HEAD or any source/dependency,
made all three object lookups succeed and the same C16 command exit0. Comparison
proof `1b705a9df71bf28cfbc19820b5deb84fff43cb360a32fa45b6f82dc30dbe66d8`.
This proves the source-history prerequisite for the exact controlled tree, not
hosted repair or application correctness.

The correction adds only `with: fetch-depth: 0` to the existing C16 checkout. Remove
those two added lines and the original entire workflow is restored.35minute job
budget, workers, tests/assertions, browser budgets, permissions, dependencies and
signed-package trust remain unchanged. New workflow SHA256
`64b1515bc3ad49cf87e88acfac51496c6d414f96504cbf2fd1efc51232f285a4`;
independent review `/root/v1_independent_combined_review`, proof
`dfb80780075050bf84c0a14abbbb2efb37e605675739fcf14285638f17ca1b92`.
Only genuine new-head hosted evidence can establish that the missing history is
resolved there. Original failed heads and downstream NOT_RUN remain recorded.

## C22 · unchanged exact legacy return contract

Finance270 exact2d2f662e, PR run42233415257/job127944756594 produced actual original
C22 application JSON: **300total /299PASS /1FAIL /0skip**. Sole failing case:
`tests/cycle22-independent-integration-review.test.ts:718`,
`independent source review: all admitted author bytes are exact and original controls remain the only writers`.
It failed at128.658ms: the actual seven-key result did not deeply equal the
expected original six-key contract. Raw JSON SHA256
`88d695b2906a6975da3ec9f07941e0d97f167022d7925a782ceda4429f32f42f`.
There is no demonstrated timeout, cost-fact-index failure or business runtime defect.

The new V1 source helper validated the exact reviewed successor but appended
`v1_forward` to a legacy result. That extra return key violated the original exact
contract. The correction retains every original and new source-admission guard,
then returns the original legacy metadata shape. Direct V1 admission remains the
explicit source of new-author metadata, already recorded separately in Main's13
admissions. No original source pin, hash/blob requirement, assertion, runtime
native file, business authority or restoration boundary changes.

The same stable-shape rule applies to the Finance, C31 Growth and C32 Field legacy
entry points. New compatibility cases require the exact old result and independently
require the fixed direct V1 author. The new109-suite's three affected expectations
are strengthened to verify that separation; original C22 assertions stay unchanged.
The actual original one failed C22 case is the only retained application case selected
for a necessary local regression rerun; the299 successful cases are not manually
rerun. New legacy cases produced **0PASS/3FAIL →3PASS/0FAIL**, raw RED
`986eb256a6061bbf5e80900d230c246bac638acd0557d0a0f6c57f67ac7e09fc`
and GREEN `06a5aae72b192362d7c181ffddab2d8ec78a58a359d60809e89616599fccdffb`.
Only the three affected new109 expectations passed separately (106filtered), and
the unchanged original C22 failed case passed separately (49filtered), raw
`be6d19ee4a7bedb9477774d3328b2de54a439cf9aa14285500fad6d44f426c12`.
The new helper is `bc8261f329ea92ee0d3e03f3e35ac3105899c17448aa397dd6a30aaa5a0f7c99`;
the old6eac helper hash/review remains specific to the first db42 head.
Independent correction review proof
`2cadc98c5bcbe46aecf9b58b6b76054ce533d475f2d80479f41dfb162221c921`.
These scoped local passes do not replace the original300-case failed hosted run. A source review or local fix is not current-head
GitHub acceptance.

## Combined initial head · missing retained-source consumers

Main274 first db42 head failed both dedicated push42234835586/job127949653954 and
PR42235005619/job127950230008 at the C24 source preflight. Exact denial:
`Retained author source changed: src/lib/workflows/addon-readiness-guide.ts`, from
C22 retained-source validation through C23/C24. The13-admission/64-file clean-source
binding succeeded, but all new93/109 and application/browser steps were SKIPPED.
These are failed preflights, never passing test collections.

The initial review covered the primary C16/C21 validators but missed their separate
C22/C23 retained-index consumers. The correction uses only exact original index,
original head and one reviewed file: C16/fecfcf/addon-readiness-guide and
C21/a9dd/published-service-navigation. It calls the same strict immutable published
V1 admission, preserving original SHA/blob/current author/delta/companion/fresh-read
proof and original unknown-source errors. No original pin or manifest is replaced.

After the first narrow C16 consumer correction, the necessary C24 CLI failed on
`published-service-navigation.ts`, raw
`ef5f6d750b66d55f86c21b05904d0b89f32c5dac4ee0b0dc79418ece9def3cf1`.
That actual second failure justified the C21 consumer correction. Neither bypasses
an assertion or broadens unrelated author/path acceptance. A new24-case consumer
collection requires exact positives and negative source/metadata/companion denials;
actual local execution was22PASS/2new fixture failures, raw
`7d15ba94611bf2c82f211be7b61d3b7a42fa7298446949fa17bd07334c4f8cd5`.
The two fixtures had correctly encountered the earlier immutable-manifest denial;
only their activation point moved after that check to exercise the intended retained
branch. Only those two corrected cases were rerun:2PASS/22filtered, raw
`da904898c1f18dc89e1fed190c3c32ea8cd18b76e65a73635dff20882664aad1`.
This is24 distinct passing cases across split runs, not a single24-PASS run.
Actual final C24 source CLI exited0 with523retained/128protected/5locks/13bindings,
raw `bac524fb355741b1f832023ef150868e2a4fd4ab07e80a9646b6212c4452832c`.
Consumer author proof
`6a9b8fde4cd8af09831298276729374add12210bd216546e0cfcb6645c56b56d`.
Independent review and genuine new-head hosted results remain separate.

## Boundaries and publication

All original failed/cancelled/pending heads remain distinct. New normal-child commits
are published only after independent source review. No manual successful-job rerun,
budget increase, assertion removal, hidden source-pin refresh or business-state
restore occurs. Main's existing exact93native/109source/original458/native9/OFF3/
63capture gates stay present, with separate strict3-case legacy compatibility and24-case retained-source gates.
New-head results are read separately; CI is never inherited across the feature drafts.

The Foundation45minute incomplete queues and historical270conflict are separate,
not repaired by checkout or metadata compatibility. Their missing final summaries,
original assertion failures/timeouts/cancellations and unproven exclusive runtime
cause remain disclosed in the coordinated validation.

The eleven roles stay UNASSIGNED; D1–D3 unresolved and A01–A12NOT_RUN. Main physical
network-loss owner PASS remains scoped; duplicate recovery UNKNOWN/UNVERIFIED,
both private folders untouched. Original P1/customer14/4B/MFA/Auth/NMI/Netlify/design/
financial/production restrictions remain. No merge, deployment, hosted mutation,
credentials, restoration, payments, communications or dispatch.

## Retained first-head hosted artifacts

Run42234835586 verified ZIP SHA256 `de8d3c83027a998ccd135653c59246c9650573b2fcd55004c207fe7b66824754` contains only before/final binding JSON,13admissions/64hashes, unchangedtrue. No application, browser or screenshot results exist in that artifact.

Run42235005619 verified ZIP SHA256 `7f1c0f6669624774b71442d99c1ca464c9ee786257609f8a3400ff35e51a5725` contains only before/final binding JSON,13admissions/64hashes, unchangedtrue. No application, browser or screenshot results exist in that artifact.

The direct db42 head and PR carrier `af3b0ccde8c8f3d4784218c47c651e522d72a840`
share actual tree `efe7efd763efb35e1819b78b5fb145ee1e26126b`. Binding review proof
`03196f8edf2d16e3d485676973446b9065b9c2e3ba3fe60178cf37a5132a3c0f`
confirms hashes against actual original Git bytes; source binding alone does not
upgrade the failed preflight or skipped tests.

## Independent review and exact publication scope

History correction review `dfb80780075050bf84c0a14abbbb2efb37e605675739fcf14285638f17ca1b92`;
legacy result review `2cadc98c5bcbe46aecf9b58b6b76054ce533d475f2d80479f41dfb162221c921`;
retained-consumer review `784ddb3ad202d866ba1ca37ffde32ad6b88997ecf7f442b17ded74c0b6b82121`.
All are bounded source CLEAR by `/root/v1_independent_combined_review`, not GitHub
approval, current-head PASS or release authorization. Only shared build scripts
and the C16 checkout are copied to partial feature children; the new109/3/24combined
source suites remain on Main because they require the actual combined tree.
Exact current heads and source hashes are indexed additively under `ci_followup`
in the original source manifest; initial source heads/results remain intact.

## PR279 original142 · single-capture revocation probe

Exact Main279 `038b64acad56e436a016905dfec87aef86dcfbc8` remains unchanged.
PR run42267836354/job128064291857 is FAIL:142total/139PASS/3FAIL/0skip.
Provider artifact13529860791 is39491bytes, ZIP SHA256
`4963133d6c751732e60c1b8b8f456495caca64ea824f3664f0bae071ac0a749b`.
Raw continuation JSON SHA256
`1acad4c74b56458cc38b7f29109eccd1e24faf9d5f9eca719c638273470e5a20`.
Actual PR carrier97e3ee49e2223b60e4c075e8da509b1479f9976e has the direct head's
identical tree39dfe7973845ceed495a3206e02c04677398e5bd; initial/final90hashes match.

All three failures are the unchanged case template in
`tests/cycle33-execution-cost-selection.test.ts`:
`brand {0,1,2}: recorded-cost facade withholds private material facts when the final descriptor capture revokes actual access`.
They fail at original line77, `expect(revoked).toBeDefined()`, with
`AssertionError: expected undefined to be defined`. Durations are2456.736397,
2311.825191 and2580.275935ms. The later privacy assertions were not reached.
The same-head push42267758962 separately has139PASS/3FAIL, identical failure IDs
and error, at3254.519768/3082.587602/3485.967468ms. Those original results stay FAIL.

The observed runner is Ubuntu24.04 image20261101.360.1, Node24.22.2/npm11.19.1.
The original command uses one worker/retry0; test/hook budgets stay30000ms and the
job remains45minutes. Job failure occurs normally at the application step, not
installation or timeout. No per-worker CPU/I/O/scheduler or memory telemetry was
retained; no resource-pressure cause is inferred. Independent diagnosis proof
`edc4443e02fd4ac391a47df67cf8ddda6d8a8d769d8ef49785820aee42db801c`.

The reviewed Finance5986 correction intentionally captures the caller's kind/ID
once, then passes inert captured values to the original reader. The old test only
revoked the owner at a second caller `kind` descriptor read; that read no longer
occurs. Access was never revoked, so the probe's own prerequisite failed. Restoring
unsafe repeated caller reads would contradict the verified source-identity fix.

The separate test-only M1 author
`2784c9ab0d0f52f1bd653651081c005ac3da239d`, sole038 parent, moves real native owner
revocation to the final `id` descriptor of the actual sole capture. Every original
case, assertion and budget remains; one explicit capture-count assertion is added.
Reversing exactly those changes reconstructs the entire original test byte-for-byte.
The22case identities remain unchanged. Only the original failed3 were manually
reproduced: parent0PASS/3FAIL/19filtered, then corrected3PASS/0FAIL/19filtered.
Corrected raw JSON SHA256
`236fbe0840ba431cfc74c36066aa169d974df10f0f7ebb105ab62737b1062a7a`.
The19 successful cases were not manually rerun. Finance independent peer proof
`4efe60b71b943c860a16435dfef94d8dc87ec3219584c27d6a4469e5c1f4a612`.

Main's build-only admission retains original98e test SHA/blob metadata and every
old source profile. It admits only this literal sole038 M1 author after actual Git
parent/delta/mode, raw original/base/new SHA/blob, exact reverse-assertion invariant,
current and final fresh reads. Only the original98e execution companion and the
original Finance V1 companion use this exception; legacy results and unknown-source
diagnostics remain unchanged. It grants no runtime, business or restoration authority.

The focused new-head workflow requires original142 and a separately declared48
strict source cases, with the original budgets/command/assertions and a clean
before/final binding. It proves runtime/dependencies/design/canonical feature bytes
remain identical to038. New source-suite local evidence is split44PASS/4new diagnostic
expectationFAIL, corrected failed-only4PASS/44filtered, then one strengthened final-read
case1PASS/47filtered. No single48localPASS is claimed. Hosted exact-head acceptance
requires its own complete48 and142 results.

Preserve the546 passing cases in the other nine original PR artifact reports and
139 passing continuation cases exactly to their tested head. Original25compatibility,
128validator cases, build/browser/source screenshots after the failed step were
SKIPPED in that workflow; they are not inherited or silently marked PASS. Historical
Foundation45minute cancellations, original270 outcome conflict and originalC18
failures remain separate and unresolved. No timeout, test worker budget, protected
pin, signed-package validation or successful job is changed/restarted.

The focused correction is separate from new native product work and the
[owner proposal draft280](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/pull/280).
All11people remain UNASSIGNED, D2–D3 separate and A01–A12NOT_RUN. Original main synthetic
owner PASS, duplicateUNKNOWN/UNVERIFIED and all private recovery records are untouched.
Release1.0 NOT READY / NOT AUTHORIZED; no operational action is authorized or performed.
