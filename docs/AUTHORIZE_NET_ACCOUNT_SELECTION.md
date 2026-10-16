# Authorize.Net sandbox account selection · read-only result

October16,2026 · base0ceac3e. **ACCOUNT AVAILABILITY / OWNERSHIP UNVERIFIED.**
Read-only inspection and preparation only; no account, credential, merchant binding,
provider capability or transaction was created. Release1.0 remains NOT READY /
NOT AUTHORIZED and PR#1 stays draft. This result supersedes the account-selection
next-step text in SANDBOX_ACTIVATION_READINESS.md, not its activation restrictions.

## Discovery evidence and limits

- Available browser-tab inventory contained no Authorize.Net merchant session.
- Two connected Gmail **message-ID-only** searches for provider sandbox/registration
  and account/welcome subjects returned zero results. No message bodies, attachments,
  login links, passwords or API credentials were fetched. This is one connected
  mailbox, not proof about every owner email/account.
- Opened the official `https://sandbox.authorize.net/` link. It redirected to
  `https://logintest.authorize.net/?cobrand=anet`, showing a login page. No field was
  filled, autofill requested, login submitted or recovery/account-creation link used.
  The sandbox login host is verified; **a merchant account is not**.
- Existing project readiness evidence records zero configured merchants. A private
  unconfigured/disabled candidate now references only the preserved synthetic
  property-services organization; no provider account identifier has been supplied.
- An attribute-only macOS Security query requested **no secret data**, with user
  interaction disabled, for two exact sandbox hosts and two prospective service
  labels. The final native metadata-only check returned OSStatus-25300 (item not
  found) for all four exact lookups. No secret was retrieved or item created. This
  does not enumerate every password label, iCloud/Apple Passwords entry or device.
  Earlier restricted queries returned-50 and were not treated as absence; final
  evidence comes from the reviewed native attribute-only helper. Keychain custody
  with actual provider credentials is still **NOT VERIFIED**.

The owner was asked whether an existing sandbox account is available and offered
manual sign-in on the opened sandbox page. Until authenticated non-secret account
metadata and ownership can be inspected, actual rails/features/profile/report/
webhook settings are **BLOCKED**, not PASS. No authenticated provider API was called.
No production account was visited, tested or placed into “Test Mode.”

## Owner steps and exact next boundary

If an account exists, owner manually signs in on the official sandbox page using
owner-held credentials/MFA; never paste credentials into this chat. Existing
approval then permits **read-only, non-secret account metadata/settings inspection**:
verify sandbox hostname, account/company identity/control, currency, available
services, report permissions and current webhook status. Save only minimal private
identity evidence, not screenshots of credentials or exported account data.

