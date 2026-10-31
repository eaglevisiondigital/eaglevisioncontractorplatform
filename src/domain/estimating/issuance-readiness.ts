import type { TaxPolicy } from './types';
import type { RevisionComparison } from './revision-packet';
import { formatMinor } from './calculation';
import { documentHash } from '../release/preview';
import {
  escapeCommunicationText as escape,
  brandedCommunicationHtml,
} from '../communications/content';

export interface ReadinessCondition {
  id: string;
  status: 'PASS' | 'BLOCKED' | 'UNVERIFIED';
  label: string;
  detail: string;
}
export function issuanceConditions(
  c: RevisionComparison,
  savedTax: TaxPolicy | null,
  currentTax: TaxPolicy | null,
  day: string,
): ReadinessCondition[] {
  const taxCurrent =
    savedTax !== null &&
    currentTax !== null &&
    currentTax.active &&
    currentTax.status === 'reviewed' &&
    JSON.stringify(savedTax) === JSON.stringify(currentTax);
  return [
    {
      id: 'source',
      status: 'PASS',
      label: 'Exact request and issued source',
      detail:
        'Actual customer receipt/offer, original issued version, tenant and CRM property match the confirmed revision.',
    },
    {
      id: 'saved',
      status: 'PASS',
      label: 'Current saved draft and packet',
      detail:
        'Exact version/lock revision, immutable packet and canonical customer-facing calculation verified. Unsaved editor changes must still be excluded at confirmation.',
    },
    {
      id: 'staff',
      status: 'PASS',
      label: 'Current synthetic staff eligibility',
      detail:
        'Existing active estimating membership checked. This is not genuine operational authentication.',
    },
    {
      id: 'tax',
      status: taxCurrent ? 'PASS' : 'BLOCKED',
      label: 'Saved and current local tax policy',
      detail: taxCurrent
        ? 'Saved reviewed tax snapshot matches the current active local policy. This does not prove jurisdictional tax compliance.'
        : 'Current active reviewed tax policy is missing or differs from the saved snapshot. Reassess and save the draft, then prepare a new packet.',
    },
    {
      id: 'expiration',
      status: c.revised_scope.expires_on >= day ? 'PASS' : 'BLOCKED',
      label: 'Proposed expiration',
      detail:
        c.revised_scope.expires_on >= day
          ? `Recorded expiration ${c.revised_scope.expires_on} has not passed as of ${day} UTC.`
          : `Recorded expiration ${c.revised_scope.expires_on} has passed as of ${day} UTC.`,
    },
    {
      id: 'terms',
      status: c.revised_scope.terms.trim() ? 'PASS' : 'BLOCKED',
      label: 'Customer-facing terms recorded',
      detail: c.revised_scope.terms.trim()
        ? 'Terms are present in the saved scope; legal suitability remains unverified.'
        : 'No customer-facing terms are recorded in this saved draft.',
    },
    {
      id: 'issuance',
      status: 'BLOCKED',
      label: 'Revised estimate issuance',
      detail:
        'Existing customer-revision issue restriction remains enabled. This dry run neither calls issue_estimate nor creates an issuance capability.',
    },
    {
      id: 'sender',
      status: 'UNVERIFIED',
      label: 'Tenant sender and domain authentication',
      detail:
        'No active sender/account, current domain verification or SPF/DKIM/DMARC evidence has been resolved.',
    },
    {
      id: 'recipient',
      status: 'UNVERIFIED',
      label: 'Verified customer contact',
      detail:
        'No address is resolved. Current recipient ownership, verification and tenant/customer binding require separate evidence.',
    },
    {
      id: 'consent',
      status: 'UNVERIFIED',
      label: 'Consent, preferences and suppression',
      detail:
        'Purpose/channel-specific consent and current preferences/suppression have not been checked. A change request is not delivery consent.',
    },
    {
      id: 'access',
      status: 'BLOCKED',
      label: 'Secure customer review access',
      detail:
        'Connected customer access is closed. No authenticated expiring link, mapping or lease is created.',
    },
    {
      id: 'operational',
      status: 'UNVERIFIED',
      label: 'Operational authority and acceptance',
      detail:
        'Genuine staff/customer Auth, durable one-shot custody, legal/tax review and separately approved issuance/delivery remain prerequisites. Local PASS is not launch approval.',
    },
  ];
}
export function revisionDeliveryContent(c: RevisionComparison) {
  const s = c.revised_scope;
  const subject =
    `${c.contractor.name}: Proposed revision ${c.estimate_number} (version ${c.revised.version})`.replace(
      /[\r\n]+/g,
      ' ',
    );
  const money = (n: number) => formatMinor(n, s.currency);
  const sections = [
    [
      'Draft Estimate — Not Issued or Sent',
      'Staff-only delivery-content dry run. No customer response or access link is available.',
    ],
    ['Customer and property', `${c.customer_name}\n${c.property_label}`],
    [
      'Original request reference',
      `Receipt ${c.request.id}\nOriginal issued version ${c.original.version} (${c.original.id})\n${c.request.note}`,
    ],
    [
      'Proposed revised estimate',
      `${c.estimate_number} · Version ${c.revised.version} · Saved revision ${c.revised.saved_revision}\nDraft ${c.revised.id}`,
    ],
    [
      'Proposed scope',
      `${s.project.name}\n${s.project.description}\n${s.lines.map((l) => `${l.description} · ${l.quantity_milli / 1000} ${l.unit.replaceAll('_', ' ')} · ${money(l.amount_minor)}`).join('\n')}`,
    ],
    [
      'Customer-facing change summary',
      c.differences.lines
        .map(
          (l) =>
            `${l.status}: ${l.after?.description ?? l.before!.description}`,
        )
        .join('\n'),
    ],
    [
      'Proposed selling amounts',
      `Subtotal ${money(s.totals.subtotal_minor)}\nDiscount ${money(s.totals.discount_minor)}\nTax ${money(s.totals.tax_minor)}\nTotal ${money(s.totals.total_minor)}`,
    ],
    [
      'Proposed dates',
      `Start ${s.project.start_on ?? 'Not recorded'}\nEnd ${s.project.end_on ?? 'Not recorded'}\nExpiration ${s.expires_on}`,
    ],
    [
      'Proposed payment schedule — no obligation',
      s.schedule
        .map(
          (p) =>
            `${p.label} · ${money(p.amount_minor)} · Due ${p.due_on ?? 'Not recorded'}`,
        )
        .join('\n') || 'None recorded',
    ],
    ['Customer notes', s.notes || 'None recorded'],
    ['Terms', s.terms || 'Not recorded'],
    [
      'Delivery prerequisites',
      'Sender authentication, verified customer contact, consent/preferences/suppression and secure customer access require separate verification. No recipient, sender or link has been invented.',
    ],
  ];
  const text = `${c.contractor.name}\n\n${sections.map(([title, body]) => `${title}\n${body}`).join('\n\n')}`;
  const content = sections
    .map(
      ([title, body]) =>
        `<section><h2>${escape(title)}</h2><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(body)}</p></section>`,
    )
    .join('');
  const html = brandedCommunicationHtml(
    subject,
    c.contractor.name,
    c.contractor.primary_color,
    content,
  )
    .replace('<html lang="en">', '<html lang="en" dir="ltr">')
    .replace(
      '<head>',
      '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:16px;background:#fff;color:#20313a;font:16px/1.5 system-ui,sans-serif}main{padding:16px;overflow-wrap:anywhere}h1{font-size:24px}h2{font-size:18px;margin-top:24px}</style>',
    )
    .replace('<main style=', '<main lang="en" dir="ltr" style=');
  return {
    subject,
    text,
    html,
    from: null,
    to: null,
    reply_to: null,
    secure_link: null,
    delivery: 'disabled' as const,
    providerRequest: null,
  };
}
export interface IssuanceReviewView {
  comparison: RevisionComparison;
  packet: { id: string; sha256: string };
  scope_sha256: string;
  conditions: ReadinessCondition[];
  delivery: ReturnType<typeof revisionDeliveryContent>;
}
export interface IssuanceReviewResult {
  schema: 'synthetic-issuance-readiness-v1';
  id: string;
  reviewed_at: string;
  reviewer: string;
  verdict: 'BLOCKED';
  authority: 'Review only — no approval or issuance capability';
  review: IssuanceReviewView;
}
export interface StoredIssuanceReview {
  snapshot: IssuanceReviewResult;
  sha256: string;
}
function freeze(value: unknown) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
/** Private local review evidence only, not an estimate, outbox, ledger or operational approval. */
export class LocalIssuanceReviewRecords {
  private records = new Map<string, StoredIssuanceReview>();
  private bindings = new Set<string>();
  async append(input: IssuanceReviewResult, authorize: () => void) {
    const snapshot = structuredClone(input),
      sha256 = await documentHash(snapshot);
    const c = snapshot.review.comparison;
    const key = JSON.stringify([
      c.binding.organization_id,
      c.request.id,
      c.revised.id,
      c.revised.saved_revision,
      snapshot.review.packet.id,
    ]);
    authorize();
    if (this.records.has(snapshot.id) || this.bindings.has(key))
      throw Error('Readiness review already recorded');
    const stored = { snapshot, sha256 };
    freeze(stored);
    this.records.set(snapshot.id, stored);
    this.bindings.add(key);
    return { id: snapshot.id, sha256 };
  }
  read(id: string) {
    return structuredClone(this.records.get(id) ?? null);
  }
}
