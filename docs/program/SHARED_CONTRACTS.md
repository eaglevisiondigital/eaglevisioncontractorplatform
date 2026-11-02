# Shared contracts and integration ownership

Date: 2026-11-01. Source baseline: `dc7ed7c2db3cf8ff78a3d6f09098a1b623622874`.
Owner: main Codex integrator. This inventory documents the existing implementation;
it creates no API, schema, authorization, event bus or operational capability.
The owner authorized isolated local engineering and separate reviewable draft PRs.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Authoritative objects and invariants

| Concern                    | Existing authority / source                                                                                                     | Shared contract                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company and user           | `public.organizations`, current memberships, checked organization/membership RPCs; `src/lib/operations.ts`, `SECURITY_MODEL.md` | `organization_id` on tenant records; current verified principal/session/membership. Browser company selection, URL, text and user metadata never authorize access. Platform grants and customer-data access remain distinct.                                                                   |
| Customer/property/project  | CRM customers and service locations, `Operations.syntheticProperty`, existing project/job relationships                         | Exact organization + customer + service-location identity; do not create a parallel property/customer system. A property address or similar description is not an identity. Synthetic relationships are not genuine Auth.                                                                      |
| Estimates                  | `Phase3Repository`, `src/domain/estimating/calculation.ts` and existing estimate/version/lock records                           | Use canonical integer rounding, currency, discount/tax and customer-facing totals. Preserve immutable issued versions. Revision preparation binds exact source/version/request/receipt and current saved lock revision. No ordinary issuance bypass.                                           |
| Published inspections      | `PropertyRepository`, `src/domain/property/inspections.ts`                                                                      | Exact property/report/published-version/finding/line identity and historical evidence. Mutable visit changes never rewrite published reports. Same wording is not issue continuity; missing later findings never prove repair.                                                                 |
| Maintenance and scheduling | Existing maintenance source, record CAS, plan and visit workflows                                                               | Manual priority, reported severity, responsibility, review, scheduled date and physical completion are separate. No new queue database or dispatch authority. Recorded property dates retain plan timezone; recurrence is not enrollment or billing consent.                                   |
| Jobs/workforce             | Existing job baseline, expense events, assignments, time/breaks and payroll preparation                                         | Immutable baseline; append-only corrections. No double labor posting. Staff-only rates, deductions and cost/margin data stay outside customer/field-safe projections. Sample assignment methods are not proof of retained dispatch.                                                            |
| Customer review            | `projectIssuedReview`, `customerPreview`, existing request/revision/packet/release-preview modules                              | Issued projection remains issued-only. Strict allowlists and detached snapshots; never serialize internal estimate input wholesale. Original request, receipt, saved draft and packet integrity must agree. Private draft packets are staff previews, not customer offers.                     |
| Command custody            | `server/customer/broker.ts`, existing 4B gateway/ledger/receipt/staff reader and separate proposals                             | Server-derived source/UUID and separately committed admission precede issuer/consumer. Exact backend/full-XID, current grants/owner/catalog, one-shot authority. UNKNOWN is exact read-only reconciliation, never retry/rebind/new ID/publication bypass. No connected factory or credentials. |
| Financial/provider records | Existing release ledger/events, sandbox gateway/webhooks, job-cost engine                                                       | An invoice/decision/schedule never authorizes provider execution. Exact event/posting provenance and canonical amounts; real tokens, merchant account, settlement, consent, reconciliation and custody need separate acceptance. Six billing enhancements remain PROPOSED.                     |
| Documents/import           | Existing private Storage/quarantine/control store/material review                                                               | No upload/signed issuance/real extraction before scanner, bounded content validation, isolated worker and authorization acceptance. Supplier prices and payroll are private. Import provenance is not customer consent.                                                                        |
| Communications/contracts   | Existing preparation/outbox/internal sink and signature sandbox                                                                 | Escaped content and exact immutable scope/hash. Preparation is not sending, delivery, genuine signature, contract or work authority. No live recipient/link/provider resolution.                                                                                                               |

