# Loaded timesheet review filters

This isolated child of #557 extends the existing Workforce Timesheets list with
job/overhead and review-state filters, visible-versus-loaded entry counts, reset
and empty-result feedback. The original worker filter remains available. A worker
change resets the narrower job/review filters. An unmapped job stays unmapped;
the list does not substitute a current job or infer a relationship.

Filter state binds to the organization, repository and current resource read
generation. A new read or context resets it. Rows, counts and source-derived
selector options are withheld while the existing resource is loading/unavailable.
These are presentation checks over the repository’s already-authorized projection,
not new Auth verification or continuous revocation monitoring.

New job/review filters hide nonmatching authorized rows without unmounting their
unsaved correction forms. The existing worker filter still unmounts excluded
rows. Loading, unavailable and changed-authority sources remove private rows
from the DOM; CSS visibility is never an access-control boundary. Only visible
rows contribute to the loaded-list count. Payroll/export
and posting source arrays, canonical calculations, all existing row/action bodies,
clock controls, manual-time/correction forms and worker/rate/payroll handlers remain
unchanged. Filtering performs no repository read or write and does not establish
complete time coverage, payroll acceptance or actual work completion.

Approved reference 50 shows a fuller job-linked time table in a different shell,
with additional KPI/variance and labor-review surfaces. This increment covers only
the useful loaded-record filtering interaction. Full reference-state and visual
acceptance remain pending. Evidence uses explicitly fictional browser fixtures and
existing `/preview` samples; no real account, time entry or payroll operation is
performed. The 128 protected sources, five locked assets/styles, thirteen design
bindings, #555/#557 behavior and all operational/financial/release gates remain held.
