# Independent P1 recovery on the second Mac

October 17, 2026. Base `d8f574a`, draft PR #1. **Preparation/local rehearsal only.
NO-GO for operational recovery or P1 activation.** No hosted request, Auth session,
credential retrieval, cleanup probe, activation or migration occurs in this task.
The previously rejected real cleanup probe is not repeated or bypassed.

## Recommendation and compatibility

Prefer a small Python standard-library utility over a browser SQL procedure. Keep
Node24 on the primary Mac. Do not install this repository, npm, Supabase CLI,
PostgreSQL or the contractor platform on the second Mac. Copy only the two public
Python files and a separately protected three-file private capsule.

| Option                               | Compatibility evidence                                                     | Decision                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Primary Node24 harness on Monterey   | Official Node24 macOS binaries require13.5 or later                        | Rejected; no downgrade, unsupported build or patched runtime                                            |
| Minimal Python utility               | Python3.13.16 official macOS installer supports10.13+, Intel/Apple Silicon | Recommended preparation path; actual Monterey machine/runtime/TLS remain untested                       |
| Secured browser procedure            | Current Firefox153 requirements include macOS10.15+                        | Useful for official downloads/account inspection; not a constrained recovery tool                       |
| Browser SQL editor/DevTools snippets | Broad administrative SQL/session authority, easy target/paste mistakes     | Rejected as the ordinary recovery interface; no generic SQL console or pasted token/JavaScript workflow |

