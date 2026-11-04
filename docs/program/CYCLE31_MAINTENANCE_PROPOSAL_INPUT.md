# Cycle 31 · exact original maintenance proposal input

Parent: `353923ce2c6677ae3d5026ac46cf214b2a549aa3`. The only runtime change is
inside existing `preparePlanCancellationReview`; the canonical native planning,
consent, receipt and one-use custody owners remain unchanged. No UI, preview,
store, schema, writer or business engine is added.

## Demonstrated defect and bounded correction

The facade captured the confirmed proposal's own data descriptors, awaited the
original saved-source verification, compared the descriptors again, then passed
the raw caller object into the native engine's separate capture. A stateful Proxy
could report the confirmed descriptors twice and another valid date or planning
kind at subsequent native captures. Actual original review preparation accepted
the substituted input and returned `BLOCKED_LOCAL_REVIEW`.

The red source report records a confirmed date `2027-01-05` becoming an admitted
`2027-02-06`, or confirmed `follow_up` becoming `renewal`, across all three brands.
This remained a blocked local staff review, not consent, plan renewal or sending
execution, but its immutable evidence did not bind the originally confirmed input.

The facade now checks cloneability and captured primitive consistency before
original admission. The transient structured clone is discarded. The original
ordinary proposal is still passed unchanged to the existing engine, preserving its
post-await input checks and original retained live-input fence. Proxy rejection
therefore consumes no original hold; it cannot create replacement custody. Ordinary
source changes and ambiguous acknowledgments continue to retain UNKNOWN/no replay.

## Actual local evidence

- Eleven new source cases: before the correction, one pass and ten failures;
  after it, eleven passes. Six cases substitute date/kind across the three brands;
  one rejects a currently transparent Proxy; three prove a rejected Proxy consumes
  no native hold and one subsequent ordinary confirmed proposal is prepared once.
  The final case preserves ordinary reverse-key-order/null-prototype input and
  proves mutating that same original object still causes UNKNOWN, while immutable
  prepared evidence stays unchanged and a fresh input cannot replay.
- A focused pre-fix observation run repeats only the six descriptor-substitution
  cases to retain exact admitted date/kind/native state in the assertion messages.
  Its six failures and five filtered-out tests are not additional coverage.
- Affected retained suites and new cases pass **102/102**, zero failures/skips:
  original cancellation43, requirement consistency21, current revalidation27 and
  new proposal-input11. Existing source/consent withdrawal, expiry, membership,
  concurrency, hash-loss and input-change guards remain unchanged.
- Strict TypeScript, focused ESLint and Prettier pass. These are local results,
  not current-head GitHub CI success. No completed C30 browser/date setup, physical
  recovery or 25-check offline baseline was repeated for this nonvisual facade fix.

```sh
npx vitest run tests/cycle31-maintenance-proposal-input.test.ts tests/cycle24-plan-cancellation-review.test.ts tests/cycle25-maintenance-consistency.test.ts tests/cycle26-maintenance-revalidation.test.ts --maxWorkers=1
```

Raw pre-fix and final reports remain outside Git under
`artifacts/cycle31/growth/` in the isolated worktree.

## Field audit and unchanged gates

Field audit at the exact parent reviewed original task/receipt/graph identities,
current native custody, post-await eligibility, exact selected-ID navigation,
current access withholding and explicit read-only reread. Existing C24–C30 tests
already cover the inspected boundary cases. No newly demonstrated defect or useful
uncovered case warranted another Field package: **NO_CHANGE**. C30's final-boundary
race and invalid-date correction were not recreated.

The original customer14/4B, P1/on13/four artifacts, immutable receipt custody,
Auth/MFA, NMI, frozen Netlify/executor, approved branding/designs and protected
migration history remain unchanged. Purpose-specific consent, suppression,
enrollment and renewal authority remain unverified. Danny's newer Air is last
unavailable; physical recovery is NOT RUN. No hosted action, operational adapter,
credential access, financial execution, dispatch, communication, merge or deploy.
Release1.0 remains **NOT READY / NOT AUTHORIZED**.
