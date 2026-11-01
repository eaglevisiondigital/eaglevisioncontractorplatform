# Corrected provider migration: authorized development execution

October 16, 2026 · owner-reviewed source commit `57f2aa1e682a9d0ce6b82d5c8eaf904959eb0517`.

**APPLIED AND VERIFIED in the owner-designated development project only.**
Owner explicitly authorized this exact migration/file/bundle after the earlier
consideration-only checkpoint. Provider activation is NOT authorized. Release 1.0
remains NOT READY / NOT AUTHORIZED; PR #1 remains draft.

## Exact operation and result

| Item                                 | Evidence                                                           |
| ------------------------------------ | ------------------------------------------------------------------ |
| Migration                            | `20261016185108_provider_sandbox_persistence.sql`                  |
| File SHA-256                         | `5dd07b079a591b433fa7ab432fd841026de91a1cd3f1d3a722bef500aa9fd32d` |
| Separate one-file bundle             | `231fa367a176bc329c983fa9d7154d814d0469278209edeca8712229870c750e` |
| Original nine-file bundle, unchanged | `c48fb1ad792ff8eca186c59147a9bb28604f1c281e65a7f027ea1a797ef387b6` |
| Pinned CLI                           | 2.121.0                                                            |
| Result recorded                      | October 16 at 21:22:51.693 UTC (4:22:51 p.m. America/Chicago)      |
| Supervised CLI duration              | 13.113 seconds, exit 0, no timeout, zero automatic retries         |
| Result                               | dryRun=false; exactly the authorized file; seeds=[]; roles=[]      |

The reviewed commands used explicit project targeting, not a cached linked target:

```text
npx supabase db push --dry-run --skip-vault --project-ref <private-approved-development-ref>
npx supabase db push --skip-vault --project-ref <private-approved-development-ref>
```

Only the second command applied SQL, once. No --include-all, --include-roles,
--include-seed, reset, repair, bootstrap, Vault update or historical replay.
The process group had a 60-second supervision limit with cancellation/inspection
on uncertainty; it completed normally. This is whole CLI elapsed time, not SQL-only
performance. Normal temporary CLI migration-login initialization is transport
authentication, not a provider/service workload identity or capability grant.

Exact target identifiers, approval record, catalog/data digests, history statements,
CLI logs, official types and raw advisor evidence are ignored under
`.staging/provider-execution/`. Do not commit them or rerun the completed operation.

## Refreshed preflight: all PASS before execution

- Exact project identity/name, ACTIVE_HEALTHY and PostgreSQL 17.11 matched.
- Clean working tree at the reviewed commit; committed and working-file SHA matched.
  Both bundle hashes matched. All nine historical source files were unchanged.
- Nine hosted migration histories and stored SQL arrays matched the prior approved
  evidence exactly; no proposed provider tables existed.
- 422 application catalog records, 69 column ACLs and 24 default-privilege records
  matched the approved baseline. No unexpected schema/grant/configuration drift
  was observed in that scope.
- Fresh CLI plan was exactly one pending file, no seeds and no role files.
  There is no `supabase/roles.sql`; configured seed paths are empty.
- 22 synthetic identities, 4 verified MFA factors and 0 Auth sessions; platform grants,
  private release-test and material-worker grants absent; internal release mode
  disabled; financial modules off; approved merchants/verified senders/public
  buckets all zero. Captured 63 existing table row-count/digest snapshots.
- Reviewed exact transactional SQL; apply was bounded/supervised and had no retry.

## Exact post-migration history

The first nine entries and their stored statement arrays remain byte-identical.
The new entry contains 68 statements matching the approved source after removing
only nonsemantic outer whitespace/comments/statement delimiters; quoted function/
DO bodies are preserved. Source and bundle hashes remain unchanged after apply.

```text
20261015183039_phase_1_foundation
20261015201048_phase_2_operations
20261015204729_phase_3_estimating
20261015210230_phase_3_material_import
20261015210546_phase_3_job_financials
20261015210856_phase_3_workforce
20261015221730_phase_3a_release_controls
20261016024502_release_1_internal_workflow
20261016030324_material_worker_control_store
20261016185108_provider_sandbox_persistence
```

All ten files are now immutable development history. The original nine-file
manifest stays frozen; the separate provider manifest records the applied state.
Offline integrity checking understands both historical review-only and recorded
development-applied states; it does not query or authorize a hosted environment.

## Database and authority verification

