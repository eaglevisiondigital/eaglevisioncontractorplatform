# Existing-source local job margin analysis

Date: 2026-11-01. Feature IDs: FIN-002 / UX-001. Branch:
`codex/program-job-margin-analysis`, exact parent PR6
`5329b0cc226f55cef3ee2862cb690cd7ed3f62b4`. Local engineering only.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Audited gap and resulting behavior

The existing `jobFinancials`, Phase3Repository and Jobs dashboard already calculate
immutable issued baselines, approved expense costs, unpaid commitments, forecasts,
change orders and projected contribution/margins. This package adds one detached
read projection and an isolated real component: exact issued-source verification,
category cost variance and explicit expense/locked-labor coverage. No second cost
engine, job/expense store, ledger, repository mutation or provider adapter is added.
Existing Jobs, App, shared types, global styles and approved artwork remain unchanged.

`LocalJobMarginReader` defaults OFF, rejects connected repositories and accepts only
existing sample companies with a current active synthetic owner/admin. Estimator,
field, customer, platform-only and unknown identities receive no cost reads or
private margins. Current sample memberships are local fixtures, not genuine Auth/MFA
or server authorization. The strict primitive fixture projector is not an access
boundary; any later producer must retain server authority and independently reviewed
source coverage. No operational endpoint or UI registration is supplied.

The reader binds organization/job/lock revision/estimate/issued version/customer/
property/currency, then rechecks the source observations and current membership.
The immutable issued payload and calculation are checked with existing engine v1,
saved reviewed tax snapshot and `baselineFromEstimate`; `jobFinancials` remains the
only job-cost calculator. Exact source IDs, duplicate expenses/events/decisions,
credit-to-approved-payment identity, foreign jobs and stale revisions are rejected.
Approved labor expense rows cannot duplicate workforce costs. Money stays in bounded
integer minor units with explicit currency; variance is an exact integer subtraction.
No currency conversion, cost-to-complete model or new financial obligation is inferred.

Actual local source limitation: Phase3 sample issue retains `location_snapshot:null`
even when the issued payload has a property ID. The reader checks that authoritative
payload ID against current `Operations.syntheticProperty`; a present historical
snapshot must also match. No property snapshot/address is invented, and historical
snapshot completeness is not claimed. Existing source behavior is not changed.

## Coverage and privacy

| State                   | Meaning                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UNKNOWN                 | Exact job/issued source or labor-summary/currency coverage is absent, ambiguous or inconsistent. No totals or category figures.                                                                              |
| PARTIAL                 | Exact accessible sources support projected figures, but management completeness, reviewed expenses, locked approved time, or remaining forecast/commitments are incomplete.                                  |
| DECLARED_COSTS_COMPLETE | Existing management flag and canonical completion agree, and available approved time reconciles to retained locked labor. This is a local declaration, never final profit or proof all economic costs exist. |

Approved time outside locked periods is counted separately, not silently treated as
zero labor. The reader verifies available locked period rows against exact entry/
worker/review/job identity and the existing aggregate job labor. Missing policy
currency, unmatched aggregates or duplicate retained entry rows withhold totals.
Append-only adjustment detail is not exposed by WorkforceData: duplicate-entry
adjustment histories conservatively remain UNKNOWN rather than inventing custody.
Superseded historical time can conservatively retain a PARTIAL coverage warning.
No locked payroll is regenerated, posted or altered by analysis.

Projected contribution excludes unallocated overhead and taxes. Zero revenue or an
unsafe canonical margin ratio displays an unavailable margin, never a fabricated
zero percentage. Missing sources do not become zero-profit claims. Available records
are not a complete economic history, actual work completion, payment/settlement,
payroll compliance or customer consent. UNKNOWN never authorizes replay/correction.

The output allowlists only exact scope/source IDs, counts/coverage/reasons and
aggregate category/total values. It excludes supplier names/documents, customer
contacts/addresses, line-level costs/notes, individual worker rates, payroll rows,
deductions and all unknown fields. Inputs are detached before async reads; the final
output is recursively frozen. Source/member changes during loading deny the read.
Changing reader/scope/actor remounts the component; loading/errors withhold prior
figures. Read-only snapshots do not promise immediate remote erasure after revocation.

## Runnable isolated demo and browser evidence

From this finance worktree, run:

```sh
VITE_JOB_MARGIN_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4188 --strictPort
```

Open `http://127.0.0.1:4188/preview-job-margin-demo.html`. This standalone HTML imports
the test/development composition, never App. It requires DEV, exact flag and literal
`127.0.0.1` before constructing fixtures. Off/production/non-loopback stays disabled.
The preview-prefixed path also retains the existing closed staff Supabase/Auth
initializer. Do not rename it to an unguarded path. Ordinary `npm run build` has only
the existing index entry, so it does not emit this HTML or import this component.
The demo uses actual isolated Operations/Phase3Repository sources for all three
companies; role controls exercise synthetic identity checks, never real impersonation.

The browser suite bundles this actual component and intercepts only the standalone
document on loopback. It exercises desktop/tablet/mobile across every company,
field/estimator denial, missing-job UNKNOWN and default-OFF, with axe, page-overflow
and external-request checks. Nine synthetic screenshots are retained locally in
`artifacts/finance/job-margin-{desktop,tablet,mobile}-{sample-property,sample-construction,sample-roofing}.png`.
Screenshots and the node_modules symlink are excluded from the source commit by an
explicit file allowlist; they are not acceptance evidence for physical devices.
Desktop construction and mobile roofing images were visually inspected. A scoped
component stylesheet fixes inherited definition-label contrast; locked CSS is intact.

Focused validation: 30 new margin cases plus existing jobs/workforce, finance export
and verifier suites: **141 PASS**. Actual responsive browser suite: **3 PASS** (each
covers all three companies); zero exercised axe, page-overflow or external-request
failures. Strict TypeScript, owned ESLint/Prettier and local production build pass.
Main `features:check` passes25 records; direct finance-tree validation matches all
five locked files/thirteen design bindings. Root tooling is integrator-owned and is
not copied into this exact-parent finance branch. No unrelated recovery/Netlify/
native baseline suite was rerun. No CI/hosted acceptance is inferred before a reviewed
commit and exact automatic CI. Final checks are reported with the handoff.

## Separate finite NMI preparation

[NMI_OPERATIONAL_ACCEPTANCE_GATES.json](NMI_OPERATIONAL_ACCEPTANCE_GATES.json) makes
the existing [NMI plan](FINANCE_NMI_ACCEPTANCE.md) eight finite evidence gates explicit.
Every gate remains UNVERIFIED; operational readiness, execution, credential retrieval,
provider calls and hosted actions are false. It requests no evidence from the user,
loads no credentials, runs no provider experiment and duplicates no prior simulation.
Actual private merchant/account/bank/source/target evidence needs separately approved
custody. Local tests and hashes cannot satisfy genuine merchant/settlement/Auth/token/
provider/legal/accountant/release acceptance. Gate order never authorizes an action.

Rollback removes an unwired read-only component/projection/demo and finite contract;
there are no schema/data/ledger changes or operational effects. Keep all13/pending14/
original4B, original P1/four artifacts, approvals, locked UIs/artwork,2A–2F, six billing
proposals, recovery/Auth/financial/provider/Netlify/production/deploy/merge gates.
