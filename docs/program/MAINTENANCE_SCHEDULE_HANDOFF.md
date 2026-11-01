# A3 / FLD-001–002 · exact maintenance scheduling handoff

Date: 2026-11-01. Bounded owner: field workstream. Branch:
`codex/program-maintenance-schedule`, from exact reviewed PR #4 parent
`32e84df780b650e4a85318defc9666aa5573ea91` (`codex/program-field-scheduling`).
This child preserves its parent and targets that branch as a separate draft PR.
The coordinator records the final child SHA, independent review and exact normal CI.
Implementation is **LOCAL**, default OFF; current child CI is **UNKNOWN** before
its own automatic checks. No HOSTED or RELEASE acceptance is inferred. Release 1.0
remains **NOT READY / NOT AUTHORIZED**.

## Trigger and resulting behavior

An eligible synthetic staff reviewer can choose one exact existing published
maintenance finding, select a same-customer/property inspection plan and date,
review the original visit/plan and current maintenance/selected-plan revisions,
and explicitly confirm one inspection draft through existing
`PropertyRepository.scheduleMaintenance`. The new draft contains the selected
plan's blank checklist. It contains no copied observation, private follow-up note
or completed checklist. No actual dispatch, work order, repair completion,
publication, customer authorization or financial action occurs.

The result re-reads existing records and verifies the exact original source,
maintenance revision increment, retained draft ID, plan revision, date, draft
revision/status/content and derived schedule relationship. A prepared result opens
its exact original report/version/finding and existing inspection draft. The
read-only schedule above can be reloaded to display the new retained visit.
Already linked records offer inspection of the existing draft rather than another
preparation path. The screen labels manual responsibility separately from dispatch.

The existing authority remains `PropertyRepository`, `MaintenanceSource`,
`MaintenanceRecord`, `InspectionPlan`, `Visit`, CRM relationships and existing
member checks. No repository interface, business engine, App route, global CSS,
locked interface/artwork, schema, migration, ledger or connected capability changes.
The only existing component edit is a lazy gated child mount inside the already
isolated `FieldSchedulingPreview`.

## Source, confirmation and UNKNOWN contract

`src/lib/maintenance-schedule-handoff.ts` owns the adapter. The review is bound to
its actual object identity and a detached canonical snapshot, not to a browser ID
or serialized confirmation. Before the sole command it rechecks current eligible
synthetic membership, exact organization/customer/property/report/version/finding,
originating visit and plan revisions, selected saved plan revision, exact CRM
context, active responsibility relationship and maintenance record revision.
Changed/foreign/ambiguous/unavailable evidence fails closed. A reviewed maintenance
item must be reopened through its existing workflow first. Existing plan/date
uniqueness remains authoritative.

A repository-scoped `WeakMap` retains attempt metadata only; all business records
remain in the existing repository. The adapter reserves that attempt before the
command's first await. Its key binds organization, customer, property, original
report visit and finding, preventing a new date, adapter recreation or a newer
publication of the same visit/finding from bypassing an unresolved attempt.
Snapshots returned to callers are detached. The private review claim cannot be
forged by copying a displayed review object.

A missing, contradictory or failed acknowledgement is **UNKNOWN**. An existing
attempt cannot retry, resume, replace, rebind or clear its hold. Exact read-only
reconciliation checks the original reviewed source and original draft/record
postconditions; it never invokes scheduling. Missing evidence, changed revisions,
subsequent draft edits, revoked staff or denial do not become success. A newer
publication cannot be used to reconcile a different original attempt. Existing
reported scheduling success does not imply the draft later stayed unchanged.

Custody is only same-process synthetic session memory. Component/adapter
recreation using the same repository retains the hold; refresh, a new tab or
process loss does not retain it. This is **not durable recovery custody, genuine
Auth, operational idempotency or hosted acceptance**. Operational custody and
server authority require separate reviewed work and authorization.

The allowlisted display includes source identity, customer/property labels,
observation/recommendation/severity, current manual status/responsibility and plan
metadata. It does not serialize private follow-up notes, internal visit notes,
full estimate/job records, costs, margin, supplier data or payroll/rates. React
renders text; no HTML note rendering, provider or network writer is introduced.

## Default-OFF local review

Both exact flags and the existing DEV/HTTP(S)/literal-loopback gate are required:

```sh
VITE_FIELD_SCHEDULING_PREVIEW=true VITE_MAINTENANCE_SCHEDULE_HANDOFF_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4193 --strictPort
```

