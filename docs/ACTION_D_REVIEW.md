# Propel Contractor Suite · Action D protected deployment review

**PREPARED / NOT DEPLOYED / EXECUTION NOT AUTHORIZED.** October 16, 2026.
Source application commit: `28c7d5e41c28c0714c41525179eb0637216a7729`, draft PR #1.
This package preserves existing functionality, branding and tenant authorization.
No production build, outside access, new grant or provider execution is approved.

## Exact review package

An isolated `git archive` export of the source commit was built with its exact
npm lockfile, Node 24.20.0 and only the designated development browser URL and
publishable key. Build policy used `CONTEXT=branch-deploy`,
`BRANCH=codex/phase-1-foundation` and
`EV_ISOLATED_STAGING_BUILD=approved-internal-only`. Production context remains
rejected, even with that flag. No app, SQL, function source or build-policy change.

The frozen package has **14 files**: eight frontend files, four function ZIPs,
function metadata and unchanged `netlify.toml`. The byte-for-byte owner logo is
included. All file sizes/SHA-256 hashes and tool/lock versions are in
[ACTION_D_ARTIFACTS.json](ACTION_D_ARTIFACTS.json).

- Local archive: ignored `.staging/action-d/propel-internal-28c7d5e.zip`.
- Archive SHA-256: `a902edbc4ae006da9a98094c745cb45789f97e1e18151dd2fd73aa9f6519eafb`.
- File-manifest SHA-256: `53dda494253a4bc56c1c4c4a89d225a2a5d3364017493b7820a838944d7e4d76`.
- Exact target-bound proposed operation: ignored `.staging/action-d/operation.private.json`.
- Operation file SHA-256: `2fed36e5d61f742e218cbd36de03b282e9f8cbbc9f51806513fa0238b04aacfc`.

The outer ZIP is a review/transfer container, **not a drag-and-drop static deploy**.
Only its eight `dist/` files plus the configuration become site files; four ZIPs
are uploaded as functions. Function metadata is not published as a static asset.
Keep built browser configuration, full target/callback details and private evidence
out of Git. A rebuilt package must be hashed and reviewed again; do not silently
replace it with HEAD or a plain local build that omits development configuration.

## Read-only infrastructure and security verification

At 09:54–10:04 UTC:

- Existing owner-designated Netlify identity matched. Dashboard independently shows
  production visibility **Private** and Deploy Preview visibility **Private**;
  connector reports team login required for **all** deploys, without a shared password.
- Dashboard repository is **Not linked**; zero site environment variables. No Git
  link, build hook, protection edit or deployment was made. A separate 12:40 UTC
  connector read found zero team-shared variables; no values were exported. Refresh
  both site/shared inventories before execution and stop on unexpected effective
  configuration, rather than assume these snapshots remain current.
- Supabase development identity/key accepted. Full Auth fingerprint excluding the
  separately approved leaked-password flag and complete API fingerprint match the
  reviewed baseline. Signup/anonymous access remain off, email confirmation and TOTP
  remain required/enabled, lower-AAL allowance off, API schema public-only.
  Leaked Password Protection remains enabled; security advisors: **0 ERROR / 0 WARN /
  12 INFO** for existing intentional default-deny private tables.
- Existing Site URL is on the protected primary host at `/internal-release`.
  Allowlist has exactly three URLs: protected primary `/portal/internal`, and the
  existing loopback `/internal-release` and `/portal/internal` routes. No wildcard.
  Exact URLs remain in ignored `auth-callbacks.private.json`. A new draft origin is
  not allowlisted. Existing password login/TOTP uses no redirect callback; OAuth,
  recovery, magic links and new redirect testing are excluded. Any required new
  exact redirect is a separate owner-approved setting change.
- Read-only SQL confirms 22 users, four verified TOTP factors, zero sessions, three
  companies, 63 RLS tables and zero private client table privileges. C1 inactive;
  release/worker grants zero; release environment disabled; contracts/invoices/
  payments disabled; locked payroll snapshots have `execution_enabled=false`.
  Storage has zero objects/public buckets. Original nine migrations unchanged.

