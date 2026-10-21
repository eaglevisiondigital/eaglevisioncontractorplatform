# Property media, supplier comparison and unbilled materials · integration plan

## Implementation update · owner continuation from f2d5401

This plan is now partially implemented locally; see PROPERTY_OPERATIONS_VALIDATION.md
and the exact proposal manifest. Surveys/recurrence/checklists/review/reports,
manual comparisons, unbilled decisions and unified synthetic client views have
working interfaces and disposable database contracts. Media controls/ports exist
but actual uploads/scanning/playback remain disabled. Connected persistence and
genuine supplemental invoice conversion remain blockers. The owner now explicitly
includes this scope in Release1.0; older “schedule undecided / NOT RUN” statements
below describe the preceding planning checkpoint. NMI is preferred, optional
Authorize.Net retained, no provider activated.

October16,2026 · local requirements/design only. Product expansion is approved for
isolated local development. This readiness increment plans it against existing
modules; none of these additions is claimed implemented, hosted or launch-ready.
No new database/deployment is needed. Preserve the existing three tenant brands,
exact Propel PNG, accepted estimates, source imports, job costs and workforce.

## A · surveys, inspections and progress media

Extend **existing service_locations + customers + jobs**, with tenant-composite
visit/plan/finding/report/media metadata and append-only publication/comment/review
events. Do not copy CRM/project identities to a media database. A visit binds the
same customer's property/job; organization_id on every child with composite tenant
and parent constraints, indexed access, RLS and explicit grants. Snapshotted
checklist version, category, room/site location, severity, description/recommendation,
inspection date, inspector and before/during/after phase remain attached to a visit.
Completed reports are immutable; corrections append a new version. Plans express
weekly/monthly/custom recurrence in company timezone with DST/end-of-month rules,
missed-visit status and idempotent schedule keys; no automatic notifications.

Each media item independently defaults internal. Staff visibility needs current
permission/assigned job and finalized clean content; customer visibility additionally
needs an explicit authorized publication version, current exact customer/property
mapping and current portal permission. A gallery/report being visible must not
publish all attachments automatically. No platform administrator implicit file
access. Client comments/approval decisions bind an immutable published report/scope;
they do not approve a repair price or legal contract. Redactions/publication require
management review. Revocation must deny new tokens/requests at the server, with
short bounded existing-token exposure explicitly tested.

Photo/camera selection never authorizes a Storage write. Drone sources keep original
private evidence with flight/capture metadata separately restricted; remove GPS,
EXIF/device identity from display derivatives. Staff cannot browse quarantine.
Finding-to-estimate/work-order action copies only reviewed scope + stable source
reference into the existing estimate revision engine; it cannot edit an accepted
version. Work-order execution is a new checked scope authorization, not a second
billing engine. Preserve inspection/repair history and cross-version evidence.

### Required services and proposed resource policy (not activated)

| Boundary                      | Required implementation/service                                                                                                                        | Separate approval/evidence                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingestion                     | Genuine Auth/session + current membership/assignment; bounded streaming; server-generated tenant/object/version/digest; per-tenant quotas/reservations | Reviewed Auth/Storage RPC/API policies; no signed unrestricted upload/upsert or client verdict                                                            |
| Objects                       | Existing private Storage architecture, distinct quarantine/original/clean-derivative prefixes or reviewed buckets; exact-version immutable writes      | Scoped byte gateway identity/policies; actual Storage HTTP denial/success; no service key in request API                                                  |
| Malware and parsing           | Approved digest-bound malware scanner/current signatures; full image/PDF validators already present; video container/codec parser still absent         | Select engine/vendor, scanning corpus and signed evidence; infected/unknown/outage/stale/truncated/zip-bomb failures remain quarantined                   |
| Media transcode               | Separate isolated FFmpeg or reviewed managed transcoder; sanitized poster/HLS/MP4 derivatives, no original byte passthrough                            | Pinned runtime/image/codec set, dependency review, enforced process/CPU/memory/disk/network caps and hostile corpus; JavaScript timeout is insufficient   |
| Playback                      | Server checks exact current tenant/customer/resource/publication and clean derivative version; short expiring playback capability                      | Every segment/playlist/poster/range request bound to same scope; no unsigned segment URLs, public bucket or enumerable path; expiry/revocation/IDOR tests |
| AI extraction                 | Existing neutral materials gateway + durable queue/lease/fencing; inert content, literal nullable numbers, source provenance, review                   | Model/vendor/region/retention/data-use/spend approval and benchmark; no AI tools/URL fetching; no fixture clean verdict                                   |
| Recurrence and communications | Existing company timezone/identity/outbox boundaries, new reviewed scheduling worker                                                                   | Scheduler authority/idempotency/catch-up limits; outbox disabled until sending approval                                                                   |
| Retention / cleanup           | Tenant-specific schedules, legal holds, immutable evidence references; tombstone then conditional exact-version orphan cleanup                         | Privacy/contract/legal retention decisions; no bulk delete or automatic purge activated                                                                   |

Candidate **initial video envelope for review**, not a change to current limits:
MP4/MOV only, maximum250MiB/source,5minutes duration,3840x2160,30fps, one video/one
audio track, no attachments/scripts/external references; uploads reserved against
1GiB/day and10GiB stored/tenant. Unknown duration/codec/dimension fails quarantine.
One transcode at a time per worker,2CPU/1GiBRAM/32PIDs,read-only root/nonroot,
512MiB bounded scratch,180second hard kill, no document-controlled network. No
provider/runtime chosen; measure corpus and budget before accepting these numbers.
Current material source limit3MiB, three attempts and ingestion503 **do not change**.
Photo limits remain bounded by existing validators; video cannot use that image
validator or a forged clean document row. Playback proposal:60second capability,
no-store authorization, exact-method/range/object/version binding and no bearer URLs
in logs/referrers. Expiry does not erase bytes already downloaded.

