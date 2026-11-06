# Exact Cycle 33 hosted closeout evidence

Observed 2026-11-06T03:40:25.787113+00:00. Main #253 exact `04f15d45438a56cd86421db2b49d0aa97c22b07e`: 43 PASS / 9 FAIL / 2 CANCELLED / 0 pending. Advanced #251 exact `77142705583774a5bfaa46ccb14aaa201421d295`: 23 PASS / 0 FAIL / 2 CANCELLED / 0 pending.

Main push captured `04f15d45438a56cd86421db2b49d0aa97c22b07e`; PR captured `7b38b98d6f572aca0812fa82df87eba455c15b6a`. Both actual captured trees equal `c693031c7904e72d2f18e788e768241036084247`. Current direct-head action/check listings and carrier check listings were paginated completely; no reruns occurred.

## Nine Main failed check jobs

| Event        | Run         | Job          | Check                    | Explicit 30s deadlines | Error-message assertions | Dependent C18 assertions |
| ------------ | ----------- | ------------ | ------------------------ | ---------------------: | -----------------------: | -----------------------: |
| push         | 42018576547 | 127219551197 | application (1)          |                      1 |                        1 |                        0 |
| push         | 42018576547 | 127219551202 | application (3)          |                      0 |                        3 |                        0 |
| push         | 42018576547 | 127219551373 | application (2)          |                      8 |                        0 |                        3 |
| push         | 42018576547 | 127237672768 | complete-native-coverage |                      0 |                        0 |                        0 |
| pull_request | 42018584559 | 127232213470 | application (7)          |                      1 |                        0 |                        0 |
| pull_request | 42018584559 | 127232213777 | application (3)          |                      6 |                        3 |                        0 |
| pull_request | 42018584559 | 127232213791 | application (2)          |                      5 |                        0 |                        2 |
| pull_request | 42018584559 | 127232213852 | application (1)          |                      2 |                        1 |                        0 |
| pull_request | 42018584559 | 127245377825 | complete-native-coverage |                      0 |                        0 |                        0 |

Both strict aggregate jobs fail at `requireJobs` because required application jobs failed; these are not extra native test cases. Both original Foundation cancellations explicitly exceeded the existing 45-minute job ceiling.

Each application event covers **362 unique files / 10,525 unique cases**, including **321 declared skips**. Push: **10,188 PASS / 16 FAIL / 321 skipped** (9 explicit timeouts, 4 message-contract assertions, 3 dependent C18 assertions). PR: **10,184 PASS / 20 FAIL / 321 skipped** (14 explicit timeouts, 4 message-contract assertions, 2 dependent C18 assertions). Original global maximum four workers and native budgets remain unchanged. No exclusive resource or product cause is inferred for the deadlines.

## Four nondependent error-message contracts

- `tests/cycle27-source-lineage.test.ts:212` — `warm immutable Git facts never cache mutable files or source admission`. Expected substring `fixed Cycle27`; actual hosted error `Current source differs from fixed Cycle33 author`.
- `tests/cycle30-independent-source-review.test.ts:63` — `unchanged owner baseline cannot be labelled as the reviewed correction`. Expected substring `fixed Cycle30`; actual hosted error `Exact Cycle33 parent source required`.
- `tests/cycle30-independent-source-review.test.ts:73` — `direct owner admission rejects changed current bytes after warming immutable evidence`. Expected substring `fixed Cycle30`; actual hosted error `Exact Cycle33 parent source required`.
- `tests/cycle30-independent-source-review.test.ts:123` — `customer-source admission cannot widen a reviewed route to unknown current bytes`. Expected substring `fixed Cycle30`; actual hosted error `Current source differs from fixed Cycle33 author`.

These failures retain fail-closed denial; no assertions were weakened or changed. Other assertions in the two events are only the dependent C18 retained-variable checks following prior awaited setup timeout.

## Independently verified focused reports

### push run 42018576222

Provider ZIP `sha256:e8788507685536dbaa7b03e146224d267df8687ba90b3468ce4c036a99991b8f` verified before extraction.

