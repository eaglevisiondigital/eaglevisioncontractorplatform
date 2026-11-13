import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
const proposal = await import(
  new URL('../proposals/c17-current-launch/qualify.mjs', import.meta.url).href
);
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
it('retains the existing exact C17 correction, note and uncreated-author checkpoint', () => {
  const { patch, note } = proposal.artifacts();
  expect(sha(patch)).toBe(
    '0e309234f1186dcaeac6a6a2234fe825526666b9efb1016df405efeb382a297a',
  );
  expect(sha(note)).toBe(
    'd059a93942fe871a4af17d2f6ba207ee520c22a25d252b00300b68cd9b8537d4',
  );
  const evidence = JSON.parse(
    readFileSync('proposals/c17-current-launch/evidence.json', 'utf8'),
  );
  expect(evidence.baseline).toBe('2c63cfd8175fe23d6c7f80a7879af9c73b27dceb');
  expect(evidence.futureAuthor).toBeNull();
  expect(evidence.admissionReady).toBe(false);
  expect(evidence.qualifierSha256).toBe(
    sha(readFileSync('proposals/c17-current-launch/qualify.mjs')),
  );
});
it('reproduces the original failure and exact proposed pass only in a disposable clone', async () => {
  const names = ['CI', 'GITHUB_ACTIONS', 'GITHUB_REPOSITORY'];
  const saved = names.map((name) => process.env[name]);
  let r;
  try {
    process.env.CI = 'true';
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_REPOSITORY =
      'eaglevisiondigital/eaglevisioncontractorplatform';
    r = await proposal.qualify();
  } finally {
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    });
  }
  expect(r.before).toMatchObject({
    exit: 1,
    passed: 0,
    failed: 1,
    pending: 44,
  });
  expect(r.after).toMatchObject({ exit: 0, passed: 1, failed: 0, pending: 44 });
  expect(r.currentVerified).toBeGreaterThan(1);
  expect(r.unknownCheckerAndTcbDeniedBeforeImport).toBe(true);
  expect(r.fieldUnknownRejected).toBe(true);
  expect(r.downstreamProposedAndUnknownDenied).toBe(true);
  expect(r.canonicalUnchanged).toBe(true);
  expect(r.futureAuthor).toBeNull();
  expect(r.admissionReady).toBe(false);
});
it.each([
  'scripts/v1-c17-inventory-source.mjs',
  'scripts/cycle25-source-lineage.mjs',
])('rejects unknown %s before importing a checker', (path) => {
  const { oldManifest } = proposal.artifacts();
  expect(() =>
    proposal.verifyCurrent(process.cwd(), oldManifest, (file: string) =>
      file === join(process.cwd(), path)
        ? Buffer.concat([
            readFileSync(file),
            Buffer.from('\nthrow Error("UNKNOWN EXECUTION");'),
          ])
        : readFileSync(file),
    ),
  ).toThrow('Reviewed current TCB bytes required');
});
it('rejects a symlinked checker in current source', () => {
  const { oldManifest } = proposal.artifacts();
  expect(() =>
    proposal.verifyCurrent(
      process.cwd(),
      oldManifest,
      readFileSync,
      (file: string) =>
        file.endsWith('v1-c17-inventory-source.mjs')
          ? { isFile: () => true, isSymbolicLink: () => true, mode: 0o100644 }
          : lstatSync(file),
    ),
  ).toThrow('Regular non-executable current source required');
});