Open `http://127.0.0.1:4193/preview/field-scheduling`. The initial state has no
published handoff findings. Expand the collapsed development examples and
explicitly prepare existing synthetic source reports, choose a finding, review
current evidence, then use the labeled confirmation checkbox and draft action.
The optional lost-acknowledgement display simulation demonstrates UNKNOWN and
exact read-only reconciliation; it is not process-loss or durable custody proof.
All three companies use their existing independent synthetic repository records.
The context selector is presentation only and cannot authorize connected access.

With the second flag unset, the handoff does not mount and its CSS is not loaded;
the original field preview remains available behind its own original flag.
Query-string flag text cannot activate it. Production cannot enable the parent
preview. Dedicated tests use only ports 4193/4194, preserving existing local servers.

New styles are scoped below `.field-schedule .maintenance-handoff`/handoff children
and lazy loaded with the panel. They reuse the parent contractor palette, warm
surfaces, typography and 760px mobile context. Exact IDs wrap, mobile sections stack,
labels and native controls remain explicit, source review/results receive focus,
and error/status text uses alert/status semantics. Locked customer/back-office
styles and approved original/transparent artwork remain byte-identical.

Rollback is code-only: leave the second flag unset or remove this child mount and
owned new files. No database rollback, hosted reversal, credential, destructive
reset or mutation of reviewed parents is involved.

## Verification and evidence

- Independent final application proof: **51/51 passed** (**31 handoff + 20 existing
  field** cases). This is the final independently reported result; it was not
  rerun for delivery. The earlier recorded 49-case/29-handoff summary is historical
  and superseded by this exact final count. Tests exercise actual existing
  workflows for all three companies, detached/private-safe results and no report,
  plan, job or customer projection side effects; stale record/origin/target/context;
  foreign organization/customer/property/report/version/finding/plan; revoked and
  ineligible staff; invalid/occupied dates; concurrent/duplicate preparation;
  missing/wrong/contradictory acknowledgements; adapter recreation; newer-publication
  UNKNOWN bypass; exact read-only reconciliation and subsequent draft edits.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run build`:
  **PASS** on this child. No dependency or lockfile change.
- Actual browser command:
  `npx playwright test -c tests/program/playwright.maintenance-handoff.config.ts --workers=2`.
  The suite uses Desktop Chrome, iPad Mini and iPhone 13 Chromium profiles. Each
  journey exercises all three companies, explicit review/confirmation, changed-date
  review invalidation, focus/keyboard behavior, exact existing-source inspection,
  duplicate prevention, lost local acknowledgement display, read-only reconciliation
  and the updated existing schedule. Three independent cases verify the second flag
  remains OFF despite a query parameter. **6 passed**; zero exercised axe violations,
  horizontal overflow or external browser requests. Axe/overflow evidence covers
  reviewed, prepared and UNKNOWN states only, not a complete accessibility certificate.
- Adding the UNKNOWN focus assertion exposed result focus being lost when source
  reload temporarily unmounted the panel. The owned result effect now waits for
  current sources to finish loading and refocuses the restored result. Both prepared
  and UNKNOWN states assert actual focus after reload. Source selection also clears
  any prior displayed outcome before reading the selected exact attempt.
- Actual ignored PNGs:
  `artifacts/property/maintenance-handoff-{review,prepared,unknown}-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`.
  These are real browser captures; desktop review and mobile prepared states were
  visually inspected for source readability, wrapped IDs, stacked layout and controls.
- Parent PR #4's successful baseline checks were not restarted. The current
  coordinator `npm run features:check` passes 25 records plus all five locked files
  and 13 source bindings. This exact child predates that tooling, so its protected
  source was separately checked through the current `validateDesignContract` against
  the unchanged main contract: **5 exact files / 13 source bindings PASS**. No central
  evidence file, tooling or contract was copied, rewritten or hash-updated here.
- `.github/workflows/maintenance-schedule-handoff.yml` adds dedicated normal
  PR/push browser CI and uploads only synthetic screenshots/results. Final normal
  Foundation/compatibility/child browser CI remains to be recorded against the
  pushed child SHA; local results do not claim those jobs passed.

Existing broad application/native/recovery/Netlify/security baselines were not
manually repeated for this isolated composition. No physical device, hosted Auth,
SQL, credential retrieval, provider/message, financial, deployment or merge action
occurred. Preserve all thirteen historical migrations, separate customer14/original
4B and broker gates, frozen P1/four artifacts/approvals, locked UIs/artwork,
maintenance 2A–2F, six PROPOSED billing enhancements, NMI and Netlify/recovery gates.
