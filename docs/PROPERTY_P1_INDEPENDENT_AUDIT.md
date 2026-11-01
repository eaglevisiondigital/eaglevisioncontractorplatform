# P1 adversarial readiness audit

October 17, 2026. Review base `1318db0`, draft PR #1. This is a separate adversarial
pass over the implemented controls, not third-party certification or genuine hosted
workflow acceptance. Read PROPERTY_P1_SUPERVISED_RUNBOOK.md before continuation.

**Recommendation: NO-GO for feature activation now; GO for a supervised read-only
preflight and controlled Auth handoff only in a later execution continuation.**
This audit creates no Auth sessions or MFA challenges and performs no hosted write.
The existing exact-scope P1 authorization remains valid; no duplicate approval is
needed. Action-time gates are evidence requirements, not a new authorization scope.

## Findings and local corrections

| Finding    | Adversarial failure                                                                                                                                                                                                                                                   | Correction                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1, high   | Shutdown could observe zero sessions while an already-running Auth handoff was still awaiting verification. The handoff could then enter custody after cleanup. Similarly, shutdown during a pre-activation live-session read could be followed by a late activation. | A shared command gate marks shutdown synchronously, waits for in-flight credential custody before sign-out/observation, and forbids activation or readiness after waits. Newly verified credentials enter custody before the stop checkpoint. The worker cannot reopen. |
| A2, medium | Quote validity checked before lengthy identity/preflight reads could become stale before activation.                                                                                                                                                                  | Recheck the unchanged quotations after Auth/readiness waits, before the durable run reservation and activation. No date or payload substitution.                                                                                                                        |
| A3, low    | An explicitly invalid journal result state with a UUID could be interpreted as recorded success.                                                                                                                                                                      | Reject unknown explicit states; new successful receipts say RECORDED. Existing valid legacy receipts remain readable. No receipt rewriting, retry or adoption.                                                                                                          |

Regression tests exercise late handoff custody versus shutdown, late activation,
concurrent command/stop handling, expiry during readiness and malformed receipt
states. They use the actual new gate and safety/journal implementations with local
ports. They do **not** demonstrate live Auth revocation or hosted deactivation.

## Fresh hosted read-only evidence

The exact owner-designated development identity is healthy. Compared with the last
approved dormant baseline, these match without drift:

- All 13 migration versions, names and stored SQL statements; all local historical
  SQL bytes match `1318db0` and the reviewed manifests.
- 514 catalog entries, 69 column ACL records, 24 default ACL records, four schema ACL
  records and 79 business-table counts/digests.
- All 713 original records by complete composite primary key and row hashes;
  all 18 actor/role/resource bindings and three job/customer/location/estimate bindings.
- Exact Auth user and factor fingerprints: 22 identities, four existing verified
  TOTP factors, zero sessions. No password or factor seed was retrieved.
- Saved Auth/API fingerprints: public signup/anonymous access disabled, confirmation
  and MFA restrictions retained, leaked-password protection enabled, API exposure unchanged.
- Zero feature rows, customer mappings, report-only leases, provider workloads,
  active platform grants or internal-release grants. No duplicate run expenses or
  existing property test records. Original job revisions remain 7/2/2.

All 12 quotations are dated October 16, 2026, 12:00 UTC and expire November 16,
2026, 12:00 UTC. They cover the full proposed 30-minute window today. Never refresh
those dates in place; stop if they cease to cover a future execution window.
The unchanged operation SHA-256 is
`01b96075d2f04acef730114427bc595986a1f0ce2720ed7fd3c9e84e304e141a`;
all four artifact hashes match PROPERTY_P1_EXECUTOR_READINESS.json. No package was
recompiled. Private target, snapshots and comparison evidence remain ignored.

Security advisors: **0 WARN/ERROR, 37 INFO**, intentional private RLS/default-deny
tables without policies. Performance: **4 existing WARN, 94 INFO**. The four
[Auth RLS initialization warnings](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
remain on intake requests, job assignments, job expenses and worker supervisors;
no policy change is part of this audit. Unused-index counts can change with reads.
No historical migration or index was modified.

## Authority and financial boundaries

Normal application calls retain the exact verified user's Bearer token. The four
allowlisted RPCs do not accept service-role/management credentials as application
identity. Owner AAL2 uses the same session as the original genuine AAL1 token and
an existing verified factor. Session IDs, current membership, assigned job access
and post-wait wall-clock checks remain database-enforced. Customer/operator roles
cannot enter the 15-staff executor. Signed-out JWTs are not assumed invalid merely
from client logout; the sensitive database functions check live Auth sessions.

The exclusive fsynced run/attempt journal prevents replay in the reviewed private
journal. A missing receipt remains UNKNOWN. Neither a matching hosted row nor
restarting in another folder authorizes replay. Recovery is read-only and manual.
Preflight additionally rejects any existing feature/test-row or business-data drift.

The reviewed budget remains 75 fixture RPCs, 69 probes, up to 57 domain records and
114 expected audit events. Planned costs are 30003 minor units; proposed selling
amounts 11251/11251/10001 total 32503. Actual customer debt must remain zero.
Original estimates/baselines, payroll, accepted versions and financial records are
protected by complete-key hashes and independent post-cleanup reconciliation.
None of these prospective hosted outcomes is claimed PASS by this audit.

## Operational limits and withheld probe

The watchdog is a separate process on the same machine, not a second host or native
SQL TTL. Automatic cleanup starts at minute 29; 60-second human-presence renewal
and five-second process liveness are independent. Preparation is limited to ten
minutes. There is one automatic cleanup attempt; UNKNOWN never authorizes another.
Machine loss or database/Auth outage still requires the authorized recovery operator.

Automatic approval review rejected a proposed real-target cleanup-process probe
because it assessed the close path as potentially executing hosted deactivation
SQL. The probe was **not run** or retried indirectly. Actual control-plane read
requests succeeded through the read-only snapshot procedure, but they do not prove
mutation rights, live session revocation or a full hosted cleanup cycle. Those
remain **NOT RUN** under this audit's no-write/no-login restriction. Local shutdown
and IPC tests cannot be promoted into that evidence.

## Results and next step

Final `npm run check`: **821 PASS /50 native-only skips**, including12 new audit
regressions. Complete disposable PostgreSQL17: **343 PASS /zero skips**; final
stricter-verifier P1 recheck: **4 PASS**, overlapping that suite. Desktop/tablet/mobile:
**63 PASS** with one worker. Formatting,strict/generated types,integrity and build
pass. Earlier concurrent setup/browser timeouts and an interrupted overlapping-edit
run are retained privately; only final frozen-source results are counted.

Final fresh test counts and source hashes are recorded in
PROPERTY_P1_INDEPENDENT_AUDIT.json. Formatting, type, migration and responsive
browser results are distinct from real connected acceptance. Hosted cases remain
**0 PASS / 0 FAIL / 24 BLOCKED / 48 NOT RUN**. No new records or audit events.

The next continuation must start with the runbook's fresh read-only checks, verify
an authorized human can supervise and recover, then perform genuine existing-factor
MFA with pending-session cleanup custody. Stop before activation unless every gate,
including independently verified cleanup access, passes. Do not improvise a probe
that changes controls to satisfy a missing prerequisite. P2, media, providers,
Netlify and excluded cases remain separate. Release 1.0 **NOT READY / NOT AUTHORIZED**.
