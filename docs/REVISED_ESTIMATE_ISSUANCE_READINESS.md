# Workstream 3D · revised estimate issuance readiness and delivery-content dry run

October 30, 2026 · base `467c1ee2e0d474811d8d3f4149cc394b71ccc41f`.
**IMPLEMENTED · LOCAL SYNTHETIC ONLY. Release 1.0 NOT READY / NOT AUTHORIZED.**

## Working local demonstration

Use http://127.0.0.1:4173/preview/property-portal in one tab. If the local server is
not running, `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4173`.

1. Record an actual **Request changes version 2** with an explanation in **Estimates
   & repairs**. Use **Development-only preview controls → Open local staff estimate
   review**. In `/preview` **Estimates**, review/confirm that receipt and **Prepare
   revised estimate draft** through the existing 3B workflow.
2. Edit the private version 3 using the existing builder. Save its scope, customer
   notes, expiration and terms. Open **Revision comparison & packet**, inspect and
   confirm the exact saved comparison, then **Prepare Customer Review Packet**.
3. Choose **Issuance readiness & delivery dry run**. The new section is titled
   **Revised Estimate — Ready for Issuance Review**. It shows the actual company,
   customer/property, request, original/revised selling totals and saved revision.
   Expand **Exact readiness source and integrity** for receipt/offer, original issued
   ID, draft ID, packet UUID/SHA-256 and canonical customer-scope SHA-256. Expand
   **Scope, dates, terms & change details** to reuse the existing exact comparison.
4. Read the PASS, BLOCKED and UNVERIFIED requirements. Check the explicit review-only
   confirmation and choose **Review Issuance Requirements**. This records a local
   immutable result, always **BLOCKED** for genuine issuance/delivery. It creates no
   approval, capability, issued estimate, offer, customer link or financial authority.
5. Choose **Delivery-content preview**. Inspect the suggested subject, branded HTML,
   text body and escaped HTML. Source/request references, proposed version, scope,
   customer amounts, dates, terms and schedule are included. Sender/recipient/link
   remain absent; no address is resolved, no outbox or provider call is made.
6. Return to the builder and make an unsaved edit: the review action is blocked.
   Save a later revision: the earlier packet cannot start a new readiness review.
   **Open readiness result revision 2** retains the old result/content/hash as stale.
   A newly saved draft requires a new 3C packet and explicit 3D confirmation.
7. Return through **All estimates → Open local customer portal**. Only original
   issued versions and the actual customer receipt appear; private drafts, packets,
   readiness evidence and delivery previews stay staff-only.

All three contractor examples work. Ordinary drafts and connected customer routes
have no new preparation surface. New tabs/reload/process loss discard this example;
it is not genuine Auth, operational consent, delivery evidence or durable custody.

## Reuse and exact bindings

`CustomerIssuanceReadiness` composes the confirmed `CustomerChangeWorkspace`,
`CustomerRevisionPackets`, current CRM/staff and `Phase3Repository` saved-state reads.
No second estimate engine, property model, customer database or financial ledger.
The existing canonical calculation and strict 3C projection remain authoritative.
`projectIssuedReview` and its issued-only protection remain unchanged.

The reviewed context pins the complete original receipt/offer and issued source,
current saved draft/version/lock revision, eligible synthetic actor, exact tenant/
customer/property, original report association, current packet UUID/hash, full private
source/calculation context and current local tax policy. The customer-scope hash covers
only allowlisted scope. Private context is held inside an opaque review claim and
never serialized into delivery content or the result snapshot.

The final synchronous checkpoint rechecks all bindings and a live editor reader after
hashing, before storing the result. A dirty editor, closed component, stale/foreign/
inactive/revoked context, changed tax/source/calculation or repair-origin conflict
cannot pass. Current tax reads are local-only; no hosted query is added. A UTC-day
change invalidates the reviewed date evidence. `Phase3Repository.issue`, including its
customer-revision and repair-origin restrictions, is byte-identical to the base.
Neither the dry-run service nor UI imports or calls issue_estimate.

`LocalIssuanceReviewRecords` retains cloned/frozen local review snapshots and returns
copies. A one-shot hold precedes the first await; one result per exact request/draft/
revision/packet is permitted. Concurrent staff cannot produce duplicates. Lost or
invalid acknowledgment, failed integrity evidence or ambiguous commit retains UNKNOWN.
That hold blocks later-revision bypass too. **Read exact readiness status** validates
only the originally reserved result and complete snapshot/hash/packet/source binding.
Absent evidence stays undetermined; no replay, replacement ID or automatic continuation.
Historical reads derive current/stale status outside the immutable result.

## What the requirement statuses prove

| Condition                               | Actual local evidence / limitation                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Exact request/source and current packet | PASS only after actual 3A/3B provenance and verified 3C packet checks                                                                     |
| Synthetic staff                         | PASS for current active eligible sample membership; never genuine operational Auth                                                        |
| Local tax policy                        | PASS only if the saved reviewed snapshot equals the current active reviewed local policy; mismatch/missing evidence is BLOCKED            |
| Expiration and terms                    | PASS means unexpired as of the checked UTC day and terms present; expired/missing terms are BLOCKED, legal suitability remains UNVERIFIED |
| Revised-estimate issuance               | BLOCKED by the unchanged existing engine restriction                                                                                      |
| Sender/domain authentication            | UNVERIFIED; no active account/domain or current SPF/DKIM/DMARC evidence resolved                                                          |
| Verified recipient                      | UNVERIFIED; no contact/address resolution or verification performed                                                                       |
| Consent/preferences/suppression         | UNVERIFIED; no permission inferred from the customer change request                                                                       |
| Secure customer access                  | BLOCKED; connected routes remain closed, no mapping/lease/expiring link                                                                   |
| Operational authorization               | UNVERIFIED; genuine Auth, durable custody, legal/tax approval and separately approved issuance/delivery remain prerequisites              |

