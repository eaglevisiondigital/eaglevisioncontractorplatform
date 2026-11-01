# A2 sales, estimates and contracts — source inventory

Date: 2026-11-01. Owner: lead integrator; bounded audit/fix assignment `program_sales_contracts`.
Source baseline: `dc7ed7c2db3cf8ff78a3d6f09098a1b623622874` on
`codex/program-crm-contracts`, isolated from `codex/phase-1-foundation` / draft PR #1.
The owner authorized this local inventory and correctness work through
[the integrated program](../PRODUCT_PROGRAM_2026.md). This document adds evidence to
CRM-001, EST-001, EST-002 and SAL-001; it does not upgrade the central register or
approve hosted execution. Line references below are against that baseline except
`customer-preview.ts` and the new handoff regression included with this package.

**Release 1.0 remains NOT READY / NOT AUTHORIZED.** Historical hosted core acceptance,
local executable behavior, mock-provider tests, proposed schemas and real commercial
release are distinct facts. No new hosted evidence was collected in this audit.

## Evidence-backed status

| Feature | Actual executable scope                                                                                                                                                              | LOCAL / CI                                                                                                                                                    | Actual HOSTED evidence retained                                                                                                                                | RELEASE / next gate                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CRM-001 | Tenant CRM customers, contact preferences, property records, immutable notes/consents, branded intake, staff assignment and filters                                                  | Executable local UI, SQL and negative tests; source below                                                                                                     | [Action B](../ACTION_B_RESULT.md) records genuine CRM/customer/location/assignment acceptance. Public intake with actual CAPTCHA/runtime remains pending       | Not authorized. Exact deployment/origin/CAPTCHA/gateway, consent and current genuine identity acceptance remain gates                                                                      |
| EST-001 | Canonical integer calculations/options/tax/schedules, versioned draft editor, CAS saves, issued snapshots, revisions/history, branded customer preview                               | Executable local plus retained core CI/SQL/browser evidence                                                                                                   | Action B records real create/save/internal issue/revise/concurrency and exact money/privacy checks; this is not customer acceptance or real issuance authority | Not authorized. Actual customer lifecycle, secure export/delivery, tax/legal review and independent release acceptance remain gates                                                        |
| EST-002 | Actual decision ledger/receipt and default-off broker composition, committed admission then exact claim/one-shot consumer, own receipt and eligible staff reader                     | Local disposable native PG17 only; 4B broker validation records 39 new native cases, original 52 native/9 actual React-to-SQL flows and 150 focused app cases | None for customer14/4B/broker. Pending14 and forward proposals remain unapplied; controlled Auth transport is not hosted Auth                                  | NO-GO. Independent recovery, original P1-on13, separately authorized14/4B/broker ownership/hash/grants/mapping/target and genuine internal acceptance                                      |
| SAL-001 | Internal laboratory accepted-offer → immutable contract → exact-hash synthetic signature; sandbox evidence reader/store and embedded-signing **plan**; internal job change proposals | More than the seed DESIGN label: executable local components and negative tests exist. Production contract ceremony is incomplete                             | Action B explicitly blocked private internal-release groups; no actual signing-provider/legal contract acceptance is recorded                                  | Not authorized. Reviewed legal templates, verified signer/consent ceremony, PDF trust validator, provider evidence, retention/legal holds and separately approved integration remain gates |

