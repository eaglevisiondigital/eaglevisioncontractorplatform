import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

type Ports = {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  type: (commit: string) => string;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  mode: (commit: string, path: string) => string;
};
type File = { path: string; sha256: string };
type Author = {
  module: string;
  commit: string;
  parent: string;
  predecessor: string;
  predecessor_sha256: string;
  path: string;
  sha256: string;
  cases: number;
  added: readonly File[];
  original_companions: readonly File[];
};
type Admission = (
  path: string,
  current: Buffer,
  previous: Buffer,
  ports?: Partial<Ports>,
) => Record<string, unknown>;
const s: {
  cycle25SourcePorts: Ports;
  cycle33V1EssentialParent: string;
  cycle33V1EssentialAuthors: readonly Author[];
  cycle33V1Authors: readonly Author[];
  cycle33V1ContinuationAuthors: readonly Author[];
  admitCycle33V1EssentialSource: Admission;
  admitCycle33V1ContinuationSource: Admission;
  admitCycle33V1Source: Admission;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const p = s.cycle25SourcePorts,
  authors = s.cycle33V1EssentialAuthors,
  hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'),
  current = (a: Author) => p.git(a.commit, a.path),
  previous = (a: Author) => p.git(a.parent, a.path),
  admit = (
    a: Author,
    ports?: Partial<Ports>,
    now = current(a),
    old = previous(a),
  ) => s.admitCycle33V1EssentialSource(a.path, now, old, ports),
  result = (a: Author) => ({
    module: a.module,
    source_commit: a.commit,
    path: a.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });

it('pins two literal second-stage authors while keeping every earlier profile and companion frozen', () => {
  expect(s.cycle33V1EssentialParent).toBe(
    '038b64acad56e436a016905dfec87aef86dcfbc8',
  );
  expect(Object.isFrozen(authors)).toBe(true);
  expect(
    authors.map((a) => [
      a.module,
      a.commit,
      a.predecessor,
      a.path,
      a.predecessor_sha256,
      a.sha256,
      a.cases,
    ]),
  ).toEqual([
    [
      'task-selection-custody',
      '37953b233c96306d7c48d7dbc8592a037482c0c5',
      'bd2e50e8f5dd972c9b2c9a29186e36fcc05dee53',
      'src/lib/workflows/task-correction-review.ts',
      '6efa75671e51687d81a28a94ce744670475cc524d64c61e726e7916ee330e564',
      'bd7b40ffe4b077ec6e8a57f100de4620c8f12dfdc79464a67c002a60a38439cc',
      30,
    ],
    [
      'addon-navigation-currentness',
      '1d8202fb3825950b458a2a4ed330406f0a207665',
      '99e112a7cf669dfde03fdd69dbdbce2e74ef2fd4',
      'src/lib/workflows/addon-readiness-guide.ts',
      'f6c2be0f5a14722190c4103e606ce9b2ef168b2630147f96baf5cb4fee76036a',
      '3a784566054c6b746fadf1d0b212bd763e638a64a21ec6d5d75cdf39d56784d9',
      28,
    ],
  ]);
  for (const a of authors) {
    const old = [...s.cycle33V1Authors, ...s.cycle33V1ContinuationAuthors].find(
      (old) => old.commit === a.predecessor,
    )!;
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.parent).toBe(s.cycle33V1EssentialParent);
    expect(Object.isFrozen(a.added)).toBe(true);
    expect(Object.isFrozen(a.original_companions)).toBe(true);
    expect(a.added.every(Object.isFrozen)).toBe(true);
    expect(a.original_companions.every(Object.isFrozen)).toBe(true);
    expect(a.added).toHaveLength(2);
    expect(a.original_companions).toEqual([
      ...old.added,
      ...old.original_companions,
    ]);
    expect(a.original_companions).toHaveLength(
      a.module === 'task-selection-custody' ? 6 : 4,
    );
  }
});

