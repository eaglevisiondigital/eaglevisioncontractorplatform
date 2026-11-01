import { uuidPattern } from '../intake';
import {
  estimateUnits,
  type EstimateInput,
  type EstimateCalculation,
} from './types';
export const MAX_ESTIMATE_MINOR = 9_000_000_000_000;
const max = BigInt(MAX_ESTIMATE_MINOR);
function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw new Error('Unexpected estimate fields');
  return v as Record<string, unknown>;
}
function text(v: unknown, min: number, limit: number) {
  if (typeof v !== 'string' || v.trim().length < min || v.length > limit)
    throw new Error('Check estimate text fields');
  return v;
}
function integer(v: unknown, min = 0, limit = MAX_ESTIMATE_MINOR): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > limit)
    throw new Error('Check quantities, prices and percentages');
  return v;
}
function id(v: unknown, nullable = false) {
  if (nullable && v === null) return;
  if (typeof v !== 'string' || !uuidPattern.test(v))
    throw new Error('Invalid record reference');
}
function date(v: unknown, nullable = false) {
  if (nullable && v === null) return;
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v
  )
    throw new Error('Invalid estimate date');
}
function array(v: unknown, min: number, limit: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > limit)
    throw new Error('Check estimate item limits');
  return v;
}
function unique(values: unknown[]) {
  if (new Set(values).size !== values.length)
    throw new Error('Duplicate estimate item identifiers');
}
export function validateEstimate(value: unknown): EstimateInput {
  const p = object(value, [
    'schema_version',
    'customer_id',
    'location_id',
    'currency',
    'project',
    'expires_on',
    'internal_notes',
    'customer_notes',
    'terms',
    'tax_policy_id',
    'discount',
    'lines',
    'options',
    'payment_schedule',
    'attachments',
  ]);
  if (p.schema_version !== 1) throw new Error('Unsupported estimate schema');
  id(p.customer_id);
  id(p.location_id, true);
  id(p.tax_policy_id, true);
  if (typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency))
    throw new Error('Choose an explicit currency');
  const project = object(p.project, [
    'name',
    'type',
    'description',
    'start_on',
    'end_on',
  ]);
  text(project.name, 1, 200);
  text(project.type, 1, 80);
  text(project.description, 0, 5000);
  date(project.start_on, true);
  date(project.end_on, true);
  date(p.expires_on);
  if (
    project.start_on &&
    project.end_on &&
    String(project.end_on) < String(project.start_on)
  )
    throw new Error('Project end must follow the start date');
  text(p.internal_notes, 0, 5000);
  text(p.customer_notes, 0, 5000);
  text(p.terms, 0, 10000);
  const discount = object(p.discount, ['kind', 'value']);
  if (!['none', 'fixed', 'percent'].includes(String(discount.kind)))
    throw new Error('Invalid discount');
  integer(
    discount.value,
    0,
    discount.kind === 'percent' ? 10000 : MAX_ESTIMATE_MINOR,
  );
  if (discount.kind === 'none' && discount.value !== 0)
    throw new Error('No-discount amount must be zero');
  const opts = array(p.options, 0, 30).map((v) => {
    const o = object(v, [
      'id',
      'label',
      'kind',
      'group',
      'selected',
      'description',
    ]);
    id(o.id);
    text(o.label, 1, 120);
    text(o.description, 0, 1000);
    if (
      typeof o.selected !== 'boolean' ||
      !['exclusive', 'addon'].includes(String(o.kind))
    )
      throw new Error('Invalid estimate option');
    if (o.kind === 'exclusive') text(o.group, 1, 60);
    else if (o.group !== null)
      throw new Error('Add-ons cannot be exclusive groups');
    return o;
  });
  unique(opts.map((o) => o.id));
  for (const group of new Set(
    opts.filter((o) => o.kind === 'exclusive').map((o) => o.group),
  ))
    if (opts.filter((o) => o.group === group && o.selected).length !== 1)
      throw new Error('Choose exactly one proposal in every exclusive group');
  const lines = array(p.lines, 1, 200).map((v) => {
    const l = object(v, [
      'id',
      'kind',
      'description',
      'quantity_milli',
      'unit',
      'unit_cost_minor',
      'unit_price_minor',
      'markup_bps',
      'taxable',
      'option_id',
      'catalog_item_id',
      'internal_note',
      'fixed_markup_minor',
      'import_approval_id',
      'material_import_line_ids',
    ]);
    id(l.id);
    id(l.catalog_item_id, true);
    id(l.option_id, true);
    text(l.description, 1, 500);
    text(l.internal_note, 0, 1000);
    integer(l.fixed_markup_minor);
    id(l.import_approval_id, true);
    const importIds = array(l.material_import_line_ids, 0, 200);
    importIds.forEach((v) => id(v));
    unique(importIds);
    if ((l.import_approval_id === null) !== (importIds.length === 0))
      throw new Error('Imported scope requires approved source references');
    integer(l.quantity_milli, 1, 1_000_000_000);
    integer(l.unit_cost_minor, 0, 1_000_000_000);
    if (l.unit_price_minor !== null)
      integer(l.unit_price_minor, 0, 1_000_000_000);
    integer(l.markup_bps, 0, 100000);
    if (
      !['material', 'product', 'labor', 'service', 'allowance'].includes(
        String(l.kind),
      ) ||
      !estimateUnits.includes(l.unit as (typeof estimateUnits)[number]) ||
      typeof l.taxable !== 'boolean'
    )
      throw new Error('Invalid estimate line');
    if (l.option_id !== null && !opts.some((o) => o.id === l.option_id))
      throw new Error('Line refers to a missing option');
    return l;
  });
  unique(lines.map((l) => l.id));
  for (const o of opts)
    if (!lines.some((l) => l.option_id === o.id))
      throw new Error('Each option needs at least one scope item');
  const schedule = array(p.payment_schedule, 1, 20).map((v) => {
    const s = object(v, ['id', 'label', 'kind', 'share_bps', 'due_on']);
    id(s.id);
    text(s.label, 1, 120);
    integer(s.share_bps, 1, 10000);
    if (!['deposit', 'milestone', 'dated'].includes(String(s.kind)))
      throw new Error('Invalid payment proposal');
    date(s.due_on, s.kind !== 'dated');
    return s;
  });
  unique(schedule.map((s) => s.id));
  if (schedule.reduce((sum, s) => sum + Number(s.share_bps), 0) !== 10000)
    throw new Error('Proposed payment shares must add up to 100%');
  const attachments = array(p.attachments, 0, 20).map((v) => {
    const a = object(v, ['document_id', 'customer_visible']);
    id(a.document_id);
    if (typeof a.customer_visible !== 'boolean')
      throw new Error('Invalid attachment visibility');
    return a;
  });
  unique(attachments.map((a) => a.document_id));
  return value as EstimateInput;
}
function round(n: bigint, d: bigint): bigint {
  return n < 0n ? -round(-n, d) : (n + d / 2n) / d;
}
function safe(n: bigint) {
  if (n > max || n < -max)
    throw new Error('Estimate exceeds supported money limits');
  return Number(n);
}
export function calculateEstimate(
  value: unknown,
  taxRateBps = 0,
): EstimateCalculation {
  const p = validateEstimate(value);
  integer(taxRateBps, 0, 10000);
  const includedOptions = new Set(
    p.options.filter((o) => o.selected).map((o) => o.id),
  );
  let subtotal = 0n,
    cost = 0n,
    taxable = 0n;
  const lines = p.lines.map((l) => {
    const unitPrice =
      l.unit_price_minor === null
        ? round(
            BigInt(l.unit_cost_minor) * BigInt(10000 + l.markup_bps),
            10000n,
          )
        : BigInt(l.unit_price_minor);
    const amount =
      round(BigInt(l.quantity_milli) * unitPrice, 1000n) +
      BigInt(l.fixed_markup_minor);
    const lineCost = round(
      BigInt(l.quantity_milli) * BigInt(l.unit_cost_minor),
      1000n,
    );
    const included = l.option_id === null || includedOptions.has(l.option_id);
    if (included) {
      subtotal += amount;
      cost += lineCost;
      if (l.taxable) taxable += amount;
    }
    return {
      id: l.id,
      included,
      unit_price_minor: safe(unitPrice),
      subtotal_minor: safe(amount),
      cost_minor: safe(lineCost),
    };
  });
  const discount =
    p.discount.kind === 'percent'
      ? round(subtotal * BigInt(p.discount.value), 10000n)
      : p.discount.kind === 'fixed'
        ? BigInt(p.discount.value)
        : 0n;
  if (discount > subtotal)
    throw new Error('Discount exceeds the selected scope subtotal');
  const taxableDiscount =
    subtotal === 0n ? 0n : round(discount * taxable, subtotal);
  const taxableNet = taxable - taxableDiscount;
  const net = subtotal - discount;
  const tax = round(taxableNet * BigInt(taxRateBps), 10000n);
  const total = net + tax;
  const profit = net - cost;
  let allocated = 0n;
  const schedule = p.payment_schedule.map((s, i) => {
    const amount =
      i === p.payment_schedule.length - 1
        ? total - allocated
        : (total * BigInt(s.share_bps)) / 10000n;
    allocated += amount;
    return { ...s, amount_minor: safe(amount) };
  });
  return {
    engine_version: 1,
    currency: p.currency,
    lines,
    subtotal_minor: safe(subtotal),
    discount_minor: safe(discount),
    net_minor: safe(net),
    taxable_subtotal_minor: safe(taxable),
    taxable_discount_minor: safe(taxableDiscount),
    taxable_net_minor: safe(taxableNet),
    tax_rate_bps: taxRateBps,
    tax_minor: safe(tax),
    total_minor: safe(total),
    cost_minor: safe(cost),
    gross_profit_minor: safe(profit),
    profit_margin_bps: net === 0n ? 0 : safe(round(profit * 10000n, net)),
    options: p.options.map((o) => {
      const optionLines = lines.filter(
        (l) => p.lines.find((raw) => raw.id === l.id)?.option_id === o.id,
      );
      return {
        id: o.id,
        selected: o.selected,
        scope_subtotal_minor: safe(
          optionLines.reduce((s, l) => s + BigInt(l.subtotal_minor), 0n),
        ),
        scope_cost_minor: safe(
          optionLines.reduce((s, l) => s + BigInt(l.cost_minor), 0n),
        ),
      };
    }),
    payment_schedule: schedule,
  };
}
export function minorDigits(currency: string) {
  return (
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function decimalToScaled(text: string, digits: number): number {
  if (!new RegExp(`^\\d+(?:\\.\\d{0,${digits}})?$`).test(text))
    throw new Error(`Use at most ${digits} decimal places`);
  const [whole, fraction = ''] = text.split('.');
  const value =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, '0') || 0);
  return safe(value);
}
export const parseMinor = (text: string, currency: string) =>
  decimalToScaled(text, minorDigits(currency));
