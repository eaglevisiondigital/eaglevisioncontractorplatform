# Cycle 26 — operational owner and writer responsibility matrix

Design review only, bound to Cycle 25 `af95671f70bae6585b39e299ba00ca201f8e6512`. This is not an implementation, schema, restore-adapter or hosted-action authorization. All eight operational accountable owners remain **UNASSIGNED OR UNVERIFIED**. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

The JSON companion retains each original R01–R19 record, all eight original operation families and exact source hashes. Local code owners are identified below; they are not assignments of real operational custody. No person, including Danny, has been appointed an operational owner by this register.

| Family                    | Existing original owner / writer or reader                                                                          | Missing operational responsibility and evidence                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| task_correction           | saved-revision-exercise original task/time custody; Phase3Repository.recordTime/submitTime/reviewTime and assignJob | Phase3 time/review RPCs are existing record owners. Durable operational work-order/task revision owner and original admission/receipt protocol remain missing; field-lab is not that owner.                                                                        |
| material_labor_review     | Phase3Repository.reviewExpense, recordPurchasedMaterials, reviewTime; canonical jobFinancials                       | Separate expense/material, labor/time and period-lock owners; approved labor may remain unposted. No new ledger or financial execution owner is created.                                                                                                           |
| intake_review             | Operations.assignIntake; private/public assign_intake RPC                                                           | Existing writer returns void. No authenticated writer-attributed durable receipt or server source-CAS in this contract. Operations.saveCustomer/saveLocation/recordConsent are distinct writers to inventory.                                                      |
| published_service_history | PropertyRepository exact published report/version reader; service-source-review; issued-only customer review        | Read-only family: no mutation receipt fabricated. Publication/inspection writers remain separate reviewed owners; documentation is not physical completion or customer acceptance.                                                                                 |
| maintenance_review        | PropertyRepository.savePlan original revision CAS; original plan-cancellation-review lifecycle                      | Plan writer, review lifecycle and purpose-specific consent/suppression/enrollment writers are distinct. Native plan/enrollment cancellation is UNSUPPORTED; review cancellation does not send or cancel enrollment.                                                |
| owner_priority_navigation | priority-actions and verified-owner-briefing original authorized source projection/navigation                       | Read-only family: no autonomous action owner, receipt or AI completion. Authoritative sources and original workflow-state readers retain ownership.                                                                                                                |
| offline_source_admission  | offline-source-admission/protocol original stateless comparison and requirement readers                             | Read-only family: no synchronization queue, writer, restore adapter, replay, renewal or durable claim. Captures/historical evidence do not restore canonical state.                                                                                                |
| customer_decision_broker  | Original customer14 / 4B SDK; CustomerRequestBroker.submit/reconcile/staffQueue; runCustomerRequestTransaction      | Only proposed disposable 4B ownership: NOLOGIN core/admission/reader owners; registrar/reader and finite issuer/executor pairs. Historical definer/helper/installer, core CREATE and pg_read_all_stats remain TCB gaps; no operational grants/activation accepted. |

## Responsibility split

| Responsibility          | Required accountable scope; all operational assignees unverified                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| business_owner          | Accountable tenant/domain operator for exact business record; operational assignee and acceptance remain UNASSIGNED_OR_UNVERIFIED.                                  |
| authorization_owner     | Genuine Auth/session/mapping/membership/MFA owner; server-current checks before admission, after waits and after quarantine; never browser selection or metadata.   |
| admission_owner         | Separately committed original one-use registrar/issuer; source/tenant/actor/command binding and external spent-claim fence survive consumer rollback.               |
| transaction_owner       | Existing canonical consumer writer; mutation and exact immutable receipt share reviewed transaction/CAS; no second business store.                                  |
| receipt_owner           | Append-only unique exact receipt custodian; authenticated issuer/key/witness and commit watermark; hash/count/timestamp alone insufficient.                         |
| ack_owner               | Supervised request broker; success only after canonical commit, receipt validation and required custody durability; lost ACK remains UNKNOWN.                       |
| reconciliation_owner    | Current-authorized read-only exact command/source/receipt reader; no replay/rebind/newest/replacement ID.                                                           |
| database_security_owner | Reviewed installer, helper/definer owner, provisioner and grant/RLS/catalog operator; enumerate direct/raw/admin writers and finite role attributes.                |
| backup_owner            | Matched DB timeline/LSN/schema/revisions, receipt watermark, object versions, custody epoch and protected key references; restore operator distinct from admission. |
| fence_owner             | Independent external antirollback/revocation authority; unavailable means NO-GO, never restore historical spent permissions.                                        |
| recovery_owner          | Supervised supported independent-device/quarantine/recovery operator; measured RPO/RTO, current external revocation and cleanup.                                    |
| acceptance_owner        | Owner plus independent security/integration reviewer, exact scope/hash/target and separate authorization; architecture is not implementation permission.            |

