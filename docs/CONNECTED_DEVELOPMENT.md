# Connected development designation and action review

October16 update: the owner-approved nine-file migration bundle is now applied and
verified. Owner-confirmed dashboard Auth/API hardening is saved and verified: signup
OFF, exact internal redirects, public-only API schema and automatic exposure OFF. See DEVELOPMENT_MIGRATION_RESULT.md.
Earlier baseline/pending-action statements below are historical where superseded.

Owner decision recorded **October 15, 2026 (America/Chicago)**. The existing
contractor Supabase project is approved as **internal development**, paired with
the owner-designated protected Netlify staging site. This supersedes the earlier
requirement to create a separate staging Supabase project. Do not recreate, reset,
rename or replace these resources. No outside access or production launch is approved.

A **separate clean production database must be provisioned and independently
validated before outside access/launch**. Never promote, restore or copy the
synthetic development database into production. Rehearse the reviewed migrations
on clean infrastructure; production receives no development accounts/test grants,
synthetic customers/payroll, provider tokens or retained document bytes.

Exact supplied identifiers and the designation record are in ignored local
`.staging/connected-development-target.json`, not this public repository. Designation
approval is distinct from migration, configuration, account provisioning, test-write,
provider-call and deployment approval. Those actions remain pending review below.

## Read-only evidence

- Supabase identity/name match; healthy PostgreSQL 17.11. Zero application tables,
  migration entries, Auth users, sessions, MFA factors, buckets and objects.
- Dashboard shows no GitHub repository connected. Its branch label “PRODUCTION”
  is the provider's default-branch label, **not** this application's release status.
- Auth: email provider enabled, email confirmation on, public signup **on**;
  anonymous/manual linking off. TOTP enabled, maximum ten factors, AAL1 factor
  verification window limited to fifteen minutes; phone MFA off.
- Auth Site URL remains `http://localhost:3000`; no redirect allowlist configured.
- Data API enabled; exposed schema choices are public and graphql_public, private
  absent. Automatic exposure of new tables **on**; extra search path public/extensions,
  max rows1000. SQL role-setting lookup alone returned no override, so these values
  were verified in the dashboard rather than inferred from defaults.
- Netlify site identity/name match; connector reports **team login on all deploys**,
  not shared-password protection. Anonymous HTTPS returned404 without application
  content. This does not prove a deployed application/function/asset is protected:
  repeat actual perimeter tests on every URL after a separately approved deployment.
- No resource, protection, Auth setting, migration, identity, provider or deployment
  was modified. No secret values were retrieved. Auth SMTP/delivery configuration,
  detailed organization membership and post-migration advisors remain unverified.

## Concrete actions awaiting separate authorization

**A. Auth/API hardening.** Disable public signups; keep email confirmations on,
anonymous sign-in/manual linking off, TOTP enabled and SMS off. Configure only the
approved protected HTTPS site and exact required local/preview redirect origins,
without broad wildcards. Disable automatic table exposure; use committed explicit
grants/RLS. Keep private out of API exposure. Review default Auth mail behavior and
outbound sinks before creating accounts; never invoke signup/invite/magic-link mail
as a test. These settings were not changed during this audit.

**B. Development migrations.** Review MIGRATION_REVIEW.md and MIGRATION_BUNDLE.json;
authorize that exact nine-file digest and the owner-designated development project.
No new separate staging project is required. Apply only after action approval,
then verify history, RLS/grants/Storage, official types and hosted advisors. Never
run tests/database/bootstrap.sql on Supabase or repair history to hide drift.

**C. Internal identity/fixture setup.** After A/B, separately approve synthetic
verified Auth identities without outbound mail, real TOTP enrollment for privileged
operators, one private platform grant and checked three-company provisioning.
Distinct owner/estimator/supervisor/field/customer accounts remain controlled only
by internal engineers. Add reviewed expiring release-test grants and customer
links; staff cannot self-grant eligibility. Do not insert SQL Auth mock rows hosted.
Document workload grants separately from human/company roles; none exist by default.

**D. Protected application deploy.** Review the exact commit/artifact and a
nonproduction preview/branch-deploy action to the approved site. Keep team-login
protection on **all** deploys, aliases, assets and APIs; never make it public to
receive webhooks. No build/CLI auto-deployment is installed. The committed guard
still blocks Netlify production-context builds, including on a staging-named site;
provider “production context” and application production are different. If the
chosen initial deploy requires that context, review a narrowly site/commit-bound
internal build procedure first, without authorizing Release 1.0 launch.

