# Cycle15 · practical task continuity · prepared assignments

Status: **PREPARED, IMPLEMENTATION NOT STARTED**. This brief does not claim active
feature agents, new code, a tested Cycle15 candidate or operational acceptance.
The owner requested assignment preparation after Cycle14 CI reconciliation.
Base: `610e38abc37a16a9a894e946c0c4c4df16120985`, coordination draft PR96.
The demonstrated Cycle14 failure is corrected and the full dedicated run passes;
both exact-head Foundation runs now PASS, with all30checks verified successful.
See [CI reconciliation](CYCLE14_CI_RECONCILIATION.json) for timestamped evidence.

## One source set, fewer repeated steps

Use the existing OperatingSources environment, retained selected-job capture and
original review/confirmation controls. A presentation hint never authorizes access.
The target is one understandable task path through existing panels, with an exact
source and a useful return destination. Do not add another six-panel navigation
group, another task database, copied estimate engine or a second reservation store.
New narrow consumers may compose existing public functions; original author blobs,
source indexes, workflow guards, locked artwork and approved layouts remain exact.
Any genuinely necessary shared change returns to Main before implementation.

## Bounded independent packages

All six proposed branches start from the same reconciled exact base. Exact file
ownership is listed below; no other source may change without prior Main
coordination. Main alone edits composition, shared contracts, indexes and registers.
The branch names below are reserved proposals, not existing feature branches/PRs.

| Package / proposed branch                             | Existing sources to consume unchanged                                                                                                                                              | Functioning deliverable and source-based acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field · `codex/cycle15-field-task-continuity`         | `schedule-work-order-continuity.ts`, `work-order-revisions.ts`, `crew-plan-review.ts`, original field evidence readers                                                             | Inspect an exact schedule predecessor and work-order instruction, navigate to the same job/technician-day evidence and return without reselection. Retain expiration/cancellation/revocation and one-use holds. Missing timed availability remains UNKNOWN. Test competing edits, withdrawn membership, changed work order, primary context switch and exact read-only reconciliation; never dispatch or infer time worked.                                                                             |
| Finance · `codex/cycle15-finance-review-path`         | `finance-case-continuity.ts`, `financial-casework.ts`, `financial-evidence-review.ts`, canonical cost/calculation/ledger readers                                                   | Follow a selected financial exception through exact cost coverage, invoice requirements and canonical event/posting evidence, then return to the same case. Distinguish absent costs from zero and readiness from permission to issue. Test stale invoice snapshots/issued-source hashes, job lock revisions and as-of evidence, wrong job/property, inconsistent posting identity, aggregate reconciliation and customer-safe exclusion; no ledger, invoice or payment write.                          |
| Customer · `codex/cycle15-service-review-path`        | `service-source-continuity.ts`, `service-passport-desk.ts`, `service-lifecycle-review.ts`, issued/report safe projections                                                          | Follow one service request through a recorded job link when present, otherwise explicit staff-selected context with the absent relationship UNKNOWN, then exact published report/version/finding and safe Passport documentation, retaining the return context. Explicitly distinguish staff-selected context from recorded links and documented evidence from verified physical completion. Test missing/ambiguous links, unpublished/replaced report versions, unrelated jobs and company withdrawal. |
| Growth · `codex/cycle15-maintenance-review-path`      | `maintenance-planning-continuity.ts`, `follow-up-readiness.ts`, `follow-up-admission.ts`, disposable test-only consent laboratory readers (never browser or operational authority) | Inspect an upcoming occurrence/renewal, its exact purpose and current suppression/consent gaps, then return to the same planning item. Planning never enrolls or sends. Test cancellation/revocation, conflicting purpose/channel evidence, suppression changes during awaits and terminal UNKNOWN retention. No sender, recipient resolution or outbound worker.                                                                                                                                       |
| Intelligence · `codex/cycle15-explainable-task-links` | `verified-task-handoff.ts`, `verified-operating-suggestions.ts`, `operating-navigation.ts`, `daily-action-center.ts`                                                               | Show why a daily suggestion exists, its exact source/version and missing evidence, then open only its authorized original review destination. Preserve the existing finite window and final source/state check. Test expired windows, source replacement, revoked staff, unknown destination and changed job selection. Recommendations never execute actions.                                                                                                                                          |
| Advanced · `codex/cycle15-addon-task-continuity`      | `source-bound-addons.ts`, `addon-review-desk.ts`, `sync-admission-review.ts`, original seven-mode lifecycle                                                                        | Reduce repeated evidence entry and improve the return path in existing offline, voice, receptionist, Storm/Network, accounting, procurement and trade-edition reviews. Carry the once-selected exact job/mode/edition into unchanged original controls. Test every existing mode, dirty/changed source, conflicting predecessor and UNKNOWN remount/reconciliation. No provider adapter, import, synchronization, booking acceptance or message execution.                                              |

These are extensions of existing workflows, not six replacements. Source identities
are actual company/customer/property/job/issued-version/report/finding/event/receipt
objects. Labels, URLs, descriptions and whichever record is newest are insufficient.
No package may infer customer approval, repair completion, consent, availability,
financial coverage or external delivery from absent evidence.

## Exact ownership

Every row reserves five finite paths. Views/styles are permitted only if the
existing component cannot express the required task; unused files must not be
created. No child edits a retained author blob or adds a navigation registry.

