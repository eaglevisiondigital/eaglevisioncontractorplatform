# Intake queue source context during loading

This isolated package starts at frozen draft311
`d8d85760f9188d83a631328d9211421470002e8a`. It changes only the existing
`IntakeQueue.tsx` and adds one browser regression file, its test-only harness,
this note and one dedicated workflow. Sales310 and Main's separate Sales/Finance
composition are unchanged. Original source pins, checkers, registers, styles,
markup, navigation and assignment authority are not widened.

## Demonstrated ordinary workflow gap

`useResource` intentionally retains the last result while loading. The queue
rendered those retained rows and assignment forms after a user selected another
status or page. In each of the three original contractor fixtures, ten former
rows and ten enabled assignment buttons remained visible while the original
reader's disjoint next result was held. The pending Closed result contained
three rows; the pending second page contained seven. The fixture uses the
original seeded request plus sixteen additional `Operations.sampleSubmit`
submissions per company, then original `assignIntake` to prepare review statuses.

This is an ordinary same-company UX/source-context defect. It does not demonstrate
a tenant or Auth bypass, a wrong-record write, genuine customer approval or a new
inquiry-to-estimate/job relationship. No assignment was invoked in the six RED
witnesses, and all canonical request bytes remained unchanged. App already keys
the company/section owner; no cross-company leak is claimed.

## Minimal existing-component correction

The original reader result retains its repository, organization, status and page
context. Existing cards, forms, empty state and pagination render only when all
four match the current props/selection and the original resource has finished
without error. Loading retains the original resource status. Newer status choices
remain available, and the original resource's cleanup still discards late former
queries. No generic resource hook, reader, RPC, permission, schema, business store,
assignment command, App route or product preview is changed.

## Actual bounded verification

- Initial six-case run: three expected page-affordance failures and three status
  locator timeouts at the unchanged 30-second limit. Raw report
  `1cfbfce508cce39dc9fd8ebc0f6acff1d1492d770339b475c2519dbfeeadf492`
  remains preserved. The test-only status locator changed from exact label text
  to the actual named combobox; no runtime, assertion or budget changed for that
  correction.
- Corrected RED investigation: six expected affordance failures, zero timeouts,
  skips or retries. Raw report
  `8653b95da9bc797c755670464c1829d1148b63f0b94c9c62fd3ecf8d65629da3`.
- Nine additional new controls run separately against unchanged parent source:
  9 PASS. Raw report
  `fe8b72093eb2661439d4510a0d583fa058bdb5887bea947ce0af59b91974d88f`.
  They prove an exact newly loaded request still uses the original assignment
  command, `canManage=false` has no assignment affordances, and the original
  late-query guard preserves newer results, across all three brands.
- Corrected component, full final new file: 15 PASS, zero failed/skipped/flaky or
  retries. Raw report
  `bfae8af9dc7ba3bbf5352061af0625bc36ea61076e73e9b7dd434bf54f2881bd`.
  The six regression identities additionally require exact pending results/forms
  to reappear after release. The nine controls are part of this final file; the
  earlier six-case test/harness source and all separate reports remain retained.
  These reports are not a fabricated single parent15 run or cumulative distinct
  coverage claim. Timing differences are not a performance measurement.

All executions use one worker, no retries, the original 30-second case limit and
5-second assertion limit. Browser testing compiles the real component and engines
into a controlled intercepted test document, following existing fixture conventions.
No App server, product route, HTML entry, new canonical store or external request
is used. Fixtures and assignment controls are disposable local synthetic evidence,
never genuine authorization or operational acceptance. No prior successful app,
browser, Foundation or recovery suite is rerun for counts.

The dedicated workflow runs only these fifteen desktop Chromium cases with literal
identities/no skips. It checks the sole311 M1/A4 author or exact same-tree original-base
PR carrier, all 2,193 tracked Git blobs/hashes before/final, strict TypeScript,
generated types, scoped lint/format, feature locks and production build. Workflow
source review or local results do not assert a future hosted PASS. No whole
Foundation, mobile, accessibility, visual approval or combined-source acceptance
is inferred from this scope.

Original protected128, five design locks/thirteen bindings and25 feature records
remain unchanged. D1 eleven people remain UNASSIGNED; D2/D3 separate; A01–A12
NOT RUN. Preserve November4 main owner-witnessed synthetic loss PASS only,
duplicate UNKNOWN/UNVERIFIED, both private folders and consumed attempts untouched.
All recovery/P1-on13/customer14/4B, Auth/MFA, financial/provider/communications,
hosted/production/deploy/merge restrictions remain. Release1.0 is
**NOT READY / NOT AUTHORIZED**. No operational action is authorized by this package.
