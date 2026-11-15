# Unapplied connection-guard author checkpoint for #487

This offline package binds the held #485 admission proposal to final #487
`b7387ade02d842eeb4eb8d7d1b3ab2f615963f02`. It does not apply the guard,
compose the customer bridge, admit canonical F/H/G source, or grant operational
invoice authority. Release 1.0 remains NOT READY / NOT AUTHORIZED.

The formatted connection is SHA256
`50db32661490a3e1d7807bfffcca66dcacda1333e9578c3ab63e3e9984747d23`.
Its emitted JavaScript is byte-identical to #486, SHA256
`7445deea77d90bc909a482dd70246c895f94cf802b8f5040a91cd1362a9416a9`.
All 2,455 parent files remain unchanged in this proposal branch.

## Implemented proposal

`guard.proposed.txt` accepts either the complete original 50-file closure or
complete #487 52-file closure. Fixed source hashes, complete manifest digests,
file modes, physical paths and two reads reject mixed frames, helper/manifest
rebinding, late withdrawal and post-import replacement. The executing guard and
manifest must occupy the checked root's canonical paths. This is a synchronous
point-in-time source check; it does not establish atomic filesystem integrity,
authentication, independent custody or rollback protection.

`guard-author.patch` proposes exactly three modifications, mode `100644`:

- `proposals/commercial-invoice-connection/source.ts`.
- `proposals/commercial-invoice-connection/source.json`.
- `tests/commercial-invoice-connection-source.test.ts`.

The third change only copies/imports the canonical guard and manifest in each
owned disposable fixture. All four original test bodies, names, assertions and
budgets remain byte-identical. Resolving the module from the original parent
would defeat the new checked-root identity requirement.

`source.json` records exact parent, patch, payload and resulting hashes.
`qualify.mjs` validates literal SHA256 seals and immutable Git commit/tree/blob
proof before constructing either fixture without Git, credentials or network
fallback. Original historical manifest and F/H/G bodies remain unchanged.
The original canonical F/H/G guard passes its original frame and continues to
deny #487; this proposal does not silently extend that authority.

## Focused offline verification

Run `node_modules/.bin/vitest run tests/connection-guard-487.test.ts` for the
26 negative-first controls. To construct an owned disposable proposed image:

```js
import { materialize } from './proposals/connection-guard-487/qualify.mjs';
const { directory } = materialize();
```

In that image, use the existing pinned dependencies to run the materialized
`tests/guard487-connection.test.ts` and the four original source-fixture cases.
The connection payload preserves the original cases and adds late helper
withdrawal. Native qualification uses the unchanged 17 legacy connection cases
and five existing yearly-number connection cases against separate disposable
PostgreSQL 17 fixtures. Do not run file-mutating test suites concurrently against
the same materialized image. Existing accepted yearly SQL and browser behavior
are reused only within their unchanged source boundaries.

Final primary qualification: **26 guard controls + 38 connection/source cases,
22 native PostgreSQL cases (17 unchanged legacy + 5 yearly), zero failed/skipped**.
Strict TypeScript, lint, format and feature-source checks pass. Independent
review reran the 26 controls and four unchanged source-fixture cases in separate
owned images; native yearly qualification is recorded separately. The reproduced
external-module identity finding is corrected. Earlier incomplete closure,
TypeScript and overlapping-image test failures are retained as historical
diagnostics; final runs use the corrected sealed payload and isolated images.

No protected SQL, grants or actual Auth/provider behavior are installed/tested.
Hosted Foundation is not inferred from these results. Historical failed,
skipped and cancelled checks remain evidence of their exact sources.

## Next separate approval

Authorize only the exact sealed three-file checker-author patch in `source.json`
on an isolated child of exact #487. Approval must identify its full SHA256 and
retain every other existing file. Customer bridge authorship, canonical F/H/G
admission, launch promotion, SQL/grants, hosted/provider actions, tenants,
merchants, invoices, payments, communications, recovery, merges, deployment and
release activation remain excluded and require their own applicable approvals.
