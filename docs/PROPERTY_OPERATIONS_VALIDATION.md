# Property operations and smart procurement · local implementation

## Latest: recovered hosted preflight

PROPERTY_PREFLIGHT_RECOVERY.md records successful exact one-file CLI dry run and
actual public/legacy-key table-profile checks, with unchanged ten-migration schema,
Auth/API configuration and corrected SQL/hash. Earlier CLI/API blockers below are
historical. Technical GO for separate owner schema approval; no hosted migration,
feature/media/provider activation or real connected property acceptance occurred.

## Superseding schema-review checkpoint

The original implementation snapshot below is historical. The original f345 SQL
proposal was corrected after nine reproduced negative failures and now has a formal
pending migration20261017005322. It remains UNAPPLIED / NOT AUTHORIZED; the ten
historical migrations and hosted schema are unchanged. See
[PROPERTY_MIGRATION_SECURITY_REVIEW.md](PROPERTY_MIGRATION_SECURITY_REVIEW.md) and
[PROPERTY_CONNECTED_AUTHORIZATION.md](PROPERTY_CONNECTED_AUTHORIZATION.md).

Latest regression:666 local PASS/43 native-only skips;318 native PostgreSQL17 PASS;
63 browser PASS;26 frozen checks PASS. Hosted read-only drift checks PASS; CLI dry
run and API schema-profile verification BLOCKED. Execution recommendation NO-GO
until both pass and the owner separately approves exact execution. Media/connected
workflow acceptance remains NOT RUN/blocked, and all activation controls stay off.

Release 1.0 remains **NOT READY / NOT AUTHORIZED**. Base checkpoint f2d5401,
existing draft PR #1. This work is local and synthetic; no hosted database,
provider, credential, grant, Netlify deployment or customer access changed.

## Implemented

- CRM/property/job-bound inspection plans, initial/weekly/monthly/custom schedules,
  configurable checklists, observed damage, severity, repair recommendations,
  staff submission, management publication, append-only published report versions,
  visit history and draft repair scope through the existing estimate repository.
  Monthly dates stay anchored through short months; property-local dates do not
  drift at DST. Scheduling is explicit; no autonomous scheduler or email executes.
- Responsive private photo/video/drone galleries and capture controls, internal or
  proposed client visibility, before/during/after phases. Capture/upload/playback
  are disabled. Metadata validation, source digest/type/size/tenant/visit contracts,
  quota policy and isolated processing port are implemented; metadata is never
  proof of safe bytes. Every real ingestion/playback entry point returns 503.
- One to four contractor-supplied quote comparisons: vendor/store/source/date,
  SKU/specification/equivalence review, exact unit conversion, whole packs, overbuy,
  stock, line tax and shipping/pickup acquisition costs. Evaluate supplier subsets
  to include fixed order costs once. Unknown costs cannot be cheapest. Explicit
  assignments update existing estimate drafts, preserving original issued scope.
  Quoted availability is not a reservation. Supplier connectors are disabled ports;
  no scraping, price-feed claims or account credentials.
- Approved actual material purchases compared with immutable original material
  scope and approved changes: unmatched/substituted/ambiguous, cumulative excess,
  unit/price variance, linked credits, overlapping invoices and package coverage.
  Append-only absorb/included/proposed/deferred reviews; pass-through, percentage
  or fixed markup; itemized/package selling descriptions. Proposals reuse existing
  job change orders with zero additional forecast cost (purchase already posted).
  Invoice drafts remain awaiting customer authorization, never receivables.
- Unified synthetic client view combines only published reports and existing
  internal-release offers, test agreements, branded invoices and schedules for the
  exact customer. Draft estimates, internal findings/costs/markup and supplemental
  proposals are absent. The financial example requires an explicit local demo
  action and uses the existing release engine; it is not genuine customer consent,
  a legal signature, external sending or payment execution.
- NMI is the preferred initial gateway in the offline activation plan. Authorize.Net
  remains independently supported and optional. Both stay disabled.

New interfaces appear only under `/preview`. Connected routes hide them; the
repository rejects connected initialization and there is no new public RPC/HTTP
endpoint. Sample changes are in memory and disappear on reload. Existing Jobs also
links to the same unbilled review, without creating a second expense ledger.

## Database proposal and execution boundary

`server/property/schema.proposed.sql` is a **local SQL proposal**, outside
`supabase/migrations`. Exact SHA and inventory: PROPERTY_OPERATIONS_PROPOSAL.json.
It creates eight private tables, three supporting composite indexes on existing
location/expense/change records, checked fixed-search-path functions and metadata
activity triggers. All tables have tenant keys, RLS and explicit revoked client/
service grants. Three private entry points require current tenant permissions;
management requires AAL2, assigned field staff cannot publish or read pricing.
Membership/module/assignment/resource locks and CAS protect revocation and concurrent
reviews. No feature row, public wrapper, Storage policy, worker role or capability
is provisioned. Existing ten migrations and both approved manifests are unchanged.
Generated public types therefore remain unchanged and are checked.

The proposal is exercised only after the ten historical migrations in disposable
PGlite/PostgreSQL 17. It is not yet an approved Supabase forward migration or an
application-connected persistence adapter. Separate review, a formal forward
migration, target-bound drift/dry-run review and explicit hosted execution approval
are required. Public wrappers and feature activation need their own security review;
SQL installation alone must not open connected access. This is a release blocker.

Containment: keep the feature table empty/disabled and no public wrappers. If later
activation is approved, deactivate exact feature rows, revoke exact entry-point
EXECUTE and close affected sessions; preserve reports, decisions, invoice drafts
and audit history. Never drop or mutate financial evidence to roll back. Test the
exact containment/restore operation against the future reviewed migration first.

