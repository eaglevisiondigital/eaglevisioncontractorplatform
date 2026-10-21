# Two-Mac synthetic recovery rehearsal

This is the owner-authorized **synthetic, credential-free rehearsal**. Use the
MacBook Pro as primary and the 2017 Monterey Mac as backup. Preserve the previous
25/25 offline passes, Python and network checks; do not run them again. This package
adds the missing executable direct transport. It cannot perform hosted recovery.
Actual seven-case device acceptance remains NOT RUN until the owner runs it.

## What to put on each Mac

Download **propel-synthetic-rehearsal.zip** from the existing draft PR branch's
`recovery/distribution/` directory. Download the same version to both Macs. The
engineering verification record contains this new ZIP's SHA-256. Check that new
artifact once on each Mac; this does not repeat the old downloaded-file checks.
The ZIP contains public code, instructions and the existing pinned dependency lock.
It excludes the hosted HTTPS adapter, live capsule, SQL files and private rosters.

1. Double-click the ZIP. Move its extracted **Propel-Synthetic-Rehearsal** folder
   somewhere local, such as Downloads. Do not place the run-data directory in
   iCloud Drive, Dropbox, a shared folder, USB disk or on the other computer.
2. Open Terminal (Applications → Utilities). To check the new ZIP, type
   `shasum -a 256 `, drag the ZIP onto Terminal, then press Return. Compare the
   result with the engineering verification record, not a value inside that ZIP.
3. Double-click **Setup.command**. If macOS asks, use its normal Open confirmation;
   do not disable Gatekeeper. Type the same working Python command/full path you
   already used, or press Return for `python3`. Python 3.12+ is the target, including
   the owner's installed 3.14.2; actual 3.14/Intel execution is still to be observed.
   The script checks package files, creates an isolated `.venv`, and installs only
   hash-pinned binary encryption dependencies if missing. No compiler or platform
   install is needed. Setup may contact PyPI; the rehearsal itself cannot do so.
4. Expect **SETUP COMPLETE. No baseline recovery tests were repeated.** If no
   compatible wheel exists, stop and retain the error. Do not build unreviewed
   packages or change dependency versions to work around it.

The double-click files run only this small kit. Primary application Node 24 stays
unchanged. No service password, Keychain item, QR seed, real session or management
token belongs in any prompt. The only pairing card is freshly generated synthetic
encryption material; it is safe for this disposable lab on Monterey, never for live use.

## Network arrangement

Put both Macs on the **same trusted Wi-Fi router or phone hotspot**, with the phone
powered independently of the primary Mac. The backup must have battery/charger and
continue operating when primary networking is disconnected. Do not use Internet
Sharing from the primary. Internet access alone does not prove peer connectivity.

On the backup: System Preferences → Network → Wi-Fi → Advanced → TCP/IP. Note its
IPv4 address privately (typically `192.168…`, `10…` or `172.20…`). The backup listens
only on that exact private address at **TCP 4187**, for this foreground run. It does
not bind all interfaces, open ports on your router, change a firewall or create a
public tunnel. A macOS prompt may ask to allow incoming Python connections; allow
only if this is the expected reviewed Python on your trusted network. Never turn
off the firewall globally. Close the backup launcher afterward; its listener closes.

Some hotspots/guest Wi-Fi isolate connected devices. If pairing fails, use a trusted
router that permits local peers; do not retry the uncertain run or add a cloud relay.
Retain its directory, start a **new synthetic run** after diagnosing reachability.
This new-run rule never applies to real P1 fixtures or real Auth uncertainty.

Transport choice: direct LAN TCP carrying AES-256-GCM encrypted envelopes, with
out-of-band random-key pairing and authenticated challenge/receipts. No TLS or
external relay is claimed here. Hosts/port, sizes and deadlines are restricted.
This disposable synthetic protocol is not approval to transport live credentials.

## Main run: exact actions on both Macs

Keep both screens visible. One owner can operate both, but the backup requires real
manual typing. Do not use scripts, pasted repeated lines or timers to renew presence.

