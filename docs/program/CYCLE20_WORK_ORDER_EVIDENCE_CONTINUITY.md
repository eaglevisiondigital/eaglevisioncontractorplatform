# Cycle20 · work-order evidence files and exact draft edits

The package reuses the existing C19 `FieldSavedRevisions` workspace and Main-owned
`SavedEvidenceControls` over the same selected job, source host and navigation.
`workOrderEvidenceRecipe` persists the full allowlisted C19 work-order projection:
exact immutable issued/job/customer/property references, current crew relationships,
plan and draft/submitted/published visit revisions, summaries and checklist flags,
and recorded technician task/time/correction/submission/review evidence. There is
no new task table, status engine, scheduler, repository or command hold.

`parseWorkOrderEvidence` strictly validates every allowed field, bounded dense
arrays, unique IDs, exact enum/boolean/version/date/instant values, visit-plan links,
crew/task relationships and noncyclic same-worker correction chains. Rates, payroll,
supplier costs, private notes, review reasons and execution/approval fields are not
accepted. Runtime `unreviewed` is preserved explicitly even though the old C19
TypeScript inference narrows it away; no historical source is rewritten.

The context-aware parser verifies every company/customer/property/job/estimate/
issued-version identity against the independently authorized file context.
`assertWorkOrderEvidenceSource` checks actual current original source references:
archived crew, plan, visit and task IDs must still be present in the exact job.
Future revisions and contradictory same-revision content reject; immutable task
identity, worker, task text, kind, start/end and correction references must match.
Earlier mutable visit/checklist/review contents remain unverified historical claims,
not independently authenticated truth. Missing current sources stay UNKNOWN.

The shared runtime prepares canonical complete JSON bytes and verifies content
integrity, opens an actual file only after fresh exact source authorization, and
performs explicit read-only current/stale reconciliation. A download request is
`FILE_PREPARED_NOT_CONFIRMED_SAVED`. Author tests additionally write and reopen the
actual bytes in disposable local files. Main owns actual browser download/reload/
reopen and server file-adapter evidence. No canonical state is restored, imported,
applied or reconstructed; no new IDs are created by file preparation/opening.
Self-hash is not a signature, approval, Auth or operational recovery proof.

## Useful explicit draft editing

The local draft editor loads Main's `readSavedSourceExercise` and
`readSavedDraftEdit` for the exact existing scheduled draft. Staff can change the
actual draft summary and original checklist checked flags, inspect original visit
and revision, then explicitly confirm `Save exact local draft revision`.
`executeSavedDraftEdit` owns source/current revision checks and uses the **same**
original one-use `visit-draft` custody. Original checklist IDs, labels, required
flags, private notes and findings remain unchanged. No publication, dispatch,
physical completion, customer approval or financial effect is inferred.

Dirty inputs withdraw local confirmation. Stale, competing, duplicate or uncertain
saves fail through the original custody; preparing/reopening a file never resets
UNKNOWN or permits replacement. Existing C19 before/current snapshots remain
available for explicit saved-update comparison. Optional `onSourcesSaved` refreshes
presentation only after known ACK; a presentation failure never retries the edit.

The new wrapper scopes styles locally, retains the approved contractor palette,
44px controls, readable forms, wrapping source IDs and mobile layout. DEV/explicit
flag/HTTP-loopback gates stay default OFF. Main owns same-five-tab composition,
actual three-brand desktop/tablet/mobile, axe and independent combined review.

Focused author tests cover all three brands, actual canonical draft/time/correction
writes and preserved private/immutable fields, exact on-disk bytes, current/stale
files, contextual identity denial, strict parser/private-field cases, revoked staff,
last-await changes, original UNKNOWN and duplicate/concurrent edit denial. Types,
owned lint/format, build and retained C19/source/protected integrity are recorded
with the author head. No completed unrelated baseline is rerun.

All original protected files/migrations13/customer14/4B/P1/four artifacts, approvals,
Netlify/executor, 2A–2F/billing, approved designs, recovery/Auth/MFA/NMI/provider/
financial/communication/dispatch/hosted/production/deployment/merge restrictions
remain unchanged. Release1.0 **NOT READY / NOT AUTHORIZED**.
