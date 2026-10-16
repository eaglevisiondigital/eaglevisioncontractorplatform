# Platform architecture · shared foundation through internal Phase 3A

## Shared deployment and separate surfaces

README.md remains the product source of truth. The Phase 1 architecture is
preserved: one React/TypeScript Vite deployment serves many independent companies,
Netlify supplies static hosting and request-scoped functions, and Supabase supplies
Auth, PostgreSQL and private Storage. No per-contractor fork or deployment.

| Surface                     | Route                                                        | Authority                                                   |
| --------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Company administration      | `/`, `/app`                                                  | Current active membership; admin/owner AAL2                 |
| Eagle Vision control plane  | `/super-admin`                                               | Explicit private platform grant and AAL2                    |
| Public company intake       | `/intake/<company-slug>`                                     | Published profile; checked server gateway for submission    |
| Customer portal             | `/portal`                                                    | Reserved; no resource grants or records exposed             |
| Synthetic previews          | `/preview`, `/preview/super-admin`, `/preview/intake/<slug>` | In-memory examples only, reset on reload                    |
| Staff invitation acceptance | `/join#token=<one-time-token>`                               | Verified invited account, eligibility and role-specific MFA |

Company mode loads only the user's own memberships. Platform users receive profile
visibility and aggregate usage, not implicit access to customers or files. Route
and company selection are context, never authorization. Connected mode never falls
back to synthetic data. Browser reads/CRUD retain the caller's JWT and database RLS.
The protected organization-context function also validates the session with Auth.

Development Auth now enables native Leaked Password Protection through an exact
owner-approved one-field configuration change. Signup remains disabled; MFA, redirect
allowlist and public-only API exposure are unchanged. This does not screen/reset
existing passwords or authorize account/session operations. See
docs/LEAKED_PASSWORD_PROTECTION_RESULT.md for persisted configuration and advisor
evidence; production requires separate clean provisioning and validation.

## Organization and operational data

Organizations own memberships, configurable module entitlements, structured company
settings, customers, service locations, intake requests, notes, consent events,
lead notifications, documents and activity. Coarse roles remain owner/admin/staff;
staff job scopes add estimator/office_manager/field_staff. Privileged access requires
AAL2. Suspension and module switches are enforced by database predicates.

Composite tenant foreign keys and immutable tenant IDs prevent cross-company
references or transfers. Intake location/customer combinations must agree. Narrow
column grants protect record IDs, creation timestamps and consent attribution.
Settings and profile saves are atomic. Company settings include brand/logo metadata,
contact/area/specialty/license/insurance information, estimate defaults and materials/
labor configuration. These defaults do not perform estimation, tax or payment work.

Customer CRUD uses bounded search, type filters and stable paginated ordering.
Duplicate identification stays within the selected tenant. Public submissions never
auto-merge identities based on unverified contact details. Consent is an append-only
history; notes, inquiries and consent comprise the customer timeline. Changes append
minimal activity metadata without copying customer payloads into audit logs.

## Privileged operations

Public security-invoker RPCs call narrowly granted private implementations for
company provisioning/configuration, owner assignment/revocation, team invitations,
role changes and inquiry assignment. Each checks current grants, organization status,
module capability and required MFA. Private platform events record administrative
actions separately from company activity. At least one active owner must remain.
Metrics expose counts, not customer fields. Subscription plans are configuration,
not billing. New verified identities and the first platform grant require reviewed
identity/operator provisioning; no Auth-admin service key is exposed by the app.

Invitation tokens are random, stored as hashes, valid for 72 hours and single-use.
Acceptance matches the verified Auth email, rechecks the creator's current authority
and requires MFA for administrative roles. Links use fragments to avoid server URL
logs. Links are created for controlled manual sharing; no actual email/SMS is sent.

## Public intake boundary

The public profile RPC exposes only a company's deliberately published branding,
industry and service categories. Public form data contains no organization UUID.
The Netlify handler validates origin, bounded JSON, field allowlist, honeypot,
Turnstile hostname/action and runtime-supplied client IP. It hashes IP with an
independent server HMAC secret, then invokes a narrow gateway-capability RPC.

