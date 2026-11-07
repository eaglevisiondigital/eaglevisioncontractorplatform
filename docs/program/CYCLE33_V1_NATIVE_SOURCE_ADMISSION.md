# Exact V1 native-source successor admission

This bounded source-tooling draft starts at reviewed CI-only draft #293,
`67237bde592ace34487a353492cf01dc4e4fa204`. It changes no application source,
historical manifest, protected hash, dependency, original test assertion or budget.
It is preparation for a separately tested combined candidate, not evidence that
the four parallel V1 drafts were already integrated.

## Demonstrated source failures

Draft #292's C10 source guard compares Advanced's original SHA-256
`61c141d0fa24acb8d0eb84c194f6c19576356b875ad95865b72a08b92406db16`
with its reviewed successor
`4a6b3e37bc4900361da72d70509063267ddcc6ea8f6252da35d47d63206b1d5b`.
C11 and C12 propagate that same rejection. Their full checkout did not make these
bytes equal; missing history is not the demonstrated original cause.

Draft #294's C19 guard retains cost-revision SHA-256
`38e732a03ebca2760efb3a5ea326c79e24f517c9d0c5035653bcbd2d94f543c6`.
Its reviewed successor is
`9b900879f238c9161157be40a05129a6d653854f77153559e56eed3f87e1ff0c`.
The previous published-source fallback has no owner for this native path. Both
authors are exact sole-parent M1/A2 commits on unchanged Main source
`5d695378f6f8573f99628116611c71c755c60c06`. This evidence supports a finite
successor admission; it does not approve arbitrary evolution of either file.

## Narrow correction and authority

The existing `admitCycle33ExecutionPublished` delegates exactly two literal paths
to an appended immutable profile: Advanced author
`58c96bad25b314bcf11faf33020fc7bb2791a429` and Finance author
`e733774533bb4aab0a30782855aeb367c72089d0`. Each profile pins its original
publisher and parent, original SHA/blob, exact new SHA/blob, sole author parent,
regular file modes, exact M1/A2 delta, four unchanged original companions and two
new author companions. Current bytes and every companion are read again before
return. Only immutable Git-object answers are cached; current reads and authority
are not cached. Unknown bytes, missing objects and changed metadata remain denied.

C10 fixes the historical Advanced hash before its equality shortcut and calls
that same admission only for the literal Advanced path. Other C10 rejections and
all original C10/C19 rows remain unchanged. C19, C22 and C23 already use the
published-source fallback; their original checkers and immutable pins are untouched.
Every admission explicitly returns `business_authority: false` and
`restore_adapter: false`. This is source lineage, never business-state restoration.

The new admission needs original Git objects before the CLI source check. A
disposable same-source checkout experiment preserves a depth-one rejection and a
full all-branch-history PASS. Fetching only the current branch's ancestry was
insufficient because the original publishers are side-branch authors. Accordingly
C10 alone gains checkout `fetch-depth: 0`, matching the existing C11/C12/C19
prerequisite. Node version, signed dependency installation, worker counts,
assertions, test budgets and the original 15-minute workflow bound are unchanged.

## Verification and limits

Positive admission cases use real-Git-backed mapped-current fixture ports; this
CI-only author worktree retains baseline application bytes. Actual combined-disk
checks remain required. The new source suite's first complete execution passed 102 cases, zero skipped or
failed, on local Node 24.20.0 with worker one, retry zero and original 30-second
case/hook budgets. Raw JSON SHA-256:
`2317748834fb10944ab715b0c1e9ed40ba1c384b954c4d463a677999c74a73cb`.
The local Vite runner loader avoided a read-only shared-cache startup error; the
original config and budgets were unchanged. Two additional actual C22/C23
unknown-native denial cases are separately exercised, then all 104 must run on the
final combined source. Strict TypeScript, scoped lint, formatting, feature evidence
and diff checks passed before independent review. Feature evidence preserves all
25 records, five design locks and thirteen bindings.

Original exact-head hosted results remain separate: #292 19 PASS / 4 FAIL /
2 CANCELLED; #293 8 / 0 / 2; #294 22 / 1 / 3; #295 25 / 0 / 2. All eight
Foundation cancellations reached their original 45-minute deadline during unfinished
Vitest. Their partial Git-history suites passed, but no terminal complete-suite
JSON establishes an exclusive failure cause. Full Foundation acceptance remains
incomplete. The separate #294 C12 browser cancellation and #292 C9 privacy
assertion failure are preserved. A controlled unchanged-assertion diagnostic proves
that a valid UUID can contain the forbidden phone substring, but the original
hosted matching payload is absent; its exact cause remains UNKNOWN. No original
test, regex or runtime identifier is altered here. Historical Cycle18 and 270-case
conflicting results remain unchanged.

This author package does not claim new-head hosted application, browser, visual,
genuine Auth/MFA, operational or recovery acceptance. The final combined tree
requires its own source manifest, independent review and integration tests.
D1's eleven roles remain UNASSIGNED; D2/D3 remain separate; A01–A12 remain NOT RUN.
The owner-witnessed November4 main synthetic network-loss PASS is preserved;
duplicate recovery remains UNKNOWN/UNVERIFIED and private evidence untouched.
All P1/customer14/4B, financial, NMI, database, recovery, dispatch, communications,
provider, deployment and merge gates remain closed. Release1.0 remains
NOT READY / NOT AUTHORIZED.
