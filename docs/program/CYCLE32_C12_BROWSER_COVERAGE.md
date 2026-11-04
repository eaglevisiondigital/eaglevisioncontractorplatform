# Cycle 32 · frozen Cycle 12 missing browser coverage

This CI-only supplement targets exact original application source
`43e622b16aa952f5dc2fe7ae9f96260b47682c2e`. The original Cycle12 run
[41898727938](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41898727938)
remains **CANCELLED at its 15-minute job deadline during Chromium dependencies**.
Its actual **481 application cases passed** and are not rerun by this workflow.
Its 48 native browser cases and three production-OFF cases never executed. They
remain **51 NOT RUN** until actual new reports demonstrate otherwise; collection
or parser-fixture success is not browser success.

The audit observed the same nine-font installation and approximately 21.1 MB of
packages before cancellation. No specific failing APT feed or mirror defect was
established for this run. This package does not claim to repair a mirror or rerun
successful application assertions. Original Foundation's `tests/browser` directory
does not cover these `tests/program` specifications.

## Bounded workflow and original source

New `.github/workflows/cycle32-c12-browser-coverage.yml` runs only on normal pushes
to `codex/cycle32-c12-browser-coverage` affecting its five new files. It does not
manually restart a successful check. `cancel-in-progress` and `fail-fast` are false.
There are four independent **15-minute** jobs on Ubuntu24.04 / Node24.22.2:

| Shard   | Exact original collection | Original test budget | Execution                               |
| ------- | ------------------------- | -------------------- | --------------------------------------- |
| desktop | 16 native cases           | 90 seconds           | Original native config, desktop project |
| tablet  | 16 native cases           | 90 seconds           | Original native config, tablet project  |
| mobile  | 16 native cases           | 90 seconds           | Original native config, mobile project  |
| off     | 3 production-OFF cases    | 30 seconds           | Original OFF config, all three projects |

All use original two-worker execution, zero retries and one attempt. Original test
files/configurations, assertions, source and timeouts remain unchanged. Only OFF
needs the original production build. The original configs start their own isolated
loopback servers; no live customer, provider, dispatch or hosted route is enabled.

Two checkouts separate current evidence tooling from frozen application source.
Before execution, the evidence script requires exact original HEAD/tree, clean
tracked application bytes, original hashes for all six specifications, two
configs, original browser helper, package/lock and reviewed signed-Ubuntu dependency
helper. Node and Ubuntu versions are checked. After execution, the same binding
must still match. The current diagnostics commit is separately recorded.

The original signed-Ubuntu helper installs only its nine reviewed fonts. Full
pinned Playwright dependency dry-run output is retained before installing pinned
Chromium; explicit `pipefail` preserves any dry-run failure through the log tee. This dry run records the dependency command; it is not an assertion that
every package was installed, nor a broad `--with-deps` APT repair. The unchanged
helper rejects unknown sources/mirrors/signatures and never edits trust or source
configuration. A future installation failure or 15-minute cancellation remains
failed/incomplete evidence, not product test failure or PASS.

## Strict collection and actual-result acceptance

`scripts/cycle32-c12-browser-evidence.json` records all 51 original IDs, file/line,
title, project and timeout values from actual `--list` collection at the frozen
source. `cycle32-c12-browser-evidence.mjs` separately validates collection-only
reports and executed reports. It rejects missing, additional, duplicate or foreign
cases; changed identity/project/budget/config; extra attempts/retries; skips,
flaky/unexpected outcomes; global/result errors; and incomplete totals. Actual
passing evidence requires every original assertion to pass once, within its
original reported budget, on its exact original source.

Each job always uploads the available source binding, collection, raw result,
validation, original screenshots/click records, dependency dry run and test failure
output as `cycle32-c12-{desktop,tablet,mobile,off}`. Missing files remain missing.
No collector manufactures a success report when a job does not finish.

The exported four-shard validator accepts a 51-case union only from **all four
actual passing reports**, matching before/after source bindings and one diagnostics
commit. Download each artifact to its corresponding shard directory, then inspect
and validate without rerunning any browser assertion:

```sh
node scripts/cycle32-c12-browser-evidence.mjs combine /absolute/path/to/downloaded-shards
```

That directory must contain `desktop/`, `tablet/`, `mobile/` and `off/`, each with
its original `source-binding-before.json`, `source-binding-after.json`,
`collection.json` and `results.json`. A successful combined result explicitly says
`foundation_pass: false`. No subset, local pass, queued job, timeout or cancellation
closes the complete union or relabels the original cancelled workflow.

## Local implementation checks only

The four original collection commands were run with `--list` only; actual IDs and
counts match 16/16/16/3 and the validator labels every result `all_pass: false`.
No original application or browser assertion executed. Forty-five new parser
cases pass using explicit synthetic report fixtures, including missing/duplicate/
foreign-project/budget/retry/skip/error/binding/combined-shard denials. Those fixture
reports are parser tests, not actual browser acceptance. The initial 43-case
parser run passed; adding two stricter project-ID/completion cases initially failed
because their new fixture mutators were not wired. Correcting those two fixture
mutators produced the actual 45-case pass; neither result is browser evidence. Script syntax, focused
ESLint, strict TypeScript and formatting pass. No claim of hosted success is made
before the four actual GitHub reports exist.

This supplement covers only the original frozen source. Current Cycle32 product
changes require their separate source-bound integration. Original C18 failures,
Foundation cancellations, original C27 9327 PASS /321 declared SKIP and later
source-specific supplementary evidence remain separate. No recovery software or
physical test is run or rebuilt. All protected artifacts, approved designs,
P1/customer14/4B, Auth/MFA, NMI, financial, hosted, dispatch, communication,
deployment and merge restrictions remain intact.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.