The gateway resolves an active, enabled published company slug, checks payload/
consent, applies durable limits and idempotency, and creates customer, location,
request, consent and in-app lead notification atomically. Five requests/minute and
30/hour per company/fingerprint are enforced; retries of the same payload/key do
not create duplicate records. No existing customer identity is revealed or merged.
Public intake is disabled by default until disposable-environment configuration is
approved. Forms are linked from contractor sites; iframe embedding remains blocked
until an origin allowlist is designed. No file input or external messaging exists.

## Lifecycle roadmap (historical foundation plan; current Phase 3 below)

| Module    | Planned model and invariants                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimates | Estimate root, immutable numbered versions, line/options, quantity/cost/markup, discount and approved tax-policy snapshot. Accepted versions locked; changes create a version/change order.   |
| Contracts | Jurisdiction/versioned legal templates, approved estimate snapshot, consent, signature sessions, evidence and executed artifact hash. Executed records immutable.                             |
| Invoices  | Draft/issued/part-paid/paid/void state machine, line/tax snapshots and explicit currency; issued corrections use credit notes.                                                                |
| Schedules | Separate authorized deposit/milestone/date installments, sum validation, timezone, cancellation and retry state. A schedule alone never authorizes a charge.                                  |
| Payments  | Per-company merchant routing, gateway method tokens, explicit customer authorization, idempotency record and verified provider events.                                                        |
| Ledger    | Append-only balanced journal entries in integer minor units by currency; reversal entries, no edits; reconcile provider gross/fee/net and settlement separately.                              |
| Documents | Private immutable object/version metadata, quarantine scan, ownership, customer/internal visibility, controlled links, retention and legal holds. Foundation metadata and read policies only. |

Phase 1 implements only foundation tables, Money validation and disabled capability
flags for these future workflows. There are no financial mutation endpoints. See
[payments design](docs/PAYMENTS.md) for review gates and event processing.

## Documents and deployment configuration

The Phase 1 private bucket/quarantine boundary remains. Only clean tenant-owned
objects can be read. Internal company logos use authorized downloads and local blob
URLs; public intake uses initials. No upload/replacement/deletion policies, public
bucket or signed download issuance is introduced. Internal estimating/job/payroll
preparation is implemented in Phase 3; financial execution remains disabled.

Only public Supabase keys belong in browser variables. Server-only gateway, HMAC
and CAPTCHA secrets use hosting Functions scope and approved secret storage; only
the gateway hash is registered in the database. Request-scoped APIs never use a
service-role key. CSP explicitly permits the verification provider and image blob
URLs. Public forms, company administration, portal and platform control remain
separate entry points.

## Testing, types and growth

Catalog-derived tables/enums/RPC types and a typed Supabase client are generated
from committed migrations and checked for drift. PGlite and native PostgreSQL 17
produce identical types and SQL-policy results. CI tests both engines plus desktop,
tablet and mobile flows. The harness provides Auth/Storage SQL contracts, not real
Supabase HTTP services. Real Auth/TOTP, PostgREST, Storage and post-migration advisors
remain a release gate. See docs/PHASE2_VALIDATION.md and docs/DEVELOPMENT.md.

Next extend estimates and catalog/versioning after the deferred hosted gate. Add
reviewed identity onboarding, retention/export, concurrency/load validation and
consent-aware delivery only within their approved scope. No production deployment,
hosted migration or live workflow is implied by this implementation.

## Phase 3 · estimates, supplier evidence, job costs and workforce

The Phase 3 user additions extend the existing application and tenant boundary;
there is still one deployment. `src/components/phase3` provides Estimates,
Catalog, Jobs and Workforce. `src/lib/phase3.ts` separates caller-scoped connected
operations from an explicitly synthetic, in-memory preview repository. No demo
fallback occurs in connected mode. The original README remains unchanged.

### Estimates and snapshots

