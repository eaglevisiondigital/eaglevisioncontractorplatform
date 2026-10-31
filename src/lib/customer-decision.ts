import type { CustomerContext } from '../domain/customer/review';
import { parseCustomerReview } from '../domain/customer/review';
import { reportUuid } from '../domain/property/report-page';
import type { CustomerIdentityPort } from './customer-access';
import { PreparedCustomerAccess } from './customer-access';
export type ReviewChoice = 'approve_review' | 'decline_review';
export interface ReviewReceipt {
  id: string;
  request_id: string;
  choice: ReviewChoice;
  recorded_at: string;
  scope_sha256: string;
}
interface DecisionContext {
  publication_id: string;
  scope_sha256: string;
  review: ReturnType<typeof parseCustomerReview>;
  decision: ReviewReceipt | null;
  financial_execution: false;
}
export interface ReviewDecisionRequest {
  organization_id: string;
  publication_id: string;
  scope_sha256: string;
  choice: ReviewChoice;
  acknowledgment: 'review-only-v1';
  request_id: string;
}
export interface CustomerDecisionPort {
  context(c: CustomerContext, version: string): Promise<unknown>;
  record(request: ReviewDecisionRequest): Promise<unknown>;
}
const fields = (v: unknown, names: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join(',') === names.sort().join(',');
const digest = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function receipt(v: unknown, hash: string): ReviewReceipt {
  if (
    !fields(v, ['id', 'request_id', 'choice', 'recorded_at', 'scope_sha256']) ||
    !reportUuid(v.id) ||
    !reportUuid(v.request_id) ||
    !['approve_review', 'decline_review'].includes(String(v.choice)) ||
    v.scope_sha256 !== hash ||
    typeof v.recorded_at !== 'string' ||
    !Number.isFinite(Date.parse(v.recorded_at))
  )
    throw Error('Customer review unavailable');
  return structuredClone(v) as unknown as ReviewReceipt;
}
/** Unwired preparation. The SQL commands remain revoked; no SDK, route, token or financial binding. */
export class PreparedCustomerDecision {
  private epoch = 0;
  private closed = false;
  private current: {
    user: string;
    c: CustomerContext;
    version: string;
    data: DecisionContext;
  } | null = null;
  private attempt: {
    user: string;
    request: ReviewDecisionRequest;
    state: 'pending' | 'unknown' | 'confirmed';
  } | null = null;
  private readonly subscription: { unsubscribe(): void };
  constructor(
    private readonly auth: CustomerIdentityPort,
    private readonly reader: PreparedCustomerAccess,
    private readonly port: CustomerDecisionPort,
  ) {
    this.subscription = auth.onAuthStateChange(() => {
      this.epoch++;
      this.current = null;
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
      throw Error('Customer review unavailable');
    return r.data.user.id;
  }
  async load(c: CustomerContext, version: string) {
    const epoch = ++this.epoch;
    this.current = null;
    try {
      const user = await this.identity();
      const authorized = await this.reader.review(c, version);
      const v = await this.port.context(c, version);
      await this.identity(user);
      if (
        epoch !== this.epoch ||
        !fields(v, [
          'publication_id',
          'scope_sha256',
          'review',
          'decision',
          'financial_execution',
        ]) ||
        !reportUuid(v.publication_id) ||
        !digest(v.scope_sha256) ||
        v.financial_execution !== false
      )
        throw Error();
      const review = parseCustomerReview(v.review, c, version);
      if (JSON.stringify(review) !== JSON.stringify(authorized)) throw Error();
      const data: DecisionContext = {
        publication_id: v.publication_id,
        scope_sha256: v.scope_sha256,
        review,
        decision:
          v.decision === null ? null : receipt(v.decision, v.scope_sha256),
        financial_execution: false,
      };
      this.current = { user, c: structuredClone(c), version, data };
      if (
        this.attempt?.state === 'confirmed' &&
        (this.attempt.user !== user ||
          this.attempt.request.scope_sha256 !== data.scope_sha256)
      )
        this.attempt = null;
      if (
        this.attempt?.state === 'unknown' &&
        this.attempt.user === user &&
        data.decision?.request_id === this.attempt.request.request_id &&
        data.decision.choice === this.attempt.request.choice &&
        data.scope_sha256 === this.attempt.request.scope_sha256
      )
        this.attempt.state = 'confirmed';
      return structuredClone(data);
    } catch {
      if (epoch === this.epoch) this.current = null;
      throw Error('Customer review unavailable');
    }
  }
  async record(choice: ReviewChoice, acknowledged: boolean) {
    const current = this.current;
    if (
      !current ||
      !acknowledged ||
      !['approve_review', 'decline_review'].includes(choice) ||
      current.data.review.review_state !== 'awaiting_action' ||
      current.data.decision ||
      this.attempt
    )
      throw Error('Customer review unavailable');
    const epoch = this.epoch;
    await this.identity(current.user);
    if (this.current !== current || epoch !== this.epoch || this.attempt)
      throw Error('Customer review unavailable');
    const request: ReviewDecisionRequest = {
      organization_id: current.c.organization_id,
      publication_id: current.data.publication_id,
      scope_sha256: current.data.scope_sha256,
      choice,
      acknowledgment: 'review-only-v1',
      request_id: crypto.randomUUID(),
    };
    const attempt = {
      user: current.user,
      request,
      state: 'pending' as 'pending' | 'unknown' | 'confirmed',
    };
    this.attempt = attempt;
    try {
      const result = receipt(
        await this.port.record(structuredClone(request)),
        request.scope_sha256,
      );
      await this.identity(current.user);
      if (
        epoch !== this.epoch ||
        result.request_id !== request.request_id ||
        result.choice !== choice
      )
        throw Error();
      attempt.state = 'confirmed';
      current.data.decision = result;
      return structuredClone(result);
    } catch {
      attempt.state = 'unknown';
      this.current = null;
      throw Error(
        'Customer decision outcome UNKNOWN; read-only reconciliation required',
      );
    }
  }
  get outcome() {
    return this.attempt?.state ?? 'not_attempted';
  }
  close() {
    this.closed = true;
    this.epoch++;
    this.current = null;
    this.subscription.unsubscribe();
  }
}

// Versioned request contract alongside the unchanged two-choice API. Unmounted/default off.
export { PreparedCustomerRequests } from './customer-requests';
export type {
  CustomerRequestBody,
  CustomerRequestReference,
  CustomerRequestStatus,
} from './customer-requests';
