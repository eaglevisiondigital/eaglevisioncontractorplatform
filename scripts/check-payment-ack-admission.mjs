// Finite development-source admission. No credentials, network or provider calls.
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exact source helper is validated before its captured bytes are imported.
const responseHelperPath = new URL(
  './payment-response-source-admission.mjs',
  import.meta.url,
);
if (
  !lstatSync(responseHelperPath).isFile() ||
  lstatSync(responseHelperPath).isSymbolicLink()
)
  throw Error('Reviewed payment response helper required');
const responseHelperBytes = readFileSync(responseHelperPath);
if (
  createHash('sha256').update(responseHelperBytes).digest('hex') !==
  'aa8871b0fa334bfd2ffdb36c314650e51e56ceea41a983e13c0b42a60084dfcd'
)
  throw Error('Reviewed payment response helper required');
const { admitPaymentResponseSource } = await import(
  'data:text/javascript;base64,' + responseHelperBytes.toString('base64')
);

const proposalCommit = '5aa7927932323be0f67a908923a9c7ffa92d5d2e';
const parent = '4a54d390bd37024a10469b9f6cdcab6d38724a49';
export const approvedPatch =
  '09ff6790130e52436522c6b5e6b210f82bc785d19bbecc2d768a51af3eb60eae';
const proposalFiles = {
  'manifest.json':
    '6cd2cdf946c9944b6c2246f6fd3ff7f9698aa2ac6c078d29abfa1ec463aca069',
  'proposed.patch': approvedPatch,
  'verify.mjs':
    '2668adccdc5a9d5a5e87d94316b0b1694f272e8f8eab2761fc70113b3a4d29c6',
  'acceptance.test.ts':
    '6ff2ffaf2d06471096a920a44a4d4714560db7d780b004e5529885b6db372927',
  'README.md':
    'eb892dffc7b7fc62dd9ea3a4a156e81621dd4a4ebecddc5258aa4e2ba0555635',
};
const historicalPins = [
  'docs/FEATURE_SOURCE_INVENTORY.json',
  'docs/MAINTENANCE_COMMAND_AUTHORITY_VALIDATION.json',
  'docs/MAINTENANCE_SECURITY_VALIDATION.json',
  'docs/program/CYCLE4_PROTECTED_SOURCE.json',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function verifyPaymentAckAdmission({ current, historical }) {
  for (const [file, expected] of Object.entries(proposalFiles)) {
    const path = 'proposals/payment-outcome-ack/' + file;
    if (
      hash(current(path)) !== expected ||
      hash(historical(proposalCommit, path)) !== expected
    )
      throw Error('Original proposal changed: ' + path);
  }
  const manifest = JSON.parse(
    current('proposals/payment-outcome-ack/manifest.json').toString('utf8'),
  );
  if (
    manifest.parent !== parent ||
    manifest.patchSha256 !== approvedPatch ||
    manifest.sources.length !== 8
  )
    throw Error('Exact reviewed proposal required');
  const admitted = [];
  for (const source of manifest.sources) {
    for (const commit of [parent, proposalCommit])
      if (hash(historical(commit, source.path)) !== source.sha256)
        throw Error('Original parent source mismatch: ' + source.path);
    const expected = source.proposedSha256 ?? source.sha256;
    if (
      hash(current(source.path)) !== expected &&
      !admitPaymentResponseSource(source.path, current(source.path), expected, {
        readCurrent: current,
        readOriginal: historical,
      })
    )
      throw Error('Unreviewed current source: ' + source.path);
    if (source.proposedSha256) admitted.push(source.path);
  }
  if (
    admitted.join('|') !==
    'server/payments/control-store.ts|server/payments/sandbox.ts|server/payments/refunds.ts'
  )
    throw Error('Finite three-file admission required');
  for (const path of historicalPins)
    if (hash(current(path)) !== hash(historical(proposalCommit, path)))
      throw Error('Historical protected evidence changed: ' + path);
  if (
    hash(current('tests/payments-outcome-ack.test.ts')) !==
    proposalFiles['acceptance.test.ts']
  )
    throw Error('Original acceptance assertions changed');
  return {
    proposalCommit,
    parent,
    patchSha256: approvedPatch,
    historicalSources: 8,
    admittedSources: admitted,
    unchangedHistoricalPins: historicalPins.length,
    classification: 'DEVELOPMENT_SOURCE_ONLY',
    operationalAcceptance: 'NOT_RUN',
  };
}
export function checkPaymentAckAdmission(root = process.cwd()) {
  function current(path) {
    let file = root;
    for (const part of path.split('/')) {
      file = resolve(file, part);
      if (lstatSync(file).isSymbolicLink())
        throw Error('Exact regular source required');
    }
    if (!lstatSync(file).isFile()) throw Error('Exact regular source required');
    return readFileSync(file);
  }
  const historical = (commit, path) =>
    execFileSync('git', ['--no-replace-objects', 'show', `${commit}:${path}`], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return verifyPaymentAckAdmission({ current, historical });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(checkPaymentAckAdmission()));
