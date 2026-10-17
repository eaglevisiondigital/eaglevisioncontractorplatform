# P0 · connected property operations readiness

Latest: [final two-file preflight](PROPERTY_P0_FINAL_PREFLIGHT.md) now PASS;both
migrations remain UNAPPLIED / NOT AUTHORIZED. Earlier no-dry-run statements below
record the original P0 implementation checkpoint. All activation gates remain off.

**LOCAL REVIEW GO for separate dormant migration approval. Hosted execution and
activation are NOT AUTHORIZED. Release 1.0 NOT READY / NOT AUTHORIZED.**

## Prepared architecture and security review

`ConnectedPropertyOperations` preserves the supplied authenticated Supabase client
and verifies `auth.getUser()` before each command, workspace or report request.
There is no service key, caller-selected authority, privileged CRUD, sample fallback
or automatic write retry. It is intentionally unwired from navigation and the
synthetic preview repository. Generated public types describe the pending wrappers;
they do not mean those functions exist hosted.

The first proposed migration adds three SECURITY INVOKER, fixed-empty-search-path
public wrappers: `property_command`, `property_workspace`, `property_reports`.
Only authenticated receives EXECUTE. Existing checked staff functions still enforce
current tenant membership, owner/admin MFA, feature/module permissions, assigned
jobs, CAS, immutable snapshots and resource ownership. No private table is exposed.
A checked, data-free session helper locks the actual Auth session for this UID,
checks `not_after` and JWT expiry using wall-clock time after waits, and fails closed
on missing, revoked or malformed sessions. Command/workspace wrappers repeat the
check after the operation, rolling back side effects if it expired while blocked.

Reports use a new, empty `private.property_report_access` table with RLS and no
client/service-role table privileges. Composite foreign keys bind organization,
customer, property and existing portal identity. The maximum lease is one hour from
creation, finite and nonextendable. Updates may only revoke once; deletion and
changing tenant, customer, user, property, approval reference or expiry are denied.
Renewal appends a new lease after revocation of the previous row. Metadata audit is
append-only. No lease/mapping authoring RPC or generic management endpoint is added.
Exact operator operations for any future mapping/lease creation require review.

The report reader checks active organization, enabled property feature and estimating
module, verified Auth identity, current exact customer mapping and report-only lease.
An owner/admin who is also a customer still needs AAL2. Locks serialize concurrent
revocation; post-wait session and lease expiration are rechecked. It does not call
or grant the broad internal-release environment or financial workflows. Current
release mode stays disabled. Reports contain only immutable published snapshots,
with explicit allowlisted findings/checklist, bounded 50-record cursor pagination
scoped to that property and customer, and empty media. Internal notes, supplier
costs, margins, draft reports and financial objects are excluded. The adapter also
rejects unexpected nested fields and foreign context. Customer identity verification
policy and actual hosted sessions still require acceptance; tests are not identity
proof. Existing private legacy portal code is unchanged and remains unexposed/off.

## Duplicate-index conclusion

Read-only hosted catalog inspection found identical UNIQUE btree indexes on
`public.service_locations(organization_id,id,customer_id)`:

- `location_customer_unique` backs the original unique constraint and four installed
  foreign keys (estimate versions, intake, inspection plans and inspection reports).
  Retain it. The new report-lease FK also depends on the retained constraint.
- `property_location_customer` has no constraint or dependency consumer and is
  redundant. Do not edit the installed historical migration that created it.

The separate cleanup proposal checks exact index equivalence, validity/readiness,
retained constraint and absence of duplicate dependencies before a non-CASCADE DROP.
It uses a two-second lock timeout and ten-second statement timeout in one transaction.
Failure rolls back; no retry or partial cleanup. This ordinary transactional DROP
requires a separately approved short maintenance window. It is not CONCURRENTLY.
A 5,000-row/two-company disposable test uses EXPLAIN ANALYZE BUFFERS before/after:
both return the same row, the surviving constraint index serves the query, all data
and FK consumers survive, foreign-tenant inserts fail, held locks cause a real
bounded rollback, and a child FK write still waits correctly on the parent lock.
This is representative local evidence, not a hosted performance benchmark.

