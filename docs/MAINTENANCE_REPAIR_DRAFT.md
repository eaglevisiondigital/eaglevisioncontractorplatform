# Maintenance finding → repair-estimate draft

October28,2026 · base ecebe84af1aa95176f84bdabe647343f0ab1a407.
LOCAL SYNTHETIC ONLY. Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Demonstrate

Open http://127.0.0.1:4173/preview → choose a sample company → **Property
operations** → **Maintenance & follow-up**. If needed, run `npm run build`,
then `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.

1. Expand **Development-only maintenance examples & states** and choose
   **Prepare synthetic maintenance examples**. Existing published examples are
   reused; this package adds no automatic baseline fixture or new property system.
2. Choose **Review finding**, then **Prepare repair estimate**. This reads evidence
   only. Review the customer/property, exact published report ID/version/finding,
   original observation, location, severity, separate recommendation and existing
   plan-linked job (if any). Cancel leaves all estimates unchanged.
3. Select the confirmation checkbox and choose **Confirm & prepare repair draft**.
   This explicit command creates a separate estimate in the existing engine. It
   never selects a default/unrelated estimate, changes an existing draft, revises an
   issued financial baseline or creates a job. Separate observations/versions always
   retain separate preparation identities, including repeated finding identifiers.
4. The existing **Estimates** interface opens that exact draft/version. Suggested
   recommendation wording is editable. One unit is an UNMEASURED placeholder and
   cost, price and markup start at zero; tax policy remains unset. Review quantities,
   materials, labor, prices, taxes, markup, terms and proposed scheduling manually.
   Save uses the existing calculation/CAS model. Customer/property and the source
   line identity remain bound. Issuance/duplication are blocked for these repair
   drafts; no financial or work authority is inferred from saving or preparing one.
5. **Return to originating maintenance finding** returns to the same source/editor.
   The queue displays the related draft's identity and preparation state. **Open
   exact repair draft** reopens its latest saved revision within the retained exact
   draft version. The nested editor cannot browse another estimate. **Open
   originating published report** selects, expands and highlights the exact source
   report/version/finding in the existing inspection view.
6. Use each of the three contractor selectors to repeat the journey in its separate
   synthetic company. Existing review decisions, priority, notes and follow-up drafts
   are preserved. Full browser reload discards all disposable session state.

## Evidence and execution model

The former findingEstimate read mutable visit content, selected the default estimate
and detected duplicates by parsing an internal note. That API is replaced: it now
requires company, active reviewer, exact published source and a private reviewed
preparation token. The old draft-visit shortcut directs staff to maintenance.
Existing customer preview issued fixtures retain their separate explicit sample
preparation through the original estimating engine; they cannot issue maintenance
repair drafts or enter its structured registry.

PropertyRepository validates exact organization/customer/property/report/version/
finding/visit/plan/CRM context, rejecting duplicate/ambiguous source identity. Current
CRM existence and active contractor reviewer checks occur synchronously at the final
write checkpoint. Linked jobs use the existing plan relationship and exact immutable
issued baseline with matching organization/customer/property when specified; a
missing/wrong job or estimate response fails closed. No text matching or private-note
parsing establishes provenance. Inputs/review responses are cloned so caller edits
across asynchronous boundaries cannot substitute source identity or proposed values.

A private session review binds the maintenance CAS revision, plan revision, immutable
published evidence and optional job baseline. Preparing reserves one attempt per exact
source BEFORE any await. The existing estimating create path runs a final synchronous
callback immediately before committing the new draft. That callback revalidates source,
CRM, current membership, maintenance revision and plan/job binding, then retains exact
target estimate/version/line, preparing staff, timestamp and preparation ID. No await
separates these final checks and the in-memory commit. Estimate numbers advance only
on commit. Existing save/calculation and historical-version storage are reused.

Confirmed identical preparation replays read the retained exact draft; they never
append another repair line. Concurrent/stale requests reject. A failed/interrupted/
lost response marks the reserved attempt UNCERTAIN and retains available evidence.
There is no automatic retry or attempt deletion. **Reconcile repair preparation**
reads only the retained exact target and validates organization/customer/property/
estimate/version/source-line plus structured origin. A confirmed existing draft can
be reopened; absence of a retained committed identity remains blocked. No search by
wording, default-estimate fallback or blind second creation is allowed. This is
session containment, not crash-durable operational recovery or hosted acceptance.

Phase3Repository retains staff-only origin metadata outside EstimateInput and all
published/customer projections. Repair saves preserve customer/property/version and
exact source-line identity with current source/reviewer checks; stale locks reject.
Ordinary scope edits use existing integer calculations. Issuance and duplication
reject in the repository as well as the nested UI. The general Estimates editor also
displays structured origin when opening the retained draft. Original source evidence,
issued versions and job baselines remain immutable. Later plan metadata edits do not
rewrite the recorded review or source links; a stale preparation still rejects.

No new schema/migration, general task store, search database or estimating engine.
No hosted request, credential/Auth activity, customer mapping/lease, provider/media/
financial execution, deployment, production change or merge. All13 historical SQL,
pending customer migration, frozen P1 operation/four artifacts and approvals remain
unchanged. Approved premium portal/artwork and connected customer closure persist.
Actual two-Mac pairing/recovery remains unfinished, separate from local development.

## Verification and limits

See MAINTENANCE_REPAIR_DRAFT_VALIDATION.json for final focused counts and commands.
Domain coverage includes exact provenance, all companies, wrong tenant/customer/
property/job/estimate/version, published-versus-mutable evidence, caller mutation,
CAS/plan changes before and after waits, duplicate/concurrent preparation, preserved
issued histories/triage, editor binding and explicit uncertain-response reconciliation.
Browser journeys cover real editing/navigation, cancellation, checkbox/keyboard,
source versions, staff-data exclusion, company switching, responsive screens and Axe.

An initial regression produced duplicate maintenance editors because adjacent panels
shared React keys. Distinct keys correct it; the maintenance browser suite now asserts
one editor after saving. The affected six maintenance and three repair cases were
rerun after correction. Later three repair delta cases verify exact-editor containment.
No successful baseline workflow was restarted manually; unchanged SQL/recovery/Mac
setup/network suites were not repeated locally. The existing CI runs on push.
Screenshots are ignored under artifacts/property/repair-{viewport}-{company}.png.

## Next bounded package

Add an explicit contractor repair-scope review checklist and readiness validation to
these existing drafts: measured quantities, materials/labor, tax/markup and source
scope coverage, with version-aware review evidence. Keep issuance/customer publication,
job change authorization and financial execution separately gated. Do not add a
parallel estimating or operations store.
