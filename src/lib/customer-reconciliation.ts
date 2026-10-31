import { PreparedCustomerRequests } from './customer-requests';
import type { CustomerContext } from '../domain/customer/review';
import { reportUuid } from '../domain/property/report-page';
import { PreparedCustomerAccess } from './customer-access';
import type { ConnectedCustomerSdk } from './customer-connected';
import {
  PreparedCustomerDecision,
  type ReviewDecisionRequest,
  type ReviewReceipt,
} from './customer-decision';

/** Retained reference, never an access capability or proof of durable custody. */
export interface CustomerReviewReference {
  schema: 'customer-review-reference-v1';
  user_id: string;
  customer_id: string;
  location_id: string;
  version_id: string;
  request: ReviewDecisionRequest;
}
type ReadSdk = Pick<
  ConnectedCustomerSdk,
  'identityPort' | 'discover' | 'review' | 'decisionContext'
> &
  Partial<
    Pick<
      ConnectedCustomerSdk,
      'requestReceipt' | 'requestStatus' | 'staffRequestQueue'
    >
  >;
export type CustomerReconciliationResult = {
  mutation_performed: false;
  replay_allowed: false;
} & (
  | { status: 'confirmed'; outcome: 'confirmed'; receipt: ReviewReceipt }
  | {
      status: 'undetermined' | 'conflict' | 'unavailable';
      outcome: 'UNKNOWN';
    }
);
function fields(v: unknown, keys: string[]): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join(',') === keys.sort().join(',')
  );
}
function reference(value: unknown): CustomerReviewReference {
  const v: unknown = structuredClone(value);
  if (
    !fields(v, [
      'schema',
      'user_id',
      'customer_id',
      'location_id',
      'version_id',
      'request',
    ]) ||
    v.schema !== 'customer-review-reference-v1' ||
    ![v.user_id, v.customer_id, v.location_id, v.version_id].every(
      reportUuid,
    ) ||
    !fields(v.request, [
      'organization_id',
      'publication_id',
      'scope_sha256',
      'choice',
      'acknowledgment',
      'request_id',
    ]) ||
    ![
      v.request.organization_id,
      v.request.publication_id,
      v.request.request_id,
    ].every(reportUuid) ||
    typeof v.request.scope_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.request.scope_sha256) ||
    typeof v.request.choice !== 'string' ||
    !['approve_review', 'decline_review'].includes(v.request.choice) ||
    v.request.acknowledgment !== 'review-only-v1'
  )
    throw Error('Customer reconciliation unavailable');
  return v as unknown as CustomerReviewReference;
}
const unknown = (
  status: 'undetermined' | 'conflict' | 'unavailable',
): CustomerReconciliationResult => ({
  status,
  outcome: 'UNKNOWN',
  mutation_performed: false,
  replay_allowed: false,
});
function matches(c: CustomerContext, r: CustomerReviewReference) {
  return (
    c.organization_id === r.request.organization_id &&
    c.customer_id === r.customer_id &&
    c.location_id === r.location_id &&
    c.version_ids.includes(r.version_id)
  );
}

/**
 * Unwired read-only preparation over existing SDK interfaces. No credentials,
 * writes, request-ID allocation, storage, route registration or retry authority.
 * Expired/revoked access cannot be reconciled by the current RPC: retain UNKNOWN.
 */
export class PreparedCustomerReconciliation {
  private closed = false;
  private epoch = 0;
  private readonly auth;
  private readonly subscription;
  constructor(private readonly sdk: ReadSdk) {
    this.auth = sdk.identityPort();
    this.subscription = this.auth.onAuthStateChange(() => {
      this.epoch++;
    }).data.subscription;
  }
  async reconcile(value: unknown): Promise<CustomerReconciliationResult> {
    const epoch = this.epoch;
    let access: PreparedCustomerAccess | undefined;
    let decisions: PreparedCustomerDecision | undefined;
    try {
      const r = reference(value);
      if (this.closed) return unknown('unavailable');
      const identity = await this.auth.getUser();
      if (identity.error || identity.data.user?.id !== r.user_id) throw Error();
      access = new PreparedCustomerAccess(this.auth, {
        discover: this.sdk.discover,
        review: this.sdk.review,
      });
      const c = (await access.discover()).find((c) => matches(c, r));
      if (!c) throw Error();
      decisions = new PreparedCustomerDecision(this.auth, access, {
        context: this.sdk.decisionContext,
        record: async () => {
          throw Error('Read-only reconciliation');
        },
      });
      const current = await decisions.load(c, r.version_id);
      const final = await this.auth.getUser();
      if (
        this.closed ||
        epoch !== this.epoch ||
        final.error ||
        final.data.user?.id !== r.user_id
      )
        throw Error();
      if (
        current.publication_id !== r.request.publication_id ||
        current.scope_sha256 !== r.request.scope_sha256
      )
        return unknown('conflict');
      if (!current.decision) return unknown('undetermined');
      if (
        current.decision.request_id !== r.request.request_id ||
        current.decision.choice !== r.request.choice ||
        current.decision.scope_sha256 !== r.request.scope_sha256
      )
        return unknown('conflict');
      return {
        status: 'confirmed',
        outcome: 'confirmed',
        receipt: structuredClone(current.decision),
        mutation_performed: false,
        replay_allowed: false,
      };
    } catch {
      return unknown('unavailable');
    } finally {
      decisions?.close();
      access?.close();
    }
  }
  async reconcileRequest(value: unknown) {
    if (
      this.closed ||
      !this.sdk.requestReceipt ||
      !this.sdk.requestStatus ||
      !this.sdk.staffRequestQueue
    )
      throw Error('Customer reconciliation unavailable');
    const reader = new PreparedCustomerRequests(this.auth, {
      receipt: this.sdk.requestReceipt,
      status: this.sdk.requestStatus,
      queue: this.sdk.staffRequestQueue,
    });
    try {
      return await reader.reconcile(value);
    } finally {
      reader.close();
    }
  }
  close() {
    this.closed = true;
    this.epoch++;
    this.subscription.unsubscribe();
  }
}
