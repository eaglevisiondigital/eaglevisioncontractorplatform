import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

type Ports = { git: (commit: string, path: string) => Buffer };
const source: {
  cycle25Parent: string;
  cycle31Parent: string;
  cycle31Authors: readonly { commit: string; modified: readonly string[] }[];
  cycle25SourcePorts: Ports;
  admitCycle25Source: (
    path: string,
    current: Buffer,
    original: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/cycle25-source-lineage.mjs', import.meta.url).href
);
const legacy: {
  validateCycle21PublishedSource: (
    file: { path: string; sha256: string; blob: string },
    commit: string,
    current: Buffer,
    published: Buffer,
  ) => void;
} = await import(new URL('../scripts/check-cycle21.mjs', import.meta.url).href);
const path = 'src/lib/workflows/plan-cancellation-review.ts';
const author = '1538060250fc34654414dac6b29621bf44fabd98';
const ownerPath = 'src/lib/workflows/recorded-owner-actions.ts';
const ownerAuthor = '4dc82f93b4cc156ff3f9a4fb46aa3fefa2c93517';
const ownerOriginal = '161f1c59d864d60aa0f45820eb6417864519baf2';
const git = source.cycle25SourcePorts.git;
const current = () => git(author, path);
const original = () => git(source.cycle25Parent, path);
function commits(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    key === 'source_commit' && typeof entry === 'string'
      ? [entry]
      : commits(entry),
  );
}

it('the actual maintenance library traverses its original source chain to the one exact new endpoint', () => {
  expect(source.cycle31Authors).toEqual([
    expect.objectContaining({ commit: author, modified: [path] }),
    expect.objectContaining({ commit: ownerAuthor, modified: [ownerPath] }),
  ]);
  const admitted = source.admitCycle25Source(path, current(), original());
  expect(admitted).toMatchObject({
    path,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  });
  expect(commits(admitted)).toContain(
    '9db377e8bc9a9c3a541ab4bb773dc4c91dba4ff3',
  );
  expect(commits(admitted).filter((commit) => commit === author)).toHaveLength(
    1,
  );
});
it('a reviewed new endpoint cannot substitute the original immutable Cycle24 bytes', () => {
  expect(() =>
    source.admitCycle25Source(
      path,
      current(),
      Buffer.concat([original(), Buffer.from('\n// changed original')]),
    ),
  ).toThrow('Original immutable Cycle24 bytes');
});
it('the nested route independently binds the exact raw Cycle31 predecessor', () => {
  expect(() =>
    source.admitCycle25Source(path, current(), original(), {
      git: (commit, candidate) =>
        commit === source.cycle31Parent && candidate === path
          ? Buffer.concat([
              git(commit, candidate),
              Buffer.from('\n// changed parent'),
            ])
          : git(commit, candidate),
    }),
  ).toThrow('Exact Cycle31 parent source');
});
it('warming the complete nested admission never authorizes changed current bytes', () => {
  source.admitCycle25Source(path, current(), original());
  expect(() =>
    source.admitCycle25Source(
      path,
      Buffer.concat([current(), Buffer.from('\n// unknown current')]),
      original(),
    ),
  ).toThrow('fixed Cycle31');
});
it('a genuinely reviewed Growth successor receives no unrelated legacy owner-component exception', () => {
  const published = git(source.cycle31Parent, path);
  const file = {
    path,
    sha256: createHash('sha256').update(published).digest('hex'),
    blob: createHash('sha1')
      .update(`blob ${published.length}\0`)
      .update(published)
      .digest('hex'),
  };
  expect(() =>
    legacy.validateCycle21PublishedSource(
      file,
      source.cycle31Parent,
      current(),
      published,
    ),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${path}`);
});

function originalOwnerFile() {
  const published = git(ownerOriginal, ownerPath);
  return {
    published,
    file: {
      path: ownerPath,
      sha256: createHash('sha256').update(published).digest('hex'),
      blob: createHash('sha1')
        .update(`blob ${published.length}\0`)
        .update(published)
        .digest('hex'),
    },
  };
}
it('the newly owned library binds the unchanged original library directly to one exact source-only author', () => {
  const published = git(ownerOriginal, ownerPath);
  expect(published.equals(git(source.cycle25Parent, ownerPath))).toBe(true);
  expect(published.equals(git(source.cycle31Parent, ownerPath))).toBe(true);
  expect(
    source.admitCycle25Source(
      ownerPath,
      git(ownerAuthor, ownerPath),
      published,
    ),
  ).toEqual({
    source_commit: ownerAuthor,
    module: 'owner-navigation-runtime',
    owner: '/root/cycle25_finance_intelligence_resume',
    path: ownerPath,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
  });
});
it('the new direct library route rejects a changed original predecessor despite the exact author endpoint', () => {
  expect(() =>
    source.admitCycle25Source(
      ownerPath,
      git(ownerAuthor, ownerPath),
      Buffer.concat([
        git(ownerOriginal, ownerPath),
        Buffer.from('\n// changed original'),
      ]),
    ),
  ).toThrow('Exact Cycle31 parent source');
});
it('warming the direct library route never admits an unknown successor', () => {
  const currentOwner = git(ownerAuthor, ownerPath);
  const published = git(ownerOriginal, ownerPath);
  source.admitCycle25Source(ownerPath, currentOwner, published);
  expect(() =>
    source.admitCycle25Source(
      ownerPath,
      Buffer.concat([currentOwner, Buffer.from('\n// unknown successor')]),
      published,
    ),
  ).toThrow('fixed Cycle31');
});
it('the library legacy exception requires its original published author identity, not a later parent relabel', () => {
  const { file, published } = originalOwnerFile();
  const currentOwner = git(ownerAuthor, ownerPath);
  expect(() =>
    legacy.validateCycle21PublishedSource(
      file,
      ownerOriginal,
      currentOwner,
      published,
    ),
  ).not.toThrow();
  expect(() =>
    legacy.validateCycle21PublishedSource(
      file,
      source.cycle31Parent,
      currentOwner,
      published,
    ),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${ownerPath}`);
});
it('the exact reviewed library endpoint cannot excuse changed immutable original manifest evidence', () => {
  const { file, published } = originalOwnerFile();
  expect(() =>
    legacy.validateCycle21PublishedSource(
      {
        ...file,
        sha256: createHash('sha256')
          .update(git(ownerAuthor, ownerPath))
          .digest('hex'),
      },
      ownerOriginal,
      git(ownerAuthor, ownerPath),
      published,
    ),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${ownerPath}`);
});
