# Property operations schema and connected authorization review

## Superseding hosted preflight recovery

The CLI/API blockers recorded below are historical and now resolved without any
key/configuration/schema change. Read [PROPERTY_PREFLIGHT_RECOVERY.md](PROPERTY_PREFLIGHT_RECOVERY.md)
and PROPERTY_PREFLIGHT_RESULT.json. Exact one-file/no-seed/no-role dry run PASS;
both existing keys and public-only API exposure verified using table-specific
requests. Ten hosted migrations/catalog/grants remain unchanged. Corrected SQL and
all hashes remain exact. **Current recommendation: technical GO for separate
owner development execution approval; migration still UNAPPLIED / NOT AUTHORIZED.**
All security corrections, media/connected/provider gates and launch restrictions
below remain in force. The original review is preserved as a dated checkpoint.

Status: **corrected dormant schema locally verified; hosted execution NO-GO**.
Review base: `0a35ec8`. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
No hosted write, grant, deployment, provider call or customer access occurred.

## Findings and corrections

The supplied original proposal hash
`f3458c4551a738c88bc65d8ca20f847cd7703d02d91b791c03b87ae3a9962d45`
matched before modification. Nine new negative tests reproduced these four defects
against the original bytes on both PGlite and native PostgreSQL 17:

| Finding                             | Original behavior                                                                                  | Corrected behavior                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| R1 · nullable revision bypass       | Six mutable actions accepted NULL revisions because SQL comparisons evaluate UNKNOWN               | Require positive non-NULL revisions and post-lock `IS DISTINCT FROM` CAS checks                                                      |
| R2 · disabled estimating projection | Owner workspace returned financial review data with estimating disabled                            | Lock and require the enabled estimating module for every staff workspace/command                                                     |
| R3 · report provenance              | Maintenance INSERT could attach an actual visit's report to another same-company customer/property | Trigger verifies locked visit/plan, exact customer/property, submitted state, checklist, allowlisted snapshot and sequential version |
| R4 · supplemental amount            | Maintenance INSERT could disagree with the reviewed selling amount                                 | Trigger verifies exact decision/change/customer/currency/amount/description/presentation provenance                                  |

All nine original negative cases now PASS. Additional defenses include immutable
tenant/parent bindings, positive revisions, finite dates, indexed composite foreign
keys, one proposed change per purchase, linked approved credits and normalized
purchase-overlap checks. Report finding keys are allowlisted and media is always
empty. Financial scope references must identify original scope or an approved
same-job change. Internal supplier data never enters the customer report snapshot.

Fresh-session checks require a signed caller's UID and numeric expiry; wall-clock
expiry is checked after resource waits and at command/projection completion.
Current organization, module, membership and assignment locks protect revocation.
Neither transaction-start time nor a client company selector grants authority.
Actual JWT signature validation remains the responsibility of Supabase/the reviewed
request boundary; synthetic SQL claims are disposable test fixtures only.

## Reviewed schema and privileges

| Private table               | Purpose / principal boundary                                           |
| --------------------------- | ---------------------------------------------------------------------- |
| property_features           | Empty, default-off tenant feature gate                                 |
| inspection_plans            | Existing CRM customer/property and optional existing job               |
| inspection_visits           | Mutable CAS drafts; submitted/published management workflow            |
| inspection_reports          | Immutable, versioned customer-safe publication snapshots               |
| property_media              | Dormant metadata only; no trusted clean bytes or playback              |
| supplier_comparisons        | Private reviewed supplier snapshots against existing issued estimate   |
| unbilled_decisions          | Append-only management dispositions against existing approved expenses |
| supplemental_invoice_drafts | Immutable nonpayable proposals linked to the same reviewed change      |

All eight tables have organization keys, RLS, indexed tenant relationships,
composite tenant FKs, immutable tenant triggers and explicit revoked PUBLIC/anon/
authenticated/service_role table access. All foreign keys have covering indexes.
There are no permissive RLS policies. RLS is not FORCE: the narrowly checked
SECURITY DEFINER owner is the intentional command boundary, not an untrusted role.
A database owner can disable triggers; these protections do not claim to defeat
privileged database administration.

Eight private functions use fixed empty search paths. Only `property_command`,
`property_workspace` and `property_portal` have authenticated EXECUTE. Five internal
helpers have no client EXECUTE; anon/service_role have none. There are no public
wrappers, feature rows, credentials, roles, worker capabilities, Storage policies
or activation side effects. Private schema must remain outside PostgREST exposure.
See [connected authorization design](PROPERTY_CONNECTED_AUTHORIZATION.md).

## Reproducible local evidence

| Check                              | Result                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Original negative reproduction     | 9 expected FAIL on PGlite and native PostgreSQL 17                                                                          |
| Corrected `npm run check`          | 666 PASS; 43 native-only skips; lint, types, public-type generation comparison, migration/proposal integrity and build PASS |
| Full native PostgreSQL 17.11 suite | 318 PASS, zero skips; includes those 43 cases, overlapping local count                                                      |
| Property database suite            | 47 PASS native: 37 portable and 10 actual concurrency cases                                                                 |
| Browser regression                 | 63 PASS across desktop/tablet/mobile; existing loopback preview preserved using isolated port                               |
| Frozen deployment package          | 26 offline checks PASS; no network or deployment                                                                            |
| Formatting                         | `npm run format:check` PASS                                                                                                 |

