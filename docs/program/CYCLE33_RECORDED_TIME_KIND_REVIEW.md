# Recorded time kind in the existing finance review

Parent: `8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55`.

The original selected-time finance facts showed timestamps, submission/review,
correction lineage and available locked-labor references, but omitted the actual
recorded `kind`. A reviewer therefore could not distinguish `work`, `break_paid`
and `break` in those facts before returning to the original Field review. The
existing saved cost evidence already contains the native kind.

The correction adds one literal `Recorded time kind` fact to the original
`cost-coverage-path.ts` row. The existing UI renders that same facts array. There
is no new calculation, field, source, screen, store or navigation path. The enum
describes the recorded segment; it does not prove wages, posting, payroll payment,
zero cost, cost completeness or invoice readiness. All existing current-source and
authorization guards are unchanged.

## Actual evidence

- On unchanged parent runtime, three brand regressions recorded native segments
  of all three kinds and failed at the missing work-kind fact: **0 PASS / 3 FAIL**.
  Raw JSON SHA-256:
  `c3647a0231f747422cccfce9b5202745dcd07b08ac2f73538338aeb8aecca221`.
- Corrected focused execution: **14 PASS / 0 FAIL / 0 skipped**, including exact
  native work/break kinds across all three brands, actual submission/review with
  stale-read denial and explicit fresh reads, actual owner revocation, UNKNOWN
  callback acknowledgment without replay, foreign/sibling source denial,
  default-OFF admission and unchanged canonical source state after inspection.
  Raw JSON SHA-256:
  `ed6068f0ae954a154ca18198ea9d43702ef7336f831e0c59f97e453d6292f0dc`.

Both are local author-worktree executions with one worker, retries disabled and
the original 30-second test/hook budgets. No existing successful cohort, hosted
check, browser or physical recovery case was rerun for this change. Current-source
UNKNOWN/no replay, independent original invoice requirements and financial execution
restrictions remain intact. Synthetic staff access is not genuine hosted Auth.

No schema, credentials, service, ledger write, payment, communication, dispatch,
restoration, deployment or merge is authorized. Approved branding and designs,
protected artifacts, P1/customer14/4B, MFA/Auth, NMI and recovery gates are unchanged.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
