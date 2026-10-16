# Current build state · October 16, 2026 · approved development migrations applied

## Governing release policy and latest internal milestone

Latest: the owner-approved nine-file bundle was applied to the verified internal
development target after commit/checksum/drift/CLI dry-run verification. All nine
versions match;51 public and12 private tables have RLS; private buckets/grants and
default-off release gates verified. Official hosted types match after documented
RPC generator convention normalization. No Auth users or companies were created.
Auth/API hardening saves await additional automatic-review confirmation. See
docs/DEVELOPMENT_MIGRATION_RESULT.md for exact versions, advisor findings and gates.
The earlier pre-migration statements below are historical and superseded here.

**Production Release 1.0: NOT READY / NOT AUTHORIZED.** Phases 1, 2, 3 and 3A are
internal engineering milestones only. No outside contractor, employee or customer
may receive access before the complete Release 1.0 workflow is substantially
complete, tested, secure and explicitly approved for launch. No phase completion,
CI pass, target manifest or staging approval authorizes external access or launch.
See docs/RELEASE_1_0_ACCEPTANCE.md for every required module's implementation,
hosted evidence, security, third-party dependencies and launch status.

The owner now approves the EXISTING contractor Supabase project as internal
DEVELOPMENT. A separate staging DB is no longer required. This supersedes the older
“existing project not approved” statements in historical validation records. Exact
project/site IDs are in ignored .staging/connected-development-target.json. Before
outside access/launch, provision and independently validate a SEPARATE CLEAN
production database. Never promote or restore this synthetic development DB into it.

Read-only identity/settings review confirmed healthy PostgreSQL17.11 and zero
application tables, migrations, Auth users/sessions/MFA factors, buckets and objects.
TOTP is enabled; public signup and automatic table exposure remain ON, with default
localhost:3000 Auth URL and no redirect allowlist. These need reviewed hardening.
Netlify reports team-login protection on ALL deploys; current anonymous HTTPS404
contains no app, so deployed perimeter/API protection is not yet proven. No hosted
settings/data, migration, account, provider or deployment was changed.

New default-off internal Release 1.0 workflow: customer-safe immutable offers,
accept/decline/change decisions, contracts and exact-document typed test signatures,
branded print invoices, proposed deposits/schedules, explicit one-time synthetic
payment authorization, idempotent captures/refunds and sales/tax/receivable ledger.
Tenant email configuration stays unverified; delivery uses an INTERNAL SINK only.
Normal Contracts/Invoices/Payments navigation and production switches remain disabled.

/preview/release demonstrates all three industries with explicit synthetic actor
controls. /internal-release and /portal/internal use actual Auth/RPCs, expiring
operator grants, current owner/admin AAL2 or exact verified customer links. Connected
roles are server-selected. No synthetic fallback, private cost/payroll projection,
external email, real agreement or provider transaction is enabled. Accepted scope
cannot be revised and republished as duplicate full-contract billing; change-order
invoice conversion remains future reviewed work.

Added sandbox-only Authorize.Net/NMI token adapters with fixed test endpoints,
exact USD decimal serialization, tenant/merchant/authorization binding, idempotency
store contract and UNKNOWN outcomes without automatic retry. No actual provider call,
credential, tokenization UI or authoritative provider intent-store integration exists;
synthetic invoice consent cannot authorize a gateway call.

Added private durable document jobs/workload grants, fenced expiring claims,
revocation-locked CAS, bounded retries, strict extraction schema and a Supabase
processing-store adapter. Real secure byte gateway, isolated worker deployment,
scanner/AI validation and retention/orphan cleanup remain gates. Ingestion stays503,
Storage writes stay denied and no real scan/extraction success is simulated.

