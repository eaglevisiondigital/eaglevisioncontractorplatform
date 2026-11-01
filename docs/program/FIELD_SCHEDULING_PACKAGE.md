# A3 / FLD-001–002 · isolated inspection schedule

Date: 2026-11-01. Owner: Lead Codex, bounded field workstream. Source baseline:
`dc7ed7c2db3cf8ff78a3d6f09098a1b623622874`, branch
`codex/program-field-scheduling`. Implementation is **LOCAL**, default OFF. No
HOSTED or RELEASE acceptance is claimed. Release 1.0 is NOT READY / NOT AUTHORIZED.
The coordinator records the final commit and CI evidence separately; no previous
CI result certifies this package before its own checks run.

## Existing capability inventory

| Capability                                         | Actual source and retained test evidence                                                                                                                                                                                      | Supported conclusion                                                                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM customer/property and synthetic staff          | `src/lib/operations.ts`: `listCustomers`, `listLocations`, `syntheticProperty`, `syntheticMemberships`; `tests/database/isolation.test.ts`                                                                                    | Existing organization/customer/service-location relationships; selectors are not authorization.                                                                                                                              |
| Inspection plans, dates, recurrence and visits     | `src/domain/property/inspections.ts`: `InspectionPlan`, `Visit`, `occurrence`; `src/lib/property.ts`: `initialize`, `refreshContexts`, `createPlan`, `savePlan`, `addVisit`, `saveVisit`, `submit`, `publish`, `revise`       | Existing day-based inspection workflow; plan timezone and weekly/monthly/custom recurrence. `addVisit` validates real calendar dates and uniqueness per plan/date. No crew/time-slot dispatch engine.                        |
| Immutable reports and exact maintenance provenance | `src/lib/property.ts`: `maintenance`, `maintenanceSource`, `scheduleMaintenance`; `src/domain/property/maintenance.ts`; `tests/maintenance-center.test.ts`, `tests/property-history-projection.test.ts`                       | Report/version/finding/property identity already exists. Staff review, priority and follow-up responsibility are separate from physical repair. Exact follow-up drafts already use the visit workflow.                       |
| Contractor presentation                            | `src/components/property/PropertyWorkspace.tsx`, `ContractorPropertyWorkspace.tsx`, `MaintenanceCenter.tsx`, `ContractorBackOfficeLayout.tsx`; `tests/browser/maintenance-center.spec.ts`                                     | Approved back-office navigation, triage and inspection editors already exist and stay unchanged.                                                                                                                             |
| Jobs and staff access                              | `src/lib/phase3.ts`: `jobs`, `assignJob`, `assignSupervisor`; `src/components/phase3/Jobs.tsx`; `src/domain/jobs/financials.ts`                                                                                               | Job baseline, cost and staff-access concepts exist. Sample `assignJob` validates member/job but does not retain a dispatch assignment. Sample `assignSupervisor` has no retained implementation. Neither is crew scheduling. |
| Timekeeping/payroll preparation                    | `src/lib/phase3.ts`: `workforce`, `recordTime`, `clock`, `submitTime`, `reviewTime`; `src/domain/workforce/payroll.ts`; `tests/jobs-workforce.test.ts`, `tests/database/phase3.test.ts`, `tests/database/concurrency.test.ts` | Existing time entries, breaks, supervision/access checks, overtime and payroll preparation. The free-text time-entry `task` is not a separate task/work-order lifecycle. No payroll execution is authorized.                 |
| Historical database definitions                    | `supabase/migrations/`: existing jobs, job assignments, worker/supervisor/time/payroll and private inspection objects; mirrored property source in `server/property/schema.proposed.sql`                                      | No schema or migration is added or applied by this package. Current hosted installation, grants and acceptance are not refreshed.                                                                                            |
| Offline capture, dispatch and proof of work        | No verified integrated operational implementation identified in inspected paths                                                                                                                                               | UNKNOWN for operational acceptance. Do not infer offline custody, actual dispatch or repair completion from visits, reports or time records.                                                                                 |

Historical tests in this inventory are source evidence, not rerun or recertified
here unless listed below. Maintenance 2A–2F security and persistence results remain
scoped to their original disposable fixtures and unchanged evidence.

