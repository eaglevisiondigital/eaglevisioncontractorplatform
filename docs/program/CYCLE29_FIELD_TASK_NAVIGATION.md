# Cycle 29 · exact original task-control availability

Owner: `/root/cycle29_field_growth`. Branch: `codex/cycle29-task-continuity`.
Sole implementation parent: `067b08b1c3f2e2e2bd259639c636eb13a2c079d4`.

The existing receipt action rendered an enabled original-controls button even
when its original inspector reported `ORIGINAL_CUSTODY_HELD` or
`NATIVE_SOURCE_NOT_ELIGIBLE`. The actual destination correctly denied the action;
the UI invited a known unsupported handoff and then reported a generic stale error.
Nine new canonical-source cases reproduce this across all three brands. Three
eligible-source positive cases pass before the correction.

`TaskReceiptActions` now disables that handoff for those exact original outcomes
and states the original reason. An unattempted eligible source still offers explicit
navigation, subject to the unchanged original final check. Read-only verification
and receipt reconciliation remain available. No helper, canonical engine, custody,
receipt, source relationship, store, navigation callback or capability changed.

## Local evidence

- Initial new regression: 3 PASS / 9 FAIL against unchanged parent runtime.
- Combined retained/new run after correction: 52 PASS / 3 FAIL. The three failures
  were the new UNKNOWN tests counting their deliberate lost-ACK fixture invocation
  as a subsequent write. Restoring the original spy before counting read-only
  operations corrects only that new harness baseline.
- Final new regression: 12/12 PASS. The retained C26/C27/C28 suites contributed
  43/43 PASS in the combined run. The unique union is 55 across disclosed runs;
  this is not a claim of one clean same-head 55-case run or GitHub CI success.
- Actual browser: 9/9 PASS across three brands and desktop/tablet/mobile. Exact
  task selection survives explicit reread after lost ACK; UNKNOWN still disables
  navigation before/after read-only verification/reconciliation. The single
  deliberate writer failure is never replayed. Current staff revocation withholds
  the private task ID. Zero outside requests, Axe violations or page overflow.
- Strict TypeScript, scoped ESLint, Prettier and whitespace checks PASS.

The disposable component screenshots verify native control behavior and responsive
structure; Main's combined workbench evidence separately covers full-shell design.
These captures do not grant visual approval. Runtime SHA256:
`e632c5a86d08e8e3755f101b87c5c754509dff09738a23b20a86213b7b21ebb1`.

Reproduce with `npx vitest run tests/cycle29-task-navigation.test.ts` and
`node tests/program/cycle29-task-navigation-browser.mjs final`. Private local raw
reports and nine PNGs remain under `artifacts/cycle29/`; they are not business
state or restoration evidence. Main owns exact author admission and automatic CI.

Original one-use/UNKNOWN custody, current authorization, source checks, locks,
production-OFF behavior, approved designs/artwork, P1/customer14/4B, recovery,
Auth/MFA, NMI/financial/communication/dispatch and deployment restrictions remain.
No operational persistence or recovery adapter, hosted action, merge or publication.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