**Nine migrations await separate execution approval**, including the first seven
preserved files and two new internal-workflow/worker-control files. See
MIGRATION_REVIEW.md / MIGRATION_BUNDLE.json, development:plan and migrations:check.
No hosted migration/deploy is authorized by designation alone. See
CONNECTED_DEVELOPMENT.md for precise Auth/API hardening, identity/TOTP/fixture,
protected deploy and connected acceptance actions. The full Release 1.0 checklist
remains NOT READY: legal/signature-provider, genuine sandbox payments/webhooks,
verified sender delivery, full connected acceptance and clean production are pending.

Sandbox follow-up: immutable configuration/request snapshots now preserve the
validated tenant, merchant, amount and token across reservation waits. Canonical
digests, post-reservation expiry checks and invalid replay/reservation rejection
are covered by eleven new tests. No SQL or hosted configuration changed.

Latest local evidence is recorded in docs/CONNECTED_VALIDATION.md; Phase 3A counts
are historical. Read
**docs/PHASE3A_STAGING.md** for the exact next isolated actions/approvals and recovery
procedure. Keep the existing feature branch and draft PR #1. The Phase 3 implementation
record below remains valid; its validation counts are historical.

## Review boundary and session continuity

Continue `codex/phase-1-foundation` and [draft PR #1](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/pull/1).
The repository is PUBLIC. Preserve the original README and existing Phase 1/2
architecture/features. No merge, production deployment, hosted migration, live
charge, external customer delivery/real-agreement signature, payroll execution or actual customer message
is authorized or has been performed. Never commit credentials, real worker pay,
customer documents, hosted project identifiers or sensitive infrastructure exports.

The earlier local-only decision is superseded by the approved internal development
designation. Hosted action approvals remain pending; nothing hosted was written.
Local tests use PGlite and an independent disposable PostgreSQL 17.11 cluster with
TCP disabled. Actual Supabase Auth/TOTP/PostgREST/Storage acceptance and hosted
advisors remain unverified. See docs/PHASE2_VALIDATION.md for that pending gate.

The active Phase 3 scope includes the original professional estimating request and
all additions: Smart Material Import; Job Cost Tracking & Profitability; Workforce
Time Tracking, Labor Costing & Payroll Preparation. These extend the shared platform
for independent contractors, including Straight Edge, Cunningham and roofing firms.

## Implemented

- Preserved company/platform shells, tenant branding, provisioning/configuration,
  role/MFA and membership revocation, invitations, CRM/locations/notes/consents,
  public intake CAPTCHA/gateway gates and in-app request review/assignment.
- Professional estimating: company catalog and templates, material/product/labor/
  service/allowance lines, exact quantity/currency arithmetic, cost/markup/explicit
  selling price, exclusive options/add-ons, discounts, tax references, dates,
  private/customer notes, terms, clean attachments and reconciled schedule proposals.
  Numbered drafts use optimistic saves; duplicate/revision/archive/history and
  internal issuance preserve immutable snapshots. Branded customer preview is an
  allowlist excluding private supplier/pricing/workforce information.
- Smart Material Import: multiple supplier/source records, editable canonical rows
  with literal extraction evidence, SKU/date/quantity/unit/cost, confidence, source
  references, independent arithmetic and warnings. Explicit review/acknowledgement,
  line/supplier/company pricing overrides and persistent company defaults. Approved
  itemized or lump-sum scope retains private cost/provenance. Atomic approval/apply
  and source validation prevent stale or forged financial scope.
- Secure source architecture: private quarantine/clean buckets, no client uploads
  or quarantine reads, SHA-256/object-path checks, scanner/validator/provider/store
  contracts, HTTPS extraction gateway, real bounded image/PDF validation and literal
  CSV parser/template. Synthetic fixtures are labeled; live ingestion returns 503.
- Jobs: immutable original issued-estimate baseline, original/authorized revenue
  and costs, commitments/paid expenses/credits, pending management review, supplier
  duplicate references, receipt source digest/row guards, manual purchase matching,
  variance warnings, remaining forecasts, thresholds and projected contribution.
  Approved customer changes require management-attested authorization; proposals
  never raise billing. Approved changes add their expected cost to the forecast.
- Workforce: company worker classifications and time/invoice/imputed costing,
  immutable effective rates, reviewed timezone/workweek policy and approved overhead.
  Mobile clock-in/out, paid/unpaid breaks, atomic job/task switching, manual entries,
  own/assigned-team visibility, supervisors, submission/review, immutable corrections
  and audited manager recovery for missed clock-outs.
- Labor and payroll preparation: exact elapsed time/DST, weekly overtime across all
  jobs/overhead, separate cash/burden/imputed/estimated/billing amounts, weekly salary
  allocation, manual deduction inputs, CSV exports, immutable locked periods and
  later financial adjustments. Only locked preparation posts job labor once;
  invoice-costed contractors cannot also produce time cash fees. Payroll rates and
  deductions are restricted; job dashboards receive aggregates.
- Four unapplied Phase 3 migrations; regenerated typed tables/RPCs; lazy-loaded
  operational UI; expanded local SQL, arithmetic, parser, pipeline, repository and
  responsive browser coverage. CI includes native PostgreSQL concurrency checks.

## Validation and review artifacts

See docs/PHASE3_VALIDATION.md for final commands, counts and test limits. Screenshots
are generated under ignored `artifacts/phase3/` for desktop/tablet/mobile and uploaded
as synthetic CI artifacts. They cover all three estimate builders/previews, import
review, job financials, time clock, timesheets, payroll preparation and labor reports.

## Explicit limits / unresolved dependencies

1. **Live ingestion/extraction is not enabled or verified.** Durable SQL/CAS and the metadata adapter exist locally; approved byte transport,
   scanner and isolated worker deployment are not provisioned; no AI vendor/model/credentials are
   selected. Real image/PDF/CSV parser tests do not establish malware coverage or
   sandbox isolation. The deployed endpoint always returns 503, including if keys
   are set. Complete docs/MATERIAL_IMPORT.md before activation review.
2. Compatible spreadsheets initially mean the documented UTF-8 supplier CSV format.
   XLSX/macros/Office files are unsupported. All file/camera selection currently
   remains local; sample extraction only uses explicit synthetic fixtures.
3. Hosted Auth/MFA, PostgREST/Storage HTTP, deployed Netlify runtime and advisors
   remain deferred. Tests emulate those SQL contracts; they do not prove hosted
   integration. The existing development target is approved; scoped action approval, hardening,
   migrations and synthetic identities are needed.
4. Worker classification, break policy, tax treatment, salary preparation and weekly
   overtime configuration require independent legal/payroll review. Daily overtime,
   jurisdiction-specific wage rules, statutory deduction calculation, filings,
   deposits and disbursements are not implemented. Salary allocation requires complete
   reviewed weekly time; this is not an autonomous payroll system.
5. Worker profiles require existing company-member identities; new account identity
   onboarding remains the Phase 2 approved provisioning dependency. Policy/classification/
   cost-source changes after time exists require a reviewed versioned migration.
6. Imported estimates require fresh reviewed imports when duplicated; source-bound
   prices cannot become generic templates. Credits currently represent returns
   against recorded paid purchases; unpaid commitment cancellation needs a separate
   reviewed adjustment workflow. Matching purchase keys and customer authorization
   evidence remain explicit staff responsibilities.
7. Interactive lists are bounded; extend server filtering/pagination and reporting
   aggregation before high-volume production use. Only the default-off internal test portal/consent/synthetic ledger is implemented;
   external communication, real execution/signatures, tax filing and provider processing
   remain unavailable.

## Recommended next engineering phase

Next: review and authorize the exact development migration bundle and Auth/API
hardening, then identity/TOTP/fixtures and protected internal deployment. Validate
real Auth/Storage/RLS/MFA,
provision approved scanner/worker/gateway, run adversarial document corpus and load
checks, and obtain workforce/tax/classification review. Complete ingestion and
reporting acceptance before production consideration. Internal Phase 4 can then consume
immutable issued scope plus authorized changes for contracts/invoices; keep gateway
sandbox onboarding (Authorize.Net/NMI) and payroll execution separately gated.