**2017 BACKUP Mac**

1. Double-click **Backup.command**. Enter **this backup Mac's** private IPv4 address.
2. It displays a run directory, a synthetic pairing card and a fingerprint. Copy the
   card only to the primary Mac using owner-controlled AirDrop/text transfer, or
   type it. This one-time pairing transfer is not the heartbeat/custody transport.
   Never send the card to ChatGPT, GitHub, a report or support email.
3. Keep the prompt open; do not type PAIR yet.

**PRIMARY MacBook Pro**

4. Double-click **Primary.command**. Enter the **backup Mac's** same IPv4 address.
   Press Return for scenario **loss**. Paste the synthetic pairing card into the
   hidden prompt (nothing will appear while pasting); press Return.
5. Compare the **24-character fingerprint on BOTH physical screens**. If different,
   stop; do not continue. This authenticates the owner-selected shared-key peers,
   not hardware attestation or operating-system trust.
6. On BACKUP type **PAIR**, Return. Wait for **BACKUP WAITING**. Then on PRIMARY
   type **PAIR**, Return. Complete within three minutes of creating the card.
7. Expect **PAIRED** on primary, followed by **33 DURABLE ACKS VERIFIED / 15 SYNTHETIC
   SESSIONS / 3 SYNTHETIC UPGRADES**. These are generated lab identities; no actual
   Supabase Auth or MFA is performed. Nothing continues without the expected ACK.

**BACKUP supervision and PRIMARY loss**

8. On BACKUP type **present**, Return, every **30 seconds**. The hard limit is
   60 seconds; a network heartbeat does not renew human presence. Type **stop**,
   Return, for immediate simulated containment. Ctrl-C also stops/contains.
9. Once primary says **READY FOR PRIMARY LOSS**, turn **OFF Wi-Fi on the PRIMARY**.
   Disconnect its Ethernet/USB networking too if connected. Leave the backup on the
   independently powered network. Then close only the primary rehearsal Terminal
   window. Do not abruptly power off a Mac with unsaved work.
10. BACKUP must continue and finish automatically after approximately **5 seconds
    without authenticated heartbeat** (allow a few extra seconds for bounded I/O).
    No primary process, disk, journal or Keychain is needed for this recovery.
    Primary's STOP/UNKNOWN after deliberate loss is expected; never restart it in
    the same run. This proves loss of the primary's participation, not physical
    power-loss durability unless separately observed.

Expected backup report for complete custody:

```json
{
  "mode": "SYNTHETIC_ONLY_NOT_HOSTED_EVIDENCE",
  "status": "REHEARSAL_VERIFIED",
  "syntheticFeaturesActive": 0,
  "syntheticSessionsRemaining": 0,
  "unrelatedSyntheticSessionPreserved": true,
  "unresolvedIntents": 0,
  "automaticRetries": 0,
  "financialActions": 0,
  "hostedVerification": false
}
```

The report also includes the run ID/reason and a reminder that physical-device
evidence requires owner observation. It does not certify R0 PASS automatically.
The simulated service starts with three controls/15 exercised sessions plus one
unrelated session and uses local encrypted state only. Rehearsal deactivation/logout
does not send any request or execute any SQL. The original P1 SQL is never copied.

## Independent restart and failure demonstrations

Use a fresh backup/card/primary directory for each explicit synthetic scenario.
Never delete an attempt marker or replay a completed/uncertain run.

