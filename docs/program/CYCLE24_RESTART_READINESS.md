# Cycle 24 · canonical restart implementation-readiness register

**NO-GO for adapter implementation.** This register refines the independently reviewed
Cycle23 proposal; it does not authorize a local operational adapter, schema, installer,
credentials, hosted action or restoration. All nineteen requirements remain NOT_ACCEPTED;
operational owners are unassigned or unverified, not silently assigned by this table.
Source inspection is evidence of the existing contract only. It is not target acceptance.

The companion JSON pins the exact Cycle23 source7b8d8c1a, reviewed proposal52848cdc and
independent reviewd0fc730d, finite dependency graph and source hashes. The original
Operations, Phase3Repository and PropertyRepository remain authoritative. Missing
work-order/maintenance operational ownership must be resolved before choosing an adapter.
Historical evidence files, JSON exports and in-memory projections cannot restore canonical
business state, original one-use custody, authenticated identity or financial authority.

| ID  | Missing requirement                     | Original contract / operational custody                                                                             | Dependencies                                                                             | Separate decision required                                                                  |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| R01 | canonical CRM ownership                 | Operations / CRM RPCs; operational owner UNASSIGNED/UNVERIFIED                                                      | None                                                                                     | Separate exact ownership/catalog/target review                                              |
| R02 | canonical estimate/job/cost ownership   | Phase3Repository; operational owner UNASSIGNED/UNVERIFIED                                                           | R01                                                                                      | Separate exact ownership/catalog/target review                                              |
| R03 | canonical inspection ownership          | PropertyRepository; operational owner UNASSIGNED/UNVERIFIED                                                         | R01, R02                                                                                 | Separate exact ownership/catalog/target review                                              |
| R04 | missing task/schedule durable owner     | Existing workflow ports; disposable field-lab is not operational ownership; operational owner UNASSIGNED/UNVERIFIED | R01, R02, R03                                                                            | Separate original durable-owner design and bounded prototype approval                       |
| R05 | maintenance command authority           | MaintenancePersistence / existing 2A–2F proposals; operational owner UNASSIGNED/UNVERIFIED                          | R01, R03, R04                                                                            | Separate least-privilege and full-writer-participation review                               |
| R06 | customer request authority              | Unchanged pending customer14 plus original4B/broker; operational owner UNASSIGNED/UNVERIFIED                        | R01, R03                                                                                 | Existing P1 approval preserved; separate14/exact4B/Auth target authorization                |
| R07 | genuine current authority               | Original Auth/session/member/mapping guards; operational owner UNASSIGNED/UNVERIFIED                                | R01, R06                                                                                 | Separate genuine internal Auth/MFA acceptance                                               |
| R08 | original durable one-use admission      | Original issuer and command-custody owner; operational owner UNASSIGNED/UNVERIFIED                                  | R04, R05, R06, R07                                                                       | Separate original durable-custody implementation design approval                            |
| R09 | canonical transaction boundary          | Original canonical writer; not the projection; operational owner UNASSIGNED/UNVERIFIED                              | R02, R03, R08                                                                            | Separate transaction protocol/negative-case review                                          |
| R10 | receipt identity and authenticity       | Original canonical receipt owner; signer/witness unassigned; operational owner UNASSIGNED/UNVERIFIED                | R08, R09                                                                                 | Separate receipt format, custody, key/witness and compatibility review                      |
| R11 | success acknowledgment boundary         | Original transport and admission owner; operational owner UNASSIGNED/UNVERIFIED                                     | R08, R09, R10                                                                            | Separate exact ACK protocol and crash-window review                                         |
| R12 | exact reconciliation                    | Original read-only receipt/source reader; operational owner UNASSIGNED/UNVERIFIED                                   | R07, R10, R11                                                                            | Separate operational reader/privilege acceptance                                            |
| R13 | independent anti-rollback fence         | Independent external custody owner UNASSIGNED; operational owner UNASSIGNED/UNVERIFIED                              | R08, R10                                                                                 | Separate fence design, custody and independent adversarial acceptance                       |
| R14 | matched backup set                      | Database/object/custody/key custodians UNASSIGNED; operational owner UNASSIGNED/UNVERIFIED                          | R09, R10, R13                                                                            | Separate exact backup policy/ownership/target approval                                      |
| R15 | backup confidentiality and key recovery | Security/privacy/key custodians UNASSIGNED; operational owner UNASSIGNED/UNVERIFIED                                 | R10, R14                                                                                 | Separate security/privacy/key-custody decision                                              |
| R16 | quarantined recovery admission          | Recovery operator and independent supervisor UNASSIGNED; operational owner UNASSIGNED/UNVERIFIED                    | R07, R12, R13, R14, R15                                                                  | Separate exact action-specific recovery and writer-admission authorization                  |
| R17 | measured recovery acceptance            | Independent physical recovery supervisor UNVERIFIED; operational owner UNASSIGNED/UNVERIFIED                        | R14, R15, R16                                                                            | Original credential-free rehearsal scope only; operational verification separately approved |
| R18 | derived projection boundaries           | Existing Passport/cost/maintenance/priority allowlists; operational owner UNASSIGNED/UNVERIFIED                     | R01, R02, R03, R07                                                                       | No new operational authority                                                                |
| R19 | bounded implementation decision         | Owner and independent architecture/security reviewers; operational owner UNASSIGNED/UNVERIFIED                      | R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18 | Separate explicit implementation authorization required; currently ABSENT                   |

## Exact consistency boundaries and acceptance

