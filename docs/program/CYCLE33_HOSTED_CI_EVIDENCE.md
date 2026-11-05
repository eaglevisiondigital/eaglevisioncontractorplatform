# Cycle 33 hosted CI evidence — draft PR #247

## Exact source and final observed status

Read-only observation at **2026-11-05 06:15:31 UTC**: draft PR #247 remains OPEN at `8d902e866c79220fa3ddb0bc2794d31cdbfd60f1`, with **19 successful, 15 failed, 2 cancelled and 0 pending check jobs**. No checks were manually rerun. This is the CI-only supplement candidate; these outcomes do not establish acceptance of later Cycle 33 product composition or documentation commits.

- Direct push capture: `8d902e866c79220fa3ddb0bc2794d31cdbfd60f1`.
- Actual PR checkout/capture: merge carrier `e1127010daa566e78e8c5c11f9a5e8f1d71433d9`, with parents `0597bb3330f22d69f68a67098e950693e0648172` and the direct head.
- Both complete Git trees independently verified equal: `8cfe051a45ee70dfe3046e5ddbb09133a9d57a46`. Equal tree contents do not make the two capture commits identical.

| Workflow/event                   | Run         | Actual result                                                                                        |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Native runtime supplement / push | 41966910309 | FAILED: application shards 1, 3 and 6; browser collection shards 1–3; strict combined gate failed    |
| Native runtime supplement / PR   | 41966956981 | FAILED: application shards 1, 3, 4 and 6; browser collection shards 1–3; strict combined gate failed |
| Original Foundation / push       | 41966910208 | CANCELLED during `npm run check`; separate `postgres17` job SUCCESS                                  |
| Original Foundation / PR         | 41966956974 | CANCELLED during `npm run check`; separate `postgres17` job SUCCESS                                  |

Both original Foundation check annotations explicitly state **“The job has exceeded the maximum execution time of 45m0s”**. Their logs end with cancellation during Vitest; neither supplies a completed application aggregate or original browser acceptance. Their cancellations remain cancellations. Successful jobs and their artifacts remain retained.

## Complete application collection, failing execution

Each event independently covers all **356 planned application files exactly once** and **10,338 unique native file/case IDs**, with equal complete application and 32-browser-file hash inventories across its eight plans. Every collected case has a terminal native result; retry and repeat counts are zero. The original default 30-second application test and hook budgets, existing case-specific budgets and maximum four workers were retained.

| Event       | Passed | Failed | Declared skipped |  Total |
| ----------- | -----: | -----: | ---------------: | -----: |
| Direct push |  9,999 |     18 |              321 | 10,338 |
| PR carrier  | 10,011 |      6 |              321 | 10,338 |

The 321 pending entries in each Vitest JSON report correspond exactly to native collection `mode=skip` and final `status=skipped`; they are not missing shard files or new PostgreSQL acceptance. The separate original Foundation `postgres17` success does not turn those skips into executed cases. Successful subsets from different events must not be combined into a passing run.

| Application shard | Push passed / failed / skipped | PR passed / failed / skipped |
| ----------------- | ------------------------------ | ---------------------------- |
| 1                 | 1,212 / 4 / 33                 | 1,215 / 1 / 33               |
| 2                 | 1,333 / 0 / 82                 | 1,333 / 0 / 82               |
| 3                 | 1,115 / 12 / 99                | 1,125 / 2 / 99               |
| 4                 | 1,196 / 0 / 5                  | 1,195 / 1 / 5                |
| 5                 | 1,341 / 0 / 2                  | 1,341 / 0 / 2                |
| 6                 | 1,275 / 2 / 0                  | 1,275 / 2 / 0                |
| 7                 | 1,083 / 0 / 77                 | 1,083 / 0 / 77               |
| 8                 | 1,444 / 0 / 23                 | 1,444 / 0 / 23               |

### Exact failed labels and classification

The reporter records **15 explicit 30,000 ms test deadlines and three assertion failures** in the push event, and **six explicit 30,000 ms test deadlines** in the PR event. There are 19 distinct failed file/title pairs across both events, five shared. Reported wall-clock durations can exceed the configured deadline; no budget was increased.

