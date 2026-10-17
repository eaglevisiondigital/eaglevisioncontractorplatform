# Connected three-company acceptance · October 16, 2026

Latest implementation checkpoint: [P1 executor readiness](PROPERTY_P1_EXECUTOR_READINESS.md).
The executor and independent cleanup are now locally implemented/rehearsed; the older
missing-executor/preparation status below is historical. Frozen scope and existing
owner approval are unchanged. No hosted activation or Auth sign-in occurred;
0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN. Fresh genuine MFA and action-time preflight remain
required; P2/media/providers and Netlify stay separate.

Current execution checkpoint: owner authorization for the frozen P1 operation exists,
but mandatory preflight STOPPED before any hosted write or sign-in. See
[PROPERTY_P1_EXECUTION.md](PROPERTY_P1_EXECUTION.md). The connected executor and
independent cleanup channel are not operationally verified. Case totals remain
0 PASS /0 FAIL /24 BLOCKED /48 NOT RUN. Earlier preparation-only statements below
are historical; neither the frozen package nor scope has changed.

Current P0 checkpoint:[dormant connected schema installed](PROPERTY_P0_EXECUTION.md),
history13. Public invoker wrappers exist;property features,customer mappings and
report-only leases remain absent. No fixture/portal/provider/media activation or
new sessions were authorized. All72 property workflow cases remain NOT RUN.

**Status: Action A/C1 COMPLETE; C1 revoked; Action B core connected acceptance PASS.**
723 authenticated cases PASS/0 FAIL (687 core +36 supplemental), and 56 real GET-only
boundary checks PASS before/after populated fixtures. Nine source/Storage/private-
release groups BLOCKED; full 50-table, protected browser/deployment and independent
release acceptance NOT RUN. Release 1.0 NOT READY / NOT AUTHORIZED; PR #1 draft.
See ACTION_B_CONNECTED_RESULT.md for exact rows and evidence. Three companies,
18 memberships and the immutable domain fixtures now exist; all sessions are closed.
Do not recreate companies/accounts/factors, reactivate C1 or replay fixture creation.
Baseline sections below record their historical observations, not current totals.

## Independently verified baseline

At starting commit0df0fc9: project healthy, users0/organizations0. Auth public
settings endpoint independently returns disable_signup=true, email enabled and
phone disabled. Reloaded dashboard confirms email confirmation ON, anonymous/manual
linking OFF, TOTP enabled, maximum10 factors,15-minute AAL1 factor limit ON, SMS MFA
OFF. Site URL is protected HTTPS /internal-release; exactly three redirects remain
(protected /portal/internal and loopback127.0.0.1:4173 internal/portal paths), no
wildcards. Data API public only, automatic exposure OFF; private/graphql_public
excluded. No setting was changed during this phase.

Current grant inspection: authenticated SELECT51 and three scoped CRM/intake
DELETE grants; no anonymous table privileges or private client table grants;
no current client TRUNCATE privilege or public-schema PUBLIC EXECUTE grant. Netlify
metadata still reports team-login protection on ALL deploys. This is metadata,
not proof of a deployed app perimeter.

`development:preflight` uses ONLY GET and a publishable key, target/expiry/read-action
reference supplied from an ignored file. Real result: **56 PASS /0 FAIL**:

| Read-only evidence                                    | Count | Result                                                 |
| ----------------------------------------------------- | ----: | ------------------------------------------------------ |
| Auth signup/email/phone settings                      |     2 | PASS                                                   |
| Anonymous SELECT permission denial on50 tenant tables |    50 | PASS (401/403 and42501 required)                       |
| Excluded private/graphql_public PostgREST profiles    |     2 | PASS (406/PGRST106 required)                           |
| Anonymous Storage bucket listing                      |     1 | PASS,200/empty while catalog contains3 private buckets |
| Anonymous internal release-context RPC                |     1 | PASS (permission denied)                               |

A server error, wrong error code or empty successful table query is NOT accepted
as denial. Bucket listing is only a non-disclosure check: object read/upload/signed
URL/cross-company Storage acceptance is still NOT RUN. Responses, keys and any
unexpected disclosed data are never emitted in reports. Private evidence:
`.staging/acceptance-preflight-result.json` and private read target. The script has
no login, account/admin API, SQL, upload or mutation mode.

## Action A — COMPLETE: identities and genuine owner-assisted TOTP