**E. Connected acceptance.** Approve real Auth/MFA login sessions, read tests and
specific synthetic RPC writes. The current plan requires ten domain groups for
each company, including explicit portal, contract/invoice, synthetic payment and
sender configuration actions; worker/provider live tests remain separate. Fill a short-lived internal-development manifest,
independently verify target identity and use the development:* scripts. Older
staging:* commands/env names remain compatibility aliases. An empty forbidden-ref
list is allowed only for internal development with explicit separate-clean-production
policy; add the future production ref to the private denylist when provisioned.
Missing fixtures/schema/Auth cannot yield a passing report.

**F. Providers/documents.** Approve sandbox merchants/credentials, secure hosted
payment tokenization and an authoritative durable intent/reconciliation service
before any genuine gateway call. The new gateway adapters have synthetic transport
coverage only and are not wired to customer RPCs. Synthetic invoice consent does
not authorize a gateway transaction. Approve scanner, isolated worker, scoped object
transport/egress, AI model/data handling and spend before ingestion activation.
No credential or frontend flag can turn on the503 endpoint. No live payments,
external communications, payroll execution or outside access is authorized.

## Prepared internal workflow

`/preview/release` is a clearly synthetic in-memory laboratory. It supports all
three industry examples, staff/customer fixture perspectives, publish to portal and
internal sink, decisions, exact-document electronic test consent, immutable contract,
branded print invoice, proposed deposit/schedule, one-time synthetic authorization,
capture/refund and sales/tax/receivable reconciliation. It resets on reload and never
serves as connected fallback. Existing CRM/estimate/job/workforce screens are preserved.

`/internal-release` and `/portal/internal` use actual Supabase Auth and public
invoker RPCs. Access defaults off in private.release_environment and requires
expiring operator-managed per-organization test grants. Staff additionally need
current owner/admin estimating access and AAL2; customers need a verified identity
and an active exact customer link. There is no connected role switch. Customer
projection contains selling scope only, never supplier costs, markup or payroll.
Normal navigation and production Contracts/Invoices/Payments module controls remain
hidden/disabled. The laboratory is not a production customer portal.

The first new migration adds internal offer/decision/contract/signature/invoice/
authorization/payment/ledger/message records and unverified sender profiles. The
second adds durable worker leases and atomic checks for org/module/worker/source-
creator revocation, bounded attempts, approved scan/validator/model evidence and
schema-validated extraction. Original source stays quarantined until the private
clean object and extraction commit. Storage policies were not widened. Byte gateway,
scanner efficacy, resource isolation, cleanup/retention and genuine AI remain gates.

Accepted scope cannot be republished as another full-contract invoice after revision;
use a reviewed change-order conversion in subsequent work. Internal consent is not
production e-sign/legal validation. Provider-specific signature evidence, production
legal templates, credit-note/change-order invoice conversion, genuine payment/webhook
reconciliation and verified email-domain delivery remain Release 1.0 dependencies.

## Connected acceptance extension

Follow the three-company matrix in PHASE3A_STAGING.md using this approved development
target. Add owner and customer actual-session tests for release_contexts,
release_workspace and release_command: AAL1 staff denial, expired grants, foreign
customer links, all six tenant pairs, revoked mapping, expired/superseded offers,
explicit consent, exact signature hash, duplicate decision/contract/invoice,
concurrent captures/numbering, refunds and exact ledger/currency reconciliation.

Exercise the worker RPC with a **separately approved workload identity**, not a
staff/service-role browser client. Prove grant/creator/module revocation at CAS,
lease expiry, duplicate claims/publication, parser/provider rejection and failure
quarantine with actual Storage HTTP. Synthetic SQL object metadata fixtures prove
control contracts only, not actual uploaded file scanning or Storage integration.

Private evidence must include target/commit/digest, action approval, real Auth/TOTP
and HTTP results, advisor/type comparison, screenshots, provider engine/model and
merchant routing/reconciliation. No filled manifests, session JWTs, real supplier
files, worker pay or infrastructure exports belong in public CI/Git. Release 1.0
remains NOT READY until the full acceptance checklist and owner launch approval.
