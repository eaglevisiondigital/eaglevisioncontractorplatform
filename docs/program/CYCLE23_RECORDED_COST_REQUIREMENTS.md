# Cycle 23 · recorded cost requirements

Owner: `/root/cycle23_finance_intelligence`. Exact parent:
`3e35fb29dd4488bf655446712e5a013e06f8ed1e`. Branch:
`codex/cycle23-recorded-cost-requirements`. Target: draft coordination PR #155,
`codex/program-cycle-twenty-three-integration`. Five new owned files only.

The existing Cycle 22 source list exposes time/material rows but does not put the
canonical category amounts beside their original source references, or show the
existing financial exception and invoice/event/ledger details behind a requirement.
This package adds that practical drill-down without a second calculation or store.

`RecordedCostRequirements` retains the original `CostCorrectionReview` form. Its
explicit read composes `readCostCoveragePath` with the existing single-job
`readFinancialCasework`/`openFinancialCaseworkJob` projection. Exact company,
customer, property, issued source and job revision must agree. Category totals come
unchanged from the original `jobFinancials`; no amount is allocated to an individual
time entry. Original material review IDs, time `corrects_id`, correcting entry IDs,
locked labor references and locked period IDs remain exact. Missing references are
UNPOSTED OR UNVERIFIED, never zero-cost, payroll payment or complete-cost proof.

Staff can choose a canonical category, inspect its original source rows, inspect an
original financial requirement, and expand exact invoice/contract/offer/version,
event and ledger IDs. Missing invoice/linkage/provider evidence stays UNKNOWN.
Navigation delegates to the original source inspection and daily-context continuation;
its original one-use and UNKNOWN custody remain the sole attempt owner. No mutation
is invoked on read, selection, render or navigation. The original manual review form
is the only retained cost correction writer.

The scoped layout uses the existing contractor palette and warm surfaces, semantic
headings, labeled native selectors, 44px controls, status/alert announcements and
mobile stacking. Main owns opt-in composition and actual browser/accessibility proof.
No approved portal, Property Operations CSS, artwork or global token is changed.

Focused application evidence: 31 cases exercise all three brands, canonical amount
consistency, actual native material review, native corrected-time lineage, actual
locked labor without reposting, an existing synthetic invoice/event/ledger fixture,
independent unresolved requirements, source identity, revocation, tenant denial,
concurrent navigation, source drift, lost acknowledgment/UNKNOWN, callback withdrawal,
strict selectors, production/OFF admission and no reader financial commands. Types,
owned-file lint and formatting are required before publication. CI is separately
observed at the exact published SHA; local results never imply green CI or release.

The invoice/event fixture is explicitly synthetic test-only existing-engine setup;
it creates no browser financial control or genuine financial execution. No new
business database, evidence archive, restart adapter, ledger, calculation engine,
financial permission, provider, sender, dispatch or navigation owner is introduced.
Canonical restart persistence requires its separate architecture review and approval.
Historical evidence files cannot restore business state.

All 498 prior author files, 128 protected files, design locks, 13 historical
migrations, pending customer14/original4B, frozen P1/four artifacts, approvals,
2A–2F/billing/Netlify/executor/Auth/MFA/NMI/recovery/provider and production gates
remain unchanged. Danny's physical Air readiness/recovery/cleanup remain unverified.
Release 1.0 remains NOT READY / NOT AUTHORIZED. No merge, deploy, hosted mutation,
communication, payment or operational restoration is authorized.
