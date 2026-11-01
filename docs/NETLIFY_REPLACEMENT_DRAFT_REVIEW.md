# Netlify replacement draft · exact owner review

October 30, 2026 · America/Chicago. **REVIEW ONLY / NOT AUTHORIZED TO EXECUTE.**
No deployment, upload, credential retrieval, setting change or message was made.
The existing deployment remains frozen. Release 1.0 is **NOT READY / NOT AUTHORIZED**.

## Decision and evidence limits

The owner requested this review separately from the original Action D and stopped
same-ID recovery approvals. Those approvals do not authorize a new deployment ID.
The proposed A–D scope below is one new manual, protected, unpublished draft of the
**original October 16 package**, not the current application.

The latest provider reply was independently read in the existing private support
conversation. These are attributed provider findings, not independently reproduced
backend facts:

- The initial creation registered nine outstanding static/configuration digests.
  Its initial `required` list carried the upload queue; a later GET returned an empty
  list despite missing files. The historical execution record's empty-list statement
  describes the client's observed handling; it does not disprove the provider's
  examination of the original create response. That response was not preserved
  completely enough to independently establish its original lists now.
- Four Function uploads succeeded; no static file upload succeeded. The missing
  `netlify.toml` contents caused the subsequent identical-manifest HTTP 500.
- Pending uploads expire approximately six hours after successful creation/update.
  The original window expired around October 16 at 19:00 UTC, before the October 17
  14:14:14 UTC upload that returned HTTP 422. The provider corrected its earlier
  late upload/replay advice and its reference to an unreported conflict response.
- There is no supported reopening operation for this stuck deployment and no
  tested provider-side repair offered. The proposed alternative is a new draft with
  the same files, Function digests/configuration and three deploy-specific values.
- Upload only its initial requested digests within that window. After the last
  required item, processing should reach `ready` automatically. **No final manifest
  PUT is part of this sequence.** Cached Function bytes may be reused when their
  digests are absent from `required_functions`.

No support correspondence, identifiers, routing headers or values are copied here.
The private source and sanitized findings remain in ignored recovery records.
The October 30 site-scoped connector read confirms the original ID still belongs
to the approved site, is a manual `deploy-preview`, remains `uploading`, has no
publication timestamp and retains the previously recorded creation/update times.
This establishes current observed state, not a guarantee against external changes.

The fresh project connector summary reports team login for all deploys. Independent
dashboard navigation returned a blank page; no setting was touched. The connector's
empty current-publication summary cannot independently prove a primary baseline.
Fresh dashboard protection, complete deploy/Git/domain inventories, primary state
and site/shared environment metadata therefore remain **pre-execution gates**.
An enriched branch URL is not authoritative deployment inventory and is not adopted
as a replacement ID. No local authentication store or credential-based API helper
was used to inspect protection. Historical configured Private status is not a
passing deployed perimeter test.

## Frozen bytes verified without a build

| Binding                         | Verified original                                                  |
| ------------------------------- | ------------------------------------------------------------------ |
| Source                          | `28c7d5e41c28c0714c41525179eb0637216a7729`                         |
| Archive                         | `propel-internal-28c7d5e.zip`, 3,593,733 bytes                     |
| Archive SHA-256                 | `a902edbc4ae006da9a98094c745cb45789f97e1e18151dd2fd73aa9f6519eafb` |
| File-manifest SHA-256           | `53dda494253a4bc56c1c4c4a89d225a2a5d3364017493b7820a838944d7e4d76` |
| Original artwork SHA-256        | `b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0` |
| Original operation SHA-256      | `2fed36e5d61f742e218cbd36de03b282e9f8cbbc9f51806513fa0238b04aacfc` |
| Canonical creation-body SHA-256 | `3409f4fb4cd0c7a9cd3831ed2ea089cdede8d72742afb8ddeed9d221ce7ee510` |

[ACTION_D_ARTIFACTS.json](ACTION_D_ARTIFACTS.json) remains the unchanged 14-entry
path/length/SHA-256 inventory. The canonical manifest is UTF-8 JSON of its `files`
array, recursively sorted keys, compact separators, no trailing newline. The ZIP
has exactly those 14 unique entries, no extras, matching lengths, CRCs and SHA-256s;
every materialized file matches its archived bytes. Original source-commit artwork,
dependency lock and TOML also match. No extraction over the originals, rebuild,
rename, regeneration or artwork change occurred.

