# Actual SQL author binding for the held publication-reader guard

This proposal binds the actual two-source author #498
`4bcd77aab2c16d57e126f9a10b9135437c231ca8` to the unchanged #495 guard
qualification packet. It adds source identity checks and denial controls only.
It does not apply the guard patch, install SQL/grants, create a reader connection,
change a route, publish a receipt, or confer financial authority.

The real parents are distinct:

| Artifact                     | Actual parent/base                              | Status                                       |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Two SQL sources #498         | #480 `da1e42d5d9c00cc51c60e7e35016bfc1067ce1b7` | Source-author checkpoint CLOSED              |
| Existing guard proposal #495 | #484 `ada783cbb256f871d2a508b05f3411c587038aba` | Exact one-file guard patch remains UNAPPLIED |
| This identity verifier       | #495 `360fd4f0caf923a9a3f0569e8f29938b3d3a9849` | Ordinary proposal only                       |
| Later combined source        | No actual combined author parent                | Separate composition checkpoint HELD         |

Actual #498 does not contain #484's nine restricted-reader files. Its two canonical
SQL files cannot make it the parent of a nonexistent reader guard. A guard-only
#484 image correctly denies absent canonical SQL. The disposable qualification
image combines #484's existing code, the unchanged proposed guard and exactly the
two actual #498 SQL bodies. It is an offline test image, not an authored or
approved integration commit.

`identity.json` records public raw commits and the finite 9/9/2 additions. The
literal-sealed verifier validates each commit's Git object SHA1, exact sole parent
and tree. It reconstructs all trees from the existing sealed #484 proof: remove
exactly nine reader additions to recover all 2,468 #480 paths; add exactly two SQL
blobs to derive the actual 2,470-path #498 tree; add the nine unchanged #495 packet
files to derive the 2,486-path current tree. SQL blob bodies must match the captured
existing prototypes, with `100644` modes. All current #495 files, modes and
nonsymlink ancestors are read fresh, including the reader and Auth companions.

Before executing the existing qualifier, its captured bytes must match literal
SHA256 `475ad14b73ea23bdcc59a6c7ed967b1e24a00c9e5a4250a0fe0e74572b736cf7`.
Only those captured bytes are imported through a data URI. The existing qualifier
remains part of the trusted source tooling. There is no Git subprocess, history
fallback, network or credential operation. Audits recur after the import await,
after materialization and after sealing; immutable captured buffers populate the
private image. This is point-in-time source evidence, not an atomic filesystem
snapshot, privileged-writer protection, dependency-loader seal or durable custody.

The source-author checkpoint is already closed for the exact A2 patch
`f9d63696a6c6731bea3c6384dfc66780650e89ca066e61f222f5139df44cc9ae`.
Its actual canonical files are:

- `server/invoices/commercial-payment-receipt.proposed.sql`, SHA256
  `1c1ec82ca52560de86ec19ff9a865babfc3967ff466b425692e733fd240fdef5`.
- `server/invoices/customer-payment-publication.proposed.sql`, SHA256
  `bff7f5f16fa620b4f7e684228d1ff41af696492027a782ea4698fe49d1fbb71d`.

The next separate source-author decision is ONLY the existing one-file guard patch
SHA256 `997565f12abfe9f57b829eb8fc5e3d0b2dfc9fab2527d47c6f363d3bf34178e0`,
prepared on exact #484, modifying
`proposals/customer-publication-admission/source.ts` (`100644`) from
`7c034c17b0c8f381a4fa23e8d0e9a867f8401f0032132fb13126498e05f92c1b`
to `77f8fc84bcbb1d877a54d69ecd356a5381eb54b6f7c34e0f8f561145c44f9508`.
Guard author/parent and later composition parent remain null. No guard application
or integration is included in this proposal.

Run only the new controls with pinned Node24/Vitest:

```sh
node node_modules/vitest/vitest.mjs run tests/customer-publication-498-binding.test.ts
```

The first new run passed 21 controls, zero failures/skips. It covers valid exact
identity, complete source-image guard success, guard-only missing-SQL denial,
wrong/foreign parents or commits, altered SQL endpoints/modes/blobs, coordinated
metadata rebinding, no self-authorization, helper tamper nonexecution, and reader
withdrawal across await or final sealing. These checks execute the source guard;
they do not execute SQL or the financial/customer reader.

Matching #495 fresh 20 source controls, 10 selected controlled models (22 explicit
filtered cases), and independent 20 source controls are retained by exact source
identity. The earlier #484 35+12 and #480 45+30+8 retain their distinct unit,
controlled/native and responsive-browser scopes; their old temporary raw reports
were lost in the restart and are not recreated. No retained suites are replayed or
summed into new acceptance. Actual installed function bodies, target/principals,
grants/default privileges, connection custody and bypass inventory, genuine
customer Auth/MFA and mapping, D1/D2/D3, original A01–A12 and recovery remain
unverified. Receipt evidence establishes neither balance nor settlement; delivery
and financial effects remain disabled. Saul 2 Paul stays first; Cunningham requires
separate acceptance. Release 1.0 remains NO-GO / NOT AUTHORIZED.

Final frozen evidence: 21 primary controls passed with zero failures/skips (raw
SHA256 `96a248658f4434e74fae49de55f9271674b8dee3710d3693f8562b1fcda7cf96`).
An independent copy passed the same final 21 controls with zero failures/skips (raw
SHA256 `6f6eed7804d39c291a97d732760e2099f4de5f5ae0c3b02e824bb9d6f110220e`).
The final guard-only negative removes the generated model as well as both SQL
files, leaving exactly the 2,477-path #484 frame with the one proposed guard change.
Independent static review and all 2,486 current parent blob/mode/ancestor checks
passed; review SHA256
`c1c2401dccc69ef623ed24543f87f824e73b917ec232c55bad272438d8b55885`.
Fresh raw reports are retained in persistent owner-local storage. Full TypeScript,
scoped ESLint/Prettier and the five-file/thirteen-binding feature locks passed.
These are source controls only; all outstanding authority gates above remain held.
