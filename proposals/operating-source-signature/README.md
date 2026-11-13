# Unapplied source-signature correction

This patch changes only private descriptor capture inside the existing
`dataSignature` function. Every invocation still captures fresh descriptors, follows
the same proxy-trap sequence and validates all data before serializing. It adds no
source/authority cache, business engine, writer or operational adapter.

- Parent: `af36a27e34b77bfef3700d7cd87fdb39c4dc50d5`.
- Original runtime SHA256: `7a5272ae344400714dea1efe727a40c19a10c96ccfdf70f7321e127488bbd239`.
- Proposed runtime SHA256: `a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544`.
- Patch SHA256: `da9db5c5e953c859ab24dc127c48b1d78e0cd1d6e2b7bbe9edf4b444a40ae4a0`.

Existing Vitest qualification applies the exact patch only in a fresh temporary
directory. It compares 3,045 cases, exact accepted JSON bytes and proxy traces;
getters/toJSON are not invoked, shared references remain freshly checked, cycles
reject and post-mutation signatures change. One rejected proxy-add-key input now
has an explicit Own-data error instead of a TypeError; acceptance is unchanged.
Metadata/patch self-rebinding rejects, and the actual Cycle24 barrier still denies
the proposed bytes. The unchanged Cycle9 CLI also denied the dirty disposable copy.

A disposable copy with only this function changed passed all20 original failed
cases selected from Cycle18/22/23/24/25 (six files,192 unselected), retaining
30-second test/hook budgets and four workers. This is proposed-source local proof,
not a clean candidate, hosted acceptance or closure of Ubuntu timeouts. Local
single-case observations were12.32s original versus10.93s proposed; they are not a
portable performance guarantee. CPU profiling identified repeated fresh snapshots
and descriptor-safe serialization as the dominant local work; it cannot reconstruct
historical runner load or establish the only cause of every hosted timeout.

## Separate exact owner checkpoints

First, owner may authorize one isolated unmerged M1 source-author candidate with
sole parent above, applying only the exact patch to
`src/lib/workflows/operating-center-runtime.ts`, preserving mode100644 and producing
the exact proposed hash. No checker/pin change or execution authority follows.

Then independently review that actual author and the exact finite admission diffs
for BOTH Cycle9's original hash and Cycle24's original critical Git endpoint.
Preserve historical bytes/pins and unknown-edit rejection. No admission is approved
by this package. D1–D3, A01–A12, Auth, custody, recovery, NMI, hosted and release
gates remain unchanged. Release1.0 NOT READY / NOT AUTHORIZED.
