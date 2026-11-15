# Approved invoice display · unapplied yearly successor

The owner approved `INV-YYYY-NNNNNN`, independently scoped per contractor. This
working SQL proposal implements that display without reopening the format decision.
It is a successor to unchanged #471, not a rewrite of that historical proposal or
of canonical UUID issuance. It adds one year column to the existing invoice header,
extends its existing check/index and replaces only the issuance allocator body.
No second invoice store, counter table, sequence, financial ledger or new role exists.

Apply in disposable qualification only, after the exact original issuance and exact
#471 SQL. Current application/client/source admission and SQL installation stay OFF.

## Explicit technical qualification choices

- Year is the server UTC **calendar** year, captured after tenant/source/authority
  waits. The same server instant supplies `issued_at` and its year. The session
  timezone, caller IDs, browser date, claims and display string cannot select it.
- Each contractor starts at `000001` in a new year. The tenant allocation lock is
  unchanged and precedes the original command/invoice locks. READ COMMITTED sees
  retained committed headers and this transaction's own prior assignments.
- `999999` is a hard STOP. No seventh digit, forced year advance, wrap or fallback.
  A clock/year regression behind a retained new-format issued header also STOPS.
- Public displays may legitimately match across contractors. Trusted organization,
  invoice UUID, source/revision, actor and original command receipt remain mandatory.
  The retained private namespace never appears in the new display and is not Auth.
  Its existing immutable tenant binding/collision guards remain unchanged.

UTC versus a contractor-local/fiscal year, the exact rollover/reset basis and the
regression response require technical/accounting acceptance before operational
installation. These fixture choices do **not** reopen the approved display format.
There is no actual contractor, private namespace appointment or installed authority.

## Permanence, rollback and original recovery

Issued headers and original receipts stay immutable. Existing UUID and experimental
eight-digit numbers retain their bytes and null year; they are never resequenced.
The old #471 source and its 27-case native evidence remain unchanged. Original
idempotent commands return their retained number even after a year transition.

A committed new-format number is retained and not reused. Rollback may reclaim only
an uncommitted, unpublished candidate. The explicit-transaction fixture can inspect
such a candidate before rollback; that observation is not a committed business
issuance or permission to publish it. An external exposure before commit would need
separate custody/accounting policy; this package provides no publication path.
No gapless statutory series, rollback-resistant burn, cross-restore nonreuse or
independent durable custody is claimed. Trusted owner/admin/TRUNCATE/restore bypass
and D1–D3 remain separate gates.

The lost-ACK test withholds the real autocommitted SQL response at the adapter
before the consumer reads it. After changing year, the original read returns only
that exact immutable receipt; no new invoice, allocation or replacement command is
created. A missing/uncertain receipt grants no retry, new ID or replacement number.

## Qualification and compatibility

New tests only: `tests/commercial-invoice-year-numbering-source.test.ts` and
`tests/database/commercial-invoice-year-numbering-proposal.test.ts`. Exact parent
SQL hashes are checked before finite fixture-only role aliases. A test-only clock
table is created solely by the disposable fixture, never by proposed SQL. Its single
substitution replaces only the allocation timestamp expression; genuine Auth/expiry
checks retain the original wall clock. Native rollover changes that clock after an
observed allocation wait; a separate test runs the unmodified production clock body
and proves fixture/caller year settings cannot control production allocation.

The original UUID-only presenter, customer contracts, connection and checker sources
remain unchanged and reject new-format output. A separately reviewed exact decoder/
source-author amendment is needed before client composition; trusted tenant identity
must accompany the display. No customer route, link, Auth acceptance, publication,
payment, message, provider request, hosted installation, merge or deployment occurs.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