## Proposed migration package

Both files were created with pinned Supabase CLI 2.121.0. No seed/role file, feature
row, user grant, identity, provider capability, Storage change or backfill is included.
Install order is readiness first, cleanup second. Each requires exact owner review.

- `20261017024327_property_connected_readiness.sql`
  SHA-256 `6bb0b9bf22ec1079d7aa5f74c6e33e14534cc54e30e9034c33949f786cfd3ac9`.
- `20261017024328_property_duplicate_index_cleanup.sql`
  SHA-256 `3603fe0482f46b9733a0321cd9009cb1f291993fcbede7132e1bdf721776fdfc`.

Canonical two-file bundle SHA-256: `5349a3b175a55bd6f360819c7942fc74f69d9a29c1765a058e20df1319df6dea`.
Full proposed 13-file bundle: `ef6151b4c111f3907205feff27b6f343e34d785e4364209ad7a9f85f2b4ff12d`.
Installed 11-file bundle remains `15a2b9c67766564e91efe7cf3347a7138a10b1a722a5d295ce1f7f3613a2f17e`.

Canonical bundle hashing uses SHA-256 of JSON.stringify of ordered
`[{file,sha256},...]`, without whitespace. The offline checker separately freezes
all original manifests and the 11 installed SQL files. No target CLI dry run was
run for these unapproved proposals. Before later execution, refresh target identity,
all 11 migration statements/catalog/ACLs/Auth settings and exact hashes, then require
a two-file/no-seed/no-role CLI dry run and separate execution authorization.

Containment: leave features and report leases absent, revoke any later exact lease,
close its sessions and disable only approved feature rows. Preserve reports,
expense/change decisions, published versions and audit history. Never roll back by
dropping immutable data. If cleanup fails on a dependency/lock, stop and re-review;
restore an index only through separately reviewed forward SQL if a real need arises.

## Hosted read-only evidence

The installed 11 migration versions and 500 application catalog fingerprints still
match the approved native schema; all 79 prior business-table count/content digests
match the post-install baseline. The new P0 access table/wrappers are absent.
Property feature rows remain zero; 22 identities/four verified factors are preserved;
zero Auth sessions, active platform/release grants and provider workloads. This
increment performs no hosted writes or authentication. Prior security-advisor result
was zero WARN/ERROR; prior performance finding remains unresolved hosted. No advisor
cleanup is implied by this local review.

## Connected acceptance preparation

`npm run property:acceptance-plan` is an offline compiler, with no network client,
credential reader or execution option. Private read-only bindings cover the existing
Straight Edge Property Services, Cunningham Construction and Sample Roofing Contractor
customers/properties/jobs/issued versions. The 24 scenarios per company remain
**72 NOT RUN**, not 72 passes. Cross-company resources cannot be shared. Every case
has both foreign companies, expected denial/value, genuine caller/AAL requirements
and private evidence/cleanup requirements. See PROPERTY_CONNECTED_TEST_PLAN.md.

No compatible existing approved unmatched purchase was found. The exact private
proposal therefore adds one explicitly synthetic manual materials expense and one
management approval per company through existing checked expense RPCs. It does not
edit or relabel an old purchase, use fixture malware verdicts or upload a receipt.
Each company proposes 25 positive RPC steps and 19 domain rows: two plans, four
visits, four immutable reports, one comparison, four decision revisions, one proposed
change, one nonpayable supplemental draft, one expense and one expense review.
Total: 75 positive RPC steps / 57 domain rows, plus append-only audit events. Negative
cases are separate assertions, not additional approved fixture rows.

