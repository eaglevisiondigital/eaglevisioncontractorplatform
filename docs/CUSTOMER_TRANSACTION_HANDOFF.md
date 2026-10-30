# Workstream 3 · version-specific estimate change-request handoff

## October 30 · Workstream 3E local customer loop complete

[Exact synthetic issuance and customer return](CUSTOMER_REVISED_ESTIMATE_LOOP.md)
now complete actual3A->3B->3C->3D->3E in one tab. Separate synthetic confirmation,
existing version3 transition/internal_sink/issued-safe review and own exact receipt
preserve ordinary issue/connected/repair blocks. No real delivery or financial/legal
work authority. Next is finite connected-lifecycle integration review; no further
synthetic layers/hosted activation started. Earlier proposed/not-started notes below
remain historical. All release restrictions persist.

## October 30 · Workstream 3D local continuation

[Readiness review and delivery-content dry run](REVISED_ESTIMATE_ISSUANCE_READINESS.md)
now use the actual3A request, confirmed3B saved revision and immutable3C packet.
No issuing/sending/customer access/contract/work/financial authority. The next practical
3E is the separately reviewed local revised-estimate issuance and return-to-customer
review/response loop using existing engines and an internal sink. First authorize
its exact new local issuance boundary; no real communication/connected/financial
activation. Not started. Earlier implementation-not-started checkpoints remain historical.

## October 30 implementation continuity

Workstreams [3A](CUSTOMER_ESTIMATE_CHANGE_REQUESTS.md),
[3B](CUSTOMER_ESTIMATE_REVISIONS.md) and
[3C](CUSTOMER_REVISION_REVIEW_PACKETS.md) are now implemented locally. Actual customer
receipt -> explicit staff review -> existing-engine saved revision -> exact comparison
and separately confirmed immutable safe packet work in one tab. Earlier implementation-
not-started tables below remain historical handoff evidence. No issue/send/acceptance/
contract/work/financial/connected authority is added. Next proposed3D is an exact
packet/draft-bound local issuance/delivery preparation contract and dry-run preview;
it does not activate those actions. All existing release/recovery/Netlify gates remain.

Latest: [Workstream3A is implemented locally](CUSTOMER_ESTIMATE_CHANGE_REQUESTS.md).
The original2F handoff below is preserved as historical preparation; connected and
financial authority remain closed. Next proposed package is staff review/revision.

October 29, 2026 · prepared by Workstream 2F at base
`d8299f5de525f8efd0a9a7cf55dc5eebabd6d8dd`.
**HANDOFF READY · LOCAL SYNTHETIC ONLY · IMPLEMENTATION NOT STARTED.**

The next smallest substantive customer feature is **request changes to an exact
issued estimate version, with a bounded customer note and retained response view**
inside the existing property portal. It can proceed locally independently of
maintenance persistence/recovery/Netlify. This handoff identifies the precise next
package; 2F does not implement it or automatically launch another workstream. Prior
local development authority is not hosted/financial authority. No second visual
approval is requested; use the locked shell/components/palette without redesign.

## Existing lifecycle audit: do not build it twice

| Capability                                               | Existing source and actual boundary                                                                                                                                                     | Missing behavior / decision                                                                                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer property/inspection/attention/comparison/search | `PropertyPortalDesign`, `CustomerPortalPreviewModel`, existing safe report/context projections                                                                                          | Preserve complete approved experience, exact source navigation and all three brands                                                                                                                                   |
| Issued estimate review and comparison                    | `CustomerEstimateReview`; `projectIssuedReview`, `parseCustomerReview`, `compareCustomerVersions` in `src/domain/customer/review.ts`                                                    | Existing UI offers synthetic approve/decline, source report navigation and exact versions. Do not replace projection or reimplement comparison                                                                        |
| Change request                                           | `ReleasePreview.command('customer','decide_offer',...)`, `Decision.decision = changes_requested`, bounded 2,000-character `note`; `ReleaseApp` already exposes it in `/preview/release` | Property portal's `CustomerPortalPreviewModel.respond` accepts only accepted/declined and uses a fixed note. Bring the existing decision/note behavior into this customer journey; no new decision ledger             |
| Nonfinancial connected preference                        | `PreparedCustomerDecision`, `customer-connected.ts`, pending customer14 publication/decision contracts                                                                                  | Unwired and customer routes closed. Choice is approve_review/decline_review only; do not add changes_requested to this API/schema under a local UX package                                                            |
| Estimate delivery preparation                            | Release offer creates an `internal_sink` message; `server/communications/preparation.ts` prepares branded escaped content with sender/recipient/consent checks                          | No actual email/SMS, genuine expiring customer access, suppression/delivery acceptance or mounted delivery workflow. Do not claim delivered/opened from a local sink                                                  |
| Contract/scope handoff                                   | Existing `ReleasePreview`/`ReleaseApp` test contract, hash/consent/signature chain; `server/contracts/signing.ts` and `persistence.ts`                                                  | Existing internal accepted test offer can feed a test contract; actual legal templates/genuine accepted scope/provider evidence and activation remain separate. Portal review-only preference is never that authority |
| Branded invoice and payment schedule                     | Existing `ReleaseApp` invoice/print presentation, `Invoice`/`invoiceBalance`/`verifyLedger`, issued scope schedule proposals, internal release SQL                                      | Already implemented test-only financial chain; do not recreate. Genuine invoicing/credit/change conversion, payer/consent/tax/provider/connected acceptance remain gates                                              |
| Provider payment/settlement                              | Existing token-reference, restricted intent/refund/inbox and `reconcileStatement` foundations                                                                                           | No merchant/consent/tokenization/provider/callback/settlement activation or live financial path                                                                                                                       |