## Functioning bounded package

New `src/components/field/FieldSchedulingPreview.tsx` and scoped CSS provide a
read-only timeline of actual existing inspection visits, grouped visually by
recorded date with property, customer, cadence, timezone, phase and visit status.
Date range, property, follow-up responsibility and draft/submitted/published filters
combine. Counts cover available visit records, never complete historical coverage.
Individual filters clear independently or together. Empty, loading, invalid-filter,
source-error and reload states are explicit. Source detail receives keyboard focus.

Each card opens its exact current visit and plan revisions, or a particular
immutable published report/version. Follow-up cards can also open the exact original
report/version/finding that produced their existing maintenance scheduling draft.
The selected scheduling visit and original report visit are labeled separately.
Observations and recommendations are distinct. Published status, a later omission,
scheduling, responsibility and review never establish repair or work authorization.

The optional collapsed development control explicitly uses
`prepareMaintenanceExamples`, then existing `saveMaintenance` and
`scheduleMaintenance` to prepare one assigned local draft. It does not create a new
scheduling store. A pre-await one-attempt guard prevents a second fixture attempt
within that company component; the existing source/date/record guards also apply.
Failure retains records for inspection and does not retry. Switching company or
reloading is only a disposable demonstration context, never operational custody.
No real dispatch, publication, job creation, customer message or financial action
is added. The repository's existing `initialize` seeds its established synthetic
CRM/estimate/job/visit baseline; the timeline does not create another baseline.

## Shared read/data contracts

`src/lib/field-scheduling.ts` owns the narrow adapter; no database or Map of field
business records is introduced.

- `readFieldSchedule(repo, org, actor)` first invokes existing maintenance authority.
  Connected mode fails before membership/network access. Current synthetic eligible
  owner/admin/office-manager/estimator and exact organization are required. It reads
  existing plans/visits, validates CRM customer/property and exact plan/job context,
  and derives maintenance relationships through exact `scheduled_visit_id` only.
- `FieldVisitReference` retains organization, customer, location, plan ID/revision,
  visit ID/revision. These are current source references, not authorization tokens.
- `FieldVisitRow` allowlists date, timezone, plan name/cadence, property/customer
  display, visit phase/status/summary, current follow-up responsibility and exact
  report/version/finding references. No internal notes, supplier costs, margin,
  payroll/rates or complete estimate/job object is serialized.
- Responsibility is an existing maintenance follow-up responsibility only. Missing
  active staff evidence is explicitly uncertain, not relabeled unassigned. It
  confers no job/workforce access grant or crew dispatch authority.
- `openFieldSource` re-reads the current authorized projection, requires the exact
  complete reference and rejects changed visit/plan revisions or foreign report
  identity/version. Published evidence remains immutable across later draft edits.
- `openFieldOrigin` additionally requires exact retained finding provenance and
  scheduled visit relationship; no text matching or nearest/latest report fallback.
- `filterFieldSchedule` validates strict real dates, inclusive bounds and explicit
  status enum. Invalid inputs hide results. An unknown property/member has no match;
  it cannot expand access. Source actions repeat authorization and source checks.

There is no new API endpoint, connected component, network writer, browser storage,
credential loader, SQL or operational adapter. Source detail is a narrow read
presentation of existing records, not a second inspection/report system.

Any later scheduling mutation must reuse existing visit and maintenance guards:
current eligible member, exact tenant/customer/property/source, saved plan and record
CAS, date uniqueness, explicit confirmation and durable one-shot/UNKNOWN handling.
This read-only prototype provides no operational CAS/dispatch/restore guarantee.

## Default-OFF invocation and integration

`src/App.tsx` has only one narrowly mounted route: `/preview/field-scheduling`.
It requires **all** of `import.meta.env.DEV`, exact
`VITE_FIELD_SCHEDULING_PREVIEW=true`, HTTP(S) and a literal loopback hostname.
The recommended server binding is also loopback:

```sh
VITE_FIELD_SCHEDULING_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4186 --strictPort
```

Open `http://127.0.0.1:4186/preview/field-scheduling`. Choose each company, expand
Development-only examples & states, explicitly prepare the follow-up example,
filter responsibility to field staff, and open its originating finding. Reset
filters to inspect all existing visit/report cards. No existing menu or locked UI
is changed. The original customer and contractor components/CSS/artwork are intact;
the new scoped attribution uses the existing approved transparent derivative.

