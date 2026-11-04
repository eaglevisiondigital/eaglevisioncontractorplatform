# Cycle 23 · actual source-consistency browser evidence

The new suite uses the original Operating Center, prepared canonical repositories,
retained workbench selection, original correction forms and exact source callbacks.
This new suite does not edit the original C21/C22 browser files. Separate prior-CI
reconciliation records the C21 test-only routing and contractor-design fixed-date
corrections in `CYCLE23_PRIOR_CI_FAILURE.json`; the C22 browser suite is unchanged.
Three finite workflow scenarios run across the three approved brands and
desktop/tablet/mobile: **27 DEV cases**.
Production-OFF is independently checked in all three layouts: **3 cases**.

Scenarios cover recorded task lineage and canonical material/financial requirements;
exact actual request and published report/visit/plan/job/version drill-down, original
same-property handoff and current occurrence requirements; and source staleness plus
mode-switch retention of the original UNKNOWN command custody without replay.
The nine request/property journeys use actual focused Enter/Space presses through
shared record search, job selection, tabs, source review, original same-property
handoff and the next financial review. Trusted key events and exact before/after
job identities are collected separately; programmatic clicks are not counted as
keyboard evidence. UI fixture preparation/typing is outside the measured sequence.

The isolated DEV server uses port 4423, OFF preview uses port 4433, one worker, zero retries. Original
source-review limits remain 150 seconds per test and 15 seconds per action. The default Foundation config's
original 4173 production/4206 DEV servers are respected by the new spec's exact DEV
baseURL fixture. Each new DEV scenario explicitly declares that same 150-second budget,
so original-config admission does not silently substitute its 30-second default. Scenario
duration includes repeated axe scans, source assertions and real PNG capture; it
does not measure operator task efficiency. No old test budget or assertion is
changed. No live provider or external network request is permitted.

Commands, from the Main worktree:

```sh
mkdir -p artifacts/cycle23
npx playwright test --config playwright.cycle23.config.ts --list --reporter=json > artifacts/cycle23/browser-development-collection.json
npx playwright test --config playwright.cycle23-off.config.ts --list --reporter=json > artifacts/cycle23/browser-production-collection.json
node scripts/collect-cycle23-browser.mjs --collect
npx playwright test --config playwright.cycle23.config.ts
# Reuse Main's single already verified build; do not rebuild frozen artifacts.
npx playwright test --config playwright.cycle23-off.config.ts
node scripts/collect-cycle23-browser.mjs --complete
```

Collection is explicitly **not PASS**. Complete validation requires actual one-attempt
27/3 reports, no duplicate/missing/skipped/flaky cases, 81 real PNGs and companions,
and all nine actual keyboard proofs. The collector binds each capture to 59 exact
runtime source files, authoritative brand IDs, viewport/scenario/source job identity,
actual checkout/dirty state, PNG SHA-256, 128 protected files, five design locks and
13 bindings. Any changed runtime/source byte or missing proof fails closed.

Axe runs without exclusions; responsive checks cover horizontal overflow, overlapping
headers and 44px visible buttons. Screenshots are browser evidence, not invented
mockups, physical-device verification or owner visual approval. Three approved design
scopes remain locked; Operating Center/advanced visual approval stays PENDING.

The final DEV run passed all 27 cases in 11.5 minutes. The final production-OFF run
passed all three layouts after Main rebuilt the corrected runtime. Both reports
record zero failures, skipped or flaky cases, and zero retries. Complete collector
validation passed: 81 PNGs, 81 companions, nine trusted keyboard journeys, 59 runtime
sources and all 128 protected files/five design locks/13 bindings. Each keyboard
journey recorded 20 trusted Enter/Space events with exact retained and destination
job identities; these nine journeys are part of the 27 DEV cases.

All 81 captures record exact runtime commit
`fb27473b20f910ec3faf0fb9e032b4fb016532f2` and truthfully record the working tree as
dirty while the new browser/checker files were uncommitted. Every runtime byte
matches the final 59-file binding. No outside request was observed. The owned
4423/4433 servers and original-config 4173/4206 servers stopped after testing.

Actual local evidence SHA-256 values:

| Report                                            | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `artifacts/cycle23/browser-results.json`          | `aa900447d6023e1584c441fe7629acdc7aa9e076d9c17449a6ddd7b783bbf3e7` |
| `artifacts/cycle23/browser-off-results.json`      | `5d33ad3b603c84f4667ca5b515dc8586cf3b343a6d3b2d2b62cb612c23c67b5d` |
| `artifacts/cycle23/browser-capture-manifest.json` | `22b05ce9cd5bd7694d853424f264a03a30bb17b64ea9532a2dd9d011acf27e3a` |

A bounded compatibility run through the original `playwright.config.ts` also
passed the same straight-edge request/property journey on desktop/tablet/mobile,
using its existing 4173/4206 servers and the new suite's explicit 150-second contract.
`artifacts/cycle23/browser-original-config-compatibility.json` has SHA-256
`ee9cce9f4debb13a1f1cc70d9a1dd50edfb1beb859a0eb18443193259254a6af`.
These three executions repeat representative cases and are not added to the 30
unique dedicated browser cases. The original-config report records 32.5/31.3/33.7 seconds,
including accessibility and screenshot work, with no failures, skips or retries.

Earlier isolated browser runs exposed genuine new-panel accessibility defects:
Finance category-source buttons omitted part of their visible wording from their
accessible names, and five definition labels missed the required text contrast.
Intelligence source buttons also omitted visible wording, while repeated
earlier/current fact landmarks lacked unique labels. The respective author
branches received bounded presentation corrections; readers, ranking, authority
and command custody were unchanged. Final evidence binds those corrected files.
Private diagnostic failures and the earlier pre-correction OFF result remain
historical evidence; they are not relabeled as final successful execution.

No communications, dispatch, provider/payment/NMI, hosted mutation, migration,
publication, deployment, merge or operational restoration is enabled. Danny's
physical independent-device rehearsal remains UNVERIFIED / NOT RUN. Release 1.0
remains NOT READY / NOT AUTHORIZED.
