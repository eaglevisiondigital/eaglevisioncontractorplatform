# P1 independent recovery completion · local engineering

October 17, 2026. Base `7fe6002`, draft PR #1. **GO for independent local device
rehearsal; NO-GO for hosted recovery or P1 activation.** No project request, session,
MFA challenge, cleanup probe, credential retrieval, feature or fixture write occurred.
The previously rejected cleanup probe remains prohibited and was not repackaged.
This report supersedes the earlier offline-only implementation description, while
preserving its historical evidence and all operational approval gates.

## Implemented components

| Component                          | Behavior and boundary                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https_adapter.py`                 | Reloads the exact hash-bound three-file capsule. Four fixed operations only: observation, unchanged deactivation, getUser, session-local logout. No caller SQL/host, login, refresh, Auth-admin or provider endpoint.                                                                                                                                                                                                                             |
| HTTPS worker                       | Direct HTTPS443, hostname/certificate verification, TLS1.2+ with AEAD cipher suites, no proxy inheritance/redirects/cookies/compression/retry. One MiB response bound. Separate spawned process with an eight-second parent deadline covers DNS/TLS/response waits; child is terminated on uncertainty. Secrets travel only in private IPC memory, not arguments/environment/logs. TLS key logging and ambient CA/OpenSSL overrides are rejected. |
| `custody.py`                       | Per-run AES256-GCM messages and encrypted append-only backup log; HKDF-SHA256 separates encryption and HMAC receipt keys. Operation, target, random run ID and purpose are authenticated. File/directory fsync and exclusive process locking precede ACK. Replay/chain corruption fails closed.                                                                                                                                                   |
| Primary `P1BackupCustody`          | Real Node/Python protocol interoperability. Requires backup INTENT ACK before external sign-in, then exact SESSION ACK before use; same-session owner UPGRADE requires the backup's genuine Auth/existing-factor check. Missing/late/wrong receipts stop the run. No sign-in/password reader is added.                                                                                                                                            |
| Composed P1 harness                | Backup is mandatory, bound to the frozen operation/target. All15 staff sessions and three owner upgrades must be acknowledged. Each application RPC checks custody, including the separately acknowledged original AAL1 negative-probe token. Incomplete custody closes primary cleanup; no activation is permitted.                                                                                                                              |
| Encrypted mailboxes                | Private local spools, fixed UUID filenames, exclusive writes/fsync, size bounds/no symlinks. The backup emits authenticated receipts only after durable storage. No listener, cloud sync, SSH command or general administrative interface. Actual independent device-to-device transfer remains an operator setup/verification gate.                                                                                                              |
| Independent supervisor/device loop | Foreground bounded mailbox polling, authenticated increasing-counter five-second heartbeats, separate actual human renewal within60seconds, wall/monotonic containment by minute29 from supervisor start. Late renewal cannot revive an expired window. Start the backup before sign-in; this earlier clock never extends the primary30-minute window.                                                                                            |
| Recovery                           | Independent encrypted journal/key/capsule and one-shot attempt state; no primary journal/process/Keychain dependency. Observe, deactivate first, restore current bearer custody in parallel, local logout in parallel, observe again. Maximum15 sessions. No automatic second write after uncertainty.                                                                                                                                            |

The callable adapter and mailbox components are implemented; **no operational CLI,
credential loader, deployed relay or automatic hosted mode is enabled**. The original
`p1_recovery.py` CLI remains inspection-only. A later reviewed private device harness
must explicitly compose these components with authorized in-memory custody and
the implemented foreground `DeviceRuntime` loop/nonblocking human UI. It must deliver
encrypted heartbeat packets before five seconds and actual operator renewal before
60seconds; file-transfer latency must pass that budget. Do not claim a same-disk
mailbox or another process on the primary Mac is an independent recovery device.

## Session-creation uncertainty

The backup durably records the creation INTENT before the primary is permitted to
submit a password sign-in. The implementation itself does not submit that sign-in.
If the request fails or Auth's response is lost, that intent remains unresolved.
No session token is invented from a UID, no automatic login retry occurs, and no
new run/fixture activation may conceal the uncertainty. Even a later apparently
clean observation does not silently erase an unresolved intent in that run.

If a response is received but the primary dies before backup ACK, a successfully
stored envelope can be recovered on the second device without the primary. If no
token reached durable backup storage, independent observation can identify unexpected
session rows, but **does not grant authority to revoke them by UID**. Recovery still
deactivates the exact controls and reports CONTAINMENT_REQUIRED. A supported exact
revocation/expiry procedure and separately approved operator action are then needed;
no Auth DELETE, SQL session deletion, account reset or new impersonated session is
implemented. Thus the gap is contained and activation-blocking, not eliminated by
an unsupported provider claim. No claim of guaranteed cleanup during provider outage.

Restart restoration uses only the newest encrypted token for each alias. Tokens
need31minutes remaining at initial custody; cleanup-only restoration requires
three minutes, not a fresh execution window. A previously acknowledged session that
is already absent from the independently observed live session inventory needs no
second logout. Failed Auth validation alone never proves absence. All unresolved
intents, expired live tokens, failed/uncertain writes and changed unrelated state
remain containment failures. Deactivation occurs before any restore/Auth wait;
parallel batches avoid15 sequential network deadlines. Client deadlines cannot
prove a queued server query was cancelled; continue independent observation.

## Logout and financial boundaries

Supabase documents `local` as the current session and `global` as every session for
that user. Access JWTs can remain cryptographically valid after logout until expiry;
existing database session-row checks remain mandatory. See [sign-out scopes](https://supabase.com/docs/guides/auth/signout)
and [admin signOut JWT requirement](https://supabase.com/docs/reference/javascript/auth-admin-signout).

The local P1 caller and primary cleanup worker now explicitly use `scope=local`,
matching the backup proposal. The previous global behavior could revoke an unrelated
same-user session during a race. Zero-session starting/ending checks remain strict;
unrelated same-user sessions are preserved and cause containment, never global
revocation to manufacture PASS. This is a new reviewed-code protocol requiring
**separate exact hosted verification**, not a change to the approved fixture SQL or
another request to approve the unchanged P1 operation.

Frozen operation `01b96075…`, its four artifacts, exact three-tenant deactivation
SHA`9f218c64…`,13 historical migrations, original713-record guards, 22 identities,
four factors, logo and financial payloads are unchanged. No financial side effect,
customer debt, provider capability, P2 mapping/lease or media action is added.
Hosted tracking remains **0 PASS /0 FAIL /24 BLOCKED /48 NOT RUN**.

## Scoped management custody and supported hardware

Current Supabase [scoped PAT guidance](https://supabase.com/docs/guides/platform/personal-access-tokens)
supports limiting a token to one project and Database read-write. New recovery code
requires the documented scoped `sbp_fc` format and rejects legacy account-wide PATs.
Format validation does not prove actual permission scope: the owner must independently
review selected project, capability and expiry before any separately approved use.
Database read-write can still run other SQL inside that project; the three-tenant
restriction is an application allowlist, **not server-enforced tenant scoping of the
management credential**. No new database login/grant or token is created here.
Do not copy the primary's existing account-wide Keychain credential to the backup.

Request, only in a later exact custody approval: one development-project-scoped PAT,
Database read-write only, shortest practical expiry, no Auth administration, API-key
secrets, Storage, billing or other projects; independently custodied publishable key;
one random256-bit run key and run ID. Scope/expiry must be verified by the owner in
the dashboard; the adapter's permit is bounded to at most one hour and identifies
the exact separately reviewed recovery operation. It is not proof of owner approval
or a server-enforced credential TTL. Primary control custody remains separate.

**Do not install privileged credentials on Monterey12.** Binary compatibility does
not establish current OS security maintenance. Prefer a physically independent Mac
running an Apple-supported, fully patched macOS release. A maintained Linux device
can be evaluated separately; current code uses POSIX file locks, not Windows APIs.
Use Python3.13.16 and the hash-pinned binary-only cryptography50.0.2/cffi2.1.1/
pycparser3.11 environment. Primary Node24 and npm lockfile remain unchanged.

Required device setup: encrypted disk/FileVault, dedicated nonshared OS account,
screen lock and current patches, trusted installer/CA store, protected local Keychain
or separately reviewed secret manager, at least enough free RAM for15 short-lived
Python HTTPS children (8GB recommended), independent battery/power and tested hotspot
or second uplink. Do not use a VM on the primary Mac. No iCloud/shared-folder session
or key sync, clipboard/chat transfer, terminal history, core dumps, packet tracing
or session-bearing screenshots. Exclude custody from ordinary backup/sync; retain
only encrypted bounded evidence under reviewed retention. Python cannot promise
perfect memory zeroization; OS/process access remains a privileged trust boundary.

Owner setup, after separate approval only: provision custody directly on the supported
device; never include the master key with encrypted envelopes or in Git, chat, CLI
arguments or environment. Pair device identity/run out of band. Transfer encrypted
file messages over an independently authenticated, owner-reviewed path; test its
latency without credentials first. Recover from independently stored encrypted
journal/key after primary loss. Preserve the acknowledged journal head/receipt on
the backup; whole-directory rollback/key theft cannot be solved by encryption.
Never restore an old snapshot or reuse a run/key to overcome a duplicate marker.

Supabase's [October12 TLS notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
plans removal of older CBC TLS1.2 suites no earlier than November10,2026. The adapter
already permits only ECDHE AEAD for TLS1.2, with normal TLS1.3. Actual second-device
certificate trust/cipher negotiation/network independence remain NOT VERIFIED.

## Verification and next supervised step

Local evidence and source hashes are in PROPERTY_P1_RECOVERY_COMPLETION.json.
Mock HTTPS asserts exact requests, certificate/hostname checks, AEAD cipher set,
redirect/proxy/body/deadline restrictions and credential separation. Real encryption
and Node-to-Python separate-process tests exercise the actual packet/ACK protocol,
fsync, duplicate/UNKNOWN handling and restart custody. Disposable PostgreSQL checks
all existing authorization/concurrency/financial suites. Browser regression uses a
separate loopback port; no app redesign or hosted/browser acceptance is claimed.

Remaining gates, in order:

1. Owner selects a maintained independent recovery device, operator and independent
   power/network. Rehearse encrypted pairing, file transfer, heartbeat/presence and
   primary loss there using synthetic data only; no credential installation yet.
2. Review the private foreground device harness, protected key/PAT custody and exact
   scope/expiry. The library/mailbox is not an already running operational service.
3. Prepare a **new exact hosted recovery verification package**: development identity,
   frozen hashes, approved tenant/session allowlists, scoped credential permissions,
   local logout behavior, UTC window, one-shot journal, unknown-session escalation,
   independent read-before/read-after and no fixture activation. Seek its separate
   authorization before **any** real sign-in, probe or cleanup write. Do not rerun
   the rejected probe under another name.
4. Verify actual same-session TOTP, durable backup ACK, machine-loss recovery,
   session-row revocation and unchanged unrelated records under that authorization.
   Only then refresh the713-record/13-migration/identity/MFA/off-control P1 preflight
   and use the existing unchanged-scope P1 approval in a supervised session.

No Netlify/provider/support action or merge occurred. Release1.0 remains **NOT READY /
NOT AUTHORIZED**;draft PR#1 stays open/unmerged.

Final local evidence: **834 application/SQL PASS,50 native-only skips;69 Python
recovery PASS;346 native PostgreSQL17 PASS/zero skips;63 desktop/tablet/mobile
browser PASS**. Counts overlap. Formatting, strict/generated types, integrity and
build PASS. Full check included68 Python cases; the final TLS-environment regression
was then verified in the69-case recovery run. Local Python3.12.14; CI targets3.13.16.
Initial native/browser starts were sandbox-blocked; subsequent local-only authorized
runs passed. No current hosted history/catalog refresh or hosted test is claimed.
