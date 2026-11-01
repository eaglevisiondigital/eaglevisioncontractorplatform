import { expect, it } from 'vitest';
import { canonical } from '../server/property/command-custody';
import {
  authoritySteps,
  validateClaimRequest,
  type ClaimRequest,
} from '../server/property/command-authority';
const request = (): ClaimRequest => ({
  capability: crypto.randomUUID(),
  step: 'execute',
  args: [{ request_id: crypto.randomUUID() }],
  tx: {
    pid: 123,
    backend_start: '2026-10-29 12:00:00.123456+00',
    transaction_id: '123456789',
  },
});
it.each(authoritySteps)(
  'preserves exact request and transaction metadata for %s',
  (step) => {
    const r = request();
    r.step = step;
    const before = canonical(r);
    validateClaimRequest(r);
    expect(canonical(r)).toBe(before);
  },
);
it.each(['actor', 'custody_hash', 'trusted', 'retry', 'organization'])(
  'caller field %s is never independent authority',
  (field) =>
    expect(() =>
      validateClaimRequest({ ...request(), [field]: true }),
    ).toThrow(),
);
it.each([0, -1, NaN, 1.5])('rejects invalid backend PID %s', (pid) => {
  const r = request();
  r.tx.pid = pid;
  expect(() => validateClaimRequest(r)).toThrow();
});
it.each(['0', '-1', '1.5', '9223372036854775808', 'NaN'])(
  'rejects malformed transaction identity %s',
  (transaction_id) => {
    const r = request();
    r.tx.transaction_id = transaction_id;
    expect(() => validateClaimRequest(r)).toThrow();
  },
);
it('rejects extra metadata, financial steps, malformed args, timestamps and oversized wire data', () => {
  const r = request();
  for (const v of [
    { ...r, step: 'issue_estimate' },
    { ...r, args: {} },
    { ...r, tx: { ...r.tx, backend_start: 'invalid' } },
    { ...r, tx: { ...r.tx, actor: crypto.randomUUID() } },
    { ...r, args: ['x'.repeat(2097152)] },
  ])
    expect(() => validateClaimRequest(v)).toThrow();
});
