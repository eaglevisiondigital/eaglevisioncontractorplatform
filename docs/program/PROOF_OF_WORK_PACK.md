# Proof of Work documentation pack · isolated Cycle 5 candidate

Feature IDs: A5 Customer Experience, A8 shared design/integration. Exact parent:
PR #21 `f7a44a8cc5fd7c4add529b6588925f548d2d85b5`. Branch:
`codex/program-proof-of-work-pack`. Owner: `/root/cycle5_customer`.
Owner direction: exact `3bf2e0cfca691cb164e1c42290ccf09ad6804c8a`, first-wave
CUSTOMER assignment; main's Cycle 5 execution contract governs shared ownership.

## Functioning implementation

The separate default-OFF `ProofOfWorkPackPreview` composes the actual existing
`createPropertyPassportTimeline` and exact timeline-evidence reader. Existing
customer-preview, CRM service locations, issued estimate/job/version and published
inspection/finding/checklist projections remain authoritative and unchanged.
No new business record, report, estimate engine, customer/property system, store,
archive, media service, schema or connected route is introduced.

A user explicitly loads their currently selected property's evidence, selects one
to twenty exact published-report/issued-job events, and confirms that selection.
Only then does `prepareProofOfWorkPack` construct a detached immutable snapshot.
No related source is automatically selected; exact existing job/report relationships
remain visible inside the selected events. Report ID/published version/finding ID
and source position, original issued estimate/version/job identity, source event
SHA-256, timeline SHA-256, dates and their meanings are retained. Observations and
maintenance recommendations remain separate. Visit-date and UTC issue-date ordering
never establishes intraday chronology, improvement, repair or physical completion.

The pack contains only the inherited primitive allowlisted safe timeline body,
contractor name/approved colors, exact customer/property reference and label,
selected events, coverage limits and explicit UNVERIFIED completion/acceptance/
warranty labels. It contains no customer-facing financial transaction authority.
Existing issued-only protections are not weakened. Internal estimate inputs, costs,
supplier/workforce/payroll data, staff notes and repair/readiness evidence are not
serialized into the pack. Photos/media are explicitly **UNAVAILABLE** because the
existing authorized projection has no media. No file bytes, paths, signed URL,
thumbnail, storage retrieval or generated download link is attempted; media503 and
quarantine restrictions remain intact.

## Confirmation, integrity and exact current verification

Admission is strict-true, default OFF and rejects non-synthetic repositories before
customer reads. Descriptor-only named primitive selection/reference validation rejects
getters, inherited serializers, extra/symbol fields, duplicate source identities,
invalid versions and coercive inputs. Actual approved sample organization IDs are
retained; customer/property/report/job/version IDs use their existing UUID contracts.
Original admission, selection and human confirmation stay live across current-source
and hash waits. Withdrawal or change withholds the result. Underlying readers recheck
current model/customer/property, CRM, authorized issued-version set and source evidence.

The snapshot is cloned and deeply frozen, with existing `documentHash` SHA-256 over
the complete body. Its deterministic `synthetic-proof-<sha256>` identity is a content
reference, not a new command or authorization token. Repeating an unchanged read gives
the same content identity and has no side effects. No write/replay or retry machinery
exists. Preparation is never automatic on load, selection or an existing-engine save.

Ephemeral WeakMap metadata binds the original deeply frozen prepared reference to
its preparing model and canonical reference contents. It stores no business record,
source archive or durable custody. A cloned, serialized, unknown or altered reference
is UNKNOWN, including a changed timeline digest; it cannot fabricate STALE evidence.
Only the original prepared reference can enter exact current-source verification.

`verifyProofOfWorkPack` verifies that prepared binding against current
customer-authorized evidence. CURRENT requires exact timeline/content hashes. STALE
means a successfully read current timeline differs from the retained timeline binding;
it does not authenticate historical custody or prove physical changes. Missing,
denied, malformed, ambiguous or changing evidence remains UNKNOWN. Even an additional
unselected published event conservatively makes the old full-timeline binding stale.
The old snapshot never silently updates. A newly confirmed current selection can
produce a separate snapshot; the old value remains immutable.

