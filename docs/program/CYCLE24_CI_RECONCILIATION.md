# Cycle24 · exact CI source-composition compatibility

Base: `7b8d8c1a6f03fa33321409aa15c46926a63e59ed`. Branch:
`codex/cycle24-ci-artifact-review`. Only the Main-owned C15 host, one new
behavioral regression and these two sanitized review documents change.
All original tests, source/hash pins, protected files and workflows stay exact.

All four investigated jobs failed the same source-composition assertion. Their
original application reports each contain **337 PASS / 1 FAIL / 0 pending** across
338 unique cases. Their full-name/status maps are identical: this is 338 unique
acceptance cases observed four times, not 1352. All original workflows remain FAILED.

| Draft / exact head                              | Original failed run / job                                                                                                                   | Actual merge checkout                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| #150 `4e29d3e9113c34999929c6c5d23fdc092316e58f` | [41747600977 / 126304410796](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41747600977/job/126304410796) | `d929a9d422d770c70da983f37eb4752743716ae1` |
| #152 `43152c32a2e0509992affd36f467efd9b42d29ca` | [41747643290 / 126304555142](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41747643290/job/126304555142) | `aeb06ecff148f15187b4ef5a29a49bb77eaf2251` |

| #158 `db43479f5e277bb6b64fd74a0ac9d846cbfe15da` | [41747751829 / 126304917857](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41747751829/job/126304917857) | `08736464662d1786ca0d2a924307ec865a38510f` |
| #159 `891eba98758ce18434a4fdbd981acdc55ae020bc` | [41747772612 / 126304984105](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41747772612/job/126304984105) | `402f24e70c6d61eb952651c261a013b5e552cff8` |

The first two were first attempts on Ubuntu24.04.5 / Node24.22.1 / Vitest5.0.5 with two
application workers. Installation, strict types, feature checks and the exact C21
source checker passed. The application failure skipped collection, build and
browser execution. No browser, midnight, timeout or native-engine failure is
demonstrated in these two jobs. The prior Foundation browser correction is separate.

## Demonstrated source condition

The immutable `tests/cycle21-independent-integration-review.test.ts:725` case,
**reviewed composition retains the original host pending owner and future restart
review boundary**, expects this contiguous older host expression:

```ts
corrections ? prepareCorrectionPreviewSources : undefined;
```

The original #150/#152 feature heads still contain it. Their actual PR merge checkouts instead include
the approved C22 host from exact `b517d588745007a9e519506d1a4417ddd62e3757`:

```ts
requirements || corrections ? prepareCorrectionPreviewSources : undefined;
```

Both executed test files were fetched at the actual checkout commits and match
the original C21 hash. Both executed hosts match the exact C22 base bytes. A
head-only inspection would miss this condition. Later run-API pull association
metadata does not supersede the full executed checkout recorded in the job log.

The additional #158/#159 artifacts were inspected independently before comparison.
Both prove the same single assertion failure over C23 base
`d47e8f92c024c68797ac0805ab0c8d71111d531f`; their feature heads already inherit
the approved requirements condition. All four artifact status maps agree.

On unchanged exact7b8, a local run selected only this existing case and reproduced
the same failure. The other40 cases in that file were filtered out, not accepted
again. The four original337-case passing sets were not rerun.

## Bounded compatible host correction

After diagnosis, Main explicitly coordinated a real equivalent host composition:

```ts
const prep = corrections ? prepareCorrectionPreviewSources : undefined;
// Existing guarded prop:
requirements || corrections
  ? (prep ?? prepareCorrectionPreviewSources)
  : undefined;
```

The correction-selected value is actually used. It is not an unused legacy comment
or a bypass of the original test. OFF/OFF still passes `undefined`; the other three
Boolean combinations pass the same original preparer function. No extra preparer
call, repository, environment, custody, fallback engine or operational authority is
introduced. The original downstream host still owns preparation and UNKNOWN holds.
Removing only the new constant and fallback restores every other host byte exactly.

Five new independent regressions render the real host and observe its original
downstream boundary. They cover native defaults and all four flag combinations,
exact factory identity, default C22/correction panels, selector disabling and zero
source-preparer/network invocation during presentation. The test controls only the
two Boolean state values; it does not simulate downstream business custody.

All5 new cases pass. Four unchanged retained cases pass: the exact failed C21 case,
the C22 admitted-source/original-writer review and both C23 composition/default-host
cases. Other137 cases in those files were filtered, not rerun or reclassified.
Strict types, scoped ESLint and exact C22/C23 source checkers pass. All498 prior
author files,128 protected sources and five locks/13bindings remain exact. Final
four-file formatting is verified before the normal commit.

## Evidence and remaining CI

The JSON companion records exact artifact IDs/digests, source hashes, checkout
identities, the RED reproduction and final selected results. The original ZIP
digests match GitHub. Raw ZIPs, application JSON, decoded logs and metadata stay
only under `/private/tmp/cycle24-ci`; raw logs and signed download URLs are not in Git.

The complete all-event REST snapshot for exact Main155 `7b8d8c1` returned34 of34
runs:24 PR-triggered and10 push-triggered, all QUEUED. The earlier wrapper returned
only PR-triggered runs. No queued result is green; later automatic exact-head
results require fresh observation. Main coordinates normal forward admission to
current parent drafts. No manual rerun, cancellation, push, merge or deployment was
performed by this review, and original failed SHAs/runs remain historical failures.

No original30+6+negative browser baseline, offline recovery or database baseline was
repeated. Device readiness/recovery and every hosted, financial, dispatch, message,
provider and production gate remain unchanged. Release1.0 **NOT READY / NOT AUTHORIZED**.
No persistent background execution is installed.
