# Development migration action review — executed with owner approval

Update October16: the owner explicitly authorized and the exact nine-file bundle
was applied after verification. See DEVELOPMENT_MIGRATION_RESULT.md. The original
review and boundaries below are retained as historical context.

Originally the owner approved the **existing development designation**, not execution of these
migrations. The hosted project has no migration history or application tables.
The exact target is recorded privately. No application deployment, Auth mutation,
identity creation, seed/reset, provider connection or production action is included.

Review the ordered filenames and SHA-256 values in **MIGRATION_BUNDLE.json**.
`npm run development:plan` recomputes them offline. `npm run migrations:check`
rejects drift. These are nine forward migrations, not rollback/reset instructions.
The first seven are preserved from draft PR #1; two new unapplied files extend it.

| Order | Migration                                        | Scope / review emphasis                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 20261015183039_phase_1_foundation.sql            | Organizations/memberships/CRM/private merchant metadata, tenant RLS/FKs/audit and private company documents                                                                                                                                                                      |
| 2     | 20261015201048_phase_2_operations.sql            | Checked MFA control plane, operational capabilities, CRM/consent/invitations, disabled public intake gateway; no outbound mail                                                                                                                                                   |
| 3     | 20261015204729_phase_3_estimating.sql            | Integer pricing, catalogs/tax/templates, immutable issued versions and optimistic saves                                                                                                                                                                                          |
| 4     | 20261015210230_phase_3_material_import.sql       | Private quarantine/clean buckets, reviewed source provenance/approval; no client uploads                                                                                                                                                                                         |
| 5     | 20261015210546_phase_3_job_financials.sql        | Immutable job baselines, append-only expense/change reviews, duplicate/credit guards                                                                                                                                                                                             |
| 6     | 20261015210856_phase_3_workforce.sql             | Private labor rates, own/team time, audited corrections, atomic clocks and locked payroll preparation                                                                                                                                                                            |
| 7     | 20261015221730_phase_3a_release_controls.sql     | Database constraint keeps Contracts/Invoices/Payments disabled                                                                                                                                                                                                                   |
| 8     | 20261016024502_release_1_internal_workflow.sql   | Default-off operator-controlled internal test environment/grants, customer links, immutable selling-only offers/decisions/contracts/test signatures/invoices, one-time synthetic authorizations/captures/refunds, balanced pair ledger, internal sink, unverified email profiles |
| 9     | 20261016030324_material_worker_control_store.sql | Private workload grants/durable jobs, tenant-scoped leases, revocation-locked CAS, strict extraction schema, bounded retries and completion recovery; no Storage-policy widening or HTTP ingestion activation                                                                    |

The new files add eleven public tenant tables, five private control tables and
narrow invoker RPCs with private checked implementations. They do not enable the
ordinary production modules, deliver email, issue real agreements, call a payment
provider, post payroll or make a bucket public. private.release_environment defaults
to disabled and all test/workload grants are empty. No credentials are SQL seed data.

The worker's database/object-store operations span services: private clean bytes
may remain as an unreadable orphan after failed CAS. An approved scoped object
transport, retention/orphan cleanup and real-provider resource isolation are still
required before activating ingestion. The ingestion handler remains503.

After specific development execution approval, use the pinned Supabase CLI's
reviewed dry-run/history procedure from PHASE3A_STAGING.md, with explicit project
ref and --skip-vault; compare the dry-run to this digest. An execution approval must
name the owner-designated development target and exact bundle. Do not use cached
--linked targets, --include-all, --include-seed, history repair or reset to resolve
unexpected state. Stop on drift and obtain a new reviewed plan.

After application: verify recorded versions, scripts/sql/staging-verification.sql,
private API exclusion, explicit grants/RLS and bucket privacy, security/performance
advisors, official generated public types and actual Auth/PostgREST/Storage tests.
The local Auth/Storage bootstrap is never a hosted migration. Synthetic identity/
company provisioning and private test/workload grants are separate reviewed actions.

Recovery remains a reviewed forward fix or separately approved isolated restore,
never deletion/editing of issued/accepted financial history. A future production
DB must be new/clean and independently validated; do not promote or restore this
synthetic development database into production. See CONNECTED_DEVELOPMENT.md for
hardening, provider/deploy approvals and exact acceptance dependencies.
