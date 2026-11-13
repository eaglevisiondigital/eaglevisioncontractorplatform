# Unapplied C17 Field closeout correction

The named historical closeout test compares the reviewed Field successor directly
with its original published hash. This patch keeps that original metadata and uses
the existing finite Field validator with the complete original C16 package. It also
asserts rejection of appended unknown Field bytes. No hash allowlist is introduced.

Exact parent: `78cf1d3eb0ce37862a7f34d727e45e7ccb6417ad`. The canonical protected
test remains unchanged. `evidence.json` records original/proposed/patch hashes.
The downstream validator admits only the earlier exact reviewed C17 test author,
so this correction remains BLOCKED pending a separately reviewed finite successor
admission. Passing the proposed case does not close Foundation or classify the
other 15 observed failure markers. Historical cancellations and assertions remain.

Reproduce only in a disposable isolated checkout at this parent/proposal branch:

1. Verify the current protected test SHA256 and the patch SHA256 against
   `evidence.json`; stop on any mismatch. Use `shasum -a 256`.
2. Run the unchanged failing case with its existing budget:

   ```sh
   npx vitest run tests/cycle17-integration.test.ts -t '^Cycle16 closeout preserves child cancellations separately from actual successful combined-source coverage$'
   ```

   Expected: one failure, 44 filtered cases; old `6fcaea…` vs reviewed `4c6252…`.

3. Temporarily apply `git apply proposals/c17-field-closeout/correction.patch`.
   Verify the proposed test SHA256, then repeat the exact command. Expected: one
   pass, 44 filtered cases; the appended-unknown-bytes negative is included.
4. Confirm the unchanged downstream admission rejects this unapproved test:

   ```sh
   node --input-type=module - <<'JS'
   import { readFileSync } from 'node:fs';
   import { execFileSync } from 'node:child_process';
   import { admitC17InventorySuccessor } from './scripts/v1-c17-inventory-source.mjs';
   const path = 'tests/cycle17-integration.test.ts';
   try {
     admitC17InventorySuccessor(path, readFileSync(path), execFileSync('git', [
       'show', '337da476aa6061dba626aff343f0e6045331ac82:' + path,
     ]));
     throw Error('Unexpected admission');
   } catch (error) {
     if (error.message !== 'Complete exact current C17 test/doc bundle required') throw error;
     console.log(error.message);
   }
   JS
   ```

5. Always restore using `git apply --reverse proposals/c17-field-closeout/correction.patch`.
   Verify the original test SHA256 again and `git diff --exit-code -- tests/cycle17-integration.test.ts`.

Do not change the source-admission checker, historical pins, assertions or budgets
as part of this reproduction. No runtime, hosted, installation, deployment, merge
or release authority is granted. Release 1.0 remains NOT READY / NOT AUTHORIZED.
