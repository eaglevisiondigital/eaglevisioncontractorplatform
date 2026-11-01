# Customer property portal experience · local implementation

October28,2026 · base bd2578f · existing codex/phase-1-foundation / draft PR#1.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Functioning customer journey

The existing /preview/property-portal now combines previously separate report and
estimate review demonstrations. This is explicit synthetic data, without sign-in.
The original customer-login preparation at /preview/customer-portal is preserved
and uses the same extracted estimate review component.

- Properties come from the existing contractor/customer CRM service locations.
  A second same-customer location demonstrates a property with no shared reports
  or estimates. Job contexts are deduplicated by location. Arbitrary property IDs,
  other customers in the same company and foreign contractors are rejected.
- The existing inspection workflow creates/publishes two weekly visits and one
  monthly visit. Repeated preparation retains the same three reports. Filter by
  service month and weekly/monthly frequency, including no-match combinations.
  Inspect retained report versions, checklist results, damage severity/location
  and reviewed maintenance recommendations. Cadence uses source plan relationships.
- Reuse existing issued-estimate projection and explicit sample preparation.
  A finding opens only its linked repair version; the reverse action opens its
  exact published source report. Unlinked findings explain that no estimate is
  shared. Full issued-version review/comparison remains available.
- Approval and decline are review-only synthetic preferences for exact immutable
  issued versions. Explicit acknowledgment is required; expiry and duplicates deny.
  Returning to a property retains the in-memory preference. A browser reload starts
  a fresh local model: no durable hosted decision persistence is claimed.
- Status counts, loading, empty history/estimate states, simulated load failure and
  read-only status reload are executable. Error states hide property/report data.
  Switching contractors remounts the model and clears selected scope/UI state.
- Independent contractor name/color leads the presentation. The exact approved
  Propel PNG remains intact as platform attribution; no contractor logo is invented.
  Desktop, tablet and mobile retain readable cards and wrapping actions.

## Demonstration

Run npm run dev -- --host 127.0.0.1 and open /preview/property-portal on its printed
local URL. In Local preview controls choose a sample contractor. In Demonstrate
preview states load synthetic inspection history, then prepare synthetic review
example. Filter history or use Review related repair scope. Confirm synthetic-only
review and approve/decline a version; use View inspection reports to return to the
source. Select 200 Synthetic Garden Lane to see empty property scope. Simulate a
loading error, then reload preview status to read the retained local records.

These controls prepare synthetic in-memory examples only. They do not select a
real customer, create accounts, grant access or persist genuine approval evidence.

## Boundaries preserved

No SQL/schema/proposal/generated type, connected route, server capability, provider
or dependency change. All13 historical migrations, pending customer migration and
four frozen P1 artifacts/operation remain byte-identical. Existing unchanged-scope
P1 approval remains valid. No hosted requests, sign-ins, credentials, mappings,
leases, features, Supabase writes, Netlify actions, deployments or merge.

Report projection reuses the strict report shape/validator, rejects mismatched
company/customer/location and contaminated private findings, and strips root
internal/media/cost fields. All text remains React plain text. Estimate projections
exclude supplier costs, margins, payroll and private notes. Review preferences do
not authorize work, contract signing, invoices, receivables, payments or debt.
Media uploads/playback and every financial execution path remain off.

Owner reports corrected Setup successful on BOTH physical Macs, local IPv4 and
Universal Clipboard verified. Those completed checks were not repeated. Authentic
pairing and actual independent recovery remain incomplete; no physical-device PASS.
Monterey remains synthetic-only. Recovery is an independent acceptance blocker and
does not halt unrelated local product work. Hosted P1/P2/customer acceptance counts
are unchanged; no fresh hosted state is claimed.

## Focused verification

- **174 PASS / 11 focused application test files**, including customer/contractor/
  property isolation, published safe projections, literal text, exact finding links,
  duplicate preference concurrency, immutable issued baseline, zero invoices,
  closed Auth routes and existing property/release regression coverage.
- **36 PASS / desktop, tablet and mobile browser cases** across property workflows,
  the integrated journey, existing customer review and approved branding. Includes
  no external requests from the new journey, accessibility and no horizontal overflow.
  Desktop/mobile screenshots were visually inspected; selectors use44px touch targets.
- Strict TypeScript/local build, ESLint, generated types, historical/pending migration
  integrity, property/customer proposal integrity, Prettier and diff checks PASS.
- Offline P1 inspection verifies the unchanged operation SHA01b96075… and all four
  artifacts:75 steps/69 probes/713 original guards; activation/Auth/hosted writes0.
- Initial browser attempt could not bind loopback inside the sandbox; the permitted
  local rerun passed. The first new browser assertion used a region for a summary
  group; corrected its accessible grouping/selector, then all36 passed. No product
  authorization failure or hosted acceptance was observed.

No database SQL changed; native PostgreSQL schema/concurrency and recovery baseline
suites were not rerun. The aggregate npm check command includes unchanged recovery
tests, so relevant constituent checks plus the focused application/browser suites
were run instead, honoring the owner's no-retest direction. No full application
suite or new hosted Auth/RLS/durable-decision/device-recovery acceptance is claimed.
Counts overlap earlier targeted runs and must not be summed.

Synthetic screenshots are retained in ignored artifacts/property as
desktop-property-journey.png, tablet-property-journey.png and mobile-property-journey.png.

## Next independent engineering package

Add a customer-safe property attention summary derived from published reports:
show observed condition changes across check-ins and group recurring recommendations
with exact source-report links. Keep older evidence intact, distinguish repeated
observations from new damage, and avoid inferred completion or repair authorization.
This can be implemented/tested locally with the same report sources and off gates.
