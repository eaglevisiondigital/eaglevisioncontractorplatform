# Cycle 7 · Time, materials and invoice review

Owner: `/root/cycle5_profit_guard`. Branch: `codex/cycle7-time-materials-invoice`.
The implementation extends the reviewed Cycle 6 sources without changing an engine,
database, connected route, approved visual identity or existing business records.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Functioning staff workflow

`JobReview({sources: LocalJourney, enabled?: boolean, showFinanceDetails?: boolean})`
defaults OFF. `showFinanceDetails` defaults true; Main supplies false when the existing
Finance view is already present, retaining a concise uniquely named invoice requirements
summary and avoiding duplicate Finance landmarks. Changing that presentation context
also resets the form before old results render. Main may mount it
only in the separately admitted loopback development journey. It uses the actual
journey's repository, organization, eligible synthetic owner/admin, customer, CRM
property, immutable issued version, job, worker assignments and existing offer/receipt.
It does not invent an invoice or bind whichever estimate happens to be newest.

The form allows explicit opt-in material and time proposals, or source-only review.
Every edit withdraws the previous confirmation, advances the local input revision and
withholds the old result. The reviewer must separately confirm the saved source and
unsaved inputs. Source/model identity, target, admission or enabled-context replacement
remounts the form before old evidence can render. Pending withdrawal discards late
results; ambiguous results hold the current form and offer exact inspection only.
This is ephemeral same-tab presentation, not a durable business store or genuine Auth.

`readJobReview(repo, target, {finance, material, time, input_revision}, gate)` composes:

- Existing `readFinanceWorkflow` / `LocalJobMarginReader` / Profit Guard / canonical
  `jobFinancials` for recorded costs, commitments, forecast, coverage and margin signals.
- Existing `calculateEstimate` for one detached included material/product line what-if.
  Quantity remains in the exact original unit; integer quantity/cost bounds apply.
  Only that line's internal cost result is projected. Computed hypothetical customer
  totals are discarded. Neither proposal enters actual costs, forecast, commitments,
  profitability, saved estimate or issued customer total.
- Existing `prepareProcurementReview` only where the exact issued line already has
  an actual matching catalog association. Missing association stays UNKNOWN. Descriptions
  are never used to guess catalog identity, supplier, purchase or expense relationships.
- Existing `validateTime` against captured actual workforce entries, including other
  job/overhead allocations. The exact active worker, current membership and active
  assignment to the selected job are required. The result is unposted and not billable;
  no duration, wage, labor burden, payroll or cost-allocation calculator is introduced.

The time adapter is useful even when the recorded job lacks locked labor evidence;
Profit Guard deliberately cannot prepare its optional time proposal on UNKNOWN cost
coverage. That limitation does not justify declaring zero labor. Time validation is
**CAPTURED_NOT_ATOMIC** with current workforce/time coverage **UNKNOWN** and monetary
allocation null. Proposed overhead centers remain UNVERIFIED, never approved policy.
Passing syntax/overlap validation does not establish permission to post time, current
availability, a payroll-period release, physical completion or dispatch.

## Invoice and financial reference boundaries

Customer-safe issued scope comes only from the existing strict issued-version projection.
It retains canonical quantity/unit/amount, subtotal, discount, saved tax, total, terms
and immutable source IDs. Internal unit costs, supplier/private notes, staff decisions,
worker information and proposals never enter that projection. The separate staff
section is clearly labeled and never becomes a customer route or delivery packet.

The actual existing journey offer/receipt are read only. Contract, signature and invoice
references are explicitly null in the panel. Invoice preparation remains NO_GO and
missing legal/tax/contract/NMI/coverage requirements remain visible. A genuine invoice
has no direct job foreign key in the existing system; an issued-scope comparison does
not create that relationship. No `create_invoice`, contract, signature, receivable,
job, expense, time, payroll, payment, purchase-order or ledger command is called.

The immutable allowlisted staff reference includes exact IDs/input revision/source hash,
recorded coverage and canonical amounts where available, detached unsaved proposals,
unchanged issued customer totals, exact invoice reference and all-false authority.
It excludes underlying EstimateInput, supplier/private notes, raw workforce/payroll
rows, rates, deductions and task text. SHA-256 and JSON preview permit inspection;
they are not authentication or durability. It is explicitly **not an accounting
import**, invoice, customer packet or financial command. Without an exact existing
invoice, genuine accounting/export preparation remains UNKNOWN with no fabricated
ledger rows. Optional actual accounting evidence uses the unchanged Finance composition.

## Currentness and uncertainty

Primitive proposal data is detached/frozen before the first await. Exact original input,
original target object, finance references, eligible current reviewer, source fingerprint
and current assignments are checked after awaits, including after the final digest.
The full captured workforce is compared across reads but is never claimed atomically
current. Final synchronous shared fences protect the job/issued/CRM/member source.
Read-only hashes/weak associations are not authorization or a new business data model.

`inspectJobReview(review)` admits only the exact retained session object and returns
CURRENT_LOCAL_SOURCE, STALE or UNKNOWN with `replacement:null`. Copied/rehydrated,
withdrawn, edited-input, denied or unknown evidence cannot prepare a replacement.
Revocation/withdrawal is checked before returning drift evidence. Immutable contents
do not change when the underlying job is edited. Inspection never posts, retries or
replays a business command. Refresh, process loss and unmount do not establish durable
custody or recovery acceptance.

## Verification and preservation

Forty focused application cases exercise actual complete journeys for all three
contractor companies; canonical integer rounding and original issued immutability;
exact catalog association and missing provenance; actual worker/assignment/tenant/
customer/property/job/version/currency isolation; time overlap and explicit offsets;
source-only, missing coverage and overhead uncertainty; stale inputs and target changes
across real digest awaits; original admission withdrawal; actual administrator revocation;
strict customer-safe fields; immutable allowlisted reference hashes; exact retained
inspection and no writers. Static panel cases establish default-OFF and accessible
form labels only. Main owns actual desktop/tablet/mobile, keyboard, axe and context-
replacement browser proof. No browser acceptance is inferred from static markup.

Author validation: **40 new / 152 related application cases PASS** across Job Review,
retained Finance, Profit Guard and procurement suites. Strict/generated types, full
lint, formatting, production build, feature evidence, migration integrity, protected
128-file hashes and five locked design files/thirteen bindings PASS. Main separately
owns combined browser proof and exact-SHA automatic GitHub CI. No pending CI or browser
result is represented as a pass by this author record.

No historical migration, pending customer fourteen, original 4B, P1/four frozen artifacts,
approval, locked artwork/CSS, Netlify package/executor, recovery/NMI/Auth or provider gate
is changed. All thirteen migrations, five locked design files, thirteen bindings and
128 protected source hashes retain their existing contracts. No hosted mutation,
credential, customer communication, real financial execution, deployment or merge.
No completed recovery, Netlify, native maintenance or provider baseline suite is repeated.

Next: separately reviewed actual cost-capture admission and invoice requirement ownership
contracts, preserving the existing engines and genuine authorization gates. These local
what-ifs do not authorize posting or customer delivery.
