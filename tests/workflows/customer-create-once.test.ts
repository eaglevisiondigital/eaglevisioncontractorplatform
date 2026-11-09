import { afterEach, expect, it, vi } from 'vitest';
import { Operations, type CustomerDraft } from '../../src/lib/operations';
import { sampleCompanies } from '../../src/domain/platform';
import {
  createCustomerOnce,
  customerCreateState,
  subscribeCustomerCreate,
} from '../../src/components/crm/customer-create-once';
afterEach(() => vi.restoreAllMocks());
const draft: CustomerDraft = {
  display_name: 'Fictional new customer',
  email: '  FICTIONAL@EXAMPLE.INVALID  ',
  phone: '  555-0101  ',
  customer_type: 'residential',
  preferred_contact: 'email',
};
it.each(sampleCompanies)(
  'exact $slug customer creates once, normalizes original values and reopens through canonical reader',
  async (company) => {
    const repo = new Operations(true),
      form = {};
    const spy = vi.spyOn(repo, 'saveCustomer');
    const first = createCustomerOnce(repo, company.id, draft, form);
    const duplicate = createCustomerOnce(repo, company.id, draft, form);
    const parallel = createCustomerOnce(repo, company.id, draft, {});
    await expect(duplicate).rejects.toThrow(/already attempted/);
    await expect(parallel).rejects.toThrow(/pending/);
    const saved = await first;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(saved.organization_id).toBe(company.id);
    expect(saved.email).toBe('fictional@example.invalid');
    expect(saved.phone).toBe('555-0101');
    expect(await repo.getCustomer(company.id, saved.id)).toEqual(saved);
    expect(
      (await repo.listCustomers(company.id, draft.display_name)).rows,
    ).toEqual([saved]);
    await expect(
      repo.getCustomer(
        sampleCompanies.find((c) => c.id !== company.id)!.id,
        saved.id,
      ),
    ).rejects.toThrow();
    await expect(
      createCustomerOnce(repo, company.id, draft, form),
    ).rejects.toThrow(/already attempted/);
    expect(customerCreateState(repo, company.id)).toBeUndefined();
  },
);
it('known success permits a separate deliberate new form, never a replay of the completed form', async () => {
  const repo = new Operations(true),
    form = {};
  const one = await createCustomerOnce(
    repo,
    sampleCompanies[0].id,
    draft,
    form,
  );
  const two = await createCustomerOnce(
    repo,
    sampleCompanies[0].id,
    { ...draft, display_name: 'Another deliberate customer' },
    {},
  );
  expect(one.id).not.toBe(two.id);
});
it.each([false, true])(
  'lost ACK committed=%s keeps a company/session hold across replacement forms without inferring failure',
  async (committed) => {
    const repo = new Operations(true),
      org = sampleCompanies[0].id,
      original = repo.saveCustomer.bind(repo);
    const spy = vi
      .spyOn(repo, 'saveCustomer')
      .mockImplementation(async (...args) => {
        if (committed) await original(...args);
        throw Error('Sensitive transport detail must not escape');
      });
    await expect(createCustomerOnce(repo, org, draft, {})).rejects.toThrow(
      /UNKNOWN/,
    );
    await expect(
      createCustomerOnce(
        repo,
        org,
        { ...draft, display_name: 'Replacement' },
        {},
      ),
    ).rejects.toThrow(/UNKNOWN/);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await repo.listCustomers(org, draft.display_name)).count).toBe(
      committed ? 1 : 0,
    );
    expect(customerCreateState(repo, org)).toBe('unknown');
    expect(customerCreateState(repo, sampleCompanies[1].id)).toBeUndefined();
    expect(customerCreateState(new Operations(true), org)).toBeUndefined();
  },
);
it.each(['tenant', 'name', 'email', 'id'])(
  'malformed %s acknowledgment cannot release a creation hold',
  async (field) => {
    const repo = new Operations(true),
      org = sampleCompanies[0].id,
      original = repo.saveCustomer.bind(repo);
    vi.spyOn(repo, 'saveCustomer').mockImplementation(async (...args) => {
      const row = await original(...args);
      return {
        ...row,
        ...(field === 'tenant'
          ? { organization_id: 'foreign' }
          : field === 'name'
            ? { display_name: 'different' }
            : field === 'email'
              ? { email: 'different@example.invalid' }
              : { id: '' }),
      };
    });
    await expect(createCustomerOnce(repo, org, draft, {})).rejects.toThrow(
      /UNKNOWN/,
    );
    expect(customerCreateState(repo, org)).toBe('unknown');
    expect((await repo.listCustomers(org, draft.display_name)).count).toBe(1);
  },
);
it('invalid original name is rejected before admission, permitting correction without an attempted writer', async () => {
  const repo = new Operations(true),
    org = sampleCompanies[0].id,
    form = {},
    spy = vi.spyOn(repo, 'saveCustomer');
  await expect(
    createCustomerOnce(repo, org, { ...draft, display_name: ' ' }, form),
  ).rejects.toThrow(/customer name/);
  expect(spy).not.toHaveBeenCalled();
  expect(customerCreateState(repo, org)).toBeUndefined();
  await createCustomerOnce(repo, org, draft, form);
  expect(spy).toHaveBeenCalledTimes(1);
});
it('mounted forms receive pending/success or UNKNOWN state without polling, and unsubscribe removes listeners', async () => {
  const repo = new Operations(true),
    org = sampleCompanies[0].id,
    states: unknown[] = [];
  const stop = subscribeCustomerCreate(repo, org, () =>
    states.push(customerCreateState(repo, org)),
  );
  await createCustomerOnce(repo, org, draft, {});
  expect(states).toEqual(['pending', undefined]);
  stop();
  await createCustomerOnce(repo, org, { ...draft, display_name: 'Other' }, {});
  expect(states).toHaveLength(2);
});
