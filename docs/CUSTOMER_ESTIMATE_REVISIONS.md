# Workstream 3B · customer request review and estimate draft revision

October 30, 2026 · base `e0d1cd27b55ca7196270c5f830b802b116f31fa9`.
**IMPLEMENTED · LOCAL SYNTHETIC ONLY. Release 1.0 NOT READY / NOT AUTHORIZED.**

## Working customer-to-staff demonstration

Run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4173`.
Open http://127.0.0.1:4173/preview/property-portal in one tab.

1. In **Estimates & repairs**, request changes to **version 2**, enter an
   explanation, acknowledge the synthetic review and explicitly record the request.
2. Expand **Development-only preview controls** and choose **Open local staff
   estimate review**. This moves the same tab to http://127.0.0.1:4173/preview,
   selects the exact sample contractor and opens the existing **Estimates** module.
3. The **Customer change requests** panel shows the actual existing 3A decision,
   explanation, timestamp, receipt, offer, customer, property and issued version.
   **Review request version 2** loads the current exact source and its review token.
   **Open exact issued version** opens immutable source evidence in the same editor.
4. Check the explicit staff confirmation and choose **Prepare revised estimate
   draft**. The existing Phase3Repository revision engine creates **version 3** of
   that same estimate, superseding exactly version 2. No scope or price is inferred
   from the customer's text. Original payload/calculation are cloned for staff edits.
5. Edit scope using the existing builder and save: the draft lock revision advances
   from 1 to 2. Expand **Exact revision provenance** to see the unchanged customer
   receipt/offer, original version, property, reviewer, timestamp and draft ID.
   **Version history** retains both issued originals and the private new draft.
6. **All estimates** restores the request queue. **Read exact revision status**
   opens the already prepared draft through a read; it never creates a replacement.
   **Open local customer portal** returns to the original issued scope and receipt.
   The private draft, staff provenance and internal edits are excluded.

Repeat with each of the three sample contractors. A fresh staff workspace has no
requests until a customer actually records one. No sample request button or invented
request is supplied. An older version-1 request can be read, but cannot revise the
current version; its historical missing property binding is also an explicit hold.

## Shared state, provenance and authority

The approved portal uses a per-company model registry sharing the same existing
preview Operations (CRM/memberships) and Phase3Repository (actual estimate versions)
as the contractor App. Its existing PropertyRepository fixture instance stays separate
from the contractor's instance: portal inspection examples must not populate the
staff maintenance queue. This is a controlled receipt/estimate handoff using existing
classes, not another property or inspection system.
The isolated Phase A/legacy previews retain their own repositories and presentation.
Only existing ReleasePreview decisions with `changes_requested` are projected to
staff. Receipt/offer/version/customer/property are checked against the original
engine and current CRM context. A return from staff pins the original customer and
primary property even if CRM ordering changed; missing context fails closed.

The handoff uses the existing App's same-tab navigation. A URL or browser history
state selects synthetic presentation only; it supplies no connected authority.
There is no localStorage, database, broadcast, import/export or remote bridge.
A reload, browser crash or new tab loses this in-memory demonstration; this is not
durable custody, genuine authentication or operational staff authorization.

Current synthetic owner/admin/office-manager/estimator membership is checked during
review, after asynchronous reads, at the final synchronous engine commit and on
subsequent draft saves. Inactive, field, employee and foreign-company actors reject.
UI uses the existing sample owner membership, never a new identity or role grant.
Confirmation checks the complete reviewed request/source plus current version and
lock revision. Stale reviews cannot revise another source or rebind customer/property.

Phase3Repository keeps the existing estimating calculation and version engine. Its
revision entry now rejects stale source IDs/snapshots, archived records and repair
origins; it records the true current issued version as `supersedes_version_id`.
One private provenance binding stores the exact original receipt snapshot separately
from EstimateInput. It is neither a second decision ledger nor a customer projection.
Ordinary revise/duplicate/job-baseline paths cannot bypass a recorded change request.
Prepared customer revisions cannot issue, duplicate, revise again or establish a job
baseline. Customer/property remain immutable on save. Repair-origin preparation,
source guards and readiness remain separate and restricted; no repair issuance opens.

## Pending and UNKNOWN

A synchronous per-receipt hold is installed before calling the async revision engine.
A second concurrent or later attempt rejects. The draft identity/provenance is
installed at the engine's last synchronous precommit checkpoint; missing or malformed
acknowledgment retains **UNKNOWN**. No hold is deleted, no automatic retry/new ID,
replacement or startup continuation exists. Exact read-only reconciliation compares
receipt, original source, property, reviewer and the saved draft before showing it.
Absent evidence stays undetermined. A prepared draft may be opened again; this is
not replay. Holds last only for this tab's heap and do not claim crash durability.

Notes render as React text. Staff notes, private pricing/costs, margins, workforce,
readiness and unissued draft content never enter customer-safe projections. A request
or staff review is not acceptance, a contract, repair completion, invoice, payment,
customer debt or work authorization. No contract/financial command is invoked.

## Verification and evidence

See [validation record](CUSTOMER_ESTIMATE_REVISIONS_VALIDATION.json).
**178 focused application cases pass**, including **27 new cases**. Coverage includes
all three companies, original issued-version fidelity, exact actual receipts, manual
confirmation, concurrent duplicate prevention, wrong company/customer/property/source,
stale reviews, role eligibility/revocation, CRM reordering, repair holds, optimistic
save conflicts, UNKNOWN before/after commit and read-only reconciliation.

**57 unique focused browser cases pass**, including **12 new cases** across desktop,
tablet and mobile. Actual customer request → staff review → editable/saved version 3
→ exact read reopen → customer return is exercised for all three companies. Axe has
zero violations in the tested review and editor states; no horizontal overflow or
external requests. Existing portal actions, delayed-context protections, contractor
pixel/reference/navigation and estimate editor flows remain passing. The final
18-case run verifies the 12 new cases plus the three corrected CRM-return and three fixture-isolation regressions;
the other39 previously passing cases are retained without redundant reruns.

The first delivery CI passed1423 application/PGlite and570 native database cases,
but3 of198 browser cases exposed portal inspection examples entering the staff
maintenance queue. The handoff was narrowed to shared CRM/estimate state while
preserving separate existing inspection fixture instances. The unchanged isolation
assertions and a new domain regression verify this correction; no test was relaxed.

Initial tests found low contrast in new evidence labels (corrected with a scoped
rule), a transient-save-message test assumption (assertion now checks actual saved
revision), and CRM first-row rebinding on portal return (fixed by pinning original
identity). No accessibility rule, security assertion or timeout was weakened.

Actual Chromium screenshots live under ignored `artifacts/property/`:
`customer-revision-{desktop|tablet|mobile}-{sample-property|sample-construction|sample-roofing}-{staff-review|staff-review-detail|revised-draft|revision-detail}.png`.
They show synthetic request text, confirmation, version 3, exact provenance and
editable draft. Detail captures are readable at mobile size; full captures retain
contractor context. Approved logo/artwork, palettes and layout CSS are unchanged.

Lint, strict types, type generation comparison, build, formatting, migration/property/
customer proposal and protected-file integrity checks pass.495 protected tracked
files match the starting commit, as do all four private P1 artifact hashes and the
frozen original Netlify archive hash. No Netlify executor/recovery/security tests
were repeated locally. Automatic GitHub CI remains the repository's broader check.

All13 historical migrations, pending customer14, P1 operation/approvals/four artifacts,
locked interfaces and Netlify/recovery/financial/connected restrictions remain. No
credentials, hosted writes, messages, Auth/DB activity, deployment or merge.

## Proposed Workstream 3C

Implement a local staff revision review and customer-safe difference preview against
the exact original request/issued version. Require a saved current draft/CAS and
explicit staff confirmation to prepare an immutable review packet, retaining repair
holds, UNKNOWN handling and no financial/contract/work authority. Preview only:
no automatic issuance, sending, publication, connected access or customer acceptance.
3C is a recommendation, not started or authorized by 3B.
