# Proposed Workstream 2E · non-executable operational integration preparation

October 29, 2026 · follows Workstream2D. **PROPOSAL ONLY.** No SQL migration,
service identity, grants, HTTP server, UI persistence adapter or activation supplied.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

The smallest useful next implementation package is a **disposable server-owned
one-shot command-authority contract with a complete writer-participation inventory**.
Prove where an intent/claim becomes durable before its mutation; missing response/
receipt stays UNKNOWN. Prevent a runtime LOGIN from obtaining a fresh mutation by
bypassing the intended custody/claim path. This must not pretend that an untrusted
caller can attest its own SQLite durability. Evaluate the credential/issuer/command
boundary independently; retain exact tenant/source/actor/session/request/CAS binding.
An exact previously committed response may reconcile under current authority only.
No new-ID fallback or automatic retry. Any future implementation requires its own
bounded owner direction; this proposal grants no action.

Before an operational package can be reviewed, specify these minimal records and
interfaces in prose/contracts, then separately review exact forward-only SQL bytes:

| Area                           | Minimum required integration                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant records                 | Maintenance coordination, private append-only notes/receipts, immutable repair reservation/claim/binding, readiness intent/history; exact organization/customer/CRM location/report/version/finding, actor/session and target/version/line; composite tenant FKs/UNIQUE/indexes and positive CAS  |
| Existing systems               | Reference existing CRM, plans/visits, published immutable reports, estimating engine, jobs and catalog/tax; no new property/customer/inspection/estimate/financial system                                                                                                                         |
| Identity                       | Dedicated restricted LOGIN and NOLOGIN owners for complete transitive call graph; genuine verified signed identity, issuer/audience/expiry, current user/session/member/assignment and required MFA; capability issuer independent of request input                                               |
| Server-owned command authority | One-shot durable claim before mutation/reservation, exact operation/phase/identity receipts, current final authority, cross-process duplicate handling, explicit UNKNOWN reconciliation; no raw helper or generic SQL escape                                                                      |
| Writer coordination            | All ordinary estimate create/save/revise/duplicate/issue/archive, maintenance, readiness, inspection publication/plan, CRM/job, policy/catalog and mixed admin writers must adopt a reviewed lock order; native race/deadlock/timeout tests before promotion                                      |
| Custody                        | Encrypted persistent caller intents/receipts with reviewed key ownership/rotation/recovery, actual filesystem trust model, bounded WAL/disk policy, failure before mutation if custody fails; hash/receipt shape alone is not authentication                                                      |
| HTTP/BFF                       | Verified server-side identity, strict origin and CSRF rules, safe cookie/session handling, allowlisted operations/content types, strict bounded UTF8/JSON, request/response/depth/time limits, abuse/rate/concurrency controls, cancellation and backpressure; no frontend role/company authority |
| Application persistence        | Replace only narrow existing repository ports after separate local approval; version-aware edits and source navigation, explicit responsibility and draft scheduling; no automatic fixtures or source mutation; locked approved UIs preserved                                                     |
| Customer privacy               | Separate allowlisted published report/issued-scope readers bound to exact customer/property; never share maintenance notes, costs, workforce or unissued drafts; connected customer routes remain closed                                                                                          |
| Audit/monitoring               | Append-only metadata without payload/PII, privileged issuer/read activity, duplicate/UNKNOWN/expiry/denial/timeout signals, restricted diagnostics; no secrets in generic logs                                                                                                                    |
| Retention/cleanup              | Reviewed retention/PII/legal-hold policy; no cascading deletion of held evidence; bounded capacity, manual authorized archival/cleanup, encryption and independently tested restore                                                                                                               |
| Recovery/containment           | Process/database/host/disk/backup restoration and independent device evidence; reject new work on loss, preserve exact UNKNOWN; exact reviewed revoke/disable boundary, no automatic replay/destructive rollback/history repair                                                                   |

Required production acceptance is separate from implementation: genuine Auth/MFA and
session revocation, least-privilege full graph, real multi-user/transport/privacy/load,
file/power/disk recovery, monitoring/retention operations and supervised containment.
Staff measurements remain attestations, not independently authenticated measurement
truth. Current6/6 internal readiness does not authorize issue, dispatch, approval,
contract, invoice, receivable, payment or refund.

No executable migration or proposed replacement of historical SQL is part of2D/this
review. Frozen P1 must remain against thirteen history, with its existing unchanged
approval; pending customer-fourteen remains a separate unapplied gate. Any later
maintenance history expansion, operational grants/identities/wrappers/features,
connected UI or hosted acceptance needs exact separate review/authorization. A local
synthetic contract PASS never grants hosted, recovery, provider, Netlify, launch,
financial execution, outside-access or merge authority. AR stays held for planning.
