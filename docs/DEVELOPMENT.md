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
