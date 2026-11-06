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
};
type Admission = (
  path: string,
  current: Buffer,
  previous: Buffer,
  ports?: Partial<Ports>,
) => Record<string, unknown>;
type Validator = (
  manifest: unknown,
  ports?: Partial<Ports> & { requireIndependent?: boolean },
) => Record<string, unknown>;
const s: {
  cycle25Parent: string;
  cycle25SourcePorts: Ports;
  cycle33V1Parent: string;
  cycle33V1Authors: readonly Author[];
  cycle33OwnerRequirementAuthor: { commit: string; predecessor: string };
  cycle33V1CoordinatedParent: string;
  cycle33V1CoordinatedAuthors: readonly Author[];
  admitCycle33V1CoordinatedSource: Admission;
  admitCycle33V1Source: Admission;
  admitCycle33OwnerRequirementSource: Admission;
  admitCycle25Source: Admission;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const c16: {
  validateCycle16Manifest: (
    manifest: unknown,
    read?: Ports['read'],
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/check-cycle16-integrity.mjs', import.meta.url).href
);
const c21: { validateCycle21Manifest: Validator } = await import(
  new URL('../scripts/check-cycle21.mjs', import.meta.url).href
);
const c22: { validateCycle22Manifest: Validator } = await import(
  new URL('../scripts/check-cycle22.mjs', import.meta.url).href
);
const c23: { validateCycle23Manifest: Validator } = await import(
  new URL('../scripts/check-cycle23.mjs', import.meta.url).href
);
const c24: { validateCycle24Manifest: Validator } = await import(
  new URL('../scripts/check-cycle24.mjs', import.meta.url).href
);
const p = s.cycle25SourcePorts,
  authors = s.cycle33V1CoordinatedAuthors,
  sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'),
  current = (a: Author) => p.git(a.commit, a.path),
  previous = (a: Author) => p.git(a.predecessor, a.path),
  admit = (
    a: Author,
    ports?: Partial<Ports>,
    bytes = current(a),
    old = previous(a),
  ) => s.admitCycle33V1CoordinatedSource(a.path, bytes, old, ports),
  result = (a: Author) => ({
    module: a.module,
    source_commit: a.commit,
    path: a.path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
function legacy(a: Author, ports?: Partial<Ports>, bytes = current(a)) {
  return a.module === 'maintenance-occurrence-custody'
    ? s.admitCycle33V1Source(
        a.path,
        bytes,
        p.git(s.cycle33V1Parent, a.path),
        ports,
      )
    : s.admitCycle33OwnerRequirementSource(
        a.path,
        bytes,
        p.git(s.cycle33OwnerRequirementAuthor.predecessor, a.path),
        ports,
      );
}
function findResult(
  value: Record<string, unknown>,
  commit: string,
): Record<string, unknown> | undefined {
  if (value.source_commit === commit) return value;
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const found = findResult(item as Record<string, unknown>, commit);
      if (found) return found;
    }
  }
}
function manifest(cycle: number) {
  return JSON.parse(
    readFileSync(
      `docs/program/CYCLE${cycle}_${cycle === 16 ? 'DELIVERY_INDEX' : 'SOURCE_MANIFEST'}.json`,
      'utf8',
    ),
  );
}

it('pins only the two literal sole67 coordinated M1/A2 authors and six immutable companions each', () => {
  expect(s.cycle33V1CoordinatedParent).toBe(
    '67cf66072e3aeeb4bbe645cda7385257bb3f9978',
  );
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
      'maintenance-occurrence-custody',
      '1779eec05926670ff09f2699022144e8b30ee6a7',
      '2edb76df29c36328f39a19277b287c8e9b16a940',
      'src/lib/workflows/plan-cancellation-review.ts',
      '9efab5226a57c15084fe726c6cc4576830dafe42db17993ceade53553f8e705d',
      '66d732bddd87b9802e124c21905e4c760df9ca67511a1ab7b74714ed0149a479',
      28,
    ],
    [
      'owner-refresh-access-continuity',
      '0ec0f1ace80c5e651833ba7e0c988339a4cbd453',
      '14734003b472c2633bf8e87526c6a4260696d914',
      'src/lib/workflows/owner-action-verification.ts',
      '2f68502ebb1c6cb7944941a92b64b0d26e3c4916bfc7342ecdb4167ad861f5ad',
      'e96a107487e8597af32dbefb60870770a3d197114836877890201e0a3cb3425c',
      25,
    ],
  ]);
  expect(Object.isFrozen(authors)).toBe(true);
  for (const a of authors) {
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.parent).toBe(s.cycle33V1CoordinatedParent);
    expect(a.added).toHaveLength(2);
    expect(a.original_companions).toHaveLength(4);
    for (const files of [a.added, a.original_companions]) {
      expect(Object.isFrozen(files)).toBe(true);
      expect(files.every(Object.isFrozen)).toBe(true);
      expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
    }
    expect([...a.added, ...a.original_companions].map((f) => f.path)).toEqual(
      a.module === 'maintenance-occurrence-custody'
        ? [
            'docs/program/CYCLE33_MAINTENANCE_OCCURRENCE_CUSTODY.md',
            'tests/cycle33-maintenance-occurrence-custody.test.ts',
            'docs/program/CYCLE33_MAINTENANCE_REVIEW_REFERENCE_CUSTODY.md',
            'tests/cycle33-maintenance-review-reference-custody.test.ts',
            'tests/cycle31-maintenance-proposal-input.test.ts',
            'docs/program/CYCLE31_MAINTENANCE_PROPOSAL_INPUT.md',
          ]
        : [
            'docs/program/CYCLE33_OWNER_REFRESH_ACCESS_CONTINUITY.md',
            'tests/cycle33-owner-refresh-access-continuity.test.ts',
            'tests/cycle33-owner-requirement-input-continuity.test.ts',
            'docs/program/CYCLE33_OWNER_REQUIREMENT_INPUT_CONTINUITY.md',
            'docs/program/CYCLE29_OWNER_CURRENTNESS.md',
            'tests/cycle29-owner-currentness.test.ts',
          ],
    );
  }
});

