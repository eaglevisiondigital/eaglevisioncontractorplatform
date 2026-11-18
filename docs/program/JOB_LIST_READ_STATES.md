# Job-list read states

The existing manager Jobs page showed **No jobs yet** while a job-list read was pending or had failed. The original empty-state guidance now appears only after a completed successful read supplies an empty list. Loading and error messages keep their original meaning; the existing **Refresh job costs** action still performs an explicit read.

The job loader, repository methods, selected-job logic, `JobDetail`, field expense forms, costing and source/authority guards are unchanged. This does not add navigation, automatic retry, new financial authority, an invoice route or a customer-approval assertion. The existing guidance still distinguishes internal job baseline approval from customer acceptance.

The browser fixture mounts the actual Phase3Workspace, with the same company/section key boundary as App, and uses the existing fictional sample repositories. A held old-company read may finish; it cannot mount its old view after the actual workspace changes company. This is a wrapper-boundary check, not a claim that direct arbitrary Jobs prop replacement gained new source metadata.

Finite tests cover a failed read and explicit recovery, pending reads, successful empty reads, an error after a loaded list, late old-company completion, and the existing keyboard refresh/accessibility on desktop and mobile viewport profiles. Original sample initialization creates one fictional example per company; test counters distinguish that original setup from additional writes. No operational Auth, SQL, provider call, payment, connected capability, store, schema or ledger is added.

Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
