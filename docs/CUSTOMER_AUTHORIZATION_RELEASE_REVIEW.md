# Customer authorization release preparation

October 18, 2026 · reviewed base `cd30969` · draft PR #1.
**GO for separate owner review of the local package. NO-GO for hosted execution or activation today.**

This report supersedes the proposal-only checkpoint in
[CUSTOMER_AUTHORIZATION_SECURITY_REVIEW.md](CUSTOMER_AUTHORIZATION_SECURITY_REVIEW.md).
The original README, thirteen historical migrations, approved Propel PNG, tenant
brands and frozen P1 operation/four artifacts remain unchanged. No hosted request,
credential retrieval, Auth session, MFA challenge, mapping, lease, feature, provider
or Netlify action occurred in this preparation. Hosted environment state was not
refreshed; historical hosted evidence must not be reported as a new verification.

## Findings and corrections

| Finding                                                                 | Reproduction and correction                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CUST-3: legacy report path bypassed new ban check                       | Native PG17 negative test against the reviewed proposal returned reports to a banned identity through `property_reports`. Forward replacement of `private.property_published_reports` now checks current confirmation, ban, deletion, anonymous status and staff separation before/after waits. Its existing ACL is preserved; no historical file changes. |
| CUST-4: publication replay could deadlock with a customer decision      | Native test blocked both callers on a mapping, then reproduced opposite version/access lock ordering. Immutable estimate parent now uses a shared lock, compatible with the decision's read lock. Native replay/decision interleaving completes without a deadlock.                                                                                        |
| CUST-5: concurrent identical publication could raise a uniqueness error | Native concurrent callers reached different uniqueness constraints. Target-free conflict handling followed by exact request/immutable payload comparison returns the same receipt for identical requests. Different requests/scopes never silently succeed; one publication/audit persists.                                                                |
| CUST-6: closed callback could initialize unrelated staff Auth           | The shared SDK was created unconditionally when public configuration existed. Module tests demonstrate closed customer routes do not construct it; ordinary staff composition remains. Reserved customer navigation also skips the staff session effect. Synthetic previews remain separate.                                                               |

The two original CUST-3/CUST-4 reproductions were recorded before corrections in
ignored private logs. CUST-5 was found by the expanded native suite. Earlier CUST-1
and CUST-2 tests remain. All reproduced issues concern local proposals/test
transports; no hosted exploit or genuine customer acceptance is claimed.

Current checks bind the signed caller UID/session, finite JWT expiry, current Auth
row, active company/mapping/feature, exact property/customer/version and optional
published report/finding/included-line provenance. Owner/admin publication requires
current AAL2. Customer access rejects active staff/platform identities. Authority
locks and final wall-clock checks make committed revocation/role changes effective
before a waiting operation completes. A revocation waiting behind an already
held authority lock linearizes later; it cannot erase information already read.

Issued estimates stay immutable. Publications select exact versions explicitly;
there is no auto-publish-all command. Nonfinancial approve/decline preferences are
immutable and receipt-backed. They do not approve contract execution, job changes,
invoices, receivables, payments, payroll or customer debt. Financial/private findings,
supplier costs and workforce data are excluded by the shared safe projection.
Free-text customer notes still require staff content review before publication.

## Formal pending migration and exact scope

`20261018144833_customer_authorization_release_readiness.sql` is one forward,
transactional local migration generated from the two corrected SQL sources.
[CUSTOMER_AUTHORIZATION_MIGRATION_REVIEW.json](CUSTOMER_AUTHORIZATION_MIGRATION_REVIEW.json)
is the exact dependency/file/bundle inventory; SHA-256 values below are copied from
that manifest. File SHA-256: `e3157e004c464fb2a4ab69e7a3a335a81d6bbbb0556d74234f3884f56d784ed1`.
Pending bundle SHA-256: `30e5f91b9e1148e6195b09f98988e132729a6708634caca48b3388fa96da25d2`.
Thirteen-file dependency bundle: `ef6151b4c111f3907205feff27b6f343e34d785e4364209ad7a9f85f2b4ff12d`.
Bundle definition is SHA256 of compact JSON `[{file,sha256}]`.
The checker also compares the formal SQL byte-for-byte with its source compiler.

