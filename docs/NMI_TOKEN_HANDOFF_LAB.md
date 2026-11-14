# Offline NMI token handoff and custody lab

This isolated increment starts from exact PR454 `28d6397322cc82724de0a6c6e350f619f7edc33e`. It implements an offline lab for the missing token handoff boundary through the existing `SandboxTokenVault` / `TokenReference` port, without another payment engine. It is unmounted and has no SDK, script loader, credential reader, HTTP route, SQL, network or payment method collection. Release 1.0 remains NO-GO.

The official [Payment Component guide](https://docs.nmi.com/docs/payment-component) recommends that component with the REST API for new integrations; [Collect.js](https://docs.nmi.com/docs/collectjs) is documented for existing integrations. Current public examples still contain SDK placeholders. No SDK name, event shape, token lifetime or package dependency was guessed. The lab accepts a normalized **fictional** `paymentToken` envelope; it is not an implemented provider callback adapter.

## Implemented boundary

`NmiTokenHandoffLab` captures a frozen merchant and existing payment intent together with exact customer, actor, session, issued-source, consent, CSRF, origin and validity bindings. An explicit `testOnly: true` current-authority port must return matching current synthetic AAL2 facts. This port is a trusted fixture, not genuine Auth, MFA or an authenticated customer mapping.

One private object owns one ephemeral ceremony. It generates unpredictable ceremony/state/reference identities; invalid preflight inputs cannot choose merchant, customer, amount or a replacement identity. The callback accepts only the issued ceremony/state, exact configured origin and a `fictional_nmi_` token. `.invalid` origins and the fictional-token prefix deliberately prevent use with actual provider origins/tokens.

Begin, callback retention and token resolution claim custody before awaiting current-authority checks. Each check has a five-second bound; a ceremony expires no later than five minutes or its earlier merchant/intent/context expiry. These are local lab limits, not asserted NMI token lifetimes. Late, failed, expired, closed or revoked checks remain unavailable; restoring authority does not renew a claimed operation. Duplicate callbacks cannot replace a token. Concurrent resolution releases the original token once, only to the original reference/tenant/merchant/customer/provider/mode/intent scope. The winning resolution clears private custody before returning to the existing trusted gateway contract; subsequent use cannot resolve it again, including after provider UNKNOWN.

Own-data input snapshots reject nested accessors/Proxy substitution. The authority function is captured once; later mutation of its source ports object cannot replace it. Public ceremony/reference objects contain no token, and JSON serialization of the lab exposes no private fields. Fixed errors omit token/session/provider diagnostics. The privileged `resolve` result necessarily supplies the opaque token to the existing gateway; it must never become a browser response or log record. JavaScript strings do not provide memory-zeroization guarantees.

## Executable evidence

```sh
node node_modules/vitest/vitest.mjs run tests/nmi-token-handoff-lab.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js server/payments/token-lab/nmi-token-handoff.ts tests/nmi-token-handoff-lab.test.ts
node node_modules/prettier/bin/prettier.cjs --check server/payments/token-lab/nmi-token-handoff.ts tests/nmi-token-handoff-lab.test.ts docs/NMI_TOKEN_HANDOFF_LAB.md
```

Tests use the original two fictional merchant fixtures. They compose the actual token-reference/Sale adapters with explicitly fake reservation/transport ports, and exercise exact scope, stale source/consent/session/actor/customer/merchant/intent, revocation, malformed/duplicate callbacks, expiry, late authority answers, concurrent claims, close, private-value redaction and UNKNOWN. No actual gateway or SQL was contacted; the fake store does not prove durable authorization. Prior PR45243+5 and PR45420+14 evidence is retained without reruns. No browser/UI or hosted/provider acceptance is claimed.

## Gates before a genuine NMI test

This object is ephemeral, has no encryption or restart/rollback protection, and does not globally deduplicate separate objects/processes. A fresh instance cannot resolve an old reference, but constructing a fresh ceremony is not globally prevented. It is therefore **not operational token custody**. Never reissue a token/ceremony or attempt a new payment after UNKNOWN; use the existing exact read-only transaction reconciliation. Durable globally unique private custody, independently provisioned roles, genuine current Auth/session/customer/invoice/consent mapping and approved provider/merchant/origin/key contracts remain prerequisites for a real implementation.

The actual Payment Component SDK/event adapter, tokenization key/origin/CSP, PCI review, encrypted private custody and full provider token vectors remain unimplemented/unaccepted. No real GET, tokenization, key retrieval, account creation, tenant activation, SQL/grant installation, financial action, customer receipt/delivery, auth-only/deferred-capture/void, settlement-report acquisition, fee/net/deposit proof, integration promotion, merge or deployment is authorized. Saul 2 Paul's exact first-contractor bindings and Cunningham's separate acceptance remain independent.
