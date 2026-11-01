# Approved development migration · October 16, 2026

**Migration completed. Release 1.0 remains NOT READY / NOT AUTHORIZED.**
The owner explicitly authorized the nine-file bundle against the privately recorded
internal development target. No separate staging database is required. This does
not authorize deployment, identity provisioning, synthetic business writes, provider
connections, outside access or production launch.

## Preconditions and execution

- Verified clean feature branch at reviewed commit
  `018ef8b221ade84c2836f84e72bd548a28efa655`.
- `npm run migrations:check` matched the exact approved bundle SHA-256:
  `c48fb1ad792ff8eca186c59147a9bb28604f1c281e65a7f027ea1a797ef387b6`.
- Verified project identity/health and PostgreSQL17.11; no application relations,
  functions, private schema, migration entries, Auth users/sessions/MFA factors,
  Storage buckets or objects existed. Auth/API/MFA settings matched the reviewed
  baseline. Netlify retained team-login protection across all deploys.
- Pinned Supabase CLI2.121.0 dry run, explicit target and `--skip-vault`, listed
  exactly the nine files in order, with no seeds or role files. Compared its JSON
  file list to MIGRATION_BUNDLE.json before execution.
- Applied that same explicit-target bundle with `--skip-vault`; all nine succeeded.
  No historical migration was edited, no history repair/reset was performed, and
  no local Auth/Storage mocks were used. CLI local/remote history agrees.

Applied versions, in order:

1. `20261015183039` — phase_1_foundation
2. `20261015201048` — phase_2_operations
3. `20261015204729` — phase_3_estimating
4. `20261015210230` — phase_3_material_import
5. `20261015210546` — phase_3_job_financials
6. `20261015210856` — phase_3_workforce
7. `20261015221730` — phase_3a_release_controls
8. `20261016024502` — release_1_internal_workflow
9. `20261016030324` — material_worker_control_store

## Post-migration verification

- All **51 public and 12 private tables have RLS**. All public tables have policies.
- No public SECURITY DEFINER functions; all private definers have fixed empty
  search_path. Clients have no direct private table grants.
- Authenticated role has SELECT on51 public tables and the three historical
  owner/admin/MFA/capability-scoped CRM/intake DELETE grants. No direct INSERT or
  UPDATE grants. The two anonymous RPCs are the intended intake profile/gateway;
  actual intake execution remains gated. No PUBLIC public-RPC EXECUTE grants.
- Three private buckets with expected limits: company-documents10MiB;
  material-quarantine/material-clean3MiB. Only the two intended authenticated
  clean-document SELECT policies exist; no client writes or quarantine reads.
- Internal release environment disabled; test/workload grants empty; no financial
  modules enabled; no Auth users or organizations created.
- Official hosted public types match committed table names, Row/Insert/Update
  fields/nullability, enums, RPC names, argument/default structure and return types.
  The initial exact RPC-argument comparison reported generator conventions:
  official output uses `never` for no arguments and omits SQL argument nullability;
  local generator uses Record<string,never> and includes null. Normalizing only
  those conventions makes the comparison pass; no schema/type overwrite occurred.

## Advisor results and follow-up

Security: **zero ERROR/WARN**,12 informational RLS-enabled/no-policy findings on
intentionally private, client-denied control tables. Do not add permissive policies
to silence this [advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Performance: four WARN findings for per-row Auth evaluation in intake_requests,
job_assignments, job_expenses and worker_supervisors policies;21 informational
unindexed foreign keys;66 unused-index notices on the new empty schema; one
informational absolute Auth connection allocation (10 connections). These are
recorded for a separately reviewed forward performance migration/configuration
review, not patched into the approved historical bundle. Preserve authorization
semantics and test before changing policies. See
[RLS evaluation](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
[FK indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
and [Auth connection allocation](https://supabase.com/docs/guides/deployment/going-into-prod).

## Auth/API hardening and remaining gates

After the owner's additional action-time confirmation, the documented dashboard
hardening saves were completed and verified after reload:

- Public signup OFF; email confirmation ON; anonymous/manual linking OFF.
- TOTP ON, ten factors maximum, fifteen-minute AAL1 factor-verification limit ON;
  phone MFA remains OFF. No credentials changed and no identities were created.
- Site URL changed from localhost:3000 to the protected HTTPS staging site's exact
  /internal-release path. Redirect allowlist contains exactly three entries:
  protected HTTPS /portal/internal plus loopback127.0.0.1:4173 /internal-release
  and /portal/internal. No wildcards, unrelated hosts or deploy aliases allowed.
  Exact hosted origin/URLs are retained in ignored private evidence.
- Data API exposes public only; private and graphql_public excluded. Automatic
  exposure of new tables OFF; extra search path/maxrows/pool settings unchanged.
- Existing table grants are unchanged: authenticated SELECT on51 tables and the
  three original scoped DELETE grants; no anonymous table grants, direct client
  INSERT/UPDATE grants or private client table privileges.
- The dashboard removed future postgres-owner DML grants, function EXECUTE grants
  and sequence USAGE/SELECT grants to API roles. Residual non-API table defaults
  (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN), sequence UPDATE and provider-managed
  supabase_admin defaults remain. Global PUBLIC function EXECUTE defaults are also
  unchanged; every future function still needs an explicit EXECUTE revoke/grant
  review, as the committed migrations already do. An additional broader all-default-privilege SQL
  cleanup was rejected by automatic approval review as outside the confirmed scope;
  none of that rejected transaction was applied or retried through another route.
  Do not describe this dashboard setting as removal of every PostgreSQL privilege.
- Security advisor remains zeroWARN/ERROR with12 intentional private-control-table
  informational findings. Netlify still requires team login across all deploys.

The earlier save rejection is resolved for these dashboard changes. Broader default
ACL cleanup is a separate optional review, not part of the completed saves. Current
schema exposure, existing RLS and explicit RPC grants remain the actual API boundary.

Actual Auth/TOTP/PostgREST/Storage three-company acceptance is still NOT RUN.
Separate approvals remain needed for identities/fixtures/private grants, protected
application deploy and genuine provider tests. No outside users, live financial
execution, customer messages, payroll execution, production deploy or merge occurred.
Production must use a separate clean independently validated database; never promote
or restore the synthetic development database into production.

Private execution evidence stays under ignored `.staging/migration-execution/`:
CLI dry run/application/history, official generated types and structural comparison.
Do not commit filled target configuration, credentials or infrastructure exports.
