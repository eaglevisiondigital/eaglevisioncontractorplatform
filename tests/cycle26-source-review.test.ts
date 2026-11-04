import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
type Spec = {
  module: string;
  commit: string | null;
  permitted: readonly string[];
  modified: readonly string[];
  added: readonly string[];
};
type Ports = {
  type: (c: string) => string;
  parent: (c: string) => string;
  mode: (c: string, p: string) => string;
  delta: (c: string) => string;
  git: (c: string, p: string) => Buffer;
  read: (p: string) => Buffer;
};
const lib: {
  cycle26Parent: string;
  cycle26Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle26ForwardSpec: (s: Spec, p?: Ports) => unknown;
  inspectCycle26Sources: (
    p?: Partial<Ports> & { requireCombined?: boolean },
  ) => {
    complete_combined: boolean;
    business_authority: boolean;
    restore_adapter: boolean;
  };
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const review: {
  validateCycle26Matrix: (m: unknown, p?: Partial<Ports>) => unknown;
} = await import(new URL('../scripts/check-cycle26.mjs', import.meta.url).href);
const matrix = () =>
  JSON.parse(
    readFileSync('docs/program/CYCLE26_OWNER_WRITER_MATRIX.json', 'utf8'),
  );
it('verifies original nineteen requirements, eight source families and exact source refs without operational authority', () => {
  expect(review.validateCycle26Matrix(matrix())).toMatchObject({
    requirements: 19,
    families: 8,
    operational_ready: false,
    restore_adapter: false,
  });
});
it.each([
  'implementation_authorized',
  'schema_authorized',
  'restore_adapter_authorized',
  'operational_ready',
])('rejects false authority promotion %s', (k) => {
  const m = matrix();
  m[k] = true;
  expect(() => review.validateCycle26Matrix(m)).toThrow();
});
it('rejects a missing original requirement and altered canonical ownership', () => {
  const m = matrix();
  m.original_requirements.pop();
  expect(() => review.validateCycle26Matrix(m)).toThrow('nineteen');
  const n = matrix();
  n.operational_families[0].source_paths.push('src/App.tsx');
  expect(() => review.validateCycle26Matrix(n)).toThrow('ownership');
});
it('does not let static hashes or local evidence close all-writer or physical acceptance', () => {
  const m = matrix();
  m.writer_inventory.all_writers_participate = true;
  expect(() => review.validateCycle26Matrix(m)).toThrow('coverage');
  const n = matrix();
  n.backup_restore.physical_rehearsal = 'PASS';
  expect(() => review.validateCycle26Matrix(n)).toThrow('physical');
});
it('rejects unrequested source before reading that path', () => {
  const m = matrix();
  m.source_evidence.push({ path: '.staging/private' });
  let touched = false;
  expect(() =>
    review.validateCycle26Matrix(m, {
      git: (c, p) => {
        if (p.includes('.staging')) {
          touched = true;
          throw Error('private');
        }
        return lib.cycle25SourcePorts.git(c, p);
      },
    }),
  ).toThrow('allowlist');
  expect(touched).toBe(false);
});
it('verifies six disjoint real source commits and combined bytes plus their unchanged author tests', () => {
  const paths = lib.cycle26Authors.flatMap((s) => [...s.permitted]);
  expect(new Set(paths).size).toBe(paths.length);
  for (const s of lib.cycle26Authors)
    expect(lib.validateCycle26ForwardSpec(s)).toMatchObject({
      source_commit: s.commit,
    });
  expect(lib.inspectCycle26Sources({ requireCombined: true })).toMatchObject({
    complete_combined: true,
    business_authority: false,
    restore_adapter: false,
  });
});
it('keeps the original baseline distinct from combined Cycle26 implementation', () => {
  const p = {
    read: (path: string) => lib.cycle25SourcePorts.git(lib.cycle26Parent, path),
  };
  expect(lib.inspectCycle26Sources(p).complete_combined).toBe(false);
  expect(() =>
    lib.inspectCycle26Sources({ ...p, requireCombined: true }),
  ).toThrow('absent');
});
it.each(['bad', '0'.repeat(40)])(
  'rejects invalid source commit %s',
  (commit) => {
    expect(() =>
      lib.validateCycle26ForwardSpec({ ...lib.cycle26Authors[0], commit }),
    ).toThrow();
  },
);
it('rejects noncommit, wrong parent, merged parent and extra protected delta', () => {
  const s = lib.cycle26Authors[0],
    p = lib.cycle25SourcePorts;
  for (const change of [
    { type: () => 'tree' },
    { parent: () => 'a'.repeat(40) },
    { parent: () => `${lib.cycle26Parent} ${'a'.repeat(40)}` },
    {
      delta: () =>
        p.delta(s.commit!) + '\nM\tsupabase/migrations/protected.sql',
    },
  ])
    expect(() =>
      lib.validateCycle26ForwardSpec(s, { ...p, ...change }),
    ).toThrow();
});
it('rejects symlink mode and unowned shared-engine substitutions', () => {
  const s = lib.cycle26Authors[0],
    p = lib.cycle25SourcePorts;
  expect(() =>
    lib.validateCycle26ForwardSpec(s, { ...p, mode: () => '120000' }),
  ).toThrow();
  expect(() =>
    lib.validateCycle26ForwardSpec({ ...s, modified: ['src/lib/phase3.ts'] }),
  ).toThrow('owned');
});
it('rejects partial native replacement and changed new author tests', () => {
  const s = lib.cycle26Authors[0],
    path = s.modified[0];
  expect(() =>
    lib.inspectCycle26Sources({
      read: (p) =>
        p === path
          ? lib.cycle25SourcePorts.git(lib.cycle26Parent, p)
          : lib.cycle25SourcePorts.read(p),
    }),
  ).toThrow('Partial');
  expect(() =>
    lib.inspectCycle26Sources({
      read: (p) =>
        p === s.added[1]
          ? Buffer.from('weakened')
          : lib.cycle25SourcePorts.read(p),
    }),
  ).toThrow('author test');
});

it.each(['session', 'mfa', 'fence', 'future_requirements', 'future_sequence'])(
  'rejects unreviewed removal of the %s gate',
  (key) => {
    const m = matrix();
    if (key === 'session') m.authentication.genuine_session = 'VERIFIED';
    if (key === 'mfa') m.authentication.staff_AAL2 = 'NOT_REQUIRED';
    if (key === 'fence') m.backup_restore.independent_fence = 'ACCEPTED';
    if (key === 'future_requirements')
      m.smallest_future_slice.requires_original_requirements = [];
    if (key === 'future_sequence') m.smallest_future_slice.sequence = [];
    expect(() => review.validateCycle26Matrix(m)).toThrow('reviewed matrix');
  },
);
