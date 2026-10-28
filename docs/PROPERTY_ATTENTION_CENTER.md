# Property Attention Center · local customer experience

October28,2026 · base10a5e942 · existing codex/phase-1-foundation / draft PR#1.
**Implemented locally with synthetic data. Release1.0 NOT READY / NOT AUTHORIZED.**

## Functioning experience

Open /preview/property-portal and choose Attention center. Existing report/review
navigation and contractor colors/identity plus the unchanged Propel PNG remain.
Within Demonstrate preview states, load inspection history, optionally prepare the
issued review example, then Load synthetic attention examples. The latter publishes
two additional synthetic visits through existing inspection workflows; it does not
rewrite the original three reports or create a second inspection/property system.
Repeated example loading is idempotent in the local model.

Filter attention by newly reported, recurring identifiers, report changes, repeated
recommendations, linked repair estimates or items needing clarification. Inspect
severity and evidence dates, expand the source evidence, and open its exact report
or a related issued repair version. Switching property/contractor clears prior view
selection. Empty properties, no-concern reports, empty filters and simulated loading
failure have explicit states; the existing async loader and error/reload boundary
cover the entire property experience. All data remains synthetic and in memory.

## Evidence rules

1. Every source must pass the existing published-report projection for the exact
   contractor/customer/location. Reject foreign rows, duplicate report IDs,
   malformed snapshots and nested private fields. No partial foreign summary.
2. A UUID-shaped finding ID repeated with exactly the same category and location
   is grouped as identifier-based recurrence. Existing reports do not prove that
   this is the same physical issue: the card explicitly states continuity is not
   independently confirmed. Generic IDs and IDs reused across categories/locations
   remain separate. Similar wording alone never groups findings; exact wording
   appearing under distinct IDs is explicitly flagged uncertain.
3. Count distinct inspection dates, not the number of report versions. Retain all
   exact report IDs, published versions/timestamps and finding IDs as source evidence.
   Two reports on the same date count once. Conflicting same-date observations
   are uncertain, not resolved by picking the largest version or latest timestamp.
4. Compare consecutive coherent dates for changes in reported severity, observation
   wording and recommendation text independently. These are factual report
   differences, not a claim of deterioration/improvement or repair. Conflicting
   dates block adjacent comparisons. Repeated recommendations count exact text on
   distinct dates within a grouped identifier, never unrelated text matches.
5. Newly reported means first appearing on the latest inspection date within the
   available input history. It does not establish when damage began or that the
   history is complete. First/last evidence dates remain visible.
6. Every item has repair_status=undetermined. A finding absent later, a severity
   decrease, an estimate or a preview preference never means repaired, completed,
   approved, paid or debt created. Observations and recommendations have separate
   labels. A later omission explains that current condition is unknown.
7. Repair links accept the existing strict customer review projection and exact
   report/finding provenance. Only allowed version references enter attention;
   monetary scope, costs, payroll, notes and financial execution do not. Missing
   source evidence produces no inferred relationship. Every navigation target
   resolves inside the currently selected property model.

This is a read model, not an authority source. It consumes already authorized
published inputs; it cannot grant access, verify a hosted session or become a
connected fallback. The synthetic model can run only with the existing sample
repository. No public endpoint, connected adapter or schema is added or activated.

## Focused verification

Results are recorded in PROPERTY_ATTENTION_CENTER_VALIDATION.json. Domain negatives
cover all three foreign boundaries, ambiguous identifiers/text, version/date
conflicts, absence, private fields and forged issued-version links. Integration
checks cover all three contractors, unchanged source reports/issued baseline,
idempotent fixture preparation, empty second property and zero invoice creation.
Browser tests cover exact report/version navigation, repair links, filters, error/
property/contractor clearing, no connected fallback, zero outside requests,
accessibility, desktop/tablet/mobile overflow and synthetic screenshots.

No unchanged recovery baseline/setup/package/network tests or native PostgreSQL
suite was rerun. No SQL changed. The aggregate npm check includes recovery tests,
so relevant constituent lint/type/generated-type/integrity/build checks and focused
application/browser tests are used for this increment. Prior test totals remain
historical and are not summed with these results. GitHub CI is reported separately.

## Preserved gates and remaining limits

All13 historical migration bytes, pending customer authorization SQL/proposals,
frozen P1 operation/four artifacts, approved branding and recovery distribution are
unchanged. No credential retrieval, real login/session, hosted request/mapping/
lease/grant/feature, customer decision, invoice/payment/debt, provider/Netlify action,
deployment, production change or merge. Existing P1 approval persists unchanged.
No operational repair/issue status is persisted. Same-day distinct inspections cannot
be safely counted as multiple occurrences through the current safe report shape;
this deliberately understates recurrence rather than inventing lineage.

Both physical Mac setups, IPv4 connectivity and Universal Clipboard remain
owner-reported complete. Authenticated pairing and independent recovery remain
unfinished, separate acceptance gates; no physical-device PASS or fresh hosted
acceptance is claimed. Release1.0 remains NOT READY / NOT AUTHORIZED.

## Next independent package

Provide a side-by-side published-inspection comparison for two selected reports,
including exact version identity, checklist changes and separately displayed
observation/recommendation differences. Preserve the same conservative identity and
no-resolution rules; no new schema or hosted activation is needed for local work.
