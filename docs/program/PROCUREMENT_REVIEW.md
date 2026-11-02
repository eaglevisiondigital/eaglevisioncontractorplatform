# Local procurement and subcontractor scope review

Feature INT-001/EST-001; owner Main; exact shared parent PR27 at083b323 plus
reviewed synchronous checkpoint d53a902. Three new owned files only.

`prepareProcurementReview` composes the actual admitted Phase3/CRM/catalog/version
projection. Explicit enabled+confirmed selections bind included existing scope lines
and active exact catalog IDs, units and kinds. Material/product selections produce a
purchase-review proposal; labor/service produces a subcontractor-scope review. Quantity
and optional bid amount are bounded human proposals in canonical source currency,
not posted purchases, supplier prices, commitments or customer obligations. No new
calculation, business store, vendor call, purchase order or subcontract is created.

The immutable content-addressed review retains source/version/revision identity,
minimal recorded catalog vendor label and optional existing job baseline reference.
Vendor identity and purchase matching remain UNVERIFIED/UNKNOWN. It is staff-only;
notes, contact data, costs, margins, payroll and private review details are excluded.
No actual material-import approval or supplier/bid custody is inferred from catalog
metadata. Existing material review and estimating engines remain authoritative.

Exact admitted session objects verify CURRENT, STALE only on proven existing-source
drift, otherwise UNKNOWN. Clones/imports cannot prove custody. Final synchronous
source/live-gate checks follow every awaited hash/read; no replacement or replay.
Refresh/process loss is not durable evidence. All operational authorities remain false.

Focused actual-engine tests cover all three companies, purchase/subcontractor kinds,
foreign/duplicate/sparse/getter input, malformed quantity, stale revision, revocation,
confirmation withdrawal, preparation races, privacy and no history side effects.
This unwired domain prototype has no UI/browser acceptance claim. Live supplier/PO/
subcontracting/accounting/financial/message acceptance and every release gate remain
blocked. Release1.0 NOT READY / NOT AUTHORIZED.
