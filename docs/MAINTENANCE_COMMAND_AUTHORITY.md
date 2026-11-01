# Workstream 2E · server-owned claims and participating writer coordination

October 29, 2026 · base `9c277b9dfcc6049f350d831edb49ce9aadb95b26`.
**TEST-ONLY / DISPOSABLE NATIVE PG17. Operational NO-GO.**
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Exact implemented scope and finding status

| Finding | Current evaluated result                                                                                                                                                                     | Boundary retained                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| D001    | **FIXED within newly restricted2E runtime/issuer composition**: raw SQL without a committed exact claim denies; rollback, savepoint and exception-subtransaction cannot resurrect an attempt | Original2C bypass remains reproduced/FAIL in unchanged2D evidence. No claim of attested SQLite custody, genuine Auth or an operational service |
| D002    | **PARTIAL**: the new participating gateway/coordinate path avoids the original inversion with actual concurrent native transactions                                                          | Unchanged raw standalone2A/2B, historical and arbitrary admin writers have not universally joined; operational integration remains NO-GO       |
| D009    | **BLOCKED for operational least privilege**; narrow role checks and an actionable ownership plan are supplied                                                                                | Trusted issuer broker/provisioner and SECURITY DEFINER core/helper owner remain; no genuine Auth/MFA or production role provisioning           |

The old review/findings/catalog and original failing reproductions remain byte-identical.
A new test fixture extends the disposable copy; it does not patch original2A/2B/2C SQL
files, historical migrations, business engines or approved UI. The new fixture adds a
composite capability-parent UNIQUE only inside its fresh disposable DB. The new test
scenario setup uses the existing synthetic2C relationships/controllers and engines;
no second customer/property/inspection/estimate system is created.

## Issuer, mutator and exact command authority

`tests/database/fixtures/maintenance-authority.sql` supplies three private coordination
metadata tables: approvals, immutable claims and append-only outcomes. They reference
existing capabilities, tenant/member/session records and exact command/source identities;
composite parent keys/FKs and tenant-leading indexes preserve organization binding.
RLS/FORCE and explicit privilege revocation apply. No client generic CRUD or table/column
access exists. Existing immutable reports, estimates, tax/catalog and visits remain
the only business records. This is command metadata, not another application database,
estimating engine, business ledger or customer debt store.

The trusted harness provisioner fixes one exact capability/command and issuer LOGIN.
A separately held restricted **issuer LOGIN** may invoke only issue. The **runtime
LOGIN** may invoke only the2E gateway, never the2C gateway, raw helpers, issue, table DML,
sequence operations or role changes. A separate NOLOGIN gateway owner may call only
its fixed core helper and its own wrapper, with no app-table/column rights. The core,
issuer helper and older definers still run as the trusted disposable fixture owner.
See MAINTENANCE_AUTHORITY_PRIVILEGE_PLAN.md; this is not a fully deprivileged TCB.

`server/property/command-authority.ts` is an unwired strict request contract for the
private test channel. Unknown actor/organization/custody-hash/trusted/retry fields,
nonmutating/financial operations, malformed backend/full-transaction identity and
oversized evidence reject. It confers no Auth or database authority.

Normal protected execution is:

1. Existing pure capability preflight, followed by SQLite retain and transmission
   marker commit. Failed custody prevents issuer requests and protected mutations.
2. Runtime opens its database transaction and obtains its actual full transaction
   ID, backend PID and exact backend-start timestamp. It sends a bounded private
   inherited pipe request to the separate trusted test issuer broker. No issuer
   credential or connection is present in the worker environment.
3. A fresh issuer transaction validates its own LOGIN/capability binding, exact
   command/operation/phase, current actor/session/member/AAL and preliminary MVCC
   source/CAS. A narrow trusted definer verifies live runtime metadata using a fresh
   pg_stat_activity snapshot plus full-XID in-progress status. No blanket
   pg_read_all_stats grant. Wrong PID/start/XID/epoch or already-closed transaction
   rejects. The runtime cannot manufacture/reset its approval.
4. Issuer-only tenant/source advisory locks serialize claim capacity and conflicting
   request/source identities. Required prior phase outcomes must exist. Any other
   unfinished capability for that exact source holds UNKNOWN through the terminal
   execute/finish/append outcome, including reservation-before-preparation gaps.
5. Issuer commits an immutable exact claim **before mutation**. It binds organization,
   actor/session, source/full command/arguments, request, phase, runtime LOGIN,
   backend/start and full transaction. Final capability-row sharing/current checks
   serialize revocation with issuance. Issuer MVCC checks are preliminary; full
   locked job/source/plan/target/policy validation remains in the existing commands.
