# Task selection retains its original native view

**Local source correction only. Release1.0 NOT READY / NOT AUTHORIZED.**

Parent: `038b64acad56e436a016905dfec87aef86dcfbc8`.
The isolated M1/A2 package owns only the existing
`src/lib/workflows/task-correction-review.ts`, the new
`tests/cycle33-task-selection-custody.test.ts` and this document.

## Demonstrated problem

After validating the original review, `selectTaskCorrectionSource` read the raw
caller's `review.view` twice. The first supplied the returned wrapper's view; the
second supplied the native requested-task read. With two original authorized
same-company job views, an executable wrapper could return job A's view followed
by job B's view. The function then resolved with the original job A view paired
with job B's canonical task. A later ordinary currentness assertion rejected that
mixed result. No write or expanded financial authority was demonstrated.

The private actual-native witness reproduced this selection inconsistency across
all three existing contractor brands. The official new regression file separately
reproduced the three failures before the native edit. Those failures are returned
value assertions, not fixture errors or timeouts.

## Minimum correction

Only `selectTaskCorrectionSource` changes. The existing `prototypeFields` captures
the original own-data view and source references before the first await. The
unchanged current-review assertion validates that captured review. The selected
native source is then read through the same captured view that the function
returns. No raw caller-wrapper property access follows the authorization await.

These are original opaque references, not cloned authority or restored business
state. The original native task reader still validates source eligibility,
identity, current access and post-await state. The earlier reviewed current-read
and display/hold checks remain unchanged. Selection neither appends a task nor
renews a used or UNKNOWN correction.

## Actual local verification

| Execution                                                      | Result                   | Private raw JSON SHA256                                            |
| -------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| Parent, three mixed-view cases selected before the native edit | 0PASS /3FAIL /27filtered | `7fa0361e768936df500f4bdc94429e7d2594b6c9f939879a957c647eddf7aae4` |
| Corrected source, entire new test file                         | 30PASS /0FAIL /0skipped  | `0feaf9a2fbddd816abc18488c780a848f390bcbbd012dcdbdccbac576c8d0cd8` |

These are separate executions over the same 30 declared cases, not a sum. Original
30-second test/hook budgets, zero retries and CLI `--maxWorkers=2` were retained.
No old successful cohort was manually rerun. Reports and commands remain private
under `.staging/program-cycle33/evidence/v1-next-execution/task-selection-author/`.

The new cases cover all three brands, ordinary same-job alternate selection with
the original view, genuine native revocation during descriptor capture and the
original await, withdrawn admission, stale plan state, foreign and sibling task
IDs, copied opaque views, default-OFF and getter/malformed-input rejection. They
also preserve the original before/after acknowledgment-loss UNKNOWN and known
one-use correction outcomes, exact read-only receipt identity and no replay.
Read-only selection invokes no task writer, submit/review command or fetch.

The changing-wrapper regression confirms that safe own-data capture avoids its
raw executable getter; it does not claim that this getter executed after the
correction. Separate tests actually invoke the original native owner-revocation
operation and require denial. Canonical fixtures are the existing disposable
engines, with explicit local setup only.

These are author-worktree source results, not clean combined-head, browser,
GitHub CI, genuine Auth or physical-recovery acceptance. Main owns exact-source
admission, independent combined review, draft publication and release registers.
No new engine, store, UI, schema, receipt, navigation system or adapter is added.

## Preserved release gates

Original protected source, designs, branding, migrations and recovery artifacts
remain unchanged. Original P1-on13, customer14/4B, Auth/MFA, NMI/settlement,
Netlify, recovery, financial and production restrictions remain separate.
No hosted mutation, credential access, operational restoration, payment,
communications, dispatch, deployment or merge is performed or authorized.
