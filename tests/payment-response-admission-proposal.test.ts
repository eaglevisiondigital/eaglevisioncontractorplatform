import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Isolated build-time source proposal, no runtime capability.
import { qualify } from '../proposals/payment-response-admission/qualify.mjs';
it.each([
  ['ack', 16],
  ['fixture', 13],
  ['combined', 8],
])(
  'qualifies retained %s controls and the actual ACK CLI without applying admission',
  (mode, cases) => {
    expect(qualify({ mode })).toMatchObject({
      status: 'PASS',
      cases,
      cli: 'PASS',
      canonicalSourceChanged: false,
      admissionAuthorized: false,
    });
  },
);
it('executes25 separate finite-author, source, mode, absence and late-freshness controls', () => {
  expect(qualify({ mode: 'negatives' })).toMatchObject({
    status: 'PASS',
    cases: 25,
    canonicalSourceChanged: false,
  });
});
it('denies unknown and coordinated candidate rebinding before importing any candidate helper', () => {
  for (const mode of [
    'unknown-adapter',
    'coordinated-fixture-rebind',
    'unknown-helper',
    'coordinated-rebind',
    'unknown-G',
    'unknown-F',
    'unknown-H',
    'unknown-decoder',
    'symlink-helper',
  ])
    expect(qualify({ mode })).toMatchObject({
      status: 'DENIED_BEFORE_IMPORT',
      canonicalSourceChanged: false,
    });
});
it('rejects replacement patch and jointly rebound evidence rather than accepting a self-authored hash', () => {
  const evidence = JSON.parse(
    readFileSync('proposals/payment-response-admission/evidence.json', 'utf8'),
  );
  evidence.patchSha256 = '0'.repeat(64);
  expect(() => qualify({ evidence, patch: Buffer.from('UNKNOWN') })).toThrow(
    'Exact finite admission record',
  );
  expect(() => qualify({ patch: Buffer.from('UNKNOWN') })).toThrow(
    'Exact finite admission patch',
  );
});
