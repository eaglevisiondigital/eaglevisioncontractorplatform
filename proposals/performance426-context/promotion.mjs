// Verify the finite four-file proposal, without applying it to the worktree.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
import { git, target, loadReviewed, verifyCanonical } from './qualify.mjs';

export const patchSha256 =
  '1756936f00d360d47789e467bb1c12272fb7439d2034ed8c230f50dcf0196376';
const path = 'proposals/performance426-context/integration.patch';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const after = Object.freeze({
  'src/lib/workflows/operating-center-runtime.ts': target.proposedRuntime,
  'scripts/operating-source-signature-admission.mjs':
    '38fd3d784b10dd634f6b03a5995a4ce4392eb2924865349d1414328701113978',
  'scripts/check-cycle9-integrity.mjs':
    '484a6cf6b7282324f86e90e90d4ce947ba4eb722afa6ef33a6a2e8a03e5fff68',
  'scripts/check-cycle24.mjs':
    '4f95b11e4e1d45186c5607f1b0773cc379e1901d99f7944ce907bfdef5a9a68d',
});
export function proposalBytes(bytes = readFileSync(path)) {
  assert.equal(sha(bytes), patchSha256, 'Exact finite426 patch required');
  const original = git(
    'diff',
    '--full-index',
    'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5',
    target.runtimeAuthor,
    '--',
    'src/lib/workflows/operating-center-runtime.ts',
  );
  const parts = [original];
  for (const name of ['helper', 'cycle9', 'cycle24'])
    parts.push(
      git(
        'show',
        '608ce8b7071a555440bf1f7dccfddec9473c661a:proposals/operating-signature-admission/' +
          name +
          '.patch',
      ),
    );
  assert.deepEqual(Buffer.from(bytes), Buffer.concat(parts));
  return Buffer.from(bytes);
}
export function qualifyPromotion() {
  const frame = verifyCanonical();
  loadReviewed();
  const bytes = proposalBytes();
  const info = lstatSync(path);
  assert(
    info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o644,
  );
  const env = {
    PATH: process.env.PATH,
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_GLOBAL: devNull,
  };
  const root = mkdtempSync(join(tmpdir(), 'propel-performance426-patch-'));
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, target.source);
    execFileSync('tar', ['-xf', archive, '-C', root], { env });
    for (const args of [
      ['apply', '--check', '--whitespace=error', '-'],
      ['apply', '--whitespace=error', '-'],
    ])
      execFileSync('git', args, {
        cwd: root,
        env,
        input: bytes,
        stdio: 'pipe',
      });
    for (const [p, digest] of Object.entries(after)) {
      const st = lstatSync(join(root, p));
      assert(
        st.isFile() && !st.isSymbolicLink() && (st.mode & 0o777) === 0o644,
      );
      assert.equal(sha(readFileSync(join(root, p))), digest);
    }
    for (const [p, before] of frame)
      if (!Object.hasOwn(after, p))
        assert.deepEqual(readFileSync(join(root, p)), before);
    // A fully materialized proposal is still not permission to promote it.
    return {
      source: target.source,
      patchSha256,
      exactAfter: after,
      canonicalChanges: false,
      sourcePromotionAuthorized: false,
      release: 'NO_GO',
    };
  } finally {
    try {
      assert.deepEqual(verifyCanonical(), frame);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(qualifyPromotion(), null, 2));
