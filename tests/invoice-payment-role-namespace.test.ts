import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const own = readFileSync(
  'tests/database/invoice-payment-receipt-proposal.test.ts',
  'utf8',
);
const capacity = readFileSync(
  'tests/database/commercial-payment-capacity-proposal.test.ts',
  'utf8',
);
const pairs = [
  ['propel_capacity_test_owner', 'propel_invoice_payment_fixture_owner'],
  ['propel_capacity_test_draft', 'propel_invoice_payment_fixture_draft'],
  ['propel_capacity_test_issuer', 'propel_invoice_payment_fixture_issuer'],
  ['propel_capacity_test_guard', 'propel_invoice_payment_fixture_guard'],
] as const;
function roles(source: string) {
  const start = source.indexOf('const fixtureRoleNames = [');
  expect(start).toBeGreaterThan(0);
  return [
    ...source
      .slice(start, source.indexOf('];', start))
      .matchAll(/'([a-z0-9_]+)'/g),
  ].map((m) => m[1]);
}
it('uses separate file-owned PostgreSQL roles, despite per-file databases sharing the same cluster', () => {
  const current = roles(own),
    other = roles(capacity);
  expect(current).toHaveLength(5);
  expect(new Set(current).size).toBe(5);
  expect(current.every((r) => !other.includes(r))).toBe(true);
  expect(current).toEqual([
    ...pairs.map((p) => p[1]),
    'propel_invoice_payment_test_owner',
  ]);
});
it('changes only the four owned fixture names; preserves every original476 assertion/grant/flag/cleanup/budget', () => {
  let restored = own;
  for (const [before, after] of pairs) {
    expect(own.split(after)).toHaveLength(2);
    expect(own).not.toContain(before);
    restored = restored.replace(after, before);
  }
  expect(createHash('sha256').update(restored).digest('hex')).toBe(
    '6f0f3b42677de4e764d2bc1bf26acd6cd57351f97ea0dd499465d9ec0e52b443',
  );
});
it('retains historical source manifest evidence instead of silently rebinding accepted test hashes', () => {
  const manifest = JSON.parse(
    readFileSync('proposals/invoice-payment-receipt/source.json', 'utf8'),
  );
  expect(
    manifest.files['tests/database/invoice-payment-receipt-proposal.test.ts'],
  ).toBe('6f0f3b42677de4e764d2bc1bf26acd6cd57351f97ea0dd499465d9ec0e52b443');
  expect(manifest.installationAuthorized).toBe(false);
  expect(manifest.financialExecutionAuthorized).toBe(false);
});
it('never adds role-exists suppression, edits a foreign role, skips original cases or changes worker limits', () => {
  const names = roles(own);
  expect(own).not.toMatch(
    /if not exists|alter role|drop role if exists|disable trigger|--maxWorkers/i,
  );
  expect(own).toContain(
    'for (const r of [...roles, ...readers, ...fixtureRoleNames])',
  );
  expect(own).toContain('if (!/^[a-z0-9_]+$/.test(r))');
  expect(names.every((n) => n.startsWith('propel_invoice_payment_'))).toBe(
    true,
  );
});
