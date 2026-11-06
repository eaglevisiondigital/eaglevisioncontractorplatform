# Original service lineage handle capture

Parent: `762e6fa590d3ef9366052db0df34bb02485973c3`.

The existing service-source validator captured and checked the original completion
context and Property Passport handles, but its lineage consumer then read the raw
caller wrapper again. A Proxy over an ordinary copy could supply another genuinely
authorized job's property handle on that later read, returning request/scope A with
published report/job identities B. This does not establish a recorded request-to-job
relationship or allow publication, completion or customer acceptance.

The correction reuses the existing complete validation as a private capture that
returns only the two original opaque handles. The lineage and original asynchronous
report consumer use those captured references. The exported assertion retains its
void interface. Original currentness, request/property/job/estimate/issued-version,
published report association and post-await checks remain. No handle cloning,
authorization cache, registry, business store, inferred relationship or navigation
owner is added.

## Evidence

- An initial frozen-target Proxy probe failed three get-count assertions because
  JavaScript's frozen-target invariant rejected the substitution. That result is
  retained as a harness limitation, **not** a mixed-lineage disclosure proof.
  Raw JSON SHA-256:
  `02f2ac0e9c7eb03d9c372fa4de03922ad815641fba8ba4b08a4b4f26e707da5f`.
- The corrected ordinary-wrapper parent probe is **0 PASS / 3 FAIL**, each failing
  the exact report-job/scope-job identity assertion across the three brands.
  Raw JSON SHA-256:
  `136eac25f8cf0f3459735f3152b166a5e05c7d7c2b4adee627b6e6e763297edf`.
- Initial corrected source execution is **3 PASS / 0 FAIL / 0 skipped**.
  Raw JSON SHA-256:
  `4813948f7c695b18f3d497a27b64753cd97120e11e012aa25370dac6a51621d6`.
- Expanded new-suite execution is **13 PASS / 6 FAIL / 0 skipped**. Six new harness
  expectations incorrectly treated the existing lineage's UNKNOWN completion as
  UNVERIFIED or assumed an old all-source reader survived a native job revision.
  The native completion-detail interpretation remains UNVERIFIED. Only the new
  expectations and the native nested report-reference accessor were corrected;
  original assertions, runtime guards and budgets were not changed.
  Raw JSON SHA-256:
  `cd51b04f4461d462d0f229ae22005adbb5516c4dd1a592377d69c9aa8961ec57`.
- Failed-six-only execution: **3 PASS / 3 FAIL / 13 filtered**. The stale-source
  cases passed. The three ordinary-inspection cases exposed a further new harness
  error: the native published reader requires the exact original retained report
  reference, not a copied reference. That guard remains unchanged.
  Raw JSON SHA-256:
  `8d791ebc0bd69e8cc99ccbd4afac58233e7e769e51ac71735b73cd13ae2eaa8a`.
- The remaining three new cases, corrected to use the original report reference
  and explicitly assert copied-reference denial, are **3 PASS / 0 FAIL /
  16 filtered**. Raw JSON SHA-256:
  `d80f1e3136a9dd693b40ea9a8779604e4c2467f409a2a9b817fa94597819cd7d`.
  No single nineteen-pass report is claimed. The split coverage includes all three
  brands, exact original request/job/report identities, asynchronous report source
  substitution denial, accessor rejection, actual native revocation during capture,
  stale source denial, foreign-tenant handle denial and unchanged original records.
- Separate complete original Cycle23 service-source-review file: **56 PASS /
  0 FAIL / 0 skipped**, including original authorization, source-identity,
  publication, completion-requirement, asynchronous revocation and OFF checks.
  The original test file is unchanged. Raw JSON SHA-256:
  `c941fe5348e173c5e81891b28c3391f45ccd89a6a6d4f416f288dfb846c09d31`.

Scoped lint, strict TypeScript, formatting and diff checks passed for the frozen
source/new-test package. This does not advance any source manifest or protected
hash; Main owns finite build admission and independently verified integration.

Focused executions use one worker with the original 30-second test/hook budgets.
Split reports must remain split; a local pass is not current-head hosted CI or full
Foundation acceptance. No new browser, responsive, visual, physical recovery or
production durability acceptance is claimed by this nonvisual source package.

Request-to-job linkage remains UNKNOWN without a canonical relationship; published
documentation does not verify physical work, acceptance, warranty or delivery. All
existing default-OFF, current-authorization, immutable publication, original UNKNOWN
and no-replay gates remain. No schema, restoration adapter, hosted operation,
credentials, dispatch, payment, message, deployment or merge is authorized.

**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
