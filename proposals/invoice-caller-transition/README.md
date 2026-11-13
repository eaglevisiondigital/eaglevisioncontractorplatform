# Unapplied checker-transition amendment

Parent is exact approved checker author
`82c3ffd11499f9addbb92d6d5d7d1deb7e34d64c`. Its canonical guard/helper remain
`52f0e7e6…` / `e83139e1…`; this package does not change them.

The original13-case fixture-source test still expected the historical guard bytes.
Its first case independently failed after the legitimate checker author. This
amendment retains that assertion through an explicitly historical read port and
separately proves the current checker transition. All13 case IDs and original
negative assertions remain; no budget or skip is changed.

The three proposed files follow an acyclic byte dependency:

1. F: the13-case test retains exact82c guard/helper hashes, normalizes only the
   guard's single helper digest, and requires the exact helper transformation.
   Its expected current helper is derived from its current own bytes and the
   immutable82c helper; it contains no proposed H/G digest literals.
2. H: the helper retains original13 hash `b1131c5c…` as `publishedSha256` and
   requires exact current F bytes. The published/current split is permitted only
   for this one13-case test path. All8f/6063 Git parent/delta/mode proofs remain.
3. G: the guard changes only its helper digest to H; before-execution verification
   and captured-byte import remain intact.

Disposable qualification passed all original8+13 cases. Unknown13/source changes,
unknown helper execution and a coordinated allow-all helper/guard-digest rebinding
were denied; the current transition proof failed explicitly in every negative.
The final combined disposable run passed64/64: actual8+13 source cases,
24 historical proposal cases,11 current-frame cases and8 amendment cases, with
original worker configuration and30-second case budgets. Root independently
passed the8 amendment cases and24 historical cases; security review confirmed
exact P/F/H/G and byte-preserved original negative/history assertions. The
original native60/proposal36 cases are not repeated. The separate24-case
historical proposal loader transition is owned by the ordinary fixture successor
and grants no source admission.

Run `npx vitest run tests/invoice-caller-transition-proposal.test.ts` to reproduce
the exact positive, four real negative runs and metadata/patch tamper rejection.
For the complete64-case disposable composition, use:

```sh
node --input-type=module -e "import('./proposals/invoice-caller-transition/qualify.mjs').then(m => console.log(m.qualify({includeQualification:true})))"
```

Only a temporary archive receives the amendment. Canonical protected bytes remain
unchanged, and historical source records are not overwritten.

The optional positive-only `qualify({includeQualification:true})` stages five
exactly hashed qualification companions and tests the combined Q/P tree. Its
default nested calls still qualify only21 cases, preventing recursive aggregation.
It accepts only the full original82c tuple or the full known-proposed F/H/G tuple
as test-loading frames; mixed or unknown bytes reject and approval remains false.
The final aggregate passed all64 cases (8+13+24+11+8), without worker or budget
overrides. Its initial63/1 result identified a separate ordinary24-case historical
helper fixture mismatch; the corrected fixture now explicitly retains only the
original13 companion and independently checks the current qualification frame.
This aggregate is disposable source qualification, not full Foundation or hosted
acceptance. The three-file protected amendment remains unapplied.

## Separate exact owner checkpoint

Approval is still required for a new isolated three-file checker-author candidate
applying patch SHA256
`eb38c3fb88478d7773c590f86bae04ce5f3a87dfefc894e9e33051d66a35978a`,
producing F
`4879c0b0f3da8bc2e5d981faae43fe443c317ffcd400b654fc550f0605149a08`,
H `2a6ffb692443a7830df021e9a8cce048ac4388947e03a27af4286b4e26ee9a25`
and G `9ed3efe744bdb9003d3d8459e62dd5fe9479475768df6cb58dc4d8257ef37b00`.
No earlier approval is consumed or broadened. No operational installation, hosted
Auth, SQL/grants, payment, merge, deployment or recovery execution is authorized.
D1–D3/A01–A12 and all release gates remain. Release1.0 NOT READY / NOT AUTHORIZED.
