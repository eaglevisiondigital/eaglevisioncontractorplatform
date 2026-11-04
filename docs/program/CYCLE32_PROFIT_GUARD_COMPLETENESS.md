# Cycle 32 · reconcile recorded labor completeness

Parent: `43e622b16aa952f5dc2fe7ae9f96260b47682c2e`.
Branch: `codex/cycle32-profit-guard-completeness`.
Author: `/root/cycle25_finance_intelligence_resume`.

The existing Profit Guard verifier rereads canonical completion evidence but
previously compared only the retained job fingerprint when no time proposal was
selected. Actual `recordTime`, `submitTime` and `reviewTime` operations can change
the original reader's unresolved or approved-unposted labor coverage while the
job revision, posted labor, canonical costs and projected contribution remain
unchanged. The old verification consequently returned `CURRENT_JOB_SOURCE` for a
review whose displayed completeness evidence had changed.

The new twelve-case source regression reproduces that discrepancy through the
actual Phase3Repository and LocalJobMarginReader across all three contractor
brands. On unchanged source, six positive boundary cases pass and six completeness
assertions fail: both approved-unposted time and unsubmitted tasks are missed.

The correction changes only `src/lib/profit-guard.ts`. After its existing current
job and membership checkpoints, the verifier also compares the already-read
canonical completion with the original immutable review's completion. An observed
difference returns `STALE`, no replacement, with workforce authority still
`UNKNOWN`. It adds no reader, cost calculation, write, evidence store, restoration
adapter or posting mechanism. The original job-revision mismatch remains UNKNOWN;
the original review and its integrity hash remain unchanged. Unrelated overhead
time does not replace or stale unchanged selected-job completion.

The focused run passes **61/61 cases**, zero skipped: twelve new regressions and
49 original Profit Guard cases. Confirmation withdrawal and staff revocation
across the original await still return UNKNOWN rather than exposing a private
stale assessment. Reconstructed reviews and foreign staff remain denied. All
execution authorities remain false, and provider/settlement evidence stays UNKNOWN.
Scoped lint and formatting pass. Raw RED/GREEN results remain private under
`.staging/program-cycle32/evidence/finance/`. Main retains combined strict-type,
browser, independent source review and exact-head CI verification.

This is conservative reconciliation of observed canonical completeness, not proof
of atomic workforce capture, durable receipts, genuine Auth, complete invoice
prerequisites, physical completion or final net business profit. No time is posted,
invoice issued, ledger modified, payment executed or customer acceptance inferred.
Approved designs/branding, historical migrations, customer14/4B, frozen P1/four
artifacts, Netlify, recovery, MFA/Auth, NMI and production restrictions are preserved.
No hosted mutation, dispatch, communication, operational restoration, merge or
deployment is authorized. Release 1.0 remains NOT READY / NOT AUTHORIZED.
