# Development and environment setup

Use Node 24 and npm. From a fresh checkout:

```sh
npm ci
cp .env.example .env.local
npm run dev
npm run check
npm run format:check
npx playwright install chromium
npm run test:browser
```

No credentials are required for `/preview` or `/preview/super-admin`, unit tests,
SQL isolation tests or builds. Configure `.env.local` only for an explicitly
approved disposable Supabase environment. Never use a production key locally.

| Setting                       | Where                              | Purpose                                    |
| ----------------------------- | ---------------------------------- | ------------------------------------------ |
| VITE_SUPABASE_URL             | Local ignored env / Netlify Builds | Browser API endpoint                       |
| VITE_SUPABASE_PUBLISHABLE_KEY | Local ignored env / Netlify Builds | Public client identity; RLS still required |
| SUPABASE_URL                  | Netlify Functions runtime          | Server API endpoint                        |
| SUPABASE_PUBLISHABLE_KEY      | Netlify Functions runtime          | Caller-scoped API; no elevated key         |

VITE variables are bundled publicly. Never put service-role, secret keys or payment
credentials there. Netlify TOML build variables do not configure Functions runtime;
set runtime scope separately in the hosting UI. Keep preview and production
projects isolated and do not release sensitive variables to untrusted builds.

## Disposable Supabase verification (requires Docker)

The CLI is pinned as a development dependency. Discover commands using `npx
supabase --help` and command-specific help. Local config exposes only public schema,
disables public signup, uses explicit API grants and has no production project ref.
Use `npx supabase start` to start a local disposable stack. It applies local
migrations; do not link or push to any hosted project. The migration includes Storage
policies and requires the Supabase-managed auth/storage schemas. The npm SQL tests
apply the exact migration to in-memory PostgreSQL with contract fixtures; those
fixtures must never be applied to Supabase or production.

Before release, test real Auth sign-in/TOTP, AAL1 denial/AAL2 access, membership
revocation, PostgREST calls for both tenants, clean/quarantined Storage downloads,
anonymous denial and server function routing. Run the CLI database advisors (first
inspect `npx supabase db --help`) against the disposable environment and fix findings.
Hosted project resource creation and migration application require separate review.
No migration was applied to a hosted project during Phase 1.

## Provisioning and rollback

A reviewed operator creates test Auth users, organizations and initial memberships
using trusted tooling, with an audit trail; no production/customer seed is included.
Platform grants are separate reviewed private rows. Enroll/verify TOTP via the
sign-in screen, which elevates the session before privileged organization reads.
Merchant configuration is not provisioned by the frontend. Capture actor/change
approval for operator actions outside a request session; SQL auth.uid() is null for
such actions. Develop an attributed provisioning service in a later phase.

For a failed disposable migration, recreate only the disposable database and rerun;
do not run destructive resets on hosted projects. Production needs reviewed forward
migrations, backup/restore rehearsal and a separate rollback plan. No down migration
or automatic database deploy is included.

## Hosting readiness

A Netlify-compatible config is supplied; no site/deploy is created. Connecting Git
can trigger automatic production builds, so configure production deploy locking or
manual deployment controls before linking. Preview builds should use disposable
Supabase resources only. Configure HTTPS, Auth site/redirect URL allowlists,
short token lifetimes, MFA and provider email settings without sending actual
customer mail. Never enable production deploys from this draft PR implicitly.

## Test scope

`npm run check` runs lint, strict TypeScript, PostgreSQL RLS integration, protected
server HTTP client tests, Money invariants and production bundle generation.
`npm run test:browser` covers desktop/mobile navigation, tenant branding, surface
separation, overflow and axe WCAG checks. Browser mocks are not evidence of hosted
Supabase permissions; database tests exercise actual SQL policies. Full identity,
HTTP storage and payment integration awaits disposable infrastructure.

## Phase 2 operating paths and configuration (supersedes Phase 1-only setup above)

The existing Phase 1 code/migration is preserved. Provision companies and manage
memberships through the checked MFA-protected control-plane/team RPCs. Direct
operator SQL remains only for reviewed platform-grant bootstrap, Auth identity
provisioning and server gateway-hash registration. Invited accounts must already
exist and have verified email; no Auth invitation email is triggered. The `/join`
screen supports password sign-in, MFA and acceptance without leaving the token link.

Explore `/preview`, `/preview/super-admin` and
`/preview/intake/straight-edge` with synthetic details only. The public preview can
return to the contractor workspace without reload to demonstrate assignment. Preview
changes reset on reload and never populate connected mode. Actual public links use
`/intake/<company-slug>`; link from contractor websites. Iframe embedding is blocked.

