# Native intake fixture correction

This separate M2/A1 package has sole parent
`4596e0215514367dfe92ab0e7ba7863cce75546b` (draft PR319). The original PR319
six-file source, local startup failure and hosted failures are preserved. No
runtime, SQL, Auth, schema, original test, source pin, CSS or business authority is
changed.

## Demonstrated fixture failure

Both original dedicated native jobs reported **0 PASS / 21 FAIL**, with no skipped
or todo cases. All 21 failures occurred in the new fixture's initial
`configure_company` call at native spec line130, where the plan value `synthetic`
violated the original `organizations_subscription_plan_check`. Original Phase2 SQL
line4 permits only `pilot`, `standard`, and `professional`; the existing Operations
database fixture uses `pilot`. The intended access/assignment/row-wait assertions
were not reached. There is no observed revocation denial or bypass from this run.

| Original event | Run         | Native job   | Raw native JSON SHA256                                           |
| -------------- | ----------- | ------------ | ---------------------------------------------------------------- |
| push           | 42443817149 | 128618434470 | 53cd886dcfce10db97090f2c85a2607499987c0196e4d0bd5b9673b28a05c49e |
| pull request   | 42443841191 | 128618507953 | 46a790ed76e1f966bfc72dd2ac75e4dddcf5d7f669a91524a2db3bc6486cf312 |

The native witness directory was absent and recorded explicitly as
`RAW_UNVALIDATED_NOT_ACCEPTANCE`, `present:false`, no files. The strict collector's
subsequent `ENOENT` is a secondary missing-witness result, not a security outcome.
Each job retained the original native exit1 and unchanged complete 2,199-file
before/final source proof. The author matched these provider ZIP digests to the
downloaded bytes:

- push native: `d977c7b297e93814fcac645cc46bed2d9f647c97d301bfda45e4110541090430`
- PR native: `edc0aab889fbf9e97200392db5b3ad7918cce8a5468145acdbba98e6b8876b05`

The earlier local PostgreSQL `initdb` shared-memory failure remains **21 NOT_RUN
locally**. No local PostgreSQL retry or unrelated cluster/IPC/kernel action occurs.

## Exact correction and admission

Only the two new native spec plan literals are mechanically replaced:
`'synthetic'` → `'pilot'`, in initial fixture setup and the module-withdrawal call.
No assertion, test identity, desired `42501` denial, canonical no-mutation
requirement, witness, timeout, hook, worker, retry or original engine changes.
The original native file's SHA256 remains recorded in PR319; this successor does
not rewrite its evidence or declare its intended authority checks passed.

The existing new workflow is narrowed to a **native-only** one-entry matrix on
the separate correction branch and PR319 base branch. It requires the exact sole
4596 parent, that parent's original A6/sole-313 lineage, and exactly native M1,
workflow M1 and this note A1. Before returning a source proof it requires the
original native bytes with exactly two matching literals and exactly that
replacement. The original UI spec, harness, native config and A6 note stay byte
exact. All other 2,197 prior tracked files are unchanged; the new total is 2,200.
Actual checkout SHA, same-tree original-base PR carrier, regular file modes and
all tracked bytes remain checked before/final. Native report validation and
unconditional raw/unvalidated witness preservation are unchanged.

The command runs only the same 21 native cases against an ephemeral PostgreSQL17
CI service, using the original 30-second test/hook budget, one worker and zero
retries. The required lock-wait denials remain ordinary assertions. A fulfilled
write after observed committed caller/module withdrawal must stay **FAIL / security
blocker**. Missing independent native sessions remain an explicit error, never a
skip or expected-permissive case. Original SQL and synthetic JWT fixture boundaries
remain; this is not genuine Auth or hosted application acceptance.

Original PR319 browser jobs both succeeded separately at 4596. Their raw scope is
36 UI cases per event, not native authorization or 72 distinct cases. This native
correction does not run them again and makes no new-head browser claim. Original
browser/config/harness bytes are retained; their existing results are separate
from this successor's pending native outcome.

All original Foundation, recovery/P1/customer14/4B/Auth/MFA/NMI/Netlify, approval,
financial, communication, dispatch, production, deployment and merge gates remain.
D1's eleven roles remain UNASSIGNED; D2/D3 and A01–A12 remain separate/NOT_RUN.
Release1.0 remains NOT READY / NOT AUTHORIZED.