| Scenario/action        | Expected behavior                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loss`                 | Main successful custody run followed by deliberate primary network loss as above.                                                                                                                                                                                                                                                                                               |
| `duplicate`            | Explicit duplicate-message probe rejected; no second custody receipt. Partial run reports CONTAINMENT_REQUIRED, not full cleanup PASS.                                                                                                                                                                                                                                          |
| `tamper` / `wrong-run` | Altered/wrong-run ciphertext rejected; primary stops, backup contains.                                                                                                                                                                                                                                                                                                          |
| `lost-ack`             | Sender deliberately closes before reading SESSION acknowledgment; primary records UNKNOWN and stops without retry. Partial backup recovery cannot claim full acceptance.                                                                                                                                                                                                        |
| `incomplete`           | Only creation INTENT acknowledged, then simulated response loss. Unresolved intent remains; no UID-based invented revocation.                                                                                                                                                                                                                                                   |
| `expired`              | Signed but expired synthetic token denied; no usable session receipt.                                                                                                                                                                                                                                                                                                           |
| Human presence         | With normal `loss` sender still running, stop typing present on BACKUP. At 60 seconds, backup contains despite ongoing heartbeats. Keep primary networking ON to isolate this case.                                                                                                                                                                                             |
| Emergency stop         | Type stop on BACKUP; active simulated controls are contained immediately, no restart/retry.                                                                                                                                                                                                                                                                                     |
| Backup restart         | After full custody, close only BACKUP rehearsal Terminal without allowing orderly cleanup (a manual interrupt may already contain). Disconnect primary. Open Recover.command on BACKUP and choose recover only if no recovery attempt exists; paste its own run directory. It reconstructs only from backup's encrypted local custody/key. If already attempted, choose report. |
| Duplicate recovery     | After recovery, Recover.command → recover → same directory must STOP with no second attempt. Recover.command → report remains read-only.                                                                                                                                                                                                                                        |
| 29-minute ceiling      | Optional separate normal run with manual presence/heartbeat maintained until minute 29. Record actual elapsed time; short clock simulations do not prove this physical duration.                                                                                                                                                                                                |

A missing/forged/late ACK never authorizes continuing. Unknown cleanup results remain
CONTAINMENT_REQUIRED. All one-shot attempts survive restart. The console gives
sanitized STOP/UNKNOWN; preserve the run directory rather than guessing or resetting.
If the backup itself crashes, its encrypted custody and attempt state remain local.
If recovery was attempted but result writing failed, **report unavailable is UNKNOWN**,
not permission to repeat. Disk rollback/loss and a compromised OS are not solved here.

## Evidence to return (no pairing card or encrypted envelopes)

Keep both Macs' distinct local run directories under `~/Propel-Synthetic-Rehearsal/`.
This local folder contains only synthetic state/key; keep it out of Git and cloud
sync. Retain the ZIP version/hash, run ID, scenario, start/loss/recovery times and
the sanitized `result.json` on backup. Primary retains encrypted receipt latency
records; do not send its key/config or encrypted custody files as evidence.

For the actual two-device loss case, provide a photo/video or witnessed record
showing the two separate Macs, matching fingerprints (card hidden), primary's
33-ACK readiness, primary network off/Terminal closed and backup finishing alone.
Show manual present actions and backup result. Record whether the evidence is
owner-reported or engineer-observed. No serials, network addresses, keys, desktop
private content or actual service credentials should appear in shared evidence.

R0-01 pairing, R0-02 encrypted rejection probes, R0-03 ACK, R0-04 independent
supervision, R0-05 primary loss, R0-06 backup-only restoration and R0-07 failures
each require their actual evidence. Local automated tests are SINGLE_HOST_SIMULATION.
The prior 25 tests remain separate and valid. Do not add R0 to hosted P1 counts.

## After the synthetic rehearsal

Quit listeners, restore primary Wi-Fi, retain results, and do not reuse synthetic
keys for live recovery. No hosted setup is authorized by successful synthetic runs.
Operational recovery still needs a maintained, encrypted independent environment,
separately reviewed credential custody, fixed HTTPS transport/real session-local
logout validation and an exact separately authorized hosted recovery verification.
Monterey remains prohibited for privileged custody. A maintained cloud recovery
device/service remains a longer-term option requiring independent design, workload
identity, bounded authority, supervision and exact hosting/credential approval;
it is not a dependency of this LAN rehearsal and nothing is provisioned here.

Frozen P1 approval and all existing hashes remain unchanged; no duplicate fixture
approval is needed. P1 remains blocked at operational recovery gates. Release 1.0
remains **NOT READY / NOT AUTHORIZED**; draft PR #1 stays unmerged.
