# Cycle 29 · explicit unattempted maintenance selection clearing

Owner: `/root/cycle29_field_growth`. Branch: `codex/cycle29-maintenance-selection`.
Sole implementation parent: `067b08b1c3f2e2e2bd259639c636eb13a2c079d4`.

Selecting the existing “Choose exact occurrence” option after choosing a maintenance
source previously called the native exact selector with an empty key. The original
selector correctly rejected it, but the UI retained the previous private source and
displayed an action-held error. Nine actual browser cases reproduce that mismatch
across all three brands and desktop/tablet/mobile.

The existing native action component now handles that empty presentation selection
by clearing only its selected reference, proposed date/kind, confirmation and prior
verification. The source desk and requested purpose remain. A reread does not silently
reselect the old occurrence; an operator can explicitly choose it again. Attempted,
terminal and UNKNOWN selections keep their original disabled selectors and custody.
No native helper, review owner, plan, enrollment, consent, suppression, renewal,
business store or sender changed.

## Local evidence

- Original runtime: 0/9 browser cases PASS; all nine identify the retained prior
  source after explicit empty selection. No outside requests.
- First corrected runtime matrix passed the workflow assertions but failed the new
  Axe harness because `browser.newPage()` does not provide Axe's required explicit
  browser context. That failed report is retained. The harness now uses
  `browser.newContext()`; assertions and timeout budgets are unchanged.
- Final actual browser: 9/9 PASS across three brands and desktop/tablet/mobile.
  Explicit clear withholds old source/action/confirmation controls, reread preserves
  the empty selection, explicit reselection permits only the original blocked local
  staff review, and original attempted holds remain disabled. Zero native plan or
  consent writes, outside requests, Axe violations or page overflow.
- Existing C26 maintenance revalidation and C27 consent/privacy suites: 38/38 PASS,
  including stale sources, revocation, foreign contexts, UNKNOWN/no replay and OFF.
- Strict TypeScript, scoped ESLint, Prettier and whitespace checks PASS.

Disposable component screenshots verify native behavior and responsive structure;
Main separately verifies the combined approved workbench. No visual approval is
inferred. Runtime SHA256:
`015fcbbdeaec53a24d7036a909befe75382203e7048d180addf96f0e486e7245`.

Reproduce with `node tests/program/cycle29-maintenance-clear-browser.mjs final` and
the two named retained Vitest suites. Private raw reports and nine PNGs remain under
`artifacts/cycle29/`; they confer no canonical state or restoration authority.
Main owns exact source admission and normal automatic GitHub CI; local PASS is not CI.

Purpose consent, current suppression, enrollment, renewal terms and atomic consent
at send remain unverified/blocked. No native plan cancellation or message execution.
All original approved designs/artwork, P1/customer14/4B, recovery, Auth/MFA, NMI,
financial/dispatch/provider/hosted/deployment restrictions persist. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.
