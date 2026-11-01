# Phase 3A local verification record

Phase 3A is internal staging preparation. Production Release 1.0 remains **NOT READY
and NOT AUTHORIZED**. Hosted acceptance/provider processing were not run.

| Verification                                                     | Result                                                 | Actual scope                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| npm run check                                                    | Pass: 253 tests; 5 native-only cases skipped in PGlite | ESLint, strict TS, migrated catalog type drift, PGlite/domain/server tests, production bundle                                        |
| Native PostgreSQL 17.11                                          | 102 database tests pass; catalog types match           | Disposable socket-only temporary databases; includes five concurrent-connection cases                                                |
| npm run test:browser                                             | 42 pass                                                | Local synthetic production bundle, desktop/tablet/mobile; existing modules, hidden unfinished navigation, accessibility and overflow |
| npm run format:check / git diff --check                          | Pass                                                   | Repository formatting and whitespace                                                                                                 |
| npm run staging:plan                                             | Pass                                                   | Offline SHA-256 plan for seven migrations; no remote calls                                                                           |
| Staging/scanner/worker contract tests                            | Pass                                                   | Synthetic HTTP/queue fixtures, not external provider evidence                                                                        |
| Real Auth/TOTP/PostgREST/Storage / connected browser             | NOT RUN                                                | Explicit isolated target/configuration/fixture approval absent                                                                       |
| Real scanner / isolated worker persistence / AI                  | NOT RUN                                                | Provider, durable CAS/control store and sandbox deployment dependencies                                                              |
| Hosted migrations / deployment / outside access / live execution | NOT PERFORMED                                          | Prohibited without separate explicit authorization                                                                                   |

The new catalog suite verifies that **every** public organization-owned table is
covered by the hosted SELECT harness, has RLS, every public RPC is invoker, private
definers use empty search paths, buckets are private, client Storage write policies
are absent, and unfinished Contracts/Invoices/Payments cannot be enabled even by
operator table writes. Existing tenant/role/financial/time regressions remain.

New contract tests reject expired/unsafe staging manifests, duplicate pilots,
missing positive fixtures, leaked cross-company rows, false/insufficient Auth,
missing synthetic-write approval, foreign tenant args, execution RPCs, incomplete
workflow coverage and mismatched assertions/SQLSTATEs. Anonymous calls use only the
publishable apikey, not an invalid publishable-key bearer JWT. Read mode never sends
writes. Production/missing/unapproved build contexts fail closed.

Scanner tests cover authenticated request binding, redirects/time limits, malformed,
oversized, outdated/mismatched/untrusted evidence and outage. Worker tests cover
empty queues, successful synthetic lease orchestration, permission revocation during
scan, expired/stale leases during extraction and capped retries. These tests do not
prove the future store's atomicity, malware detection efficacy, native parser
sandboxing or real provider operation. Ingestion remains unconditionally503.

Existing synthetic screenshots were regenerated under ignored artifacts/phase3/.
Desktop and mobile job dashboard previews were visually inspected; unfinished module
navigation is absent. Screenshots and browser tests contain no real customer/worker
records. CI publishes synthetic browser artifacts only, never staging sessions or
real supplier/payroll evidence. No hosted case file or filled manifest was committed.

See PHASE3A_STAGING.md for read-only audit limitations, exact separate hosted actions,
connected acceptance matrix, migrations and rollback, PHASE3A_WORKER.md for activation
gates, and RELEASE_1_0_ACCEPTANCE.md for full-workflow launch criteria.