A production build always renders the disabled state, even with the flag set.
Hostname and flags are isolation controls for this synthetic presentation, not
operational authorization. The component constructs only existing sample repositories.

Shared design contract: use current contractor palette, warm neutral surfaces,
existing typography patterns and original Propel artwork. All new CSS is scoped to
`.field-schedule`. Future promotion into the approved back office requires explicit
visual/integration review; this package does not promote or redesign that workspace.

Rollback: leave the flag unset, or remove the isolated App branch/lazy import and
new field files. No data migration, hosted reversal, destructive reset or rollback
of existing source records is required. Keep the protected baseline unchanged.

## Focused validation

- `npm test -- tests/field-scheduling.test.ts tests/maintenance-center.test.ts`:
  **47 passed** in two files, including **20 new** field cases and 27 existing
  maintenance compatibility cases. All three companies; exact provenance; tenant,
  customer/property and member boundaries; inactive responsibility; stale visit/plan
  revisions; invalid filters; immutable original reports; no private-field or
  financial side effects; default-OFF/nonlocal/production denial.
- `npm run build`: passed strict TypeScript and local Vite production build.
- `npm run lint`: passed after moving the fixture render state out of a ref.
- `npx playwright test -c tests/program/playwright.config.ts --workers=2`:
  **6 passed** across desktop/tablet/mobile. Each of three journey cases exercises
  all three contractor companies; three additional cases verify production-disabled
  behavior and existing locked portal smoke. Filters, exact report and finding IDs,
  stale-safe source inspection, keyboard activation, errors, empty states, reload,
  duplicate fixture button guard, zero external requests and zero horizontal
  overflow pass. Axe reports zero violations on exercised source-review states.
- The initial browser run caught inherited low-contrast definition labels; only
  the new scoped styles were corrected. Visual review also caught the shared fixed header height causing mobile overlap; the isolated header now has automatic height and an explicit overlap regression. No existing design tokens changed.
- Real screenshots: `artifacts/property/field-schedule-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`, nine ignored local PNGs.
  Desktop and mobile were visually inspected; they show the real follow-up draft
  and exact original report/finding, not a generated mockup.
- Dedicated `.github/workflows/field-scheduling.yml` runs the actual enabled DEV and disabled production browser configuration on relevant normal PR/push changes. It follows existing Node24/npm/Playwright setup and uploads only synthetic field screenshots/test results. Local equivalent: `npm run build && npx playwright test -c tests/program/playwright.config.ts --workers=2`. It does not duplicate the foundation database, recovery or full application suites.
- The known baseline program/register Markdown formatting failure was corrected by
  the coordinator’s common ancestor `f568ed15`. After rebasing onto that reviewed
  documentation-only change, the complete format check passes. This package does
  not overwrite central documents.
- No unchanged native SQL, Netlify offline, recovery/device/setup or maintenance
  security suite was repeated. Normal CI must validate the final integrated SHA.

## Remaining acceptance and next bounded package

FLD-001: **LOCAL partial**. Existing inspection/maintenance workflow plus this
isolated read-only timeline has executable local evidence. Genuine authorized
staff/technician sessions, operational private custody, hosted grants and source
acceptance remain unverified. No new general task/work-order store is certified.

FLD-002: **LOCAL partial for existing timekeeping and isolated schedule viewing**;
actual dispatch/offline field work remain **UNKNOWN/not implemented**. A complete
crew assignment model needs separately approved shared identities, availability,
conflict/timezone semantics and genuine staff/job authorization. Operational
persistence, mobile offline conflict/recovery and proof-of-work/media custody are
separate unmet gates. Do not upgrade these from a synthetic timeline.

Next: review one exact existing inspection-follow-up draft handoff from maintenance
to schedule inspection, including current source/plan/record revisions and explicit
staff confirmation. Add no dispatch or financial authority. Any operationalization
must first satisfy original recovery/P1-on13, separately authorized customer14/4B/
broker and relevant private scheduling ownership/grants/target gates. New release
scope must not change protected historical schemas, approvals or locked interfaces.
