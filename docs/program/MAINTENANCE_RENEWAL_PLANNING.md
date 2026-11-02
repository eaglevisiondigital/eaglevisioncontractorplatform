# Maintenance renewal and visit proposal planning

Cycle5 / GRO-001, GRO-002. Branch `codex/program-renewal-planning`, exact parent
PR19 `3580bf4dceee7c8c4244b902c64c93f9dc0564c8`. Owner direction is the
Cycle5 plan at `3bf2e0cfca691cb164e1c42290ccf09ad6804c8a`; main owns shared
execution contracts, integration and acceptance registers. This package owns only
`src/lib/maintenance-renewal-planning.ts`, its focused application test and this
sanitized document. No existing source, schema, workflow or approved UI changed.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.

## Working local implementation

`readMaintenanceRenewalPlanning` composes the existing
`readGrowthReminderReview` eligibility extension over actual PropertyRepository
plans, visits, published finding/manual follow-up records, current CRM property and
synthetic memberships, and contact-v1 history. No parallel recurrence engine,
agreement/customer/property model, business store, scheduler or service exists.
This module is unwired. Explicit `enabled:true`, `confirmed:true`, and a bounded
planning horizon are required before source reads. Connected repositories reject
before property/CRM history reads. Only the existing eligible synthetic owner/admin
roles can review their exact organization/customer/location.

The existing reader remains authoritative for anchored weekly/monthly/custom/once
occurrences, plan timezone, source validation, source-read concurrency, observed
channel preference, selected-plan visit evidence and incomplete coverage. A query
covers at most93 days; eligibility is0–30 calendar days ahead and0–93 overdue days.
Date-only candidates never establish appointment time, technician availability or
physical work. January31 monthly anchoring still yields February28 then March31;
UTC boundaries and DST do not invent a different due date.

The view retains each exact selection: candidate key, kind, due date, timezone,
plan ID/revision/occurrence index and, for manual follow-ups, published report ID/
version/finding and current maintenance review revision. It retains exact existing
visit ID/plan/revision/date/status/phase and the observed current channel reference.
Same-property/date visits belonging to another plan do not suppress this plan.
An exact draft or after-phase visit prevents duplicate occurrence planning but does
not establish completion, notification or customer acceptance. Ambiguous visits,
unknown channel evidence or truncated coverage withhold preparation.

`prepareMaintenanceVisitProposal` requires an explicit exact selection and reuses
that view before and after the actual SHA256 await. The caller's named primitive
inputs are pinned; current confirmation/horizon is rechecked after waits. Source,
current role, customer/property, consent and plan/review revisions must still match.
There is no automatic preparation on read or save. Caller getters, serializers,
prototypes and private extras are not invoked, copied into evidence or frozen.

## Immutable evidence, no execution

The detached frozen proposal contains:

- Stable content-derived identity and SHA256 integrity evidence.
- Exact current synthetic reviewer, organization/customer/property, query/as-of,
  confirmed horizon, selected source and channel-reference binding.
- `STAFF_PLANNING_ONLY` and explicit scheduling/message/billing `BLOCKED` states.
- Renewal terms `UNKNOWN`, with null renewal anchor and agreement ID. Existing
  sources do not contain reviewed agreement terms or a contractual renewal date.
- Purpose consent, suppression, recurring enrollment and sender authority all
  `UNVERIFIED`; recipient/provider request remain null.

An observed contact-v1 channel allowance is not reminder-purpose consent or
suppression clearance. Current channel denial blocks preparation. There is no
message content/recipient, outbox, worker, provider port, enrollment, billing,
customer obligation, scheduling mutation, dispatch, contract or financial action.
The Email Best Practices skill's purpose/channel/suppression distinctions inform
this projection; sending/retry operations are neither implemented nor authorized.

Repeated or concurrent read preparation of the same exact source/reviewer/horizon
returns the same identity, not replacement UUIDs or duplicate stored visits. There
is no proposal store or execution attempt to resume. SHA256 is unkeyed content
fidelity, not authenticated custody, genuine approval, delivery or permission.
No creation wall-clock timestamp or operational freshness guarantee is invented;
`as_of` and the confirmed query remain explicit historical planning context.

`reconcileMaintenanceVisitProposal` validates the exact retained allowlisted shape,
constant authority states, digest and original reviewer/horizon, then reads only
the same sources. It returns `CURRENT` for unchanged eligible evidence, `STALE`
for proven changed revision/channel reference or an exact newly recorded visit,
and `UNKNOWN` for malformed, missing, denied, ambiguous or unavailable evidence.
A recorded channel denial is a known eligibility change, so returns `STALE`.
Current means source equality for that exact saved as-of review, not current
availability or authority to act. Source gaps never imply repair, failure or a
newer substitute. Every result retains blocked authorities and `replacement:null`;
no reconciliation path replays preparation or emits a new proposal/command.
A lost read remains UNKNOWN, not execution failure. Previous proposal bytes remain
unchanged. No browser-refresh/process-loss durability claim is made.

## Focused evidence and limits

61 new application cases and66 retained Growth/reminder eligibility cases PASS
(127 total). Tests use the actual three sample companies and existing Operations/
PropertyRepository sources. They cover immutable source/property/report bindings,
no business side effects, repeated/concurrent stable IDs, role/tenant/customer/
property rejection, default-OFF and connected denial, primitive/accessor/privacy
validation, missing/declined/newer channel evidence, draft/after/other-plan/ambiguous
visits, exact follow-up provenance, anchored month/DST/calendar days, invalid dates,
selection mismatches, actual source/role/consent/confirmation changes during waits,
post-hash rechecks, retained-evidence tampering, UNKNOWN reads, no replacement or
replay, and truncated counts. The initial monthly case correctly denied a consent
record dated after its historical as-of; its synthetic setup date was corrected,
without weakening source or eligibility rules.

Strict types, generated types, owned lint, formatting, build, source-evidence and
protected integrity results are reported with final exact commit/CI by the main
integrator. No UI changed; no browser, accessibility or screenshot acceptance is
claimed for this unwired reader. These tests are local synthetic proof, not genuine
Auth, customer consent, operational custody or hosted acceptance.

## Dependencies, integration and rollback

Stack this draft only on the exact PR19 head. Main may compose owned sources in a
disposable combined checkout; do not merge or promote an unfinished capability.
Actual renewal agreements/anchors, purpose-specific consent, opt-out/suppression,
sender custody, appointment availability and separately authorized persistence/
communication acceptance remain dependencies. Other local engineering can proceed.

Rollback deletes these three new files; no stored data needs reversal. All13
historical migrations, pending customer14/original4B, frozen P1/four artifacts,
owner approvals, five locked UI/artwork files/thirteen design bindings, 2A–2F,
six proposed billing enhancements, original Netlify archive/executor and recovery/
NMI/genuine Auth/provider/financial/communication/hosted/deploy/merge gates stay intact.
No credentials, hosted mutations, customer messages or production action occurred.
