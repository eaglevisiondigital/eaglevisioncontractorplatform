# Default-OFF finite customer invoice reader

This source candidate fills the missing server-only `authorize`/`readIssued`
implementation behind #500's existing customer invoice bridge. It reuses the
original opaque SDK Auth/current-caller wrapper, immutable issuance projection,
customer preview and safe public decoder. Existing source, schema, grants,
application routes, stores, invoice/payment engines and approved UI are unchanged.

Only controlled fixture principals and an owned disposable native PostgreSQL 17
cluster are exercised. `enabled` defaults to false; the only permitted mode is
`disposable-proposal`. The existing internal bridge still says `fictional-local`
and `unwired-test-port`. Neither label is genuine operational Auth acceptance.
There is no connection/credential factory, installer, route or customer delivery.

## Private authority and proposed SQL/grant difference

`binding.ts` accepts a strict, own-data private scope: restricted runtime LOGIN,
trusted existing NOLOGIN owner, user/session, organization/customer/location,
invoice/source version/hash/revision, original issuance command, review UUID and
UTC expiry in milliseconds. Values must be entered only in approved private
owner-local storage; never commit or log an actual binding. The renderer accepts
only the sealed templates and returns SQL **data**. It does not execute or write
it. SQL function body hashes are derived internally from those exact templates
and scope; a caller cannot substitute its own expected function hash.

The compiled scope plus a separately approved dedicated EXECUTE grant is the new
finite commercial invoice-read authority. A portal identity is an additional
current identity check; neither a caller-supplied scope, a portal preference nor
an estimate/staff permission creates this authority. A staff member in any
organization or a platform administrator is denied as a customer-only identity.
The single-invoice scope is for bounded nonproduction acceptance, not an accepted
production authorization-store design.

`read.proposed.sql.in` is **UNAPPLIED and not a migration**. Relative to #500 it
proposes only:

- EXECUTE for the existing trusted invoice NOLOGIN owner on the original
  `private.is_platform_admin()` helper.
- SELECT on exactly the four existing `portal_identities` columns
  `organization_id`, `customer_id`, `user_id`, `active`, for that owner.
- One owner-only SELECT policy on that existing RLS table. No new business table.
- Two zero-argument, VOLATILE, SECURITY DEFINER functions, empty `search_path`,
  owned by that owner; public/anon/authenticated/service-role EXECUTE revoked.

`runtime-grants.sql.in` separately proposes only private-schema USAGE and EXECUTE
on those two functions to the one dedicated restricted LOGIN. It creates no role,
role membership, raw table/column access, grant option or unrelated helper access.
The four-column ACL, owner-only policy and helper EXECUTE intentionally expand the
trusted existing owner TCB; they require exact-target independent privilege review
and separate SQL/grant installation authorization. Source preparation does not
admit this expansion operationally. No existing protected SQL file is edited.

## Read and denial behavior

The adapter checks exact current database/backend/start/LOGIN, original opaque
Auth user/session/AAL2, source snapshot, role/catalog profile and fixed scope before
and after awaited reads. The raw wire accepts only the original caller inspection,
fixed catalog read and two zero-argument SELECTs. A gate at actual dispatch prevents
a cancellation or deadline arriving during an awaited Auth check from dispatching
another query. Concurrent reads quarantine the same connection object.

SQL validates current session/user, active organization and customer identity,
customer-only status, issued source/header/revision/total/hash and original issue
command. After the earlier header/source wait, one terminal READ COMMITTED SELECT
rechecks these together, including late staff/platform activation. There are no new
row locks or UPDATE grants. `readIssued` brackets the original immutable issuance
projection and version read with that authorization. Repeated server checks reject
changed mappings, original number/receipt, installed bodies, grants or source.
Only the original customer-safe projection leaves the exported surface; raw source
hashes, full estimate versions and staff receipt internals stay server-local.

