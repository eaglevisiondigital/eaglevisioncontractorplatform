# Workstream 3A · customer estimate change requests

October 30, 2026 · base `9a1839c3f19b29cca246c790ee01fab8495bec82`.
**IMPLEMENTED LOCAL SYNTHETIC ONLY. Release 1.0 NOT READY / NOT AUTHORIZED.**

## Working customer flow

Open `http://127.0.0.1:4173/preview/property-portal` with the existing local preview
server (`npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4173`).
Choose **Estimates & repairs**, then **Request changes version 2**. Enter a customer
explanation, acknowledge synthetic review, choose **Review preference**, check the
exact contractor/customer/property/estimate/version and note, then **Record synthetic
change request**. The same card displays the existing engine's decision, trimmed
note and receipt. Preview approve/decline use the same explicit confirmation flow.

Development-only controls allow the three existing contractor examples. A property
without issued estimates retains its existing empty state. Switching contractor,
property, selected version or form action discards unsaved note/acknowledgment.
The original isolated Phase A design and legacy customer preview retain their
previous presentation; the new controls are explicitly enabled only in the approved
local property portal. No navigation, palette, artwork, typography or back-office
redesign. New textarea uses the existing portal font, borders and focus treatment.

## Reused engine and exact identity

`CustomerPortalPreviewModel.respond` accepts the existing `Decision` enum, including
`changes_requested`; it calls only the existing `ReleasePreview.decide_offer`.
There is no second decision engine, database or ledger. Change explanations must be
strings, trimmed, nonempty and at most 2,000 characters after trimming. Explicit
synthetic acknowledgment, exact authorized version/customer/property and unexpired
issued scope **and** engine offer are required. Missing publications reject. The
customer-safe wrapper reports actual offer availability without widening connected
review contracts. The engine retains its one-response-per-offer rule.

The existing decision row is the receipt: exact offer/version binding, ID, timestamp,
choice and safe customer note. No issued scope, quantities, prices, source report,
line identity or version is changed. Another version neither inherits this preference
nor becomes automatically approved/rejected/superseded. The portal never invokes
contract, signature, invoice, payment, dispatch or debt commands from this action.

## Pending, uncertainty and privacy

A synchronous session-only attempt marker prevents duplicate submissions before
awaiting the existing queued engine. It tracks transport outcome, not another
business decision. Response loss or a changed/logout context retains UNKNOWN; receipt
absence never allows resubmission. **Read exact review status** performs an exact
current-property read matching the original offer/choice/note; it does not execute,
continue or replace a command. A found receipt confirms that original result only.
Missing evidence stays undetermined. No retry/new identity is generated.

Forms have independent keyed lifetimes and pending guards. Late completions cannot
show success in a new contractor/property/version; returning to the original context
can display or explicitly reconcile that original receipt. Notes render as React
text, never HTML. Immutable allowlisted report/selling-scope projections remain
unchanged; no staff notes, supplier costs, margins, payroll, unissued repair drafts
or private readiness archives are added. Form identity uses existing synthetic CRM
customer/property labels, not invented customer records.

This remains an in-memory demonstration. Reload/browser crash loses local state;
there is no durable browser intent, genuine customer authentication, remote custody
or production consent claim. The connected decision choices, customer14, mappings,
leases, routes, Auth configuration and operational maintenance interfaces are untouched.

## Verification and real browser evidence

**106 focused application cases and54 unique focused browser cases pass**, including
18 new browser cases and19 new application cases. The final concurrent browser run
passed51; three desktop timeouts passed an unchanged serial rerun. No assertions or
time limits were weakened.476 protected existing files/four frozen P1 hashes match
the starting commit; lint/types/build/format and offline integrity pass.

See [validation record](CUSTOMER_ESTIMATE_CHANGE_REQUESTS_VALIDATION.json) for exact
counts, initial harness failures and final corrected evidence. Focused application
coverage includes all three companies, malformed/blank/limit input, acknowledgment,
approve/decline, wrong version, expiry/unavailable offer, duplicates, immutable scope,
foreign customer/property/company isolation and before/after-commit response loss.
Actual browser coverage exercises all three approved palettes on desktop/tablet/mobile,
keyboard focus, acknowledgment/confirmation, text safety, empty states, context reset,
expiry and accessibility. A test-only Vite-bundled real-component composition delays
callbacks and switches property/company/version; it is injected into an intercepted
test document, never an App route, hosted service or authentication substitute.

Screenshots are actual local Chromium captures under ignored `artifacts/property/`:
`change-request-{desktop|tablet|mobile}-{sample-property|sample-construction|sample-roofing}-{form|form-detail|recorded|recorded-detail}.png`.
Detail captures preserve readable forms and receipt/note evidence; full-page images
preserve portal context. They contain synthetic examples only. Existing portal,
Phase A, original customer and contractor Phase B regression protections remain.

All thirteen historical migrations, pending customer fourteen, frozen P1 operation/
four artifacts and existing approvals remain unchanged. 2F F00–F11/D001/D002/D009
operational NO-GO, recovery/Netlify restrictions and six PROPOSED billing enhancements
remain unchanged. No real credentials/Auth, external sending, provider/financial
execution, hosted write, migration, deployment, outside access or merge.

## Next bounded Workstream 3B

Provide a **local contractor review of customer change requests and explicit revision
preparation**: expose the existing exact offer/version decision and customer note
to authorized synthetic staff; keep staff review separate from customer preference;
allow a deliberate handoff to the existing estimate revision workflow after current
source/version and repair-origin checks. Preserve the issued original and link any
new draft back to that exact request/version. No note parsing as authority, automatic
revision/acceptance, new estimate engine/decision ledger or issuance. Define duplicate/
stale/UNKNOWN and staff privacy tests for that package. This recommendation does not
start 3B or authorize hosted, contractual, financial or customer-connected activity.
