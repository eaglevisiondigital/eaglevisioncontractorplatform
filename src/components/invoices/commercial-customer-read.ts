import type {
  InvoiceViewer,
  InvoiceIdentity,
} from './customer-invoice-contract';

/** Public content-selection target only; private source hashes are server-owned. */
export type CommercialCustomerTarget = Omit<InvoiceViewer, 'invoice'> & {
  invoice: Omit<InvoiceIdentity, 'sourceHash'>;
};

export interface CommercialCustomerResponse {
  schema: 'commercial-customer-issued-read-v1';
  mode: 'fictional-local';
  sourceCategory: 'commercial-issued-proposal';
  invoice: Omit<InvoiceIdentity, 'sourceHash'> & {
    number: string;
    title: string;
    currency: 'USD';
    amountMinor: number;
    issuedAt: string;
    issuanceReceiptId: string;
  };
  observedAt: number;
  expiresAt: number;
  payment: { status: 'UNKNOWN'; balanceMinor: null; receipt: null };
  link: { status: 'DISABLED'; href: null; expiresAt: number };
  delivery: 'DISABLED';
  resend: 'DISABLED';
}
const unavailable = () => Error('Exact customer invoice response unavailable');
// JSON own data only; no toJSON/getter execution or retained caller references.
function copy(value: unknown, depth = 0): unknown {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    return value;
  if (
    !value ||
    typeof value !== 'object' ||
    depth > 10 ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw unavailable();
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!('value' in descriptor)) throw unavailable();
    Object.defineProperty(result, key, {
      value: copy(descriptor.value, depth + 1),
      enumerable: true,
    });
  }
  if (Reflect.ownKeys(value).length !== Object.keys(result).length)
    throw unavailable();
  return result;
}
function fields(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(value, k))
  )
    throw unavailable();
  return value as Record<string, unknown>;
}
/** Reject private hashes and expanded browser request fields, even at runtime. */
export function commercialCustomerTarget(
  value: unknown,
): CommercialCustomerTarget {
  const target = fields(copy(value), [
    'invoice',
    'companyName',
    'customerName',
    'propertyLabel',
    'primaryColor',
  ]);
  const invoice = fields(target.invoice, [
    'organizationId',
    'customerId',
    'locationId',
    'sourceVersionId',
    'invoiceId',
    'revision',
  ]);
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  for (const key of [
    'organizationId',
    'customerId',
    'sourceVersionId',
    'invoiceId',
  ])
    if (typeof invoice[key] !== 'string' || !uuid.test(invoice[key]))
      throw unavailable();
  if (
    (invoice.locationId !== null &&
      (typeof invoice.locationId !== 'string' ||
        !uuid.test(invoice.locationId))) ||
    !Number.isSafeInteger(invoice.revision) ||
    Number(invoice.revision) < 1 ||
    ['companyName', 'customerName', 'propertyLabel'].some(
      (key) =>
        typeof target[key] !== 'string' ||
        !(target[key] as string).trim() ||
        (target[key] as string).length > 250,
    ) ||
    typeof target.primaryColor !== 'string' ||
    !/^#[a-f0-9]{6}$/i.test(target.primaryColor)
  )
    throw unavailable();
  Object.freeze(invoice);
  return Object.freeze(target) as unknown as CommercialCustomerTarget;
}
/** Content validation, never Auth. Only the proposed trusted server reader may
 * supply this allowlist after current access/private-source checks. */
export function commercialCustomerResponse(
  value: unknown,
  expected: CommercialCustomerTarget,
  now = Date.now(),
): CommercialCustomerResponse {
  expected = commercialCustomerTarget(expected);
  const row = fields(copy(value), [
    'schema',
    'mode',
    'sourceCategory',
    'invoice',
    'observedAt',
    'expiresAt',
    'payment',
    'link',
    'delivery',
    'resend',
  ]);
  const invoice = fields(row.invoice, [
    'invoiceId',
    'organizationId',
    'customerId',
    'locationId',
    'sourceVersionId',
    'revision',
    'number',
    'title',
    'currency',
    'amountMinor',
    'issuedAt',
    'issuanceReceiptId',
  ]);
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  for (const k of [
    'invoiceId',
    'organizationId',
    'customerId',
    'sourceVersionId',
  ] as const)
    if (
      invoice[k] !== expected.invoice[k] ||
      typeof invoice[k] !== 'string' ||
      !uuid.test(invoice[k])
    )
      throw unavailable();
  const payment = fields(row.payment, ['status', 'balanceMinor', 'receipt']),
    link = fields(row.link, ['status', 'href', 'expiresAt']);
  if (
    invoice.locationId !== expected.invoice.locationId ||
    (invoice.locationId !== null &&
      (typeof invoice.locationId !== 'string' ||
        !uuid.test(invoice.locationId))) ||
    invoice.revision !== expected.invoice.revision ||
    !Number.isSafeInteger(invoice.revision) ||
    Number(invoice.revision) < 1 ||
    invoice.number !==
      'INV-' + expected.invoice.invoiceId.replaceAll('-', '') ||
    typeof invoice.title !== 'string' ||
    !invoice.title.trim() ||
    invoice.title.length > 200 ||
    invoice.currency !== 'USD' ||
    !Number.isSafeInteger(invoice.amountMinor) ||
    Number(invoice.amountMinor) < 1 ||
    Number(invoice.amountMinor) > 9e12 ||
    typeof invoice.issuedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
      invoice.issuedAt,
    ) ||
    !Number.isFinite(Date.parse(invoice.issuedAt)) ||
    typeof invoice.issuanceReceiptId !== 'string' ||
    !uuid.test(invoice.issuanceReceiptId) ||
    row.schema !== 'commercial-customer-issued-read-v1' ||
    row.mode !== 'fictional-local' ||
    row.sourceCategory !== 'commercial-issued-proposal' ||
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(row.observedAt) ||
    Number(row.observedAt) > now ||
    now - Number(row.observedAt) > 30_000 ||
    !Number.isSafeInteger(row.expiresAt) ||
    Number(row.expiresAt) <= now ||
    Number(row.expiresAt) > Number(row.observedAt) + 30_000 ||
    payment.status !== 'UNKNOWN' ||
    payment.balanceMinor !== null ||
    payment.receipt !== null ||
    link.status !== 'DISABLED' ||
    link.href !== null ||
    link.expiresAt !== row.expiresAt ||
    row.delivery !== 'DISABLED' ||
    row.resend !== 'DISABLED'
  )
    throw unavailable();
  Object.freeze(invoice);
  Object.freeze(payment);
  Object.freeze(link);
  return Object.freeze(row) as unknown as CommercialCustomerResponse;
}
export type CommercialCustomerState =
  | { status: 'ready'; value: CommercialCustomerResponse }
  | { status: 'loading' | 'unknown' | 'disabled' };
