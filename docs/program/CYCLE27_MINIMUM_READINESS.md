# Cycle 27 · smallest operational implementation-readiness package

**STATIC REVIEW ONLY · NO-GO for operational implementation.** Source is exact
C26 `f81081b3ce8fca63443a9f03e8bfcd5aa4daa4b6`. This narrows the existing
[C26 matrix](CYCLE26_OWNER_WRITER_MATRIX.md), not its authority or requirements.
The original eight families and R01–R19 remain unchanged. No schema, adapter,
credential loader, hosted factory, restore path or runtime gate is added.

## One future slice and its original owners

One genuine internal customer request → exact immutable receipt → currently
authorized staff read. Reuse original customer14/4B/broker SDK, private decision
ledger and staff reader. No task, invoice, payment or new business store belongs
to this slice. Existing code is disposable-only, not an operational owner.

| Boundary  | Existing source responsibility                                                        | Operational acceptance still missing                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity  | `CustomerBrokerAuth.verify`, original verified SDK/session path and server-only proof | Named Auth/security operator; current genuine session, tenant/customer mapping and staff membership. Staff requires AAL2; customer AAL follows original contract. Browser paths, claims alone and user metadata never authorize. |
| Registrar | `customer4b_registrar`, `customer_broker_admit`, NOLOGIN admission owner              | Named admission operator; exact target ownership, command/tenant/actor/source/backend/full-XID binding, independently committed one-use hold before original issuer claim.                                                       |
| Issuer    | Finite dedicated issuer login, original `customer_request_claim`, NOLOGIN core owner  | Named claim custodian; separate issuer commit before consumer mutation; spent authority survives consumer rollback/savepoints and cannot be reset or replaced.                                                                   |
| Consumer  | Finite dedicated executor login and `runCustomerRequestTransaction`                   | Named canonical transaction operator; unchanged exact source/current principal/session/mapping/member and post-wait checks; canonical mutation and immutable receipt commit together.                                            |
| ACK       | Original broker receipt parser and current-identity recheck                           | Named supervised broker operator; success only after commit, exact receipt validation and required independent custody durability. Lost/contradictory acknowledgment is UNKNOWN.                                                 |
| Reader    | `customer4b_reader`, NOLOGIN reader owner, exact `receipt` / `staffQueue`             | Named reconciliation operator; current authorized exact original identifiers, append-only originals, no newest-source substitution, replay, new ID, publication bypass or permission restoration.                                |

Original pinned four connections must stay distinct, same target database, dedicated
backend/session/role identities and finite one-use issuer/executor pairs; never a
reusable transaction pool. NOLOGIN owners remain distinct from runtime logins.
These are source requirements, **not proven installed privileges**.

## Required writer participation and independent custody

The inventory must include the original registrar, issuer, executor and reader,
plus every direct/raw/admin writer, historical helper/definer, installer,
provisioner and restore operator able to alter claims, sequences, source mappings,
receipts or grants. The C26 inventory is incomplete. Trusted helper/installer TCB,
core CREATE and `pg_read_all_stats` dependencies are still unresolved; do not claim
universal no-bypass coverage from the disposable broker tests.

Keep these three boundaries separate: registrar admission commit; original issuer
claim commit; consumer mutation plus exact receipt atomic commit. A hash, timestamp,
row count or client success cannot replace authenticated immutable receipt evidence.
Receipt admission must bind original command/source/tenant/actor, consumer backend
and full transaction identity, exact resulting record/version and durable commit
watermark. Lost ACK, process loss, competing attempt, revocation or missing receipt
retain UNKNOWN and allow only exact current-authorized read-only reconciliation.
No file of historical observations becomes canonical restart state.

An **independent rollback-resistant fence owner is unassigned**. Its current spent
claims, custody epoch and external revocations must survive consumer rollback and
older database/disk/backup restoration. All writers must participate or be provably
excluded. Absence or unavailability means NO-GO; no replacement claim or retry can
repair uncertainty. The reviewed architecture does not authorize implementing this
fence or an operational restoration adapter.

## Exact acceptance before any implementation approval

