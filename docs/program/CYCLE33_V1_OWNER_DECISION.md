# Propel V1 owner decision proposal

Source: Main draft #279, `038b64acad56e436a016905dfec87aef86dcfbc8`; existing
[scope matrix](CYCLE33_V1_SCOPE_MATRIX.md), all25 canonical feature records, D1–D3 and A01–A12.
**PROPOSAL ONLY. Release 1.0 remains NOT READY / NOT AUTHORIZED.**

Local implementation, source corrections and CI evidence do not establish genuine
operational acceptance. The existing baseline feature states, original18 IDs and
mandatory Phase One requirements remain unchanged. All A01–A12 genuine operational
acceptance cases remain **NOT_RUN**.

## Decision 1 · confirm the pilot scope

Keep these **Essential** controls and contractor workflows in V1. A smaller
operational acceptance slice does not waive them.

| Existing records                   | Essential scope                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001, SEC-002, PLT-001          | Current tenant/customer authorization, staff MFA, organization roles, independent containment and no replay.                                                                                    |
| CRM-001, EST-001, EST-002, SAL-001 | Customer inquiry and exact selection, immutable estimate/scope continuity, original request/receipt/staff-read controls and agreement preparation.                                              |
| FLD-001, FLD-002, JOB-001, WRK-001 | Original jobs/work orders, scheduling and technician task/time review, source custody and documented service evidence.                                                                          |
| FIN-001, FIN-002                   | Canonical cost completeness, profitability, financial exceptions, invoice requirements and reconciliation. NMI/settlement acceptance remains mandatory; no live financial authority is granted. |
| CUS-001, GRO-001, COM-001          | Private service history, manual maintenance/renewal planning and current consent/suppression/cancellation safety. No customer acceptance, physical completion or sending is inferred.           |
| UX-001, OPS-001, DOC-001, QA-001   | Approved branding/design, three-brand responsive accessibility, private document/quarantine controls, protected runtime and complete source-specific acceptance evidence.                       |

Keep these **Optional** improvements separate from mandatory release acceptance:
CUS-002 expanded Passport/warranty/Proof of Work; MAT-001 automated material import;
AI-001 read-only Copilot and reviewed Voice-to-Estimate; INT-001 integration contracts
and export review. Optional overlays within FLD-002, FIN-002 and GRO-001 include
offline comparison, accounting/procurement assistance and paid service packages.
Their underlying essential safety and manual workflows stay Essential. The matrix’s
MAT-001 optional-automation label does not waive original Phase3 Smart Material
Import requirements or scanner/worker/quarantine acceptance. The owner must reconcile
any proposed deferral with the original Release1.0 checklist; this proposal removes
no required module or release blocker. Enabling an
optional capability still requires its own complete acceptance and approvals.

Keep **Post-Launch operational execution** separate: GRO-002 automated follow-ups,
referrals/reputation campaigns; COM-001 outbound workers; AI-001 operational
receptionist/Storm actions; INT-001 external accounting/supplier/calendar/telephony
writes, live offline synchronization and Contractor Network operations. Booking
review remains in CRM/Sales; this proposal grants no live booking, dispatch,
contract execution, provider activation, messaging, payment or renewal authority.

Owner response: accept or amend the proposed tier boundaries, including the MAT-001
clarification, and record any scope exception for separate review. No scope decision
is assumed from publishing this draft.

## Decision 2 · complete D1 with actual people

Return the accountable person, delegate and accepted/amended responsibility for
each existing role. Every actual person currently remains **UNASSIGNED**. Supply person/delegate and
role-combination decisions privately; the public proposal retains role names only:

| Existing accountable role                    | Actual person |
| -------------------------------------------- | ------------- |
| Business/source owner                        | UNASSIGNED    |
| Auth/security owner                          | UNASSIGNED    |
| Admission operator                           | UNASSIGNED    |
| One-use claim custodian                      | UNASSIGNED    |
| Canonical transaction operator               | UNASSIGNED    |
| Receipt/ACK operator                         | UNASSIGNED    |
| Reconciliation/staff-read operator           | UNASSIGNED    |
| DBA/privilege owner                          | UNASSIGNED    |
| Independent fence custodian                  | UNASSIGNED    |
| Backup/key custodian and recovery supervisor | UNASSIGNED    |
| Independent reviewer                         | UNASSIGNED    |

