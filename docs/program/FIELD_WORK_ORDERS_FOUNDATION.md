# Cycle three · existing-job work orders and crew day

Date: 2026-11-01. Branch: `codex/program-field-work-orders`.
Exact parent: PR8 `a85946557f449f3ae944d609c4eaa9e028c3f665`.
Owner-authorized isolated local engineering; FLD-001/FLD-002 and existing
workforce/UX foundations only. Main owns the independent review, final commit and
normal CI record. Its normal CI is **UNKNOWN** before those exact pushed checks.
No parent was rewritten, merged or promoted.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Audited gap and implemented behavior

The existing field route reads inspection visits and maintenance responsibility.
Existing jobs retain immutable issued baselines; workforce retains workers and
time. A sample `assignJob` call previously validated and discarded its assignment.
There was no retained sample assignment reader, technician-safe job detail or
daily composition across those existing records.

The new panel presents an existing Job as a work order, using its **existing job
ID**, lock revision, exact issued estimate/version and selected baseline line IDs.
It creates no separate job, task, work-order ID or business store. A staff reviewer
can inspect the safe scope, review a current eligible sample worker, explicitly
confirm one local crew relationship, reload, and inspect the assigned job through
the sample technician view. The current crew relationship uses the existing
`job_assignments` composite identity and Row fields:
organization_id/job_id/user_id/active. Only local SampleState retention was added;
no schema, migration, connected assignment reader or operational authority exists.

The daily view distinguishes existing dated inspection visits from recorded crew
time. Inspection visits join only through a retained plan.job_id and exact current
organization/customer/property IDs. Their date retains the plan timezone; no
invented shift time, availability/conflict test or dispatch is implied. Recorded
segments join exact existing job and worker IDs and overlap the chosen day in the
existing workforce timezone, including explicit timestamp offsets. Segments are
recorded history, never planned shifts or completion proof. Technician views show
only their own segments on currently assigned jobs; current assigned-team labels
are separate from time access.

An absent issued property ID stays **UNKNOWN** even when an inspection plan has
an exact property association. The supplied job fixtures have that absence. No
property is backfilled from a matching customer, address, job title, first record
or similar wording. Missing job/issued/customer evidence, foreign/conflicting
inspection association or ambiguous identity fails closed. CRM reads paginate to
retain an exact issued customer beyond the first page. No customer facts, repair
completion, new schedule slot or customer authority are fabricated.

## Source, assignment and privacy contract

`src/lib/field-work-orders.ts` contains the allowlisted read projection, exact
retained source navigation, daily filtering and bounded assignment wrapper.
Reads require the current eligible sample office/field member. A technician also
needs an active current Worker and their exact active job relationship. Async
reads recheck jobs, workers, entries, timezone, assignments, memberships and
inspection sources before returning; mixed/stale source fails closed. Opening a
card re-reads the current source. Copied/tampered references, revoked access,
changed job/visit/plan or crew state cannot silently open another source.
The initial office-versus-technician classification is bound throughout the read:
a classification change at any awaited read aborts rather than retaining earlier
office scope. Retained cards bind that classification too. Assignment review and
reconciliation recheck current office eligibility after their awaited reads and
require consistent exact source snapshots.

The narrow repository delta was coordinated and approved by main. Existing
four-argument assignJob callers remain compatible through the legacy current
sample owner. The optional synthetic-only review path supplies the actual current
reviewer, job revision, issued version, expected assignment flag and synchronous
property/source guard. After its await, the repository rechecks current eligible
reviewer, active target worker/member, tenant job, source status and exact expected
relationship before its sole mutation. Connected use of this new parameter
rejects before RPC; the old connected path is unchanged.

Opaque review identity binds the exact repository, actor, source, target worker
and existing composite assignment state. An attempt is reserved before awaiting
the command. Concurrent calls, review/component recreation, a new date or a new
source revision cannot clear that composite hold. Confirmation is explicit;
there is no automatic continuation or retry.

The existing assignment Row has no command receipt, issuer, assignment revision or
historical custody. A lost acknowledgement therefore remains **UNKNOWN**, even
if exact read-only reconciliation sees the current row ACTIVE. That row cannot
retrospectively prove who executed an uncertain command. Normally acknowledged
sample writes also require exact current row/source verification before showing
retained. Holds and acknowledgements are process-local metadata, not durable
custody, genuine Auth, operational idempotency or database recovery evidence.
Refresh/new tab/process loss clears the sample state. No replacement operation
or ID is offered after UNKNOWN.

