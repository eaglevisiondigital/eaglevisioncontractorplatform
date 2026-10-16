# Propel Contractor Suite · C1 platform bootstrap review

Latest: the exact operation was separately approved and executed once. The three
companies were set up through checked normal-authenticated RPCs, the temporary
grant is inactive and the operator is signed out. See ACTION_C1_EXECUTION.md for
actual counts, timing and verified cleanup. The preparation-only text below is the
original review record; do not rerun its INSERT or infer broader approval.

**PREPARED ONLY — NOT AUTHORIZED FOR EXECUTION; NO HOSTED WRITE.** The owner
requested preparation and explicitly requires separate approval of the exact
operation. Action A remains complete; Action B remains approved but blocked.
Broader Action C grants, Action D and launch remain unapproved. Continue draft PR #1.

## Exact scope and identity

The existing private Action A roster contains exactly one `platform-operator`.
Read-only hosted lookup confirmed its exact UID AND email, confirmed nonanonymous
identity, one verified TOTP factor, zero contractor memberships, zero platform
authorizations and zero sessions. No credentials, tokens or seeds were retrieved.

The existing platform authorization covers the control plane, not a server-enforced
per-function or three-company allowlist. The approved use must stay limited to
Action B provisioning/configuration; it grants no implicit contractor membership or
customer-data authority. No narrower privilege type is added by this preparation.

The target-bound exact operation is in ignored `.staging/c1-review/`:

- `proposal.json`: approved-development target, exact operator UID/email, scope,
  SQL hashes, empty owner approval and execution-window fields.
- `grant.sql`: exactly one `INSERT INTO private.platform_admins(user_id,active)`
  for that operator, `active=true`, with transactional guards. No upsert, role
  replacement, organization membership or other grant.
- `revoke.sql`: set only that exact UID's `active=false`; retain the inactive row
  and historical evidence. No identity/factor/tenant deletion.
- `README.md`: exact local owner review and hashes; nothing from this directory
  belongs in GitHub or CI artifacts.

**Operation SHA-256:**
`37cc9657fd57aef122d96d4fb1156e5ebfdc012ad7f361fdb114e34073401b3d`.
It binds the exact target, UID, one-row scope, 30-minute window and both SQL files.
Public review templates under `docs/operations/` contain unresolved placeholders;
only the private bundle contains actual identifiers. Never execute a template or
re-render/alter the exact bundle under an old approval.

## Current-state inspection

| Check                                       | Result                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Private roster UID/email versus hosted Auth | PASS, exact confirmed nonanonymous match                                      |
| Existing Auth/MFA                           | 22 confirmed identities; four verified TOTP; zero pending factors             |
| Existing operator privileges                | No membership and no platform grant                                           |
| Sessions / current AAL2                     | Zero sessions; fresh live AAL2 is NOT RUN, not inferred from prior enrollment |
| Private authorizations                      | Platform/release-test/material-worker rows all zero                           |
| Organizations / memberships                 | Zero / zero; Action B fixtures not started                                    |
| Grant schema                                | Only user_id and active; no native expiry field                               |
| Platform predicate                          | Current UID AND signed AAL2 AND active private platform row                   |
| Public provisioning wrapper                 | Invoker; preserves real caller into checked private implementation            |
| Hosted grant/revocation verification        | NOT RUN; no execution approved                                                |

The prepared grant transaction rejects identity/factor/count drift, any existing
platform row (including inactive rows), organizations/memberships or other private
grants. It locks platform grant writes and tenant creation/membership writes for
the short transaction, inserts one row and verifies postconditions. It additionally
requires exactly one fresh operator AAL2 session, created within five minutes,
linked to the existing verified factor and not expired. A duplicate attempt fails;
it cannot silently renew or replace the grant. No RLS, table privilege, function,
Auth setting or migration is changed.

## Approval and genuine authentication sequence

1. Owner reviews the exact private target, UID, grant and revoke SQL/hashes and
   separately approves this operation hash, one activation and its cleanup window.
   Preparation approval is not execution approval. Preserve that trusted approval
   reference privately; do not invent an approval from a manifest flag.
2. Reverify target identity, original nine-migration digest, saved Auth/API controls,
   existing roster/factors, grant/schema predicates and the zero-grant/tenant baseline.
   Any discrepancy stops execution and needs review; no history repair or upsert.
3. Retrieve the existing operator password through the approved Keychain memory
   pipe; use the publishable client to sign in. Challenge the existing verified
   TOTP with actual owner code entry. Never enroll/reset factors or derive codes.
4. Fresh real `getUser`, verified `getClaims`, assurance-level and factor checks must
   agree on exact private UID/email, confirmed nonanonymous status and AAL2. Match
   the claims' session_id in memory to the sole fresh hosted AAL2 session. Record
   only status, not token/session ID/OTP/QR/seed. Prior Action A AAL2 is not current
   authority. At preparation time these conditions are intentionally unmet.
