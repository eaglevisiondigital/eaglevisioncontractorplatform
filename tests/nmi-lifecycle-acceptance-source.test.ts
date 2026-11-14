import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  nmiAcceptanceParent,
  nmiAcceptanceSources,
  verifyNmiAcceptanceSources,
} from './fixtures/nmi-lifecycle-sources';

it('binds this synthetic composition to all exact consumed452 runtime/fixture/migration sources', () => {
  expect(nmiAcceptanceParent).toBe('e2414b42fcf1acc65c0d40a11d917cee8121fc04');
  expect(verifyNmiAcceptanceSources()).toBe(
    Object.keys(nmiAcceptanceSources).length,
  );
});
it.each([
  'server/payments/nmi-payment-lookup.ts',
  'server/providers/safety.ts',
  'supabase/migrations/20261016185108_provider_sandbox_persistence.sql',
])(
  'denies changed canonical source %s before synthetic composition',
  (changed) =>
    expect(() =>
      verifyNmiAcceptanceSources((path) =>
        path === changed ? Buffer.from('changed') : readFileSync(path),
      ),
    ).toThrow('NMI acceptance source mismatch: ' + changed),
);
it('does not replace missing source with a fallback', () => {
  expect(() =>
    verifyNmiAcceptanceSources(() => {
      throw Error('fixture read unavailable');
    }),
  ).toThrow('fixture read unavailable');
});

it('freezes expected source pins against runtime hash rebinding or deletion', () => {
  expect(Object.isFrozen(nmiAcceptanceSources)).toBe(true);
  const path = 'server/payments/nmi-payment-lookup.ts';
  const original = nmiAcceptanceSources[path];
  expect(Reflect.set(nmiAcceptanceSources, path, 'a'.repeat(64))).toBe(false);
  expect(Reflect.deleteProperty(nmiAcceptanceSources, path)).toBe(false);
  expect(nmiAcceptanceSources[path]).toBe(original);
  expect(verifyNmiAcceptanceSources()).toBe(
    Object.keys(nmiAcceptanceSources).length,
  );
});
