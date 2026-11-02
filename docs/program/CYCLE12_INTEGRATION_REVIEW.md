# Cycle12 independent combined-source review

Status: CLEAR within the bounded local source-review scope. No product-source findings remain. The test-only CI portability correction passes local verification; corrected exact-head CI remains unverified. This report grants no operational or release authority.

## Exact source scope

Independent review uses `codex/cycle12-integration-review` over exact parent
`2691fcf9aafb77f831899144c020a8d562222722`. The original owner checkout is read-only.
The reviewer owns only this document and `tests/cycle12-integration.test.ts`.
All 34 author files were copied as exact committed blobs for testing and remain
uncommitted in the review worktree. No author source, original engine, shared file,
parent, approval or protected source was edited.

| Package                     | Exact author commit                        | Files |
| --------------------------- | ------------------------------------------ | ----: |
| Field schedule revisions    | `7747245d133b9ed06d3c896a4453635f4606af00` |     7 |
| Finance evidence            | `cc24f8992a90c396a755ac7411dd23b696b3aa39` |     5 |
| Service lifecycle           | `ee5db644f770f91dc6d88ce914d66cb9a19c5e12` |     5 |
| Consent cancellation        | `a4e53a300f685ad48a9922feca2fabfd0e17c079` |     7 |
| Verified suggestions        | `6fbb0ed6006e7c08ed023f82a81f367daa782df7` |     5 |
| External proposal lifecycle | `11f0cfbb77ed1822f402442b2e2143fb7a7029f9` |     5 |

README, AGENTS, current build state, architecture, security model, decisions and
Main's Cycle12 assignment/shared/design contracts informed this review. Main's
optional mount, scorecard and public source-citation changes were inspected read-only.
No runtime test invokes Git or requires historical objects in shallow CI.

## Independent evidence

The combined suite uses one actual `prepareOperatingSources` repository environment
per contractor, including all three brands, four exact jobs, three customers and
properties, two existing workers and two distinct jobs at one property. It does not
combine independent fabricated source stores for individual modules.

- Actual original ReleasePreview commands create explicit synthetic contract,
  invoice, authorization, capture and partial-refund fixtures. Assertions follow
  event→invoice→contract→original offer→immutable issued version→job/property,
  compare the canonical ledger verifier result and ensure a same-property sibling
  receives no inferred invoice. Empty or unlinked evidence remains UNKNOWN.
- Exact request, original receipt, issued scope, plan, visit and published-report
  references remain distinct. Customer-safe lifecycle data excludes private costs,
  staff/workforce fields and suppliers. Each exact scope line, completion,
  acceptance and warranty requirement remains UNKNOWN; published after-phase
  observations and checkmarks establish no physical completion.
- Suggestions require original source identity and recognized recorded workflow
  state. An unchanged exact visit ID with an unrecognized phase remains UNKNOWN.
  Matched documentation retains physical-acceptance and genuine Auth gaps.
- Shared eligible-staff revocation denies every retained package and previously
  inspected navigation. Foreign tenants/jobs/candidates, executable getters,
  roundtrip copies, original admission withdrawal after real asynchronous digests,
  default-OFF and explicitly enabled remote HTTPS surfaces fail closed.
- Schedule reviews preserve original lineage, exact revision CAS, fixed expiry,
  cancellation/revocation and immutable earlier evidence. External proposal
  workflow mismatch remains quarantined even with matching immutable source IDs.
  Expiry/revocation cannot renew preparation; the original advanced engine and new
  wrapper consume the same underlying one-use hold.
- Both actual disposable SQLite extensions exercise permanent claims, lost ACK,
  missing receipts, exact read-only reconciliation and forbidden replacement IDs.
  Participating cancellation/revocation/suppression precedes and denies a synthetic
  boundary; stale withdrawal CAS cannot overwrite newer evidence. A real second
  process races suppression against a held native boundary: its later serialized
  withdrawal is visible without rewriting the immutable earlier receipt.
- Before/after snapshots of actual CRM-derived canonical source, property and
  release records match; writer spies and network spies remain untouched. Browser
  adapters neither import nor connect to the disposable writers, provider ports,
  persistence or execution. Every authority field remains false or explicitly blocked.

Main's additive initially collapsed navigation group preserves the original 8
sections, 6 Cycle10 reviews and 7 Cycle11 panels. Source details and separately checked
job navigation remain distinct; source headings are focus targets, evidence regions
are named/focusable, controls use scoped 44px styling and visible labels remain in
accessible names. Public scorecard citations project only public path/anchor data;
25 capability-stage values and 8 Phase One gates remain independent and unpromoted.
This is source-level accessibility/navigation review. Actual all-brand responsive,
keyboard, axe, screenshots and production-OFF browser evidence are Main's separate
validation, not independently claimed browser execution here.

