# First pilot · owner decision front sheet

**PROPOSAL ONLY. No genuine operational command is currently permitted.**
Source baseline: draft302 `523afd4ef17d5502b6e0e39a4df86bdaa7bba23b`.
Use the unchanged [first-pilot plan](V1_FIRST_PILOT_ACCEPTANCE.md), original
[D1 return form](CYCLE33_V1_D1_RETURN_FORM.md), [A01–A12](CYCLE28_INTERNAL_REQUEST_ACCEPTANCE.md)
and reviewed owner/writer/R01–R19 records. This front sheet creates no second form,
receipt format, writer, store, role assignment or implementation authorization.
All25 feature IDs and proposed Essential/Optional/Post-Launch boundaries remain.

## Decision to return now: D1

**Recommended first command candidate:** the original review-only
`CustomerRequestBroker.submit` with `choice: request_changes_review`, an explicit
customer explanation, `acknowledgment: review-only-v2` and deliberate confirmation.
The original validator trims the note, requires nonempty valid text and limits it
to2000 Unicode code points. No body, target IDs, bearer, private key or runnable
operation is supplied here. Owner may accept, amend or defer this candidate.

**Proposed actor:** an explicitly designated internal test customer identity with
genuine current SDK-verified session and the original customer assurance policy,
currently mapped to the exact original company/customer/property/publication.
The accountable person and account are **UNASSIGNED / NOT SUPPLIED**. Staff cannot
impersonate that customer. A different currently eligible staff identity uses
`CustomerRequestBroker.staffQueue` with original staff AAL2/current membership.

**Canonical source owner:** original customer14 publication and original4B private
decision ledger. Broker `server/customer/broker.ts` composes existing registrar,
`runCustomerRequestTransaction` in `server/customer/request-gateway.ts`, issuer,
canonical request/immutable receipt and dedicated staff reader. SQL participants
are the original `private.customer_broker_admit`, `private.customer_request_claim`,
`private.customer_record_review_request` and `private.customer_broker_staff_read`.
Existing proposal/disposable fixtures are not installed operational authority.

**Boundary requiring owner choice:** ordinary `Operations.assignIntake` has no
accepted immutable receipt. Its staff inquiry path cannot be substituted for this
published-estimate customer-review command. If initial staff intake needs its own
receipt, stop for a separate source/writer/transaction proposal within D1/D2.
Missing inquiry→estimate/job provenance remains UNKNOWN; selection, notes or matching
property do not create the relationship. A review request is not agreement execution,
customer approval, invoice issuance, physical completion or payment.

Return privately in the existing D1 form: chosen original command/actor/source,
exact original issued version/publication/hash, named people/delegates, separation
decisions, every installed writer and private evidence references. D1 stays PENDING
until owner decision and independent completeness review; no person is appointed here.

## Eleven accountable roles · all people remain UNASSIGNED

| Original role                                | Exact decision/evidence responsibility                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Business/source owner                        | Choose exact internal source, permitted review request and purpose; resolve intake-versus-publication ownership.      |
| Auth/security owner                          | Genuine current customer assurance/mapping and separately staff AAL2; revocation/session/member/tenant denials.       |
| Admission operator                           | Original server-derived identity/source command; independent registrar COMMIT before claim.                           |
| One-use claim custodian                      | Dedicated issuer and original consumer backend/full-XID; spent authority never renewed by rollback/regrant.           |
| Canonical transaction operator               | Original locks/CAS/post-wait checks; canonical request and immutable receipt commit together.                         |
| Receipt/ACK operator                         | Exact original receipt validation and independent durability before success acknowledgment.                           |
| Reconciliation/staff-read operator           | Current authorized exact original receipt/queue read; absence remains UNKNOWN, no replay/new ID.                      |
| DBA/privilege owner                          | Complete installed owners/grants/default grants/RLS/composite keys/indexes/private exposure and bypass inventory.     |
| Independent fence custodian                  | Name the missing real rollback-independent spent-authority/current-revocation owner and quarantine responsibility.    |
| Backup/key custodian and recovery supervisor | Matched backup/object/receipt/custody/key references, current revocation, RPO/RTO and supervised cleanup.             |
| Independent reviewer                         | Independently accept exact source/target, people/writers/separation and genuine evidence, never self-certify writers. |

Conditional human combinations remain proposals in the single D1 form. Business
ownership may combine with admission/read-only reconciliation under exact current
authority; transaction supervision with ACK supervision only if independent durability
is proved; DBA with installer accountability only with full bypass inventory. Existing
backup/key/recovery supervision is one role. Registrar/issuer/consumer identities,
connections and three commits remain distinct regardless of people. The sole primary
DB/restore operator cannot control the sole external fence or accept their own recovery
proof. Reviewer independence and original one-use custody cannot be combined away.

## Every writer and possible bypass must be returned

Source-level inventory categories are known; the actual installed target remains
UNVERIFIED. Expand each category into exact objects/columns/functions, owners,
effective/default privileges, API/RLS/composite tenant references, transaction and
custody participation, current revocation, bypass capability and accountable person:

