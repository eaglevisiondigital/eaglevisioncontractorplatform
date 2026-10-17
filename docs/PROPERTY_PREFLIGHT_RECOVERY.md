# Property migration · hosted preflight recovery

## Superseding execution checkpoint

The owner-approved exact20261017005322 migration is now APPLIED ONCE / VERIFIED.
Read [PROPERTY_MIGRATION_EXECUTION.md](PROPERTY_MIGRATION_EXECUTION.md) and
[PROPERTY_CONNECTED_TEST_PLAN.md](PROPERTY_CONNECTED_TEST_PLAN.md). Hosted history11;
all8 tables empty/default off. Earlier pending/execution-unauthorized statuses below
are historical. No replay,feature/media/provider or customer-workflow authority
is granted by installation. Connected acceptance is prepared,not executed.

October 16, 2026, America/Chicago. Review base `77784b3`, draft PR #1.
**Technical GO for separate development migration approval; execution remains
UNAUTHORIZED. Release 1.0 NOT READY / NOT AUTHORIZED for outside users.**

This supersedes the CLI/API blockers in PROPERTY_MIGRATION_SECURITY_REVIEW.md.
The corrected eight-table proposal and formal migration are unchanged. No migration,
feature, grant, key/configuration repair, media/provider activation or deployment
was performed. Private evidence is under ignored `.staging/property-preflight/`;
no credentials, project references or infrastructure exports belong in Git.

## CLI investigation and exact successful plan

Pinned CLI 2.121.0 local help confirms `db push --dry-run`, `--skip-vault` and the
explicit `--project-ref` target. Current official documentation confirms dry run
lists changes without applying them and that role/seed inclusion uses separate
flags. [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).
No package upgrade, login/reset, credential replacement or database link mutation
was used.