| Check                       | Actual result                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full application catalog    | 468/468 records match the exact disposable PostgreSQL17 expected catalog; no unexpected difference                                                                  |
| Existing definitions        | Only expected merchant tenant/ID index added to an existing table; public API/type/grant records 214/214 unchanged                                                  |
| New private tables          | 16, all empty, RLS enabled, zero policies/default deny                                                                                                              |
| New constraints             | 101, including26 FKs; all validated, matching reviewed composite tenant references                                                                                  |
| Indexes/triggers            | 40 indexes on new tables plus one existing merchant index;32 enabled user triggers; no invalid index                                                                |
| Functions                   | 7 new:5 SECURITY DEFINER/2 invoker trigger functions; fixed empty search paths; all owned by postgres                                                               |
| Effective grants            | Zero unintended table privileges across anon/authenticated/service_role, including TRUNCATE/MAINTAIN; zero provider-function EXECUTE for those roles; no PUBLIC ACL |
| Additional ownership checks | Zero unexpected table owners, column grants, disabled triggers or unsafe function owner/search-path configurations                                                  |
| Existing data               | All63 existing table row counts and content digests unchanged                                                                                                       |
| Identity/MFA                | 22 identities,4 verified factors,0 sessions; identity and MFA metadata digests unchanged; no password/factor/session operation issued                               |
| Client type compatibility   | Official hosted public types generated:51 tables/55 functions/2 enums match catalog; public catalog unchanged; local types:check PASS                               |

No owner/service-key request API or provider workload was provisioned. The shared
guard/three restricted commands and terminal result CHECK match the reviewed native
catalog, including M1/M2 corrections. Positive workload execution, real Auth/RPC/
Storage/provider integration and live financial behavior were **not** exercised:
they require separate capabilities/accounts/authority and are not authorized here.

## Disabled-state evidence

Before/after gate snapshots match exactly:

- `provider_workloads`, merchant authorizations/attempts/settlements/inbox/
  observations/reconciliations: zero rows.
- All sender/domain/outbox/delivery-binding/event/suppression and agreement-binding/
  evidence/inbox tables: zero rows. There are no approved merchants or verified
  senders.
- Ordinary contracts/invoices/payments enabled module count:0.
- Internal release mode:disabled; private release-test grants:0; active platform
  admins:0; material-worker grants:0; public Storage buckets:0.
- Application provider adapters remain unwired/sandbox-only; email delivery and
  legal execution stay SQL-disabled; ingestion503 and payroll-execution gates
  are unchanged. Frozen deployment/logo bytes are unchanged; no Netlify call.

Identity/factor fingerprints deliberately exclude passwords, TOTP secrets, bearer
tokens and session credentials. Existing table digests were computed in PostgreSQL;
no customer/employee/payroll row payload was exported for this comparison.

## Supabase advisors after actual application

| Advisor                       | Before | After / interpretation                           |
| ----------------------------- | ------ | ------------------------------------------------ |
| Security WARN/ERROR           | 0      | 0                                                |
| Private RLS/no-policy INFO    | 12     | 28:16 expected new default-deny private tables   |
| Auth RLS initplan WARN        | 4      | 4 existing, unchanged; no remediation authorized |
| Unindexed foreign-key INFO    | 21     | 21 existing; no new uncovered provider FK        |
| Unused-index INFO             | 42     | 57;15 additional dormant index notices           |
| Auth connection-strategy INFO | 1      | 1 existing                                       |

The lack of policies on private tables is intentional defense in depth alongside
revoked ACLs, not approval to expose them.
[Private RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[existing RLS performance warning](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
[unused-index notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
No advisor-driven schema/grant/Auth cleanup was executed.

## Acceptance boundaries and next action

**PASS:** exact authorization/preflight/dry run, one actual schema apply, history/
source matching,468 catalog comparisons,63 data snapshots, grants/RLS/owner/path/
index/trigger checks, official public-type compatibility, unchanged identity/MFA/
off gates and actual post-migration advisors.

**NOT RUN:** privileged provider command execution, new service-role/workload
activation, genuine gateway/DocuSign/email/scanner/AI/Storage acceptance and deployed
browser/callback/perimeter tests. Earlier 577 local/265 native/13 adversarial/51
browser/26 frozen-package passes belong to the reviewed implementation; they are
not additional hosted tests or live provider acceptance.

Fresh post-execution local checks: **577 PASS / 33 native-only skips** from npm
check, formatting/type/migration/build checks, **7 offline integrity cases PASS**
and **26 frozen-package checks PASS**. No application or migration SQL was edited
after apply. These local results are separate from the hosted read-only evidence.

Next: prepare and independently review the smallest provider-specific sandbox
capability/identity/consent/binding and connection/timeout operation; obtain separate
owner authorization before creating any role, grant, credential or binding.
Merchant test accounts/tokenization, signing trust/legal review, verified tenant
domains, isolated byte/scanner/AI infrastructure and Netlify diagnosis/approved
recovery remain unresolved gates. Keep all providers disabled meanwhile.

No real charges, email, signatures, payroll, outside access, production change,
Netlify action or merge occurred. Financial containment remains forward-only:
never delete/truncate immutable evidence, clear UNKNOWN/refund holds, rewrite
terminal outcomes or repair migration history to undo this schema.
