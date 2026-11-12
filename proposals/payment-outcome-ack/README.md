# Payment outcome acknowledgment — UNAPPLIED proposal

Base: PR364 `4a54d390bd37024a10469b9f6cdcab6d38724a49`.
No runtime source, protected SQL, authority, provider or database is changed here.

The existing restricted store ignores the SQL `finish` acknowledgment status.
Capture/refund can therefore return success on malformed or uncertain completion
acknowledgments. Their completion exceptions also expose raw database errors rather
than a stable UNKNOWN result. Existing SQL defines `recorded` and `duplicate` as
successful completion acknowledgments; the proposal does not change that contract.

`proposed.patch` adds only acknowledgment validation and sanitized UNKNOWN failure
handling in the three runtime paths whose parent/proposed hashes are in
`manifest.json`. The pinned `control-store.ts` parent hash remains unchanged. The minimal zero-context
patch uses `git apply --unidiff-zero` only after exact parent-byte verification.
This is a source proposal, not permission to edit/admit protected source or pins.

Run offline with the existing installed dependencies:

```sh
node proposals/payment-outcome-ack/verify.mjs
```

The verifier checks exact parent bytes, copies only required files into disposable
local directories, tests the unchanged parent, applies the exact patch ONLY to the
copy and tests again. Default `npm test` does not discover proposal tests. Expected
results: parent4PASS/14FAIL; proposed18PASS/0FAIL. Fourteen failures represent twelve
unconfirmed-ACK and two exception-disclosure cases across capture/refund; four
positive cases retain `recorded`/`duplicate`. Tests exercise actual gateway ->
restricted store -> ProviderControl code with fake SQL and provider transports for
two fictional merchant scopes. No API, credential, SQL execution or resource call.
Canonical source hashes are verified unchanged even on failure; temporary copies
are deleted. The original30second per-test/hook budget is retained. Strict TypeScript checking
also runs on each staged source/test composition; no full application or accepted
native/recovery suite is repeated.

No persistence or independent custody acceptance is implied: the SQL/commit and
held-attempt behavior are mocks. One dispatch/no internal retry is tested; restart,
real database durability, provider behavior and global replay protection are not.

Before adoption: targeted independent security review, exact owner approval of
this patch hash and three parent/proposed source hashes, and separately controlled
successor admission wherever a current manifest protects those sources. Preserve
historical pins; do not silently replace them. Adoption still grants no SQL/grants,
merchant activation, hosted acceptance, payment/refund or production authority.

D1–D3, A01–A12, genuine Auth, recovery and NMI gates remain unchanged.
Release1.0 NOT READY / NOT AUTHORIZED.