for (const a of authors) {
  it(`${a.module}: verifies actual bounded Git history, current bytes and build-only metadata`, () => {
    expect(p.parent(a.commit)).toBe(a.parent);
    expect(p.delta(a.commit)).toBe(
      [`M\t${a.path}`, ...a.added.map((f) => `A\t${f.path}`)].sort().join('\n'),
    );
    expect(p.git(a.parent, a.path)).toEqual(previous(a));
    expect(sha(previous(a))).toBe(a.predecessor_sha256);
    expect(sha(current(a))).toBe(a.sha256);
    expect(p.read(a.path)).toEqual(current(a));
    for (const [commit, files] of [
      [a.commit, a.added],
      [a.predecessor, a.original_companions],
    ] as const)
      for (const f of files) {
        expect(p.mode(commit, f.path)).toBe('100644');
        expect(sha(p.git(commit, f.path))).toBe(f.sha256);
        expect(p.read(f.path)).toEqual(p.git(commit, f.path));
      }
    expect(admit(a)).toEqual(result(a));
  });

  it(`${a.module}: rejects unrelated, private and companion paths as native owners`, () => {
    for (const path of ['src/App.tsx', '../private', a.added[0].path])
      expect(() =>
        s.admitCycle33V1CoordinatedSource(path, current(a), previous(a)),
      ).toThrow('No literal reviewed V1 coordinated owner');
  });

  it.each(['predecessor', 'parent', 'commit'] as const)(
    `${a.module}: rejects noncommit %s evidence`,
    (key) => {
      expect(() =>
        admit(a, { type: (c) => (c === a[key] ? 'blob' : p.type(c)) }),
      ).toThrow(
        'Exact sole-parent regular V1 coordinated M1/A2 author required',
      );
    },
  );

  it(`${a.module}: rejects incorrect and multiple parents instead of relying on ancestry`, () => {
    for (const parent of [a.predecessor, `${a.parent} ${a.predecessor}`])
      expect(() =>
        admit(a, { parent: (c) => (c === a.commit ? parent : p.parent(c)) }),
      ).toThrow('sole-parent');
  });

  it(`${a.module}: rejects additional, missing and modified-not-added companion deltas`, () => {
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
    `${a.module}: rejects nonregular %s native source modes`,
    (key) => {
      expect(() =>
        admit(a, {
          mode: (c, path) =>
            c === a[key] && path === a.path ? '120000' : p.mode(c, path),
        }),
      ).toThrow('regular');
    },
  );

  it(`${a.module}: rejects nonregular modes for every old and new companion`, () => {
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
    `${a.module}: rejects altered raw %s native evidence`,
    (key) => {
      expect(() =>
        admit(a, {
          git: (c, path) =>
            c === a[key] && path === a.path
              ? Buffer.from('unreviewed original')
              : p.git(c, path),
        }),
      ).toThrow('Exact immutable V1 coordinated predecessor required');
    },
  );

  it(`${a.module}: rejects substituted caller predecessor bytes`, () => {
    expect(() =>
      admit(a, undefined, current(a), Buffer.from('unreviewed predecessor')),
    ).toThrow('predecessor');
  });

  it(`${a.module}: rejects unknown or historical current source bytes`, () => {
    expect(() => admit(a, undefined, Buffer.from('unknown current'))).toThrow(
      'Fresh exact',
    );
    expect(() => admit(a, undefined, previous(a))).toThrow('Fresh exact');
  });

  it(`${a.module}: immutable author hashes reject forged raw Git even when supplied and disk bytes agree`, () => {
    const fake = Buffer.from('unreviewed source');
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
    ).toThrow('Fresh exact reviewed V1 coordinated source required');
  });

  it(`${a.module}: rejects every changed raw Git companion instead of trusting current files`, () => {
    for (const [commit, files] of [
      [a.commit, a.added],
      [a.predecessor, a.original_companions],
    ] as const)
      for (const f of files)
        expect(() =>
          admit(a, {
            git: (c, path) =>
              c === commit && path === f.path
                ? Buffer.from('changed original companion')
                : p.git(c, path),
          }),
        ).toThrow('Exact current V1 coordinated companion required');
  });

  it(`${a.module}: requires all six current companions without restoration or cached admission`, () => {
    expect(admit(a)).toEqual(result(a));
    for (const f of [...a.added, ...a.original_companions]) {
      expect(() =>
        admit(a, {
          read: (path) =>
            path === f.path
              ? Buffer.from('changed current companion')
              : p.read(path),
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

  it(`${a.module}: rechecks current native bytes after success and refuses a missing file`, () => {
    expect(admit(a)).toEqual(result(a));
    expect(() =>
      admit(a, {
        read: (path) =>
          path === a.path
            ? Buffer.from('changed current native')
            : p.read(path),
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

  it(`${a.module}: final native reread after companions rejects late source drift`, () => {
    let reads = 0;
    expect(() =>
      admit(a, {
        read: (path) =>
          path === a.path && ++reads === 2
            ? Buffer.from('late native drift')
            : p.read(path),
      }),
    ).toThrow('Final fresh V1 coordinated source required');
    expect(reads).toBe(2);
  });

  it(`${a.module}: legacy admission preserves exact original metadata and does not claim the new author`, () => {
    const direct = legacy(a),
      expected =
        a.module === 'maintenance-occurrence-custody'
          ? {
              module: 'maintenance-review-reference-custody',
              source_commit: a.predecessor,
              path: a.path,
              authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
              business_authority: false,
              restore_adapter: false,
            }
          : {
              module: 'owner-requirement-input-continuity',
              source_commit: a.predecessor,
              path: a.path,
              authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
              business_authority: false,
              restore_adapter: false,
            },
      outer = s.admitCycle25Source(
        a.path,
        current(a),
        p.git(s.cycle25Parent, a.path),
      );
    expect(direct).toEqual(expected);
    if (a.module === 'maintenance-occurrence-custody')
      expect(
        findResult(outer, '1538060250fc34654414dac6b29621bf44fabd98'),
      ).toEqual({
        source_commit: '1538060250fc34654414dac6b29621bf44fabd98',
        module: 'maintenance-proposal-input',
        owner: '/root/cycle30_field_growth',
      });
    else expect(findResult(outer, a.predecessor)).toEqual(expected);
    expect(JSON.stringify(outer)).not.toContain(a.commit);
    expect(admit(a)).toEqual(result(a));
  });

  it(`${a.module}: original legacy diagnostics still reject arbitrary unreviewed bytes`, () => {
    expect(() =>
      legacy(a, undefined, Buffer.from('unreviewed successor')),
    ).toThrow(
      a.module === 'maintenance-occurrence-custody'
        ? 'Fresh exact reviewed V1 source required'
        : 'Fresh exact reviewed owner requirement source required',
    );
  });

  it(`${a.module}: legacy routes also validate every new companion`, () => {
    for (const f of a.added)
      expect(() =>
        legacy(a, {
          read: (path) =>
            path === f.path
              ? Buffer.from('unreviewed companion')
              : p.read(path),
        }),
      ).toThrow();
  });

  it(`${a.module}: legacy final freshness guard rejects changes after its original companion reads`, () => {
    let reads = 0;
    expect(() =>
      legacy(a, {
        read: (path) =>
          path === a.path && ++reads === 4
            ? Buffer.from('legacy tail drift')
            : p.read(path),
      }),
    ).toThrow(
      a.module === 'maintenance-occurrence-custody'
        ? 'Final fresh reviewed V1 source required'
        : 'Final fresh owner requirement source required',
    );
    expect(reads).toBe(4);
  });
}

it('actual C16 consumer retains its immutable scope and metadata without claiming newer native authors', () => {
  expect(c16.validateCycle16Manifest(manifest(16), p.read)).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
    retained_author_files: 313,
  });
});
for (const [cycle, validator, retained] of [
  [21, c21.validateCycle21Manifest, 448],
  [22, c22.validateCycle22Manifest, 473],
  [23, c23.validateCycle23Manifest, 498],
] as const)
  it(`actual C${cycle} consumer retains original manifests, exact legacy results and protected scope`, () => {
    expect(
      validator(manifest(cycle), { ...p, requireIndependent: true }),
    ).toMatchObject({
      packages: 5,
      author_files: 25,
      independent_files: 2,
      retained_author_files: retained,
      protected_files: 128,
      design_locks: 5,
      design_bindings: 13,
      authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
    });
  });

it('actual C24 consumer admits the exact Growth successor through the original canonical source route', () => {
  expect(c24.validateCycle24Manifest(manifest(24), p)).toMatchObject({
    packages: 6,
    retained_author_files: 523,
    protected_files: 128,
    operational_ready: false,
    restore_adapter: false,
  });
});

it('actual C24 consumer rejects unknown Growth bytes through its original published-source denial', () => {
  const a = authors[0];
  expect(() =>
    c24.validateCycle24Manifest(manifest(24), {
      ...p,
      read: (path) =>
        path === a.path ? Buffer.from('unreviewed source') : p.read(path),
    }),
  ).toThrow(
    'Current source differs from fixed Cycle27 lineage: Current source differs from fixed Cycle31 author',
  );
});

it('actual C24 consumer rejects a missing new Growth companion rather than reconstructing it from Git', () => {
  const a = authors[0],
    f = a.added[0];
  expect(() =>
    c24.validateCycle24Manifest(manifest(24), {
      ...p,
      read: (path) => {
        if (path === f.path) throw Error('missing new Growth companion');
        return p.read(path);
      },
    }),
  ).toThrow(
    'Current source differs from fixed Cycle27 lineage: Current source differs from fixed Cycle31 author',
  );
});

it('actual C24 consumer refuses replacing immutable original hash metadata with the new Growth hash', () => {
  const a = authors[0],
    changed = manifest(24),
    file = changed.packages
      .flatMap((pack: { owned_files: File[] }) => pack.owned_files)
      .find((file: File) => file.path === a.path);
  expect(file).toBeDefined();
  expect(file.sha256).not.toBe(a.sha256);
  file.sha256 = a.sha256;
  expect(() => c24.validateCycle24Manifest(changed, p)).toThrow(
    `Exact published bytes required: ${a.path}`,
  );
});

it('all historical consumer manifests and original protected metadata remain byte-exact to sole67', () => {
  for (const cycle of [16, 21, 22, 23, 24]) {
    const path = `docs/program/CYCLE${cycle}_${cycle === 16 ? 'DELIVERY_INDEX' : 'SOURCE_MANIFEST'}.json`;
    expect(p.read(path)).toEqual(p.git(s.cycle33V1CoordinatedParent, path));
  }
  for (const path of [
    'docs/program/CYCLE4_PROTECTED_SOURCE.json',
    'docs/program/DESIGN_SYSTEM_CONTRACT.json',
    'docs/FEATURE_ACCEPTANCE_EVIDENCE.json',
  ])
    expect(p.read(path)).toEqual(p.git(s.cycle33V1CoordinatedParent, path));
});