Public submission remains disabled unless all server-only variables below are
configured for the approved isolated environment. Never point tests at production.

| Setting                  | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| PUBLIC_INTAKE_ENABLED    | Explicit `true` only after review; default false             |
| TURNSTILE_SITE_KEY       | Public widget key returned by the profile endpoint           |
| TURNSTILE_SECRET_KEY     | Server verification secret                                   |
| TURNSTILE_HOSTNAME       | Exact approved public application hostname                   |
| INTAKE_GATEWAY_KEY       | Independent random server capability, at least 32 characters |
| INTAKE_RATE_LIMIT_SECRET | Independent random HMAC key, at least 32 characters          |

Register only `sha256(convert_to(<gateway secret>, 'UTF8'))` in the private
`intake_gateway_keys` table using approved secret-aware operator tooling. Never
paste a secret into SQL checked into Git, shell history or public logs. Rotate by
registering a new hash, updating Functions runtime and retiring the old active key.
No gateway registration or hosting configuration was performed in this phase.
Publishing company intake settings exposes only the public profile; it does not
bypass server readiness. CAPTCHA test keys must be approved explicitly for test
hosting; there is no deployed bypass. In-app lead notifications are database records,
not outbound email/SMS. Monitor 403/429/503 and protected rate counters before release.

## Catalog-derived types

```sh
npm run types:generate
npm run types:check
```

The generator applies both migrations to a fresh disposable catalog and reflects
public tables/columns, enums and RPC arguments/results. Types are deterministic and
consumed by the Supabase client. Relationship joins are not generated; queries use
explicit tenant columns. CI fails on drift. Official hosted Supabase type generation
and schema comparison remain a separate acceptance gate. No hosted reference is
stored in this repo.

## Native PostgreSQL 17 local verification

A local PostgreSQL 17 installation was available even though Docker was not. To
reproduce using a **new temporary local cluster only**, with its binaries on PATH:

```sh
EV_PG_TEST_DIR=$(mktemp -d /tmp/ev-pg17-XXXXXX)
initdb -D "$EV_PG_TEST_DIR/data" --auth-local=trust --auth-host=reject -U ev_test
pg_ctl -D "$EV_PG_TEST_DIR/data" -l "$EV_PG_TEST_DIR/server.log" -o "-k $EV_PG_TEST_DIR -c listen_addresses='' -p 55477" start
psql -h "$EV_PG_TEST_DIR" -p 55477 -U ev_test -d postgres -v ON_ERROR_STOP=1 -c "create role anon nologin; create role authenticated nologin;"
EV_TEST_PG_SOCKET="$EV_PG_TEST_DIR" npm run types:check
EV_TEST_PG_SOCKET="$EV_PG_TEST_DIR" npx vitest run tests/database
pg_ctl -D "$EV_PG_TEST_DIR/data" stop
```

This uses only a temporary Unix socket, no TCP listener. The driver accepts a local
temporary socket only; it creates/removes independently named synthetic test
**databases**, never an existing application database. CI uses a fixed loopback
PostgreSQL 17 container with a synthetic-only password and a dedicated job flag.
The main job runs PGlite and the full 66-test suite; database17 repeats 47 SQL tests
and catalog drift checking. Native PostgreSQL provides database-major compatibility,
not real Supabase Auth/Storage/PostgREST services. See PHASE2_VALIDATION.md for the
user's local-only decision and pending hosted acceptance plan.

`npm run dev` serves the browser application only. The intake Functions are tested
through their Request/Response handlers locally. Connected end-to-end API checks
need an approved Netlify Functions development runtime or isolated preview hosting;
Vite's SPA fallback is not a Functions emulator. No runtime deployment is part of
this phase. CAPTCHA server checks follow the
[provider validation contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Internal staging preparation / Release 1.0

Read RELEASE_1_0_ACCEPTANCE.md, PHASE3A_STAGING.md and PHASE3A_WORKER.md before any
hosted action. `npm run staging:plan` is offline only. Keep filled manifests, short-
lived sessions, scenarios and evidence in ignored .staging/; never commit them.
`staging:validate` is offline; `staging:verify` makes real read-only Auth/PostgREST
calls only with explicit isolated-target approval/configuration. The additional
workflows mode needs separate synthetic-write approval and a reviewed complete case
plan. CI runs only offline plans/local tests and has no hosted deployment authority.
Netlify production builds are blocked; local npm build/browser tests still work.
No outside access or phase-specific production release is authorized.
