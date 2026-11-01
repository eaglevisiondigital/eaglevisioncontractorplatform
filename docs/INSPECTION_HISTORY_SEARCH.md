# Customer inspection history search

October28,2026 · base8d6f4c0 · LOCAL SYNTHETIC ONLY · draft PR#1.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working demonstration

Open http://127.0.0.1:4173/preview/property-portal and choose **Property reports**.
If the server is stopped, run `npm run build`, then
`npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.

- Search published summary, checklist labels, observation and recommendation text.
  Matching is case-insensitive, Unicode-normalized literal substring matching for
  every whitespace-separated term. No regex, fuzzy identity matching or private index.
- Expand **Filter inspection evidence** for inclusive inspection date endpoints,
  service month, recorded frequency, exact category, severity, location and a
  separate recommendation-text search. A single date uses equal from/to values.
  Options come from the available published evidence; missing/unrecognized cadence
  is explicitly unknown. Once/custom are supported when actually recorded.
- For a concrete example, set dates2026-12-07 through2026-12-14, category Damage,
  location Comparison window seal and search seal: two published reports match.
  Add urgent severity: one matches. Concern category/severity/location and
  recommendation terms must match the SAME finding. General text searches anywhere
  in the report, as explained beside the controls.
- Counts are matching report versions out of available report versions, never
  finding/visit totals or a claim of complete historical coverage. Clear individual
  filter chips or Reset history search. Invalid dates/ranges/filters hide results
  with an accessible correction message; no silent fallback to an unfiltered list.
- Each existing report card retains its full published observations, checklist,
  recommendations, report ID, exact version, inspection date and publication date.
  **Open exact published report** opens that report independently of the search;
  **Show all inspection reports** restores the saved filters. Existing exact linked
  issued scope navigation remains unchanged.
- **Compare this inspection** preselects that exact source in the existing
  comparison. **Open property Attention Center** uses the property's full available
  evidence, not the filtered subset. Returning to reports retains the search.
- Switching property or contractor, or reloading after a simulated loading error,
  clears search/source context. The second synthetic property demonstrates an empty
  history. Existing asynchronous loading/error boundaries hide the history/search
  until the property model is ready. No fake search delay or network request.

## Architecture and evidence boundary

src/domain/property/history-search.ts derives a read-only filtered projection
through existing projectPublishedHistory. All input reports must match the exact
contractor/customer/property before any filtering; foreign or duplicate sources and
malformed/nested private payloads fail closed. The existing root allowlist discards
private source columns before text is indexed in memory. Reports and finding IDs,
versions and full snapshots are retained independently; inputs are never mutated.
Search consumes authorized inputs; it does not establish connected authorization.
The connected response parser, routes and customer capabilities remain unchanged.

The shared PropertyReportHistory accepts opt-in search only on the approved local
portal. No new database, store, customer/property/inspection model or endpoint.
The retained /preview/property-portal-design keeps its earlier history presentation.
State lives only in the current property portal component, not URLs, localStorage,
server records or a persistent index. An exact source is checked against the current
model's report ID AND version before navigation. Context is cleared on scope changes.

Source options and literal matches confer no physical issue identity. Filtering
never groups descriptions or infers current condition, repair, completion, approval,
payment or debt. Category/severity/location values are exact published assertions;
recommendations remain separately labeled. Available reports may omit inaccessible,
unpublished or missing history, and omissions never establish resolution.

## Verification

INSPECTION_HISTORY_SEARCH_VALIDATION.json records74 application tests across6files,
including27 new search/domain/model cases, and60 unique browser cases across6files
on desktop/tablet/mobile. Six search cases were rerun after the final source-backed
frequency control adjustment; they are not counted twice. Browser checks cover
combined/individual/reset filters, exact report ID/version and comparison navigation,
full-property Attention Center navigation, property/three-contractor switching,
invalid ranges, private/no-match text, empty property, error recovery, keyboard,
Axe and overflow. Real synthetic screenshots are ignored in artifacts/property/
{desktop,tablet,mobile}-history-search.png. Desktop/mobile were visually inspected.
The approved overview remains pixel-equal to retained Phase A on all three sizes;
transparent/original logo hashes and existing contractor palettes are unchanged.

Lint, strict type/build, generated types, migration/property/customer integrity,
format and diff checks pass.121 protected tracked SQL/server/P1/recovery/Netlify/
artwork/shared-brand/projection/model files match8d6f4c0. No SQL or dependencies
changed. Relevant npm check constituents and focused browser/application suites were
used locally; unchanged aggregate recovery/native SQL baselines and completed Mac
setup/package/network/offline tests were not repeated. No hosted or physical-device
acceptance is claimed. Prior8d6f4c0 foundation40774612538 and compatibility40774612564
both completed successfully and were read, not restarted. New-commit CI is reported
separately after push; automatic CI retains the existing complete workflow.

## Preserved gates and next package

All13 historical migrations, pending unapplied customer migration, frozen P1
operation/four artifacts and owner approvals remain intact. No credentials, real
Auth sessions, hosted read/write/feature/mapping/lease/grant, provider/media/financial
execution, recovery operation, Netlify action, deployment, outside access or merge.
Both physical Macs' setup/connectivity evidence remains complete; authenticated
pairing and independent recovery remain unfinished separate gates, never device PASS.

Next independent local package: contractor-side maintenance triage. Reuse the
existing CRM service location, inspection plan/visit, published finding, job/task
and repair-estimate relationships. Provide a contractor work queue with exact
report/version/finding links, manual prioritization/assignment and explicit draft
follow-up actions. Preserve immutable reports and distinguish staff task status from
verified repair evidence; no inferred customer approval, financial execution or
new parallel property/inspection system. Hosted activation remains a separate gate.
