// Finite development source proof only. No runtime/provider/launch authority.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
const author = '96b654ee16c229653cb1c046c579af77573b045a';
const parent = '892bf5127af2268e6066a20d259a808b5b893cec';
const files = {
  'server/payments/refunds.ts': [
    '78f74ab633f3ba192d447ffb1b77f8d027c38df49ea0fd6f06b9fb65df2490a5',
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  ],
  'server/payments/response-json.ts': [
    null,
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  ],
  'server/payments/sandbox.ts': [
    '89dc2b03f273ee00c73e8342fcf9e8db6d78d5f898bde96ccff94e69fc0276cc',
    '828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb',
  ],
};
const delta =
  'M\tserver/payments/refunds.ts\nA\tserver/payments/response-json.ts\nM\tserver/payments/sandbox.ts';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export function admitPaymentResponseSource(
  path,
  current,
  expected,
  {
    readCurrent = readFileSync,
    readOriginal = (commit, p) => git('show', `${commit}:${p}`),
    metadata = git,
    stat = lstatSync,
  } = {},
) {
  if (!Object.hasOwn(files, path) || files[path][0] === null) return false;
  const fail = () => {
    throw Error('Exact finite payment response source required');
  };
  const checkCurrent = (p, after) => {
    let prefix = '';
    for (const part of p.split('/')) {
      prefix = prefix ? prefix + '/' + part : part;
      if (stat(prefix).isSymbolicLink()) fail();
    }
    const info = stat(p);
    if (!info.isFile() || (info.mode & 0o777) !== 0o644) fail();
    const fresh = readCurrent(p);
    if (
      hash(fresh) !== after ||
      (p === path && !Buffer.from(current).equals(fresh))
    )
      fail();
  };
  if (expected !== files[path][0]) fail();
  if (
    metadata('show', '--no-patch', '--format=%P', author).toString().trim() !==
    parent
  )
    fail();
  if (
    metadata(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      author,
    )
      .toString()
      .trim() !== delta
  )
    fail();
  for (const [p, [before, after]] of Object.entries(files)) {
    const tree = metadata('ls-tree', author, '--', p).toString().trim();
    if (!/^100644 blob [a-f0-9]{40}\t/.test(tree) || tree.split('\t')[1] !== p)
      fail();
    const oldTree = metadata('ls-tree', parent, '--', p).toString().trim();
    if (before === null) {
      if (oldTree !== '') fail();
    } else if (
      !/^100644 blob [a-f0-9]{40}\t/.test(oldTree) ||
      oldTree.split('\t')[1] !== p ||
      hash(readOriginal(parent, p)) !== before
    )
      fail();
    if (hash(readOriginal(author, p)) !== after) fail();
    checkCurrent(p, after);
  }
  // A later lineage/read check may withdraw an earlier source; check the full bundle again.
  for (const [p, [, after]] of Object.entries(files)) checkCurrent(p, after);
  return true;
}