## Verification

Original local verification at reviewer commit `822858090a2a87870598cfab1eda5a5546127a82`:

- `npx vitest run tests/cycle12-integration.test.ts --reporter=json --outputFile=/private/tmp/propel-cycle12-independent-results.json`: **48 PASS / 0 FAIL / 0 pending**, actual machine-readable result retained at that private path.
- `npx tsc --noEmit --pretty false`: PASS over all six final author packages and the combined test.
- `npx eslint tests/cycle12-integration.test.ts`: PASS.
- Prettier check for both owned files and whitespace checks: PASS.
- `node scripts/check-cycle11-integrity.mjs`: PASS, including protected and all retained author/independent source identities.

### Actual CI timeout and bounded portability correction

Dedicated Main CI run `41529254948` at exact Main head
`d0fa1a0d2e32b6f2a755cd2bd60ed2adb6c31b54` recorded **480 PASS / 1 FAIL /
0 pending** across 481 cases. Its actual retained application JSON is
`/private/tmp/propel-cycle12-failed-ci/artifacts/cycle12/application-results.json`.
The sole failure was the third all-six-workflow composition scenario exceeding
the existing 30-second Vitest execution budget, with no failed assertion. The
other two composition scenarios also approached that budget:

| Brand scenario | Actual CI duration | Outcome                |
| -------------- | -----------------: | ---------------------- |
| 0              |       28,693.799ms | PASS                   |
| 1              |       28,543.738ms | PASS                   |
| 2              |       30,838.565ms | Test execution timeout |

Only these three parameterized composition cases receive an explicit finite
90-second test execution budget. All 48 cases and unconditional assertions remain
intact, using the actual existing engines. The other 45 cases retain their existing
30-second default or explicit native-test bound. Product review expiry, admission,
source/CAS/UNKNOWN semantics, native waits, worker deadlines and all author bytes
remain unchanged. No global timeout, engine mock, assertion removal or split weakens
the combined-source check. The original failed CI remains evidence; local success
does not relabel it green or establish corrected-head CI acceptance. No manual CI
rerun is requested or performed.

Corrected local verification:

- Targeted test-name filter selected all three complete composition cases: **3 PASS**, with 45 unrelated cases excluded only by the command-line filter. Actual durations were 16,210.693ms, 14,203.188ms and 26,185.104ms. Machine-readable result: `/private/tmp/propel-cycle12-independent-targeted-corrected.json`.
- Complete unchanged suite: **48 PASS / 0 FAIL / 0 pending**, 166,403.733ms suite duration. Its three composition cases took 13,417.519ms, 11,953.370ms and 16,151.144ms. Machine-readable result: `/private/tmp/propel-cycle12-independent-corrected.json`.
- Strict TypeScript, scoped ESLint, Prettier and whitespace checks: PASS.
- Removing only the two explanatory comments and one explicit test-budget argument reproduces the previous test file byte-for-byte. All assertion bodies and 48 cases are unchanged. All 34 author blobs still exactly match their listed commits.

Corrected exact-head automatic CI: UNKNOWN until its new-source run completes.

Independent additional cross-check: five finished author suites (Field, Finance,
Customer, Intelligence, Advanced) passed 261 cases on exact copied source bytes.
This count excludes Growth and overlaps the combined workflow coverage; it is not
summed with independent or Main counts. C11 integrity passed with 128 protected
hashes, 5 design locks/13 bindings and all retained C6–C11 source unchanged. All 34
Cycle12 author copies were independently byte-compared to the exact commits above.

## Findings and trust limits

No product-source defect identified; the final 48-case run passes without skipped or pending cases.
Reviewer-harness corrections preserve strict validation: disposable paths and
commands must use the existing lab-only names, and remote-enabled unavailable
surfaces are checked for zero source reads and zero active source controls.
No author validation was weakened, skipped, or changed to accommodate a test.

Same-owner filesystem alteration, reset/replaced databases, external restoration,
clock/source callback truth, global Auth/source atomicity and independent physical
recovery are not verified. A missing exact receipt remains UNKNOWN and never permits
replay, replacement or a fresh business attempt. Browser state is same-tab review
metadata; native stores contain disposable participating synthetic metadata only.
Neither is operational custody, genuine Auth/MFA, real availability, dispatch,
physical acceptance, contract approval, messaging or financial execution.

All13/customer14/original4B/P1/four artifacts/approvals/2A–2F/billing/Netlify/executor/
recovery/MFA/NMI/Auth/provider/financial/hosted/production/deployment/merge gates
remain intact. No hosted operation, credential, migration, sender, provider call,
production action or persistent background execution occurred. Release1.0 remains
NOT READY / NOT AUTHORIZED.
