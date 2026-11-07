import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
type Ports = {
  read: (p: string) => Buffer;
  git: (c: string, p: string) => Buffer;
  parent: (c: string) => string;
  type: (c: string) => string;
  mode: (c: string, p: string) => string;
  delta: (c: string) => string;
};
type Author = {
  commit: string;
  modified: readonly string[];
  added: readonly string[];
  companions: readonly { path: string }[];
};
const next: {
  nextParent: string;
  nextAuthors: readonly Author[];
  admitNextNative: (
    p: string,
    c: Buffer,
    b: Buffer,
    o?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitNextFieldPublished: (
    f: { path: string; sha256: string },
    c: Buffer,
    p: string,
    o?: Partial<Ports>,
  ) => unknown;
} = await import(
  new URL('../scripts/v1-next-native-source.mjs', import.meta.url).href
);
const legacy: {
  cycle25SourcePorts: Ports;
  inspectCycle29Sources: (p?: unknown) => unknown;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const p = legacy.cycle25SourcePorts,
  corrupt = (b: Buffer) =>
    Buffer.concat([b, Buffer.from('\n// unknown source\n')]);
for (const a of next.nextAuthors)
  for (const path of a.modified) {
    const current = () => p.git(a.commit, path),
      before = () => p.git(next.nextParent, path);
    it(`${path}: exact full author bundle is source evidence only`, () => {
      expect(next.admitNextNative(path, current(), before())).toMatchObject({
        path,
        source_commit: a.commit,
        authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
        business_authority: false,
        restore_adapter: false,
      });
    });
    for (const mode of [
      'merge',
      'extra-delta',
      'executable',
      'missing-author',
      'wrong-before',
      'runtime-drift',
      'new-test-drift',
      'companion-drift',
      'late-companion',
      'late-endpoint',
    ] as const) {
      it(`${path}: denies ${mode}`, () => {
        const target = a.companions[0].path;
        let companionReads = 0,
          ownReads = 0;
        const ports: Partial<Ports> = {
          parent: (c) =>
            c === a.commit && mode === 'merge'
              ? `${next.nextParent} ${next.nextParent}`
              : p.parent(c),
          type: (c) =>
            c === a.commit && mode === 'missing-author' ? 'blob' : p.type(c),
          delta: (c) =>
            mode === 'extra-delta'
              ? p.delta(c) + '\nM\tsrc/App.tsx'
              : p.delta(c),
          mode: (c, f) =>
            f === path && mode === 'executable' ? '100755' : p.mode(c, f),
          read: (f) => {
            if (f === target) companionReads++;
            if (f === path) ownReads++;
            return (f === path && mode === 'runtime-drift') ||
              (f === a.added[1] && mode === 'new-test-drift') ||
              (f === target && mode === 'companion-drift') ||
              (f === target &&
                mode === 'late-companion' &&
                companionReads > 1) ||
              (f === path && mode === 'late-endpoint' && ownReads > 1)
              ? corrupt(p.read(f))
              : p.read(f);
          },
        };
        expect(() =>
          next.admitNextNative(
            path,
            current(),
            mode === 'wrong-before' ? corrupt(before()) : before(),
            ports,
          ),
        ).toThrow();
      });
    }
  }
it('partial Finance replacement cannot pass a single changed-path admission', () => {
  const a = next.nextAuthors[1],
    path = a.modified[0],
    other = a.modified[1];
  expect(() =>
    next.admitNextNative(path, p.read(path), p.git(next.nextParent, path), {
      read: (f) => (f === other ? p.git(next.nextParent, f) : p.read(f)),
    }),
  ).toThrow('Complete exact new author bundle');
});
it('unknown path has no new source authority', () => {
  expect(() =>
    next.admitNextNative('src/App.tsx', Buffer.from(''), Buffer.from('')),
  ).toThrow('No finite next native source owner');
});
it('actual original C17 consumer accepts exact Field successor', async () => {
  const c = await import(
    new URL('../scripts/check-cycle17-integrity.mjs', import.meta.url).href
  );
  expect(
    c.validateCycle17Manifest(
      JSON.parse(
        readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8'),
      ),
    ),
  ).toMatchObject({ packages: 6 });
});
it('C17 rejects an equality shortcut with a replaced original pin', async () => {
  const c = await import(
      new URL('../scripts/check-cycle17-integrity.mjs', import.meta.url).href
    ),
    m = JSON.parse(
      readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8'),
    );
  m.packages[0].owned_files.find(
    (f: { path: string }) => f.path === next.nextAuthors[0].modified[0],
  ).sha256 = createHash('sha256')
    .update(p.read(next.nextAuthors[0].modified[0]))
    .digest('hex');
  expect(() => c.validateCycle17Manifest(m)).toThrow(
    'Reviewed Cycle17 source changed',
  );
});
for (const cycle of [22, 23, 24])
  it(`actual C${cycle} retained/native consumer preserves all original pins`, async () => {
    const c = await import(
      new URL(`../scripts/check-cycle${cycle}.mjs`, import.meta.url).href
    );
    expect(
      c[`validateCycle${cycle}Manifest`](
        JSON.parse(
          readFileSync(
            `docs/program/CYCLE${cycle}_SOURCE_MANIFEST.json`,
            'utf8',
          ),
        ),
      ),
    ).toMatchObject({ packages: cycle === 24 ? 6 : 5 });
  });
it('direct C29 source inspector reaches the exact Finance successor', () => {
  expect(legacy.inspectCycle29Sources()).toMatchObject({
    business_authority: false,
    restore_adapter: false,
  });
});

it('C17 rejects a replaced Field publisher before source equality or evolution', async () => {
  const c = await import(
      new URL('../scripts/check-cycle17-integrity.mjs', import.meta.url).href
    ),
    m = JSON.parse(
      readFileSync('docs/program/CYCLE17_DELIVERY_INDEX.json', 'utf8'),
    );
  m.packages[0].head_commit = '0'.repeat(40);
  expect(() => c.validateCycle17Manifest(m)).toThrow(
    'Exact disjoint author identity required',
  );
});