## B · manual multi-supplier comparisons first

Extend **existing estimate versions/catalog/material-import approvals**, not a
separate estimate engine. Snapshot an approved material list with stable estimate
version/line/source IDs. Up to four supplier identities in initial UI; extensible
provider registry. Names may include Home Depot, Lowe's, Menards where available,
local lumberyards and specialty suppliers; their appearance is not API authorization
or a claim of live prices. First accept contractor-entered quotes and reviewed
Smart Material Import sources only. All quote snapshots are immutable tenant-owned
records with vendor/store/account-price context, observed timestamp, expiration,
source document/hash and currency. No scraping/bypass or unverified live feeds.

Normalize SKU/specification/grade/unit/pack size and quantity in canonical integer
units. Never silently equate roofing square/bundle, each/pack or alternative grade.
Show substitutions/unmatched/unavailable lines explicitly; reviewer must authorize
an equivalence and preserve both products. Price uses whole packs rounded upward
with overbuy shown; show unit price and full required quantity. For each supplier,
whole-list completeness depends on every selected line, availability, quote expiry,
tax treatment and fees. Unknown tax/shipping/account price stays unknown, not zero.
A partial basket cannot win as a whole-list cheapest quote.

For a lowest mixed basket across at most four suppliers, evaluate supplier subsets
with per-supplier order/pickup/shipping costs once and per-line quantities/tax;
apply inventory/pack/minimum constraints. A greedy cheapest line can lose after
supplier fees. Preserve arithmetic/evidence snapshot and explicit assignments.
Updating internal estimated cost requires an explicit draft revision and optimistic
lock; immutable original selling prices/baseline never reprice. External supplier
APIs/accounts/terms/store location and account-specific prices require later separate
provider approvals and genuine acceptance. Manual comparison needs no live credential.

## C · original versus actual / unbilled review

Extend **record_reviewed_purchase, job_expenses, job_expense_material_lines,
job_change_orders/approvals and immutable job.baseline**. Reuse the existing
receipt extraction/review/dedup and payment/commitment/credit ledger; do not post the
same expense twice or recalculate labor from receipt rows. Every reviewed receipt
line retains source and matching evidence. Match first by explicit source/approved
revision identity, then canonical SKU/spec/unit candidates, with manual confirmation
for ambiguous/equivalent products. Identify quantity excess, unit cost increase,
substitution, new product and unmatched rows. Matching to a lump-sum package must
inspect its approved included scope; being unitemized is not proof of unbilled work.

A new append-only decision stream keyed tenant/job/expense/source line stores:
absorb, associate existing authorized scope, propose additional billing, defer.
Use job/decision revision locks to prevent two reviewers or duplicate imports from
creating two proposals. Record actor/current role/reason/evidence without cost/PII
payload in activity. Field staff can submit own assigned expense and findings;
management reviews pricing/customer scope. Customer projections omit supplier
costs/markup/margins/payroll and all internal findings/media.

Unmatched expense is **potentially unbilled**, never automatically chargeable.
Returns/credits reduce net eligible amount against the exact original paid purchase;
commitments are distinct from paid purchases. Overlapping PO/invoice/receipt source
keys, original/revised scope, approved change orders and prior supplemental lines
must be reconciled before proposing a charge. Existing billed lump-sum scope may
already cover it. Quantity/equivalence disputes remain deferred/flagged.

A proposal applies pass-through/fixed dollar/percentage markup in integer minor
units and clearly differentiates markup from margin. Itemized or lump-sum customer
presentation contains selling scope only. Already posted expense must not become a
second projected remaining cost when proposing the same purchased materials.
Proposal value is not revised contract revenue. Only independently verified exact
customer scope/price authorization can approve a change order; preserve immutable
evidence. The current internal free-text authorization reference is insufficient
for production supplemental billing.

Supplemental invoices require reviewed **change-order-to-invoice/credit-note
conversion**, immutable source linkage, exact tax/currency and one invoice per
approved change identity. This conversion is not implemented by the readiness
package; no payable invoice may be produced from a review flag. Reuse the existing
invoice/ledger/provider authorization path once independently reviewed. Show original
budget, net actual/committed, projected costs/profit, proposed/approved billing,
invoiced balances and credits separately. Incomplete costs remain projected profit.

## Acceptance and release scope decision

For **all three synthetic companies** test: no cross-tenant parent/child/reference,
revoked member/customer, field versus management, per-item publication and report
privacy; hostile/corrupt/oversize/unknown media and derivative/segment/range leakage;
recurrence DST/month-end/concurrent scheduling; four-supplier fees/whole packs/
expired/unavailable/unknown tax/substitution and minor-unit precision; duplicate
receipts and PO overlap, excess quantities, credits, lump-sum coverage, concurrent
review, approved revision/supplemental invoice/credit-note uniqueness and immutable
original values. Review desktop/tablet/mobile, camera permissions and accessibility.
These cases are **NOT RUN for new modules**, not covered by historical passes.

Owner must separately decide Release1.0 inclusion/schedule for expanded surveys,
recurrence, drone/video, client reports/comments and supplier comparison. Do not
silently remove or promise them for launch. Unbilled review strengthens existing
job/billing requirements; genuine change-order/supplemental conversion remains a
Release1.0 blocker. Local implementation authorization is preserved for a subsequent
increment; no new tables, media picker, supplier API, webhook, customer endpoint,
release flag or deployment is enabled by this design. Never duplicate databases
or turn a frontend visibility switch into server authorization.
