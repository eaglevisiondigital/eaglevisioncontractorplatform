# Phase 2 validation record and deferred hosted gates

## Environment decisions

The existing Eagle Vision project and environment inventory were read through the
Supabase connector. There were no development branches for this application; other
projects were unrelated and were not repurposed. The supplied hosted reference is
intentionally omitted from this public repository. The user selected local-only
completion and deferred hosted validation. No project was created, no branch was
created and no hosted data or configuration was changed.

Native local PostgreSQL 17.11 was discovered after the initial Docker check. A new
cluster under a temporary directory was initialized with host authentication
rejected and `listen_addresses=''`. It served a local Unix socket only. Every test
suite created and removed its own synthetic database. The cluster was stopped
following validation. PGlite 0.5.10 runs PostgreSQL 18.6; both engines executed the
same migration files and Auth/Storage contract fixtures. Fixtures are never for
hosted Supabase. Generated types were identical on both catalogs.

## Evidence

| Check                                           | Result                    | Scope                                                      |
| ----------------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| Existing GitHub CI                              | Pass                      | Phase 1 inspected before edits                             |
| Lint / strict types / build                     | Pass                      | Application, functions and tests                           |
| Catalog types drift                             | Pass                      | Local migrated PostgreSQL 17 and PGlite catalogs           |
| Main test suite                                 | 66 pass                   | Includes 47 actual SQL/security tests                      |
| Native PostgreSQL 17.11 SQL suite               | 47 pass                   | Synthetic local databases; not HTTP services               |
| Desktop / tablet / mobile                       | 24 pass                   | Eight scenarios on each viewport                           |
| Automated accessibility                         | Pass on tested views      | axe WCAG A/AA; manual assistive-tech QA still needed       |
| Existing hosted security advisors               | No findings               | Empty public schema, not application policies              |
| Existing hosted performance advisors            | One informational finding | Auth absolute connection allocation; not changed           |
| Real Supabase Auth / TOTP / PostgREST / Storage | Deferred                  | Approved isolated environment unavailable by user decision |

The informational hosted finding recommends reviewing percentage-based Auth DB
connection allocation when scaling instance size. See the
[Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
It was recorded without modifying the existing project. No post-migration hosted
advisor result is claimed.

## Defects and risks addressed locally

- Replaced broad staff CRM access with explicit estimator/office-manager capability
  checks; field staff see only assigned inquiries. Module/company shutdown reaches
  SQL policies as well as the UI. Platform users retain aggregate/profile access,
  not customer/document access.
- Prevented direct assignment/status changes, CRM ID/timestamp spoofing, cross-
  customer location references, invalid logo references and tenant reassignment.
- Added MFA-checked provisioning/configuration, verified owner eligibility, last-
  owner protection, email-bound expiring invitation tokens (hash stored only),
  creator revocation checks, replay denial and consent provenance constraints.
- Added explicit private-table revocations and RLS, security-invoker public RPCs,
  empty-search-path private implementations and immutable platform audit.
- Public intake has server-controlled tenant resolution, capability-authenticated
  database writes, CAPTCHA hostname/action checks, bounded JSON bodies, durable
  rate limits and idempotency. Public contact matches never auto-merge CRM identity.
- Corrected auth refresh race handling, lost save confirmation, inaccessible low-
  contrast text and location updates falsely succeeding with zero affected rows.

## Required hosted acceptance run (not executed)

1. Identify and approve an isolated Supabase development environment. Keep all
   credentials/ref values in ignored configuration or approved secret management.
   Obtain environment-specific permission before applying migrations. Never reset
   or migrate the existing hosted project based on an assumption that it is empty.
2. Apply committed migrations to that isolated environment; inspect all API grants,
   RLS, private schema exposure and bucket privacy. Run security/performance advisors
   after migration and remediate findings. Export generated TypeScript types for
   comparison with the committed local catalog output.
3. Provision synthetic verified Auth users (no outbound emails), bootstrap one
   platform grant with reviewed operator tooling and enroll real TOTP factors.
   Provision three pilot organizations using the checked platform RPC/UI. Activate
   them and create distinct administrator, estimator, office and field memberships.
4. Authenticate through actual Supabase Auth. Exercise AAL1 denial/AAL2 success,
   wrong/expired tokens, customer accounts with no membership, invitation expiry,
   revoked creator/member and forged user_metadata. Repeat cross-tenant reads and
   writes over actual PostgREST, not only SQL SET ROLE.
5. Seed synthetic clean and quarantined document/object fixtures with approved
   operator tooling. Verify Storage HTTP denies anonymous/cross-tenant/quarantined
   reads and all client uploads/updates/deletes; clean authorized reads succeed.
   Verify logo rendering and clean-image-only assignment.
6. Configure approved Turnstile test settings and gateway hash in the isolated
   environment. Send synthetic requests for all three public company links through
   the actual Netlify-compatible function runtime. Verify correct CRM routing,
   consent, notification, idempotency, rate limits and contractor assignment. No
   external messages or attachments. Test provider failure and stale CAPTCHA.
7. Repeat desktop/tablet/mobile and manual keyboard/screen-reader review against
   connected data. Record exact results, advisor evidence and remaining findings
   before declaring Phase 2A hosted acceptance complete.

## Phase 3A continuation

The inventory was rechecked read-only; hosted acceptance is still not run. Follow
PHASE3A_STAGING.md for the approved isolated-target procedure and current tooling.
The owner now prohibits outside user access until full Production Release 1.0
acceptance/security and explicit launch approval. These phase records are internal
milestones only; see RELEASE_1_0_ACCEPTANCE.md.
