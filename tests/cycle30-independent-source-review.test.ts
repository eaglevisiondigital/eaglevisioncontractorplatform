import { expect, it } from 'vitest';

type Spec = { module: string; commit: string; modified: string[] };
type Ports = {
  git: (commit: string, path: string) => Buffer;
  parent: (commit: string) => string;
};
const lib: {
  cycle25Parent: string;
  cycle30Parent: string;
  cycle30Authors: readonly Spec[];
  cycle25SourcePorts: Ports;
  admitCycle25Source: (
    path: string,
    current: Buffer,
    original: Buffer,
    supplied?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const owner = lib.cycle30Authors.find((s) => s.module === 'owner-render')!;
const ownerPath = 'src/components/workflows/RecordedOwnerActions.tsx';
const bytes = (commit: string, path: string) =>
  lib.cycle25SourcePorts.git(commit, path);
const ownerBaseline = () => bytes(lib.cycle30Parent, ownerPath);
const ownerCurrent = () => bytes(owner.commit, ownerPath);
function sourceCommits(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, field]) =>
    key === 'source_commit' && typeof field === 'string'
      ? [field]
      : sourceCommits(field),
  );
}

it('direct original RecordedOwnerActions admission retains source-only metadata and its exact author', () => {
  expect(owner.modified).toEqual([ownerPath]);
  expect(
    lib.admitCycle25Source(ownerPath, ownerCurrent(), ownerBaseline()),
  ).toMatchObject({
    source_commit: owner.commit,
    module: 'owner-render',
    path: ownerPath,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  });
});
it('direct owner admission rejects substituted predecessor bytes', () => {
  expect(() =>
    lib.admitCycle25Source(
      ownerPath,
      ownerCurrent(),
      Buffer.concat([
        ownerBaseline(),
        Buffer.from('\n// substituted baseline'),
      ]),
    ),
  ).toThrow('parent source');
});
it('unchanged owner baseline cannot be labelled as the reviewed correction', () => {
  expect(() =>
    lib.admitCycle25Source(ownerPath, ownerBaseline(), ownerBaseline()),
  ).toThrow('fixed Cycle30');
});
it('direct owner admission rejects changed current bytes after warming immutable evidence', () => {
  lib.admitCycle25Source(ownerPath, ownerCurrent(), ownerBaseline());
  expect(() =>
    lib.admitCycle25Source(
      ownerPath,
      Buffer.concat([ownerCurrent(), Buffer.from('\n// unreviewed current')]),
      ownerBaseline(),
    ),
  ).toThrow('fixed Cycle30');
});
it('the direct route still checks the exact single author parent', () => {
  expect(() =>
    lib.admitCycle25Source(ownerPath, ownerCurrent(), ownerBaseline(), {
      parent: () => `${lib.cycle30Parent} ${'a'.repeat(40)}`,
    }),
  ).toThrow('single-parent');
});
it('the direct owner route grants no unknown or protected source ownership', () => {
  expect(() =>
    lib.admitCycle25Source(
      'README.md',
      Buffer.from('changed'),
      Buffer.from('old'),
    ),
  ).toThrow('Unreviewed source replacement');
});

const nested = lib.cycle30Authors.filter((s) =>
  ['customer-source', 'maintenance-date'].includes(s.module),
);
it.each(nested)(
  '$module admission preserves original lineage and reaches the single exact new endpoint',
  (spec) => {
    const path = spec.modified[0];
    const result = lib.admitCycle25Source(
      path,
      bytes(spec.commit, path),
      bytes(lib.cycle25Parent, path),
    );
    expect(result).toMatchObject({
      path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    });
    const commits = sourceCommits(result);
    expect(commits.length).toBeGreaterThan(1);
    expect(commits.filter((commit) => commit === spec.commit)).toHaveLength(1);
  },
);
it.each(nested)(
  '$module admission cannot widen a reviewed route to unknown current bytes',
  (spec) => {
    const path = spec.modified[0];
    expect(() =>
      lib.admitCycle25Source(
        path,
        Buffer.concat([bytes(spec.commit, path), Buffer.from('\n// unknown')]),
        bytes(lib.cycle25Parent, path),
      ),
    ).toThrow('fixed Cycle30');
  },
);
