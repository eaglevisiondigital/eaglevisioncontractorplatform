# P1 supervised execution runbook

## Latest prerequisite: independent recovery completion

Read [PROPERTY_P1_RECOVERY_COMPLETION.md](PROPERTY_P1_RECOVERY_COMPLETION.md)
before the earlier handoff steps below. The new primary harness requires an
independent P1BackupCustody instance. All instructions remain future supervised
operations; no hosted sign-in/probe/cleanup is authorized by local implementation.

1. Select a maintained, independently powered/networked device. No privileged
   credential installation on Monterey12. Complete synthetic pairing, encrypted
   transfer, heartbeat/presence and primary-loss rehearsal on that device first.
2. Obtain separate exact approval for scoped backup custody and actual hosted
   recovery verification, including session-local logout. Do not repeat/bypass
   the rejected probe. Unchanged P1 fixture approval persists; no duplicate request.
3. Start the independent foreground DeviceRuntime with the hash-bound capsule,
   approved in-memory keys, separate encrypted journal and local private mailboxes.
   Confirm actual human control and encrypted heartbeat delivery before five seconds.
   Both operators must manually renew presence within60seconds; no timed human ACK.
4. After fresh zero-session/713-record/13-migration preflight, call
   reserveSessionCreation(alias) and wait for the independently authenticated,
   durable INTENT receipt BEFORE submitting the external password sign-in.
5. Immediately escrow its returned genuine AAL1 bearer; wait for durable SESSION
   receipt before any owner MFA waiting/application RPC. Challenge only the existing
   owner factor; verify exact UID/factor/AAL2/same session; wait for UPGRADE receipt.
   Repeat for the other owners and all12 staff. No customer/operator sessions.
6. Missing/lost Auth response or receipt is UNKNOWN. Stop, deactivate exact controls,
   preserve journal, and independently inspect unresolved sessions. UID-only logout,
   sign-in retry, account reset or deletion is not a recovery mechanism. No activation.
7. Require15 exact acknowledged staff sessions and three owner upgrades before run.
   The earlier-started backup clock contains by minute29; it does not extend the
   primary30-minute maximum. Local logout now preserves unrelated same-user sessions;
   unexpected sessions cause containment instead of global revocation.
8. Emergency stop uses the independent foreground stop control or safety timeout:
   observe, exact deactivation first, parallel authenticated custody restore/local
   logout, final observation. Already-absent acknowledged sessions need no retry;
   Auth failure alone is not absence. Preserve unrelated controls/session pairs,
   identities/factors, immutable audits and all original financial records.
9. Any uncertain/failed cleanup result remains CONTAINMENT_REQUIRED; no automatic
   retry, receipt erasure, old-journal restore or new run to conceal uncertainty.
   Only after separately authorized real recovery evidence and fresh preflight may
   the unchanged approved P1 operation proceed. P2/media/providers/Netlify stay off.

Earlier procedural checkpoints below are historical where this section differs.

Second-Mac preparation: [Monterey recovery](PROPERTY_P1_MONTEREY_RECOVERY.md).
The available kit is offline only;do not mistake it for a verified recovery channel
or use it to repeat the rejected hosted cleanup probe. All action-time gates below
remain mandatory.

Future execution only. This document does not start any process or grant new scope.
Exact P1 authorization remains valid; the current audit stops before all hosted
writes, Auth sign-in and MFA challenges. Read PROPERTY_P1_INDEPENDENT_AUDIT.md.

## People, custody and stop controls

One authorized operator must remain at the controls; the owner personally performs
TOTP. Confirm a separately reachable recovery operator/channel can use the approved
management custody and exact frozen deactivation SQL if the executor machine fails.
A second process on the same laptop does not satisfy host-loss recovery. Do not
start a session if that recovery capability cannot be independently verified.
Never record passwords, QR codes, seeds, current TOTP codes or authenticated tokens.
Only existing approved Keychain entries may supply credentials in process memory.
No shell arguments, persistent environment exports, browser storage, Git or reports.

Use pinned Node 24 and the composed `prepareP1Execution` handoff. It is a library,
not a ready-made hosted runner or an execute option on the offline inspector.
The private supervised harness must be reviewed against this checklist before use;
never start the historical Action B server, which imports different fixtures.

## Before any sign-in

1. Verify HEAD/source hashes from the audit record. Run `npm run property:p1-inspect`.
   Confirm operation 01b96075… and the four exact artifacts. Do not recompile them.
   Verify all 13 historical migration bytes and exact development target.
2. Refresh the complete read-only history/catalog/ACL/Auth/API/713-row comparison,
   18 actor bindings, exact 22 identities/four factors, three job revisions 7/2/2,
   zero sessions/features/mappings/leases/grants/providers and no duplicate run data.
   Require the full 30-minute quotation window; the frozen expiry is November 16,
   2026, 12:00 UTC. Readiness evidence has a ten-minute freshness limit.
