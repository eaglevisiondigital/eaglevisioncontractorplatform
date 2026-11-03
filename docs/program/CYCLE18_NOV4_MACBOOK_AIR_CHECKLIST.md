# November4 · independent MacBook Air rehearsal checklist

**Prepared November3,2026. Actual device readiness and all seven physical cases remain
UNVERIFIED / NOT RUN.** The owner expects a newer, physically separate MacBook Air
November4. This checklist adapts the existing credential-free kit; it creates no new
recovery software, artifact, hosted probe or authorization. Preserve completed setup,
25offline passes, prior hash/package/network evidence and the frozen P1 approval.

## Device facts · before pairing

- On the independent Air, Apple menu → About This Mac: privately record model/year,
  exact macOS version/build. Open General → Software Update and note pending updates.
  Check that exact model/release against [Apple's current security releases](https://support.apple.com/en-us/100100)
  on rehearsal day; historical appearance alone does not prove current maintenance.
  The vendor list was consulted November3; no specific unobserved OS is accepted.
- Privacy & Security → FileVault: verify **fully On**, not off/in-progress. Confirm
  the selected private run folder is on that encrypted internal volume. Follow the
  existing [FileVault setting reference](https://support.apple.com/en-ie/guide/mac-help/mh11785/27/mac/27)
  for locating the setting; inspect its actual status on the Air. Never share
  its password, recovery key, serial, Keychain content or MFA. No setting is changed
  by this preparation. An unresolved maintenance/encryption gate is a blocker for
  privileged operational recovery even if a credential-free exercise can run.
- Use an authorized, screen-locked local account; private local folder excluded from
  iCloud/Dropbox/shared disks. No dependency on the primary Mac's disk or Keychain.
- Charge the Air; confirm at least45minutes of independent battery/power. Its trusted
  private-LAN/hotspot and power must remain available when the primary disconnects.
  Primary-provided Internet sharing is insufficient. Use the existing IPv4/4187
  transport; no public endpoint, tunnel, relay, firewall disable or remote login.
- Name the actual supervisor privately. Keep both physical screens visible. Network
  heartbeat never replaces manual human presence. Availability is not readiness PASS.

## Existing kit · only missing setup on this Air

Use the unchanged `recovery/distribution/propel-synthetic-rehearsal.zip`.
Recorded reviewed artifact: **97,334bytes**,
SHA-256 **32cb88f123e0fd776986f32d8508c913dbedc1ac977779708d1ba7218bbb8d59**,
from [the existing validation record](../TWO_COMPUTER_REHEARSAL_VALIDATION.json).
No archive is rebuilt or reverified as a new baseline in this package.

Check the newly transferred copy once on the new Air using `shasum -a 256` and that
independent record. Reuse a primary copy already verified at the same hash. The new
Air has not inherited the old backup's setup evidence: run **Setup.command** only if
this exact kit/environment has not been set up there. Preserve the completed primary
setup. Use its reviewed Python3.12+ path and separate synthetic pinned dependencies
(cryptography48.0.1 / cffi2.1.1 / pycparser3.11). Expect **SETUP COMPLETE**. Launchers
check exact native dependencies themselves; no compilation, unpinned fallback or
operational requirements.lock downgrade. No full platform, Node or database install.
Setup alone may contact PyPI; no real service credential belongs in this kit.

## Main two-device loss demonstration

Follow [the existing exact runbook](../TWO_COMPUTER_REHEARSAL.md), using the **new Air
as BACKUP** wherever its historical label says “2017 BACKUP Mac”.

1. On Air, open **Backup.command**, enter its own private IPv4. Keep its local run
   directory, synthetic pairing card and fingerprint private. Transfer only that
   one-time synthetic card out of band to the primary. Do not type PAIR yet.
2. On primary, open **Primary.command**, enter the same Air address, choose **loss**,
   paste the card into its hidden prompt. Compare the24-character fingerprints on
   both physical screens. A mismatch stops the run. Pairing authenticates the shared
   synthetic key, not hardware trust or operating-system attestation.
3. Within the existing three-minute pairing window, type **PAIR** on Air; wait for
   **BACKUP WAITING**; then **PAIR** on primary. Require **PAIRED**, **33 DURABLE ACKS
   VERIFIED /15 SYNTHETIC SESSIONS /3 SYNTHETIC UPGRADES**. Missing, forged or late
   receipts never authorize continuation. No genuine Auth/MFA session is created.
4. On Air, manually type **present** every30seconds. Its60-second limit is independent
   of the five-second network heartbeat. No pasted repeat lines, script or timer may
   simulate human supervision. **stop** is immediate synthetic containment.
5. At primary's **READY FOR PRIMARY LOSS**, turn off its Wi-Fi and disconnect any
   Ethernet/USB network; leave the Air's network/power intact. Close only the primary
   rehearsal Terminal. Protect unsaved work; no abrupt full-machine power-off is
   required. Record the actual loss time. Do not restart primary in that run.
6. Observe Air continuing alone after roughly five seconds without authenticated
   heartbeat, allowing the runbook's bounded I/O. This proves loss of participation;
   it does not prove physical power-loss durability unless separately witnessed.
7. Inspect Air's sanitized `result.json`: **REHEARSAL_VERIFIED** only with complete
   custody, syntheticFeaturesActive0, syntheticSessionsRemaining0, unrelated synthetic
   session preserved, unresolvedIntents0, automaticRetries0, financialActions0 and
   hostedVerificationfalse. Missing/uncertain results remain UNKNOWN.

## Existing failure, timeout and restart cases

Use only the already documented explicit synthetic scenarios. A new scenario gets
its own fresh synthetic card/directory; never delete an attempt marker, replay an
uncertain attempt or carry this rule into real P1/hosted uncertainty.

- `duplicate`: reject duplicate custody/receipt; no second execution.
- `tamper` / `wrong-run`: reject altered or wrong-run encrypted evidence.
- `lost-ack` / `incomplete`: STOP/UNKNOWN or CONTAINMENT_REQUIRED; no invented session
  identity, guessed revocation or automatic retry.
- `expired`: deny expired synthetic capability. Human timeout must contain while
  primary heartbeats continue; test it separately from primary network loss.
- Backup restart: after complete custody and interruption, primary disconnected,
  use Air's **Recover.command** and its own local directory. Choose **recover** only
  if no recovery attempt exists; otherwise **report** (read only). Recovery depends
  solely on Air's encrypted local custody, not the primary. A lost recovery result
  remains UNKNOWN, never permission to recover again.
- Duplicate recovery: same directory must STOP without a second attempt; **report**
  remains read only. The existing29-minute ceiling is unchanged; a shorter clock
  simulation does not prove physical elapsed-time endurance.

## Revocation, cleanup and evidence

All revocation/deactivation here is **synthetic local state only**: revoke only the
15 exercised generated sessions, contain the three synthetic controls and preserve
the unrelated generated session. No Supabase/management credential, real Auth
logout/session creation, SQL, hosted cleanup or provider API is permitted.

Privately retain both distinct run directories and exact kit hash, run/scenario IDs,
start/pair/ACK/loss/recovery times and sanitized results. Witness both physical Macs,
matching fingerprints with card hidden, manual supervision,33ACK readiness, primary
disconnection and Air completing alone. No keys, cards, encrypted envelopes, private
network addresses, serials or desktop private content in shared evidence or Git.
Label each R0-01…R0-07 result owner-reported or engineer-observed. Keep prior25offline
passes separate; do not change hosted P1 counts from this exercise.

Quit rehearsal listeners; restore primary networking; preserve uncertain directories
and do not reuse synthetic keys operationally. Actual physical PASS requires actual
evidence. Later genuine custody/TLS/session-local logout/hosted recovery verification
needs its own exact reviewed authorization. Existing unchanged P1 approval persists;
no duplicate approval, protected artifact change or activation is requested here.
**Release1.0 NOT READY / NOT AUTHORIZED.**