| Artifact group                     | Count | Intended use                                                               |
| ---------------------------------- | ----- | -------------------------------------------------------------------------- |
| Original `dist/` files             | 8     | Site paths omit `dist/`; SHA-1 API map plus original SHA-256/length checks |
| Original `netlify.toml`            | 1     | Ninth required file-map entry; original 960 bytes                          |
| Original Function ZIPs             | 4     | Only returned SHA-256s in initial `required_functions`                     |
| `.netlify/functions/manifest.json` | 1     | Local bundler evidence, **not** a site upload or fifth Function            |

All four nested ZIP CRCs and v2 metadata/bootstrap entries match; no absolute or
parent-traversal ZIP entries/symlinks were found. The frozen manifest's original
local paths are retained privately without rewriting it. Original ZIPs are portable
archives; the local manifest is not served as a static file. Function transport
success in October does not establish runtime acceptance.

Current development starts from `e544d3bc032c990aca241dd74f9227184804dee2`. Its newer
portal, maintenance, readiness, custody and customer-request work is **not in this
archive**. Recovering this package cannot deploy or certify those features. No new
source checkout, build, branch promotion or substitution is proposed.

## Exact creation specification and custody

[NETLIFY_REPLACEMENT_DRAFT_REVIEW.json](NETLIFY_REPLACEMENT_DRAFT_REVIEW.json) contains
the complete original nine-path SHA-1 map, four-name SHA-256 map, all Function
configuration, environment shape, endpoints, request counts and timing bounds.
It is deliberately non-executable: environment values and the site ID are redacted.
Never send its placeholders. The complete future request must match the original
canonical creation-body hash above and the exact private target binding.

Private target-binding file SHA-256:
`fe5183ee9343f24968d42ea790cd4e95a3d7fee8870c8e3d59608b73150dc135`.
It binds the original site/team identity, old deployment, original source/archive,
operation and sealed request. It grants no authority. Its exact identifiers and
review evidence live only under ignored `.staging/action-d/replacement-review/`.

