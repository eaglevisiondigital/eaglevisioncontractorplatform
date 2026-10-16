# Propel Contractor Suite · Action D execution checkpoint

**AUTHORIZED ATTEMPT / PROVIDER BLOCKED / NOT READY.** October 16, 2026.
The owner approved the exact frozen application and target-bound manual draft
operation from ACTION_D_REVIEW.md. One deploy record was created; do not create a
replacement, rebuild the app or substitute HEAD under this approval.

## Actual execution and verified results

| Item                                   | Result                               | Evidence / limit                                                                                                                                            |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen package and operation           | PASS                                 | All 14 file hashes, archive and exact operation SHA-256 match; 26 offline checks passed again                                                               |
| Target and protection configuration    | PASS                                 | Exact existing site; current connector all-deploy team login; dashboard production and previews Private independently read                                  |
| Git/site/shared environment            | PASS                                 | Repository remains unlinked; site and team-shared variable inventories remain zero                                                                          |
| Development Auth/API                   | PASS                                 | Full reviewed configuration fingerprints unchanged except the previously approved enabled leaked-password flag; signup/MFA/redirect/API restrictions intact |
| Draft creation                         | PASS with response-format diagnostic | Exactly one manual API-created `deploy-preview`; no publication timestamp or primary publication                                                            |
| Function byte uploads                  | PASS (transport only)                | Four reviewed ZIP PUTs returned success; runtime invocation and persisted runtime variables unverified                                                      |
| Static byte delivery                   | NOT VERIFIED                         | API returned no required static hashes; zero static PUTs were requested/performed; actual served bytes cannot be verified yet                               |
| Same-ID manifest finalization          | FAIL                                 | One PUT of the identical reviewed body returned HTTP500; no second deploy or changed payload                                                                |
| Ready application                      | BLOCKED                              | Provider still reports `uploading`, no ready timestamp, empty required-hash lists and no provider error message                                             |
| Anonymous deployed perimeter           | BLOCKED / NOT RUN                    | No ready app/assets/functions against which to perform the required acceptance; settings alone are not runtime proof                                        |
| Authorized connected browser/roles/MFA | NOT RUN                              | Held behind ready-state and anonymous-perimeter gates; no new Supabase session or human MFA requested                                                       |
| Database/release protections           | PASS                                 | Before/after independent reads identical; exact counts and off-switches below                                                                               |

Exact deployment ID, HTTPS permalink, returned metadata and operator evidence stay
under ignored `.staging/action-d/`; the owner receives the pending URL/ID directly.
This public checkpoint intentionally excludes infrastructure identifiers and keys.

## Timeline and provider discrepancy

- **12:59:17 UTC:** one creation request with `draft=true`, the exact nine static/
  configuration digest entries, four function digests/metadata and only the three
  reviewed deploy-specific Functions variables.
- The API omitted its optional `draft` response property. The strict local field
  check paused before byte uploads. Independent authenticated reads confirmed the
  exact site, manual nonproduction `deploy-preview`, no `published_at`, a matching
  immutable preview URL and unchanged/unpublished primary site. Continuation used
  only this existing ID; no second POST or relaxation of protection occurred.
  Record the field as **OMITTED**, never claim the API returned `draft=true`.
- **By 13:03:01 UTC:** all four required reviewed function archives uploaded. The
  provider returned no required static hashes. The operation remained `uploading`.
- **13:07:23–24 UTC:** same-ID API manifest finalization using the identical reviewed
  body returned HTTP500. Further writes stopped. No file, variable, function source,
  target, primary publication or site setting was substituted to work around it.
- **13:10 UTC independent check:** still `uploading`, no ready/publication timestamp,
  all required lists empty and no provider error message. Connector independently
  reported the same state. This is not a completed deployment or successful hosted
  functional test. General provider status reported operational; that does not
  explain or resolve this specific deploy failure.

Private execution records retain the initial omission diagnostic, upload progress,
finalization timestamp/error and independent read-back. No credential, Supabase
JWT, password or TOTP seed was logged/exported. The frozen package remains unchanged:
archive `a902edbc4ae006da9a98094c745cb45789f97e1e18151dd2fd73aa9f6519eafb`,
operation `2fed36e5d61f742e218cbd36de03b282e9f8cbbc9f51806513fa0238b04aacfc`.

## Security and data preservation

Independent before/after database reads agree: 22 identities, four verified TOTP
factors, zero sessions, three existing organizations, 63 application tables with
RLS, zero private client table privileges, zero active platform/release/worker
grants. Financial modules and internal release environment remain disabled; payroll
snapshots still have `execution_enabled=false`; zero Storage objects/public buckets;
nine migration versions unchanged. No tenant record, account, password, MFA factor,
Auth/API setting or permission was changed. Exact Propel logo bytes are preserved.

Netlify primary publication remains absent, Git unlinked and Private/all-deploy
team protection unchanged. No deployment to the primary domain, outside invitation,
production build, customer communication, live payment/signature, payroll execution,
document ingestion, scanner/AI/provider connection, migration or merge occurred.
The creation request carried only the reviewed development URL, publishable key and
`PUBLIC_INTAKE_ENABLED=false`, scoped to this deploy's Functions. Their actual
function-runtime persistence remains unverified while deployment is pending.

## Recovery review update

Read ACTION_D_RECOVERY.md for the subsequent read-only investigation. Original
preview remains uploading; deploy-specific file list is empty, dashboard shows four
registered functions, and historical deploy logs returned zero entries. The original
500 body/headers were not retained. No retry or replacement occurred. Support-first
review is recommended; all recovery writes need separate exact authorization.

## Next action

Inspect this **same existing deploy ID** read-only for ready/error state and provider
diagnostics before any further write. If it becomes ready unchanged, verify current
protection and execute the prepared 27-path cookie-free GET/HEAD matrix, stopping
on any protection failure; then genuine internal Netlify/Supabase browser checks
with owner-assisted existing-factor MFA. Do not count an unavailable/404 application
or configuration metadata as a passing runtime security test.

If it remains stuck, review Netlify's deploy-specific diagnostics/support route;
no outside message has been sent. A changed manifest/procedure, replacement upload,
cancellation/deletion or other settings action needs explicit review/authorization.
Do not retry creation blindly, promote the draft, weaken security or rebuild around
the failure. Scanner/positive Storage/private-release groups remain BLOCKED under
their original separate approvals. Release 1.0 stays NOT READY / NOT AUTHORIZED.

Only continuity documents changed in Git. Formatting/diff and private-reference
checks cover this checkpoint; application/native/browser suites were not rerun or
misreported as hosted acceptance. Earlier package checks remain historical evidence.
