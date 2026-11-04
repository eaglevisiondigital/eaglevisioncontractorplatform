# Cycle 25 · read-only native offline-source reconciliation

Exact parent: `31e2bf5b05f6befac1c24314a31d2eabe65c5219`.
Bounded owner: Advanced, `/root/cycle25_customer_advanced_resume`.

Cycle 24 initially verifies eight canonical job/estimate fields and four native
visit/plan references. The returned original `SyncAdmissionReview` retains only the
eight-field comparison. Its ordinary current check does not, by itself, establish
that the native visit and plan still have the originally reviewed revisions.

`reconcileOfflineSourceAdmission` takes that existing registered comparison, the
original registered requirements and operations experiment, and the unchanged
finite external protocol. It verifies the exact comparison kind/reference/requirements
hash and all eight canonical plus four native references. The existing operations
owner performs native source reconciliation; admission, original comparison/current
source fences and the live protocol are rechecked before and after its asynchronous
reads. Copied handles, missing references, wrong tenant/job/version, external label
substitution, native revision drift and current authority denial return UNKNOWN.

The function is stateless. It creates no handle registry, comparison, reference
claim, attempt owner, queue, receipt, saved note, import, sync, restore or writer.
The existing original claim and any original UNKNOWN hold remain authoritative;
this read cannot clear, replace or replay them. A malformed or unrelated external
proposal is a failed read, not a newly persisted hold. The caller may inspect the
same exact original inputs read only; it gains no mutation authority. A temporary
failure cannot be represented as a successful durable ACK. There is no independent
expiration authority in this protocol: original live-source and admission validity
are checked, and operational expiry/receipt requirements remain unaccepted.

The narrow answer explicitly says `CURRENT_EXACT_READ_ONLY` only at that read,
`operational_ready: false`, `durable_receipt: false`, `replay: FORBIDDEN` and no
replacement. It does not return or serialize internal capture note text or costs.
The original eight-field comparison and all initial Cycle 24 tests remain unchanged.
Focused tests cover all three brands, native visit/plan updates, current staff
revocation, concurrency, exact twelve-field substitution, unregistered/copy/accessor
inputs, original UNKNOWN retention, foreign sources, live changes during original
reads and ambiguous read failure. No writer or new comparison/hash is invoked.
Raw results persist privately in the worktree's `artifacts/cycle25/`; Main records
final counts and combined/CI evidence separately.

This consumer remains unwired and default-OFF outside explicitly confirmed DEV
HTTP loopback. No operational adapter, provider, financial action, hosted mutation,
communication or physical recovery claim. All protected approvals, migrations,
frozen P1/four artifacts, customer14/4B, Auth/MFA, NMI and Netlify restrictions remain.
Release 1.0 is **NOT READY / NOT AUTHORIZED**.
