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
const s: {
  cycle25SourcePorts: Ports;
  cycle33V1C17Compatibility: {
    commit: string;
    parent: string;
    published: string;
    path: string;
    published_sha256: string;
    sha256: string;
    companion: { path: string; sha256: string };
  };
  admitCycle33V1C17Compatibility: (
    file: { path: string; sha256: string },
    current: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const c17: {
  validateCycle17Manifest: (
    manifest: unknown,
    read?: Ports['read'],
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/check-cycle17-integrity.mjs', import.meta.url).href
);
const a = s.cycle33V1C17Compatibility,
  p = s.cycle25SourcePorts,
  file = { path: a.path, sha256: a.published_sha256 },
  current = () => p.git(a.commit, a.path),
  admit = (ports?: Partial<Ports>, bytes = current()) =>
    s.admitCycle33V1C17Compatibility(file, bytes, ports),
  manifest = () =>
    JSON.parse(
      readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8'),
    );

it('pins the original C17 test and one sole67 M1/A1 CI-only correction', () => {
  expect(a).toEqual({
    commit: 'b947fe0e71c6d61fbe134f9311f259cdc36da49f',
    parent: '67cf66072e3aeeb4bbe645cda7385257bb3f9978',
    published: 'ab7a95596f89f7bceb1fc089cdaa790a55fb10d5',
    path: 'tests/cycle17-integration.test.ts',
    published_sha256:
      'bafd0e74bd26de2aa57e10861839781dcc2cc356d0a4ab0f39d4fa8f0d28d826',
    sha256: '6e68a895ce33c1bcda2ffb5a660aa27f9abf0f89a33c12439c9baf6a31a74589',
    companion: {
      path: 'docs/program/CYCLE33_C17_CLOSEOUT_SOURCE_COMPATIBILITY.md',
      sha256:
        '09bda54a40beac7263ea7300f755d28d1a53e764d5c64734db73cf263b3405cb',
    },
  });
  expect(Object.isFrozen(a)).toBe(true);
  expect(Object.isFrozen(a.companion)).toBe(true);
  expect(p.parent(a.commit)).toBe(a.parent);
});
it('admits exact fresh bytes as build-only evidence with no restoration authority', () => {
  expect(admit()).toEqual({
    module: 'c17-closeout-source-compatibility',
    source_commit: a.commit,
    path: a.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
});
it.each(['src/App.tsx', a.companion.path, '../private'])(
  'rejects unrelated compatibility path %s',
  (path) => {
    expect(() =>
      s.admitCycle33V1C17Compatibility({ ...file, path }, current()),
    ).toThrow('metadata');
  },
);
it('does not replace historical metadata with the corrected current hash', () => {
  expect(() =>
    s.admitCycle33V1C17Compatibility({ ...file, sha256: a.sha256 }, current()),
  ).toThrow('metadata');
});
it.each(['type', 'parent', 'delta'] as const)(
  'denies unreviewed author %s',
  (key) => {
    expect(() =>
      admit({
        [key]: (commit: string) =>
          commit === a.commit ? 'unknown' : p[key](commit),
      }),
    ).toThrow('M1/A1');
  },
);
it.each([
  [a.published, a.path],
  [a.parent, a.path],
  [a.commit, a.path],
  [a.commit, a.companion.path],
])('denies executable or nonregular mode %s %s', (commit, path) => {
  expect(() =>
    admit({
      mode: (c, f) => (c === commit && f === path ? '100755' : p.mode(c, f)),
    }),
  ).toThrow('M1/A1');
});
it.each([
  [a.published, a.path],
  [a.parent, a.path],
  [a.commit, a.path],
  [a.commit, a.companion.path],
])('denies altered immutable Git bytes %s %s', (commit, path) => {
  expect(() =>
    admit({
      git: (c, f) =>
        c === commit && f === path ? Buffer.from('unknown') : p.git(c, f),
    }),
  ).toThrow();
});
it.each([a.path, a.companion.path])(
  'denies changed actual working-tree bytes %s',
  (path) => {
    expect(() =>
      admit({
        read: (f) => (f === path ? Buffer.from('unknown') : p.read(f)),
      }),
    ).toThrow();
  },
);
it('denies historical bytes supplied as the current corrected test', () => {
  expect(() => admit(undefined, p.git(a.published, a.path))).toThrow(
    'Fresh exact',
  );
});
it('denies a test changed after companion validation at the final fresh read', () => {
  let reads = 0;
  expect(() =>
    admit({
      read: (f) =>
        f === a.path && ++reads === 2 ? Buffer.from('unknown') : p.read(f),
    }),
  ).toThrow('Final fresh');
});
it('the actual C17 consumer retains all original file and result metadata', () => {
  const original = manifest();
  expect(c17.validateCycle17Manifest(original)).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 343,
  });
  expect(manifest()).toEqual(original);
  expect(original.independent_files[0]).toEqual(file);
});
it.each([a.path, a.companion.path, 'src/lib/workflows/field-workspace.ts'])(
  'the actual consumer preserves its original denial for altered %s',
  (path) => {
    expect(() =>
      c17.validateCycle17Manifest(manifest(), (f) =>
        f === path ? Buffer.from('unknown') : p.read(f),
      ),
    ).toThrow('Reviewed Cycle17 source changed');
  },
);
it('the actual consumer rejects silently rewriting the historical test pin', () => {
  const changed = manifest();
  changed.independent_files[0].sha256 = a.sha256;
  // Exact manifest metadata is separately retained by its original Git owner;
  // the literal successor itself never accepts the rewritten pin.
  expect(() =>
    s.admitCycle33V1C17Compatibility(changed.independent_files[0], current()),
  ).toThrow('metadata');
  expect(() => c17.validateCycle17Manifest(changed)).toThrow(
    'Reviewed Cycle17 source changed',
  );
  expect(manifest().independent_files[0]).toEqual(file);
});
it('the actual consumer rejects substituting the original independent review metadata', () => {
  const changed = manifest();
  changed.independent_review_commit = a.parent;
  expect(() => c17.validateCycle17Manifest(changed)).toThrow(
    'Reviewed Cycle17 source changed',
  );
  expect(manifest().independent_review_commit).toBe(
    '13204765a304d428d6f5d22915d5347f74bf1d55',
  );
});