- **R01 — canonical CRM ownership:** Name an operational CRM writer/reader owner; inventory all current tenant/customer/location/consent RPCs, grants and writers; no second graph. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R02 — canonical estimate/job/cost ownership:** Bind existing estimate/version, issued scope, job, assignments, time/reviews and expenses/events to exact original SQL owners; no duplicate posting or recalculation engine. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R03 — canonical inspection ownership:** Name plan/visit/published-report writer; preserve immutable versions and actual recorded foreign keys; missing request-to-job FK stays UNKNOWN. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R04 — missing task/schedule durable owner:** Resolve durable task/work-order/schedule ownership and every participating writer before selecting an adapter; do not persist a parallel session map. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R05 — maintenance command authority:** Resolve D009 installer/helper/provisioner TCB, raw/admin writers and universal admission participation; composed disposable checks do not close it. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R06 — customer request authority:** Sequence original recovery and approved P1-on13, then separately customer14 and exact4B/broker installation/grants/mapping; genuine Auth acceptance remains absent. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R07 — genuine current authority:** Verify genuine current session/MFA, tenant, customer mapping, membership and revocation before admission, after waits, during reconciliation and after restore. Old backup cannot revive authority. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R08 — original durable one-use admission:** Name original operational issuer/registrar/executor/read owner; pre-admission commit precedes consumer transaction. No replacement IDs, reset, replay or restored browser hold. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R09 — canonical transaction boundary:** Canonical mutation and exact immutable receipt commit atomically within one reviewed transaction, with CAS and post-wait authority checks. Separate issuer commit remains a real failure window. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R10 — receipt identity and authenticity:** Specify versioned allowlist, tenant/command/source digest, previous/new revision, actor/event/result IDs, uniqueness, append-only enforcement and witness/key lifecycle. Hash alone is not authenticity. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R11 — success acknowledgment boundary:** ACK only after confirmed canonical commit, exact receipt validation and required original-custody durability. Lost ACK/commit/receipt/journal remains UNKNOWN. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R12 — exact reconciliation:** Inspect only exact original tenant/source/command/receipt with current authority; missing/partial/conflicting evidence stays UNKNOWN. Never replay, substitute newest, rebind or resume. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R13 — independent anti-rollback fence:** Design independently held spent-claim epoch/watermark, outage and clock behavior, all-writer fencing and old-database restore denial. Same-owner file/hash/sequence is insufficient. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R14 — matched backup set:** Prove matched DB timeline/LSN and schema hashes, canonical revision/receipt watermark, custody epoch, object versions and protected key references. Reject mixed/missing/corrupt members. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R15 — backup confidentiality and key recovery:** Set tenant-safe encryption, independent recoverable keys, access/audit, retention/deletion, redaction and authorized restore scope. DB backup does not include Storage bytes or custom-role passwords. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R16 — quarantined recovery admission:** Restore only to fenced quarantine with all writers/providers/messages/payments OFF. Verify matched set and current external revocations; reconcile UNKNOWN read-only before separate admission. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R17 — measured recovery acceptance:** Measure actual RPO/RTO and corruption/old-backup/duplicate/tenant/revocation behavior. Danny device readiness/pairing/ACK/heartbeat/primary-loss/cleanup must actually be demonstrated. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R18 — derived projection boundaries:** Rebuild authorized derived views from actual owners; never restore canonical state, genuine approval or completion from history, packets, projections or evidence files. Status: NOT_ACCEPTED / operational test NOT RUN.
- **R19 — bounded implementation decision:** Review precise finite prototype scope only after owners/consistency/dependencies are resolved; no adapter/schema is authorized by this register or a passing test. Status: NOT_ACCEPTED / operational test NOT RUN.

Separate issuer/admission commits are not atomic with the canonical transaction. A consumed
claim plus missing receipt remains UNKNOWN. Canonical mutation/receipt atomicity does not
by itself authenticate a replaced receipt or fence an old restored database. ACK proof must
cover confirmed business commit, exact immutable receipt and required original-custody
durability. Original spent or UNKNOWN attempts permit exact read-only reconciliation only;
never another ID, automatic replay, replacement command, rollback reset or writer fallback.

The recovery set must bind DB timeline/recovery point, unchanged schema/migration hashes,
canonical/receipt high-water marks, independent original-custody epoch, object versions and
protected key references. Missing or mixed members fail closed. Storage bytes and custom-role
password custody cannot be inferred from a database backup. See the original proposal's
[official backup reference](https://supabase.com/docs/guides/platform/backups). Current
session/revocation and object grants/RLS require independent acceptance; an old backup may
not revive a removed member or bearer session. RPO and RTO remain UNMEASURED.

## November4 and preserved sequence

Use the unchanged C18 Air checklist, C19 quickcard, C20 preparation and original 97,334-byte
synthetic ZIP, SHA25632cb88f123e0fd776986f32d8508c913dbedc1ac977779708d1ba7218bbb8d59.
Do not repeat completed setup or25 offline checks. Actual maintained macOS/build, FileVault,
independent power/network, supervision, pairing, transfer/ACK, heartbeat, primary-loss
recovery and cleanup remain UNVERIFIED/NOT RUN until observed. No operational credentials,
genuine Auth, SQL or hosted cleanup is part of the credential-free rehearsal.

Original approved frozen P1 remains valid without duplicate authorization, only after its
unchanged recovery prerequisites and against13 historical migrations. Pending customer14,
original4B/broker, genuine Auth/MFA and action-specific hosted recovery verification follow
only their own separate exact approvals. Nothing here opens NMI/settlement, Netlify,
financial/provider/message, production, deployment or merge gates. Approved designs and
all frozen artifacts remain unchanged. Release1.0 NOT READY / NOT AUTHORIZED.
