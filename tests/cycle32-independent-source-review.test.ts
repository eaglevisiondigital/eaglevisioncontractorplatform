import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

type Ports = {
  git: (commit: string, path: string) => Buffer;
  read: (path: string) => Buffer;
};
const source: {
  cycle25Parent: string;
  cycle32Parent: string;
  cycle25SourcePorts: Ports;
  admitCycle25Source: (
    path: string,
    current: Buffer,
    original: Buffer,
    ports?: Partial<Ports>,
  ) => Record<string, unknown>;
  admitCycle32Forward: (
    path: string,
    current: Buffer,
    original: Buffer,
    ports?: Ports,
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
const git = source.cycle25SourcePorts.git;
const fieldPath = 'src/lib/workflows/task-correction-review.ts';
const fieldOriginal = '4681fc9d76a31044eded27b6f3340c2cb0b2c89c';
const fieldAuthor = '452d57049e60c5228718fc7647346faab7ac4409';
const voicePath = 'src/lib/program/voice-estimate.ts';
const voiceInitial = '243a6c79ea9324552ac549c31a280608604453d6';
const voiceFinal = '6447d881c2011ce178694bd87bbb303b862b1bb9';
const ownerPath = 'src/components/workflows/OwnerActionVerification.tsx';
const ownerC28 = '44064cac9f4cde8c746ef080b3e613aff94ff410';
const ownerFinal = '34cae8398fc135b55452e86bdb3b62a8b76d13d6';
function publishedFile(commit: string, path: string) {
  const published = git(commit, path);
  return {
    published,
    file: {
      path,
      sha256: createHash('sha256').update(published).digest('hex'),
      blob: createHash('sha1')
        .update(`blob ${published.length}\0`)
        .update(published)
        .digest('hex'),
    },
  };
}
function commits(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'source_commit' && typeof child === 'string'
      ? [child]
      : commits(child),
  );
}

it('the original published Field author admits only its exact reviewed native correction without changing original evidence', () => {
  const { file, published } = publishedFile(fieldOriginal, fieldPath);
  expect(published.equals(git(source.cycle32Parent, fieldPath))).toBe(true);
  expect(() =>
    legacy.validateCycle21PublishedSource(
      file,
      fieldOriginal,
      git(fieldAuthor, fieldPath),
      published,
    ),
  ).not.toThrow();
});

it('identical original Field bytes do not permit relabeling the published author as a later coordination parent', () => {
  const { file, published } = publishedFile(fieldOriginal, fieldPath);
  expect(() =>
    legacy.validateCycle21PublishedSource(
      file,
      source.cycle32Parent,
      git(fieldAuthor, fieldPath),
      published,
    ),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${fieldPath}`);
});

it('the reviewed Field endpoint cannot replace its original published digest and blob evidence', () => {
  const original = publishedFile(fieldOriginal, fieldPath);
  const replacement = publishedFile(fieldAuthor, fieldPath);
  expect(() =>
    legacy.validateCycle21PublishedSource(
      replacement.file,
      fieldOriginal,
      replacement.published,
      original.published,
    ),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${fieldPath}`);
});

it('warming exact legacy Field admission cannot authorize an unknown native successor', () => {
  const { file, published } = publishedFile(fieldOriginal, fieldPath);
  const current = git(fieldAuthor, fieldPath);
  legacy.validateCycle21PublishedSource(
    file,
    fieldOriginal,
    current,
    published,
  );
  expect(() =>
    legacy.validateCycle21PublishedSource(
      file,
      fieldOriginal,
      Buffer.concat([current, Buffer.from('\n// unreviewed successor')]),
      published,
    ),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${fieldPath}`);
});

it('an independently reviewed Finance endpoint receives no legacy Field author exception', () => {
  const path = 'src/lib/profit-guard.ts';
  const { file, published } = publishedFile(source.cycle32Parent, path);
  expect(() =>
    legacy.validateCycle21PublishedSource(
      file,
      fieldOriginal,
      git('8fec4897bb116c3234e521be2b23260b9f2e503f', path),
      published,
    ),
  ).toThrow(`Exact published Cycle21 bytes/blob required: ${path}`);
});

it('the reproducibly vulnerable initial Voice source is not the corrected endpoint even with final companion evidence', () => {
  expect(() =>
    source.admitCycle25Source(
      voicePath,
      git(voiceInitial, voicePath),
      git(source.cycle25Parent, voicePath),
    ),
  ).toThrow('fixed Cycle32 author');
});

it.each([
  'docs/program/CYCLE32_VOICE_INPUT_CONTINUITY.md',
  'tests/cycle32-voice-input-continuity.test.ts',
])(
  'corrected Voice source cannot borrow rolled-back initial companion %s',
  (path) => {
    expect(() =>
      source.admitCycle25Source(
        voicePath,
        git(voiceFinal, voicePath),
        git(source.cycle25Parent, voicePath),
        {
          read: (candidate) =>
            candidate === path
              ? git(voiceInitial, path)
              : source.cycle25SourcePorts.read(candidate),
        },
      ),
    ).toThrow('Exact Cycle32 author test/document required');
  },
);

it('the new owner render keeps every original reviewed navigation predecessor and grants source lineage only', () => {
  const result = source.admitCycle25Source(
    ownerPath,
    git(ownerFinal, ownerPath),
    git(source.cycle25Parent, ownerPath),
  );
  expect(commits(result)).toEqual([
    '1faaad5baa4ffa1f077e39bd59e4f9c4760a7291',
    'd534ce82281096c58273c5cf908456f46f610ecf',
    '74b97a7ccd8082581331b5fe91695ccfbf8fb342',
    ownerC28,
    ownerFinal,
  ]);
  expect(result.authority).toBe('SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE');
});

it('a fixed final owner render cannot excuse replacing the last reviewed predecessor after warming its full chain', () => {
  const original = git(source.cycle25Parent, ownerPath);
  const current = git(ownerFinal, ownerPath);
  source.admitCycle25Source(ownerPath, current, original);
  expect(() =>
    source.admitCycle25Source(ownerPath, current, original, {
      git: (commit, path) =>
        commit === ownerC28 && path === ownerPath
          ? Buffer.concat([
              git(commit, path),
              Buffer.from('\n// substituted intermediate boundary'),
            ])
          : git(commit, path),
    }),
  ).toThrow('Exact Cycle32 parent source');
});
