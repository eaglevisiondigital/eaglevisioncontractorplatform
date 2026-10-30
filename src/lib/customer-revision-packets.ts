import type { EstimateInput } from '../domain/estimating/types';
import {
  packetText,
  projectRevisionScope,
  compareRevisionScopes,
  LocalReviewPacketArchive,
  type RevisionComparison,
  type ReviewPacket,
  type StoredReviewPacket,
} from '../domain/estimating/revision-packet';
import { documentHash } from '../domain/release/preview';
import {
  CustomerChangeWorkspace,
  customerChangeWorkspace,
} from './customer-change-workspace';

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export interface PacketReview {
  org: string;
  actor: string;
  estimate: string;
  receipt: string;
  draft: string;
  revision: number;
  comparison: RevisionComparison;
}
interface PacketAttempt {
  context: string;
  expected: ReviewPacket;
  state: 'pending' | 'unknown' | 'prepared';
}
export class CustomerRevisionPackets {
  private reviews = new WeakMap<
    PacketReview,
    { context: string; review: string }
  >();
  private attempts = new Map<string, PacketAttempt>();
  constructor(
    readonly changes: CustomerChangeWorkspace,
    readonly archive = new LocalReviewPacketArchive(),
  ) {}
  private context(org: string, actor: string, estimate: string) {
    const context = this.changes.confirmedRevision(org, actor, estimate);
    const { evidence, request, sourceReview } = context;
    const { origin, source, draft } = evidence;
    if (
      sourceReview.version_id !== source.id ||
      sourceReview.customer_id !== origin.customer_id ||
      sourceReview.location_id !== origin.location_id ||
      sourceReview.estimate_id !== estimate ||
      !source.issued_at
    )
      throw Error('Exact issued source unavailable');
    let association = null;
    if (sourceReview.source_report_id !== null) {
      const reports = this.changes.repo
        .portal(org, origin.customer_id)
        .reports.filter(
          (r) =>
            r.id === sourceReview.source_report_id &&
            r.location_id === origin.location_id,
        );
      const report = reports[0];
      if (
        reports.length !== 1 ||
        !report ||
        report.organization_id !== org ||
        report.findings.filter((f) => f.id === sourceReview.finding_id)
          .length !== 1 ||
        !source.payload.lines.some((l) => l.id === sourceReview.source_line_id)
      )
        throw Error('Exact published inspection association unavailable');
      association = {
        report_id: report.id,
        published_version: report.version,
        finding_id: sourceReview.finding_id!,
        source_line_id: sourceReview.source_line_id!,
      };
    }
    const binding = {
      organization_id: org,
      customer_id: origin.customer_id,
      location_id: origin.location_id,
      estimate_id: estimate,
    };
    const original = projectRevisionScope(source, binding, 'issued');
    const revised = projectRevisionScope(draft.version, binding, 'draft');
    const comparison: RevisionComparison = {
      binding,
      contractor: {
        name: packetText(source.company_snapshot.name, 200),
        primary_color: packetText(source.company_snapshot.primary_color, 20),
        accent_color: packetText(source.company_snapshot.accent_color, 20),
      },
      customer_name: packetText(request.customer_name, 200),
      property_label: packetText(request.property_label, 500),
      estimate_number: packetText(draft.estimate.estimate_number, 100),
      original: {
        id: source.id,
        version: source.version_number,
        issued_at: source.issued_at,
      },
      revised: {
        id: draft.version.id,
        version: draft.version.version_number,
        saved_revision: draft.version.lock_revision,
      },
      request: {
        id: request.receipt.id,
        offer_id: request.offer_id,
        decision: 'changes_requested',
        note: packetText(request.receipt.note, 2000),
        recorded_at: request.receipt.created_at,
      },
      source_association: association,
      original_scope: original,
      revised_scope: revised,
      differences: compareRevisionScopes(original, revised),
    };
    return { evidence, comparison };
  }
  private assertBinding(
    current: RevisionComparison,
    expected: RevisionComparison,
  ) {
    if (
      !same(current.binding, expected.binding) ||
      !same(current.request, expected.request) ||
      !same(current.original, expected.original) ||
      !same(current.original_scope, expected.original_scope) ||
      !same(current.source_association, expected.source_association) ||
      current.revised.id !== expected.revised.id
    )
      throw Error('Packet source/customer/property binding changed');
  }
  private key(c: RevisionComparison) {
    return JSON.stringify([
      c.binding.organization_id,
      c.request.id,
      c.revised.id,
      c.revised.saved_revision,
    ]);
  }
  /** Final synchronous guard for a separately confirmed local review, never an issue capability. */
  assertCurrent(
    review: PacketReview,
    editor: EstimateInput,
    packet: PacketPreview,
  ) {
    const claim = this.reviews.get(review);
    if (!claim || JSON.stringify(review) !== claim.review)
      throw Error('Exact saved packet review required');
    const context = this.context(review.org, review.actor, review.estimate);
    const attempt = this.attempts.get(this.key(context.comparison));
    const stored = this.archive.read(packet.snapshot.id);
    if (
      JSON.stringify(context) !== claim.context ||
      !same(editor, context.evidence.draft.version.payload) ||
      !attempt ||
      attempt.state !== 'prepared' ||
      attempt.context !== claim.context ||
      !packet.current ||
      !same(attempt.expected, packet.snapshot) ||
      !same(packet.snapshot.comparison, review.comparison) ||
      !stored ||
      !same(stored.snapshot, packet.snapshot) ||
      !same(stored.integrity, packet.integrity)
    )
      throw Error(
        'Current non-stale packet and exact clean saved draft required',
      );
  }
  async review(
    org: string,
    actor: string,
    estimate: string,
    draft: string,
    revision: number,
  ): Promise<PacketReview> {
    const context = this.context(org, actor, estimate);
    if (
      context.comparison.revised.id !== draft ||
      context.comparison.revised.saved_revision !== revision
    )
      throw Error('Draft changed; reload the saved revision comparison');
    const result = {
      org,
      actor,
      estimate,
      receipt: context.comparison.request.id,
      draft,
      revision,
      comparison: structuredClone(context.comparison),
    };
    this.reviews.set(result, {
      context: JSON.stringify(context),
      review: JSON.stringify(result),
    });
    return result;
  }
  history(org: string, actor: string, estimate: string) {
    const context = this.context(org, actor, estimate);
    return [...this.attempts.values()]
      .filter(
        (a) =>
          a.expected.comparison.binding.organization_id === org &&
          a.expected.comparison.binding.estimate_id === estimate,
      )
      .map((a) => ({
        id: a.expected.id,
        revision: a.expected.comparison.revised.saved_revision,
        state: a.state,
        current: a.context === JSON.stringify(context),
        created_at: a.expected.created_at,
      }));
  }
  async prepare(
    review: PacketReview,
    editor: EstimateInput,
    confirmed: boolean,
  ) {
    const claim = this.reviews.get(review);
    if (!claim || !same(review, JSON.parse(claim.review)) || confirmed !== true)
      throw Error(
        'Open and explicitly confirm the exact saved revision comparison',
      );
    const context = this.context(review.org, review.actor, review.estimate);
    if (
      JSON.stringify(context) !== claim.context ||
      !same(editor, context.evidence.draft.version.payload)
    )
      throw Error(
        'Unsaved or stale draft; save and reopen the current comparison',
      );
    const key = this.key(context.comparison);
    if (this.attempts.has(key))
      throw Error(
        'Packet already attempted. Read exact packet status; do not retry.',
      );
    if (
      [...this.attempts.values()].some(
        (a) =>
          a.expected.comparison.request.id === review.receipt &&
          a.state !== 'prepared',
      )
    )
      throw Error(
        'Unresolved packet outcome; read exact status without replay',
      );
    const snapshot: ReviewPacket = {
      schema: 'synthetic-customer-review-packet-v1',
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      prepared_by: review.actor,
      title: 'Customer Review Packet — Staff Preview Only',
      authority: 'Draft Estimate — Not Issued or Sent',
      comparison: structuredClone(context.comparison),
    };
    const attempt: PacketAttempt = {
      context: claim.context,
      expected: structuredClone(snapshot),
      state: 'pending',
    };
    this.attempts.set(key, attempt); // Pre-await one-shot hold. Never reset or replace it.
    try {
      const receipt = await this.archive.append(snapshot, () => {
        if (
          JSON.stringify(
            this.context(review.org, review.actor, review.estimate),
          ) !== claim.context
        )
          throw Error(
            'Current staff/source/draft changed before packet commit',
          );
      });
      if (receipt.id !== snapshot.id)
        throw Error('Wrong packet acknowledgment');
      const stored = await this.verified(attempt);
      if (
        !stored ||
        stored.integrity.sha256 !== receipt.sha256 ||
        JSON.stringify(
          this.context(review.org, review.actor, review.estimate),
        ) !== claim.context
      )
        throw Error('Missing exact current packet receipt');
      attempt.state = 'prepared';
      return { ...stored, current: true };
    } catch {
      attempt.state = 'unknown';
      throw Error(
        'Packet outcome UNKNOWN. Read exact packet status; no retry or replacement.',
      );
    }
  }
  private async verified(attempt: PacketAttempt) {
    const stored = this.archive.read(attempt.expected.id);
    if (!stored) return null;
    if (
      !same(stored.snapshot, attempt.expected) ||
      stored.integrity.algorithm !== 'SHA-256' ||
      stored.integrity.sha256 !== (await documentHash(attempt.expected))
    )
      throw Error('Packet integrity evidence unavailable');
    return stored;
  }
  async read(org: string, actor: string, estimate: string, id: string) {
    this.context(org, actor, estimate);
    const attempt = [...this.attempts.values()].find(
      (a) =>
        a.expected.id === id &&
        a.expected.comparison.binding.organization_id === org &&
        a.expected.comparison.binding.estimate_id === estimate,
    );
    if (!attempt || attempt.state !== 'prepared')
      throw Error(
        'Read exact packet status before opening an uncertain packet',
      );
    const stored = await this.verified(attempt);
    const context = this.context(org, actor, estimate);
    if (!stored) throw Error('Packet evidence unavailable');
    this.assertBinding(context.comparison, attempt.expected.comparison);
    return { ...stored, current: attempt.context === JSON.stringify(context) };
  }
  async reconcile(org: string, actor: string, estimate: string, id: string) {
    this.context(org, actor, estimate);
    const attempt = [...this.attempts.values()].find(
      (a) =>
        a.expected.id === id &&
        a.expected.comparison.binding.organization_id === org &&
        a.expected.comparison.binding.estimate_id === estimate,
    );
    if (!attempt || attempt.state === 'pending')
      throw Error('Exact packet status unavailable');
    const stored = await this.verified(attempt);
    const context = this.context(org, actor, estimate);
    if (!stored) return { status: 'undetermined' as const };
    this.assertBinding(context.comparison, attempt.expected.comparison);
    attempt.state = 'prepared';
    return {
      status: 'prepared' as const,
      packet: {
        ...stored,
        current: attempt.context === JSON.stringify(context),
      },
    };
  }
}
export type PacketPreview = StoredReviewPacket & { current: boolean };
export const customerRevisionPackets = new CustomerRevisionPackets(
  customerChangeWorkspace,
);
