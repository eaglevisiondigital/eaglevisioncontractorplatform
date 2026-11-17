# P1 expiry-case input correction — UNAPPLIED

Exact preparation parent: #537 `30ec9e823bc64420fb62508b6dabb5a76f171ea2`.
Both original expiry cases compare a fixed November17 fake clock with a fixture
quote expiry derived from real Date.now()+one hour. Later test execution can make
that fixed clock precede expiry, so the expected STOPPED becomes VERIFIED.

The proposed patch binds only the two negative fake-now inputs to the actual first
fixture quote expiry plus one millisecond. All other test bytes, assertions,
budgets, approved moving-expiry fixtures and runtime expiry validation stay exact.
No operational P1, recovery, Auth or provider attempt is replayed.

- Target: `tests/property-p1-executor.test.ts`, mode100644.
- Before SHA256: `832f8e0f3e917c16c9cd76415151fdeb6bef2572b18e4874c8a3696ccebcdb38`.
- After SHA256: `f2821ed625c5979e0ebf712efd8fb711c27ea80819e838903b7cbd55c52a0e01`.
- Patch SHA256: `5edaa9e51fd19037aadced01c21cd054dc1c1df9ab2b329d8d34ae3d2750104d`.
- Delta: one file, two insertions/two deletions; only fake clock expressions.

Primary and separate independent disposable fake-port reproductions use historical
October17, current November17 and future December1 wall-clock vectors. Original
cases produce2PASS/2FAIL/2FAIL; proposed cases produce2PASS at all three vectors.
Thirteen unrelated cases are filtered in each bounded run, not counted as passes.
The before failures remain retained evidence. These are synthetic fixtures, not
actual execution, independent custody, hosted Auth or recovery acceptance.

The protected test is unchanged in this proposal. The exact future source-author
parent must be this actual published proposal commit, recorded in its review.
Separate exact owner approval is required before applying the patch; finite source
admission and launch integration remain separate. Canonical source qualification
of the disposable afterimage still DENIES and is not waived. This candidate does
not compose dashboard #538 or optional UI, install SQL/grants, use real accounts,
issue invoices, call providers, process payments, send messages, perform recovery,
merge, deploy or activate Release1.0. Release remains NOT READY / NOT AUTHORIZED.
