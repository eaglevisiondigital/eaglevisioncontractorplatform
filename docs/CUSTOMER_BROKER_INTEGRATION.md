# Workstream 4B · server broker and restricted database integration

October 31, 2026 · base `0b0c47103c3f864de49fc33f484b60d76d8baeb3`.
**Implemented locally. Operational installation and genuine connected acceptance
remain NO-GO. Release 1.0 NOT READY / NOT AUTHORIZED.**

## Working composition

`server/customer/broker.ts` composes the existing 4B gateway, decision ledger,
receipt parser and eligible staff reader. It does not use the 3A in-memory decision
system. The new composition accepts explicitly injected, separately restricted
connections only to an actual disposable `ev_test_<32hex>` native PostgreSQL 17
database. It has no connection-string factory, credential loader, HTTP endpoint,
App import or connected route. Constructing the broker without that database port
leaves commands and reads disabled. No application capability is enabled.

`broker-auth.ts` reuses the pinned `ConnectedCustomerSdk` and its existing token
custody/capture mechanism: exact-bearer `getUser`, followed by the current session
RPC. Only after those checks does the server inspect the authenticated JWT's subject,
session, target issuer, authenticated role/audience, MFA level and expiry. An opaque
server-object proof expires after 30 seconds; browser JSON cannot manufacture it.
The bearer is never persisted in SQL metadata. No sign-in, token refresh or service
key fallback was added. SDK protocol tests use a controlled provider; they do not
prove genuine hosted Auth acceptance. See the official
[getUser contract](https://supabase.com/docs/reference/javascript/auth-getuser) and
[session identity contract](https://supabase.com/docs/guides/auth/sessions).

The browser-shaped intent permits only organization/publication selectors, a review
choice, literal safe explanation, exact acknowledgment and explicit confirmation.
It rejects client user/session IDs, principals, role names, source versions and
hashes. SQL derives the customer/property/issued version/scope from the currently
authorized publication. These selectors never confer authorization. Customer reads
require the exact current own identity/mapping; staff reads independently require
current eligible tenant membership, session and MFA. Customer and staff authority
are not interchangeable.

## Admission, claim, commit and exact receipt

The separate `broker.proposed.sql` proposal follows unchanged customer14 and the
unchanged 4B forward proposal. Its private append-only admission table contains
command custody metadata and foreign keys, not a second business ledger. It stores
server-generated request/principal IDs, exact source/body hashes, user/session,
bounded expiry and actual issuer/executor/backend/start/full-XID binding. It does
not duplicate the customer's note or bearer. The original business decision and
receipt remain in the existing private ledger.

The consumer starts its exact transaction. A separate registrar commits principal
registration and durable target admission before the existing independent issuer
commits the original 4B claim. The original one-shot writer then commits the decision
and outcome reference atomically. A new trigger rejects claims without an exact
committed broker admission. Current mapping/source/session/role checks and original
rollback-resistant sequence protections remain. Server admission is unique for the
same tenant/user/issued version across new IDs, principals and publications.

Missing acknowledgments, timeouts, interruption and conflicting evidence remain
UNKNOWN. No automatic replay, rebind, replacement ID, publication bypass or phase
continuation exists. An exact receipt read can reconstruct the original reference
from committed admission metadata after a lost acknowledgment, then delegates to
the existing receipt reader. It never resumes the command. Admission before the
old claim therefore survives a client restart without permitting a new attempt.
An expired publication may allow an exact own historical receipt; it never reopens
the estimate document. Revoked user/session/mapping continues to deny the read.

The registrar/issuer/executor/reader use four actual distinct LOGIN backends. Every
query checks the pinned database, backend PID/start and session/current role before
and after execution. Backend replacement or SET ROLE fails closed. Mutator leases
are destroyed after the attempt; reader claims are transaction-local and clear on
commit/rollback. There is no pooled-session return or concurrent use of a reader.
Issuer/executor pairs are finite, separately pre-provisioned and one-use, preserving
the original 4B role-pair uniqueness. The broker creates no roles or runtime grants.

## Ownership and privilege evidence

`broker-ownership.proposed.sql` is a separate local ownership/grant review, not an
operational installer. Disposable tests actually transfer the new 4B/broker functions
to three distinct NOLOGIN/NOSUPER/NOBYPASS/NOCREATE/NOINHERIT owners. Tables retain
separate installer ownership, forced RLS, explicit per-owner policies and runtime
revokes. UPDATE grants used for row locking have false write checks; tests prove
they cannot modify publication rows. Function search paths are empty and exact.
Definer SELECT grants on estimate versions exclude private payloads; Auth reads
exclude email. Runtime LOGINs have only their narrow function EXECUTE and schema
usage, with no raw table/column CRUD, helper calls or role memberships. Public,
anon, authenticated and service_role receive no new broker/writer authority.

`broker-ownership.ts` checks the actual catalog at construction and again at dispatch
and reads. Owner flags, API grants, forced RLS, role memberships/SET authority and
private-column grants must match. Function-owner drift and a newly granted private
payload column both block before admission. Tests use actual restricted LOGINs and
actual backend replacement, rather than trusting supplied PID results.
[PostgreSQL 17 membership options](https://www.postgresql.org/docs/17/role-membership.html)
matter: NOINHERIT alone does not prevent SET ROLE. The one reviewed core statistics
membership has INHERIT true and SET false; runtime membership is forbidden.

These are scoped local privilege proofs, not a fully deprivileged operational TCB:

- Existing portal/source/session/staff/audit/immutable SECURITY DEFINER helpers and
  the installing/provisioning owner remain trusted dependencies.
- The frozen core claim needs private-schema CREATE for its private one-shot
  sequences and `pg_read_all_stats` for the independent consumer backend. Their
  operational exposure still needs explicit review.
- SQL receives an attestation from the trusted server verifier, not a SQL-verifiable
  bearer signature. Genuine provider/session acceptance and secure dedicated
  connection/credential custody remain unverified.
- Client SIGKILL tests prove committed custody across client-process loss. They do
  not prove database/disk/power recovery or protection against restoring a snapshot
  taken before admission. An independent external custody/restore anchor is absent.

The catalog review therefore returns `operationalReady:false`, even when its scoped
checks pass. No local result grants installation or operational authority.

## Focused validation

Run `npm run test:customer-broker-native` for the 39 new native cases. The runner
creates a UTF-8 disposable PG17 cluster with TCP disabled and removes it afterward.
All three existing sample companies use actual issued versions/publications,
synthetic Auth/session rows, restricted registrar/issuer/executor/reader LOGINs and
the existing persisted decision/receipt/staff contracts. Controlled Auth transport
still executes the actual SDK verification protocol. No genuine Auth session is used.

Cases cover tenant/property/source isolation, strict intent/proof/default-off guards,
current mapping/publication/user/session/member/MFA checks, observed authorization
revocation during row-lock waits, competing admission, direct CRUD/helper/SET ROLE
denials, owner/column drift, connection replacement, immutable issued sources and
absence of job/contract/invoice/payment/outbox effects. Four actual child-process
SIGKILL phases exercise after admission, after committed claim, after uncommitted
mutation and after commit before acknowledgment. Fresh reads confirm only committed
results; every other outcome remains UNKNOWN and attempts stay held. Separate cases
lose registrar COMMIT, writer acknowledgment and consumer COMMIT acknowledgments.

The shared gateway refactor also passed the original 52 native 4B cases, including
its nine actual React-to-SQL-to-staff browser flows. The completed behavior is reused,
not reimplemented. Focused SDK/authorization/request application tests and existing
closed-route browser/accessibility regression evidence are in
`CUSTOMER_BROKER_VALIDATION.json`. No customer/staff UI was changed or redesigned.

## Required next acceptance sequence

Local implementation does not close the independent physical recovery gate. Retain
the already completed setup, connectivity and 25 offline checks; do not repeat them.
Actual supported/encrypted independent hardware, pairing, supervised primary-loss
recovery and separately scoped genuine hosted recovery verification remain pending.
The original frozen P1 approval remains valid against thirteen historical migrations;
no duplicate P1 approval is requested.

After those prerequisites, use the existing original P1 preflight/approval. Customer14
installation stays separate. Then review the exact unchanged 4B hash plus the two
new broker/ownership proposal hashes, target-specific owners/grants, external custody,
dedicated connections and current mappings/publication. Only a separately authorized,
internally operated genuine customer request → exact receipt → eligible staff read
can establish connected acceptance. No new feature package is the next step.

All thirteen historical migrations, pending14, original 4B source, frozen P1/four
artifacts, original Netlify package/executor/evidence, approvals, locked interfaces,
2A–2F and six proposed billing enhancements remain protected. No hosted write,
credential retrieval, genuine Auth sign-in, delivery, financial/provider action,
deployment, publication or merge occurred.
