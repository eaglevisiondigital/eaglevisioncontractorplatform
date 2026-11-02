# Cycle 6 Sales workflow · local candidate

Owner: `/root/cycle6_sales`. Exact combined source parent:
`857299483bd2d9423e75632b1209fed0fe65be43`, branch `codex/cycle6-sales`.
The isolated candidate composes actual existing intake/CRM, Phase3 issued versions,
ReleasePreview receipts, accepted-scope references and contract preparation. It
creates no business store, contract, signature, estimate, job or financial record.

## Functioning composition

`readSalesWorkflow` requires explicit default-OFF admission and an exact nine-field
selector: the existing SalesHandoffTarget plus `intake_request_id`. The synchronous
existing source checkpoints restrict this new composition to current synthetic
owner/admin members. A real recorded lead must contain the exact customer and
service-location references of the selected issued estimate. A null/missing/foreign
lead location is denied. No description/address similarity or newest-version lookup
is used. The narrow source projection excludes private costs, workforce information,
response notes and private contractor notes.

The current schema has no estimate intake-request foreign key. Therefore the
interface explicitly calls the association a **staff-selected link between existing
same-property records**, with recorded estimate-to-lead provenance **UNAVAILABLE**.
It never labels the lead the proven contractual origin of the estimate.

The new `SalesWorkflow` panel is unmounted and OFF unless Main explicitly composes
it into a DEV/loopback-only preview. It presents the original lead, exact customer/
property/issued version, canonical selling total and original accepted LOCAL-TEST
receipt. Staff reviews the existing four preparation checks, explicitly confirms
the lead selection, then separately confirms preparation. `prepareSalesWorkflowContract`
reuses unchanged `captureSalesApprovedScopeReference` and `prepareSalesContractReview`.
No approval is inferred from the lead note, estimate description or selected job.

The frozen wrapper binds the exact recorded lead snapshot, source hash, existing
immutable preparation and a SHA-256 integrity value. A synchronous existing lead,
estimate/version, current membership and ReleasePreview checkpoint follows all waits
and hashes. Source or live-confirmation drift denies preparation, including at the
final wrapper digest. No await or user callback follows that terminal domain check.

The UI reserves one attempt before awaiting. An uncertain/denied result stays held;
there is no retry or new-source replacement. Exact read-only verification accepts
only the same in-memory admitted frozen wrapper, not a caller-reconstructed object.
Later draft or lead changes make retained facts stale; ambiguous changes during
reconciliation return UNKNOWN. UNKNOWN hides displayed packet source facts while
retaining the original snapshot for exact reconciliation. A hash is local integrity
only. Refresh/process loss discards this same-tab memory; no durable custody or
operational authorization is claimed.

## API and preview integration

- `readSalesWorkflow(repo, release, target, { enabled, confirmed })`
- `prepareSalesWorkflowContract(repo, release, target, review)`
- `verifySalesWorkflowReview(repo, release, target, retained)`
- `SalesWorkflow({ repo, release, target, enabled?, onPrepared? })`

Main owns the shared actual-intake journey fixture and isolated route/mount. It must
pass the same Operations, Phase3Repository and ReleasePreview instances. The panel's
`onPrepared` callback supplies review evidence only; it never authorizes creation of
a contract, work order or invoice. Main owns combined browser validation across all
three brands and desktop/tablet/mobile; this branch makes no independent browser-
execution claim. Existing approved customer and contractor routes remain unchanged.

## Focused verification

31 new source-based application cases and 76 retained accepted-scope/preparation
cases pass (107 total). Cases use actual `Operations.sampleSubmit`, CRM locations,
Phase3 creation/issuance and ReleasePreview accepted/declined/change-request receipts,
not fabricated approval records. All three contractor companies, canonical totals,
foreign exact IDs, field/estimator/inactive/foreign staff denial, actual owner
revocation, missing receipt, explicit association/checklist/hash, stale versions,
lead changes, malicious getters, final-digest drift, exact UNKNOWN reconciliation,
immutable historical facts and no command/business side effects are covered.

Strict TypeScript, focused ESLint and local build pass. Main coordinates combined
source, responsive browser/accessibility, protected-file and GitHub CI evidence.
The initial new uncertainty tests referenced a nonexistent `contracts` field;
correcting them to the actual `release_contracts` field preserved the no-side-effect
assertion rather than weakening it.

Recovery/P1-on13/separate14/exact4B+broker, all historical migrations and proposed
customer14, original frozen artifacts/approvals, Netlify/executor, NMI, genuine Auth,
MFA, financial/provider/communication and hosted/deploy/merge gates remain intact.
No protected source, schema, migration, global style, artwork, writer or existing
engine is edited by this branch. Contract execution, signing and delivery remain
BLOCKED/UNVERIFIED. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
