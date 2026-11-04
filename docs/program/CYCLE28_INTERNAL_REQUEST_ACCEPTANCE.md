# Cycle 28 · internal request acceptance specification

**SPECIFICATION ONLY. Operational implementation and execution: NO-GO.**

This specifies the single future genuine internal customer request → immutable
receipt → currently authorized staff read path. It narrows reviewed PR #192,
`28aaa835c63802a8ad571804028b6700e20e3924`, and the original eight operational
families/R01–R19. It creates no owner, schema, store, writer, grant, adapter,
credential loader or connected route. Local synthetic results do not satisfy the
operational cases below.

## Exact existing authority and accountable roles

The business owner must name a real accountable person for each role and approve
separation of duties. All person assignments are **UNASSIGNED / UNVERIFIED**.
Danny's possible device availability does not appoint him an operational custodian.

| Named role required                          | Existing source responsibility                                                                                           | Acceptance responsibility                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Business/source owner                        | Original customer14 publication and 4B private decision ledger; existing CRM/customer/property/issued version identities | Approve one exact internal target, permitted request/choice/note and original source revision/publication/hash. No newest-version substitution.                                                  |
| Auth/security owner                          | `CustomerBrokerAuth.verify` in `server/customer/broker-auth.ts`                                                          | Genuine verified SDK session, current session/customer mapping/membership, original customer assurance policy; staff AAL2. Paths, metadata, cached claims and browser selection never authorize. |
| Admission operator                           | Dedicated registrar and `customer_broker_admit` in original broker proposal                                              | Server-issued exact command binding and independent admission COMMIT before issuer participation.                                                                                                |
| One-use claim custodian                      | Finite dedicated issuer and original `customer_request_claim`                                                            | Commit claim bound to original consumer backend/full transaction identity before consumer mutation; deny reuse after rollback/savepoint/process loss.                                            |
| Canonical transaction operator               | Dedicated executor and `runCustomerRequestTransaction`                                                                   | Current source/Auth/mapping/member checks, resource locks/CAS and post-wait checks; canonical request plus exact immutable receipt in one transaction.                                           |
| Receipt/ACK operator                         | Original broker receipt validation                                                                                       | Acknowledge only after canonical commit and required independent custody durability; reject contradictory receipt fields.                                                                        |
| Reconciliation/staff-read operator           | Original dedicated reader, `receipt` and `staffQueue`                                                                    | Exact original identifiers and current authorization; allowlisted customer/staff views; no replay or replacement.                                                                                |
| DBA/privilege owner                          | Original NOLOGIN owners, dedicated role/ownership contract                                                               | Independently inspect exact target catalog/grants/default grants/RLS/composite tenant references; enumerate every bypass-capable writer.                                                         |
| Independent fence custodian                  | **Missing operational owner**                                                                                            | Rollback-resistant spent authority, custody epoch and current external revocation independent of database/disk restore; fail closed while unavailable.                                           |
| Backup/key custodian and recovery supervisor | Existing recovery design and sealed synthetic kit                                                                        | Matched backup set, key custody, writer quarantine, independent recovery, measured RPO/RTO and revocation/cleanup.                                                                               |
| Independent reviewer                         | Exact source/hash/target and evidence review                                                                             | Reject incomplete writer inventory, stale privileges, mismatched backup/custody or any inferred acceptance.                                                                                      |

Four pinned registrar/issuer/executor/reader connections must be distinct and on
the exact same reviewed target. Preserve dedicated backend/session/role identity,
finite independently provisioned one-use issuer/executor pairs and separate NOLOGIN
owners. A reusable transaction pool is not an accepted substitute.

## Writer inventory and transaction boundaries

Before implementation approval, enumerate and classify the registrar, issuer,
consumer, receipt/staff readers, every direct/raw/admin writer, historical helper,
definer owner, installer, provisioner, grant manager, source-mapping writer,
sequence/claim writer and restore operator. For each, record its named owner,
exact object/column access, transaction participation, revocation path and proof
that it participates in custody or cannot bypass it. Current source fixtures do
not prove installed least privilege. Trusted installer/helper/core CREATE and
`pg_read_all_stats` dependencies remain unresolved. Any unidentified writer is
NO-GO; no blanket assertion that all writers participate is permitted.

Keep three commits distinct:

1. Registrar admission commits exact tenant/actor/customer/property/source,
   command identity and original consumer backend/full-XID binding.
2. Original issuer commits the one-use claim independently of the consumer.
3. Consumer atomically commits the canonical decision/request and its immutable
   receipt after final current-authorization/source checks.

Receipt acceptance binds original command/request/choice, tenant/customer/property,
actor/session, estimate/version/publication/hash, backend/full-XID, resulting native
record/revision and durable commit evidence. Values remain private; public review
records contain only sanitized identities/hashes and outcomes. Commit watermark
and independent fence/ACK attestation requirements need a reviewed operational
owner; this specification does not invent a new receipt format or retrofit legacy
receipts. Original v1 receipts stay immutable.

Missing/lost/contradictory ACK is **UNKNOWN**, including a committed request whose
success was not observed. No retry, new command ID, replacement claim, rebind,
publication bypass or automatic continuation. Exact read-only reconciliation may
report the original committed receipt only after current authorization and exact
source/receipt checks. Absence is not proof of failure and never renews authority.

## Future acceptance cases — all NOT RUN operationally

Run only after separately reviewed implementation and action-specific execution
authorization. Each case must retain exact source/target versions, responsible
reviewer, observed outcome and immutable sanitized evidence. A local PASS or a
hash alone cannot close these cases.