const UNKNOWN: CommercialCustomerState = Object.freeze({ status: 'unknown' });
const DISABLED: CommercialCustomerState = Object.freeze({ status: 'disabled' });
/** Ephemeral read presentation only; no business store, command or retry owner.
 * Remount/reopen reads exact retained target; it never issues/sends/pays anything. */
export class CommercialCustomerReadController {
  #state: CommercialCustomerState = DISABLED;
  #listeners = new Set<() => void>();
  #generation = 0;
  #abort?: AbortController;
  #closed = false;
  #hidden = false;
  #target?: CommercialCustomerTarget;
  #identity?: string;
  constructor(
    private readonly current: () => CommercialCustomerTarget,
    private readonly load: (
      input: CommercialCustomerTarget,
      signal: AbortSignal,
    ) => Promise<unknown>,
    private readonly enabled = false,
  ) {
    if (enabled) {
      this.#target = commercialCustomerTarget(current());
      this.#identity = JSON.stringify(this.#target);
      this.#state = UNKNOWN;
    }
  }
  subscribe = (notify: () => void) => {
    this.#listeners.add(notify);
    return () => {
      this.#listeners.delete(notify);
    };
  };
  #set(value: CommercialCustomerState) {
    this.#state = value;
    for (const notify of this.#listeners) notify();
  }
  #current() {
    try {
      return (
        !this.#closed &&
        this.enabled &&
        JSON.stringify(commercialCustomerTarget(this.current())) ===
          this.#identity
      );
    } catch {
      return false;
    }
  }
  getSnapshot = (): CommercialCustomerState => {
    if (!this.enabled) return this.#state;
    if (
      !this.#current() ||
      (this.#state.status === 'ready' &&
        Date.now() >= this.#state.value.expiresAt)
    ) {
      this.#hidden = true;
      // Observed drift consumes the pending generation synchronously. Do not
      // notify during React's getSnapshot; returning one stable UNKNOWN suffices.
      if (this.#state.status === 'loading') {
        this.#generation++;
        this.#abort?.abort();
        this.#state = UNKNOWN;
      }
      return UNKNOWN;
    }
    // Restoring a context cannot resurrect retained content. Only an explicit
    // successful new server read can clear this local visibility fence.
    return this.#hidden && this.#state.status === 'ready'
      ? UNKNOWN
      : this.#state;
  };
  invalidate = () => {
    this.#generation++;
    this.#abort?.abort();
    this.#set(this.enabled ? UNKNOWN : DISABLED);
  };
  async open() {
    if (!this.enabled) return;
    if (!this.#current() || !this.#target) {
      this.invalidate();
      return;
    }
    const generation = ++this.#generation;
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;
    this.#set(Object.freeze({ status: 'loading' }));
    try {
      const value = await this.load(
        commercialCustomerTarget(this.#target),
        abort.signal,
      );
      if (generation !== this.#generation || abort.signal.aborted) return;
      if (!this.#current()) {
        this.invalidate();
        return;
      }
      const response = commercialCustomerResponse(value, this.#target);
      if (generation !== this.#generation) return;
      if (!this.#current()) {
        this.invalidate();
        return;
      }
      this.#hidden = false;
      this.#set(Object.freeze({ status: 'ready', value: response }));
    } catch {
      if (generation === this.#generation) this.#set(UNKNOWN);
    }
  }
  close = () => {
    this.#closed = true;
    this.invalidate();
  };
}