Native concurrency includes assignment revocation while awaiting a visit lock,
feature deactivation while awaiting its lock, JWT expiry while blocked, NULL CAS
writers, duplicate visit submissions, report versions and financial review races.
Rejected operations leave no unauthorized rows or audit side effects. Maintenance
negative tests exercise invariant enforcement outside restricted commands as well.

A fresh disposable ten-migration database matched the actual hosted application
catalog: **468 fingerprints and 69 column ACL records, zero differences**. Applying
the corrected proposal produced 500 catalog records: eight private tables/eight
functions plus indexes/triggers. Three existing tables gain reviewed composite
indexes: service_locations, job_expenses and job_change_orders. All new tables were
empty/default deny, with zero forbidden table grants. The measured 20ms disposable
application is not a production performance or lock-duration guarantee.

## Read-only hosted preflight

Exact approved development identity was healthy. All ten hosted migration records
and stored statements match the previously applied evidence; all ten local files
are unchanged. Hosted catalog/column ACLs match both the applied snapshot and the
fresh native baseline. No property table is installed. A final read-only recheck after the blocked CLI
attempt confirmed ten migrations, no property schema, 22 identities/four verified
factors, zero sessions/active platform grants/provider workloads/public buckets.

Persisted counts: 22 identities, four verified TOTP factors, zero sessions, active
platform grants, provider workloads, merchant configurations or internal-release
grants. Internal-release mode is disabled; no public buckets or private/all-table
publications were found. This does not independently certify current Auth dashboard
settings or API exposure.

Security advisors: **0 WARN/ERROR, 28 INFO**, intentional private RLS-without-policy
findings. Performance advisors: **4 WARN** (`auth_rls_initplan`) and **79 INFO**
(21 FK indexes, 57 unused indexes, one absolute Auth connection setting). These are
existing findings, unchanged from the applied baseline; no cleanup was authorized.
See [Supabase database linter](https://supabase.com/docs/guides/database/database-linter)
for interpretation. Installation would require fresh post-migration advisors.

Two preflight checks remain BLOCKED:

1. Pinned Supabase CLI 2.121.0 target-bound dry run produced zero output before its
   deadline; the exact stalled process group was terminated. No successful plan,
   connection banner or migration execution was observed. Cause is unverified;
   do not assume a Keychain prompt or repair credentials/settings automatically.
2. Read-only PostgREST private-profile probes using the project's existing modern
   and legacy public client keys both returned HTTP 401 `Invalid API key`. They did
   not reach the expected schema-profile denial, so current API schema isolation is
   **unverified**, not PASS. Management API access remains healthy. No key was
   generated, rotated or exposed in public evidence.

Raw responses, identifiers and logs are private under ignored `.staging/` only.
The dry run is prepared as `db push --dry-run --skip-vault --project-ref
<approved-development-target>` with exactly the one pending file expected, empty
seeds/roles, no include-all/reset/repair. A successful result is still required.
Do not treat the local manifest as a successful hosted dry run.

## Exact pending scope and hashes

Created using the pinned Supabase CLI `migration new property_operations`:
`20261017005322_property_operations.sql`. It is byte-identical to the corrected
proposal. [PROPERTY_MIGRATION_REVIEW.json](PROPERTY_MIGRATION_REVIEW.json) inventories
all ten historical files separately from this one pending migration.

| Digest                                     | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Corrected SQL file                         | `c345bdf178c9339dba7ba2707c74233bcfae9a2d2b59abf148f4b7ffff35780c` |
| Pending one-file canonical bundle          | `0fadce830aa3c08ecfd9b715f282272687eee845a0fc6ce635fad3a5a7190fe9` |
| Full proposed eleven-file canonical bundle | `15a2b9c67766564e91efe7cf3347a7138a10b1a722a5d295ce1f7f3613a2f17e` |

Bundle digests hash the canonical JSON filename/hash array, as enforced by the
migration checker. Original nine-file and separately applied provider manifests
remain unchanged. No seeds/role files are part of this proposal.

## Recommendation, containment and next boundary

**GO for review of the corrected dormant schema package; NO-GO for hosted execution
until the CLI and API preflights pass.** Then request separate owner execution
approval tied to these exact bytes and target. No execution approval exists here.

The migration is forward-only and transactional. Its three indexes can lock
existing tables; review a development maintenance window and lock monitoring.
Refresh identity, ten-file history/catalog, exact hashes and a one-pending-file
dry run immediately before any later authorized execution. Stop on discrepancy.

Containment must preserve financial/report/audit evidence: leave the feature table
empty; if separately activated later, disable exact tenant feature rows, revoke the
three exact private entry-point EXECUTEs and close affected sessions under a reviewed
operation. Do not DROP/TRUNCATE tables, rewrite immutable decisions or repair
migration history. A future partial/failure state requires read-only diagnosis,
not blind replay. No containment write was needed or executed here.

Scanning, isolated byte transport, safe image/video derivatives, transcoding,
private Storage/quotas/retention and expiring authorized playback remain unavailable.
All actual ingestion/playback remains 503. Genuine customer change consent and
checked invoice conversion are still required before any supplemental debt.
Connected wrappers/adapters, three-company Auth/HTTP/Storage acceptance and independent
security/legal/accounting review remain separate gates. NMI is preferred and
Authorize.Net optional; all providers remain off. The blocked deployment is unchanged.

Review sources: [Supabase function security](https://supabase.com/docs/guides/database/functions),
[PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html),
[Supabase changelog](https://supabase.com/changelog). This is an engineering review
with independent reproductions, not third-party launch certification.
