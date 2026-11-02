# Cycle four · source-bound crew-day capacity review

Date: November 1, 2026. Branch: `codex/program-crew-day-capacity`.
Exact parent: PR14 `921c8083046901f457374677d52fe7b14e097c86`.
Owner-authorized local FLD-001/FLD-002 foundation, default OFF. Main records the
final reviewed SHA, draft PR, independent integration result and normal CI status.
No reviewed parent is rewritten, merged or promoted. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.

## Actual sources and bounded gap

The existing C3 `readFieldWorkOrders` projection supplies existing Job IDs and lock
revisions, immutable issued estimate/version, exact CRM customer/property links,
current retained `job_assignments` relationships, active Workers, exact plan/visit
IDs/revisions, source plan timezone/date and allowed recorded time segments. No
parallel work-order, inspection, property, workforce or task identity is added.

The inspected inspection plans/visits have dates, not future timed slots. Existing
Worker/WorkforcePolicy records have no working-hours availability calendar. Payroll
thresholds and overtime policy are not working availability. Therefore actual
working availability and conflict status for untimed visits remain **UNKNOWN**.
No source is backfilled from job title, date coincidence or similar text.

The working panel accepts explicitly reviewed ephemeral work/visit windows and
human-proposed working hours for current existing workers. These are session-only
review inputs bound to exact current source cards. They are not saved scheduling
records, dispatch, actual worker availability, customer authorization or completion.
No new store/schema/ledger/API/connected capability or dependency is introduced.

## Implemented behavior

`src/domain/field/crew-capacity.ts` performs pure union/intersection arithmetic.
The existing Temporal dependency supplies real civil-day boundaries, IANA timezone
validation and local-time resolution. A day can contain 23 or 25 hours. Nonexistent
or repeated DST wall minutes reject instead of silently choosing an offset.
Positive windows are bounded to 48 elapsed hours, must overlap the selected crew
day and are clipped to its exact instant bounds for daily calculations.

- Proposed work union and proposed-hours union prevent overlap double counting.
  Outside-hours minutes use interval intersection; enough total hours elsewhere
  in the day do not hide a window outside the proposed periods.
- Exact repeated same-worker/source/day intervals count once. Adjacent intervals
  do not overlap. Partially overlapping windows for the same source are explicitly
  labeled for possible duplicate review; they do not establish two physical jobs.
- Same-worker windows identify cross-work-order and visit/work overlaps. Different
  workers are independent; merely sharing a property does not prove a conflict.
  These findings describe the explicit proposals, not a verified future schedule.
- Proposed-versus-recorded and recorded-versus-recorded overlaps remain separate
  evidence kinds. Recorded durations are the union of available visible segment
  timestamps, including recorded breaks; they are not payroll totals or shifts.
  Missing ends, invalid timing or conflicting segment IDs retain UNKNOWN instead
  of manufacturing a duration. Available history is never claimed complete.
- Date-only visits stay visible with plan timezone and exact identity. A neighboring
  source calendar date is retained when that timezone's civil day overlaps the
  planning day. A human visit window must begin on its recorded source date in
  the source plan timezone; changing the planning timezone cannot rebind it.
- Existing issued baselines without a property ID remain UNKNOWN. A linked visit
  uses its own exact existing plan/property relation without rewriting the baseline.

`src/lib/field-crew-capacity.ts` admits primitive named data fields only. Exact
boolean confirmation is required at entry and after awaited reads. No getter,
serializer or object-valued date/time coercion supplies a review fact. Input
primitives are pinned before waits; subsequent confirmation revocation aborts.
Review is bounded to 32 proposed windows and 32 proposed-hours periods.

Actual current sample office membership is required. Existing C3 reads retain
current company/customer/property/job/issued source, crew and classification checks.
Each proposed source must be an actual retained same-repository/org/actor work-order
card and a current assigned worker; optional visit identity must belong to that
exact job. A final fresh read rejects mixed or changed sources/classification.
Technician and connected use remain closed for these office proposal controls.

Main explicitly coordinated the narrow C3 `fieldWorkOrderBinding` helper. It first
checks the existing WeakMap/repository/org/actor/current access class, then compares
only own data descriptors against the producer's retained shape. Extra, accessor,
symbol, inherited or altered fields reject before caller serialization. Existing
source navigation invokes it before and after its await. It returns existing read
metadata, never a token, new authority, record or execution capability. Original
valid source navigation and assignment reconciliation semantics remain unchanged;
no Phase3, Operations, shared type, schema or writer changed.

The review result is a deep-frozen detached snapshot of allowlisted source identity,
proposed windows/hours, calculated minutes, overlap evidence, untimed visits and
explicit coverage limits. Internal prices, costs, rates, payroll, time narratives,
maintenance notes and raw business objects do not cross this projection. It is not
continuously refreshed. Editing proposals clears the visible result and explicit
confirmation; company/staff/reload changes discard prior component state. Source
navigation rereads the exact original work order and moves focus to its evidence.
No action consumes a review result to mutate or dispatch. UNKNOWN reads never replay
or retry an existing assignment command; C3's permanent uncertain-command holds stay
unchanged. Refresh/process loss does not provide durable custody.

