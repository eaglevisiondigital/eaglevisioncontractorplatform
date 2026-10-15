import {
  decimalToScaled,
  parseMinor,
  blankLine,
} from '../estimating/calculation';
import {
  estimateUnits,
  type EstimateUnit,
  type EstimateLine,
} from '../estimating/types';
export type Pricing = {
  mode: 'pass_through' | 'percent' | 'fixed';
  value: number;
};
export interface SourceRef {
  page: number | null;
  sheet: string | null;
  cell: string | null;
  excerpt: string;
}
export interface ExtractedLine {
  id: string;
  description: string;
  sku: string | null;
  quantity_text: string | null;
  unit_text: string | null;
  unit_cost_text: string | null;
  extension_text: string | null;
  confidence: number | null;
  reference: SourceRef;
}
export interface Extraction {
  schema_version: 1;
  vendor: string | null;
  quoted_on: string | null;
  currency: string | null;
  total_text: string | null;
  lines: ExtractedLine[];
  warnings: string[];
}
export interface MaterialSource {
  id: string;
  filename: string;
  sha256: string;
  status: 'quarantined' | 'clean' | 'rejected' | 'failed';
  provenance: 'synthetic_fixture' | 'live';
  extraction: Extraction | null;
}
export interface ReviewLine {
  estimate_line_id?: string | null;
  id: string;
  source_id: string;
  vendor: string;
  quoted_on: string | null;
  sku: string;
  description: string;
  quantity_milli: number | null;
  unit: EstimateUnit | null;
  unit_cost_minor: number | null;
  selected: boolean;
  warnings: string[];
  acknowledged: boolean;
  pricing: Pricing | null;
  reference: SourceRef;
  confidence: number | null;
  original: ExtractedLine;
}
export interface MaterialReview {
  schema_version: 1;
  sources: MaterialSource[];
  lines: ReviewLine[];
  company_pricing: Pricing;
  supplier_pricing: Record<string, Pricing>;
  presentation: 'itemized' | 'package';
  package_description: string;
  currency: string;
  reviewed: boolean;
}
function exact(n: bigint) {
  if (n < 0n || n > 9_000_000_000_000n)
    throw new Error('Material amount exceeds limits');
  return Number(n);
}
export function materialPrice(cost: number, pricing: Pricing) {
  if (
    !Number.isSafeInteger(cost) ||
    cost < 0 ||
    !Number.isSafeInteger(pricing.value) ||
    pricing.value < 0 ||
    !['pass_through', 'percent', 'fixed'].includes(pricing.mode) ||
    (pricing.mode === 'percent' && pricing.value > 100000) ||
    (pricing.mode === 'pass_through' && pricing.value !== 0)
  )
    throw new Error('Invalid material pricing');
  const markup =
    pricing.mode === 'percent'
      ? exact((BigInt(cost) * BigInt(pricing.value) + 5000n) / 10000n)
      : pricing.mode === 'fixed'
        ? pricing.value
        : 0;
  const price = exact(BigInt(cost) + BigInt(markup));
  return {
    cost_minor: cost,
    markup_minor: markup,
    price_minor: price,
    gross_margin_bps:
      price === 0
        ? 0
        : Number(
            (BigInt(markup) * 10000n + BigInt(price) / 2n) / BigInt(price),
          ),
  };
}
function parse(text: string | null, f: (s: string) => number): number | null {
  try {
    return text === null ? null : f(text);
  } catch {
    return null;
  }
}
export function validateExtraction(raw: unknown): Extraction {
  if (!raw || typeof raw !== 'object') throw new Error('Malformed extraction');
  const e = raw as Extraction;
  if (
    e.schema_version !== 1 ||
    !Array.isArray(e.lines) ||
    e.lines.length < 1 ||
    e.lines.length > 200 ||
    !Array.isArray(e.warnings) ||
    e.warnings.length > 50
  )
    throw new Error('Malformed extraction');
  for (const k of ['vendor', 'quoted_on', 'currency', 'total_text'] as const)
    if (e[k] !== null && (typeof e[k] !== 'string' || e[k]!.length > 300))
      throw new Error('Malformed extraction header');
  if (e.currency !== null && !/^[A-Z]{3}$/.test(e.currency))
    throw new Error('Invalid extracted currency');
  if (
    e.quoted_on !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(e.quoted_on) ||
      !Number.isFinite(Date.parse(e.quoted_on)) ||
      new Date(e.quoted_on).toISOString().slice(0, 10) !== e.quoted_on)
  )
    throw new Error('Invalid quotation date');
  const ids = new Set<string>();
  for (const l of e.lines) {
    if (
      !l ||
      typeof l.id !== 'string' ||
      ids.has(l.id) ||
      typeof l.description !== 'string' ||
      !l.description.trim() ||
      l.description.length > 500
    )
      throw new Error('Malformed extracted line');
    ids.add(l.id);
    for (const k of [
      'sku',
      'quantity_text',
      'unit_text',
      'unit_cost_text',
      'extension_text',
    ] as const)
      if (l[k] !== null && (typeof l[k] !== 'string' || l[k]!.length > 200))
        throw new Error('Malformed extracted value');
    if (
      l.confidence !== null &&
      (typeof l.confidence !== 'number' ||
        !Number.isFinite(l.confidence) ||
        l.confidence < 0 ||
        l.confidence > 1)
    )
      throw new Error('Invalid confidence');
    if (
      !l.reference ||
      typeof l.reference.excerpt !== 'string' ||
      l.reference.excerpt.length > 1000 ||
      (l.reference.page !== null &&
        (!Number.isInteger(l.reference.page) ||
          l.reference.page < 1 ||
          l.reference.page > 1000))
    )
      throw new Error('Invalid source reference');
    for (const k of ['sheet', 'cell'] as const)
      if (
        l.reference[k] !== null &&
        (typeof l.reference[k] !== 'string' || l.reference[k]!.length > 200)
      )
        throw new Error('Invalid source reference');
  }
  if (e.warnings.some((w) => typeof w !== 'string' || w.length > 1000))
    throw new Error('Malformed extraction warnings');
  return structuredClone(e);
}
export function buildReview(
  sources: MaterialSource[],
  currency: string,
  companyPricing: Pricing = { mode: 'pass_through', value: 0 },
): MaterialReview {
  if (
    sources.length < 1 ||
    sources.length > 10 ||
    new Set(sources.map((s) => s.id)).size !== sources.length ||
    new Set(sources.map((s) => s.sha256)).size !== sources.length
  )
    throw new Error('Duplicate source or document limit exceeded');
  const lines: ReviewLine[] = [];
  for (const s of sources) {
    if (s.status !== 'clean' || !s.extraction)
      throw new Error('Only clean, extracted documents may enter review');
    const e = validateExtraction(s.extraction);
    let documentSum = 0;
    let complete = true;
    const sourceLines: ReviewLine[] = [];
    for (const l of e.lines) {
      const quantity = parse(l.quantity_text, (s) => decimalToScaled(s, 3));
      const unitCost = parse(l.unit_cost_text, (s) => parseMinor(s, currency));
      const extension = parse(l.extension_text, (s) => parseMinor(s, currency));
      const unit = estimateUnits.includes(l.unit_text as EstimateUnit)
        ? (l.unit_text as EstimateUnit)
        : null;
      const warnings = [...e.warnings];
      if (!quantity) warnings.push('Quantity missing or ambiguous');
      if (unitCost === null) warnings.push('Unit cost missing or ambiguous');
      if (!unit) warnings.push('Unit requires confirmation');
      if (!e.vendor?.trim())
        warnings.push('Supplier name requires confirmation');
      if (e.currency !== currency)
        warnings.push(
          'Currency missing or differs from estimate; no automatic conversion',
        );
      if (l.confidence === null || l.confidence < 0.85)
        warnings.push('Extraction confidence is unverified or low');
      if (quantity && unitCost !== null) {
        const calculated = exact(
          (BigInt(quantity) * BigInt(unitCost) + 500n) / 1000n,
        );
        documentSum = exact(BigInt(documentSum) + BigInt(calculated));
        if (extension === null)
          warnings.push('Quoted line extension unavailable');
        else if (extension !== calculated)
          warnings.push('Quoted extension conflicts with quantity × unit cost');
      } else complete = false;
      sourceLines.push({
        id: crypto.randomUUID(),
        source_id: s.id,
        vendor: e.vendor ?? '',
        quoted_on: e.quoted_on,
        sku: l.sku ?? '',
        description: l.description,
        quantity_milli: quantity,
        unit,
        unit_cost_minor: unitCost,
        selected: true,
        warnings,
        acknowledged: false,
        pricing: null,
        reference: l.reference,
        confidence: l.confidence,
        original: l,
      });
    }
    const total = parse(e.total_text, (s) => parseMinor(s, currency));
    if (total === null || !complete || total !== documentSum)
      for (const l of sourceLines)
        l.warnings.push(
          'Document total does not reconcile; review freight, tax, discounts and omitted rows',
        );
    lines.push(...sourceLines);
  }
  if (lines.length > 200)
    throw new Error('At most 200 material lines per import');
  for (const l of lines) {
    const peers = lines.filter(
      (p) =>
        p.id !== l.id &&
        p.vendor === l.vendor &&
        ((p.sku && p.sku === l.sku) ||
          (!p.sku && p.description === l.description)),
    );
    if (peers.length) {
      l.warnings.push(
        peers.some(
          (p) =>
            p.quantity_milli !== l.quantity_milli ||
            p.unit_cost_minor !== l.unit_cost_minor,
        )
          ? 'Conflicting quantities or costs for matching supplier product'
          : 'Possible duplicate supplier product',
      );
    }
  }
  return {
    schema_version: 1,
    sources: structuredClone(sources),
    lines,
    company_pricing: companyPricing,
    supplier_pricing: {},
    presentation: 'itemized',
    package_description: 'Materials supplied for the agreed project scope.',
    currency,
    reviewed: false,
  };
}
export function reviewTotals(review: MaterialReview) {
  let cost = 0n,
    price = 0n;
  const priced = review.lines
    .filter((l) => l.selected)
    .map((l) => {
      if (
        l.quantity_milli === null ||
        l.unit_cost_minor === null ||
        !Number.isSafeInteger(l.quantity_milli) ||
        l.quantity_milli < 1 ||
        l.quantity_milli > 1e9 ||
        !Number.isSafeInteger(l.unit_cost_minor) ||
        l.unit_cost_minor < 0 ||
        l.unit_cost_minor > 1e9
      )
        throw new Error('Complete quantities and unit costs');
      const lineCost = exact(
        (BigInt(l.quantity_milli) * BigInt(l.unit_cost_minor) + 500n) / 1000n,
      );
      const amounts = materialPrice(
        lineCost,
        l.pricing ??
          review.supplier_pricing[l.vendor] ??
          review.company_pricing,
      );
      cost += BigInt(amounts.cost_minor);
      price += BigInt(amounts.price_minor);
      return { ...l, ...amounts };
    });
  if (!priced.length) throw new Error('Select at least one material');
  return {
    lines: priced,
    cost_minor: exact(cost),
    price_minor: exact(price),
    markup_minor: exact(price - cost),
  };
}
export function approveReview(
  review: MaterialReview,
  approvalId: string,
): EstimateLine[] {
  if (!review.reviewed)
    throw new Error('Explicit contractor review is required');
  if (review.sources.some((s) => s.status !== 'clean' || !s.extraction))
    throw new Error('Source is not scan-approved');
  const totals = reviewTotals(review);
  for (const l of totals.lines) {
    const source = review.sources.find((s) => s.id === l.source_id);
    if (
      !source ||
      !l.vendor.trim() ||
      !l.description.trim() ||
      l.description.length > 500 ||
      !l.unit ||
      !estimateUnits.includes(l.unit) ||
      (l.warnings.length && !l.acknowledged) ||
      source.extraction?.currency !== review.currency
    )
      throw new Error(
        'Resolve or acknowledge all selected line warnings; currencies must match',
      );
  }
  if (review.presentation === 'package') {
    if (
      !review.package_description.trim() ||
      review.package_description.length > 500
    )
      throw new Error('Describe the included materials');
    if (totals.cost_minor > 1e9 || totals.price_minor > 1e9)
      throw new Error('Package exceeds unit limits; use itemized');
    return [
      {
        ...blankLine(),
        description: review.package_description,
        unit: 'lump_sum',
        unit_cost_minor: totals.cost_minor,
        unit_price_minor: totals.price_minor,
        import_approval_id: approvalId,
        material_import_line_ids: totals.lines.map((l) => l.id),
      },
    ];
  }
  return totals.lines.map((l) => ({
    ...blankLine(),
    description: l.description,
    quantity_milli: l.quantity_milli!,
    unit: l.unit!,
    unit_cost_minor: l.unit_cost_minor!,
    unit_price_minor: l.unit_cost_minor!,
    fixed_markup_minor: l.markup_minor,
    import_approval_id: approvalId,
    material_import_line_ids: [l.id],
  }));
}
// Customer projection is an explicit allowlist, never a spread of internal records.
export function customerMaterialLine(line: EstimateLine, amount: number) {
  return {
    description: line.description,
    quantity_milli: line.quantity_milli,
    unit: line.unit,
    amount_minor: amount,
  };
}