No new domain-event taxonomy is introduced. Existing immutable IDs, receipt/status
types and append-only events are the interchange contract. A proposed adapter must
name the actual producer/consumer, version, safe fields, current authorization and
UNKNOWN behavior before implementation. Use reviewed optional/default-off composition
rather than changing the meaning of existing records.

## Navigation, presentation and common UI

`src/App.tsx`, `src/domain/platform.ts` and `WorkspaceNavigation` retain the single
module registry and App repository/state ownership. Existing `/preview` modules
include CRM/leads, estimates, material import, jobs, workforce, property operations
and settings. `/preview/release` is explicitly synthetic; ordinary financial modules
remain hidden/disabled. Connected `/internal-release` and `/portal/internal` require
their existing expiring operator/server authority; no sample fallback or role switch.

The approved customer `/preview/property-portal` and contractor Property Operations
layout are locked. Existing isolated reference routes are retained. The new A3
`/preview/field-scheduling` belongs only to its separate draft branch: DEV + exact
flag + literal loopback, with no existing menu replacement or promotion.

Reuse `src/styles.css`, existing inputs/buttons/cards, `CompanyLogo`, `PlatformBrand`,
`useResource` loading/error conventions and the approved scoped portal/back-office
styles. Existing emerald/mint platform tokens, contractor palettes, typography and
warm surfaces stay unchanged. Original approved Propel PNG and reviewed transparent
derivative are immutable; no generated artwork or fabricated company logos.
New preview CSS must be scoped and lazy loaded; do not edit global tokens to fix
an isolated screen. Preserve component labels, enum values and keyboard semantics.

Use semantic headings, explicit labels, touch-sized controls, focus after source
navigation, status/alert announcements and readable empty/loading/error states.
Do not rely on color alone. Date filters validate real dates/ranges; invalid inputs
hide results. Counts cover accessible records, never complete historical coverage.
Exercise actual desktop/tablet/mobile browsers and all three contractor examples;
axe results apply only to exercised states, not a universal accessibility claim.

## Ownership, compatibility and integration

- Main integrator owns root acceptance/source inventory, package/check tooling,
  architecture/security/roadmap/build-state/decision documents and shared contracts.
- A2 owns the detached customer-preview projection, focused handoff regression and
  sales inventory. A3 alone owns the narrow App route plus new field adapter,
  component/styles and dedicated tests/workflow. A4 owns the existing ledger
  verifier, focused reconciliation regression and provider acceptance inventory.
- No concurrent edits to protected migrations, Auth, ledger writers, repository
  interfaces or approved design tokens. Shared changes return to the integrator.
- Each branch/PR names feature IDs, exact baseline, source/tests/security evidence,
  API/schema delta, dependency and rollback. PRs target the coordination branch;
  the coordination PR targets the existing feature branch. No merge is authorized.
- No new dependency, public API, database schema, provider credential or network
  mutation is needed for the first packages. Rollback is code-only; isolated
  previews also remain default OFF. Preserve the original README and frozen files.

Public records contain sanitized source/test references, hashes and synthetic data.
Do not log credentials, customer notes/identifiers, private infrastructure exports
or correspondence. Existing append-only audit rules remain authoritative. The new
feature checker reads only declared public source roots/metadata, excludes hidden
trees and symlinks, and cannot infer test execution, hosted acceptance or release.

## Cross-workstream acceptance order

Local engineering may proceed independently. Operational acceptance still requires
qualifying physical recovery, reviewed genuine recovery scope, fresh original
approved P1 preflight on exactly thirteen migrations, separately authorized customer14,
then exact 4B/broker ownership/hash/grants/mappings/target and genuine internal
request → receipt → eligible staff evidence. Historical helper/installer trust,
CREATE/statistics, external restore protection and operational connection custody
remain unverified. No local package widens this sequence or duplicates P1 approval.
Netlify replacement/protection, provider/merchant/communication and explicit launch
approval remain separate gates. Nothing in these contracts grants hosted authority.

## Cycle-two extension contracts · November 1

All four children remain separate draft PRs. CRM pagination targets exact PR2 head,
maintenance handoff exact PR4, finance export exact PR3; Passport and coordination
start from exact PR5 e44d668. No parent rewrite/merge or silent source promotion.

