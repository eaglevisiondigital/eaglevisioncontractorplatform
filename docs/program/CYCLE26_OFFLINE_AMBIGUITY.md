# Cycle 26 · original offline read ambiguity diagnostics

Exact parent: `af95671f70bae6585b39e299ba00ca201f8e6512`.
Bounded owner: `/root/cycle26_customer_offline`.

The existing `reconcileOfflineSourceAdmission` correctly kept missing or conflicting
read evidence UNKNOWN, but every unavailable case returned an indistinguishable
object. Staff/integration callers could not tell an invalid external protocol from
an unavailable original comparison or an unavailable native capture. The new focused
baseline demonstrated twenty missing-reason assertions; the three valid unchanged
reads passed. This is a read-diagnostic gap, not evidence that any command failed.

The same stateless function now returns one finite reason with UNKNOWN. Admission,
original comparison/requirements, strict external protocol, native capture and exact
binding/live protocol are distinguished using only the original validation stage.
An explicit original capture `STALE / SOURCE_CHANGED` or `HUMAN_PROPOSAL_CHANGED`
can produce its corresponding reason. A lost read acknowledgment, absent handle or
unspecified denial remains unverified. No raw exception, private source content or
provider details are returned. A pre-existing saved source change can deny at the
original comparison fence before capture inspection; the diagnostic does not bypass
that denial to invent a more precise cause.

Successful exact read answers are unchanged. All eight canonical and four native
visit/plan references, registered original handles, exact source label/requirements
and live-current checks still apply before/after original asynchronous reads. There
is no new parser, protocol version, claim, hash, comparison, registry, attempt owner,
writer, queue, import, synchronization, persistence or restoration adapter.

All diagnostic outcomes retain `status: UNKNOWN`, `replay: FORBIDDEN`, no replacement,
`durable_receipt: false` and `operational_ready: false`. A reason is not a command
receipt, failed-execution conclusion, retry capability or acceptance. An unrelated
malformed read does not create a new permanent hold; existing original owners retain
their own UNKNOWN custody, and exact read-only reconciliation cannot reset it.

Focused cases use all three canonical contractor fixtures. They verify unchanged
read shape, actual saved and during-read source drift, changed original human input,
revoked membership, OFF-before-getters, malformed/accessor protocols, copied handles,
lost native read ACK, four exact visit/plan mismatches, live external relabeling and
no hash/write/claim/replay side effects. Original C24/C25 tests are unchanged. Three
new expectations were corrected after the original current-source owner correctly
denied before native capture access; that failed report is retained. Actual results
and commands remain private under `artifacts/cycle26/`; Main records final counts,
combined/browser and exact-head CI separately.

The function remains unwired outside explicitly confirmed DEV HTTP loopback. Existing
P1/four artifacts, thirteen historical migrations, pending customer14/original4B,
Auth/MFA, NMI, financial/provider, communications, dispatch, Netlify, recovery and
production restrictions remain unchanged. No device readiness or physical recovery
PASS is claimed. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
