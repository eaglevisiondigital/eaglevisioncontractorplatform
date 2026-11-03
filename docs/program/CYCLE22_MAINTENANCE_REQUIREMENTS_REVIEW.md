# Cycle 22 — maintenance requirements review

The existing Maintenance slot now combines a current-source requirements desk
with unchanged `MaintenancePlanCorrection` controls. The original planner,
PropertyRepository plan CAS, contact evidence reader and correction intent remain
authoritative. No new plan, sender, attempt owner, store, archive or adapter exists.

`readMaintenanceRequirementsReview` reuses the C21 exact plan/renewal reader,
its original synchronous and asynchronous current-contact fences and the original
read-only correction receipt. A strict projection shows the current plan revision,
native occurrence index and source plan/report/finding identity, exact recorded
visits, recorded channel reference and bounded review window. A final receipt
read and current-source guard reject intervening changes.

Purpose consent, suppression, enrollment and sender authority remain UNVERIFIED;
renewal terms remain UNKNOWN. CAPTURED_NOT_ATOMIC describes a review capture,
never consent-at-send. Recorded channel permission cannot authorize sending.
All message, renewal, enrollment, scheduling, billing and provider authority stays
blocked; no recipient resolver, message body or outbox is introduced.

The operator can explicitly capture a same-session reference, save a plan through
the original form, then read current requirements. Exact-ID comparison reports
changed/unchanged plan fields and added/not-in-current-review occurrences. Similar
wording never matches sources. Absent occurrences do not prove completion. The
old read-only reference is never restored to a canonical record or promoted to
current evidence. Current revoked/stale sources are withheld; historical reference
facts are labelled separately in a source-checked comparison.

Original UNKNOWN holds remain UNKNOWN after read-only observation. A current plan
revision does not substitute for a missing result receipt or permit a retry. An
exact source-checked maintenance destination is only a navigation hint.

Tests use all three brands and native plan/occurrence/contact sources, real
recorded preference withdrawal, source and membership denial, final-await
changes, original CAS concurrency, lost acknowledgments, immutable references,
privacy and default-off presentation: 34/34 uniquely named focused cases passed
locally. Strict types, scoped lint, owned-file formatting, features and the
retained Cycle21 source/protected integrity chain passed. Root records combined
browser/CI evidence; local results do not claim remote CI completion.
The browser is DEV HTTP-loopback only; same-tab references do not claim durable
custody or genuine authentication. No physical repair completion is inferred.

All protected migrations, customer14/4B, P1, recovery, NMI, hosted/financial and
communication gates remain unchanged. Release 1.0 remains NOT READY / NOT AUTHORIZED.