## Verification

Final counts and commands are recorded below. Local SQL uses
synthetic Auth claims/Storage fixtures only in disposable databases; it does not
prove real Supabase Auth, Storage, PostgREST or deployed protection. Historical
hosted acceptance is not evidence for these new modules.

PASS/FAIL/BLOCKED/NOT RUN remain separate:

- PASS: final executed local/domain/SQL/native concurrency/browser checks below.
- FAIL: no unresolved executed failure after corrections; initial test issues and
  limits are noted with final evidence.
- BLOCKED: connected persistence, reviewed migration, private media services,
  actual scanning/transcoding/playback and independently validated portal/security.
- NOT RUN: hosted migration/advisors/HTTP acceptance, actual upload/camera/playback,
  supplier APIs, genuine supplemental consent/invoice conversion, NMI/Authorize.Net
  tokenization or transactions, external sending/signing/payroll and deployment.

## Remaining infrastructure and financial gates

1. Approved scoped private byte gateway, quarantine/derivative storage, resumable
   upload reservations/CAS quota accounting, malware scanner/full validators,
   isolated codec/parser sandbox with enforced CPU/memory/PID/disk/time/egress limits,
   hostile media corpus, fencing/retries and exact-version orphan cleanup. Original
   media remain private; no direct original download to staff or clients before
   scan/validation. Strip metadata from approved derivatives. Proposed envelope:
   photo3MiB/video250MiB/5min/3840x2160/30fps; tenant1GiB/day/10GiB stored; access60s.
   These are local policy limits, not measured infrastructure certification.
2. Every playlist, segment, poster, range and derivative request needs exact current
   tenant/customer/property/publication checks and revocation/expiry enforcement;
   no public bucket, bearer URL logs or unsigned segments. Retention/legal holds,
   privacy/consent and drone/location data policy require owner/legal review.
3. Real supplier-document extraction continues through existing quarantine/scanner/
   AI review gates. No new direct document upload bypass. Supplier quote source
   references are contractor-entered provenance, not proof of live retailer data.
   Shared-stock/SKU allocation across distinct quote rows, minimum-order/discount
   tiers, freight tax rules and live inventory need later supplier-specific review;
   the current comparison is a fixed-fee, per-line-tax reviewed quote model.
4. Ambiguous/unmatched purchases require manual scope review; returns without exact
   quantity evidence stay flagged. A proposed price covers the reviewed purchase's
   net amount, not an automatically inferred billable excess. Split mixed covered/
   uncovered scope explicitly before proposal. Reconcile exact customer authorization,
   tax/currency and one approved change-to-invoice mapping before conversion. Existing
   free-text internal approval is not production authorization. No automatic charge.
5. NMI account access is expected from the owner; no waiting is required for local
   work. Provider-approved sandbox account, independent NMI tokens/vault, reviewed
   merchant/workload/consent bindings, webhook/reporting and exact bounded testing
   approval are still required. Authorize.Net remains optional with separate custody.
6. The blocked frozen Netlify deployment and support diagnosis are unchanged. A clean
   separate production database and independent full Release 1.0 acceptance remain
   mandatory. No fixture database may be promoted into production.

Smallest next owner action: authorize **review only** of this proposed schema and
connected adapter/portal authorization design. No provider account is needed for
that review. Any later hosted application or feature/media/provider activation
requires a distinct exact operation approval; NMI account inspection is separate.

## Final regression evidence

- `npm run check`:653 PASS /38 native-only skips. Includes lint, strict TypeScript,
  unchanged public catalog types, historical migration integrity, new local-proposal
  hash/scope check and build. The29 new domain/repository tests plus24 portable SQL
  cases are included; do not add these counts to the suite total.
- Disposable native PostgreSQL17:300 PASS /0 skips, including all38 cases skipped
  by PGlite and five new real concurrent/lock-wait property tests. Database counts
  overlap the above total. No hosted SQL/Auth mock or provider call occurred.
- Browser:63 PASS across desktop/tablet/mobile, including12 new responsive cases;
  three-company reports/client views, quote comparisons, disabled media controls,
  unbilled proposals and repeated visit saves. Automated accessibility and document
  overflow checks pass. Local preview uses4177 because the owner's existing4173
  preview remains undisturbed: `npm run test:browser -- --config
.staging/sandbox-activation/playwright.config.ts`.
- Formatting, diff whitespace, private-identifier scan, approved PNG digest and
  original ten migration files checked. Frozen Action D package:26 offline
  integrity checks PASS, no network, no artifact rebuild/substitution.
- Initial regression findings corrected: stale local draft-vs-issued projection,
  missing SQL variable qualification, quote save confirmation disappearing on
  resource reload, selected visit resetting after save, and mobile table overflow.
  Final executed results supersede those failed development runs. Native tests
  prove wall-clock portal expiry and revocation during actual lock waits.

SQL proposal SHA-256: `f3458c4551a738c88bc65d8ca20f847cd7703d02d91b791c03b87ae3a9962d45`.
No hosted migration version was added. No hosted advisors were run for this proposal.

Actual synthetic screenshots (ignored, available locally and as CI artifacts):
`artifacts/property/{desktop,tablet,mobile}-sample-property-inspections.png`,
`*-sample-construction-inspections.png`, `*-sample-roofing-inspections.png`,
`*-sample-property-client.png`, `*-supplier-comparison.png`,
`*-media-galleries.png`, `*-unbilled-review.png`. Screenshots verify interface
presentation, not an enabled camera, provider or secure-media runtime.

Follow-up boundary regression: repository quote snapshot/cost writes validate tenant
estimate currency before any draft mutation, and unknown/empty assignments reject.
This prevents direct callers from bypassing the UI comparison checks.
