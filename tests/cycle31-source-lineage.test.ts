import { describe, expect, it } from 'vitest';
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
  cycle31Parent: string;
  cycle31Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle31ForwardSpec: (s: Spec, p?: Ports) => unknown;
  inspectCycle31Sources: (
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
it('admits exactly two fixed original-owner corrections and retains complete C28 lineage without business authority', () => {
  const paths = lib.cycle31Authors.flatMap((s) => s.modified);
  expect(new Set(paths).size).toBe(paths.length);
  expect(lib.cycle31Authors).toHaveLength(2);
  for (const s of lib.cycle31Authors)
    expect(lib.validateCycle31ForwardSpec(s)).toMatchObject({
      source_commit: s.commit,
    });
  expect(lib.inspectCycle31Sources({ requireCombined: true })).toMatchObject({
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
    read: (s: string) => lib.cycle25SourcePorts.git(lib.cycle31Parent, s),
  };
  expect(lib.inspectCycle31Sources(p).complete_combined).toBe(false);
  expect(() =>
    lib.inspectCycle31Sources({ ...p, requireCombined: true }),
  ).toThrow('absent');
});
describe.each(lib.cycle31Authors)('$module exact author boundary', (spec) => {
  it.each(['', '0'.repeat(40), 'a'.repeat(40)])(
    'rejects an unpublished or substituted fixed author %s',
    (commit) => {
      expect(() =>
        lib.validateCycle31ForwardSpec({ ...spec, commit }),
      ).toThrow();
    },
  );
  it.each(['a'.repeat(40), lib.cycle31Parent + ' ' + 'a'.repeat(40)])(
    'rejects different or merged parent %s',
    (parent) => {
      expect(() =>
        lib.validateCycle31ForwardSpec(spec, {
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
        lib.validateCycle31ForwardSpec(spec, {
          ...lib.cycle25SourcePorts,
          mode: () => mode,
        }),
      ).toThrow('Regular');
    },
  );
  it('rejects any extra protected delta', () => {
    expect(() =>
      lib.validateCycle31ForwardSpec(spec, {
        ...lib.cycle25SourcePorts,
        delta: (c) => lib.cycle25SourcePorts.delta(c) + '\nM\tREADME.md',
      }),
    ).toThrow('delta');
  });
  it('cannot widen a fixed author ownership inventory', () => {
    expect(() =>
      lib.validateCycle31ForwardSpec({
        ...spec,
        modified: ['README.md'],
      }),
    ).toThrow('ownership');
  });
  it('rechecks current native bytes after warming immutable Git evidence', () => {
    lib.inspectCycle31Sources({ requireCombined: true });
    const path = spec.modified[0];
    expect(() =>
      lib.inspectCycle31Sources({
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
    const path = spec.added[0];
    expect(() =>
      lib.inspectCycle31Sources({
        read: (p) =>
          p === path
            ? Buffer.from('unreviewed')
            : spec.modified.includes(p)
              ? lib.cycle25SourcePorts.git(spec.commit, p)
              : lib.cycle25SourcePorts.read(p),
      }),
    ).toThrow('test/document');
  });
  it('never treats an arbitrary module as a native author or an offline coverage test as runtime restoration', () => {
    expect(() =>
      lib.validateCycle31ForwardSpec({
        ...spec,
        module: 'offline-restore',
      }),
    ).toThrow();
    expect(
      lib.cycle31Authors.some((s) =>
        s.modified.some((p) => p.includes('offline')),
      ),
    ).toBe(false);
  });
});
