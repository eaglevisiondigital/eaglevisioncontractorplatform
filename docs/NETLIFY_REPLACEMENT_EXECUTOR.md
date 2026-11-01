# Netlify replacement executor · offline readiness

October 30, 2026 · America/Chicago. **Offline implementation only. No execution
authorization exists. Release 1.0 remains NOT READY / NOT AUTHORIZED.**

This completes the bounded algorithm requested after the
[exact replacement review](NETLIFY_REPLACEMENT_DRAFT_REVIEW.md). The original review
JSON, frozen source/archive/request and historical validation remain unchanged.
The strategy is accepted for preparation; that is not approval to create a draft.

## Implemented components

- `server/netlify/replacement-package.ts` validates the fixed review-contract hash,
  exact private target binding, original canonical body/archive/file-manifest hashes,
  fourteen paths/lengths/SHA-256s, nine unique SHA-1 mappings, four unique Function
  mappings and original Function/environment shape. The frozen entry point has no
  hash override. Prepared packages are opaque and clone their input buffers.
- `replacement-journal.ts` uses private owned canonical directories and regular,
  single-link 0600 files; exclusive creation, file and directory fsync, a permanent
  attempt claim and bounded hash-linked append-only events. There is no reset,
  delete, rebind or resume API. Frozen operation custody has exactly one fixed path:
  `.staging/action-d/replacement-execution/{private-target-binding-sha256}`. A new
  approval record cannot select another attempt path. Restart inspection with
  missing receipts retains UNKNOWN; damaged or unsafe evidence denies execution.
- `replacement-executor.ts` performs the actual preflight → pre-send claim → create
  → initial-response custody → required-only uploads → ready observation → exact
  registration/site/protection/perimeter verification → stop state machine. All
  effects use explicit injected ports. No live HTTP adapter, credential reader,
  private-input loader, executable CLI, App route or provider connection is supplied.
  Importing the code reads public review/code files only.

The fake provider exercises those same functions. Its separate package entry point
can generate only `netlify-rehearsal.invalid` API URLs and `synthetic-test.invalid`
site URLs, with fixed credential-free synthetic environment strings. Its permit
kind cannot authorize the frozen package; an owner-labelled permit cannot execute
the synthetic package either. The frozen entry point rejects synthetic bindings.
Tests do not load real private body/environment values into the executor.

## Exact restrictions enforced

Before any request, require an explicit target-bound A–D approval record matching
the package's private binding, body/package hashes, exact site/original ID, current
three-file executor fingerprint and exact preflight fingerprint. Require its issued
time/expiry, at most 24-hour validity and exact fields/scope. Missing approval is
NO_GO. No default, environment flag, fixture selection or historical approval can
enable it. No approval record is created by this increment.

The approval record is an operator-custodied record of a separately given owner
decision, not a self-authenticating signature or a new Auth system. The trusted
custodian must establish the actual owner's decision and bind the exact code and
evidence before supplying it. Tests use OFFLINE_TEST_APPROVAL records only. Same-user
forgery, deleting/replacing the custody directory, disk rollback and a dishonest
transport/evidence adapter are outside this local trusted-process boundary. This
does not close the separate operational custody/recovery/security acceptance gates.

The engine then enforces:

1. Independent dashboard evidence for Private production and previews, all-deploy
   team login, a witness digest and bounded freshness. A connector summary, blank
   page or missing witness is rejected. Exact target/team, complete deploy and
   environment inventories, unpublished primary, original uploading deployment,
   unlinked Git, no extra domains/aliases/environment injection and build-settings
   hash are checked against the approved baseline.
2. One permanent attempt per binding, committed before POST. A concurrent invocation
   cannot share the active journal or create another draft. Existing UNKNOWN stays
   UNKNOWN; stopped or completed attempts are never replayed.
3. The initial ID/state/time/required lists and safe response metadata are retained
   before optional-field validation. Missing/malformed/unknown/duplicate digests
   stop. Explicit empty lists are allowed only with complete final registrations.
   Later GET lists never replace the initial queue.