Company-owned catalogs contain materials/products, labor, services and allowances.
Templates copy scope, not customer identity, dates, attachments or source-bound
import approvals. Catalog edits never automatically reprice saved estimates.
Estimates have numbered roots and successive versions, plus tenant-composite
options, lines, schedule proposals and clean-document references. A partial unique
index permits one draft per estimate. Company settings are locked for number
allocation; creation keys bind to the request hash. Draft saves use optimistic
revision checks. Issuing requires current estimating permission, owner/admin MFA,
an independently reviewed tax reference, unexpired scope and current recalculation.
It locks an internal snapshot; no customer delivery/acceptance/signing occurs.
Database triggers protect issued versions and children. Revisions retain their
issued predecessor. Immutable source data can later feed contracts and invoices.

Calculation engine v1 uses integer currency minor units, thousandth quantities,
basis-point percentages and exact BigInt/PostgreSQL numeric arithmetic. Round a
marked-up unit price half up before quantity extension; fixed import markup applies
once per extended line. Include base plus selected options. Apply the global
discount, allocate its taxable share proportionally, then calculate tax. Proposed
schedule shares total 100%; floor each allocation and put the remainder in the last
milestone. Profit excludes tax; markup and gross margin are different quantities.
Supported bounds and unknown-field rejection prevent unsafe numbers or fee fields.
Customer previews are explicit projections excluding costs, markup, internal notes,
supplier provenance and payroll details. Historical versions retain company,
customer, location, tax-policy and attachment metadata snapshots.

### Smart Material Import and purchased materials

See `docs/MATERIAL_IMPORT.md`. A versioned provider-neutral extraction record
retains original supplier, dates, SKU, literal quantity/cost/extension/total strings,
page/sheet/cell references, confidence and warnings. Review rows preserve their raw
extracted values alongside explicit staff corrections. Independent arithmetic flags
extension and document-total disagreement, missing/ambiguous values, currency
mismatch and duplicate/conflicting products. No automatic currency conversion or
uncertain-price repair occurs. Pricing precedence is line > supplier > company;
pass-through, percentage and fixed extended-line markup are supported.

Batch/source/approval records are tenant owned. Explicit review and every selected
row's acknowledgement are required. Approval snapshots are immutable and bound to
the estimate or purchase job. Approved itemized or lump-sum material scope retains
private supplier costs and source row IDs. Every estimate save and issue verifies
approved financial provenance. Approval-and-application is atomic; stale drafts
roll back approval. Synthetic source provenance cannot issue in connected SQL.

Receipt/invoice batches reuse the same review engine, but produce one internal
expense submission per supplier row, retaining its source approval and identifiers.
Source digest uniqueness within a job and an immutable approval-row mapping prevent
repeat recording. Manual budget matching remains explicit; normalized description
and unit matches are candidates, not authorization. Receipt prices never change
customer billing. Original estimate source imports and purchase imports have distinct
purposes and cannot be substituted for one another.

### Job financial dashboard

Explicit management approval captures an immutable baseline from an internally
issued estimate: selected revenue before tax, original material/labor/other costs,
line scope and currency. This is internal job authorization, not evidence of customer
acceptance. Estimate revisions cannot rewrite the baseline. Approved change orders
retain exact scope/value and a management-attested customer authorization reference.
Internal/proposed changes do not increase authorized billing totals.

Expense submissions and management decisions are append-only. Assigned field staff
submit expenses without reading budgets/margins. Managers review commitments,
paid expenses and credits. Shared supplier/purchase link keys reconcile overlapping
POs, invoices and receipts: exposure is paid plus outstanding commitment, not their
sum. Credits link to an approved payment, cannot exceed paid cost, and reduce the
commitment. Source-linked imports also have database duplicate guards. Remaining
forecast and warning thresholds use optimistic revisions. Category overruns and
margin erosion are shown; incomplete forecasts never claim final profit.

### Workforce and payroll preparation

Worker profiles are company-specific and linked to active members. Worker types
are classification records, not legal determinations. Effective immutable rates
separate hourly cash, weekly salary, employer burden, estimated loaded cost, billing
value and imputed cost. Invoice-costed contractors produce no time-based cash fee;
subcontractor expenses must identify an invoice-costed worker. Direct manual labor
expenses are rejected, so approved time posts labor through one source.

Time belongs to an assigned job or approved overhead center. Clock operations use
server seconds; switching atomically closes and opens segments. Paid/unpaid breaks
are explicit. Policy/worker locks serialize overlapping time and period locking.
Own/assigned-team time access is separate from payroll administration. Submission
locks original records; approved unlocked corrections append a superseding entry.
Locked periods require later financial adjustment entries, preserving original time.

