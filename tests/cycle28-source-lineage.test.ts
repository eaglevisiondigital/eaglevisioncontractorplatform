import { expect, it } from 'vitest';
type Spec = {
  module: string;
  commit: string | null;
  permitted: readonly string[];
  modified: readonly string[];
  added: readonly string[];
};
type Ports = {
  git: (c: string, p: string) => Buffer;
  parent: (c: string) => string;
  type: (c: string) => string;
  mode: (c: string, p: string) => string;
  delta: (c: string) => string;
  read: (p: string) => Buffer;
};
const lib: {
  cycle28Parent: string;
  cycle28Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle28ForwardSpec: (s: Spec, p?: Ports) => unknown;
  inspectCycle28Sources: (
    p?: Partial<Ports> & { requireCombined?: boolean },
  ) => {
    complete_combined: boolean;
    business_authority: boolean;
    restore_adapter: boolean;
  };
  admitCycle25Source: (
    p: string,
    c: Buffer,
    b: Buffer,
    ports?: Partial<Ports>,
  ) => unknown;
  cycle25Parent: string;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
it('verifies every sole-parent disjoint author and exact combined native bytes without business authority', () => {
  const paths = lib.cycle28Authors.flatMap((s) => [...s.permitted]);
  expect(new Set(paths).size).toBe(paths.length);
  for (const s of lib.cycle28Authors)
    expect(lib.validateCycle28ForwardSpec(s)).toMatchObject({
      source_commit: s.commit,
    });
  expect(lib.inspectCycle28Sources({ requireCombined: true })).toMatchObject({
    complete_combined: true,
    business_authority: false,
    restore_adapter: false,
  });
});
it('keeps 5f74 original bytes distinct from implemented successors', () => {
  const p = {
    read: (s: string) => lib.cycle25SourcePorts.git(lib.cycle28Parent, s),
  };
  expect(lib.inspectCycle28Sources(p).complete_combined).toBe(false);
  expect(() =>
    lib.inspectCycle28Sources({ ...p, requireCombined: true }),
  ).toThrow('absent');
});
it.each(['', '0'.repeat(40), 'x'.repeat(40)])(
  'rejects unpublished or invalid source pin %s',
  (commit) => {
    expect(() =>
      lib.validateCycle28ForwardSpec({ ...lib.cycle28Authors[0], commit }),
    ).toThrow();
  },
);
it.each(['tree', 'blob'])('rejects %s as source commit', (type) => {
  expect(() =>
    lib.validateCycle28ForwardSpec(lib.cycle28Authors[0], {
      ...lib.cycle25SourcePorts,
      type: () => type,
    }),
  ).toThrow();
});
it.each(['a'.repeat(40), lib.cycle28Parent + ' ' + 'a'.repeat(40)])(
  'rejects changed or merged parent %s',
  (parent) => {
    expect(() =>
      lib.validateCycle28ForwardSpec(lib.cycle28Authors[0], {
        ...lib.cycle25SourcePorts,
        parent: () => parent,
      }),
    ).toThrow('parent');
  },
);
it.each(['100755', '120000', '160000'])(
  'rejects executable, symlink or submodule source mode %s',
  (mode) => {
    expect(() =>
      lib.validateCycle28ForwardSpec(lib.cycle28Authors[0], {
        ...lib.cycle25SourcePorts,
        mode: () => mode,
      }),
    ).toThrow('Regular');
  },
);
it('rejects an extra protected delta, shared engine, extra private path and duplicated ownership', () => {
  const s = lib.cycle28Authors[0],
    p = lib.cycle25SourcePorts;
  expect(() =>
    lib.validateCycle28ForwardSpec(s, {
      ...p,
      delta: (c) => p.delta(c) + '\nM\tsupabase/migrations/protected.sql',
    }),
  ).toThrow('delta');
  for (const modified of [
    [],
    ['src/lib/phase3.ts'],
    [...s.modified, ...s.modified],
  ])
    expect(() => lib.validateCycle28ForwardSpec({ ...s, modified })).toThrow(
      'owned',
    );
  expect(() =>
    lib.validateCycle28ForwardSpec({
      ...s,
      added: [...s.added, '.staging/private'],
    }),
  ).toThrow('exact');
});
it('rejects partial native installation and a changed author regression test', () => {
  const s = lib.cycle28Authors[0],
    p = lib.cycle25SourcePorts;
  expect(() =>
    lib.inspectCycle28Sources({
      read: (path) =>
        path === s.modified[0] ? p.git(lib.cycle28Parent, path) : p.read(path),
    }),
  ).toThrow('Partial');
  expect(() =>
    lib.inspectCycle28Sources({
      read: (path) =>
        path === s.added[1] ? Buffer.from('removed assertions') : p.read(path),
    }),
  ).toThrow('author test');
});
