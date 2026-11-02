# Cycle 7 independent combined integration review

Verdict: **CLEAR for bounded local integration of the three exact candidates**.
This is source/testing evidence, not genuine authentication, operational acceptance,
dispatch, financial authority or release approval. Release 1.0 remains
**NOT READY / NOT AUTHORIZED**.

Reviewer `/root/cycle6_integration_review` is independent of all three authors.
The isolated `codex/cycle7-combined-review` worktree starts from Main's exact
`f89c2bd32d1f5c8a05a1f12805140235845c81fb`. The final author files and Main's temporary
composition were copied solely for review. The reviewer changed no business source;
only this document and `tests/cycle7-integration.test.ts` enter the reviewer commit.

## Exact sources and data ownership

| Candidate          | PR  | Exact reviewed head                        |
| ------------------ | --- | ------------------------------------------ |
| Customer Service   | 46  | `31ed4d58b858697459165f16d9657f38ee46e577` |
| Staff Job Review   | 47  | `315bb1d40bee6a2a4d76ed6cd2384d9ecfa2de50` |
| Booking/Scheduling | 48  | `08acaa571a8a92c0091d7dad1350c0988d2b5551` |

All **15 author-owned files** were independently compared byte-for-byte with their
actual final Git objects. The Job Review adapter SHA-256 is
`f6ca9b3e14cc2339c2ccbff8772a847a7f23fc1496a37a6bda6484f8ea35f502`.
The earlier `9607ff3` Job Review is superseded; its incomplete primitive admission
must not be substituted for the reviewed final source.

The three adapters consume the same actual `prepareLocalJourney` instances:
Operations/CRM, Phase3Repository, PropertyRepository, customer model and issued
version/job/assignment/report relationships. They introduce no booking, estimate,
property, time, financial or customer-service data store. Exact IDs and published
versions remain authoritative. No wording-based or newest-record association is used.

Booking retains the original visit and plan revisions. Its alternate date is an
explicit unsaved JOB_WINDOW with no visit mutation, using the existing crew-capacity
engine. Staff Job Review uses existing canonical Finance/Profit Guard/cost calculation,
time validation and strict issued-scope projection. Unsaved material/time inputs do not
become actual costs, forecasts, payroll or invoice records. Customer Service composes
existing history search and customer-safe report/Passport projections over the exact
job's published reports. Internal staff costs, notes and workforce inputs do not enter
its search result or issued-scope navigation.

## Findings and closure

**C7-I1 — nonprimitive time allocation accepted, independently reproduced and closed.**
At `9607ff3`, `String(time.allocation)` executed a caller-provided `toString` method.
An object returning `job`, combined with a string overhead center, produced a successful
review containing an allocation object, `jobId:null` and serialized `allocation:{}`.
This violated the declared primitive job/overhead contract even though no time was posted.

The author now requires a primitive string and exact enum before conversion,
fingerprinting or source reads. The independent test first failed against the earlier
head and now passes against `315bb1d`: the malformed input is rejected and the harmless
conversion spy is never called. The reviewer did not implement this fix.

Main separately found the nested legacy Finance presentation created duplicate
accessible landmarks in the combined page. The final Job component has the narrow
`showFinanceDetails` option, defaulting true for existing use. Main passes false and
retains the original Finance view and reader. The reduced Job view still shows exact
invoice requirements and NO_GO; it does not alter calculations or financial authority.
The reviewer inspected this final source; Main owns actual axe/browser closure.

The final Job wrapper also resets on source-instance, exact-target, enabled/admission
and presentation-context changes, preventing the prior-view reuse reported by Main.
Existing Booking and Customer wrappers similarly isolate repository/model/context
changes and cancel late results. No approval or duplicate execution is inferred from
React presentation state.

## Focused independent evidence

`tests/cycle7-integration.test.ts`: **8 new independent cases PASS**.

