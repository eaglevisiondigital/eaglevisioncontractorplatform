# Consent-aware property follow-up and reminder review

Cycle3 / GRO-001, GRO-002. Exact parent PR10
`25ae406974f470d1a46d3909ddd00fe07c388240`. Branch
`codex/program-growth-reminders`. LOCAL bounded implementation; unwired/defaultOFF.
No automatic scheduler, sender, outbox, recurring enrollment or new business store.
Release1.0 remains NOT READY / NOT AUTHORIZED.

## Working local contract

`readGrowthReminderReview` reads the actual existing PropertyRepository plans,
published-source maintenance records and CRM CustomerHistory communication_consents.
It requires explicit enabled admission, a sample repository/company, current active
synthetic owner/admin and an exact existing customer/property relationship. Connected
repositories and estimator/field/foreign/revoked actors are rejected before reads.

The caller chooses an explicit date window of at most93 days, as-of instant and
email/SMS channel. Existing occurrence() generates anchored monthly/weekly/custom/
once dates in the plan's own timezone. Exact manual follow-up dates retain report/
published-version/finding/maintenance-revision references. A retained exact scheduled
inspection suppresses only the superseded manual follow-up candidate; it does not
prove repair or physical work. Plan occurrences are planning facts, not a claim that
no inspection happened. Future cancellation/enrollment/notification policy is absent.

Returned rows distinguish overdue/today/upcoming relative to each plan timezone,
retain exact plan ID/revision/index or published source identity, and are deeply
frozen detached primitive allowlists. Available rows are capped at500; truncation
sets count_is_complete false. At most100 selected plans are accepted. The count is
available local review candidates, never complete customer/service history. Repeated
reads recheck current sources, CRM, membership and consent drift across awaits.
No replay, reservation, mutation, background execution or durable-custody claim.

## Consent and communication boundary

Existing contact-v1 records provide observed channel permission only. Latest denial
wins by timestamp, not array order. Missing, future, duplicate, same-time conflicting,
unrecognized-policy or invalid evidence does not become permission. Malformed or
foreign rows reject the read. No custom serializer/object coercion is admitted.
The snapshot retains only an exact consent ID/time/policy reference and observed
channel state; no email address, phone, recipient or private customer notes.

Purpose-specific reminder/marketing consent, suppression clearance, recurring program
enrollment, verified sender/contact and communication authority are not established
by the existing source. Therefore purpose_consent, suppression and recurring_enrollment
stay UNVERIFIED, communication_authority is always BLOCKED, and recipient/provider_request
are null. A recorded allowed flag is never eligibility to send. No transactional or
marketing legal classification/compliance acceptance is inferred. Existing approved
communication/sender/outbox implementations are unchanged and are not called here.

## Evidence and limits

32 focused cases pass over actual existing CRM/property/maintenance/plan/consent
workflows, including all three contractors, anchored recurrence, timezone dates,
scheduled follow-ups, current member/source/consent drift, malformed primitives,
foreign properties, no source side effects/private fields and bounded counts.
Strict types and lint pass. No UI changed: no new browser/axe or operational acceptance
claim. Build, format and combined integration results are recorded separately by the
main integrator; normal automatic CI belongs to the exact new commit, not its parent.

Main owns shared contracts/register/design; this package owns only the new reader,
its focused tests and this document. Rollback removes those unwired files. No API,
schema/migration, new dependency, credential/Auth, provider/email/SMS, payment/financial,
Netlify/deploy/merge or customer-facing activation. Preserve all13/customer14/4B/P1/
four artifacts/approvals/lockedUI/2A–2F/billing/recovery/NMI restrictions unchanged.
