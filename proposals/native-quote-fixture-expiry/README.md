# Native positive quote fixture expiry — unapplied proposal

The two intended-valid synthetic quote inputs used a fixed expiry of
`2026-11-16T12:00:00Z`. The original native SQL checks expiry against
`clock_timestamp()`, so the positive inputs expired even though the P1 JavaScript
clock remains fixed at October 17. The native failures are unrelated to the
navigation/forms/dashboard source changes.

Exact source parent: `223e235be26c37271cb67e3c1f1803feb54599a6` (#511).
Hosted original #511 native evidence: run `43898355004`, job `133407940415`,
842 PASS / 2 FAIL / 1 original skip. The independent original two-case reproduction
preserves both failures and all original assertions/budgets; that evidence is not
replaced by the proposed result.

`fixture-expiry.patch` changes exactly one intended-valid `quote_expires_at` input
in each of:

- `tests/database/property.test.ts`
- `tests/helpers/property-p1-fixture.ts`

Each new synthetic input expires one hour after its current test-clock capture.
There is no hardcoded future-date allowlist, SQL clock substitution, expiry fallback,
provider configuration, production quote renewal or changed runtime authority.
Historical `p1Now`, quoted-at values, all intentional expired controls, all original
assertions/registrations/budgets, and the SQL expiry/currency guard remain exact.
The patch is data only and is not applied to these canonical files.

The bounded qualifier verifies exact original files, unchanged SQL, immutable parent,
sealed patch and identity, then returns the two proposed source strings in memory.
It has no source writer, SQL installer, operational adapter or approval effect.
Seven new cases include changed-original, changed-SQL and proposal-tamper denials.

Only the two originally failed native cases plus one additional expired-quote denial
case ran in an owned disposable PostgreSQL 17 cluster, using a private Unix socket
with TCP disabled. The original P1 case still asserts VERIFIED, 75 steps, 69 probes,
57 rows, arithmetic and zero customer debt. The compiled three-company case retains
its original assertions. Both PASS after the two-input substitution. A separate
additive control reads actual SQL wall time, supplies an expiry one second in the
past, and requires the original `Quote expiry/currency` rejection with zero supplier
comparisons inserted. Result: 3 PASS / 111 filtered. The cluster was stopped and its
owned directory removed. No broader native, recovery or consumed operational cases
were rerun.

`expired-quote-control.fixture` is appended only to the disposable negative-control
copy of the original test, and is excluded from the proposed two-file source patch.
`validation.json` binds the actual original and proposed evidence hashes. Passing
this narrow afterimage does not establish full Foundation, current CI, genuine P1,
Auth/MFA, hosted SQL/grants, installed writer inventory, custody, recovery or provider
acceptance. Saul 2 Paul and Cunningham acceptance remain separately bound.

Owner approval of the exact future source author is required before applying the
protected historical-test change. This proposal authoring grants no application,
merge, deployment or operational permission. Release 1.0 remains NO-GO.
