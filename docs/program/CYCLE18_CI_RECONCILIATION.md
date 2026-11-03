# Cycle 18 CI reconciliation

The published implementation candidate was `4fae8ed5a203f644a205bbb80109d74dfcaab181`.
CI results belong to their exact heads; this record does not turn a cancellation,
partial run or local result into a hosted PASS.

## Demonstrated browser collection failure

[Run 41657739100](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41657739100),
artifact 13242385101, contains actual application **446/446 PASS** and browser
**30 PASS / 2 FAIL**. The failures are exactly the tablet/mobile production-OFF
cases accidentally collected by the DEV configuration. Their requests went to the
DEV server at 4361, while their closed-route assertion correctly expected the
separate production build. The production step at 4371 was consequently skipped.

The project-specific tablet/mobile `testIgnore` replaced the root exclusion rather
than extending it. Their arrays now include BOTH original exclusions. No assertion,
application code, viewport or mode guard changed. The separate production config
remains unchanged. All 30 actual DEV cases had passed in the failed run and remain
preserved; they are not called a successful overall workflow.

A new collection-only check uses the actual Playwright JSON `--list` result, not
hand-written configuration simulation. It requires exactly 30 unique DEV tuples,
3 unique production-OFF tuples, the intended project/file coverage, explicit server
origin/command, no server reuse, unchanged per-case budgets and zero automatic
retries. It executes before browsers in the bounded Cycle18 workflow; Foundation
is unchanged. Collection-only results are not browser execution results.

## Child Foundation evidence

Seven cancelled verify jobs explicitly exceeded the unchanged 45-minute budget;
all seven companion native PostgreSQL jobs passed. PR126/128/130 each also have a
successful exact-head Foundation companion. PR127/129 lacked such a completed pass
at the observation; source inclusion and local tests are not substitutes.

The two cancelled Customer runs additionally printed four failing cases before
cancellation: three branded fresh-wrapper PENDING-ownership cases and the known
pre-dispatch withdrawal/claim-release case. Durations were approximately 30–32s.
Their final Vitest exception was never printed before cancellation, so a case
timeout is an inference, not a proven provider error. These failures are retained.

Exactly those four claim tests unnecessarily traversed four jobs twice, despite
asserting one canonical company/job claim. The focused fixture correction first
prepares the unchanged complete repositories, then admits the exact original
one-job handle into both separate views over those SAME repositories. It preserves
all 82 original assertion expressions and the deferred overlap, competing calls,
final successful continuation and unchanged 30-second case budget. Eight identity
assertions were added; the other 51 cases and runtime files are unchanged.

Measured old-to-new durations in milliseconds were 11278.85→3823.87,
11204.28→3645.98, 13262.94→3770.58 and 10445.03→3156.83. Targeted four-case runs are
separate timing evidence; unselected cases are not counted as suite acceptance.

The corrected author head is `1ed580ebd53bd5a9a893fd63c81dc905650d40de` (same draft PR127). The single
complete follow-up suite passed **55/55 unique cases**, zero failed/pending, maximum
9.44s. Complete55case timing is separate from the four-case measurements. Original
runtime files remain byte-identical. Root admitted exactly the updated test/doc
blobs after verifying their Git identity and SHA256. Independent review accepted
both bounded source-preserving corrections; no operational acceptance is implied.

## Final combined local result

After admitting the exact Customer correction, the complete12file application run
passed **446/446unique cases**,0failed/skipped/pending, maximum22.018s under
the unchanged30s case budget. Strict completeness validation passed. Report SHA256:
`cbce249597c8c08b9c1731becede659407a4d56045639d6db42f36a6dc689a38`. Types/generatedtypes/lint/format and protected/source integrity also pass.
No local browser rerun was needed for unchanged application runtime: prior30actual
DEV executions and separate3OFF local executions remain source-bound evidence;
actual collection is now additionally verified. New-head automatic CI is separate.

## Independent and release boundaries

The independent reviewer checked actual collection semantics and the exact Customer
diff for assertion preservation. Final automatic CI remains a separate, time-bound
observation at the new published head. Prior failures and cancellations remain
visible. No manual rerun of a successful check, timeout increase, assertion removal,
protected workflow edit, product redesign or release promotion was performed.

All approved interfaces, protected hashes, historical migrations, customer14/4B,
frozen P1/four artifacts, Netlify archive/executor and recovery/Auth/MFA/NMI gates
remain unchanged. Physical two-computer acceptance remains UNVERIFIED.

Release 1.0 remains NOT READY / NOT AUTHORIZED.
