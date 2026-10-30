# Workstream 2F · operational integration decision blueprint

October 29, 2026 · reviewed repository base `d8299f5de525f8efd0a9a7cf55dc5eebabd6d8dd`.
**DESIGN/REVIEW ONLY. Operational NO-GO. No executable migration or adapter.**

This is the single current integration blueprint after completed local Workstreams
2A–2E. It supersedes their proposed-next-package recommendations, not their evidence,
finding statuses or approvals. The earlier
[integration preparation](MAINTENANCE_OPERATIONAL_INTEGRATION_REVIEW.md) remains
historical. Do not automatically begin 2G/2H or expand the simulation architecture.
The useful parallel product handoff is [Workstream 3](CUSTOMER_TRANSACTION_HANDOFF.md).

## Decision and minimum change boundary

Reuse the existing business records, estimation/readiness engines and approved UIs.
The missing operational work is a private persistence/authority boundary, complete
writer participation, genuine identity and custody, then narrow repository adapters.
Do not promote `maintenance_2*_test` fixtures or their superuser-owned helpers as an
operational migration. No operational table/function names or migration number are
assigned by this document. The records below are requirements for later reviewed
forward-only SQL, not permission to create them.

| Area                          | Already exists at the reviewed base                                                                                                    | Minimum actual change still required                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM and staff                 | `public.organizations`, `memberships`, `customers`, `service_locations`; existing checked role/company commands                        | Reference exact tenant/customer/location and active staff relationships; never add a second customer/property/staff store                                                                                        |
| Inspection evidence           | `private.inspection_plans`, `inspection_visits`, immutable `inspection_reports`; `private.property_command` and checked public wrapper | Bind report ID **and published version**, finding ID, CRM location/customer and originating plan revision; never derive identity from text or mutable visit contents                                             |
| Maintenance coordination      | `PropertyRepository` session state; `MaintenancePersistence` port; disposable 2A `items`, `notes`, `receipts`                          | Private exact-source triage with positive edit CAS, valid responsibility/follow-up date, separate append-only notes and command receipts; preserve pending/reviewed versus scheduling/physical condition         |
| Follow-up scheduling          | Existing plan/visit `create_visit` workflow and 2A exact request receipt                                                               | Atomically retain one existing-workflow draft visit per command/source coordination record; no parallel scheduler, dispatch or automatic retry                                                                   |
| Repair preparation            | Existing estimate/version/line records and engine; `RepairPersistence`; 2B `reservations`, `events`, `bindings`, `permits`             | Immutable exact-source/current-maintenance/plan/job-baseline reservation and one-shot target identities; checked existing-engine write; protected origin binding and outcome; no generic permit/reset escape     |
| Readiness                     | Canonical six-section `repair-readiness.ts`, session history and `repair-evidence-archive.ts`; 2B `review_intents`/`reviews`           | Durable append-only review intents, canonical evidence/history and receipts; exact saved revision/source/policy/catalog/calculation/reviewer/history CAS; stale confirmations retained, never counted as current |
| Command authority             | Unwired `command-authority.ts`; 2C `capabilities`; 2E `approvals`, `claims`, `outcomes`                                                | Server-verified exact capability issuance, separately committed phase authority/one-shot attempt, final current checks and exact read-only reconciliation; no runtime issuance/reset/rebind privileges           |
| Jobs, prices and calculations | `public.jobs`, immutable issued estimate baselines, catalog/tax/schedule/option/line records and integer engine                        | Reference existing IDs/current revisions; guard every origin-affecting ordinary writer. No additional job, estimate, financial ledger or independent calculation engine                                          |

Every new tenant record must have `organization_id`, default-deny RLS, explicit
table/column/function privileges, indexed tenant access and composite tenant-parent
keys/FKs. Sources/targets/principals are immutable; exact request/phase and source
uniqueness prevent duplicate side effects. Notes/reviews/outcomes/audit are append-only.
Do not cascade-delete retained evidence on source or member deactivation. Source
finding identity embedded in report JSON needs checked exact uniqueness, not an
invented relational FK or fuzzy match. Cross-table/session checks must validate the
current user, organization and exact session; a session UUID alone grants nothing.

