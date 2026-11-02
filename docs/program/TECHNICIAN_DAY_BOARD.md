# Source-bound technician day board · Cycle 5

Feature owner: A3 / Field. Parent: draft PR #20,
`5a96baf9ebf7c8e17177be67d5d6f2b26cef5f33`. Branch:
`codex/program-technician-day-board`. This is isolated, local synthetic implementation
under the exact owner plan `3bf2e0cfca691cb164e1c42290ccf09ad6804c8a`, not operational
scheduling or Release 1.0 acceptance.

## Working implementation

The existing field preview now has an independently default-OFF technician day board.
It organizes actual current work-order, issued baseline, CRM customer/property,
existing job crew, plan/visit and timestamp evidence into readable technician lanes.
Office users can filter current workers. A current field technician sees only their
own assigned evidence and no office proposal controls. The board does not create or
change assignments; retained C3 assignment/navigation remains the existing workflow.

`src/lib/field-day-board.ts` composes existing `readFieldWorkOrders`,
`openFieldWorkOrder`, `fieldWorkOrderBinding` and `reviewCrewDayCapacity`. No duplicate
capacity mathematics, repository, business store, schema or scheduling service exists.
The only inherited presentation edit is a lazy, exact-flag DEV/literal-loopback mount
in `FieldWorkOrdersPreview.tsx`. New scoped styles leave approved interfaces intact.

Three evidence kinds remain visually and semantically separate:

- **Human-proposed window**: optional ephemeral local start/end values bound to the
  exact retained work order, current assigned worker and optional exact visit. The
  existing C4 capacity engine calculates unioned work, proposed hours, outside-hours
  minutes and overlap kinds. Explicit current human confirmation is mandatory.
- **Recorded timestamp evidence**: exact original timestamp/segment IDs and kind,
  with original offset preserved. Open ends remain UNKNOWN. Timestamp evidence can
  include breaks and incomplete records; it does not establish future availability,
  payroll net hours or verified physical completion.
- **Date-only visit · TIME UNKNOWN**: exact plan/visit revisions, source property,
  recorded calendar date and source timezone. A civil date overlapping the selected
  board day is retained. Job crew membership is not a specific technician appointment.
  No fake start/end, travel time or availability is supplied.

Timed entries are ordered by exact instants using the existing Temporal dependency;
proposed local wall times use the same C4 reject-on-DST-ambiguity rule. Date-only
entries remain a separate untimed group. Cross-midnight inputs retain their original
range while C4 daily totals clip to exact selected-day boundaries. Civil days can
have 23 or 25 hours. Unknown baseline property IDs stay UNKNOWN even if another
linked visit has a valid property; no property is inferred from text or coincidence.

Each event carries existing job/revision, estimate/issued-version/number, customer,
property and applicable plan/visit revision or recorded segment identity. Source
buttons invoke the original exact work-order reader and focus existing source detail.
No latest-version, nearest-property or fuzzy fallback exists. A WeakMap retains only
read provenance; it stores no new business record or execution authority.

## Current-source and uncertainty boundary

Inputs are bounded primitive own-data fields. Caller getters, serializers, inherited
fields, unknown keys and non-boolean confirmation cannot supply review facts. At most
32 proposed windows and 32 proposed-hours periods are admitted. Proposal/board date
and timezone must match. The entire input binding is pinned before waits, including
exact original source binding; live edits or confirmation withdrawal abort.

Current actual sample organization/membership, role classification, worker/job crew,
issued version, CRM/property and plan/visit evidence are checked through existing
readers. A final fresh read rejects source or classification drift. Source navigation
rechecks current original evidence and live inputs before and after its final awaited
read. Missing/foreign/stale or denied evidence fails closed; no command retries,
replacement identities, dispatch or assignment replay can occur through this reader.

The exported React component owns its repository/model/parent-day identity boundary,
so it clears old evidence even without a parent React key. Company/role/source/day
changes reset proposals and old result. Editing any current inputs immediately clears
visible results and confirmation, invalidates pending reads and discards late responses.
The snapshot is not continuously subscribed; callers must rerender after synchronous
context/source changes. Every new review/source action reads current repository facts.
Refresh/process loss does not imply durability or recovery custody.

No cost, margin, supplier pricing, workforce rate, payroll, private time narrative or
maintenance note is projected. This is a staff-only isolated preview; no customer
route, approved customer UI or customer-safe packet is changed.

