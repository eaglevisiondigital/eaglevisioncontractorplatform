# Workstream 2D · defensive security and integration review

October 29, 2026 · reviewed base `c7768cc57d204364d7977598580c1613ce88075e`.
**CONDITIONAL for the exact disposable local 2C boundary; NO-GO for operational use.**
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

Two separate read-only reviewer agents examined actual code, SQL and permission paths.
One reviewed SQL privileges/ordinary writers; one independently reproduced custody and
transport behavior in disposable scratch directories. The primary agent reproduced
findings in executable tests and implemented bounded corrections. The reviewers had
conversation context; this is separated agent review, not clean-room or third-party
certification. Documentation claims and passing tests are not security guarantees.

The latest owner defensive-review direction governs this package. No operational
migration, public HTTP endpoint, application/UI binding or hosted operation was created.
Existing 2A/2B fixtures/helpers and historical business/security SQL are unchanged.

## Verified local corrections and retained evidence

`MAINTENANCE_SECURITY_FINDINGS.json` is the prioritized register: file/function,
preconditions, reproduction, expected/actual result, correction, test and status.
`MAINTENANCE_SECURITY_VALIDATION.json` retains initial failures and final results.

- **Malformed custody history and phases:** a direct SQLite INSERT of an invalid
  reconciled event could clear an UNKNOWN source hold without removing any trigger.
  The API also accepted repair phases on maintenance commands. Full contiguous
  history, timestamps, phase transitions, original request/source/CAS and receipt
  identities now validate on reads and appends. Empty/foreign receipts reject;
  committed reconciliation cannot later resume transmission. Repeated exact reads
  may retain reconciliation evidence. A fully consistent forgery by the OS owner
  still cannot establish authenticity.
- **Capability mismatch creating local holds:** structurally valid wrong source,
  report version or request was retained before SQL denied it. A pure gateway
  preflight now verifies current exact LOGIN/capability/full-command binding before
  a new local intent. This adds no mutation permission. Existing post-resource and
  final authority checks remain authoritative; existing UNKNOWN records are never
  deleted, cleared or retransmitted. A rejected preflight has no local intent and no
  remote mutation. A post-transmission failure still retains UNKNOWN.
- **Unbounded resource wait:** the stdio worker now has a five-second connection
  deadline, three-second lock timeout, five-second statement and idle-transaction
  timeouts. A real held-row test returns undetermined with one transmission marker;
  after release, repeated execute only reconciles and does not mutate. These are
  laboratory limits, not a reviewed production latency or contention policy. A raw
  SQL credential can change its own settings; this is not server-enforced containment
  against that credential.
- **Ambiguous command encoding:** fatal UTF-8 decoding, duplicate decoded-member
  rejection at every object depth and a depth-64 bound precede JSON normalization.
  Malformed, truncated, oversized, unexpected-field and wrong-operation frames fail
  closed; framing survives a rejected frame. Stdout now waits for drain before the
  next response, avoiding an unbounded response queue. Hostile load/slow-reader and
  process-wide memory acceptance remain unverified.
- **Custody files and storage:** main/WAL/SHM/rollback-journal files must be private,
  owned, regular, single-link files. Checks repeat for open journals. Existing
  nonprivate sidecars and hardlinks now reject rather than silently chmod evidence.
  An actual pinned-reader WAL growth test trips a 64MiB aggregate file-size
  **watermark** before further intents. SQLite max_page_count remains a logical page
  budget, not a total disk quota. A crossing commit can exceed the watermark before
  the post-commit check stops; no strict peak-allocation, disk-full or power-loss claim.

Initial regression run: five custody assertions failed. The first new native run
reproduced three capability-hold failures and a resource-wait timeout; its fifth
failure was a new catalog-test SQL alias typo, not a product finding. The next native
run passed57/58; one original expectation needed updating because unauthorized staff
now reject before custody instead of becoming undetermined after transmission. No
permission requirement was weakened. The final run passed **59/59**:21 new review cases
and38 relevant existing2C cases. Application checks pass **52/52**:35 custody and17
strict decoder cases. Full initial failure logs remain in ignored private custody; sanitized results above
remain reproducible from the reviewed base. Original2A/2B/UI/recovery/provider baselines were not repeated
locally. Existing CI runs automatically on push.

## Actual privilege graph and assessed identities

