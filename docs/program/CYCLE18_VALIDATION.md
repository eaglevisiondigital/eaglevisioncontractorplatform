# Cycle18 · local daily contractor workflow validation

Current implementation is local synthetic review only. Five independently owned
packages compose on draft PR125 against unchanged Cycle17 ab7a95596f89f7bceb1fc089cdaa790a55fb10d5.
Actual work used the four available concurrency slots: Main plus three workers;
Field/Growth and Customer/Advanced shared workers with separate disjoint worktrees.
The independent reviewer replaced a completed worker, with separate source custody.
No claim of five simultaneously active author processes is made.

## Delivered implementation

One default-false daily workflow retains exact company/customer/property/job/issued
version across priorities, work orders, cost review, invoice requirements, published
service evidence, maintenance planning and existing advanced controls. One original
SharedRecordSearch selects the initial job. Required confirmations remain. Retained
Field and Finance DOM/control instances survive review navigation; next-job reads the
next exact available prepared record. Visited means reviewed presentation only.

Field adds recorded day/week/crew/status filters and exact source navigation, with
actual availability/completion UNKNOWN. Finance reuses canonical cost coverage,
profitability, exception evidence and existing invoice requirements; incomplete costs
are not zero. Customer offers allowlisted published service/Passport evidence and
exact report/version links; request/job relationships and physical completion stay
UNKNOWN unless original evidence supports them. Maintenance offers available recorded
occurrences and renewal requirements while consent/suppression/enrollment remain
unverified. Priorities use the unchanged source priority engine and retained original
owner/advanced controls, including the seven original add-on modes; no model/provider
call, duplicate ranking engine, new stores, contracts, invoices or reminder enrollment.

## Actual author roster

| Package               | Actual agent                       | Branch                              | Draft PR | Exact author SHA                         | Cases |
| --------------------- | ---------------------------------- | ----------------------------------- | -------: | ---------------------------------------- | ----: |
| field-agenda          | /root/cycle18_field_growth         | codex/cycle18-field-agenda          |      126 | 2e1346165b50a33e2a695c159e47107302210ce6 |    45 |
| cost-invoice-review   | /root/cycle17_finance_intelligence | codex/cycle18-cost-invoice-review   |      129 | 1b5040904fe11307c790bf64f5c6488e2a23f983 |    53 |
| service-update-review | /root/cycle13_customer_advanced    | codex/cycle18-service-update-review |      127 | 8f9292e7daa74ac962b0d2896337ae511b49d1e6 |    55 |
| maintenance-agenda    | /root/cycle18_field_growth         | codex/cycle18-maintenance-agenda    |      128 | 8a16ca1f00230486c443579fb5c68efce6a0160f |    52 |
| priority-actions      | /root/cycle13_customer_advanced    | codex/cycle18-priority-actions      |      130 | 695dfb8cb5fa0313d69f6e3532ae2c55203c9641 |    58 |

Main: /root, codex/program-cycle-eighteen, draft125.
Independent: /root/cycle18_independent_review; exact source review evidence is in
CYCLE18_INDEPENDENT_REVIEW.json and delivery index. Completed workers are listed as
completed, not represented as persistent background agents.

## Demonstration

In this worktree: VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4361 --strictPort.
Open http://127.0.0.1:4361/preview/operating-center. Check Use daily contractor workflow,
choose a contractor, confirm the disposable environment and prepare it. Expand
Retained daily workflow → Daily contractor workflow. Review priorities, use Find
another record once to select an exact job, confirm each review and use the explicit
continuations. Continue to next prepared job changes exact context without inferring
completion. Reload loses same-tab context; no durability or genuine Auth claim.

## Independent findings and corrections

Actual tests found post-ACK source/callback drift, and Customer/Priority cross-view
continuations could race despite per-view pending flags. Final consumers fence source
and callback generation after awaited acknowledgment. Canonical Operations/company/job
PENDING claims reserve before first await and release only by exact claim identity;
UNKNOWN stays permanent across new wrappers and restored evidence. Original RED
records remain private; no old assertions or timeouts were removed. The legacy sync
Finance port observes/rejects a thenable within the original UNKNOWN custody boundary.

Main fixed StrictMode read admission, unique review-group naming and compact scoped
navigation; these do not touch approved scopes. Initial priorities expose no continuation
until the original exact job selection exists. New browser harness supplies its own
h1; same-origin blob requests are local artifacts/analysis, not outbound provider
traffic. Full external-origin and accessibility assertions remain intact.

## Verification

Final combined application run PASSED446/446unique cases across12
exact files:263author,20Root runtime,8composition,58independent and97retained cases.
Strict single-run validator passed;0failed/skipped/pending,446unique cases, maximum
22.939sunder unchanged30sbudget. Independent review commit
3b7542a9c0d6b02267333d878191722399cee3b3 is an exact two-file local source-admission
record; it was not separately pushed as an incomplete branch. Its unchanged test
and review JSON are published in coordination draft125 and content-bound in the index.
Independent58casePASS and30development/3productionOFF browser PASS are complete.
The original18case full matrix/63captures bind exact28d551b; final12selection/company
cases and3OFF bind e99000e. The narrow difference is stated explicitly. Initial368
PASS and filtered RED probes remain separate, never substituted for final acceptance.

The first compound independent trials exceeded30seconds while browsers competed
for CPU. Unchanged55cases passed alone. Splitting only three newly authored journey
cases into two ordered phases over the SAME saved fixtures retained every assertion
and separate no-effect spy window; final58passed with17.081smaximum. No timeout or
Foundation workflow was changed. Complete local type/lint/format/build/generatedtype/
protected and proposal integrity checks pass. One inherited C14 Fast Refresh lint
warning and the existing optional-preview bundle-size warning remain nonblocking.
GitHub CI observations are exact-head and time-bound; pending/cancelled checks are not
presented as green. Successful prior checks were not manually rerun.

## Protected and separate acceptance

C6→C17 integrity retains all prior author bytes,128protected hashes, five locked
assets/thirteen bindings. All13historical migrations, pending customer14, original4B/
broker, frozen P1/four artifacts, owner approvals, Netlify archive/executor,2A–2F and
six proposed billing enhancements remain unchanged. The approved portal/Property
Operations/branding scopes remain locked; Operating Center/advanced visual promotion
PENDING, missing originals MISSING. Existing25capability states,18scopeIDs and eight
closed PhaseOne gates are unchanged. No hosted writes, credentials, provider/NMI,
financial/payment execution, dispatch, communication, deployment, merge or activation.

Newer-Air November4 checklist: CYCLE18_NOV4_MACBOOK_AIR_CHECKLIST.md. Actual maintained
OS/FileVault/independent power/network/pairing/durableACK/primaryloss/recovery are
UNVERIFIED; preserve25completedoffline/setup/network evidence. No credentials or
hosted recovery run. Original frozen P1 approval remains valid, with unchanged gates.

## Next bounded package

Reconcile known saved task/time/material revisions back into the retained daily
context through the existing engines, with explicit source review and no UNKNOWN
replay or duplicate entry. Operational persistence,
verified completion, issuance/delivery, dispatch, consent-at-send/NMI/Auth and physical
recovery remain separately accepted workstreams, not implicit next execution.

Release1.0 NOT READY / NOT AUTHORIZED.