| Case / dependencies                    | Preconditions and action                                                                   | Required observation / stop condition                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 scope/owners · R01–R08,R19         | Named roles; fixed target and unchanged source hashes; complete writer inventory           | Independent reviewer signs boundaries. Missing role/writer/target evidence stops before implementation.                                                                                                                                                                                 |
| A02 genuine identity · R01–R07         | Current genuine customer session and exact published source; separately current staff AAL2 | Exact intended customer may request; exact eligible staff may read. Foreign tenant/property, revoked/inactive/missing mapping, forged metadata, stale claims and wrong assurance deny without revealing records.                                                                        |
| A03 catalog/privileges · R02–R07,R13   | Read-only exact target catalog audit before future write                                   | Explicit minimal grants, private API exclusion, NOLOGIN owners, indexed tenant access/composite tenant FKs and RLS evidence; negative direct/raw/API/definer paths denied. Grants alone or RLS alone are insufficient.                                                                  |
| A04 original source · R08–R11          | Original estimate/version/publication/hash/request/choice/note binding                     | Stale publication, changed scope/hash, wrong customer/property, malformed note or unauthorized choice rejected before claim; no latest-source fallback.                                                                                                                                 |
| A05 atomic receipt · R08–R13           | Original three-commit sequence and exact consumer backend/full-XID                         | Canonical mutation and immutable receipt commit together. Induced failure before consumer commit leaves neither consumer mutation nor receipt, but original spent custody cannot be reused.                                                                                             |
| A06 ACK durability · R10–R13           | Committed exact receipt and required independent custody ACK                               | Success only after both durable conditions and current-identity recheck; lost ACK/process interruption/journal failure remains UNKNOWN without another mutation.                                                                                                                        |
| A07 concurrency/revocation · R08–R13   | Two simultaneous exact claims; revocation/source change while waiting                      | At most one original execution. Recheck current source/principal/session/mapping/member after lock wait and before commit. Denied competitor cannot create another ID or recycle custody.                                                                                               |
| A08 exact reconciliation · R11–R13     | UNKNOWN original result; retained exact identifiers                                        | Authorized read finds exact original receipt or retains UNKNOWN. Wrong IDs, missing receipt, foreign/revoked staff and contradictory evidence never trigger write/replay/replacement.                                                                                                   |
| A09 staff projection · R04–R07,R11–R13 | Current eligible staff reads retained original request/receipt                             | Exact request/source provenance and safe note; no private environment, credential, unrelated tenant/customer, internal cost or staff-only customer projection leak. Revocation removes access immediately at required current checks.                                                   |
| A10 rollback resistance · R12–R16      | Independent fence owner and all writer participation proven                                | Consumer rollback/savepoints, older DB snapshot, disk rollback and restarted process never restore spent authority. Fence unavailable or epoch mismatch quarantines writes; no historical evidence-file restoration.                                                                    |
| A11 matched recovery · R13–R17         | Reviewed matched backup and separate operational recovery authorization                    | Match DB timeline/LSN/schema/revisions/receipt watermark, object bytes/versions, custody epoch, independent fence and protected key references. Quarantine all writers/providers; current external revocation survives restore; exact UNKNOWN reads only; measured RPO/RTO and cleanup. |
| A12 bounded result · R18–R19           | A01–A11 independently accepted for exact target/scope                                      | One internal request/receipt/staff read only. No customer delivery, issuance, contract, work completion, payment, dispatch, provider or production release authority follows.                                                                                                           |

## Owner decisions required before the next implementation proposal

- Name the accountable people and approve separation of Auth, claim, canonical
  transaction, independent fence, privilege, backup/key and recovery custody.
- Accept an exact complete writer inventory and resolve trusted installer/helper
  and privileged catalog dependencies; specify exclusions with evidence.
- Approve exact transaction/receipt/commit-watermark and independent durable ACK
  semantics, current-revocation checks and immutable legacy compatibility.
- Select and independently review the rollback-resistant fence and matched
  recovery guarantees, including failure policy, RPO/RTO and key ownership.
- Review the smallest bounded implementation proposal against all original R01–R19;
  separately authorize any subsequent exact target installation/acceptance action.

These are decision points, **not an execution approval request**. They remain open.

## Recovery and preserved sequence

Danny's newer MacBook Air is last reported unavailable. Physical supported OS/build,
FileVault, independent power/network, authenticated pairing, durable ACK, primary
loss, independent recovery, duplicate denial, revocation and cleanup remain
**NOT RUN / UNVERIFIED**. Keep the original kit and November4 quickcard ready;
do not repeat the completed25 offline checks or substitute same-machine tests.

Preserve the original P1 approval on exactly thirteen historical migrations and
its original recovery prerequisites; no duplicate P1 authorization is requested.
Customer14 and original4B/broker ownership/hash/grants/mapping/current genuine Auth
and exact-target acceptance remain separately reviewed and authorized afterward.
The reviewed restart architecture never authorized a restoration adapter.

Source baseline is C27 `5f74b8ff5385560330cb94717c17338ed0c10f44`; original broker,
Auth, request gateway, ownership, thirteen migrations, customer14/4B and all frozen
P1/Netlify/design artifacts remain unchanged. No hosted query, credential retrieval,
installation or operational test was performed for this specification.

Current primary references: [session lifecycle](https://supabase.com/docs/guides/auth/sessions),
[RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security),
[backup scope](https://supabase.com/docs/guides/platform/backups). Database backup
does not include Storage bytes or custom-role passwords; a valid access JWT can
outlive signout, so required current session/revocation checks cannot be omitted.

No merges, deployments, hosted mutations, schemas, operational persistence/restore,
financial execution, communications or dispatch. Release1.0 remains
**NOT READY / NOT AUTHORIZED**.