Netlify metadata/dashboard settings establish configured protection, not proof of
protection around a deployed application. All deployed perimeter results remain
**NOT RUN**. Earlier anonymous 404 responses are inconclusive.

## Proposed exact Netlify action — await separate approval

Use the official **file-digest draft deploy API**, scoped to the privately verified
existing site. This is a manual nonproduction draft, with no primary-domain/alias
publish, server build, Git integration, site creation or site-setting update.

1. Refresh target/protection/effective environment and Supabase gate reads; verify
   source, archive, every file and exact operation hash. Review current provider
   notices and require internal operator supervision. Do not reuse evidence older
   than 24 hours without refresh. Authenticate Netlify through the approved existing
   operator flow; do not put its credential in argv, files, reports or Git.
2. After exact action authorization, POST `/api/v1/sites/{reviewed_site_id}/deploys`
   using the prepared body: `draft=true`, `async=false`, nine file SHA-1 digests,
   four function SHA-256 digests, exact `functions_config` and three deploy-specific
   Functions-scope values below. These API digests complement the SHA-256 review
   manifest. No creation request has been sent.
3. Require the response's site ID and draft status to match, no production context
   or `published_at`, and only expected file/function hashes in its required lists.
   Retain the returned deploy ID and HTTPS permalink privately. On timeout or an
   unknown result, inspect that operation before retrying; never blindly create a
   second deploy. Reject an unexpected site, publish, hash or runtime.
4. PUT only returned required site files to
   `/api/v1/deploys/{returned_id}/files/{reviewed_path}` and required function ZIPs
   to `/api/v1/deploys/{returned_id}/functions/{reviewed_name}` with explicit
   `runtime=nodejs24.x&invocation_mode=stream`. Preserve v2 bootstrap metadata,
   priorities and the material-import `/api/material-import` route. Read back ready
   state, function inventory/runtime/routes and site publication/protection settings.
5. Run the perimeter procedure before any connected Supabase login. Record actual
   responses and distinguish PASS/FAIL/BLOCKED/NOT RUN. On a mismatch, halt acceptance;
   do not relax protection or publish the draft to work around it. Escalate any
   necessary containment/settings action explicitly; do not delete/publish blindly.

Exact payload and function upload metadata are prepared privately. Local schema
validation used the official OpenAPI 2.60.0 definition. Netlify CLI 27.12.1 help and
source were inspected, and its @netlify/zip-it-and-ship-it 16.3.0 built the functions.
Its function manifest cache expires after two minutes and expired ZIP-only fallback
loses v2 route/runtime metadata. The proposed digest API explicitly supplies those
values and uploads the unchanged archives; **do not substitute an ordinary
`netlify deploy --no-build` using the stale cache**. This API proposal has not been
validated against a real deployment and is not execution permission.

| Setting                       | Exact proposed scope/value                                             | Current state / dependency                                          |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Site visibility               | Preserve Private/team-login on all deploys                             | Dashboard + connector verified; post-upload perimeter pending       |
| Browser URL / publishable key | Already baked into reviewed frontend; approved development target only | Accepted read-only; no service/provider key                         |
| `SUPABASE_URL`                | Deploy-specific Functions scope; same development URL                  | Prepared only; site has no variables                                |
| `SUPABASE_PUBLISHABLE_KEY`    | Deploy-specific Functions scope; same publishable key                  | Prepared only; no service-role client                               |
| `PUBLIC_INTAKE_ENABLED`       | Deploy-specific Functions scope, literal `false`                       | Prepared; no CAPTCHA/gateway secrets                                |
| Function runtime              | Explicit Node 24, streamed v2 wrappers                                 | Four portable ZIPs; actual hosted invocation pending                |
| Build context                 | Local reviewed branch-deploy guard; no remote build                    | Production-context guard unchanged/rejected                         |
| Auth callbacks                | Preserve exact existing three redirects and Site URL                   | Draft-origin callback changes not approved/needed for password/TOTP |
| Provider / worker credentials | None                                                                   | No payment, mail, signature, payroll, scanner or AI connection      |

Per-deploy variables do not become site-wide settings. Site and team-shared
inventories are both empty at review; provider-side injection and effective values
still need a fresh pre-execution review.
Do not expose secrets under `VITE_`; runtime variables are not supplied by
`netlify.toml` build environment values.