4. New exact site-scoped manual preview identity, null publication, no build,
   expected HTTPS permalink and permitted state. Explicit false/contradictory draft
   evidence stops. Expected omission of optional `draft` requires exact read-only
   corroboration and unchanged primary/original evidence before uploads.
5. At most one PUT per initial requested digest, rechecking the copied original
   bytes immediately before send. Four original Function configs, Node24 streamed
   upload metadata and exact receipt identity/digest/length are preserved. Cached
   Functions are not reuploaded. No endpoint for manifest replay, publication,
   deletion, retry, settings or old-deployment mutation exists in the algorithm.
6. UTC/monotonic consistency, creation clock skew at most 120 seconds, manual presence
   at most 60 seconds old, 45-minute maximum supervision and the earlier six-hour
   provider expiry minus 30-minute margin. Do not start a mutation without its full
   60-second budget remaining, including approval expiry. Read timeouts are 20 seconds;
   no more than sixty ten-second state polls. Aborts/timeouts win even if an adapter
   ignores cancellation; a late response never advances another phase.
7. Exact nine file and four Function registrations, including metadata for reused
   Functions, plus unchanged original/primary/site configuration. Metadata gaps are
   not repaired by reupload. The complete 27-path GET/HEAD matrix on primary and new
   permalink requires exact evidence for every host/path/method; 404, incomplete
   probes or exposed bytes cannot pass. The original/site baseline is checked again
   after perimeter evidence, before the terminal receipt.

All receipts contain bounded identities/digests/status, never full request bodies,
environment values, Authorization/cookies or arbitrary response fields. Provider
text is evidence, not a command. Any lost response or uncertain journal write
retains UNKNOWN, including across a process restart. A known created draft held
for validation failure is STOPPED; this never means the draft was rolled back or
does not exist. Read-only journal inspection cannot transmit a request or resume.

## Offline verification

Run `npx vitest run tests/netlify-replacement.test.ts` using the repository's pinned
Node24/dependencies. No credential, hosted target or live adapter is needed.
The fake transport records actual engine requests and checks `.invalid` URLs.

Coverage includes success/all thirteen requested uploads, Function reuse, empty
queues, malformed/missing lists, wrong IDs/site, unknown/duplicate digests, false/
omitted/contradictory draft state, create/upload response loss, private journal
failure, startup/restart/concurrency, deadline/clock/presence loss, polling limits,
registration/configuration drift, publication/protection/perimeter failure and no
final manifest or automatic second creation. Real child processes are SIGKILLed
after fake create and upload side effects, then restarted against retained custody:
UNKNOWN persists, provider create count remains one and restart sends nothing.

[NETLIFY_REPLACEMENT_EXECUTOR_VALIDATION.json](NETLIFY_REPLACEMENT_EXECUTOR_VALIDATION.json)
records final counts, code fingerprint, prior green CI and integrity results. Initial
fixture failures used noncanonical macOS `/var` temporary paths; fixtures now use
their real paths. The production canonical-path guard was preserved. Test import
type errors were corrected. No failure was reclassified as a passing hosted test.
Process-kill evidence does not prove physical power-loss or disk recovery.

## Exact action-time preflight · all must pass before creation

No live preflight is run in this offline increment. The previous read-only original
deploy observation and all-deploy connector summary remain historical evidence.
The prior independent dashboard was blank. **Current independent protection is
unproven; execution is NO-GO.** No connector flag or fake witness closes that gate.

