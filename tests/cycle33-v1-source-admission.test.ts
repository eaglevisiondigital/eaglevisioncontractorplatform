import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

type Ports = {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  type: (commit: string) => string;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  mode: (commit: string, path: string) => string;
};
type Author = {
  module: string;
  commit: string;
  parent: string;
  path: string;
  predecessor: string;
  predecessor_sha256: string;
  sha256: string;
  added: readonly { path: string; sha256: string }[];
  original_companions: readonly { path: string; sha256: string }[];
  published: null | {
    commit: string;
    sha256: string;
    blob: string;
    requires_blob: boolean;
  };
};
const s: {
  cycle25Parent: string;
  cycle25SourcePorts: Ports;
  cycle33V1Parent: string;
  cycle33V1Authors: readonly Author[];
  admitCycle33V1Source: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle33V1Published: (
    file: { path: string; sha256: string; blob?: string },
    current: Buffer,
    commit: string,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle25Source: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const p = s.cycle25SourcePorts,
  authors = s.cycle33V1Authors,
  current = (a: Author) => p.git(a.commit, a.path),
  previous = (a: Author) => p.git(s.cycle33V1Parent, a.path),
  admit = (
    a: Author,
    ports?: Partial<Ports>,
    bytes = current(a),
    old = previous(a),
  ) => s.admitCycle33V1Source(a.path, bytes, old, ports);
const originalMismatch: Record<string, string> = {
  'recorded-time-kind-review':
    'Exact current Cycle33 execution source required',
  'published-history-filter-currentness':
    'Unreviewed source replacement: src/lib/workflows/published-service-navigation.ts',
  'addon-job-filter-currentness':
    'Unreviewed source replacement: src/lib/workflows/addon-readiness-guide.ts',
  'maintenance-review-reference-custody':
    'Current source differs from fixed Cycle27 lineage: Current source differs from fixed Cycle31 author',
  'task-display-reference-custody':
    'Current source differs from fixed Cycle32 author',
};
it('pins only literal reviewed V1 authors, sole8c parent and frozen finite companions', () => {
  expect(s.cycle33V1Parent).toBe('8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55');
  expect(authors.map((a) => [a.module, a.commit, a.path])).toEqual([
    [
      'recorded-time-kind-review',
      'ad2830e5677539ea2c4922377b7a184386e4a9e1',
      'src/lib/workflows/cost-coverage-path.ts',
    ],
    [
      'published-history-filter-currentness',
      'b4b35f5323affacbedd433684f2085f8bf8628d2',
      'src/lib/workflows/published-service-navigation.ts',
    ],
    [
      'addon-job-filter-currentness',
      '99e112a7cf669dfde03fdd69dbdbce2e74ef2fd4',
      'src/lib/workflows/addon-readiness-guide.ts',
    ],
    [
      'maintenance-review-reference-custody',
      '2edb76df29c36328f39a19277b287c8e9b16a940',
      'src/lib/workflows/plan-cancellation-review.ts',
    ],
    [
      'task-display-reference-custody',
      '15fabc063a74b3fce587f5dca8962428dc0b04ac',
      'src/lib/workflows/task-correction-review.ts',
    ],
  ]);
  expect(Object.isFrozen(authors)).toBe(true);
  for (const a of authors) {
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.added)).toBe(true);
    expect(a.added.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(a.original_companions)).toBe(true);
    expect(a.original_companions.every(Object.isFrozen)).toBe(true);
    expect(a.added).toHaveLength(2);
    expect(a.original_companions).toHaveLength(2);
    expect(a.parent).toBe(s.cycle33V1Parent);
  }
});
for (const a of authors) {
  it(`${a.module}: admits exact fresh author bytes as build-only evidence`, () => {
    expect(admit(a)).toEqual({
      module: a.module,
      source_commit: a.commit,
      path: a.path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    });
    expect(readFileSync(a.path)).toEqual(current(a));
  });
  it(`${a.module}: denies unrelated path and copied companion as native ownership`, () => {
    for (const path of ['src/App.tsx', '../private', a.added[0].path])
      expect(() =>
        s.admitCycle33V1Source(path, current(a), previous(a)),
      ).toThrow('No literal');
  });
  it.each(['type', 'parent', 'delta'] as const)(
    `${a.module}: denies changed author %s evidence`,
    (key) => {
      const old = p[key];
      expect(() =>
        admit(a, {
          [key]: (c: string) => (c === a.commit ? 'unreviewed' : old(c)),
        }),
      ).toThrow('sole-parent');
    },
  );
  it(`${a.module}: denies merge parents and any extra author delta`, () => {
    expect(() =>
      admit(a, {
        parent: (c) =>
          c === a.commit
            ? `${s.cycle33V1Parent} ${a.predecessor}`
            : p.parent(c),
      }),
    ).toThrow('sole-parent');
    expect(() =>
      admit(a, {
        delta: (c) =>
          c === a.commit ? `${p.delta(c)}\nM\tsrc/App.tsx` : p.delta(c),
      }),
    ).toThrow('sole-parent');
  });
  it(`${a.module}: denies a noncommit predecessor`, () => {
    expect(() =>
      admit(a, { type: (c) => (c === a.predecessor ? 'blob' : p.type(c)) }),
    ).toThrow('sole-parent');
  });
  it.each(['predecessor', 'parent', 'commit'] as const)(
    `${a.module}: denies nonregular native %s mode`,
    (key) => {
      const target = key === 'parent' ? s.cycle33V1Parent : a[key];
      expect(() =>
        admit(a, {
          mode: (c, path) =>
            c === target && path === a.path ? '120000' : p.mode(c, path),
        }),
      ).toThrow('regular');
    },
  );
  it(`${a.module}: denies changed new and original companion modes`, () => {
    for (const f of a.added)
      expect(() =>
        admit(a, {
          mode: (c, path) =>
            c === a.commit && path === f.path ? '100755' : p.mode(c, path),
        }),
      ).toThrow('regular');
    for (const f of a.original_companions)
      expect(() =>
        admit(a, {
          mode: (c, path) =>
            c === a.predecessor && path === f.path ? '120000' : p.mode(c, path),
        }),
      ).toThrow('regular');
  });
  it.each(['predecessor', 'parent'] as const)(
    `${a.module}: denies altered raw %s bytes`,
    (key) => {
      const target = key === 'parent' ? s.cycle33V1Parent : a.predecessor;
      expect(() =>
        admit(a, {
          git: (c, path) =>
            c === target && path === a.path
              ? Buffer.from('unreviewed')
              : p.git(c, path),
        }),
      ).toThrow('predecessor');
    },
  );
  it(`${a.module}: denies changed supplied predecessor and current bytes`, () => {
    expect(() =>
      admit(a, undefined, current(a), Buffer.from('unreviewed')),
    ).toThrow('predecessor');
    expect(() => admit(a, undefined, Buffer.from('unreviewed'))).toThrow(
      'Fresh exact',
    );
  });
  it(`${a.module}: denies forged author bytes even if caller/current files agree`, () => {
    const fake = Buffer.from('unreviewed');
    expect(() =>
      admit(
        a,
        {
          git: (c, path) =>
            c === a.commit && path === a.path ? fake : p.git(c, path),
          read: (path) => (path === a.path ? fake : p.read(path)),
        },
        fake,
      ),
    ).toThrow('Fresh exact');
  });
  it(`${a.module}: denies forged new and original raw companion bytes`, () => {
    for (const f of a.added)
      expect(() =>
        admit(a, {
          git: (c, path) =>
            c === a.commit && path === f.path
              ? Buffer.from('unreviewed')
              : p.git(c, path),
        }),
      ).toThrow('companion');
    for (const f of a.original_companions)
      expect(() =>
        admit(a, {
          git: (c, path) =>
            c === a.predecessor && path === f.path
              ? Buffer.from('unreviewed')
              : p.git(c, path),
        }),
      ).toThrow('companion');
  });
  it(`${a.module}: rereads every current native/new/original companion after prior success`, () => {
    for (const changed of [
      a.path,
      ...a.added.map((f) => f.path),
      ...a.original_companions.map((f) => f.path),
    ]) {
      let drift = false;
      const read = (path: string) =>
        path === changed && drift ? Buffer.from('unreviewed') : p.read(path);
      expect(admit(a, { read })).toHaveProperty('source_commit', a.commit);
      drift = true;
      expect(() => admit(a, { read })).toThrow();
    }
  });
  it(`${a.module}: final fresh native read denies drift during companion verification`, () => {
    let reads = 0;
    expect(() =>
      admit(a, {
        read: (path) =>
          path === a.path && ++reads > 1
            ? Buffer.from('unreviewed')
            : p.read(path),
      }),
    ).toThrow('Final fresh');
  });
  it(`${a.module}: absent current files are never restored from historical Git evidence`, () => {
    for (const missing of [
      a.path,
      ...a.added.map((f) => f.path),
      ...a.original_companions.map((f) => f.path),
    ])
      expect(() =>
        admit(a, {
          read: (path) => {
            if (path === missing) throw Error('missing current file');
            return p.read(path);
          },
        }),
      ).toThrow('missing');
  });
  it(`${a.module}: preserves old chain and denies unknown edits with its original mismatch diagnostic`, () => {
    const result = s.admitCycle25Source(
      a.path,
      current(a),
      p.git(s.cycle25Parent, a.path),
    );
    expect(JSON.stringify(result)).toContain(a.commit);
    expect(result.authority).toBe('SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE');
    expect(() =>
      s.admitCycle25Source(
        a.path,
        Buffer.from('unreviewed'),
        p.git(s.cycle25Parent, a.path),
      ),
    ).toThrow(originalMismatch[a.module]);
  });
}
for (const a of authors.filter((a) => a.published)) {
  const meta = () => ({
    path: a.path,
    sha256: a.published!.sha256,
    ...(a.published!.requires_blob ? { blob: a.published!.blob } : {}),
  });
  it(`${a.module}: admits immutable original published metadata and current exact successor separately`, () => {
    expect(
      s.admitCycle33V1Published(meta(), current(a), a.published!.commit),
    ).toHaveProperty('source_commit', a.commit);
  });
  it(`${a.module}: denies forged published path/hash/blob/commit instead of updating history`, () => {
    for (const file of [
      { ...meta(), path: 'src/App.tsx' },
      { ...meta(), sha256: a.sha256 },
      { ...meta(), blob: '0'.repeat(40) },
    ])
      expect(() =>
        s.admitCycle33V1Published(file, current(a), a.published!.commit),
      ).toThrow('metadata');
    expect(() =>
      s.admitCycle33V1Published(meta(), current(a), a.commit),
    ).toThrow('metadata');
  });
  it(`${a.module}: validates original published raw bytes and current live source`, () => {
    expect(() =>
      s.admitCycle33V1Published(meta(), current(a), a.published!.commit, {
        git: (c, path) =>
          c === a.predecessor && path === a.path
            ? Buffer.from('unreviewed')
            : p.git(c, path),
      }),
    ).toThrow('bytes/blob');
    expect(() =>
      s.admitCycle33V1Published(meta(), current(a), a.published!.commit, {
        read: (path) =>
          path === a.path ? Buffer.from('unreviewed') : p.read(path),
      }),
    ).toThrow('Fresh exact');
  });
}
it('Cycle21 retains its published metadata and legacy failure contract for unknown edits', async () => {
  const { validateCycle21PublishedSource } = await import(
      new URL('../scripts/check-cycle21.mjs', import.meta.url).href
    ),
    a = authors.find(
      (a) => a.module === 'published-history-filter-currentness',
    )!,
    file = {
      path: a.path,
      sha256: a.published!.sha256,
      blob: a.published!.blob,
    },
    old = p.git(a.predecessor, a.path);
  expect(() =>
    validateCycle21PublishedSource(file, a.predecessor, current(a), old),
  ).not.toThrow();
  expect(() =>
    validateCycle21PublishedSource(
      file,
      a.predecessor,
      Buffer.from('unreviewed'),
      old,
    ),
  ).toThrow('Exact published Cycle21 bytes/blob required');
  expect(() =>
    validateCycle21PublishedSource(
      { ...file, sha256: a.sha256 },
      a.predecessor,
      current(a),
      old,
    ),
  ).toThrow('Exact published Cycle21 bytes/blob required');
});
it('Cycle16 retains its original metadata and legacy mismatch denial for unknown sources', async () => {
  const { validateCycle16Manifest } = await import(
      new URL('../scripts/check-cycle16-integrity.mjs', import.meta.url).href
    ),
    manifest = JSON.parse(
      readFileSync('docs/program/CYCLE16_DELIVERY_INDEX.json', 'utf8'),
    ),
    a = authors.find((a) => a.module === 'addon-job-filter-currentness')!;
  expect(() => validateCycle16Manifest(manifest)).not.toThrow();
  expect(() =>
    validateCycle16Manifest(manifest, (path: string) =>
      path === a.path ? Buffer.from('unreviewed') : p.read(path),
    ),
  ).toThrow('Reviewed Cycle16 source changed: ' + a.path);
  const changed = structuredClone(manifest);
  changed.packages
    .find((v: { module: string }) => v.module === 'addon-readiness-guide')
    .owned_files.find((v: { path: string }) => v.path === a.path).sha256 =
    a.sha256;
  expect(() => validateCycle16Manifest(changed)).toThrow(
    'Reviewed Cycle16 source changed: ' + a.path,
  );
});
