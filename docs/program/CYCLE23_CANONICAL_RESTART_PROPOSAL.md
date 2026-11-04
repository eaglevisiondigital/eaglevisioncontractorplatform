# Canonical restart persistence · proposal for independent review

Status: **PROPOSED — IMPLEMENTATION NOT AUTHORIZED**. Exact reviewed baseline:
`3e35fb29dd4488bf655446712e5a013e06f8ed1e` (Cycle 22). This proposal satisfies the
Cycle 21 requirement to review authority, consistency and recovery before an adapter.
It adds no runtime, table, migration, writer, credential path or restoration command.
Independent review and a separate owner decision are required before implementation.
Passing a document check approves neither the architecture nor an operational system.

## Existing ownership and gaps

The table names below describe existing sources, not permission to install or expose
them. Original migration history and the pending customer migration remain unchanged.
Local repositories demonstrate behavior; their in-memory objects are not durable
production records. Future adapters must implement existing ports against the
separately authorized canonical owner, rather than persist a second object graph.

| Record                                                               | Existing owner                                                                                                                                   | Persistence and authority boundary                                                                                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer, service location, consent                                  | `Operations` in `src/lib/operations.ts`; existing CRM SQL/RPC contracts                                                                          | Browser selections and fixture IDs never establish authority. Exact current organization/customer/location and consent evidence must be read through the original checked server contracts.                 |
| Estimate, saved version, immutable issued scope                      | `Phase3Repository`; existing `estimates`, `estimate_versions`, `estimate_options`, `estimate_lines` and related Phase 3 contracts                | Preserve integer calculation rules, exact version identity, saved revision and issued immutability. Do not restore from a packet or historical comparison file.                                             |
| Job, assignment, expense/material commitment                         | `Phase3Repository`; existing `jobs`, `job_assignments`, `job_expenses`, `job_expense_reviews`, `job_expense_material_lines`                      | Preserve canonical reviewed/posted/committed distinctions, original ledger events and idempotency. No new ledger, inferred posting or invoice execution.                                                    |
| Recorded labor and review                                            | `Phase3Repository`; existing `time_entries`, `time_reviews` and workforce contracts                                                              | Retain original time/review references and authoritative cost calculations. No duplicate labor posting. Customer projections exclude workforce rates and payroll details.                                   |
| Inspection plan, visit, published report                             | `PropertyRepository`; existing private `inspection_plans`, `inspection_visits`, `inspection_reports`                                             | Preserve actual report→visit→plan→job associations and immutable published versions. Missing request→job links remain UNKNOWN. Inspection documentation never proves physical completion.                   |
| Maintenance review, follow-up and repair intent                      | Existing `MaintenancePersistence` port, source/version-bound commands and receipts; existing 2A–2F proposals and guards                          | Operational writer, schema ownership, genuine authority and universal writer participation remain unaccepted. Do not turn session-only maintenance maps into a new database or promote disposable test SQL. |
| Work-order/task correction and schedule proposal                     | Existing workflow/revision engines and original one-use correction custody; `server/field-lab` is a disposable laboratory                        | No operational durable work-order owner or restoration adapter is accepted here. Any missing owner is an explicit prerequisite, not an invitation to invent a parallel store.                               |
| Customer request and exact receipt                                   | Pending unchanged customer14 plus separately reviewed original 4B/broker proposals; `CustomerRequestBroker` and original private decision ledger | No operational factory or genuine Auth acceptance. Retain original server-derived source/publication/version and issuer-committed claim. Legacy receipts are immutable and gain no retrospective custody.   |
| Passport, cost coverage, maintenance opportunities, owner priorities | Existing allowlisted projections over the owners above                                                                                           | Derived views are rebuilt by authorized reads. They are not another canonical owner, completion proof, or an instruction to replay mutations.                                                               |
| Historical test/evidence files                                       | Existing `server/field-lab/saved-evidence-files.ts` and sanitized validation artifacts                                                           | Historical observations only. Never use them as business-state restoration, an authenticated command journal, or authority to resume execution.                                                             |

Exact implementation references include `server/property/maintenance-persistence.ts`,
`server/customer/broker.ts`, `server/customer/request-gateway.ts`,
`src/lib/workflows/saved-revision-runtime.ts` and
`src/lib/workflows/saved-revision-exercise.ts`. They retain their current test-only,
default-off or session-only limits. This proposal changes none of those limits.

## Identity and authorization contract

