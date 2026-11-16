# Read-only intake pipeline · isolated UI development

This optional child of exact #528
`5bf90478a853e34cfdb18cc6ed3a2b1c7ace25d5` extends the existing
NewLeadDashboard. It does not compose Settings #529, Team #517, Catalog #522 or
the separate #531/#533 source authors into the launch candidate.

The original `Operations.listIntake` supplies selected-company, selected-status,
ten-row pages and the matching count. New/reviewing/qualified/closed are its
existing intake statuses. Selection resets the page; explicit refresh creates a
new presentation generation. Current results bind repository, company, stage,
page and generation. Both original pre-read and post-read company access/module
checks remain. Loading, late prior results, failures, denial and module withdrawal
withhold rows, counts and the intake-navigation control. Refresh is a read only;
there is no assignment, issue, message, financial command or attempt-hold reset.

Responses with unsafe counts, too many rows, duplicate IDs, foreign-company rows or
wrong-stage rows are rejected entirely rather than salvaged. Count cards identify
only the selected intake stage and current page. They never represent all leads,
customers, jobs, revenue, customer acceptance or payment. The platform-only
`company_metrics` RPC is not repurposed for contractor staff. No new KPI engine,
store, schema, API, grant or connected route is introduced.

Default-new behavior, original API-call counts, original CompanyOperations tenant
router prefix, App, IntakeQueue, canonical repositories, forms and existing
callbacks remain unchanged. Existing count-shrink/withdrawn-page recovery remains
explicit. Role/module changes while the UI is idle are not continuously polled;
this is not genuine current Auth/MFA acceptance. The new controls are presentation,
never authorization. All128 protected pins, five design locks and13 bindings stay
exact. Locked CSS/artwork and historical failures are not rewritten.

## Validation and limits

Primary: all15 existing dashboard browser cases and21 new desktop/tablet/mobile
cases pass, with no skips/retries or budget changes. New cases cover stage/page
counts, late stage and refresh results, post-await revocation/module withdrawal,
foreign/wrong-stage/duplicate/invalid-count responses, company/repository changes,
count shrink/error and actual App keyboard/Axe/overflow/screenshots. Existing sample
repositories are used only by explicit test fixtures; no synthetic business
records or transaction totals are added to product source. External test requests
are blocked; the harness origin is intercepted, and the App server is loopback only.

An initial12PASS/3FAIL existing-suite run detected insufficient contrast on new
labels. Only the new label styling was corrected; original assertions and global
styles stayed exact. The failed report remains private. Independent review/run
results and exact source binding accompany the draft PR, separately from primary
counts. Native PostgreSQL and unchanged operational recovery evidence are reused,
not replayed or claimed as acceptance of this new UI.

This provides bounded interactive progress for reference states3–5/33, not the
complete approved dashboard, financial charts, Kanban layout or all63 states.
Financial fixture admission remains held for this optional source. No full
Foundation or hosted-business acceptance is inferred from local browser success.
D1–D3, A01–A12, #508/#509, genuine Auth/MFA, invoice SQL/grants, NMI and independent
custody/recovery, merge/deploy and release gates remain unchanged.

Release1.0 remains NOT READY / NOT AUTHORIZED.
