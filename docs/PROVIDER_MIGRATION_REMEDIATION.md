# Provider migration security remediation

October 16, 2026 · base review commit `7ee2c16` · internal development only.

**GO to request separate approval for the corrected dormant development migration.**
This is a technical review recommendation, **not execution authorization**. The
migration remains UNAPPLIED. No provider role/grant, capability, external call,
Netlify operation or production action was performed. Release 1.0 is NOT READY /
NOT AUTHORIZED and PR #1 remains draft.

## Exact reviewed successor

Same pending filename: `20261016185108_provider_sandbox_persistence.sql`.
This file has never been hosted; correcting it does not rewrite hosted history.

| Artifact                                          | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Corrected file                                    | `5dd07b079a591b433fa7ab432fd841026de91a1cd3f1d3a722bef500aa9fd32d` |
| Corrected one-file bundle                         | `231fa367a176bc329c983fa9d7154d814d0469278209edeca8712229870c750e` |
| Unchanged approved historical nine-file bundle    | `c48fb1ad792ff8eca186c59147a9bb28604f1c281e65a7f027ea1a797ef387b6` |
| Rejected original file, retained for reproduction | `9588d8db45eeb476919cb7d12e5e53dd3e622f95e2561db9c4f0019659591861` |

The original [NO-GO review](PROVIDER_MIGRATION_FINAL_REVIEW.md) remains historical
evidence for its exact hash. The manifest records both reviews; it still says
`PENDING_REVIEW_NOT_AUTHORIZED`.

Scope remains 16 private tables, 101 constraints/26 FKs, 40 indexes on new tables,
one tenant/ID index on existing merchant metadata, 32 triggers and seven functions.
No historical migration, public type/API, RLS policy, Storage/Auth setting, runtime
provider switch or branding asset changed.

## M1: lock first, then validate wall time, then validate before returning

The shared private guard now returns the locked capability UUID and performs no
audit write. It selects the capability by database-authenticated LOGIN, tenant,
service and scope, takes FOR UPDATE, then explicitly validates the returned row's
creation, expiry and revocation against `clock_timestamp()`. Its fast admission
check is not considered proof of post-wait authority. Privileged attributes,
including REPLICATION, inherited membership and ordinary owner/API/service roles
are denied. JWTs/GUCs/SET ROLE cannot impersonate the dedicated session identity.

Each command audits its authorization once using that returned UUID and NULL human
actor. A labeled command block routes every successful read, replay and mutation
through **one final checkpoint**. There is no early successful RETURN around it.

| Boundary                  | Checks after waits and at completion                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment workload/merchant | Shared guard after merchant lock; guard again after authorization and refund capture waits                                                                        |
| New payment/refund        | Locked independent authorization still unexpired; request expiry current before INSERT and at final checkpoint                                                    |
| Outcome persistence       | Existing reserved attempt remains immutable after terminal transition; current workload still mandatory after attempt lock/DML                                    |
| Email                     | Shared guard after sender locks; final exact sender version/account/domain/profile still active/unexpired, and domain receipt still unexpired                     |
| Agreement                 | Binding selected by identity then expiry/revocation checked after its lock; workload and binding checked after portal/signer/company locks and after evidence DML |
| Implicit writes           | Final checkpoint runs after DML, FK/trigger/audit waits; expiry raises and rolls back the entire command including temporary audit events                         |

No grace period permits a new reservation. Persisting an already-returned payment
outcome retains the existing exception for expired independent merchant approval;
it still requires a currently authorized workload. If workload expiry denies a
completion, the existing pending/UNKNOWN hold is preserved for separately reviewed
recovery; no automatic retry, refund or released capacity is introduced.

These are statement checkpoints, not a hard real-time cancellation/COMMIT scheduler
or authorization for an outbound network call. Future workload activation must
review autocommit/transaction duration, supervised connection cancellation and
timeouts, and current authority immediately before any provider call. Long-lived
explicit transactions and external provider atomicity are not certified here.

