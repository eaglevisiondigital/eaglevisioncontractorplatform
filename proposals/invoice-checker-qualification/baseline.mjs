// Qualification fixture only. This cannot approve or promote a source admission.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const guard = 'tests/launch-invoice-payment-source.test.ts';
const helper = 'scripts/invoice-caller-source-admission.mjs';
const fixture = 'tests/invoice-caller-migration-source.test.ts';
export const checkerAuthor = '82c3ffd11499f9addbb92d6d5d7d1deb7e34d64c';
const parent = '177fa209f81f03e6d1d1e2cba2dab8c4a90e18b7';
const originalHash =
  '2167d4705c9de49c8d8bbecff0e3dc639ceacbc62c508181c42a1e1ac6a22370';
const authored = {
  [guard]: '52f0e7e62b74c0fff9b295cd855eac4419340097eee37237330a9fcf17ddb3b8',
  [helper]: 'e83139e1af82743bf9993fac2fb55c4d50e359e9681fd16d1a12001a41432dbf',
};
// Filled only with independently qualified proposal bytes; never an approval flag.
export const proposedAmendment = Object.freeze({
  patchSha256:
    'eb38c3fb88478d7773c590f86bae04ce5f3a87dfefc894e9e33051d66a35978a',
  admissionAuthorized: false,
  files: Object.freeze({
    [guard]: '9ed3efe744bdb9003d3d8459e62dd5fe9479475768df6cb58dc4d8257ef37b00',
    [helper]:
      '2a6ffb692443a7830df021e9a8cce048ac4388947e03a27af4286b4e26ee9a25',
    [fixture]:
      '4879c0b0f3da8bc2e5d981faae43fe443c317ffcd400b654fc550f0605149a08',
  }),
});
const hash = (v) => createHash('sha256').update(v).digest('hex');
const runGit = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args]);
export function qualificationBaseline({
  read = readFileSync,
  stat = lstatSync,
  git = runGit,
} = {}) {
  const current = read(guard),
    original = git('show', `${parent}:${guard}`);
  assert.equal(
    hash(original),
    originalHash,
    'Exact historical checker parent required',
  );
  if (hash(current) === originalHash) {
    assert.throws(
      () => stat(helper),
      (e) => e.code === 'ENOENT',
      'Original proposal requires absent helper',
    );
    return {
      current,
      original,
      frame: 'ORIGINAL_UNAPPLIED_PROPOSAL',
      checkerAuthor: null,
    };
  }
  assert.equal(
    git('show', '--no-patch', '--format=%P', checkerAuthor).toString().trim(),
    parent,
    'Exact checker-author parent required',
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      checkerAuthor,
    )
      .toString()
      .trim(),
    `A\t${helper}\nM\t${guard}`,
    'Exact two-file checker author required',
  );
  for (const [path, expected] of Object.entries(authored)) {
    const tree = git('ls-tree', checkerAuthor, '--', path).toString().trim();
    assert.match(
      tree,
      /^100644 blob [a-f0-9]{40}\t/,
      'Regular checker author required',
    );
    assert.equal(tree.split('\t')[1], path);
    assert.equal(
      hash(git('show', `${checkerAuthor}:${path}`)),
      expected,
      'Exact published checker required',
    );
    const info = stat(path);
    assert(
      info.isFile() && !info.isSymbolicLink(),
      'Regular active checker required',
    );
  }
  const active =
    hash(current) === authored[guard] &&
    hash(read(helper)) === authored[helper];
  if (active)
    return {
      current,
      original,
      frame: 'APPROVED_CHECKER_AUTHOR_ONLY',
      checkerAuthor,
    };
  if (proposedAmendment) {
    assert.equal(
      hash(read('proposals/invoice-caller-transition/amendment.patch')),
      proposedAmendment.patchSha256,
      'Exact unapplied test amendment required',
    );
    const pins = proposedAmendment.files;
    assert.equal(
      hash(current),
      pins[guard],
      'Exact proposed guard fixture required',
    );
    assert.equal(
      hash(read(helper)),
      pins[helper],
      'Exact proposed helper fixture required',
    );
    const info = stat(fixture);
    assert(info.isFile() && !info.isSymbolicLink());
    assert.equal(
      hash(read(fixture)),
      pins[fixture],
      'Exact proposed historical fixture required',
    );
    return {
      current,
      original,
      frame: 'UNAPPLIED_AMENDMENT_TEST_BYTES',
      checkerAuthor,
    };
  }
  throw Error('Unknown checker qualification source');
}
