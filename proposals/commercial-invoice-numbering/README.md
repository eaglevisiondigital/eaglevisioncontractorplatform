# Unapplied contractor invoice numbering alternative

This implements a sequential alternative over the existing commercial invoice
header and private issuance authority. It is not installed, admitted into a source
checker, or wired to the connection factory. All parent files remain unchanged.
The owner's numbering policy decision remains **HELD**.

For disposable fixtures only, an explicit namespace such as `FICTA` produces
`FICTA-00000001`. Names are never inferred from contractor branding. The proposed
format is 2–12 uppercase ASCII letters/digits (first a letter), eight decimal digits,
starting at one, with a hard stop at 99,999,999. Namespace ownership is bound in the
existing private issuance authorities and retained issued headers; another tenant
cannot take it. Existing non-null bindings cannot change or be deleted through the
proposed ordinary path. Revocation and expiry remain available and never renumber an
issued invoice. Policy insertion requires READ COMMITTED; no provisioner is added.

One transaction-scoped tenant lock precedes the original command/invoice locks.
New issuance requires READ COMMITTED and allocates the maximum visible retained
header ordinal + 1 under that lock (including this transaction's own prior issues),
retaining the original AAL2/current actor, exact source/revision,
separate authority, original command receipt and final expiry checks. The original
issued-header trigger and tenant unique-number constraint remain authoritative.
A supporting tenant/namespace/ordinal unique index bounds the allocator's lookup.
No counter table, sequence, second invoice store or financial ledger is introduced.

## Numbering choices and rollback semantics

The unchanged accepted UUID-derived `INV-<full UUID without hyphens>` policy gives
an independently derived number without a tenant allocation wait. It is long and
not chronological. This alternative gives shorter contractor-specific sequential
numbers but serializes issuance within the contractor and can fail on bounded lock
waits. It does not claim accounting, jurisdiction or tax numbering compliance.

Numbers on committed issued headers cannot be edited or deleted through the
ordinary path, and those retained ordinals are not reused. A transaction rollback
removes its uncommitted assignment: that candidate may be used by a later issuance.
This is explicitly transactional allocation, not a rollback-resistant burned number,
not a promise of a gapless statutory series, and not independent recovery custody.
Trusted owners/admins, trigger disabling, TRUNCATE, database restore and physical
rollback remain operational TCB/recovery gates. Local fixture resets use that trusted
TRUNCATE boundary; they are not a runtime capability.

Legacy UUID-numbered issued headers retain their original bytes and receipts and
are excluded from the sequential ordinal. No history is rewritten or resequenced.
Exact-original-command idempotent replay returns the originally issued number.

## Compatibility and approvals

The existing presenter, customer contracts, source checkers and #469 connection
remain UUID-only and unchanged. They reject this alternative's output. This package
therefore demonstrates SQL persistence and its original private reader only; it
claims no connected client or customer release. An exact separately reviewed
compatibility/source-author amendment is needed before any such composition.

The owner must choose UUID versus sequential numbering, the actual independently
accepted contractor namespaces, start/range/format and collision/retention policy,
rollback allocation semantics, and any jurisdictional obligations. No real contractor
namespace, installed SQL/grants, Auth mapping, tenant, issued invoice, payment,
publication, URL, delivery or provider activity is accepted by these fixtures.
Source-author admission, SQL installation and operational acceptance require their
own exact approvals. Release 1.0 remains NOT READY / NOT AUTHORIZED.

## Local qualification

Only new tests run: `tests/commercial-invoice-numbering-source.test.ts` and
`tests/database/commercial-invoice-numbering-proposal.test.ts`. Native PostgreSQL 17
uses a fresh owned Unix-socket cluster with TCP disabled. The fixture verifies the
original issuance/draft hashes before finite fixture-only role aliasing. Native
workers must observe the advisory wait before concurrency assertions. Original
accepted suites, deadlines, assertions and canonical SQL are not changed.

Author qualification: 27/27 new native cases and 5/5 new source controls PASS,
zero failures/skips. Native cases include simultaneous issuance, competing namespace
claims by two tenants before either commits, post-wait expiry and revocation,
namespace exhaustion, exact-command replay, committed immutability and transactional
rollback characterization. Strict TypeScript, scoped ESLint and Prettier checks PASS.
These are fictional disposable fixtures, not genuine hosted Auth or legal acceptance.