- `application-results.json`: **237 PASS / 0 FAIL / 0 skipped**, SHA-256 `7610d4f2a42b25ea879f0e5e8750e43664dd3e4a93ec70bc3075037d310c3918`.
- `retained-lineage-results.json`: **142 PASS / 0 FAIL / 0 skipped**, SHA-256 `183e839668269bac0d2f280d609b30bc98d012dd2369eef91584e9206ddbf9d0`.
- `artifacts/cycle33/owner-browser.json`: **9 PASS / 0 FAIL / 0 skipped**, SHA-256 `179c2df513675d7157f7b4f31d65e83f4207b7660b7dbb06228e3f81e8c96d20`.
- `artifacts/cycle33/original-owner.json`: **2 PASS / 0 FAIL / 0 skipped**, SHA-256 `280f37286422e9483ed81f8890a7ea73820cb7a3db2c88d7b2d8fc3dfceb7c84`.
- `artifacts/cycle28/browser-results.json`: **9 PASS / 0 FAIL / 0 skipped**, SHA-256 `64cf3a771397e1b118b5971d217544b26ed940d165e18d42868c394b24c5fe20`.
- `artifacts/cycle28/browser-off-results.json`: **3 PASS / 0 FAIL / 0 skipped**, SHA-256 `87d8a6014b57740796cc91c8004ecb62f49fa058c4d7f774243272d8dc47b4e7`.

Original owner pair: desktop 21542 ms, tablet 22404 ms. Both retain 30,000 ms, two actual workers, one attempt and zero retries. New owner nine retain 30,000 ms, one actual worker and zero retries.

### pull_request run 42018584602

Provider ZIP `sha256:9814b6cab6b839c84a9a73e6926e7aa60f178f0259ce071ca0fce9f5f1bea9d5` verified before extraction.

- `application-results.json`: **237 PASS / 0 FAIL / 0 skipped**, SHA-256 `b4a8e66bea2c6c46c7ea338b5818a880d7978c999a7f9182c2b1359f230ab4a5`.
- `retained-lineage-results.json`: **142 PASS / 0 FAIL / 0 skipped**, SHA-256 `d169c8df025be859dfd0501442ca09ebd5fd79354421eebd93ed908d09749f03`.
- `artifacts/cycle33/owner-browser.json`: **9 PASS / 0 FAIL / 0 skipped**, SHA-256 `0ef41b784326288bd1d4f2380a1ea898517205002a13536e963e4a8d5613d951`.
- `artifacts/cycle33/original-owner.json`: **2 PASS / 0 FAIL / 0 skipped**, SHA-256 `1b9e869e5ebdbca0c9a7641b3a0c88dd0fcd41b6bcf2ef8cc4aa2d2a34b1addc`.
- `artifacts/cycle28/browser-results.json`: **9 PASS / 0 FAIL / 0 skipped**, SHA-256 `fb7be219a9f41840b2fe1ae85799b41375dfc9c28bc99909305d7d79829fae85`.
- `artifacts/cycle28/browser-off-results.json`: **3 PASS / 0 FAIL / 0 skipped**, SHA-256 `1d5e4a85b9a0042dda5e020651d86eff8e33da729d92a41f5ca564f01d122f35`.

Original owner pair: desktop 28397 ms, tablet 29237 ms. Both retain 30,000 ms, two actual workers, one attempt and zero retries. New owner nine retain 30,000 ms, one actual worker and zero retries.

The 237 focused cases use the explicitly labelled serial scheduling variant; retained 142 is a separate report. Native nine / production-OFF three and new owner nine all pass separately in both events. Each event has 63 verified PNG hashes, nine keyboard captures, 76 source hashes plus two additional execution-bound source hashes matching the actual captured tree. This does not confer visual approval or physical recovery acceptance.

Independent focused summary SHA-256: `c4d76ac9f90544346dee9034b8a4a139ed0cae0056df66acf7b750188034c1ad`. Failed application classification SHA-256: `e3c8c3a1f1464879e7dd4419691092e5ba37b6bcde1d0850582afc0601224c2c`. Controlled local C11 shallow/full history comparison SHA-256: `91e636532113fdb8041fcde8033799646e35e6ffa08927137c451196a09f8836`.

The historical original-four-worker 237 result remains 235 PASS / 2 FAIL. The complete Foundation/application supplement remains failed; no cross-event union or serial result relabels it. Release 1.0 remains NOT READY / NOT AUTHORIZED.

