import { reportUuid } from '../domain/property/report-page';
import type { CustomerIdentityPort } from './customer-access';
export type CustomerRequestChoice =
  'approve_review' | 'decline_review' | 'request_changes_review';
export interface CustomerRequestBody {
  organization_id: string;
  customer_id: string;
  location_id: string;
  version_id: string;
  publication_id: string;
  scope_sha256: string;
  choice: CustomerRequestChoice;
  note: string;
  acknowledgment: 'review-only-v1' | 'review-only-v2';
  request_id: string;
}
export interface CustomerRequestReference extends Omit<
  CustomerRequestBody,
  'note'
> {
  schema: 'customer-request-v2';
  user_id: string;
  request_sha256: string;
}
export interface CustomerRequestReceipt extends Omit<
  CustomerRequestBody,
  'acknowledgment'
> {
  id: string;
  estimate_id: string;
  version_number: number;
  recorded_at: string;
  request_sha256: string;
}
export interface CustomerRequestStatus {
  reference: CustomerRequestReference;
  outcome: 'confirmed' | 'UNKNOWN';
  custody: 'claimed-v2' | 'legacy-v1' | 'unconfirmed';
  receipt: CustomerRequestReceipt | null;
  replay_allowed: false;
  financial_execution: false;
}
export interface StaffRequestQueue {
  organization_id: string;
  requests: {
    receipt: CustomerRequestReceipt;
    customer_name: string;
    property_label: string;
    project_name: string;
  }[];
  limited: true;
  financial_execution: false;
}
const bodyKeys = [
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'publication_id',
  'scope_sha256',
  'choice',
  'note',
  'acknowledgment',
  'request_id',
];
const refKeys = [
  ...bodyKeys.filter((k) => k !== 'note'),
  'schema',
  'user_id',
  'request_sha256',
];
const receiptKeys = [
  ...bodyKeys.filter((k) => k !== 'acknowledgment'),
  'id',
  'estimate_id',
  'version_number',
  'recorded_at',
  'request_sha256',
];
function shape(v: unknown, keys: string[]): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join(',') === [...keys].sort().join(',')
  );
}
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const fail = () => Error('Customer request unavailable');
export function customerRequestBody(value: unknown): CustomerRequestBody {
  const v = structuredClone(value);
  if (
    !shape(v, bodyKeys) ||
    ![
      'organization_id',
      'customer_id',
      'location_id',
      'version_id',
      'publication_id',
      'request_id',
    ].every((k) => reportUuid(v[k])) ||
    !hash(v.scope_sha256) ||
    typeof v.choice !== 'string' ||
    !['approve_review', 'decline_review', 'request_changes_review'].includes(
      v.choice,
    ) ||
    typeof v.note !== 'string' ||
    typeof v.acknowledgment !== 'string' ||
    !['review-only-v1', 'review-only-v2'].includes(v.acknowledgment)
  )
    throw fail();
  const note = v.note.trim();
  if (
    v.choice === 'request_changes_review'
      ? !note ||
        Array.from(note).length > 2000 ||
        v.acknowledgment !== 'review-only-v2'
      : note !== ''
  )
    throw fail();
  // Reject malformed Unicode rather than silently replacing unpaired surrogates.
  if (note.includes('\0') || /[\uD800-\uDFFF]/u.test(note)) throw fail();
  const canonical: Record<string, unknown> = { ...v, note };
  for (const key of [
    'organization_id',
    'customer_id',
    'location_id',
    'version_id',
    'publication_id',
    'request_id',
  ])
    canonical[key] = String(canonical[key]).toLowerCase();
  return canonical as unknown as CustomerRequestBody;
}
export function customerRequestReference(
  value: unknown,
): CustomerRequestReference {
  const v = structuredClone(value);
  if (
    !shape(v, refKeys) ||
    v.schema !== 'customer-request-v2' ||
    !reportUuid(v.user_id) ||
    !hash(v.request_sha256)
  )
    throw fail();
  customerRequestBody({
    ...Object.fromEntries(
      bodyKeys.filter((k) => k !== 'note').map((k) => [k, v[k]]),
    ),
    note: v.choice === 'request_changes_review' ? 'reference validation' : '',
  });
  return v as unknown as CustomerRequestReference;
}
export function customerRequestReceipt(value: unknown): CustomerRequestReceipt {
  const v = structuredClone(value);
  if (
    !shape(v, receiptKeys) ||
    !reportUuid(v.id) ||
    !reportUuid(v.estimate_id) ||
    !Number.isSafeInteger(v.version_number) ||
    Number(v.version_number) < 1 ||
    typeof v.recorded_at !== 'string' ||
    !Number.isFinite(Date.parse(v.recorded_at)) ||
    !hash(v.request_sha256)
  )
    throw fail();
  const body = customerRequestBody({
    ...Object.fromEntries(
      bodyKeys.filter((k) => k !== 'acknowledgment').map((k) => [k, v[k]]),
    ),
    acknowledgment: 'review-only-v2',
  });
  if (body.note !== v.note) throw fail();
  return v as unknown as CustomerRequestReceipt;
}
export function customerRequestStatus(
  value: unknown,
  expected: CustomerRequestReference,
): CustomerRequestStatus {
  const v = structuredClone(value);
  if (
    !shape(v, [
      'reference',
      'outcome',
      'custody',
      'receipt',
      'replay_allowed',
      'financial_execution',
    ]) ||
    v.replay_allowed !== false ||
    v.financial_execution !== false ||
    !['claimed-v2', 'legacy-v1', 'unconfirmed'].includes(String(v.custody)) ||
    typeof v.outcome !== 'string' ||
    !['confirmed', 'UNKNOWN'].includes(v.outcome)
  )
    throw fail();
  const ref = customerRequestReference(v.reference);
  if (
    refKeys.some(
      (k) =>
        ref[k as keyof CustomerRequestReference] !==
        expected[k as keyof CustomerRequestReference],
    )
  )
    throw fail();
  if (v.outcome === 'UNKNOWN') {
    if (v.receipt !== null || v.custody !== 'unconfirmed') throw fail();
    return { ...v, reference: ref } as unknown as CustomerRequestStatus;
  }
  if (v.custody !== 'claimed-v2' && v.custody !== 'legacy-v1') throw fail();
  const receipt = customerRequestReceipt(v.receipt);
  if (
    [
      'organization_id',
      'customer_id',
      'location_id',
      'version_id',
      'publication_id',
      'scope_sha256',
      'choice',
      'request_id',
      'request_sha256',
    ].some(
      (k) =>
        receipt[k as keyof CustomerRequestReceipt] !==
        ref[k as keyof CustomerRequestReference],
    )
  )
    throw fail();
  return { ...v, reference: ref, receipt } as unknown as CustomerRequestStatus;
}
export function staffRequestQueue(
  value: unknown,
  organization: string,
): StaffRequestQueue {
  const v = structuredClone(value);
  if (
    !reportUuid(organization) ||
    !shape(v, [
      'organization_id',
      'requests',
      'limited',
      'financial_execution',
    ]) ||
    v.organization_id !== organization ||
    v.limited !== true ||
    v.financial_execution !== false ||
    !Array.isArray(v.requests) ||
    v.requests.length > 50
  )
    throw fail();
  const ids = new Set<string>();
  for (const row of v.requests) {
    if (
      !shape(row, [
        'receipt',
        'customer_name',
        'property_label',
        'project_name',
      ]) ||
      !['customer_name', 'property_label', 'project_name'].every(
        (k) => typeof row[k] === 'string' && (row[k] as string).length <= 1000,
      )
    )
      throw fail();
    const r = customerRequestReceipt(row.receipt);
    if (
      r.organization_id !== organization ||
      r.choice !== 'request_changes_review' ||
      ids.has(r.id)
    )
      throw fail();
    ids.add(r.id);
  }
  return v as unknown as StaffRequestQueue;
}
export interface CustomerRequestReadPort {
  receipt(
    organization: string,
    reference: CustomerRequestReference,
  ): Promise<unknown>;
  status(organization: string, body: CustomerRequestBody): Promise<unknown>;
  queue(organization: string): Promise<unknown>;
}
/** Default-off operation port. No HTTP sender, credential loader or route binding. */
export interface CustomerRequestCommandPort {
  mode: 'disabled' | 'disposable-local';
  submit(body: CustomerRequestBody): Promise<unknown>;
}
export class PreparedCustomerRequests {
  private closed = false;
  private epoch = 0;
  private readonly subscription;
  private held = new Set<string>();
  constructor(
    private readonly auth: CustomerIdentityPort,
    private readonly read: CustomerRequestReadPort,
    private readonly command: CustomerRequestCommandPort = {
      mode: 'disabled',
      submit: async () => {
        throw fail();
      },
    },
  ) {
    this.subscription = auth.onAuthStateChange(() => {
      this.epoch++;
    }).data.subscription;
  }
  private async identity(expected?: string) {
    const r = await this.auth.getUser();
    if (
      this.closed ||
      r.error ||
      !r.data.user ||
      !reportUuid(r.data.user.id) ||
      (expected && r.data.user.id !== expected)
    )
      throw fail();
    return r.data.user.id;
  }
  async reconcile(reference: unknown) {
    const ref = customerRequestReference(reference),
      epoch = this.epoch;
    await this.identity(ref.user_id);
    const r = customerRequestStatus(
      await this.read.receipt(ref.organization_id, ref),
      ref,
    );
    await this.identity(ref.user_id);
    if (epoch !== this.epoch) throw fail();
    return r;
  }
  async status(body: unknown) {
    const b = customerRequestBody(body),
      epoch = this.epoch,
      user = await this.identity();
    const v = await this.read.status(b.organization_id, b);
    const ref = customerRequestReference(
      (v as { reference?: unknown })?.reference,
    );
    if (
      ref.user_id !== user ||
      bodyKeys
        .filter((k) => k !== 'note')
        .some(
          (k) =>
            ref[k as keyof CustomerRequestReference] !==
            b[k as keyof CustomerRequestBody],
        )
    )
      throw fail();
    const r = customerRequestStatus(v, ref);
    if (r.receipt && r.receipt.note !== b.note) throw fail();
    await this.identity(user);
    if (epoch !== this.epoch) throw fail();
    return r;
  }
  async submit(body: unknown, confirmed: boolean) {
    const b = customerRequestBody(body);
    if (!confirmed || this.command.mode !== 'disposable-local') throw fail();
    const key = [
      b.organization_id,
      b.customer_id,
      b.location_id,
      b.version_id,
    ].join('/');
    if (this.held.has(key)) throw Error('Existing attempt; reconcile only');
    this.held.add(key);
    const epoch = this.epoch,
      user = await this.identity();
    try {
      const v = await this.command.submit(b),
        ref = customerRequestReference(
          (v as { reference?: unknown })?.reference,
        );
      if (ref.user_id !== user) throw fail();
      const r = customerRequestStatus(v, ref);
      if (
        bodyKeys
          .filter((k) => k !== 'note')
          .some(
            (k) =>
              ref[k as keyof CustomerRequestReference] !==
              b[k as keyof CustomerRequestBody],
          ) ||
        r.receipt?.note !== b.note ||
        r.custody !== 'claimed-v2'
      )
        throw fail();
      await this.identity(user);
      if (epoch !== this.epoch) throw fail();
      return r;
    } catch {
      throw Error(
        'Customer request outcome UNKNOWN; exact read-only status required',
      );
    }
  }
  async queue(organization: string) {
    const epoch = this.epoch,
      user = await this.identity();
    const r = staffRequestQueue(
      await this.read.queue(organization),
      organization,
    );
    await this.identity(user);
    if (epoch !== this.epoch) throw fail();
    return r;
  }
  close() {
    this.closed = true;
    this.epoch++;
    this.subscription.unsubscribe();
  }
}