- CRM returns existing Customer/ServiceLocation objects through exact existing
  Operations reads and paged lists. Query/page state is presentation only. Pin exact
  selected IDs beyond the current page; immediately hide stale company/customer
  results and reject missing, inactive or foreign current relationships on save.
  Existing engine arithmetic, issued versions and App repositories are unchanged.
- Maintenance handoff consumes exact published source/report/version/finding,
  current maintenance record revision, source visit/plan and selected same-property
  plan. Explicit review plus confirmation calls only existing scheduleMaintenance.
  Repo-scoped attempt metadata is not a general task store, durable custody or grant.
  UNKNOWN allows exact read-only postcondition reconciliation, never a new attempt.
- Finance export consumes existing Invoice/PaymentEvent/LedgerEntry/verifyLedger;
  only primitive allowlisted facts, canonical integer strings, exact currency and
  explicit coverage/as-of evidence cross its export projection. Missing/UNKNOWN is
  not zero or settled. No writer, provider port, new ledger, AR or UI is introduced.
- Passport consumes existing CustomerPortalPreviewModel, current CRM property and
  projectPublishedHistory. Narrow primitive enum admission strengthens this new
  boundary without changing historical projections. Per-report/version source
  positions remain exact; no fuzzy grouping or inferred physical completion.
  Snapshots/hash never grant access or prove complete history/warranty/work.

Use the [design specification](DESIGN_SYSTEM_SPEC.md) for source-bound presentation
and state/accessibility contracts. Five unchanged CSS/artwork hashes and 13 source
bindings are mandatory in features:check; deleting the contract pointer fails closed.
Hash updates alone are never owner visual approval. Integration proof and unresolved
operational limits are recorded in [independent review](CYCLE2_INTEGRATION_REVIEW.md)
and the master delivery register. Existing data owners/types/calculations/projections
remain authoritative; no shared schema or connected capability is added.

## Cycle-three interchange extensions

[Assignments](CYCLE3_ASSIGNMENTS.md) name exact parent/child ownership. Source IDs
and existing Row/domain types remain authoritative; none of these is an Auth grant.
Sales binds issued source + exact offer/receipt + current CRM/member. Field binds
existing job/issued baseline/assignment tuple/worker and explicit plan/visit links;
recorded time is not a future dispatch slot. Finance binds immutable issued baseline,
reviewed expense events and locked labor coverage using existing integer calculators.
Passport binds only current customer/property-authorized issued versions and exact
job/report/visit/immutable-plan-job identity. Missing association stays UNKNOWN.
Growth binds existing plan cadence/revision/manual follow-up and contact-v1 evidence;
permission to send, purpose/suppression/enrollment/sender remain unverified.

An async read must preserve its access class through the last await. Caller/worker
role changes cannot retain an earlier manager projection. Existing job_assignments
has only org/job/user/active, no command receipt/revision: UNKNOWN outcome remains
UNKNOWN even if an exact read observes an active relationship. No retry/rebind/new
ID bypass; acknowledged synthetic changes still require exact current-source checks.
Customer projections never include workforce/private costing/repair review fields.

Finance's standalone root demo HTML is explicitly inventoried; arbitrary root HTML,
private trees and symlinks remain excluded. Review ownership maps new packages to
existing business lanes; shared CSS and sender authority retain their existing
review owners. Source metadata never changes runtime authorization. All five locked
files/thirteen bindings and the original eighteen feature IDs remain unchanged.

## Cycle-four source and review-input contracts

[Cycle4 assignments](CYCLE4_ASSIGNMENTS.md) pin exact green parent heads and bounded
worktrees. Existing IDs, types, calculations and safe projections remain authoritative.
No shared schema, business store, ledger or connected route is added. New module
outputs are read/proposal evidence only, never operational acceptance.

- Field unions explicit confirmed worker/date availability and source-bound proposed
  timed windows; current existing job/crew/visit/time evidence remains independently
  identified. Working-hours/overtime policy is not actual availability. Untimed visits
  do not prove overlaps or free capacity. Ambiguous wall times/DST/relations fail
  closed; exact source/access changes invalidate an earlier view. No dispatch.
