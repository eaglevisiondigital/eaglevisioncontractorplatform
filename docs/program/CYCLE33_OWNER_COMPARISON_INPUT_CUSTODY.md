# Owner comparison filter input custody

Parent: `762e6fa590d3ef9366052db0df34bb02485973c3`.

The existing saved-priority comparison filter checked native snapshot access before
capturing caller filter fields. A descriptor Proxy could revoke the actual native
owner during capture and still receive private retained priority rows. Three brand
regressions reproduce this precise disclosure on the parent; the native access
reader independently rejects after the same revocation.

The correction captures and validates the three existing primitive filter fields
before the original historical-access and current-source checks. Both native
guards remain intact. Filtering still uses original comparison/card objects,
literal text, existing ordering and counts. No selector runs after those guards;
no cloned handle, authorization cache, business store or navigation owner is added.

## Evidence

- Parent: **0 PASS / 3 FAIL**, all three native-revocation disclosure assertions.
  Raw JSON SHA-256:
  `2fb73073d371559c3f4d4c5b9f62a78d22157a9007af19d95ecfb6b36b328066`.
- Corrected new suite: **19 PASS / 0 FAIL / 0 skipped**. Raw JSON SHA-256:
  `0c5a51e01de09eef4dc40a99c07c0eee8415fe41bcf04f87b9622ae087a9310f`.
  Cases cover three-brand actual revocation, confirmation withdrawal during field
  capture, stale canonical cost revisions, ordinary literal filters, exact row/job
  identities, no writes, rejected accessors, copied comparisons and cross-job/tenant
  denials. Filtering does not adopt or replace selection.
- Separate retained execution: **81 PASS / 0 FAIL / 0 skipped**, comprising all
  44 original Cycle19 saved-priority cases and all 37 original Cycle21 recorded
  owner-action cases. Raw JSON SHA-256:
  `5ffd4765b436671ab4db13e12e56abde6c2148302a4994b12f24c9bc9c9e4028`.

The original 30-second test and hook budgets remain unchanged. Focused execution
uses one worker and is separate from original four-worker Foundation evidence.
No successful hosted checks were manually rerun. This author package does not
claim new browser, hosted, physical recovery, full Foundation or visual acceptance.

Customer source-lineage work is separately owned and reviewed. Growth has no new
runtime change from this audit. Existing default-OFF behavior, original one-use
custody, UNKNOWN read-only reconciliation and no-replay navigation remain intact.
No schema, provider, financial execution, communications, dispatch, hosted mutation,
operational restoration, deployment or merge is authorized. All original design,
P1, customer14/4B, MFA/Auth, NMI and recovery gates remain unchanged.

**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
