# Contractor Maintenance & Follow-Up Center

October28,2026 · base0cf3cda57227319b105e6b5f9f9927b64078cf4f · LOCAL SYNTHETIC ONLY.
Release1.0 remains **NOT READY / NOT AUTHORIZED**; existing PR#1 remains draft.

## Working preview

Open http://127.0.0.1:4173/preview. Choose a sample company, **Property operations**,
then **Maintenance & follow-up**. Start the server if necessary with
`npm run build` followed by `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`.

1. The initial queue is empty until there are published concerns. Expand
   **Development-only maintenance examples & states**, then choose **Prepare
   synthetic maintenance examples**. This explicitly creates a second CRM location,
   two inspection plans and three published reports through the existing workflows.
   Two exact published finding records demonstrate repeated identifiers on distinct
   dates; a third belongs to the second property. Existing drafts/reports/jobs/issued
   versions are unchanged. Successful preparation is idempotent; an interrupted or
   failed attempt stops rather than silently replaying partial preparation.
2. Each card names its actual CRM customer/property, inspection date, reported
   category/location/severity, observation, recommendation and exact report/version/
   finding. Possible recurrence reuses the existing full-property Attention Center
   rules and explicitly unconfirmed physical continuity. Records remain separate
   per exact published finding; reviewing one never closes another observation.
3. **Open exact source inspection** switches to existing Inspections, selects the
   source plan/visit, expands and focuses the immutable report and highlights the
   exact finding. It does not substitute the visit's mutable current draft for a
   historical published version.
4. **Review finding** focuses an internal editor. Manually choose low/normal/high/
   urgent priority, an active same-company staff member (or unassigned), an internal
   follow-up date and pending/reviewed staff review. Save optionally appends a private
   note with author/timestamp. Notes cannot edit earlier notes or published evidence.
   All fields are in-memory coordination, never customer instructions or dispatch.
5. **Prepare follow-up inspection draft** explicitly selects a current same-property
   plan revision/date and uses existing addVisit. It creates a normal draft with
   blank findings and no copied private note, never publication or physical facts.
   **Open prepared inspection draft** returns to the existing visit editor. A second
   draft for that exact record, stale plan/item revision or duplicate plan/date is
   rejected. Open the existing visit workflow to inspect/edit the retained draft.
6. Pending means staff review remains pending with no prepared inspection. Scheduled
   means an inspection draft was explicitly prepared; it is not dispatch. Reviewed
   means staff review only. A reviewed record must be explicitly reopened before
   preparing its first follow-up draft. Reopening never deletes an existing draft
   or permits an automatic second one. Repair status always remains undetermined.
7. Filter by property, manual priority, responsible staff/unassigned, inclusive
   internal follow-up dates, pending/scheduled/reviewed or review/recurrence attention.
   Counts refer to exact available published finding records. Empty filters and
   malformed/reversed dates have explicit messages. Scope filters clear the editor;
   company switches remount it and preserve separate company records in memory.
8. Where the source inspection plan has a real existing job relationship, open its
   exact job in the existing Jobs component, or its immutable issued baseline in
   the existing Estimates editor. The interface explicitly says this is NOT a
   finding-specific repair estimate or work authorization. No job/scope/financial
   obligation is created by navigating. Missing or mismatched relationships reject.
9. Reload maintenance queue refreshes current evidence/staff and discards unsaved
   editor changes. **Simulate maintenance error** hides all queue records/actions;
   reload recovers. Initial loading uses the existing asynchronous resource boundary.
   A full browser reload discards this disposable synthetic session's triage records.

## Implementation and safety

The audit found existing CRM locations, inspection plans/visits/publication,
immutable report projections, staff memberships, job baselines and estimate editors.
There was no maintenance triage/task record. A private Map in PropertyRepository
stores only revisioned coordination metadata keyed by organization/customer/property/
report ID/published version/finding ID. The work queue is derived; no reports,
properties, jobs or inspections are duplicated and no database schema is introduced.

