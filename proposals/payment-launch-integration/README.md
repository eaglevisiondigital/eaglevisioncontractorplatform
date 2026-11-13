# Unapplied payment launch integration

Baseline #417: `394d7fc1bbc6d6a27440e881bc3e9bf3d76befa6`.
Reviewed payment source #411 and admission author #419 are composed only inside
throwaway qualification clones. Canonical protected source remains unchanged.

`integration.patch` SHA256:
`35dca7d772e9db104a5e2ee4b6de6d7a3438d519eabe1e113f44c55dcb755bbc`.
`evidence.json` SHA256:
`1fbae26d0f6783d3f7126f85e145ef2c06bb6fe7055a76d2ba37be75591bb281`.

The patch contains exactly eleven byte-identical #419 endpoints plus two test-only
companions. The retained launch test otherwise compared current F/H/G against
historical #402 bytes: disposable eleven-file reproduction produced one failure
and 138 passes. Its proposed explicit fixture port checks the exact live payment
frame before and after historical reads. The original verifier and all sixteen
assertions from `const directory` onward remain byte-identical. No historical
manifest, C17 endpoint, SQL, Auth module, budget or dependency changes.

Commands (offline; no credentials/provider calls):

```sh
node proposals/payment-launch-integration/qualify.mjs guards
node proposals/payment-launch-integration/qualify.mjs payments
node proposals/payment-launch-integration/qualify.mjs source
node proposals/payment-launch-integration/qualify.mjs c17
node proposals/payment-launch-integration/qualify.mjs negatives
node node_modules/vitest/vitest.mjs run tests/payment-launch-integration-proposal.test.ts --maxWorkers=1
```

Qualification: 139 payment/retained-launch cases, 80 retained source cases, 33 C17
fixture/live cases, eleven package controls (including the unchanged 25 negative
controls), live ACK/C17 checkers and twelve original native PostgreSQL NMI cases
PASS on disposable combined source. The native harness starts a local PG17 cluster
with TCP disabled and removes it afterward. An initial stripped-environment server
startup failed before tests; the original harness environment completed all twelve.
Independent review caught a before-only qualifier that would reject its own
post-integration tests. It now accepts only the exact complete before or integrated
13-file frame, rejects mixed bundles and pins mode across qualification. All eleven
package controls PASS on both the before tree and the full after tree with the
package present (66.19s / 59.11s), retaining the original 25 negative controls.
A new package negative test initially referenced a nonexistent Auth filename; it
was corrected to the existing broker-auth source without changing any assertion.
These source/local/native results are not hosted acceptance.

Exact patch approval is still required before a development launch successor may
apply any of these thirteen files. Excluded: signed callback #415, optional #416,
performance #391 admissions, SQL/grants, hosted/provider execution, financial
actions, merge, deployment, recovery or release activation. Sequential source
checks are not an atomic filesystem snapshot or independent custody.

Release 1.0 remains NOT READY / NOT AUTHORIZED; D1–D3 and A01–A12 remain separate.
