# Release 1.0 development coordination — 2026-11-23

Status: DEVELOPMENT EVIDENCE ONLY. Production Release 1.0 NO-GO. Do not merge/deploy/activate merchant services, run financial operations or contact customers. A financial UNKNOWN is held, never automatically replayed.

## Scope and source provenance
- This record is a documentation-only child of PR #599 commit `cb1b3768a5faa516a612673365e8fffb2fb4a665`. It is NOT an integration or source approval.
- GitHub comparison `301e6463...cb1b3768`: one commit ahead, changes only `tests/database/commercial-invoice-caller-proposal.test.ts` (608 additions, 2 deletions).
- Nov 22 Phases 0–5 Codex task **was submitted through the Codex interface**, not this Chat's connector: task `6b039f1c-4f20-83ea-8e94-d355e284c00a`, completed 2026-11-22 20:10 CT (DT-verified from task page). Evidence/reconciliation only: 0 commits, 0 patches, 0 changed files; 32 isolated connection/source-admission checks PASS after disposable-checkout file-mode correction; broader 95 PASS with two numbering suites stopped by source admission. Physical native transaction cleanup UNVERIFIED; PR #564 receipt failures open; A01–A12 NOT RUN. This is DT-supplied task evidence, not independently inspected within the GitHub connector.
- The Mac path `/Users/davesmacbookpro/Documents/ChatGPT/EAGLE VISION CONTRACTOR PLATFORM` is not mounted in this review environment; HEAD, cleanliness, worktrees and local files NOT VERIFIED.

## PR #599 workflow diagnostics (existing GitHub Actions runs; no jobs re-executed)
| Lane | Run | Evidence | Disposition |
|---|---|---|---|
| Foundation | 44620102881 | native `postgres17` success; `verify` cancelled; log ends `The operation was canceled` while npm tests running | CANCELLATION CONFIRMED. Initiator (timeout vs supersession/manual) not proven; preserve incomplete result. |
| Synthetic rehearsal | 44620102958 | `actions/setup-python@v5` requested 3.14.2 x64 on Ubuntu 26.04; unavailable | PRE-TEST ENVIRONMENT FAILURE. Validate runner/approved Python source on an isolated workflow proposal; do not change test expectations. |
| Passport preview | 44620103275 | `scripts/cycle30-chromium-dependencies.mjs:34` throws `Reviewed Ubuntu mirror and priority required`; mirror probe artifact 14576538177 | PRE-BROWSER ENVIRONMENT/TRUST FAILURE. Review probe and allowed mirror/provenance, never relax validation solely to pass. |
| Proof of Work | 44620103262 | workflow success | DOC WORKFLOW ONLY; not financial/security acceptance. |
| Native post-audit | PR #599 description | ten original native cases and 24 independent negatives reportedly passed; controller returned nonzero due to exclusive post-audit filename collision | DOCUMENTED CUSTODY/ARTIFACT ISSUE; actual runner reproduction pending, no PASS for controller. |

## Controlled PR integration order — dependency DAG, not blanket merge authorization
**UI branch:** #593 -> #594 -> #595 -> #598. #599 is an explicit one-commit child of `301e6463cf81fbe7d36fefbfdd60a28f3da6b729` (one-file test correction); confirm the parent is exactly the desired #598 integration head before admitting it. Do not assume branch numbers imply same parent, and do not promote the UI branch to production.

**Financial branch:** #592 (approved reconciliation ACK guard pair) -> #596 (review-only patch definition; not a runnable integration step) -> #597 (two-file authored connection-source guard). Retain exact #592 parent `0231feada0cac25f1461f146683f1759c8ccfd4b` and #597 committed tree as asserted in its PR; verify actual ancestry before any composition. #596's review artifacts must not be merged as runtime source.

**Cross-stream composition:** STOP. UI lineage and financial lineage must be compared for common base, protected source seal, physical file modes, tests and rollback behavior before a separate authorized development integration PR. Do not combine held 28-file financial package, #564 receipt composition or protected SQL by implication. An independent reviewer must approve a finite source manifest and exact overlap resolutions; no rewriting historical fixtures/limits to conceal divergence.