Errors are redacted as UNKNOWN. Missing/malformed/late acknowledgments, revocation,
withdrawal, timeout or cancellation suppress the result and retire the observed
connection object after dispatch. There is no replay/resume/financial command.
Actual driver cancellation, socket discard, connection aliases and cross-process
pool fencing remain unqualified and must be handled by a separately reviewed real
connection owner. This source does not claim durable custody from a WeakSet.

## Verification and honest limits

New final-source primary tests: **65 unit controls and 23 native PG17 cases passed,
zero failures/skips**. Native cases execute the actual original migrations and
invoice SQL plus this new proposal in an owned TCP-disabled cluster, using explicit
synthetic fixture roles and controlled SDK Auth. Cleanup stopped and removed the
cluster. They include actual permission denials, original receipt/yearly numbers,
revocation, changed body/role/RLS/ACL, public-helper collision, READ COMMITTED,
stale original source, and observed PostgreSQL header-lock waits followed by
organization/source/staff/platform withdrawal. No original assertion or budget was
changed. Primary development failures and review findings were corrected before
final qualification; this is not a claim that initial attempts all passed.

An independent copy passed the same **65 unit and 23 native cases**, zero failures
or skips; the exact frozen runtime/templates/tests and all 2,468 parent files were
verified. Independent unit report SHA256
`3a857cff0ea88ea003f92184fab10f1081c4ac99fbef790ca4879af349201f92`,
native report SHA256
`32ca9c7e61a448eaad31638f561d9d63d30e8d347e347af89c2d00919b807370`.
Reports are retained in persistent owner-local evidence and overlap the same cases;
they are not added to the totals. Existing browser/UI evidence is
retained only for unchanged #500 source; no new browser or hosted acceptance is
claimed. `source.json` pins the dependency/source closure and original SQL/history.
The source verifier, static imports, Node/SDK/driver and installed original helper
bodies remain trusted TCB; this is not an independently sealed module loader or
proof against coherent privileged source/catalog/manifest replacement.

Native tests deliberately characterize that the raw dedicated LOGIN plus an exact
unsigned SQL claims GUC can read its fixed scope. The opaque SDK Auth and current
backend wrapper are therefore essential server trust boundaries. No GUC alone is
signed Auth, and the SQL roles/installer remain privileged fixtures. Current hosted
helper bodies, grants/default ACLs, writer/bypass inventory, real AAL2/session
revocation and pool custody are still UNKNOWN. A terminal snapshot cannot fence a
privileged administrator changing state afterward or restore an earlier database.

## Smallest genuine-Auth checkpoint

Reuse the original D1 return in Issue #358. Privately bind the exact nonproduction
target/history, source and rendered SQL/grant hashes, installer, trusted NOLOGIN
owner, dedicated LOGIN, customer/user/session/invoice and original command, UTC
window, independent reviewer, STOP conditions and cleanup/revocation owner. Review
all transitive helper permissions and actual writer/bypass paths. Preserve D2
independent one-use/ACK/spent fencing and D3 independent recovery/quarantine plus
the original recovery/P1-on-thirteen/customer14/4B ordering. Do not replay consumed
attempts or treat synthetic native evidence as satisfying those gates.

Only after those decisions can the owner separately authorize exact catalog/Auth
preflight and, at a distinct approved checkpoint, this rendered SQL/grant
installation and one read-only nonproduction invoice acceptance. No such action is
authorized here. Routes, real tenant onboarding, receipt publication, NMI sandbox
and real customer access remain separate. Saul 2 Paul stays first; Cunningham needs
its own tenant/customer/Auth/merchant/key/settlement acceptance. Original A01–A12
operational cases remain NOT RUN; Release 1.0 remains NO-GO / NOT AUTHORIZED.

Reference contract: [Supabase database functions](https://supabase.com/docs/guides/database/functions)
and [session lifecycle](https://supabase.com/docs/guides/auth/sessions). These are
public documentation references, not project calls or installed-target evidence.
