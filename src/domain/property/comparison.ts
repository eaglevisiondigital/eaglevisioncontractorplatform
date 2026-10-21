import type { EstimateLine, EstimateUnit } from '../estimating/types';
import { normalizeProduct } from '../jobs/financials';
export interface Requirement {
  line_id: string;
  description: string;
  sku: string;
  specification: string;
  quantity_milli: number;
  unit: string;
}
export interface QuoteLine {
  line_id: string;
  sku: string;
  specification: string;
  unit: string;
  pack_quantity_milli: number;
  pack_price_minor: number;
  available_packs: number | null;
  equivalent_approved: boolean;
}
export interface SupplierQuote {
  id: string;
  name: string;
  store: string;
  account_price_note: string;
  source_reference: string;
  quoted_at: string;
  expires_at: string;
  currency: string;
  shipping_minor: number | null;
  pickup_minor: number | null;
  tax_bps: number | null;
  lines: QuoteLine[];
}
const checked = (v: bigint) => {
  if (v < 0n || v > 9000000000000n)
    throw Error('Procurement amount exceeds limits');
  return Number(v);
};
const integer = (v: number, max = 9000000000000) => {
  if (!Number.isSafeInteger(v) || v < 0 || v > max)
    throw Error('Invalid procurement value');
  return v;
};
const units: Record<string, [string, bigint]> = {
  each: ['each', 1n],
  bundle: ['bundle', 1n],
  linear_ft: ['length', 12n],
  inch: ['length', 1n],
  sq_ft: ['area', 1n],
  roofing_square: ['area', 100n],
  cubic_yard: ['volume', 1n],
};
export function convertQuantity(q: number, from: string, to: string) {
  integer(q, 1000000000);
  const a = units[from],
    b = units[to];
  if (!a || !b || a[0] !== b[0])
    throw Error('Unit equivalence requires review');
  const n = BigInt(q) * a[1];
  if (n % b[1]) throw Error('Conversion precision requires review');
  return checked(n / b[1]);
}
export function requirementsFromLines(lines: EstimateLine[]): Requirement[] {
  return lines
    .filter((x) => ['material', 'product', 'allowance'].includes(x.kind))
    .map((x) => ({
      line_id: x.id,
      description: x.description,
      sku: '',
      specification: x.description,
      quantity_milli: x.quantity_milli,
      unit: x.unit,
    }));
}
export function quoteExtension(
  r: Requirement,
  q: SupplierQuote,
  now = Date.now(),
) {
  if (
    !Number.isFinite(Date.parse(q.quoted_at)) ||
    Date.parse(q.quoted_at) > now ||
    !Number.isFinite(Date.parse(q.expires_at)) ||
    Date.parse(q.expires_at) <= now
  )
    return { reason: 'Expired or invalid quote' };
  const matches = q.lines.filter((l) => l.line_id === r.line_id);
  if (matches.length !== 1)
    return {
      reason: matches.length ? 'Duplicate quote line' : 'Unmatched product',
    };
  const l = matches[0];
  if (
    (normalizeProduct(l.specification) !== normalizeProduct(r.specification) ||
      (r.sku && normalizeProduct(r.sku) !== normalizeProduct(l.sku))) &&
    !l.equivalent_approved
  )
    return { reason: 'Substitution needs explicit equivalence review' };
  let qty: number;
  try {
    qty = convertQuantity(r.quantity_milli, r.unit, l.unit);
  } catch {
    return { reason: 'Incompatible unit or precision' };
  }
  integer(l.pack_quantity_milli, 1000000000);
  integer(l.pack_price_minor);
  if (!l.pack_quantity_milli || qty <= 0)
    throw Error('Positive pack and required quantity required');
  const packs =
    (BigInt(qty) + BigInt(l.pack_quantity_milli) - 1n) /
    BigInt(l.pack_quantity_milli);
  if (l.available_packs !== null) {
    integer(l.available_packs, 1000000000);
    if (packs > BigInt(l.available_packs))
      return { reason: 'Unavailable quantity' };
  }
  if (l.available_packs === null) return { reason: 'Availability unknown' };
  if (q.tax_bps === null) return { reason: 'Tax unknown' };
  integer(q.tax_bps, 10000);
  const goods = BigInt(l.pack_price_minor) * packs;
  const tax = (goods * BigInt(q.tax_bps) + 5000n) / 10000n;
  return {
    reason: null,
    packs: Number(packs),
    overbuy_milli: checked(packs * BigInt(l.pack_quantity_milli) - BigInt(qty)),
    goods_minor: checked(goods),
    tax_minor: checked(tax),
    total_minor: checked(goods + tax),
    quote_line: l,
  };
}
export function compareSuppliers(
  requirements: Requirement[],
  quotes: SupplierQuote[],
  currency: string,
  now = Date.now(),
) {
  if (
    !requirements.length ||
    requirements.length > 100 ||
    quotes.length < 1 ||
    quotes.length > 4 ||
    new Set(quotes.map((q) => q.id)).size !== quotes.length ||
    new Set(requirements.map((r) => r.line_id)).size !== requirements.length
  )
    throw Error('Select 1–4 distinct suppliers and 1–100 distinct materials');
  if (
    quotes.some(
      (q) =>
        q.currency !== currency ||
        !q.source_reference.trim() ||
        !q.name.trim() ||
        q.lines.length > 100 ||
        new Set(q.lines.map((l) => l.line_id)).size !== q.lines.length,
    )
  )
    throw Error('Quote currency, provenance or duplicate conflict');
  const vendors = quotes.map((q) => {
    const rows = requirements.map((r) => quoteExtension(r, q, now));
    const fees =
      q.shipping_minor === null || q.pickup_minor === null
        ? null
        : checked(
            BigInt(integer(q.shipping_minor)) + BigInt(integer(q.pickup_minor)),
          );
    return {
      quote: q,
      rows,
      fees_minor: fees,
      total_minor:
        fees === null || rows.some((x) => x.reason !== null)
          ? null
          : checked(
              BigInt(fees) +
                rows.reduce((s, x) => s + BigInt(x.total_minor!), 0n),
            ),
    };
  });
  let mixed: {
    total_minor: number;
    assignments: { line_id: string; quote_id: string; cost_minor: number }[];
  } | null = null;
  for (let mask = 1; mask < 1 << vendors.length; mask++) {
    const chosen = requirements.map((r, i) => {
      const options = vendors
        .filter(
          (v, j) =>
            mask & (1 << j) &&
            v.fees_minor !== null &&
            v.rows[i].reason === null,
        )
        .sort(
          (a, b) =>
            a.rows[i].total_minor! - b.rows[i].total_minor! ||
            a.quote.id.localeCompare(b.quote.id),
        );
      const v = options[0];
      return v
        ? {
            line_id: r.line_id,
            quote_id: v.quote.id,
            cost_minor: v.rows[i].total_minor!,
          }
        : null;
    });
    if (chosen.some((x) => !x)) continue;
    const assignments = chosen.filter((x) => x !== null);
    const used = new Set(assignments.map((x) => x.quote_id));
    const total = checked(
      assignments.reduce((s, x) => s + BigInt(x.cost_minor), 0n) +
        vendors
          .filter((v) => used.has(v.quote.id))
          .reduce((s, v) => s + BigInt(v.fees_minor!), 0n),
    );
    if (!mixed || total < mixed.total_minor)
      mixed = { total_minor: total, assignments };
  }
  return { vendors, mixed };
}
/** Suggest only representable integer unit costs; never silently lose pack overbuy. */
export function draftCostLines(
  lines: EstimateLine[],
  requirements: Requirement[],
  quotes: SupplierQuote[],
  assignments: { line_id: string; quote_id: string }[],
  now = Date.now(),
) {
  if (
    !assignments.length ||
    assignments.some(
      (a) =>
        !requirements.some((r) => r.line_id === a.line_id) ||
        !lines.some((l) => l.id === a.line_id),
    )
  )
    throw Error('Unknown or empty material assignments');
  if (new Set(assignments.map((a) => a.line_id)).size !== assignments.length)
    throw Error('Duplicate assignment');
  return lines.map((l) => {
    const a = assignments.find((a) => a.line_id === l.id);
    if (!a) return structuredClone(l);
    const r = requirements.find((r) => r.line_id === l.id),
      q = quotes.find((q) => q.id === a.quote_id);
    if (!r || !q || l.quantity_milli !== r.quantity_milli || l.unit !== r.unit)
      throw Error('Scope changed');
    const e = quoteExtension(r, q, now);
    if (e.reason !== null) throw Error(e.reason);
    const cost = BigInt(e.goods_minor!);
    const unit =
      (cost * 1000n + BigInt(l.quantity_milli) / 2n) / BigInt(l.quantity_milli);
    if ((unit * BigInt(l.quantity_milli) + 500n) / 1000n !== cost)
      throw Error('Pack cost cannot be represented exactly; review manually');
    return {
      ...l,
      unit_cost_minor: checked(unit),
      internal_note: `${l.internal_note}\nReviewed quote ${q.name}; procurement tax/fees remain separate.`,
      unit: l.unit as EstimateUnit,
    };
  });
}
