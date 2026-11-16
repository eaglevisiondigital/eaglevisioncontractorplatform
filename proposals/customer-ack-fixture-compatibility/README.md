# Current-source ACK fixture compatibility — UNAPPLIED

This test-only proposal corrects #507's collection failure without changing the
#505 composition, qualifier, SQL, runtime, source pins or historical assertions.
Exact #507 `4c1feb8f228257988bb31f67b9aba52d7626a220` collected **zero tests and
failed one suite**: the original #505 fixture called its strict `capture()` against
the host checkout, which now also contains #507's three fixture-data files. Those
files are outside the qualifier's unchanged closed inventory.

`fixture.patch` proposes only `tests/customer-payment-ack-composition-source.test.ts`
(mode `100644`). Header/setup changes construct an owned clean test snapshot:

- The current SHA-sealed public proof supplies advisory path/mode names only.
  Every admitted file body comes from the current filesystem; no historical Git
  blob is substituted for missing, changed or revoked current source.
- The exact three #507 data files remain separately SHA/mode checked, outside
  source authority. Unknown companions in that directory deny.
- Unrelated host output is neither copied nor admitted. Current known source,
  ancestors, modes and root identities are rechecked before and after operations.
- The unchanged, SHA-checked #505 qualifier is imported only after source checks
  and remains the authority on the clean snapshot. Unknown files/directories
  inside that snapshot deny; direct qualification of the #507 host still denies.
- All original twelve test bodies and literal expectations remain byte-exact:
  tail SHA256 `ad79624cdf16a4bf5ede4bc08660ddc243340b05a74a58b12758742b0b309524`.

This is fixture isolation, not admission of the whole host checkout or new business
source. The fixture header is a separately reviewed test TCB; it grants no runtime,
Auth, financial, publication, provider or installation authority.

## Qualification boundary

Evaluate the payload only in an owned exact #507 image with the one proposed test
replacement. Keep this proposal's own namespace out of that qualification image;
the raw proposal checkout retains the protected original fixture and its known
inventory DENY. The new controls build the same declared afterimage from current
inputs and test noisy-host isolation, current-body fidelity, missing/corrupt/mode/
symlink/rebound data, qualifier nonexecution, unknown clean companions, late source
withdrawal and source/clean-root replacement.

Only the changed fixture's original twelve source cases and the twenty-five new
controls are in scope. Existing twenty-five business-unit cases and the original
eight plus three native cases retain their separate matching-source evidence;
they are not rerun or claimed as fresh hosted acceptance. No browser behavior or
native SQL input changes. The #505 three-path composition patch remains exactly
`07f345abc31b248d5ff23ada8efb82349dc23d44f2cc61b49e63cd8a1cffccbe`, UNAPPLIED.

Primary and independent final qualification, separately: **12 original source
cases PASS and 25 new controls PASS, zero failures/skips in each run**. Proposal and afterimage TypeScript/scoped lint,
formatting and feature/design locks pass. Earlier control-harness preparation
errors and type/lint diagnostics remain private historical evidence; they are not
business failures or hidden test suppressions.

Raw diagnostic reports and temporary fixture identities remain private. Final
source hashes and qualification results are recorded in `source.json`.

## Separate owner checkpoint

After independent review, authorize only the exact `fixture.patch` hash and
before/after source hashes in `source.json`, on an isolated child of exact #507,
changing only the named test file at mode `100644`. This proposal does not apply
that protected test patch. It excludes checker/runtime changes, the #505 source
composition, launch promotion, SQL/grants, genuine Auth, real tenants/merchants,
provider calls, financial actions, messages, merge, deployment and recovery.

Saul 2 Paul remains first; Cunningham requires separate accepted bindings.
**Release 1.0 remains NO-GO.**
