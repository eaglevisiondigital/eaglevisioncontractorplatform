# Cycle 21 recorded cost correction review

Local synthetic staff review only. Release 1.0 **NOT READY / NOT AUTHORIZED**.

The existing canonical expense list supplies exact pending records. Staff select
one recorded source, inspect its amount/category/provenance and saved job revision,
choose approve or reject, enter a reason and explicitly confirm. Native
`Phase3Repository.reviewExpense` appends the original event and calculates the
canonical job costs; expense rows and historical events remain unchanged. An
incorrect pending record can be rejected; replacement entry remains in the original
expense editor. No new credit, payment, material, ledger or invoice is created.
Only pending materials commitments without adjustment links are eligible; payment,
credit, reviewed, foreign and ambiguous adjustment sources are denied.

The existing material-review attempt custody is shared with earlier controls and
new wrappers. Duplicate/concurrent reviews, stale sources, revoked staff and
ambiguous acknowledgments are denied/held. Exact read-only reconciliation never
replays, replaces or clears UNKNOWN. Same-tab state is not restart persistence.

The view shows original recorded and committed costs, cost-to-complete, margin,
cost coverage, time correction predecessors, review events, locked period/labor
references and invoice/accounting requirements. Missing/unposted/superseded time
does not prove zero cost or completeness. No payroll preparation is initiated.
Unknown values remain UNKNOWN. Internal review does not verify physical completion,
bank payment, settlement, customer acceptance, debt or authority to issue invoices.

No store, evidence archive, engine, global navigation or connected route is added.
The existing three company tokens and approved artwork remain unchanged. Source
details are withheld on access revocation. Main owns real desktop/tablet/mobile,
accessibility and combined source-integrity verification. Focused tests cover actual
native events/calculations, exact source IDs, original immutability, duplicates,
concurrency, stale revisions, UNKNOWN, staff/property/tenant denial, corrected time,
cost incompleteness and absence of provider/financial execution.

At parent `b918231ff48996575c03d64c9045ead6831b6cd0`, all **36 focused
application cases pass**, including all three brands. Strict types, scoped lint
and formatting, feature evidence and the full retained Cycle 20 integrity chain
pass. Browser evidence and current-head CI are reported separately by Main.

All migration, frozen P1/four artifacts, customer14/4B, recovery, Auth/MFA, NMI,
Netlify, design approval, communication, dispatch and production restrictions remain.
No merge, deployment, hosted mutation or operational activation is authorized.
