import type {
  Customer,
  CustomerHistory,
  Operations,
} from '../../lib/operations';
type Consents = CustomerHistory['consents'];
// Session-only attempt guards, never an operational consent ledger or durable custody.
const attempts = new WeakMap<Operations, Map<string, 'pending' | 'unknown'>>();
export function consentHistoryKey(
  rows: Consents,
  org: string,
  customer: string,
) {
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !row ||
        row.organization_id !== org ||
        row.customer_id !== customer ||
        typeof row.id !== 'string' ||
        !row.id ||
        typeof row.email_allowed !== 'boolean' ||
        typeof row.sms_allowed !== 'boolean' ||
        !Number.isFinite(Date.parse(row.recorded_at)),
    ) ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    throw Error('Current consent history unavailable · UNKNOWN');
  return JSON.stringify(rows);
}
async function read<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch {
    throw Error('Current consent source unavailable · UNKNOWN');
  }
}
export async function recordCurrentContactConsent(
  repo: Operations,
  org: string,
  customer: Customer,
  displayed: Consents,
  email: boolean,
  sms: boolean,
  confirmed: boolean,
  stillCurrent: () => boolean,
) {
  if (
    !stillCurrent() ||
    customer.organization_id !== org ||
    !confirmed ||
    typeof email !== 'boolean' ||
    typeof sms !== 'boolean'
  )
    throw Error('Review the exact current customer consent source and choices');
  const customerId = customer.id,
    shown = consentHistoryKey(structuredClone(displayed), org, customerId),
    key = `${org}/${customerId}`;
  const states = attempts.get(repo) ?? new Map<string, 'pending' | 'unknown'>();
  if (states.get(key) === 'unknown')
    throw Error(
      'Consent recording outcome UNKNOWN; exact read only, do not retry',
    );
  if (states.has(key)) throw Error('Consent recording already in progress');
  states.set(key, 'pending');
  attempts.set(repo, states);
  try {
    const access = await read(() => repo.companyAccess(org));
    if (!stillCurrent()) throw Error('Consent context changed; no recording');
    if (!access.crm)
      throw Error('Current CRM consent-recording access required');
    const currentCustomer = await read(() => repo.getCustomer(org, customerId));
    if (
      !stillCurrent() ||
      !currentCustomer ||
      currentCustomer.id !== customerId ||
      currentCustomer.organization_id !== org
    )
      throw Error('Exact current customer unavailable · UNKNOWN');
    const current = await read(() => repo.customerHistory(org, customerId));
    if (!stillCurrent()) throw Error('Consent context changed; no recording');
    if (consentHistoryKey(current?.consents, org, customerId) !== shown)
      throw Error(
        'Stored consent changed; refresh and review current source before recording',
      );
    if (repo.sample) repo.syntheticEstimateCrm(org, customerId, null);
    // Existing sample writer appends before its first await. The raw read/write
    // boundary still has no server CAS; this is not global opt-out or Auth acceptance.
    try {
      return await repo.recordConsent(org, customerId, email, sms);
    } catch {
      states.set(key, 'unknown');
      throw Error(
        'Consent recording outcome UNKNOWN; exact read only, do not retry',
      );
    }
  } finally {
    if (states.get(key) !== 'unknown') states.delete(key);
  }
}
