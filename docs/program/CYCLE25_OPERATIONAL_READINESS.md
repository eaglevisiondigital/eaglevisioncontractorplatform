# Cycle 25 · source-specific operational readiness

**NO-GO for operational implementation.** This extends the existing nineteen
unaccepted [C24 requirements](CYCLE24_RESTART_READINESS.md), without changing their
original evidence or authorizing a restoration adapter, schema, role, credential,
transaction service or hosted test. Source basis: `31e2bf5b05f6befac1c24314a31d2eabe65c5219`.

The adjacent JSON maps eight actual operation families to their original owners,
exact source paths, transaction/receipt gaps and R01–R19 dependencies. Every
operational owner is UNASSIGNED/UNVERIFIED, acceptance NOT RUN and authority false.
Read-only navigation/history/admission are distinct from future canonical mutations.
A local source test cannot promote either kind into genuine authenticated operation.

| Operation                 | Existing owner                                                                  | Unaccepted operational boundary                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| task_correction           | Original saved-revision exercise / Phase3 time and review records               | Original issuer claim must commit before consumer; canonical correction/submission/review plus immutable receipt must share reviewed consumer transaction and exact CAS.                                          |
| material_labor_review     | Phase3Repository.reviewExpense / jobFinancials / existing workforce preparation | Pin original expense/time/review event, job lock, current reviewer and locked period before/after waits; mutation and immutable receipt require one reviewed consumer commit.                                     |
| intake_review             | Operations.assignIntake / original request-keyed one-use attempt                | Operational owner must separately design server source-CAS and atomic mutation/receipt; client fingerprint checks cannot supply transaction authority. No schema/adapter is authorized here.                      |
| published_service_history | PropertyRepository published immutable report/version reader                    | Read-only projection needs current server authority and consistent exact published source; no mutation receipt or completion record is fabricated.                                                                |
| maintenance_review        | PropertyRepository.savePlan / existing blocked review lifecycle                 | All participating writers need current plan/source/revision, purpose, consent and post-wait authority under one reviewed boundary. Review cancellation never cancels enrollment or authorizes sending.            |
| owner_priority_navigation | Original priority reader, comparison and verified source navigation             | Revalidate current source, staff and original live callback immediately before authorized navigation; navigation never grants mutation authority.                                                                 |
| offline_source_admission  | Original SyncAdmissionReview and requirement/experiment handles                 | Any future command import requires its own original canonical issuer/consumer/receipt protocol; a successful read-only comparison cannot supply that authority.                                                   |
| customer_decision_broker  | Existing customer14 / original4B gateway and broker                             | Preserve original recovery/P1-on13, then separately customer14 and exact4B/broker ownership/hash/grants/mapping/target authorization; original issuer commit and exact consumer backend/full-XID remain distinct. |

## Authority, transactions and acknowledgment

Name the real operational owners and every participating raw/admin/service writer.
Bind current principal/session/MFA, organization, membership/customer mapping and
revocation before admission, after waits, at reconciliation and after restore. Old
JWT claims or a restored client snapshot are insufficient for sensitive current
session guarantees. See [the official session model](https://supabase.com/docs/guides/auth/sessions).
No genuine session is created or tested here.

Original issuer admission commits before the canonical consumer transaction. The
reviewed canonical mutation and immutable receipt must commit together with exact
source CAS and current authority. That does not eliminate the issuer/consumer failure
window. ACK requires confirmed canonical commit, exact authenticated receipt and the
required original-custody durability. A hash or matching current row cannot attribute
an ambiguous writer. Missing/partial/lost evidence stays UNKNOWN; never replay,
rebind, relabel, replace an ID or clear a held attempt.

The native intake API returns void and has no server CAS or durable receipt. This
register identifies that gap; it does not supply a new store or retrofit a receipt.
Native plan revision CAS does not implement enrollment cancellation. Posted labor,
invoice issue, payment ledger, customer acceptance and physical completion remain
separate from internal review/documentation.

## Recovery and rollback resistance

Keep original spent-claim custody outside the rollback domain; name its independent
owner and all-writer fencing behavior. Match database timeline/schema and canonical/
receipt watermarks with object versions, original custody epoch and protected key
references. Missing/mixed/corrupt members fail closed. Storage object bytes and custom
role credential custody need separate treatment from database backup metadata, as
explained in [the official backup documentation](https://supabase.com/docs/guides/platform/backups).
No backup, key or credential is retrieved here.

Any future restoration remains fenced in quarantine, with writers, providers,
messages and money OFF. Current external revocations must survive restore. RPO/RTO
remain unmeasured. The design decision for a future finite prototype is separate
from later operational acceptance; neither is granted by this register.

## November 4 and release sequence

The owner last reported Danny's newer Air unavailable. Keep the existing quickcard,
checklist and sealed kit unchanged. Verify actual OS/FileVault, independent power/
network and human supervision before the authorized credential-free physical test.
Pairing, durable ACKs, primary loss, independent recovery, duplicate denial, revocation
and cleanup remain **UNVERIFIED / NOT RUN** until observed. Do not repeat the prior25
offline checks or primary setup. Availability alone is not recovery acceptance.

The original approved frozen P1 authorization remains valid against its exact scope
and thirteen historical migrations after its original recovery prerequisites. Pending
customer14, original4B/broker, genuine Auth/MFA and action-specific hosted recovery
have their separate sequence and approvals. NMI/settlement, Netlify, all financial/
provider/communication, deployment, merge and production gates remain closed.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
