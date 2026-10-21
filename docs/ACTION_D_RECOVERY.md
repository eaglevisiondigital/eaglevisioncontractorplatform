# Propel Contractor Suite · Action D read-only recovery review

Latest: [authorized recovery execution](ACTION_D_RECOVERY_EXECUTION.md) stopped
at the first static-file PUT422. No confirmed uploads or manifest retry;same
deployment remains uploading. No later repair/retry authority is implied. The
following sections preserve earlier evidence.

**BLOCKED / NO RECOVERY WRITE AUTHORIZED.** October 16, 2026.
Read this after ACTION_D_EXECUTION.md. The original frozen package and target-bound
operation remain unchanged. This investigation made no hosted writes, replacement
creation, retry, cancellation, deletion, publication or configuration change.

## Exact observed state and registration evidence

Private evidence binds every observation to the original site/deploy identifiers.
At **14:32:57 UTC**, authenticated site inventory returned exactly one deploy: the
original manual `deploy-preview`, still **uploading**, created 12:59:17.529 UTC.
Independent deploy reads at 14:19:48 UTC showed last update 12:59:18.586 UTC,
`error_message=null`, no ready timestamp, `published_at=null`, summary building with
no messages, and empty required-file/function lists. The primary site remains
unpublished and Git unlinked. A final independent read at **14:39:02 UTC**
confirmed the same uploading/unpublished state. No ready application is claimed.

| Evidence                                     | Actual result                                                | Interpretation / limit                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Deploy-specific `GET /deploys/{id}/files`    | HTTP 200, empty array                                        | Zero of nine expected static/configuration entries visible; cannot verify remote hashes or served bytes           |
| Static upload execution record               | Zero PUTs                                                    | Provider requested no static hashes; this does not establish deduplication success                                |
| Four original function archive PUTs          | Previously returned 2xx                                      | Transport evidence only; original success response bodies/headers were not retained                               |
| Deploy-scoped dashboard Functions            | All four expected names shown, matching upload times         | Registration exists; dashboard's “actively running” label is not invocation/readiness proof                       |
| Material-import dashboard detail             | Expected `/api/material-import` endpoint shown               | Route visible; runtime, archive checksum, effective variables and invocation remain unverified                    |
| Deploy API `available_functions`             | Empty                                                        | Conflicts with dashboard registration; do not collapse these distinct provider projections                        |
| Site-wide Functions API                      | HTTP 200, empty object                                       | Does not enumerate the pending deploy's four dashboard registrations                                              |
| Deploy-specific historical logs              | Official CLI exited 0; zero entries for 12:58–13:12 UTC      | No diagnostic explaining the original upload/finalization period; not proof of no provider internal error         |
| Dashboard deploy log                         | Loading, no error detail                                     | No available provider failure diagnosis                                                                           |
| Current connector protection                 | Team login required for all deploys                          | Configuration confirmed; deployed perimeter acceptance still BLOCKED                                              |
| Enriched project-summary alternate deploy ID | Exact-site GET 404; absent from authenticated site inventory | Inconsistent summary metadata; no evidence of a second deployment in this site; do not follow it as a replacement |

Four dashboard names: `intake-profile`, `intake-submit`, `material-import`,
`organization-context`. No function was invoked to investigate. The deploy metadata
does not expose a complete persisted manifest, function runtime/build configuration
or deploy-specific environment values. The request contains exactly the reviewed
three Functions-scope values, but read-back/runtime persistence is **UNVERIFIED**.
No site/shared environment write is a permitted workaround.

## What the HTTP 500 proves, and what it does not

At 13:07:23.753 UTC the earlier executor sent one same-ID manifest PUT with the
identical approved JSON body. It received HTTP 500 by 13:07:24.300 UTC. That helper
retained the status/timestamps but discarded the error response body and headers;
there is no original provider request ID or stack trace to report. No recovery PUT
was made to manufacture missing diagnostic evidence.

The deploy was already stuck before that PUT. The 500 therefore cannot explain the
initial stall by itself. The evidence supports **incomplete manifest registration
or provider processing** as the working hypothesis, not a proven provider-only
outage or a proven malformed request. No unexpected artifact hash, malformed local
ZIP, missing local file or schema rejection has been demonstrated. Offline schema
validation does not prove provider acceptance of every field.

The official [digest API guide](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/)
describes initial digest POST, required blob PUTs and automatic post-processing;
it does not prescribe a second manifest PUT after successful blob uploads. The
current pinned CLI 27.12.1 uses another sequence: create an empty deploy, update its
manifest **before** required blob uploads, then wait. OpenAPI 2.60.0 supports the
same-ID update operation and deploy-specific environment data; endpoint existence
alone does not establish that repeating it at the observed state is safe/recovering.

