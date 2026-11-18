# Refresh selected estimate CRM records

This ordinary child of #566 adds an explicit read-only refresh to the existing
estimate CRM picker. A loaded contact and address can now be re-read without
changing searches, result pages, selected IDs or unsaved estimate work. The
existing error-only “Reload CRM selection” action is unchanged.

Refresh repeats the same four Operations read expressions with the same arguments,
including the existing two nested customer-ownership lookups in the location
readers. It adds no Auth call, writer, route, store or source substitution. A local presentation
generation joins the existing Operations/tenant/selection/query context. Clicking
refresh immediately withholds old options, counts and contact details, before the
loading effect runs. The button stays disabled while no current result exists or
the original parent disables selection. Late reads remain subject to the original
resource cancellation and exact-context checks. Errors and foreign/mixed results
withhold the whole presentation; the original error reload remains the recovery
action. Refresh never renews estimate command, CAS or UNKNOWN attempt authority.

The before-image browser case demonstrates the missing loaded-state refresh
action. New focused coverage checks exact read counts and arguments, synchronous
withholding, repeated clicks, foreign/error recovery, query/page and draft
retention, late context changes, native keyboard operation, scoped Axe and
responsive overflow. Previously accepted #555/#557/#562/#566 cases are retained
without replay. All original picker callbacks, data validators and four read-call
expressions remain unchanged.

Reference 34 remains the original Leads & CRM Contact & Property reference. This
Estimates action advances current-contact review in a different destination; it
does not accept the full CRM screen, dark shell, timeline or other reference
states. Original reference IDs, hashes and prior overlays remain intact. The
optional source lineage, financial source-admission holds, protected 128 files,
five locked files and thirteen bindings remain separate. No continuous Auth,
atomic multi-read snapshot, genuine account access or operational acceptance is
claimed. Release 1.0 remains NOT READY / NOT AUTHORIZED.
