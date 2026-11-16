# Scoped new-lead inbox increment

Exact parent: draft510 `8f9cab9a6b42c057a12f1923bf35a514abc068b1`.
Isolated branch: `codex/propel-dashboard-parity-increment`.
Runtime ownership: `src/components/CompanyOperations.tsx` only.

The approved November15 reference has a connected lead inbox and owner dashboard.
This increment improves the existing Overview intake queue: its three-row truncation
now uses the canonical repository's ten-row pages, with previous/next navigation,
recorded source/status/submission date, an explicit empty state and a count labeled
as new intake requests. It adds no owner financial KPI, pipeline value or chart.
Reference states3–5 remain broader parity gaps, not newly accepted parity.

The supplied Approved Demo-to-Production Reference requires truthful scoped data and
loading/error/stale/revoked states. Existing `companyAccess`, `listModules` and
`listIntake(org, 'new', page)` APIs are reused. Intake access and module availability
are checked before and after the intake read. Results are presentation-fenced by
repository instance, organization and page; changing repository/organization resets
the page without requiring an App key. Pending, failed, denied and disabled views
hide prior rows and the intake navigation control. Role/module changes while no
new read occurs are not continuously polled. Backend authorization remains unchanged.

No original module routing, App route, canonical repository/API, global or locked
style/artwork, schema/store/ledger/adapter, dependency or protected source changed.
The file is an A2 inventory citation, not one of the128 exact protected source files
or five design locks. No shared inventory/checker was edited. Child-specific test
fixtures create disposable synthetic records through existing sample repository
APIs and cannot run in the product. The actual product receives no fixture labels,
synthetic timestamps or fabricated record counts from this increment.

Local validation at this source:

- TypeScript strict typecheck and production build PASS; existing large-chunk
  warning remains.
- Scoped ESLint, Prettier and `git diff --check` PASS.
- `features:check` PASS:25 records,1668 inventoried sources, five exact design files
  and13 source bindings. No checker/manifest rewrite.
- Two source-boundary tests PASS: original module router and canonical repository,
  App, IntakeQueue and forms stay exact; all128 protected hashes stay exact.
- Twelve browser cases PASS: four cases each at desktop, iPad Mini and iPhone13
  emulation. They exercise actual sample repository pagination and `new` filtering,
  readonly navigation, delayed tenant/model replacement without a parent key,
  access/module denial before source reads, access revocation after source read,
  empty/error states and removal of old rows/totals. The primary flow at each size
  has zero Axe violations and no horizontal page overflow.

Browser launch required the standard local sandbox escalation for Chromium's macOS
Mach-port registration. An initial fixture used an insecure HTTP test origin and
could not construct the sample repository's UUIDs; the test-only origin is now an
intercepted HTTPS URL. No external server, credential or connected call is involved.

Run only the scoped checks:

```sh
npx vitest run tests/propel-dashboard-parity-source.test.ts
npx playwright test --config tests/browser/propel-dashboard-parity.config.ts
```

This is bounded local source/interaction evidence, not genuine Auth, hosted data,
complete accessibility, accepted owner KPI/dashboard parity or production acceptance.
Saul2Paul remains the first real tenant target and Cunningham separate; no real tenant
or merchant operation occurred. No persistent execution, push, PR, merge or deployment
is authorized by this child. Release1.0 remains NOT READY / NOT AUTHORIZED.

## Successor: withdrawn last page

Independent QA reproduced a count-shrink edge on the frozen `b5f61fa` candidate:
a page-two read returning zero current requests rendered “Page2of1.” The narrow
successor preserves that commit and changes only this consumer's presentation.
When the returned canonical count no longer includes the selected page, the exact
count remains visible while rows and invalid pagination are withheld. A notice and
explicit “Return to first page” control replace them. Returning starts a fresh
existing read with original access/module checks; nothing automatically retries.
Shared Pagination, repository and all protected source stay byte-identical.

The added `@shrink` browser regression first FAILed against unchanged `b5f61fa`.
After the correction it PASSed at desktop/tablet/mobile (3cases). It also denies
access before an explicit return and verifies no further intake query occurs.
Only these affected new browser cases were run for the successor; the original
12case evidence remains attached to its frozen parent. Source-boundary2cases,
strict types/build, scoped lint/format and feature/design checks also PASS.
