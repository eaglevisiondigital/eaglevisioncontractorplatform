# First V1 pilot acceptance path

**Decision proposal only. Release1.0 NOT READY / NOT AUTHORIZED.**

Source baseline: draft299, `2d93b629d746f530ed1e3268631ca72d1651e85f`.
The existing [25-feature dashboard](CYCLE33_V1_UNIFIED_ACCEPTANCE.md) and
[Essential / Optional / Post-Launch proposal](CYCLE33_V1_SCOPE_MATRIX.md) retain
their original IDs, baseline statuses and mandatory PhaseOne gates. Local code,
hosted CI and genuine operational acceptance are three different evidence classes.
No tier proposal, role assignment, hosted implementation or release is approved here.

## Resolve the first receipt boundary before implementation

The requested everyday journey starts with genuine authenticated staff reviewing
an authorized inquiry. That is a useful pilot objective, but the existing sources
do not supply an accepted immutable intake receipt or an inferred inquiry/job link:

- `Operations.listIntake` and `assignIntake` in `src/lib/operations.ts` own the
  existing intake read/assignment paths. The assignment API returns no immutable
  transaction receipt. A local assignment or selected customer is not durable ACK.
- The original `CustomerRequestBroker` in `server/customer/broker.ts` accepts
  customer review choices against an exact published estimate. It is not ordinary
  staff intake, and staff must not impersonate a customer to obtain its receipt.
- `runCustomerRequestTransaction` in `server/customer/request-gateway.ts` is a
  separately controlled disposable-PG17 proposal. Its registrar/issuer/consumer
  boundaries and staff reader do not constitute an operational factory or grant.
- No canonical inquiry-to-estimate/job relationship may be inferred from a matching
  property, selected row, note, date or browser path. Missing provenance stays UNKNOWN.

**Next owner choice:** in the single [D1 return form](CYCLE33_V1_D1_RETURN_FORM.md),
identify the exact original command family, original source owner and permitted
actor for the first genuine slice. The smallest already specified slice remains
**genuine internal customer review request → immutable receipt → currently
authorized staff read**, under the original [A01–A12 specification](CYCLE28_INTERNAL_REQUEST_ACCEPTANCE.md).
If initial staff intake must have a new receipt contract, its owner/writer and
transaction requirements need separate source-specific review within D1/D2 before
implementation. This document supplies neither that contract nor another store.

## Smallest sequence and stop points

All steps below are future acceptance requirements. None is RUN by this proposal.
Use exact existing company, customer, property, source/version and job identifiers;
unavailable identities or approvals stop the transition rather than selecting a
newest or nearby record. The original twelve cases retain their original meanings.

| Stage                           | Existing canonical owner / missing requirement                                                                                                        | Accountable operational role; evidence and acceptance test                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genuine staff entry             | Existing identity/current membership contracts; operational Auth/MFA and current-session validation unaccepted                                        | Auth/security owner: genuine eligible staff AAL2 and current organization membership; deny wrong tenant, revoked session/member and forged metadata. Original A02/A09 cover the first slice; broader staff entry needs its own accepted evidence.                                             |
| Authorized inquiry              | Existing Operations intake and CRM records; installed writer inventory and exact permitted intake target unverified                                   | Business/source owner, DBA/privilege owner: identify actual intake source/reader/writer and grants/RLS; deny foreign organization and unauthorized assignment. Local sample input is not genuine intake evidence.                                                                             |
| Original request receipt        | Original customer14/4B/broker customer-review command, not ordinary intake; genuine issuer/custody/atomic ACK missing                                 | Admission, one-use claim, transaction and receipt/ACK operators: original registrar COMMIT → independent issuer COMMIT → canonical request plus immutable receipt COMMIT. A01–A08; ambiguous acknowledgment stays UNKNOWN.                                                                    |
| Authorized staff read           | Original broker receipt/staff reader; current genuine authorization and installed least privilege missing                                             | Reconciliation/staff-read and Auth/security owners: A08/A09 exact original receipt/source read, current revocation and safe projection. No retry, replacement ID or replay after UNKNOWN.                                                                                                     |
| Customer / estimate progression | Existing CRM and Phase3 estimate engines; exact inquiry relationship and genuine accepted scope may be absent                                         | Business/source owner: retain original identities and immutable issued version; test stale scope, missing link and cross-tenant denial. Missing canonical link is UNKNOWN; staff preference is not customer agreement. This is beyond A01–A12's narrow request/read acceptance.               |
| Agreement / job                 | Existing immutable issued estimate and job baseline; genuine agreement approval and authorized job transition unaccepted                              | Business/source and canonical transaction owners: verify exact approved scope/version and original job authority. No inferred agreement from an internal review result; no duplicate job or scope replacement.                                                                                |
| Schedule / field activity       | Existing work orders, crew proposals, task custody, inspections and Proof of Work; operational writer, durable receipts and physical evidence missing | Canonical transaction, one-use claim and reconciliation operators: original revision/CAS, concurrency, expiration/revocation and exact receipt tests. Date-only hours remain UNKNOWN; a schedule or documentation never proves work was performed. No live dispatch.                          |
| Time / materials / cost review  | Existing workforce, materials and canonical job financial records; genuine recording/review provenance and completeness missing                       | Business/source and transaction owners: retained exact labor/material sources, no duplicate labor posting, current cost coverage and explicit missing-cost warnings. Cost review is not ledger mutation, settlement, invoice issuance or payment. NMI and financial acceptance stay separate. |
| Safe service history            | Existing published inspection/report and Property Passport readers; exact request/job/report continuity and verified completion may be missing        | Business/source, Auth/security and staff-read owners: published-version/finding identity, current revocation, allowlisted projections and wrong-customer/tenant denials. Published documentation is not customer approval or verified physical completion.                                    |
| Maintenance / next job          | Existing plan, renewal and consent engines; genuine purpose-specific consent, suppression and canonical continuity unaccepted                         | Business/source and Auth/security owners: exact plan revision/current consent, revocation/cancellation/suppression races and UNKNOWN source handling. Eligibility never sends, renews, books, charges or creates an inferred next job.                                                        |
| Independent acceptance          | Existing source and original R01–R19/eight-family register; real role decisions, all writers and operational evidence incomplete                      | Independent reviewer, fence custodian and recovery supervisor: A10–A12 only after original predecessors, independently rollback-resistant custody/current revocation and matched recovery. A local result or historical file cannot restore canonical business state.                         |