- Two new private tables: `customer_estimate_access`, `customer_review_decisions`.
  Organization composite keys/FKs bind the existing customer/location/issued version,
  report/line/mapping and publication sources. No duplicate CRM/job/financial tables.
- RLS enabled; zero client policies, table grants or new execution grants, including
  `service_role`. Explicit revocations include PUBLIC. Private schema remains private.
- Eleven new public SECURITY INVOKER wrappers, fixed empty search paths. Private
  SECURITY DEFINER functions use qualified objects and no dynamic SQL. All new
  function execution is revoked from clients until separately approved.
- Indexed mapping/location/version/report/publisher/request access; request and
  current-publication uniqueness; immutable decision uniqueness and evidence/audit
  triggers. The manifest/default-catalog tests verify the actual resulting catalog.
- One existing private report implementation is hardened, preserving its ACL and
  signature. Every other existing function definition/ACL remains unchanged.
- Read/publishing/decision capability function returns **false** in the installed
  SQL; login status is false. No feature row, frontend flag or caller parameter can
  enable it. New execution grants alone cannot activate the workflows.
- No seeds, roles, accounts, grants, mappings, leases, provider bindings, Storage,
  Auth setting changes or business/financial writes. No data migration/backfill.
- Local lock timeout 2 seconds and statement timeout 30 seconds; avoid unbounded
  waits on existing function/catalog locks. One transaction rolls back on failure.

### Sequencing and target-specific gates

**Complete unchanged frozen P1 against thirteen installed migrations first.** Its
approved mandatory history guard expects thirteen. Installing customer migration
fourteen first would invalidate that gate. Do not change the P1 package, guard or
approval to work around ordering. P2 report fixture IDs stay unfrozen until genuine
P1 published-report evidence exists. Existing unchanged P1 approval remains valid.

After P1 evidence and a separate exact owner migration approval:

1. Bind the approved development target using the existing ignored target manifest;
   verify organization/project identity, all thirteen migration bytes/history,
   catalog/RLS/ACL/Auth/API/off controls and original records with refreshed evidence.
   Prepare expected P1 append-only record/revision deltas rather than requiring the
   pre-P1 baseline to be identical after authorized P1 work.
2. Verify this manifest and source/file/bundle hashes, pinned CLI 2.121.0, and no
   unexpected SQL, seeds or role files. Stop on drift, incomplete migration history,
   unexpected permission/capability or uncertain prior execution.
3. Proposed dry-run command: `node_modules/.bin/supabase db push --linked --dry-run --skip-vault`.
   Use the established approved Keychain-to-child-memory credential procedure; no
   password in arguments, persistent exports, logs or debug trace. Require exactly
   this one pending migration, no seed/role inclusion and exit 0. **NOT RUN here.**
4. Only after separate exact authorization and successful final preflight, proposed
   apply replaces `--dry-run` with no dry-run flag. No `--include-all`, role or seed
   options, reset, repair or automatic retry. **NOT AUTHORIZED / NOT RUN.**
5. Independently verify fourteen history entries, exact two-table definitions/RLS/
   FKs/indexes/triggers, all new function fixed paths/security/ACLs, existing ACLs,
   empty new tables, disabled capabilities, unchanged original records/settings,
   and security/performance advisors. Regenerate/compare types. No sign-in or
   mutation is implied by installation verification.

The exact proposed read-only post-install queries are in
[CUSTOMER_AUTHORIZATION_POSTINSTALL.sql](CUSTOMER_AUTHORIZATION_POSTINSTALL.sql);
compare their output with the reviewed disposable catalog and fresh private baseline.

If connection loss leaves application uncertain, record UNKNOWN and inspect history
and catalog read-only; never rerun blindly. On timeout/error stop, retain exact
provider diagnostics privately and seek narrowly scoped recovery only if needed.

### Containment rather than destructive rollback

Default deny and false capabilities already contain the unactivated schema. Do not
DROP tables/functions, delete decisions/audits, reset history or edit applied SQL.
If future activation has occurred, a separately reviewed exact forward containment
must disable customer reads/publishing/decisions/login, revoke only new caller
execution and close exercised sessions with verified session-local semantics.
Retain immutable evidence and original financial records. Broad global sign-out,
all-tenant grants or arbitrary maintenance endpoints are not approved containment.

