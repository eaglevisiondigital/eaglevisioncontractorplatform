# Exact approval checkpoints

Preparation is complete; author creation and source admission remain blocked.
`finite-successor.json` binds the original test, exact #375 patch, proposed test
bytes, companion-note bytes, sole parent and M1/A1 delta. The future author SHA is
honestly `null`: no protected-source author has been created under preparation-only
authority. The old b947/bd8f author identities and manifests remain unchanged.

First exact Owner decision, if desired:

> I authorize creation of one isolated, unmerged source-author candidate with sole
> parent `61f903eba93735ae945b0a16fcc07c0af9b7bbb0`: apply only patch SHA256
> `0e309234f1186dcaeac6a6a2234fe825526666b9efb1016df405efeb382a297a` to
> `tests/cycle17-integration.test.ts`, producing test SHA256
> `46747ffb4188b925fa2a64250be069a32e126fc72befac8918028f7594840d9a`, and add
> `docs/program/V1_C17_FIELD_CLOSEOUT_SOURCE.md` using the exact proposed-note bytes
> bound in `finite-successor.json`. No other source, checker, pin, budget, workflow,
> runtime, SQL, grant, hosted or release change is authorized. Return its exact SHA
> and independent review before requesting separate finite admission approval.

Second checkpoint: after that author exists, independently review its exact sole
parent/M1/A1 delta, modes, hashes and original companion/source continuity. Prepare
and review the exact checker/test admission diff through the existing entrypoint;
include unknown/extra/missing/late-mutation negatives and the retained original C17
consumer. No checker change is approved by this package; its future diff and author
SHA must be supplied before requesting exact admission authority.

Offline package check (no protected test edits):

```sh
node --test proposals/c17-field-closeout/verify-successor-package.test.mjs
```

The verifier applies the patch only to a disposable temporary copy, verifies exact
hashes, and proves the unchanged admission rejects proposed and unknown bytes.
It does not admit a successor or rerun the accepted historical suites. The fifteen
remaining CI markers stay unresolved as recorded in `remaining-ci-markers.json`.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