6. Gateway verifies the claim against the actual runtime transaction/backend and
   exact arguments, then consumes its private one-shot gate. The unchanged2C resource
   protocol and existing2A/2B checked command perform the actual mutation. Final
   capability/current authority still run after waits. The outcome commits in that
   same protected transaction. SQLite then retains the actual phase acknowledgment.

Repair uses separate claims for reserve, claim and finish; readiness uses review_intent
and append_review. These are existing workflow steps, not new business transitions.
An issuer cannot skip prior outcomes or rebind a spent/uncertain phase to a new
transaction/request. A duplicate command at the service re-enters exact read-only
reconciliation, never claim issuance. An absent target or receipt is undetermined.

The broker is a trusted test harness connection over an inherited duplex pipe, with
no listening network socket or HTTP endpoint. A worker compromise that controls this
private channel may request its already approved exact operation; the SQL gateway
still requires independent issuer commitment. This does not prove that SQLite was
truthfully persisted by a compromised same-OS process. No caller hash or flag is
accepted as proof. Genuine request identity, remote transport and broker isolation
need operational design/implementation/acceptance.

## Rollback-resistant one-shot gate and limitations

Binding a claim only to top-level transaction/backend is insufficient: SAVEPOINT or
exception-block rollback can remove a transactional outcome while keeping that same
transaction alive. The independent reviewer identified this before certification.
The disposable issuer therefore creates one private, noncycling CACHE1 sequence per
claim. Only the checked trusted core can advance the stored sequence OID; first value1
permits the attempt, second/exhausted values deny. Neither LOGIN has USAGE/SELECT/
UPDATE/ALTER/reset authority over that sequence, and there is no reset/delete API.

Actual native tests execute mutation → rollback-to-savepoint → repeat, and mutation
inside an exception subtransaction → repeat. Both repeats deny; no mutation/outcome
survives. Full rollback and new backend/transaction also deny. The independently
committed claim remains even when a protected transaction has no surviving receipt.

This is a bounded laboratory primitive, not a proposed operational sequence schema.
PostgreSQL explicitly leaves sequence state uncertain after some cluster crashes.
Full transaction/backend binding and UNKNOWN/no-rebind remain mandatory; there is no
DB restart retry path. Sequence/DB/disk/power/backup restoration acceptance is NOT RUN.
Claims are capped at1000 per tenant under an issuer-only tenant lock; capacity failure
stops rather than purges. An operational retention/archival/cleanup policy is absent.

## One resource/authority ordering specification

Participating runtime transactions use the unchanged2C order:

```text
tenant coordination → command/request → exact source → company settings
→ originating plan → report → CRM location → maintenance item → reservation
→ target estimate/version → job/issued baseline → tax → ordered catalog
→ current principal/session/member/module/feature checks → final capability
→ final authority/outcome, then commit
```

Pure LOGIN/capability/expiry/claims derivation may precede resources but must not take
runtime authority row locks there. Review caught an initial authority-before-resource
mistake in2E; it was corrected before final verification. A new native race holds
settings, starts the waiting mutation, revokes membership and commits. The command
then denies without inversion or partial effects. Final capability revocation similarly
rolls mutation/outcome back while retaining the independent claim.

Issuer and runtime clients use five-second connection/statement/idle-transaction
deadlines and three-second lock timeouts. Issuer transactions never take runtime
resource/advisory locks. They use their own
issuer-tenant/source namespace, preliminary MVCC domain reads and current/final
capability/authority checks, then commit before runtime mutation. This avoids waiting
on source/plan locks already held by runtime readiness context. An unrestricted admin
mixing arbitrary resources/authority remains outside this proof.

| Writer path                                                                                           | Participating status / integration gap                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2E maintenance edit/follow-up, repair reserve/claim/finish, readiness context/intent/append and reads | Participates through2E→2C protocol. Explicit follow-up creates one existing inspection draft, never dispatch                                      |
| New coordinated transaction entry                                                                     | Takes2C resources before finish; concurrent gateway reconciliation waits at tenant lock, then observes one committed result without40P01          |
| Raw standalone2A execute/read/reconcile and2B reserve/claim/finish/readiness/save                     | Unchanged, NOT universally integrated. New runtime cannot call them; trusted historical diagnostic still reproduces original40P01                 |
| Ordinary estimate create/save/revise/duplicate/issue/archive and template/material writers            | Historical order/fixture guards retained; each requires future exact adapter participation, not blanket permission from the new gateway           |
| Inspection plan update, visit create/save/submit/publication                                          | Existing property_command order and immutable report rules retained; no forward integration claim                                                 |
| Job creation/status/cost and issued baseline links                                                    | Existing FK/immutability protections retained; no new job/work authority. Mixed job/estimate writer coordination remains unreviewed operationally |
| Tax/catalog/company settings and CRM/customer/property administration                                 | Referenced runtime rows participate; ordinary standalone/admin update entry points require reviewed order/forward adapters                        |
| Member/user/session/module/feature/capability revocation                                              | Representative resource-first and final-capability races pass. Arbitrary multi-resource admin transactions remain gaps                            |