[Release acceptance](../RELEASE_1_0_ACCEPTANCE.md#cross-cutting-release-gates) remains
controlling. The 723 Action B cases are a retained aggregate across core domains;
this inventory does not attribute all 723 to sales or add them to local counts.
Their original identities/fixtures must not be recreated.

## CRM-001: source, routes and data

- [Operations](../../src/lib/operations.ts#L78) is the shared repository, not a second
  CRM. `listCustomers` (252), `saveCustomer` (286), `duplicates` (330),
  `customerHistory` (372), `addNote` (418), `recordConsent` (438),
  `listLocations` (467), `saveLocation` (483), `listIntake` (530) and
  `assignIntake` (555) reuse tenant/customer/property records. `syntheticProperty`
  (588) validates the exact CRM relationship for local downstream workflows.
- [sampleSubmit](../../src/lib/operations.ts#L930) is explicitly synthetic-only;
  it creates the CRM customer/location/inquiry and consent through those methods.
  It is not a hosted gateway or genuine identity check. Preview state is heap-only.
- [submitIntake](../../src/server/intake.ts#L69) is the existing gated server path:
  off without complete infrastructure/trusted runtime IP, exact same-origin body,
  bounded schema, CAPTCHA hostname/action, hashed rate fingerprint, slug-based server
  tenant resolution and idempotency. There is no client-supplied organization authority.
- [CompanyOperations](../../src/components/CompanyOperations.tsx#L10) chooses the
  existing `Customers` / `Intake` modules after capability and module checks;
  [NewLeadDashboard](../../src/components/CompanyOperations.tsx#L88) reads new inquiries.
  `src/App.tsx:217` matches `/intake/:slug` and `/preview/intake/:slug`.
  `/preview` > Customers/Intake is synthetic. Connected browser selection is presentation,
  with SQL/current session policies still authoritative.
- Database objects: existing `public.customers`, `service_locations`,
  `intake_requests` (`20261015183039_phase_1_foundation.sql:58,64,71`);
  `customer_notes`, `communication_consents`, `lead_notifications`
  (`20261015201048_phase_2_operations.sql:75,81,89`);
  private gateway/rate/idempotency metadata (311–313). Existing checked
  `assign_intake` (286/294), `record_consent` (295/301), `intake_profile` (318/324)
  and `submit_intake_gateway` (328/376) provide the SQL boundaries. No schema is added.

Meaningful retained tests include `tests/database/operations.test.ts`:
“accepts synthetic public requests only into the server-resolved company and preserves
consent” (146), “deduplicates retries and rejects idempotency-key payload changes” (195),
“does not auto-merge unverified public identity matches” (216), “denies cross-tenant and
revoked assignees” (257), “protects notes and consent provenance across companies and
against mutation” (478), and “rejects tenant-mismatched customer/location relationships
and unsafe logo references” (568). `tests/intake-server.test.ts` tests disabled
infrastructure, trusted IP/origin, unexpected authority fields, bounded body and CAPTCHA.
Actual responsive UI tests are `tests/browser/operations.spec.ts:3,57,190`.

Remaining bounded work: preserve the single CRM/property IDs while specifying an
explicit staff-selected inquiry → draft-estimate handoff and appointment intent.
The current editor can create a draft for CRM customers but does not retain a dedicated
lead-origin field. A booking or contract engine must not be invented to fill that gap.
CRM lists/editor customer choices currently load the first page (10 customers), and
local estimate creation also searches that page (`phase3.ts:871`); tenant-scoped
lookup/paginated selection beyond that page is a concrete future bounded correctness
package. Local `createWithGuard` leaves `location_snapshot:null` (919); property
identity remains in payload, so do not label the local displayed address fully snapshotted.

## EST-001: estimate and revision source

- [Phase3Repository](../../src/lib/phase3.ts#L137) reuses the existing engine:
  `list/get` (793/805), `create` (844), `save` (932), `issue` (1029),
  `revise` (1063), `duplicate` (1121), `history` (1150). Connected calls use the
  existing checked RPCs; sample writes are explicit local state. Internal issue,
  customer-origin revision issue and repair-origin issue have different guards.
- [validateEstimate / calculateEstimate](../../src/domain/estimating/calculation.ts#L52)
  own schema and integer-money arithmetic. `types.ts:138,152` bind summary and version
  identity; `version_number`, `lock_revision` and `supersedes_version_id` are separate.
  Never recreate calculations or turn payment-schedule proposals into authorization.
- [Estimates](../../src/components/phase3/Estimates.tsx#L31), `EstimateEditor` (267)
  and customer presentation (1392) are the existing `/preview` > Estimates UI.
  [Phase3Workspace](../../src/components/phase3/Phase3Workspace.tsx#L11) keeps module and
  role checks. Branded HTML customer preview exists; a reviewed downloadable estimate
  PDF/export pipeline was not established by this audit and must not be marked complete.
- SQL: `public.estimates`, `estimate_versions`, `estimate_options`, `estimate_lines`,
  `estimate_schedule_proposals`, `estimate_templates`, `catalog_items`,
  `estimate_tax_policies` in `20261015204729_phase_3_estimating.sql:16–87`;
  canonical context (186), create (232/252), save (253/269), issue (270/287),
  revise (288/305) and duplicate (306/319). All thirteen historical migrations are immutable.
- [projectIssuedReview](../../src/domain/customer/review.ts#L174) requires issued status,
  tenant/customer/version and property (or exact independently established job binding).
  [projectRevisionScope](../../src/domain/estimating/revision-packet.ts#L20) is the narrow
  private-draft-safe projection; it is not an issued-status exception.
- Completed local customer work remains reusable: actual receipt review / confirmed
  revision via [CustomerChangeWorkspace](../../src/lib/customer-change-workspace.ts#L24),
  immutable [CustomerRevisionPackets](../../src/lib/customer-revision-packets.ts#L33),
  blocked [CustomerIssuanceReadiness](../../src/lib/customer-issuance-readiness.ts#L39),
  and separately confirmed [CustomerRevisedEstimateLoop](../../src/lib/customer-revised-estimate-loop.ts#L41).
  These 3A–3E chains are same-tab synthetic state, not a new operational decision ledger,
  genuine consent, crash-safe custody or permission to repeat their implementation.

Retained tests: `tests/estimating.test.ts` arithmetic/options/privacy;
`tests/database/phase3.test.ts` “server calculates exact estimate values and idempotent
creation” (214), cross-tenant customer/catalog/attachments (286), stale draft (311),
immutable issued versions (331), and SQL/TS arithmetic differential (868).
`tests/customer-change-revisions.test.ts:90,103,145,176,193,270` covers explicit review,
competing preparations, stale original version, current membership, wrong property and
repair-origin restrictions. `tests/customer-revision-packets.test.ts` and
`customer-revised-estimate-loop.test.ts` retain packet/source/UNKNOWN/side-effect evidence.

## EST-002: persisted request and broker boundary

[4B persistence](../CUSTOMER_REQUESTS_PERSISTENCE.md),
[broker integration](../CUSTOMER_BROKER_INTEGRATION.md), their validation records and
`CUSTOMER_BROKER_REVIEW.json` are authoritative over older preparation notes.
`src/lib/customer-requests.ts:91,136,155,177,233,291` defines strict body/reference/
receipt/status/staff-queue parsers and the prepared default-off port.
`src/lib/customer-connected.ts:232` supplies the existing exact-identity SDK.
`server/customer/broker-auth.ts:33`, `broker.ts:102,258` and
`broker-ownership.ts` compose verification, dedicated backends, admission, existing
ledger/receipt and current staff authorization. `PersistedCustomerRequests.tsx:12`
is read-only, default-off and unmounted; no connected staff action has been opened.

Pending customer14 owns private publication/access and `customer_review_decisions`
(`20261018144833_customer_authorization_release_readiness.sql:30,244`). Separate
unchanged `requests.proposed.sql` adds private principal/intent/outcome metadata
(5/20/40) and exact claim/receipt/status functions (110/186/220).
`broker.proposed.sql:4,68,100,109` adds server admission and receipt/staff wrappers;
`broker-ownership.proposed.sql` is a local proposal, not an operational installation.
There is no duplicate customer, property, estimate or decision business store.

Retained tests include `tests/database/customer-broker.test.ts`: actual multi-company
flow (366), concurrent instances (496), raw CRUD/SET ROLE denial (524), column denial
(606), drift before admission (631), actual backend replacement (935), no work/financial/
communication effects (1039), plus four actual client SIGKILL phases. These do not prove
physical DB/disk recovery, genuine hosted Auth or pre-admission database rewind protection.
Do not rerun those completed suites just for this sales inventory. Required acceptance
sequence and unverified privileged helper/installer/CREATE/statistics/operational custody
limits remain exactly as recorded in the broker review. UNKNOWN permits exact reads only.

## SAL-001: actual contracts, signatures, changes and communications

- [ReleasePreview](../../src/domain/release/preview.ts#L35) has serialized synthetic
  commands. `publish_offer` requires issued status (108); customer decision (134),
  accepted-offer contract (154), exact-hash/explicit-consent test signature (182)
  and later invoice (200) are separate commands. No automatic financial step runs.
  `/preview/release` is the internal laboratory; `/internal-release` and
  `/portal/internal` require separate server-controlled grants, never a preview fallback.
- Existing SQL `release_offers/decisions/contracts/signatures` (39/45/52/59),
  private `release_snapshot` (134), `release_command` (152), public invoker (240)
  and workspace reader (245/257) are in the unchanged eighth migration
  `20261016024502_release_1_internal_workflow.sql`. This is internal-test machinery,
  distinct from commercial contracts. Ordinary contracts/invoices/payments are
  database-disabled by `20261015221730_phase_3a_release_controls.sql:4–6`.
- [AgreementBinding](../../server/contracts/signing.ts#L13) binds exact tenant/customer,
  issued estimate version, accepted decision, template/consent versions, source PDF,
  signer and provider account/envelope/recipient. `verifySandboxAgreement` (155)
  checkpoints current authority, validates bounded PDFs/hashes and appends immutable
  sandbox evidence with `legalExecutionEnabled:false`. `prepareDocusignSandboxDraft`
  (304) creates a **plan** with `status:'created'`, not a sent envelope.
- [prepareEmbeddedSigner](../../server/contracts/docusign.ts#L33) requires current server
  identity/AAL2/customer authority and returns `dispatchEnabled:false`.
  `DocusignSandboxReader` (119) has authenticated demo GETs only;
  `PdfTrustValidator` (101) remains an injected independent trust requirement.
  Connect (256) authenticates/deduplicates raw notifications only as read triggers.
- [DurableAgreementStore](../../server/contracts/persistence.ts#L26) reuses restricted
  ProviderControl and create-only private evidence objects, with current-authority
  checkpoints and immutable digest CAS. Private
  `provider_agreement_bindings/evidence/inbox/control` exist in the tenth migration
  `20261016185108_provider_sandbox_persistence.sql:451,466,475,489`. Applied dormant
  schema is not activated provider acceptance or a trusted operational object adapter.
- Change orders currently mean existing internal job proposals/manager authorization:
  `Phase3Repository.proposeChange/approveChange` (1662/1686), `public.job_change_orders`
  and checked `propose_job_change/approve_job_change` in the fifth migration (40/131/137).
  Proposal/manager reference is not customer consent, signed change order or invoice
  conversion. A production contract amendment lifecycle remains a gap.
- [prepareTenantNotification](../../server/communications/preparation.ts#L191) and
  [DurableEmailPreparation](../../server/communications/persistence.ts#L19) reuse tenant
  sender/domain/recipient/consent/suppression checks and escaped content. Prepared
  delivery is disabled and provider request is null. No email is sent. Existing
  internal-sink messages are not customer delivery receipts or safe portal links.

Retained tests include `tests/database/release.test.ts`: exact accepted scope/hash/
consent (417), customer privacy (260), six ordered tenant pairs (286), duplicate/stale
acceptance (380), immutable records (515), no second full-price contract after accepted
revision (678). `tests/signature-provider.test.ts:80,142,158` covers binding/evidence,
revocation and no-send draft; `tests/provider-readiness.test.ts:271,353,380,390,417`
covers embedded signer denial, GET-only reader, account mismatch, Connect and immutable
store. `tests/communications-preparation.test.ts:65,219` proves escaped branded content,
no provider send and digest-only durable preparation. Provider ports use controlled
transports; they do not certify actual DocuSign/Resend/cryptographic/legal behavior.

Smallest next SAL package: an allowlisted contract-source and ceremony interface review
against the exact operational decision/version ledger and existing AgreementBinding,
with negative compatibility cases. Do not connect the laboratory's typed signature to
provider legal execution, copy internal-test consents into operational bindings, or
introduce a second contract engine. Genuine calls/templates/dispatch require separate
approval and are not part of this package.

## Shared identifier and projection contracts

| Handoff                                       | Stable identity / evidence                                                                                                 | Allowed output / boundary                                                                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inquiry → customer/property → estimate        | `organization_id`, `customer_id`, `service_location_id` → `EstimateInput.location_id`; exact existing CRM association      | Tenant selector/slug is discovery only. Preserve explicit staff selection; no fuzzy matching or auto-merging contact strings                                                           |
| Draft → issued source → review                | estimate ID, version ID/number, lock revision, supersedes ID, canonical calculation and immutable snapshots                | `customerPreview` is a projection, **not** authorization; only `projectIssuedReview` supplies issued/customer/property checks. Draft-safe packets use their separate narrow projection |
| Original request → revision → packet          | exact offer/publication, receipt/request, issued source, customer/property, draft ID/version/lock, packet hash             | Existing 3A–3E provenance and UNKNOWN holds; do not select whichever version happens to be latest                                                                                      |
| Persisted request → staff queue               | SQL admission/request/principal, exact version/source/body hash, current own session/mapping or eligible staff             | Existing 4B ledger/receipt, no raw internal estimate payload or staff note exposure; missing evidence is UNKNOWN                                                                       |
| Accepted source → contract/signature evidence | accepted decision + exact issued version + immutable template/consent/source hash + tenant/customer/provider/signer tuple  | Only explicitly approved binding; parsed PDF/HMAC/local hash is not legal signature proof                                                                                              |
| Customer delivery preparation                 | tenant provider account/domain/profile version, exact authorized document/customer, verified recipient/consent/suppression | Allowlisted scope/escaped content and digest records only; current preparation cannot send                                                                                             |

All money remains integer minor units with explicit currency. Internal unit/supplier
costs, margin, workforce rates, staff notes and private readiness evidence never enter
customer scope. Exact source ID preserves meaning; similar text does not create identity.
Other workstreams should consume these existing contracts rather than serialize full
repository rows, add shadow customers/properties, or manufacture financial authority.

## Bounded correctness fix and verification

The baseline `customerPreview` returned `company_snapshot`, `customer_snapshot`,
`location_snapshot` and `payload.project` by reference. Actual regression reproduced:
after `publish_offer`, changes to the caller-held issued object changed the subsequent
internal contract's selling scope for all three companies. Unexpected nested snapshot
fields also crossed the customer boundary. This is a local correctness/privacy defect,
not evidence of an exploited hosted route.

This package reconstructs those nested objects from the existing allowlist. Defined
customer fields/calculations/branding and authorization/issued-only/repair rules are
unchanged. No engine, schema, route, UI or provider adapter is added.
`tests/sales-contract-handoff.test.ts` uses the actual sample intake, CRM, estimate
create/issue/revise/save and internal offer/decision/contract APIs. Before the fix:
**4 failed / 1 passed**. After the fix: **5 passed**, including all three brands,
original issued history, customer/property/version denials, private-field exclusion,
detached snapshots and no signature/invoice/payment/real-message side effects.

Focused verification on this worktree:

- 170 application cases PASS across nine files: new sales handoff, estimating,
  release preview, customer access, customer preview, revision packets, revised
  estimate loop, signature provider and communication preparation. Counts overlap
  retained evidence and are not added to earlier totals.
- Strict types, focused ESLint and local build PASS. Initial new test fixture lacked
  required presentation context; corrected to the existing typed contract without
  changing any production authorization rule.
- Nine existing phase3 browser cases PASS across desktop/tablet/mobile: three-company
  estimate/private preview, version save/issue/history and operational axe/overflow.
  Three release accessibility/ordinary-hidden-module cases PASS across those viewports.
  Local isolated port4185; no connected credentials or provider requests.
- Retained baseline [Foundation CI run41270357940](https://github.com/eaglevisiondigital/eaglevisioncontractorplatform/actions/runs/41270357940)
  belongs to implementation commit `69548b1c328d9ae557953c2ca3904576f88f0d74`
  (1,606 application /661 native /234 browser checks in the delivery record).
  This is historical evidence, not CI for the uncommitted audit worktree. Integrator
  must record the exact new delivery SHA/run before upgrading CI status.

## Integration and rollback

Owned files only: this inventory, `src/domain/estimating/customer-preview.ts` and
`tests/sales-contract-handoff.test.ts`. The lead integrator owns shared register,
architecture/security/current state/decisions, shared tooling and Git handoff.
Merge the bounded patch into the integration branch only after review; retain draft
PR#1 and run normal CI. No PR merge or hosted rollout is authorized.

The source change preserves the declared projection shape while dropping unknown
nested fields and aliases. Rollback is a code revert with no schema/data migration;
it restores the reproduced alias/privacy defect, so do not silently roll it back.
Browser artifacts and private local test configuration are ignored, not business data.
No protected historical SQL/customer14/4B/P1/four artifacts/Netlify package/executor,
approved UI/artwork or prior owner approval was modified or revalidated as new evidence.
