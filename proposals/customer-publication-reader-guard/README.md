# Restricted receipt reader · unapplied after-source qualification

This proposal is an isolated child of exact #484
`ada783cbb256f871d2a508b05f3411c587038aba`. All 2,477 parent files remain
unchanged. No SQL, reader, guard, manifest, permission or route is applied here.

The existing #484 reader checks current Auth, backend identity and restricted
catalog permissions, but its source gate does not require the proposed canonical
receipt/publication SQL sources. The new **unapplied** guard qualifies that missing
source boundary: both exact A2 SQL bodies are mandatory, alongside the unchanged
reader/Auth/import closure, original proposal receipt SQL and inactive reader-grant
template. A missing, partial, altered, symlinked or wrong-mode source stays denied.
The executing guard also checks its canonical location, root identity and current
on-disk bytes. The original #484 checkpoint JSON remains immutable historical
evidence; this packet separately records the proposed guard endpoint.

`guard-author.patch` modifies only
`proposals/customer-publication-admission/source.ts`. It is prepared from #484,
**not authorized for application**. Its actual author and future author parent are
null. Exact A2 source authorship, actual endpoint/parent rebinding, independent
review and a separate guard-author decision must precede any application. The
unchanged A2 patch `f9d63696a6c6731bea3c6384dfc66780650e89ca066e61f222f5139df44cc9ae`
still adds only two mode-100644 SQL source files on exact #480
`da1e42d5d9c00cc51c60e7e35016bfc1067ce1b7`; that approval remains held. Neither
artifact installs SQL or grants a role.

`qualify.mjs` verifies a literal sealed public commit/tree proof, derives the full
#484 source frame and captures fresh leaf bytes against Git blob identities. It
has no Git/history/network or credential fallback. Only captured verified buffers
and sealed payloads materialize a private after-source image. The qualifier checks
its complete image for byte/mode/path substitutions and unknown companions before
return, and removes a failed image only when its original root identity still
matches. This is point-in-time source qualification, not an atomic filesystem
lock, installed function-body proof, privileged rollback barrier or dependency
loader certification.

The reader implementation, receipt contract and SQL engines are reused. No second
reader wrapper, transaction engine, ledger, publisher or connection factory is
introduced. Passing source checks never supplies tenant/customer ownership:
current opaque Auth/session/AAL2, bound backend, exact commercial customer grant,
merchant/original receipt and before/after catalog checks remain mandatory. Late
source withdrawal suppresses the result and retains the existing object quarantine.
An exact original receipt read never replays a payment, creates a grant, releases a
hold, establishes a balance or verifies settlement.

## Local proof and limits

- 20 new finite source/guard controls PASS, zero failures or skips. They include
  exact patch application, offline/no-Git qualification, missing/partial/tampered
  SQL, mode/symlink, executing-guard replacement, grant-template substitution,
  final source withdrawal and unknown image companion rejection with cleanup.
- 10 affected after-source model cases PASS: six existing #484 assertion identities
  are unchanged; four new cases exercise required SQL before Auth, late SQL
  withdrawal/quarantine, detached private output and foreign-customer rejection.
  The original model-test prefix is byte-identical. Twenty-two unrelated cases
  are filtered by explicit selection; they are not missing tests or new PASS counts.
- The unchanged #484 independent 35+12 and #480 45+30+8 evidence is reused only for
  matching source. Native and desktop/mobile suites are not repeated here. The
  existing component/contract/browser fixture bytes stay pinned; no new browser,
  genuine Auth, installed SQL or full-stack acceptance is claimed.

The new model uses the real existing reader, Auth and caller classes with controlled
SDK and SQL ports. It is not a live principal, customer mapping or hosted database.
Restricted LOGIN creation, exact target, installed owner/function/helper/default
PUBLIC grants, writer/bypass inventory, trusted exclusive connection custody,
alias fencing/discard and installed dependency qualification remain unresolved.
The inactive template still contains only direct private-schema USAGE and exact
five-UUID `customer_payment_receipt` EXECUTE for a separately reviewed LOGIN; it
creates no publication or operating capability.

Canonical source/checker admission, launch integration, SQL/grant installation,
genuine customer Auth/MFA, D1–D3/original A01–A12 and recovery, VAR/NMI/merchant/bank
acceptance, public routes, delivery, provider actions, merge and deployment remain
held. Saul 2 Paul stays first; Cunningham requires separate acceptance.
**Release 1.0 remains NO-GO / NOT AUTHORIZED.**

Primary raw evidence is private and source-bound:

- New controls: `/private/tmp/customer-publication-reader-guard-controls-freeze20.json`,
  SHA256 `562028dc4268352314a64762a4458fd42e2bf66e16c17c54e18a40b9f3f049ac`.
- Affected model: `/private/tmp/customer-publication-reader-after-source-model.json`,
  SHA256 `ce07e98d390eb9dfde0125c77fa872fbdee1317070897928cf347208fe2da746`.
- Fresh versus executed 2,480-file image binding:
  `/private/tmp/publication-reader-after-source-frame.json`, SHA256
  `07fdd875b8044377d2fecf40789e93dab60504df30b4df1262ef6e48fe4b331f`.

Run the new source controls with pinned Node24/Vitest against
`tests/customer-publication-reader-guard.test.ts`. For the affected model, call
`materialize()` into a private directory, supply only the approved dependency
installation, and run `tests/customer-publication-after-source.test.ts` with this
selection (original configuration/budgets retained):

```text
^(reuses opaque|catalog permissions granted during receipt|actual opaque Auth revocation|backend/claims replacement|overall deadline includes stalled Auth|cancelled requests|after-source)
```

These results have different scopes and overlap retained evidence. Do not sum them
into a new full-suite, installed-source or operational acceptance claim.

## Post-restoration evidence

A Mac restart cleared the temporary worktrees and the historical raw reports named
above. Those raw files are lost and have not been reconstructed; their recorded
hashes and counts are historical references only. This packet was restored from
recorded source-generation inputs. All eight executable, test, proof and metadata
files match their frozen hashes; the pre-note README was recovered verbatim.

Fresh, focused post-restoration checks passed: 20 source controls with zero
failures/skips (raw SHA256
`62681dc6d7f41e051cb8c151a0f4a7087dcd7ab4d13eb16b9021368e368b20db`),
and 10 affected controlled model cases with zero failures and 22 explicitly
filtered cases (raw SHA256
`beeeb634f3b2afd4201beff1fe732319cb0cd7c1468152a431b11b97c0943df7`).
An independent fresh 20-control run also passed with zero failures/skips (raw
SHA256 `daf5cae3be587db498d9a9666c3281cfb057cde801ba6262b4e6fc0248677362`).
These new reports and recovery provenance are retained in persistent owner-local
storage. No retained 35+12/native/browser suites or operational actions were
replayed. A2 source author, guard author and future guard parent remain null;
source admission, SQL/grants, Auth and activation remain held.
