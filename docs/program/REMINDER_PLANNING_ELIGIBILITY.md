# Recurring reminder planning eligibility

Cycle4 / GRO-001,GRO-002. Exact parent PR13
`169e67955eedd70285a6f42993da6632e5749401`. Branch
`codex/program-reminder-eligibility`. Local implementation only; ordinary source
review remains compatible and the new eligibility extension defaults OFF.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working extension, same authoritative sources

The existing `readGrowthReminderReview` now optionally accepts a separately enabled,
explicitly confirmed staff-planning horizon:0–30 calendar days ahead and0–93 overdue
days. It retains the actual existing PropertyRepository recurrence/manual follow-up,
CRM property/member and contact-v1 consent readers. No new database, scheduler,
notification record, customer enrollment, outbox, provider request or writer exists.
The original recurrence engine still anchors weekly/monthly/custom dates in the
plan timezone. A UTC date boundary or DST day does not shift the source due date.

The caller's primitive policy is pinned before awaiting; disabling confirmation or
changing its horizon during reads rejects the result. Current membership, exact
customer/property, source and observed consent are rechecked after waits. The new
source comparison also binds exact selected-plan visit ID/revision/date/status/phase.
Private visit content, customer contacts, worker rates, internal notes and unknown
fields are never copied into the allowlisted output or serialized for comparison.

For each existing candidate, the extension distinguishes:

- `STAFF_REVIEW_CANDIDATE`: within the confirmed local calendar horizon, observed
  channel evidence allowed and no exact same-plan/date visit already recorded.
- `CHANNEL_DENIED`: current recorded channel evidence declined.
- `EXACT_VISIT_RECORDED`: an exact retained plan/date visit exists. Its source ID,
  revision, phase and status are retained. This avoids duplicate occurrence planning;
  a draft/after-phase visit is not proof of work, notification or physical completion.
- `OUTSIDE_REVIEW_WINDOW`: outside the explicit staff planning horizon.
- `UNKNOWN`: channel ambiguity/missing evidence, multiple distinct exact visits or
  incomplete candidate coverage. The existing500-row cap never creates a complete
  history claim or an eligible total for truncated review.

A visit belonging to a different plan does not suppress another occurrence even at
the same property/date. Duplicate visit identity, foreign source or malformed status
fails closed. No description/address similarity is used. The existing source candidate
list is retained; the optional eligibility review does not silently remove evidence.
Exact named source references and channel reference are detached and frozen.

## Communication remains blocked

`eligible_for_staff_review` describes internal planning only. Every item and summary
has `message_eligibility:BLOCKED`. Existing purpose consent, suppression clearance,
recurring enrollment and sender authority remain UNVERIFIED; recipient/provider
request remain null. Observed contact-v1 flags are not reminder-specific or marketing
consent. No legal/processor/communications acceptance is claimed. No messages,
financial action, customer obligation or background execution can be triggered here.
The Email Best Practices skill's purpose/channel/suppression distinction informed
this boundary; its delivery/retry operations are not implemented or authorized.

## Focused local evidence and rollback

34 new eligibility cases plus32 retained Growth review cases PASS. Actual existing
sources cover all three companies, exact boundary dates, timezone/DST, visits from
other plans, duplicate/ambiguous/foreign/malformed visits, channel denials/uncertainty,
actual staff downgrade and consent/source changes during waits, confirmation drift,
privacy, no mutation, accessor rejection without invocation and truncated counts. Typecheck and owned ESLint/Prettier PASS.
Full branch build/format/features and independent combined proof are recorded by the
main integrator before delivery. No UI changed; no new browser/axe claim.

Rollback removes the optional argument/returned eligibility field and the new focused
tests. No stored data or schema needs reversal. Current member/source authorization
and legacy candidate behavior remain authoritative. Preserve all13/customer14/4B/P1/
four/approvals/lockedUI/2A–2F/billing/Netlify/executor/recovery/NMI/Auth/financial/
provider/communication/hosted/deploy/merge restrictions. No credentials or hosted calls.