## Complete writer inventory and transaction contract

This is the known integration surface from the checked-in schema and adapters, not
an assertion about a live database. A later preflight must enumerate actual catalog
owners, triggers, policies, ACLs, scheduled jobs and external/admin writers and account
for every difference. Broad historical DML paths cannot be left as silent bypasses.

| Writer / current entry point                                                                                                                | Current participation                                                          | Required operational disposition                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2E gateway → 2C `lock_scope` → 2A edit/follow-up, 2B reserve/claim/finish/review                                                            | Verified only in disposable composition                                        | Implement reviewed private equivalents, preserve exact claim/receipt/CAS; never expose raw helpers                                                      |
| Raw 2A/2B helpers and older 2C gateway                                                                                                      | Original bypass/deadlock evidence retained                                     | Exclude from runtime grants; tests remain diagnostic. No fixture schema may become an operational route                                                 |
| `public.property_command`: create/update plan; create/save/submit/publish/revise visit; quote/unbilled review                               | Historical property order, not universally coordinated                         | Forward guards/checked entry changes for shared settings/plan/report/location/job rows; immutable published evidence remains intact                     |
| `create_estimate`, `save_estimate`, `revise_estimate`, `duplicate_estimate`, `issue_estimate`, `archive_estimate`, `save_estimate_template` | Historical RPCs; disposable repair-origin guards only                          | All create/save/revise/duplicate/issue/archive paths must honor origin/reservation/readiness and lock order; readiness never enables repair issuance    |
| `begin_material_import`, `approve_material_import`, `apply_material_import`, `approve_and_apply_material_import`                            | Existing import engine, not operationally composed                             | Apply/save writers join the exact estimate/catalog policy order and provenance guards; no alternate imported repair draft or issue path                 |
| `approve_job`, `assign_job`, `propose_job_change`, `approve_job_change`, expense/review/purchase/projection/import commands                 | Existing job/baseline immutability; mixed transactions unaccepted              | Coordinate touched estimate/version/job/baseline/settings dependencies; ordinary approved-change semantics remain separate from maintenance             |
| Workforce time/review/payroll preparation and adjustment posting job labor                                                                  | Existing cost aggregate/one-posting guards                                     | Inventory job/projection locks and join when sharing rows; otherwise document proven disjoint resources. No payroll execution                           |
| Direct CRM customer/location DML; direct catalog/tax DML                                                                                    | Historical authorized RLS/column-grant paths, **not** covered by gateway locks | Forward privilege/trigger or checked-command conversion review, including delete/reparent/cascade behavior; never assume a TS wrapper prevents raw SQL  |
| Company settings/modules/profile; memberships/invitations/owner/platform grants                                                             | Existing checked commands plus actual ACL surface                              | Resource-first ordering when touching both resources and authority; genuine AAL2/current scope; no unrestricted mixed admin transaction in request path |
| Auth user/session disable/logout and capability expiry/revocation                                                                           | Representative final-boundary races pass locally                               | Current checks after waits; issuer/mutation must serialize revocation. Review external Auth admin behavior independently; no Auth schema rewrite        |
| Capability provisioner, audit/retention/archival, backup/restore and operator SQL                                                           | Trusted laboratory/admin boundary                                              | Separate operator roles and exact runbooks; no request credential ownership/DDL/bypass or arbitrary cleanup. Uncatalogued writer blocks activation      |

**Participating mutation order:** tenant coordination → command/request → exact
source → company settings → originating plan → published report → CRM location →
maintenance item → reservation → target estimate/version → job/issued baseline →
tax → catalog IDs in stable order → current principal/session/member/module/feature
checks → final capability → final authority/outcome → commit. Multi-object batches
need stable ordering within each class. A narrower writer takes an ordered subset;
it must not acquire a preceding resource after authority locks. Pure preflight may
read identity/capability first but must not lock authority ahead of resources.

