import { afterEach, expect, it, vi } from 'vitest';
const { from, insert, select, single } = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));
vi.mock('../../src/lib/supabase', () => ({ supabase: { from } }));
import { Operations, type CustomerDraft } from '../../src/lib/operations';
import {
  createCustomerOnce,
  customerCreateState,
} from '../../src/components/crm/customer-create-once';
afterEach(() => vi.resetAllMocks());
function wire() {
  from.mockReturnValue({ insert });
  insert.mockReturnValue({ select });
  select.mockReturnValue({ single });
}
const draft: CustomerDraft = {
  display_name: 'Fictional connected contract',
  email: ' TEST@EXAMPLE.INVALID ',
  phone: ' 555-0102 ',
  customer_type: 'commercial',
  preferred_contact: 'phone',
};
it('original connected insert remains the sole writer with exact tenant and normalized values', async () => {
  wire();
  const repo = new Operations(false),
    values = {
      ...draft,
      email: 'test@example.invalid',
      phone: '555-0102',
      organization_id: 'org',
    };
  single.mockResolvedValue({
    data: { ...values, id: 'returned-id', created_at: '2026-11-09T00:00:00Z' },
    error: null,
  });
  const form = {};
  await createCustomerOnce(repo, 'org', draft, form);
  await expect(createCustomerOnce(repo, 'org', draft, form)).rejects.toThrow(
    /already attempted/,
  );
  expect(from).toHaveBeenCalledExactlyOnceWith('customers');
  expect(insert).toHaveBeenCalledExactlyOnceWith(values);
  expect(single).toHaveBeenCalledTimes(1);
});
it('provider permission denial remains denied and cannot trigger a replacement insert', async () => {
  wire();
  const repo = new Operations(false);
  single.mockResolvedValue({
    data: null,
    error: { message: 'Permission denied' },
  });
  await expect(createCustomerOnce(repo, 'org', draft, {})).rejects.toThrow(
    /UNKNOWN/,
  );
  await expect(createCustomerOnce(repo, 'org', draft, {})).rejects.toThrow(
    /UNKNOWN/,
  );
  expect(insert).toHaveBeenCalledTimes(1);
  expect(customerCreateState(repo, 'org')).toBe('unknown');
});
