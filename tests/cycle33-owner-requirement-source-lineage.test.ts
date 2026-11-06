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
const source: {
  cycle25Parent: string;
  cycle25SourcePorts: Ports;
  cycle29Authors: readonly {
    module: string;
    commit: string;
    added: readonly string[];
  }[];
  cycle33OwnerRequirementAuthor: {
    commit: string;
    parent: string;
    predecessor: string;
    path: string;
    predecessor_sha256: string;
    sha256: string;
    added: readonly { path: string; sha256: string }[];
  };
  admitCycle33OwnerRequirementSource: (
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
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const p = source.cycle25SourcePorts,
  fixed = source.cycle33OwnerRequirementAuthor,
  old = source.cycle29Authors.find((s) => s.module === 'owner-currentness')!,
  current = () => p.git(fixed.commit, fixed.path),
  previous = () => p.git(fixed.predecessor, fixed.path),
  baseline = () => p.git(source.cycle25Parent, fixed.path),
  admit = (ports?: Partial<Ports>, bytes = current(), before = previous()) =>
    source.admitCycle33OwnerRequirementSource(fixed.path, bytes, before, ports);

it('pins only the reviewed sole-parent owner M1/A2 author and immutable C29 predecessor', () => {
  expect(fixed).toEqual({
    commit: '14734003b472c2633bf8e87526c6a4260696d914',
    parent: '2b8406d10b96ffa7f06a8ef5ae1835538b313d30',
    predecessor: '1a226d540578810b14fdbbbc170de206745c418c',
    path: 'src/lib/workflows/owner-action-verification.ts',
    predecessor_sha256:
      '3457d010c8e965afb2915271d0a83f2e0988172567aa3d92d3be44aaabf0cf77',
    sha256: '2f68502ebb1c6cb7944941a92b64b0d26e3c4916bfc7342ecdb4167ad861f5ad',
    added: [
      {
        path: 'tests/cycle33-owner-requirement-input-continuity.test.ts',
        sha256:
          'b5df7ce10d24328e34055b310909034e4fb9a8bc941ab033ef06397057e22531',
      },
      {
        path: 'docs/program/CYCLE33_OWNER_REQUIREMENT_INPUT_CONTINUITY.md',
        sha256:
          'dfbb6be6a0f5ecc1a828c29d214640c800868b1fbdb3c2275d253e315c2c5ab4',
      },
    ],
  });
  expect(Object.isFrozen(fixed)).toBe(true);
  expect(Object.isFrozen(fixed.added)).toBe(true);
  expect(fixed.added.every(Object.isFrozen)).toBe(true);
  expect(p.parent(fixed.commit)).toBe(fixed.parent);
  expect(p.git(fixed.parent, fixed.path)).toEqual(previous());
});
it('admits the exact fresh native bundle as build-only source evidence', () => {
  expect(admit()).toEqual({
    module: 'owner-requirement-input-continuity',
    source_commit: fixed.commit,
    path: fixed.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
  for (const path of [fixed.path, ...fixed.added.map((f) => f.path)])
    expect(readFileSync(path)).toEqual(p.git(fixed.commit, path));
});
it('preserves the complete original C25 through C29 chain before the finite successor', () => {
  const result = source.admitCycle25Source(fixed.path, current(), baseline());
  expect(result).toMatchObject({
    source_commit: '1faaad5baa4ffa1f077e39bd59e4f9c4760a7291',
    path: fixed.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  });
  expect(JSON.stringify(result)).toContain(fixed.predecessor);
  expect(JSON.stringify(result)).toContain(fixed.commit);
  expect(JSON.stringify(result)).toContain('owner_requirement_forward');
});
it('retains historical C29 endpoint admission without promoting it to the new correction', () => {
  const result = source.admitCycle25Source(fixed.path, previous(), baseline());
  expect(JSON.stringify(result)).toContain(fixed.predecessor);
  expect(JSON.stringify(result)).not.toContain(fixed.commit);
  expect(() => admit(undefined, previous())).toThrow('Fresh exact');
});
it.each(['src/App.tsx', '../private', ...fixed.added.map((f) => f.path)])(
  'rejects unrelated source path %s',
  (path) => {
    expect(() =>
      source.admitCycle33OwnerRequirementSource(path, current(), previous()),
    ).toThrow('source path');
  },
);
it.each(['type', 'parent', 'delta'] as const)(
  'rejects changed reviewed author %s evidence',
  (key) => {
    const original = p[key];
    expect(() =>
      admit({
        [key]: (commit: string) =>
          commit === fixed.commit ? 'unreviewed' : original(commit),
      }),
    ).toThrow('single-parent');
  },
);
it('rejects an additional parent or an extra modified path in the author', () => {
  expect(() =>
    admit({
      parent: (commit) =>
        commit === fixed.commit
          ? `${fixed.parent} ${fixed.predecessor}`
          : p.parent(commit),
    }),
  ).toThrow('single-parent');
  expect(() =>
    admit({
      delta: (commit) =>
        commit === fixed.commit
          ? `${p.delta(commit)}\nM\tsrc/App.tsx`
          : p.delta(commit),
    }),
  ).toThrow('single-parent');
});
it.each([fixed.predecessor, fixed.parent, fixed.commit])(
  'rejects nonregular native mode at %s',
  (object) => {
    expect(() =>
      admit({
        mode: (commit, path) =>
          commit === object && path === fixed.path
            ? '120000'
            : p.mode(commit, path),
      }),
    ).toThrow(
      object === fixed.predecessor
        ? 'Regular non-executable Cycle29 source required'
        : 'Exact single-parent regular M1/A2 owner author required',
    );
  },
);
it.each(fixed.added)('rejects executable author companion $path', (file) => {
  expect(() =>
    admit({
      mode: (commit, path) =>
        commit === fixed.commit && path === file.path
          ? '100755'
          : p.mode(commit, path),
    }),
  ).toThrow('regular');
});
it.each(['type', 'parent', 'delta'] as const)(
  'still rejects altered original C29 %s evidence',
  (key) => {
    const original = p[key];
    expect(() =>
      admit({
        [key]: (commit: string) =>
          commit === fixed.predecessor ? 'unreviewed' : original(commit),
      }),
    ).toThrow('Cycle29');
  },
);
it.each([fixed.predecessor, fixed.parent])(
  'rejects altered raw predecessor bytes at %s',
  (object) => {
    expect(() =>
      admit({
        git: (commit, path) =>
          commit === object && path === fixed.path
            ? Buffer.from('unreviewed')
            : p.git(commit, path),
      }),
    ).toThrow('predecessor');
  },
);
it('rejects changed supplied predecessor and changed native current bytes', () => {
  expect(() => admit(undefined, current(), Buffer.from('unreviewed'))).toThrow(
    'predecessor',
  );
  expect(() => admit(undefined, Buffer.from('unreviewed'))).toThrow(
    'Fresh exact',
  );
});
it('rejects forged raw author bytes even if supplied and actual current agree', () => {
  const forged = Buffer.from('unreviewed');
  expect(() =>
    admit(
      {
        git: (commit, path) =>
          commit === fixed.commit && path === fixed.path
            ? forged
            : p.git(commit, path),
        read: (path) => (path === fixed.path ? forged : p.read(path)),
      },
      forged,
    ),
  ).toThrow('Fresh exact');
});
it.each([fixed.path, ...fixed.added.map((f) => f.path), ...old.added])(
  'rereads current native or companion %s after a previous success',
  (changed) => {
    let drift = false;
    const read = (path: string) =>
      path === changed && drift ? Buffer.from('unreviewed') : p.read(path);
    expect(admit({ read })).toHaveProperty('source_commit', fixed.commit);
    drift = true;
    expect(() => admit({ read })).toThrow();
  },
);
it.each(fixed.added)('rejects forged raw author companion $path', (file) => {
  const forged = Buffer.from('unreviewed');
  expect(() =>
    admit({
      git: (commit, path) =>
        commit === fixed.commit && path === file.path
          ? forged
          : p.git(commit, path),
      read: (path) => (path === file.path ? forged : p.read(path)),
    }),
  ).toThrow('companion');
});
it('never restores missing actual native or companion files from Git evidence', () => {
  for (const missing of [
    fixed.path,
    ...fixed.added.map((f) => f.path),
    ...old.added,
  ])
    expect(() =>
      admit({
        read: (path) => {
          if (path === missing)
            throw Object.assign(Error('missing current file'), {
              code: 'ENOENT',
            });
          return p.read(path);
        },
      }),
    ).toThrow('missing');
});
it('preserves the original legacy mismatch diagnostic when the finite successor is denied', () => {
  expect(() =>
    source.admitCycle25Source(
      fixed.path,
      Buffer.from('unreviewed'),
      baseline(),
    ),
  ).toThrow('Current source differs from fixed Cycle27 lineage');
  expect(() =>
    source.admitCycle25Source(fixed.path, current(), baseline(), {
      read: (path) =>
        path === old.added[0] ? Buffer.from('unreviewed') : p.read(path),
    }),
  ).toThrow('Current source differs from fixed Cycle27 lineage');
});
