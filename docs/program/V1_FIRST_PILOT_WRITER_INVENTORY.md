# D1 source-specific writer inventory and owner decisions

**OWNER DECISION REQUIRED. All eleven people/delegates remain UNASSIGNED.**
Source baseline309 `a415bb4b35ff9e5727ce4f1a05a8f7f00def8bbc`. Use the single
[D1 private return form](CYCLE33_V1_D1_RETURN_FORM.md), [first-pilot path](V1_FIRST_PILOT_ACCEPTANCE.md)
and [owner front sheet](V1_FIRST_PILOT_OWNER_DECISIONS.md). This source inventory
supplies concrete code references, not a second form, installed catalog, appointment,
SQL installer, grant, operational adapter or permission to inspect a hosted target.
The actual installed writer/bypass inventory is **UNVERIFIED / INCOMPLETE**.
D2/D3 remain separate decisions; A01–A12 remain NOT RUN.

## Resolve the command and actor first

Ordinary staff `Operations.listIntake/assignIntake` owns inquiry review/assignment,
but assignment returns no accepted immutable receipt. It is not the same command as
customer14/4B `CustomerRequestBroker.submit`, which records a review-only choice for
one exact published estimate. The owner must choose the first command family and
permitted actor/source. A customer cannot be impersonated by staff; matching property,
notes or selected rows do not create inquiry→estimate/job provenance.

The already specified smallest first slice remains genuine internal customer review
request → original immutable receipt → currently authorized staff read. The front
sheet recommends original `request_changes_review`/`review-only-v2` as a candidate,
not an approval. Customer assurance remains its original policy; the separate staff
read requires original current membership/AAL2. This document creates no new policy.

## Concrete first-slice participants from existing sources

All SQL below is an inventory of existing reviewed proposal/fixture source. It does
not establish installed roles/functions, complete least privilege, genuine Auth,
rollback resistance or current hosted catalog state. File links refer to unchanged
source; record exact installed objects/hashes/owners privately under separate authority.

