import { createHash } from 'node:crypto';
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
type File = { path: string; sha256: string };
type Author = {
  module: string;
  commit: string;
  parent: string;
  path: string;
  predecessor: string;
  predecessor_sha256: string;
  sha256: string;
  cases: number;
  added: readonly File[];
  original_companions: readonly File[];
  published: null | { commit: string; sha256: string; blob: string };
};
type Admission = (
  path: string,
  current: Buffer,
  previous: Buffer,
  ports?: Partial<Ports>,
) => Record<string, unknown>;
const s: {
  cycle25Parent: string;
  cycle25SourcePorts: Ports;
  cycle33V1Parent: string;
  cycle33V1Authors: readonly Author[];
  cycle33V1ContinuationParent: string;
  cycle33V1ContinuationAuthors: readonly Author[];
  cycle33V1EssentialAuthors: readonly Author[];
  admitCycle33V1ContinuationSource: Admission;
  admitCycle33V1Source: Admission;
  admitCycle25Source: Admission;
  admitCycle33V1ContinuationPublished: (
    file: File & { blob: string },
    current: Buffer,
    publishedCommit: string,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const c23: {
  validateCycle23Manifest: (
    manifest: unknown,
    ports?: Partial<Ports> & { requireIndependent?: boolean },
  ) => Record<string, unknown>;
} = await import(new URL('../scripts/check-cycle23.mjs', import.meta.url).href);
const c24: { checkCycle24Preservation: () => Record<string, unknown> } =
  await import(new URL('../scripts/check-cycle24.mjs', import.meta.url).href);
const p = s.cycle25SourcePorts,
  authors = s.cycle33V1ContinuationAuthors,
  current = (a: Author) => {
    const original = p.git(a.commit, a.path);
    if (readFileSync(a.path).equals(original)) return original;
    const next = s.cycle33V1EssentialAuthors.find(
      (n) => n.predecessor === a.commit,
    );
    return next ? p.git(next.commit, a.path) : original;
  },
  previous = (a: Author) => p.git(a.parent, a.path),
  hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'),
  admit = (
    a: Author,
    ports?: Partial<Ports>,
    bytes = current(a),
    old = previous(a),
  ) => s.admitCycle33V1ContinuationSource(a.path, bytes, old, ports),
  result = (a: Author) => ({
    module: a.module,
    source_commit: a.commit,
    path: a.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });

it('pins only the three literal reviewed native authors and immutable companion profiles', () => {
  expect(s.cycle33V1ContinuationParent).toBe(
    '6bf1f2be786e6d9c052d87e5f759a4312782be70',
  );
  expect(Object.isFrozen(authors)).toBe(true);
  expect(
    authors.map((a) => [
      a.module,
      a.commit,
      a.path,
      a.predecessor,
      a.predecessor_sha256,
      a.sha256,
      a.cases,
    ]),
  ).toEqual([
    [
      'recorded-cost-selector-custody',
      '5986df744d688d7ab2e72a7824b18e4568d1cb92',
      'src/lib/workflows/recorded-cost-requirements.ts',
      'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
      '72b6a0b2f63e2d961f39f47fd3f903c30690cb5eec6e4196a892b75285ee9c71',
      'a07bd62f868f32743d7c81ad78a53dc76d8aa6c674b8b2e6b99aab43ea7bc1a4',
      22,
    ],
    [
      'published-navigation-currentness',
      '8c6334db676f214bc7abe1a4eeae70e9b547534a',
      'src/lib/workflows/published-service-navigation.ts',
      'b4b35f5323affacbedd433684f2085f8bf8628d2',
      '4ae84361f9ef34a4b64eeb11678bab2ed67f8a9f801fe9ea63d96dcf6c5d999a',
      '6cd3136bade409b4cbb91d42775c71c5c5e4f69110e55029b89711ed118a4083',
      29,
    ],
    [
      'task-read-currentness',
      'bd2e50e8f5dd972c9b2c9a29186e36fcc05dee53',
      'src/lib/workflows/task-correction-review.ts',
      '15fabc063a74b3fce587f5dca8962428dc0b04ac',
      '6ff2d36bfc6bfdeda8b552e2a25f961c23f3e90abbf20690d6618c0f95e087a2',
      '6efa75671e51687d81a28a94ce744670475cc524d64c61e726e7916ee330e564',
      30,
    ],
  ]);
  for (const a of authors) {
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.parent).toBe(s.cycle33V1ContinuationParent);
    expect(a.added).toHaveLength(2);
    expect(a.original_companions).toHaveLength(4);
    for (const files of [a.added, a.original_companions]) {
      expect(Object.isFrozen(files)).toBe(true);
      expect(files.every(Object.isFrozen)).toBe(true);
      expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
    }
    const old = s.cycle33V1Authors.find((old) => old.commit === a.predecessor);
    if (old)
      expect(a.original_companions).toEqual([
        ...old.added,
        ...old.original_companions,
      ]);
  }
});

for (const a of authors) {
  it(`${a.module}: proves actual Git M1/A2 history, every byte binding and build-only result`, () => {
    expect(p.parent(a.commit)).toBe(a.parent);
    expect(p.delta(a.commit)).toBe(
      [`M\t${a.path}`, ...a.added.map((f) => `A\t${f.path}`)].sort().join('\n'),
    );
    expect(hash(p.git(a.predecessor, a.path))).toBe(a.predecessor_sha256);
    expect(previous(a)).toEqual(p.git(a.predecessor, a.path));
    expect(hash(p.git(a.commit, a.path))).toBe(a.sha256);
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

  it(`${a.module}: denies unknown and companion paths as native owners`, () => {
    for (const path of ['src/App.tsx', '../private', a.added[0].path])
      expect(() =>
        s.admitCycle33V1ContinuationSource(path, current(a), previous(a)),
      ).toThrow('No literal reviewed V1 continuation owner');
  });

  it.each(['predecessor', 'parent', 'commit'] as const)(
    `${a.module}: denies noncommit %s evidence`,
    (key) => {
      expect(() =>
        admit(a, { type: (c) => (c === a[key] ? 'blob' : p.type(c)) }),
      ).toThrow(
        'Exact sole-parent regular V1 continuation M1/A2 author required',
      );
    },
  );

  it(`${a.module}: denies wrong and multiple parents instead of accepting ancestry`, () => {
    for (const parent of [a.predecessor, `${a.parent} ${a.predecessor}`])
      expect(() =>
        admit(a, {
          parent: (c) => (c === a.commit ? parent : p.parent(c)),
        }),
      ).toThrow('sole-parent');
  });

  it(`${a.module}: denies extra, missing and non-additive companion deltas`, () => {
    for (const delta of [
      `${p.delta(a.commit)}\nM\tsrc/App.tsx`,
      `M\t${a.path}`,
      p
        .delta(a.commit)
        .replace(`A\t${a.added[0].path}`, `M\t${a.added[0].path}`),
    ])
      expect(() =>
        admit(a, { delta: (c) => (c === a.commit ? delta : p.delta(c)) }),
      ).toThrow('M1/A2');
  });

  it.each(['predecessor', 'parent', 'commit'] as const)(
    `${a.module}: denies nonregular %s native mode`,
    (key) => {
      expect(() =>
        admit(a, {
          mode: (c, path) =>
            c === a[key] && path === a.path ? '120000' : p.mode(c, path),
        }),
      ).toThrow('regular');
    },
  );

  it(`${a.module}: denies nonregular modes for every new and original companion`, () => {
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
    `${a.module}: denies altered raw %s source bytes`,
    (key) => {
      expect(() =>
        admit(a, {
          git: (c, path) =>
            c === a[key] && path === a.path
              ? Buffer.from('unreviewed predecessor')
              : p.git(c, path),
        }),
      ).toThrow('Exact immutable V1 continuation predecessor required');
    },
  );

  it(`${a.module}: denies altered supplied predecessor and current bytes`, () => {
    expect(() =>
      admit(a, undefined, current(a), Buffer.from('different predecessor')),
    ).toThrow('predecessor');
    expect(() => admit(a, undefined, previous(a))).toThrow('Fresh exact');
    expect(() =>
      admit(a, undefined, Buffer.from('unreviewed current')),
    ).toThrow('Fresh exact');
  });

  it(`${a.module}: denies fabricated author raw bytes even when caller and disk agree`, () => {
    const fake = Buffer.from('unreviewed native');
    expect(() =>
      admit(
        a,
        {
          git: (c, path) =>
            c === a.commit && path === a.path ? fake : p.git(c, path),
          read: (path) => (path === a.path ? fake : p.read(path)),
        },
        fake,
      ),
    ).toThrow('Fresh exact reviewed V1 continuation source required');
  });

  it(`${a.module}: denies every altered new or old Git companion`, () => {
    for (const [commit, files] of [
      [a.commit, a.added],
      [a.predecessor, a.original_companions],
    ] as const)
      for (const f of files)
        expect(() =>
          admit(a, {
            git: (c, path) =>
              c === commit && path === f.path
                ? Buffer.from('unreviewed companion')
                : p.git(c, path),
          }),
        ).toThrow('Exact current V1 continuation companion required');
  });

  it(`${a.module}: rereads all six current companions and denies missing or changed bytes`, () => {
    expect(admit(a)).toEqual(result(a));
    for (const f of [...a.added, ...a.original_companions]) {
      expect(() =>
        admit(a, {
          read: (path) =>
            path === f.path ? Buffer.from('drift') : p.read(path),
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

  it(`${a.module}: requires fresh native bytes after prior success and cannot restore a missing file`, () => {
    expect(admit(a)).toEqual(result(a));
    expect(() =>
      admit(a, {
        read: (path) => (path === a.path ? Buffer.from('drift') : p.read(path)),
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

  it(`${a.module}: rechecks native current bytes after all companions`, () => {
    let reads = 0;
    expect(() =>
      admit(a, {
        read: (path) =>
          path === a.path && ++reads === 2
            ? Buffer.from('late native drift')
            : p.read(path),
      }),
    ).toThrow('Final fresh V1 continuation source required');
    expect(reads).toBe(2);
  });
}

for (const a of authors.filter((a) => a.published !== null)) {
  const published = a.published!,
    file = { path: a.path, sha256: published.sha256, blob: published.blob };
  it(`${a.module}: admits only exact original published hash/blob through the current source proof`, () => {
    expect(published).toEqual({
      commit: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
      sha256:
        '72b6a0b2f63e2d961f39f47fd3f903c30690cb5eec6e4196a892b75285ee9c71',
      blob: 'ad8ee0ba15ab0a17f731eb7cde34b30ec4f537dc',
    });
    expect(
      s.admitCycle33V1ContinuationPublished(file, current(a), published.commit),
    ).toEqual(result(a));
    expect(
      s.admitCycle25Source(a.path, current(a), p.git(s.cycle25Parent, a.path)),
    ).toEqual(result(a));
  });

  it.each(['path', 'sha256', 'blob', 'commit'] as const)(
    `${a.module}: rejects changed published %s including new current hash metadata`,
    (key) => {
      const changed = {
        ...file,
        [key]: key === 'sha256' ? a.sha256 : 'unreviewed',
      };
      expect(() =>
        s.admitCycle33V1ContinuationPublished(
          changed,
          current(a),
          key === 'commit' ? a.commit : published.commit,
        ),
      ).toThrow('Exact immutable published V1 continuation metadata required');
    },
  );

  it(`${a.module}: rejects altered raw original published bytes`, () => {
    expect(() =>
      s.admitCycle33V1ContinuationPublished(
        file,
        current(a),
        published.commit,
        {
          git: (c, path) =>
            c === published.commit && path === a.path
              ? Buffer.from('unreviewed original')
              : p.git(c, path),
        },
      ),
    ).toThrow('Exact immutable published V1 continuation bytes/blob required');
  });
}

for (const a of authors.filter((a) => a.published === null)) {
  const old = s.cycle33V1Authors.find((old) => old.commit === a.predecessor)!;
  it(`${a.module}: preserves exact original V1 metadata while separately proving the new author`, () => {
    expect(
      s.admitCycle33V1Source(
        a.path,
        current(a),
        p.git(s.cycle33V1Parent, a.path),
      ),
    ).toEqual(result(old));
    expect(admit(a)).toEqual(result(a));
  });
  it(`${a.module}: the old V1 route rejects unknown current bytes with its original diagnostic`, () => {
    expect(() =>
      s.admitCycle33V1Source(
        a.path,
        Buffer.from('unreviewed successor'),
        p.git(s.cycle33V1Parent, a.path),
      ),
    ).toThrow('Fresh exact reviewed V1 source required');
  });
}

it('the actual C23 and C24 consumers admit the literal Finance successor and retain immutable manifests', () => {
  for (const name of [
    'CYCLE23_SOURCE_MANIFEST.json',
    'CYCLE24_SOURCE_MANIFEST.json',
  ]) {
    const path = `docs/program/${name}`;
    expect(readFileSync(path)).toEqual(
      p.git(s.cycle33V1ContinuationParent, path),
    );
  }
  expect(
    c23.validateCycle23Manifest(
      JSON.parse(
        readFileSync('docs/program/CYCLE23_SOURCE_MANIFEST.json', 'utf8'),
      ),
      { requireIndependent: true },
    ),
  ).toMatchObject({
    packages: 5,
    author_files: 25,
    independent_files: 2,
    protected_files: 128,
    design_locks: 5,
    design_bindings: 13,
    authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
  });
  expect(c24.checkCycle24Preservation()).toMatchObject({
    prior_author_files: 523,
    protected_files: 128,
    locks: 5,
    bindings: 13,
    adapter_authorized: false,
  });
});

it('the C23 consumer preserves the original denial for Finance drift and substituted current-hash metadata', () => {
  const a = authors[0],
    manifest = JSON.parse(
      readFileSync('docs/program/CYCLE23_SOURCE_MANIFEST.json', 'utf8'),
    );
  expect(() =>
    c23.validateCycle23Manifest(manifest, {
      read: (path) => (path === a.path ? Buffer.from('drift') : p.read(path)),
    }),
  ).toThrow(`Exact published Cycle23 bytes/blob required: ${a.path}`);
  const entry = manifest.packages
    .flatMap((pack: { owned_files: File[] }) => pack.owned_files)
    .find((file: File) => file.path === a.path);
  expect(entry.sha256).toBe(a.published!.sha256);
  entry.sha256 = a.sha256;
  expect(() => c23.validateCycle23Manifest(manifest)).toThrow(
    `Exact published Cycle23 bytes/blob required: ${a.path}`,
  );
});
