import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
type Ports = {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  parent: (commit: string) => string;
  type: (commit: string) => string;
  mode: (commit: string, path: string) => string;
  delta: (commit: string) => string;
};
type Spec = {
  module: string;
  commit: string;
  parent: string;
  path: string;
  published: string;
  published_parent: string;
  published_sha256: string;
  published_blob: string;
  requires_blob: boolean;
  sha256: string;
  added: readonly { path: string; sha256: string }[];
  original_companions: readonly { path: string; sha256: string }[];
};
type Meta = { path: string; sha256: string; blob?: string };
const s: {
  cycle25SourcePorts: Ports;
  cycle33V1IntegrationAuthors: readonly Spec[];
  admitCycle33V1IntegrationPublished: (
    f: Meta,
    b: Buffer,
    p?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle33ExecutionPublished: (
    f: Meta,
    b: Buffer,
    p?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const c10: {
  validateCycle10Manifest: (m: unknown, r?: Ports['read']) => unknown;
} = await import(
  new URL('../scripts/check-cycle10-integrity.mjs', import.meta.url).href
);
const p = s.cycle25SourcePorts;
const variants = s.cycle33V1IntegrationAuthors;
const owned = new Map(
  variants.flatMap((a) => [
    [a.path, p.git(a.commit, a.path)] as const,
    ...a.added.map((f) => [f.path, p.git(a.commit, f.path)] as const),
  ]),
);
function read(path: string) {
  return Buffer.from(owned.get(path) ?? p.read(path));
}
function meta(a: Spec): Meta {
  return {
    path: a.path,
    sha256: a.published_sha256,
    ...(a.requires_blob ? { blob: a.published_blob } : {}),
  };
}
function admit(
  a: Spec,
  ports: Partial<Ports> = {},
  f = meta(a),
  bytes = p.git(a.commit, a.path),
) {
  return s.admitCycle33V1IntegrationPublished(f, bytes, { read, ...ports });
}
const corrupt = (b: Buffer) =>
  Buffer.concat([b, Buffer.from('\n// NOT REVIEWED\n')]);
for (const a of variants) {
  it(`${a.module}: admits only exact source lineage with false operational authority`, () => {
    const result = admit(a);
    expect(result.source_commit).toBe(a.commit);
    expect(result.authority).toBe('SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE');
    expect(result.business_authority).toBe(false);
    expect(result.restore_adapter).toBe(false);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.added)).toBe(true);
    expect(
      s.admitCycle33ExecutionPublished(meta(a), p.git(a.commit, a.path), {
        read,
      }),
    ).toEqual(result);
  });
  for (const what of ['hash', 'blob', 'missing hash'] as const)
    it(`${a.module}: rejects rewritten historical ${what}`, () => {
      const f = { ...meta(a) };
      if (what === 'hash') f.sha256 = a.sha256;
      else if (what === 'blob') f.blob = '0'.repeat(40);
      else f.sha256 = '';
      expect(() => admit(a, {}, f)).toThrow();
    });
  if (a.requires_blob)
    it(`${a.module}: requires the original published blob`, () => {
      const f = meta(a);
      delete f.blob;
      expect(() => admit(a, {}, f)).toThrow();
    });
  for (const commit of [a.published, a.parent, a.commit]) {
    it(`${a.module}: rejects missing commit ${commit}`, () =>
      expect(() =>
        admit(a, { type: (c) => (c === commit ? 'blob' : p.type(c)) }),
      ).toThrow());
    it(`${a.module}: rejects nonregular native object at ${commit}`, () =>
      expect(() =>
        admit(a, {
          mode: (c, f) =>
            c === commit && f === a.path ? '120000' : p.mode(c, f),
        }),
      ).toThrow());
  }
  it(`${a.module}: rejects a merge author instead of original sole parent`, () =>
    expect(() =>
      admit(a, {
        parent: (c) =>
          c === a.commit ? a.parent + ' ' + a.published : p.parent(c),
      }),
    ).toThrow());
  it(`${a.module}: rejects a changed original publisher parent`, () =>
    expect(() =>
      admit(a, {
        parent: (c) => (c === a.published ? '0'.repeat(40) : p.parent(c)),
      }),
    ).toThrow());
  it(`${a.module}: rejects any additional author path`, () =>
    expect(() =>
      admit(a, {
        delta: (c) =>
          c === a.commit ? p.delta(c) + '\nM\tsrc/App.tsx' : p.delta(c),
      }),
    ).toThrow());
  for (const commit of [a.published, a.parent, a.commit])
    it(`${a.module}: rejects native Git byte drift at ${commit}`, () =>
      expect(() =>
        admit(a, {
          git: (c, f) =>
            c === commit && f === a.path ? corrupt(p.git(c, f)) : p.git(c, f),
        }),
      ).toThrow());
  it(`${a.module}: denies old source substituted for reviewed successor`, () =>
    expect(() => admit(a, {}, meta(a), p.git(a.published, a.path))).toThrow());
  it(`${a.module}: denies input/file disagreement`, () =>
    expect(() =>
      admit(a, {
        read: (f) => (f === a.path ? p.git(a.published, f) : read(f)),
      }),
    ).toThrow());
  it(`${a.module}: denies a final current-file substitution`, () => {
    let reads = 0;
    expect(() =>
      admit(a, {
        read: (f) =>
          f === a.path && ++reads === 2 ? corrupt(read(f)) : read(f),
      }),
    ).toThrow();
    expect(reads).toBe(2);
  });
  for (const [commit, files] of [
    [a.published, a.original_companions],
    [a.commit, a.added],
  ] as const)
    for (const f of files) {
      it(`${a.module}: denies current companion drift ${f.path}`, () =>
        expect(() =>
          admit(a, {
            read: (path) =>
              path === f.path ? corrupt(read(path)) : read(path),
          }),
        ).toThrow());
      it(`${a.module}: denies late companion drift ${f.path}`, () => {
        let reads = 0;
        expect(() =>
          admit(a, {
            read: (path) =>
              path === f.path && ++reads === 2
                ? corrupt(read(path))
                : read(path),
          }),
        ).toThrow();
        expect(reads).toBe(2);
      });
      it(`${a.module}: denies immutable companion drift ${f.path}`, () =>
        expect(() =>
          admit(a, {
            git: (c, path) =>
              c === commit && path === f.path
                ? corrupt(p.git(c, path))
                : p.git(c, path),
          }),
        ).toThrow());
      it(`${a.module}: denies nonregular companion ${f.path}`, () =>
        expect(() =>
          admit(a, {
            mode: (c, path) =>
              c === commit && path === f.path ? '120000' : p.mode(c, path),
          }),
        ).toThrow());
    }
  for (const f of a.original_companions)
    it(`${a.module}: requires original companion unchanged at author parent ${f.path}`, () =>
      expect(() =>
        admit(a, {
          git: (c, path) =>
            c === a.parent && path === f.path
              ? corrupt(p.git(c, path))
              : p.git(c, path),
        }),
      ).toThrow());
}
it('rejects cross-profile and undeclared paths', () => {
  expect(() =>
    s.admitCycle33V1IntegrationPublished(
      { ...meta(variants[0]), path: variants[1].path },
      p.git(variants[0].commit, variants[0].path),
      { read },
    ),
  ).toThrow();
  expect(() =>
    s.admitCycle33V1IntegrationPublished(
      { path: 'src/App.tsx', sha256: '0'.repeat(64) },
      Buffer.from(''),
      { read },
    ),
  ).toThrow();
});
it('C10 preserves original baseline without requiring any successor package', () => {
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE10_DELIVERY_INDEX.json', 'utf8'),
  );
  expect(c10.validateCycle10Manifest(manifest)).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
  });
});
it('C10 admits the reviewed successor through its unchanged original row', () => {
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE10_DELIVERY_INDEX.json', 'utf8'),
  );
  expect(c10.validateCycle10Manifest(manifest, read)).toEqual({
    packages: 6,
    author_files: 30,
    independent_files: 2,
  });
});
it('C10 rejects replacing historical hash with current hash before equality shortcut', () => {
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE10_DELIVERY_INDEX.json', 'utf8'),
  );
  const a = variants[0];
  manifest.packages
    .flatMap((x: { owned_files: Meta[] }) => x.owned_files)
    .find((f: Meta) => f.path === a.path).sha256 = a.sha256;
  expect(() => c10.validateCycle10Manifest(manifest, read)).toThrow(
    'Reviewed Cycle10 source changed',
  );
});
for (const cycle of [19, 22, 23])
  it(`C${cycle}: actual retained consumer admits both successor identities without rebaselining`, async () => {
    const file =
      cycle === 19 ? 'check-cycle19-integrity' : 'check-cycle' + cycle;
    const mod = await import(
      new URL('../scripts/' + file + '.mjs', import.meta.url).href
    );
    const path = `docs/program/CYCLE${cycle}_${cycle === 19 ? 'DELIVERY_INDEX' : 'SOURCE_MANIFEST'}.json`;
    const m = JSON.parse(readFileSync(path, 'utf8'));
    const result =
      cycle === 19
        ? mod.validateCycle19Manifest(m, read)
        : mod['validateCycle' + cycle + 'Manifest'](m, { read });
    expect(result.packages).toBe(5);
    expect(result.retained_author_files).toBeGreaterThan(390);
  });
for (const cycle of [22, 23])
  it(`C${cycle}: actual retained consumer rejects unknown native drift`, async () => {
    const mod = await import(
      new URL('../scripts/check-cycle' + cycle + '.mjs', import.meta.url).href
    );
    const manifest = JSON.parse(
      readFileSync(`docs/program/CYCLE${cycle}_SOURCE_MANIFEST.json`, 'utf8'),
    );
    expect(() =>
      mod['validateCycle' + cycle + 'Manifest'](manifest, {
        read: (path: string) =>
          path === variants[1].path ? corrupt(read(path)) : read(path),
      }),
    ).toThrow();
  });
