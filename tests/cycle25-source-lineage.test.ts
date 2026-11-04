import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
type Spec = {
  module: string;
  owner: string;
  branch: string;
  commit: string | null;
  cases: number | null;
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
  cycle25Parent: string;
  cycle25Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  validateCycle25ForwardSpec: (s: Spec, p: Ports) => unknown;
  admitCycle25Source: (
    p: string,
    current: Buffer,
    original: Buffer,
    ports?: Partial<Ports>,
  ) => unknown;
  inspectCycle25Sources: (
    p?: Partial<Ports> & { requireCombined?: boolean },
  ) => {
    complete_combined: boolean;
    business_authority: boolean;
    restore_adapter: boolean;
    packages: unknown[];
  };
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
function fixture() {
  const spec: Spec = {
    ...lib.cycle25Authors[0],
    commit: '1'.repeat(40),
    modified: [lib.cycle25Authors[0].permitted[0]],
    added: [
      'tests/cycle25-field-task-continuity.test.ts',
      'docs/program/CYCLE25_FIELD_TASK_CONTINUITY.md',
    ],
  };
  const ports: Ports = {
    ...lib.cycle25SourcePorts,
    parent: () => lib.cycle25Parent,
    type: () => 'commit',
    mode: () => '100644',
    delta: () =>
      [
        ...spec.modified.map((p) => `M\t${p}`),
        ...spec.added.map((p) => `A\t${p}`),
      ]
        .sort()
        .join('\n'),
  };
  return { spec, ports };
}
it('accepts the bounded regular-file source protocol without granting business authority', () => {
  const { spec, ports } = fixture();
  expect(lib.validateCycle25ForwardSpec(spec, ports)).toMatchObject({
    module: spec.module,
    source_commit: spec.commit,
  });
});
it.each(['', '0'.repeat(40), 'x'.repeat(40)])(
  'rejects unrecorded or invalid source commit %j',
  (commit) => {
    const { spec, ports } = fixture();
    expect(() =>
      lib.validateCycle25ForwardSpec({ ...spec, commit }, ports),
    ).toThrow();
  },
);
it('rejects a same-content Git tree instead of a source commit', () => {
  const { spec, ports } = fixture();
  expect(() =>
    lib.validateCycle25ForwardSpec(spec, { ...ports, type: () => 'tree' }),
  ).toThrow('commit');
});
it.each(['2'.repeat(40), `${lib.cycle25Parent} ${'2'.repeat(40)}`])(
  'rejects wrong or merged source parent %s',
  (parent) => {
    const { spec, ports } = fixture();
    expect(() =>
      lib.validateCycle25ForwardSpec(spec, { ...ports, parent: () => parent }),
    ).toThrow('parent');
  },
);
it('rejects an extra protected migration change even with the expected owned paths', () => {
  const { spec, ports } = fixture();
  expect(() =>
    lib.validateCycle25ForwardSpec(spec, {
      ...ports,
      delta: () => ports.delta('') + '\nM\tsupabase/migrations/protected.sql',
    }),
  ).toThrow('delta');
});
it.each(['100755', '120000', '160000'])(
  'rejects executable, symbolic or submodule mode %s',
  (mode) => {
    const { spec, ports } = fixture();
    expect(() =>
      lib.validateCycle25ForwardSpec(spec, { ...ports, mode: () => mode }),
    ).toThrow('Regular');
  },
);
it('rejects shared engine ownership disguised as a native component extension', () => {
  const { spec, ports } = fixture();
  expect(() =>
    lib.validateCycle25ForwardSpec(
      { ...spec, modified: ['src/lib/phase3.ts'] },
      ports,
    ),
  ).toThrow('owned');
});
it('rejects duplicate ownership within a source commit', () => {
  const { spec, ports } = fixture();
  expect(() =>
    lib.validateCycle25ForwardSpec(
      { ...spec, modified: [...spec.modified, ...spec.modified] },
      ports,
    ),
  ).toThrow('owned');
});
it('rejects an empty source package without promoting its documents to implementation', () => {
  const { spec, ports } = fixture();
  expect(() =>
    lib.validateCycle25ForwardSpec({ ...spec, modified: [] }, ports),
  ).toThrow('owned');
});
it('rejects an added private or extra test path', () => {
  const { spec, ports } = fixture();
  expect(() =>
    lib.validateCycle25ForwardSpec(
      { ...spec, added: [...spec.added, '.staging/private.json'] },
      ports,
    ),
  ).toThrow('exact new');
});
it('denies an unrequested private path before any source or Git read', () => {
  let touched = false;
  const trap = () => {
    touched = true;
    throw Error('Private read attempted');
  };
  expect(() =>
    lib.admitCycle25Source(
      '/private/unrequested',
      Buffer.from('x'),
      Buffer.from('y'),
      {
        read: trap,
        git: trap,
        parent: trap,
        type: trap,
        mode: trap,
        delta: trap,
      },
    ),
  ).toThrow('Unreviewed');
  expect(touched).toBe(false);
});
it('does not confuse an unchanged historical baseline with a complete new combined implementation', () => {
  const ports = {
    ...lib.cycle25SourcePorts,
    read: (p: string) => lib.cycle25SourcePorts.git(lib.cycle25Parent, p),
  };
  expect(lib.inspectCycle25Sources(ports)).toMatchObject({
    complete_combined: false,
    business_authority: false,
    restore_adapter: false,
  });
  expect(() =>
    lib.inspectCycle25Sources({ ...ports, requireCombined: true }),
  ).toThrow();
});
it('keeps all six source owners disjoint from protected files, shared engines and locked artwork', () => {
  const p = JSON.parse(
    readFileSync('docs/program/CYCLE4_PROTECTED_SOURCE.json', 'utf8'),
  ) as { files: { path: string }[] };
  const d = JSON.parse(
    readFileSync('docs/program/DESIGN_SYSTEM_CONTRACT.json', 'utf8'),
  ) as { locks: { path: string }[] };
  const protectedPaths = new Set([...p.files, ...d.locks].map((r) => r.path));
  const paths = lib.cycle25Authors.flatMap((s) => [...s.permitted]);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.some((s) => protectedPaths.has(s))).toBe(false);
  expect(paths).not.toContain('src/lib/workflows/saved-revision-exercise.ts');
  expect(paths).not.toContain('src/App.tsx');
});
it('verifies each real committed source parent, complete delta and regular modes', () => {
  for (const spec of lib.cycle25Authors)
    expect(
      lib.validateCycle25ForwardSpec(spec, lib.cycle25SourcePorts),
    ).toMatchObject({ source_commit: spec.commit });
});
it('requires all six actual native successors for combined acceptance', () => {
  expect(Object.isFrozen(lib.cycle25Authors)).toBe(true);
  for (const spec of lib.cycle25Authors) {
    expect(Object.isFrozen(spec)).toBe(true);
    const fix = (spec as Spec & { nativeCorrection?: object }).nativeCorrection;
    if (fix) expect(Object.isFrozen(fix)).toBe(true);
  }
  expect(lib.inspectCycle25Sources({ requireCombined: true })).toMatchObject({
    complete_combined: true,
    business_authority: false,
    restore_adapter: false,
  });
});
it('rejects arbitrary current bytes even when the real source commit is known', () => {
  const spec = lib.cycle25Authors[0],
    path = spec.modified[0],
    original = lib.cycle25SourcePorts.git(lib.cycle25Parent, path);
  expect(() =>
    lib.admitCycle25Source(path, Buffer.from('unreviewed'), original),
  ).toThrow();
});
it('rejects a changed original manifest reference against the actual current source', () => {
  const spec = lib.cycle25Authors[0],
    path = spec.modified[0];
  expect(() =>
    lib.admitCycle25Source(
      path,
      lib.cycle25SourcePorts.read(path),
      Buffer.from('changed baseline'),
    ),
  ).toThrow();
});
it('rejects partial native replacement using actual source bytes', () => {
  const path = lib.cycle25Authors[0].modified[0];
  expect(() =>
    lib.inspectCycle25Sources({
      read: (p) =>
        p === path
          ? lib.cycle25SourcePorts.git(lib.cycle25Parent, p)
          : lib.cycle25SourcePorts.read(p),
    }),
  ).toThrow('Partial package');
});
it('rejects an unreviewed new test even when native current bytes match', () => {
  const path = lib.cycle25Authors[0].added.find((p) => p.startsWith('tests/'))!;
  expect(() =>
    lib.inspectCycle25Sources({
      read: (p) =>
        p === path
          ? Buffer.from('weakened assertions')
          : lib.cycle25SourcePorts.read(p),
    }),
  ).toThrow('Exact new author test');
});
it('rejects an incorrect parent for the exact new-test-only corrective forward', () => {
  const spec = lib.cycle25Authors.find(
    (x) => x.module === 'service-evidence-continuity',
  )!;
  expect(() =>
    lib.validateCycle25ForwardSpec(spec, {
      ...lib.cycle25SourcePorts,
      parent: (c) =>
        c === spec.commit ? lib.cycle25Parent : lib.cycle25Parent,
    }),
  ).toThrow('new-test-only');
});
it('rejects an unrequested file in the real accessibility correction', () => {
  const spec = lib.cycle25Authors.find(
    (x) => x.module === 'native-cost-reconciliation',
  )!;
  expect(() =>
    lib.validateCycle25ForwardSpec(spec, {
      ...lib.cycle25SourcePorts,
      delta: (c) =>
        c === spec.commit
          ? lib.cycle25SourcePorts.delta(c)
          : 'M\tsrc/lib/phase3.ts',
    }),
  ).toThrow('accessibility correction');
});
