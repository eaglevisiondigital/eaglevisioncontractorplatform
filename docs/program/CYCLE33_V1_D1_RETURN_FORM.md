# V1 D1 owner return form

**D1 only · OWNER DECISION REQUIRED · Release1.0 NOT READY / NOT AUTHORIZED.**

This is the single return form for the existing eleven roles, required separation
and installed-writer inventory. It implements no workflow and appoints nobody.
Use the [V1 scope proposal280](CYCLE33_V1_OWNER_DECISION.md), unchanged25 canonical
[feature records](../FEATURE_ACCEPTANCE_EVIDENCE.json), original
[C31 role register](CYCLE31_OPERATIONAL_OWNER_DECISIONS.json) and
[A01–A12 specification](CYCLE28_INTERNAL_REQUEST_ACCEPTANCE.md).

Copy this blank form into the approved private owner record. Complete person,
contact and exact target fields there; keep the public template unfilled.
Credentials, MFA codes, recovery keys, pairing cards and private correspondence
are not form inputs. Do not commit a completed private copy.

## 1 · owner decision and exact scope

- Accountable product owner: **UNASSIGNED**; decision date/time: **NOT SUPPLIED**.
- D1 outcome: **PENDING**. Owner chooses accept / amend / defer, with reasons.
- Proposed V1 tier boundaries: **PENDING OWNER DECISION**; retain all25 IDs,
  baseline states, original18 IDs and mandatory PhaseOne requirements. Record any
  requested scope amendment for separate review, including original MAT-001
  scanner/worker/quarantine requirements; no silent release-scope waiver.
- Exact private internal target reference: **NOT SUPPLIED**.
- Original company/customer/property/issued estimate/version/publication/hash:
  **NOT SUPPLIED**. Use exact original canonical identities, not newest records.
- Permitted request/choice/note and staff-safe read purpose: **NOT SUPPLIED**.
- Current-source inventory and reviewed candidate/hash references: **NOT SUPPLIED**.

## 2 · all eleven accountable roles

For each row return the accountable person, delegate and accepted/amended function
in the private copy. Every actual person remains **UNASSIGNED** until an explicit
owner decision is recorded and independently reviewed. Naming a role or holding a
Mac does not appoint its operator. Eleven roles do not imply eleven different people.

| Original role                                | Accountable person | Delegate   | Function accepted / amendment and private evidence reference |
| -------------------------------------------- | ------------------ | ---------- | ------------------------------------------------------------ |
| Business/source owner                        | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A01, A04                        |
| Auth/security owner                          | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A02, A07, A09                   |
| Admission operator                           | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A01, A05, A07                   |
| One-use claim custodian                      | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A05, A07, A10                   |
| Canonical transaction operator               | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A04, A05, A07                   |
| Receipt/ACK operator                         | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A05, A06, A08                   |
| Reconciliation/staff-read operator           | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A08, A09                        |
| DBA/privilege owner                          | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A01, A03, A07                   |
| Independent fence custodian                  | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A06, A10, A11                   |
| Backup/key custodian and recovery supervisor | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A10, A11                        |
| Independent reviewer                         | UNASSIGNED         | UNASSIGNED | NOT SUPPLIED; original cases A01, A12                        |

Return the function/evidence for each role from the original C31 register. In
particular identify the missing real independent fence owner and the accountable
operator for every actual writer; a code author is not an operational assignee.

## 3 · separation decision

Owner's permitted role combinations: **NOT SUPPLIED**. Prohibited combinations:
**NOT SUPPLIED**. Independent review of those combinations: **NOT SUPPLIED**.
An amendment requires a rationale and source-specific independent review.

Preserve these existing architectural conditions when choosing people:

1. The original registrar, issuer and consumer use their separately reviewed
   identities/connections and commit boundaries. A person holding multiple roles
   does not collapse registrar COMMIT → independent issuer COMMIT → atomic
   canonical request plus immutable receipt COMMIT.
2. Original one-use claim custody remains distinct from ordinary consumer use.
   Consumer rollback/savepoint/process loss cannot renew spent authority; no shared
   identity, pooled rebind or new request ID substitutes after uncertainty.
3. The independent reviewer verifies the actual candidate/target and the operators'
   evidence independently of the writer/custodian being accepted. A contributor's
   self-review cannot supply that independent acceptance.
4. Fence/spent authority and current revocation protection must survive rollback
   of the primary DB/disk. Separate labels on the same restored authority are not
   independent custody. Missing or mismatched fence evidence quarantines writers.
