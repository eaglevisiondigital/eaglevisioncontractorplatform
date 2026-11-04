# Cycle 29 · final-read and competing offline reconciliation coverage

Author: `/root/cycle28_customer_offline`. Exact sole parent:
`067b08b1c3f2e2e2bd259639c636eb13a2c079d4`.
Branch: `codex/cycle29-offline-currentness`.

**Coverage only. No native runtime file changes.** Inspection did not establish an
unrepaired defect in the original stateless reconciler. C28's malformed-live-protocol
and withdrawn-admission fixes remain complete and are not recreated. This package adds
fifteen source-based cases for previously untested competing reads and the final,
second asynchronous native-read checkpoint, across the three existing brands.

- Two concurrent exact reads use the same original comparison without creating a
  claim, writer, hash, receipt, replacement or synchronization authority.
- A malformed peer proposal remains UNKNOWN/EXTERNAL_PROTOCOL_INVALID while the
  other exact proposal can remain CURRENT_EXACT_READ_ONLY; malformed external
  content cannot poison the original comparison.
- Original actor revocation during the second native read retains UNKNOWN; the
  next original-owner check denies before another native read.
- A native visit change during the second read retains conservative UNKNOWN.
  A separate later exact native read may observe STALE/SOURCE_CHANGED. That new
  observation does not clear the original comparison's source hold, identify a
  successful command, grant retry or restore any business state.
- A live accessor introduced during the second read remains unexecuted and yields
  value-free UNKNOWN/EXTERNAL_PROTOCOL_INVALID. Restoring only exact review input
  permits an authorized read, never command replay or synchronization.

The initial fifteen-case run passed twelve and failed three new assertions that
incorrectly assumed an exact SOURCE_CHANGED subtype for an uncertain mid-read
observation. A targeted diagnostic inspection showed CURRENTNESS_UNVERIFIED. The
first targeted correction also incorrectly assumed a later independent native read
must remain UNKNOWN; actual complete later read evidence correctly reports STALE.
A further targeted fixture incorrectly counted the later native reads as three instead
of four. The final case verifies the original two-checkpoint boundary and, after the
later exact reads, asserts no writer beyond the explicit test source change and no
hashing/preparation. These new fixture expectations now reflect the distinct original
observations and retain explicit no-replay assertions. All three
corrected cases pass. **Fifteen distinct cases pass across the twelve original and
three targeted outcomes**, not one clean fifteen-case or GitHub CI success claim.
Raw reports remain private under `artifacts/cycle29`. No runtime behavior, assertion
in a prior suite, deadline or original evidence was changed. Scoped ESLint and
formatting pass; Main performs combined strict type and source-integrity acceptance.

The existing eight canonical and four native references, current authorization,
original held handles, permanent command UNKNOWN and exact read-only restrictions
remain authoritative. No new wrapper, store, receipt owner, UI, adapter, schema,
synchronization worker or network mutator is added. Historical evidence is not
canonical restart state. Danny's Air is last unavailable; physical rehearsal is
NOT RUN. The completed 25 offline recovery checks were not repeated. P1/frozen
artifacts, customer14/4B, Auth/MFA, NMI, Netlify/recovery and all financial,
communication, dispatch and production gates remain intact.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
