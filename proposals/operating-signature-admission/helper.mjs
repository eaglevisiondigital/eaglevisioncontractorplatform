// Proposed build/test source admission ONLY. No application authority.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const signatureSource = Object.freeze({
  path: 'src/lib/workflows/operating-center-runtime.ts',
  parent: 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5',
  author: 'c50ce4521fbc264276734a9f8909b525c9a7c2f8',
  originalHash:
    '7a5272ae344400714dea1efe727a40c19a10c96ccfdf70f7321e127488bbd239',
  authorHash:
    'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544',
});
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const signatureGit = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args]);
export function admitOperatingSignatureSource(
  path,
  current,
  historicalHash,
  git = signatureGit,
) {
  if (path !== signatureSource.path) return false;
  const fail = () => {
    throw Error('Exact reviewed operating-signature author required');
  };
  if (historicalHash !== signatureSource.originalHash) fail();
  const old = git('show', `${signatureSource.parent}:${path}`);
  const authored = git('show', `${signatureSource.author}:${path}`);
  if (
    sha(old) !== signatureSource.originalHash ||
    sha(authored) !== signatureSource.authorHash ||
    !Buffer.from(current).equals(authored)
  )
    fail();
  if (
    git('show', '--no-patch', '--format=%P', signatureSource.author)
      .toString()
      .trim() !== signatureSource.parent
  )
    fail();
  if (
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      signatureSource.author,
    )
      .toString()
      .trim() !== `M\t${path}`
  )
    fail();
  for (const commit of [signatureSource.parent, signatureSource.author]) {
    const tree = git('ls-tree', commit, '--', path).toString().trim();
    if (
      !/^100644 blob [a-f0-9]{40}\t/.test(tree) ||
      tree.split('\t')[1] !== path
    )
      fail();
  }
  return true;
}
