# Actual #528 / historical #520 CI evidence

This is read-only analysis of actual GitHub jobs. It does not claim whole Foundation
acceptance, a source correction or a resource cause that the logs do not establish.
The #527 hosted artifact is retained unchanged (ZIP SHA256
`5ed41f20a94d909811216d071e464e885f7dbbecf0961495b8028c745ef1f86e`).

| Exact source     | Foundation verify                                                                                                   | Native PG17                                                      | Passport                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| #528 `5bf90478…` | Run `43936212296`, job `133541360569`: cancelled during `npm run check`                                             | Job `133541361411`: 844 PASS, 1 original skip, 34 files; 77.28 s | Run `43936212133`, job `133541360287`: **PASS**, including dependencies and 12 browser cases (26.9 s)           |
| #520 `d5b2c1be…` | Run `43921819102`, job `133490790174`: cancelled during `npm run check`; original invoice setup denied / 39 skipped | Job `133490790750`: 844 PASS, 1 original skip, 34 files; 75.83 s | Run `43921819095`, job `133490789396`: historical Ubuntu mirror/priority trust failure before browser execution |

Current #528 Passport success is distinct from historical #520 mirror failure.
No mirror, signing key, source definition or trust control was changed. The other
reported #528 dedicated workflows (Cycle6, rehearsal, field/scheduling/capacity,
maintenance, technician board and Proof of Work) completed SUCCESS; none establishes
genuine business, device, source-admission or operational acceptance.

## Actual #528 progression and cancellation

All times below are UTC from the actual job log:

- `19:12:18.035`: `npm run check` starts.
- `19:13:43.956`: `npm test` starts; Vitest RUN at `19:13:44.272`.
- `19:56:22.164`: a test file still completes successfully.
- `19:56:25.912`: job cancellation, about 3.75 seconds later.

The log contains 89 completed file-result lines before cancellation. Recovery,
build, staging and browser stages after `npm test` were not reached. The runner
then terminated `npm run check`, `npm test`, shells and Node MainThread processes.
It did not provide CPU/I/O or blocked-child telemetry. Continuing completions rule
out treating this as an observed total stall; they do not rule out one blocked
worker or identify a Git/subprocess/resource cause.

Observed long completed suites include:

| Suite                                    | Cases | Recorded duration |
| ---------------------------------------- | ----: | ----------------: |
| `cycle17-addon-task-desk`                |   108 |        705,891 ms |
| `cycle18-service-update-review`          |    55 |        491,248 ms |
| `cycle23-independent-integration-review` |    50 |        482,722 ms |

The current evidence shows active application-test work consuming the unchanged
45-minute job budget. No budget, per-case timeout, worker count or assertion was
changed. No redundant full-suite local rerun was started solely to repeat that fact.

## Eight visible failed cases on #528

The cancellation prevented the final consolidated failure stacks. Seven failures
are recorded at or above the existing 30,000 ms case budget; one is recorded at
10 ms. Duration alone is not used to invent an unavailable underlying error reason.

| Source suite                       | Exact case identity                                                                                    |  Duration |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ | --------: |
| C24 independent integration review | brand 0 native correction and material review remain the original cost and priority sources            | 30,283 ms |
| C24 independent integration review | brand 1 native correction and material review remain the original cost and priority sources            | 30,497 ms |
| C24 independent integration review | brand 2 native correction and material review remain the original cost and priority sources            | 30,016 ms |
| C18 independent integration review | brand 2: five-package source evidence binds one exact canonical daily environment                      | 31,372 ms |
| C18 independent integration review | brand 2: retained daily sources continue through every review and exact Next without reset             |     10 ms |
| C18 independent integration review | finance: invoked callback lease drift is UNKNOWN across fresh same-canonical wrappers without replay   | 35,052 ms |
| C18 independent integration review | finance: invoked source admission drift is UNKNOWN across fresh same-canonical wrappers without replay | 34,788 ms |
| C18 independent integration review | finance: competing fresh views of the same canonical job dispatch at most one callback                 | 30,258 ms |

## Original #520 and controlled #527 ordering

Original #520 starts `npm run check` at `17:47:05.680`, Vitest at `17:48:07.701`.
Its invoice fixture setup denies at `18:23:20.825` (39 skipped, 200 ms). Other files
continue completing through `18:31:22.898`; cancellation follows at `18:31:24.952`.
There is no C27 completion-summary line before that invoice result. The original
first denying condition and exact inter-worker ordering remain **UNVERIFIED**.

The separate controlled #527 run `43934625512` uses fixed runtime #520/tree
`656a079b…`, while its workflow source is separately recorded as `e73db994…`.
It observes umask 0022, exact 2,501 bodies/types/modes and all twelve named/nine
literal Git objects. Clean qualification PASS becomes DENY after the two original
C27 cases pass (18 filtered). The only new source entries are the empty
`artifacts` and `artifacts/cycle27` directories; the original 39-case gate then
fails setup at 106 ms and keeps its nonzero exit. This proves the controlled
interference mechanism, not the original full #520 first cause.

The proposed C27 setup corrects that demonstrated output placement only. Current
fixture-source pinning still denies the changed test body until separately reviewed
admission, and the long-running/full-suite failures remain independent unresolved
evidence. **Release 1.0 remains NO-GO.**
