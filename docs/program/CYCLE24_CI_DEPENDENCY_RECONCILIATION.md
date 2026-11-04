# Cycle24 remaining C22 dependency CI evidence

Read-only review of exactly five historical runs. Published independent review
`712e07cb3be8988b092aba9fad80d32b4662435b` and Main runtime7a remain untouched.

The three focused JSON artifacts each report338cases:337PASS,1FAIL,0pending.
Their complete name/status maps are identical:338unique cases, not1014. The only
failure is the immutable C21 independent host pending-owner/preparer expression
assertion at tests/cycle21-independent-integration-review.test.ts:725.

| PR  | Run / job                                                                                                                    | Actual checkout                            | Result        |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------- |
| 151 | [41747627016](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41747627016/job/126304497567) | `b90c297f13288381d1547ea286a213c8f0ebd643` | 337PASS/1FAIL |
| 153 | [41747666040](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41747666040/job/126304636541) | `1455f0bb65fe611e917d9641f66d85c4716d2037` | 337PASS/1FAIL |
| 154 | [41747690710](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41747690710/job/126304718343) | `3eef5c6f7e28b8cae8216eb7bc42c60cdab91662` | 337PASS/1FAIL |

Each actual checkout merges its recorded feature head into old C22 target
`b517d588745007a9e519506d1a4417ddd62e3757`. All three heads still contain the
original preparer expression; the old merge host does not. Remote exact host and
immutable test bytes were read, not inferred. Current C22 target correction
`a453b30dbc34c2438cdb594c683920a02a307023` preserves both original expression
and required behavior. The approved next step is a normal documentation-only
dependency forward, without copying target runtime or weakening old assertions.

## Foundation cancellations and retained failures

PR151 run41747620882/job126304706959 and PR154 run41747683783/job126304702127
check out their exact push heads, not PR merge trees. Both GitHub check annotations
explicitly state: “The job has exceeded the maximum execution time of 45m0s”.
They were still running npm check → npm test when canceled. Format, lint, strict
types, source checks and feature inventory had completed. Recovery/build/staging/
Chromium installation/browser checks were not reached. Both separate PostgreSQL17
sibling jobs remain SUCCESS.

These are not clean timeouts: before cancellation, both logs report the unchanged
C18 independent file as58cases/48PASS/10FAIL. Exact failed names are:

1. brand 0: five-package source evidence binds one exact canonical daily environment (30062ms in151; 30150ms in154).
2. brand 0: retained daily sources continue through every review and exact Next without reset (5ms in151; 5ms in154).
3. brand 1: five-package source evidence binds one exact canonical daily environment (30182ms in151; 30235ms in154).
4. brand 1: retained daily sources continue through every review and exact Next without reset (1ms in151; 1ms in154).
5. brand 2: five-package source evidence binds one exact canonical daily environment (33685ms in151; 30062ms in154).
6. brand 2: retained daily sources continue through every review and exact Next without reset (1ms in151; 1ms in154).
7. finance: invoked callback lease drift is UNKNOWN across fresh same-canonical wrappers without replay (43145ms in151; 32326ms in154).
8. finance: invoked source admission drift is UNKNOWN across fresh same-canonical wrappers without replay (30478ms in151; 43114ms in154).
9. finance: known callback withdrawal before invocation preserves exact source review but invokes no host (40748ms in151; 46691ms in154).
10. finance: competing fresh views of the same canonical job dispatch at most one callback (37388ms in151; 40023ms in154).

The logs contain failed names/durations but no failure exception messages: Vitest
had not reached its final error-detail section. Seven elapsed times meet/exceed
the unchanged30s case limit; this supports a timing concern, not a definitive
timeout exception diagnosis. Three1–5ms continuation failures require a retained
fixture assigned by the preceding async brand setup; a cascade is plausible,
but the actual exception remains unrecorded. No engine or assertion cause is invented.

PR151 completed76fully passing files/3662cases; PR154 completed69/3382. The69
file set is a subset of76, so these are not145unique passing files. The common
C18 file adds48passed/10failed cases. Of269defined application files,192lack
a completed-file conclusion in both. Partial output is not full-suite acceptance.

C18 test SHA256 is `a21b987039f312f19bf103308f0fbeac26f72cc97f8a8607937b86b57d838217`;
its source, Vitest30000ms/maxWorkers4 configuration and Foundation45minute workflow
are byte-identical across both canceled heads and current7a. No tests, runtime,
workflow, timeout or assertions were changed or rerun in this investigation.

All raw logs, ZIPs, metadata and digests stay under private temporary storage.
The adjacent JSON records exact source/checkout/artifact hashes and per-run counts.
Successful25/24/22 current checks remain historical successes; failed/cancelled
Foundation/C18 coverage remains honestly OPEN. A documentation forward only creates
a new automatic exact-head context; it cannot turn prior results into PASS.

Release1.0 remains NOT READY / NOT AUTHORIZED.
