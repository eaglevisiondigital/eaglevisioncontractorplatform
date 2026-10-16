# Provider migration: final development review

October 16, 2026 · reviewed source commit `230f5b8ee9e49624b888af445775a1b7ebbb0e9a`.

**NO-GO for the exact proposed migration.** Independent native PostgreSQL testing
reproduced two issues below. The SQL and all nine historical migrations remain
unchanged. No hosted migration, provider role/grant, activation, deployment or
customer operation was performed. PR #1 stays draft; Release 1.0 remains closed.

## Exact scope and integrity

Only `supabase/migrations/20261016185108_provider_sandbox_persistence.sql`
is proposed for a later development action.

- File SHA-256: `9588d8db45eeb476919cb7d12e5e53dd3e622f95e2561db9c4f0019659591861` — PASS.
- Separate pending bundle: `8532505e7967e381e3d1b9e16f497eeeb1dabd74830b49bc06e310fec89babc7`.
- Historical nine-file bundle: `c48fb1ad792ff8eca186c59147a9bb28604f1c281e65a7f027ea1a797ef387b6` — unchanged.
- One transactional forward file: 16 new private tables, 101 table constraints
  (26 foreign keys), 40 indexes on those tables, one tenant/ID unique index on
  existing `private.merchant_configurations`, 32 user triggers and seven functions.
- No existing function, policy, table data, Auth/Storage setting, public API,
  role/login, capability row, provider binding or execution grant is added.
  The new index is the only definition change to an existing application table.

The exact owner-designated development target and raw catalog/CLI/test evidence
are retained under ignored `.staging/provider-migration-review/`. No private target
identifier, credentials, JWTs, passwords, provider secrets or customer data belong
in this public report.

## Blocking findings

### M1 · High · temporary authority can expire while a command waits for locks

At lines 134–138, `require_provider_workload` tests time before/across a
`SELECT ... FOR UPDATE` wait. With an unchanged locked row, PostgreSQL does not
reevaluate its time predicate merely because wall time passed. Payment commands
also acquire the merchant lock at line 187 after this guard; no workload-expiry
check follows that wait before the reservation insert at lines 211–212.

Two independent-connection cases used a two-second capability, an otherwise
valid synthetic authorization and an authenticated nonprivileged database LOGIN
in a disposable database. Both commands **started before expiry**, waited on a
real PostgreSQL lock, then reserved a new attempt after expiry:

| Held lock    | Attempt created (UTC) | Capability expired (UTC) | Required strict-expiry result | Actual   |
| ------------ | --------------------- | ------------------------ | ----------------------------- | -------- |
| Workload row | 20:00:08.858          | 20:00:08.704             | Deny                          | reserved |
| Merchant row | 20:00:11.019          | 20:00:10.866             | Deny                          | reserved |

This is an in-flight expiration gap, not proof that a call first made after
expiry succeeds. Explicit row revocation during a lock wait correctly denied
with SQLSTATE `42501`; existing expired-at-entry tests also pass. No cross-tenant
escalation or currently active hosted exposure was demonstrated.

The distinction between an unchanged locked row and a concurrently updated tuple
matches PostgreSQL's documented [row-lock behavior](https://www.postgresql.org/docs/17/explicit-locking.html)
and [Read Committed rechecks](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-READ-COMMITTED).
The post-expiry timestamps above are observed native results, not an inference
from documentation alone.

Before approval, define the expiration contract precisely and revalidate the
locked capability with current wall time after waits and before starting a new
operation. Cover payment authorization/binding expiry and the shared email/
agreement guard as well. If a bounded in-flight completion exception is desired,
review it explicitly, separate outcome persistence from new execution, and enforce
its time limits. A locked row alone does not enforce an absolute 30-minute end.
Add native expiry-during-wait regressions. Do not silently reinterpret this as
successful strict expiry enforcement.

### M2 · Medium · terminal payment result can be SQL NULL