Issuer transactions use their own tenant/source namespace and preliminary MVCC
source/CAS reads, never wait on runtime-held resource/advisory locks. They commit
before protected mutation. Locked business validation stays authoritative at the
mutation boundary; passing issuance is not a promise the later operation succeeds.
Post-wait wall-clock expiry, current principal and final capability checks remain.
Server-enforced budgets/concurrency/cancellation must supplement client deadlines.
Deadlock, timeout or lost response stops with UNKNOWN; no automatic replay/new ID.

The 2E private sequence proves rollback/savepoint resistance locally, **not** crash
or restore safety. Its 1,000-claim test cap is not an operational retention policy.
The durable one-shot mechanism and backup/restore threat model are a specific open
design decision (F02), before SQL implementation. Do not copy the sequence primitive,
reset a gate, reinterpret an absent receipt as failure, or rebind a phase/backend/XID.
After interruption, even an earlier phase ACK does not authorize phase continuation.

## Ownership, genuine identity and application boundary

| Principal / component      | Required ownership and access                                                                                                           | Missing implementation / decision                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator provisioner       | Separate reviewed operator-only bootstrap, no request role inheritance; bounded approval and metadata audit                             | Exact role/grant/secret custody/rotation/containment package; no permanent request-path superuser                                                                                                                                |
| Staff request verifier     | Verify signed token with fixed issuer/audience/expiry; current user/session/member/permission/resource; derive actor/tenant server-side | Genuine staff Auth broker and current-session policy. Owner/admin/platform require AAL2; review the exact staff-operation MFA matrix before issuance. Never use UI selection, decoded-only token or `user_metadata` as authority |
| Independent issuer         | Only exact approved issuance/current authority; cannot mutate business records, seed arbitrary approvals or reset held claims           | Real authorization-to-capability compiler and isolated issuer credential/service. Caller SQLite/hash/flag is not independent custody proof                                                                                       |
| Mutation service           | Dedicated nonprivileged LOGIN, fixed allowlisted gateway only; no issuer/raw helper/DML/sequence/DDL/role rights                        | Fixed authenticated transport and full transitive privilege review; no service key/owner connection in request API                                                                                                               |
| Private definer owners     | Narrow NOLOGIN owners without SUPERUSER/BYPASSRLS/role creation; minimum exact table/column/helper grants and fixed search path         | Split trusted fixture core/helpers into audited ownership graph; explicit default ACLs and dependency/trigger/policy review. Forced RLS does not contain a superuser                                                             |
| Reconciliation reader      | Exact caller/source/request receipt under **current** authority; no broad payload/audit access                                          | Read-only authenticated endpoint; revoked callers cannot recover private receipts merely because IDs are known                                                                                                                   |
| Audit/containment operator | Metadata-only append reader; separately scoped one-way issuer/service disable and exact revocation                                      | Alerting/runbooks and supervisor custody; never delete outcomes/notes/audit or clear UNKNOWN as containment                                                                                                                      |

Future staff API operations are conceptual read/triage/follow-up/reserve/prepare/
readiness/reconcile contracts only; no endpoints are registered here. Use strict
bounded UTF8/JSON/exact fields, fixed origin, CSRF and secure server session custody,
current verified authority, per-principal/resource budgets, no transport retries and
bounded response/cancellation/backpressure. Claim issuance stays private to the
independently trusted service, not a browser-accessible issue endpoint. Bind all
responses to the captured caller/property/request and discard stale context results.

`PropertyRepository` and `Phase3Repository` remain session-only synthetic today.
Future adapters implement existing `MaintenancePersistence`/`RepairPersistence` ports
and canonical readiness archive, then replace only narrow repository operations
after approved service acceptance. Preserve App repository lifetime, company state,
exact report/version links, source review, stale-edit CAS and locked layouts. No
sample fallback in a connected branch. Existing `ConnectedPropertyOperations` is
prepared transport, not an activated maintenance adapter or authority verifier.