## Eleven-role decision and implementation prerequisites

Use the existing D1 form once; all eleven actual people/delegates remain
**UNASSIGNED**. It already lists the business/source, Auth/security, admission,
one-use claim, transaction, receipt/ACK, reconciliation/staff-read, DBA/privilege,
independent fence, backup/key/recovery and independent reviewer responsibilities.
Conditional combinations of human duties require explicit owner and independent
review. They never combine registrar/issuer/consumer identities or three commits,
make primary-only custody independent, or allow a writer to accept their own proof.

Before an implementation review can be accepted, D1 must return the exact original
target/actor/source, named accountable people and every installed writer, including
legacy/raw/admin/sequence/definer/installer/restore bypasses. **D2** separately decides
transaction, immutable receipt, durable ACK and exact UNKNOWN custody. **D3** separately
decides independent rollback protection, matched backup, current revocation and
recovery. All **A01–A12 remain NOT_RUN**. Source review does not authorize an adapter,
schema, credentials, hosted test, genuine Auth route or connected activation.

The original sequence remains recovery → valid approved frozen P1-on13 → separately
reviewed customer14 → original4B/broker ownership/hash/grants/mapping/target/Auth.
Do not request duplicate P1 approval. Broader contractor progression needs its own
source-specific operational acceptance after the first slice; twelve-case receipt
acceptance alone does not authorize the entire journey.

Official public documentation checked November7 supports the prerequisite review:
access tokens can outlive sign-out, so a valid JWT alone does not prove current
session authority ([sessions](https://supabase.com/docs/guides/auth/sessions)).
Review API grants/object exposure separately from row policies
([API security](https://supabase.com/docs/guides/api/securing-your-api)). Database
backups exclude Storage object bytes and daily backups exclude custom-role
passwords; original matched recovery requirements therefore remain separate
([backup scope](https://supabase.com/docs/guides/platform/backups)). The current CLI
and TLS changelog was reviewed without updating pinned dependencies or inspecting
a hosted target. Vendor documentation does not certify this installation.

## Evidence and next practical milestone

At exact299, both hosted573 native/27 browser-OFF collections,63 screenshot/source
pairs and2139 source hashes retain their original evidence. Foundation is CANCELLED
in both events; the completed dedicated scopes do not become full Foundation PASS.
The separate [coverage ledger](V1_FOUNDATION_COVERAGE_GAPS.md) distinguishes missing
complete unit collection, downstream commands, native PG mode and browser budgets.
New author corrections and successor checks require their own exact source evidence.

The November4 result remains **OWNER-WITNESSED MAIN SYNTHETIC LOSS SCENARIO PASS**
only. Duplicate recovery remains **UNKNOWN/UNVERIFIED**; both private run folders
and the consumed uncertain attempt are untouched. Obtain and independently review
the already requested sanitized outcome; then prepare only remaining original
permitted physical cases with distinct fresh attempts and current prerequisites.
Do not repeat the successful main case or25 offline checks. Full seven-case R0,
engineering witness, genuine hosted recovery, rollback resistance and durability
remain unaccepted.

**Next smallest safe pilot milestone:** owner returns the existing D1 form, including
the command-family distinction above and eleven real accountable role decisions;
an independent reviewer checks writer completeness and separation. Prepare D2/D3
and original A01–A12 implementation prerequisites for separate exact authorization.
Continue independently safe local product work while those decisions are pending.
No operational release blocker is closed by this plan or its two local guard fixes.

No merges, deployments, hosted mutations, operational restoration, live financial
actions, messages or dispatch. Preserve original design, branding, migration,
recovery, customer14/4B, MFA/Auth, NMI, Netlify and production gates.
