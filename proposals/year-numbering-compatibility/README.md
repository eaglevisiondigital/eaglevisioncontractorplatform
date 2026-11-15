# Unapplied yearly-number connection and reader compatibility

This isolated proposal starts from exact #482
`28d489a7cc41fff573efdf6ab4fd58de234340ad` and verifies the separate #483
`9889c2dae63338610973b1e000c4d0413d08cea3` customer frame. Both completed decoder
source-author checkpoints and the approved `INV-YYYY-NNNNNN` policy stay closed.
Every existing parent file is unchanged. No proposed patch is applied to this branch.

The proposed disposable connection snapshots the returned packet before a separate
existing `commercial_invoice_issued_read` call under the same current caller. That
original-command read supplies the expected number; the caller's held command,
actor and request hash must match both records. The complete safe projections must
agree. Missing/contradictory/late evidence remains UNKNOWN, retaining original
holds; `readOriginal` does not clear them and no mutation is replayed. Legacy mode
remains UUID-only; yearly mode is explicitly disposable and default-OFF.

The proposed customer bridge obtains optional **both-or-neither** number/receipt
anchors only from its current trusted private authorization mapping. The complete
mapping, including these anchors, is stable across awaited Auth and source reads.
Public request fields remain unchanged. Display numbers never authorize access.
The existing trusted port must independently resolve original issued-header and
commercial-access evidence; no operational implementation of that port exists.

## Separate finite checkpoints

`source.json` binds exact parents, modes, payloads and three unapplied patches:

- `connection-author.patch`: ONE connection file on #482. Source-author approval
  only; no checker or launch admission.
- `reader-author.patch`: ONE bridge file on #483, a different parent. Separate
  source-author approval only.
- `connection-guard-author.patch`: proposed disposable composed-source guard;
  **held** until actual compatibility author identities, exact parent rebinding,
  independent review and separate checker-author approval exist.

The canonical F/H/G caller helper remains unchanged and must still reject the
unadmitted presenter. Its compatibility/admission and launch integration are later
separate checkpoints. Passing the proposed disposable guard is not canonical
admission, genuine Auth, installed SQL verification or operational acceptance.

`qualify.mjs` verifies literal packet seals, complete nonsymlink base files, both
immutable authored Git frames and object hashes. The sealed public
`git-source-proof.json` carries commit/tree objects and the selected external blobs;
all Git object identities and tree-to-leaf paths are recomputed. No Git checkout,
network fetch or credential fallback is needed, including on shallow CI. It materializes only a disposable
source composition in a new private temporary directory. This is a point-in-time
source audit, not an atomic filesystem lock, privileged rollback protection or
independent custody. Materialization consumes verified immutable Git objects and
hash-sealed captured payload buffers. Unknown/mixed sources,
coordinated manifest rebinding, mode/symlink substitution and late packet withdrawal
deny. Test payloads exercise the actual composed modules; original canonical tests
and budgets stay unchanged. No new transaction, numbering or financial engine exists.

Validation commands use `capture()`/`materialize()`, then the resulting directory's
existing pinned Vitest/TypeScript/Playwright tools. The two unit test payloads and
browser configuration are listed in `testPayloads`. Native qualification uses the
existing socket-only disposable PostgreSQL17 fixture, exact CI role preparation,
fresh clusters and unique output files; no operating database target is accepted.
Existing #475 UTC rollover/regression/exhaustion/rollback evidence is retained rather
than represented as newly tested behavior. New connection-native tests cover yearly
issuance, independent original read, committed lost ACK, source revocation,
competing attempts and wrong-customer denial. Customer Auth/mapping ports remain
controlled fixtures; customer SQL/Auth acceptance is not inferred.

A local diagnostic harness initially overwrote the older primary 28-case report
path with a failed new five-case run. That failed run is archived separately and
the harness now uses unique filenames. The old primary raw report is unavailable;
its historical counts are not re-established here. Independent accepted 73+8 and
#475 numbering evidence remain separate and unchanged. New fixture cleanup restores
only its own explicitly revoked synthetic membership; permanent command holds are
never reset. Initial failures remain recorded privately.

Final evidence: primary 47 unit, 23 source, five new native, 17 unchanged legacy
native and six desktop/mobile browser cases PASS. Independent 47 unit, 23 source
and five new native cases PASS; the proof objects and every materialized file are
independently matched to the executed composition. These counts overlap and must
not be summed into a broader operational acceptance claim.

Phase decision: qualify the missing original-header/anchor boundary without source
promotion. No SQL/grants, hosted Auth/provider/customer/merchant action, message,
recovery, merge or deployment is authorized. **Release 1.0 remains NO-GO.**
