# Side-by-side published inspection comparison

October28,2026 · base a6911d66037aea20435824e4af32ee4ca6108b36 · local synthetic only.
Release1.0 remains **NOT READY / NOT AUTHORIZED**; draft PR#1 remains unmerged.

## Working preview

Open http://127.0.0.1:4173/preview/property-portal while the local preview server is
running. To start it yourself, run npm run build, then npm run preview -- --host
127.0.0.1 --port 4173 --strictPort.

1. In Demonstrate preview states, Load synthetic inspection history.
2. Load synthetic comparison examples, then Compare selected inspections. Two
   additional published visits demonstrate checklist result differences, missing
   checklist entries, a repeated UUID finding with separate severity/observation/
   recommendation differences, generic ambiguous identifiers and a later omission.
   These examples use existing plan/visit/publication workflows; they never edit
   previously published reports. Repeated preparation is idempotent.
3. Use First published inspection / Second published inspection to choose any two
   distinct available reports for this property. Selection edits clear old results;
   the explicit compare action validates exact report ID/version. Date orders the
   sides; selecting in reverse order gives the same earlier/later presentation.
4. From Property reports, Compare this inspection preselects that source. From an
   Attention Center item with multiple sources, Compare source inspections selects
   its first/last exact reports. Both use the same comparison view and validator.
5. To demonstrate issued repair links, prepare the synthetic review example and
   compare the weekly2026-10-16 and2026-10-23 reports. Review exact linked repair scope
   opens only its authorized immutable issued version; View inspection reports
   returns to its exact report. Every comparison finding/checklist source button
   opens its original report/version in existing history.
6. Switch to200 Synthetic Garden Lane for the empty state. Selecting the same
   report twice fails closed. Simulate loading error hides the entire property
   experience; Reload preview status clears selection and reads retained records.
   Contractor switching remounts the synthetic model and clears former evidence.

The comparison and source view are local read-only presentation. Initial property
loading uses the existing async resource boundary. There is no comparison network
request, fabricated delay, login, new store, endpoint, schema or estimate system.
Desktop/tablet show two columns; mobile stacks labeled earlier/later evidence per
item. Contractor colors/name and the unchanged approved Propel PNG are preserved.

## Evidence and authorization rules

- Compare only exact published sources after the existing contractor/customer/
  property safe projection. Duplicate/foreign/malformed reports, disabled report
  access, stale versions and duplicate/unavailable selections reject the comparison.
  Missing required observation/recommendation strings reject rather than invent text.
- Reuse buildPropertyAttention against the complete authorized input history, not
  just the selected pair. UUID finding IDs require exact category/location; a reused
  identifier conflict anywhere in history keeps observations separate. Generic IDs
  and different IDs with similar wording cannot establish a physical issue match.
  A repeated published identifier remains continuity evidence only, explicitly not
  independently confirmed by the contractor.
- Both/earlier-only/later-only refer only to selected report evidence. Newly observed
  in this selection does not establish damage onset or absence from all prior history.
  Separate exact severity, observation wording and recommendation differences. Never
  label a factual difference improvement/deterioration or infer physical cause.
- Same-date reports retain selection order and display First/Second selected report.
  Neither publication timestamp nor version proves visit chronology or recurrence.
  Exact version differences remain visible with an explicit same-date limitation.
- Published checklist projections have NO stable checklist IDs. Unique exact labels
  align only label/result comparisons, with an explicit continuity limitation.
  Preserve each entry's exact label, result and report ID/version/source index.
  Source index is a report-local position, never invented cross-visit identity.
  Renamed/missing/duplicate labels remain unaligned; no inferred task completion.
- Repair status is always undetermined. Later omission, less severe wording, changed
  recommendations, an issued estimate or a synthetic preference cannot establish
  repair/completion/approval/payment. No customer authority or debt is created.
- Allowlisted issued scope references require exact selected report AND finding.
  IDs bind to the uniquely versioned source report. Customer review validation
  rejects foreign/private/unauthorized version payloads. Only minimal scope version
  references enter comparison; no monetary, supplier, payroll or private-note fields.
  React renders source text literally. Cadence is bound through the existing model's
  plan/report relationship, allowlisted to once/weekly/monthly/custom or unknown.

The read model consumes already authorized inputs; it cannot confer connected
access or replace server authorization. Connected customer routes/capabilities
remain closed; no synthetic fallback is installed on them.

## Verification and limits

INSPECTION_COMPARISON_VALIDATION.json records98 focused application tests in9files
and33 unique browser cases across desktop/tablet/mobile. Nine browser cases are new
comparison journeys;24 cover the reused portal/attention/customer/branding surfaces.
All final cases pass. First browser audit found duplicate region landmarks; replaced
row landmarks with labeled evidence groups and reran all nine comparison cases.
Axe reports zero violations on the exercised comparison journey. Exact report/version
and issued-version navigation, errors, duplicate selections, property/contractor
switches, no outside requests and no horizontal overflow are covered. Desktop/mobile
screenshots were visually inspected; artifacts/property contains ignored screenshots.

Local strict type/build,lint,generated-type,migration/property/customer integrity,
format and diff checks pass. Git byte comparison verifies83 protected SQL/P1/
execution/Netlify/recovery paths unchanged from the starting commit. No SQL changed;
native SQL suites and completed recovery/setup/network/package baselines were not
rerun. The aggregate npm check includes those unchanged recovery suites, so its
relevant constituent checks plus focused tests were used locally. No full local
suite, hosted Auth/RLS or physical-device acceptance is claimed.

Prior GitHub foundation run40754490668 completed successfully (verify and postgres17);
it was read, not restarted. New-commit CI status is reported separately after push.

## Preserved boundaries and next package

All13 historical migrations, unapplied/unauthorized customer migration, frozen P1
operation/four artifacts and existing owner approval remain unchanged. No hosted
Auth, credential retrieval, mapping/lease/feature/grant, financial/legal execution,
media/provider activation, Netlify/recovery operation, deployment, production change,
outside access or merge. Both corrected Mac setups/IPv4/Universal Clipboard retain
owner-reported completion; actual authenticated pairing and independent recovery
remain incomplete, separate gates. No physical-device PASS.

Next useful local package: customer-safe property history search and evidence filters
by exact inspection date, published observation/category/location and recommendation,
with exact source navigation and explicit incomplete-history limits. Reuse the same
published projections and comparison links, without adding issue-state authority.
