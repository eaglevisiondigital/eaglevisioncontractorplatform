# Property Passport · existing-source foundation

Feature: `CUS-002` / A5, with existing `CUS-001` and `FLD-001` sources.
Date: 2026-11-01. Branch: `codex/program-property-passport`.
Exact parent: PR #5 / `e44d668fe8bfd262be126020a0c1be9fa110046b`.
Status: **LOCAL isolated foundation; unwired and default OFF**. CI: **UNKNOWN**
until the separate exact commit runs. HOSTED: **NOT AUTHORIZED**. Release 1.0:
**NOT READY / NOT AUTHORIZED**. This is a bounded implementation candidate,
not a complete Property Passport, warranty or physical proof-of-work product.

## Functioning contract

`src/domain/property/passport.ts` adds two read-only functions. There is no App
import, route, UI, CSS, store, persistence adapter, public endpoint or schema change.
The existing `CustomerPortalPreviewModel`, `PropertyRepository`, CRM
`Operations.syntheticProperty` and strict `projectPublishedHistory` projection
remain authoritative. The module does not parse private visits or invent
customer/property, inspection, authorization, financial or completion engines.

- `createPropertyPassportFoundation(model, boundary, admission)` requires the
  existing active synthetic customer/property selection, exact organization +
  customer + service-location identity and `{ enabled: true }`. Omitted admission
  is OFF. Connected repositories and non-sample companies are refused. Current
  CRM identity is checked by the existing synthetic relationship method.
- The result contains a deeply frozen, detached, allowlisted inspection snapshot
  and the existing `documentHash` SHA-256 digest. Source order and published
  observation/recommendation text remain intact. No new UUID or date is generated.
  The hash covers all safe snapshot facts and exact evidence references. The
  module rechecks the selection, admission, CRM and published content after async
  hashing; source/context drift rejects the result without retaining an archive.
- `readPropertyPassportEvidence(model, reference, admission)` resolves an exact
  currently accessible report/version, finding ID + zero-based source position,
  or checklist source position. Malformed, missing, foreign, denied, conflicting
  or inaccessible evidence returns `UNKNOWN` with no payload. Disabled admission
  remains a disabled error. There is no latest/nearest/fuzzy fallback, replay,
  replacement ID, source selection or mutation.

The snapshot includes only organization/customer/location IDs, exact published
report IDs and versions, inspection/publication dates, recorded phase and summary,
customer-visible published finding facts, recommendations and recorded checklist
values. References repeat the exact boundary so navigation cannot silently move
between tenants, customers or properties. Report IDs must be unique even if a
duplicate claims another version. Existing report validation rejects malformed
dates, fields, versions and duplicate/private finding shapes. The existing
attention-engine bound of 500 available reports also applies here.

Whole CRM, company, visit, estimate, job and financial records are never serialized.
Customer explanations/preferences, contractor/private notes, internal finding
visibility fields, costs/pricing, payroll/workforce and media are excluded. The
foundation has no customer response, URL, upload, signed media, communication,
publication, dispatch or financial port. Published literal text stays text; this
package introduces no HTML rendering.

## Evidence meaning and uncertainty

`coverage` is `available-published-inspections-only`; `history_completeness` is
always `UNKNOWN`, including zero accessible reports. Neither an empty selection
nor absent evidence proves that a service or inspection never occurred. Denied
reads produce no substitute history. Retained snapshots do not confer access;
exact navigation checks the current synthetic model and CRM relationship again.
Synthetic selection/admission is not genuine Auth, membership or durable custody.

`physical_proof_of_work` is always `UNVERIFIED`. An integrity digest binds these
snapshot bytes; it cannot establish physical work, measurement truth, repair,
completion, warranty, owner/customer approval, contract or financial authority.
Recorded phase `after` and a recorded completed checklist value retain their
existing meanings and grant none of those conclusions.

Findings are never merged, including repeated UUIDs with conflicting locations,
generic IDs or identical wording. Each report/version/finding/source position
remains separate. Missing later observations never mark earlier findings repaired
or resolved. Source order, publication order, same-date reports and higher versions
do not prove physical chronology or continuity. Published checklist IDs are absent;
duplicate labels remain separate exact positions and cannot establish continuity
between reports. Old frozen snapshots remain unchanged after draft edits or newer
publication and make no claim of current completeness or freshness.

## Local evidence and review boundary

`tests/program-property-passport.test.ts` has 48 focused cases. They exercise actual
existing CRM/customer-preview/inspection publication flows for all three sample
companies, exact report/version/finding/checklist reads, other properties/customers/
tenants, current CRM/source denial, malformed/private/duplicate evidence, conflicting
finding IDs and duplicate checklist labels. They also verify literal observations
versus recommendations, unavailable history, detached immutability after draft edits
and newer publication, digest bindings, async source/context/admission drift, private
data exclusion and unchanged repositories/customer decisions/financial projections.
Independent review reproduced object-valued enum leakage and a hash-await aliasing defect before commit. Passport now admits primitive phase/severity values before the shared projection, without coercion. Six regressions reject object/boxed values and hash-await source replacement without invoking serializers or freezing caller objects. The shared historical projection remains unchanged.
Negative source corruption uses fault injection over actual prepared source reads;
it does not replace the positive existing workflows with fabricated business data.

Local validation on this branch:

- 67 application tests PASS across the new suite and existing
  `property-history-projection`, `property-attention-preview`, `customer-preview`
  suites: 48 new / 19 existing.
- Strict TypeScript, lint, generated database type consistency, local production
  build, owned-file Prettier and `features:check` PASS. Feature/source checks prove
  local inventory/citations only; they do not infer execution or hosted acceptance.
- No UI changed. No browser/axe/physical-device PASS is claimed. No unrelated
  recovery, Netlify or native security baseline was manually rerun.

Only this new module, its focused test file and this document belong to the package.
Main integrator owns shared contracts, design/acceptance register, evidence tooling
and combined review. Draft PR base remains `codex/program-coordination`; no reviewed
parent is rewritten or merged. Rollback removes the three unreferenced files; there
is no persistent data or migration to reverse. Wiring, customer presentation,
export/download and operational proof-of-work need separately bounded direction.

All thirteen historical migrations, pending customer14, original4B/broker, frozen
P1/four artifacts, approvals, locked UIs/artwork, 2A–2F and six PROPOSED billing
enhancements remain unchanged. Physical recovery/genuine Auth/operational custody,
NMI/provider/financial execution, communications, Netlify/executor, hosted actions,
production deployment, merges and launch gates remain independent and closed.