5. Record the UTC window start and fixed revoke-by time **before** the approved
   grant transaction; verify both SQL hashes and explicit development target again.
   Execute only the exact approved bootstrap using the privileged operator database
   channel. This is the one infrastructure authorization write; never use that
   channel or a service-role key for application/domain operations.
6. Independently read back exactly one active operator row and zero operator
   memberships/other private grants. Using the genuine operator JWT, require
   `platform_access=true` and zero operator company memberships. Only then resume the
   already-approved Action B through checked provisioning/configuration RPCs.
   No broader release/environment/worker grant or signature operation is implied.
   Verify operator denial against actual tenant-owned positive fixtures during
   Action B; empty tables alone do not prove tenant isolation.

## Thirty-minute operator-enforced expiration

The absolute deadline is `windowStart + 30 minutes`, recorded in UTC with an
America/Chicago display for the owner. It starts immediately before activation,
not after a retry or the first successful RPC. Revoke earlier as soon as all three
approved company provisioning/configuration operations are complete, or on any
error, cancellation, unexpected result, loss of supervision or authorization drift.
Do not renew automatically. Company-owner operations can continue under Action B
using their own current authority after the platform grant is revoked.

There is **no database TTL, automatic scheduler or background revoker** in the
existing schema. The timestamp alone cannot deactivate the row. Execution requires
an attending authorized operator and an available independent privileged database
cleanup channel throughout the window. Check the fixed deadline before every
platform RPC and after it returns; start no new privileged request at/after it.
A local timer/finally cleanup may assist later execution but is not a guaranteed
server expiry. Do not activate if supervised timely revocation is unavailable.

## Revocation and verification procedure

1. Stop new platform requests and drain known in-flight RPCs. An already-running
   transaction cannot be retroactively undone; if an RPC timed out, inspect its
   effects read-only rather than blindly retrying or duplicating a company.
2. Run the exact approved `revoke.sql` through the independent operator database
   channel. It changes only the operator's active row to false. Repeat is safe:
   an inactive/absent row never becomes active. Unrelated drift does not block
   cleanup or roll revocation back; record it separately and stop further work.
3. Read back `operator_active=false`, retained inactive row after activation, and
   zero operator memberships. Compare unrelated grants/tenant rows to their prior
   state; do not delete Action B fixtures or audit history.
4. With the previously genuine AAL2 session still in memory, require real
   `platform_access=false`. Where a test company exists, read-only `company_metrics`
   must deny with SQLSTATE 42501. This proves grant revocation independently of
   merely logging out; record only statuses, never customer data/token contents.
5. Call `auth.signOut({scope:'global'})` for this synthetic operator; verify zero
   operator Auth sessions and remove local browser/session state. Preserve all
   four verified factors and all 22 identities. JWTs may remain cryptographically
   valid until expiry: the inactive database grant, not logout alone, must deny
   subsequent platform statements.
6. Verify cleanup with independent database reads and the real caller. If grant
   execution/commit outcome is uncertain, do not rerun insertion: inspect state
   and revoke immediately if active. Do not consider the window closed until the
   inactive grant and session cleanup are actually verified. Report failed or
   blocked cleanup explicitly; never claim a timestamp performed revocation.

## Validation and execution readiness

The exact SQL templates are exercised only in isolated disposable SQL contract
fixtures, never as hosted Auth mocks. Tests cover one-row success/no membership,
missing/AAL1/stale/expired/future/multiple sessions, mismatched identity/factor,
existing rows and tenant/private-grant drift, duplicate prevention, exact-UID
revocation, retained records and repeat/absent-row cleanup. Local fixture AAL2 is
not genuine hosted MFA evidence. Hosted activation, same-JWT denial after revoke
and authenticated Action B acceptance remain NOT RUN.

**Ready for exact-operation owner review. Not ready to execute until separate
approval, fresh genuine operator AAL2 and refreshed no-drift preflight.** Scanner,
private release-test/customer grants and deployment remain independent later gates.
No hosted write, account/MFA reset, company provisioning, communication, transaction,
Netlify deployment, live signature, outside access or merge occurred.

Local validation: `npm run check` PASS: 375 tests passed, nine native-only skips;
21 new isolated SQL contract cases passed. Lint, strict/generated types, unchanged
nine-migration checksum and build passed. Formatting/diff checks passed. No browser
UI changed; the existing 51-case browser suite was not rerun locally for this
operator-only preparation. Native PostgreSQL CI runs the same SQL cases independently.

References: [Supabase sign-out and JWT limits](https://supabase.com/docs/reference/javascript/auth-signout),
[verified claims](https://supabase.com/docs/reference/javascript/auth-getclaims),
[TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp).
