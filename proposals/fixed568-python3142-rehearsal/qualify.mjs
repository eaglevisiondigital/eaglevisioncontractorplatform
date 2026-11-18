/** Static content checker only; no Git ancestry admission or workflow execution. */
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const expected = {
  before: 'c660760a0a005c85af9ae1586225c01934b932b445d990fdd6ab3d343ce3701b',
  after: '5f2de721b9e092f0b7ca3382e3945dba6d932ba3797c3dc815e95a90011daadf',
  patch: '109189ceb7cdf4a85f1d135762b695bdeda56c06c89fd5f1a91653d071fa9f63',
  source: 'ec1487b2026d3d2f668178a9c05ec282fc9ce011d1b225e686681816c0377d03',
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = () => {
  throw Error('Exact held fixed568 ENV proposal content required');
};
function regular(path) {
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    realpathSync.native(path) !== path
  )
    fail();
  const s = lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o7777) !== 0o644) fail();
  return readFileSync(path);
}
function main() {
  if (
    process.argv.length !== 3 ||
    process.versions.node.split('.')[0] !== '24' ||
    typeof realpathSync.native !== 'function'
  )
    fail();
  const baseline = regular(process.argv[2]);
  if (hash(baseline) !== expected.before) fail();
  const packageRoot = fileURLToPath(new URL('.', import.meta.url)).replace(
    /\/$/,
    '',
  );
  const sourceBytes = regular(join(packageRoot, 'source.json'));
  if (hash(sourceBytes) !== expected.source) fail();
  const source = JSON.parse(sourceBytes);
  if (
    source.definitionParent !== '57d826efa6b101d99fb87abb43e4154a060c6bbf' ||
    source.beforeSHA256 !== expected.before ||
    source.afterSHA256 !== expected.after ||
    source.decodedPatchSHA256 !== expected.patch ||
    source.mode !== '100644' ||
    source.sourceAuthorApproved !== false ||
    source.executionApproved !== false ||
    source.wholeFoundationPass !== false
  )
    fail();
  const held = JSON.parse(regular(join(packageRoot, 'workflow.patch.json')));
  if (
    Object.keys(held).join(',') !== 'patch' ||
    typeof held.patch !== 'string' ||
    hash(held.patch) !== expected.patch
  )
    fail();
  const patch = held.patch.split('\n');
  if (patch.pop() !== '') fail();
  const target = '.github/workflows/foundation537-isolated-unit-candidate.yml';
  if (
    patch.shift() !== '--- a/' + target ||
    patch.shift() !== '+++ b/' + target
  )
    fail();
  const match = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(patch.shift());
  if (!match) fail();
  const oldStart = Number(match[1]),
    oldCount = Number(match[2]),
    newStart = Number(match[3]),
    newCount = Number(match[4]);
  const lines = baseline.toString('utf8').split('\n');
  if (lines.pop() !== '') fail();
  if (oldStart !== newStart || oldStart + oldCount - 1 !== lines.length) fail();
  let cursor = oldStart - 1,
    adding = false;
  const addition = [];
  for (const line of patch) {
    if (line.startsWith(' ')) {
      if (adding || line.slice(1) !== lines[cursor++]) fail();
    } else if (line.startsWith('+')) {
      adding = true;
      addition.push(line.slice(1));
    } else fail();
  }
  if (
    cursor !== lines.length ||
    oldCount + addition.length !== newCount ||
    !addition.length
  )
    fail();
  const after = Buffer.concat([
    baseline,
    Buffer.from(addition.join('\n') + '\n'),
  ]);
  if (
    hash(after) !== expected.after ||
    !after.subarray(0, baseline.length).equals(baseline)
  )
    fail();
  console.log(
    JSON.stringify({
      classification:
        'STATIC_CONTENT_BOUND_ENV_APPEND_NOT_AUTHOR_OR_EXECUTION_APPROVAL',
      definitionParent: source.definitionParent,
      decodedPatchSHA256: expected.patch,
      afterSHA256: expected.after,
      originalPrefixBytes: baseline.length,
      protectedFilesWritten: 0,
      acceptedSuitesRun: 0,
      gitAncestryOrCurrentFrameAttested: false,
    }),
  );
}
try {
  main();
} catch {
  console.error('Exact held fixed568 ENV proposal content required');
  process.exitCode = 1;
}
