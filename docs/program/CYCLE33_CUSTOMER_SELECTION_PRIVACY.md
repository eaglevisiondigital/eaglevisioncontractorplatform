# Cycle33 · retained request selection privacy

Author: `/root/cycle28_independent_review`.
Native owner: `src/lib/workflows/service-request-actions.ts`.
New suite: `tests/cycle33-customer-selection-privacy.test.ts` (12 cases).

## Demonstrated defect and correction

The retained expected request snapshot is selection data. Previously its
descriptors were captured after `inspectServiceRequestActions` checked native
access. On the final repeated snapshot capture, an executable descriptor Proxy
could call the actual synthetic `revokeOwner` and still receive private request,
customer, property and published-report lineage. All three brand regressions fail
on unchanged parent0597: zero PASS, three FAIL. Original report SHA256:
`4ac2339b275516617c22098e0166c5ab1d4f31de9b6fa4d9d8c84cfa2a6b6d1b`.

Capture strict own-data fields first, reject non-cloneable executable selections
and discard the clone before the original current-access read. All fourteen
allowlisted snapshot fields and seven exact identity/state comparisons remain.
No caller snapshot becomes a reader or authorization. Both original reader owners
still check native current access and immutable published provenance.

New tests retain ordinary copied selections, deny foreign customer substitution,
exercise actual native revocation before and during a published-report digest,
and preserve UNKNOWN request-to-job linkage, physical completion and acceptance.
No request/job relationship is inferred from a shared property.

## Actual validation

Actual single-run 104/104 PASS, zero failures/skips: all12 new cases and
the untouched C24 request actions, C28 request provenance and C30 form-boundary
suites. Raw report SHA256:
`d0c3783c1b2af6a0054ccf98ac1d76204795d725f501745334949e968047e741`.

## Scope and acceptance limits

Author parent is `0597bb3330f22d69f68a67098e950693e0648172` (Cycle32).
This package owns one existing native file, one new source-based test file and
this document. Tests use the actual existing synthetic repositories and all three
contractor brands. Native writes invoked by tests remain local fixtures, never
genuine Auth/MFA, hosted acceptance, customer acceptance, financial execution or
communications. No route, business store, engine, schema, ledger or restoration
adapter is added. Ordinary original inputs and native current-source, one-use and
UNKNOWN/no-replay fences remain authoritative.

Original tests, browser assertions/budgets, source checkers, locked interfaces,
branding, migrations, sealed recovery kit and prior physical evidence remain
unchanged. Source admission and exact-head CI need Main's separately reviewed
fixed author pin; no author browser or hosted CI PASS is inferred. No operational
provider, sender, dispatch, payment, recovery or production gate is promoted.
P1-on13, separate customer14/4B, Auth/MFA, NMI and all prior release restrictions
remain intact. Release1.0 remains **NOT READY / NOT AUTHORIZED**.