Every queue read and command rejects connected mode before a membership adapter
could run. Existing Operations.syntheticMemberships reads current in-memory
relationships; listMembers reuses it for sample mode. Owner/admin or existing
staff office-manager/estimator relationships can triage. Current active staff are
eligible for responsibility; assignment is not a workforce job-access grant.
These are explicit synthetic role checks, not proof of genuine hosted Auth/MFA.

Publication/visit/plan/CRM bindings are checked exactly, including report version
and finding existence. Recurrence/uncertainty comes from buildPropertyAttention,
never fuzzy wording. Similar/generic/conflicting identifiers do not merge records.
Priority defaults to normal rather than being automatically inferred from severity.
Omission, review, scheduling, estimates or lower severity never imply repair,
approval, completion, payment or customer debt.

Mutations validate current membership, exact source, input and optimistic revision
before synchronous local writes. Replayed/stale edits and consecutive identical
notes reject; append-only note author/time stay internal. Scheduling validates the
current plan revision and property plus the existing plan/date uniqueness rule,
then records the one created draft. There is no await between these final checks
and the in-memory commit. No retry/dispatch scheduler or external transport exists.
Linked-work reads recheck membership after awaited reads and bind the exact issued
baseline, organization/customer/property and estimate/version relationship. The
existing Jobs/Estimates components accept optional initial selections; ordinary
entry points preserve their previous behavior. Job selection never silently falls
back to another job when an exact requested ID is unavailable.

Triage is outside PropertyState, PublishedReport and portal projections. Internal
notes, responsibility and staff actions never enter customer-safe data. The locked
premium portal component/CSS, transparent and original artwork and all existing
customer history/attention/comparison code remain byte-identical to0cf3cda.

## Verification and limits

MAINTENANCE_FOLLOW_UP_VALIDATION.json records65 focused application cases in4files,
including27 new maintenance cases, and72 unique browser cases in5files. Six new
maintenance browser cases cover the three companies on desktop/tablet/mobile;
those six were rerun after the final editor focus/card alignment polish and are
not added twice. Automated accessibility returns zero violations on exercised
maintenance states; no horizontal overflow or outside requests in the new journey.
Exact historical source navigation, current assignment, note privacy, manual status,
filter combinations, duplicate draft prevention, prepared visit navigation and
existing exact linked job/baseline editor navigation pass. Real screenshots are
ignored under artifacts/property/maintenance-{viewport}-{company}.png; desktop and
mobile were visually inspected. Initial browser failures were exact-label test
selectors on existing wrapped Field controls, corrected to accessible roles.

Type/build, lint, format, generated types and migration/property/customer proposal
integrity pass.129 protected SQL/server/P1/recovery/Netlify/artwork/customer-portal/
projection paths match the starting commit. No SQL/dependency change; no unchanged
local native SQL or recovery/Mac setup/package/network baseline was repeated.
Relevant npm check constituents and focused suites were used locally; the existing
complete CI runs automatically on push. Prior0cf3cda foundation40777951396 and
compatibility40777951381 succeeded and were read without restart. New-commit CI is
reported separately. No genuine hosted/security/device acceptance is claimed.

All13 historical migrations, unapplied customer migration, frozen P1 operation/four
artifacts and owner approval persist. No real credentials/Auth, hosted call/write,
feature/mapping/lease/grant, customer message, repair authorization, financial/media/
provider execution, Netlify/recovery action, deployment, production change or merge.
Both Mac setups/connectivity remain completed owner evidence; actual authenticated
pairing and independent recovery remain unfinished separate gates, never device PASS.
Hosted persistence, genuine role/session acceptance and operational custody remain
future gates; this session-only Map is not an operational task service.

## Next bounded package

Harden and extend the existing finding-to-estimate draft handoff with exact immutable
published report/version/finding provenance, explicit property/job/customer binding,
a review checkpoint and duplicate/CAS protection. Show bidirectional links between
maintenance review and the actual existing repair draft/version. Reuse the current
estimating engine rather than creating another estimate system; keep issuance,
customer authority, contracts/invoices/payments and hosted activation separately gated.
