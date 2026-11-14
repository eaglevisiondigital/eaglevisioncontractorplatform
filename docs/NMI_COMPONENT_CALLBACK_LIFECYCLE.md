# Offline component callback lifecycle

Parent source: #461 `44c5f98a5895fda4452eda906af2fb316a47f3a7`. Existing files remain unchanged. This new Node-only callback composition uses the existing fictional-token handoff and vault; it adds no financial writer, SDK loader, route, network, SQL, credential access or customer account.

The official [frontend contract](https://docs.nmi.com/docs/integration-guide-implement-frontend) distinguishes editing completion from submission, warns that completed fields can later become incomplete, and reserves onPay `true` for payment success. The new wrapper keeps initial editing non-consuming, binds explicit submission to the last completed fictional token using a private digest, and claims before the existing asynchronous handoff. Any later editing event, disposal, expiry or failed handoff closes that original lab instance and hides its reference. A late completion cannot restore it. Duplicate onPay cannot replace the first token.

Both callbacks discard their event references before asynchronous continuation. Optional lookup metadata is shape-checked but never traversed or retained. The wrapper stores no raw token: its digest is cleared on submission/closure. The original vault still necessarily handles its fictional token. No memory-zeroization or garbage-collection claim is made. Callback replies are fixed strings, never SDK payment-success `true`; the private reference remains token custody only, with settlement UNVERIFIED. Editing events are local signals, not authenticated provider provenance. They cannot prove merchant, rail, 3DS, consent, invoice authority or operational payment status.

## Executable verification

```sh
node node_modules/vitest/vitest.mjs run tests/nmi-component-lifecycle-lab.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js server/payments/token-lab/nmi-component-lifecycle.ts tests/nmi-component-lifecycle-lab.test.ts
node node_modules/prettier/bin/prettier.cjs --check server/payments/token-lab/nmi-component-lifecycle.ts tests/nmi-component-lifecycle-lab.test.ts docs/NMI_COMPONENT_CALLBACK_LIFECYCLE.md
```

New cases cover both fictional merchant bindings, non-consuming initial editing, pending/ready field withdrawal, token substitution, mutable ceremony input, duplicate callbacks, current-authority revocation, expiry and hostile/accessor/Proxy metadata. Existing accepted #454/#457/#461 suites are retained rather than rerun. This is local callback/vault composition, not hosted SDK, provider, Auth or durable-custody acceptance.

Auth-only, capture-later and void still require separately approved canonical state/SQL changes. No new generic operation field enables them. Genuine tokenization needs the actual supported SDK artifact/version and origin, separate merchant tokenization/API-key relationship, token lifecycle, exact tenant/customer/session/invoice/consent bindings, current Auth/MFA, independently accepted custody/recovery and exact sandbox authorization. Those private bindings must never be supplied to this fictional-only lab.

Saul 2 Paul remains first. Cunningham reuses source but needs independent tenant, customer, merchant, key and settlement acceptance. VAR sheets/NMI boarding remain external dependencies. Provider fees, settlement, bank deposits, customer payment receipts/delivery, D1–D3 and A01–A12 remain unaccepted. No source promotion, protected SQL/grants, providers, financial execution, live tenants/merchants, messages, recovery, merge, deployment or activation. Release 1.0 **NO-GO**.
