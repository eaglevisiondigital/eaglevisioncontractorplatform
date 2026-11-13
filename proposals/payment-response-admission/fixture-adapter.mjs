// Test-fixture compatibility only; immutable historical checks do not admit live sources.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const frame = {
  'scripts/check-payment-ack-admission.mjs':
    'b936bbd53def10eb7604b840ebe56262073001f30f0191247307eb54940a67ad',
  'scripts/invoice-caller-source-admission.mjs':
    'af67c7836222779cd8322c08b3d5a72816760abc345a9d45cab97f85beacd133',
  'scripts/payment-response-source-admission.mjs':
    'aa8871b0fa334bfd2ffdb36c314650e51e56ceea41a983e13c0b42a60084dfcd',
  'tests/invoice-caller-migration-source.test.ts':
    '6b803d33d5c8b9ca02abcbce59b8796f9691b44a82c97290974ea9a4a2892d69',
  'tests/launch-invoice-payment-source.test.ts':
    'bf366bff56157c0b94c174c91d8a9fbc76cb95e836d9387a2d61104e44fc873a',
  'server/payments/refunds.ts':
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  'server/payments/sandbox.ts':
    '828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb',
  'server/payments/response-json.ts':
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
};
const author = '96b654ee16c229653cb1c046c579af77573b045a';
const parent = '892bf5127af2268e6066a20d259a808b5b893cec';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const runGit = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export function verifyPaymentFrame({
  read = readFileSync,
  stat = lstatSync,
  git = runGit,
} = {}) {
  const checkFrame = () => {
    for (const [path, digest] of Object.entries(frame)) {
      let prefix = '';
      for (const segment of path.split('/')) {
        prefix = prefix ? prefix + '/' + segment : segment;
        assert(
          !stat(prefix).isSymbolicLink(),
          'Exact live payment frame required',
        );
      }
      const info = stat(path);
      assert(
        info.isFile() && (info.mode & 0o777) === 0o644,
        'Exact live payment mode required',
      );
      assert.equal(
        hash(read(path)),
        digest,
        'Exact live payment frame required',
      );
    }
  };
  checkFrame();
  assert.equal(
    git('show', '--no-patch', '--format=%P', author).toString().trim(),
    parent,
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      author,
    )
      .toString()
      .trim(),
    'M\tserver/payments/refunds.ts\nA\tserver/payments/response-json.ts\nM\tserver/payments/sandbox.ts',
  );
  for (const path of [
    'server/payments/refunds.ts',
    'server/payments/response-json.ts',
    'server/payments/sandbox.ts',
  ]) {
    const tree = git('ls-tree', author, '--', path).toString().trim();
    assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
    assert.equal(tree.split('\t')[1], path);
    assert.equal(hash(git('show', author + ':' + path)), frame[path]);
  }
  assert.equal(
    git('ls-tree', parent, '--', 'server/payments/response-json.ts')
      .toString()
      .trim(),
    '',
  );
  assert.equal(
    hash(git('show', parent + ':server/payments/refunds.ts')),
    '78f74ab633f3ba192d447ffb1b77f8d027c38df49ea0fd6f06b9fb65df2490a5',
  );
  assert.equal(
    hash(git('show', parent + ':server/payments/sandbox.ts')),
    '89dc2b03f273ee00c73e8342fcf9e8db6d78d5f898bde96ccff94e69fc0276cc',
  );
  // Metadata callbacks must not leave a stale pre-metadata live frame.
  checkFrame();
  return true;
}