## Local demonstration

```sh
VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true VITE_TECHNICIAN_DAY_BOARD_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4216 --strictPort
```

Open `http://127.0.0.1:4216/preview/field-scheduling`.

1. Review the unassigned day; empty evidence explicitly does not prove availability.
2. Use the existing work-order assignment review above to retain Sam's actual local
   synthetic job relationship, then reload existing field records.
3. Choose Sam in Board technician. Open optional human proposals. Add the work order
   at 09:00–11:00 and its exact visit at 10:00–12:00. Add proposed hours 08:00–10:00.
4. Explicitly confirm temporary inputs and choose Review technician day. The lane
   shows 180 union work minutes, 120 proposed-hours minutes, 120 outside-hours minutes
   and a 60-minute visit/work overlap. Date-only evidence still says TIME UNKNOWN.
5. Open source detail, clear proposals, inspect an empty day or invalid timezone,
   and switch to the existing technician view. No data is scheduled or dispatched.

Default OFF is independent of URL/query text. Unset the new flag to remove both the
mount and scoped CSS. No data cleanup or hosted rollback is required. The existing
C4 capacity panel can remain separately OFF; this board reuses its read service.

## Focused verification

- `npx vitest run tests/field-day-board.test.ts tests/field-crew-capacity.test.ts tests/field-work-orders.test.ts`:
  **141 PASS**, including **37 new** day-board cases. Actual all-three-company
  repositories/IDs, exact source opening, job/visit/property/version provenance,
  tenant/worker isolation, own technician scope, canonical overlap/union/adjacency,
  duplicate handling, cross-midnight and both DST day lengths/ambiguous wall times,
  live input/confirmation changes, actual membership downgrade, source revision/CAS
  drift, open timestamp ends, private-field exclusion and zero business writes pass.
  Two initial test setups modified detached read copies; they were corrected to use
  actual existing `saveVisit` and `manageMember` operations. Assertions were retained.
- `npx playwright test -c tests/program/playwright.technician-day-board.config.ts --workers=2`:
  **9 PASS**. Desktop Chrome/iPad Mini/iPhone13 cases each exercise all three brands,
  actual retained assignment/navigation, exact source focus, proposed conflicts,
  keyboard activation, empty/error/OFF, role reset and real-model replacement/late
  read discard without parent remount. Full axe in the actual-model fixture and
  scoped production-composition panel scans found zero exercised violations; no
  horizontal page overflow or external requests occurred. The initial fixture's
  missing h2 was fixed, preserving the full axe assertion. Select controls use their
  exact accessible role/name rather than nested-label option text in test locators.
- Strict types/generated types, full lint, full formatting, local build and diff
  whitespace checks: PASS. No unrelated recovery/native baseline rerun.
- Main's public protected-source manifest: **128 exact hashes PASS**. Approved
  design contract: **5 files / 13 source bindings PASS**. No hash was updated.
- Main explicitly approved one new read-only dedicated workflow using existing
  Node24/dependencies, local build, loopback browsers and synthetic artifacts only.
  Final pushed-SHA CI is reported by Main; local proof does not claim GitHub PASS.

Nine actual synthetic screenshots are ignored under
`artifacts/property/technician-day-board-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`.
Desktop property-services and mobile roofing images were inspected for readable
proposal controls, source identity wrapping, contractor palettes and stacked layout.
These exercised states are bounded evidence, not universal accessibility acceptance.

## Missing operational authority

Actual working availability, real timed appointments, shared reservation/conflict
custody, travel policy, dispatch, durable/offline capture and genuine technician Auth
remain unverified or unimplemented. Proposed hours do not become shifts or company
policy. Neither a conflict-free proposal nor inspection absence proves completion,
customer approval, payroll compliance or financial authority.

Preserved unchanged: all13 historical migrations, pending customer14, original4B,
frozen P1/four artifacts, owner approvals, locked interfaces/artwork,2A–2F, six proposed
billing items, original Netlify archive/executor and recovery/P1-on13/separate14/
exact4B+broker/NMI/Auth/provider/financial/communication/hosted/deploy/merge gates.
No hosted action, credentials, customer communication, financial execution, migration,
assignment mutation, dispatch, deployment or merge occurred through this feature.
Release1.0 remains NOT READY / NOT AUTHORIZED.