The status/result CHECK at line 44 permits SQL NULL through three-valued CHECK
semantics; the projection constraint at lines 101–112 explicitly accepts NULL.
The attempt trigger permits a pending-to-terminal transition that changes only
status/result. A local owner-DML update therefore stored
`status='succeeded', result=NULL`.

PostgreSQL explicitly documents that a [CHECK also accepts NULL](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS).

The restricted `finish` command rejects a JSON-null result and the workload has
no table UPDATE privilege. This is a table-invariant defect, **not** a demonstrated
client or authorized-command bypass. It still contradicts the durable terminal
result invariant and could make privileged maintenance persist an unreconcilable
terminal record.

Require a non-NULL object for every terminal status with a CHECK whose result
cannot be UNKNOWN. Test both malformed inserts and pending-to-terminal updates,
while retaining the immutable-terminal trigger and existing result projection.

Neither finding was repaired in this review: changing the reviewed bytes would
invalidate the requested hash. A corrected successor needs a new hash, independent
review and separate target-specific execution authorization.

## Complete table and command review

All 16 tables have non-NULL organization scope, tenant-leading keys/indexes,
RLS enabled with zero policies, owner-only table ACLs after explicit revokes,
and audit plus immutable/revocation-only protection. RLS is deliberately not
FORCE: the fixed SECURITY DEFINER commands act as owner; a future workload does
not own tables or have BYPASSRLS. RLS does not constrain the trusted database owner.

| Private table                   | Constraints | Indexes | Reviewed boundary                                                                       |
| ------------------------------- | ----------: | ------: | --------------------------------------------------------------------------------------- |
| sandbox_gateway_authorizations  |          10 |       3 | Tenant merchant/customer FKs; amount/currency/digest; one-way revocation                |
| sandbox_gateway_attempts        |          12 |       5 | Tenant authorization/merchant/capture FKs; single authorization use; terminal guard; M2 |
| sandbox_gateway_settlements     |           3 |       1 | Tenant capture FK; append-only settlement evidence                                      |
| sandbox_gateway_inbox           |           4 |       1 | Tenant merchant FK; unique event and body digest; append-only                           |
| sandbox_gateway_observations    |           9 |       3 | Tenant attempt/merchant FKs; bounded amount/state/digest; append-only                   |
| sandbox_gateway_reconciliations |           4 |       2 | Tenant merchant FK; unique report; immutable snapshot/report evidence                   |
| provider_workloads              |           6 |       3 | Exact role/tenant/service/scope; maximum 30-minute lifetime; revoke only; M1            |
| provider_email_sender_bindings  |           4 |       1 | Tenant organization FK; immutable version/profile binding; revoke only                  |
| provider_email_domains          |           9 |       3 | Tenant/config/version FK; evidence window limited to 15 minutes                         |
| provider_email_outbox           |           8 |       4 | Tenant domain/config and customer FKs; idempotency; delivery always disabled            |
| provider_email_bindings         |           4 |       3 | Tenant outbox FK; unique provider message; no binding-creation command                  |
| provider_email_events           |           6 |       2 | Tenant binding FK; unique event; immutable delivery/suppression facts                   |
| provider_email_suppressions     |           5 |       3 | Tenant customer/event FKs; monotonic unique suppression                                 |
| provider_agreement_bindings     |           6 |       4 | Tenant customer/version FKs; Auth signer FK; JSON/column binding; revoke only           |
| provider_agreement_evidence     |           8 |       1 | Tenant agreement FK; immutable digests; sandbox/legal execution false                   |
| provider_agreement_inbox        |           4 |       1 | Tenant agreement FK; immutable unique event/body digest                                 |

Seven new functions were inspected:

- Five SECURITY DEFINER functions: `provider_audit_change`,
  `require_provider_workload`, `sandbox_gateway_control`,
  `provider_email_control`, `provider_agreement_control`.
- Two security-invoker trigger functions: `protect_sandbox_attempt` and
  `protect_gateway_authorization`.
- All seven set an empty search path, use qualified application relations and
  have no PUBLIC/anon/authenticated/service_role EXECUTE after migration.
  New tables likewise revoke all four roles. No exposed function is added.
