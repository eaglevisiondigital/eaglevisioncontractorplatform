# Cycle9 admission against helper-author #428

UNAPPLIED proposal only. Exact parent
`a1b701a42ff838d3364c611794000b6dc533e27f` is the sole regular helper
addition to runtime-author `c50ce4521fbc264276734a9f8909b525c9a7c2f8`.
The helper and optimized runtime are already authored; this packet adds neither.

`admission.patch` is the byte-exact Cycle9 patch from reviewed #391
`608ce8b7071a555440bf1f7dccfddec9473c661a`:
`274c02512df50c1a751fec124db3e8e8c22474c2286a0e70e734c76f91a8c5be`.
It changes only `scripts/check-cycle9-integrity.mjs`, from `1faf35…` to
`484a6c…`. It retains the original historical runtime manifest pin `7a5272…`,
all original Cycle9 checks and output, and the existing service-privacy admission.
It captures/hash-checks the exact `38fd3d…` helper before executing its bytes.
The helper admits only the exact separately authored runtime and Git lineage.

Run from this worktree with Node24:

```sh
node proposals/cycle9-helper428-admission/qualify.mjs
npx vitest run --configLoader runner tests/workflows/cycle9-helper428-admission.test.ts
```

The qualifier first pins the literal record, patch, parent metadata/modes and five
current files. It accepts the complete exact Cycle9 BEFORE or AFTER frame; runtime,
helper, historical manifest and Cycle24 stay fixed. It rechecks the same frame after
metadata reads. An archived #428 tree then proves the original CLI denial, applies
only this patch, runs the actual passing Cycle9 CLI, and rejects two helper mutants
before execution. It removes the disposable tree even if final validation fails. Git-directory
resolution precedes allocation; its failure control leaves synthetic temporary
storage empty.
Child CLI/environment uses PATH and finite Git settings, without ambient credentials.
Each child has a30-second containment limit; no original test budget is changed.

Focused controls cover BEFORE/AFTER, unknown and mixed sources, missing helper,
coordinated patch/evidence and checker/helper rebinding, historical-pin rewriting,
forged parent/delta/mode/blob, late source withdrawal, source symlinks/modes and CLI
selectors. Existing #387/#391/#427 algorithm/differential/performance proof is reused;
no broad accepted suites, benchmarks or recovery are repeated. These are sequential
local source checks under trusted Git/filesystem tooling, not atomic filesystem or
same-owner rollback protection.

Next approval would authorize ONLY applying this exact one-file patch on an
identified isolated source-author parent. This packet authorizes no source change.
Cycle24 authoring/admission, later launch composition, CI/performance acceptance and
all operational gates remain separate. No SQL, Auth, provider, NMI, financial,
customer route, migration, deployment, merge or recovery action. Release1.0 remains
NOT READY / NOT AUTHORIZED.
