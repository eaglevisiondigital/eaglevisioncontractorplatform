# Cycle 31 · selected Foundation diagnostic correction

This supplement qualifies the historical independent review in PR234, commit
`09444b24868bd9b7891367e931a9bfd630dad3ef`; that review document remains unchanged.
It grants no business-state, restoration, operational or release authority.

Run `41892781409` at diagnostic source `879ddbcb8bde9690dba8002738f60a24e51f0ccb`
executes application source `1a677d67cb1f79246a7912ab7dc4ed3bacc81ccc`.
The test process succeeds with **10 PASS, 0 FAIL and 152 deselected** out of 162
collected cases. The ten C18 cases run; the nested C23 case and three nested C24
cases do not. The collector fails, so the original workflow remains **FAILED**.
The original result SHA256 is
`e5530851a4b987a39ebc12049b45b87e2bc9024df7acd28ded792ec571addcbc`.

The initial review missed a pinned-runner naming difference. Vitest 5.0.5's
`getTestName` and `createTaskName` join nested names with `>`; its JSON reporter
joins `fullName` with spaces. The original anchored filter used the JSON names,
which never selected those four nested cases. Deselected assertion rows also use
`skipped`, while the collector accepted only `pending`. The original source plan
is retained byte-for-byte, SHA256
`359ced93ef926cb161cb30216cc8bc8cc9be2d7d941dffe299a08c5cccf1b32e`.

The separate missing-four plan contains only the exact unchanged C23 and C24 test
files: 104 collected cases, four selected and 100 deselected. It binds the original
source, file/config/lock hashes, original four-worker setting and both 30-second
budgets. The runner pattern is checked against the installed pinned task-name
utility. The C18 file is absent, so none of its ten successful cases rerun. The
existing workflow calls only explicit missing-four modes, with a new artifact
path/name. The old fourteen-case run mode is unavailable.

Report collection remains strict about exact files, per-file counts, required
selected names, nested ancestors, status totals, duplicate evidence and missing
outcomes. `skipped` and `pending` mean deselected only; a required selected case in
either state fails validation. Collection reads the original binding without
rewriting it. A failed selected assertion remains a failed test step even when
its complete diagnostic report validates.

Sixteen focused parser/selection checks pass without executing an application
case. Using the pinned runner utility against the actual 104 collected identities
selects exactly the four missing names. The original first artifact is still
rejected by both the original fourteen-case and missing-four collection contracts.
Negative checks reject missing/extra selections, wrong ancestors/paths, duplicates
and inconsistent totals. An explicitly synthetic parser fixture classifies four
failed outcomes without claiming application success; no fabricated application
report is written. Original raw results remain byte-identical.

The missing four are **NOT RUN** at this source publication. Only their separately
observed follow-up outcomes may later be combined with the retained ten as distinct
source-X evidence. That would never be a single fourteen-case run, a 162-case run
or a whole-Foundation PASS. Both parent Foundation cancellations and all historical
failures remain intact.

No application source, original tests, assertion, fixture, timeout, worker budget,
protected artifact, original Foundation, approved design or operational control
changes. No hosted mutation, credential retrieval, payment, communication, dispatch,
merge or deployment. Physical recovery remains NOT RUN.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
