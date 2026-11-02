# Unified Property Passport timeline · isolated Cycle 4 candidate

Exact parent: PR #15 `d14da6a4b4aae505eedfbd5c6d8b912ecc6c3fb4`.
Branch: `codex/program-passport-timeline`. Local synthetic read-only implementation;
not mounted in App, the approved property portal or a connected customer route.
No new store, schema, business ID, completion ledger or provider dependency.

## Actual implementation and source ownership

`createPropertyPassportTimeline` composes the existing
`createPropertyPassportJobHistory` snapshot. Existing customer-preview authorization,
CRM service location, issued Phase3 baseline/version, published report and immutable
plan/job source checks remain authoritative. The implementation does not weaken
`projectIssuedReview` or replace any report, job or estimate calculation.

Two event kinds share one property-bound view:

- Inspection documentation retains exact report ID/published version, recorded
  `visited_on` date, publication instant, source-position checklist and findings,
  observations separately from recommendations, and exact existing linked job refs.
- Issued job scope retains exact job/estimate/issued version identity, canonical
  issued scope text/quantities/units, original issued instant and its UTC date.

Recorded dates sort descending for display. A visit's date has no time or timezone;
its relation to an issued UTC date is not inferred. Same-day position is a stable
presentation tie-break, not proven chronology, recurrence, improvement or completion.
Publication time is labeled separately from visit date. Available history is not
claimed complete. Missing or ambiguous report/job relationships remain UNKNOWN.

The completion-documentation projection reports an after phase and the number of
checklist items recorded checked, preserving each exact source position. These are
reported document facts. Physical repair completion, warranty and customer approval
remain UNVERIFIED, including for after-phase or fully checked reports. No customer
response, agreement, contract, invoice, receivable, payment or dispatch is created.

## Safe projection, integrity and freshness

All body data comes from the existing primitive allowlisted Passport report/job
projections. No internal price/cost/margin, supplier, payroll, workforce, private
repair/readiness evidence, staff notes, contact details or media is added. Contractor
identity uses the approved existing sample name and color fields; no new artwork.
Reports with extra fields inside the strict finding shape fail closed; private
outer source fields are never copied. Observations and recommendations stay separate.

Detached snapshots/events are deeply frozen. Existing `documentHash` supplies each
event SHA-256 and the complete timeline SHA-256. Original strict-true admission remains live through inherited readers and is checked
after each new asynchronous boundary and before AVAILABLE. The composed source
snapshot is read again after all new hashing waits; changed source/context/branding withholds
output. Hashes establish fidelity, not truth, authenticated custody or completion.

`readPropertyPassportTimelineEvidence` pins named primitive exact references before
await and returns AVAILABLE only for the same current source and digest. Missing,
changed, denied or ambiguous evidence returns UNKNOWN with no fallback to latest,
new ID, fuzzy text match or mutation/replay. New linked report evidence changes the
job documentation event digest; an old immutable snapshot never silently updates.
Unchanged exact published report evidence remains readable through the existing
report reader. A timeline event also binds its associated job references; new
fallback-plan association evidence can change that event digest, conservatively
returning UNKNOWN for the retained event even when the published report is unchanged. These are reads, not a persistent archive or crash/refresh custody.

The exported React component owns its model-object and current customer/property/
version context boundary. It immediately resets retained cards/details on a parent
rerender with changed model/context, independently of a caller key, and discards
late reads from the unmounted inner view. The existing model has no subscription:
its caller must rerender after selection/session changes, as this fixture does.

## Local demonstration

From this worktree with existing pinned dependencies:

```sh
VITE_PASSPORT_TIMELINE_TEST=true npm run dev -- --host 127.0.0.1 --port 4193 --strictPort
```

Open `http://127.0.0.1:4193/tests/browser/fixtures/passport-timeline.html`.
The fixture requires DEV, exactly that flag and literal `127.0.0.1`; it is not a
customer URL, connected route or production-build entry. Default component props
show OFF with no evidence controls. The fixture's collapsed-capable local test
controls explicitly prepare existing synthetic engine examples; no automatic
preparation occurs. Ordinary app build output excludes the harness/component.

Choose any of the three approved contractors, prepare existing synthetic evidence,
then load the timeline. Filter by inspection or issued job scope; open exact sources.
Source navigation focuses the report/job heading and follows only exact linked
report/version/job refs. Choose the second authorized property for an honest empty
state; end the synthetic session for the unavailable state. Test-only paused real
read controls demonstrate context-switch/late-result rejection without fabricating
a business result. A different source model is supplied without remounting the
exported component, exercising its own lifecycle boundary.

## Focused proof

- 28 new source-based domain cases PASS. The earlier131 related-case run passed
  before three additional original-admission withdrawal regressions; final combined
  compatibility evidence is recorded separately by main.
  Covers all three companies, actual issued/report/version/property identity,
  ordering meanings, immutable/integrity checks, private field exclusion/rejection,
  UNKNOWN links, exact retained references including key reorder and caller mutation,
  current source/context loss across waits, original admission withdrawal during first/
  final history reads and exact retained reads, default OFF and no business side effects.
  Two unchanged independent pre-fix failing admission reproductions now pass.
- 12 actual Chromium browser cases: desktop/iPad Mini/iPhone13 × three contractor
  companies, plus default-OFF component in each viewport. Exact source focus and
  linked job/report navigation, empty/error, model replacement without caller key,
  same-model property switch during a paused real job read, discarded late output,
  no horizontal page overflow, no external requests and unchanged full axe scans.
- Strict types, full lint, focused formatting, build and features:check pass. The
  existing five locked CSS/artwork files and thirteen source bindings are unchanged.
- Main approved only the new read-only dedicated `Passport timeline preview`
  workflow: pinned existing Node/dependencies, loopback tests, screenshot artifacts,
  `contents: read`. Existing workflows/guards/dependencies are unchanged. GitHub CI
  is separate evidence at the final committed SHA, recorded by the main integrator.

Real synthetic screenshots (ignored local evidence) are
`artifacts/property/passport-timeline-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}-{report,job}.png`.
The approved customer and contractor screens/artwork are untouched. No visual
promotion, universal accessibility certification or hosted acceptance is claimed.

## Preservation and remaining gates

All thirteen historical migrations, unapplied customer fourteen, original 4B,
frozen P1/four artifacts, owner approvals, Workstreams 2A–2F, billing proposals,
Netlify package/executor and recovery evidence remain unchanged. No credentials,
Auth, hosted mutation, publication, deployment, merge, financial/provider or message
execution. Recovery/P1/customer14/exact4B+broker/NMI and release acceptance remain
independent gates. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
