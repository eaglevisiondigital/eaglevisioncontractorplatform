# C22 default historical Git read proposal

The default C22 validator passes its uncached historical reader through retained
source admission. A cold natural validation at exact `53a4705` made 703 Git
subprocess calls, including 203 exact duplicate commands. This one-file UNAPPLIED
patch captures the existing immutable-object reader once; the corresponding cold
profile made 518 calls, with 18 duplicates. Current filesystem reads, all source
validation and explicit injected ports remain unchanged.

`correction.patch` changes only `scripts/check-cycle22.mjs`. Canonical checker,
lineage, tests and original four-worker/30-second configuration remain unchanged.
The captured function avoids a later mutable exported-port substitution seam.
`source-frame.json` binds the exact parent, patch and original/proposed hashes.

`qualify.mjs` follows the existing disposable local shared-clone pattern. It applies
only this patch in a private temporary clone and checks actual on-disk bytes.
Literal baseline/patch/frame digests seal the source choice; all2410 original Git
blobs and modes are checked with only the exact C22 substitution allowed. Current
bytes and symlink ancestors are checked before imports/controls and cleanup.
`tests/workflows/c22-default-git-proposal.test.ts` runs six independent controls
there: natural retained sources, captured reader, UNKNOWN current source, mixed
current reads, explicit Proxy-port denial and copied historical buffers. The
separate integrity suite denies coordinated metadata rebinding, patch replacement,
unknown executable companion bytes/modes and symlink ancestors. An additional
case poisons external Git config and Node options; qualifier Git/Node subprocesses
use an explicit clean environment, disabled hooks and local-file-only transport.
Independent root execution passed all12 final packet cases (six behavioral and
six integrity), with no failed or skipped cases. The earlier root11-case PASS
precedes this environment boundary correction and remains historical. Exact
report digests are retained in `evidence.json`. Run:

```sh
npx --no-install vitest run tests/workflows/c22-default-git-proposal.test.ts tests/workflows/c22-default-git-proposal-integrity.test.ts
```

Independent root qualification of the exact proposed checker on disk passed all
58 original C22 cases with unchanged tests/config/lineage. Its positive case took
20,918.47ms versus the isolated baseline20,606.73ms; no full-case wall-time
improvement is demonstrated. This is separate from the six controls. The earlier
in-memory transformed58-case PASS and direct profiles are development evidence
only. Deterministic reduction of185 historical Git subprocesses is the supported
performance result.

Measured redundancy is established; the previous shard-context timeout and
45-minute CI cancellation cause remain UNKNOWN. This proposal does not claim
transitive source admission, whole-CI success, hosted timeout closure, operational
acceptance or authority. Exact protected-checker approval is still required before
application. No publication, merge, deployment or background execution is authorized.
