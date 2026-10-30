import { sampleCompanies, type CompanyProfile } from '../domain/platform';
import type { EstimateBundle } from '../domain/estimating/types';
import { CustomerPortalPreviewModel } from './customer-preview';
import { PropertyRepository } from './property';
import { previewOperations } from './operations';

type ChangeRequest = ReturnType<
  CustomerPortalPreviewModel['staffChangeRequests']
>[number] & {
  customer_name: string;
  property_label: string;
  outcome: 'unreviewed' | 'pending' | 'unknown' | 'prepared';
};
export interface ChangeReview {
  org: string;
  actor: string;
  request: ChangeRequest;
  source: EstimateBundle;
  blocked: string;
  token: string;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export class CustomerChangeWorkspace {
  private models = new Map<string, CustomerPortalPreviewModel>();
  private attempts = new Map<
    string,
    {
      state: 'pending' | 'unknown' | 'prepared';
      review: ChangeReview;
      draft?: string;
    }
  >();
  constructor(readonly repo: PropertyRepository) {
    if (!repo.operations.sample) throw Error('Local synthetic handoff only');
  }
  customer(company: CompanyProfile) {
    if (!sampleCompanies.some((c) => c.id === company.id))
      throw Error('Sample company required');
    let model = this.models.get(company.id);
    if (!model) {
      model = new CustomerPortalPreviewModel(company, this.repo);
      this.models.set(company.id, model);
    }
    return model;
  }
  staff(org: string, actor: string) {
    const member = this.repo.operations
      .syntheticMemberships(org)
      .find(
        (m) => m.organization_id === org && m.user_id === actor && m.active,
      );
    if (
      !member ||
      !(
        ['owner', 'admin'].includes(member.role) ||
        (member.role === 'staff' &&
          ['office_manager', 'estimator'].includes(member.staff_type))
      )
    )
      throw Error('Active estimating staff required');
  }
  reviewer(org: string) {
    const actor = this.repo.estimates.syntheticReadinessReviewer(org);
    this.staff(org, actor);
    return actor;
  }
  requests(org: string, actor: string): ChangeRequest[] {
    this.staff(org, actor);
    return (this.models.get(org)?.staffChangeRequests() ?? []).map((r) => {
      this.repo.operations.syntheticProperty(
        org,
        r.receipt.customer_id,
        r.location_id,
      );
      const context = this.repo
        .read(org)
        .contexts.find(
          (c) =>
            c.customer_id === r.receipt.customer_id &&
            c.location_id === r.location_id,
        );
      if (!context) throw Error('Exact customer/property context unavailable');
      return {
        ...r,
        customer_name: context.customer_name,
        property_label: context.location_label,
        outcome:
          this.attempts.get(r.receipt.id)?.state ?? ('unreviewed' as const),
      };
    });
  }
  async review(
    org: string,
    actor: string,
    receipt: string,
  ): Promise<ChangeReview> {
    const request = this.requests(org, actor).find(
      (r) => r.receipt.id === receipt,
    );
    if (!request) throw Error('Customer change request unavailable');
    const source = await this.repo.estimates.get(
      org,
      request.version.estimate_id,
      request.version.id,
    );
    const current = await this.repo.estimates.get(
      org,
      request.version.estimate_id,
    );
    this.staff(org, actor);
    const fresh = this.requests(org, actor).find(
      (r) => r.receipt.id === receipt,
    );
    if (!fresh || !same(fresh.version, source.version) || !same(request, fresh))
      throw Error('Request changed; reload exact evidence');
    const origin = this.repo.estimates.repairOrigin(
      org,
      source.estimate.id,
      source.version.id,
    );
    const blocked = origin
      ? 'Repair-origin revisions require a separate source review.'
      : source.version.payload.location_id !== request.location_id
        ? 'Original property binding is incomplete.'
        : current.version.id !== source.version.id ||
            current.version.status !== 'issued' ||
            current.estimate.status !== 'issued'
          ? 'This request is not for the current issued version. No replacement revision is permitted.'
          : '';
    return {
      org,
      actor,
      request,
      source,
      blocked,
      token: JSON.stringify({ request, current }),
    };
  }
  async prepare(
    review: ChangeReview,
    confirmed: boolean,
  ): Promise<EstimateBundle> {
    const { org, actor, request } = review;
    this.staff(org, actor);
    if (confirmed !== true || review.blocked)
      throw Error('Explicit current staff confirmation required');
    if (this.attempts.has(request.receipt.id))
      throw Error(
        'Revision already attempted. Read exact revision status; do not retry.',
      );
    const fresh = await this.review(org, actor, request.receipt.id);
    if (
      fresh.blocked ||
      fresh.token !== review.token ||
      !same(fresh.request, review.request) ||
      !same(fresh.source, review.source)
    )
      throw Error('Review is stale; reload exact evidence');
    if (this.attempts.has(request.receipt.id))
      throw Error('Revision already attempted; no replay');
    const attempt = {
      state: 'pending' as 'pending' | 'unknown' | 'prepared',
      review: structuredClone(fresh),
      draft: undefined as string | undefined,
    };
    this.attempts.set(request.receipt.id, attempt); // Before entering async engine: never delete this hold.
    try {
      const bundle = await this.repo.estimates.prepareSyntheticCustomerRevision(
        org,
        fresh.source,
        {
          organization_id: org,
          customer_id: request.receipt.customer_id,
          location_id: request.location_id,
          estimate_id: request.version.estimate_id,
          source_version_id: request.version.id,
          source_version_number: request.version.version_number,
          offer_id: request.offer_id,
          receipt: request.receipt,
          reviewed_by: actor,
          reviewed_at: new Date().toISOString(),
        },
        () => {
          this.staff(org, actor);
          this.repo.operations.syntheticProperty(
            org,
            request.receipt.customer_id,
            request.location_id,
          );
          const actual = this.requests(org, actor).find(
            (r) => r.receipt.id === request.receipt.id,
          );
          // Attempt status is transport evidence; compare only immutable business evidence.
          if (
            !actual ||
            !same(actual.version, request.version) ||
            !same(actual.receipt, request.receipt) ||
            actual.offer_id !== request.offer_id ||
            actual.location_id !== request.location_id
          )
            throw Error('Exact request evidence changed');
        },
      );
      const origin = this.repo.estimates.customerRevisionOrigin(
        org,
        bundle.estimate.id,
      );
      if (
        !origin ||
        origin.draft_version_id !== bundle.version.id ||
        !same(origin.receipt, request.receipt) ||
        bundle.estimate.organization_id !== org ||
        bundle.estimate.id !== request.version.estimate_id ||
        bundle.estimate.customer_id !== request.receipt.customer_id ||
        bundle.estimate.current_version_id !== bundle.version.id ||
        bundle.version.organization_id !== org ||
        bundle.version.estimate_id !== request.version.estimate_id ||
        !same(bundle.version.payload, fresh.source.version.payload) ||
        !same(bundle.version.calculation, fresh.source.version.calculation) ||
        bundle.version.version_number !== request.version.version_number + 1 ||
        bundle.version.status !== 'draft' ||
        bundle.version.supersedes_version_id !== request.version.id
      )
        throw Error('Missing exact revision receipt');
      attempt.draft = bundle.version.id;
      attempt.state = 'prepared';
      return bundle;
    } catch {
      attempt.state = 'unknown';
      throw Error(
        'Revision outcome UNKNOWN. Read exact revision status; do not retry or create a replacement.',
      );
    }
  }
  /** Confirmed actual3A/3B evidence for local-only packet preparation; UNKNOWN never advances. */
  confirmedRevision(org: string, actor: string, estimate: string) {
    this.staff(org, actor);
    const evidence = this.repo.estimates.customerRevisionState(
      org,
      actor,
      estimate,
    );
    const request = this.requests(org, actor).find(
      (r) => r.receipt.id === evidence.origin.receipt.id,
    );
    const attempt = request && this.attempts.get(request.receipt.id);
    if (
      !request ||
      !attempt ||
      attempt.state !== 'prepared' ||
      attempt.draft !== evidence.draft.version.id ||
      !same(request.receipt, evidence.origin.receipt) ||
      !same(request.version, evidence.source) ||
      request.offer_id !== evidence.origin.offer_id ||
      request.location_id !== evidence.origin.location_id
    )
      throw Error(
        'Confirmed exact revision required; reconcile UNKNOWN before packet preparation',
      );
    const sourceReview = this.models
      .get(org)!
      .staffIssuedReview(evidence.source.id);
    return structuredClone({ evidence, request, sourceReview });
  }
  async reconcile(org: string, actor: string, receipt: string) {
    this.staff(org, actor);
    const attempt = this.attempts.get(receipt);
    if (
      !attempt ||
      attempt.review.org !== org ||
      attempt.review.actor !== actor ||
      attempt.state === 'pending'
    )
      throw Error('Exact revision status unavailable');
    const { request } = attempt.review;
    const origin = this.repo.estimates.customerRevisionOrigin(
      org,
      request.version.estimate_id,
    );
    if (
      !origin ||
      origin.reviewed_by !== actor ||
      !same(origin.receipt, request.receipt) ||
      origin.source_version_id !== request.version.id ||
      origin.location_id !== request.location_id
    )
      return { status: 'undetermined' as const };
    const bundle = await this.repo.estimates.get(
      org,
      origin.estimate_id,
      origin.draft_version_id,
    );
    this.staff(org, actor);
    if (
      bundle.version.supersedes_version_id !== request.version.id ||
      bundle.version.status !== 'draft' ||
      bundle.estimate.organization_id !== org ||
      bundle.estimate.id !== origin.estimate_id ||
      bundle.version.organization_id !== org ||
      bundle.version.id !== origin.draft_version_id ||
      bundle.version.payload.customer_id !== origin.customer_id ||
      bundle.version.payload.location_id !== origin.location_id
    )
      return { status: 'undetermined' as const };
    attempt.state = 'prepared';
    attempt.draft = bundle.version.id;
    return { status: 'prepared' as const, bundle };
  }
}
// One tab's heap only. No storage, broadcast, credentials, connected fallback or fabricated receipts.
export const customerChangeWorkspace = new CustomerChangeWorkspace(
  new PropertyRepository(previewOperations),
);
export function openSyntheticWorkspace(
  target: 'customer' | 'staff',
  company: string,
) {
  if (!sampleCompanies.some((c) => c.id === company))
    throw Error('Sample company required');
  const path = target === 'customer' ? '/preview/property-portal' : '/preview';
  window.history.pushState(
    { syntheticEstimateHandoff: company, section: 'Estimates' },
    '',
    path,
  );
  window.dispatchEvent(new PopStateEvent('popstate'));
}
