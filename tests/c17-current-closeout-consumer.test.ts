import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const fixture = await import(
  new URL('./helpers/c17-retained-inventory.mjs', import.meta.url).href
);
await fixture.makeRetainedInventory();
// These are the actual unwrapped modules: no historical port serves live proof.
const source = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const consumer = await import(
  new URL('../scripts/check-cycle17-integrity.mjs', import.meta.url).href
);
const metadata = {
  path: 'tests/cycle17-integration.test.ts',
  sha256: 'bafd0e74bd26de2aa57e10861839781dcc2cc356d0a4ab0f39d4fa8f0d28d826',
};
it('the real source API admits only the exact current closeout as build-only evidence', () => {
  const bytes = readFileSync(metadata.path);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '46747ffb4188b925fa2a64250be069a32e126fc72befac8918028f7594840d9a',
  );
  expect(source.admitCycle33V1C17Compatibility(metadata, bytes)).toMatchObject({
    inventory_successor: {
      source_commit: '76ee5226c52a850d5f692c8aac965d0487e0f544',
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    },
    business_authority: false,
    restore_adapter: false,
  });
});
it('the real current reader cannot be replaced with the retained bd8 inventory argument', () => {
  const old = execFileSync('git', [
    '--no-replace-objects',
    'show',
    'bd8f150c1a347fd172cf5922d67e2664af59f14b:' + metadata.path,
  ]);
  expect(() => source.admitCycle33V1C17Compatibility(metadata, old)).toThrow(
    'Complete exact current C17 test/doc bundle required',
  );
});
it.each([
  metadata.path,
  'docs/program/V1_C17_FIELD_CLOSEOUT_SOURCE.md',
  'src/lib/workflows/field-workspace.ts',
])('the unwrapped current source API denies changed %s', (path) => {
  expect(() =>
    source.admitCycle33V1C17Compatibility(
      metadata,
      readFileSync(metadata.path),
      {
        read: (p: string) =>
          p === path ? Buffer.from('UNKNOWN') : readFileSync(p),
      },
    ),
  ).toThrow();
});
it('the actual consumer retains original metadata while accepting the current source', () => {
  const bytes = readFileSync(
    'docs/program/CYCLE17_DELIVERY_INDEX.json',
    'utf8',
  );
  const manifest = JSON.parse(bytes);
  expect(consumer.validateCycle17Manifest(manifest)).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 343,
  });
  expect(manifest.independent_files[0]).toEqual(metadata);
  expect(readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8')).toBe(
    bytes,
  );
});
