import type { Operations, Customer, CustomerDraft } from '../../lib/operations';
// UI command guards only. Canonical records remain owned by Operations/SQL.
// Lost insert ACK has no original command receipt/idempotency key: do not infer
// failure from search results or bypass uncertainty with another new form.
const companies = new WeakMap<Operations, Map<string, 'pending' | 'unknown'>>();
const usedForms = new WeakSet<object>();
const listeners = new WeakMap<Operations, Map<string, Set<() => void>>>();
export function subscribeCustomerCreate(
  repo: Operations,
  org: string,
  listener: () => void,
) {
  const groups = listeners.get(repo) ?? new Map<string, Set<() => void>>();
  const group = groups.get(org) ?? new Set<() => void>();
  group.add(listener);
  groups.set(org, group);
  listeners.set(repo, groups);
  return () => {
    group.delete(listener);
    if (!group.size) groups.delete(org);
  };
}
function notify(repo: Operations, org: string) {
  for (const listener of listeners.get(repo)?.get(org) ?? []) listener();
}
export function customerCreateState(repo: Operations, org: string) {
  return companies.get(repo)?.get(org);
}
export async function createCustomerOnce(
  repo: Operations,
  org: string,
  draft: CustomerDraft,
  form: object,
): Promise<Customer> {
  if (usedForms.has(form))
    throw Error(
      'This customer creation was already attempted. Do not resubmit.',
    );
  const state = customerCreateState(repo, org);
  if (state)
    throw Error(
      state === 'unknown'
        ? 'Customer creation outcome UNKNOWN for this company. Review existing records; no replacement submission is enabled.'
        : 'A customer creation is already pending for this company.',
    );
  if (!org || !draft.display_name.trim() || draft.display_name.length > 200)
    throw Error('Enter a customer name');
  const input = structuredClone(draft);
  const holds = companies.get(repo) ?? new Map<string, 'pending' | 'unknown'>();
  companies.set(repo, holds);
  holds.set(org, 'pending');
  usedForms.add(form);
  notify(repo, org);
  try {
    const saved = await repo.saveCustomer(org, input);
    if (
      !saved ||
      typeof saved.id !== 'string' ||
      !saved.id ||
      saved.organization_id !== org ||
      saved.display_name !== input.display_name ||
      saved.email !== (input.email?.trim().toLowerCase() || null) ||
      saved.phone !== (input.phone?.trim() || null) ||
      saved.customer_type !== input.customer_type ||
      saved.preferred_contact !== input.preferred_contact
    )
      throw Error('Exact saved customer acknowledgment unavailable');
    holds.delete(org);
    notify(repo, org);
    return saved;
  } catch {
    holds.set(org, 'unknown');
    notify(repo, org);
    throw Error(
      'Customer creation outcome UNKNOWN. Do not resubmit, change identity or create a replacement. Existing-record searches do not prove failure.',
    );
  }
}