| File under `tests/`                              | Exact title / brand expansion                                                                                                                                                          | Event(s) | Classification                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `cycle31-owner-navigation-runtime.test.ts`       | `brand 1 continuation retains fresh original guards and exact one-use callback without repeating its immediate child navigation check`                                                 | Both     | Explicit 30,000 ms deadline                                                            |
| `cycle18-independent-integration-review.test.ts` | `finance: invoked callback lease drift is UNKNOWN across fresh same-canonical wrappers without replay`                                                                                 | Both     | Explicit 30,000 ms deadline                                                            |
| `cycle18-independent-integration-review.test.ts` | `finance: invoked source admission drift is UNKNOWN across fresh same-canonical wrappers without replay`                                                                               | Both     | Explicit 30,000 ms deadline                                                            |
| `cycle23-service-source-review.test.ts`          | `brand 2 publication appends a version without rewriting the original report or changing its job`                                                                                      | Both     | Explicit 30,000 ms deadline                                                            |
| `cycle25-owner-action-continuity.test.ts`        | `Cycle25 original owner action refresh continuity brand 2 exact unchanged selection survives refresh as presentation requiring fresh verification`                                     | Both     | Explicit 30,000 ms deadline                                                            |
| `cycle29-service-continuity.test.ts`             | `brand 0: closed intake review retains exact published history without completing work or renewing its one-use action`                                                                 | Push     | Explicit 30,000 ms deadline                                                            |
| `cycle29-service-continuity.test.ts`             | `brand 0: lost intake ACK permits only exact current-authorized report reads and never clears original UNKNOWN`                                                                        | Push     | Explicit 30,000 ms deadline                                                            |
| `cycle31-owner-navigation-runtime.test.ts`       | `brand 0 continuation retains fresh original guards and exact one-use callback without repeating its immediate child navigation check`                                                 | Push     | Explicit 30,000 ms deadline                                                            |
| `cycle18-independent-integration-review.test.ts` | `brand 0: five-package source evidence binds one exact canonical daily environment`; same exact title for brands 1 and 2                                                               | Push     | Three explicit 30,000 ms deadlines                                                     |
| `cycle18-independent-integration-review.test.ts` | `brand 0: retained daily sources continue through every review and exact Next without reset`; same exact title for brands 1 and 2                                                      | Push     | Three `AssertionError: expected undefined to be defined` failures at original line 389 |
| `cycle18-independent-integration-review.test.ts` | `finance: competing fresh views of the same canonical job dispatch at most one callback`                                                                                               | Push     | Explicit 30,000 ms deadline                                                            |
| `cycle24-independent-integration-review.test.ts` | `Cycle24 independent exact native action integration brand 0 native correction and material review remain the original cost and priority sources`; same exact title for brands 1 and 2 | Push     | Three explicit 30,000 ms deadlines                                                     |
| `cycle28-request-provenance.test.ts`             | `brand 2: a real same-property sibling job report cannot substitute for the original issued-job report`                                                                                | PR       | Explicit 30,000 ms deadline                                                            |

The three Cycle 18 assertion failures are dependent fixture failures: each original `retained` variable is assigned only after awaited `prepareDailyReviewSources` completes in the preceding case, which timed out. The subsequent `expect(retained).toBeDefined()` fails in approximately 0.6–2.2 ms. This establishes the dependency, not an independent application defect or the cause of the preceding deadlines.

The 372 resource samples per event observe four CPUs; one-minute load ranges 0.64–6.22 (push) and 0.43–6.50 (PR), free memory approximately 12.73–14.46 GiB and 12.47–14.33 GiB, respectively. Aggregate sampled resident memory peaks approximately 2.98 GiB and 2.76 GiB. These observations do not establish resource contention, memory exhaustion or any exclusive timeout cause.

## Six browser collection failures, no original assertions executed

All three browser jobs in both events completed installation/build and Chromium dependency setup, then failed in `node scripts/cycle33-foundation-evidence.mjs plan browser N`. The stack is the generic `native()` rejection at line 79, reached from the first full-list child at `plan()` line 492:

