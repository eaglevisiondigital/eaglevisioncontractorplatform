# Cycle 28 · exact native task custody and selection

Exact source parent: `5f74b8ff5385560330cb94717c17338ed0c10f44`.

## Demonstrated findings closed

The original detailed receipt and original task graph are read separately. A genuine original correction can claim its one-use custody and lose its native ACK before a business write between those reads. The parent implementation accepted a composite with detailed receipt `NOT_ATTEMPTED` but graph receipt `UNKNOWN`, because it joined identity without comparing the original shared custody fields. All three brand fixtures reproduced this contradiction using the actual original correction owner and a lost native ACK. No replay or writer bypass was demonstrated.

The existing continuity inspector now requires exact agreement on original `state`, `source_id` and `result_id` before returning the composite. It rejects a mixed observation and requires a separately explicit exact read; it does not retry, claim, restore or classify UNKNOWN as failed. Accessors cannot execute during the comparison. Fresh original UNKNOWN reads remain available, while original correction admission stays spent.

The component also caught selected-task inspection failure in the same catch as valid graph inspection. This hid its whole picker and made its existing unavailable-ID option unreachable. It now retains the independently validated current picker, keeps the unavailable exact ID selected, withholds task/action detail, and permits only an explicit choice of another displayed native ID. It never chooses the first/newest task. C27 revoked-private-context withholding remains unchanged.

## Source audit and remaining native gaps

The task chain retains the exact original company/customer/property/estimate/issued-version/job identity and original correction source/result IDs. Native approved time is documentation, not posted labor, invoice readiness, dispatch or physical completion. Upstream field coverage remains assigned-worker-only: removing an assignment can make the original reader unavailable. This bounded package does not broaden that coverage or infer an alternative worker/history.

## Actual focused evidence

**117/117 application cases pass:** 10 new C28; retained C27 11, C26 22, C25 20 and C24 54. Six new initial RED cases reproduce three custody races and three unreachable unavailable-selection cases. The corrected cases also cover fresh UNKNOWN/no replay, original-row preservation and accessor denial. Retained tests cover source CAS, concurrency, current revocation, tenant denials and default-OFF. Original tests/assertions are unchanged.

Actual browser **3/3 brands pass**, zero outside requests, showing retained unavailable selection and explicit alternative native-task selection. Approved rows have no native deletion API; absence is deliberately injected at the original reader and is not reported as a native delete or operational recovery. Controlled-state React regression evidence and real browser evidence remain distinct. Screenshots/raw JSON/harnesses stay private under `artifacts/cycle28`; no fixture or evidence file is canonical state. Main separately validates committed combined sources, desktop/tablet/mobile accessibility and exact-head CI.

The original minimum-readiness192 review remains STATIC REVIEW ONLY / NO-GO. No new store, engine, attempt owner, receipt archive, navigation, schema or restoration adapter was introduced. CSS/design locks, migrations, frozen P1/four/Netlify, customer14/4B, Auth/MFA, NMI, recovery and production restrictions remain unchanged. Air remains unavailable; no physical PASS or repeated offline baseline. No hosted action, credentials, payments, dispatch, messages, merge or deployment.

Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
