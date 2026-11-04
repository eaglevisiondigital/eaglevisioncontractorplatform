# Cycle 27 · exact own request-selection input

Exact parent: `f81081b3ce8fca63443a9f03e8bfcd5aa4daa4b6`.
Bounded author: `/root/cycle27_customer_offline`.

The original service-request evidence join checked seven current identity/status
values by directly reading `expected[key]`. It accepted inherited or extra selection
fields and could execute an accessor while obtaining a supplied expected binding.
This contradicted the existing strict-own-data input boundary. The request/source
readers still enforced their current original authority; this finding does not imply
hosted access or a demonstrated cross-tenant disclosure.

The same existing join now parses the exact fourteen-field own-data shape returned
by its original request inspector before reading expected bindings. It rejects accessors,
inherited properties, arrays, extra fields and incomplete snapshots. The original
current request owner is checked first, followed by the seven unchanged exact request,
tenant/customer/property/status/assignment/update comparisons. Nested display arrays
are neither serialized nor treated as authority. No copied input becomes a reader:
the original registered view and safe published-source handles remain mandatory.

The initial focused baseline passed 14/26 cases and failed the twelve malformed-input
expectations across all three contractor brands. The corrected focused suite passes
26/26. Together with the unchanged C24 request-action, C25 service-evidence and C26
observation-access suites, all 130/130 cases pass. Tests cover exact immutable report
identity, unavailable request-to-job FK/completion/customer acceptance, unchanged original
custody, accessor/inherited/extra-input denials, actual stale request state, current
revocation before hooks, cross-company evidence denial, OFF-before-hooks and lost ACK
remaining UNKNOWN with exactly one original invocation. Private RED/GREEN reports remain
under `artifacts/cycle27/`; no local result is represented as GitHub CI success.

No component, CSS, report projection, canonical engine, original attempt owner, receipt,
store, navigation, protocol, source preparer, operational Auth or hosted adapter changed.
The Cycle 26 retained-observation access guard remains unchanged. Main performs combined
responsive/accessibility and production-OFF coverage; this source-input correction adds
no new visible interaction or design approval requirement.

Request review is internal intake status/responsibility only. Published service history
remains immutable and exact report/version/job/issued-scope-bound. Missing request-to-job
foreign keys, complete history, physical completion, warranty and customer acceptance
remain UNKNOWN. A missing native CAS/durable receipt is not manufactured by this guard.
Lost acknowledgment remains exact read-only/no replay across rereads and other jobs.

All original thirteen migrations, pending customer14/original4B, frozen P1/four artifacts,
Auth/MFA, NMI, recovery, Netlify, approved interfaces/artwork and financial/provider/
communication/dispatch/production restrictions remain unchanged. The independent device
rehearsal is NOT RUN and twenty-five completed offline setup checks are not repeated.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
