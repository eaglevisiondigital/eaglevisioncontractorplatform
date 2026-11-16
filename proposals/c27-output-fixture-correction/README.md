# C27 output-fixture correction — UNAPPLIED

This finite proposal starts at exact #528
`5bf90478a853e34cfdb18cc6ed3a2b1c7ace25d5`, tree
`7a86790dfb4164503348eefe0fdc5dd6f4f683a6`. It proposes changes only to setup and
output locations in `tests/cycle27-source-lineage.test.ts`. The protected file is
unchanged in this checkout. The exact patch is `output-paths.patch`; source authoring
requires a separate owner decision bound to its before/after hashes and actual parent.

## Demonstrated interference and smallest safe setup change

Hosted #527 tested immutable #520. Clean physical source, all modes, pinned code and
required Git objects passed. After the two original C27 cases, only empty `artifacts`
and `artifacts/cycle27` directories were added; unchanged invoice qualification denied.
That controlled ordering proves an interference mechanism. It does not establish
which condition first denied the earlier full #520 Foundation run.

The raw Git-object case already runs in an isolated child process and can use a real
canonical `os.tmpdir()` directory. The proposed setup rejects a configured temporary
root inside the checkout, then creates/removes its owned external directory. Its
complete child script, replacement-ref/shallow checks and assertions remain exact.

The fresh-read case deliberately tests the real `cycle25SourcePorts.read`. That
reader rejects absolute and `..` paths and uses actual process cwd. Moving this file
to an external absolute path would require changing the reader, spoofing cwd or
replacing the original assertions with a larger child-process fixture. This proposal
preserves the reader and all assertions: only its two output prefixes move to the
already excluded `test-results/cycle27` test-output area. No ignore is added. Its
owned child directory retains the original `finally` cleanup; no source artifact is
deleted to turn a dirty guard result into a pass.

All other test bytes remain exact after reversing the declared imports/setup edits.
The current-source warming, stale-source rejection, before/after fresh reads and
raw Git object tests remain the original assertions. Original names, twenty cases,
30-second case/hook budgets, source checkers, historical pins, SQL/Auth/runtime and
all approved UI files are unchanged.

## Qualification is not source admission

Nine focused controls pass, including negative-first original contamination,
permission drift, unexpected source, fresh clean source, altered payload/patch,
byte-exact assertion preservation and the proposed twenty-case C27 afterimage.
The clean-parent control also injects hostile Git redirection/config/helper settings
and verifies the qualification still uses the owned source image without executing
the helper. Unsafe in-checkout temporary storage fails as intended.

The new ordinary qualifier gives Git a fixed environment, disables inherited global/
system configuration and hooks/fsmonitor, drops Git redirection/config variables
from child probes/tests, and permits only local file transport. Child Node loader
overrides are removed. Qualification is offline; CI history setup is not activated
by the child environment. The main Node process, Git executable and pinned installed
dependencies remain trusted tooling, not operational custody or genuine Auth.

The proposed twenty original C27 cases pass with no `artifacts` directory or unknown
source path. The only tracked body difference is the proposed C27 file. **The
unchanged invoice guard still DENIES that afterimage**, correctly: its full-source
frame pins the original C27 bytes. That is retained evidence, not a waived failure.

The same C27 before-blob `87301caa756c53d607c0fd0f5a6c6e1b9d88ca38` exists in the
canonical historical `5f0f17dc9766411b260d5b53fd2db5a925adc80f` tree. A later
separately reviewed finite current-source context and exact historical **test-body**
compatibility step would therefore be required after a real C27 source-author
exists. No such admission, extra port, header patch or checker change is included
or authorized here. This proposal's own namespace is likewise not launch admission.
Do not claim that the one-file output correction alone makes Foundation pass.

Run Node 24 with `node --test
proposals/c27-output-fixture-correction/controls.test.mjs`. The controls create
separate owned exact-parent/afterimage clones and preserve failed/dirty observations
before removing entire disposable fixtures. `qualify.mjs` exposes the same bounded
fixture operations for independent review. No hosted SQL, browser provider or real
business operation is used.

## CI findings and approval boundary

`CI_REPORT.md` separates actual #528 elapsed execution, visible failed cases, native
success, current Passport success and historical #520 mirror failure. The job kept
completing files until seconds before cancellation; no CPU/subprocess cause is
inferred from that progress. No full unchanged `npm run check` rerun, timeout increase,
source repair, cleanup bypass or mirror change was used to obtain this evidence.

Only ordinary proposal additions may be published after review. Exact protected
C27 source authoring and its eventual fixture admission remain separate approvals.
#508/#509, genuine Auth/MFA, SQL/grants, D1–D3/A01–A12, recovery, merchant-specific
NMI, messages, merge and deploy retain their independent gates. Saul 2 Paul remains
first; Cunningham requires separate acceptance. **Release 1.0 remains NO-GO.**
