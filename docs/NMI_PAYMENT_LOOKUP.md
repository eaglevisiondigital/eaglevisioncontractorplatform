# NMI single-payment lookup preparation

This isolated, unwired sandbox reader retrieves allowlisted facts for one already-known transaction ID. It supplies the missing read contract without expanding payment mutation authority. It has no route, default transport, credential loader, SQL port, automatic retry, observer or receipt writer. Release 1.0 remains NOT READY / NOT AUTHORIZED.

## Contract and decisions

The official [NMI Get a payment reference](https://docs.nmi.com/reference/get-payment-v5) specifies `GET https://sandbox.nmi.com/api/v5/payments/{payment_id}` using a merchant API key. The public embedded OpenAPI snapshot reviewed on November 14, 2026 has canonical JSON SHA256 `82e5d79d85adfd01973386dd835153c5c30629ed2f59efb78523b5f2ec03e218`. This records the inspected schema, not provider acceptance.

The implementation reuses `SandboxMerchant`, `SandboxCredentials`, `StatementRow`, `minorDecimal`, the strict duplicate-member/UTF-8 payment decoder, and the existing bounded-byte reader. Explicit matching organization, merchant configuration, sandbox approval, API-key metadata and configured processor are required. These bindings do not prove that a real key belongs to a merchant: `merchantIdentity` remains `CONFIGURATION_BOUND_NOT_PROVIDER_ATTESTED`.

The response must match the exact requested ID, decimal amount, currency and configured processor. The returned immutable projection contains that expectation, literal reported status/response, order reference, allowlisted action facts and body digest. Billing/payment details and signature images are discarded. Errors are fixed text and never expose a provider body, URL, credentials or merchant binding.

A fixed GET URL, `redirect: error`, explicit redirected-response denial, no-store request and 65,536-byte cap apply. A 30-second deadline covers both transport and body; caller cancellation also stops waiting. An injected transport ignoring abort cannot publish late facts; a stalled body is canceled. Approval is rechecked after awaits and before output. There is no retry.

The official status string has no documented settlement-proof contract in this schema. Literal `settled`, `voided`, successful actions or a signed callback do not establish bank settlement, a customer payment receipt, refund capacity or resolution of a canonical UNKNOWN. Every result therefore retains `settlement: UNVERIFIED` and `financialEffect: false`. A caller-supplied `StatementRow` is an expectation, not proof of an issued invoice or customer authority.

## Local evidence

All identities, keys, transaction IDs and responses in tests are fictional. The reader's network port is injected; no provider was contacted.

```sh
node node_modules/vitest/vitest.mjs run tests/nmi-payment-lookup.test.ts tests/database/nmi-payment-lookup.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js server/payments/nmi-payment-lookup.ts tests/nmi-payment-lookup.test.ts tests/database/nmi-payment-lookup.test.ts
node node_modules/prettier/bin/prettier.cjs --check server/payments/nmi-payment-lookup.ts tests/nmi-payment-lookup.test.ts tests/database/nmi-payment-lookup.test.ts docs/NMI_PAYMENT_LOOKUP.md
```

The 43 unit cases cover both fictional merchants, current bindings, exact response correlation, immutable snapshots, private-field exclusion, malformed/oversized bytes, error redaction, approval expiry, explicit cancellation, deadline loss and redirect rejection. Five database cases run against existing migrations and restricted synthetic roles in PGlite and disposable native PostgreSQL 17. Independent native backend snapshots show that a lookup claiming settlement creates no observation/settlement or refundable capacity, a lookup claiming void leaves UNKNOWN and duplicate prevention intact, and a foreign merchant request stops before GET. Trusted fixture setup is not genuine Auth or operational least-privilege evidence.

No existing runtime, test, checker, SQL, source inventory, locked UI or admission file changes. Existing accepted payment regressions are retained rather than redundantly rerun. Browser, hosted, real merchant and provider-vector acceptance are NOT RUN; this package has no UI.

## Remaining acceptance dependencies

Before any separate connected acceptance, review exact merchant/API-key/processor ownership and provider contract vectors under genuine current staff Auth/MFA and independently authorized transport/custody. Keep separate first-contractor merchant bindings; browser selection and configuration metadata confer no authority. Correlate only an already-known exact transaction; never guess a missing UNKNOWN ID or authorize a replacement attempt.

Token collection/vault ownership, authorization-only/capture/void mutations, customer receipt issuance/delivery, report pagination and verified fee/net/bank settlement reconciliation remain separate gaps. Their protected state, source admissions, SQL/grants and provider/legal approvals are unchanged. This reader does not authorize any provider call, credential retrieval, live tenant activity, SQL installation, financial effect, launch integration, deployment or merge.
