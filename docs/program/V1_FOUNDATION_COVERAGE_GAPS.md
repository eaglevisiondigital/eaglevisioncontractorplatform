# Exact Foundation coverage matrix — proposed CI evidence only

Exact source: `2d93b629d746f530ed1e3268631ca72d1651e85f`; tree `44975d5807df4c0062201310481d770fcf8a0618`. All referenced PRs remain draft/open. No assertion, budget, worker, retry, source pin or orchestration change is made by this proposal. No suite was executed by this audit.

| PR  | Exact head                                 | PASS | FAIL | CANCELLED | PENDING |
| --- | ------------------------------------------ | ---: | ---: | --------: | ------: |
| 296 | `439a0901dcc15c76022647b59bb34eabfe6adb02` |    6 |    0 |         2 |       0 |
| 297 | `2c0447d5d47bb6b6258f3481de494704de409b83` |    7 |    0 |         2 |       0 |
| 298 | `f387c937b0d7d60f10549acab3884fc1b98975ac` |    6 |    0 |         2 |       0 |
| 299 | `2d93b629d746f530ed1e3268631ca72d1651e85f` |   26 |    0 |         2 |       0 |

All eight Foundation verify jobs have an explicit provider limit45m0s cancellation. All eight sibling PostgreSQL17 jobs passed separately. No complete Foundation unit summary exists. Original verify artifact uploads found no matching files; run artifacts are the PostgreSQL sibling previews only.

| Original requirement        | Exact command / selected files                                                                                                                                           | Evidence and gap                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check prefix                | `npm run lint`, `typecheck`, `types:check`, `migrations:check`, `property:check`, `customer:check`, `customer:requests:check`, `customer:broker:check`, `features:check` | Completed before the chained unit command in both299events; repository formatting also passed.                                                                                                                                                |
| Full default units          | `npm test` → `vitest run`; literal `tests/**/*.test.ts`;406 Git-tracked files                                                                                            | Unfinished. Original defaults:4workers,30s tests/hooks. Dedicated573 covers22files at1worker; nativePG17 covers23files/661cases per event with native-only flags.361files are outside those two verified scopes, not “never tested anywhere.” |
| Python recovery after units | `npm run test:recovery` → `python -B -m unittest discover -s recovery/monterey -p test_*.py`                                                                             | NOT_REACHED;5exact test files are listed below and in JSON. Owner/offline/physical evidence is a different scope.                                                                                                                             |
| Build inside check          | `npm run build` → `tsc --noEmit && vite build`                                                                                                                           | NOT_REACHED in Foundation. Exact299dedicated/local builds passed separately; those do not turn the original check chain into PASS.                                                                                                            |
| Staging plan                | `npm run staging:plan` → `node scripts/staging-readiness.mts plan`                                                                                                       | SKIPPED/NOT_REACHED. This is CI planning only, never hosted-action authority.                                                                                                                                                                 |
| Default browser install     | `npx playwright install --with-deps chromium`                                                                                                                            | SKIPPED/NOT_REACHED. Reviewed dedicated responsive dependency installation is separate evidence.                                                                                                                                              |
| Full default browsers       | `npm run test:browser` → `npm run build && playwright test`                                                                                                              | SKIPPED/NOT_REACHED.32specfiles;6projects give96static file-project candidates before internal test conditions. Actual case collection is unknown.                                                                                            |
| Verify artifact upload      | Original `phase3-synthetic-previews` paths                                                                                                                               | Ran but found no matching files. NativePG sibling artifacts contain18PNG each and no unit JSON.                                                                                                                                               |

The original workflow did not configure Vitest case JSON. The uncovered original obligation is a terminal complete unit run; a complete case/phase/resource artifact would be a separately reviewed diagnostic improvement, not a claim that an existing configured artifact was lost.

## Exact299 partial unit observations

| Event / run / verify job                | Passing file summaries | Failed file summaries | Skipped file summaries | Files without terminal summary |
| --------------------------------------- | ---------------------: | --------------------: | ---------------------: | -----------------------------: |
| push /42346248137 /128324513209         |                    125 |                     1 |                      5 |                            275 |
| pull_request /42346252375 /128324526615 |                    133 |                     0 |                      5 |                            268 |

A missing summary does not prove a file never started. A passing file can include declared skips. Both logs show the separate C23independent50-test file passing; original historical I10 remains preserved. Push C18independent58 reports1failed finance lease-drift case label (30258ms); PR C18reports58passing. Neither queue provides a final error stack or complete unit collection, so cause remains UNKNOWN.

Five completely skipped default-mode file summaries are native-only database cohorts: `tests/database/maintenance-authority.test.ts`, `tests/database/maintenance-service.test.ts`, `tests/database/repair-persistence.test.ts`, `tests/database/maintenance-persistence.test.ts`, and `tests/database/customer-broker.test.ts`. Their nativePG17 sibling mode is separately successful; default Foundation mode is not nativePG mode.

## Browser budgets and environments remain different