## Bounded source diagnostic correction

The separately reviewable branch `codex/cycle33-source-diagnostic-compatibility`
has sole parent `04f15d45438a56cd86421db2b49d0aa97c22b07e`. It changes only
build-time diagnostic context: an existing finite descendant denial retains its
original outer fixed-C27 or fixed-C30 label, underlying message and Error cause.
Parent, owner, delta, mode, current-byte and companion checks, successful values,
all original test assertions and all budgets remain unchanged. No runtime engine,
source author, business store or permission is added. The correction source hash
and exact reports are in [the allowlisted record](CYCLE33_CI_CLOSEOUT.json).

The exact four unchanged failing cases reproduce on the parent: 0 PASS / 4 FAIL /
26 name-filtered cases. The patch yields 4 PASS / 0 FAIL / 26 name-filtered cases.
All seven relevant complete source-lineage files then pass: **267/267**, no skips.
Those local single-worker regression reports are separate from parent hosted CI;
no successful hosted job was manually rerun. Strict types, scoped lint, syntax and
feature/design bindings pass. Independent source review is CLEAR. The new correction
head requires its own GitHub CI; parent successes are not inherited across heads.

## Verified isolated diagnostic and remaining coverage

[Draft255](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/pull/255)
run42019545004 executes all **233/233 original cases across seven whole files**,
including fixture-establishing cases, at frozen8d902/tree8cfe and driver28f57.
Artifact13412782358 has verified provider SHA-256
`36bebd124cf7995087acd2e431b07dcf833abe096c5997b5184b6f247038f3e2`.
Source/driver hashes, initial/final bindings,16 numeric resource samples, zero retries,
repeats/skips and unchanged30second budgets are independently verified. The actual
maximum is **one worker**; this remains explicitly
`ALTERNATIVE_ORCHESTRATION_DIAGNOSTIC_NOT_ORIGINAL4WORKER_PASS`.
No sole runtime/resource cause or original four-worker/full Foundation PASS follows.

CI-only247 at7406 still has26PASS/8FAIL/2CANCELLED. Its six failed application
artifacts contain12 explicit30second timeout occurrences across11 unique cases.
Nine identities are inside the frozen233 cohort; two lie outside it:
`cycle25-service-evidence-continuity.test.ts` concurrent brand2 report reads, and
`cycle32-owner-filter-navigation.test.ts` retained refresh comparison. They remain
outside that diagnostic; the old event is never repaired retrospectively.

The separate255 Passport job42019590042 rejects its own runner's unrecognized
highest-priority mirror before fonts installation and browser assertions. The
redacted same-runner probe matches and identifies the finite
`REJECT_REVIEWED_MIRROR_OR_PRIORITY` category. An unknown URI hash is not trust
approval. No allowlist, signing validation or dependency was relaxed. Browser
assertions for that failed job are NOT_RUN; the original earlier unlogged mirror
failure remains UNKNOWN. Full original-scope acceptance remains OPEN.

## Independent visual, recovery and operational boundaries

Both Main artifacts independently pass unchanged application collectors and native
browser collectors. Each has63 verified PNGs,9 keyboard records,369 trusted events
and78 scoped source hashes. The9 native scenarios execute their original Axe,
no-overflow and touch-target assertions; the separate Owner9 cases have no new Axe
scan. Source-bound captures are actual synthetic browser evidence, not owner visual
approval, physical completion or two-Mac recovery. Approved designs are unchanged.

The original owner-witnessed main synthetic network-loss PASS remains accepted.
The fresh duplicate result has not been provided; complete R0 reviews remain OPEN.
Previously reported device availability is not current readiness evidence. Preserve
both original private run folders and all UNKNOWN/aborted evidence. This closeout performs no new physical
attempt, kit rebuild, completed-offline rerun or operational recovery.
D1–D3 still require11 named operational roles; A01–A12 remain NOT_RUN. Original P1
approval and customer14/4B sequencing remain intact. No schema, credentials,
restoration adapter, hosted mutation, financial execution, communications, dispatch,
merge, deployment or release activation is authorized.

Release1.0 remains **NOT READY / NOT AUTHORIZED**.