export function minorText(value: number, currency: string) {
  const digits = minorDigits(currency);
  const str = String(value).padStart(digits + 1, '0');
  return digits ? `${str.slice(0, -digits)}.${str.slice(-digits)}` : str;
}
export const formatMinor = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    value / 10 ** minorDigits(currency),
  );
export function blankLine(
  kind: EstimateInput['lines'][number]['kind'] = 'material',
): EstimateInput['lines'][number] {
  return {
    id: crypto.randomUUID(),
    kind,
    description: kind === 'labor' ? 'Project labor' : 'New scope item',
    quantity_milli: 1000,
    unit: kind === 'labor' ? 'hour' : 'each',
    unit_cost_minor: 0,
    unit_price_minor: 0,
    markup_bps: 0,
    taxable: false,
    option_id: null,
    catalog_item_id: null,
    internal_note: '',
    fixed_markup_minor: 0,
    import_approval_id: null,
    material_import_line_ids: [],
  };
}
export function blankEstimate(
  customerId: string,
  currency = 'USD',
): EstimateInput {
  const expiry = new Date();
  expiry.setUTCDate(expiry.getUTCDate() + 30);
  return {
    schema_version: 1,
    customer_id: customerId,
    location_id: null,
    currency,
    project: {
      name: 'New project estimate',
      type: 'other',
      description: '',
      start_on: null,
      end_on: null,
    },
    expires_on: expiry.toISOString().slice(0, 10),
    internal_notes: '',
    customer_notes: '',
    terms: '',
    tax_policy_id: null,
    discount: { kind: 'none', value: 0 },
    lines: [blankLine()],
    options: [],
    payment_schedule: [
      {
        id: crypto.randomUUID(),
        label: 'Proposed deposit',
        kind: 'deposit',
        share_bps: 2500,
        due_on: null,
      },
      {
        id: crypto.randomUUID(),
        label: 'On completion',
        kind: 'milestone',
        share_bps: 7500,
        due_on: null,
      },
    ],
    attachments: [],
  };
}