The guide's `runtime=js` example and current CLI's `runtimeVersion ?? runtime`
behavior differ. The approved `nodejs24.x` upload matches the pinned bundler/CLI
metadata pattern; changing it to `js`, dropping metadata, changing path prefixes or
removing environment values without evidence would be an unreviewed experiment.
The CLI also normalizes its TOML configuration, whereas this reviewed package
preserves original TOML bytes. Ask provider support whether any schema/configuration
compatibility issue caused the registration failure; do not alter the frozen file.

Netlify staff documents the deploy-specific file listing in this
[provider support response](https://answers.netlify.com/t/api-endpoint-deploys-deploy-id-files-path-randomly-gives-strange-results/22091/3).
Using only the published-site file listing would not verify this pending preview.

## Recommended recovery operation and approval boundary

**First action: owner-authorized Netlify support investigation of this exact
existing deploy.** A private support packet is prepared under ignored
`.staging/action-d/recovery/support-review.private.json`; no support message has
been sent. It contains target/deploy identifiers, UTC chronology, status and digest
counts, the unchanged operation/archive hashes and precise questions. It excludes
credentials, environment values, browser sessions, TOTP, customer data and archives.
Ask Netlify to inspect the original POST, four function PUTs and failed manifest PUT;
explain the zero file registry/empty required list discrepancy; confirm persisted
function metadata/three scoped variables; and identify a supported same-ID repair.
Request diagnosis first, with no publication, deletion or security-setting changes.

A proposed same-ID repair review is prepared privately, **NOT AUTHORIZED / NOT
EXECUTABLE**. If Netlify confirms that manifest replay is the supported fix, review
and separately approve exactly one `PUT /sites/{site_id}/deploys/{existing_id}`
using the original body byte-for-byte (canonical body hash recorded privately).
Refresh exact identity, protection, unpublished state and every artifact hash first;
stop on drift. Capture bounded, redacted response/error text, status and provider
request/correlation headers even on failure. No automatic retry. Only a separately
approved continuation may upload provider-requested blobs from the original nine
static/config entries and four ZIPs, with original digests/runtime/metadata. Reject
unknown hashes, unexpected publication or another deploy ID. No initial POST,
rebuild, settings edit, deletion or replacement is part of that proposal.

This conditional PUT is a review candidate, **not yet the recommended executable
fix**: the same body already failed once and the underlying cause is unavailable.
Provider-side repair/requeue or any other suggested write needs exact owner review
before execution. A replacement deployment remains outside current approval.

If the original deploy becomes ready unchanged, refresh protection/publication and
registration/hash evidence, then perform the existing cookie-free 27-path GET/HEAD
perimeter procedure before any authenticated application login. Stop on protection
failure. Only then resume previously authorized internal browser scenarios with
actual owner-assisted MFA. Do not count 404s, metadata or dashboard labels as passes.

## Validation and continuity

- **PASS:** 26 offline artifact/schema/digest/runtime/route/environment checks;
  all 14 original files, archive, operation and exact logo hashes unchanged.
- **PASS:** formatting/diff, unchanged migration-bundle and private-reference checks
  recorded in this checkpoint's commit. No product source or schema changed.
- **FAIL (historical):** one same-ID manifest PUT returned 500; original diagnostic
  body/request ID unavailable.
- **BLOCKED:** ready application, remote byte/config verification and deployed
  anonymous perimeter; provider diagnosis and separately reviewed repair remain.
- **NOT RUN:** connected deployed browser/role/MFA and runtime-function acceptance.
  Application/native/browser suites were not rerun for documentation-only work.

No Supabase operation, identity/session/factor/permission change, extra grant,
provider call for business execution, deployment write or outside invitation was
performed. Existing protection was not modified. Release 1.0 remains **NOT READY /
NOT AUTHORIZED** and PR #1 remains draft/unmerged. Earlier local and connected Action B
results remain historical evidence, not a passing Action D runtime acceptance.

## Subsequent owner-authorized support submission

The owner authorized sending this prepared diagnosis-only request. It was submitted
through the existing private Netlify support channel; receipt/ticket acknowledgement
and the necessary same-thread scope confirmation are verified. No actual diagnosis
or corrective recommendation yet. See ACTION_D_SUPPORT.md and ignored correspondence;
the earlier unsent-packet description above is the historical preparation record.
No deployment write, repair or expanded authorization followed.
