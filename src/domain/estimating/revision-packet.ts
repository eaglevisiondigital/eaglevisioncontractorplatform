import type { EstimateVersion } from './types';
import { calculateEstimate } from './calculation';
import { customerPreview } from './customer-preview';
import { documentHash } from '../release/preview';

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function packetText(value: unknown, limit = 10000): string {
  if (typeof value !== 'string' || value.length > limit)
    throw Error('Invalid customer-safe text');
  return value;
}
export interface PacketBinding {
  organization_id: string;
  customer_id: string;
  location_id: string;
  estimate_id: string;
}
/** Narrow draft-safe projection. No issued status substitution, internal spreads or private calculation fields. */
export function projectRevisionScope(
  v: EstimateVersion,
  binding: PacketBinding,
  status: 'issued' | 'draft',
) {
  const p = v.payload,
    policy = v.tax_policy_snapshot;
  if (
    v.status !== status ||
    v.organization_id !== binding.organization_id ||
    v.estimate_id !== binding.estimate_id ||
    p.customer_id !== binding.customer_id ||
    p.location_id !== binding.location_id ||
    !policy ||
    policy.organization_id !== binding.organization_id ||
    policy.id !== p.tax_policy_id ||
    policy.status !== 'reviewed' ||
    new Set(p.lines.map((l) => l.id)).size !== p.lines.length ||
    !same(calculateEstimate(p, policy.rate_bps), v.calculation)
  )
    throw Error('Exact saved scope and canonical calculation required');
  const safe = customerPreview(v);
  // Every nested object is reconstructed; unknown fields on internal snapshots never pass through.
  return {
    project: {
      name: p.project.name,
      type: p.project.type,
      description: p.project.description,
      start_on: p.project.start_on,
      end_on: p.project.end_on,
    },
    currency: p.currency,
    expires_on: p.expires_on,
    notes: safe.notes,
    terms: safe.terms,
    lines: p.lines
      .filter((l) => v.calculation.lines.find((c) => c.id === l.id)?.included)
      .map((l) => ({
        id: l.id,
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
        amount_minor: v.calculation.lines.find((c) => c.id === l.id)!
          .subtotal_minor,
      })),
    totals: {
      subtotal_minor: safe.subtotal_minor,
      discount_minor: safe.discount_minor,
      tax_minor: safe.tax_minor,
      total_minor: safe.total_minor,
    },
    schedule: v.calculation.payment_schedule.map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      due_on: s.due_on,
      amount_minor: s.amount_minor,
    })),
    attachments: p.attachments
      .filter((a) => a.customer_visible)
      .map((a) => {
        const snapshots = v.attachment_snapshots.filter(
          (s) => s.document_id === a.document_id && s.customer_visible,
        );
        if (snapshots.length !== 1)
          throw Error(
            'Reviewed customer-visible attachment metadata unavailable',
          );
        return {
          display_name: packetText(snapshots[0].display_name, 500),
          content_type: packetText(snapshots[0].content_type, 200),
        };
      }),
  };
}
export type RevisionScope = ReturnType<typeof projectRevisionScope>;
export function compareRevisionScopes(
  original: RevisionScope,
  revised: RevisionScope,
) {
  if (original.currency !== revised.currency)
    throw Error('Matching currency required');
  const ids = new Set([...original.lines, ...revised.lines].map((l) => l.id));
  const lines = [...ids].map((id) => {
    const before = original.lines.find((l) => l.id === id) ?? null;
    const after = revised.lines.find((l) => l.id === id) ?? null;
    const status = !before
      ? ('Added' as const)
      : !after
        ? ('Removed' as const)
        : same(before, after)
          ? ('Unchanged' as const)
          : ('Modified' as const);
    return { id, status, before, after };
  });
  const fields = (
    [
      'project',
      'expires_on',
      'notes',
      'terms',
      'schedule',
      'attachments',
    ] as const
  ).map((field) => ({
    field,
    changed: !same(original[field], revised[field]),
    before: original[field],
    after: revised[field],
  }));
  const totals = (
    ['subtotal_minor', 'discount_minor', 'tax_minor', 'total_minor'] as const
  ).map((field) => ({
    field,
    before: original.totals[field],
    after: revised.totals[field],
    difference: revised.totals[field] - original.totals[field],
    changed: original.totals[field] !== revised.totals[field],
  }));
  return {
    lines,
    fields,
    totals,
    line_order_changed: !same(
      original.lines.map((l) => l.id),
      revised.lines.map((l) => l.id),
    ),
  };
}
export interface ReviewSourceAssociation {
  report_id: string;
  published_version: number;
  finding_id: string;
  source_line_id: string;
}
export interface RevisionComparison {
  binding: PacketBinding;
  contractor: { name: string; primary_color: string; accent_color: string };
  customer_name: string;
  property_label: string;
  estimate_number: string;
  original: { id: string; version: number; issued_at: string };
  revised: { id: string; version: number; saved_revision: number };
  request: {
    id: string;
    offer_id: string;
    decision: 'changes_requested';
    note: string;
    recorded_at: string;
  };
  source_association: ReviewSourceAssociation | null;
  original_scope: RevisionScope;
  revised_scope: RevisionScope;
  differences: ReturnType<typeof compareRevisionScopes>;
}
export interface ReviewPacket {
  schema: 'synthetic-customer-review-packet-v1';
  id: string;
  created_at: string;
  prepared_by: string;
  title: 'Customer Review Packet — Staff Preview Only';
  authority: 'Draft Estimate — Not Issued or Sent';
  comparison: RevisionComparison;
}
export interface StoredReviewPacket {
  snapshot: ReviewPacket;
  integrity: { algorithm: 'SHA-256'; sha256: string };
}
function freeze(value: unknown) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
/** Immutable packet archive in this tab only. No database, estimate ledger, file storage or delivery port. */
export class LocalReviewPacketArchive {
  private packets = new Map<string, StoredReviewPacket>();
  private bindings = new Set<string>();
  async append(input: ReviewPacket, authorize: () => void) {
    const snapshot = structuredClone(input);
    const sha256 = await documentHash(snapshot);
    const c = snapshot.comparison;
    const key = JSON.stringify([
      c.binding.organization_id,
      c.request.id,
      c.revised.id,
      c.revised.saved_revision,
    ]);
    authorize(); // Last synchronous authority/CAS checkpoint, after hashing.
    if (this.packets.has(snapshot.id) || this.bindings.has(key))
      throw Error('Packet already prepared');
    const stored: StoredReviewPacket = {
      snapshot,
      integrity: { algorithm: 'SHA-256', sha256 },
    };
    freeze(stored);
    this.packets.set(snapshot.id, stored);
    this.bindings.add(key);
    return { id: snapshot.id, sha256 };
  }
  read(id: string) {
    return structuredClone(this.packets.get(id) ?? null);
  }
}
