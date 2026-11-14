# Finite issuance guard source-author checkpoint

Exact parent: #451 `844ae8adf12b789d37c9f49189df631ac1d2209b`.
The protected SQL is still unchanged and the guard is **UNAPPLIED**.

This preparation makes the existing native fixture compatible with precisely the
reviewed guard endpoint while preserving every original business assertion. The
fixture adapter verifies fixed source/patch hashes and regular-file modes, then
projects the exact author endpoint back to the immutable original fixture input.
The original fixture checks reconstruct exactly `e1c504…` SQL for the disposable
database in either case. Unknown source/patch changes and symlinks deny. There is
no expected-hash override, manifest authority, writer or operational adapter.

This is **not source admission**: tests execute the actual unchanged canonical
caller-source checker. It accepts the current baseline and rejects the proposed
guard endpoint and coordinated SQL/manifest rebinding. F/H/G, payment, C17, C22,
C24 and all historical protected sources/checkers remain untouched. Their later
admission decision must not be bypassed to make the source-author branch green.

## Exact next approval

The owner may separately authorize only the one-file source-author patch:

- Path/mode: `server/invoices/commercial-drafts.proposed.sql`, `100644`.
- Before: `da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e`.
- Patch: `45d2eeafaca661d586e707aa6974b3f3216a44988de8a4b3e8d39f55bd3b6f45`.
- After: `e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c`.

The approval must pin the final reviewed checkpoint commit in this draft's body.
It authorizes an isolated development author child only, not checker admission,
launch integration, SQL/grants, hosted Auth/provider operations, customers,
financial execution, communications, merges, deployments, recovery or release.

## Author procedure, only after that approval

1. Create a new `codex/` child at the exact approved checkpoint commit. Verify its
   ancestry against the exact #451 parent and the preparation file hashes. Do not
   use a floating branch or rewrite either reviewed parent.
2. Verify source and patch hashes above, regular `100644` files and no symlink
   ancestor. Run `git apply --check` against the existing patch; apply it once.
3. Verify that the full diff against the approved checkpoint contains exactly one
   modified regular file, with the exact after hash above. Do not edit historical
   hashes, manifests, source checkers or other SQL to conceal expected denial.
4. Run the 26 new checkpoint controls and the 34 affected native issuance cases.
   Retain the original passing 21 presentation cases where their bytes match.
   The canonical admission denial is expected, not an installation permission.
5. Obtain independent final parent/path/mode/hash/test review, commit and publish
   one separate draft author candidate. Stop before every later admission gate.

All steps are preparation now; no command in this package applies the patch.
Matching native SQL proves the disposable fixture's behavior, not genuine Auth,
independent custody, actual merchant access or hosted operational acceptance.

## Later checkpoints remain separate

Source-authoring does not install the additive issuance SQL or grant the new issue
runtime. Later review must bind exact SQL/grants/NOLOGIN owners, operational LOGIN
and caller scope, authority provisioner, source/debt/tax/numbering policy, target
and history, complete writer/bypass inventory, genuine current Auth/MFA and
revocation, immutable receipts and independent D1–D3 custody/recovery. Original
recovery/P1-on13/customer14/broker requirements and A01–A12 remain unchanged.
Customer presentation, token/consent/payment links, delivery/resend/correction and
settlement are not approved by this author checkpoint. Saul 2 Paul remains first;
Cunningham requires separate tenant/customer/merchant acceptance. Release1.0 NO-GO.
