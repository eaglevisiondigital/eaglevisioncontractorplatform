# Existing CRM pagination and exact estimate selection

Date: 2026-11-01. Feature IDs: CRM-001, EST-001, UX-001.
Branch: `codex/program-crm-pagination`. Exact parent:
`7556023bf3487aeaab5ddc281c919eb268f8e46f` (`codex/program-crm-contracts`, draft PR #2).
This is a local review candidate stacked on PR #2; no parent merge or rewrite.
CI is pending the separately reviewed commit/push. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.

## Reproduced defect and resulting behavior

The synthetic estimate creator resolved its customer by searching only the first
ten results returned by `Operations.listCustomers`. Adding twelve newer existing
CRM records moved the original customer off that page; creating an estimate for
that exact customer threw `Customer unavailable` in each of the three contractor
examples. The estimate editor also offered only that first customer page and an
unpaged property list. An exact selected record could disappear from its controls.

The existing `Operations` customer/service-location objects remain authoritative.
New exact readers bind organization + customer + property identity rather than
inferring membership from a visible page. `EstimateCrmSelection` provides separate
labeled customer/property searches, previous/next controls, available-result counts,
explicit reset, loading/error/empty states and exact selected options pinned across
pages. A customer change clears the selected property and resets the selector
context. A new query resets its page. Old query/customer/contractor results are
immediately hidden while loading and discarded when their asynchronous read returns.
Existing inputs, buttons, form grid and responsive styles are reused unchanged.

## Source and compatibility contract

| Owned source                                     | Bounded change                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/operations.ts`                          | Reuses existing paginated customer reads; validates bounded queries/pages; adds exact `getCustomer`, exact customer-bound `getLocation`, `listLocationPage`, and existing-repository estimate CRM resolution.                                                                                                                              |
| `src/lib/phase3.ts`                              | Resolves exact CRM identity for synthetic create/save, retains allowlisted detached customer/property snapshots and updates the current draft's customer reference consistently. Clones caller input before waits, then rechecks current CRM, original draft CAS and existing customer-revision/repair authority before committing a save. |
| `src/components/phase3/EstimateCrmSelection.tsx` | Paged presentation over the existing readers, with pinned exact selections, bounded search and stale-context hiding.                                                                                                                                                                                                                       |
| `src/components/phase3/Estimates.tsx`            | Composes the selector, preserves existing readonly/repair/customer-origin restrictions, and ignores asynchronous create/save results after the originating contractor/repository has changed or unmounted.                                                                                                                                 |

Connected readers use the existing Supabase client/RLS path with explicit organization,
customer and property predicates. Browser selections remain untrusted. No public
endpoint, authorization grant, credential loader, connected factory, schema/migration,
new store or active/inactive customer/property field is added. The actual existing
customer and location types have no active flag. Synthetic company suspension or a
disabled CRM module denies exact CRM resolution; this is not genuine Auth evidence.
Current estimating membership/source checks remain those of the existing revision
and repair workflows, including their post-wait checks. Connected estimate RPCs,
calculation/version/issue methods, issued-only projections and SQL are unchanged.

This repairs existing selector behavior and needs no new capability flag. It does
not activate unfinished work, customer routes, issuance, dispatch, communication,
financial/provider execution or operational Auth. UNKNOWN retains exact read-only
reconciliation/no replay in the existing workflows. Issued originals, previous
receipts, packets and baselines remain immutable. Rollback is code-only removal of
this child patch; no data migration or operational cleanup is required.

## Focused local evidence

All results below are local synthetic evidence at the uncommitted review candidate;
none is CI, hosted acceptance, physical-device proof or launch approval.

| Check                          | Result and exercised scope                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused application            | **234 PASS across ten suites**, including **17 new CRM cases**. Later-page customers/properties in all three companies; exact customer/property/tenant denial; missing IDs; page/query bounds; detached reads; suspended/disabled CRM; saved snapshot consistency; immutable issued originals; delayed concurrent-save CAS; current estimating membership revoked during the new CRM await with no saved mutation. |
| New browser cases              | **9 PASS**: three cases in Desktop Chrome, iPad Mini Chromium and iPhone 13 Chromium. Actual existing estimate component/repository, each of three contractor palettes; pinned selections; page/search/reset/empty states; property clearing; save and safe customer preview; late former query/contractor rejection; reader error with explicit reload; keyboard Enter reset.                                     |
| Existing browser compatibility | **12 PASS**: existing CRM customer/location workflow, all-company estimate builder/private preview, draft save/issue/revise/job-baseline separation, and exact repair-draft workflow in all three viewport projects.                                                                                                                                                                                               |
| Accessibility and responsive   | Zero axe WCAG2A/2AA/2.1AA violations and no horizontal page overflow in the nine exercised contractor/viewport CRM states. Native controls retain labels and keyboard operation. This is bounded automated/visual evidence, not complete accessibility certification.                                                                                                                                              |
| Static/build                   | `npm run typecheck`, `npm run lint`, `npm run types:check`, `npm run build`, owned-file Prettier and `git diff --check` PASS. Node `24.20.0`; no dependency changes.                                                                                                                                                                                                                                               |
| Locked design integrity        | Main's existing exported `validateDesignContract` checked this child against the authoritative contract: **5 locked files / 13 source bindings PASS**, runtime acceptance `NOT_INFERRED`. No global/scoped locked CSS or artwork changed.                                                                                                                                                                          |

The ten application suites were `crm-pagination`, `operations-preview`, `estimating`,
`customer-change-revisions`, `customer-revision-packets`, `repair-draft`,
`repair-readiness`, `sales-contract-handoff`, `customer-issuance-readiness` and
`customer-revised-estimate-loop` (`tests/*.test.ts`). The first seven passed 172
cases and the remaining three passed 62; these are distinct suites, not summed reruns.

Browser tests used reserved loopback port **4191**. The first combined run passed
18 cases; the three repair cases reached their final network assertion and rejected
4191 because that existing test hardcodes 4173 as its only local origin. An ignored
copy changed only that expected origin and its helper import path; all original
assertions then passed in all three projects. The reviewed repair spec/config remain
unchanged. This is 21 unique passing browser cases, not 24 unique cases. No process
on 4173, 4186 or 4193 was disturbed.

Nine current full-page synthetic screenshots are retained locally under ignored
`artifacts/phase3/{desktop,tablet,mobile}-crm-pagination-{sample-property,sample-construction,sample-roofing}.png`.
Desktop and mobile details were visually inspected; controls wrap/stack within the
existing layout. Test fixture controls exist only in the test document, with no App
mount or product route. Browser fixtures use same-tab memory, not persistence/Auth.

The exact PR #2 parent predates `features:check` and its shared evidence files.
This child does not copy/edit shared register/check tooling. Main owns the full
`features:check` run and combined compatibility/protected-file review in the
coordination snapshot. Unrelated successful Foundation, native/recovery, Netlify and
security baselines were not restarted. Normal automatic CI follows the authorized
child commit/push; no green result is inherited from PR #2 or PR #5.

## Unchanged approval boundary

No hosted write, credential retrieval, genuine Auth operation, migration, payment,
provider/message execution, Netlify action, deployment or merge occurred. Preserve
all thirteen historical SQL files, separate pending customer14, original4B/broker,
frozen P1/four artifacts, original approvals, locked UIs/artwork, 2A–2F and all six
PROPOSED billing enhancements. Recovery/P1-on13/customer14/exact4B+broker/NMI and
release acceptance remain independent gates. The next step is independent combined
review, then a separately approved owned-file commit/push and draft child PR.
