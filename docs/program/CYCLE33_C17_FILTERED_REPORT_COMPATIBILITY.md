# C17 filtered-result status compatibility

Base: `5d695378f6f8573f99628116611c71c755c60c06`.
This is a CI report-parser correction only. The original head, test results,
source authors, historical failures and incomplete Foundation evidence remain
unchanged. The focused verification executes only report validators; no application test or
successful hosted job is manually rerun for this correction.

## Demonstrated report mismatch

The retained actual C17 failed-only report has SHA256
`092a42c12fd45cf8b12e989cfd846db1d5e7d412420a92a318f36fc9563a393e`.
It contains 45 collected assertions, one passed original repaired assertion,
44 filtered assertions, zero failures and zero todos. Its aggregate
`numPendingTests` is44, while each filtered assertion's `status` is `skipped`.
The pinned Vitest result does not label those individual assertions `pending`.

The original embedded partial-result gate expects those44 per-assertion statuses
to be `pending`, so it rejects that actual report with:
`Exact repaired C17 assertion required; other44 remain filtered`.
The gate was replayed verbatim against the unchanged retained JSON, with only its
artifact reader bound to that report and its original source-root path context.
This is a parser replay, not another test execution or new candidate acceptance.

## One-token correction

Only the final per-assertion comparison changes from
`t.status !== 'pending'` to `t.status !== 'skipped'` in the existing C17
partial-result gate. Every other workflow byte is unchanged at this correction
stage. The original45/onePASS/44filtered counts, exact repaired case identity,
zero-failure/todo checks, original assertions, source bindings, other strict
gates, dependencies, retry policy and time budgets remain mandatory.

The corrected embedded gate accepts the same unchanged JSON. This establishes
status-label compatibility for the retained report; it does not turn the44
unexecuted assertions into passes or establish a full45-case C17 PASS.

| Source or replay                   | SHA256                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| Original whole workflow            | `d3d3fde6f05f549eedc5271a2584a9b048afc32c02b3608cbebd8ae45676e27e` |
| One-token corrected whole workflow | `5bcaef97fd29b0da0b43172890c569cc39cbf998bf9fee1e22934adf69f64b30` |
| Original embedded partial gate     | `0e4a1252ca657d660058345ab88de0a5bbe882f81373202ca9193a175f17d75f` |
| Corrected embedded partial gate    | `eb807490d9eaac8dbb245d8d42d9b8655a5b6605fb2d6247eda313c810a16776` |

## Actual hosted evidence and isolated verification

Main289 remains unchanged at exact5d695378. Direct-push run42306798709,
job128198070248, failed only the final report gate at22:54:29UTC. All prior
application/source steps and final clean binding succeeded. The original failure
verdict is preserved. The actual raw collections contain **293 PASS** in five
strict reports (61+91+56+58+27), plus the separate original C17 **1 PASS /44filtered**.
All44 filtered rows have native `skipped` status with aggregate numPendingTests44.
No full45-case PASS or complete Foundation result is inferred.

Artifact13546114381 is29005bytes, ZIP SHA256
`05a9f9da336f87bf38e2dc200709862ab0163c12bf05c84cc0e4051bae2b6ada`.
The original before/final binding digests are
`1cf6e0d041aa50c1025ea26eec3bd59b91113fadcf7c0ae8781adda5b53f114f` and
`c2e3a2bf077a4a3c11ce38f5f0830ccfd2d9d51c40e6b492e53a6b047150e63e`.
Independent artifact proof: `b001cc5cc41c8c1b3ba7cdb7066ced966f471d884e292df79b9b7f9090a4c9fb`;
terminal-log classification: `fe7fdf81c9385728820f59069256e9df40eb635af35443f7c3234dd5185dff4c`.

The new five-minute source-only workflow downloads exactly that immutable ZIP,
verifies its complete before/final binding hashes, actual original5d tree4614d311,
all117 Git source hashes and22 admission identities. The candidate must have sole
parent5d and exactly three regular CI/doc files. It checks the entire original
workflow differs by only the single filtered-status literal; all runtime/test
sources and original budgets remain unchanged. It reproduces the old gate's
specific failure, then executes the three existing corrected report validators on
the preserved JSON. No application test is executed by this focused verifier.

Its proof names original execution head5d separately from the new gate head.
A successful report-verification check does not become new-head application
execution, a repaired historical job verdict or full Foundation acceptance.
Automatic pre-existing Foundation checks remain separately reported.

## Boundaries

No business source, test, record, engine, store, protected file, approved design,
migration, operational role or acceptance status changes. Original Foundation
cancellations, the historical270-case conflict and Cycle18 failures remain
separate evidence. Physical recovery, P1/customer14/4B, MFA/Auth, NMI/settlement,
Netlify and production acceptance remain separately gated.

No merge, deployment, hosted mutation, credential access, operational restoration,
payment, communication or dispatch is authorized.

**Release1.0 remains NOT READY / NOT AUTHORIZED.**
