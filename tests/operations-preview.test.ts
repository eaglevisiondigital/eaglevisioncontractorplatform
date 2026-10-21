import { expect, it } from 'vitest';
import { Operations } from '../src/lib/operations';
it('paginates and filters synthetic CRM records without mixing company workspaces', async () => {
  const repo = new Operations(true);
  for (let i = 0; i < 13; i++)
    await repo.saveCustomer('sample-property', {
      display_name: `Synthetic Customer ${i}`,
      email: `test${i}@example.test`,
      phone: '555-0101',
      customer_type: i % 2 === 0 ? 'commercial' : 'residential',
      preferred_contact: 'phone',
    });
  const first = await repo.listCustomers('sample-property', '', '', 0);
  const next = await repo.listCustomers('sample-property', '', '', 1);
  expect(first.count).toBe(14);
  expect(first.rows).toHaveLength(10);
  expect(next.rows).toHaveLength(4);
  expect(new Set([...first.rows, ...next.rows].map((c) => c.id)).size).toBe(14);
  expect((await repo.listCustomers('sample-construction')).count).toBe(1);
  expect(
    (await repo.listCustomers('sample-property', 'Customer 12', 'commercial'))
      .count,
  ).toBe(1);
  expect(
    await repo.duplicates('sample-construction', 'test1@example.test', ''),
  ).toEqual([]);
  expect(
    await repo.duplicates('sample-property', 'test1@example.test', ''),
  ).toHaveLength(1);
});
it('keeps sample changes in memory and enforces company ownership when editing a sample record', async () => {
  const one = new Operations(true);
  const customer = (await one.listCustomers('sample-property')).rows[0];
  await expect(
    one.saveCustomer(
      'sample-construction',
      {
        display_name: 'Forged',
        email: null,
        phone: null,
        customer_type: 'residential',
        preferred_contact: 'phone',
      },
      customer.id,
    ),
  ).rejects.toThrow();
  await one.saveCustomer(
    'sample-property',
    {
      display_name: 'Updated Synthetic Name',
      email: null,
      phone: null,
      customer_type: 'residential',
      preferred_contact: 'phone',
    },
    customer.id,
  );
  expect(
    (await new Operations(true).listCustomers('sample-property')).rows[0]
      .display_name,
  ).toBe('Jordan Example');
});
