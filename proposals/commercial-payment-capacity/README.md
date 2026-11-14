# Issued-invoice capture capacity · UNAPPLIED

The original restricted payment writer accepts an independently seeded authorization for a nonexistent invoice. The new native suite demonstrates that before installing this forward proposal in its disposable database, then verifies that the historical attempt remains unchanged afterward. No canonical runtime, historical migration, invoice engine or ledger is modified in this branch.

This proposed guard uses the **existing** commercial issued header and payment-attempt ledger. New capture authorizations must retain four typed identities: source version, source hash, issued revision and original issuance command. Customer, invoice, merchant, request digest, currency and amount remain bound by the original authorization/writer contracts. Human evidence notes cannot supply these identities. Existing legacy authorizations remain immutable; their absent fields cannot admit new captures after future guard installation.

The guard locks the original issued invoice, then sums all its non-declined captures across merchant configurations. Partial reservations may reach but never exceed its integer minor-unit amount. Any pending/UNKNOWN invoice payment quarantines NEW capture identities, even below the remaining ceiling; original-key recovery remains read-only. Pending/UNKNOWN captures also consume capacity. A definite canonical decline releases its reservation; refunds, void-like callbacks, reports and settlement observations never automatically reopen this ceiling. This is a **reservation ceiling**, not a customer balance, payment receipt, verified settlement or automatic rebilling policy.

Read-committed isolation is mandatory: a lock-only wait does not refresh a repeatable-read snapshot. Native contention proves two distinct workers wait on the invoice and only one overlapping reservation succeeds. Authorization expiry after the observed wait denies insertion. The new NOLOGIN owner has finite column grants and private RLS policies; it cannot insert attempts, update source facts or expose a callable client API. D1 installed writer/bypass inventory and privileged administrative independence remain unverified.

## Source and verification

- Parent: #466 `300eb070ecfa88fab7d22152893c90a8ec399b9f`.
- Exact copied invoice SQL fixtures: reviewed #467 `7e25b50537fe66c19f5041e64bd2e59effc544c4`, tree `f255ae9f0665d55fee94387340d84032f1fa25b8`. These are test inputs, not canonical source promotion.
- Forward SQL SHA256: `a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4`.
- The source reader captures hash/mode-verified SQL, bootstrap and all fourteen unchanged migrations before test execution; a second pass rejects source withdrawal. It offers no installer, connection or execution authority.
- New source controls: **26 PASS**. New native PostgreSQL cases: **31 PASS / 0 FAIL / 0 SKIP**. Native-only concurrency/expiry cases are explicitly skipped under PGlite, never counted as equivalent evidence. Final independent review/results are recorded in the PR.

The first two native development attempts were blocked in fixture setup by the unchanged thirty-minute workload limit and unique merchant-per-provider constraint. No assertions ran. Fixtures were corrected to twenty-nine minutes and existing NMI/Authorize.net configurations for one tenant, with independently bound NMI for the second. No original constraint was weakened. Final before/after, source ownership, exact revision identity, refund, callback, rollback characterization and observed contention checks pass. Local rollback before any dispatch is characterized honestly; independently rollback-resistant custody is not established.

```sh
node node_modules/vitest/vitest.mjs run tests/commercial-payment-capacity-source.test.ts
# Native-only invocation requires the existing disposable PostgreSQL test harness:
EV_TEST_PG_SOCKET=/private/tmp/EXACT_OWNED_TEST_SOCKET node node_modules/vitest/vitest.mjs run tests/database/commercial-payment-capacity-proposal.test.ts --maxWorkers=1
```

## Separate financial operations and approval boundary

Official [Authorization](https://docs.nmi.com/reference/create-auth-v5), [Capture](https://docs.nmi.com/reference/capture-payment-v5) and [Void](https://docs.nmi.com/reference/void-payment-v5) contracts describe distinct operations. The official [code examples](https://docs.nmi.com/docs/payment-code-examples) use the same provider payment ID for authorization and later capture. The current successful-transaction uniqueness rule, capture/refund-only kinds and financial reconciliation therefore require a separately reviewed action/payment-identity extension; simply adding an endpoint or treating authorization as paid would be incorrect. Those operations remain unimplemented here. No real SDK, tokenization, key, provider request, fee/net/deposit or bank evidence is supplied.

Any installation requires separate exact SQL/role/grant/source/target approval, current Auth/MFA and invoice-numbering acceptance, genuine payment authorization/consent and independently qualified D1–D3/A01–A12 custody/recovery. This proposal creates no operational provisioner or customer/payment route. No downgrade/drop-guard script is provided: failed operational acceptance must quarantine writes and preserve original records, not reopen legacy admission. Customer intake SQL remains HELD.

Saul 2 Paul stays first. Cunningham inherits code only and needs separate tenant/customer/Auth/merchant/key/settlement acceptance. VAR sheets/NMI boarding remain external dependencies. No installation, tenant activation, provider/payment execution, customer communication, recovery, merge or deployment is authorized. Release 1.0 **NO-GO**.
