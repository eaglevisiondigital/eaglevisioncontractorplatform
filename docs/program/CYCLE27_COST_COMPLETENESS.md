# Cycle 27 — Canonical cost completeness and independent invoice requirements

Parent: `f81081b3ce8fca63443a9f03e8bfcd5aa4daa4b6`.
Branch: `codex/cycle27-cost-completeness`.
Author: `/root/cycle25_finance_intelligence_resume`.

The existing native cost-action result omitted the complete independent invoice
requirement list while staff inspected labor/material sources. All three brands
reproduced the omission against actual native requirements. An actual browser also
showed that the same panel omitted recorded actual cost, outstanding commitments
and remaining forecast even though its existing canonical category already carried
those values. Staff had to inspect separate source selections to review those gates.

The existing action now copies the original invoice requirements through an explicit
`id`/`status`/`detail` allowlist. Its existing component displays them beside the
selected source and original aggregate invoice outcome. It shows the selected native
source status, original category budget, recorded actual cost, outstanding commitments,
remaining forecast and projected category cost, plus the already available canonical
warnings and missing evidence. Values and ordering come from the original readers
and `jobFinancials`; no amount is recalculated or allocated to an individual entry.

Recorded costing does not prove settlement or make unposted labor zero. A material
review or canonical cost-complete flag cannot clear independent invoice requirements,
issue an invoice, establish a contract, create debt or authorize payment. Missing
receipts/provider evidence remains UNVERIFIED. Existing current-source/staff checks,
exact selection, refresh invalidation, original callbacks and UNKNOWN custody are
unchanged. This is the same action result/component, not another read-model layer,
engine, store, navigation system, writer, receipt owner or restoration adapter.

## Actual verification

- Three original source regressions RED: the selected labor action lacked the exact
  original requirement list; their reports remain private.
- Actual original browser RED for all four omitted facts; the same corrected fixture
  passes all four checks. Its transient loopback-only server/browser closed afterward.
- **26 unique source cases PASS**: twelve new cases and fourteen unchanged Cycle 26
  cases across all brands, original source kinds, native material approval, exact
  canonical totals, independent invoice gating, revoked/foreign denials and UNKNOWN.
  The first broader run preserved 25 passes and one new-test missing-import failure;
  only that import was fixed, and only the affected case was rerun successfully.
- Strict types, scoped lint and formatting pass. Main independently records exact
  committed combined browser/accessibility, protected-source and GitHub CI evidence.

Only the existing `.ts`/`.tsx`, one new test and this document change. Scoped CSS,
historical assertions, shared engines and all protected files remain unchanged.
Private raw reports live under ignored `artifacts/cycle27/`; they cannot restore
business state or confer operational acceptance.

Branding/approved designs, migrations/P1/four artifacts, customer14/4B, Netlify/executor/
recovery, Auth/MFA, NMI and all financial/provider/communication gates remain intact.
No hosted mutation, posting, payment, invoice issue, dispatch, customer communication,
merge, deployment or restoration. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
