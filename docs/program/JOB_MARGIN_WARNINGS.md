# Existing-source job variance and margin-warning review · Cycle 4

Local candidate branch: `codex/program-job-margin-warnings`. Exact parent PR12:
`1104a1e0bf44fa1089e78408ed6a9eeb7d2c7b20`. Feature IDs: FIN-002 / UX-001.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**. No connected activation.

## Functioning extension, existing authority

Cycle 3 already verifies an exact immutable issued estimate, job baseline/revision,
current CRM customer/property, approved expense decisions and locked-labor coverage.
This package extends that same detached reader and isolated component. It does not
add another calculator, job/expense store, ledger, policy table or financial action.
The existing `jobFinancials` still owns approved-change revenue/budgets, purchase
commitment/payment/credit handling, projected costs, contribution and warning flags.
Existing estimating integer/currency/tax rules and immutable issued source remain
unchanged. A projection read never saves a forecast, threshold, expense or payroll.

The UI now separates:

- Positive projected category variance from exceeding that category's exact saved
  `job.projection.overrun_bps`. The canonical strict `>` comparison remains intact;
  equality is not an overrun. A positive cost against zero budget is shown as a
  source-supported unplanned cost, without inventing a percent variance.
- Negative projected contribution, directly from the existing canonical amount.
  It is contribution before unallocated overhead/taxes, never final economic profit.
- Canonical margin erosion versus the exact saved `erosion_bps`, in percentage
  points from the original baseline. Missing/zero original revenue and unsupported
  current ratios withhold an erosion assessment instead of treating it as false.
- Optional minimum projected margin as an explicitly confirmed local review input.
  It is not a company policy, persisted configuration, cost-to-complete model or
  approval. Omission means no floor assessment. Editing the value, unchecking the
  confirmation, clearing, changing the contractor/source/revision/actor or remounting
  removes that input. Applying it performs a fresh exact-source read.
- PARTIAL/UNKNOWN coverage independently from warnings. No warning does not mean
  complete cost capture, physical completion, verified profit, settlement or repair.

The floor accepts only a finite integer 0–10000 basis points with `confirmed:true`.
The UI parses 0–100% with at most two decimal places using decimal digits, rejecting
exponents, fractional basis points, coercion and out-of-bounds values. It compares
against the existing canonical basis-point ratio without a second margin engine.
Negative margins are not clamped. Ratio rendering uses integer digits, preserving
negative and large safe basis-point values exactly. Zero revenue and unsafe current
ratios retain null/unavailable assessments; exact supported minor-unit contribution
can remain visible. No cross-currency total or conversion is created.

## Current access, provenance and privacy

`LocalJobMarginReader` remains default OFF, sample-only, and restricted to current
active synthetic owner/admin memberships. Existing estimator, field, customer,
foreign-company and unknown callers receive no private figures. The scope and
confirmed input are detached before the first await. Two source captures must agree
on exact organization/job/lock/estimate/issued-version/customer/property/currency,
expense/review/change IDs and labor coverage. Current eligibility is rechecked after
jobs, issued history, workforce and every awaited CRM page, and before projection.
Actual membership downgrade/revocation and source drift fail closed.

A floor is bound only to the returned snapshot, never a mutable saved policy. The
output recursively freezes only detached allowlisted primitives. Supplier names,
private notes, individual rates, deductions, payroll rows, customer contact details
and unknown fields remain excluded. Existing immutable source calculations, issued
history and repository objects are not changed by review. This is local synthetic
read evidence, not genuine Auth/MFA/server authority or durable review custody.
UNKNOWN permits no mutation, retry, replacement intent, provider call or correction.

## Local demonstration

From this Finance worktree:

```sh
VITE_JOB_MARGIN_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4188 --strictPort
```

Open `http://127.0.0.1:4188/preview-job-margin-demo.html`. It retains the existing
DEV + exact flag + literal `127.0.0.1` gate before constructing synthetic sources.
The standalone document is not imported by App, emits no ordinary production entry,
and does not alter existing navigation or the approved premium customer/back office.
Its preview-prefixed route preserves the existing closed Auth initializer.

1. Select any of the three actual sample contractors; inspect exact issued version,
   job revision, category variance and coverage.
2. Enter a local percentage, explicitly confirm its limited meaning, then choose
   **Review margin threshold**. Invalid input reports an accessible error; no floor
   is applied until confirmation and validation succeed.
3. Use **Prepare synthetic cost-risk example** only in this development harness.
   It calls the existing sample `Phase3Repository.projection` with its current job
   revision to save a synthetic remaining-material forecast. The resulting exact
   revision has category-overrun, negative-contribution and erosion evidence; the
   prior floor clears. It issues no estimate, customer obligation or payment.
4. Reapply a floor, clear/edit it, switch contractor, or use the field/estimator
   identity controls. Previous private figures and local inputs do not cross context.

The new warm review panels use existing company colors through `--company-color`,
existing text/button tokens, visible focus and scoped CSS only. Cost comparison stays
inside its labeled keyboard-scrollable table; form controls wrap and remain touch
sized. No approved CSS/artwork or global presentation token is edited.

## Focused evidence

- **37 new warning/input/role cases**, with all 30 previous margin cases retained:
  67 margin cases PASS. Existing jobs/workforce, finance export and ledger verifier
  regressions included: **178 focused application cases PASS** across four files.
- Actual Operations/Phase3 source tests cover every company; saved threshold and
  exact boundary behavior; zero category budget; floor equality/one-basis-point
  changes; zero/unsafe ratios; original-zero/current-positive revenue; current
  source revision; no policy/issued-source mutation; detached input; role revocation
  after awaited jobs/CRM; tenant/property/currency and private-field exclusion.
- **6 actual browser cases PASS** on desktop, tablet and mobile, each covering all
  three contractors. Existing denial/default-OFF/UNKNOWN behavior is retained.
  New coverage exercises keyboard confirmation/submission, invalid and decimal
  inputs, source-revision reset, risk evidence, clearing/context switching, scoped
  colors, axe, page overflow and external-request denial. No exercised axe,
  page-overflow or external-request violations were observed. This is bounded
  accessibility evidence, not a full certification or genuine physical-device PASS.
- Nine new actual screenshots:
  `artifacts/finance/job-margin-warnings-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`.
  Desktop construction and mobile roofing were visually inspected. Screenshots,
  dependency symlink and build output stay out of the source commit.

Exact final type/lint/format/build/protected-integrity and GitHub results are recorded
in the main delivery register after independent review. No completed recovery,
Netlify, hosted Auth, native maintenance or provider simulation suite was repeated.

## NMI and preserved dependencies

The original eight-gate `NMI_OPERATIONAL_ACCEPTANCE_GATES.json` is unchanged, SHA-256
`3ebd06cafa0bff35dd5db2d860d2d6e00be3d5e12d84ff2df38a6ca44e01ed8b`.
Every operational gate stays UNVERIFIED; operational readiness, execution, credential
retrieval, provider calls and hosted actions stay false. Local warning evidence cannot
satisfy merchant ownership, token/capture, genuine Auth, settlement/report, accountant,
legal/tax or launch acceptance. No credentials, remote evidence or customer messages
are requested or used.

All thirteen historical migrations, pending customer14, original4B, P1/four artifacts,
existing approvals, locked approved UIs/artwork,2A–2F evidence, six PROPOSED billing
enhancements and recovery/NMI/Auth/financial/provider/Netlify/deploy/merge restrictions
remain intact. Rollback is code-only: remove the isolated warning extension. No data
or schema rollback, financial cleanup, dispatch or hosted action is involved.
