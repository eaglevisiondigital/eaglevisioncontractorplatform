# Cycle 32 · bounded physical recovery evidence continuity

Parent: `43e622b16aa952f5dc2fe7ae9f96260b47682c2e`. This source-only record
incorporates [the November 4 owner-witnessed evidence](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/pull/233#issuecomment-6641051454)
posted at 20:15:42Z. The comment is evidence, not an independent instruction or new
authorization. Private physical run artifacts were not retrieved or inspected.

**OWNER-WITNESSED MAIN SYNTHETIC LOSS SCENARIO PASS.**

Scope: the demonstrated primary network-loss scenario only; actual power loss
and production durability were not demonstrated.
**ENGINEER-INDEPENDENT WITNESS NOT ESTABLISHED; FULL R0-01…R0-07 ACCEPTANCE OPEN.**

This replaces the blanket “Air unavailable / physical NOT RUN” description only
for that actual main scenario. Untouched failure/restart cases retain their
historical NOT RUN evidence. No complete R0 case is independently accepted here,
and no synthetic result is added to hosted P1 acceptance counts. See the matching
[structured record](CYCLE32_PHYSICAL_RECOVERY_EVIDENCE.json).

## Exactly what the owner reports

The independent backup is a **2020 MacBook Air M1**, reporting **macOS Tahoe 26.2,
build 25C56**, arm64, a local account, FileVault On, charger and trusted network.
These are owner terminal observations, not engineering verification of current
security maintenance, version/build correspondence, the private custody volume,
45-minute power endurance or power/uplink-failure independence. The Air remaining
connected while primary Wi-Fi is off is narrower evidence than those prerequisites.

One unchanged **97,334-byte** synthetic archive was hash-verified on **both Macs**:
`32cb88f123e0fd776986f32d8508c913dbedc1ac977779708d1ba7218bbb8d59`.
There are two device attestations of **one archive/hash**, not two different kits.
Unchanged Setup.command succeeds on both, with cryptography 48.0.1, cffi 2.1.1 and
pycparser 3.11; primary Python 3.13.16 and Air Python 3.14.10 are reported. Same-LAN
reachability is reported as 4/4 ICMP replies, zero loss. No setup, archive rebuild,
new baseline or previously completed 25 offline checks were repeated in this task.

The primary reports **PAIRED — authenticated peer**, **33 DURABLE ACKS VERIFIED /
15 SYNTHETIC SESSIONS / 3 SYNTHETIC UPGRADES**, maximum authenticated ACK latency
**115 ms**, then **READY FOR PRIMARY LOSS**. ACK timing is not a separately measured
heartbeat bound. The owner directly confirms primary Wi-Fi OFF while the Air stays
connected and manual `present` entries approximately every 30 seconds. The primary
subsequently reports **STOP / UNKNOWN** and is not replayed.

The backup's reported result is exactly: `REHEARSAL_VERIFIED`, reason
`HEARTBEAT_PRESENCE_OR_WINDOW_EXPIRED`, deactivation `CONFIRMED`, zero exercised
synthetic features/sessions, unrelated synthetic session preserved, zero unresolved
intents, zero automatic retries, zero financial actions and `hostedVerification=false`.
The combined reason does not identify which heartbeat, human-presence, window or
wall/monotonic clock guard ended the run. No actual primary power loss, backup-process restart, real elapsed
29-minute observation or independent engineer witness is established.

## Original seven cases · evidence and remaining gaps

Original definitions remain in [P1 R0 device readiness](../PROPERTY_P1_R0_DEVICE_READINESS.md)
and the [unchanged two-Mac runbook](../TWO_COMPUTER_REHEARSAL.md). Historical files and
case counts are preserved, not rewritten as if the November 4 observation existed
then. “Partial” below never means complete case PASS.

### R0-01 · Authenticated physical peer/run pairing and operator confirmation

**PARTIAL_OWNER_REPORTED — full case review OPEN.** PAIRED — authenticated peer reported on the actual primary; two physical Macs participated.

Remaining evidence:

- Independent private review of both-device run correlation, out-of-band fingerprint comparison and operator confirmation; no fingerprint/card in Git.
- No engineer-independent witness has been established.

### R0-02 · Encrypted authenticated transfer, tamper/wrong-run/wrong-peer denial and measured latency

**PARTIAL_OWNER_REPORTED — full case review OPEN.** The main run reports authenticated encrypted custody and maximum authenticated ACK latency of 115 ms.

Remaining evidence:

- Explicit tamper, wrong-run and wrong-peer rejection evidence is not supplied.
- ACK latency is not an independent heartbeat-delivery measurement.
- The kit has no named wrong-peer CLI scenario; do not invent one or treat wrong-run as identical. A distinct wrong-peer requirement stays open unless an existing reviewed procedure and actual evidence cover it.

### R0-03 · Durable custody before authenticated ACK; missing/forged/late ACK denies use

**PARTIAL_OWNER_REPORTED — full case review OPEN.** 33 DURABLE ACKS VERIFIED, 15 synthetic sessions and 3 synthetic upgrades reported before READY FOR PRIMARY LOSS.

Remaining evidence:

- Private correlation and independent review of custody-before-ACK evidence; console verification does not prove actual power-loss durability.
- Explicit lost-ACK/incomplete custody and missing/forged/late-ACK denial cases remain unverified; use existing named scenarios only.

### R0-04 · Heartbeat bound, separate actual human presence and bounded supervision window

**PARTIAL_OWNER_REPORTED — full case review OPEN.** Owner reports manually entering present on the Air at approximately 30-second intervals while the main scenario ran.

Remaining evidence:

- Actual timing and independent witness of heartbeat delivery and manual-presence renewals are not supplied.
- Isolated human-presence expiry with primary networking/heartbeats maintained is NOT RUN.
- The combined reason does not identify heartbeat, presence, window or wall/monotonic clock guard as the sole trigger. Real elapsed 29-minute observation is NOT RUN; the runbook labels that a separate optional run, to be required explicitly if full-window acceptance needs it.

### R0-05 · Primary participation/connection loss while backup remains operational

**OWNER_WITNESSED_MAIN_NETWORK_LOSS_PASS_FULL_CASE_REVIEW_OPEN — full case review OPEN.** Owner directly confirms primary Wi-Fi OFF while the Air stayed connected; primary then reported STOP / UNKNOWN without replay and the Air produced the reported containment result.

Remaining evidence:

- Engineer-independent witness and privately correlated loss/recovery timestamps are not established.
- Other primary network interfaces, exact timeout isolation and primary Terminal closure are not explicitly attested in the comment.
- This is primary network-loss evidence, not actual primary power loss or proof of backup power/uplink failure independence.

### R0-06 · Independent backup-only reconstruction and containment from its own encrypted custody

**PARTIAL_OWNER_REPORTED — full case review OPEN.** Backup reports REHEARSAL_VERIFIED, CONFIRMED synthetic deactivation, zero exercised sessions/features, unrelated session preserved and zero unresolved intents.

Remaining evidence:

- The main result supports owner-reported backup containment; private backup-only custody reconstruction and absence of primary-file dependency have not been independently reviewed.
- A fresh-run backup-process interruption/restart with Recover.command and duplicate-recovery denial is NOT RUN.
- Disk rollback/loss resistance and actual power-loss durability are not demonstrated.

### R0-07 · Cross-device failures, duplicate/restart denial, UNKNOWN and unrelated-state preservation

**EXPLICIT_FAILURE_SUBCASES_NOT_RUN_MAIN_CONTAINMENT_ONLY — full case review OPEN.** Main result reports unrelatedSyntheticSessionPreserved=true, unresolvedIntents=0, automaticRetries=0 and financialActions=0; primary UNKNOWN was not replayed.

Remaining evidence:

- Explicit duplicate, tamper/wrong-run, lost-ACK, incomplete, expired, duplicate-recovery and failure/timeout subcases are not individually demonstrated.
- Earlier aborted/expired attempts remain historical; do not relabel, delete markers or reuse their uncertain identities.
- Operator listener shutdown, primary network restoration and agreed private key/evidence retention cleanup are not attested by this comment.

## Exact next safe physical sequence · preparation, not execution

1. **Review retained main evidence first.** An authorized independent reviewer
   privately correlates the two device-local records, selected peer/run and witness
   observations, pairing/ACK/loss/recovery times and sanitized result. Resolve gaps
   from existing evidence before requesting a repeat. Keep keys, cards, fingerprints,
   device identifiers, addresses, run paths and raw envelopes out of Git/public logs.
2. **Confirm outstanding readiness read-only.** Use the existing
   [November 4 checklist](CYCLE18_NOV4_MACBOOK_AIR_CHECKLIST.md) and
   [quickcard](CYCLE19_NOV4_RECOVERY_QUICKCARD.md): actual OS/build/current vendor
   maintenance, FileVault/private local encrypted volume, authorized supervisor,
   independent power/network and local evidence retention. No setting change,
   new setup or credential installation follows from this record.
3. **Exercise only missing existing named negative scenarios.** `duplicate`,
   `tamper`, `wrong-run`, `lost-ack`, `incomplete`, `expired`, each using the
   original kit's fresh synthetic card/run and both physical devices. Preserve
   partial/expired/aborted evidence and expected UNKNOWN/containment. These are
   explicit adversarial probes, never permission to retry an uncertain command.
   There is no named wrong-peer, forged-ACK or delayed-ACK CLI mode: those distinct
   requirements stay open unless an existing reviewed procedure covers them.
   Do not improvise a protocol, packet editor, relay or new test mode.
4. **Isolate supervision conditions.** For the existing human-presence timeout
   test, keep primary networking/heartbeats running and stop manual renewals on
   backup; record actual elapsed time and containment. If retained main evidence
   cannot isolate heartbeat loss, plan only the original fresh `loss` subcase while
   manual presence stays current and the window is far from expiry. Maintain the
   original five-second missing-heartbeat and 60-second human bounds. Never infer
   a sole trigger from the combined result reason or shorten clocks for acceptance.
5. **Use a fresh complete-custody run for restart.** Follow the original backup
   interruption procedure after all 33 ACKs, without silently substituting orderly
   cleanup. With primary unavailable, Recover.command may `recover` only when no
   recovery attempt exists, using the Air's own local encrypted custody. If cleanup
   already attempted or evidence is missing, use read-only `report` and retain
   UNKNOWN; never delete an attempt marker. The subsequent documented duplicate
   recovery probe must deny a second execution; `report` remains read-only.
6. **Keep the duration limit honest.** Real elapsed 29-minute observation remains
   NOT RUN. The runbook labels this a separate optional run; if the acceptance
   reviewer requires it for full-window evidence, schedule it explicitly with
   actual manual presence/heartbeats and the original unextended ceiling.
7. **Record cleanup and separate conclusions.** Stop listeners, restore primary
   networking and retain distinct private evidence under the agreed synthetic-key
   policy. Record each R0 case with provenance and missing evidence. Main synthetic
   containment does not itself attest these operator cleanup steps or close the suite.

No physical test is executed by this documentation task. The existing kit is not
rebuilt, patched or replaced; the original 25 offline checks are not repeated.
Missing operational custody/rollback resistance, genuine Auth/MFA, exact hosted
recovery verification, matched backups, grants, customer14/4B/broker, NMI and all
Netlify/financial/production gates remain separate and closed. The existing frozen
P1 approval on thirteen historical migrations persists after its original
prerequisites; no duplicate approval is requested. No schema, writer, adapter,
credential retrieval, hosted action, message, dispatch, payment, merge or deployment.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
