import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Spec = {
  module: string;
  owner: string;
  commit: string;
  modified: readonly string[];
  added: readonly string[];
};
type Ports = {
  git: (commit: string, path: string) => Buffer;
  read: (path: string) => Buffer;
  type: (commit: string) => string;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  mode: (commit: string, path: string) => string;
};
const source: {
  cycle33NextParent: string;
  cycle33NextAuthors: readonly Spec[];
  cycle33Parent: string;
  cycle33Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  admitCycle33Forward: (
    path: string,
    current: Buffer,
    previous: Buffer,
    supplied?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle33NextSource: (
    path: string,
    current: Buffer,
    previous: Buffer,
    supplied?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle25Source: (
    path: string,
    current: Buffer,
    previous: Buffer,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const ports = source.cycle25SourcePorts;

it('retains the reviewed corrective parent without granting business or restoration authority', () => {
  expect(source.cycle33NextParent).toBe(
    '39b5b1977f2e18c1c7d534667260ce5ed05660f3',
  );
  expect(source.cycle33NextAuthors.map((s) => s.module).sort()).toEqual([
    'maintenance-review-custody',
    'offline-protocol-admission',
  ]);
  expect(Object.isFrozen(source.cycle33NextAuthors)).toBe(true);
  expect(
    source.cycle33NextAuthors.map((s) => ({
      module: s.module,
      commit: s.commit,
      modified: s.modified,
      added: s.added,
    })),
  ).toEqual([
    {
      module: 'maintenance-review-custody',
      commit: 'b1f3ecb49c8f8ad6cac3cd9e88a1e6aa8c1a2995',
      modified: ['src/lib/workflows/maintenance-plan-correction.ts'],
      added: [
        'tests/cycle33-maintenance-review-custody.test.ts',
        'docs/program/CYCLE33_MAINTENANCE_REVIEW_CUSTODY.md',
      ],
    },
    {
      module: 'offline-protocol-admission',
      commit: '14989f2080b856c1d90e55dfd6ac1dfbf4fd2515',
      modified: ['src/lib/workflows/offline-source-protocol.ts'],
      added: [
        'tests/cycle33-next-offline-protocol-admission.test.ts',
        'docs/program/CYCLE33_NEXT_OFFLINE_PROTOCOL_ADMISSION.md',
      ],
    },
  ]);
});

describe.each(source.cycle33NextAuthors)(
  '$module exact original source',
  (spec) => {
    const path = spec.modified[0],
      current = () => ports.git(spec.commit, path),
      previous = () => ports.git(source.cycle33NextParent, path);
    it('admits only the fixed whole author bundle and reports source evidence only', () => {
      expect(ports.parent(spec.commit)).toBe(source.cycle33NextParent);
      expect(
        source.admitCycle33NextSource(path, current(), previous()),
      ).toEqual({
        module: spec.module,
        source_commit: spec.commit,
        path,
        authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
        business_authority: false,
        restore_adapter: false,
      });
    });
    it('rejects changed current bytes, changed predecessors and unrelated paths', () => {
      expect(() =>
        source.admitCycle33NextSource(
          path,
          Buffer.concat([current(), Buffer.from('\n')]),
          previous(),
        ),
      ).toThrow();
      expect(() =>
        source.admitCycle33NextSource(
          path,
          current(),
          Buffer.concat([previous(), Buffer.from('\n')]),
        ),
      ).toThrow();
      expect(() =>
        source.admitCycle33NextSource('src/App.tsx', current(), previous()),
      ).toThrow();
    });
    it.each(['type', 'parent', 'delta', 'mode'] as const)(
      'rejects altered %s evidence instead of trusting ancestry',
      (key) => {
        expect(() =>
          source.admitCycle33NextSource(path, current(), previous(), {
            [key]: () => 'unreviewed',
          }),
        ).toThrow();
      },
    );
    it('does not accept the predecessor as the reviewed correction', () => {
      expect(() =>
        source.admitCycle33NextSource(path, previous(), previous()),
      ).toThrow();
    });
    it('rereads every current companion after an earlier successful check', () => {
      for (const companion of spec.added) {
        let drift = false;
        const read = (p: string) =>
          p === companion && drift ? Buffer.from('unreviewed') : ports.read(p);
        expect(
          source.admitCycle33NextSource(path, current(), previous(), { read }),
        ).toMatchObject({ source_commit: spec.commit });
        drift = true;
        expect(() =>
          source.admitCycle33NextSource(path, current(), previous(), { read }),
        ).toThrow('companion');
      }
    });
    it('denies absent current companions without restoring them from Git', () => {
      expect(() =>
        source.admitCycle33NextSource(path, current(), previous(), {
          read: () => {
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          },
        }),
      ).toThrow();
    });
    it('binds the actual combined runtime and all companions to author blobs', () => {
      for (const p of [...spec.modified, ...spec.added])
        expect(readFileSync(p)).toEqual(ports.git(spec.commit, p));
    });
  },
);

it('preserves the original published offline predecessor while explaining only its exact new current bytes', () => {
  const path = 'src/lib/workflows/offline-source-protocol.ts',
    published = ports.git('31e2bf5b05f6befac1c24314a31d2eabe65c5219', path);
  expect(published).toEqual(ports.git(source.cycle33NextParent, path));
  expect(
    source.admitCycle25Source(path, readFileSync(path), published),
  ).toMatchObject({
    module: 'offline-protocol-admission',
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  });
});

it('keeps original C33 author identity while recording its exact reviewed follow-up separately', () => {
  const path = 'src/lib/workflows/maintenance-plan-correction.ts';
  expect(
    source.admitCycle33Forward(
      path,
      readFileSync(path),
      ports.git(source.cycle33Parent, path),
    ),
  ).toMatchObject({
    source_commit: 'de81936d42c9279940f3a8466581d1321de84636',
    reviewed_followup: {
      source_commit: 'b1f3ecb49c8f8ad6cac3cd9e88a1e6aa8c1a2995',
      business_authority: false,
      restore_adapter: false,
    },
  });
});
it('rejects either original or new companion drift through legacy C33 follow-up admission', () => {
  const path = 'src/lib/workflows/maintenance-plan-correction.ts',
    original = source.cycle33Authors.find(
      (s) => s.module === 'maintenance-input-continuity',
    )!,
    next = source.cycle33NextAuthors.find(
      (s) => s.module === 'maintenance-review-custody',
    )!;
  for (const companion of [...original.added, ...next.added]) {
    let drift = false;
    const read = (p: string) =>
      p === companion && drift ? Buffer.from('unreviewed') : ports.read(p);
    expect(
      source.admitCycle33Forward(
        path,
        readFileSync(path),
        ports.git(source.cycle33Parent, path),
        { read },
      ),
    ).toHaveProperty('reviewed_followup');
    drift = true;
    expect(() =>
      source.admitCycle33Forward(
        path,
        readFileSync(path),
        ports.git(source.cycle33Parent, path),
        { read },
      ),
    ).toThrow('companion');
  }
});
