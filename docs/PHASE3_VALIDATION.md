# Phase 3 local validation and activation gates

## Executed locally

- `npm run check`: ESLint, strict TypeScript, catalog-derived type drift, Vitest and
  production build. Final results: **203 passed**, with **5 native-concurrency tests
  intentionally skipped in PGlite**; the same concurrency tests run on PostgreSQL 17.
- `npm run format:check` and `git diff --check`.
- Disposable native PostgreSQL **17.11**: **96 database tests passed**, including
  five tests with independent concurrent connections. Generated catalog types match.
- `npm run test:browser`: builds and serves an isolated local production preview; **42 passed** across Chromium desktop, tablet and mobile.
  Includes the prior 24 Phase 1/2 scenarios, new estimating/import/job/workforce flows,
  internal issue/revision/baseline coverage, automated accessibility and overflow.
- Pinned dependencies installed with **zero npm audit vulnerabilities** at install.
  `sharp`/`pdf-lib` are server-only; the browser operational UI is lazy loaded.

The native test harness accepts only a temporary local Unix socket or fixed CI
loopback PostgreSQL service. It creates/drops random synthetic databases. The local
cluster is stopped after verification. No hosted migrations or production data were
used. CI repeats formatting/checks/browser tests plus native PostgreSQL/type checks.

## Evidence covered

Tenant/role/module/MFA denials, revoked memberships/supervisors, cross-tenant
customer/catalog/document/import/job/time references; exact minor-unit arithmetic
and TS/SQL differential cases; option/schedule reconciliation; idempotent numbering;
stale revisions; immutable issued/approved/locked records; multiple suppliers,
duplicates/quantity conflicts, uncertain values, independent extension/total checks,
package privacy and markup precedence; source quarantine/malware failure contracts;
real truncated/corrupt images/PDFs, pixel/page limits, encrypted/active-content PDFs,
malformed/quoted/formula CSV; purchase approvals and duplicate source rows; internal
versus proposed/authorized customer changes; commitments/payments/credits; remaining
costs and incomplete profit; worker rates, overlap/open clocks, paid/unpaid breaks,
midnight/DST, overtime across jobs/overhead, salary residual allocation, corrections,
period locking, later payroll adjustments and separate labor posting.

Native concurrent tests prove distinct estimate numbers, one optimistic draft
writer, denial of overlapping time, one open clock and one payroll-period lock.
These are independent transactions, not a claim that PGlite provides concurrency.
Scanner tests use explicitly synthetic verdicts; no real malware sample was uploaded
or declared clean. No provider extraction was called. Browser tests use the explicit
in-memory preview, not a connected hosted identity/session.

## Screenshots

Generated files live in `artifacts/phase3/` and are ignored in Git. CI uploads them
as `phase3-synthetic-previews` artifacts. Prefixes are `desktop-`, `tablet-`, `mobile-`.
Each has `sample-property-builder`, `sample-construction-builder`,
`sample-roofing-builder`, corresponding `-preview` files, `material-import-review`,
`job-financial-dashboard`, `time-clock`, `timesheets`, `payroll-preparation` and
`job-labor-report`. The original three pilot examples use synthetic prices only.

## Unexecuted hosted / production gates

Follow docs/PHASE2_VALIDATION.md in an explicitly approved isolated environment,
then add real multi-user sessions and PostgREST calls for all new RPCs, file Storage
HTTP denial/success after scan and content validation, and current hosted advisors.
Compare official hosted generated types. Verify tenant revocation while jobs run,
worker privileges, source CAS/retries, failure quarantine, retention/orphan cleanup,
resource limits and no client-upload bypass. Benchmark provider output using a
representative redacted corpus; confidence alone cannot authorize a price.

Before payroll reliance, independently validate classification, jurisdictional break
and overtime rules, salary treatment, deductions and period corrections. No live
payroll execution, withholding, filing or disbursement is implemented. Before later
customer execution, validate tax references, authorization evidence, immutable
conversion and separate merchant/provider sandbox routing. No automatic surcharge.

Current Supabase changelog was reviewed, including TLS cipher deprecation and
PostgreSQL 17.11 changes. The test schema does not use ltree, legacy pgcrypto PGP,
btree_gist float indexes or custom selectivity operators. No hosted resource was
changed to accommodate these announcements.
