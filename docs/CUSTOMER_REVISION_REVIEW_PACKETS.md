# Workstream 3C · revision comparison and immutable review packet

October 30, 2026 · base `4e5b0dbb6aa9640603f3b6ba0b2f82514190faf3`.
**IMPLEMENTED · LOCAL SYNTHETIC ONLY. Release 1.0 NOT READY / NOT AUTHORIZED.**

## Working demonstration

Use the existing local build/preview server at
http://127.0.0.1:4173/preview/property-portal. If needed, run `npm run build`, then
`npm run preview -- --host 127.0.0.1 --port 4173`. Keep the demonstration in one tab.

1. In **Estimates & repairs**, choose **Request changes version 2**, enter the
   customer's explanation, acknowledge synthetic review and explicitly record it.
2. Expand **Development-only preview controls** → **Open local staff estimate
   review**. The existing `/preview` **Estimates** module shows that actual receipt.
   Review the request, confirm it, and **Prepare revised estimate draft** through
   the existing 3B workflow. No fabricated request or inferred note-to-scope changes.
3. Use the existing builder to edit version 3 and **Save estimate draft**. Its saved
   lock revision advances. **Revision comparison & packet** opens the exact original
   issued version 2 versus that saved private draft, not another latest estimate.
4. Inspect exact request/source evidence, line additions/removals/modifications and
   unchanged lines; quantities, units and customer selling amounts; canonical totals,
   discount, tax, scope, dates, terms, notes, proposed schedule and attachment metadata.
   Desktop/tablet show two columns; mobile stacks explicitly labeled versions.
5. Confirm the current saved comparison, then explicitly **Prepare Customer Review
   Packet**. **Prepared packet preview** shows the retained snapshot, packet UUID,
   SHA-256, timestamp and synthetic reviewer. It is labeled **Customer Review Packet
   — Staff Preview Only** and **Draft Estimate — Not Issued or Sent**.
6. Return to the builder, edit and save again. The earlier packet remains readable
   with identical contents/hash and is marked **Stale for further use**. A new saved
   revision needs a newly opened comparison and separate confirmation. Saving alone
   never prepares a packet. Previously prepared evidence remains in history.
7. Return through **All estimates** → **Open local customer portal**. The customer
   still sees the original issued scope and their exact receipt. Private drafts,
   packets and staff notes never enter the customer view.

Repeat with all three existing sample contractors. Ordinary drafts, retained isolated
concepts and connected customer routes do not expose packet preparation. There is no
customer URL, expiring link, response/acceptance surface, download, email or publication.
Reload/new tab/process loss clears this in-memory example; it is not durable custody.

## Reused sources and narrow projection

`CustomerRevisionPackets` composes the actual `CustomerChangeWorkspace` request,
confirmed 3B attempt, exact private revision provenance, current CRM property and
`Phase3Repository.customerRevisionState`. Existing estimating versions/history,
`calculateEstimate`, tax snapshots, saved editor and source report projections remain
authoritative. No new estimate engine, customer/property system, schema or ledger.
Portal/staff inspection fixture instances remain separate; shared CRM/estimate state
retains the approved 3B handoff and original customer/property on return.

`projectIssuedReview` remains unchanged and rejects drafts. The narrow
`projectRevisionScope` verifies issued/draft status, tenant/customer/property/estimate,
unique line identity and saved calculation equality with canonical recalculation using
the saved reviewed tax policy. It constructs every customer-facing nested object
explicitly. It never serializes an internal EstimateVersion, EstimateInput, company/
customer snapshot or full calculation into a packet.

Allowed snapshot fields:

- Contractor name and approved palette; customer/property name and exact references.
- Original issued version ID/number/time and revised draft ID/version/saved revision.
- Original actual receipt ID, offer ID, changes-requested decision, safe note and time.
- Existing exact published report ID/version, finding and source line association,
  when recorded. Missing association stays explicitly absent.
- Project scope/dates, currency/expiration, customer notes/terms, included line IDs,
  descriptions/quantities/units/selling amounts, canonical subtotal/discount/tax/total,
  proposed schedule and explicitly selected customer-visible attachment name/type.
- Structured exact-ID differences, unchanged fields and amount deltas; creation time,
  responsible synthetic reviewer, stable packet ID, schema marker and integrity hash.