Proposed synthetic actual-cost delta is 10,001 minor units per company, posted once;
12.50% markup yields 11,251 minor units using integer half-up rounding. Customer debt
delta is zero. Job revision delta is +5; baseline estimates and prior rows remain
unchanged. Weekly/monthly visits include month-end anchoring. Owner, assigned field
and estimator aliases use existing memberships; missing assignment is BLOCKED until
separately approved, never silently granted. Refresh quotation dates, exact bindings,
original-row digests and revisions before execution. Whole-table baseline hashes
alone do not prove old rows are unchanged after approved appends: a future runner
must retain per-original-row digests and verify only reviewed additions/job revisions.

Read-only roster/membership checks bind18 existing actor aliases: three active
owners, three active estimators, three field workers already assigned to the selected
jobs, three unassigned field actors, three inactive revoked actors and three customer
actors. No membership or assignment additions are currently needed. None of the
three selected customers has an active portal mapping. Therefore customer acceptance
is BLOCKED on a reviewed mapping-only creation operation plus report-only leases;
there is no authoring endpoint or authority to enable the broad financial release
mode. Expected control additions would be three feature rows, three exact existing
customer mappings and three report leases, separate from the57 domain rows.
Propose15-minute operator-supervised leases, always below the enforced one-hour cap.

No connected executor or hosted fixture activation is included. Future exact scope
must separately authorize three feature rows, any required checked job assignments,
verified portal mappings, report-only leases (at most one hour) and genuine
owner-assisted existing-factor MFA sessions. Do not enable the broad release mode
or grants. Cleanup revokes only those leases/features/sessions, preserves synthetic
immutable financial/audit history and records every PASS/FAIL/BLOCKED/NOT RUN.

## Verification and remaining gates

Final validation:

| Check                         | Result                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| `npm run check`               | PASS;708 tests,49 native-only skips;lint/types/migration checks/build pass |
| Disposable PostgreSQL17.11    | 339 PASS,zero skips;14 files,real concurrency                              |
| Browser desktop/tablet/mobile | 63 PASS,port4177;owner preview untouched                                   |
| Formatting / frozen package   | PASS;26 offline frozen-package checks,no network                           |
| Hosted property cases         | 72 NOT RUN;zero fixture/feature/access writes                              |
| Media/customer activation     | BLOCKED;no approval or verified infrastructure                             |

Counts overlap. The final compiled-fixture test uses current job revisions and
baseline-relative report counts, and restores only disposable positive-case owners
after native revocation cases. Earlier test-only baseline assumptions were corrected;
production CAS and revocation denials remained intact. No test reset is a hosted
fixture procedure. Final local/native runs have zero failures.

Local tests include the compiled 75-step proposal against disposable tenant data,
strict projection parsing, current caller checks, malformed/expired sessions,
report-only/foreign-property boundaries, immutable leases, owner MFA, pagination,
lock-wait expiry, mapping revocation and duplicate-index concurrency. Native PostgreSQL
17 exercises actual lock waits; PGlite skips those cases. Counts overlap and must not
be added together. No genuine connected property case has run.

Technical GO: separately review and authorize the two dormant forward migrations,
then refresh target-specific preflight and execute only that exact scope if approved.
NO-GO: activation, customer access, media, supplemental debt conversion, deployment
or launch. Scanner/isolated worker, private Storage, full validators, safe image/video
derivatives, quotas, expiring playback, genuine customer consent and checked
change-to-invoice conversion remain blocked. NMI preferred/Authorize.Net optional,
both disabled. Frozen Netlify deployment/support ticket unchanged; no external
messages, provider calls, payroll, production or PR merge. Independent security and
full hosted acceptance remain release gates.

References: [Supabase functions](https://supabase.com/docs/guides/database/functions),
[PostgreSQL 17 DROP INDEX](https://www.postgresql.org/docs/17/sql-dropindex.html),
[PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html),
[duplicate-index linter](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).
