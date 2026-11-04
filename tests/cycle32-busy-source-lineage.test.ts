import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

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
  parent: (commit: string) => string;
  type: (commit: string) => string;
  mode: (commit: string, path: string) => string;
  delta: (commit: string) => string;
};
const source: {
  cycle32BusyParent: string;
  cycle32BusySource: Spec;
  cycle25SourcePorts: Ports;
  validateCycle32BusySpec: (spec: Spec, ports?: Ports) => unknown;
  admitCycle32BusyForward: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle25Source: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  inspectCycle32BusySources: (
    ports?: Partial<Ports> & { requirePresent?: boolean },
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const ports = source.cycle25SourcePorts,
  spec = source.cycle32BusySource,
  path = spec.modified[0],
  previous = () => ports.git(source.cycle32BusyParent, path),
  current = () => ports.read(path),
  admit = (override: Partial<Ports> = {}) =>
    source.admitCycle32BusyForward(path, current(), previous(), override);

it('pins one separately reviewed five-file sole-parent bundle without replacing the original C30 author', () => {
  expect(source.cycle32BusyParent).toBe(
    '7b377aeffac11855a5dfdfaa86719078e70a5260',
  );
  expect(spec.commit).toBe('ec63030de8c0faceebd1ec9a645e9ea0dcf76383');
  expect(spec.modified).toEqual([
    'src/components/workflows/RecordedOwnerActions.tsx',
  ]);
  expect(spec.added).toHaveLength(4);
  expect(source.validateCycle32BusySpec(spec)).toMatchObject({
    source_commit: spec.commit,
  });
  expect(ports.parent(spec.commit)).toBe(source.cycle32BusyParent);
  expect(previous()).toEqual(
    ports.git('9f85556e28875a53976b55567f3a14e942ba3995', path),
  );
});
it('the original C30 lineage remains the outer identity and only the exact nested correction is admitted', () => {
  const actual = source.admitCycle25Source(
    path,
    current(),
    ports.git('b0faaa447e8e18cd78a00e5cfbfd6dc67eff3fd9', path),
  );
  expect(actual).toMatchObject({
    source_commit: '9f85556e28875a53976b55567f3a14e942ba3995',
    cycle32_busy_forward: {
      source_commit: spec.commit,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    },
  });
  expect(
    source.inspectCycle32BusySources({ requirePresent: true }),
  ).toMatchObject({
    present: true,
    business_authority: false,
    restore_adapter: false,
  });
});
it('the unchanged exact baseline is optional evidence, never a completed correction', () => {
  const read = (p: string) => (p === path ? previous() : ports.read(p));
  expect(source.inspectCycle32BusySources({ read })).toMatchObject({
    present: false,
    business_authority: false,
  });
  expect(() =>
    source.inspectCycle32BusySources({ read, requirePresent: true }),
  ).toThrow('absent');
});
it('another runtime path cannot borrow this source bundle', () => {
  expect(() =>
    source.admitCycle32BusyForward(
      'src/lib/workflows/recorded-owner-actions.ts',
      current(),
      previous(),
    ),
  ).toThrow('baseline');
});
it('another previous source cannot borrow the fixed author', () => {
  expect(() =>
    source.admitCycle32BusyForward(
      path,
      current(),
      Buffer.from('unreviewed prior source'),
    ),
  ).toThrow('baseline');
});
it('one changed current byte cannot borrow a prior successful admission', () => {
  admit();
  expect(() =>
    source.admitCycle32BusyForward(
      path,
      Buffer.concat([current(), Buffer.from('\n')]),
      previous(),
    ),
  ).toThrow('differs');
});
it('a different parent is rejected rather than accepting arbitrary ancestry', () => {
  expect(() =>
    admit({ parent: () => '43e622b16aa952f5dc2fe7ae9f96260b47682c2e' }),
  ).toThrow('single-parent');
});
it('a merge parent list is rejected', () => {
  expect(() =>
    admit({
      parent: () => source.cycle32BusyParent + ' ' + source.cycle32BusyParent,
    }),
  ).toThrow('single-parent');
});
it('a non-commit object is rejected', () => {
  expect(() => admit({ type: () => 'blob' })).toThrow('single-parent');
});
it('an extra native writer in the author delta is rejected', () => {
  expect(() =>
    admit({
      delta: (c) =>
        ports.delta(c) + '\nM\tsrc/lib/workflows/recorded-owner-actions.ts',
    }),
  ).toThrow('bounded');
});
it.each([...spec.modified, ...spec.added])(
  'nonregular mode is rejected for %s',
  (target) => {
    expect(() =>
      admit({ mode: (c, p) => (p === target ? '120000' : ports.mode(c, p)) }),
    ).toThrow('Regular');
  },
);
it.each(spec.added)('current companion drift is rejected for %s', (target) => {
  expect(() =>
    admit({
      read: (p) =>
        p === target ? Buffer.from('changed companion') : ports.read(p),
    }),
  ).toThrow('companion');
});
it('a missing companion denies admission even when runtime bytes match', () => {
  expect(() =>
    admit({
      read: (p) => {
        if (p === spec.added[0]) throw Error('Missing exact companion');
        return ports.read(p);
      },
    }),
  ).toThrow('Missing');
});
it('a caller cannot supply a replacement fixed spec', () => {
  expect(() =>
    source.validateCycle32BusySpec({
      ...spec,
      commit: source.cycle32BusyParent,
    }),
  ).toThrow('single-parent');
});
it('the original C30 bytes are independently bound to the post-CI baseline', () => {
  expect(() =>
    admit({
      git: (c, p) =>
        c === '9f85556e28875a53976b55567f3a14e942ba3995' && p === path
          ? Buffer.from('different original')
          : ports.git(c, p),
    }),
  ).toThrow('baseline');
});
it('current companion reads are repeated after immutable Git data has warmed', () => {
  let changed = false;
  const read = (p: string) =>
    changed && p === spec.added[1]
      ? Buffer.from('later change')
      : ports.read(p);
  admit({ read });
  changed = true;
  expect(() => admit({ read })).toThrow('companion');
});
it('all original native action, custody, source and navigation engines remain byte-identical to the failing source', () => {
  for (const p of [
    'src/lib/workflows/recorded-owner-actions.ts',
    'src/lib/workflows/recorded-priority-navigation.ts',
    'src/lib/workflows/priority-actions.ts',
    'src/lib/workflows/saved-revision-runtime.ts',
    'src/lib/workflows/daily-workbench-runtime.ts',
  ]) {
    const expected = ports.git(source.cycle32BusyParent, p);
    expect(createHash('sha256').update(ports.read(p)).digest('hex')).toBe(
      createHash('sha256').update(expected).digest('hex'),
    );
  }
});
