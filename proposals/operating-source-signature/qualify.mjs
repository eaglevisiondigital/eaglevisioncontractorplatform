// Offline source-proposal qualification. No canonical writes or admission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { compareSignatures } from './differential.mjs';
export const sourcePath = 'src/lib/workflows/operating-center-runtime.ts';
const directory = 'proposals/operating-source-signature';
const expected = Object.freeze({
  classification: 'UNAPPLIED_OFFLINE_SOURCE_PROPOSAL',
  parent: 'af36a27e34b77bfef3700d7cd87fdb39c4dc50d5',
  path: sourcePath,
  beforeSha256:
    '7a5272ae344400714dea1efe727a40c19a10c96ccfdf70f7321e127488bbd239',
  proposedSha256:
    'a789309d7f8710f2e3150f4cbc8f8acc5aee9c99633c7611e503db089bcd2544',
  patchSha256:
    'da9db5c5e953c859ab24dc127c48b1d78e0cd1d6e2b7bbe9edf4b444a40ae4a0',
  canonicalSourceChanged: false,
  authorCreated: false,
  admissionAuthorized: false,
  requiredBoundaries: [
    'Cycle9 exact runtime hash',
    'Cycle24 exact critical Git endpoint',
  ],
  sourceAndAuthorityCaching: false,
  assertionsOrBudgetsChanged: false,
  hostedAcceptance: 'NOT_RUN',
  release: 'NOT_READY_NOT_AUTHORIZED',
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function functionText(source) {
  const start = source.indexOf('function dataSignature('),
    end = source.indexOf('function approvedCompany(');
  assert(
    start >= 0 && end > start,
    'Exact private signature function boundaries required',
  );
  return {
    head: source.slice(0, start),
    body: source.slice(start, end),
    tail: source.slice(end),
  };
}
export function qualify({
  patch = readFileSync(join(directory, 'correction.patch')),
  evidence = JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8')),
} = {}) {
  assert.deepEqual(
    evidence,
    expected,
    'Exact reviewed unapplied scope required',
  );
  assert.equal(
    hash(patch),
    expected.patchSha256,
    'Exact reviewed patch required',
  );
  const before = readFileSync(sourcePath);
  assert.equal(
    hash(before),
    expected.beforeSha256,
    'Canonical source remains original',
  );
  assert.deepEqual(
    before,
    execFileSync('git', [
      '--no-replace-objects',
      'show',
      `${expected.parent}:${sourcePath}`,
    ]),
    'Exact original parent source required',
  );
  const sandbox = mkdtempSync(join(tmpdir(), 'propel-source-signature-'));
  let proposed;
  try {
    mkdirSync(dirname(join(sandbox, sourcePath)), { recursive: true });
    writeFileSync(join(sandbox, sourcePath), before);
    // Exact patch bytes are pinned before invoking Git. The only destination is
    // a fresh disposable working directory, not the repository or an index.
    const file = join(sandbox, 'approved.patch');
    writeFileSync(file, patch);
    const env = {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: devNull,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CEILING_DIRECTORIES: sandbox,
    };
    execFileSync('git', ['apply', '--', file], {
      cwd: sandbox,
      env,
      stdio: 'pipe',
    });
    proposed = readFileSync(join(sandbox, sourcePath));
    assert.equal(
      hash(proposed),
      expected.proposedSha256,
      'Exact proposed source required',
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
  const old = functionText(before.toString()),
    next = functionText(proposed.toString());
  assert.equal(next.head, old.head);
  assert.equal(next.tail, old.tail);
  const differential = compareSignatures(old.body, next.body);
  assert.deepEqual(
    readFileSync(sourcePath),
    before,
    'Canonical source must remain untouched',
  );
  return {
    differential,
    proposed: proposed.toString(),
    original: before.toString(),
  };
}
export function proposalPath() {
  return resolve(directory);
}
