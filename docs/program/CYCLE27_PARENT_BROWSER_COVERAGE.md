# Cycle 27 · missing original Foundation browser coverage

This separate CI-only draft preserves exact C26 application/test/config/lock source
`f81081b3ce8fca63443a9f03e8bfcd5aa4daa4b6`. No historical workflow, test, assertion,
timeout, runtime file, migration or operational gate changes.

PR Foundation run41789311305 / verify126438719026 hit its original45-minute ceiling
after `npm run check` and `staging:plan` passed, during Chromium installation. The
actual application summary is302files passed/7skipped and9208cases passed/321skipped;
skips are not passes. The original full `test:browser` stage was skipped. Its sibling
postgres17 job passed and uploaded the native customer-request artifact; that artifact
cannot stand in for the missing ordinary browser stage.

Same-head push Foundation41789303250 / verify126438693831 hit the same ceiling inside
`npm run check`, recording15 failed cases across C18/23/24/25 without emitting final
exception details. Those failures and older historical C18 gaps remain unresolved;
this package does not infer root cause from durations or erase them. Both Foundation
runs remain CANCELLED, never PASS.

The new workflow checks out the exact original40-character target, preserves the
original Playwright config and entire original collection, records a complete test
inventory per shard, then runs the unmodified `npm run test:browser` stage in four
non-overlapping original Playwright shards. Two workers and zero retries retain
bounded resource use. All four shard outcomes and the union of their result artifacts
are needed for coverage; one passing shard, skipped case or queued job is insufficient.
No successful application, database or dedicated workflow is manually rerun. Normal
automatic checks on this new draft remain separately labelled at its own head.

Source/config/shard metadata, complete collection and actual JSON results are retained
in four separate artifacts. The35-minute bound applies per finite independent shard;
the frozen Foundation45-minute budget is unchanged. No filter, test replacement,
assertion removal, new App route, provider activation or hosted credential is introduced.
This supplements only the missing stage and cannot retroactively alter a cancellation.

P1/thirteen/customer14/4B, all original approved designs, Auth/MFA/NMI, Netlify,
financial/recovery/production restrictions remain unchanged. No merge, deployment,
hosted write, payment, dispatch, communication or restoration. Release1.0 remains
NOT READY / NOT AUTHORIZED.