`MAINTENANCE_SECURITY_PRIVILEGES.json` contains the sanitized post-remediation2D working-tree native catalog snapshot against the reviewed base:
**196 user-defined functions,101 tables/views,203 non-internal trigger edges, six
schemas, 73 policies, three identity descriptors and zero custom default-ACL rows.** It includes effective runtime schema,
table **and column** permissions; owners; SECURITY DEFINER/search_path/function ACLs;
RLS/FORCE state; conservative static call references; and triggers. Zero custom default
ACL rows means PostgreSQL defaults still apply to future objects, including default
PUBLIC function EXECUTE until explicitly revoked. No operational grants are supplied.

| Identity                                      | Native observed boundary                                                                                                                                                                          | Trust not eliminated                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Restricted runtime LOGIN                      | Exactly one callable application function: `maintenance_2c_test.command(uuid,text,jsonb)`; no table/column access, persistent schema CREATE, memberships, CREATEROLE/CREATEDB/SUPERUSER/BYPASSRLS | Can use its own exact command through raw SQL; local socket trust/CI password is not human Auth            |
| Dedicated gateway NOLOGIN owner               | Fixed helper EXECUTE; no application table/column access or persistent schema CREATE; nonprivileged role attributes                                                                               | Executed helper owners carry broader authority                                                             |
| Capability provisioner                        | Trusted harness-only command/actor/session/AAL/expiry/readiness approval seeding                                                                                                                  | A compromised provisioner can issue another capability; no operational approval workflow                   |
| 2A/2B/2C helper and historical definer owners | Trusted disposable owner; current session/user/member checks assessed through actual restricted calls                                                                                             | Owner can alter SQL, disable triggers or bypass RLS; FORCE RLS is not protection from a superuser          |
| Filesystem/custody owner                      | Private-directory/file checks, SQLite transactions and history validation                                                                                                                         | Same owner can replace a fully consistent database or race path checks; no authenticated encrypted custody |

The executable chain is runtime LOGIN → NOLOGIN gateway → fixed2C capability/lock/final
helpers and listed2A/2B commands → historical Auth/session, membership/module/property
checks, fixed `property_command(create_visit)`, estimate context/calculation/bundle/
children → integrity, repair-permit, immutability and audit triggers. Static references
include all branches of historical shared functions; reachability of their name does
not grant arbitrary action selection. The maintenance helper fixes create_visit inputs;
the gateway contains no issue, approve-job, contract, invoice, payment or refund step.

Catalog coverage is complete for the six named application/auth/fixture schemas,
not a formal whole-server call-graph proof. PostgreSQL builtins, C/runtime internals,
trusted bootstrap and arbitrary dynamic administrative code remain trusted dependencies.
Default privileges, column grants and transitive helper ownership need independent
operational review again against any future exact schema/role package.

Restricted native cases reject foreign capability references, mismatched actor/source/
request, forged caller claims, AAL1, expired/revoked capabilities and session-user
mismatch. Existing native regressions retain post-wait member/ban/session/capability
revocation, tax/catalog/plan/saved-revision checks and final-revocation rollback. A
current6/6 review leaves one draft; ordinary bound-repair issue/duplicate/archive attempts, draft-source revision and
unsupported financial/work/customer-completion steps reject. A separate ordinary issued-baseline save test verifies immutable payload/revision.
Customer projections and
immutable published snapshots remain on their existing allowlists.

## Unresolved integration gaps: demonstrated, not silently fixed

**D001 · direct SQL custody bypass.** Retain an intent, kill the worker at after_intent,
then call the exact gateway command using its restricted LOGIN. One maintenance edit
commits while the local journal still has only retained. The same LOGIN cannot change
the source/request, and restart reconciles the one receipt without a second edit.
Thus custody-before-send is a property of the trusted service process, not enforcement
against compromised runtime SQL credentials. An operational server-owned one-shot intent/
claim protocol and credential boundary need separate design/implementation review.
No local receipt shape/hash authenticates SQLite history to PostgreSQL.

**D002 · uncovered writer lock inversion.** A native two-connection test holds a
reservation through standalone `exact_reservation`, starts the gateway (settings before
reservation), then invokes standalone `finish` (reservation before settings). PostgreSQL
returns actual **40P01 deadlock**; both transactions roll back, zero estimate is created
and the pre-existing claim reconciles undetermined. A passing characterization test
means the gap is reproducible, not that universal lock safety passed.

Current gateway resource order:

