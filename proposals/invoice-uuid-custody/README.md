# Invoice UUID custody — UNAPPLIED proposal

Parent PR374: `78cf1d3eb0ce37862a7f34d727e45e7ccb6417ad`.

The invoice client accepts case-insensitive UUIDs but indexes its attempted-command,
UNKNOWN-invoice and held-source guards using case-sensitive strings. After a lost
ACK, uppercase spellings of the same command/invoice/source can reach SQL again.
The negative test reproduces a second query; it does not claim duplicate SQL commits.

The one-line patch requires lowercase UUIDs before any operation. This fails closed
rather than silently rewriting a proposed identity. Existing generated UUIDs and
UUID-valued proposed SQL JSON receipts use canonical lowercase; the positive test
retains create/save/reopen and duplicate-command denial with those identities.
Uppercase input is rejected before SQL, not treated as a second identity. Runtime
source and both historical invoice source manifests remain byte-for-byte unchanged.
Separate exact owner approval is required before applying/admitting the patch.

Run with the existing pinned local dependencies:

```sh
node proposals/invoice-uuid-custody/verify.mjs
```

The verifier reuses the existing unapplied-proposal Vitest procedure and original
30-second budgets. It checks source/patch/test hashes, copies only source dependencies,
applies the patch only inside a disposable directory, typechecks both variants, and
requires parent 2 PASS/8 FAIL versus proposed 10 PASS/0 FAIL. Canonical source hashes
are checked again after temporary copies are removed. Proposal tests are outside the
default application suite; failing historical assertions are never weakened.

SQL retains its independent duplicate/authorization defenses; this proposal never
installs or executes it. Session-local holds still do not survive process restart
and cannot establish D2 independent durable custody. No hosted/Auth/provider or real
invoice acceptance is claimed. D1–D3/A01–A12 and recovery restrictions remain intact.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
