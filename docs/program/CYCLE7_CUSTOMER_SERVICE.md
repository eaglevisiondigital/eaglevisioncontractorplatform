# Cycle 7 customer service evidence navigator

Owner: `/root/cycle7_customer_service`. Branch: `codex/cycle7-customer-service`,
isolated worktree `/private/tmp/propel-cycle7-customer-service`. Parent is the
Cycle 6 coordinator, with its disjoint CI-only correction at
`f89c2bd32d1f5c8a05a1f12805140235845c81fb`. Existing Cycle 6 packages and original
draft PRs remain intact. Main owns route composition, the shared contracts/register,
actual combined browser evidence and independent integration review.

## Working local functionality

`CustomerService` provides a separate default-OFF evidence navigator for the existing
admitted `CustomerPortalPreviewModel` and exact journey target. It searches allowed
published report text and recommendations using the existing
`searchInspectionHistory`; date bounds, recorded frequency, reported severity,
exact category and finding location combine through the same existing search rules.
Category/severity/location/recommendation must match one finding. Available-report
counts and matching-result counts remain distinct; history completeness is UNKNOWN.
Individual filter clearing, full reset, loading, empty and error states are present.

Result cards preserve inspection date, exact report UUID, published version and
recorded frequency. Opening a source independently rechecks that clicked report and
version, focuses its detail heading and displays exact finding IDs/source positions.
Observations and recommendations remain separately labeled. The related issued job
scope shows its exact job, estimate, issued version ID and version number. It uses
the existing customer-safe Passport scope projection, never internal estimate inputs.

No source is selected by similar words or by newest-record fallback. The actual
unique report → visit → inspection plan → job association restricts this package
to the exact authorized property and selected job. Reports for another actual job
on the same property stay excluded. Every selected candidate is re-admitted through
the existing `readCustomerWorkflow`, which validates the current synthetic staff,
customer/property context, original issued version and exact source relationship.
The anchor selection is independently verified and is not an access grant.

Original caller targets, report selectors, filters, enablement, customer context,
membership and source state are checked after asynchronous work. A synchronous
consumer checkpoint follows the component's final await, preventing a late caller
or current-source change from revealing retained results. A copied result is not
admitted. Model/company/property/selection changes isolate component state, filter
edits hide prior evidence and cancel pending reads, and exact-source failures hide
all old evidence. There is no automatic replay or replacement source.

## API and integration

```ts
CustomerService({ model, target, selection, enabled?, onSource? })
readCustomerService(model, target, selection, filters, { enabled, confirmed })
assertCustomerServiceCurrentNow(model, target, selection, filters, originalRead)
```

`selection` is exactly `{ report_id, published_version }`; `target` is the existing
`PrototypeTarget`. `onSource` is optional source-navigation presentation only.
Main composes the panel with the same `journey.customerModel` behind the existing
explicit default-OFF HTTP-loopback journey gate. No approved customer portal or
back-office layout, global CSS, shared repository, Auth, schema or migration is
modified. Scoped styles reuse existing contractor colors and warm surfaces, readable
mobile stacking, visible keyboard focus and labeled touch controls.

## Privacy and authority

The returned report fields are the existing strict published-history projection;
issued scope fields are explicitly named. Costs, supplier amounts, margins, payroll,
workforce, staff-only notes, hidden inspection findings, repair/readiness evidence,
customer responses and unrelated records are absent. Private comparison fingerprints
remain inside the reader and are never serialized into its customer-safe result.
No search database, service-request object, response/message store, recipient, live
customer URL, account/session, writer, delivery adapter or background task is added.

Inspection/checklist documentation never proves physical completion, repair,
approval or warranty. No contract, invoice, receivable, payment or customer obligation
is created. Synthetic same-tab evidence is not genuine Auth or durable custody.

## Focused verification

34 new source-based application cases PASS. With the retained history-search and
Cycle 6 Customer cases, 90 focused cases PASS. Tests cover all three companies,
exact report/version/scope references, combined filters and counts, separate-finding
matching, empty/reset states, actual other-job exclusion, foreign tenant/customer/
property/job/estimate/version/actor IDs, revoked staff, private-field exclusion,
malformed dates/unavailable filters/accessors, default-OFF behavior, source/selection/
filter/gate/logout drift after the underlying final await, frozen output, copied
result rejection and absence of business writer calls. Server-rendered controls have
visible labels and no request/send/customer-action facility.

Strict types, focused ESLint/Prettier, build, generated-type integrity, migration
integrity and feature/design integrity checks PASS. Existing five exact design locks
and thirteen bindings are preserved. Main owns actual desktop/tablet/mobile keyboard,
axe, navigation and combined source-review evidence; this author branch makes no
independent browser-execution or universal accessibility claim. Normal exact-SHA
GitHub CI is allowed and reported separately.

All thirteen historical migrations, pending customer14/original4B, frozen P1/four
artifacts/approvals, 2A–2F, billing proposals, locked interfaces/artwork, Netlify
archive/executor/recovery, NMI/MFA/genuine Auth/provider/financial/communication/
hosted/deployment/merge restrictions stay unchanged. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.
