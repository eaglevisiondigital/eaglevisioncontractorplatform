# Contractor back-office visual & functional review

Prepared October29,2026 for owner review. Local synthetic data only; session state
is disposable. No feature expansion or customer-portal redesign is proposed here.

## Open the walkthrough

Visit http://127.0.0.1:4173/preview. Choose each of the three **Company context**
options in turn. Use a desktop window, tablet-sized window and mobile-sized window.
Start with **Property operations** → **Maintenance & follow-up**. Expand the
development-only examples and prepare synthetic maintenance examples once per company.
Refresh the browser only when ready to discard the session's work.

| Stop                      | Function to demonstrate                                                                             | Visual/usability judgment                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Company context           | Switch among three contractor brands; retain only that company's CRM properties, findings and staff | Contractor identity, current company and internal-only context should be obvious                                    |
| Maintenance queue         | Filter by property/priority/responsibility/date/review; open one finding                            | Card density, scan order, labels and mobile controls                                                                |
| Source evidence           | Open the exact published report/version/finding, then return                                        | Source identity and observation versus proposed work should be easy to follow                                       |
| Manual triage             | Set priority, responsible staff, follow-up date and a private note; save                            | Staff-only status must not read as physical repair completion                                                       |
| Follow-up draft           | Explicitly prepare one follow-up inspection through the existing plan                               | Draft versus dispatch distinction and duplicate-safe return journey                                                 |
| Repair preparation        | Inspect source/customer/property/job; confirm one separate repair draft                             | Confirmation clarity and exact nested-editor context                                                                |
| Existing estimate editor  | Edit proposed work, quantity/unit, costs/prices, selected tax and terms; save                       | Editing effort, long forms, calculations and small-screen spacing                                                   |
| Readiness                 | Record a question; then review the six groups, individual attestations and measured references      | Action labels, blockers/warnings, review density and keyboard order                                                 |
| Current versus historical | Complete6/6; change price/save; show0/6 and retained historical receipts                            | Stale state must be conspicuous, without implying issue or work authority                                           |
| Return to queue           | Reopen exact draft, review current count/revision and exact source links                            | Navigation should preserve source and property context                                                              |
| Customer boundary         | Inspect the existing customer property view separately                                              | Internal review, rates/costs, staff notes and measurement references must be absent; approved portal remains locked |

For concrete disposable values and exact readiness actions, follow
[REPAIR_SCOPE_READINESS.md](REPAIR_SCOPE_READINESS.md). No real property measurement,
supplier price or tax determination is represented by those example values.

## Evidence prepared

Current browser evidence covers three companies across desktop/tablet/mobile,
keyboard interactions, source navigation, confirmations, questions, saved revision
invalidation and customer exclusion. Axe reports zero violations and exercised
states have no horizontal overflow. These are automated local checks, not owner
visual acceptance or a complete usability study.

The ignored local screenshots are available after the focused browser run:

- artifacts/property/readiness-desktop-sample-property.png
- artifacts/property/readiness-tablet-sample-property.png
- artifacts/property/readiness-mobile-sample-property.png
- The same three names with sample-construction or sample-roofing show the other brands.
- Existing repair and maintenance browser screenshots remain under artifacts/property/.

Desktop and mobile readiness captures were visually inspected for readability,
wrapping and existing contractor styling. Source/calculation/group layout remains
the established back-office pattern; no global or approved-portal redesign occurred.
GitHub's synthetic-preview artifact retains screenshots for seven days per workflow.

## Record feedback before expanding scope

Record the company, viewport, walkthrough stop and exact label/action for each
observation. Separate visual polish, navigation confusion and functional failures.
Prioritize corrections to this existing journey before choosing another feature
package. Owner review of the back office is still pending; no visual PASS is claimed.

Session-only evidence, unfinished independent recovery, hosted P1/P2/customer
acceptance and Netlify remain separate gates. Release1.0 is NOT READY / NOT AUTHORIZED.
This walkthrough cannot issue a repair estimate, publish customer scope, dispatch
staff, create debt, send messages, activate providers, deploy or merge.
