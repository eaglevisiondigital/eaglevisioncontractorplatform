# P1-R0: independent recovery device readiness

## October 18: second computer confirmed; preserve completed checks

The owner has identified and tested the independent Monterey computer. Preserve
**25/25 offline recovery tests passed**, working phone-hotspot connectivity and two
successful website loads as **owner-reported completed evidence**. Do not repeat
those checks merely because the earlier intake said device unidentified. Exact
hardware/OS/runtime facts and this report's provenance are retained privately under
ignored `.staging/property-p1-r0/`; no raw transcript or tested source hash was
supplied, so the 25 cases cannot be mapped to the seven operational cases below.
This limitation does not invalidate the reported passes or require rerunning them.

Apple's [model identification page](https://support.apple.com/en-us/102869) confirms
Monterey as this model's newest compatible macOS. Compatibility is not current
security maintenance or approved privileged custody; see Apple's
[current security releases](https://support.apple.com/en-us/100100). **No privileged
credentials may be installed on Monterey.** A newer Python interpreter or successful
website loads do not change that boundary. The reported interpreter is not the
reviewed operational runtime; do not change the pinned recovery runtime or primary
Node24 requirement to accommodate it.

### What remains unfinished

All seven R0 cases below remain **BLOCKED / no actual cross-device execution evidence**:

1. R0-01: authenticated peer/run pairing between the primary and backup.
2. R0-02: encrypted transfer plus actual tamper/wrong-peer rejection and latency.
3. R0-03: durable backup custody before authenticated ACK; missing/late ACK blocks use.
4. R0-04: five-second heartbeat delivery, manual presence within60seconds and the
   real bounded supervision window. Hotspot browsing alone does not prove latency,
   continuity during primary loss, power independence or human availability.
5. R0-05: primary sender/connection loss while the backup remains operational.
6. R0-06: independent mock recovery from backup-only encrypted journal/key.
7. R0-07: cross-device duplicate/restart, UNKNOWN, incomplete custody and timeout
   behavior while unrelated synthetic controls/sessions remain intact.

Disk/custody-volume encryption, protected separate custody, sustained independent
power and the named authorized operator/full window also remain unverified. The
Monterey device may perform credential-free synthetic exercises, but those cannot
certify a different operational OS/device's custody, TLS, runtime or transport.
Defer the complete seven-case exercise to the chosen maintained environment to
avoid doing it twice. Preserve existing offline/network evidence in either case.

### Smallest practical path

**Preferred: borrow an already maintained Mac for the recovery window.** Verify
its exact model/OS/current patches, fully enabled FileVault and encrypted custody
volume, a dedicated authorized local account, independent battery/hotspot and
operator. Run only the existing small Python recovery kit and reviewed pinned
binary dependencies in a private environment. No full platform install, Node,
Supabase CLI, database duplication or application redesign is needed. Availability
and suitability are not assumed; this recommendation does not authorize credential
installation or hosted use.

**If no maintained computer is available:** assess a fully patched Ubuntu LTS
installation booted directly on the existing independent Air, preferably on a
separate encrypted external SSD to preserve Monterey. Canonical lists
[Ubuntu24.04 LTS standard maintenance through May2029](https://ubuntu.com/about/release-cycle)
and documents [encrypted installation](https://ubuntu.com/tutorials/install-ubuntu-desktop).
This is a candidate, not verified hardware compatibility or a ready recovery image.
Review exact install media/signatures, drive selection/backup/boot integrity,
passphrase-based encrypted persistent storage and swap, Wi-Fi/hotspot drivers,
certificate trust, pinned Python/dependency availability and operational behavior
before choosing it. Disk encryption alone is not boot integrity. Do not use a VM
hosted by Monterey for credential custody, modify disks, install/boot an OS or
provision secrets under this documentation-only task. A generic browser dashboard
would retain privileged credentials and broad controls; it is not a custody bypass.
Borrowing a maintained Mac is simpler when available; Linux avoids replacing the
computer but adds a bounded setup/security review and environment-specific checks.

### Next sequence and approval boundary

Select the maintained recovery environment, complete only its missing readiness
checks and the credential-free seven-case rehearsal, then prepare the exact Phase C
hosted recovery-verification proposal. Any real session, credential custody or
cleanup write still requires its separate exact approval; the rejected probe is
not retried. **Do not request approval again for unchanged P1 fixtures.** The frozen
operation/artifacts and all13 historical migrations remain unchanged.

R0 operational cases: **0 PASS /0 FAIL /7 BLOCKED /0 NOT RUN**. Owner-reported offline
results: **25 PASS /0 FAIL**, a separate evidence set; do not add it to the72 hosted
cases. P1 tracker: **0 PASS /0 FAIL /24 BLOCKED /48 NOT RUN**. No hosted requests,
sessions, MFA, credentials, writes or activation occurred. Release1.0 remains
**NOT READY / NOT AUTHORIZED**;PR#1 stays draft/unmerged.

## Historical preparation: October 17

The following checklist and results predate the owner's device confirmation above.
Statements that no device was identified describe that earlier checkpoint only.

October17,2026. Base `401c7d8`, draft PR#1. **Device readiness BLOCKED; actual
two-computer rehearsal NOT EXECUTED.** No maintained second device/operator has
been identified or made available. The known Monterey12 computer is not approved
for privileged custody. Nothing in this report upgrades simulated recovery to
actual device evidence or reopens P1 activation.

## Owner setup: start with these facts

Please provide only the proposed computer model, exact OS version, encryption
status, power/network options and authorized operator. Do not send its serial,
password, FileVault recovery key, Keychain contents, pairing secret or MFA code.
There is no need to install the platform, Node, Supabase CLI or project credentials.

| Check                   | Minimal owner action                                                                                                                         | Evidence needed before READY                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate computer       | Identify an actual physical computer other than the primary Mac. A process, container or VM on the primary does not qualify.                 | Model/OS privately recorded; operator observes both computers separately.                                                                                                                             |
| Maintained OS           | On a Mac, Apple menu → About This Mac, then System Settings → General → Software Update. Report exact version/build and any pending updates. | Engineer verifies that exact model/release against current vendor support/security releases. Monterey12 is excluded for privileged custody.                                                           |
| Encrypted storage       | System Settings → Privacy & Security → FileVault. Report On/Off/in progress only.                                                            | FileVault fully On, plus confirmation that the future custody folder is on the encrypted internal volume. Hardware encryption alone is not recorded as verified FileVault. No recovery key is shared. |
| Protected local custody | Use an authorized nonshared OS account with screen lock. Select a private local folder and independent OS secret-manager custody plan.       | Folder is local to the recovery computer, private and excluded from shared/cloud sync. No dependency on the primary disk, journal or Keychain. Real service/run credentials remain absent under R0.   |
| Independent power       | Confirm charged battery or separate tested backup power, with at least45minutes available.                                                   | Recovery process continues when the primary is disconnected; actual power observation is recorded.                                                                                                    |
| Independent network     | Identify a tested alternate uplink/hotspot with its own power.                                                                               | Transfer can meet the existing five-second heartbeat and nine-second receipt budget. Merely sharing the primary's connection is insufficient. Switching networks may require re-pairing; rehearse it. |
| Authorized operator     | Identify who will watch the recovery computer, renew presence manually and use Stop.                                                         | Actual operator available for setup plus the complete future30-minute P1 window. An automatic heartbeat never counts as human presence.                                                               |
| Runtime/access          | Confirm how the owner will operate the second computer and supply sanitized evidence.                                                        | Reviewed Python3.13.16 environment and pinned binary dependencies can run there; no remote login, firewall opening, install or credential retrieval is assumed authorized by availability alone.      |

Apple's [current security-release list](https://support.apple.com/en-us/100100)
is the vendor reference; check model compatibility and current patches after the
owner identifies the computer. A release appearing in historical security records
does not by itself prove current maintenance. Apple's
[FileVault instructions](https://support.apple.com/guide/mac-help/protect-data-on-your-mac-with-filevault-mh11785/mac)
explain its setting and recovery-key handling. If FileVault is off/in progress,
record NOT READY; do not share a key or have the engineer silently enable encryption.
Python's [3.13.16 installer requirements](https://www.python.org/downloads/release/python-31316/)
establish binary compatibility, not OS security support.

Preferred minimal path is an already available, maintained Mac. A maintained Linux
computer can be assessed once identified; the current recovery implementation uses
POSIX file locks and is not a drop-in native Windows utility. No hardware purchase
or OS configuration change is performed in this preparation.

## Optional read-only intake helper

`recovery/monterey/device_facts.py` is a standalone standard-library helper. It reads
only model identifier, OS/build/architecture, boot-volume FileVault status and
Python/TLS versions. It has no network, credential reader, hosted argument or
configuration command. Its three fixed OS commands have three-second deadlines,
closed stdin and sanitized errors. It never asks for sudo/Keychain access or reads
serials, usernames, hostnames, SSIDs or IP addresses.

After the computer is identified, copy only this public file there using an
owner-controlled method and verify its source hash from PROPERTY_P1_R0_READINESS.json.
If a Python runtime is already installed, the owner may run:

```sh
python3 -B device_facts.py
```

Otherwise use the GUI checklist first; do not trigger an installer just to collect
these facts. Keep output in private correspondence/ignored evidence, not Git. No
actual device collection was run in this task. The helper always reports
`INTAKE_ONLY_NOT_APPROVAL_OR_PASS`; physical independence, custody volume, actual
network/power/operator and current vendor support remain explicit unverified fields.
An owner-reported result is labeled as such until independently observed.

## Phase B: credential-free two-device rehearsal protocol

**BLOCKED until Phase A identifies and makes the actual device available.** Do not
prepare a supposedly paired live configuration or execute this protocol on two
processes of the primary and call it independent-machine evidence.

Once available, compose the reviewed recovery components with synthetic-only local
ports and an owner-reviewed transport between those two computers. Select the
transport against actual OS/network constraints; none is running or preapproved as
an exposed listener here. No public tunnel, automatic remote account provisioning,
hosted relay or persistent firewall/security change is implicit. Manual AirDrop/file
copy alone is not proof of meeting automated heartbeat/ACK deadlines.

Use a new random rehearsal run/key and generated synthetic identities/tokens, never
real passwords, Supabase JWTs/publishable keys/PATs, actual tenant rows or the private
P1 fixture package. Authenticate peer/run binding out of band. Keep test keys out of
reports and transfer them separately from encrypted test messages. This means
credential-free with respect to all live services; test encryption still uses
ephemeral synthetic key material. Exclude `https_adapter.py` and all hosted-control
configuration from the rehearsal bundle. No Supabase/Netlify/provider endpoint is
needed or permitted.

| Case                                   | Required actual evidence                                                                                                                                                                                                       | Current result |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| R0-01 Physical pairing                 | Both device-local run observations, selected transport/peer binding and actual operator confirmation; no serials/keys in report.                                                                                               | BLOCKED        |
| R0-02 Encrypted authenticated transfer | Valid message accepted; tampered, wrong-run and wrong-peer messages rejected across the actual machines; measured delivery latency.                                                                                            | BLOCKED        |
| R0-03 Durable ACK                      | Backup fsyncs encrypted custody before primary receives authenticated ACK; missing/forged/late ACK prevents exercise.                                                                                                          | BLOCKED        |
| R0-04 Heartbeat and human presence     | Authenticated heartbeat delivered before five seconds; actual recovery operator manually renews within60seconds. Missing either stops the rehearsal; renewals are not simulated human input.                                   | BLOCKED        |
| R0-05 Primary loss                     | Stop the rehearsal sender and disconnect its test transfer path while the backup stays operational. Do not stop other applications or force-loss unsaved work. Record actual backup timeout/stop.                              | BLOCKED        |
| R0-06 Independent recovery             | Backup reconstructs synthetic custody and completes mock containment from its own encrypted journal/key after primary unavailability, without primary files/process/credential storage.                                        | BLOCKED        |
| R0-07 Failures and duplicates          | Durable duplicate denial survives backup restart; uncertain response is not retried; lost pre-ACK creation response remains unresolved; expired live-fixture token fails; unrelated synthetic controls/sessions remain intact. | BLOCKED        |

Retain a private per-device timestamped transcript, artifact/run hashes, latency
measurements and sanitized result counts. Never log test keys or token envelopes
as decoded sessions. A same-host regression result remains labeled SINGLE_HOST
SIMULATION even if its cases overlap. No R0 case is PASS without actual second-device
evidence; owner reports and engineer-observed results are separate provenance.

Use the actual independent foreground device loop and Stop control. Check its
29-minute ceiling without extending the primary30-minute maximum; shortened test
clocks only prove local logic and do not prove a real29-minute observation. Failure
cases use fresh synthetic runs/state, retain UNKNOWN/duplicate evidence and never
reset a real P1 journal. After each scenario stop the synthetic processes, retain
the bounded encrypted evidence and follow the agreed test-key retention policy.
No feature deactivation SQL or real Auth logout is invoked by this rehearsal.

## Phase C: exact hosted proposal comes after actual Phase B PASS

**BLOCKED / NOT PREPARED.** No executable hosted operation or approval hash is
generated before the device rehearsal passes. A future proposal must bind the
approved development target privately, exact reviewed source/control hashes, UTC
window, observed device/transport, operator and independent evidence channel.
It must enumerate the minimal allowed existing test UID/session tuples, real
sign-in/MFA actions if needed, separately approved project-scoped Database-only
credential custody/expiry/revocation, exact unchanged three-tenant deactivation,
session-local logout, one-shot journal, UNKNOWN handling and before/after evidence.
It must state expected record/audit/session effects and exclude all P1 fixtures,
P2 mappings/leases, providers/media/Netlify/production unless separately approved.

No-op cleanup is still a hosted write. Submit that exact new operation for separate
owner authorization; do not repeat or rename the previously rejected cleanup probe.
Lost Auth responses cannot be revoked from a UID alone. Preserve unrelated sessions,
customer/financial records and all identity/MFA settings. Only after independently
verified real recovery may the unchanged approved P1 fixture operation advance.

## Current evidence and next action

Phase A checklist/helper prepared; **actual device, OS support, encryption, custody,
power/network and operator remain NOT VERIFIED**. Phase B: **0 PASS /0 FAIL /
7 BLOCKED /0 NOT RUN**, with zero actual two-device attempts. Phase C is blocked
pending genuine Phase B evidence. These are R0 counts, not the72 P1/P2/media cases.
The P1 tracker remains0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN. Existing fixture approval
`01b96075…` remains valid and its package is unchanged; no duplicate approval request.

Immediate owner action: identify the computer and operator using the first paragraph.
No new execution approval is needed to supply these facts. The next hosted approval
is the exact Phase C proposal, **after** the real credential-free rehearsal passes.
No hosted identity, session, MFA, feature, database, grant, customer mapping, media,
payment, Netlify or production action occurred. Release1.0 remains **NOT READY /
NOT AUTHORIZED**;PR#1 remains draft/unmerged.

Fresh local verification: **77 recovery/intake regressions PASS**, including8 new
mocked-OS intake tests. Formatting,source/frozen-artifact and13-migration integrity
checks PASS. These are single-host software tests, not actual device collection or
any of the7 Phase B cases. Application/native PostgreSQL/browser suites were not
rerun because no application,SQL,network recovery adapter or UI changed.
