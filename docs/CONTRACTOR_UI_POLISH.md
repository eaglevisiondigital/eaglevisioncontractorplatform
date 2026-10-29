# Contractor concept UI polish · Package 1

October 29, 2026 · base `d51e2a52c0fe01e92f5661dd5df39ae34040d0c2`.
**LOCAL SYNTHETIC · PHASE A · FINAL VISUAL APPROVAL PENDING.**
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Open and review

Open http://127.0.0.1:4173/preview/contractor-design. If needed, run
`npm run build` followed by
`npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.
The separate `/preview` workspace and approved `/preview/property-portal` remain
unchanged. The existing concept repositories, palettes, logo and operational
workflows are retained; this package does not promote the concept.

1. Switch **Company Context** among all three existing contractors.
2. Review the exact **Inspection Date**, **Staff Priority**, **Reported Severity**,
   **Staff Review Status** and **Follow-Up Date** on each maintenance card. Color
   accents represent manual staff priority, never an inferred priority from severity.
3. Expand **Filter Work Queue**; combine existing filters or reset them. **Review
   Finding** opens existing staff coordination; assignment options retain original
   identity values. The selected staff role and full technical identity remain
   readable below the selector. Synthetic relationships supply roles, not personal
   staff names; no names were invented.
4. **Open Exact Source Inspection** retains exact report/version/finding identity.
   Inspect **Inspections**, **Media & Galleries** and **Unbilled Materials**. Media
   remains unavailable, and proposed billing retains its existing restrictions.
5. Prepare the existing exact repair draft, explicitly confirm source context,
   edit/save scope and open the six readiness sections. Attestations remain full
   sentences; notes, observations and user-entered text retain their exact case.
   Inspect **Customer Preview** and **Version History** as well as the editor.
6. Complete all six reviews, then change a saved price. All confirmations become
   stale and history remains intact. **6/6 never enables issuance or work authority.**

## Corrections and before/after examples

| Before                                          | After                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| Maintenance & follow-up                         | Maintenance & Follow-Up                                                     |
| Reload maintenance queue                        | Reload Maintenance Queue                                                    |
| Scope item 1                                    | Scope Item 1                                                                |
| `linear_ft` displayed as an internal identifier | Linear Feet displayed; actual value remains `linear_ft`                     |
| `scheduled · priority urgent` in one badge      | Staff Priority: Urgent; separate Staff Review Status: Scheduled             |
| Inspection date inside collapsed evidence       | Exact date displayed prominently above separate evidence/coordination facts |
| Narrow mobile reload button                     | Full available width; short action stays on one line                        |
| Crowded multi-column review fields              | Single-column review fields and visible selected staff identity             |
| Half-width mobile company selector              | Full-width company selector with original company names                     |

Explicit presentation maps cover short headings, navigation, actions, field labels,
options, readiness states and history. They apply only inside the default-false
concept context. Controlled options have explicit original values; display changes
cannot change commands or stored enums. Known numbered UI labels use bounded
patterns, not general capitalization. There is no CSS capitalization rule or DOM
text rewriting. Data names, notes, descriptions, source IDs and immutable evidence
are not passed through the copy mapper. Full explanatory sentences stay sentence case.

Introductory spacing is slightly tighter. The estimate projection's totals use the
existing concept text color to meet contrast requirements; that selector is also
root-scoped. All other established design direction remains intact.

## Browser evidence

Real screenshots are captured from functioning synthetic journeys. Earlier
`contractor-design-*` PNGs remain as before evidence; `contractor-polish-*` PNGs are
the revised concept. They remain ignored locally and are uploaded by the existing
GitHub synthetic-preview artifact job (seven-day retention).

| State             | Desktop                                                                                               | Tablet                                                                                               | Mobile                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Queue             | [Capture](../artifacts/property/contractor-polish-desktop-sample-property-queue-full.png)             | [Capture](../artifacts/property/contractor-polish-tablet-sample-property-queue-full.png)             | [Capture](../artifacts/property/contractor-polish-mobile-sample-property-queue-full.png)             |
| Finding review    | [Capture](../artifacts/property/contractor-polish-desktop-sample-property-finding.png)                | [Capture](../artifacts/property/contractor-polish-tablet-sample-property-finding.png)                | [Capture](../artifacts/property/contractor-polish-mobile-sample-property-finding.png)                |
| Repair editor     | [Capture](../artifacts/property/contractor-polish-desktop-sample-property-repair-editor.png)          | [Capture](../artifacts/property/contractor-polish-tablet-sample-property-repair-editor.png)          | [Capture](../artifacts/property/contractor-polish-mobile-sample-property-repair-editor.png)          |
| Current readiness | [Capture](../artifacts/property/contractor-polish-desktop-sample-property-readiness-current-full.png) | [Capture](../artifacts/property/contractor-polish-tablet-sample-property-readiness-current-full.png) | [Capture](../artifacts/property/contractor-polish-mobile-sample-property-readiness-current-full.png) |
| Stale readiness   | [Capture](../artifacts/property/contractor-polish-desktop-sample-property-readiness-stale-full.png)   | [Capture](../artifacts/property/contractor-polish-tablet-sample-property-readiness-stale-full.png)   | [Capture](../artifacts/property/contractor-polish-mobile-sample-property-readiness-stale-full.png)   |

The same queue, finding, editor and current/stale captures exist for
`sample-construction` and `sample-roofing`. Inspection, media and unbilled screens
also have captures for each company/viewport. These are browser viewport checks,
not physical-device or recovery acceptance.

Focused results are recorded in CONTRACTOR_UI_POLISH_VALIDATION.json. Existing
baseline and same-document pixel comparisons stay exact, including neutral pointer,
focus and scroll normalization. No tolerances or masking were added. Initial test
runs exposed a missed card presentation branch and outdated copy selectors; both
were corrected. The newly exercised customer projection revealed the contrast
issue described above. Passing final reruns are not additional unique cases.

## Approval and boundaries

Owner review should confirm label consistency, separate maintenance facts, readable
mobile selectors/actions, and all six current/stale groups across the three palettes.
No known remaining visual defect is recorded after the exercised checks; owner
visual acceptance is still required. **Phase B replacement is not approved.**

No domain/repository/calculation/schema changes, dispatch, customer authority,
financial execution, credential/Auth activity, hosted action, migration application,
Netlify action, deployment or merge. All 13 historical migrations, the pending
customer migration, frozen P1 operation/four artifacts and existing approvals remain
unchanged. Independent two-Mac pairing/recovery remains a separate incomplete gate.
Future work is organized in [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md), without
blanket execution authority.
