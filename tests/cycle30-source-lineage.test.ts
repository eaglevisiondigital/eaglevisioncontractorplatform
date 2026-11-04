import { expect, it } from 'vitest';
type Spec = {
  module: string;
  commit: string;
  permitted: string[];
  modified: string[];
  added: string[];
};
type Ports = {
  git: (c: string, p: string) => Buffer;
  read: (p: string) => Buffer;
  parent: (c: string) => string;
  type: (c: string) => string;
  mode: (c: string, p: string) => string;
  delta: (c: string) => string;
};
const lib: {
  cycle30Parent: string;
  cycle30Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle30ForwardSpec: (s: Spec, p?: Ports) => unknown;
  inspectCycle30Sources: (
    p?: Partial<Ports> & { requireCombined?: boolean },
  ) => {
    complete_combined: boolean;
    business_authority: boolean;
    restore_adapter: boolean;
  };
  inspectCycle28Sources: (p?: { requireCombined?: boolean }) => {
    complete_combined: boolean;
  };
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
it('admits exactly three disjoint original-owner corrections and retains complete C28 lineage without business authority', () => {
  const paths = lib.cycle30Authors.flatMap((s) => s.modified);
  expect(new Set(paths).size).toBe(paths.length);
  expect(lib.cycle30Authors).toHaveLength(3);
  for (const s of lib.cycle30Authors)
    expect(lib.validateCycle30ForwardSpec(s)).toMatchObject({
      source_commit: s.commit,
    });
  expect(lib.inspectCycle30Sources({ requireCombined: true })).toMatchObject({
    complete_combined: true,
    business_authority: false,
    restore_adapter: false,
  });
  expect(
    lib.inspectCycle28Sources({ requireCombined: true }).complete_combined,
  ).toBe(true);
});
it('does not claim corrections on the exact unchanged parent', () => {
  const p = {
    read: (s: string) => lib.cycle25SourcePorts.git(lib.cycle30Parent, s),
  };
  expect(lib.inspectCycle30Sources(p).complete_combined).toBe(false);
  expect(() =>
    lib.inspectCycle30Sources({ ...p, requireCombined: true }),
  ).toThrow('absent');
});
it.each(['', '0'.repeat(40), 'a'.repeat(40)])(
  'rejects an unpublished or substituted fixed author %s',
  (commit) => {
    expect(() =>
      lib.validateCycle30ForwardSpec({ ...lib.cycle30Authors[0], commit }),
    ).toThrow();
  },
);
it.each(['a'.repeat(40), lib.cycle30Parent + ' ' + 'a'.repeat(40)])(
  'rejects different or merged parent %s',
  (parent) => {
    expect(() =>
      lib.validateCycle30ForwardSpec(lib.cycle30Authors[0], {
        ...lib.cycle25SourcePorts,
        parent: () => parent,
      }),
    ).toThrow();
  },
);
it.each(['100755', '120000', '160000'])(
  'rejects executable, symlink and submodule source %s',
  (mode) => {
    expect(() =>
      lib.validateCycle30ForwardSpec(lib.cycle30Authors[0], {
        ...lib.cycle25SourcePorts,
        mode: () => mode,
      }),
    ).toThrow('Regular');
  },
);
it('rejects any extra protected delta', () => {
  expect(() =>
    lib.validateCycle30ForwardSpec(lib.cycle30Authors[0], {
      ...lib.cycle25SourcePorts,
      delta: (c) => lib.cycle25SourcePorts.delta(c) + '\nM\tREADME.md',
    }),
  ).toThrow('delta');
});
it('cannot widen a fixed author ownership inventory', () => {
  expect(() =>
    lib.validateCycle30ForwardSpec({
      ...lib.cycle30Authors[0],
      modified: ['README.md'],
    }),
  ).toThrow('ownership');
});
it('rechecks current native bytes after warming immutable Git evidence', () => {
  lib.inspectCycle30Sources({ requireCombined: true });
  const path = lib.cycle30Authors[0].modified[0];
  expect(() =>
    lib.inspectCycle30Sources({
      read: (p) =>
        p === path
          ? Buffer.concat([
              lib.cycle25SourcePorts.read(p),
              Buffer.from('\n// changed'),
            ])
          : lib.cycle25SourcePorts.read(p),
    }),
  ).toThrow('fixed');
});
it('requires the exact reviewed author test and document', () => {
  const path = lib.cycle30Authors[0].added[0];
  expect(() =>
    lib.inspectCycle30Sources({
      read: (p) =>
        p === path ? Buffer.from('unreviewed') : lib.cycle25SourcePorts.read(p),
    }),
  ).toThrow('test/document');
});
it('never treats an arbitrary module as a native author or an offline coverage test as runtime restoration', () => {
  expect(() =>
    lib.validateCycle30ForwardSpec({
      ...lib.cycle30Authors[0],
      module: 'offline-restore',
    }),
  ).toThrow();
  expect(
    lib.cycle30Authors.some((s) =>
      s.modified.some((p) => p.includes('offline')),
    ),
  ).toBe(false);
});