| Scope                       |                                      Test budget | Workers/retries                                                                          | Environment                                                                                                |
| --------------------------- | -----------------------------------------------: | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Original default Foundation | Pinned Playwright default30s; no config override | Workers default50%of runtime capacity; retries0; actual runtime configuration unobserved | 32specs in `tests/browser`; ordinary production preview4173 plus flagged DEV journey server4206;6projects. |
| Dedicated C28native9        |                                             150s | 1/0                                                                                      | Flagged DEV server4428;3responsive projects.                                                               |
| Dedicated C28OFF3           |                                             150s | 1/0                                                                                      | Production preview4438.                                                                                    |
| Dedicated dashboard9        |                                              90s | 1/0                                                                                      | Flagged DEV server4221.                                                                                    |
| Dedicated dashboardOFF6     |                                              90s | 1/0                                                                                      | Production preview4351; original C17OFF plus dashboardOFF.                                                 |

Only the C28spec file overlaps the default32-spec inventory. The dashboard specs live outside the default test directory. Scoped27case success cannot replace the original default browser obligation.

## Exact Python recovery file obligations

- `recovery/monterey/test_device_facts.py`
- `recovery/monterey/test_p1_recovery.py`
- `recovery/monterey/test_rehearsal.py`
- `recovery/monterey/test_rehearsal_setup.py`
- `recovery/monterey/test_secure_recovery.py`

## Retained270-case classification

Same frozen subject `39b5b1977f2e18c1c7d534667260ce5ed05660f3`, tree `0299e68550f0b86032a656ab26e4a6d40b70769e`; same270native identities,9whole files,4workers,30s tests/hooks,retry0 and unchanged before/final source bindings. Push42175850111:270PASS,459.131s. PR42175879610:249PASS/21FAIL,830.116s;18explicit30000ms deadlines plus3dependent C18assertions.249common passes have median PR/push duration ratio1.882723. Each event has11coarse reporter/module-boundary resource samples and reports4CPUs. Reporter CPU is not worker CPU. Worker phase/event-loop/I/O/cgroup/host scheduling traces are absent. Exclusive cause remains UNKNOWN; no memory-exhaustion or environment-only/application-only conclusion follows. The9-file workload differs from full Foundation scheduling. PushPASS never repairs PRFAIL, and current scoped successes never relabel that history.

| Retained270 event | Run / artifact           | Provider ZIP SHA256                                                |
| ----------------- | ------------------------ | ------------------------------------------------------------------ |
| push              | 42175850111 /13483771154 | `fce6e5a118f46def56fdb28f20b52e625ab1b46a4409f5c10bc2ffa86b024db0` |
| pr                | 42175879610 /13483293762 | `f6692368bd66118ec32b1b5a9e1d0d1cbe80c3c37276c415e311f8ba49619c6e` |

## Verified current299 artifact source references

Every current dedicated artifact binds2139tracked source hashes before/final; both events separately verify573unique native cases and27browser cases. PR checkout carrier `9fb683db9e3bbdb88f5b71e54030e3d151f624e1` has exact tree44975d5 and parents293/candidate. These remain scoped CI evidence only.

| Event / artifact | Run / artifact ID        | Checked-out source                         | Provider ZIP SHA256                                                |
| ---------------- | ------------------------ | ------------------------------------------ | ------------------------------------------------------------------ |
| push-native      | 42346248179 /13564355502 | `2d93b629d746f530ed1e3268631ca72d1651e85f` | `55a3a07aee5fea4f50139fd4c45ef5a58115587081198426e1fb7aec1d9c30f5` |
| pr-native        | 42346252388 /13564023135 | `9fb683db9e3bbdb88f5b71e54030e3d151f624e1` | `23ab5c87e2a5e4bd6f2b4685d67f227982904be710cfb3b80ba920a4a8bbe1e0` |
| pr-responsive    | 42346252388 /13563972074 | `9fb683db9e3bbdb88f5b71e54030e3d151f624e1` | `17747fa7eca521d005b79c3f7d2e506fa1333ccd030df4a6b2d78a8dcca09c68` |
| push-responsive  | 42346248179 /13564515970 | `2d93b629d746f530ed1e3268631ca72d1651e85f` | `bbf4d9cc4a2b1bf2660b0fa08d42a543cb46a5fdb625404cad026d269eaff40a` |

The companion `V1_FOUNDATION_COVERAGE_GAPS.json` contains all406exact unit paths/SHA256s,22bounded files,23nativePG files,361outside-scope paths,32default-browser paths,5recovery paths, per-event observed/no-summary states, every Foundation job/log/annotation digest and all artifact/report source hashes.

No full Foundation, operational or release acceptance is granted. D1all11roles remain UNASSIGNED; D2/D3 remain separate; A01–A12 NOT_RUN. Duplicate recovery stays UNKNOWN/UNVERIFIED with both private folders untouched. No recovery, credential, Auth, financial, provider, communication, dispatch, hosted, deployment or merge action. Release1.0 NOT READY / NOT AUTHORIZED.