Exactly 22 confirmed synthetic identities remain unchanged. All four designated
privileged accounts completed genuine owner-assisted TOTP, real AAL2 and fresh
confirmed-identity verification. Hosted SQL independently confirms four verified
factors, no pending factors and zero remaining sessions. No companies, memberships
or private grants exist. See ACTION_A_RESULT.md. Do not recreate/reset identities
or re-enroll completed factors. Later login uses the existing owner-held factor.
The procedure below records the completed authorized scope; it is not permission
to rerun enrollment or proceed to Actions B/C/D.
The approved scope is:
**22 synthetic Auth identities**, all internal-engineer operated. Per company:
owner, estimator, assigned-team supervisor, assigned field worker, unassigned field
worker, staff-to-be-revoked, customer (7 × 3 = 21); plus one platform-only operator.
`npm run development:acceptance-plan` prints the offline alias roster only. It does
not create emails, passwords, UUIDs, factors, sessions or authority.

- Use unique non-deliverable .test emails and unique random passwords in approved
  secret management, never Git/CI/screenshots/command arguments. Check no existing
  matching identities; stop on ambiguity rather than replace/delete accounts.
- Use the approved server-side Auth Admin createUser API with email_confirm=true,
  NOT signup/invite/magic-link/reset mail. Admin credentials must be separately
  supplied through approved operator secret management. The Action A attempt used
  the official CLI credential in memory only; no admin key was persisted.
  Never insert mock auth.users rows or mutate metadata to confer application roles.
- These accounts have NO company/platform/release/workload grants at creation.
  Creating them does not authorize provisioning companies or granting access.
- Genuine password login with publishable client; use the existing local Mfa
  component: listFactors → enroll(factorType:totp) if needed → human scans QR into
  an independent authenticator → challengeAndVerify with its current code.
- Enroll at least the three owners and platform operator. Preserve pre-MFA AAL1
  denial evidence; use the server-returned AAL2 token only after successful verify.
  Fresh getUser must match the intended distinct UID and confirmed nonanonymous
  identity. Never synthesize claims, import mocked factors, hardcode OTPs, or store
  QR/TOTP seeds in evidence. QR screens must not be captured/uploaded to CI.
- Record only private alias→UID/factor status/expiry/evidence references. Sessions
  are short lived, stay local and never enter public artifacts. Do not weaken
  signup, redirect, MFA or email restrictions for this operation.

References: [Auth admin creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp).

## Action B — core connected acceptance PASS; dependent groups BLOCKED

The separately approved C1 platform setup was completed/revoked, then genuine
company-owner MFA and ordinary employee/customer sessions drove checked invitations
and domain fixtures. Results: 723 authenticated PASS/0 FAIL; nine blocked groups.
All sessions were closed and original identities/factors/migrations/grants verified.
Do not repeat company setup or creation scenarios. Existing private fixture mapping
must anchor follow-up acceptance; see ACTION_B_RESULT.md and
ACTION_B_CONNECTED_RESULT.md. No broader release/worker grant or deployment is
implied. The scope/procedures below preserve the original approval and future
coverage requirements; they are not instructions to duplicate completed rows.

The approved fixture scope is exactly three synthetic companies: Straight Edge Property
Services / property_services, Cunningham Construction / construction, Sample Roofing
Contractor / roofing. Use collision-resistant internal slugs. Scope the approval to
checked provisioning/configuration/member/invitation RPCs and synthetic CRM,
estimate, job, workforce/payroll-preparation and internal release test writes.
No live delivery, agreements, provider payments or payroll execution.
The latest Action B approval also excludes signature execution, company email,
live ingestion and any Actions C/D operation. The extended internal-release
scenario below is a future evidence plan, not approval to execute signatures or
create private grants. Follow the narrower current owner restrictions.

Platform operator AAL2 uses provision_company/configure_company with each intended
owner UID. Owner creates in-app invitations for verified existing staff; each staff
identity accepts its own token without outbound email. Use staff/estimator,
staff/office_manager (assigned supervisor), staff/field_staff; the customer gets no
staff membership. Audit actual assigned permissions rather than assume the alias
or a selected UI role grants access. Use manage_member to revoke the designated
staff account and prove its already-issued JWT loses access immediately.

Per company prepare duplicate-looking synthetic customer/product/supplier names to
catch shared-cache lookup bugs, two customers/locations and jobs as needed for
assigned/unassigned tests, versioned issued estimate/job baseline, expenses/credits,
weekly multi-job time/breaks, rates and locked payroll preparation, customer-safe
internal scope/decision/contract/test-signature/invoice/synthetic ledger. Record
actual IDs and money/hour expectations in the private scenario file; never trust
just a2xx. Verify totals, state/version, immutable/audit effects and denied mutations.

