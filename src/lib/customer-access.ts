import type {
  CustomerContext,
  CustomerReview,
} from '../domain/customer/review';
import {
  parseCustomerReview,
  customerResponseDisabled,
} from '../domain/customer/review';
import { reportUuid } from '../domain/property/report-page';
export interface CustomerReadPort {
  // Future composition must bind these proposed RPCs to the same genuine caller client; no service key.
  discover(): Promise<unknown>;
  review(c: CustomerContext, version: string): Promise<unknown>;
}
export interface CustomerIdentityPort {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  onAuthStateChange(fn: () => void): {
    data: { subscription: { unsubscribe(): void } };
  };
}
function contexts(value: unknown, user: string): CustomerContext[] {
  const v = value as {
    user_id?: unknown;
    contexts?: unknown;
    mode?: unknown;
  } | null;
  if (
    !v ||
    Object.keys(v).sort().join(',') !== 'contexts,mode,user_id' ||
    v.user_id !== user ||
    v.mode !== 'internal-development' ||
    !Array.isArray(v.contexts) ||
    v.contexts.length > 20
  )
    throw Error('Customer access unavailable');
  const keys = new Set();
  for (const c of v.contexts) {
    if (
      !c ||
      typeof c !== 'object' ||
      Array.isArray(c) ||
      Object.keys(c).sort().join(',') !==
        'company_name,customer_id,location_id,organization_id,primary_color,property_label,reports,version_ids' ||
      ![c.organization_id, c.customer_id, c.location_id].every(reportUuid) ||
      typeof c.company_name !== 'string' ||
      c.company_name.length > 200 ||
      typeof c.property_label !== 'string' ||
      c.property_label.length > 500 ||
      !/^#[a-f0-9]{6}$/i.test(c.primary_color) ||
      typeof c.reports !== 'boolean' ||
      !Array.isArray(c.version_ids) ||
      c.version_ids.length > 100 ||
      !c.version_ids.every(reportUuid) ||
      new Set(c.version_ids).size !== c.version_ids.length
    )
      throw Error('Customer access unavailable');
    const key = [c.organization_id, c.customer_id, c.location_id].join('/');
    if (keys.has(key)) throw Error('Customer access unavailable');
    keys.add(key);
  }
  return structuredClone(v.contexts) as CustomerContext[];
}
/** Preparation library only. No sign-in/signup, credential custody, route registration or SDK RPC binding. */
export class PreparedCustomerAccess {
  private epoch = 0;
  private closed = false;
  private user = '';
  private bindings: CustomerContext[] = [];
  private readonly subscription: { unsubscribe(): void };
  constructor(
    private readonly auth: CustomerIdentityPort,
    private readonly port: CustomerReadPort,
  ) {
    this.subscription = auth.onAuthStateChange(() =>
      this.invalidate(),
    ).data.subscription;
  }
  invalidate() {
    this.epoch++;
    this.user = '';
    this.bindings = [];
  }
  private async verified(expected?: string) {
    const r = await this.auth.getUser();
    if (
      r.error ||
      !r.data.user ||
      !reportUuid(r.data.user.id) ||
      (expected && r.data.user.id !== expected)
    )
      throw Error('Customer access unavailable');
    return r.data.user.id;
  }
  async discover() {
    if (this.closed) throw Error('Customer access unavailable');
    const epoch = ++this.epoch;
    this.user = '';
    this.bindings = [];
    try {
      const user = await this.verified();
      if (epoch !== this.epoch) throw Error();
      const value = await this.port.discover();
      await this.verified(user);
      if (epoch !== this.epoch) throw Error();
      this.bindings = contexts(value, user);
      this.user = user;
      return structuredClone(this.bindings);
    } catch {
      if (epoch === this.epoch) this.invalidate();
      throw Error('Customer access unavailable');
    }
  }
  async review(
    selection: CustomerContext,
    version: string,
  ): Promise<CustomerReview> {
    if (this.closed) throw Error('Customer access unavailable');
    const epoch = this.epoch,
      user = this.user;
    try {
      await this.verified(user || 'invalid');
      const fresh = contexts(await this.port.discover(), user);
      if (epoch !== this.epoch) throw Error();
      const c = fresh.find(
        (x) =>
          x.organization_id === selection.organization_id &&
          x.customer_id === selection.customer_id &&
          x.location_id === selection.location_id &&
          x.version_ids.includes(version),
      );
      if (
        !c ||
        !this.bindings.some(
          (x) =>
            x.organization_id === c.organization_id &&
            x.customer_id === c.customer_id &&
            x.location_id === c.location_id,
        )
      )
        throw Error();
      const result = await this.port.review(c, version);
      await this.verified(user);
      if (epoch !== this.epoch) throw Error();
      return parseCustomerReview(result, c, version);
    } catch {
      if (epoch === this.epoch) this.invalidate();
      throw Error('Customer access unavailable');
    }
  }
  close() {
    this.closed = true;
    this.subscription.unsubscribe();
    this.invalidate();
  }
  respond() {
    return customerResponseDisabled();
  }
}
