# Exact reconciliation receipt reopening · UNAPPLIED

The existing reconciliation writer persists immutable reports, but offers no exact read. Its replay path compares the **current** attempt snapshot before locating an old report. If an acknowledgment is lost and another attempt changes that snapshot, calling the writer cannot recover the original result. A new report ID or reconstructed report would not be the original receipt.

This proposal adds one private read function and an unwired, test-only reader over `private.sandbox_gateway_reconciliations`. It uses the original organization, merchant, provider, report ID, evidence digest and snapshot digest. It never invokes `reconcile`, selects a latest report, creates a replacement, updates attempts or clears a hold. Missing, conflicting, malformed or unavailable evidence remains UNKNOWN.

The new NOLOGIN owner has narrow merchant/report column reads, lock-only merchant access and execution of the existing current-workload guard. No runtime grant or role appointment is installed. A future dedicated reader LOGIN can receive only the new function, without private table access or the old command writer. Every outcome requires the original current payment-workload/merchant scope before and after reads. SQL and runtime decoding reject expanded/private payloads, contradictory summaries, wrong identities and unsupported currencies. Net amounts remain original USD integer-minor-unit strings.

The historical report is not current ledger balance or provider truth. Results explicitly retain `financialEffect:false`, `holdRelease:false`, `currentLedgerMatch:NOT_ASSERTED` and `settlement:UNVERIFIED`. The existing report table does not identify a human submitter or original producer role; this read cannot authenticate that identity, clear another actor's hold, supply customer Auth or establish consent. It is a current merchant-workload read of an exact immutable record, not a customer payment receipt.

## Verification and source

- Parent: #470 `1940dc3bf82142a50ba8d2ccd3b39890f36d0dd1`. Canonical runtime, schemas and historical migration files remain unchanged.
- New reader **35 PASS**, source controls **8 PASS**, native PostgreSQL **20 PASS / 0 FAIL / 0 SKIP**. Independent review/results are recorded in the draft PR.
- Native tests withhold the actual original SQL commit response, then change the ledger, demonstrate rejection by the old writer, and recover the original receipt through a separately granted reader-only principal. Table contents and activity-event counts remain unchanged by reads. Wrong scope, revoked leases, merchant suspension, malformed persisted JSON, immutable history and observed post-wait lease expiry are covered.
- The source qualifier reuses the hash-verified parent qualifier and its captured bootstrap/fourteen unchanged migrations. Node 24's built-in type stripping imports only those verified bytes; no Git/helper command, new dependency, connection or installer is provided. New source withdrawal and mode/substitution controls deny before test SQL use.
- One early source-control test had a withdrawal trigger beyond its actual read count; the failing result is retained and the test fixture was corrected. No product assertion or safety rule was relaxed. An automatic permission-review timeout was retried once with the isolated native runner; no rejected action was executed.

```sh
node node_modules/vitest/vitest.mjs run tests/reconciliation-receipt-reader.test.ts tests/reconciliation-receipt-source.test.ts
# Only with the existing disposable native harness:
EV_TEST_PG_SOCKET=/private/tmp/EXACT_OWNED_TEST_SOCKET node node_modules/vitest/vitest.mjs run tests/database/reconciliation-receipt-proposal.test.ts --maxWorkers=1
```

The JavaScript deadline/cancellation suppresses late evidence; the current `GatewaySql` interface has no driver-cancellation command. It does not prove that an interrupted SQL connection is reusable. A separately reviewed operational connection/pool must qualify cancellation/discard, principal and backend custody. The one native-only wait case is explicitly skipped by PGlite, never counted as native equivalence. Fixtures are controlled role/identity simulations, not genuine hosted Auth, independently administered custody or bank acceptance.

## Remaining boundary

Separate source, target, owner/grant and SQL-installation approval remains mandatory. Genuine Auth/MFA/current-session acceptance, D1 responsibility and installed bypass inventory, D2 independent custody/ACK/spent fencing, D3 recovery, original A01–A12 and invoice-numbering approval remain open. Customer intake SQL stays HELD.

Secure commercial publication/payment links, invoice-level financial mapping, actual payment receipts and provider-report/fee/deposit/bank evidence are not supplied by this merchant-report summary. Auth-only/capture-later/void remain blocked on separately reviewed action/payment-identity semantics; no guessed SDK or endpoint adapter was added. Saul 2 Paul remains first; Cunningham needs separately accepted tenant/customer/merchant/key/settlement bindings. No credentials, hosted/provider calls, real transactions/tenants, communications, merge, deployment or recovery operation occurred. Release 1.0 **NO-GO**.