Source-document positives require approved provenance/worker/object fixtures. The
full50-table harness REQUIRES real same-company positives and fails if they are
missing. It must not be reported passing with empty tables or skipped imports.
Synthetic operator Storage fixtures can test access independently with separate
write approval; they do not certify malware scanning. Do not label real files clean
through SQL, enable ingestion503, weaken Storage or use fixture scanner verdicts as
production evidence. Scanner/byte gateway/AI/isolated worker remain unprovisioned.

## Action C — C1 execution authorized; broader grants NOT AUTHORIZED

C1 is complete: three checked company setups, then exact immediate deactivation,
same-AAL2 denial and global sign-out were independently verified. The platform
row remains inactive and must not be reactivated/recreated. See
ACTION_C1_EXECUTION.md. Broader release/environment/worker grants below remain
outside C1 and unapproved. Current company-owner Action B MFA handoff and executed
core cases are recorded in ACTION_B_CONNECTED_RESULT.md; do not count local
contract evidence as connected acceptance.

Separately review exact UIDs/org IDs, purpose and expiry before these writes:

- One private platform_admins grant for the platform-only operator; no company
  membership. The current schema uses active revocation, not native grant expiry:
  record an operator-enforced expiry and revoke at the end of the approved window.
- private.release_environment internal-development with an approval reference;
  six expiring release_test_users grants (three owners/staff actors, three linked
  customers), exact company scope, at most one working day. Link each customer only
  to that company's synthetic customer record through the checked command.
- No material-worker grant unless its runtime/scanner/model/object scope is itself
  reviewed; no service-role browser or generic worker bypass. No financial module
  enablement. End-of-window cleanup disables release environment, removes/revokes
  test grants, revokes platform access and sessions, preserving immutable records.

## Connected evidence matrix — core results below; full matrix incomplete

| Area                    | Positive evidence                                                                | Required negative evidence                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Auth/MFA/roles          | 22 distinct verified users;4 genuine TOTP/AAL2 sessions                          | AAL1 privileged denial; platform-only has no business rows; role aliases/metadata confer nothing                |
| Table isolation         | Same-company positive in every50-table scope, each company                       | Six ordered tenant pairs; foreign IDs; no vacuous empty-table success                                           |
| CRM/intake              | Correct company customer/location/notes/consent and assigned intake              | Foreign customer/location; estimator/field limits; revoked membership; intake gateway stays gated               |
| Estimates/import        | Draft/save/issue/revise and private costs/customer-safe price                    | Stale version, foreign provenance, duplicate apply; imports blocked until approved processing positives         |
| Job costs               | Original immutable baseline, approved expense/credit/CO, exact projection        | Duplicate purchase/over-credit, concurrent updates; proposed additions never authorize billing                  |
| Time/labor/payroll prep | Own/assigned-team time, switches/breaks/week totals, one labor posting           | Overlap/DST/cross-job overtime, unassigned supervisor, private rates/deductions, locked period/corrections      |
| Internal customer       | Exact linked offer, consent/hash/version, immutable test contract/invoice        | Foreign/revoked/expired link/grant; private costs/payroll absent; no real execution                             |
| Storage                 | Own approved private fixture reads and valid short-lived issuance after approval | Six foreign pairs, quarantine denied, client upload/overwrite denied, expired signed links, public paths denied |
| Revocation              | Use an actual pre-revocation session before and after owner RPC                  | Membership/org/module/customer/test-grant revocation without waiting for JWT expiry                             |
| Audit/reconciliation    | Expected immutable events and balanced money/hour totals                         | Mutation/deletion denied; no PII/token/secret copied into logs                                                  |

`development:verify` performs real getUser/AAL2 and nonempty table controls;
`development:workflows` requires all ten groups for all three companies and explicit
read/write approvals. They do not cover all role/Storage/browser cases themselves.
Record each case PASS/FAIL/BLOCKED/NOT RUN and evidence hash; run core cases in
stages, but do not call a partial matrix full acceptance. A functional deny with an
unexpected error code, a5xx or unavailable worker is a failure/blocker, not PASS.

## Action D — owner-authorized attempt; provider blocked

