# Invoice connection preparation · disposable only

Exact parent #467 `7e25b50537fe66c19f5041e64bd2e59effc544c4` stays unchanged.
This package composes the original `CommercialCallerConnection`, opaque
`CustomerBrokerAuth`, `CommercialDraftClient` and existing private issuance/read
functions. It adds no business ledger, schema, operational connector or route.
The factory defaults OFF and admits only `ev_test_<32 lowercase hex>` databases
with the two exact dedicated fixture LOGIN/workload-role pairs. No credentials,
connection string loader, service-key client, SDK upgrade or role provisioner exists.

## Qualified boundary

A trusted test lease supplies a dedicated connection. Before claims initialization,
actual database/PID/backend-start identity is reserved across different wrapper
objects. An alias cannot overwrite another actor's claims or destroy its lease.
The LOGIN must be current_user/session_user, unprivileged, INHERIT and a member
of only its named workload role with both MEMBER and USAGE. The separate NOLOGIN
runtime must have no memberships or dangerous flags. Catalog/source checks bracket
every query; original opaque Auth/current-session/AAL2 checks still bracket the
original caller's actions. Seven exact dependency hashes are pinned in source.ts.
GUC consistency is never authentication; verified identity supplies those claims.

Native PostgreSQL exposed a real fixture mismatch: SET ROLE to NOLOGIN hides
`pg_stat_activity.backend_start` from the effective runtime role. A separate
minimal probe proved NULL after SET ROLE and the real timestamp after RESET ROLE.
The correction keeps the dedicated LOGIN with its single inherited restricted role,
matching the original caller contract. No null/fabricated timestamp, stats grant,
new source exception or protected-caller edit is used.

Draft create/Save/reopen uses the original client. Per-source factory ownership and
ambiguous-write barriers persist across participating leases; only the original
client's exact receipt reconciliation may clear its source barrier. A new lease
can read an existing receipt but cannot silently obtain replacement draft-write
custody. Latest or older-command reads cannot release UNKNOWN: the new admission
metadata requires the frozen original write, command, actor/session and canonical
request hash as well as the original client's exact receipt proof. Cross-lease draft-write advancement remains **HELD**. Commands are spent
across draft/issue workloads in the process; no changed invoice/command retry follows
UNKNOWN. Unknown destruction acknowledgment quarantines all participating factory
handles rather than freeing or automatically reacquiring the backend.

Issuance binds exact organization/customer/property/invoice/source/revision, current
actor/session/AAL2, the existing separate SQL issuance authority and the original
`issue-v1` request hash. One issue attempt reserves synchronously before awaiting.
Malformed/contradictory results, failure or post-await revocation remain UNKNOWN.
`readOriginal` reads exact persisted evidence but does not clear an UNKNOWN hold;
`reconcile` requires the stored original command, actor/session, full target and hash.
The safe projection never exposes bearer, staff actor, session or private source/hash.
Its receipt proves issuance only; payment, delivery and settlement are unverified.

The fixture numbering token `FICTIONAL_FULL_UUID_ONLY` is not owner acceptance.
Real policy `INV-` plus the full lower-case UUID without hyphens still needs a
separate owner decision. `NOT_ACCEPTED` denies before issue dispatch. All operation
and target IDs must be exact canonical primitives, never coercible objects.

## Verification and limits

Run the new unit/source tests with Vitest. New native cases use the existing
`EV_TEST_PG_SOCKET`/disposable CI PostgreSQL harness; PGlite explicitly skips them.
Native coverage includes strict LOGIN/runtime privilege checks, genuine SQL Save/
reopen, revision locking, immutable issued number/receipt reopening across leases,
original lost-ACK reads, competing connections, wrong tenant/customer/source/actor,
current-session and invoice-authority revocation, cross-lease draft quarantine and
an original draft receipt followed by separately reviewed revised issuance.

Early native12 failed before dispatch under SET ROLE. After the scope correction,
12 passed. Two added lost-draft-ACK cases then exposed test-fixture source reuse:
permanent source ownership correctly rejected a later test before its intended
fault. Every case now creates an independent issued source using the canonical
estimate engine; it never clears factory holds and asserts one actual mutation
before testing lost ACK. A separate cleanup-negative test caught a synchronous
throw/API mismatch; `issue` now consistently returns a rejected Promise while still
reserving before its first await. A later independent review found a latest-read fence-release gap; full original
write/receipt matching and explicit latest/older-read negatives now close it in
this new adapter, without changing the protected client. Final counts and
independent hashes are in the PR.

All holds and cleanup quarantine here are process-local admission metadata. Restart,
coherent rollback, independently durable spent authority/ACK and all-writer fencing
remain **UNVERIFIED**. The acquire/Auth ports are controlled fixtures, not approved
hosted adapters. These tests do not accept genuine Supabase Auth, target grants,
production privilege completeness or D1–D3/A01–A12.

## Exact next installation/acceptance inputs

The existing draft SQL hash `e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c`
and issuance SQL hash `961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022`
remain **NOT INSTALLED on an operational target**; their development-source
integration is already approved and applied in #467. The existing NOLOGIN issue
runtime receives only the two EXECUTE
signatures recorded in source.json; no customer/service grant or operational LOGIN
is proposed here. Required owner bindings are the exact nonproduction target,
installed-history/object/owner/grant hashes, installer and runtime principals,
current Auth/MFA/session RPC and tenant mappings, immutable source/revision and
invoice-specific authority tuple, numbering decision, bounded acceptance window,
independent custody/fence and backup/recovery evidence. No live values are in Git.

Do not install based on those hashes alone. Installation and genuine Auth/issuance
acceptance require separate exact authorization after the original prerequisites.
Any failed/uncertain install or acknowledgment stops further writes; no replay,
replacement identity, receipt rewrite, DROP/rollback or recovery is authorized.

Saul 2 Paul first; Cunningham requires separate tenant/customer/Auth/merchant and
settlement acceptance. VAR/NMI and customer publication/read/delivery/payment-link
contracts remain separate. Customer intake SQL stays HELD. No provider/hosted call,
message, financial action, live tenant, merge, deployment or recovery occurred.
Release 1.0 remains **NO-GO**.

Official references checked without signing in: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[current-session validation](https://supabase.com/docs/guides/auth/sessions), and
[changelog](https://supabase.com/changelog.md). Existing pinned SDK semantics and
strict session-row checks are preserved; no CLI, dependency or Auth API change.

Final independent qualification: **32 unit/source and 17 native cases PASS**, zero
failures/skips. Reports SHA256 `ee76ce01da59e1c9d25cc4654f1c8f5138b8d18d3b3483fc9aaa16976c5bf16c`
and `6eec4a060b473f88e5b5e2de437fa63d376dc86d9b37add59e0882267560f8a9`.
These are controlled disposable results, not genuine hosted acceptance.