| Decision/evidence                                                                                                                                                                                                      | Dependencies retained                 | Current result                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| Name accountable business, Auth/security, admission, transaction, receipt/ACK, reconciliation, DBA, independent fence, backup/key and recovery operators; define separation of duties                                  | Original R01–R08, R19                 | UNASSIGNED_OR_UNVERIFIED                       |
| Review exact target/catalog/schema ownership, finite grants, NOLOGIN attributes, helpers/default privileges, private API exclusion, RLS and tenant-composite constraints; prove cross-tenant/current-revocation denial | R01–R07, R13                          | NOT RUN; no service key in request-scoped API  |
| Specify exact existing writer participation, issuer precommit, consumer CAS/receipt atomicity and durable ACK; deny duplicates/concurrent stale or revoked actors                                                      | R08–R13                               | SOURCE REQUIREMENTS ONLY; no operational owner |
| Bind matched DB timeline/LSN/schema and revisions, receipt watermark, object bytes/versions, custody epoch, fence and protected key references; fence all writers/providers during quarantine                          | R13–R16                               | NOT RUN; no matched operational backup         |
| Demonstrate current external revocation after recovery, exact UNKNOWN reads and no restored one-use authority; measure RPO/RTO and cleanup                                                                             | R12–R17                               | NOT RUN; physical recovery NOT RUN             |
| Review separately bounded implementation scope, owners, target and exact hashes; preserve derived projection/completion limits                                                                                         | R18–R19 requires all original R01–R18 | NO-GO for implementation authorization now     |

Grants and RLS are separate checks, and sensitive session revocation needs current
server evidence; a still-valid JWT can outlive logout. Database backups do not
include Storage object bytes or custom-role passwords. Use the original contracts
and reviewed tool versions, not an unreviewed CLI upgrade. References:
[session lifecycle](https://supabase.com/docs/guides/auth/sessions),
[RLS and privileges](https://supabase.com/docs/guides/database/postgres/row-level-security),
[backup scope](https://supabase.com/docs/guides/platform/backups).
No hosted verification, Auth session, database query or credential retrieval was
performed for this source-only review.

## Next acceptance sequence

Danny's newer Air is last reported **not available**. Retain the sealed synthetic
kit and November4 quickcard. Supported OS/build, FileVault, independent power/network,
authenticated pairing, durable ACK, primary-device loss, independent recovery,
duplicate denial, revocation and cleanup all require the actual physical demonstration.
Do not repeat the completed25 offline checks or record physical PASS from availability.

First perform only that original credential-free rehearsal when the second device
is available. Preserve the existing P1 approval against exactly thirteen history
following its original recovery prerequisites; do not request duplicate P1 approval.
Customer14 and original4B/broker installation and genuine internal request acceptance
remain separately reviewed action-specific authorizations, exact target/hash/grants/
mapping/current Auth and recovery evidence. This package requests none of those actions.
Other local engineering continues while external prerequisites are blocked.

## Immutable source binding

All hashes below are original f81081 source, not installation or recovery proof.

| Original path                                   | SHA256                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `docs/program/CYCLE26_OWNER_WRITER_MATRIX.json` | `91c941bc88908294152b5eb1187a990890b899f7499c6ed0522ebc171863ef54` |
| `docs/program/CYCLE24_RESTART_READINESS.json`   | `1558093ed9d4b56d1f244d1a6aec485071d975966edd7a5db0fa269c5ec020f6` |
| `server/customer/broker.ts`                     | `f983d8ceaa0bb5cd2403008301580894dd7c9023cd2c6d2026c0a2a70c6b979e` |
| `server/customer/broker-auth.ts`                | `709018249d889504b860e4cf0f4caa5cbdd1c2b04f58c53226f4499c68fd46d6` |
| `server/customer/request-gateway.ts`            | `1472d74e4d3bd94c8be8ef33785e88f2c567dfc632f6c73c5ad6d9c8782a549c` |
| `server/customer/broker-ownership.ts`           | `582378dedd09fff7983ea351ade026285e9ec51ae38ea004c7e4f8c2719ba25e` |

No merge, deployment, hosted mutation, operational persistence/restoration, dispatch,
communication, payment or NMI activation is authorized. Original thirteen migrations,
customer14/4B, P1/four artifacts, Netlify/executor, approved designs, Auth/MFA, NMI and
all financial/recovery/production gates remain unchanged. Release1.0 remains
**NOT READY / NOT AUTHORIZED**.