- Runtime commands use fixed branches/allowlists and bound values; input cannot
  become SQL identifiers or executable SQL. Migration DO blocks interpolate only
  fixed identifiers using identifier quoting.
- Authority comes from database-authenticated `session_user`, not JWTs, SET ROLE,
  browser context or user metadata. Guards reject owner/service/API identities,
  privileged role attributes and inherited membership. A future reviewed workload
  must also be NOREPLICATION, use verified TLS/session semantics and have no DML.
- Gateway command checks merchant/provider/sandbox binding, exact authorization,
  idempotency, settled capture/refund capacity, immutable outcomes, replay digest
  and reconciliation snapshot. UNKNOWN stays held; no customer ledger is posted.
- Email command locks sender configuration, checks current version/domain evidence
  and suppression, and can prepare only disabled outbox rows. No send/un-suppress
  operation or delivery-binding creation exists.
- Agreement command verifies current binding, confirmed signer, issued version,
  customer portal identity and organization, then appends sandbox-only evidence.
  It cannot create independent agreement authority or execute a legal signature.
- Audit events carry no row payload or forged human actor. Human actor is NULL;
  successful guards separately record the capability ID. Audit and financial
  records are not changed by a reconciliation or webhook into live execution.

Invoice/document/accepted-decision identifiers awaiting a reviewed provenance
workflow are not assertions of genuine authorization. Their missing production
workflow remains an activation blocker; internal laboratory consent cannot supply it.

## Hosted drift and advisors: read-only evidence

The target identity was checked before use. Its PostgreSQL is 17.11. All nine
recorded migration versions match, in order:

```text
20261015183039_phase_1_foundation
20261015201048_phase_2_operations
20261015204729_phase_3_estimating
20261015210230_phase_3_material_import
20261015210546_phase_3_job_financials
20261015210856_phase_3_workforce
20261015221730_phase_3a_release_controls
20261016024502_release_1_internal_workflow
20261016030324_material_worker_control_store
```

Stored migration SQL matches the corresponding approved source after removal of
nonsemantic statement wrappers/comments/whitespace outside quoted bodies.
Application catalog comparison: **422/422 records match**, covering 63 table
definitions/ACLs, 147 function definitions/ACLs and two enums. Table records include
columns/defaults, constraints, indexes, RLS/policies and triggers.
An additional **69/69 column ACLs match**. Schema ownership/USAGE and relation kinds
were inspected: only the expected application tables/indexes, no added view,
sequence or materialized view; application relations remain owned by postgres.
Private-schema USAGE on existing API roles is historical, not a table/function
grant or API exposure. Known default-privilege cleanup remains a separate review;
it is not new drift or performed here. Managed Auth/Storage internals and extension
definitions are outside this application-catalog comparison.

A final read after the CLI dry run still showed **nine migrations, 63 application
tables, zero proposed provider tables and zero active platform-admin grants**.

Hosted advisors describe the **existing nine-migration database**, not the proposed
unapplied schema:

| Advisor     | Result                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Security    | 0 WARN/ERROR; 12 INFO for intentional private RLS tables without policies                                           |
| Performance | 4 existing WARN for Auth RLS initplans; 21 unindexed-FK INFO; 42 unused-index INFO; 1 Auth connection-strategy INFO |

