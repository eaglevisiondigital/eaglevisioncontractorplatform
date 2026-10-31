# Property operations · connected authorization design

Current P1 proposal:[final scoped review](PROPERTY_P1_ACCEPTANCE_REVIEW.md),
75 fixture steps/57 domain rows plus69 probes and exact three-row feature controls.
No hosted execution is authorized. PROPERTY_P1_REVIEW.json tracks all72 cases:
0 PASS,0 FAIL,24 BLOCKED,48 NOT RUN. P2 customer mappings/leases remain separate.
Earlier P0 and generic case statuses below record their preparation checkpoints.

Current P0 checkpoint:[dormant connected schema installed](PROPERTY_P0_EXECUTION.md),
history13. Public invoker wrappers exist;property features,customer mappings and
report-only leases remain absent. No fixture/portal/provider/media activation or
new sessions were authorized. All72 property workflow cases remain NOT RUN.

## Superseding execution checkpoint

The owner-approved exact20261017005322 migration is now APPLIED ONCE / VERIFIED.
Read [PROPERTY_MIGRATION_EXECUTION.md](PROPERTY_MIGRATION_EXECUTION.md) and
[PROPERTY_CONNECTED_TEST_PLAN.md](PROPERTY_CONNECTED_TEST_PLAN.md). Hosted history11;
all8 tables empty/default off. Earlier pending/execution-unauthorized statuses below
are historical. No replay,feature/media/provider or customer-workflow authority
is granted by installation. Connected acceptance is prepared,not executed.

## Superseding preflight checkpoint

Read PROPERTY_PREFLIGHT_RECOVERY.md: CLI dry run and current public-only API profile
checks now PASS; root401 was unsuitable for schema verification. No migration,
wrapper or feature is activated. The connected design below remains pending, and
real property Auth/role/media acceptance is still blocked. Technical GO only for
separate exact dormant-schema execution approval.

Current state: local synthetic interfaces only; connected navigation and repository
initialization reject these modules. The pending migration installs no public RPC,
HTTP adapter, Storage path or enabled feature row. Installation alone cannot enable
an application workflow. See PROPERTY_MIGRATION_SECURITY_REVIEW.md for evidence and
current execution NO-GO blockers.

## Existing sources and planned caller boundary

Plans reference the existing CRM customer and service location, with composite
customer/location/organization relationships. Optional jobs reuse the existing
immutable estimate baseline. Visits/reports add inspection history rather than a
second property/customer/project store. Comparisons reference issued estimate
versions and contractor-reviewed supplier quotes; no live retailer pricing claim.
Unbilled decisions reference approved job_expenses and reuse job_change_orders.
Supplemental drafts are proposals, not another ledger or an issued invoice.

A future connected adapter must use the authenticated caller's genuine Supabase
JWT and current server identity. Never use a service/owner connection, browser role
switch, caller metadata or selected organization as authority. Any public wrapper
must be narrowly reviewed SECURITY INVOKER delegation to the private checked command;
none is implemented or approved in this migration. Keep private schema excluded
from API exposure. Current HTTP profile verification is BLOCKED by key rejection.

| Actor                                          | Permitted scope when separately enabled                                                                                                   | Denied                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Owner/admin with AAL2                          | Own active company; plans, inspection publication/revision, management financial review                                                   | Other companies, automatic billing, live media, immutable record mutation             |
| Estimator with current CRM/estimate permission | Own plans, inspections and reviewed supplier snapshots                                                                                    | Supplemental financial management, publishing reports, payroll/rates                  |
| Assigned field employee                        | Assigned job plans/visits; create/save/submit                                                                                             | Unassigned jobs, supplier pricing, financial review, report publication               |
| Mapped internal customer                       | Exact active portal identity, unexpired internal customer grant and release gate; allowlisted published reports/authorized selling prices | Other customers, draft/private findings, costs, markup, labor/payroll and media bytes |
| Platform operator alone                        | No customer-data authority                                                                                                                | All company property/financial data without separate valid tenant authority           |
| Anonymous/revoked/expired session              | None                                                                                                                                      | All property operations                                                               |

Staff commands lock enabled property/estimating features, organization, current
membership and relevant assignments/resources. Management actions require existing
role/AAL2 checks. Positive CAS revisions prevent lost updates; final wall-clock
JWT expiry checks roll back side effects after waits. Portal checks use existing
release locking and customer mappings plus a final unexpired lease check. The portal
explicitly labels output internal-development/test. It is not a production portal.

Reports allowlist customer-visible findings and publish immutable versions. Internal
notes, source prices and every media byte are excluded. Staff must review free-text
findings before publication; field visibility is not customer publication authority.
Existing real Auth revocation behavior must be retested through actual HTTP after
adapter review; disposable JWT/GUC fixtures are not hosted authentication proof.

## Media and financial gates

Source documents/photos/videos/drone footage stay private. Future upload approval
must cover tenant/visit-bound upload intents, MIME/content/size checks, quarantine,
malware scanning, isolated processing, metadata stripping, safe image/video output,
transcode limits, quotas, retention/orphan cleanup and short-lived authorization on
both issuance and playback. Customer-visible selection cannot mark bytes safe.
No public bucket, signed URL or successful fixture scanner unlocks these controls.

Financial decisions use integer minor units and explicit markup (not margin).
Approved credits reduce the reviewed cost; normalized duplicate purchases block
proposals. Absorbed/included/review decisions create no debt. A proposed addition
creates only an existing proposed change plus an awaiting-authorization draft;
forecast cost remains zero because the expense is already posted. Original accepted
estimates remain immutable. Genuine scope/consent and checked supplemental invoice
conversion must precede any customer receivable; no gateway call is implemented.

Next: resolve read-only CLI/API preflights, obtain exact schema execution approval,
then independently review adapter/feature/portal and media activation scopes. No
new private test/worker grant or hosted write follows from this design.