Every future persisted reference must bind exact organization, current principal,
customer, property/location, job where actually recorded, source kind/ID/version,
expected canonical revision, command digest and original receipt identity. Missing or
conflicting foreign-key evidence is UNKNOWN. Text, timestamps, property proximity,
browser paths and newest-version selection cannot manufacture a relationship.

The future server must resolve identity from genuine authenticated, current sessions
and checked membership, customer mapping and role evidence. Preserve AAL2 where
required. Check current authority before resource waits and immediately before the
canonical write. Re-evaluate current revocation at reconciliation and at each read;
an old backup may never revive a revoked grant. No request-scoped service key,
user_metadata authorization, generic private-table CRUD or client-selected tenant.
Persisted tenant references require reviewed composite tenant foreign keys, indexed
tenant access, RLS and explicit least-privileged grants. Definer owners, installers,
issuers, executors and readers remain distinct under the existing reviewed contracts.

The official [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
distinguishes row policies from object grants. The
[API privilege change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
does not retroactively prove existing grants safe. An actual target-specific catalog
and negative authorization review remains necessary under separate authorization.

## Command, custody, receipt and acknowledgment consistency

1. Validate exact current source and authority. Acquire the original one-use admission
   under the original custody owner before transmission. Preserve committed issuer
   claims and the exact phase/backend/full-XID restrictions where the reviewed 4B/2E
   contract requires them. Never substitute a second browser or file-based hold.
2. Record the exact command identity and payload digest durably before a mutation can
   begin. An existing, spent or UNKNOWN claim permits exact read-only reconciliation
   only. No alternate ID, rewritten payload, rollback/savepoint reset or replacement
   claim may bypass that restriction.
3. Within the authorized canonical transaction, recheck source revision, current
   authority and command ownership after waits; perform only the reviewed mutation
   and append its immutable exact receipt atomically with that canonical change.
   Retain the original optimistic-concurrency boundary and uniqueness constraints.
4. Separately committed custody/issuer transactions are not magically atomic with the
   business transaction. A crash between them leaves a consumed or UNKNOWN claim;
   missing business evidence does not make the original command replayable. The
   admission owner must expose an exact read-only reconciliation result.
5. A success ACK requires confirmed canonical commit, validated immutable receipt and
   the required custody durability. If any commit, receipt, durable journal or ACK is
   ambiguous, report UNKNOWN. Never label absence as failed execution. Inspect only
   the exact tenant/source/command/receipt, without retrying or continuing a phase.

Receipt integrity must cover a versioned allowlisted representation: original
command/source identity and digest, previous/new revision, actor reference, canonical
event/result references and recorded timestamp. Use deterministic canonical encoding
and verify the existing receipt semantics. A plain hash detects accidental change;
same-owner replacement of content and hash is not authenticated integrity. Operational
signing/witness/key custody, append-only enforcement, minimal audit fields and chain
high-water marks require separate review. Do not claim an HMAC/key or trusted witness
already exists merely because test fixtures validate a digest.

## Backup and restore consistency

The canonical database, original one-use custody, immutable receipt high-water mark
and any independently required witness form one recovery contract. A restored older
database must not revive a previously used claim, even when it lacks the later
receipt. **An independent rollback-resistant custody fence is not implemented or
accepted. Until demonstrated, restart restoration that could admit writes is NO-GO.**
Do not hide that gap behind an append-only local file, sequence, browser storage,
historical artifact, same-owner hash or a second same-machine process.

A future reviewed backup set needs exact database timeline/consistent recovery point,
schema and migration hashes, canonical revision/receipt high-water marks, original
custody epoch/watermark, encrypted object version manifest and separately protected
key references. A matching set must be proven; combining unrelated database, object,
journal or key snapshots is forbidden. Backups are confidential tenant data and need
reviewed encryption, key recovery, access logs, retention, deletion and restore
authorization. No operational credentials or key retrieval is authorized now.

[PostgreSQL 17 backup guidance](https://www.postgresql.org/docs/17/backup.html)
describes distinct dump, filesystem and continuous-archiving approaches; their mere
availability proves no application-level command consistency. Official
[Supabase backup guidance](https://supabase.com/docs/guides/platform/backups) says
database backups do not include Storage object bytes, and downloadable daily backups
exclude custom-role passwords. Therefore a database-only restore cannot establish
object recovery or operational credential custody. No target backup/PITR, encryption,
restore or RPO/RTO capability has been verified by this proposal.

Restoration must first occur in a fenced, quarantined environment with all writers,
providers, communication, financial execution and connected customer routes OFF.
Verify the matched backup set, independently held custody watermark, immutable
receipts, tenant relationships and current external revocations. Reconcile exact
UNKNOWN intents read-only; unresolved or conflicting evidence blocks writer admission.
Do not restore bearer tokens, browser sessions or Auth authority from business files.
Official [session guidance](https://supabase.com/docs/guides/auth/sessions) explains
session identity and time-bound enforcement; current server-side session/revocation
checks remain necessary. Reopening any operational writer is a separate exact-target
approval after recovery acceptance, never an automatic startup or restore step.

## Required failure and acceptance matrix

All rows below are proposed acceptance requirements, **NOT RUN for an operational
adapter**. Earlier local tests remain valid for their original finite scopes only.

| Failure or race                                                                                                 | Required result                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process/power loss before admission, after admission, during transaction, after commit or before ACK            | Preserve original custody and exact receipt; ambiguity remains UNKNOWN; no retry/replacement command.                                                |
| Competing writer, duplicate command, stale revision or concurrent staff action                                  | One canonical outcome under original CAS/uniqueness rules; other attempt denied or exact reconciled; no second posting or task correction.           |
| Revoked/inactive/foreign principal, changed customer/property/job association, expired session or MFA downgrade | Deny before and after waits; never revive old authority from backup; no cross-tenant disclosure.                                                     |
| Rollback, savepoint, old database restore or old custody file restoration                                       | Original spent claim stays spent through independently verified rollback-resistant fencing; absent fence means NO-GO.                                |
| Lost/malformed ACK, unavailable journal, disk full or partial write                                             | UNKNOWN and exact read-only reconciliation; no automatic continuation or fallback writer.                                                            |
| Receipt substitution, digest mismatch, wrong organization/source/version or duplicate receipt identity          | Fail closed, preserve original evidence and block admission; a recomputed same-owner hash cannot establish authenticity.                             |
| Missing/corrupt backup member, wrong encryption key, missing Storage bytes or mixed recovery points             | Quarantine and fail closed; do not present partial records as complete recovery.                                                                     |
| Current source missing from Passport/owner-priority projection                                                  | Mark missing/stale/UNKNOWN as appropriate; never infer completion, repair, acceptance or payment.                                                    |
| Clock rollback, deadline mismatch or external witness outage                                                    | Stop mutation admission, retain custody and UNKNOWN as required; do not extend authority from a restored clock.                                      |
| Independent physical restoration/containment                                                                    | Actual separately supervised demonstration with exact sanitized evidence and cleanup; localhost, process mocks and device availability are not PASS. |

Acceptance must measure actual RPO/RTO, verify no duplicate financial/event posting,
exercise exact customer-safe projections, and prove restore cannot bypass current
revocations or original custody. Retention/legal/privacy choices, operational owner,
backup/key custodian, full writer participation and rollback-resistant fence remain
unresolved requirements, not defaults chosen by this proposal.

## Review and release boundary

Required decisions: independently review this source ownership/consistency contract;
resolve the missing operational owners and anti-rollback fence; separately authorize
any bounded local prototype; later review exact schema/grants/target/Auth and physical
recovery before any installation or operational adapter. No stage follows automatically.

Danny's November 4 MacBook Air remains subject to the unchanged
`CYCLE18_NOV4_MACBOOK_AIR_CHECKLIST.md` and retained encrypted synthetic kit. Verify
maintained OS/build, FileVault fully enabled, independent battery/network/power and
human supervision on the actual computer; then original pairing, transfer, durable
ACK, heartbeat, primary-loss recovery and cleanup. Device readiness, physical pairing,
recovery and cleanup are **UNVERIFIED / NOT RUN**. No kit recreation or repeat of the
25 completed offline checks; no operational credentials on unsupported Monterey.
The synthetic rehearsal does not accept this future canonical business restoration.

Original P1 authorization is preserved without duplicate authorization. P1 on thirteen
historical migrations, separate pending customer14, original 4B/broker, Auth/MFA,
NMI/settlement, Netlify/frozen build and genuine hosted recovery acceptance keep their
existing separate gates. All approved designs/artwork, frozen four artifacts and
financial/communication restrictions remain intact. No merge, deployment, hosted
mutation, payment, dispatch or customer communication. **Release 1.0 NOT READY /
NOT AUTHORIZED.**