## Immediate next development work — not yet executed by this record
1. HIGH: isolate original invoice/receipt timeout and exclusive physical PostgreSQL connection custody, cancellation/discard/rollback/drain, original command ACK and UNKNOWN recovery. Add negative-first tests for ambiguous commit, late ACK, process loss and revoked authority. No financial retry.
2. STANDARD: preserve and diagnose Foundation cancellation source (job timeout/concurrency/manual); qualify supported runner environment for Python; review actual Passport mirror probe and frozen Ubuntu trust policy; isolate post-audit output filename collision without weakening evidence integrity. Only then author independently reviewed patches.
3. HIGH: reconcile actual tenant/MFA/RLS grants and invoice/ledger authority with source checks; hosted Auth/MFA/SQL acceptance remains NOT RUN.
4. STANDARD: inventory original A01–A12 scenario definitions; create only fictional offline fixtures within existing contract, record each specific prerequisite and sub-check; all operational A01–A12 remain NOT RUN until executed.
5. STANDARD: compare original 63 design references in a reproducible isolated browser environment; count only actually executed and artifact-backed checks. Current accepted 63-state coverage remains 0/63.

## Owner-only gates
D1–D3 role/custody decisions; operational SQL/writer/grants admission; approved hosted acceptance environment; first-contractor VAR sheet/NMI credentials and onboarding; production authorization. Customer identity naming conflict `Saul 2 Paul Gutters` vs `Saul 2 Paul Builders & Gutters`: FLAG FOR OWNER, DO NOT REWRITE LEGAL/DBA RECORDS.

## Evidence standard
For any later fix: exact parent/head/tree, changed paths and modes, literal commands and environment, before/after reproduction, PASS/FAIL/SKIP and original timeouts, CI lane status, independent proof and remaining gates. Source tests, draft PRs, synthetic AWS custody and preview screenshots do not constitute operational acceptance.

## Defensive invoice reliability verification — November 23, 2026 (DT courier evidence)
- Task: [Codex local task 6b045ff6-3b24-83e9-9b95-b31696de901b](https://chatgpt.com/local/6b045ff6-3b24-83e9-9b95-b31696de901b), submitted 09:47 CST, completed 10:00:29 CST after 13m24s, according to DT's direct task-page review.
- Task scope: **verification only**, branch reported as `codex/contractor-defensive-invoice-verify`; 0 patches, 0 files pushed, 0 changes applied. This branch was not visible in this connector's branch search; do not assume its current repository presence.
- Nine new defensive checks: **8 PASS, 1 FAIL, 0 SKIP**. Baseline suite: **109 PASS, 0 FAIL**. These counts belong to separate runs; do not infer unique combined coverage.
- Scenario **D — cleanup / invoice close idempotency: FAIL**. First `close()` rejected, second `close()` fulfilled while cleanup remained unresolved. A fulfilled second close is **not** evidence that cleanup succeeded or the transaction is terminal. A–C and E–I PASS as reported, but do not classify overall defensive reliability PASS.
- Physical PostgreSQL exclusive connection custody: **NOT VERIFIED**. No operational payments, hosted acceptance, invoice release or production changes.
- Prior custody task `6b04300e-8bac-83ea-a23b-7738efba500d`: unreadable after three DT verification sweeps, six subagents showed Done but no report or test counts available. Do not credit its inaccessible outcome.
- **Next proposed narrow work:** Independently reproduce Scenario D against the exact parent and original failing assertion; identify close state transitions and cleanup semantics without treating `close()` as rollback/cleanup evidence; prove that a rejected first close followed by an apparently fulfilled second close cannot lead to success/ready state, connection reuse or financial redispatch. If the correction touches protected source, prepare a smallest **unapplied** source-bound patch for David's exact approval. No default promotion or weakening of test budgets.
- All financial UNKNOWN original identities remain held and non-replayable. Release 1.0 NO-GO.