October 16 execution: approval received; one manual preview created and four exact
function ZIPs uploaded. Same-ID identical-manifest finalization returned HTTP500;
provider remains uploading. See ACTION_D_EXECUTION.md before any action; no second
creation/rebuild/publish or settings change is implied. Runtime perimeter BLOCKED
and connected browser/MFA NOT RUN. Earlier preparation-only statements below are
historical; the frozen artifact and operation hashes remain unchanged.

October 16 preparation is now complete. See ACTION_D_REVIEW.md and
ACTION_D_ARTIFACTS.json for exact 28c7d5e build/file hashes, private target-bound
operation hash, proposed digest API draft upload and 27-path-per-host perimeter
plan. Four Node24 functions are packaged/tested with explicit v2 metadata; ordinary
CLI no-build/stale-cache upload is not equivalent. Dashboard Private visibility,
unlinked Git/site environment and saved Supabase gates were reverified. No deploy,
settings, grant or session changed. Exact upload/runtime-variable/acceptance approval
remains required; the older preparation outline below is preserved for context.

Review the exact next commit/build artifact and approved site privately. Keep the
current production-context build rejection. Do NOT connect Git auto-deployment,
create a site, change visitor protection, authorize prod-context build or use --prod.
A reviewed branch-deploy or manual draft upload may be proposed after checking the
installed Netlify CLI help and confirming it does not publish to the primary domain.

Build in an isolated workspace with CONTEXT=branch-deploy, the reviewed codex/ branch
and EV_ISOLATED_STAGING_BUILD=approved-internal-only. Supply only VITE_SUPABASE_URL /
VITE_SUPABASE_PUBLISHABLE_KEY for this development target at build time; no service
key, pay/AI/mail credentials or fixture secrets. Keep runtime intake/ingestion gates
closed. Package dist plus all configured Netlify functions; static-only upload does
not establish API acceptance. Record file hashes and target before upload approval.
The local build flag is not deployment authorization.

Netlify team-login and Supabase app Auth are separate sessions. After approved
upload, test fresh anonymous requests to primary/draft/alias URLs, deep routes,
actual JS/CSS/image assets, /api/* and /.netlify/functions/* with redirects disabled.
Require access denial/login challenge with no app/API bytes;404 before deployment
is NOT successful perimeter proof. Then authorized team login must load the reviewed
app and actual functions, followed by actual Supabase role sessions. Never remove
protection to receive webhooks. Any necessary new exact Auth callback URL needs a
separate settings review; no wildcard preview redirects. Deployment and approval
remain blocked until exact artifact/site/action authorization.

## Default-privilege proposal — independent review

**Not necessary for today's existing-schema acceptance; advisable defense in depth
before future schema changes.** Current objects have explicit reviewed ACLs; no
current anonymous/private-table/PUBLIC-function/client-TRUNCATE exposure was found.
The dashboard setting removed future postgres DML/default EXECUTE grants to named
API roles but retained other defaults. No global function ACL override means the
PostgreSQL built-in PUBLIC EXECUTE default still matters for newly created functions.
Every committed function already explicitly revokes PUBLIC/anon as required.

Residual future table TRUNCATE/REFERENCES/TRIGGER/MAINTAIN and sequence UPDATE could
matter to future SQL-capable roles or new RPCs even though PostgREST does not expose
these operations directly. Provider-managed supabase_admin defaults are a separate
ownership boundary. Do not bulk-revoke service_role or provider-managed owner
privileges without verifying dependencies. Never revoke existing reviewed RPC
access to silence a default-ACL concern.

Recommend a separately reviewed, local-tested forward configuration/migration for
postgres-owned FUTURE objects only, with explicit grants for intended new objects;
verify global function-default behavior, object ownership and no current ACL changes.
Do not apply any SQL now: the earlier broad cleanup was rejected and this task
requests review only. This is not a reason to change the saved Auth/API settings.

Primary reference for the privilege review:
[PostgreSQL ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).
Defaults apply to future objects, not existing ones; schema-specific revokes cannot
remove global PUBLIC function defaults. This is why a narrow ownership-aware review
is preferable to changing every role or relying on the dashboard toggle alone.

## Latest executed coverage (October 16)

Core Auth/MFA, CRM/estimates/jobs/time/labor/payroll, roles, revocation, immutable
audit and paired concurrency now have genuine hosted evidence. All six tenant
pairs passed populated reads on 23 core table types plus supplemental staff
boundaries for organizations/memberships/modules/workforce policies. Actual
723 PASS/0 FAIL does not satisfy the missing source/private-release/positive-object
rows or independent deployed browser/perimeter testing. See the complete result
record before continuing; do not weaken the full harness to manufacture success.
