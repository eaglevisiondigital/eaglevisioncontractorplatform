import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

type Spec = {
  module: string;
  commit: string;
  modified: string[];
  added: string[];
};
type Ports = {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  type: (commit: string) => string;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  mode: (commit: string, path: string) => string;
};
const source: {
  cycle33ExecutionParent: string;
  cycle33ExecutionAuthors: Spec[];
  cycle25SourcePorts: Ports;
  admitCycle33ExecutionSource: (
    path: string,
    current: Buffer,
    previous: Buffer,
    supplied?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle33ExecutionPublished: (
    file: { path: string; sha256: string; blob: string },
    current: Buffer,
    supplied?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const p = source.cycle25SourcePorts;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const blob = (b: Buffer) =>
  createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
it('retains exact762 and the two already accepted security corrections byte for byte', () => {
  expect(source.cycle33ExecutionParent).toBe(
    '762e6fa590d3ef9366052db0df34bb02485973c3',
  );
  expect(Object.isFrozen(source.cycle33ExecutionAuthors)).toBe(true);
  expect(
    source.cycle33ExecutionAuthors.map((s) => [s.module, s.commit]),
  ).toEqual([
    [
      'task-continuity-input-custody',
      '192c07796de9562735d53fd3ea9db728ac98ce57',
    ],
    [
      'owner-comparison-input-custody',
      '65841565f72b42a485b51e4b804837b53da63cfe',
    ],
    [
      'service-lineage-handle-capture',
      '86416efaafc5f968bce8aa61c911371b576ddd7c',
    ],
    [
      'cost-selection-current-authority',
      '98e4c39f3135b0b8177e2cc50980c1814fdcb2ff',
    ],
  ]);

  for (const path of [
    'src/lib/workflows/maintenance-plan-correction.ts',
    'src/lib/workflows/offline-source-protocol.ts',
  ])
    expect(p.read(path)).toEqual(p.git(source.cycle33ExecutionParent, path));
});

describe.each(source.cycle33ExecutionAuthors)(
  '$module fixed source admission',
  (spec) => {
    const path = spec.modified[0],
      current = () => p.git(spec.commit, path),
      previous = () => p.git(source.cycle33ExecutionParent, path);
    it('admits the complete literal sole-parent author without business or restoration authority', () => {
      expect(p.parent(spec.commit)).toBe(source.cycle33ExecutionParent);
      expect(
        source.admitCycle33ExecutionSource(path, current(), previous()),
      ).toEqual({
        module: spec.module,
        source_commit: spec.commit,
        path,
        authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
        business_authority: false,
        restore_adapter: false,
      });
      expect(Object.isFrozen(spec)).toBe(true);
      expect(Object.isFrozen(spec.modified)).toBe(true);
      expect(Object.isFrozen(spec.added)).toBe(true);
    });
    it('rejects edited current and predecessor bytes', () => {
      expect(() =>
        source.admitCycle33ExecutionSource(
          path,
          Buffer.concat([current(), Buffer.from('\n')]),
          previous(),
        ),
      ).toThrow();
      expect(() =>
        source.admitCycle33ExecutionSource(
          path,
          current(),
          Buffer.concat([previous(), Buffer.from('\n')]),
        ),
      ).toThrow();
    });
    it.each(['type', 'parent', 'delta', 'mode'] as const)(
      'rejects changed %s evidence',
      (key) => {
        expect(() =>
          source.admitCycle33ExecutionSource(path, current(), previous(), {
            [key]: () => 'unreviewed',
          }),
        ).toThrow();
      },
    );
    it('never treats unchanged predecessor bytes as the reviewed correction', () => {
      expect(() =>
        source.admitCycle33ExecutionSource(path, previous(), previous()),
      ).toThrow();
    });
    it('rereads every current companion after a prior successful admission', () => {
      for (const companion of spec.added) {
        let drift = false;
        const read = (file: string) =>
          file === companion && drift
            ? Buffer.from('unreviewed')
            : p.read(file);
        expect(
          source.admitCycle33ExecutionSource(path, current(), previous(), {
            read,
          }),
        ).toHaveProperty('source_commit', spec.commit);
        drift = true;
        expect(() =>
          source.admitCycle33ExecutionSource(path, current(), previous(), {
            read,
          }),
        ).toThrow('companion');
      }
    });
    it('does not restore a missing current companion from historical Git evidence', () => {
      expect(() =>
        source.admitCycle33ExecutionSource(path, current(), previous(), {
          read: () => {
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          },
        }),
      ).toThrow('missing');
    });
    it('requires the original published hash and blob separately from exact current author bytes', () => {
      const file = { path, sha256: sha(previous()), blob: blob(previous()) };
      expect(
        source.admitCycle33ExecutionPublished(file, current()),
      ).toHaveProperty('source_commit', spec.commit);
      expect(() =>
        source.admitCycle33ExecutionPublished(
          { ...file, sha256: '0'.repeat(64) },
          current(),
        ),
      ).toThrow('hash/blob');
      expect(() =>
        source.admitCycle33ExecutionPublished(
          { ...file, blob: '0'.repeat(40) },
          current(),
        ),
      ).toThrow('hash/blob');
      expect(() =>
        source.admitCycle33ExecutionPublished(file, Buffer.from('unreviewed')),
      ).toThrow();
    });
    it('rejects unrelated and private source paths', () => {
      for (const foreign of [
        'src/App.tsx',
        '.staging/private.json',
        '../private',
      ])
        expect(() =>
          source.admitCycle33ExecutionSource(foreign, current(), previous()),
        ).toThrow('owner');
    });
  },
);

const legacy: {
  validateCycle22Manifest: (
    manifest: unknown,
    ports?: Partial<Ports>,
  ) => unknown;
} = await import(new URL('../scripts/check-cycle22.mjs', import.meta.url).href);
const legacy23: {
  validateCycle23Manifest: (
    manifest: unknown,
    ports?: Partial<Ports>,
  ) => unknown;
} = await import(new URL('../scripts/check-cycle23.mjs', import.meta.url).href);
const legacy24: {
  validateCycle24Manifest: (
    manifest: unknown,
    ports?: Partial<Ports>,
  ) => unknown;
  checkCycle24Preservation: () => unknown;
} = await import(new URL('../scripts/check-cycle24.mjs', import.meta.url).href);
const legacy19: {
  validateCycle19Manifest: (
    manifest: unknown,
    read?: (path: string) => Buffer,
  ) => unknown;
} = await import(
  new URL('../scripts/check-cycle19-integrity.mjs', import.meta.url).href
);
const manifest = (n: number) =>
  JSON.parse(
    readFileSync(
      `docs/program/CYCLE${n}_${n === 19 ? 'DELIVERY_INDEX' : 'SOURCE_MANIFEST'}.json`,
      'utf8',
    ),
  );
it('retains original C19 metadata while independently admitting the exact current Owner correction', () => {
  expect(legacy19.validateCycle19Manifest(manifest(19))).toMatchObject({
    packages: 5,
    author_files: 25,
  });
});
it('validates the C22 current chain without rewriting original metadata', () => {
  expect(legacy.validateCycle22Manifest(manifest(22), p)).toMatchObject({
    packages: 5,
    author_files: 25,
  });
});
it('validates the C23 current chain without rewriting original metadata', () => {
  expect(legacy23.validateCycle23Manifest(manifest(23), p)).toMatchObject({
    packages: 5,
    author_files: 25,
  });
});
it('validates the C24 current chain without rewriting original metadata', () => {
  expect(legacy24.validateCycle24Manifest(manifest(24), p)).toMatchObject({
    packages: 6,
    admitted_files: 36,
  });
});
it('original source validators still deny unreviewed edits and companion drift', () => {
  for (const path of [
    'src/lib/workflows/priority-saved-revisions.ts',
    'tests/cycle33-owner-comparison-input-custody.test.ts',
  ]) {
    const read = (file: string) =>
      file === path ? Buffer.from('unreviewed') : p.read(file);
    expect(() =>
      legacy19.validateCycle19Manifest(manifest(19), read),
    ).toThrow();
    expect(() =>
      legacy.validateCycle22Manifest(manifest(22), { read }),
    ).toThrow();
    expect(() =>
      legacy23.validateCycle23Manifest(manifest(23), { read }),
    ).toThrow();
  }
});

it('C24 native-package validation separately denies unreviewed Field source and companion edits', () => {
  for (const path of [
    'src/lib/workflows/task-receipt-reconciliation.ts',
    'tests/cycle33-execution-task-continuity.test.ts',
  ]) {
    const read = (file: string) =>
      file === path ? Buffer.from('unreviewed') : p.read(file);
    expect(() =>
      legacy24.validateCycle24Manifest(manifest(24), { read }),
    ).toThrow();
  }
});