Sources: [Node24 migration requirements](https://nodejs.org/en/blog/migrations/v22-to-v24),
[Python3.13.16 installer](https://www.python.org/downloads/release/python-31316/),
[Python macOS guidance](https://docs.python.org/3.13/using/mac.html),
[Firefox153 requirements](https://www.firefox.com/en-US/firefox/153.0/system-requirements/).
Compatibility is not security maintenance. Apple's published history lists Monterey
12.7.6 on July29,2024; this review did not establish a current Monterey OS security
maintenance commitment. A newer browser/Python does not patch the kernel or old
system services. **Prefer an officially supported OS upgrade or another maintained
Mac for privileged credentials.** Continued Monterey credential use requires explicit
security/risk review and an owner decision; possession of a second Mac is not proof
of a safe recovery channel. See [Apple security releases](https://support.apple.com/en-us/100100).
No OS/browser/Python software was installed on either machine by this work.

## Delivered utility and enforced limits

`recovery/monterey/p1_recovery.py` is a standalone, standard-library-only offline
inspector and rehearsable recovery state machine. `test_p1_recovery.py` supplies
synthetic temporary artifacts/mock ports. Neither file supplies a live transport,
credential reader, SSH server, login, MFA, refresh-token flow or hosted execute mode.
This is locally verified preparation, **not a working hosted recovery client**.
The mock-port seam must not be presented as genuine provider acceptance.

The inspector hashes the original operation bytes against approved01b96075…, then
checks the exact plan/deactivation hashes recorded inside it. It derives exactly
three approved organization IDs and15 existing staff aliases/UIDs. Customer and
platform operator accounts are excluded. It never recompiles the frozen package.
The three-file capsule contains only:

- `operation.private.json`, unchanged reviewed operation;
- `p1-plan.private.json`, unchanged reviewed plan/UID bindings;
- `deactivate-features.proposed.sql`, unchanged reviewed cleanup bytes.

Do not copy activation SQL, account passwords, session tokens, primary journals,
Keychain exports, financial exports or the rest of `.staging/`. The capsule contains
private identifiers and stays off Git/cloud-sync/email/chat. It is not a credential.
An ignored local copy was assembled for integrity inspection; it was not transferred
to the older Mac. Exact hashes are in PROPERTY_P1_MONTEREY_RECOVERY.json.

The recovery core has only fixed observation/deactivation and authenticated-user/
logout request descriptions. No arbitrary host, custom SQL, membership mutation,
Auth-schema DELETE, financial write, provider grant or activation command exists.
Its local OneShot journal uses private permissions, exclusive no-follow creation,
file/directory fsync and one persistent attempt marker. Lost responses/interruption
remain UNKNOWN/CONTAINMENT_REQUIRED; restart cannot replay. It does not use the
primary Mac's journal. A separately authorized manual recovery decision is required
for an uncertain prior attempt; do not delete markers or choose another directory.

Logout requests are proposed as `scope=local`, using each exact exercised session's
valid user JWT. This deliberately narrows the primary worker's `scope=global`, which
could revoke other sessions for the same user. It is a new recovery-protocol detail
requiring independent review and exact hosted-test approval, not an implicit change
to the frozen P1 package/primary worker. The core continues containing other sessions
when one request fails, and parallelizes up to15 logouts to avoid15 sequential timeouts.

[Supabase sign-out documentation](https://supabase.com/docs/reference/javascript/auth-signout)
confirms local/global semantics; [admin sign-out](https://supabase.com/docs/reference/javascript/auth-admin-signout)
also requires a valid logged-in JWT. Knowing only a UID is not sufficient. Do not
substitute service-role access, direct Auth-table deletion, account reset or a new
emergency sign-in. Cryptographic JWT validity can outlive logout; existing sensitive
SQL functions must continue checking actual `auth.sessions` rows. No policy change.

## Owner setup: safe steps now

1. Record the older Mac model/architecture, exact12.x patch, FileVault status and
   whether Apple offers a currently maintained OS upgrade. Resolve OS maintenance
   before approving real credentials. Use a dedicated local OS account, strong
   login, automatic screen lock, no screen recording/cloud-sync/shared clipboard,
   no unreviewed browser extensions or remote-control agents. These controls do not
   eliminate unsupported-OS risk. Do not use unsupported OS patchers as a shortcut.
2. From Python.org only, obtain the signed3.13.16 installer (or a later separately
   reviewed security patch), verify its published checksum and installer signature,
   and use its supplied certificate setup without disabling verification. An
   installation needs the owner's normal local approval; this task does not install.
   Never replace Apple's system Python or alter the primary Node24 requirement.
3. Transfer the two public utility/test files through an integrity-checked trusted
   channel. Compare SHA-256 values with the reviewed record independently of the
   primary Mac. Run `python3 -B test_p1_recovery.py` in that two-file directory.
   It creates only disposable mock fixtures and performs no network access.
4. Place the private capsule in a local FileVault-protected folder (mode700, files600)
   outside synced folders. Run `python3 -B p1_recovery.py /absolute/private/capsule`.
   The only argument is a file path. Expect OFFLINE_ONLY,three tenants,15 staff and
   the reviewed operation hash. There is no execute/recover option or secret argument.
5. Keep the second Mac charged/on independent power, awake during supervision and
   physically available to an authorized operator. Test its independent internet
   route with non-sensitive vendor pages: a phone hotspot/separate uplink, not the
   primary Mac's tether/VPN/SSH tunnel/DNS proxy. Record actual tests, not assumptions.
   Shared Wi-Fi/router, ISP, hotspot battery, Apple/cloud accounts and Supabase remain
   common failure points. Never disable TLS, follow redirects to another endpoint
   or bypass warnings to make connectivity pass.

These are setup instructions, not claims that the owner performed them. The older
Mac was not remotely accessed and hardware/network/OS/TLS results remain NOT RUN.

## Future credential custody and session escrow — not authorized by preparation

Before operational release, independently review a minimal live adapter and encrypted
handoff. None is enabled or supplied here. Requirements for that separate package:

- Owner-approved control-plane credential custody on the second Mac, available
  without the primary machine. Do not export the primary Keychain or retrieve/create
  a PAT as part of this task. Owner enters an approved credential directly into a
  reviewed hidden-input/secure-keychain channel on the second Mac; never ChatGPT,
  logs, shell history, command arguments, environment exports or documentation.
  A management PAT can have broad underlying database rights: the utility allowlist
  is application containment, **not a new server-enforced restricted grant**. No new
  database login/service identity/grant is proposed. Review scope/expiry separately.
- A previously reviewed public client key belongs in private target configuration.
  It is not a service key and cannot replace real user identity. Verify exact project
  identity,13 historical migrations and disabled boundaries with read-only requests.
- Independently receive each actual exercised staff JWT immediately after creation,
  including owner AAL1 cleanup custody **before** waiting for TOTP; update to genuine
  same-session AAL2 after verification. All15 required sessions must be acknowledged
  on the recovery Mac before activation. Never generate additional sessions there.
- Use a separately reviewed encrypted, authenticated handoff (for example pinned-host
  SSH with payload on stdin, agent forwarding disabled, no token-bearing arguments,
  no plaintext files). Host identity and operator must be verified independently.
  No relay service/daemon, network listener or automatic cross-Mac token export was
  created. Do not improvise copying JWTs through browser DevTools, Messages, email,
  shared clipboard, screenshots, chat, logs or unencrypted removable media.
- Retain session custody in protected second-Mac memory for the supervised window.
  Validate exact UID/issuer/session with real Supabase `getUser`; parsing a JWT is
  not authentication. Require validity covering at least30minutes plus60seconds
  before starting and a fresh check at action time. Memory is independent once
  handoff is acknowledged, but restart/power loss loses it. Python cannot guarantee
  zeroization of immutable strings; no crash/core dumps or disk token caching.
- Management and session credentials use separate endpoint bindings. Future HTTPS
  transport must use validated certificates/hostname, exact target hosts, no proxy
  inheritance/redirects, bounded request/response sizes and8-second deadlines.
  No automatic retries, credential logging or response-body exception dumps. The
  adapter must load its own hash-verified capsule and construct/allowlist exact
  requests internally;never trust a caller-supplied Request object or SQL string.

The recovery Mac is independent of the primary processes/credential store only
**after** its own verified custody/handoff is complete. There is also a creation-to-escrow gap: if the primary fails or loses an Auth
response before a session is acknowledged on the second Mac, knowing its UID or
session ID alone cannot supply the valid JWT needed for logout. The prototype
reports remaining sessions as CONTAINMENT_REQUIRED;it never deletes Auth rows or
creates another sign-in to hide this gap. A reviewed provider-supported recovery
mechanism or custody-first authentication design must resolve this scenario before
operational GO. Current primary software
has not been wired to require a second-Mac acknowledgment. That integration and
loss-of-primary rehearsal are explicit remaining engineering gates. Do not claim
independence merely from this prototype or the existence of the older laptop.

## Proposed emergency sequence and independent verification

This is a future request contract, not executable hosted authority.

1. Operator stops the primary executor when possible and triggers emergency recovery
   immediately on loss of primary/supervision. Do not wait until minute30. Primary
   watchdog remains unchanged:minute29 containment,60-second human presence and
   five-second process heartbeat. Neither machine implements a native feature TTL.
2. On the second Mac, reserve the durable one-shot recovery marker before any
   recovery request. Obtain fixed read-only observation from the development API.
   Preserve approved feature IDs/states, hashes of every unrelated feature row,
   exact exercised session UID/ID pairs, unrelated sessions and identity/factor digest.
   A failed initial observation cannot suppress containment, but prevents VERIFIED.
3. Issue **only** the original frozen deactivation SQL, once, through the exact
   management endpoint. It preserves feature/audit records and handles partial
   activation. It has2-second lock/10-second statement limits. No generic editor,
   alternate SQL, new grants, DELETE, feature insertion or transaction retry.
4. Attempt only session-local logouts for the verified escrowed sessions, in parallel.
   Expired/rejected tokens or uncertain responses remain unconfirmed; continue other
   exact sessions. No extra sign-in, refresh, user deletion, password reset or MFA reset.
5. Independently observe again: all approved controls disabled (same rows retained),
   all exercised session pairs absent, no unexpected session left for approved staff,
   unrelated feature hashes and sessions unchanged, identity/factor digest unchanged.
   An unrelated session for the same worker is preserved and reported, not globally
   revoked. Check the main713-original-record/financial verifier separately after
   containment; emergency recovery does not read supplier costs/payroll/customer data.
6. Any UNKNOWN, missing custody, changed unrelated control, deleted row, missing
   observation, late write or API outage is CONTAINMENT_REQUIRED. Do not restart,
   erase journal/audits or claim a clean timeout. Manual second deactivation remains
   limited to the earlier reviewed confirmed rolled-back lock-timeout procedure;
   UNKNOWN does not qualify. The local utility supplies no automatic retry.

A bound on client wait is not a guarantee a queued request was cancelled server-side.
Machine loss, both power/network failures, expired tokens or Supabase outage can
prevent recovery. An independent third recovery route/authorized human and continued
observation may still be necessary. Do not extend the30-minute approval window or
claim verified containment while any control/session is unresolved.

## Remaining exact approvals and evidence

Existing P1 approval01b96075… remains valid for its unchanged scope; no duplicate
request. This preparation does not approve new recovery transports or probe writes.
The next owner decisions are OS maintenance/acceptable hardware, independent network
and operator availability, then review of the encrypted custody/live-adapter package.

Only after that review should a separate hosted recovery verification operation be
submitted with exact project,three tenant IDs,session UID/ID allowlist,unchanged SQL
hash,proposed local-logout semantics,credential custody,one-attempt journal,UTC window,
expected audit/session effects,stop/containment controls and operation SHA-256.
Explicit approval must cover even a no-op deactivation. No prior rejected probe may
be repackaged or indirectly executed. No real session/test fixture can be created
under the current assignment. Do not activate P1 until all operational gates pass.

Local regression and source/capsule hashes are in PROPERTY_P1_MONTEREY_RECOVERY.json.
Tests cover a separate durable journal and actual child-process reservation race,
partial activation, exact tenant scope, all15 mocked local logouts, unrelated state,
uncertainty, failed observations, operator interruption, expiry/foreign users and
redacted representations. They are not actual Monterey, TLS, credential or hosted
revocation evidence. No migration/application/branding/Netlify change is proposed.
Release1.0 **NOT READY / NOT AUTHORIZED**;PR#1 remains draft/unmerged.

Final local results: **25 Python recovery tests PASS;824 application/SQL tests PASS
with50 native-only skips;7 focused native PostgreSQL17 tests PASS;63 desktop/tablet/
mobile browser tests PASS**. Formatting,strict/generated types,integrity and build
pass. Counts overlap. Local Python was3.9.6 for offline fixtures only;CI is configured
for3.13.16. Actual Monterey/hardware/runtime/TLS and all hosted recovery remain NOT RUN.