## Protected access and browser acceptance procedure

Private `perimeter-plan.private.json` enumerates **27 paths per host**, tested with
fresh cookie-free GET/HEAD and redirects disabled. Cover primary HTTPS, returned
immutable draft permalink, and every inventoried alias/custom domain/provider URL.
Include root/deep routes, actual hashed JS/CSS, exact logo, configuration path,
`/api/*` and `/.netlify/functions/*` for all four functions. Require Netlify denial
or login challenge and no app/asset/API bytes. A missing route or 404 alone does not
prove access control. Inspect redirect destinations before following them.

Then use only the owner's existing authorized Netlify team login, in a separate
browser context. Verify reviewed asset hashes/content and all four real functions;
unknown functions or API-to-SPA fallback are failures. No Supabase app session must
produce organization-context401; missing/invalid JWT, wrong company and revoked
membership must not return private data. With team access, disabled intake and
material ingestion must return503 for minimal requests without processing files.
Verify both friendly and direct function paths and server `no-store` behavior.
After owner-assisted Supabase login, prove that a valid app JWT without a Netlify
perimeter cookie still cannot load the protected functions.

Expected connected scenarios after deployment approval, with fresh genuine owner
MFA and existing synthetic fixtures, across desktop/tablet/mobile:

- Each of the three company owners: current identity/AAL2, correct tenant and
  independent branding; CRM/locations/requests, existing estimate snapshots/catalog,
  job baselines/purchases/projected profitability, time/labor and locked preparation
  totals agree with Action B evidence. Do not duplicate/issue/lock fixtures again.
- Estimator, supervisor, field employee and customer: role-specific data only;
  private rates/deductions hidden where unauthorized, own/assigned time scoping,
  six ordered foreign-tenant pairs denied, existing revoked accounts denied on
  refresh/navigation. No connected role picker or synthetic fallback.
- No platform administration with inactive C1; no organization membership from the
  Netlify login. Ordinary financial modules stay hidden/disabled; `/internal-release`
  and `/portal/internal` remain denied with current zero grants. Synthetic previews
  remain explicitly labeled and confer no authority.
- Refresh/deep links, keyboard accessibility, no horizontal overflow, session expiry,
  logout/cache clearing and company-switch stale-response protections. Keep passwords,
  TOTP screens and authenticated tokens out of screenshots/logs; sign out each actor
  and independently verify session cleanup after acceptance.

Protected deployed browser checks are **NOT RUN**. The earlier 723 Action B cases
remain API evidence, not deployed UI evidence. Scanner/positive Storage and private
internal-release positives remain **BLOCKED**; Action D must not activate their
missing grants, create files or execute signature/financial/message workflows.

## Local results, approval dependencies and continuity

- `npm run check`: **375 PASS, nine native-only skips**; lint/types/migration
  checksum/build passed. Native concurrency suite not rerun for this packaging task.
- `npm run test:browser` with an isolated local port: **51 PASS** desktop/tablet/mobile.
  These use synthetic regression data, not connected hosted sessions.
- Exact archived build guard: **4 PASS** allow/deny context cases.
- Extracted final function archives: **16 PASS / 0 FAIL**, zero outbound requests.
  No absolute symlinks/native binaries, and original logo/source/lock hashes match.
- Offline API schema, artifact/digest/runtime/route/environment checks: **26 PASS**.
- Formatting/diff/private-reference and unchanged migration-bundle checks PASS.
  No hosted migration, grant, fixture, Auth setting, deployment or execution changed.

Next required authorization: this exact target-bound manual draft upload, its
three deploy-specific runtime values and protected acceptance scope. Netlify operator
login/supervision and genuine human MFA are human dependencies; a new callback,
broader Action C grant, scanner/provider connection or outside access requires its
own review. Actual hosted runtime/perimeter behavior remains unverified until upload.
Keep PR #1 draft and Release 1.0 closed; production requires a separate clean database
and independent complete acceptance plus explicit launch authorization.

References: [Netlify deployment overview](https://docs.netlify.com/deploy/create-deploys/),
[official deploy/function API](https://open-api.netlify.com/),
[project visibility](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/).
