# Job customer and property context

This optional UI child of draft #555 adds an explicit read-only contact review
inside the existing Jobs detail. The original Estimates navigation, job selector,
financial calculations and command handlers remain unchanged.

The read resolves the job’s original issued version through the existing
`sourceEstimate` repository method, verifies its baseline through the canonical
`baselineFromEstimate`, and follows that exact version’s customer/property IDs
through the existing CRM readers. It displays current CRM name, email, phone,
recorded contact preference and the exact linked address. A missing original
property link stays missing; no current/latest property is substituted. Private
notes, rates, costs, estimate content and consent history are excluded.

Current CRM and estimates access and enabled modules are checked before reads and
again after them. The job is read again after CRM waits; foreign, duplicate,
missing, regressed or changed-original-baseline jobs deny the view. Organization,
repository, Operations instance and job changes discard late responses. Starting
a new read hides the prior contact. Errors use a generic message. The explicit
clear action returns keyboard focus to the load control.

These checks are observations at read boundaries, not continuous Auth monitoring
or an atomic server transaction/CAS. Contact details can change after a completed
read. The display distinguishes current CRM values from retained issued snapshots;
recorded contact preference is not consent to send a message. It creates no record,
sends no message and does not clear or reconcile financial UNKNOWN holds.

Approved reference 34 includes a fuller Contact & Property CRM screen, activity,
demo values and actions. This increment covers only job-linked contact/property
review and keyboard/async behavior. Dark-shell/layout parity, that full reference
state and genuine hosted Auth/data acceptance remain unaccepted. The existing
128 protected sources, five locked assets/styles and thirteen design bindings
remain unchanged. Financial source admission and operational gates remain held.
