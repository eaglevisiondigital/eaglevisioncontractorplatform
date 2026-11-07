import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
type Ports = {
  read: (p: string) => Buffer;
  git: (c: string, p: string) => Buffer;
  parent: (c: string) => string;
  type: (c: string) => string;
  mode: (c: string, p: string) => string;
  delta: (c: string) => string;
};
const source: {
  pilotParent: string;
  pilotAuthors: readonly {
    path: string;
    commit: string;
    added: readonly string[];
  }[];
  inspectPilotAuthor: (
    p: string,
    b: Buffer,
    s?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitPilotPassportPublished: (
    f: { path: string; sha256: string },
    b: Buffer,
    s?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/v1-pilot-source-integrity.mjs', import.meta.url).href
);
const original: { cycle25SourcePorts: Ports } = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const c13: {
  validateCycle13Manifest: (m: unknown, r?: Ports['read']) => unknown;
} = await import(
  new URL('../scripts/check-cycle13-integrity.mjs', import.meta.url).href
);
const ports = original.cycle25SourcePorts;
const corrupt = (b: Buffer) =>
  Buffer.concat([b, Buffer.from('\n// unreviewed\n')]);
for (const row of source.pilotAuthors) {
  const bytes = () => ports.git(row.commit, row.path);
  it(`${row.path}: exact actual author source is provenance only`, () => {
    expect(source.inspectPilotAuthor(row.path, bytes())).toEqual({
      source_commit: row.commit,
      authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
      business_authority: false,
      restore_adapter: false,
    });
  });
  for (const mode of [
    'merge-parent',
    'wrong-parent',
    'missing-history',
    'extra-delta',
    'renamed-delta',
    'executable',
    'symlink',
    'runtime',
    'test',
    'document',
    'stale-argument',
    'fresh-read-change',
  ] as const) {
    it(`${row.path}: rejects ${mode}`, () => {
      let reads = 0;
      const supplied: Partial<Ports> = {
        parent: (c) =>
          c === row.commit && mode === 'merge-parent'
            ? `${source.pilotParent} ${source.pilotParent}`
            : c === row.commit && mode === 'wrong-parent'
              ? '0'.repeat(40)
              : ports.parent(c),
        type: (c) =>
          mode === 'missing-history' && c === row.commit
            ? 'blob'
            : ports.type(c),
        delta: (c) =>
          mode === 'extra-delta'
            ? `${ports.delta(c)}\nM\tsrc/App.tsx`
            : mode === 'renamed-delta'
              ? `R100\told\t${row.path}`
              : ports.delta(c),
        mode: (c, p) =>
          p === row.path && mode === 'executable'
            ? '100755'
            : p === row.path && mode === 'symlink'
              ? '120000'
              : ports.mode(c, p),
        read: (p) => {
          if (p === row.path) reads++;
          return (mode === 'runtime' && p === row.path) ||
            (mode === 'test' && p === row.added[1]) ||
            (mode === 'document' && p === row.added[0]) ||
            (mode === 'fresh-read-change' && p === row.path && reads === 2)
            ? corrupt(ports.read(p))
            : ports.read(p);
        },
      };
      expect(() =>
        source.inspectPilotAuthor(
          row.path,
          mode === 'stale-argument' ? corrupt(bytes()) : bytes(),
          supplied,
        ),
      ).toThrow();
    });
  }
  it(`${row.path}: companion changing after first read is denied`, () => {
    let reads = 0;
    expect(() =>
      source.inspectPilotAuthor(row.path, bytes(), {
        read: (p) =>
          p === row.added[1] && ++reads > 1
            ? corrupt(ports.read(p))
            : ports.read(p),
      }),
    ).toThrow('Pilot source bundle changed');
  });
}
const path = source.pilotAuthors[0].path;
const meta = {
  path,
  sha256: 'b235dc62e3b6e3f0eceed01af3c36ce94fbf1c2d274b1e5f219abef7d9b73f53',
};
it('Passport original publisher and unchanged original companions precede finite successor', () => {
  expect(
    source.admitPilotPassportPublished(meta, ports.read(path)).source_commit,
  ).toBe(source.pilotAuthors[0].commit);
});
it('actual original C13 consumer accepts reviewed combined source', () => {
  expect(
    c13.validateCycle13Manifest(
      JSON.parse(
        readFileSync('docs/program/CYCLE13_DELIVERY_INDEX.json', 'utf8'),
      ),
    ),
  ).toEqual({ packages: 7, author_files: 37, independent_files: 2 });
});
for (const mode of [
  'wrong-pin',
  'missing-pin',
  'wrong-publisher-parent',
  'changed-parent-runtime',
  'changed-publisher-runtime',
  'changed-current-companion',
] as const) {
  it(`Passport rejects ${mode}`, () => {
    const supplied: Partial<Ports> = {
      parent: (c) =>
        mode === 'wrong-publisher-parent' &&
        c === '97272beef9dbd5fd26da7861961aed8c99b68a2b'
          ? '0'.repeat(40)
          : ports.parent(c),
      git: (c, p) =>
        p === path &&
        ((mode === 'changed-parent-runtime' && c === source.pilotParent) ||
          (mode === 'changed-publisher-runtime' &&
            c === '97272beef9dbd5fd26da7861961aed8c99b68a2b'))
          ? corrupt(ports.git(c, p))
          : ports.git(c, p),
      read: (p) =>
        mode === 'changed-current-companion' &&
        p === 'src/components/workflows/ServicePassportDesk.tsx'
          ? corrupt(ports.read(p))
          : ports.read(p),
    };
    expect(() =>
      source.admitPilotPassportPublished(
        {
          ...meta,
          sha256:
            mode === 'wrong-pin'
              ? 'a'.repeat(64)
              : mode === 'missing-pin'
                ? ''
                : meta.sha256,
        },
        ports.read(path),
        supplied,
      ),
    ).toThrow();
  });
}
it('original consumer rejects substituted metadata even when current bytes match its digest', async () => {
  const { createHash } = await import('node:crypto');
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE13_DELIVERY_INDEX.json', 'utf8'),
  );
  manifest.packages[2].owned_files.find(
    (f: { path: string }) => f.path === path,
  ).sha256 = createHash('sha256').update(ports.read(path)).digest('hex');
  expect(() => c13.validateCycle13Manifest(manifest)).toThrow(
    'Reviewed Cycle13 source changed',
  );
});
it('unknown source has no pilot author', () => {
  expect(() =>
    source.inspectPilotAuthor('src/App.tsx', Buffer.from('')),
  ).toThrow('No finite pilot source owner');
});
it('original companion changing during author inspection is denied', () => {
  const companion = 'src/components/workflows/ServicePassportDesk.tsx';
  let reads = 0;
  expect(() =>
    source.admitPilotPassportPublished(meta, ports.read(path), {
      read: (p) =>
        p === companion && ++reads > 1 ? corrupt(ports.read(p)) : ports.read(p),
    }),
  ).toThrow('Original Passport companion changed');
});

for (const entry of [
  'scripts/v1-pilot-source-integrity.mjs',
  'scripts/cycle25-source-lineage.mjs',
]) {
  it(`source-tooling ESM load order is safe from ${entry}`, async () => {
    const { execFileSync } = await import('node:child_process');
    expect(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `await import('./${entry}'); console.log('loaded')`,
        ],
        { encoding: 'utf8' },
      ).trim(),
    ).toBe('loaded');
  });
}
for (const cycle of [22, 23, 24]) {
  it(`actual C${cycle} retained-source consumer admits only the reviewed Passport endpoint`, async () => {
    const c = await import(
      new URL(`../scripts/check-cycle${cycle}.mjs`, import.meta.url).href
    );
    const result = c[`validateCycle${cycle}Manifest`](
      JSON.parse(
        readFileSync(`docs/program/CYCLE${cycle}_SOURCE_MANIFEST.json`, 'utf8'),
      ),
    );
    expect(result.packages).toBe(cycle === 24 ? 6 : 5);
  });
}
it('shared later dispatcher rejects substituted original Passport bytes', async () => {
  const c = await import(
    new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
  );
  expect(() =>
    c.admitCycle25Source(
      path,
      ports.read(path),
      corrupt(ports.git(source.pilotParent, path)),
    ),
  ).toThrow('Unreviewed source replacement');
});
it('shared later dispatcher rejects unreviewed current Passport bytes', async () => {
  const c = await import(
    new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
  );
  expect(() =>
    c.admitCycle25Source(
      path,
      corrupt(ports.read(path)),
      ports.git(source.pilotParent, path),
    ),
  ).toThrow('Unreviewed source replacement');
});
it('actual C22 consumer rejects current Passport drift through its reader', async () => {
  const c = await import(
    new URL('../scripts/check-cycle22.mjs', import.meta.url).href
  );
  expect(() =>
    c.validateCycle22Manifest(
      JSON.parse(
        readFileSync('docs/program/CYCLE22_SOURCE_MANIFEST.json', 'utf8'),
      ),
      {
        read: (p: string) =>
          p === path ? corrupt(ports.read(p)) : ports.read(p),
      },
    ),
  ).toThrow(/source/i);
});