## Local demonstration and rollback

The existing field and work-order gates plus the new exact flag all apply:

```sh
VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true VITE_FIELD_CREW_CAPACITY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4212 --strictPort
```

Open `http://127.0.0.1:4212/preview/field-scheduling`.

1. In Work orders & crew day, open the existing job, select Sam, review and explicitly
   confirm the existing sample crew relationship. Reload field records.
2. In Crew-day capacity & overlaps, select Sam and the existing work order. Add a
   09:00–11:00 proposed window. Select the linked property visit and add 10:00–12:00.
3. Add explicitly proposed working hours 08:00–10:00. Check the review confirmation
   and choose Review crew-day capacity. The result shows 180 union work minutes,
   120 proposed-hours minutes, 120 outside-hours minutes and a 60-minute overlap.
4. Open the exact source, remove one window, clear proposals, review an empty day,
   inspect invalid timezone handling and switch to the technician view. No source
   becomes scheduled, dispatched, repaired or authorized by these actions.

Controls preserve the existing field palette, typography, warm surfaces, native
labels, source wrapping, keyboard focus and 760px stacked layout. New styles are
scoped/lazy. Without the new flag no panel or new CSS mounts, even if URL text names
the flag. The existing DEV/HTTP(S)/literal-loopback gate remains; production cannot
mount this route. No approved customer/back-office design or artwork changed.

Rollback is code-only: leave the flag unset or remove the owned panel/helper/read
modules and mount. No persistent or hosted cleanup is needed.

## Focused evidence

- `npx vitest run tests/field-crew-capacity.test.ts tests/field-work-orders.test.ts tests/field-scheduling.test.ts tests/jobs-workforce.test.ts`:
  **151 PASS**, including **57 new** cases. Actual all-three-company repositories,
  original issued baselines, actual second-job creation through the existing sample
  estimate engine, crew assignments, current/stale/revoked/classification changes,
  source navigation, confirmation revocation at distinct awaited boundaries, no
  coercion/getter/serializer invocation, tenant/customer/property identity, exact
  source revisions, duplicate/adjacent/ambiguous windows, union capacity, missing
  availability, recorded history, open ends, cross-midnight and DST are covered.
- Strict types, full lint, full formatting and local build: **PASS**.
  No broad recovery/security/native baseline rerun.
- `npx playwright test -c tests/program/playwright.field-crew-capacity.config.ts --workers=2`:
  **6/6 PASS**. Desktop Chrome, iPad Mini and iPhone13 journeys each exercise all
  three palettes, actual existing assignment/navigation, explicit proposal review,
  overlaps/union/outside-hours, empty/invalid/default-OFF, current technician denial,
  keyboard/focus and source navigation. Zero exercised-panel axe violations,
  horizontal page overflow or external requests. Nine actual screenshots remain
  ignored synthetic PNGs under
  `artifacts/property/crew-capacity-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`.
  Desktop property and mobile roofing were visually inspected for readable controls,
  scoped palette, source wrapping and stacked layout. These exercised states do not
  certify all accessibility or operational states. One initial source-identity
  assertion exposed the absent visible organization binding; the actual UI now
  includes it. A later transient desktop actionability timeout passed on isolated
  and final complete runs with the original assertions unchanged.
- Main's unchanged design contract, checked against this older-parent worktree:
  **5 exact files / 13 source bindings PASS**. This child predates `features:check`;
  main owns combined current-source inventory/checker/register evidence. A passing
  hash check is not hosted or complete accessibility acceptance.
- Main approved a new `contents: read`-only dedicated browser workflow matching the
  existing Node24/pinned dependency/loopback/synthetic-artifact contract. No previous
  workflow, assertion or validation is weakened. Normal CI remains UNKNOWN until
  exact final pushed SHA evidence is recorded by main.

## Remaining dependencies

Operational availability, real timed scheduling, shared conflict reservation,
dispatch, connected technician authority, durable/offline custody and genuine physical
completion are unverified or not implemented. The next bounded useful package is
exactly reviewed proposed travel/buffer constraints over these same retained sources;
it must not invent actual travel times or a future scheduling store.

All13 historical migrations, pending customer14, original4B, frozen P1/four artifacts,
existing approvals, locked interfaces/artwork, maintenance2A–2F, six proposed billing
items, original Netlify package/executor and recovery/P1-on13/separate14/exact4B+
broker/NMI/Auth/financial/provider/communication/hosted/deployment/merge gates remain
unchanged. No credentials, hosted mutation, migration, real communication, payment,
financial execution, deployment, publication or merge occurred.