```text
tenant advisory → request advisory → exact source advisory → company settings
→ originating plan → report → CRM location → maintenance item → reservation
→ target estimate/version → job/baseline → tax → ordered referenced catalog
→ current session/principal/member/module checks → final capability share lock
→ final current authority and wall time
```

The read-only exact-command preflight is a separate transaction with no mutation and
no retained resource locks. SQL commands keep the original final checkpoints.

| Writer path outside complete coordination                                            | Actual source order / missing participation                                                                                                  | Evidence status                                                                                             |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Standalone2B finish                                                                  | Reservation → settings, opposite gateway                                                                                                     | FAIL: native40P01 reproduction; preserved UNKNOWN/no partial creation                                       |
| Standalone2B readiness_context / append / save                                       | Reservation/target/policy/catalog and source binding without tenant coordination                                                             | BLOCKED: source-reviewed; no universal race/deadlock acceptance                                             |
| Standalone2A execute/read/reconcile                                                  | Own request/source/resources without2C tenant coordination                                                                                   | BLOCKED: original local contracts remain, composition not universal                                         |
| Historical create/save/issue/revise/duplicate/archive estimate                       | Their own context/estimate/version/authority sequence; fixture guards reject bound repair bypasses but do not integrate all ordinary writers | BLOCKED: six-section bypass negatives pass; general lock participation requires forward adapters            |
| Historical property_command update_plan/create_visit/save_visit/submit/publish       | Property authority/resource sequence differs; publication locks visit/report resources and does not join2C advisory protocol                 | BLOCKED: plan-change regression retained; simultaneous publication/admin histories not separately certified |
| Catalog/tax/company settings and CRM/customer/job admin writers                      | RLS/authority/resource orders vary; participating representative waits pass                                                                  | BLOCKED: arbitrary mixed-resource transactions, starvation/load and administrator sequencing unverified     |
| Membership, organization/module/feature, Auth user/session/capability administration | Authority-only revocation is supported; mixing resource updates requires common ordering                                                     | BLOCKED for arbitrary mixtures; tested post-wait/final revocations pass                                     |

This table is the uncovered writer-family inventory. No claim that other ordinary
writers automatically obey a new advisory lock. Historical SQL/2A/2B were not rewritten.
See the separate non-executable2E proposal.

## Custody, privacy, recovery and release limits

FULL/WAL/fullfsync and directory sync plus actual process-loss tests demonstrate local
commit sequencing. They do not certify physical fsync, power loss, DB-server restart,
filesystem/disk substitution by its owner, disk loss, encrypted backup/restore, legal
retention or independent two-computer recovery. File checks have lstat/open/use race
limits against the trusted same-OS owner. No credentials or private recovery capsules
were installed on Monterey; pairing and independent recovery remain unfinished.

The stdio service is staff-private test transport. Notes, costs and employee identity
in its intended response/journal must never become a customer projection or general
log. Malformed request errors emit only rejected/undetermined; no raw command or SQL
error logging was added. Public routes, genuine JWT/Auth/MFA, origin/CSRF, rate limits,
request cancellation/load acceptance and encrypted operational custody remain BLOCKED.
No financial, repair-completion or customer authorization follows from review evidence.

All thirteen historical migrations, pending unapplied customer-fourteen, frozen P1
operation/four artifacts, owner approvals, approved UIs/assets, original README,
dependencies/lockfile, estimating/workforce engines and recovery/Netlify freeze remain
unchanged. P1 stays sequenced against thirteen history; no duplicate approval request.
AR remains held for product planning. No hosted access, database changes, provider or
financial execution, deployment, outside access or merge. Local catalog fixtures
are not genuine Auth, hosted acceptance or production least privilege.

## Reproduce only the bounded local review

```sh
npm run test:maintenance-native -- --workstream=2d   # 21 new native review cases
npm run test:maintenance-native -- --workstream=2c   # 59 including relevant regression
npx vitest run tests/command-custody.test.ts tests/maintenance-command-json.test.ts
```

Use installed Node24/nativePG17. The existing runner creates and removes its own
random DB/cluster/roles/journals, TCP disabled; no application URL or credential reader.
CI uses its isolated existing synthetic PG17 service. No deployment script is involved.

Reference checks: [PostgreSQL17 definer privilege rules](https://www.postgresql.org/docs/17/sql-createfunction.html),
[PostgreSQL17 locks and deadlocks](https://www.postgresql.org/docs/17/explicit-locking.html),
[SQLite WAL reader/checkpoint growth](https://sqlite.org/wal.html).
