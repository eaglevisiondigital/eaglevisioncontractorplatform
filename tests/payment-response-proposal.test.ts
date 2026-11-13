import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const proposal = await import(
  new URL(
    '../proposals/payment-response-integrity/qualify.mjs',
    import.meta.url,
  ).href
);
it('qualifies seventy actual copied capture/refund wire controls without database or provider execution', () => {
  expect(proposal.qualify()).toEqual({
    mode: 'units',
    result: 'COPIED_SOURCE_PASS',
    passed: 70,
    failed: 0,
    originalNativeCasesFiltered: 0,
    canonicalSourceChanged: false,
    admissionAuthorized: false,
    providerAcceptance: 'NOT_RUN',
  });
});
it('rejects unreviewed patch bytes before loading a copied source', () => {
  expect(() =>
    proposal.qualify({ patch: Buffer.from('UNKNOWN PATCH') }),
  ).toThrow('Exact proposed patch');
});
it('rejects invented approval metadata before loading a copied source', () => {
  const record = JSON.parse(
    readFileSync('proposals/payment-response-integrity/evidence.json', 'utf8'),
  );
  record.admissionAuthorized = true;
  expect(() =>
    proposal.qualify({ evidence: Buffer.from(JSON.stringify(record)) }),
  ).toThrow('Exact unapplied evidence');
});
