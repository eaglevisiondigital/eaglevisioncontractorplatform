# Read-only intake pipeline board

This isolated child of #534 (`11156016f0c4bb178626b559d847a83fcefdef5b`)
extends the actual NewLeadDashboard. It preserves that candidate's stage reader
and default queue behavior. Settings #529, Team #517, Catalog #522 and the
protected #537 source-admission lineage are not composed here.

The board reuses the original selected-company `Operations.listIntake` contract
for new, reviewing, qualified and closed. Each stage has its own ten-row page,
matching server count and refresh. Refresh pipeline board starts a fresh display
generation; changing company or repository returns to the queue. Read results
remain bound to repository, company, stage, page and generation. Malformed counts,
duplicate IDs, foreign rows and wrong-stage rows remain withheld.

Both original before/after access and module checks remain. A current board-stage
access denial or module withdrawal hides every column, count and review control.
Explicit fresh reading is required afterward. A detached prior display callback
cannot replace or invalidate the new display. Idle access changes are not polled;
this is not genuine Auth/MFA or continuous session verification. Each page is its
own observation, not an atomic whole-pipeline snapshot.

Review intake retains the existing navigation callback. There is no new assignment,
drag/drop status write, sender, financial command, store, schema or API. Qualified
and closed remain internal intake statuses: neither proves customer acceptance,
won work, payment or completion. Counts are not company revenue or pipeline value.

Approved reference33 depicts New/Qualified/Estimate Sent/Won sales columns and a
dark branded shell. This bounded board uses the existing intake vocabulary and
record relationships rather than inventing those sales transitions or values.
Four-column desktop and stacked responsive interaction is partial functional
progress, not full screenshot, CRM or all63-reference acceptance. The original
locked CSS/artwork, CompanyOperations router, App, repositories and forms remain
unchanged; new conditional presentation stays within the board component.

The new six browser cases cover canonical stage pages, independent pagination,
zero navigation writes, shared post-await withdrawal, malformed responses,
company/repository replacement, detached results, refresh/empty/error states and
actual App keyboard/Axe/overflow/captures at desktop/tablet/mobile sizes. Existing
15 original dashboard and21 stage-reader cases remain unchanged. Reports and
independent review accompany the exact draft commit. Synthetic fixtures are
explicit test inputs; no new business records are seeded by product source.

Local browser/source evidence is separate from whole Foundation, hosted Auth,
invoice/customer delivery and NMI acceptance. All128 protected pins, five design
locks,13bindings, D1–D3, A01–A12, #508/#509, SQL/grants, independent recovery,
provider/financial/message, tenant activation, merge and deploy gates persist.
Saul2Paul remains first; Cunningham needs separate accepted bindings.
Release1.0 remains NOT READY / NOT AUTHORIZED.
