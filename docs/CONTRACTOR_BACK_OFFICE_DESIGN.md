# Contractor back-office premium concept · Phase A

October29,2026 · base3adcfcb188b1c7f8fcd3d6ceea2a15807357663c.
**LOCAL SYNTHETIC · VISUAL APPROVAL PENDING · CURRENT WORKSPACE NOT REPLACED.**
Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Open and demonstrate

Open http://127.0.0.1:4173/preview/contractor-design. If necessary, run
`npm run build` and `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.
The existing /preview back office and approved /preview/property-portal are unchanged.
The sidebar links to both for comparison. This exact preview route has no connected
counterpart, login, credential reader or hosted adapter.

The concept prepares the existing disposable maintenance examples in a separate
instance of Operations/PropertyRepository. Three published findings across two CRM
properties use the existing example helper, not invented dashboard measurements,
supplier facts or a new property system. Switching contractor context retains each
company's own session state; reloading discards the concept session. Example failures
show an unavailable state and never automatically retry preparation.

1. Switch among the three **Company context** choices to review the approved company
   palettes. Existing company names are typeset as names, not invented logos. Compact
   Propel attribution reuses the approved transparent derivative; no artwork changes.
2. The queue overview counts actual available finding records, pending staff review,
   unassigned responsibility and prepared inspection drafts. These are not counts of
   distinct physical problems, completed repairs or accepted work. Available evidence
   may be incomplete. **Filter work queue** expands the existing combined filters.
3. Cards show priority/review status, property/customer, concise observation, visible
   responsibility/follow-up and direct source navigation. **Published evidence**
   expands exact report/version/finding, recommendation and uncertainty. Manual
   priority remains distinct from source-reported severity; no priority is inferred.
4. **Review finding** focuses one property/source, removing the queue from the active
   view while retaining **Back to work queue**. Existing staff assignments, private
   notes, manual priority/review and one-shot follow-up inspection scheduling remain
   functional. **Open this published source** selects the exact immutable report.
5. **Prepare repair estimate**, inspect the source and explicitly confirm preparation.
   The exact separate existing-engine draft opens. Source identity/preparation evidence
   stays available, with exact report and originating-finding return controls. **Edit
   proposed scope** and **Review readiness** jump within the retained exact draft.
   Redundant generic notices collapse out of this concept; the specific issuance/work
   block remains visible. No editing or calculation engine is replaced.
6. Use the disposable values in REPAIR_SCOPE_READINESS.md to edit and save scope,
   quantities, costs/prices, tax and terms. The six-step navigator shows outstanding,
   current-confirmed or stale evidence with text and symbols, not color alone.
   Each section opens to the existing note, measurement, attestation and question
   controls. Confirmed sections collapse to reduce scrolling and can be reopened.
7. At6/6 the message still says **issuance remains blocked**. Change price/save:
   every step becomes stale, count0/6 for the new revision, old receipts retained.
   Source navigation and current-versus-historical evidence remain exact. No repair
   completion, customer authority, issuance or financial consequence is inferred.

## One cohesive presentation, existing behavior

A contractor-first context rail, quiet warm canvas, compact operational navigation,
aligned work cards, visible coordination, focused source review and structured forms
compose one concept. Tablet layouts stack the editor/summary; mobile uses compact
company controls, two-column navigation/progress and full-width form fields. Controls
have at least44px height; keyboard focus remains visible. Save controls stay in flow
so they cannot obscure readiness on small screens. Development controls stay collapsed.

An opt-in React presentation context defaults false and is supplied only by the new
exact-route component. It changes initial local view and presentation markup only;
it is never authorization, financial permission or connected feature activation.
PropertyWorkspace, MaintenanceCenter, RepairDraftPanel, Estimates and readiness reuse
the existing repositories, actions and validation. Every new CSS selector is scoped
under .backoffice-concept, and its stylesheet is lazy-loaded for this route. The
original workspace retains its default tab, expanded controls and original layout.

## Real browser evidence

Screenshots are produced by tests/browser/contractor-design.spec.ts from functioning
synthetic browser journeys, not generated mockups. PNGs remain ignored locally and
are included in GitHub's existing synthetic-preview artifact, retained seven days.
The local screenshot index is artifacts/property/CONTRACTOR_DESIGN_SCREENSHOTS.md.

| State                     | Desktop                                                                                   | Tablet                                                                                   | Mobile                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Populated queue           | [Capture](../artifacts/property/contractor-design-desktop-sample-property-queue-full.png) | [Capture](../artifacts/property/contractor-design-tablet-sample-property-queue-full.png) | [Capture](../artifacts/property/contractor-design-mobile-sample-property-queue-full.png) |
| Finding review            | [Capture](../artifacts/property/contractor-design-desktop-sample-property-finding.png)    | [Capture](../artifacts/property/contractor-design-tablet-sample-property-finding.png)    | [Capture](../artifacts/property/contractor-design-mobile-sample-property-finding.png)    |
| Exact repair context      | [Capture](../artifacts/property/contractor-design-desktop-repair.png)                     | [Capture](../artifacts/property/contractor-design-tablet-repair.png)                     | [Capture](../artifacts/property/contractor-design-mobile-repair.png)                     |
| Editing controls          | [Capture](../artifacts/property/contractor-design-desktop-repair-editor.png)              | [Capture](../artifacts/property/contractor-design-tablet-repair-editor.png)              | [Capture](../artifacts/property/contractor-design-mobile-repair-editor.png)              |
| Six current confirmations | [Capture](../artifacts/property/contractor-design-desktop-readiness-current-full.png)     | [Capture](../artifacts/property/contractor-design-tablet-readiness-current-full.png)     | [Capture](../artifacts/property/contractor-design-mobile-readiness-current-full.png)     |
| Stale after saved change  | [Capture](../artifacts/property/contractor-design-desktop-readiness-stale-full.png)       | [Capture](../artifacts/property/contractor-design-tablet-readiness-stale-full.png)       | [Capture](../artifacts/property/contractor-design-mobile-readiness-stale-full.png)       |

Queue/finding screenshots also exist with sample-construction and sample-roofing
in place of sample-property. Full repair/readiness captures show the first contractor;
all three original contractor repair/readiness journeys remain regression-tested.

57 unique focused browser cases across six files pass; final12 concept/repair delta
cases and three stronger isolation cases are reruns, not additional unique passes.
101 focused domain/repository cases also pass. Tests cover exact source/version
navigation, assignments/notes/scheduling, duplicates/stale changes, customer-private
exclusion, all three company palettes, keyboard, empty/error reload, responsive
overflow and Axe. Exercised concept states have zero Axe violations/overflow and
new queue journeys use loopback only. Same-document route transitions preserve the
loaded concept stylesheet: both the original queue and locked customer overview
remain pixel-identical before/after, and concept examples do not populate /preview.
Prior foundation40867767460 and compatibility40867767490 passed without restart;
current-commit CI is reported separately. Validation details are in
CONTRACTOR_BACK_OFFICE_DESIGN_VALIDATION.json.

Initial testing exposed a heading-level gap after compacting the outer title; its
semantic heading is retained without duplicate visual text. Screenshot inspection
also removed an overlapping mobile action bar and shortened repetitive concept-only
notices. Final targeted reruns pass. Exact label selectors and stylesheet-only link
selection corrected test assumptions without weakening accessibility assertions.

## Owner visual approval checklist

- Is queue hierarchy clear, with priority, responsibility, follow-up and evidence easy to scan?
- Does finding review make property/source identity and staff decisions immediately understandable?
- Are repair editing, saved identity and source/return links clear without repetitive framing?
- Are six-section outstanding/current/stale states readable, with6/6 clearly separate from authority?
- Are desktop, tablet, mobile and all three contractor palettes acceptable for this concept?

Record requested corrections against a state, company and viewport. Owner approval
of this Phase A concept is still pending. **Do not replace /preview or promote the
concept before explicit visual approval.** Visual approval would not authorize any
hosted activity, customer access, financial execution or release launch.

## Preserved boundaries

No business/domain/repository/schema/migration/calculation changes.165 protected
tracked paths and all four frozen P1 artifacts match the starting commit/manifest.
All13 historical SQL, pending customer migration, P1 operation and owner approvals,
issued baselines, approved portal/artwork and connected-route closures persist.
No Auth/session/grant/mapping/lease, hosted/provider/media/financial action, dispatch,
Netlify/recovery operation, deployment, production change or merge. Independent
two-Mac authenticated pairing/recovery remains unfinished and separately gated.