| Check                  | Exact action-time evidence                                                                                                                                                                                    | Current status                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Owner authority        | Separately recorded exact A–D decision, private target/body/package/code/preflight bindings, bounded expiry                                                                                                   | NOT AUTHORIZED                                   |
| Protection             | Read Project configuration → General → Visitor access without editing; production and previews Private, or team login/all deploys. Retain independent witness digest/time. Stop on blank/unavailable/mismatch | PENDING / prior dashboard blank                  |
| Identity and inventory | Exact private site/name/team; site-scoped old deploy; every page of site deployment inventory; no unknown IDs or concurrent writer                                                                            | ACTION-TIME READ REQUIRED                        |
| Primary                | Exact published ID/timestamp, including explicit null; no deployment or primary change from the separately reviewed baseline                                                                                  | ACTION-TIME READ REQUIRED                        |
| Domains/Git/build      | Exact custom domain/aliases, unlinked repository, build-settings fingerprint; no new domain/alias/hook                                                                                                        | ACTION-TIME READ REQUIRED                        |
| Environment            | Complete site and team-shared **metadata** inventory; no unreviewed keys/scopes/injection. Do not retrieve values during readiness                                                                            | ACTION-TIME READ REQUIRED                        |
| Frozen custody         | Reverify original archive, all fourteen entries/materialized bytes, metadata, sealed body and exact private target binding; no regeneration                                                                   | OFFLINE INTEGRITY PASS; refresh before execution |
| Value custody          | Exact original sealed three-value body; only after execution approval may approved custody supply it in memory. No guesses, service key or settings repair                                                    | SEALED HASH PASS; values not retrieved           |
| Adapter/supervision    | Reviewed exact single-send/no-redirect/no-retry transport; independent read-only snapshot/registration/dashboard/perimeter adapters, genuine manual-presence source and abort wiring                          | UNWIRED / no live adapters supplied              |

The read adapters must collect provider results and independently witnessed dashboard
settings, not fabricate Snapshot/Registration/Perimeter DTOs. A `.invalid` fake result
is never action-time evidence. Their implementation/custody must be reviewed before
execution; current ports describe the finite evidence required and fail closed
without it. Snapshot responses are fresh within one minute; dashboard witness is
at most 24 hours old. The exact initial snapshot facts/witness digest are bound to
the approval record; any drift requires review, not rewriting the approval.

Future read-only endpoints remain those in the original contract: exact site,
complete site-deploy inventory, old/new site-scoped deploys and new-ID file registry.
Deploy-scoped Function metadata and dashboard/perimeter evidence must establish the
remaining facts without runtime secrets or an application Auth session. No Supabase
call, grant, migration, feature activation or authenticated browser test is included.

## Readiness verdict and future approval text

**NO-GO for requesting final owner execution authorization now.** The algorithm and
fake-provider evidence are prepared; independent protection/current complete
baseline and operational adapter/supervision evidence are not proven. Do not open
the six-hour window. Do not retrieve credentials to discover whether execution works.
The existing P1 approval and separate recovery prerequisites are unchanged.

The following exact A–D decision text is prepared for a later owner decision **only
after** the above gaps are closed and its final code/evidence hashes are reviewed:

> Authorize one new protected, unpublished manual draft on the existing privately
> bound site, using original source 28c7d5e and canonical creation body SHA-256
> `3409f4fb4cd0c7a9cd3831ed2ea089cdede8d72742afb8ddeed9d221ce7ee510`.
> Bind the private site/original ID through target-binding file SHA-256
> `fe5183ee9343f24968d42ea790cd4e95a3d7fee8870c8e3d59608b73150dc135`,
> the original archive/manifest, current reviewed executor fingerprint and exact
> independently proven preflight fingerprint. A: one draft POST only. B: upload
> only initial required digests, at most nine original static/configuration PUTs
> and four original Function PUTs, once each, with original deploy-only environment
> and Function configuration. C: bounded read-only registration/site/protection/
> anonymous-perimeter verification, without app Auth or financial/provider calls.
> D: stop unpublished. Enforce all stop conditions, a supervised 45-minute session,
> six-hour expiry with the earlier margin and no uncertain retry/continuation.

There is no final manifest PUT, second create, automatic new ID, publication,
old-deploy modification/deletion, environment/protection edit, hosted Auth/database
action or merge. A failure stops and retains evidence; containment or a different
operation requires a separately reviewed decision. Ready draft metadata is not
Function-runtime, genuine Auth/tenant, current-HEAD or Release 1.0 acceptance.

The approved interfaces, original README, thirteen historical migrations, pending
customer migration, frozen P1 operation/four artifacts and all original approvals
remain. No original artifact or private historical execution record was changed.
The separate two-computer recovery, financial/provider, Netlify publication and
launch restrictions remain. Local commits/PR retain Netlify skip markers.
