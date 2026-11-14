# Unapplied Cycle24 collector source admission

Baseline: `78c57bc8e5919026b0df4d273d7cb1c7059fdbb7` (PR #435).
Only proposed target: `scripts/collect-cycle24-browser.mjs`, mode `100644`.
Patch SHA-256: `b3b9eab444c1902e8faba5aac123694c140d345937d3b8bd8864216e08d868c4`.
Before: `91de8cb3c701b2a8b57c8a5b2b1dc9bfb038f8b2e8c582d08d937153fcb79644`.
After: `f1113308f7517ce654827503f0341fd0bf2951a286fd23e3b783387728fa5c7a`.

The original collector rejects the approved runtime at the executed critical-source
comparison before accepting browser evidence. The proposal reuses the exact existing
38fd helper, verifying its regular mode and literal hash before importing captured
bytes. Only the original 7a527 runtime or exact c50-authored a789 successor is eligible.
Every binding freshly compares all five current critical files with immutable executed
Git blobs, including cache hits. M1 provenance is explicit. The 76-file inventory does
not contain the runtime; its original row-admission path remains unchanged.

The unchanged private PR #434 artifact (run 43528901200, artifact 14087830064) is bound
by its complete 138-file fingerprint before and after copying. ZIP SHA-256:
`61ba7fa0a0989485e529be3114e9350979f0ff80bbdafbdd69c93c8786c91aca`.
Metadata remains bound to actual merge `a26b85cf945e9486802a334882727cd9c4191823`.
The original collector fails at its critical-source guard; the proposed collector
accepts 9 development/3 production-off cases, 63 PNGs, 9 keyboard journeys, 369 trusted
events and the original 76 captured sources. No browser was rerun or screenshot edited.
This is offline recollection of existing hosted evidence, not a new hosted collector PASS.

Run the 13 new controls with the existing Vitest runner:

```
node node_modules/vitest/vitest.mjs run tests/workflows/cycle24-collector-signature-proposal.test.ts --maxWorkers=1
```

For the approved private artifact directory, `node proposals/cycle24-collector-signature/qualify.mjs PATH before`
reproduces the original denial; replace `before` with `after` to qualify the unapplied
source in an automatically removed archive. The qualifier pins all tracked baseline
bytes/modes; current canonical collector may be exactly before or exactly after.
A malformed mode, substituted patch/evidence/helper/source, symlink or mixed frame
fails closed. Mutation/inspection callbacks exist solely for disposable offline tests.

Next separate owner decision: authorize ONLY the exact one-file patch above on an
isolated child of PR #435, preserving all other files. No permission is requested or
granted here to install it, change other source guards, merge, deploy, activate a
provider, run operational SQL, bill customers or open the Release 1.0 gate.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
