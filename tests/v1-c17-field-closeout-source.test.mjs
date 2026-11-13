import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycle25SourcePorts as actualPorts } from '../scripts/cycle25-source-lineage.mjs';
import {
  inventoryParent,
  inventoryPath as path,
  admitC17InventorySuccessor as actualAdmit,
} from '../scripts/v1-c17-inventory-source.mjs';
const previous = () => actualPorts.git(inventoryParent, path);
const corrupt = (b) => Buffer.concat([b, Buffer.from('\n// unknown\n')]);
const closeoutAuthor = '76ee5226c52a850d5f692c8aac965d0487e0f544';
const closeoutParent = '2c63cfd8175fe23d6c7f80a7879af9c73b27dceb';
const closeoutDoc = 'docs/program/V1_C17_FIELD_CLOSEOUT_SOURCE.md';
const closeout = () => actualPorts.git(closeoutAuthor, path);
test('exact current Field closeout author is source-only through the original admission', () => {
  assert.deepEqual(actualAdmit(path, closeout(), previous()), {
    path,
    source_commit: closeoutAuthor,
    module: 'c17-field-inventory-compatibility',
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
});
for (const mode of [
  'author',
  'parent',
  'merge',
  'extra',
  'missing',
  'before-mode',
  'after-mode',
  'note-mode',
  'predecessor',
  'author-bytes',
  'note-bytes',
  'unknown-current',
  'initial-note',
  'late-note',
  'late-current',
  'field',
]) {
  test(`Field closeout denies ${mode} without changing historical admission`, () => {
    let notes = 0,
      reads = 0;
    const ports = {
      type: (c) =>
        c === closeoutAuthor && mode === 'author'
          ? 'blob'
          : actualPorts.type(c),
      parent: (c) =>
        c === closeoutAuthor && ['parent', 'merge'].includes(mode)
          ? mode === 'merge'
            ? `${closeoutParent} ${closeoutParent}`
            : '0'.repeat(40)
          : actualPorts.parent(c),
      delta: (c) =>
        c === closeoutAuthor && ['extra', 'missing'].includes(mode)
          ? mode === 'missing'
            ? ''
            : actualPorts.delta(c) + '\nM\tsrc/App.tsx'
          : actualPorts.delta(c),
      mode: (c, f) =>
        (mode === 'before-mode' && c === closeoutParent && f === path) ||
        (mode === 'after-mode' && c === closeoutAuthor && f === path) ||
        (mode === 'note-mode' && c === closeoutAuthor && f === closeoutDoc)
          ? '100755'
          : actualPorts.mode(c, f),
      git: (c, f) =>
        (mode === 'predecessor' && c === closeoutParent && f === path) ||
        (mode === 'author-bytes' && c === closeoutAuthor && f === path) ||
        (mode === 'note-bytes' && c === closeoutAuthor && f === closeoutDoc)
          ? corrupt(actualPorts.git(c, f))
          : actualPorts.git(c, f),
      read: (f) => {
        if (f === closeoutDoc) notes++;
        if (f === path) reads++;
        return (f === closeoutDoc &&
          (mode === 'initial-note' || (mode === 'late-note' && notes > 1))) ||
          (f === path && mode === 'late-current' && reads > 1) ||
          (f === 'src/lib/workflows/field-workspace.ts' && mode === 'field')
          ? corrupt(actualPorts.read(f))
          : actualPorts.read(f);
      },
    };
    assert.throws(() =>
      actualAdmit(
        path,
        mode === 'unknown-current' ? corrupt(closeout()) : closeout(),
        previous(),
        ports,
      ),
    );
  });
}
