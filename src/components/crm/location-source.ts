import type { Operations, LocationDraft, Row } from '../../lib/operations';
type Location = Row<'service_locations'>;
const addressKeys = [
  'address_line1',
  'address_line2',
  'city',
  'region',
  'postal_code',
  'country_code',
];
// Control-local attempt status, not durable custody or an additional business store.
const attempts = new WeakMap<Operations, Map<string, 'pending' | 'unknown'>>();
export function locationSourceKey(
  location: Location,
  org: string,
  customer: string,
) {
  if (
    !location ||
    location.organization_id !== org ||
    location.customer_id !== customer ||
    !location.id ||
    !Number.isFinite(Date.parse(location.created_at)) ||
    ['address_line1', 'city', 'region', 'postal_code', 'country_code'].some(
      (k) =>
        typeof location[k as keyof Location] !== 'string' ||
        !String(location[k as keyof Location]).trim(),
    )
  )
    throw Error('Exact saved location unavailable · UNKNOWN');
  return JSON.stringify(location);
}
async function read<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch {
    throw Error('Current location source unavailable · UNKNOWN');
  }
}
export async function saveCurrentLocation(
  repo: Operations,
  org: string,
  customer: string,
  shown: Location | undefined,
  input: LocationDraft,
  reviewed: boolean,
  stillCurrent: () => boolean,
) {
  if (!stillCurrent() || !customer || (shown && !reviewed))
    throw Error('Review the current saved location and address changes');
  if (
    !input ||
    Object.keys(input).some((key) => !addressKeys.includes(key)) ||
    addressKeys
      .filter((key) => key !== 'address_line2')
      .some(
        (key) =>
          typeof input[key as keyof LocationDraft] !== 'string' ||
          !String(input[key as keyof LocationDraft]).trim(),
      ) ||
    (input.address_line2 != null && typeof input.address_line2 !== 'string')
  )
    throw Error(
      'Exact address fields required; identity changes are not permitted',
    );
  const original = shown ? structuredClone(shown) : undefined,
    source = original ? locationSourceKey(original, org, customer) : undefined,
    draft = structuredClone(input);
  const key = `${org}/${customer}/${original?.id ?? 'new'}`,
    states = attempts.get(repo) ?? new Map<string, 'pending' | 'unknown'>();
  if (states.get(key) === 'unknown')
    throw Error('Location save outcome UNKNOWN; exact read only, do not retry');
  if (states.has(key)) throw Error('Location save already in progress');
  states.set(key, 'pending');
  attempts.set(repo, states);
  try {
    const access = await read(() => repo.companyAccess(org));
    if (!stillCurrent()) throw Error('Location context changed; no save');
    if (!access.crm) throw Error('Current CRM location access required');
    const currentCustomer = await read(() => repo.getCustomer(org, customer));
    if (
      !stillCurrent() ||
      !currentCustomer ||
      currentCustomer.id !== customer ||
      currentCustomer.organization_id !== org
    )
      throw Error('Exact current customer unavailable · UNKNOWN');
    if (original) {
      const rows = await read(() => repo.listLocations(org, customer));
      if (!stillCurrent()) throw Error('Location context changed; no save');
      if (
        !Array.isArray(rows) ||
        rows.some(
          (r) => !r || r.organization_id !== org || r.customer_id !== customer,
        ) ||
        new Set(rows.map((r) => r.id)).size !== rows.length
      )
        throw Error('Current location source unavailable · UNKNOWN');
      const current = rows.find((r) => r.id === original.id);
      if (!current || locationSourceKey(current, org, customer) !== source)
        throw Error('Saved location changed; refresh and review before saving');
    }
    if (repo.sample)
      repo.syntheticEstimateCrm(org, customer, original?.id ?? null);
    // The pinned writer has no atomic source-CAS. This pre-dispatch control does not
    // close competing raw/hosted writes after the read, nor prove genuine authorization.
    try {
      return await repo.saveLocation(org, customer, draft, original?.id);
    } catch {
      states.set(key, 'unknown');
      throw Error(
        'Location save outcome UNKNOWN; exact read only, do not retry',
      );
    }
  } finally {
    if (states.get(key) !== 'unknown') states.delete(key);
  }
}
