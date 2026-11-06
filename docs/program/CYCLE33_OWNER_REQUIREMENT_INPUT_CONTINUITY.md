# Owner requirement selection currentness

Parent: `2b8406d10b96ffa7f06a8ef5ae1835538b313d30`.

The original Owner action requirement checker validated the native briefing before
capturing caller selection fields. A descriptor Proxy could revoke the actual
native owner during that capture and still receive private retained requirements
and facts. Three brand regressions reproduce this disclosure on the unchanged
parent source. The native briefing reader independently rejects after the same
revocation.

The correction adds one final call to the existing
`assertVerifiedOwnerBriefingCurrent(view)` immediately before returning the
requirements projection. The leading native admission guard remains intact, so
invalid or disabled reads never inspect caller selectors. Exact five-field
selection validation, original row identity, requirements, status distinctions and
all original verification and one-use navigation guards remain unchanged. No
authority handle is cloned or cached, and no store, engine or UI is added.

## Evidence

- Parent regression: **0 PASS / 3 FAIL / 0 skipped**. All failures are the precise
  private-result assertion after actual native owner revocation. Raw JSON SHA-256:
  `1becb8816048e6bc72c83a6ab79b07e36c81994349b8deac29699793e43ee2a7`.
  The unchanged parent native file SHA-256 was
  `3457d010c8e965afb2915271d0a83f2e0988172567aa3d92d3be44aaabf0cf77`.
- Corrected focused execution: **47 PASS / 0 FAIL / 0 skipped / 0 todo**, comprising
  **20 new cases** and all **27 unchanged Cycle24 Owner action verification
  cases**. Raw JSON SHA-256:
  `eafddf100d8beaeedcd0a240bc5124bf2c6b6c8197eedd1889e3873520b17ebb`.
  New cases cover three-brand actual revocation, confirmation withdrawal during
  descriptor capture, ordinary exact selections and original row references,
  accessor rejection without invocation, no business writes, actual canonical
  material review and explicit fresh reads, other-job and foreign-tenant selectors,
  UNKNOWN with no navigation callback, and original invalid/default-OFF admission.
- Scoped ESLint, strict TypeScript, Prettier and diff checks passed.

The original 30-second test and hook budgets and original assertions are unchanged.
Focused execution used one worker with retries disabled. This local result is
separate from original four-worker Foundation evidence. No successful hosted checks
were manually rerun; no browser, complete Foundation, physical recovery or visual
acceptance is claimed.

The bounded read audit of existing Field task receipt reconciliation, Customer
source/service continuity, Growth maintenance correction/revision requirements and
Offline admission/protocol paths identified no additional demonstrated defect.
Those modules remain unchanged; this audit is not exhaustive operational acceptance.

Default-OFF behavior, current-source authorization, original exact selection,
UNKNOWN read-only reconciliation, no replay and navigation-only authority remain.
No schema, hosted service, operational persistence/restoration, credential access,
financial action, communication, dispatch, deployment or merge is authorized. All
approved designs, protected files, P1, customer14/4B, MFA/Auth, NMI and recovery gates
remain unchanged.

**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
