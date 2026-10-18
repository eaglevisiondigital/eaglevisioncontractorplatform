# Customer login, server discovery and estimate review · local preparation

October18,2026. Base1247614,existing feature branch/draft PR#1.
**LOCAL ONLY. No connected customer sign-in, access grant or migration is activated.**

## Implemented bounded package

The explicit `/preview/customer-portal` screen demonstrates login preparation,
company/property context, published inspections, customer-safe issued scope, linked
repairs and comparison of immutable versions. It reuses PropertyReportHistory,
existing CRM/location/inspection/estimate repositories and the existing synthetic
ReleasePreview decision engine. The original report-only preview is preserved.
No new customer, job, property, costing or financial database is introduced.

The login has a fixed synthetic account and disabled password field. It never asks
for actual credentials or invokes Supabase Auth. A separate labeled local fixture
selector is not connected discovery or tenant authority. Sign-out, expiry, denied
access and error controls clear displayed customer content. Empty reports/estimates
and loading states are explicit. Company identity and the exact approved Propel
logo are preserved. Connected `/portal/*` routes stay closed; no sample fallback.

PreparedCustomerAccess accepts only a verified Auth identity port and two narrow
read ports. Discovery has no organization/customer/property/email arguments. It
requires the same verified UID before/after the response, validates the server's
exact context list and clears its bindings on Auth events/close/errors. Every
estimate read re-discovers current bindings, checks the selected tuple/version
against both previously discovered and current server data, then rechecks identity.
Late responses after sign-out/account switch cannot restore authority. The library
has no sign-in/signup, invitation, token reader/storage, hosted SDK RPC adapter,
Netlify route or auto-start path. Its connected response method always denies.
Current-session server checks are mandatory; getUser alone cannot prove that a
previously issued access JWT's session is still live.

Estimate projection allowlists descriptions, quantities, units and selling amounts,
notes/terms and totals from an existing issued version. It validates exact field
sets, integer arithmetic, currency, calendar date, included line uniqueness and
source provenance before display. Cost/margin/supplier/payroll/internal fields fail
closed. Comparison requires the same company/customer/property/estimate/currency
and distinct authorized versions. Issued snapshots and original job baselines are
never changed by customer review.

The synthetic preparation explicitly publishes one existing inspection, drafts a
repair with the existing finding-to-estimate path, assigns reviewed synthetic
selling prices and issues the revised _local_ version using the current estimating
engine. Each version is explicitly shared to the existing laboratory decision
engine. Approve/decline examples require explicit synthetic-only consent and record
only existing internal-test decision receipts. They cannot call create-contract,
create-invoice, approve-job-change, payment, signature or delivery operations.
No production consent/approval is inferred from these preferences.

## Separate exact SQL proposal · not a pending migration

`server/customer/schema.proposed.sql` and CUSTOMER_PORTAL_PROPOSAL.json bind the
exact bytes. `npm run customer:check` verifies the hash, dormant scope and unchanged
13-file migration inventory. This file is outside `supabase/migrations`; no hosted
dry run or schema application is part of this task. It requires independent review
and later formal forward-migration preparation/authorization before any application.

The proposed SQL creates one private authorization table,not financial source data:

| Object                        | Proposed boundary                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| customer_estimate_access      | Exact company/customer/property/user/issued-version access,15-minute maximum,revoke-only;empty/default deny/RLS,no client policies or DML grants                                                   |
| Repair provenance             | Composite tenant foreign keys to the existing mapping,location,issued version,published report and included issued line;finding must be present in the customer-safe immutable report              |
| customer_portal_guard         | Current genuine session,confirmed identity,active organization/modules/property feature,exact active mapping/property;active staff or platform administrators cannot enter this customer read path |
| customer_portal_discover()    | No selector parameters;returns only the authenticated user's currently authorized contexts,report availability and individually authorized version IDs                                             |
| customer_estimate_review(...) | Exact finite version authorization and issued source,allowlisted selling projection,current post-wait session/expiry checks;no financial commands                                                  |
| Public wrappers               | SECURITY INVOKER;all execution revoked from PUBLIC,anon,authenticated,service_role in the proposal                                                                                                 |

All private definers use fixed empty search paths,fully qualified objects and
revoked execution. Composite foreign keys and covering indexes prevent cross-tenant
references. Access amendments/deletion/extension are denied even to maintenance
inserts/updates;revocation appends an audit event without report/price payloads.
Database owners can still disable triggers/change SQL;this is not protection from
a compromised database owner. Read-only access is not legal authority to contract.

