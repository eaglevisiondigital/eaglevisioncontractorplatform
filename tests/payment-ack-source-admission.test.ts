import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// Existing source-admission scripts are JavaScript build-time evidence, not runtime.
// @ts-expect-error No declaration file for this isolated evidence checker.
import { verifyPaymentAckAdmission } from '../scripts/check-payment-ack-admission.mjs';

const current = (path: string) => readFileSync(path);
const historical = (commit: string, path: string) =>
  execFileSync('git', ['--no-replace-objects', 'show', `${commit}:${path}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
it('admits only the reviewed patch while retaining original source objects and pins', () => {
  expect(verifyPaymentAckAdmission({ current, historical })).toMatchObject({
    historicalSources: 8,
    unchangedHistoricalPins: 4,
    classification: 'DEVELOPMENT_SOURCE_ONLY',
    operationalAcceptance: 'NOT_RUN',
    admittedSources: [
      'server/payments/control-store.ts',
      'server/payments/sandbox.ts',
      'server/payments/refunds.ts',
    ],
  });
});
it.each([
  'server/payments/control-store.ts',
  'server/payments/sandbox.ts',
  'server/payments/refunds.ts',
  'server/payments/postgres-store.ts',
  'server/providers/control.ts',
  'server/providers/safety.ts',
  'tests/fixtures/first-launch-merchants.ts',
  'server/payments/reconciliation.ts',
  'proposals/payment-outcome-ack/manifest.json',
  'proposals/payment-outcome-ack/proposed.patch',
  'proposals/payment-outcome-ack/acceptance.test.ts',
  'docs/program/CYCLE4_PROTECTED_SOURCE.json',
  'docs/FEATURE_SOURCE_INVENTORY.json',
  'tests/payments-outcome-ack.test.ts',
])('rejects an unknown edit in %s', (target) => {
  expect(() =>
    verifyPaymentAckAdmission({
      current: (path: string) =>
        path === target
          ? Buffer.concat([current(path), Buffer.from('\nUNKNOWN EDIT')])
          : current(path),
      historical,
    }),
  ).toThrow();
});
it('rejects incomplete or substituted historical checkout evidence', () => {
  expect(() =>
    verifyPaymentAckAdmission({
      current,
      historical: (commit: string, path: string) =>
        path === 'server/payments/control-store.ts'
          ? Buffer.from('substitution')
          : historical(commit, path),
    }),
  ).toThrow('Original parent source mismatch');
});