## Dormant connected integration

`src/lib/customer-connected.ts` uses the pinned actual Supabase SDK with injected
synthetic transports for local protocol tests. It has no router, Auth sign-in,
refresh, persistence, key reader or sample fallback. The future approved Auth broker
must provide an existing token in memory. `getUser(explicitToken)` and checked
current-session RPC verify identity; request-specific clients bind that captured
token. Stale account/session responses are discarded. Both PostgREST and transport
retries are disabled, including HTTP500 responses. Fixed HTTPS origin/endpoints,
redirect rejection, byte limits and 8-second transport bounds fail closed.

Prepared adapters cover discovery, customer-safe report pages, issued review,
checked staff preview/publish/revoke/receipt and nonfinancial decision/context.
UNKNOWN writes stop and are reconciled read-only from publication/decision evidence;
no automatic replay or UI success from a lost response. In-memory duplicate guards
are not durable across a browser crash: immutable database request keys/receipts
provide cross-process duplicate protection. A future mounted UI needs durable
nonsecret request-ID custody/reconciliation before it can submit another attempt.

Logout freezes the exact caller token and requests Auth `scope=local`, followed by
checked same-session inactive evidence. It never selects a replacement account or
uses a service key. The SDK's `auth.admin.signOut(jwt,'local')` method name does not
confer authority: the only allowed request is normal `/auth/v1/logout?scope=local`
with the caller's JWT and a publishable API key. A lost logout response stays UNKNOWN
until read-only verification; no retry/global logout. Expired tokens/outage may
prevent verification and require a separately reviewed recovery mechanism. No
claim of actual hosted logout or independent-device recovery is made.

`server/customer/request-policy.ts` is an unregistered BFF policy: exact origin/
POST/JSON endpoints, constant-time CSRF binding, verified session-based atomic rate
budget, actual byte cap and deadline, and single-use bound PKCE callback validation.
It does not exchange a code, issue cookies, send messages or create a session.
Production nonce/rate backing store, reviewed Auth broker, secure HttpOnly/Secure/
SameSite custody/CSRF lifecycle, browser expiry recovery and independently verified
logout remain activation dependencies. No production authentication readiness claim.

## Acceptance and approval boundaries

See [CUSTOMER_AUTHORIZATION_RELEASE_VALIDATION.json](CUSTOMER_AUTHORIZATION_RELEASE_VALIDATION.json)
for exact fresh results: **988 application/PGlite passes (62 skips),393 native
PostgreSQL passes,77 local recovery passes and78 browser passes**. These suites
overlap;do not sum them. Lint,strict/generated types,build,format,migration and
frozen P1 integrity checks pass. An earlier browser run had one tablet timeout
while a parallel build replaced static files;the stable-build full rerun passed78.
See [CUSTOMER_AUTHORIZATION_APPROVAL_REGISTER.json](CUSTOMER_AUTHORIZATION_APPROVAL_REGISTER.json)
for independent approvals. Native PG17 uses disposable Auth claims/grants only;
PGlite/SDK mocks/browser synthetic journeys are not genuine Supabase acceptance.
No fresh hosted dry run, advisor, 713-row, 22-identity or four-factor check was made.
Hosted property tracking stays **0 PASS / 0 FAIL / 24 BLOCKED / 48 NOT RUN**; the nine
P2 customer groups remain BLOCKED. Media, signatures, gateways, communications,
payroll execution, protected deployment and independent recovery remain separate.

**Smallest next step:** owner reviews this exact local customer package; no hosted
write approval is needed to continue that review. Resolve maintained independent
recovery and supervised unchanged P1 first, then refresh the customer target-specific
migration preflight for a separate exact installation decision. Later grants,
capability changes, Auth broker, mappings/leases/fixture IDs and connected acceptance
need their own reviewed scope. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## SDK reference verification

Reviewed the pinned SDK source and official Supabase [session guidance](https://supabase.com/docs/guides/auth/sessions),
[sign-out scopes](https://supabase.com/docs/guides/auth/signout) and
[server authentication guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
Local protocol coverage does not certify actual hosted API behavior.
