import { expect, it } from 'vitest';
import { money, paymentCapabilities } from '../src/domain/platform';
it('keeps money in safe integer minor units and requires an explicit currency', () => {
  expect(money(10001, 'USD')).toEqual({ minorUnits: 10001, currency: 'USD' });
  for (const amount of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => money(amount, 'USD')).toThrow();
  expect(() => money(100, 'usd')).toThrow();
});
it('keeps all financial execution capabilities off', () => {
  expect(Object.values(paymentCapabilities).every((v) => v === false)).toBe(
    true,
  );
  expect(Object.isFrozen(paymentCapabilities)).toBe(true);
});