Internal costs, supplier prices, margins/profit, internal notes, payroll/employee rates,
private repair/readiness data and unrelated records are excluded. Attachment metadata
requires one exact customer-visible snapshot for the selected document; no file URL or
bytes are copied. A SHA-256 proves snapshot-byte integrity within this local model;
it is not a signature, genuine review, customer approval or delivery receipt.

## Authority, concurrency and uncertainty

The comparison is bound to the exact original issued version from the customer's
receipt and the current saved draft produced by that request. Similar wording never
matches different line IDs. Notes do not automatically change scope. Neither absence
nor a staff review implies physical repair, customer authorization or payment.

Current eligible synthetic membership, actual full receipt/offer/source, CRM binding,
current draft/version/lock revision, exact saved editor payload and repair-origin hold
are checked before preparation. An opaque review claim binds the full private context
and displayed comparison; copying or changing that claim rejects. Dirty/stale/foreign/
inactive/revoked inputs fail closed. The same checks run at the last synchronous
archive commit after hashing and again before accepting the acknowledgment.

One session hold is installed before the first asynchronous operation. Both service
and archive reject duplicate preparation for an exact tenant/request/draft/revision.
Concurrent staff cannot produce two packets. Loss before/after commit, invalid receipt
or integrity evidence retains **UNKNOWN**. An unresolved attempt blocks later-revision
bypass too. **Read exact packet status** only reads the originally reserved UUID and
compares the complete expected snapshot/hash/source binding; missing evidence stays
undetermined. No retry, replacement ID, replay or automatic continuation exists.

The archive freezes a cloned snapshot and returns copies. Later draft edits affect
computed current/stale status outside the snapshot; they cannot rewrite retained
packet contents. Reading/reconciling rechecks current staff and original bindings.
Session memory is not genuine Auth, crash/refresh durability or operational custody.

## Verification

See [validation record](CUSTOMER_REVISION_REVIEW_PACKETS_VALIDATION.json).
**203 focused application cases pass (25 new)** and **93 unique focused browser
cases pass (12 new)**. Final stable-build verification passed15 cases, retaining78
other prior passes. Two earlier navigation failures overlapped rebuilding served dist
files; both pass unchanged assertions/timeouts against the stable build. No product
permission or test expectation was weakened. Focused tests exercise actual 3A → 3B → 3C for all companies,
unchanged/added/removed/modified lines, canonical tax/discount/schedule consistency,
original immutability, dirty/stale/CAS/role/repair/privacy guards, concurrent duplicates,
UNKNOWN before/after commit, exact reconciliation and frozen old/new revision evidence.
Browser checks exercise the real saved editor, keyboard confirmation, packet history,
customer return, all three brands, desktop/tablet/mobile and axe/overflow protections.

54 actual unedited Chromium captures are generated under ignored `artifacts/property/`:
`revision-packet-{desktop|tablet|mobile}-{sample-property|sample-construction|sample-roofing}-{comparison|comparison-detail|comparison-viewport|packet|packet-viewport|stale-packet}.png`.
The existing CI screenshot artifact collects these files. They are browser renders,
not mockups. New comparison styles are scoped; original approved shells/artwork remain.

Initial browser harness selectors assumed native labels/number inputs for existing
Field controls; corrected selectors use their actual accessible roles. Screenshot
review corrected raw schedule minor-unit display to currency within the new view.
No timeout, axe rule, permission or isolation assertion was relaxed.

All13 historical migrations/customer14, frozen P1 operation/four artifacts/approvals,
original Netlify package/executor, 2A–2F evidence and six PROPOSED billing enhancements
remain unchanged. Protected existing files and private artifact hashes are checked
without printing private content. No completed Netlify/recovery/security suites were
rerun locally; normal automatic CI remains broader verification. No credentials,
hosted writes, Auth/DB, provider/financial action, customer messages, deployment or merge.

## Proposed Workstream 3D

Prepare a separately controlled revised-estimate issuance/delivery review contract:
bind the exact current non-stale packet, saved draft/revision, original request and
canonical source hash; identify explicit eligible reviewer approval, one-shot/UNKNOWN
custody and the existing engine's issuance restrictions. Start with a local dry-run
validation and safe delivery-content preview, preserving immutable originals and
repair holds. Do not enable issue/send, real customer response, connected access,
contracts, work, invoices or payments. Genuine issuance/delivery requires a separate
reviewed authorization package; 3C does not activate it or auto-start 3D.