5. DBA, installer/provisioner and raw/admin bypass paths remain explicit members of
   the inventory. A role combination cannot conceal privilege or bypass authority.
6. Backup/key custody and supervised recovery use one reviewed matched set and an
   independent evidence review. The owner identifies key-access and recovery duties
   without placing keys or operational credentials in this form.

These conditions retain existing architecture; the form does not grant a new role,
permission, deprivileged-trust claim or operational capability.

## 4 · complete writer and reader return

Installed-target inventory: **UNVERIFIED**. Inventory-complete owner decision:
**PENDING**. Use every original category below; expand each into its actual installed
objects and operators in the private inventory. No category may be marked complete
from source fixtures or historical evidence files alone.

| Original category                      | Named accountable role/person and private inventory/evidence reference |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Registrar                              | UNASSIGNED / NOT SUPPLIED                                              |
| Issuer/claim and claim-sequence writer | UNASSIGNED / NOT SUPPLIED                                              |
| Consumer/executor                      | UNASSIGNED / NOT SUPPLIED                                              |
| Original/legacy decision entrypoints   | UNASSIGNED / NOT SUPPLIED                                              |
| Receipt and staff readers              | UNASSIGNED / NOT SUPPLIED                                              |
| Source and mapping writers             | UNASSIGNED / NOT SUPPLIED                                              |
| Definer/helper/core owners             | UNASSIGNED / NOT SUPPLIED                                              |
| Installer/provisioner/grant manager    | UNASSIGNED / NOT SUPPLIED                                              |
| Direct/raw/admin and sequence writers  | UNASSIGNED / NOT SUPPLIED                                              |
| Fence/backup/key/restore writers       | UNASSIGNED / NOT SUPPLIED                                              |

Each actual path needs its object/function/column identity, effective and default
grants, role/owner/definer and bypass capability, API exposure/RLS/composite tenant
references, participating admission/claim/consumer/read boundary, current-session
and revocation checks, concurrency/receipt behavior, custody/fence dependence and
quarantine responsibility. Enumerate helper/core CREATE/catalog/statistics and
legacy/raw/admin/sequence/restore paths. An unidentified writer keeps D1 incomplete.
This is an evidence request, not permission to inspect a hosted target or change grants.

## 5 · readiness evidence attached to the decision

| Original requirement                                                                                          | Private evidence reference / accountable role | State      |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| Genuine current customer session and mapping; staff AAL2/current membership; tenant/customer denials          | NOT SUPPLIED                                  | UNVERIFIED |
| Exact installed API exposure, grants/default grants, RLS, composite tenant references and every bypass writer | NOT SUPPLIED                                  | UNVERIFIED |
| Original admission/issuer identity and separate connection/commit participation                               | NOT SUPPLIED                                  | UNVERIFIED |
| Atomic canonical request/receipt and final current-authorization checks                                       | NOT SUPPLIED                                  | UNVERIFIED |
| Independently durable custody before ACK; exact original UNKNOWN read; no replay/replacement                  | NOT SUPPLIED                                  | UNVERIFIED |
| Rollback-independent spent authority/current external revocation; all-writer quarantine                       | NOT SUPPLIED                                  | UNVERIFIED |
| Matched DB/object/receipt/custody/key references, independent recovery and supervised cleanup                 | NOT SUPPLIED                                  | UNVERIFIED |
| Independent reviewer verifies exact private target, candidate and completeness                                | NOT SUPPLIED                                  | UNVERIFIED |