The admission/issuer commit is separate and precedes the consumer transaction. The canonical mutation and its exact immutable receipt must commit atomically within the reviewed consumer boundary. Success ACK follows canonical commit, receipt validation and required custody durability. A lost response is UNKNOWN, not permission to retry. Read-only families need consistent authorized reads, not invented mutation receipts.

## Original dependency coverage

| Requirement | Original topic | Dependencies | Acceptance |
|---|---|---|
| R01 | canonical CRM ownership | Original record retained in JSON | NOT RUN OPERATIONALLY |
| R02 | canonical estimate/job/cost ownership | R01 | NOT RUN OPERATIONALLY |
| R03 | canonical inspection ownership | R01, R02 | NOT RUN OPERATIONALLY |
| R04 | missing task/schedule durable owner | R01, R02, R03 | NOT RUN OPERATIONALLY |
| R05 | maintenance command authority | R01, R03, R04 | NOT RUN OPERATIONALLY |
| R06 | customer request authority | R01, R03 | NOT RUN OPERATIONALLY |
| R07 | genuine current authority | R01, R06 | NOT RUN OPERATIONALLY |
| R08 | original durable one-use admission | R04, R05, R06, R07 | NOT RUN OPERATIONALLY |
| R09 | canonical transaction boundary | R02, R03, R08 | NOT RUN OPERATIONALLY |
| R10 | receipt identity and authenticity | R08, R09 | NOT RUN OPERATIONALLY |
| R11 | success acknowledgment boundary | R08, R09, R10 | NOT RUN OPERATIONALLY |
| R12 | exact reconciliation | R07, R10, R11 | NOT RUN OPERATIONALLY |
| R13 | independent anti-rollback fence | R08, R10 | NOT RUN OPERATIONALLY |
| R14 | matched backup set | R09, R10, R13 | NOT RUN OPERATIONALLY |
| R15 | backup confidentiality and key recovery | R10, R14 | NOT RUN OPERATIONALLY |
| R16 | quarantined recovery admission | R07, R12, R13, R14, R15 | NOT RUN OPERATIONALLY |
| R17 | measured recovery acceptance | R14, R15, R16 | NOT RUN OPERATIONALLY |
| R18 | derived projection boundaries | R01, R02, R03, R07 | NOT RUN OPERATIONALLY |
| R19 | bounded implementation decision | R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18 | NOT RUN OPERATIONALLY |

No requirement is closed by documentation or passing local tests. R19 requires an exact future owner decision after R01–R18 evidence. The original two-computer rehearsal, P1-on-thirteen, separate customer14 and original4B/broker sequence remain unchanged.

## Authorization, grants and writer inventory

A valid JWT is not sufficient proof that a sensitive session is still current after revocation; current server session, membership and exact mapping checks are needed at the original boundaries. Staff AAL2 remains required. Customer AAL follows the original contract; this review does not silently impose staff policy on every customer. Browser paths and user metadata never authorize. See [Supabase session guidance](https://supabase.com/docs/guides/auth/sessions).

Grants, RLS and security-definer ownership must all be reviewed at the exact future target. Source-defined policies are not proof of installed grants or complete writer participation. Enumerate original RPCs, direct table writers, historical helpers, installers, provisioners, raw/admin writers and restore operators. The original4B proposal still has trusted definer/helper/installer dependencies and core CREATE / pg_read_all_stats exposure; operational TCB acceptance is absent. Request-scoped service keys remain forbidden. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Matched backup and restore prerequisites

Bind database timeline/LSN/schema and canonical revisions to immutable receipt watermarks, object versions/bytes, custody epoch and independent spent-claim fence, with protected key references and separate key custody. Database backup alone does not include Storage object bytes or custom-role passwords; plan their matched custody independently. Keep all writers and providers fenced during quarantine, check current external revocations, and reconcile UNKNOWN read-only. Historical JSON evidence and source hashes never restore business state. See [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups).

Danny’s newer Air was last reported unavailable. Exact OS/build, encryption, independent power/network, authenticated pairing, durable ACK, primary loss, independent recovery, revocation and cleanup remain unverified. Existing sealed kit and completed offline setup are retained; RPO/RTO remain unmeasured.

## Smallest next acceptance milestone

When the device is available, perform the existing credential-free physical two-device rehearsal and cleanup. Unrelated engineering continues while this is blocked. After original recovery prerequisites, use the existing P1 approval against thirteen history; customer14 and original4B/broker installation and genuine internal acceptance require their separate exact authorization. The narrow future business slice is one original internal request → exact receipt → authorized staff read, using the existing owners and no new store or restore adapter.

Before requesting that future action, name the accountable security, admission, transaction, receipt, fence and recovery operators; prove exact target grants/RLS/catalog and current genuine Auth; demonstrate atomic receipt/ACK semantics, concurrency, revocation, stale-source and foreign-tenant denials, matched backup/quarantine and no replay. This matrix grants none of those actions.

All frozen P1 artifacts, thirteen migrations, pending customer14, original4B, approved designs, Auth/MFA, NMI, Netlify, financial, communication, dispatch, deployment and merge gates remain unchanged.
