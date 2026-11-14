# Unapplied NMI sale order-reference correction

Baseline: PR #437, `53a4705b72b584228b33988d1eae586ef10b44eb`.
Proposed target: only `server/payments/sandbox.ts`, mode100644.
Patch: `73d4d530e4a560838477641e2c4298edee03fd4368645437ca9f113ab32ac294`.
Before `828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb`;
after `0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6`.

The [official Sale reference](https://docs.nmi.com/reference/create-sale-v5)
embeds `PaymentSaleBase.order_details → OrderDetailsRest.order_id`. Its sale-base
properties do not declare top-level `order_id`. The one-line proposal nests the
same existing intent key in the documented order-reference location. The minimal
projection and hash of the publicly retrieved schema are in `evidence.json`;
the full vendor schema is not copied into this repository.

Endpoint, numeric decimal amount, currency, token placement, private-key header
and response string fields are document-supported. This change does not claim
that NMI rejects an unknown top-level property or treats an order ID as a
provider idempotency guarantee. Real account permissions, processor/default route,
merchant/token ownership, test responses and settlement still require acceptance.

Seven new tests exercise actual before/after gateway source using captured,
verified compilation and injected transports. Both existing disabled fictional
merchant fixtures demonstrate the misplaced field before and exact documented
reference after. Decline, duplicate UNKNOWN hold and cross-merchant denial remain.
All tracked baseline source bytes and modes are freshly checked; the exact patch
is applied only to a removed scratch file. The same seven tests pass in a complete
proposed-source archive. No provider requests, credentials or old broad tests ran.

```
node node_modules/vitest/vitest.mjs run tests/nmi-sale-order-details-proposal.test.ts --maxWorkers=1
```

This is an UNAPPLIED source proposal. Canonical828b, parser, refund and all current
source-admission records remain unchanged. Any later source author and subsequent
finite source admission need their separate exact approvals; source qualification
is not merchant, hosted, financial, release, merge or deployment authorization.
Release1.0 remains NOT READY / NOT AUTHORIZED.