Proposed creation is exactly one `POST /api/v1/sites/{private-site-id}/deploys`,
JSON, `draft:true`, `async:false`, using the original body. No production/branch/alias
query flags, new title/source/branch fields, Git link, remote build or site creation.
The expected success status is HTTP 200 with a valid deploy object, as in the
[official API reference](https://open-api.netlify.com/#operation/createSiteDeploy).

Function configuration is carried in **`functions_config` in that creation body**.
Each original Function has `build_data.bootstrapVersion:"2.24.0"`,
`build_data.runtimeAPIVersion:2`, `priority:10`. Only `material-import` has the
additional original route: pattern/literal `/api/material-import`, `methods:[]`.
No new schedules, Edge Functions or server bundle are allowed. Original Function
uploads use `runtime=nodejs24.x&invocation_mode=stream`; do not replace that with a
generic `runtime=js` example or stale CLI-cache upload.

The three settings are **entries in `environment` in the same create body**, not
site settings or TOML build variables:

| Key                        | Original binding                                               | Scope and representation                  |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `SUPABASE_URL`             | Original designated development URL, retained sealed           | `scopes:["functions"]`, `is_secret:false` |
| `SUPABASE_PUBLISHABLE_KEY` | Original publishable key, retained sealed; never a service key | `scopes:["functions"]`, `is_secret:false` |
| `PUBLIC_INTAKE_ENABLED`    | Original literal string `false`                                | `scopes:["functions"]`, `is_secret:false` |

Custody availability is verified without retrieving values: the original private
creation file exists, its compact byte hash matches the approved body, and the
original private target-custody file exists. Environment value strings were masked
**before JSON decoding** for structural comparison. No Keychain access, credential
retrieval, value output or reconstruction from a public bundle occurred. Hashing
existing sealed bytes does not verify future operator authentication availability.
After separate approval, the established operator may use the exact sealed body
in memory; no values in argv, logs, public files or replacement review records.

Per-deploy variables must accompany the new creation; old-deploy values do not
transfer implicitly. The API documents creation-time environment values and their
precedence over site/account values; subsequent modifications are ignored.
See [deploy environment schema](https://open-api.netlify.com/#operation/createSiteDeploy).
Fresh metadata must rule out unreviewed site/shared injections. If values or scope
are missing/mismatched, stop before creation; do not repair environment settings.
Effective Function-runtime configuration is still **UNVERIFIED**. A–D cannot certify
it or authorize a debug endpoint, secret read or compensating variable update.

## Bounded future procedure · not executed

No executor is added or activated by this documentation. The historical creation,
continuation, finalization and recovery mutators must not be reused: they do not
implement this new initial-response custody and stop contract. A future reviewed
executor needs offline evidence for pre-send custody, response retention, optional
draft-field handling, digest allowlists, deadlines and UNKNOWN/no-retry behavior
**before any credential access or creation**. Passing a specification check is not
passing those execution tests.

1. **Finish preparation first.** Require exact A–D execution approval, a supervised
   45-minute session, frozen hashes/body/target matching, usable private custody,
   no competing writer and fresh read-only evidence at most 24 hours old. Refresh
   target, complete deploy inventory, primary publication, Git/build settings,
   domains/aliases and environment metadata again immediately before POST. Read
   Private production **and** previews in Project configuration → General → Visitor
   access; for legacy protection require team login/all deploys. No setting edit.
   Capture private baseline identities/counts and review any drift. Do not retrieve
   or create a new credential, Auth session, grant or database permission under this
   preparation. Existing credential use belongs to the later exact execution scope.
2. **Commit one attempt before transmission.** Exclusively create and fsync a private
   pre-send record with the approval/body/target hashes and attempt identity. An
   existing, pending or UNKNOWN record forbids another POST or replacement attempt.
   Record local UTC and monotonic start times. Transport has no automatic retries,
   no redirect following and a 60-second mutation timeout. No idempotency support
   from the provider is presumed.
3. **Create once; retain initial evidence before other checks.** Store and fsync the
   new ID, site, state, `created_at`, exact `required` and `required_functions`
   arrays, explicit/omitted `draft` status, context, publication and returned HTTPS
   permalink. Retain status, Date, Content-Type, request/correlation ID when present
   and bounded sanitized error evidence; never Authorization, cookies, environment
   values or provider tokens. No guessed request ID. If response/journal persistence
   fails, mark UNKNOWN and stop. **Never overwrite these initial lists with a GET.**
4. **Validate identity before uploads.** New ID must differ from every baseline ID
   and belong to the exact site. Require manual `deploy-preview`, absent build ID,
   null publication and the expected immutable HTTPS host. Initial state must be
   `uploading`, `uploaded`, `processing` or `ready`; other states stop. `draft:false`, production
   or contradictory evidence stops. The optional `draft` response property was
   omitted historically: that expected omission alone permits only the predeclared
   site-scoped GET corroboration of exact ID/site/manual preview/null publication/
   permalink, plus unchanged primary evidence. Retain the initial lists first.
   Never invent `draft:true` in the response or repeat creation. Missing any other
   required safety evidence stops further mutation.
5. **Validate initial queues.** Both lists must be present arrays of strings, even
   if empty through deduplication. SHA-1 file requests must each map to exactly one
   original path; Function SHA-256s to exactly one original name/ZIP. Check format,
   uniqueness, maximum nine/four and original hashes/lengths. Unknown, duplicated,
   ambiguous or missing digests stop. Nonempty Edge/server/schedule requirements
   stop. The original nine-file universe has nine unique digests. Do not upload
   unrequested cached items or the bundler manifest. Later empty GET queues cannot
   erase initially owed uploads or establish successful registration.
6. **Upload each requested item once.** Sequentially send original static bytes to
   `PUT /deploys/{new-id}/files/{encoded-original-path}`, then only requested ZIPs to
   `PUT /deploys/{new-id}/functions/{exact-name}?runtime=nodejs24.x&invocation_mode=stream`.
   Both use `application/octet-stream`; no whole-archive site upload. Recheck each
   byte length and hash immediately before sending. Commit each pre-send phase,
   then retain HTTP 200 and matching file path/SHA/size or Function name/SHA receipt
   before advancing. API paths are fixed from the allowlist, not provider-provided
   upload URLs. Missing identity/digest fields, malformed body, any non-200 or lost
   response stops; never treat HTTP success alone as final acceptance.
7. **Enforce deadlines without extending the window.** Conservatively use the earlier
   local pre-send/provider creation time for the approximate six-hour expiry; reject
   missing/invalid creation time or clock disagreement over 120 seconds. Stop mutations
   at the earlier of session start +45 minutes and expiry −30 minutes. Do not start
   a request that could overrun that bound. Clock/supervision/process loss stops.
   No keepalive manifest update, queue rebuilding or second draft to reset time.
8. **Observe automatic processing.** After all required receipts, use bounded reads:
   at most 60 state polls, ten-second intervals, 20-second read timeout, within the
   session deadline. Require ready plus the verification below. Error, expiry,
   unresolved processing or any unexpected state stops acceptance. **Zero final
   manifest PUTs**, even if processing remains pending. Netlify's
   [digest deployment guide](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#file-digest-method)
   describes required queues and automatic processing; its general retry advice
   does not override this owner's no-retry contract.

An unknown creation with no saved ID is reconciled read-only against exact provider
request evidence and the complete baseline inventory. Similar timestamps/titles
alone cannot authorize adoption. An uncertain upload may be inspected by exact
new-ID/path/digest receipt and registry; absence is UNDETERMINED, never a resend
permit. No mutation phase resumes automatically after UNKNOWN, restart or timeout.
Further continuation requires a separately reviewed owner instruction.

## C · verification scope and acceptance limits

Future A–D approval would allow only management read-backs, read-only dashboard
inspection and cookie-free GET/HEAD protection checks. No app login, token/MFA flow,
POST probe, customer/financial operation or Function-runtime test is included.

- Get the exact new site-scoped deploy: manual preview, **ready**, `published_at:null`,
  correct ID/site/permalink and no remote build. Do not confuse ready with security.
- Use the provider-supported `GET /api/v1/deploys/{new-id}/files`, not only a primary
  site file list. Require exactly the nine expected paths, original SHA-1s and byte
  lengths. A receipt/registry path may be the exact original path or that same path
  with one leading `/`; no other prefix removal, percent decoding, case folding or
  approximate matching. Request paths never change. No unexpected public entries.
- Require four exact Function registrations/digests and original configuration,
  including reused archives. Inspect deploy-scoped dashboard and available metadata;
  if metadata cannot prove runtime/routes/bootstrap, record **UNVERIFIED**, not PASS.
  Do not reupload an unrequested Function to fill an evidence gap.
- Compare full pre/post deploy inventory: exactly one new ID, no other changed old
  deploy; original still uploading/unpublished and original identity/configuration
  unchanged. Compare the primary published ID/timestamp, Git/build settings, domains
  and aliases exactly to the fresh baseline. A new immutable draft permalink is
  expected; it is not a new alias-setting authorization. Any unexpected publication,
  new domain, alias change or unexplained original-state change stops.
- Re-read Private production/previews or team login/all deploys independently in
  the dashboard. The [visibility documentation](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/)
  describes access settings; a draft or secret URL alone does not provide privacy.
- On primary, new immutable permalink and every inventoried host, use the existing
  27-path cookie-free GET/HEAD matrix: root/deep routes, exact JS/CSS/artwork/TOML,
  friendly and direct paths for all four Functions. Disable redirect following and
  app Authorization. Require Netlify denial/login challenge and no app/file/API
  bytes. Inspect redirect destinations without logging token-bearing URLs. A 404,
  unavailable Function or connector flag alone is inconclusive. Stop at a possible
  leak; do not continue browsing/collecting exposed data or relax protection.
- Record all mutations/endpoints and prove none changed Auth/database/grants/features,
  mappings/leases, providers or financial controls. No Supabase call is part of A–D.
  Historical disabled-state evidence is not a new database verification. A ready
  protected draft does not certify effective environment, protected authenticated
  browser/Function behavior, tenant/role/MFA acceptance or newer HEAD features.

Authenticated perimeter/browser/runtime/tenant testing requires its applicable
separate scope and original recovery prerequisites. No automatic connected P1 run
or duplicate P1 approval request. The existing P1 approval remains intact for its
original exact thirteen-history operation after its original prerequisites.

## Risk and containment register

All rows first stop transmissions, retain private evidence and notify the owner.
“Containment” below is a possible later separately approved action, not authority
to perform it. An unpublished draft can still expose data if protection fails;
the provider's no-rollback statement is not a security guarantee.

| Risk                            | Stop condition                                                                         | Later decision, requiring separate approval                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Window expiry                   | Clock uncertainty, session/deadline reached or unfinished uploads                      | Leave draft unchanged; review any future new draft, never restart automatically                                     |
| Missing/mismatched artifact     | Any missing byte/hash/length/path/metadata/custody binding                             | No create/upload; restore trusted custody separately, never rebuild/substitute                                      |
| Incomplete create configuration | Missing/mismatched Function config or three-value binding; extra environment injection | Stop before POST; if already sent, leave record and review separately; no patch PUT                                 |
| Function discrepancy            | Unknown digest/name/runtime/route or missing registration                              | Hold acceptance; obtain diagnosis, no unrequested reupload/runtime change                                           |
| Environment discrepancy         | Sealed request drift or inability to establish effective runtime                       | No secret-reading probe or settings update; scoped verification/config change needs review                          |
| Publication/access drift        | New or primary publication, Public/previews mismatch, changed alias/domain             | Treat as incident; exact access restriction/unpublish/other containment separately authorized; no presumed rollback |
| Malformed response              | Missing queues/ID/time, wrong site, bad shape/status or unknown requirements           | Preserve bounded response evidence; no guessed defaults or replacement                                              |
| Uncertain mutation              | Lost create/upload response, journal failure or process loss                           | Exact read-only reconciliation; no retry, new ID, receipt invention or automatic resume                             |
| Failed perimeter                | App/asset/API content exposed or challenge cannot be established                       | Stop probes, preserve minimal evidence; exact privacy containment requires urgent owner decision                    |
| Original/primary drift          | Any unexpected pre/post state, inventory or build/domain difference                    | Stop; no old-deploy modification, deletion, publication or restore                                                  |
| Unreviewed executor             | Historical helper, missing durable response/intent custody or failing stop tests       | Local repair/review only before credential access; no hosted experiment                                             |

No deletion, cancellation, restore, manifest replay, reset or settings repair is
implicitly permitted. The original stuck deployment must not be modified or deleted.
No support reply or request for provider intervention is sent by this package.

## Exact owner decision requested · A–D only

Review this document, its JSON contract and private target binding together. Approval
would be conditional on every pre-execution gate and a reviewed, offline-verified
executor implementing the same bounds; it would not override a failed check.

| Scope | Maximum and exact intent                                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | **One** POST to the existing private-bound site's deploys endpoint, using canonical body `3409f4fb…`, explicit draft true; create one new unpublished manual ID                     |
| B     | **At most nine static PUTs and four Function PUTs**, each digest once, exclusively the saved initial required lists, exact frozen bytes and original Function upload metadata       |
| C     | Bounded management/dashboard read-backs and cookie-free GET/HEAD perimeter checks described above; compare old/primary baselines and do not invoke authenticated business workflows |
| D     | Stop after verification with no publication; report actual PASS/FAIL/BLOCKED/UNVERIFIED/UNKNOWN and retain the private record, including on failure                                 |

This request includes the original three deploy-only values in the exact sealed
creation body, and later use of the established existing Netlify operator credential
in memory solely for those actions. It does not authorize retrieving any value now,
new credentials, other settings or wider access. A provider recommendation and the
original Action D/P1 approvals cannot approve this new A–D attempt by implication.

A second create/retry/replacement, UNKNOWN continuation, different artifact/config,
site/protection/environment edit, old-deploy deletion, domain/alias change, public
publication, production activation, customer/provider/financial execution, hosted
Auth/database action or merge requires its own exact review and authorization.
The unfinished independent two-computer recovery remains a separate gate; no
physical-device PASS, hosted acceptance or launch authority is asserted.

## Review validation and preservation

[NETLIFY_REPLACEMENT_DRAFT_VALIDATION.json](NETLIFY_REPLACEMENT_DRAFT_VALIDATION.json)
records actual offline and read-only results and remaining gates. The ignored
`replacement-review/verify-offline.py` reproduces the original-byte, metadata,
sealed-body and public-redacted-shape checks without network or credential APIs.
It is an inspector, not an uploader. No application/browser/native/recovery suite
is repeated for documentation-only changes; prior successful CI evidence remains.
Formatting, diff, original API schema and migration/property/customer integrity pass.
All 492 protected pre-existing tracked files outside the five continuity documents
are byte-identical to e544d3b; the frozen P1 operation and all four artifacts match.

All application/UI/engine/schema/dependency/CI bytes, thirteen historical migrations,
pending customer fourteen, frozen P1 operation/four artifacts and original approvals
remain unchanged. The original README, archive, materialized package and private
historical execution records are preserved. Documentation commits use
`[skip netlify]` and the draft PR retains a matching skip marker to avoid any
Git-triggered Netlify build; GitHub checks do not deploy. No hosted activation,
support sending, production operation or merge is authorized by this review.
