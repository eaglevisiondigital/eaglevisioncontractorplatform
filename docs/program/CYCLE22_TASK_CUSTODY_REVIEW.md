# Cycle 22 — exact task custody review

The Field slot gains an exact original-entry versus recorded-correction review.
It composes the existing `TaskCorrectionReview` controls unchanged. The original
Phase3 engine and `saved-revision-exercise` intent remain the only writer and
attempt owner. There is no new task store, evidence file, adapter or command.

`readTaskCustodyReview` reads the original read-only reconciliation before and
after a source-bound allowlisted canonical snapshot. Only the receipt's exact
source/result IDs select comparison rows. The result must retain the original
`corrects_id`, job and worker. Missing IDs do not select a similar or latest task.
Task, kind, times, billable status, submission and internal review differences are
labelled CHANGED, UNCHANGED or NOT_COMPARABLE. Internal review reasons and private
rates/costs are excluded.

KNOWN_SAVED requires the original saved receipt and exact result observation.
UNKNOWN stays held even when that result is observed. Lost initial acknowledgments
may expose an unattributed canonical child in the separate available-record list;
it never substitutes for a missing receipt result ID. Absence is UNAVAILABLE,
not failed execution or completed work. Read-only reconciliation never clears a
hold, retries a command or creates a replacement ID.

Existing current-source, current eligible synthetic staff and final-await guards
withhold stale or revoked details. An exact guarded destination is only a job
navigation hint. The recipient workflow retains its original command guards.
The browser view is default-off, DEV HTTP-loopback only; its reads and same-tab
references are neither genuine authentication nor durable command custody.

Focused tests exercise all three brands, native append provenance, unchanged
originals, missing evidence, lost acknowledgments, concurrent original actions,
duplicate prevention, source/membership denial, final-await changes, privacy and
default-off presentation: 30/30 uniquely named focused cases passed locally.
Strict types, scoped lint, owned-file formatting, features and the retained
Cycle21 source/protected integrity chain passed. Root owns actual combined
browser/CI evidence; these local results do not claim remote CI completion.

No dispatch, physical completion, payroll/payment execution or hosted action.
Protected migrations, P1, customer14/4B, recovery and all release gates remain.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
