# Fixed568 dedicated C33 scheduling · unapplied review proposal

**Whole-489 qualification is pending. No workflow authoring or execution is
permitted by this proposal.** The local dedicated-file qualification passed all
18 original C33 finance cases. It does not close Foundation: both #575 verify jobs
were cancelled at the 45-minute boundary with eight visible C18/C24 failures each;
C33 finance completion was not printed. Missing final exception stacks and unprinted
work remain unknown. No CPU/GPU cause is established.

The proposed author parent is exact #573
`5a5885bea8b6263542429b079b3aca5762a5b31d`. The workflow would continue checking out
exact application #568 `3f0c6b53747e60765cdc7faf1308b57ce730676f`, tree
`00f6d211affd7e364573ca792e08a1dd67b8f190`. Those are distinct source boundaries.
This ordinary proposal adds data only; it changes neither checkout nor a workflow.
A later author must start from the stated #573 parent and exclude these artifacts.

The UTF-8 `patch` field in `definition.patch.json` is the exact one-workflow diff,
SHA256 `9fe8ccb6166e152f8730aa8c43199812708a28581f236504a178d716cd7d6c25`.
It retains eight jobs, maxWorkers=4, original 30-second test/hook defaults, all case
budgets, retry=0 and the original 45-minute job maximum. Group 8 selects exactly
`tests/cycle33-v1-finance-owner-integration.test.ts`. The original C27 source-lineage
file stays in group 1 for its unchanged two-empty-directory telemetry allowance.
The other 487 files are balanced across groups 1–7 using retained module-wall proxy
weights. All 489 original files occur exactly once. These overlapping wall weights
are not isolated CPU/work estimates or a future timing guarantee.

Only the external sequencer's `shard()` changes; its original native sort remains.
The external configuration imports the original Vite configuration and changes
only the sequencer. The original source, tests, reporter, validator, source probe,
observer, unit exit precedence and global setup remain unchanged. The new three-file
TCB is explicitly hash/type/mode checked before planning and after unit execution;
the manifest is freshly hashed on each selection. Physical original-config hashes
alone cannot authenticate this external configuration.

The `.txt` payloads retain the qualified bytes exactly. Restore these filenames in
one separate review directory outside the fixed application checkout:

| Proposal data                   | Runtime filename            |
| ------------------------------- | --------------------------- |
| scheduler-manifest.json.txt     | scheduler-manifest.json     |
| sequencer.mjs.txt               | sequencer.mjs               |
| vitest.scheduler.config.mjs.txt | vitest.scheduler.config.mjs |
| planner-controls.test.mjs.txt   | planner-controls.test.mjs   |

Check every restored SHA256 against `source.json`. For the pure 23 planner controls,
use Node24 with that separate test file while the working directory is the exact
#568 checkout with its pinned dependencies. The controls execute no application
case. Do not add these review files inside the fixed application tree. No extractor,
configuration fallback, new application reader or automatic continuation is added.

Evidence: 23 new pure controls passed; independent external-TCB qualification had
8 passes and 1 explicitly unverified special-mode precondition. The host did not
retain requested 4644, so that vector is neither PASS nor a demonstrated bypass.
A single approved local Darwin qualification selected the unchanged 18-case file
through the full native 489-file collection. All 18 passed, maximum 15.943 seconds,
with original identities/budgets and unchanged validator acceptance. All 2,568
application bodies/types/full modes, HEAD/tree/index and the new TCB were exact
before and after. Raw-result hashes and historical failure limits are recorded in
`qualification.json`. No hosted/Linux or complete-Foundation result is inferred.

The unique proposed label is `run-fixed568-isolated-c33-units`; the consumed
historical supplement grant cannot be reused. Separate exact author approval and
then separate finite execution approval remain required. No label, dispatch, retry,
source promotion, SQL/grant/Auth/provider/recovery operation, merge or deployment is
authorized. Release 1.0 remains NOT READY / NOT AUTHORIZED.
