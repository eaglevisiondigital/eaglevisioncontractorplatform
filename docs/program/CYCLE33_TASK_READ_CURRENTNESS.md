# Exact current task read after caller capture

This bounded local correction extends only
`assertTaskCorrectionReviewCurrent` in the existing task-correction workflow.
Its exact parent is `6bf1f2be786e6d9c052d87e5f759a4312782be70`; the original
native file SHA256 is
`6ff2d36bfc6bfdeda8b552e2a25f961c23f3e90abbf20690d6618c0f95e087a2`.
No new engine, business store, navigation, schema or operational adapter is added.

## Demonstrated read defect

The original reader awaited the native task read and then serialized a second
raw `review.source` property access. Across all three existing contractor brands,
a same-value wrapper read invoked the actual native owner-revocation operation
after those native current checks. The reader nevertheless resolved with the
original canonical task ID, worker and task details. A subsequent ordinary read
correctly denied the revoked owner.

The private unchanged-parent witness produced **0 PASS / 3 FAIL**, raw JSON SHA256
`c1a50b223d3020202c80a4358c00377a91c4d81b8117ee245ab7ba4deaa89b5e`.
The new regression-file candidate independently reproduced the same defect before
the native edit: **0 PASS / 3 FAIL / 27 filtered**, raw SHA256
`bd085011823215f36c3d5531c3e360b356fb887a9e2d5079c68f7cee432f5dc9`.
The failures are the final returned-value assertions, not fixture or timeout errors.
Writer, submit, review and fetch instrumentation after fixture preparation observed
no actions in the original witness. This proves a read-currentness gap; it does
not demonstrate successful correction admission, financial execution or replay.

## Minimum correction and original authority

The existing `prototypeFields` captures the original view and source references
before awaiting native authorization. The reader captures the exact source ID and
serialized comparison value before the await, then calls the unchanged original
`readSavedTaskCorrection` with the original native view. It compares the native
result with that inert expected value and reuses the existing synchronous
`assertTaskCorrectionDisplayCurrent` before returning the original native result.
No raw caller-wrapper read follows the native await. Serialized comparison data
does not become authority; opaque handles are neither cloned nor restored.

The native reader still owns source eligibility, canonical records, current access
and post-await checks. The final original display guard also denies held or already
attempted correction-editor reads. It does not clear an attempt or reset UNKNOWN.
The unchanged exact read-only reconciliation path continues to report the original
source/result identity, including UNKNOWN, without retry, replacement or replay.
Locked or absent evidence never becomes permission to write.

## Focused verification

The full new collection passed **30/30**, zero failures, skips or todos, raw JSON
SHA256 `932a8cbaca5930ecfe8c4f9c532b6a2e42b5866bd1ec836cd40b9b09d4c632a5`.
The existing 30-second case/hook budgets and zero retries are retained; no old
successful cohort was manually rerun. These are local author-worktree results,
not a clean committed-head execution, GitHub CI result or hosted acceptance.

The cases cover the three existing brands, ordinary exact references and copied
source data, actual revocation during descriptor capture, source serialization
and the original native await, stale plan sources, missing and foreign task IDs,
copied non-native views, OFF admission, original before/after acknowledgment-loss
UNKNOWN, completed one-use corrections and exact unchanged reconciliation.

The safe wrapper-get case explicitly records that own-data capture can avoid the
executable getter entirely. That case does **not** claim revocation happened after
the correction. Separate cases perform genuine native revocation and require denial.
No copied business records or inferred customer/job relationships replace native
fixtures. Strict TypeScript, scoped ESLint, scoped Prettier and diff checks pass.

## Delivery and remaining gates

Author: `/root/cycle33_independent_review`. The only owned paths are the original
task-correction workflow, the new `cycle33-task-read-currentness.test.ts` and this
document. Main and a separate peer review this author change; the author does not
self-approve it. No commit, publication, source-admission support or CI success is
claimed at this author freeze. Main owns any later exact-source compatibility,
draft publication and independent combined validation.

Growth and Offline preservation audits found no additional demonstrated defect
within this bounded review; their earlier corrections remain unchanged. Historical
Foundation cancellations, the conflicting historical application results and all
other incomplete coverage remain separate. No passing result here closes them.

Preserve original branding/design locks, all protected migrations and recovery
artifacts, P1/customer14/4B, genuine Auth/MFA, NMI, Netlify and financial restrictions.
The scoped owner-witnessed main synthetic loss result is not full physical or hosted
recovery acceptance. No merge, deployment, hosted mutation, credential access,
operational restoration, payment, communication or dispatch is performed.
**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