The originalD002 reproduction is retained in tests/database/maintenance-service.test.ts.
The new corrected test calls the participating coordinate/finish gateway, not an
unchanged raw standalone helper. A passing corrected test does not close every old
writer path or establish starvation/load/deadlock acceptance for arbitrary admins.
Raw SQL clients can change their own timeouts; worker deadlines remain laboratory
containment, not complete server-enforced denial-of-service control.

## Observed process/custody evidence

| Boundary                                                        | Actual result                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SQLite writer lock before custody                               | Rejected, zero issuer requests/claims and zero protected mutations                                           |
| Valid exact authorization                                       | Issuer commits one claim, runtime commits one outcome and actual business receipt                            |
| Raw SQL without claim                                           | Denied for all three companies; old2C/rawhelper and issuer role escape paths denied                          |
| Concurrent exact submissions                                    | One server phase claim, one edit/note/receipt; loser retains uncertainty and can read exact committed result |
| Process loss after local intent                                 | No issuance; restart only reconciles undetermined, no automatic first attempt                                |
| Loss after server claim/before mutation                         | Claim retained, no outcome; restart undetermined, never rebind/retry                                         |
| Loss during open mutation                                       | Native rollback removes effects/outcome; claim and consumed gate remain, no replay                           |
| Loss after commit/before ACK                                    | Exact receipt reconciles with no new claim/mutation                                                          |
| Loss after reserve ACK                                          | Original reservation/lifecycle retained, zero target; no automatic prepare or replacement capability         |
| Revocation during/following transaction                         | Waiting mutation rolls back; revoked staff cannot read retained receipt after restart                        |
| Missing receipt/target, rollback/savepoint or stale transaction | UNKNOWN persists; no new identity or optimistic clearing                                                     |

All six readiness sections run through the same existing canonical engine and per-
phase contract;6/6 still cannot issue, approve a job, dispatch, resolve a repair, create
customer approval/invoice/receivable/payment/refund/debt. Original issued records,
report versions and private/customer projections remain unchanged. Measurements remain
staff attestations. Files/SQLite encryption, same-owner tamper/TOCTOU, DB-server/disk/
backup/power and independent physical recovery remain separately unverified.

## Validation and reproduction

**30 new native PG17 cases and21 application contract cases pass.** Native tests use
actual separate LOGINs/connections, real locks/revocation/expiry, independent worker
PIDs, inherited private broker pipes and actual SQLite custody. No PGlite or mocked
concurrency substitutes. Initial run19/20 passed: permission denial worked, but the
new test left its transaction aborted before testing its valid follow-on path. Proper
savepoint isolation corrected that harness error; no negative expectation was weakened.
Original2D failed reproductions remain unchanged, with raw logs retained privately.

```sh
npm run test:maintenance-native -- --workstream=2e
npx vitest run tests/command-authority.test.ts
```

The runner starts/stops/removes its private nativePG17 cluster and random DB with TCP
disabled, loads13 history and existing fixtures plus2E, and discards roles/journals.
CI uses the existing isolated synthetic PG17 service. No real credential discovery,
Supabase call or application URL. Old2A–2D suites were not rerun locally; automatic
existing CI validates relevant shared-worker regressions on push.

213 protected existing paths and all four frozen P1 hashes are byte-identical.
All historical/pending SQL, approved UIs/artwork, original README, dependencies/lock,
2A/2B/2C SQL,2A/2B business helpers and2D finding evidence persist. Only the test stdio composition/
runner and new unwired contract/fixtures/tests/docs change. Approval register and
continuity documents are updated; existing P1 approval is not requested again.

An independent read-only reviewer examined design and actual final code, identified
savepoint and ordering/capacity risks, and found no remaining blocking correctness
issue in the evaluated paths. It did not rerun the primary harness or certify genuine
Auth/operational least privilege. See MAINTENANCE_COMMAND_AUTHORITY_VALIDATION.json.

No operational migration, connected UI/service, hosted Auth/session/grants/features,
provider/payment/recovery/Netlify action, deployment, production/outside access or merge.
Operational use remains NO-GO. See MAINTENANCE_AUTHORITY_PRIVILEGE_PLAN.md for the
ownership plan and explicit next decision; no automatic next simulation series.

References: [PG17 sequences/rollback and crash limits](https://www.postgresql.org/docs/17/functions-sequence.html),
[PG17 activity snapshot/visibility](https://www.postgresql.org/docs/17/monitoring-stats.html),
[PG17 full transaction status](https://www.postgresql.org/docs/17/functions-info.html).
