// Test-fixture baseline ONLY. Never admits the author through launch source guards.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const client = 'server/invoices/commercial-draft-client.ts';
const caller = 'server/invoices/commercial-caller-connection.ts';
export const callerAuthor = '8f498f2c657608c64d40a3527be13b47a189b7b7';
const parent = '0e49670e6cc05473d3fd4e033b2c0f42b5fc10e0';
const oldHash =
  '12c1eb303f10f8cb9e6c5f765839419f55e4b6cfd16c6c6ef9f8812ccbb76194';
const hashes = {
  [client]: '94aa164e60c780cb53f8658b16c57bc9c17da5d9469c73f9d73cab627dcea694',
  [caller]: '3d892a8ae7757a6f480fde4638f17f4b642436ba728446dfd84811590be0aeed',
};
const hash = (v) => createHash('sha256').update(v).digest('hex');
const runGit = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args]);
export function proposalBaseline({
  read = readFileSync,
  stat = lstatSync,
  git = runGit,
} = {}) {
  const current = read(client),
    original = git('show', `${parent}:${client}`);
  assert.equal(hash(original), oldHash, 'Original proposal parent required');
  if (hash(current) === oldHash) {
    assert.throws(
      () => stat(caller),
      (e) => e.code === 'ENOENT',
      'Old proposal requires absent caller',
    );
    return { current, original, activeSourceAuthor: null };
  }
  assert.equal(
    git('show', '--no-patch', '--format=%P', callerAuthor).toString().trim(),
    parent,
    'Exact source-author parent required',
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      callerAuthor,
    )
      .toString()
      .trim(),
    `A\t${caller}\nM\t${client}`,
    'Only exact two-file author required',
  );
  for (const [path, expected] of Object.entries(hashes)) {
    const st = stat(path);
    assert(
      st.isFile() && !st.isSymbolicLink(),
      'Regular authored source required',
    );
    const actual = path === client ? current : read(path),
      authored = git('show', `${callerAuthor}:${path}`);
    assert.equal(
      hash(actual),
      expected,
      'Exact current source-author bytes required',
    );
    assert.equal(
      hash(authored),
      expected,
      'Exact committed source-author bytes required',
    );
    const tree = git('ls-tree', callerAuthor, '--', path).toString().trim();
    assert.match(
      tree,
      new RegExp(
        '^100644 blob [a-f0-9]{40}\\t' + path.replaceAll('.', '\\.') + '$',
      ),
      'Regular committed source required',
    );
  }
  return { current, original, activeSourceAuthor: callerAuthor };
}
