import type { EstimateInput } from '../domain/estimating/types';
import { documentHash } from '../domain/release/preview';
import {
  issuanceConditions,
  revisionDeliveryContent,
  LocalIssuanceReviewRecords,
  type IssuanceReviewView,
  type IssuanceReviewResult,
} from '../domain/estimating/issuance-readiness';
import {
  CustomerRevisionPackets,
  customerRevisionPackets,
  type PacketReview,
  type PacketPreview,
} from './customer-revision-packets';

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const today = () => new Date().toISOString().slice(0, 10);
export interface IssuanceReview {
  org: string;
  actor: string;
  estimate: string;
  view: IssuanceReviewView;
}
interface Claim {
  token: string;
  day: string;
  packetReview: PacketReview;
  packet: PacketPreview;
  view: string;
}
interface Attempt {
  expected: IssuanceReviewResult;
  token: string;
  day: string;
  state: 'pending' | 'unknown' | 'reviewed';
}
export class CustomerIssuanceReadiness {
  private claims = new WeakMap<IssuanceReview, Claim>();
  private attempts = new Map<string, Attempt>();
  constructor(
    readonly packets: CustomerRevisionPackets,
    readonly records = new LocalIssuanceReviewRecords(),
  ) {}
  private source(org: string, actor: string, estimate: string) {
    const evidence = this.packets.changes.confirmedRevision(
      org,
      actor,
      estimate,
    ).evidence;
    const tax = this.packets.changes.repo.estimates.customerRevisionTaxState(
      org,
      actor,
      estimate,
    );
    return { evidence, tax };
  }
  private current(review: IssuanceReview, claim: Claim, editor: EstimateInput) {
    this.packets.assertCurrent(claim.packetReview, editor, claim.packet);
    if (
      JSON.stringify(this.source(review.org, review.actor, review.estimate)) !==
        claim.token ||
      today() !== claim.day
    )
      throw Error(
        'Source, tax policy, staff or saved revision changed; reopen exact readiness review',
      );
  }
  async open(
    org: string,
    actor: string,
    estimate: string,
    draft: string,
    revision: number,
    packetId: string,
  ) {
    const source = this.source(org, actor, estimate),
      token = JSON.stringify(source),
      day = today();
    const packetReview = await this.packets.review(
      org,
      actor,
      estimate,
      draft,
      revision,
    );
    const packet = await this.packets.read(org, actor, estimate, packetId);
    const c = packet.snapshot.comparison;
    const view: IssuanceReviewView = {
      comparison: structuredClone(c),
      packet: { id: packet.snapshot.id, sha256: packet.integrity.sha256 },
      scope_sha256: await documentHash(c.revised_scope),
      conditions: issuanceConditions(
        c,
        source.evidence.draft.version.tax_policy_snapshot,
        source.tax,
        day,
      ),
      delivery: revisionDeliveryContent(c),
    };
    const review: IssuanceReview = { org, actor, estimate, view };
    const claim = {
      token,
      day,
      packetReview,
      packet,
      view: JSON.stringify(review),
    };
    this.current(review, claim, source.evidence.draft.version.payload);
    this.claims.set(review, claim);
    return review;
  }
  private key(v: IssuanceReviewView) {
    const c = v.comparison;
    return JSON.stringify([
      c.binding.organization_id,
      c.request.id,
      c.revised.id,
      c.revised.saved_revision,
      v.packet.id,
    ]);
  }
  history(org: string, actor: string, estimate: string) {
    this.source(org, actor, estimate);
    return [...this.attempts.values()]
      .filter(
        (a) =>
          a.expected.review.comparison.binding.organization_id === org &&
          a.expected.review.comparison.binding.estimate_id === estimate,
      )
      .map((a) => ({
        id: a.expected.id,
        revision: a.expected.review.comparison.revised.saved_revision,
        packet_id: a.expected.review.packet.id,
        state: a.state,
      }));
  }
  async record(
    review: IssuanceReview,
    editor: () => EstimateInput,
    confirmed: boolean,
  ) {
    const claim = this.claims.get(review);
    if (!claim || JSON.stringify(review) !== claim.view || confirmed !== true)
      throw Error(
        'Open the exact readiness requirements and explicitly confirm this review-only dry run',
      );
    this.current(review, claim, editor());
    const key = this.key(review.view),
      c = review.view.comparison;
    if (this.attempts.has(key))
      throw Error('Review already attempted; read exact result without replay');
    if (
      [...this.attempts.values()].some(
        (a) =>
          a.expected.review.comparison.request.id === c.request.id &&
          a.state !== 'reviewed',
      )
    )
      throw Error(
        'Unresolved readiness outcome; no retry, new revision or replacement',
      );
    const snapshot: IssuanceReviewResult = {
      schema: 'synthetic-issuance-readiness-v1',
      id: crypto.randomUUID(),
      reviewed_at: new Date().toISOString(),
      reviewer: review.actor,
      verdict: 'BLOCKED',
      authority: 'Review only — no approval or issuance capability',
      review: structuredClone(review.view),
    };
    const attempt: Attempt = {
      expected: structuredClone(snapshot),
      token: claim.token,
      day: claim.day,
      state: 'pending',
    };
    this.attempts.set(key, attempt); // One-shot hold before first await; never reset.
    try {
      const receipt = await this.records.append(snapshot, () =>
        this.current(review, claim, editor()),
      );
      const stored = await this.verified(attempt);
      if (
        !stored ||
        receipt.id !== snapshot.id ||
        receipt.sha256 !== stored.sha256
      )
        throw Error('Exact readiness receipt missing');
      this.current(review, claim, editor());
      attempt.state = 'reviewed';
      return { ...stored, current: true };
    } catch {
      attempt.state = 'unknown';
      throw Error(
        'Readiness outcome UNKNOWN. Read exact result; no replay or replacement.',
      );
    }
  }
  private async verified(a: Attempt) {
    const stored = this.records.read(a.expected.id);
    if (!stored) return null;
    if (
      !same(stored.snapshot, a.expected) ||
      stored.sha256 !== (await documentHash(a.expected))
    )
      throw Error('Readiness integrity evidence unavailable');
    return stored;
  }
  private attempt(org: string, actor: string, estimate: string, id: string) {
    this.source(org, actor, estimate);
    const a = [...this.attempts.values()].find(
      (a) =>
        a.expected.id === id &&
        a.expected.review.comparison.binding.organization_id === org &&
        a.expected.review.comparison.binding.estimate_id === estimate,
    );
    if (!a || a.state === 'pending')
      throw Error('Exact readiness result unavailable');
    return a;
  }
  private async result(
    org: string,
    actor: string,
    estimate: string,
    a: Attempt,
  ) {
    const stored = await this.verified(a);
    const packet = await this.packets.read(
      org,
      actor,
      estimate,
      a.expected.review.packet.id,
    );
    const source = this.source(org, actor, estimate);
    if (
      !same(packet.snapshot.comparison, a.expected.review.comparison) ||
      packet.integrity.sha256 !== a.expected.review.packet.sha256
    )
      throw Error('Exact original packet/source binding unavailable');
    return stored
      ? {
          ...stored,
          current:
            packet.current &&
            JSON.stringify(source) === a.token &&
            today() === a.day,
        }
      : null;
  }
  async read(org: string, actor: string, estimate: string, id: string) {
    const a = this.attempt(org, actor, estimate, id);
    if (a.state !== 'reviewed')
      throw Error('Read exact readiness status before opening UNKNOWN');
    const result = await this.result(org, actor, estimate, a);
    if (!result) throw Error('Readiness evidence unavailable');
    return result;
  }
  async reconcile(org: string, actor: string, estimate: string, id: string) {
    const a = this.attempt(org, actor, estimate, id),
      result = await this.result(org, actor, estimate, a);
    if (!result) return { status: 'undetermined' as const };
    a.state = 'reviewed';
    return { status: 'reviewed' as const, result };
  }
}
export type IssuanceResultPreview = NonNullable<
  Awaited<ReturnType<CustomerIssuanceReadiness['read']>>
>;
export const customerIssuanceReadiness = new CustomerIssuanceReadiness(
  customerRevisionPackets,
);