- Sales extends existing handoff with a deeply frozen primitive allowlisted issued
  scope/offer/receipt reference and deterministic integrity. Exact read verification
  never substitutes a newer version or grants contractual approval/custody.
- Finance warning facts reuse canonical category-overrun and margin-erosion rules;
  supported variance, zero/unsafe ratios and incomplete coverage remain distinct.
  Any optional minimum-margin input is explicitly confirmed local review context,
  not a company policy mutation. NMI's existing eight gates stay UNVERIFIED.
- Passport timeline uses existing authorized synthetic published-report and job
  source references. Event chronology is explicit by kind/date/version; missing
  links remain UNKNOWN. Completion documentation never verifies physical completion.
- Growth extends the same recurrence/follow-up/CRM-consent reader with optional
  confirmed bounded calendar-day planning review. Exact retained plan/date visit
  evidence prevents duplicate occurrence review without claiming work or delivery.
  Channel denial/ambiguity, incomplete coverage and out-of-window sources withhold
  eligibility. Staff-review candidacy never enables messages; purpose/suppression/
  enrollment/sender remain UNVERIFIED and all communication BLOCKED.

All inputs are pinned before awaits and current source/access/confirmation rechecked.
No retry/replay/new-ID/source replacement after uncertainty. Locked5files/13bindings,
all13/customer14/original4B/P1/four/approvals/2A–2F/billing/Netlify/executor/recovery/
NMI/Auth/provider/financial/hosted/deploy/merge gates remain unchanged.

## Cycle-five shared boundaries

Exact owner plan3bf2e0c permits local parallel candidates only. Main owns the additive
sample-only Phase3 synchronous read, allowlisted prototype source and final synchronous
consumer checkpoint. Children compose these exact bytes; no competing source stores,
engines, schema, provider ports or connected mounts. Early children retain the reviewed
identical checkpoint dependency without rewriting parents. Candidate sources remain
separate drafts; the disposable combined proof is not promotion. See the exact delivery
index and independent review.

Customer Proof of Work uses existing customer-safe timeline/report/job projections,
never the internal prototype reader. Typed voice and receptionist input are untrusted
synthetic observations, never instructions or authority. Geography, supplier identity,
physical completion, license/vetting and historical coverage gaps remain explicit.
Async consent/workforce observations are CAPTURED_NOT_ATOMIC/currentnessUNKNOWN;
immutable hashes and session bindings do not establish durable custody or genuine Auth.
All financial/dispatch/contract/message/provider/hosted/recovery/production gates persist.

## Cycle-six explicit local integration

The owner now authorizes a cohesive local source candidate in draft PR38. Original
PRs remain draft/unmerged; this supersedes earlier isolated-source holds for this
new local candidate only. See [exact workflow contract](CYCLE6_SHARED_WORKFLOWS.md)
and [delivery index](CYCLE6_DELIVERY_INDEX.json). One confirmed loopback-only runtime
reuses the same Operations, Phase3Repository, PropertyRepository and ReleasePreview.
The customer documentation model receives a narrow exact issued-job admission and
allowlisted published-report projection; no customer login, mapping or lease exists.

Every handoff binds company/current reviewer/customer/location/estimate/issued version/
job plus its actual intake, offer/receipt, plan/visit/report/published version. Lead
selection is explicitly staff-selected because estimates have no recorded lead FK.
Reports join jobs only through recorded visit→plan→job relationships. Read wrappers
re-admit original caller selections after final awaits; copied/pinned identities do
not hide a later property/report change. UNKNOWN never selects a replacement.

Preparation is separately confirmed. Contract review is not signing. Date-only visits
and assignment rows are not timed capacity or dispatch. Internal commitment review
is not payment or a purchase order. Invoice requirements show canonical scope/totals
and missing legal/contract/cost gates without calling the ledger-writing invoice
command. Passport documentation is not physical completion, acceptance or warranty.
Captured consent is not atomic message authority; no recipient is resolved. Copilot
and literal Voice/Trade suggestions reuse existing engines with one session attempt,
exact immutable source checks and no autonomous command/model/provider execution.