PostgreSQL documents [row locks](https://www.postgresql.org/docs/17/explicit-locking.html)
and distinguishes [clock_timestamp from transaction-start time](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
The native tests keep BEGIN open before the wait so stale now()/CURRENT_TIMESTAMP
would not satisfy the required expiry behavior.

## M2: terminal result is a durable table invariant

Named CHECK `sandbox_status_result` now requires:

- pending: SQL NULL result only;
- succeeded/declined/unknown: explicitly non-NULL JSON object;
- the existing strict result projection additionally validates status, sandbox
  mode, provider, USD integer amount, transaction identifier and allowed fields.

The CHECK cannot pass a terminal SQL NULL by returning UNKNOWN. PostgreSQL's
[NULL CHECK semantics](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
are tested through owner-maintenance INSERT **and** pending-to-terminal UPDATE.
Tests also cover JSON null, array, scalar, empty object and invalid/sensitive
projection. Restricted finish rejects malformed objects and workloads still have
no direct INSERT/UPDATE capability.

Valid transitions for all three terminal statuses remain possible and immutable.
Pending/UNKNOWN capacity holds, settlement prerequisites, refund serialization,
integer arithmetic, replay protection and reconciliation remain covered by the
existing native suite. No data cleanup or rewriting is necessary: the rejected
schema was never applied hosted.

## Evidence and independent second-pass review

The unchanged prior-review adversarial harness was rerun against the original
hash in a disposable PostgreSQL17 cluster: **10 PASS /3 FAIL**, reproducing M1 at
workload/merchant locks and M2 through privileged NULL-result mutation.

The same harness, independent of the new regression implementation, then ran
against the corrected file: **13 PASS /0 FAIL**, including concurrent tuple
revocation, tenant/scope denials, no direct table read/update/truncate, spoofed JWT
non-authority and content-free audit attribution. This is an independent adversarial
verification path and separate security-review pass, not outside human sign-off.

New committed regression file: `tests/database/provider-expiry.test.ts`:

- **22 native concurrent cases** observe a real PostgreSQL Lock wait, cross expiry
  using database time, and assert denial plus unchanged financial/provider/audit
  state. Workload, merchant, independent authorization, intent, refund capture,
  attempt completion, email sender/domain/customer FK, and agreement binding/
  portal/signer/organization waits are covered. A local-only blocking INSERT
  trigger exercises the final post-DML rollback checkpoint.
- **27 portable cases** cover malformed terminal INSERT/UPDATE through maintenance,
  restricted finish/direct-DML denial, valid terminal transitions and immutability.
- Native transaction timestamps deliberately stay stale across all lock waits.
  No clock mocks, sleep-only assumption of a lock, hosted fixture or live provider
  response is substituted for actual PostgreSQL behavior.

| Validation                                | Actual result                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Entire npm check                          | **577 PASS /33 native-only skips**; lint, strict types, public types, both migration manifests and build PASS |
| Native PostgreSQL17.11                    | **265 PASS /0 skips**, 11 files; all 33 skipped cases run, including the 22 new races                         |
| Prior independent harness, corrected file | **13 PASS /0 FAIL**                                                                                           |
| Desktop/tablet/mobile browser             | **51 PASS**                                                                                                   |
| Original frozen package/logo              | **26 offline integrity checks PASS**                                                                          |
| Local exact catalog                       | 16 new empty default-deny RLS tables; seven fixed-search-path owner-only functions; zero uncovered new FKs    |
| Local historical catalog                  | 422 records and 69 column ACLs match approved hosted baseline                                                 |
| Generated types                           | Regenerated from local SQL; public type file unchanged                                                        |

Counts overlap; they must not be summed. The old red run is intentional proof,
not a current failing result. Formatting, diff and public private-reference checks
also PASS. First browser attempts encountered sandbox loopback
restriction and an occupied existing preview port. The final browser suite used
the same build/config/projects on isolated loopback port4283, preserving the running
preview. The CLI also needed normal local telemetry filesystem access. Neither
environment issue was bypassed by weakening application or provider controls.

A separate review pass inspected all seven function ACL/search paths and 24
successful branch exits, the new explicit post-lock checks, three centralized
completion paths and the named CHECK. No remaining M1/M2 bypass was found in the
reviewed scope. Owner-only access, default-deny RLS and empty capabilities remain
essential boundaries; owner/superuser DDL is outside RLS protection. Independent
release/security/legal/financial/provider acceptance is still required.

## Fresh connected read-only review and CLI plan

The privately recorded owner-designated development target identity was reverified:
ACTIVE_HEALTHY, PostgreSQL17.11. Existing nine stored migration statement arrays
match the prior approved evidence **exactly**; versions are unchanged.
All 422 current application catalog records match the prior read-only baseline,
and the local approved-nine reconstruction including 69 column ACLs matches.
No Auth/Storage internals, configuration or actual customer rows were modified.

Hosted advisors still describe the **unmodified existing database**:

- Security: zero WARN/ERROR,12 intentional private RLS/no-policy INFO.
- Performance: four existing Auth initplan WARN,21 unindexed-FK INFO,
  42 unused-index INFO and one Auth connection-strategy INFO.
- No remediation, private privilege cleanup or new-schema hosted advisor claim.
  [Existing RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy);
  [existing performance warning](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

Pinned CLI2.121.0 options were checked, then the exact target-specific dry run ran:

```text
npx supabase db push --dry-run --skip-vault --project-ref <private-approved-development-ref>
```

**Exit0, dryRun=true**, only `20261016185108_provider_sandbox_persistence.sql`,
`seeds=[]`, `roles=[]`. Normal temporary CLI migration-login initialization is not
a provider workload grant. No Vault update, migration push, reset, repair or seed.
Post-dry-run reads still show nine migrations, zero proposed provider tables and
zero active platform-admin grants. Private target/commands/raw evidence remain
ignored under `.staging/provider-remediation/`.

## Precise next approval and containment

Recommended separate owner scope: **one schema-only development application of
the corrected file and bundle hashes above**, through the reviewed pinned CLI
`db push --skip-vault --project-ref <private-approved-development-ref>`, after
refreshing target/history/catalog/hash and exactly-one-file dry-run checks.
No include-all/include-roles/include-seed, history repair, replay of the nine,
reset, production target or cached linked-target substitution.

The merchant index is transactional/nonconcurrent. Review an internal quiet write
window and bounded execution/lock cancellation before execution; empty-fixture
DDL timing is not a hosted performance/lock guarantee. Stop on any drift,
unexpected plan, timeout or uncertain response and inspect read-only before retry.
A private target-specific operation record is preparation, not authorization.

After any separately approved apply, verify the tenth history entry,16 private
default-deny tables/ACLs, seven revoked functions, unchanged public types/API,
empty capabilities, security/performance advisors and all runtime off gates.
Only then consider a separately reviewed capability/provider sandbox action.

Containment preserves the original review's financial-audit rules: transaction
failure rolls back; a committed dormant schema stays revoked and empty. Any
later correction is reviewed forward SQL. Never drop/truncate evidence, alter
terminal results, clear UNKNOWN/refund holds, repair history or issue a real
compensating transaction as rollback. Provider bindings, grants, test accounts,
signing trust validation, DNS/communications, isolated scanner/AI/Storage, protected
deployment recovery and independent Release1.0 validation remain BLOCKED/NOT RUN
until their separate prerequisites and authorizations exist.
