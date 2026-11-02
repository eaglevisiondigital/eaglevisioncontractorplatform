# Cycle 8 · maintenance and renewal planning desk

Owner: `/root/cycle5_operations`; branch `codex/cycle8-maintenance-desk`, separate
sibling of the Field package from exact reviewed parent
`a20f11855388e7cf8283294a3775e1c86a2cc66e` / draft PR49. Only five new owned files;
Main owns shared contracts, mounting, combined browser/design evidence and registers.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Functioning local desk

`MaintenanceDesk` accepts `{sources:LocalJourney,enabled?:false}` and requires the
existing DEV/explicit flag/literal HTTP-loopback guard. Its unique accessible region
is **Maintenance and renewal planning**. It uses Main's same actual CRM/Phase3/
Property instances and exact organization, reviewer, customer, property, issued job,
plans and published findings. No separate opportunity, consent or renewal store.

The user selects from/through dates, an explicit as-of instant, contact channel,
lead/overdue calendar-day horizons and combined literal-text/type/readiness filters.
`readMaintenanceDesk(sources,input,gate)` reuses `readGrowthWorkflow` for source-safe
published findings and `readMaintenanceRenewalPlanning` for the user's actual policy.
It does not repeat the old fixed7/3 horizon or invent a recurrence calculation.
Available and matching occurrence counts remain distinct; history is incomplete.
Text matching also filters source observations/recommendations/category/location.
Occurrence date/type/readiness filters never rewrite original published evidence.

Exact occurrence cards explain eligibility, recorded visits and source revisions.
The user opens a candidate and separately confirms preparation through the existing
`prepareMaintenanceVisitProposal`. The returned immutable staff planning snapshot
retains its original content-derived identity/hash, source, window/policy and channel
reference. It creates no visit, appointment, agreement, enrollment, recipient or
message. An existing draft/published visit blocks duplicate occurrence preparation;
it does not prove physical completion. Original observation and maintenance advice
remain separate, with exact report/version/finding/plan/job navigation and focus.

Context/field changes hide previous results and discard late responses. Current
synthetic owner/admin, exact source, source/input/gate and repository relationships
are checked after awaits and at the terminal synchronous checkpoint. Scoped warm
cards, original contractor palettes, header resets,46px controls, mobile stacking,
visible labels, status/alert, empty/loading/OFF states preserve approved branding.

## UNKNOWN and preparation custody limits

One session-only hold precedes each exact existing producer call. Concurrent review
calls invoke that producer only once. PENDING/PREPARED/UNKNOWN state is read back by
`maintenanceDeskAttemptState`, including after a new desk read, so a hidden hold
cannot appear as a fresh action. UNKNOWN prevents replay or a new-revision bypass:
the hold key retains exact customer/property/job/plan/occurrence/source identity,
without using an edited plan revision as a reset. No operational task store exists.

`reconcileMaintenanceDeskPreparation` uses the existing exact planning reconciler.
Known prepared evidence can be inspected only as a staff review. If the original
wrapper outcome was UNKNOWN, matching known snapshot bytes do not convert that
outcome into success or permit resumption. No replacement/new ID is returned.
Refresh/process loss is not durable custody; these are honest in-memory limits.

`reconcileMaintenanceDesk` returns CAPTURED NOT ATOMIC or UNKNOWN, with no replacement
or replay. Published reports, customer preferences, assignment records and financial
objects remain unchanged. Internal notes/costs/supplier/payroll/workforce data are
not searched or projected. Strict own-data inputs reject coercion/getter/serializer
hooks; similar wording never establishes source identity or repair completion.

## Fail-closed consent-at-send architecture prototype

`reviewMaintenanceConsentPreflight(view,candidate,input,gate)` binds an exact retained
candidate to its actual customer reference, channel, requested purpose, source hash
and expected historical contact-consent reference. Purpose is an explicit primitive
enum: service follow-up, recurring maintenance or marketing. Contact-v1 does not
grant any of those purpose scopes. Foreign customer/channel/reference/source and
unsupported/malformed purpose inputs remain UNKNOWN, with no capability.

The preflight re-reads existing consent evidence. **Operations has only an async
customerHistory consent reader; there is no current synchronous atomic consent
reader.** Do not read its private arrays, treat original intake as current consent
or fabricate an atomicity claim. Therefore every source-bound preflight retains:

- Current status **UNKNOWN**, decision **BLOCKED**, current contact reference null
  and current observed channel state UNKNOWN.
- A hash of the explicitly historical captured planning view, never a stale
  RECORDED ALLOWED/current-consent reference.
- Purpose scope, suppression, sender and enrollment UNVERIFIED, and the exact
  recipient endpoint UNRESOLVED. Recipient/provider request stay null; send false.
- Explicit missing gates for current channel allowance, purpose-specific consent,
  suppression, sender, enrollment if required, recipient endpoint and atomic consent
  at send. There is no sender, resolver, provider port or communication seam.

Actual withdrawal during both the body hash and last source-hash await is tested:
no granted current channel/reference or send capability escapes. Detected changed
reads return UNKNOWN. This is safe blocking, not closure of the atomic-consent gap.
The existing planning view still labels its historical channel capture CAPTURED NOT
ATOMIC/current authority UNKNOWN; it grants no purpose-specific message authority.

`reconcileMaintenanceConsentPreflight` checks only the exact retained object/input.
Matching captured historical evidence may return MATCHED CAPTURE ONLY, while current
consent remains UNKNOWN and decision BLOCKED. Revocation, changed consent or absent
bindings return UNKNOWN without that marker. The UI honors the actual result:
unavailable historical bindings withhold prior view/candidate/consent evidence,
rather than claiming a match from an ignored promise result. It never creates a
replacement packet or message. No consent/enrollment mutation or retry is enabled.

## Focused proof

**51 new /232 related application cases PASS**. All three actual journey companies
exercise editable horizons, exact published-source navigation, canonical existing
proposal identity, no duplicates, concurrent calls, source/privacy boundaries and
unchanged Property/job/customer-history/ReleasePreview state with writer spies.
Tests include combined filters/counts, empty results, existing-visit exclusions,
unknown terms, foreign IDs, actual admin revocation, stale source, strict malformed
data, invalid ranges/horizons/as-of values, final-await source/confirmation races,
three unsupported contact-v1 purpose scopes, recipient/channel/source mismatches,
UNKNOWN held across rereads/new revisions, exact historical reconciliation and the
last-await consent withdrawal cases. No browser acceptance is inferred from units.

```sh
npx vitest run tests/cycle8-maintenance-desk.test.ts tests/program-growth-workflow.test.ts tests/program-renewal-planning.test.ts tests/program-growth-reminders.test.ts tests/program-reminder-eligibility.test.ts tests/program-growth-opportunity.test.ts
```

Main records actual desktop/tablet/mobile/all-brand, keyboard/axe and source-focus
evidence at the composed head. Existing128 protected hashes,5 locks/13 bindings,
all13/customer14/original4B/broker/P1/four artifacts/approvals/2A–2F/proposedbilling,
approved customer/back-office/artwork, Netlify/executor/recovery/NMI/Auth/provider/
financial/communication/hosted/deploy/merge gates remain intact. No credentials,
schema/migration, hosted action, message, financial execution, deployment, merge
or persistent background worker is introduced.
