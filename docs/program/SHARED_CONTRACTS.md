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
