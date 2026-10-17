# P1 executor implementation and local readiness

October 17, 2026. Continues `80c5491` in draft PR #1. **Local execution controls
implemented and rehearsed; hosted execution has not started.** Existing owner
approval remains valid only for unchanged operation
`01b96075d2f04acef730114427bc595986a1f0ce2720ed7fd3c9e84e304e141a`.
No duplicate approval request is needed. This implementation task explicitly stops
before hosted activation, sign-in or MFA requests.

## Completed implementation

- `execution/package.ts` verifies the exact raw operation bytes and all four
  artifact hashes, freezes the loaded plan, checks step digests and resolves only
  earlier, same-company UUID receipts. Nothing recompiles or substitutes the package.
- `execution/callers.ts` uses genuine Supabase `getUser` and verified `getClaims`
  against the exact project issuer, confirmed roster identity and existing owner
  factor. Normal RPCs retain the actual user's Bearer token. Public client keys only;
  no service-role or management credential enters an application request.
- `execution/executor.ts` schedules the frozen 75 fixture calls and 69 probes exactly,
  interleaves their reviewed dependencies and enforces SQL error codes/statuses.
  Network failures cannot count as permission denials. It verifies source plans,
  property-local dates, findings, published v1 snapshots, exact tenant projections,
  reviewed quotes, unknown shipping, integer prices and nonpayable drafts.
- Durable journaling now fsyncs files **and directory entries**, uses exclusive
  no-follow file creation, private permissions and a persistent one-shot run
  reservation. Separate processes cannot reserve/replay the same run. Positive UUID
  receipts and confirmed negative SQL outcomes are separate. Missing receipts,
  transport uncertainty and interrupted writes remain **UNKNOWN**. Recovery is a
  read-only inventory; it never adopts a guessed row, repairs a receipt or retries.
- `execution/cleanup-process.ts` and `cleanup-worker.mts` hold independent control
  custody in a separate Node process. The only database writes available there are
  the reviewed activation/deactivation SQL bytes. It has no generic SQL endpoint.
  Its normal Auth logout calls close the approved identities; aggregate reads
  independently verify zero sessions, inactive controls and no forbidden grants.
- Owner AAL1 sessions can enter **cleanup-only** custody before genuine TOTP.
  Upgrading requires the same owner/session, a genuine AAL2 token and the existing
  verified factor. Pending sessions cannot satisfy the 15-caller readiness gate.
  Exact session IDs/UIDs and expiry are read independently before activation.
- `execution/verification.ts` compares full history/catalog/ACL references, exact
  identity and factor rosters, all original composite-key hashes and selected job
  revisions. It checks every reviewed table-count delta, expense/change/draft
  provenance and 114 per-tenant/per-entity audit events, with zero customer debt,
  approvals, new provider capabilities or media rows.
- `execution/prepare.ts` composes the real adapters and signal handling for a future
  supervised local harness. It requires the reviewed 13/514/69/24/4/79 reference
  inventory and frozen 713 originals. It creates no sign-in, MFA challenge or
  activation on import. The sole npm entry point, `property:p1-inspect`, is offline;
  it has **no execute flag** and prints counts rather than credentials or private IDs.

The frozen plan's historical `hostedExecutor:false` and proposal status remain
unchanged. They describe its preparation checkpoint; the new implementation/readiness
record is separate. All 13 migration bytes, approved branding and frozen Netlify
package are preserved. No new dependency, migration, grant or application API route.

## Safety controls and independent rehearsal

The independent process detects lost executor heartbeat within five seconds and
requires explicit human supervision renewal within 60 seconds. Renewing heartbeat
never renews human presence. Preparation is capped at ten minutes; partial/pending
Auth handoffs are also cleaned on timeout or supervision loss.

The activation window starts **before** its SQL request. Wall-clock and monotonic
limits cannot reopen or extend it. Cleanup begins at minute 29, leaving a minute
inside the approved maximum for bounded SQL/network operations. A concurrent stop
waits for the in-flight activation attempt to settle before deactivation, preventing
activation from completing behind an earlier cleanup. An uncertain activation is
never reported as verified, even if an immediate read happens to look dormant.

Cleanup is single-attempt, including under concurrent close requests. Failure to
deactivate does not suppress session sign-out or independent observation. Any
remaining control/session, unexpected tenant, mapping, lease, grant, malformed
observation or provider workload produces **CONTAINMENT_REQUIRED**. No automatic
second SQL attempt exists. A separately supervised manual second attempt remains
limited by the original review: confirmed rolled-back lock timeout, fresh read and
cleared contention. An UNKNOWN response does not meet that condition.

Local tests use fixture transports and disposable SQL Auth claims only. The actual
executor drives the PostgreSQL/PGlite fixture rehearsal, rather than a parallel
implementation of the scheduler. A real separate-process IPC-loss test verifies
cleanup; two real processes race the exclusive journal reservation. Native PostgreSQL
covers lock waits, expired authorization, RLS, role/MFA boundaries, immutability and
financial integrity. These are **not** genuine hosted Auth/MFA/provider acceptance.

