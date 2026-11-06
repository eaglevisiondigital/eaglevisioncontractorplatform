# C17 historical-source checkout precondition

Base: `5d695378f6f8573f99628116611c71c755c60c06`.
Original tree: `4614d3115425940cd50cf7e8fd32883f72884d44`.
This separate CI-only correction changes no business source, test or source pin.
It is independent of the C17 filtered-result parser correction in draft PR290.

## Actual failed run

Main289 pull-request run42306807075, job128198097959, failed the original
`node scripts/check-cycle17-integrity.mjs` preflight at22:45:04UTC on November6.
Typecheck and feature integrity passed. The inner error was:

`Reviewed Cycle11 source changed: src/lib/workflows/sync-admission-review.ts`

The denial propagated through the existing C14, C15, C16 and C17 integrity
checks. Vitest, its result collector, build and all browser stages were skipped.
The artifact inventory is empty; no test case, test JSON, application timeout or
runtime defect was observed in this run. The original job remains **FAILURE**.

The actual checkout was PR merge carrier
`b9e16f1ac6c2af2529e6fb2f292cf9e4dd5fc870`, with parents67cf660 and5d695378.
Provider commit metadata confirms its tree equals the original Main tree above.
The job used Node24.22.2, npm11.19.1 and Ubuntu24.04.
Its checkout log explicitly records `fetch-depth: 1` and `git fetch --depth=1`.

The unchanged C11 validator requires original commit
`6108876998b891108964a4a9a7a58bef6e0b31ef` before checking the exact reviewed
Advanced successor `2bd1060982bc4a7d7b1c30b0329888b419ade027` and its companions.
Its original catch preserves the source-denial message instead of exposing the
inner Git/admission error. That exact inner error is not available in the hosted
log; the log alone does not establish an exclusive cause.

## Controlled local source-only comparison

The approved comparison used the exact same5d head/tree and local Node24.20.0 in
both arms. The second arm was a new local-file-protocol, single-branch,
`--no-local --depth=1` clone. No network, credentials, dependency installation or
application tests were used. Source, workflow, checker, package and lock bytes,
Git blob modes and clean working trees matched.

| Unchanged source check                  | Full history | Depth-one history |
| --------------------------------------- | ------------ | ----------------- |
| C17 integrity CLI exit                  | 0            | 1                 |
| Elapsed seconds                         | 1.727489     | 0.222587          |
| Original610887 commit lookup exit       | 0            | 128               |
| Reviewed successor2bd106 lookup exit    | 0            | 128               |
| Hosted source-denial message reproduced | No           | Yes               |

Both full-history lookups returned `commit`; both shallow lookups lacked the
objects. Full history passed the unchanged original source guards. Depth one
reproduced the exact hosted denial before any tests ran. This demonstrates the
local history precondition, consistent with the hosted checkout. It does not
claim a hosted rerun, exclusive hosted causation or application acceptance.
The local Node version differs from hosted24.22.2; both local arms used the same
24.20.0 version.

Private evidence digests, with correspondence and local paths excluded:

- Hosted failure classification:
  `b5886f0a516d40fd4aeadb9805deca7643572702dc312c14626e077c01b86017`.
- Controlled source-only comparison:
  `6c3b071925bbc4c6f89b80d13a009c93e09bfc53ebc5ea9600b217e2102c61ed`.

## Narrow correction and limits

Add `with: { fetch-depth: 0 }` only to the existing C17 checkout step.
Every other byte of that workflow remains unchanged, including its35-minute
job budget, original test assertions, worker settings, dependencies, source
guards, result collectors, artifact policy and branch/path triggers.
Foundation and all other workflows remain unchanged. No application test or
successful hosted check is manually rerun for this source-only preparation.

This proposal supplies required public Git history; it does not bypass or relax
any source guard. A later current-head result must be recorded separately.
Original failures, cancellations, incomplete Foundation evidence and historical
Cycle18/270-case evidence remain unchanged. No result is inherited from Main289
or PR290, and no full C17 PASS is claimed here.

No merge, deployment, hosted mutation, operational restoration, credential
retrieval, payment, message or dispatch is authorized. Original design locks,
recovery, P1/customer14/4B, MFA/Auth, NMI/settlement and production gates remain.

**Release1.0 remains NOT READY / NOT AUTHORIZED.**
