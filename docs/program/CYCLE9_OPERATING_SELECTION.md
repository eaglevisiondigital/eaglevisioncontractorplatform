# Cycle 9 · operating customer and scope selection

`OperatingSelection({ sources: OperatingSources, enabled?: false, onSelectJob? })`
is an isolated staff navigator over Main's actual shared repository handles. Literal,
case-insensitive search covers the available customer/property labels, lead summary,
job scope and exact issued/source references. Deterministic pages retain exact
company/customer/property/job/estimate/version/offer/receipt identities. Counts cover
only explicitly prepared authorized job handles, never the complete CRM inventory.
Two jobs at one property remain two actual jobs rather than duplicate customers.

`readOperatingSelection(sources, {query, page, page_size}, gate)` reuses existing
Sales workflow and canonical source readers; query is bounded to100 characters and
page sizes2/5/10. No alternate customer, lead or estimate store exists. Lead association
remains explicitly staff-selected because the estimating source has no recorded lead
foreign key. A LOCAL-TEST preference never confers genuine contract authority.

`revalidateOperatingSelection(sources, view, jobId)` accepts only one exact visible-
page job from that process's retained view. It re-reads the same selection, requires
matching integrity and invokes the shared final synchronous source fence. Failures
retain UNKNOWN on that view, with no replacement or replay. The component also calls
`assertOperatingSelectionCurrentNow(view)` after its final await and before navigation.
Input, source-container and company changes hide old results and discard late reads.

23 focused source-based cases PASS, including all three brands, actual four-job/
three-property pagination, shared-property identities, literal search and empty
results, invalid inputs, foreign customers/receipts, revoked staff, stale versions,
final-await source/input drift, off-page rejection, terminal UNKNOWN, coercion/accessor
rejection, allowlisted output and no business-writer calls. Strict types, scoped lint,
Prettier and existing protected-source integrity pass. Main owns combined actual
browser/mobile/accessibility evidence and mounting; this five-file author package
claims no isolated visual approval.

No schema, business store, CRM write, contract, payment, message, dispatch, hosted
access, authentication, migration, deployment or merge. Approved UI/artwork and all
P1/customer14/4B/four artifacts/Netlify/recovery/NMI/provider/financial/production gates
remain intact. Release1.0 NOT READY / NOT AUTHORIZED.