The overall review is always BLOCKED for genuine execution. A local PASS is a factual
check, not approval to issue, send, authorize work or create an obligation. UNVERIFIED
requirement evidence is distinct from UNKNOWN recording outcome.

## Customer-safe delivery content

The existing communication escape and branded-document wrapper were extracted into a
pure shared formatter. The established server notification HTML remains byte-for-byte
compatible; sender verification, recipient/consent checks and provider contracts are
unchanged. Browser code imports only pure formatting, never the server verifier,
credential reader, repository, persistence or transport.

The 3D formatter takes the existing strict 3C comparison. It copies allowed customer
scope/amounts/terms and exact original-request/version references, not internal costs,
supplier pricing, margins, staff notes, payroll/workforce or private repair evidence.
Subject line breaks are removed; every dynamic HTML field is escaped. Contractor
palette color must be a literal hex color. No logo is invented or regenerated.
Plain-text and HTML alternatives are retained. `from`, `to`, `reply_to`, `secure_link`
and `providerRequest` are null; delivery is disabled. No recipient field, outbox,
network transport, customer action or delivery-success flag is available.

The real staff HTML preview uses a script-disabled sandbox and restrictive CSP, with
explicit title/language/direction, semantic headings, readable text and no links/forms/
external assets. It is not a live customer page. No communication is sent for testing.

## Verification and evidence

See [validation record](REVISED_ESTIMATE_ISSUANCE_READINESS_VALIDATION.json).
**253 focused application cases pass (26 new), and60 unique browser cases pass
(12 new)** across all3 brands/viewports. Final12-case presentation verification passes;
48 other successful regression cases are retained. Zero axe violations/overflow in
the exercised states. Lint, strict/generated types, build, formatting and migration/
property/customer integrity checks pass.509 protected existing files, the original
issue method, P1 operation/four private artifacts and frozen Netlify archive match
the base.
Focused application coverage includes all companies' actual3A → 3B → 3C → 3D flow,
canonical amounts/tax/discount, original immutability, exact receipt/packet/scope hashes,
current/stale/dirty transitions, changed tax or calculation, source mismatch, duplicate/
concurrent staff, inactive/revoked/foreign staff, repair restrictions, lost before/after
commit acknowledgment, pending/UNKNOWN no replay, exact reconciliation and no issue/
financial/network side effects. Existing communication verification and 3B/3C remain.

Actual browser checks cover desktop/tablet/mobile, all contractor palettes, current
and stale results, keyboard confirmation, escaped notes, unchanged customer return,
ordinary/connected-route closure, approved contractor pixel/navigation and existing
estimate/module regressions. The script-disabled opaque frame prevents axe's own
messaging/timers from running. Parent controls (including frame title) are audited
separately, and the exact unchanged srcdoc bytes are audited in a test-only root
browser document at the frame's dimensions. The actual frame's headings, literal
notes, lack of script/image/link/form elements and overflow are also checked. Sandbox,
CSP and accessibility rules are not weakened; no runtime test hook is added.

Real unedited captures live under ignored `artifacts/property/` and the existing CI
screenshot artifact:
`issuance-readiness-{desktop|tablet|mobile}-{sample-property|sample-construction|sample-roofing}-{review|review-detail|review-viewport|delivery|delivery-viewport|stale-delivery}.png`.

Initial test fixture ordering asked for a reviewer before its existing company
workspace was initialized; corrected in tests. An existing field's exact accessible
name was corrected to Estimate terms. Axe's opaque-frame limitation and its CommonJS
import were corrected in the test harness. A live editor ref moved into a layout
effect to satisfy React's lifecycle rule. No permission, timeout or assertion relaxed.

All13/customer14, frozen P1 operation/four artifacts/approvals, original Netlify package/
executor, 2A–2F and six PROPOSED billing enhancements remain unchanged. No completed
Netlify/recovery/maintenance-security suites are rerun locally. Normal automatic CI
remains the broader check. No credentials, hosted writes, messages, providers, financial
execution, deployment, publication or merge. Full customer lifecycle stays Release1.0
scope; no acceptance or release gate is promoted from this dry run.

## Proposed practical Workstream 3E

Complete the revised-estimate return-to-customer loop in a separately authorized
local-only package: explicitly controlled synthetic issuance of the exact reviewed
saved revision through the existing version engine, then its existing issued-safe
customer review and actual version-specific response flow using an internal sink.
That package must first review the precise new local issuance boundary; do not bypass
or weaken today's issue restriction from 3D evidence. Reuse existing offer/decision
and immutable-version engines, preserve originals/repair holds/UNKNOWN and enable no
real email/SMS, connected access, contracts, work, invoices or payments. This is the
next substantive transaction behavior, not another dry-run layer, and is not started
or authorized by 3D.