No advisor/configuration cleanup was executed.
[Security notice rationale](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[FK diagnostic](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[existing RLS performance warning](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

## Local execution, dry run and result accounting

Disposable PostgreSQL **17.11**, Unix socket only, separate synthetic databases:
the unchanged approved nine followed by the exact proposed file applied
successfully in one transaction. Local catalog showed all 16 new tables empty,
owner-only ACLs, all seven fixed search paths and **zero uncovered new foreign
keys**. The only existing definition delta was the merchant composite index.
Empty-database migration timing was 30–36ms; this is not a hosted lock/load estimate.
The transactional nonconcurrent merchant index requires a separately approved
quiet write window and bounded lock/statement timeouts before any future apply.

Pinned Supabase CLI **2.121.0**, using the existing approved Keychain process:

```text
npx supabase db push --dry-run --skip-vault --project-ref <private-approved-development-ref>
```

Exit 0. Actual response: `dryRun=true`; exactly
`20261016185108_provider_sandbox_persistence.sql`; `seeds=[]`, `roles=[]`.
No --include-all, --include-seed, --include-roles, reset, repair or apply was run.
The CLI initialized its normal temporary migration login; no provider service
identity, permission or private grant was provisioned. No migration was pushed.

Fresh `npm run check` also passed: **550 tests PASS / 11 native-only skips**,
lint, strict TypeScript, generated public types, both migration manifests and local
build. `npm run format:check`, diff checks and private-reference scan passed.
These existing tests overlap the 216 native cases; all native-only cases ran there.

| Status  | Exact evidence                                                                                                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS    | Hashes; nine stored migrations; 422 catalog and 69 column-ACL comparisons; local exact migration/catalog diagnostics; CLI one-file dry run                                                                                              |
| PASS    | Existing native database suite: **216 tests / 10 files / zero skips**, including native concurrency                                                                                                                                     |
| PASS    | **10 of 13** independent adversarial checks: cross-company/scope denial, table SELECT/UPDATE/TRUNCATE denial, SQL-action rejection, JWT non-authority, NULL human audit attribution, null finish rejection, concurrent tuple revocation |
| FAIL    | **3 of 13** checks: expiry during workload lock wait, expiry during merchant lock wait (M1); terminal SQL NULL result (M2)                                                                                                              |
| BLOCKED | Hosted apply/activation pending correction, review and separate approval; genuine provider acceptance requires approved infrastructure/accounts/authority                                                                               |
| NOT RUN | Hosted proposed-schema advisors, new provider Auth/API/callback acceptance, workload activation, merchant/email/signature/document/payroll execution, Netlify operations                                                                |

The 216-test regression suite does not cover the three newly failing assertions.
Counts must not be summed into a “229 tests passed” claim. New adversarial fixtures,
test-only roles/grants, independent connections and locks existed only in a
disposable local cluster, which was stopped and removed. Review-only harnesses and
raw evidence are retained privately; no real identity, factor or company was changed.
No UI/runtime source was edited. Prior browser results are historical, not rerun
as connected or migration acceptance.

## Containment, rollback and next approval boundary

1. **Now:** do not apply this hash. Keep all provider functions revoked, all
   authorization/binding/workload creation absent and every runtime gate disabled.
   Existing hosted data/schema and the blocked protected deployment stay untouched.
2. **Before a corrected apply:** inspect the successor diff/hash and repeat native
   adversarial cases, full catalog/security/grant comparison and one-file CLI dry
   run. Obtain an exact development-target owner authorization. Do not replay,
   edit or repair the nine historical versions.
3. **Failure inside the migration:** its explicit transaction must roll back.
   Check actual history/catalog state read-only; do not retry/reset/repair blindly.
   A partially acknowledged result is not permission to reapply.
4. **After a committed but dormant schema:** contain by preserving no runtime
   capabilities/EXECUTE grants and leaving the data intact. Do not drop tables or
   fake removal of migration history. Use a separately reviewed forward correction.
5. **If separately authorized activation ever occurs:** revoke the exact capability,
   independently prove denial, close/terminate its approved connection pool and
   remove EXECUTE/USAGE under that operation. Revocation can wait for an in-flight
   transaction; impose supervised timeouts and verify actual connection closure.
6. Preserve attempts, UNKNOWN/refund holds, authorizations, observations, webhook
   digests, reconciliation, agreement/email evidence and append-only audit history.
   Never truncate/delete these, rewrite terminal outcomes, clear holds, retry UNKNOWN
   or perform a compensating real refund as a schema rollback.

**Recommended next action:** authorize local remediation of M1/M2 in a reviewed
successor, retaining the original historical migrations, then independently review
the new bytes. No hosted execution or capability activation is recommended now.