Customer reads remain separate allowlisted published-report/issued-review projections
under exact contractor/customer/property/publication access. Internal notes, assignees,
rates, margins, supplier costs, unissued drafts, review archives and command payloads
never enter customer projections. Do not add maintenance fields to shared customer
DTOs. The customer migration's nonfinancial preference cannot authorize a contract,
repair, dispatch, invoice, receivable, payment or debt. Six-section readiness cannot
do so either. Findings absent later remain of undetermined physical repair status.

## Custody, monitoring and containment requirements

Retain existing pre-send intent/phase/ACK and exact read-only UNKNOWN semantics.
Operational custody needs authenticated encryption, reviewed key ownership/rotation/
recovery and restricted service storage, including WAL/SHM/rollback/temp files and
backups. No keys beside ciphertext or privileged capsules on unsupported Monterey.
Specify durability acknowledgment, storage capacity/headroom, refusal-before-send,
tamper/TOCTOU assumptions, access logs and independently supervised restore. Existing
plaintext synthetic SQLite and file modes are not encrypted operational custody.

Persist command identity/authority **before** mutation; append outcome with effects;
retain exact local acknowledgment. On uncertain server/database identity after
restore, freeze affected authority and reconcile under a separately reviewed recovery
procedure. No reissue/reset/new-ID fallback. Test DB restart, disk loss, restored
backup and independent operator/device loss against that exact design; existing
SIGKILL tests and 2E sequence consumption cannot substitute for those acceptances.

Monitor issuance/claim/outcome age, UNKNOWN backlog, duplicate denials, stale CAS,
revocation/expiry, lock/deadlock/timeout, custody-write/capacity failures and privilege
drift. Use restricted tenant/request/phase correlation and sanitized reason codes;
no tokens, notes, costs, raw commands or customer PII in general logs. Operators need
an assigned escalation/containment owner and tested bounded response, not automatic
command recovery. Retention periods, legal holds, encrypted archive access, capacity
thresholds, restore objectives and deletion approvals are decisions in F04; no
invented compliance period or new automated purge. Retain held/uncertain evidence.

## Finite integration and approval checklist

Statuses classify the **remaining requirement**, not acceptance already achieved:
L = locally implemented/verified; R = ready for independent operational design review;
A = requires specific scope approval/infrastructure; B = blocked by recovery or
connected acceptance. Engineering/security/owner labels denote accountable roles,
not messages or assignments sent to anyone. No unchecked row starts itself.