## Bounded implementation scope for the next package

1. Extend the existing **synthetic-only** `CustomerPortalPreviewModel.respond` and
   shared customer-review presentation with a third request-changes action and a
   customer-authored note (trimmed, nonempty for changes, maximum 2,000 characters).
   Route to the already-existing `decide_offer` engine for the exact version's offer.
   Keep explicit synthetic acknowledgment and the existing terminal one-response rule.
2. Display the existing decision and safe customer note for the **same** estimate/
   version/customer/property. Use a focused composer/confirmation and receipt/status
   in the existing card pattern; no redesign, new page system or broad new timeline.
   Existing `/preview/release` remains functional and unchanged where possible.
3. Preserve issued versions, amounts, scope, lines, report identity and expiry.
   A change request does not edit the estimate, change totals or create a new version.
   If another issued version exists, retain each version's exact response separately;
   no inherited acceptance, automatic supersession or assumption that an old offer
   was revoked. Clear unsaved note/consent on company/property/version context change.
4. Preserve unavailable/expired/duplicate/busy/error/empty states, keyboard focus,
   labels, note limit and screen-reader feedback. Disable repeat submission while
   pending. A late/uncertain response cannot appear as another property's success;
   exact local read reconciliation only, no automatic resubmission/new request.
   Do not claim browser-refresh durability from the session-only model.
5. Keep exact report/attention/comparison links in the same authorized property.
   Use only existing evidence fields. If an exact source/version relationship is
   unavailable, label unavailable rather than inventing one or following a latest-
   report shortcut. Render notes as text, never HTML; exclude private staff notes,
   supplier prices, rates, margins, payroll and unissued repair drafts.

The permitted demonstration is `/preview/property-portal` → existing issued estimate
review → select exact version → request changes with note → see retained local
version-specific preference. It must work for all three synthetic companies and a
property without issued estimates. The requested note is customer input attached to
the existing decision, not a contractor maintenance note or consent/legal artifact.

Do **not** add fake authentication, an expiring live link, a send button with side
effects, customer mappings/leases, connected handlers, SQL, real signatures, invoice
creation, payment schedules as obligations or any provider call. The demonstration
must not call `create_contract`, `sign_contract`, `create_invoice`,
`authorize_payment`, capture/refund or debt mutations. Existing internal lifecycle
fixtures remain separate. A future staff revision workflow and legal/contract handoff
are later bounded packages with explicit requirements, not automatic follow-on work.

## Implementation handoff and completion evidence

Primary edit candidates: `src/lib/customer-preview.ts`,
`src/components/property/CustomerEstimateReview.tsx`, existing portal callback/type
composition only as needed. Reuse `src/domain/release/preview.ts` unchanged if its
existing enum/note/current-offer rules suffice. Do not alter the connected decision
enum, pending migration, production route gates or estimating engine.

Focused checks for the next implementation, **not tests performed in 2F**:

- Valid change request/note, blank/over-limit/malformed input, explicit acknowledgment,
  duplicate/expired/wrong-version decisions; immutable before/after scope/price hashes.
- Contractor/customer/property/estimate/version isolation; switch during async submit,
  clear unsaved state, exact source links, read-only uncertain-result handling.
- Customer-safe projection/private-field exclusion; no financial/contract/dispatch
  calls or authority from any preference. Existing approve/decline remains functional.
- Real desktop/tablet/mobile browser and accessibility tests for all three palettes,
  composer focus/labels/validation/status, empty/error/loading; approved layout/logo
  preserved. Focused application tests, types/lint/build/integrity and automatic CI.

Exit: a working local customer action and retained exact-version result, screenshots
and targeted evidence, committed to the existing draft PR. No migration, hosted Auth,
maintenance adapter or recovery acceptance is a prerequisite for this local package.
Any later connected change-request persistence requires independent schema/API/privacy/
custody review and authorization; do not reuse a synthetic decision as real consent.

The wider lifecycle remains in Release1.0 scope. See
[acceptance](RELEASE_1_0_ACCEPTANCE.md) and
[proposed billing requirements](BILLING_ENHANCEMENTS_PROPOSED.json). Release 1.0 remains
**NOT READY / NOT AUTHORIZED**; no deployment, financial activation or merge.