| Participant / original entrypoint                                                                                            | Source owner and known participation                                                                                                                                                                                                                             | Required accountable role and missing target evidence                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CustomerRequestBroker.submit`, `reconcile`, `staffQueue` in [broker.ts](../../server/customer/broker.ts)                    | Existing facade; original held attempt, exact intent/body, repeated verified identity and separate read paths. Database factory remains disposable-only.                                                                                                         | Business/source and Auth/security owners choose exact actor, source, command and staff-safe purpose; real people/target/account mappings NOT SUPPLIED.                                               |
| `CustomerBrokerAuth.verify` in [broker-auth.ts](../../server/customer/broker-auth.ts)                                        | Existing SDK current-session verification precedes authenticated-claim inspection and opaque proof. It does not grant a tenant from browser metadata.                                                                                                            | Auth/security owner returns genuine current-session, original customer assurance and separate staff AAL2/revocation evidence. Source tests are not that evidence.                                    |
| `private.customer_broker_admit` in [broker.proposed.sql](../../server/customer/broker.proposed.sql)                          | Registrar commits server-derived principal/request identity before claim. Inserts `customer_request_principals` and `customer_broker_admissions`; locks exact `customer_estimate_access`; validates original issued source and active consumer backend/full-XID. | Admission operator and DBA identify actual registrar/definer, complete grants, source mapping, publication and serialization participation.                                                          |
| `private.customer_request_claim` in [requests.proposed.sql](../../server/customer/requests.proposed.sql)                     | Independent issuer transaction inserts `customer_request_intents`; creates/revokes access to a one-use `customer_once_*` sequence. Exact principal/body/source and independent backend/full-XID bind the claim.                                                  | One-use claim custodian identifies real finite issuer/consumer pair, issuer COMMIT, sequence/owner privileges and no reuse/rebind after uncertainty.                                                 |
| `private.customer_record_review_request` in the same proposal                                                                | Original consumer spends `nextval` before mutation, rechecks current source/session after waits, inserts original `customer_review_decisions` plus `customer_request_outcomes` in the canonical transaction.                                                     | Canonical transaction operator proves atomic request/immutable receipt, current final checks and all-writer participation; receipt/ACK operator proves independent durability before success.        |
| `private.customer_record_decision` legacy wrapper                                                                            | Existing v1 two-choice compatibility delegates to original claimed request writer. Immutable legacy receipt shape is retained; source intent is not an installed-version guarantee.                                                                              | DBA inventories the installed legacy function/body/grants and every historical entrypoint. No direct/unclaimed writer may be omitted or presumed replaced.                                           |
| `customer_broker_claim_integrity`, `customer_decision_integrity`, principal/outcome/immutability/audit triggers              | Existing guards enforce committed admission, exact identity/body, append-only outcomes and current source. Trigger/helper owners and disable/replace authority remain trusted dependencies.                                                                      | DBA/privilege and transaction owners return actual triggers, function owners, DML/default grants, FORCE/RLS evidence, composite keys/indexes and every owner/admin bypass.                           |
| `customer_broker_receipt`, `customer_broker_staff_read` → `customer_review_request_receipt`, `customer_change_request_queue` | Dedicated reader and exact original admission/receipt projection; current customer/staff checks and safe queue. `customer_review_request_status` is another existing exact read path.                                                                            | Reconciliation/staff-read operator proves currently authorized original reads, wrong-tenant/customer/revoked denials, safe projections and absence→UNKNOWN. No new ID, replay or publication bypass. |
| Public receipt/status/queue wrappers in `requests.proposed.sql`                                                              | Existing invoker wrappers are explicitly revoked from ordinary roles in the proposal; actual API exposure and execution grants remain unverified.                                                                                                                | DBA identifies every installed wrapper, API schema, effective/default grant and actual caller role. Browser selection/URL never grants authority.                                                    |
| `runCustomerRequestTransaction` in [request-gateway.ts](../../server/customer/request-gateway.ts)                            | Existing disposable-PG17 composition pins original executor/backend/full-XID. Registrar COMMIT precedes independent issuer COMMIT and consumer COMMIT. On ambiguous outcomes it rolls back and returns UNKNOWN without replay.                                   | Transaction/claim/ACK operators return real connection/commit ownership. This API explicitly rejects non-disposable targets; it is not an operational factory.                                       |

## Exact proposed privilege owners and bypass obligations

[broker-ownership.proposed.sql](../../server/customer/broker-ownership.proposed.sql)
expects independently provisioned restricted roles; it does not provision credentials
or authorize installation. Existing source separates:

- `customer4b_admission_owner` (NOLOGIN definer), registrar `customer4b_registrar`;
  principal/admission inserts and publication lock privileges.
- `customer4b_core` (NOLOGIN definer): intent/outcome/decision inserts, exact bounded
  source/principal/claim reads and locks. Its private-schema CREATE and
  `pg_read_all_stats` visibility are explicit remaining operational TCB dependencies.
- `customer4b_reader_owner` (NOLOGIN definer), dedicated `customer4b_reader`;
  bounded identity/receipt/staff projections. Source includes narrow Auth columns,
  not permission to expose Auth rows or private estimate/financial content.
- Finite independently provisioned one-use issuer/executor LOGIN pairs, with only
  original claim/consumer function authority. They are not replaced by one shared
  identity or a pooled session even when one human holds multiple responsibilities.

Owner/DBA must expand this into **every actual installed** role/function/column,
owner/definer, effective/default grant, API/RLS/composite tenant constraint and
custody participant. Include transitive `customer_runtime_guard`, session/portal/
issued-source helpers, identity/publication/customer mappings, membership/session
writers, audit hooks, installers/provisioners/grant managers, private CREATE/catalog/
statistics authority, direct/raw/admin/service-role paths, sequences and trigger or
constraint bypass. Table/function ownership can bypass the intended narrow callers;
source fixtures do not certify that no such installed path exists.

There is still no named real rollback-independent fence/revocation/quarantine owner.
A one-use sequence inside a restored primary DB does not supply independent rollback
protection. Fence/spent-authority, backup/key, restore and quarantine writers must be
identified independently with matched timelines/receipt watermarks/object/custody/key
references and current revocation. Missing owner or unknown writer keeps D1 incomplete.

## Broader contractor journey: original writers to inventory separately

These existing local entrypoints are future journey dependencies, not silently
added to A01–A12 or the first customer request command. They do not become operational
writers because they have source tests or a locally saved result.

| Family                            | Existing original owner / entrypoint                                                                                                                                                                         | Current receipt and authority boundary                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM / inquiry                     | `Operations.listIntake`, `assignIntake` in `src/lib/operations.ts`; original connected assignment RPC                                                                                                        | Staff inquiry ownership; no immutable assignment receipt and no inferred inquiry/job FK.                                                                                                                                                                                                                                                           |
| Estimate / agreement / job        | `Phase3Repository` original draft/issue/version engine and `approveJob`, `assignJob` in `src/lib/phase3.ts`; existing Sales desk                                                                             | Immutable issued/version/job baseline; prepared packet or review preference is not genuine customer agreement.                                                                                                                                                                                                                                     |
| Field task / time                 | `saveTaskCorrectionReview` → `executeSavedTaskCorrection` → original `recordTime`, `submitTime`, `reviewTime`                                                                                                | Existing correction links and one-use same-tab holds; local UUID/void ACK is not independently durable transaction receipt. Work-order readers create no second work-order store.                                                                                                                                                                  |
| Finance / materials               | Original Phase3 expense/time/forecast and cost-review writers, existing `cost-coverage-actions` / `recorded-cost-requirements` consumers                                                                     | Exact recorded cost coverage; approved/unposted time is not posted labor; readiness is not invoice issuance, ledger settlement or payment.                                                                                                                                                                                                         |
| Service / Passport                | `PropertyRepository.saveVisit`, `submit`, `publish`, `revise`, `saveMaintenance` in `src/lib/property.ts`                                                                                                    | Exact published report/version and allowlisted customer history; documentation is not verified physical completion or customer approval.                                                                                                                                                                                                           |
| Maintenance / next job            | `saveMaintenancePlanCorrectionReview` → `executeSavedPlanCorrection` → `PropertyRepository.savePlan`; raw `createPlan`, `savePlan`, `addVisit`; `MaintenanceScheduleHandoff.prepare` → `scheduleMaintenance` | Original plan revision/CAS and source link; these raw PropertyRepository paths reject non-sample operations and are in-memory only. Existing Phase3 connected RPC branches are separate inventory obligations; no connected Property adapter is inferred. Session KNOWN_SAVED/UNKNOWN is not operational durability, renewal or sending authority. |
| Growth / communications           | Existing consent, suppression, recurrence and sender-admission contracts                                                                                                                                     | Purpose/current-revocation/cancellation evidence required. Eligibility never sends or activates an outbound worker.                                                                                                                                                                                                                                |
| Intelligence / Advanced / Offline | Existing deterministic suggestions, original source navigation and read-only admission/reconciliation engines                                                                                                | Recommendations are not authorized actions. UNKNOWN cannot be replayed, synchronized, restored or inferred complete from historical evidence.                                                                                                                                                                                                      |

## Exact owner return and separation

Return privately in the existing D1 form: product-owner decision/date/signoff;
command family and permitted actor/source; exact private target and original IDs/
version/publication/hash; all eleven people/delegates; accepted/amended functions;
permitted/prohibited human combinations and independent review; complete installed
writer inventory with private evidence refs; all eight readiness evidence references;
inventory-completeness disposition and independent reviewer. No credentials, pairing
cards, keys, fingerprints or private correspondence belong in the public return.

Original role titles remain: business/source, Auth/security, admission, one-use claim,
canonical transaction, receipt/ACK, reconciliation/staff-read, DBA/privilege,
independent fence, backup/key/recovery, independent reviewer. All **UNASSIGNED**.
Human combinations do not collapse registrar/issuer/consumer identities or three
commits. A writer cannot accept their own independent evidence; the sole primary
restore operator cannot control the sole fence. D2 separately accepts receipt/ACK/
UNKNOWN transaction requirements; D3 separately accepts independent rollback/current
revocation/matched recovery. Neither is approved by a D1 name or source review.

Preserve recovery → approved frozen P1-on13 → separate customer14 → original4B/broker
ownership/hash/grants/mapping/target/Auth sequencing. Main November4 owner-witnessed
synthetic loss PASS only; duplicate recovery UNKNOWN/UNVERIFIED, both private folders
and consumed attempts untouched. Prepare remaining original physical cases only under
the existing kit's prerequisites; no retry, reset, credential retrieval or new run.
Release1.0 remains **NOT READY / NOT AUTHORIZED**. No merges, deployments, hosted
mutations, operational restoration, payment, invoice issuance, sending or dispatch.

## Declared first-slice SQL inventory for the next D1 return

This is an exhaustive list of the **26 function declarations in the two existing
forward proposal files below**, not a claim about a live catalog or all transitive
writers. Both files and the ownership proposal remain unchanged. The target-side
inventory cannot be completed from source or synthetic fixtures. It requires its
actual owner, independently reviewed target evidence and separate action authority;
this package retrieves no credentials and performs no hosted inspection.

| Unchanged source                                | SHA256                                                             | Declarations                  |
| ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| `server/customer/requests.proposed.sql`         | `6178cee11c81593e3a90d0ef75f6194835019112877f50fc6eb5e692768d44af` | 17                            |
| `server/customer/broker.proposed.sql`           | `c32d2fa0df717780f6ca8c9a3b88376c6cac408e6c51576175cb929b9ef9f4cb` | 9                             |
| `server/customer/broker-ownership.proposed.sql` | `bfa30994ad6a4758aa074bc4315b41b9d14499f96d23bad4d61b505fffedb425` | 0; ownership/grant dependency |

Within `private`, the request proposal declares: `customer_request_body`,
`customer_request_roles_ok`, `customer_request_principal_integrity`,
`customer_request_principal`, `customer_request_reference`, `customer_request_claim`,
`customer_request_exact`, `customer_decision_integrity`, `customer_request_receipt_row`,
`customer_record_review_request`, `customer_record_decision`,
`customer_review_request_receipt`, `customer_change_request_queue` and
`customer_review_request_status`. The remaining three are the original `public`
invoker wrappers `customer_review_request_status`, `customer_review_request_receipt`
and `customer_change_request_queue`; no API execution grant follows from their names.

The broker proposal declares nine `private` functions: `customer_broker_endpoint`,
`customer_broker_identity`, `customer_broker_runtime_role`,
`customer_broker_role_review`, `customer_broker_transaction`,
`customer_broker_admit`, `customer_broker_claim_integrity`, `customer_broker_receipt`
and `customer_broker_staff_read`.

The direct insert owners are finite: registrar `customer_broker_admit` inserts
`customer_request_principals` and `customer_broker_admissions`; independent issuer
`customer_request_claim` inserts `customer_request_intents` and creates/restricts the
original claim-sequence authority; canonical `customer_record_review_request`
spends `nextval(c.burn_sequence)` before mutation and inserts
`customer_review_decisions` and `customer_request_outcomes` together. The
legacy `customer_record_decision` delegates to that canonical writer. Principal
revocation, direct DML, sequence manipulation, disabled/replaced triggers and owner
or admin privileges remain explicit bypass inventory obligations. Reader volatility
or a lock is not itself proof of a new business mutation or operational authority.

The source declares six relevant private tables across this composition:
`customer_request_principals`, `customer_broker_admissions`,
`customer_request_intents`, `customer_request_outcomes`,
`customer_review_decisions` and original `customer_estimate_access`. Audit and
immutability hooks, principal-integrity/revocation audit, decision-integrity and
broker-claim triggers must be matched to installed definitions and owners, including
dynamically declared triggers. No source scanner certifies those installed objects.

Ten directly referenced external private helpers require transitive ownership and
writer/bypass review: `audit_change`, `can`, `customer_estimate_review`,
`customer_issued_review`, `customer_portal_guard`, `customer_runtime_guard`,
`est_object`, `property_connected_session`, `property_guard` and `release_immutable`.
The DBA must also enumerate their transitive SQL/Auth/session/membership/source and
publication writers, installers, effective/default privileges and owner/trigger
bypasses. The real independent fence, backup, key, restoration and quarantine writers
are still **NOT IDENTIFIED**. All eleven D1 appointments remain **UNASSIGNED**.

The smallest owner return remains the existing single D1 form: choose the genuine
command family and actor; assign all eleven accountable people/delegates and allowed
combinations; return the actual installed writer/bypass inventory and its independent
completeness review. Staff inquiry assignment has no original immutable receipt and
cannot silently substitute for the original customer review-request command.
D2/D3 and A01–A12 remain separate, unresolved acceptance requirements.
