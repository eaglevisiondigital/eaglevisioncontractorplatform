# C24 helper428 admission proposal — UNAPPLIED

This package reuses the exact reviewed391 C24 patch against helper428
`a1b701a42ff838d3364c611794000b6dc533e27f`. It does not modify the canonical
checker, helper, runtime, C9, original manifests, source packages or design locks.
The literal bindings and evidence hashes are verified before detached execution.

From this repository with its existing pinned dependencies:

```sh
node proposals/cycle24-helper428-admission/qualify.mjs controls
node proposals/cycle24-helper428-admission/qualify.mjs metadata
node proposals/cycle24-helper428-admission/qualify.mjs sequence
```

Each command uses a disposable detached428 clone, a reference to the existing
local dependencies, sanitized process environment and a 120-second subprocess
ceiling. No install, credential loader, hosted operation or source admission is
provided. `metadata` runs the actual C24 metadata CLI; it does not run application
browsers, native PostgreSQL or the historical3045 tests. `sequence` additionally
applies the immutable391 C9 patch only inside that disposable clone to demonstrate
exact proposed-source compatibility. This is **not C9 approval**.

The smallest separate C24 decision is permission to apply only the exact
`cycle24.patch` SHA256 `60f719216eb985839602bbb97e1a3d5420b80579771583677622e7c5715ab447`
to the original C24 SHA256 `4ed8baec4e1b7abc3f3ff86cc88c590b3497c3bfb7ff2ac12fcc1c7e2f71562f`,
producing `4f95b11e4e1d45186c5607f1b0773cc379e1901d99f7944ce907bfdef5a9a68d`.
Its standalone parent is exact428 above. If C9 is separately approved first,
the actual C9-only successor commit must be identified and independently checked;
this package does not invent that parent or bundle its authorization. Recognized
future source frames are compatibility evidence, never permission to write them.

D1–D3/A01–A12, protected SQL, genuine Auth, custody, recovery, NMI and all operational
gates remain unchanged. Release1.0 remains NOT READY / NOT AUTHORIZED.