Preparation covers complete employer workweeks in a reviewed IANA timezone. Actual
elapsed seconds handle midnight/DST; overtime accumulates across every job/overhead
segment for that employer. Effective rate changes require split time segments.
Weekly salary allocation floors shares and assigns the residual to the final piece;
overtime premiums are separate. Salary-rate changes within a week fail for review.
Only reviewed, closed, submitted segments may enter a locked period. Locked snapshots
and later adjustments post job labor costs once. Payroll administrators can preview
and export earnings/deduction inputs as CSV. Aggregate job reports expose economic
cost/hours/billing value, not individual pay rates. Manual deduction inputs do not
calculate statutory withholding. Payroll execution is absent.

## Phase 3A · internal staging and Release 1.0 boundary

Earlier “planned” module descriptions record historical implementation sequence;
Phase 3 estimating/job/workforce sections above describe current implemented code.
Phases are internal milestones, never independently authorized production releases.
The full required workflow and evidence matrix are in
[Release 1.0 acceptance](docs/RELEASE_1_0_ACCEPTANCE.md). No outside access is allowed
before full acceptance/security and express owner launch approval.

One shared tenant architecture remains. Offline migration hashing, expiring isolated
manifest validation and opt-in real Auth/PostgREST + internal RPC assertion runners
live under server/staging and scripts/staging-readiness.mts. There is no automatic
hosted workflow. The catalog security suite requires every public tenant table in
hosted SELECT acceptance and checks RLS, invoker RPCs, private definer search paths
and private/read-only client Storage. Real connected acceptance remains unexecuted.

Unfinished contracts/invoices/payments are hidden from company navigation/control
configuration and constrained disabled in PostgreSQL, including operator table
writes. No runtime flag unlocks them. A Netlify build guard rejects production and
requires a specifically configured internal branch/preview context. Site protection,
external-access provisioning, deployment approval and live execution remain separate
controls; the build guard does not secure an already deployed site.

The document pipeline gains an authenticated bounded malware-gateway adapter and
fenced lease worker orchestration. Durable storage/queue CAS and authorization must
be atomic in the future private control service; orchestration checks alone are not
race-proof persistence. No control store, worker deployment or real scanner/AI has
been provisioned. The existing ingestion503 and denied uploads remain unchanged.
See docs/PHASE3A_WORKER.md for limits/activation and PHASE3A_STAGING.md for migration,
connected fixtures, recovery and exact separate approvals.

Future contracts/invoices consume immutable approved scope plus authorized changes,
with explicit customer-safe selling-price projections and company branding snapshots.
Future Authorize.Net/NMI routing remains per organization with separate merchant/token
namespaces; no shared settlement or unconditional surcharge. Future communications
must resolve verified company-specific sender/domain, consent and immutable delivery
identity in the same tenant transaction; a platform sender must never silently
replace an unconfigured company's sender. No sending endpoint is enabled now.

## Connected internal development and Release 1.0 continuation

The owner designated the existing contractor Supabase project INTERNAL DEVELOPMENT,
paired with the protected Netlify staging site. A separate staging DB is no longer
required. Designation does not authorize hosted migrations/deployments/configuration
or test-account provisioning. A future **separate clean production DB** must be
independently validated; never promote/restore synthetic development data into it.
See docs/CONNECTED_DEVELOPMENT.md and the hashed docs/MIGRATION_BUNDLE.json.

A new isolated laboratory extends, rather than replaces, the existing modules.
/preview/release uses an explicit synthetic repository; /internal-release and
/portal/internal use the caller's real Supabase JWT and invoker RPCs. Normal portal/
Contracts/Invoices/Payments stay hidden and production-disabled. Private environment
mode defaults off; expiring operator-managed test grants, verified identities and
current owner/admin AAL2 or exact customer mappings enforce access. There is no
connected role switch or data fallback. Revocation-sensitive writes lock relevant
environment/grant/org/module/membership/customer-link records before rechecking.