```text
node node_modules/@playwright/test/cli.js test --list --reporter=json
```

The helper did not retain that child's stdout/stderr, so the actual child error is unavailable. No browser plan/results artifact was created; uploads report no matching files. The 399-case browser union was not executed or accepted. Neither network slowness nor product failure is proven.

One source-supported hypothesis is a missing existing Git-history precondition: the new browser checkout is shallow, an original browser file invokes the Git-bound source inspector at import, and original monolithic Foundation first ran Vitest's existing Git-history global setup. A controlled reproducer/child-error capture remains pending. No history repair, source admission relaxation or corrected-browser PASS is claimed here.

## Retained evidence and limits

All 16 application ZIPs were verified against provider SHA-256 digests and declared lengths before extraction. Individual extracted file hashes, original reports, plans, native observations, failure messages and source bindings remain in private staging. The compact independent application analysis has SHA-256 `0e975f98d62a44fb970648df017fd187a6da1b92457c1eed1de8b825923ac6cf`.

| Application ZIP | Direct-push provider digest                                        | PR-carrier provider digest                                         |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1               | `22236b6f4bb0e074575e51a834c8ca72a910832789cc505ffa6c8d2f884c7f13` | `65ed01f8a428d9a9b65f0b60bbec2974f535a9a0c1631088be61d147703dd570` |
| 2               | `18655774b3555f8375c43dca464f10efe97768a155f629e5d602f167f3b5617d` | `1c685f1ea7ee17808eedfd45802a6a441e1ddd2702afc4984e503d17a2fe5aa7` |
| 3               | `46b13dcd5062814bcb5507c877014bd5867b5cb42310a3a327a8682b213f610b` | `13c5a7b1f16e3aac1a6b2ed011be75aedb71cac033e6659145aa24e9eaa05735` |
| 4               | `d8a7438f932a7b837a40364688a3cfda8e7eb31fe6f73e09b44709bb65c5d81f` | `3d5ef142d0d47571997e51badf9392a7738833ff8c17d1452929dfc09b59ea7d` |
| 5               | `0fd38b33accaa648b07dc6808999251f155635b7c6092768a1e16b1f156f9747` | `be853f30fa4e3ecf3e10f3dd8ef7888cd1bf1e71f57d17f45d9d35ca8aeeb41f` |
| 6               | `4bf4709b7ac626f771f56a7151f07b01790d1ff9ead508bf75e0a17d161e5ae2` | `f859a7804d195400f847095b153261e25d807d30e5c54774627ebe2436536ef5` |
| 7               | `f148959f06f1c4f3b94febc6d2fd476d6e9aa014e6098ce7b74405e4aae009c5` | `dc76755dec06bf97053e25cd7ada6b8e2d10aba1e9402da14843aef8facaa833` |
| 8               | `4ee29ee75cf7bc3ca6043a72fefaf28b5205100f4c9668571db321bf07950f57` | `35fddb33dae8fd0538b126be5d4f7120f37fb4d151da5f19c2791dc3f2d5b0b8` |

Original Foundation push/PR annotation report SHA-256 digests are `993a9d23955e6685a676ca1e37db6586d3f11509c282f326a9258b85d57c27c3` and `a7a6ecbdabe6900c2c81f4f1e75a74acafb03aadb4ad5a069b4c5f069e8bb0f3`. Their original verify-log digests are `f9f28eb3e32b38138c679513a5f8da465db29063804601d1a4a03ce0cd1d967c` and `7f9c86f6b2618ee8491f8535e4369b1c63780a191fa4e6d0155deabadd11773c`.

The complete eleven-shard supplement remains **FAILED / NOT ACCEPTED**. No assertions, original configurations, source bytes, test budgets or historical failures were changed in this observation. No successful check was restarted. Existing recovery, P1, customer14/4B, MFA/Auth, NMI, financial, design, migration and production restrictions remain intact. No merge, deployment, hosted mutation, dispatch, payment or customer communication occurred. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