| Gate                                                     | Class / accountable role                | Exit evidence and dependency                                                                                                                                                                 | Authority boundary                                                                                                           |
| -------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F00 Preserve completed local baseline                    | L / engineering                         | 2A–2E validation retained; D001 new-boundary FIXED, D002 PARTIAL, D009 BLOCKED; original FAIL cases unchanged                                                                                | No reimplementation or unrelated baseline reruns                                                                             |
| F01 Review this exact integration design                 | R / independent security + owner        | Signed-off record/adapter/writer inventory and residual risk disposition; starts from F00                                                                                                    | 2F authorizes preparation only; independent approval is still pending                                                        |
| F02 Select operational authority and ownership           | R / security + engineering              | Exact genuine issuer trust, current Auth/MFA matrix, full role/call/ACL graph, rollback/crash/restore-safe one-shot design and connection-pooling/backend model                              | Must resolve D001 operational boundary/D009 trust before an executable SQL proposal                                          |
| F03 Close writer participation design                    | R / database reviewer                   | Every inventoried RPC/direct DML/admin/trigger path either participates, is demonstrably disjoint, or loses access; native acceptance matrix planned                                         | D002 remains PARTIAL until actual implementation and independent concurrency evidence                                        |
| F04 Approve custody/retention/containment design         | A / owner + security/operations         | Storage/key custody, restore objectives, retention/hold/capacity values, alert owner, bounded disable/revocation and restore runbooks                                                        | No key/role provisioning, recovery operation or purge under 2F                                                               |
| F05 Complete original recovery prerequisites             | B / owner + authorized operator         | Authentic two-device pairing/ACK/presence/primary-loss evidence; maintained operational custody and separately exact hosted recovery verification                                            | Do not repeat successful setup/network/offline tests; no physical-device PASS today                                          |
| F06 Execute unchanged frozen P1                          | B / authorized operator                 | Original prerequisites and fresh exact supervised preflight pass; execute original four artifacts against exactly thirteen installed histories, cleanup/receipt evidence                     | Existing P1 approval remains valid. No duplicate approval; no replay/substitution or expanded history                        |
| F07 Decide customer fourteen separately                  | A / owner + customer security reviewer  | After P1, fresh target/history/hash/dry-run/containment review; separate exact installation approval; subsequent grants/mappings/leases/Auth/P2 separately scoped                            | Pending customer file remains unapplied; dormant installation never grants access                                            |
| F08 Implement/review forward operational package locally | A / engineering + independent reviewers | Separately scoped SQL/roles/guards/API/custody/adapters; F01–F04 resolved. Native all-writer/privilege/rollback negatives and full source/privacy/CAS/UNKNOWN evidence                       | No executable migration is created by 2F. Local proposal may precede hosted readiness; no installation authority             |
| F09 Authorize/install dormant maintenance package        | A / owner + operator                    | F06 complete; F07 history decision recorded; exact target/history/hash/dependencies/dry-run/containment approved; bounded no-retry install and independent post-install catalog verification | Later maintenance history is separate, never silently migration14 or folded into P1/customer approval                        |
| F10 Provision and accept restricted integration          | A / security + operator                 | Exact credential/LOGIN/owners/private transport/custody activation approval; F08/F09 passed; actual current Auth/MFA/session, all-writer, failure/load/privacy/monitoring tests              | No blanket permission from schema install. Every requested target/actor/time/cleanup action explicit                         |
| F11 Accept connected workflow and release                | B / owner + independent acceptance      | F05/F06/F10, separately authorized customer/P2/media/provider tests where needed; protected runtime, clean production and full Release1.0 workflow/security gates                            | Netlify remains frozen until separate corrective approval; no outside access, deployment, financial activation or merge here |

F07's approval remains independent: if customer14 is deferred, F09 stops until the
owner reviews exact history sequencing and dependencies. Do not renumber/replay the
pending customer file, add a maintenance migration ahead of it, or assume it is applied.
No design or local implementation gate needs a new hosted call merely to proceed.
Operational acceptance stays NO-GO until its applicable gates actually pass; this
checklist does not authorize execution. Do not start an automatic simulation series
when a gate is waiting on a concrete decision or infrastructure.

## Scope conclusion and references

D001 is FIXED **only** for the new 2E disposable boundary; operational issuer/custody/
one-shot integration is **BLOCKED / NOT IMPLEMENTED**. D002 is **PARTIAL**; complete
writer integration/acceptance is absent. D009 is **BLOCKED**; helper/provisioner trust
and genuine identity are unresolved. 2F supplies a reviewable path, not closure or an
independent sign-off. All 2A–2E code/evidence, thirteen historical migrations, pending
customer fourteen, frozen P1/four artifacts and existing approvals remain unchanged.
Locked UIs, financial off gates, recovery restrictions, Netlify freeze and AR execution
hold remain. Release 1.0 is **NOT READY / NOT AUTHORIZED**.

Source anchors: [2E authority](MAINTENANCE_COMMAND_AUTHORITY.md),
[ownership plan](MAINTENANCE_AUTHORITY_PRIVILEGE_PLAN.md),
[original findings](MAINTENANCE_SECURITY_FINDINGS.json),
[approval register](MAINTENANCE_DURABLE_APPROVAL_REGISTER.json),
[customer release review](CUSTOMER_AUTHORIZATION_RELEASE_REVIEW.md),
[acceptance](RELEASE_1_0_ACCEPTANCE.md). Official reference review:
[Supabase changelog](https://supabase.com/changelog),
[session identity](https://supabase.com/docs/guides/auth/sessions),
[MFA assurance](https://supabase.com/docs/guides/auth/auth-mfa) and
[PG17 sequence rollback/crash limits](https://www.postgresql.org/docs/17/functions-sequence.html).
Public documentation review performed no hosted project operation or credential read.
