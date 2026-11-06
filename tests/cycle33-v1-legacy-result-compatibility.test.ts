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
  cycle25Parent: string;
  cycle25SourcePorts: Ports;
  cycle33V1EssentialAuthors: readonly {
    path: string;
    predecessor: string;
    commit: string;
  }[];
  cycle33V1ContinuationAuthors: readonly {
    path: string;
    predecessor: string;
    commit: string;
  }[];
  cycle33V1Authors: readonly {
    module: string;
    path: string;
    commit: string;
    predecessor: string;
    added: readonly { path: string }[];
  }[];
  admitCycle25Source: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle33V1Source: (
    path: string,
    current: Buffer,
    previous: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const p = s.cycle25SourcePorts;
function originalResult(
  value: Record<string, unknown>,
  commit: string,
): Record<string, unknown> {
  if (value.source_commit === commit) return value;
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const found = find(item as Record<string, unknown>, commit);
      if (found) return found;
    }
  }
  throw Error('Exact original legacy result missing');
}
function find(
  value: Record<string, unknown>,
  commit: string,
): Record<string, unknown> | undefined {
  if (value.source_commit === commit) return value;
  for (const item of Object.values(value))
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const found = find(item as Record<string, unknown>, commit);
      if (found) return found;
    }
}
for (const [module, expected] of [
  [
    'recorded-time-kind-review',
    {
      module: 'cost-selection-current-authority',
      source_commit: '98e4c39f3135b0b8177e2cc50980c1814fdcb2ff',
      path: 'src/lib/workflows/cost-coverage-path.ts',
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    },
  ],
  [
    'maintenance-review-reference-custody',
    {
      source_commit: '1538060250fc34654414dac6b29621bf44fabd98',
      module: 'maintenance-proposal-input',
      owner: '/root/cycle30_field_growth',
    },
  ],
  [
    'task-display-reference-custody',
    {
      source_commit: '452d57049e60c5228718fc7647346faab7ac4409',
      native_correction: null,
      module: 'task-input-binding',
      owner: '/root/cycle30_field_growth',
      path: 'src/lib/workflows/task-correction-review.ts',
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    },
  ],
] as const) {
  it(`${module}: validates the reviewed V1 successor without changing the original legacy result shape`, () => {
    const a = s.cycle33V1Authors.find((a) => a.module === module)!,
      original = p.git(a.commit, a.path),
      next = s.cycle33V1ContinuationAuthors.find(
        (n) => n.predecessor === a.commit,
      ),
      current = (() => {
        const actual = readFileSync(a.path),
          first = next ? p.git(next.commit, a.path) : original;
        if (actual.equals(original)) return original;
        if (actual.equals(first)) return first;
        const last = s.cycle33V1EssentialAuthors.find(
          (n) => n.predecessor === (next?.commit ?? a.commit),
        );
        return last ? p.git(last.commit, a.path) : first;
      })(),
      baseline = p.git(s.cycle25Parent, a.path),
      result = s.admitCycle25Source(a.path, current, baseline);
    expect(originalResult(result, expected.source_commit)).toEqual(expected);
    expect(
      s.admitCycle33V1Source(a.path, current, p.git(a.predecessor, a.path)),
    ).toEqual({
      module,
      source_commit: a.commit,
      path: a.path,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    });
    expect(() =>
      s.admitCycle25Source(a.path, current, baseline, {
        read: (path) =>
          path === a.added[0].path
            ? Buffer.from('unreviewed current companion')
            : p.read(path),
      }),
    ).toThrow();
  });
}