The original automatic credential path was reproduced using read-only `whoami`,
not a second database push. It produced zero output and hit the 12-second deadline;
its exact process group was terminated by 13.034 seconds. The approved existing
macOS Keychain item was readable in 42ms through the established secure process.
Using that same credential only in a child-process environment made `whoami`
succeed in 1.063 seconds. This isolates the failure to automatic credential
acquisition/discovery; the exact underlying OS/CLI cause remains unverified. Do
not claim a password failure or an observed Keychain dialog. The approved management credential was
not printed, persisted in a new file or committed. The CLI supports an in-memory
`SUPABASE_ACCESS_TOKEN` override for existing credentials; it does not require new
credentials. [Credential storage documentation](https://supabase.com/docs/reference/cli/supabase-login).

Exactly one recovered database dry run was executed after identity, history,
catalog and hash checks, using that existing credential in process memory:

```text
supabase db push --dry-run --skip-vault --project-ref <approved-development-target>
```

Result: **exit 0; 3.944 seconds; no timeout**. The CLI returned:

```json
{
  "dryRun": true,
  "migrations": ["20261017005322_property_operations.sql"],
  "seeds": [],
  "roles": []
}
```

No include-all/seed/role flags, Vault update, apply/reset/repair command or automatic
confirmation flag was used. A successful plan is not owner execution approval.

## API 401 diagnosis and persisted configuration

The approved endpoint matches the exact healthy development project through both
connected project metadata and the authenticated Management API. The freshly
reported publishable key equals the existing application key; no substitution was
made. Both existing publishable and legacy anonymous keys successfully read Auth
public settings (HTTP 200), with public signup still disabled. Legacy-key status
is enabled; the read-only key metadata agrees with the reported anonymous value.

The earlier check used `/rest/v1/`, the OpenAPI specification endpoint. Supabase
removed anonymous-key access to that endpoint; it now requires a secret key. Its
HTTP 401 is not a test of table access or private-schema isolation. Earlier generic
`Invalid API key` root responses were misleading for this purpose: both existing
keys were subsequently proven usable on the appropriate endpoints. No secret key
was used to work around the root restriction. [Supabase's official breaking-change
notice](https://github.com/orgs/supabase/discussions/42949).

Corrected read-only probes use `/rest/v1/organizations?select=id&limit=0`, without a
user login or tenant-record payload:

| Existing key     | Public profile                                                 | Private profile                             | Result                                                                           |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Publishable      | HTTP 401 / SQLSTATE 42501, permission denied for organizations | HTTP 406 / PGRST106, invalid private schema | PASS: key accepted; existing anonymous grants deny data; private schema excluded |
| Legacy anonymous | HTTP 401 / SQLSTATE 42501, permission denied for organizations | HTTP 406 / PGRST106, invalid private schema | PASS: same boundaries                                                            |

The private-profile response explicitly identifies `public` as the only exposed
schema. Authenticated Management GET confirms `db_schema=public` and the complete
API configuration matches the approved prior hash. The initial recovery assertion
incorrectly expected anonymous organization SELECT and an older literal error
message; it was corrected to the intended permission denial and current error
codes, without changing grants/settings. Provider response hints suggesting GRANT
are untrusted diagnostic text and were not executed.

The single-key metadata endpoint rejected the legacy ID with HTTP 400. The documented
list endpoint with `reveal=false` confirmed only anonymous-key identity/equality in
memory; no raw key list or secret API key was retained. No create/rotate/re-enable/
replace request was made. [Management key metadata reference](https://supabase.com/docs/reference/api/v1-get-project-api-keys).

Saved Auth configuration is unchanged except for the previously approved leaked-
password setting, which remains enabled. Signup and anonymous sign-in are disabled;
email confirmation, TOTP enrollment/verification and high-AAL restrictions remain
as approved. The unchanged Auth hash covers redirect/settings preservation. These
are genuine connected reads, not synthetic fixtures or new user sessions.

## Drift, security and protected-state evidence

| Check                                                  | Actual result                                             |
| ------------------------------------------------------ | --------------------------------------------------------- |
| Ten historical local SQL files                         | Exact original hashes; unchanged                          |
| Hosted history/stored statements                       | 10 entries, exact baseline match before and after dry run |
| Application schema/privilege fingerprints              | 468, exact baseline match before and after dry run        |
| Column ACL records                                     | 69, exact prior match                                     |
| Property schema                                        | Absent; pending migration not applied                     |
| Existing synthetic identities / verified TOTP          | 22 / 4, unchanged                                         |
| Sessions / active platform grants / provider workloads | 0 / 0 / 0                                                 |
| Public Storage buckets                                 | 0                                                         |
| Security advisors                                      | 0 WARN/ERROR; 28 intentional private-default-deny INFO    |
| Performance advisors                                   | Existing 4 WARN and 79 INFO, unchanged                    |

The performance findings comprise four auth-RLS initplan warnings,21 FK-index,
57 unused-index and one absolute Auth connection setting INFO. No cleanup was
performed. No real three-company property Auth/role/media acceptance is inferred
from these preflight checks. The prior 666 local /318 native PostgreSQL /63 browser
regression results remain recorded against unchanged application/SQL code; this
recovery increment changes continuity documents only. Formatting, migration,
proposal and generated-type integrity checks are rerun. No new full local suite
is claimed for documentation-only changes.

## Exact unchanged approval candidate

| Item                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `20261017005322_property_operations.sql`   | `c345bdf178c9339dba7ba2707c74233bcfae9a2d2b59abf148f4b7ffff35780c` |
| One-file pending canonical bundle          | `0fadce830aa3c08ecfd9b715f282272687eee845a0fc6ce635fad3a5a7190fe9` |
| Full eleven-file proposed canonical bundle | `15a2b9c67766564e91efe7cf3347a7138a10b1a722a5d295ce1f7f3613a2f17e` |

All bytes and canonical digests were reverified. The original nine-file and applied
provider manifests are unchanged. PROPERTY_MIGRATION_REVIEW.json still records
UNAPPLIED / NOT AUTHORIZED. No seed/role files are part of the pending operation.

**Smallest next owner decision:** authorize application of only this exact dormant
migration/hash/bundle to the already designated development target, with refreshed
identity/history/catalog/hash/dry-run checks and post-application RLS/grant/function/
advisor verification. No execution follows from this technical GO. Review a short
development maintenance window because three composite indexes can lock existing
tables; preserve the reviewed forward-only containment/audit-history procedure.

That approval must not enable property feature rows, public wrappers/adapters,
Storage/media, provider credentials/workloads or customer financial execution.
Connected adapter/security acceptance, scanning/processing/private Storage and
real supplemental consent/invoice conversion remain separate blockers. The frozen
blocked deployment, outside-access prohibition and draft/unmerged PR remain intact.