Eleven roles do not imply eleven distinct people. Explicitly approve permitted and
prohibited combinations while preserving registrar/issuer/consumer commit and
connection separation, independent review and rollback-independent fence custody.
Do not assign a developer, reviewer or device holder by inference.

D1 also needs one exact private internal target and a complete inventory of actual
installed writers and bypass paths, with accountable operators, effective grants,
RLS/composite tenant references and current authorization participation. Keep
private identities, targets, contacts, keys and credentials outside public Git.

## D2 and D3 · separate owner decisions

**D2:** Named owners review original admission COMMIT → independent issuer COMMIT →
atomic canonical request plus immutable receipt COMMIT; original one-use custody,
current Auth/MFA/session/mapping, final revocation checks, independently durable ACK
and exact UNKNOWN reconciliation. No missing ACK permits replay or replacement.

**D3:** Named fence/backup/key/recovery owners and independent reviewer select the
matched DB/object/receipt/custody/key set, rollback-resistant spent authority,
writer quarantine, current revocation, RPO/RTO and supervised cleanup evidence.
Historical receipt files are not business-state restoration. No operational
adapter, schema installation or hosted test is authorized by a design decision.

## Smallest genuine acceptance sequence · not authorized or run

Use the original [A01–A12 specification](CYCLE28_INTERNAL_REQUEST_ACCEPTANCE.md)
after its original recovery/P1/customer14/4B prerequisites and separate exact approval:

1. Bind one real internal company/customer/property/publication/version/hash and current genuine customer session/mapping; verify staff AAL2, current membership and negative tenant/privilege cases.
2. Commit original server admission, then the independent issuer’s original one-use claim with exact backend/full-XID and source identity.
3. Commit the canonical request and immutable receipt atomically, retaining final current-authorization and concurrency checks.
4. Establish independently durable custody before ACK. A missing or ambiguous ACK remains UNKNOWN; reconcile only the exact original receipt, without replacement or replay.
5. Read the customer-safe projection through currently authorized staff; demonstrate denial after revocation and for another tenant.
6. Separately exercise the approved rollback-fence, matched backup/recovery and writer-quarantine cases, then bounded cleanup and independent verification. Keep each A-case NOT_RUN until actual evidence is accepted.

D1–D3 preparation can advance alongside local engineering. None of these steps is
implemented, activated or accepted by this proposal.

## Eight release gates remain mandatory

1. Original independent recovery and containment prerequisites. Preserve the
   November4 owner-witnessed main synthetic network-loss PASS only. Full R0,
   independent engineering witness and genuine hosted durability remain open;
   duplicate recovery is UNKNOWN/UNVERIFIED, both private folders retained.
2. Original approved frozen P1 operation on exactly13 historical migrations, after
   its original prerequisites. Existing approval remains valid; no duplicate
   approval or altered operation is proposed.
3. Separately reviewed and authorized customer14 acceptance.
4. Original4B/broker operational ownership, custody, exact hashes/grants/mapping
   and target acceptance in the preserved sequence.
5. Genuine current Auth/MFA, tenant/customer isolation and revocation acceptance.
6. Separate NMI/financial/provider and merchant-settlement acceptance.
7. Netlify/runtime protection and independently reviewed operational preflight.
8. Complete applicable security, design, CI and production-readiness evidence,
   followed by explicit production release authorization.

**Next practical milestone:** an owner-completed D1 return, independent D2/D3
review, then a separately authorized implementation review for the existing
smallest slice: genuine internal customer request → immutable receipt → currently
authorized staff read. Follow the original recovery/P1/customer14/4B sequence.
Continue independent safe local engineering while those gates remain open.

No merge, deployment, hosted mutation, credential retrieval, operational
restoration, live payment, communication or dispatch is authorized by this proposal.