Issued status alone does **not** publish every estimate to a customer. Report-only
leases cannot substitute for estimate access,and estimate access cannot unlock
reports or broad release financial RPCs. Versions with no direct location need the
existing inspection-plan/job/baseline-estimate relationship for that exact property.
Repair provenance binds an existing published finding to an included issued line;
a reviewed publisher must attest that semantic relationship before granting access.
There is no arbitrary client grant/provisioning command in this package.

The discovery pass locks and validates actual sources,then rechecks every returned
lease against current wall-clock time. Review and grant insertion also recheck time
after relevant waits. Expired estimate dates are labeled using UTC wall-clock dates;
no approval action follows from that label. Current connected review states are only
`awaiting_action` and `expired`. Approved/declined connected states remain unavailable
until genuine customer decision persistence/provenance is independently implemented.
Synthetic preview preferences are clearly labeled and never used as production proof.

## Acceptance and activation boundaries

Disposable PGlite/PostgreSQL tests install this proposal and explicitly grant only
the read wrappers/private entry points **inside the disposable fixtures**. Those
fixture grants are absent from the proposal and must never be run hosted. Synthetic
SQL Auth claims are not genuine Supabase acceptance. Tests cover three-company
isolation,wrong customer/property/version,missing or revoked mapping,report-only
lease separation,default-deny ACLs,unrelated property binding,staff exclusion,
revoke-only evidence and customer-safe source projections. Native tests exercise
actual access-expiry and mapping-revocation lock waits. Application tests cover Auth
changes,late replies,forged selectors,leaked fields,immutable comparison and disabled
mutations. Browsers exercise desktop/tablet/mobile login/report/estimate/response
previews,clear-on-expiry/revocation/error,accessibility and closed connected routes.

Next independent review must cover the proposed SQL and the future staff publishing
workflow,expiry/cursor/lookup limits,CSRF/session custody,rate limits/abuse controls,
production sign-in/callback/logout design and verified account routing. Do not add a
public email/company search,public signup,unreviewed invitation or broad release
grant. Future local logout must use session-local scope and independently verify
server session-row revocation;clearing a screen is not real Supabase sign-out.

Official references checked: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[sign-out scopes and access-token limits](https://supabase.com/docs/guides/auth/signout),
[Supabase changelog](https://supabase.com/changelog). The Markdown index fetch failed
with unsupported content type;the official HTML changelog was used instead. No
project endpoint or credentials were accessed.

The existing nine P2 hosted cases remain **0 PASS/0 FAIL/9 BLOCKED/0 NOT RUN**.
All72 property cases remain **0 PASS/0 FAIL/24 BLOCKED/48 NOT RUN**. Existing P1
approval remains valid for unchanged frozen scope. Preserve all13 migrations,the
four frozen artifacts and713 original records. No fresh hosted713/22/four-factor
check is claimed. Recovery software/custody and blocked Netlify deployment are
untouched. No host login,MFA,grant,mapping,lease,fixture,media,provider,customer
message,payroll,production or merge action occurred.

## Next gates

1. Independently review this exact dormant proposal and caller-bound read contract.
2. Implement checked staff publication and genuine customer response/evidence
   persistence with separate read/review/financial permissions;keep execution off.
3. Complete independent recovery verification and unchanged P1 acceptance,then freeze
   actual P2 report mapping/lease/cleanup scope under separate exact authorization.
4. Separately review/formalize and authorize any future migration/grants/auth sessions
   and estimate-read fixtures;report-only P2 approval cannot expand into this scope.
5. Genuine hosted customer security/UX acceptance and all remaining Release1.0 gates
   precede outside access. A clean separate production database remains mandatory.

Final local counts/source hashes/screenshots are in CUSTOMER_PORTAL_LOCAL_VALIDATION.json.
**Release1.0 stays NOT READY / NOT AUTHORIZED;PR#1 draft/unmerged.**

Final local verification: **917 application/PGlite PASS,52 native-only skips;77
Python recovery PASS;367 native PostgreSQL17 PASS/zero skips;75 responsive browser
PASS**. Counts overlap. Lint,strict/generated types,build,formatting and migration/
frozen/proposal integrity PASS. A new contrast failure was corrected;inherited
dashboard layout was also corrected only for the new portal. Final desktop/mobile
screenshots were visually inspected;all three viewports passed accessibility and
overflow checks. Source/test hashes are in the validation record. GitHub results
are verified separately for the exact pushed commit;no counts are added together.

[Synthetic desktop screenshot](../artifacts/property/desktop-customer-estimate-review.png) ·
[Synthetic mobile screenshot](../artifacts/property/mobile-customer-estimate-review.png).