- Three actual contractor brands compose Booking, Job Review and Customer Service on
  one exact company/customer/property/job/issued-version/report context. Shared source
  hashes match. Existing business writers are spied and source/Property/ReleasePreview
  state remains unchanged by the composed reviews.
- Alternate-day booking retains its immutable original visit and reports no movement.
  Internal cost/time proposals remain explicitly unsaved and unposted. Issued totals
  remain canonical and unchanged; invoice identity remains absent.
- Customer results exclude private staff text, internal costs, workforce/supplier
  fields and a deliberately distinctive proposed unit cost. Coverage and physical
  completion retain UNKNOWN/UNVERIFIED semantics.
- A real plan revision invalidates Booking and Customer retained context while the
  unaffected staff cost review remains current. Old published-result bytes remain
  immutable: shared ownership does not invent cross-module state transitions.
- A real second job/visit/report on the same customer property cannot supply a booking
  source, material line or customer report for the selected original job. Actual
  foreign-company repository/model instances also reject all three original targets.
- Actual reviewer revocation blocks all three retained adapters. Original booking
  note, job input revision and customer filter mutations during real digest awaits
  withhold the result; no replacement or replay occurs.
- The malformed allocation regression above rejects without caller conversion.

The combined focused run is **157 distinct cases PASS across six files**:
132 author cases, 17 retained independent Cycle 6 cases and these 8 new cases.
Overlapping older suite totals are not added. Strict TypeScript, reviewer-owned lint
and formatting pass. The original Cycle 6 checker still reports **38 exact owned
files, 128 protected hashes, five design/artwork locks and thirteen bindings PASS**.
No protected manifest, source hash or assertion was relaxed.

```sh
npx vitest run tests/cycle7-integration.test.ts tests/workflows/cycle6-independent-review.test.ts tests/cycle6-operations-independent-review.test.ts tests/cycle7-customer-service.test.ts tests/cycle7-job-review.test.ts tests/cycle7-booking-scheduling.test.ts
node scripts/check-cycle6-integrity.mjs
```

Main owns the separately run actual desktop/tablet/mobile, keyboard, axe and responsive
composition evidence and exact-SHA CI. The independent reviewer does not claim those
results from static markup or rerun completed recovery/Netlify/native-security suites.

## Preserved limits

All three new components remain behind the existing default-OFF HTTP-loopback
development journey. Approved customer/back-office interfaces and artwork are unchanged.
Booking/crew availability and workforce validation remain CAPTURED_NOT_ATOMIC with
actual availability/current coverage UNKNOWN. Customer documentation does not verify
physical completion, approval or warranty. Proposed overhead centers are unverified;
missing labor, supplier provenance, contract, invoice, legal/tax and NMI evidence are
not filled with invented values.

No real Auth/session, connected customer access, message/provider request, purchase,
dispatch, stored time/expense, payroll, invoice/receivable/debt, payment or ledger action
is authorized or performed by these reviews. Thirteen historical migrations, pending
customer14/original4B, frozen P1/four artifacts, approvals, 2A–2F, proposed billing,
Netlify/archive/executor/recovery and NMI/MFA/provider/financial/communication/hosted/
production/deployment/merge gates remain intact. Independent physical recovery and
genuine operational acceptance remain separate owner/external dependencies.

## Main integration addendum

Final PR47 head `63de3caef6bcf19dec76f1797ead4f0be72bb2a7` changes only scoped
JobReview CSS after the reviewed315bb1d source. The adapter, component and regression
tests remain the independent reviewed bytes. Main verified the final stylesheet
hash and all15 author paths with the source checker.12 actual combined browser
cases pass across all brands/viewports, including zero axe violations, original
context/privacy, exact source focus, header bounding geometry and contractor tokens.
The mobile header correction was verified from actual screenshots; it changes no
authority or domain behavior.215 distinct focused application cases pass. This
addendum is Main's UI/integration evidence, not an additional independent domain
review or genuine operational acceptance.
