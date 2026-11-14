import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
const proposal: {
  verifyEvidence: (bytes?: Buffer) => unknown;
  verifyAuthors: (root?: string) => {
    record: { source_author: string; launch_parent: string };
  };
  verifyCurrent: (root: string, candidate?: boolean) => unknown;
  prepareArchive: () => string;
} = await import(
  new URL('../../proposals/c22-launch-integration/qualify.mjs', import.meta.url)
    .href
);
let archive: string;
beforeAll(() => {
  archive = proposal.prepareArchive();
});
afterAll(() => {
  if (archive) {
    try {
      proposal.verifyCurrent(archive, true);
    } finally {
      rmSync(archive, { recursive: true, force: true });
    }
  }
});
it('binds the actual single-file source author to the unchanged launch parent', () => {
  expect(proposal.verifyAuthors().record).toMatchObject({
    source_author: 'd0e05afb6ade0e3d78190379335000b988de6c94',
    launch_parent: '53a4705b72b584228b33988d1eae586ef10b44eb',
  });
});
it('qualifies exact reviewed bytes only in the disposable clone', () => {
  expect(() => proposal.verifyCurrent(archive, true)).not.toThrow();
  expect(() => proposal.verifyCurrent(process.cwd())).not.toThrow();
});
it('rejects coordinated author, parent, patch or authorization rebinding', () => {
  const bytes = readFileSync('proposals/c22-launch-integration/evidence.json');
  for (const [key, value] of [
    ['source_author', '0'.repeat(40)],
    ['launch_parent', '1'.repeat(40)],
    ['patch_sha256', '2'.repeat(64)],
    ['launchIntegrationAuthorized', true],
  ] as const) {
    const evidence = JSON.parse(bytes.toString());
    evidence[key] = value;
    expect(() =>
      proposal.verifyEvidence(Buffer.from(JSON.stringify(evidence))),
    ).toThrow();
  }
});
it.each([
  'scripts/check-cycle22.mjs',
  'scripts/cycle25-source-lineage.mjs',
  'docs/program/CYCLE22_SOURCE_MANIFEST.json',
  'tests/cycle22-validation.test.ts',
])('rejects substituted or mixed live source: %s', (path) => {
  const full = join(archive, path),
    bytes = readFileSync(full);
  try {
    writeFileSync(full, Buffer.concat([bytes, Buffer.from('\n// UNKNOWN\n')]));
    expect(() => proposal.verifyCurrent(archive, true)).toThrow();
  } finally {
    writeFileSync(full, bytes);
  }
});
it('rejects mode substitution and symlinked endpoint without following it', () => {
  const full = join(archive, 'scripts/check-cycle22.mjs'),
    bytes = readFileSync(full);
  try {
    chmodSync(full, 0o755);
    expect(() => proposal.verifyCurrent(archive, true)).toThrow();
    chmodSync(full, 0o644);
    unlinkSync(full);
    symlinkSync(join(process.cwd(), 'scripts/check-cycle22.mjs'), full);
    expect(() => proposal.verifyCurrent(archive, true)).toThrow();
  } finally {
    rmSync(full, { force: true });
    writeFileSync(full, bytes, { mode: 0o644 });
  }
});
it('rejects a symlinked source ancestor even when its files are unchanged', () => {
  const directory = join(archive, 'scripts');
  const moved = join(archive, 'scripts-disposable-test');
  renameSync(directory, moved);
  try {
    symlinkSync(moved, directory, 'dir');
    expect(() => proposal.verifyCurrent(archive, true)).toThrow(/symlink/);
  } finally {
    rmSync(directory, { force: true });
    renameSync(moved, directory);
  }
});
it('ignores injected Git directory and configuration variables', () => {
  const values = {
    GIT_DIR: '/definitely-invalid-propel-git-directory',
    GIT_WORK_TREE: '/definitely-invalid-propel-worktree',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'alias.show',
    GIT_CONFIG_VALUE_0: '!exit 91',
    GIT_CONFIG_PARAMETERS: 'invalid injected configuration',
  };
  const url = new URL(
    '../../proposals/c22-launch-integration/qualify.mjs',
    import.meta.url,
  ).href;
  const script = `const q = await import(${JSON.stringify(url)}); q.verifyAuthors(); q.verifyCurrent(${JSON.stringify(archive)}, true);`;
  expect(() =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, LC_ALL: 'C', ...values },
      timeout: 25000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  ).not.toThrow();
});
