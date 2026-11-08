# Intake current-authority regressions

This is a six-file test package on exact PR313 source
`112110e30bd7b0400b96f75e26d12bffd70bea57`. It changes no application, Operations,
SQL, Auth, schema, source pin, original test, CSS, or product route. The original
inquiry/customer/property IDs and original assignment writer remain authoritative.
An ordinary intake RPC returns `void`; neither its acknowledgement nor UI success
is an immutable receipt, revision/CAS, one-use intent, or durable custody.

## Boundaries under test

The sample branch of `Operations.companyAccess` has no caller actor and reports
capabilities for the synthetic company. Its intake reader is a source filter; its
assignment writer checks the actual current assignee. Accordingly the browser
fixture never claims that a `canManage` prop, captured member list, or sample owner
withdrawal proves current caller authorization. Connected caller access is a
separate native SQL scope.

The original `private.assign_intake` checks `private.can` before its row update.
The new native regressions require an ordinary `42501` denial and no canonical
mutation when caller membership or the intake module is withdrawn during an
observed row-lock wait. That requirement is not a declaration that the original
implementation passes. Any fulfilled write after the observed, committed
withdrawal is a security blocker, retained as an ordinary failed assertion. No
`test.fails`, skipped case, or expected-permissive conversion is used.

The native file has seven families for each of the three original brands: active
caller exact reads/assignment; caller revoked before reads; caller revoked after
an actual read; selected assignee revoked before assignment; assigned-field
read-only/foreign-tenant separation; caller withdrawal during row wait; and module
withdrawal during row wait. The last six cases use distinct actual PostgreSQL17
backends, the original row lock, its exact waiting RPC PID and blocker PID, and a
committed original `manage_member` or `configure_company` call before releasing
the lock. Raw witnesses retain before/withdrawn/after rows and membership/module
state even when the required denial fails. Bootstrap, all fourteen checked-in
migrations, RLS and original RPCs are unchanged. JWTs are explicit synthetic SQL
fixtures, not genuine Supabase Auth or hosted acceptance.

## Separate browser evidence

The new browser file has four families per brand and runs in desktop, tablet and
mobile Chromium emulation: an already captured member result followed by actual
assignee revocation; revocation after ordinary selection but before assignment;
source-read error/pending filter with explicit UI-only visibility withdrawal;
and failed member lookup without invented employee choices. It delegates to the
actual original `Operations` methods and actual `IntakeQueue` through a test-only
intercepted document. Delays and transport errors are test-only wrappers. No App
route, server, HTML file, replacement business store or authorization mock is
installed. Canonical request rows, IDs, rejected commands, full Axe results,
keyboard focus, overflow, PNG and trace are retained for each case. All external
requests are aborted and counted. Emulated devices are not physical-device proof.

The first and only local browser run passed all 36 distinct new cases with no
skip, failure or flaky result. It used the original 30-second test budget,
5-second expectation budget, one worker and zero retries; the maximum case took
1,582 ms. Report SHA256:
`a93fe11b55078055420bc69e2bdfd0982db1f919a10019a2a7b40a450c72f242`.
Sorted project/title identity SHA256:
`399a9108d7d7ca8dde7acac9894ec9137d50f2691585aa0d2a64db67b5f1f461`.
These results do not establish caller authorization. The original successful
PR313 fifteen-case cohort was not repeated.

## Native execution admission and unresolved outcome

The initial task-owned local PostgreSQL17.11 `initdb` failed before bootstrap:
`could not create shared memory segment: No space left on device` (`shmget`).
This is a shared-memory infrastructure failure, not an observed SQL denial or a
disk-space diagnosis. No native test ran: **21 NOT_RUN locally**. No other local
cluster, IPC object, kernel setting or private recovery folder was inspected or
changed. Raw startup error and source binding are retained privately.

The initial unpublished file was provisionally named
`tests/database/v1-intake-current-authority.test.ts`, SHA256
`d2b2c78acb5c49b52df65d743ee112f1d122e693169bdaacff42cf9375f2b0cf`.
Source review found that the unchanged default `tests/**/*.test.ts` collection
would include this new native-required file without independent PostgreSQL
sessions. Before first freeze it was renamed, byte for byte, to `.spec.ts` and
admitted only by `tests/program/vitest.v1-intake-native.config.ts`. That config
spreads the original Vite config and its test options, replacing only `include`.
Original 30-second test/hook budgets and four-worker default remain inherited;
the dedicated command selects one worker and zero retries. Missing native/fork
support is an explicit error, never a skip. Original default collection is
unchanged. Provisional source/review and the startup failure remain historical.

Runtime collection with `--staticParse=false` resolved exactly 21 literal native
identities; collection executes no test or bootstrap hook. Default Vitest5 static
parsing returns template names and is not a 21-case execution result. Sorted
native title SHA256:
`4336945f3eb65db9c29739c266ae71aa0b3a44e590fc92a2e09e2d3b027f4e49`.

The dedicated workflow has independent native and browser matrix jobs with
`fail-fast: false`. Only the native job starts a disposable PostgreSQL17 service;
only that job receives the explicit original engine's CI-native selector. The
browser job can report UI capability even if required SQL denial fails. Each job
binds the sole parent, exactly six added regular files, candidate or same-tree
original-base PR carrier, actual Actions checkout SHA, and all 2,199 tracked
file bytes before/final. Raw failures are uploaded, not retried or aggregated
into acceptance. Any existing partial native witness files are also copied in
`finally` as raw/unvalidated evidence, independently of strict 21-case witness
validation; an early hook/assertion/lock-observation failure cannot suppress that
copy merely because the complete witness set is absent. Current hosted outcomes are pending before publication.

All original release gates remain: Foundation and other cohorts are separate;
D1's eleven roles remain UNASSIGNED; D2/D3 and A01–A12 are separate/NOT_RUN.
No caller-authority, genuine Auth, connected readiness, customer approval,
contract, completion, payment, message, deployment or operational acceptance is
granted. Release1.0 remains NOT READY / NOT AUTHORIZED.