for (const cycle of [22, 23]) {
  it(`actual C${cycle} consumer rejects forged current-hash metadata before equality`, async () => {
    const c = await import(
      new URL(`../scripts/check-cycle${cycle}.mjs`, import.meta.url).href
    );
    const { createHash } = await import('node:crypto');
    const index = 'docs/program/CYCLE13_DELIVERY_INDEX.json';
    const forged = JSON.parse(ports.read(index).toString());
    forged.packages[2].owned_files.find(
      (f: { path: string }) => f.path === path,
    ).sha256 = createHash('sha256').update(ports.read(path)).digest('hex');
    const modified = Buffer.from(JSON.stringify(forged));
    let ownPhase = cycle === 22;
    let captured = false;
    const supplied = {
      read: (p: string) => {
        if (ownPhase && p === path) captured = true;
        return ownPhase && p === index ? modified : ports.read(p);
      },
      git: (commit: string, p: string) => {
        // C23 validates C22 first; expose the forged fixture only once its own
        // unchanged parent-manifest comparisons begin, not in that predecessor.
        if (
          cycle === 23 &&
          commit === '3e35fb29dd4488bf655446712e5a013e06f8ed1e'
        )
          ownPhase = true;
        return ownPhase && p === index ? modified : ports.git(commit, p);
      },
    };
    expect(() =>
      c[`validateCycle${cycle}Manifest`](
        JSON.parse(
          ports
            .read(`docs/program/CYCLE${cycle}_SOURCE_MANIFEST.json`)
            .toString(),
        ),
        supplied,
      ),
    ).toThrow(`Retained author source changed: ${path}`);
    expect(captured).toBe(true);
  });
}
it('shared later dispatcher retains exact path and denies business authority', async () => {
  const c = await import(
    new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
  );
  expect(
    c.admitCycle25Source(
      path,
      ports.read(path),
      ports.git(source.pilotParent, path),
    ),
  ).toEqual({
    path,
    source_commit: source.pilotAuthors[0].commit,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  });
});