Immutable issued scope is projected into customer-safe offers without private
supplier/markup/workforce fields. Customer decisions, exact-contract SHA-256 test
consent, contract terms/branding, invoice scope, authorization and payment/refund
records are append-only. Current estimate-root locks serialize revision/acceptance;
accepted scope cannot be republished into duplicate full-contract billing. Invoice
numbers are allocated atomically. Deposits/schedules retain exact approved estimate
allocations; each synthetic payment requires a separate customer authorization.
Receivable/sales/tax postings and synthetic clearing/refunds reconcile in minor units.
Nothing posts real charges, changes existing job budgets or executes payroll.

Tenant sender configuration cannot self-verify; changes reset verification. Internal
message sinks record prepared portal delivery, not sent email. Production sender
verification/consent/suppression/webhooks and legal/signature-provider evidence still
need integration and independent approval. Branded HTML invoice print output includes
only the selected customer invoice projection; staff laboratory controls do not print.

Server-side sandbox Authorize.Net/NMI adapters accept gateway tokens only, bind
org/merchant/authorization, serialize exact USD decimal amounts, use fixed test
endpoints, refuse redirects and normalize bounded responses. Durable idempotency
reservation is a required injected control-store contract; UNKNOWN outcomes never
retry automatically. These adapters are unwired and provider-unverified; synthetic
laboratory authorization cannot be reused as provider-specific payment consent.

Document processing now has private durable workload grants/jobs, scoped fenced
leases, current grant/source-creator/module locks, scan/validator/model allowlists,
strict neutral-schema CAS and bounded retry/recovery. The Supabase metadata adapter
stages a private clean object, then commits extraction; source stays quarantined
until both exist. No new Storage policy or ingestion endpoint was enabled. Approved
byte transport, isolation, actual scanner/AI, retention and orphan cleanup remain
required. Cross-service failures may leave unreadable private orphans, never a
clean metadata record pointing at an absent object. Real HTTP verification is pending.

### Sandbox request consistency follow-up

Gateway configuration/credentials are copied and frozen at construction; capture
inputs are copied and frozen before reservation. The digest uses a fixed field
order, independent of caller object key order. Reservation, provider serialization
and completion therefore refer to the same tenant, merchant, invoice, authorization,
amount and token even if caller-owned objects change during an asynchronous wait.
Expiry is checked again after reservation, before transport. Invalid reservation
states and malformed replay metadata fail closed. No route or provider was enabled.

### Approved development schema execution · October16

The nine-file reviewed bundle is now applied to the owner-designated development
project. No deployment, identity provisioning or real provider activation occurred.
The51 public/12 private RLS tables, checked invoker/private-definer boundaries,
private buckets and default-off internal release controls were verified hosted.
Generated types match with documented RPC generator conventions. This establishes
schema readiness only; actual multi-company Auth/MFA/HTTP workflows remain pending.
See docs/DEVELOPMENT_MIGRATION_RESULT.md for the execution and hardening status.

Confirmed development hardening saves: public signup OFF; protected internal Auth
Site URL plus three exact internal redirects; public-only API schema; automatic
new-table exposure OFF. Existing application grants/RLS and Netlify team-login
protection are preserved. This dashboard setting does not revoke every PostgreSQL
default privilege: residual/global/provider-managed defaults remain and broader
cleanup was rejected by automatic review. Continue explicit per-object grants and
revokes in every future reviewed migration. No deployment/accounts were created.

Connected acceptance preparation adds a read-only GET preflight distinct from
authenticated tenant/workflow acceptance. It has no provisioning/write/upload mode,
uses an expiring privately supplied publishable-key target and emits only case
labels/status/pass booleans. Offline roster planning confers no identity or role.
The current full positive-control harness is preserved; missing worker/Storage or
tenant rows cannot yield full success. See docs/CONNECTED_ACCEPTANCE_PLAN.md for
22 identities and separate identity/fixture/private-grant/deploy approval boundaries.

Action A identity/MFA validation is now complete for the existing 22 synthetic
identities and four designated privileged accounts. The temporary private loopback
interface reused the existing MFA component and actual Supabase password/TOTP APIs;
no application/module or schema change was required. Fresh identity, verified claims
and AAL2 checks plus independent hosted factor counts establish real enrollment.
All sessions were signed out and the helper stopped. No company or private grant
exists, so full multi-company/domain acceptance remains pending. See
docs/ACTION_A_RESULT.md; Actions B/C/D are not authorized by this milestone.