1. Registrar/admission; dedicated issuer/claim and sequence; consumer/executor.
2. Original/legacy decision entrypoints, including immutable legacy-v1 compatibility.
3. Receipt/queue/status readers and any privileged helper they invoke.
4. Publication/source/customer mapping and membership/session writers.
5. Definer/helper/core owners, CREATE/catalog/statistics authority, installers,
   provisioners and grant managers.
6. Direct/raw/admin/service-role, sequence, trigger/constraint or owner bypasses.
7. Fence/spent-authority/epoch, backup/key, restore and writer-quarantine operators.

Missing writer or unknown bypass is NO-GO. Source fixtures do not prove installed
least privilege or all-writer participation. This list grants no hosted inspection,
credential access, SQL, grant or operational activation permission.

## D2 and D3 stay separate decisions before implementation

**D2:** accept the original registrar COMMIT → independent issuer COMMIT → atomic
canonical request/immutable receipt COMMIT, original identity/lock/CAS/current-auth
checks, exact receipt fields and independently durable ACK. Choose accountable
real participants and acceptance evidence. Lost, incomplete or contradictory ACK
remains UNKNOWN; only current-authorized original read reconciliation, no retry,
replacement ID, rebind or historical evidence-file restoration.

**D3:** choose the independently controlled rollback-resistant spent-authority fence,
current revocation and all-writer quarantine policy; matched DB timeline/schema/LSN,
object versions, receipt watermark, custody epoch, fence and protected key references;
independent recovery, measured RPO/RTO and cleanup. Primary-only restored records
cannot prove independent custody. D1–D3 decisions prepare an exact implementation
review; they do not authorize an adapter, schema, hosted test or deployment.

## Exact future acceptance sequence · A01–A12 all NOT_RUN

| Original case              | Required future evidence / stop condition                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A01 scope/owners           | Fixed target/source, real roles, complete writer inventory and independent boundary signoff. Missing answers stop.          |
| A02 genuine identity       | Current customer session/mapping and staff AAL2; wrong tenant/property/metadata/stale/revoked identity denied.              |
| A03 catalog/privileges     | Original private/API/grants/default grants/RLS/composite keys and negative bypass evidence.                                 |
| A04 original source        | Exact original estimate/version/publication/hash/request/choice/note; no latest or neighboring substitution.                |
| A05 atomic receipt         | Original three commits; canonical request/receipt atomicity, original backend/full-XID and spent custody survive failure.   |
| A06 ACK durability         | Success only after required canonical and independent durability; lost ACK/process interruption UNKNOWN.                    |
| A07 concurrency/revocation | At most one execution; current checks after wait/before commit; denied competitor never gains replacement authority.        |
| A08 exact reconciliation   | Retained original IDs/current authorization find exact original receipt or retain UNKNOWN, never mutate/replay.             |
| A09 staff projection       | Exact safe request/source provenance; current revocation and tenant/customer/privacy denials.                               |
| A10 rollback resistance    | Rollback/savepoint/old DB/disk/restart never revive spent authority; fence mismatch/unavailable quarantines writers.        |
| A11 matched recovery       | Matched original backup/custody/object/key set, current external revocation, independent recovery/RPO/RTO/cleanup.          |
| A12 bounded result         | A01–A11 genuinely independently accepted for exact scope; only one internal request/receipt/staff read, no wider authority. |

Preserve recovery → approved frozen P1-on13 → separately reviewed customer14 →
original4B/broker ownership/hash/grants/mapping/target/Auth sequencing. No duplicate
P1 approval request, fixture recreation or broader customer lifecycle acceptance.
Further estimate/job/field/cost/history transitions use the first-pilot plan and
their own exact records; missing relationship/approval/completion remains UNKNOWN.

## Remaining physical preparation · no scenario launched

November4 remains **OWNER-WITNESSED MAIN SYNTHETIC LOSS SCENARIO PASS** only.
Duplicate recovery remains **UNKNOWN/UNVERIFIED**; both private folders and consumed
attempts are untouched. The next original physical step is obtaining the already
requested sanitized duplicate outcome and independent review, not another attempt.
Prepare the original [seven-case register](CYCLE33_PHYSICAL_CASE_STATUS.md) and
[quickcard](CYCLE19_NOV4_RECOVERY_QUICKCARD.md); preserve kit/hashes and prior UNKNOWNs.
After the exact outcome is resolved, verify current device/operator/OS/FileVault/
power/network prerequisites and use only originally permitted distinct fresh cases.
Tamper/wrong-run, ACK/custody, presence expiry, other primary-loss interfaces,
backup-only restart, duplicate denial and cleanup/independent witness remain open.
Do not invent a named wrong-peer scenario, replay consumed identity or repeat the
successful main run/105 historical synthetic recovery tests/25 offline checks.
Genuine hosted recovery, Auth/MFA, rollback resistance, matched backup and NMI remain
separate. No merge, deployment, hosted mutation, payment, invoice issuance, live
communication, dispatch or operational restoration. **Release1.0 NOT READY / NOT AUTHORIZED.**