If no account exists, the owner must separately authorize creation (or create it
personally) using the [official sandbox registration](https://developer.authorize.net/hello_world/sandbox.html).
No registration/terms acceptance/recovery or credential generation is included in
current approval. An unknown account on another email must be identified by owner;
do not search other projects' secrets or try shared public demo credentials.

After selection: separate approval must name exact sandbox account/tenant and
credential custody/write mechanism before generating/retrieving/storing **any** key.
Do not select Generate/Submit/New Transaction Key/New Signature Key or revoke old
keys during inspection; regeneration can disrupt another integration. Provider
account creation, configuration, key custody, merchant binding, workload grants,
profile validation and transactions are distinct operations, never implied here.

## Provider support versus this account's status

| Area                | Documented sandbox preparation                                                                                                               | Actual selected-account result                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Card rail           | Sandbox card-network simulation; only official synthetic test data in future approved hosted form                                            | BLOCKED: no account/session; first planned rail card/USD only                                                                                  |
| eCheck / ACH        | Sandbox eCheck testing is documented; account entitlement and eligible rules need inspection                                                 | NOT RUN / not enabled or in initial test scope                                                                                                 |
| Hosted tokenization | Hosted Accept UI produces opaqueData for the current server capture adapter; sandbox script is `https://jstest.authorize.net/v3/AcceptUI.js` | BLOCKED: no public client key/account/origin or implemented checked ceremony/vault                                                             |
| Customer profiles   | Provider vault profiles and Accept Customer hosted management are available as API concepts                                                  | BLOCKED: actual account/CIM/profile permissions unknown; profile creation is a write and may perform validation/trigger merchant receipt email |
| Reporting           | Merchant details, transaction details/lists, unsettled transactions and settled batch/statistics APIs                                        | BLOCKED: no credentials read or reporting API call; no report permission/settlement result verified                                            |
| Refunds             | Refund references a settled transaction; current adapter additionally requires provider customer/payment profile references                  | BLOCKED: no capture/settlement/profile, separate refund authority required; no unrestricted credit/void scope                                  |
| Webhooks            | Sandbox REST webhook inventory and raw-body SHA512 HMAC verification; Signature Key required                                                 | BLOCKED: no inventory/keys accessed; callback not provisioned; no registration/ping permitted                                                  |

Sources: [sandbox testing/separate credentials](https://developer.authorize.net/hello_world/testing_guide.html),
[Accept UI](https://developer.authorize.net/api/reference/features/acceptjs.html),
[customer profiles](https://developer.authorize.net/api/reference/features/customer-profiles.html),
[reporting](https://developer.authorize.net/api/reference/features/transaction-reporting.html),
[refunds](https://developer.authorize.net/api/reference/features/payment-transactions.html),
[webhooks](https://developer.authorize.net/api/reference/features/webhooks.html).
These establish provider documentation only, not account entitlement or genuine tests.

The provider's sandbox **Live Mode** records simulated transactions; sandbox Test
Mode returns transaction ID0 and does not retain transactions. This naming does
not make a sandbox account production. Never switch any account mode under this
read-only approval. A production account in Test Mode is **not** acceptable sandbox
proof. Future acceptance needs the actual sandbox account/domain and distinct keys.

## Exact credentials and proposed custody

| Item                                       | Purpose                                                                         | Custody / exposure rule                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Merchant-interface username/password/MFA   | Owner account access                                                            | Owner password manager only; no API runner/browser automation retrieval                                               |
| API Login ID                               | Associates requests and Accept UI with the merchant                             | Keep its actual value private in reports; reviewed future browser config may need it with the public Client Key       |
| Transaction Key                            | Authenticates XML/JSON transaction/report requests and Webhooks REST management | Server-only secret; never VITE, argv, shell interpolation, clipboard, Git or logs                                     |
| Public Client Key                          | Hosted Accept UI tokenization, cannot authorize a payment by itself             | Future exact sandbox/merchant/origin config; not a replacement for server credentials/consent; no value retrieved now |
| Signature Key                              | Verify `X-ANET-Signature` HMAC-SHA512 over unmodified webhook bytes             | Separate server/receiver-only secret;128 hexadecimal characters; never browser/report                                 |
| CIM profile references / opaque nonce      | Provider-owned payment references                                               | Private tenant/customer/merchant/environment binding; nonce short-lived/one-use; no raw card data                     |
| Dedicated database credential + trusted CA | Restricted provider control command connection                                  | Separate workload identity/custody approval; no owner/service key in request APIs                                     |

Proposed macOS generic-password service **propel-sandbox-authorize-net**, account
**operator-straightedge-test**, consistent with the existing runner label grammar.
These are **reserved names in a plan**, not created Keychain entries. Scope metadata
must include tenant, future merchant-config UUID, provider and sandbox mode; actual
secrets use encrypted Keychain/approved server secret manager after separate approval.
Separate Signature Key custody from capture/report credentials; do not give a
webhook receiver a Transaction Key merely to verify signatures.

Future custody implementation must verify Keychain lock/access-control behavior,
refuse overwrite of an existing item, use a narrowly trusted executable/ACL without
“allow all applications,” and fail without secret fallback. Owner-driven secure
entry stays in process memory; no plaintext temporary JSON, shell argv/env, stdout,
exception diagnostics, terminal recording or report output. Never invoke `security
... -w`/`-g` under current approval. Attribute-only discovery is not a custody test.
For a later hosted service use scoped secret-manager versions and tenant/account
routing; installing runtime variables or service access is a separate hosted change.
No custody helper capable of retrieving provider keys was added in this increment.

## Endpoint isolation and tested properties

Current capture and refund adapters hardcode only
`https://apitest.authorize.net/xml/v1/request.api`, with redirects refused. There
is no configurable production endpoint or automatic sandbox-to-live fallback.
New synthetic tests inject production URL suggestions and redirect responses:
capture still selects the fixed sandbox URL; capture/refund redirects leave UNKNOWN
with no second request. Existing tests cover production-mode rejection before
reservation/call, tenant/merchant/token mismatch, exact minor-unit arithmetic,
expiry, immutable replay, refund bounds and raw-card field denial.

These are **local synthetic transports**. No real payment, provider tokenization,
redirect follow, account authentication or report query was executed. Production
isolation for a future network/runtime still needs approved egress/DNS/TLS/origin
policy and independent actual deployment acceptance; a forged credential label
alone never proves sandbox provenance. NMI has independent endpoints/keys/tokens.

Future non-transactional account-inspection API allowlist, only after credential
retrieval approval: exact sandbox XML `getMerchantDetailsRequest`; exact sandbox
REST GET `/rest/v1/webhooks` (optionally event types). No createTransactionRequest,
profile validation, webhook POST/ping/PATCH/DELETE, refunds or mode changes. The
merchant-details response can include a public client key, so the later inspection
must project only approved non-secret facts without logging raw payloads. No API
call is pre-authorized just because the method is listed here.

## Private merchant / independent customer authorization plan

Private `.staging/authorize-net-selection/merchant.proposed.private.json` contains
one **unconfigured**, disabled candidate for the existing Straight Edge synthetic
organization. Provider merchant reference is null; account ownership=false; all
capture/refund/tokenization/profile/report/webhook/ACH/recurring capabilities=false.
It is not executable SQL or a Supabase row and does not reuse the diagnostic S0
scope as a merchant. No other company receives this candidate or credentials.

After real account verification, bind one tenant+merchant+customer+invoice+accepted
scope+currency+exact selling amount+consent evidence+expiry+idempotency key. Genuine
Auth/session/customer authority, one-use CSRF ceremony, provider-hosted form and
atomic one-intent token vault are prerequisites. No laboratory consent or free-text
reference can authorize a gateway call. Accept Hosted processes the transaction
itself; do not double-capture it as an Accept UI nonce.

Proposed eventual capture123USD minor units and separately approved settled refund23
remain example test amounts, not execution approval. Refund must link the original
settled merchant/customer/invoice/transaction and remaining capacity. Reconcile net100
before separately reported fees. Preserve UNKNOWN holds/no automatic retries. No
schedule, surcharge, ACH, customer receipt email or profile validation is approved.

A later **distinct nonprivileged LOGIN** role needs only private USAGE + the exact
payment-control EXECUTE, one tenant/merchant/payment scope lease15minutes, explicit
provenance/amount authorizations and operator containment. No human membership,
platform/admin grant, direct table CRUD or shared email/agreement capability. Exact
reviewed credential/role/lease/grant/revocation SQL and supervised real-session proof
are still required; never execute the existing dormant S0 proposal as a payment role.
The worker cannot bootstrap its own merchant/consent. Installed schema remains
unchanged and no hosted provider gate was touched by this selection work.

## Results

- PASS: read-only discovery completed within available browser/mail scope; official
  sandbox login host observed; private disabled tenant proposal/custody plan prepared.
- PASS: local synthetic gateway/token/refund/webhook security tests; final counts below.
- BLOCKED: existing merchant availability, ownership, actual settings and actual Keychain
  credential custody validation; owner manual account identification/sign-in required.
- NOT RUN: key retrieval/generation/storage, account/configuration creation, API calls,
  profile validation, tokenization, transactions, merchant/database grants, Netlify
  actions, genuine provider acceptance or new hosted security tests.
- No password/key, card data, bearer session, real account identifier or correspondence
  is included in this public document. No customer communications or payroll action.

### Final local evidence

Full npm check:600 PASS /33 native-only skips, with lint/strict types/generated
catalog types/unchanged migration hashes/build PASS. Focused payment/refund/token/
webhook tests:76 PASS (included above), including3 new endpoint/redirect cases.
Responsive regression:51 desktop/tablet/mobile PASS. Frozen Action D package:
26 offline integrity checks PASS, no network. Formatting/diff/private-identifier
scan PASS. Native database result is recorded below after completion. These are
local synthetic tests, not provider account, Keychain secret-custody or genuine
payment acceptance. No application/migration/provider configuration code changed.

Native PostgreSQL17:271 database tests PASS/zero skips, including the33 cases
skipped by the local PGlite run; independent-connection expiry/concurrency tests
retain their real waits. Counts overlap. Disposable local roles/fixtures only;
no hosted SQL, role, provider call or schema mutation. No final executed test failure.
Private selection evidence/candidate is under ignored
`.staging/authorize-net-selection/`; no raw messages or Keychain secret bytes saved.