Product presentation is now Propel Contractor Suite by Eagle Vision, through a
shared brand constant/full-image component and the exact unchanged owner PNG.
Tenant names/logos/colors and sender/payment routing remain separate; infrastructure
and migrations retain their existing identities. See docs/BRANDING.md.

Action B is authorized but stopped at the checked provisioning prerequisite:
no private platform-admin grant exists. Action C alone controls that bootstrap;
AAL2 does not substitute for it. No companies, memberships or domain fixtures were
created; connected workflow acceptance remains NOT RUN. See docs/ACTION_B_RESULT.md.

C1 review-only operator SQL lives outside the migration/application API paths.
Private rendered SQL binds the existing operator and development target; guarded
activation inserts exactly one platform row, never company membership. Independent
exact-UID deactivation preserves history. The 30-minute window is operator-enforced,
not a schema TTL. Future application operations retain genuine AAL2 caller JWTs;
bootstrap database authority is not a domain-operation client. See
docs/ACTION_C1_REVIEW.md; no hosted operation is currently approved/executed.

C1 execution update (October 16): the approved bootstrap was executed once, followed
by six checked provision/configure RPCs under the real AAL2 operator. Three tenants
and three designated owner memberships now exist. Existing triggers created their
settings/modules/audits. Exact revocation, same-session denial and global sign-out
completed within 40 seconds; the retained inactive row prevents bootstrap replay.
No new schema, application endpoint, domain service-role client or broader private
grant was introduced. Resume Action B with company-owner authority, not a renewed
platform row. Full domain/tenant acceptance remains pending. Earlier zero-tenant and
unapproved-C1 paragraphs are historical. See docs/ACTION_C1_EXECUTION.md.

Action B connected core validation is complete: genuine owner-assisted AAL2 and
normal employee/customer clients executed checked invitations/member/domain APIs;
687 core +36 supplemental authenticated cases passed. Six tenant pairs used
populated fixtures; settings/member/workforce boundaries were verified separately.
No service-role domain path, new deployed endpoint, grant or schema was introduced.
The three existing companies now hold the synthetic acceptance fixtures; all
sessions/helpers are closed. The full source/private-release/positive-object matrix
and deployed runtime remain gated. See docs/ACTION_B_CONNECTED_RESULT.md before
reusing existing fixtures; never replay creation or reactivate the C1 row.

## Protected internal deployment package · prepared only

Action D freezes the application at 28c7d5e with privately verified development
browser configuration, eight static files and four portable Node24 v2 functions.
The reviewed manual draft API proposal carries explicit function runtime/route/
bootstrap metadata and three deploy-only Functions variables, without relying on
an expiring CLI function cache or a remote build. Existing Netlify production guard,
Supabase RLS/permissions, ingestion503 and financial/release gates are preserved.
Dashboard Private visibility is configuration evidence; app/asset/function perimeter
and connected browser acceptance remain NOT RUN until separately approved upload.
No repository link, provider or private grant is part of Action D. See
docs/ACTION_D_REVIEW.md and docs/ACTION_D_ARTIFACTS.json.

Action D execution checkpoint: the exact frozen upload was authorized and created
one unpublished manual deploy-preview. Four function archives uploaded; same-ID
manifest finalization failed HTTP500 and the provider remains uploading. No source,
configuration, grant or database change; no second creation or primary publish.
The omitted optional draft field was verified through independent preview-context/
publication evidence, not invented. Deployed function/asset/perimeter and connected
browser behavior remain unverified. See docs/ACTION_D_EXECUTION.md before resuming.

Action D recovery review distinguishes registered Functions (four in deploy-scoped
dashboard) from ready deployment inventory (empty) and static registry (zero).
The documented direct-digest flow post-processes automatically; the later manifest
PUT is not a required finalization step in that flow. No recovery API/source change.
Provider diagnosis precedes any separately approved same-ID repair; original files,
manifest and per-deploy-variable proposal remain frozen. See docs/ACTION_D_RECOVERY.md.