`readProofOfWorkPackSource` checks that a source belongs to that exact selection,
verifies the pack, reads only its exact event/version/digest and verifies again after
the source wait. STALE/UNKNOWN has no latest-version fallback, fuzzy grouping, automatic
replay or replacement identity. Integrity is content fidelity only, never permission,
authenticated custody, delivery, acceptance, warranty or truth.

The React component owns model-object/current customer/property/version identity and
clears retained state when its parent rerenders with changed actual context, without
requiring a caller key. Effect setup restores liveness after React StrictMode's
setup/cleanup/setup check; actual browser fixtures exercise StrictMode. It discards late reads and cancels a live preparation on
unmount or confirmation withdrawal. A parent must rerender after synchronous model
selection/session changes because the existing model has no observable subscription;
the fixture does this without remounting the exported component. UNKNOWN hides the
retained packet; proven STALE retains its unchanged snapshot and disables source use.
No durable browser-refresh, process-crash or cross-tab custody is claimed.

## Local demonstration

```sh
VITE_PROOF_OF_WORK_TEST=true npm run dev -- --host 127.0.0.1 --port 4195 --strictPort
```

Open `http://127.0.0.1:4195/tests/browser/fixtures/proof-of-work.html`.
The fixture requires DEV, the exact flag and literal loopback. Prepare the existing
synthetic engine examples, load evidence, select exact events, confirm and prepare.
Inspect the immutable snapshot and open exact source headings. Add another published
report with the test controls and verify the retained pack to see STALE without
rewriting its identity. Replace the actual source model or change property while a
real reader is paused to observe state reset and late-read discard. Select the second
authorized property for the honest empty state; end the synthetic session for UNKNOWN.
`proof-of-work-off.html` demonstrates default-OFF controls without customer reads.

The approved `/preview/property-portal`, its timeline predecessor, App routes,
contractor workspace, navigation and artwork remain unchanged. New CSS is scoped;
it resets inherited workspace header geometry only inside the isolated preview.
The original transparent Propel derivative and all three approved contractor palettes
are reused. Production build output does not include this test entry.

## Focused evidence and boundaries

- 40 new actual-source application cases PASS, plus 28 unchanged timeline and
  58 unchanged Passport job-history cases: **126 PASS**. Exact selected IDs/versions,
  all three companies, hashes/immutability, unchanged source state, no financial/
  contractual/job/message side effects, tenant/customer/property isolation, malformed
  and duplicate selections, private/media exclusion, original admission/confirmation
  withdrawal, source drift, current/STALE/UNKNOWN, exact source navigation and revoked report/version/CRM/job
  authority, tampered timeline references and nontransferable session provenance.
- Responsive browser cases cover actual desktop/iPad Mini/iPhone13, all three brands,
  React StrictMode, keyboard/source-heading focus, full unexcluded axe scans, no horizontal overflow,
  no external requests, OFF/empty/error, frozen pack after publication, model replacement
  without a caller key, same-model property changes and late-reader discard.
  **12 PASS** (nine brand/viewport flows plus three default-OFF checks); no axe
  violations, horizontal overflow or external requests in exercised states.
- Strict types, full lint, generated-type/source-integrity, formatting and ordinary
  local build checks are run on this package. Main's 128-path frozen public manifest
  matches without drift. No shared/locked source is edited. Five design-file hashes
  and thirteen source bindings are independently checked against main's contract.
- Dedicated new workflow has `contents: read`, existing pinned Node/dependencies,
  loopback Chromium tests and synthetic screenshot artifact upload only. No existing
  workflow, dependency or authority guard is modified. Exact-SHA CI is separate
  evidence recorded by main after permitted commit/push.

Real synthetic screenshots are retained locally under
`artifacts/property/proof-of-work-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}-{pack,stale}.png`.
They do not certify universal accessibility, hosted acceptance or physical completion.

Next dependency: separately authorized safe media/quarantine/scanner/customer access
and retention policy before any real photo evidence or delivery; genuine completion,
acceptance and warranty evidence remain separate business/legal gates. All thirteen
historical migrations, pending customer14, original4B, frozenP1/four artifacts, prior
approvals, 2A–2F, six billing proposals, NMI/financial/Auth/provider, Netlify archive/
executor/recovery and deployment/merge gates stay unchanged. No hosted mutation,
credential, customer communication, contract/payment execution or deployment occurs.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