3. Fix the reviewed private journal location once. Inspect any existing journal
   read-only. Any prior run reservation/attempt or UNKNOWN blocks restart; do not
   delete it, use another path, adopt rows or silently retry uncertain writes.
4. Confirm exact control SQL custody, timeout settings (2-second lock, 10-second
   statement) and independent observation. Read-only access is insufficient proof
   of deactivation and Auth logout authority. Resolve any automatic approval-review
   block explicitly; no alternate indirect probe or feature activation as a test.
5. Construct the independent controller and run `preflight()` with zero sessions.
   Preparation has a ten-minute cap. Begin explicit manual `supervise()` confirmations
   within 60 seconds; never use a timer to simulate human presence.

## Genuine owner-assisted MFA handoff

Operate one owner at a time in this order; display the synthetic alias and company,
then resolve the exact UID/email/factor from the private roster. Do not guess users.

| Alias         | Existing company                | Required factor        |
| ------------- | ------------------------------- | ---------------------- |
| pilot-1-owner | Straight Edge Property Services | Existing verified TOTP |
| pilot-2-owner | Cunningham Construction         | Existing verified TOTP |
| pilot-3-owner | Sample Roofing Contractor       | Existing verified TOTP |

1. In the reviewed local-only handoff interface, sign in to the designated Supabase
   development project using that existing account. No new identity/reset/enrollment.
2. Immediately send the genuine AAL1 token to `trackOwnerSession(alias, token)` for
   cleanup-only custody **before** waiting for the owner. If custody fails, stop and
   independently close/verify that session; do not proceed to MFA or the next user.
3. Challenge the existing factor. The owner opens Apple Passwords/their authenticator,
   selects that exact synthetic account and enters its current code directly into
   the local interface. No new QR scan, seed retrieval, screenshot or code in chat.
4. Verify via real Supabase Auth the exact confirmed UID, issuer, existing factor,
   current AAL2 and same session ID as AAL1. Call `addSession` with those verified
   tokens and the private identity binding. Do not fabricate claims or use an admin key.
5. Repeat for the other two owners while manually renewing presence. Sign in the
   other 12 existing staff identities using normal authentication and immediately
   hand each into cleanup custody. No customers or platform operator. No new grants.
6. The independent worker must verify exactly 15 expected live staff sessions,
   including three genuine owner AAL2 sessions, no pending handoffs, sufficient JWT
   lifetime, and unchanged dormant controls. Verify all original/reference data again.
   If the ten-minute preparation window is insufficient, close and verify all
   sessions; do not extend clocks or leave partial sign-ins waiting indefinitely.

## Activation and execution gates

Only a later authorized supervised continuation may call `run(signal)` after every
prerequisite passes. The run reservation is one-shot. The safety clock begins before
activation SQL; cleanup begins by minute 29, with an approved maximum of 30 minutes.
The worker demands a five-second executor heartbeat and separate manual presence
renewal within 60 seconds. There is no native feature expiry.

Exactly three tenant controls, 75 fixture steps, 69 probes, at most 57 domain rows;
114 audits are expected, not permission to invent events. No P2/customer access,
media/provider work or additional financial authorization. Unknown responses stop;
never retry automatically. Receipt and case evidence must distinguish PASS, FAIL,
BLOCKED and NOT RUN. Customer debt remains zero and drafts nonpayable.

## Emergency stop and independent verification

- Use the harness's explicit stop/abort control (or Ctrl-C/SIGINT during `run`).
  Explicitly await `close()`; do not kill the cleanup process or assume abort rolls
  back an already-sent RPC. IPC loss, terminal hangup/SIGHUP and supervision loss also trigger containment.
- Shutdown waits for an in-flight credential handoff/activation to settle. Newly
  verified credentials remain in cleanup custody; late activation is forbidden.
  Exact approved feature deactivation and all exercised session sign-outs then run,
  followed by an independent read of zero active features/sessions and all off gates.
- On machine failure, the recovery operator uses only the reviewed exact-tenant
  deactivation procedure and existing Auth session-revocation procedure. Never run
  generic SQL, alter memberships or delete records. Verify each result independently.
- A timeout/unknown result is CONTAINMENT_REQUIRED. One automatic cleanup attempt
  only. A supervised manual second SQL attempt is allowed by the existing review
  solely after a confirmed rolled-back lock timeout, fresh reads and cleared
  contention. UNKNOWN is not eligible. Do not bypass review/approval controls.
- Preserve immutable fixtures/audits and journal. Compare all 713 originals, allowed
  selected job revisions, exact table/audit/provenance deltas and per-type/per-receipt event multiplicities, original estimates,
  payroll and zero new debt/providers/mappings/leases. Close all 15 sessions and
  verify the original 22 identities/four factors remain. No cleanup by deletion.

If clean state cannot be independently established, report the exact unresolved
control/session count privately and escalate containment; do not publish PASS or
restart. Review per-case evidence before updating the 72-case tracker.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**; PR #1 remains draft and unmerged.
