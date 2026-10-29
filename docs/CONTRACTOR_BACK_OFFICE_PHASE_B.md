# Contractor back office · approved local Phase B

October 29, 2026 · approved base `07f3e6b172335a494029d340f0040e97710456f6`.
**OWNER APPROVED · LOCAL PRESENTATION INTEGRATION ONLY.**
This supersedes earlier Phase A visual-approval/replacement holds for this exact
scope. No second design approval is required. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.

## Open and demonstrate

Open http://127.0.0.1:4173/preview and choose **Property Operations**. Other modules
retain their original shell and behavior. On mobile, expand **Workspace Navigation**
to move between modules; on desktop, scroll the module list in the approved rail.
All 13 existing contractor navigation entries remain available. Contracts, Invoices
and Payments remain absent/disabled as before.

If necessary, run `npm run build` followed by
`npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.

1. Choose one of the three existing contractors. The approved premium property
   presentation opens at Maintenance & Follow-Up, retaining original session data.
   No examples are prepared implicitly and no existing record is replaced.
2. For a fresh disposable demonstration, expand **Development-Only Maintenance
   Examples & States**, choose **Prepare Synthetic Maintenance Examples**, then
   collapse the disclosure. Existing publication/example workflows prepare the same
   three synthetic findings used by the approved reference.
3. Review inspection dates and separate Staff Priority, Reported Severity, Staff
   Review Status and Follow-Up Date. Open the exact published report/version/finding.
4. Use **Review Finding** for manual priority/responsibility/private notes and one
   follow-up inspection draft. **Back to Work Queue** restores the queue and filters.
5. Prepare an exact repair draft after explicit source confirmation. Edit/save scope,
   review all six sections, then change a saved price: confirmations become stale
   with retained history. Even 6/6 never permits issuance, work or customer authority.
6. Open the same repair draft through **Estimates**: existing origin, customer/property,
   duplication and issuance restrictions still apply. CRM locations created through
   **Customers** are available in property plan preparation through the same session.
7. Switch company to verify scoped records and reset transient selections. Returning
   to a company retains its synthetic repository records, following existing rules.

The approved reference remains at http://127.0.0.1:4173/preview/contractor-design.
Its independently instantiated sample repository cannot populate the main workspace.
The locked customer portal remains at /preview/property-portal.

## Integration, without another business system

ContractorBackOfficeLayout is the extracted approved shell shared by the reference
and promoted property experience. It retains contractor-first branding, warm palette,
typography, exact logo, spacing, explicit Title Case copy, maintenance cards, focused
review, repair editing and current/stale readiness. Changes outside the approved
canvas are limited to retaining the full original module navigation and accurate
local/reference status labels. No new design direction or artwork was introduced.

App keeps its existing Operations instance, selected company, selected module and
message state. Its exact `/preview` + Property Operations branch mounts the approved
presentation; the remaining original module branches and connected/control-plane
routing remain intact. WorkspaceNavigation extracts the existing module inventory
and filters once, used by both shells. Compact navigation is presentation state only.
No additional Operations/PropertyRepository/estimate engine or fixture store is added.

PropertyWorkspace, MaintenanceCenter, RepairDraftPanel, Estimates, Jobs and all six
readiness implementations are unchanged. Their current membership/source checks,
CAS/idempotency, immutable report/version identity, private notes, issued baselines
and UNKNOWN reconciliation remain canonical. The default-false presentation context
is supplied only by the two explicit local layout compositions; it never grants
membership, connected access, issuance or financial permission. CSS remains scoped
and lazy-loaded; other modules and the locked customer portal are not restyled.

## Verification and real browser evidence

Focused results are in CONTRACTOR_BACK_OFFICE_PHASE_B_VALIDATION.json. Tests exercise
all three companies and desktop/tablet/mobile, every existing module, shared CRM,
company switching, exact sources/repair navigation, ordinary Estimates handoff,
private-field exclusion, duplicate/stale protections, all six current/stale review
sections, keyboard/Axe, overflow, empty/error states and closed connected routes.

Maintenance-card grids match the approved reference **pixel for pixel** after explicit
example preparation, with neutral pointer/focus/scroll and no masks or tolerances.
Native device scale is retained. Isolated card captures align the document origin
and independently assert original unmodified grid/card geometry: Chromium retina
rounded-border rasterization otherwise varies at different absolute page offsets.
Full-page screenshots remain unmodified. The compact menu closes after selection,
including reselecting Property Operations, keeping capture and operator state clear.
Reference examples do not populate the promoted repository. The locked customer
portal remains pixel-identical before/after same-document navigation while the new
stylesheet stays loaded. Full-page captures normalize scroll so a sticky rail is not
misrepresented halfway down the page. Earlier evidence is retained, not relabeled as
hosted or physical-device acceptance.

| Evidence                 | Desktop                                                                                                                                                                                             | Tablet                                                                                                                                                                                            | Mobile                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integrated workspace     | [Capture](../artifacts/property/contractor-phase-b-desktop-sample-property-workspace.png)                                                                                                           | [Capture](../artifacts/property/contractor-phase-b-tablet-sample-property-workspace.png)                                                                                                          | [Capture](../artifacts/property/contractor-phase-b-mobile-sample-property-workspace.png)                                                                                                          |
| Approved card comparison | [Promoted](../artifacts/property/contractor-phase-b-desktop-sample-property-promoted-cards.png) / [Reference](../artifacts/property/contractor-phase-b-desktop-sample-property-reference-cards.png) | [Promoted](../artifacts/property/contractor-phase-b-tablet-sample-property-promoted-cards.png) / [Reference](../artifacts/property/contractor-phase-b-tablet-sample-property-reference-cards.png) | [Promoted](../artifacts/property/contractor-phase-b-mobile-sample-property-promoted-cards.png) / [Reference](../artifacts/property/contractor-phase-b-mobile-sample-property-reference-cards.png) |
| Repair editor            | [Capture](../artifacts/property/contractor-polish-phase-b-desktop-sample-property-repair-editor.png)                                                                                                | [Capture](../artifacts/property/contractor-polish-phase-b-tablet-sample-property-repair-editor.png)                                                                                               | [Capture](../artifacts/property/contractor-polish-phase-b-mobile-sample-property-repair-editor.png)                                                                                               |
| Current readiness        | [Capture](../artifacts/property/contractor-polish-phase-b-desktop-sample-property-readiness-current-full.png)                                                                                       | [Capture](../artifacts/property/contractor-polish-phase-b-tablet-sample-property-readiness-current-full.png)                                                                                      | [Capture](../artifacts/property/contractor-polish-phase-b-mobile-sample-property-readiness-current-full.png)                                                                                      |
| Stale readiness          | [Capture](../artifacts/property/contractor-polish-phase-b-desktop-sample-property-readiness-stale-full.png)                                                                                         | [Capture](../artifacts/property/contractor-polish-phase-b-tablet-sample-property-readiness-stale-full.png)                                                                                        | [Capture](../artifacts/property/contractor-polish-phase-b-mobile-sample-property-readiness-stale-full.png)                                                                                        |

The same captures exist with sample-construction and sample-roofing. PNGs stay
ignored locally; the existing CI synthetic-preview artifact retains browser outputs
for seven days. Assertions were adapted to approved Title Case and native disclosures,
without weakening exact source identity, review state or financial restrictions.

## Preserved gates and next package

180 protected tracked paths, including original business components/domain/repositories,
customer portal/artwork, SQL and server code, match the approved base. All four frozen
P1 artifacts retain their reviewed hashes. All 13 historical migrations and the pending
customer migration are unchanged. No hosted write, session/credential retrieval,
provider/communication/payment activation, Netlify action, deployment, merge or
production change occurs. Independent two-Mac recovery and connected acceptance
remain separate unfinished release gates.

Next: the existing roadmap's Workstream 2, a separately reviewable **durable maintenance
triage preparation** package. Reuse current exact-source coordination records, CAS,
review history and scheduling identities; specify default-deny persistence/retention,
receipt/reconciliation and restart/concurrency acceptance before proposing any schema
or connected executor. This is preparation scope, not migration/activation authority.
Biller Genie-inspired accounts-receivable improvements are held for the next product-
planning checkpoint; no AR feature expansion or integration is authorized here.