Public vendor references checked November6 support reviewing current session,
privilege and backup dependencies, not certify this target: a signed token needs
current-session evidence for this slice ([sessions](https://supabase.com/docs/guides/auth/sessions));
user-editable metadata cannot supply authorization ([RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)).
Review API object exposure and grants separately from row policies
([API security](https://supabase.com/docs/guides/api/securing-your-api),
[exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)).
Database backups exclude Storage object bytes; daily backups omit custom-role
passwords. Matched recovery needs its original separate dependencies
([backup scope](https://supabase.com/docs/guides/platform/backups)).
No project configuration, privilege or credential is read or changed by this form.

## 6 · disposition and separately retained decisions

Owner D1 decision/signoff reference: **NOT SUPPLIED**. Independent reviewer:
**UNASSIGNED**. Missing/contested answers and next responsible role: **NOT SUPPLIED**.
Keep D1 unresolved if a role, target, writer or separation requirement is incomplete.

- **D2 remains OWNER_DECISION_REQUIRED:** original three commits, immutable receipt,
  current authorization, independent durable ACK/fence and exact UNKNOWN
  reconciliation require their separate reviewed decision.
- **D3 remains OWNER_DECISION_REQUIRED:** matched backup/key/custody, independent
  rollback protection, current revocation, writer quarantine, RPO/RTO and cleanup
  require their separate reviewed decision.
- All **A01–A12 remain NOT_RUN**. D1 evidence prepares A01–A04 and ownership across
  the remaining cases; D2 prepares A05–A09, D3 prepares A10–A11, and A12 requires
  actual independent acceptance of its original predecessors. This grouping does
  not replace the original per-case requirements or overlap/ownership mapping.

The smallest later acceptance path stays: exact genuine internal customer request
and current authorization → registrar COMMIT → independent issuer COMMIT → atomic
canonical request/immutable receipt COMMIT → independently durable ACK → currently
authorized staff read. Exercise negative/concurrency/UNKNOWN, rollback and matched
recovery cases only within their separately reviewed acceptance scope. Absence of
an ACK/receipt retains UNKNOWN; it never permits replay, rebind or replacement.

Preserve the original recovery → approved frozen P1-on13 → separately reviewed
customer14 → original4B/broker/Auth/grants/mapping/target sequence. Existing P1
approval stays valid; no duplicate P1 authorization is requested. D1/D2/D3 decisions
prepare the next exact implementation review and do not authorize an operational
adapter, schema installation, hosted test or release.

## Recovery evidence retained

The November4 result remains **OWNER-WITNESSED MAIN SYNTHETIC LOSS SCENARIO PASS**
only. Duplicate recovery remains **UNKNOWN/UNVERIFIED**; both private run folders
and consumed-attempt custody remain untouched. The next original recovery step is
to obtain and independently review the already-requested sanitized duplicate outcome.
After that exact result is reviewed, prepare only missing original permitted cases
with distinct fresh attempts, current device/operator prerequisites and the existing
[case register](CYCLE33_PHYSICAL_CASE_STATUS.md)/[quickcard](CYCLE19_NOV4_RECOVERY_QUICKCARD.md).
Do not repeat the successful main scenario or25 completed offline checks. Full R0,
independent engineering witness, hosted recovery, genuine Auth/MFA and production
durability remain unaccepted. Older unavailable-device entries remain historical.

No merge, deploy, hosted mutation, credentials, operational restoration, payment,
provider activation, customer communication or dispatch. All original branding,
design, migration, financial and production gates remain in force.

## Proposed role combinations for the D1 decision

These are conditional responsibility recommendations for the private owner return,
not appointments, accepted combinations or operational authorization. Every person
and delegate in the original eleven-role table remains UNASSIGNED. Retain all
original identities, connection/commit boundaries and evidence obligations above.

| Proposed human-duty combination                                                 | Conditions for separate owner and independent review                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Business/source owner plus admission or read-only reconciliation responsibility | Current tenant/customer authorization, exact original source and staff AAL2 remain enforced. A human combination grants no new writer privilege or self-approval of missing customer evidence.                                       |
| Canonical transaction supervision plus receipt/ACK operations                   | Canonical request and receipt remain atomic; independently durable ACK, one-use custody and exact UNKNOWN reads are separately proved. The operator cannot acknowledge success from primary-only or uncertain evidence.              |
| DBA/privilege accountability plus installer/provisioner responsibility          | Every definer/helper/core/raw/admin/default-grant/sequence/restore path and its effective privileges remains inventoried. This combines accountable supervision only, not least-privilege evidence or separate execution identities. |
| Backup/key custody plus recovery supervision                                    | This is already one original role. Matched recovery sets, current revocation/fence checks, independent acceptance and key-access duties remain mandatory.                                                                            |

The independent reviewer must be independent of the writer, installer or custodian
whose evidence is being accepted. The primary database/restore operator must not
control the sole external spent-authority fence or supply the sole independent
recovery acceptance. Separate names on the same rolled-back authority are not an
independent fence. Registrar, issuer and consumer remain separate reviewed
identities/connections with their original commits even if an owner proposes a
human role combination. Missing independent custody or any unidentified writer
keeps D1 incomplete. These recommendations do not amend D2/D3 or run A01–A12.