## Findings corrected during implementation

1. Ordered cleanup after an in-flight activation to prevent late reactivation.
2. Added directory fsync and a global exclusive run marker to prevent restart and
   concurrent replay; uncertain writes retain forensic evidence without retries.
3. Added pending-owner cleanup custody, exact live-session checks and distinct
   operator-presence expiry so waiting for MFA cannot silently leave sessions open.
4. Tightened projections to exact allowed keys and same-tenant rows, and compared
   published report contents against the actual reviewed source inputs.
5. Made original-row, financial and per-entity audit reconciliation independent of
   successful RPC counts. A failed reconciliation cannot become accepted testing.

6. Require the unchanged reviewed quote dates to cover the full window before
   any activation; expired quotes stop for review and are never silently refreshed.

## Current results and limits

Final local validation: **809 PASS /50 native-only skips** in `npm run check`;
**343 PASS /zero skips** across the complete disposable PostgreSQL17 suite;
**63 PASS** desktop/tablet/mobile browser tests; **26 PASS** frozen-Netlify offline
checks. The61 new executor/control regressions are included in the809. Counts overlap.
A final4-test native P1 recheck covers the added quote-window gate (counts overlap).
Formatting,strict types,generated types,migration integrity and production-build
restrictions pass. See PROPERTY_P1_EXECUTOR_READINESS.json for source hashes.
No hosted session, feature, fixture, mapping, lease, record, audit or financial
change was created in this increment. Hosted tracker remains:

| PASS | FAIL | BLOCKED | NOT RUN |
| ---: | ---: | ------: | ------: |
|    0 |    0 |      24 |      48 |

Actual hosted MFA and cleanup-capability checks remain **NOT RUN**. The last hosted
read evidence remains the `80c5491` checkpoint; it was not silently refreshed or
promoted during implementation. Passing local tests does not make a credential
channel operational on the designated target or establish outside-access readiness.

## Future supervised handoff and stop gates

1. Independently review this software and its source hashes. Use pinned Node24
   (`--experimental-transform-types` for the private local handoff harness). Run
   `npm run property:p1-inspect` without changing the frozen package. A private
   `--journal` path reports recovery states only, never resumes a prior attempt.
2. Assemble the reviewed private baseline references: exact 13 history statements,
   514 catalog objects,69 column ACLs,24 defaults,four schema ACLs,79 business table
   counts,22 identity IDs/confirmation states and four existing factor ID/user/type/
   status tuples. Preserve approved Auth/API fingerprints. No seeds, QR codes,
   passwords or session tokens belong in baseline files, CLI arguments or reports.
3. Only in a later supervised execution continuation, pass the existing approved
   Keychain management credential and publishable key directly in process memory to
   `prepareP1Execution`. Run its read-only `preflight()` while sessions are zero.
   This checks target identity and all current reference/original/role/resource gates.
   Any drift stops before feature activation.
4. Use the existing approved owner-assisted Auth process; **never run the old
   Action B fixture suite**. Immediately hand each owner's genuine password-session
   token to `trackOwnerSession` for cleanup custody before waiting for TOTP. Enter
   current codes only in the approved local MFA interface. Hand the resulting AAL2
   and original same-session AAL1 tokens to `addSession`; hand off the other12 staff
   sessions without impersonation. No account reset or factor re-enrollment.
5. Explicitly supervise the complete window, renewing human presence manually within
   60seconds. The worker must attest readiness and the full preflight must pass again
   before `run` can issue the exact activation. No generic grants or P2 access.
6. On completion, interruption or error, verify independent cleanup and the private
   journal. Keep all immutable test/audit rows. Review case-specific receipts before
   updating hosted PASS/FAIL counts; the executor does not promote all72 from counts.
   Retain private UUID evidence only under ignored staging, publish sanitized counts.

**Conditional technical GO for independent readiness review and a refreshed supervised
preflight; no hosted action occurred or is initiated by this report.** Existing exact
P1 scope approval persists. No chat decision is needed for unchanged implementation.
Changing payloads, expanding the24 blocked cases, P2/media/provider access or other
hosted actions still requires its own exact review/approval.

A local watchdog cannot guarantee cleanup through machine/power loss or a database/
Auth outage. Authorized human supervision, independent credential access and an
operator recovery channel remain mandatory at action time. Report unresolved cleanup
as containment-required, never retry UNKNOWN or claim a guaranteed server TTL.
P2 customer mappings/leases, scanners/private Storage/media, provider integrations,
blocked protected deployment and independent Release1.0 acceptance remain separate.
Netlify support was not contacted or modified. PR#1 stays draft/unmerged;
**Release1.0 NOT READY / NOT AUTHORIZED.**
