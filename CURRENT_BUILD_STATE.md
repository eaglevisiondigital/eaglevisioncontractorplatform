# Current build state · October 15, 2026 · Phase 3A

## Governing release policy and latest internal milestone

**Production Release 1.0: NOT READY / NOT AUTHORIZED.** Phases 1, 2, 3 and 3A are
internal engineering milestones only. No outside contractor, employee or customer
may receive access before the complete Release 1.0 workflow is substantially
complete, tested, secure and explicitly approved for launch. No phase completion,
CI pass, target manifest or staging approval authorizes external access or launch.
See docs/RELEASE_1_0_ACCEPTANCE.md for every required module's implementation,
hosted evidence, security, third-party dependencies and launch status.

Phase 3A read-only audit confirmed the existing Eagle Vision Supabase project has
no public tables/buckets/migrations/functions/development branches; it remains
unapproved staging. No clearly named contractor-platform Netlify site was identified;
marketing/unrelated sites were not reused. GitHub has no repository environments or
Actions secrets; classic main branch protection was absent. No settings/resources
were changed. Private identifiers are omitted from this public repository.

Prepared offline migration digests, private expiring staging manifest validation,
opt-in real-session three-company SELECT and internal RPC assertion runners,
read-only catalog verification, configuration/migration/recovery procedures and a
full connected acceptance matrix. No hosted test/migration/deployment was performed.
Operator-specific fixture/case data and actual Auth/TOTP/PostgREST/Storage/connected
browser evidence require an explicitly approved isolated target.

Added authenticated bounded malware-gateway adapter and fenced lease/retry worker
orchestration, tested with synthetic transports. Real durable CAS/control storage,
worker isolation, scanner and AI/provider validation remain dependencies. Ingestion
still returns 503, and browser storage writes remain denied. No production extraction
success is simulated. See docs/PHASE3A_WORKER.md for exact implementation gates.

Hidden unfinished Contracts/Invoices/Payments navigation and configuration; an
additive unapplied migration constrains all three disabled in PostgreSQL. Netlify
production builds now fail closed; internal preview builds require specifically
configured branch/context approval. This does not replace protected site access or
hosted deployment authorization. No production execution endpoint was introduced.

Latest local evidence is recorded in docs/PHASE3A_VALIDATION.md. Read
**docs/PHASE3A_STAGING.md** for the exact next isolated actions/approvals and recovery
procedure. Keep the existing feature branch and draft PR #1. The Phase 3 implementation
record below remains valid; its validation counts are historical.

## Review boundary and session continuity

Continue `codex/phase-1-foundation` and [draft PR #1](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/pull/1).
The repository is PUBLIC. Preserve the original README and existing Phase 1/2
architecture/features. No merge, production deployment, hosted migration, live
charge, customer delivery/signature, payroll execution or actual customer message
is authorized or has been performed. Never commit credentials, real worker pay,
customer documents, hosted project identifiers or sensitive infrastructure exports.

The user explicitly chose **complete locally; defer hosted validation**. Existing
hosted resources remain read-only; no project/branch was created or repurposed.
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

1. **Live ingestion/extraction is not enabled or verified.** The scanner and isolated
   worker/storage adapter are not provisioned; no AI vendor/model/credentials are
   selected. Real image/PDF/CSV parser tests do not establish malware coverage or
   sandbox isolation. The deployed endpoint always returns 503, including if keys
   are set. Complete docs/MATERIAL_IMPORT.md before activation review.
2. Compatible spreadsheets initially mean the documented UTF-8 supplier CSV format.
   XLSX/macros/Office files are unsupported. All file/camera selection currently
   remains local; sample extraction only uses explicit synthetic fixtures.
3. Hosted Auth/MFA, PostgREST/Storage HTTP, deployed Netlify runtime and advisors
   remain deferred. Tests emulate those SQL contracts; they do not prove hosted
   integration. An approved isolated environment and scoped configuration are needed.
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
   aggregation before high-volume production use. No customer portal, communication,
   execution, signature, tax filing or payment integration is enabled.

## Recommended next engineering phase

Continue Phase 3A: obtain environment-specific internal staging approval, validate real Auth/Storage/RLS/MFA,
provision approved scanner/worker/gateway, run adversarial document corpus and load
checks, and obtain workforce/tax/classification review. Complete ingestion and
reporting acceptance before production consideration. Internal Phase 4 can then consume
immutable issued scope plus authorized changes for contracts/invoices; keep gateway
sandbox onboarding (Authorize.Net/NMI) and payroll execution separately gated.