| Package      | Adapter                                        | Consumer view                                        | Scoped style                                           | Application test                                | Documentation                                     |
| ------------ | ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------- |
| Field        | `src/lib/workflows/field-task-continuity.ts`   | `src/components/workflows/FieldTaskContinuity.tsx`   | `src/components/workflows/field-task-continuity.css`   | `tests/cycle15-field-task-continuity.test.ts`   | `docs/program/CYCLE15_FIELD_TASK_CONTINUITY.md`   |
| Finance      | `src/lib/workflows/finance-review-path.ts`     | `src/components/workflows/FinanceReviewPath.tsx`     | `src/components/workflows/finance-review-path.css`     | `tests/cycle15-finance-review-path.test.ts`     | `docs/program/CYCLE15_FINANCE_REVIEW_PATH.md`     |
| Customer     | `src/lib/workflows/service-review-path.ts`     | `src/components/workflows/ServiceReviewPath.tsx`     | `src/components/workflows/service-review-path.css`     | `tests/cycle15-service-review-path.test.ts`     | `docs/program/CYCLE15_SERVICE_REVIEW_PATH.md`     |
| Growth       | `src/lib/workflows/maintenance-review-path.ts` | `src/components/workflows/MaintenanceReviewPath.tsx` | `src/components/workflows/maintenance-review-path.css` | `tests/cycle15-maintenance-review-path.test.ts` | `docs/program/CYCLE15_MAINTENANCE_REVIEW_PATH.md` |
| Intelligence | `src/lib/workflows/explainable-task-links.ts`  | `src/components/workflows/ExplainableTaskLinks.tsx`  | `src/components/workflows/explainable-task-links.css`  | `tests/cycle15-explainable-task-links.test.ts`  | `docs/program/CYCLE15_EXPLAINABLE_TASK_LINKS.md`  |
| Advanced     | `src/lib/workflows/addon-task-continuity.ts`   | `src/components/workflows/AddonTaskContinuity.tsx`   | `src/components/workflows/addon-task-continuity.css`   | `tests/cycle15-addon-task-continuity.test.ts`   | `docs/program/CYCLE15_ADDON_TASK_CONTINUITY.md`   |

Finance event/posting records have no invented version field: compare their exact
immutable IDs/content and canonical relationship, with the existing invoice
snapshot/issued-source hash, job lock revision and observation cutoff as applicable.
No request-to-estimate/job foreign key is fabricated from selected context.
Consent race tests remain in the existing disposable laboratory only.

## Scheduling and ownership

The following roles are proposed, **not active on Cycle15 feature implementation**.
Two completed workers can be reused; assign a Field/Growth worker at launch.
The brief has had a separate read-only review; this is not a feature assignment.

| Proposed worker                       | Wave one                              | Wave two                                                  |
| ------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| Field/Growth worker: assign at launch | Field                                 | Growth                                                    |
| `/root/cycle13_finance_intelligence`  | Finance                               | Intelligence                                              |
| `/root/cycle13_customer_advanced`     | Customer                              | Advanced                                                  |
| Main `/root`                          | Shared contracts and source admission | Composition, QA, registers                                |
| `/root/cycle13_independent_review`    | No authoring role                     | Independent combined review after the candidate is frozen |

At most three workers plus Main run concurrently, in separate temporary worktrees.
Each package gets its own draft PR against a separate Cycle15 coordination branch;
that branch targets `codex/program-cycle-fourteen`. Do not rewrite parent branches,
merge drafts or silently promote feature stages. Record real activation/completion
states, full author SHAs, owned files and actual tests only after they exist.

## Combined acceptance and visual limits

- Before launch, confirm Main96's corrected exact-head CI outcomes. Preserve the
  five unchanged child25-minute Foundation cancellations as cancellations; do not
  replay known-budget runs or copy Main success onto a child SHA.
- Main admits exact author blobs into one disposable source environment and keeps
  the original context before/after every handoff. Source replacement, tenant or
  membership withdrawal must immediately remove old detail and action controls.
- Test real proposed paths, source identity, negative authorization, privacy,
  stale/competing updates, duplicate prevention and UNKNOWN exact reconciliation.
  Same-tab memory is not crash durability, genuine Auth or independent recovery.
- Exercise all three existing brands on desktop/tablet/mobile, keyboard/focus,
  accessible names, status/empty/error states, axe,44px touch controls and no page
  overflow. Record trusted task clicks and compare with retained paths; do not
  invent performance targets or claim usability approval from a passing test.
- Run focused source/application/browser tests, strict/generated types, lint,
  formatting, build, feature evidence and protected integrity. Keep broad automatic
  CI normal; never rerun successful historical recovery/Netlify/security suites
  manually without a new demonstrated reason.
- Independently review exact shared types, tenant/data ownership, source versions,
  author/protected hashes, approved design locks and default-OFF admission. Update
  acceptance/delivery records without changing the original25capability states or
  18scope IDs. Publish full SHA/run evidence and unresolved dependencies honestly.

The three approved design scopes stay locked. Operating Center and advanced panels
still need separate visual approval; missing original assets remain MISSING. Reuse
the existing tokens and responsive patterns. No redesign or invented artwork.

All13 historical migrations, unapplied customer14, original4B/broker, frozen P1/four
artifacts/approvals,2A–2F, six proposed billing enhancements, frozen Netlify package
and executor, recovery/Auth/MFA/NMI, financial/provider/communication/hosted/production
gates remain unchanged. No credentials, hosted mutation, migration, dispatch,
messages, contract execution, payment, deployment, merge or persistent worker.
All unfinished capabilities remain default-OFF/unwired.
**Release1.0 NOT READY / NOT AUTHORIZED.**
