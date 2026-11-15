# Issued-invoice capacity: finite source-author checkpoint

This package prepares, but does not apply, two source additions on exact launch #467 `7e25b50537fe66c19f5041e64bd2e59effc544c4` (tree `f255ae9f0665d55fee94387340d84032f1fa25b8`). It does not change an existing protected checker, runtime, invoice F/H/G chain, historical migration, route or package script. All 2,438 launch entries must remain byte/mode exact. Approval of this checkpoint would authorize source authorship only, not launch promotion or SQL/grant installation.

The SQL endpoint is byte-identical to independently reviewed #470 `1940dc3bf82142a50ba8d2ccd3b39890f36d0dd1`, tree `80bf990d7319887ed63a51bfbe93fcacce950439`, parent #466 `300eb070ecfa88fab7d22152893c90a8ec399b9f`. That source frame contains eight additions and preserves every parent entry. The proposed standalone guard verifies exact invoice, payment, Auth, historical guard and migration sources. It offers no installer, connector, runtime permission, provider call or operational readiness flag.

| Added endpoint, mode100644                         | SHA256                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `server/payments/commercial-capacity.proposed.sql` | `a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4` |
| `scripts/check-commercial-capacity.mjs`            | `bf4afa37cbe1fcf35c54a735c2ffb270934bc1c4ddee9f1228a58ea7393324bc` |

Exact unapplied patch: `0322ff6a47e7ba0c6a3823f902a2d7dddcc51bb053c739098cd363c815c00dc6`. Manifest: `5521ef38d293fe6a6b97e64455040c068d67803109bb9972bf139f702e832a46`.

## Qualification and retained evidence

Run only the new offline controls:

```sh
node node_modules/vitest/vitest.mjs run tests/commercial-capacity-admission.test.ts
```

The qualifier seals manifest/patch/checker bytes before decoding, checks exact source and parent/tree identities, verifies complete current #470 source twice, reconstructs the two-addition patch and rejects substitutions, symlinks, wrong modes and withdrawal. Object plumbing is read-only, environment-allowlisted and excludes external diff/textconv, replacement objects, fsmonitor and hooks. The disposable test image preserves all original 2,438 files and has exactly two additions; its complete inventory and checker are verified before code evaluation. No source-author branch or operational SQL is created by the tests.

The new admission suite passes **21 controls / 0 failures / 0 skips**, independently rerun. Targeted review corrected final-seal source withdrawal, environment inheritance and code evaluation before full disposable-source sealing; the original two-addition patch stayed unchanged.

The existing #470 26 source controls and 31 independently passed native PostgreSQL tests are reused only through exact SQL/source identity. They prove nonexistent/unissued/wrong-customer/source/revision/merchant denial; integer invoice ceilings and partial reservations; observed concurrent workers across merchant configurations; expiry after lock waits; immutable authorizations; original-command/lost-ACK recovery; new-identity UNKNOWN denial; refund/callback non-release; READ COMMITTED enforcement and rollback characterization. They are not a native run of the future two-addition author commit and not hosted operational acceptance. No broad accepted payment suite was repeated here.

## Exact schema, grants and custody boundary

The patch retains #470's existing-table delta: four typed immutable authorization-source columns, composite invoice revision foreign key, indexes and one private capture trigger. Its new owner is NOLOGIN/NOSUPERUSER/NOBYPASSRLS, with finite SELECT columns and lock-only UPDATE(id) plus RLS WITH CHECK(false) on existing header/authorization tables; no client/runtime DML or callable EXECUTE grant is added. Temporary schema CREATE is revoked before commit. Original runtime roles, issuer/draft owners, all prior grants and historical source hashes remain unchanged. The full SQL is in the sealed patch rather than a second installation script.

The guard serializes on the original issued invoice and reserves all nondeclined capture amounts across merchants. Any PENDING/UNKNOWN original invoice payment blocks a new capture identity, even if nominal capacity remains. Original read-only reconciliation stays the only uncertain-outcome path. A decline may release reservation; refund, void-like callback, reconciliation report and settlement observations never automatically release capacity. Reservation capacity is not customer balance, a payment receipt or settlement proof.

Privileged installer/administrator integrity, installed writer/bypass inventory, independent ACK/spent fencing, current genuine Auth/MFA and D1–D3/A01–A12 remain unaccepted. Local pre-dispatch rollback can undo a reservation; this is not independent rollback-resistant custody. No installer, backfill, disable-trigger downgrade or replay path is supplied. No authorization-only/capture-later/void action model is introduced.

## Smallest next exact approval

> Authorize ONLY source authorship of patch SHA256 `0322ff6a47e7ba0c6a3823f902a2d7dddcc51bb053c739098cd363c815c00dc6` on an isolated child of exact #467 `7e25b50537fe66c19f5041e64bd2e59effc544c4`, adding only the two mode100644 endpoints above. Existing protected files and historical hashes remain unchanged. Launch integration/wiring, operational SQL/grants, genuine hosted/Auth/provider execution, tenants/merchants, invoices/payments/messages, recovery, merges, deployment and release activation are excluded.

A later installation needs a separate exact target/principal/source/SQL/role/grant authorization and accepted custody/recovery prerequisites. Customer intake SQL remains HELD. Saul 2 Paul is first; Cunningham reuses code with separately accepted tenant/customer/Auth/merchant/key/settlement bindings. Release 1.0 **NO-GO**.
