import { expect, it } from 'vitest';
import {
  prepareP2Readiness,
  type P2CompanyBinding,
} from '../server/property/p2-readiness';
const id = () => crypto.randomUUID();
const staff = Array.from({ length: 15 }, id);
function bindings(): P2CompanyBinding[] {
  return Array.from({ length: 3 }, () => ({
    organization_id: id(),
    customer_id: id(),
    location_id: id(),
    user_id: id(),
    reports: Array.from({ length: 4 }, () => ({
      id: id(),
      sha256: 'a'.repeat(64),
    })),
  }));
}
it('prepares nine separate blocked cases without enabling broad release or any hosted action', () => {
  const p = prepareP2Readiness(bindings(), staff);
  expect(p.cases).toHaveLength(9);
  expect(new Set(p.cases.map((c) => c.id))).toEqual(
    new Set(['customer-report', 'foreign-customer', 'private-projection']),
  );
  expect(
    p.cases.every(
      (c) => c.status === 'BLOCKED' && c.foreignOrganizations.length === 2,
    ),
  ).toBe(true);
  expect(p).toMatchObject({
    hostedExecutor: false,
    writesPerformed: 0,
    leaseSeconds: 900,
    renewalAllowed: false,
    customerDebtDeltaMinor: 0,
    financialOrMediaAuthority: false,
  });
});
it.each([
  'duplicate-org',
  'duplicate-customer',
  'duplicate-property',
  'duplicate-user',
  'staff-customer',
  'missing-report',
  'duplicate-report',
  'missing-hash',
])(
  'rejects ambiguous or incomplete proposed customer evidence: %s',
  (attack) => {
    const b = bindings();
    if (attack === 'duplicate-org') b[1].organization_id = b[0].organization_id;
    if (attack === 'duplicate-customer') b[1].customer_id = b[0].customer_id;
    if (attack === 'duplicate-property') b[1].location_id = b[0].location_id;
    if (attack === 'duplicate-user') b[1].user_id = b[0].user_id;
    if (attack === 'staff-customer') b[0].user_id = staff[0];
    if (attack === 'missing-report') b[0].reports.pop();
    if (attack === 'duplicate-report') b[0].reports[0].id = b[1].reports[0].id;
    if (attack === 'missing-hash') b[0].reports[0].sha256 = '';
    expect(() => prepareP2Readiness(b, staff)).toThrow();
  },
);
