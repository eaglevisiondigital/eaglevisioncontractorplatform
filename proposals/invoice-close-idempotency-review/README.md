# Scenario D invoice close qualification

**Disposition:** Independently reproduced on the current coordinated development frame. The original Scenario D run remains **INDETERMINATE in this investigation**. Protected source correction is **UNAPPLIED**.

## Original evidence

The [prior Codex task](https://chatgpt.com/local/6b045ff6-3b24-83e9-9b95-b31696de901b) returned `Domain forbidden`. [PR #600's task record](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/blob/4d52beee582734ea1367b735619ac20dd3492481/docs/release/RELEASE1_DEV_COORDINATION_2026-11-23.md#L39-L48) reports nine defensive checks at 8 PASS / 1 FAIL / 0 SKIP and a separate baseline at 109 PASS / 0 FAIL. It names `codex/contractor-defensive-invoice-verify`, which was absent from the seeded workspace and advertised GitHub refs. The original test bytes, deadline, command, runner output and exact source frame were unavailable. Neither original suite was executed here.

## Executed on the unchanged current source

The isolated checkout used commit `4d52beee582734ea1367b735619ac20dd3492481`, its immediate parent `9e85622b57fac624fe0ddd3fa8f5f18c1ba22bfd`, and tree `97dc8c49e8cfe9e141d99fb092eb4c29ca25b678`. Public `main` was a README-only tree. The coordinated head was selected as an independently identifiable development base. The checkout's tracked physical modes were restored from the Git index after its initial 0600 materialization failed exact source admission. Git source bytes and index modes were exact, and the genuine guard then passed.

The [actual runtime beforeimage](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/blob/4d52beee582734ea1367b735619ac20dd3492481/proposals/commercial-invoice-connection/connection.ts) was mode `100644`, blob `5a70c2be35b1aff54fd4ad179d8bca44448a9947`, SHA-256 `50db32661490a3e1d7807bfffcca66dcacda1333e9578c3ab63e3e9984747d23`.

All Vitest runs used Node 24.22.3, npm 11.19.1, pinned Vitest 5.0.5, the tracked 30,000 ms test and hook deadlines, up to four workers and zero retries. The added defensive file was the only untracked source input. Its bytes are exactly the new test file in the proposed patch.

| Command | Actual result on unchanged source |
| --- | --- |
| `npm test -- tests/commercial-invoice-close-idempotency.test.ts --retry=0 --reporter=verbose` | 4 PASS / 4 FAIL / 0 SKIP, exit 1 |
| `npm test -- tests/commercial-invoice-connection.test.ts tests/commercial-invoice-connection-source.test.ts --retry=0 --reporter=verbose` | 32 PASS / 0 FAIL / 0 SKIP |
| `npm test -- tests/commercial-invoice-client.test.ts tests/commercial-invoice-client-adversarial.test.ts tests/commercial-invoice-client-reconciliation.test.ts tests/commercial-invoice-issuance-presentation.test.ts tests/workflows/invoice-read-boundary.test.ts --retry=0 --reporter=verbose` | 62 PASS / 1 FAIL / 0 SKIP. One exact writer/grant inventory check stopped on `fatal: bad object 38bc1bce05075fc0e858554947e195d8dded3c4a` in this single-branch checkout. No repeat execution. |
| `npm run typecheck` | PASS |

The [negative-first output](failing-before.log) has SHA-256 `6026c136570a78d70053c87863fdbff5736dc7c5641caec6304f6da6b61da44f`. It shows the first close rejecting and a repeated close fulfilling on the original fictional command, with one destruction attempt still unconfirmed, one writer call and application status UNKNOWN. Concurrent close also fulfilled while destruction was separately pending. Late rejection and authority withdrawal exposed the same second-caller defect. The receipt/status checks separately observed original-command reads without another writer dispatch. The controlled cleanup port exposes acknowledgment state only.

## Root cause and proposed correction

[The close implementation](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/blob/4d52beee582734ea1367b735619ac20dd3492481/proposals/commercial-invoice-connection/connection.ts#L436-L448) sets `closed` before awaiting `destroy()`. The flag immediately fences further work. Later calls return through `if (closed) return`, which fulfills their promises even while destruction waits or after it rejects. The first rejection sets the existing process-local quarantine and keeps both lease reservations.

The [unapplied patch](scenario-d-unapplied.patch) uses the same immediate fence and records one per-handle cleanup promise before invoking the cleanup port. Every caller would await that outcome. Existing success still removes both lease reservations after acknowledgment. Existing failure still quarantines the factory and retains the reservations. The operation holds, command identity, read-only recovery, dispatch guards and public method type are preserved.

The scoped source guard adds a complete exact source alternative with the corrected runtime hash. The explicit #599 test consumer verifies the new runtime and guard as a pair, and supplies Git-authenticated original bytes to its existing historical fixture. Original test bodies and deadlines, source manifest, F/H/G and the separate commercial capacity guard are preserved. The commercial capacity guard already targets historical frames. PR #564 and the held 28-file financial integration are outside the proposed patch.

[Source manifest](source.json) records all proposed paths, file modes, Git blobs, before/after SHA-256 values and the full patch digest. The proposed tree is computed from a separate index. Patch applicability and diff checks passed. Strict TypeScript passed on the proposed bytes supplied to the compiler in memory, with no output or runtime execution. No proposed source was applied to a checkout.

## Expected qualification pending approval

The eight added checks are expected to pass after all four patch paths are applied together with the production source guard active. The four pre-change failures should now observe rejection after unresolved cleanup, pending while cleanup is pending and rejection after authority withdrawal. Verified destruction should continue to fulfill once for all callers. The existing 32 connection/source checks, receipt and read-boundary checks, and #599 native consumer should be requalified once with their original deadlines and a complete history of the pinned Git objects. The original nine and 109-case suites require the original artifacts before their results can be reported. All post-correction test results are **NOT RUN**.

David's exact approval must identify parent `4d52beee582734ea1367b735619ac20dd3492481`, parent tree `97dc8c49e8cfe9e141d99fb092eb4c29ca25b678`, patch SHA-256 `f974ac978fbf43d273299bb22cac400715d2079ad62ef42da7859c4ca3ab79fd` and proposed tree `84ac012c92c891933bc5d04d6ee4c527e0d2fbcd`. Scope is exact application of the four-path diff to a fresh isolated development child, followed by bounded tests and draft review. The original local task export must include the unchanged tests, source frame, command, deadlines and failure output.

## Acceptance

- Defensive close idempotency on the tested beforeimage **FAIL**
- Physical PostgreSQL connection custody **NOT VERIFIED**
- Operational transaction recovery and hosted financial acceptance **NOT ACCEPTED**
- A01–A12 **NOT RUN**
- Commercial invoice issuance, live payments and first-contractor onboarding **NO-GO**
- Production deployment **NOT AUTHORIZED**