for (const a of authors) {
  it(`${a.module}: proves actual current Git bytes, exact author delta and all old and new companions`, () => {
    expect(p.parent(a.commit)).toBe(a.parent);
    expect(p.delta(a.commit)).toBe(
      [`M\t${a.path}`, ...a.added.map((f) => `A\t${f.path}`)].sort().join('\n'),
    );
    expect(hash(p.git(a.predecessor, a.path))).toBe(a.predecessor_sha256);
    expect(previous(a)).toEqual(p.git(a.predecessor, a.path));
    expect(hash(current(a))).toBe(a.sha256);
    expect(p.read(a.path)).toEqual(current(a));
    for (const [commit, files] of [
      [a.commit, a.added],
      [a.predecessor, a.original_companions],
    ] as const)
      for (const f of files) {
        expect(p.mode(commit, f.path)).toBe('100644');
        expect(hash(p.git(commit, f.path))).toBe(f.sha256);
        expect(p.read(f.path)).toEqual(p.git(commit, f.path));
      }
    expect(admit(a)).toEqual(result(a));
  });

  it(`${a.module}: denies unrelated paths and companion files as native owners`, () => {
    for (const path of ['src/App.tsx', '../private', a.added[0].path])
      expect(() =>
        s.admitCycle33V1EssentialSource(path, current(a), previous(a)),
      ).toThrow('No literal reviewed V1 essential owner');
  });

  it.each(['predecessor', 'parent', 'commit'] as const)(
    `${a.module}: denies noncommit %s history`,
    (key) => {
      expect(() =>
        admit(a, { type: (c) => (c === a[key] ? 'blob' : p.type(c)) }),
      ).toThrow('Exact sole-parent regular V1 essential M1/A2 author required');
    },
  );

  it.each(['predecessor', 'parent', 'commit'] as const)(
    `${a.module}: denies nonregular %s native modes`,
    (key) => {
      expect(() =>
        admit(a, {
          mode: (c, path) =>
            c === a[key] && path === a.path ? '120000' : p.mode(c, path),
        }),
      ).toThrow('regular');
    },
  );

  it(`${a.module}: rejects wrong and multiple parents without ancestry admission`, () => {
    for (const parent of [a.predecessor, `${a.parent} ${a.predecessor}`])
      expect(() =>
        admit(a, {
          parent: (c) => (c === a.commit ? parent : p.parent(c)),
        }),
      ).toThrow('sole-parent');
  });

  it(`${a.module}: rejects extra, missing and wrongly modified companion deltas`, () => {
    for (const delta of [
      `${p.delta(a.commit)}\nM\tsrc/App.tsx`,
      `M\t${a.path}`,
      p.delta(a.commit).replace('A\t', 'M\t'),
    ])
      expect(() =>
        admit(a, { delta: (c) => (c === a.commit ? delta : p.delta(c)) }),
      ).toThrow('M1/A2');
  });

  it(`${a.module}: validates regular modes for every new and inherited companion`, () => {
    for (const [commit, files] of [
      [a.commit, a.added],
      [a.predecessor, a.original_companions],
    ] as const)
      for (const f of files)
        expect(() =>
          admit(a, {
            mode: (c, path) =>
              c === commit && path === f.path ? '100755' : p.mode(c, path),
          }),
        ).toThrow('regular');
  });

  it.each(['predecessor', 'parent'] as const)(
    `${a.module}: rejects altered raw %s native bytes`,
    (key) => {
      expect(() =>
        admit(a, {
          git: (c, path) =>
            c === a[key] && path === a.path
              ? Buffer.from('different predecessor')
              : p.git(c, path),
        }),
      ).toThrow('Exact immutable V1 essential predecessor required');
    },
  );

  it(`${a.module}: rejects supplied predecessor changes and unreviewed current bytes`, () => {
    expect(() => admit(a, {}, current(a), Buffer.from('foreign'))).toThrow(
      'predecessor',
    );
    for (const wrong of [previous(a), Buffer.from('unknown current')])
      expect(() => admit(a, {}, wrong)).toThrow('Fresh exact');
  });

  it(`${a.module}: rejects fabricated reviewed bytes even if caller and disk agree`, () => {
    const fabricated = Buffer.from('unreviewed native source');
    expect(() =>
      admit(
        a,
        {
          git: (c, path) =>
            c === a.commit && path === a.path ? fabricated : p.git(c, path),
          read: (path) => (path === a.path ? fabricated : p.read(path)),
        },
        fabricated,
      ),
    ).toThrow('Fresh exact reviewed V1 essential source required');
  });

  it(`${a.module}: denies changed raw bytes of every old and new companion`, () => {
    for (const [commit, files] of [
      [a.commit, a.added],
      [a.predecessor, a.original_companions],
    ] as const)
      for (const f of files)
        expect(() =>
          admit(a, {
            git: (c, path) =>
              c === commit && path === f.path
                ? Buffer.from('foreign companion')
                : p.git(c, path),
          }),
        ).toThrow('Exact current V1 essential companion required');
  });

  it(`${a.module}: rereads every actual old and new companion and never restores an absent file`, () => {
    for (const f of [...a.added, ...a.original_companions]) {
      expect(() =>
        admit(a, {
          read: (path) =>
            path === f.path ? Buffer.from('current drift') : p.read(path),
        }),
      ).toThrow('companion');
      expect(() =>
        admit(a, {
          read: (path) => {
            if (path === f.path) throw Error('missing current companion');
            return p.read(path);
          },
        }),
      ).toThrow('missing current companion');
    }
  });

  it(`${a.module}: requires live native bytes after previous success and denies missing source`, () => {
    expect(admit(a)).toEqual(result(a));
    expect(() =>
      admit(a, {
        read: (path) =>
          path === a.path ? Buffer.from('current drift') : p.read(path),
      }),
    ).toThrow('Fresh exact');
    expect(() =>
      admit(a, {
        read: (path) => {
          if (path === a.path) throw Error('missing current native');
          return p.read(path);
        },
      }),
    ).toThrow('missing current native');
  });

  it(`${a.module}: verifies native bytes again after all companion reads`, () => {
    let reads = 0;
    expect(() =>
      admit(a, {
        read: (path) =>
          path === a.path && ++reads === 2
            ? Buffer.from('late native drift')
            : p.read(path),
      }),
    ).toThrow('Final fresh V1 essential source required');
    expect(reads).toBe(2);
  });

  const stage1 = s.cycle33V1ContinuationAuthors.find(
      (old) => old.commit === a.predecessor,
    ),
    original = s.cycle33V1Authors.find(
      (old) => old.commit === (stage1?.predecessor ?? a.predecessor),
    )!;
  it(`${a.module}: preserves original V1 and first-stage metadata while admitting actual current source`, () => {
    expect(p.read(a.path)).toEqual(current(a));
    expect(
      s.admitCycle33V1Source(
        a.path,
        current(a),
        p.git(original.predecessor, a.path),
      ),
    ).toEqual(result(original));
    if (stage1)
      expect(
        s.admitCycle33V1ContinuationSource(
          a.path,
          current(a),
          p.git(stage1.predecessor, a.path),
        ),
      ).toEqual(result(stage1));
    expect(admit(a)).toEqual(result(a));
  });

  it(`${a.module}: retains original V1 unknown-source denial through the complete literal chain`, () => {
    expect(() =>
      s.admitCycle33V1Source(
        a.path,
        Buffer.from('unreviewed later source'),
        p.git(original.predecessor, a.path),
      ),
    ).toThrow('Fresh exact reviewed V1 source required');
    if (stage1)
      expect(() =>
        s.admitCycle33V1ContinuationSource(
          a.path,
          Buffer.from('unreviewed later source'),
          p.git(stage1.predecessor, a.path),
        ),
      ).toThrow('Fresh exact reviewed V1 continuation source required');
  });
}
