import type { EstimateInput } from '../domain/estimating/types';
import { sampleCompanies } from '../domain/platform';
import { documentHash } from '../domain/release/preview';
import { projectRevisionScope } from '../domain/estimating/revision-packet';
import type { SyntheticRevisionIssuance } from './phase3';
import {
  customerIssuanceReadiness,
  type CustomerIssuanceReadiness,
  type IssuanceReview,
} from './customer-issuance-readiness';
import type { PacketReview, PacketPreview } from './customer-revision-packets';

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export interface SyntheticIssueReview {
  source: IssuanceReview;
  readiness_id: string;
}
interface Claim {
  json: string;
  packetReview: PacketReview;
  packet: PacketPreview;
}
type State =
  | 'issuing'
  | 'issuance_unknown'
  | 'issued'
  | 'preparing_offer'
  | 'offer_unknown'
  | 'offered';
interface Attempt {
  id: string;
  org: string;
  actor: string;
  estimate: string;
  claim: Claim;
  review: SyntheticIssueReview;
  state: State;
  record?: SyntheticRevisionIssuance;
}
export class CustomerRevisedEstimateLoop {
  private claims = new WeakMap<SyntheticIssueReview, Claim>();
  private attempts = new Map<string, Attempt>();
  constructor(readonly readiness: CustomerIssuanceReadiness) {}
  private get packets() {
    return this.readiness.packets;
  }
  private get changes() {
    return this.packets.changes;
  }
  async open(
    org: string,
    actor: string,
    estimate: string,
    draft: string,
    revision: number,
    packetId: string,
    readinessId: string,
  ) {
    const recorded = await this.readiness.read(
      org,
      actor,
      estimate,
      readinessId,
    );
    if (
      !recorded.current ||
      recorded.snapshot.verdict !== 'BLOCKED' ||
      recorded.snapshot.review.packet.id !== packetId ||
      this.readiness
        .history(org, actor, estimate)
        .some((h) => h.state !== 'reviewed')
    )
      throw Error(
        'Current exact3D review required; unresolved outcomes cannot advance',
      );
    const source = await this.readiness.open(
      org,
      actor,
      estimate,
      draft,
      revision,
      packetId,
    );
    if (
      !same(source.view, recorded.snapshot.review) ||
      source.view.comparison.original.version !== 2 ||
      source.view.comparison.revised.version !== 3 ||
      source.view.conditions.some(
        (c) =>
          ['tax', 'expiration', 'terms'].includes(c.id) && c.status !== 'PASS',
      )
    )
      throw Error(
        'Exact current version3, packet, tax and unexpired terms required',
      );
    const packetReview = await this.packets.review(
      org,
      actor,
      estimate,
      draft,
      revision,
    );
    const packet = await this.packets.read(org, actor, estimate, packetId);
    const review = { source, readiness_id: readinessId };
    this.readiness.assertCurrentSource(
      source,
      this.changes.confirmedRevision(org, actor, estimate).evidence.draft
        .version.payload,
    );
    this.claims.set(review, {
      json: JSON.stringify(review),
      packetReview,
      packet,
    });
    return review;
  }
  private current(review: SyntheticIssueReview, editor: () => EstimateInput) {
    const c = this.claims.get(review);
    if (!c || c.json !== JSON.stringify(review))
      throw Error('Exact separately confirmed synthetic review required');
    this.readiness.assertCurrentSource(review.source, editor());
    this.packets.assertCurrent(c.packetReview, editor(), c.packet);
    return c;
  }
  async issue(
    review: SyntheticIssueReview,
    editor: () => EstimateInput,
    confirmed: boolean,
  ) {
    const { org, actor, estimate } = review.source;
    if (this.attempts.has(estimate))
      throw Error(
        'Synthetic issuance already attempted; read exact status, no replay',
      );
    if (confirmed !== true)
      throw Error('Separate explicit synthetic issuance confirmation required');
    const claim = this.current(review, editor);
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      org,
      actor,
      estimate,
      claim,
      review,
      state: 'issuing',
    };
    this.attempts.set(estimate, attempt); // Before any await; never delete/reset.
    try {
      const ack =
        await this.changes.repo.estimates.issueSyntheticCustomerRevision(
          this.packets,
          claim.packetReview,
          claim.packet,
          review.source.view.scope_sha256,
          attempt.id,
          editor,
          confirmed,
          () => {
            this.current(review, editor);
          },
        );
      const result = await this.exact(attempt, actor);
      if (!result || !same(result, ack))
        throw Error('Exact issuance acknowledgment missing');
      attempt.record = structuredClone(result.record);
      attempt.state = 'issued';
      return result;
    } catch {
      attempt.state = 'issuance_unknown';
      throw Error(
        'Synthetic issuance outcome UNKNOWN. Read exact issuance status; no offer, replay or replacement.',
      );
    }
  }
  status(org: string, actor: string, estimate: string) {
    this.changes.staff(org, actor);
    const a = this.attempts.get(estimate);
    if (!a) return null;
    if (a.org !== org) throw Error('Exact local attempt unavailable');
    this.changes.repo.operations.syntheticProperty(
      org,
      a.review.source.view.comparison.binding.customer_id,
      a.review.source.view.comparison.binding.location_id,
    );
    return {
      id: a.id,
      state: a.state,
      record: a.record ? structuredClone(a.record) : null,
    };
  }
  private async exact(a: Attempt, actor: string) {
    this.changes.staff(a.org, actor);
    const repo = this.changes.repo.estimates;
    const result = repo.syntheticRevisionIssuance(a.org, actor, a.estimate);
    if (!result) return null;
    const c = a.review.source.view.comparison,
      p = a.claim.packet;
    const stored = this.packets.archive.read(p.snapshot.id);
    if (
      !stored ||
      !same(stored, { snapshot: p.snapshot, integrity: p.integrity }) ||
      stored.integrity.sha256 !== (await documentHash(p.snapshot))
    )
      throw Error('Original immutable packet integrity unavailable');
    const scope = projectRevisionScope(
      result.bundle.version,
      c.binding,
      'issued',
    );
    const hash = await documentHash(scope);
    const record = result.record;
    const expected: SyntheticRevisionIssuance = {
      id: a.id,
      mode: 'local-synthetic-only',
      organization_id: a.org,
      estimate_id: a.estimate,
      customer_id: c.binding.customer_id,
      location_id: c.binding.location_id,
      request_id: c.request.id,
      source_offer_id: c.request.offer_id,
      source_version_id: c.original.id,
      version_id: c.revised.id,
      version_number: 3,
      saved_revision: c.revised.saved_revision,
      packet_id: p.snapshot.id,
      packet_sha256: p.integrity.sha256,
      scope_sha256: a.review.source.view.scope_sha256,
      reviewer: a.actor,
      issued_at: result.bundle.version.issued_at!,
    };
    this.changes.staff(a.org, actor);
    if (
      !same(record, expected) ||
      hash !== record.scope_sha256 ||
      !same(scope, c.revised_scope) ||
      !same(repo.syntheticRevisionIssuance(a.org, actor, a.estimate), result)
    )
      throw Error('Exact issuance/source binding unavailable');
    return result;
  }
  private attempt(org: string, actor: string, estimate: string) {
    this.status(org, actor, estimate);
    const a = this.attempts.get(estimate);
    if (!a || a.org !== org) throw Error('Exact local attempt unavailable');
    return a;
  }
  async prepareOffer(
    org: string,
    actor: string,
    estimate: string,
    confirmed: boolean,
  ) {
    const a = this.attempt(org, actor, estimate);
    if (a.state !== 'issued' || confirmed !== true)
      throw Error(
        'Confirmed issuance and explicit internal offer preparation required; no replay',
      );
    // Reserve before asynchronous verification. Failure is UNKNOWN even if no offer was made.
    a.state = 'preparing_offer';
    try {
      const result = await this.exact(a, actor);
      if (!result) throw Error('Exact issuance unavailable');
      const authorize = () => {
        this.changes.staff(org, actor);
        const e = this.changes.repo.estimates.syntheticRevisionIssuance(
          org,
          actor,
          estimate,
        );
        if (
          !e ||
          !same(e, result) ||
          e.bundle.version.payload.expires_on <
            new Date().toISOString().slice(0, 10)
        )
          throw Error('Exact unexpired issued version required');
        const tax = e.bundle.version.tax_policy_snapshot;
        // Same current local policy as the saved draft, not operational tax approval.
        if (
          !tax ||
          !tax.active ||
          tax.status !== 'reviewed' ||
          !same(
            tax,
            this.changes.repo.estimates.syntheticIssuedTaxState(
              org,
              actor,
              estimate,
            ),
          )
        )
          throw Error('Current reviewed tax required');
      };
      const model = this.changes.customer(this.company(org));
      const offer = await model.prepareRevisedOffer(
        actor,
        estimate,
        a.id,
        authorize,
      );
      authorize();
      a.state = 'offered';
      return offer;
    } catch {
      a.state = 'offer_unknown';
      throw Error(
        'Internal offer outcome UNKNOWN. Read exact offer status; no publish replay or replacement.',
      );
    }
  }
  private company(org: string) {
    const company = sampleCompanies.find((c) => c.id === org);
    if (!company) throw Error('Synthetic company unavailable');
    return company;
  }
  async reconcile(org: string, actor: string, estimate: string) {
    const a = this.attempt(org, actor, estimate);
    if (a.state === 'issuing' || a.state === 'preparing_offer')
      throw Error('Attempt pending; no reconciliation or replay');
    const result = await this.exact(a, actor);
    if (!result) return { status: 'undetermined' as const };
    if (a.state === 'issuance_unknown') {
      a.record = structuredClone(result.record);
      a.state = 'issued';
    }
    let offer = null;
    if (a.state === 'offer_unknown' || a.state === 'offered') {
      offer = this.changes
        .customer(this.company(org))
        .reconcileRevisedOffer(actor, estimate, a.id);
      if (!offer) return { status: 'undetermined' as const };
      a.state = 'offered';
    }
    return { status: a.state, result, offer };
  }
}
export const customerRevisedEstimateLoop = new CustomerRevisedEstimateLoop(
  customerIssuanceReadiness,
);