Field output uses explicit primitive allowlists: IDs/revisions, job/customer and
property labels, included source line description/quantity/unit, crew label/IDs,
inspection date/status/timezone and allowed time segment IDs/timestamps/kind.
It excludes prices, rates, costs, margin, payroll/classification/deductions,
supplier information, private estimate/visit/maintenance/time notes, attachments
and full raw job/workforce objects. Notes are never HTML. Private claim metadata
does not cross the projection. No financial/calculation or issued projection
semantics change.

## Isolated review and rollback

Both exact flags and the existing DEV + HTTP(S) + literal-loopback gate apply:

```sh
VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4203 --strictPort
```

Open `/preview/field-scheduling`. The additional panel starts below the unchanged
inspection timeline. Its sample office/technician selector affects only that new
panel; it is presentation, never a genuine staff session or route authorization.
Choose a work order, select Sam, review exact source/worker IDs, confirm, then
reload or switch to the technician sample view. No example preparation is needed.
Changing company/actor unmounts prior context; filters/reloads hide previous detail
and late source results are discarded. Source/review/result navigation receives
focus; native labeled controls and status/alert/empty states remain accessible.

The new scoped CSS is lazy loaded with its separately gated component and uses
the existing field palettes, warm surfaces, source-wrapping and 760px mobile
composition. The exact field parent mount is the only existing component change.
No App/navigation/global/locked customer/back-office/artwork change is included.
Rollback is code-only: omit the new flag or remove the panel and owned additions.
No hosted rollback, migration or external action is required.

## Verification and remaining limits

- Focused application command:
  `npx vitest run tests/field-work-orders.test.ts tests/field-scheduling.test.ts tests/jobs-workforce.test.ts tests/maintenance-schedule-handoff.test.ts`:
  **125/125 PASS**, including 47 new cases. Coverage includes all three companies,
  tenant/customer/property/crew separation, absent property identity, pagination,
  allowlist/detachment, revoked worker/member, post-await mutation, stale
  job/visit/assignment, explicit confirmation, forged reviews, concurrent holds,
  lost/missing acknowledgement, permanent UNKNOWN and exact read-only inspection.
  Ten regressions use actual manageMember transitions at original repository await
  boundaries, covering office-to-field downgrade during job/history/property/final
  reads, nested assignment review, reconciliation and post-write acknowledgement.
- `npm run lint`, `npm run format:check`, `npm run build` (including complete
  TypeScript): **PASS**. No dependency/lockfile change.
- Browser command:
  `npx playwright test -c tests/program/playwright.field-work-orders.config.ts --workers=2`:
  **6/6 PASS**. Desktop Chrome, iPad Mini and iPhone13 journeys each exercise all
  three companies, office review/confirmation, current technician assignment,
  exact source focus/keyboard, inspection versus time dates, property filters,
  empty/error/reload and new-flag-OFF behavior despite query text. No external
  browser request, horizontal page overflow or exercised-panel axe violation.
  These states are bounded evidence, not a complete accessibility certificate.
- Nine actual ignored PNGs:
  `artifacts/property/field-work-orders-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`.
  Desktop property and mobile roofing were visually inspected for native controls,
  source wrapping, scoped palettes, stacked layout and readable identity.
- Main's current validateDesignContract was run against this older-parent child
  with the unchanged main contract: **5 exact files / 13 source bindings PASS**.
  This child predates features:check; no shared tooling/evidence/contract was copied
  or hash-updated. Main owns the combined features:check and register.
- The dedicated new normal-CI workflow uses contents:read only, pinned existing
  Node/npm dependencies, the exact browser command and synthetic PNG/test output.
  CI against the eventual pushed SHA remains UNKNOWN until main records it.

The initial browser attempt found an exact-label test-locator issue after the
working source/crew/axe states; the locator was corrected to its native combobox
role and all six cases passed. No existing assertion or parent workflow changed.
Independent review then reproduced a P2 read-scope race: the pre-await office
classification survived an actual downgrade because later checks discarded their
classification result. The bound classification and explicit post-await review
checks above fix that case; the actual membership-transition regressions preserve
its denial expectation. Independent review also reproduced a legacy compatibility
regression: active estimators offered by the existing Jobs form were rejected by
new crew-only restrictions. Those restrictions now apply only to the optional fifth
reviewed-crew argument; the original four-argument active-member semantics remain
compatible. Three actual repository regressions preserve both paths. Main records
final exact independent closure in the consolidated review.
Unchanged parent CI and broad native/recovery/provider baselines were not rerun.

This is a local partial foundation: no real work dispatch, future crew-slot
planning, capacity/conflict/calendar integration, operational assignment grants,
offline capture, actual completion/proof/media custody or connected technician
session. Existing all13/customer14/original4B/broker/P1/four/approvals, locked UIs,
maintenance2A–2F/billing, recovery/NMI/Auth/financial/provider/communication/Netlify/
production/deployment/merge restrictions remain independent and unchanged.
