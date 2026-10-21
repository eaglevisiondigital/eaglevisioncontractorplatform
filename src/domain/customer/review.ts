import { Temporal } from '@js-temporal/polyfill';
import { estimateUnits } from '../estimating/types';
import type { EstimateVersion } from '../estimating/types';
import { customerPreview } from '../estimating/customer-preview';
export interface CustomerContext {
  organization_id: string;
  customer_id: string;
  location_id: string;
  company_name: string;
  primary_color: string;
  property_label: string;
  reports: boolean;
  version_ids: string[];
}
export interface CustomerReview {
  organization_id: string;
  customer_id: string;
  location_id: string;
  version_id: string;
  estimate_id: string;
  version_number: number;
  source_report_id: string | null;
  finding_id: string | null;
  source_line_id: string | null;
  review_state: 'awaiting_action' | 'expired';
  scope: {
    name: string;
    description: string;
    currency: string;
    expires_on: string;
    notes: string;
    terms: string;
    lines: {
      id: string;
      description: string;
      quantity_milli: number;
      unit: string;
      amount_minor: number;
    }[];
    subtotal_minor: number;
    discount_minor: number;
    tax_minor: number;
    total_minor: number;
  };
  mode: 'internal-development';
  read_only: true;
}
const exact = (v: unknown, fields: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === fields.length &&
  fields.every((k) => Object.hasOwn(v, k));
const money = (v: unknown) =>
  typeof v === 'number' &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= 9_000_000_000_000;
/** Allowlist is independent of the internal estimate payload and all financial command grants. */
export function parseCustomerReview(
  v: unknown,
  c: CustomerContext,
  version: string,
): CustomerReview {
  if (
    !exact(v, [
      'organization_id',
      'customer_id',
      'location_id',
      'version_id',
      'estimate_id',
      'version_number',
      'source_report_id',
      'finding_id',
      'source_line_id',
      'review_state',
      'scope',
      'mode',
      'read_only',
    ]) ||
    v.organization_id !== c.organization_id ||
    v.customer_id !== c.customer_id ||
    v.location_id !== c.location_id ||
    v.version_id !== version ||
    !c.version_ids.includes(version) ||
    typeof v.estimate_id !== 'string' ||
    !Number.isSafeInteger(v.version_number) ||
    Number(v.version_number) < 1 ||
    v.mode !== 'internal-development' ||
    v.read_only !== true ||
    !['awaiting_action', 'expired'].includes(String(v.review_state))
  )
    throw Error('Customer review unavailable');
  if (!(
    (v.source_report_id === null &&
      v.finding_id === null &&
      v.source_line_id === null) ||
    (typeof v.source_report_id === 'string' &&
      typeof v.finding_id === 'string' &&
      typeof v.source_line_id === 'string' &&
      v.finding_id.length > 0)
  ))
    throw Error('Customer review unavailable');
  const s = v.scope;
  if (
    !exact(s, [
      'name',
      'description',
      'currency',
      'expires_on',
      'notes',
      'terms',
      'lines',
      'subtotal_minor',
      'discount_minor',
      'tax_minor',
      'total_minor',
    ]) ||
    !['name', 'description', 'currency', 'expires_on', 'notes', 'terms'].every(
      (k) => typeof s[k] === 'string',
    ) ||
    !Array.isArray(s.lines) ||
    s.lines.length > 500 ||
    !['subtotal_minor', 'discount_minor', 'tax_minor', 'total_minor'].every(
      (k) => money(s[k]),
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(s.expires_on)) ||
    !/^[A-Z]{3}$/.test(String(s.currency))
  )
    throw Error('Customer review unavailable');
  try {
    Temporal.PlainDate.from(s.expires_on as string, { overflow: 'reject' });
  } catch {
    throw Error('Customer review unavailable');
  }
  const ids = new Set();
  let subtotal = 0n;
  for (const l of s.lines) {
    if (
      !exact(l, [
        'id',
        'description',
        'quantity_milli',
        'unit',
        'amount_minor',
      ]) ||
      typeof l.id !== 'string' ||
      ids.has(l.id) ||
      typeof l.description !== 'string' ||
      l.description.length > 2000 ||
      typeof l.unit !== 'string' ||
      !estimateUnits.includes(l.unit as (typeof estimateUnits)[number]) ||
      !Number.isSafeInteger(l.quantity_milli) ||
      Number(l.quantity_milli) <= 0 ||
      !money(l.amount_minor)
    )
      throw Error('Customer review unavailable');
    ids.add(l.id);
    subtotal += BigInt(l.amount_minor as number);
  }
  if (v.source_line_id !== null && !ids.has(v.source_line_id))
    throw Error('Customer review unavailable');
  if (
    subtotal !== BigInt(s.subtotal_minor as number) ||
    BigInt(s.subtotal_minor as number) -
      BigInt(s.discount_minor as number) +
      BigInt(s.tax_minor as number) !==
      BigInt(s.total_minor as number)
  )
    throw Error('Customer review unavailable');
  return structuredClone(v) as unknown as CustomerReview;
}
/** Local projection consumes an existing issued source plus an independently established property binding. */
export function projectIssuedReview(
  v: EstimateVersion,
  c: CustomerContext,
  repair: {
    source_report_id: string;
    finding_id: string;
    source_line_id: string;
  } | null = null,
  jobBinding: {
    organization_id: string;
    customer_id: string;
    location_id: string;
    estimate_id: string;
  } | null = null,
): CustomerReview {
  if (
    v.status !== 'issued' ||
    v.organization_id !== c.organization_id ||
    v.payload.customer_id !== c.customer_id ||
    !c.version_ids.includes(v.id)
  )
    throw Error('Customer review unavailable');
  if (
    v.payload.location_id !== c.location_id &&
    !(
      v.payload.location_id === null &&
      jobBinding?.organization_id === c.organization_id &&
      jobBinding.customer_id === c.customer_id &&
      jobBinding.location_id === c.location_id &&
      jobBinding.estimate_id === v.estimate_id
    )
  )
    throw Error('Customer review unavailable');
  const p = customerPreview(v);
  return parseCustomerReview(
    {
      organization_id: c.organization_id,
      customer_id: c.customer_id,
      location_id: c.location_id,
      version_id: v.id,
      estimate_id: v.estimate_id,
      version_number: v.version_number,
      ...(repair ?? {
        source_report_id: null,
        finding_id: null,
        source_line_id: null,
      }),
      review_state:
        v.payload.expires_on < new Date().toISOString().slice(0, 10)
          ? 'expired'
          : 'awaiting_action',
      scope: {
        name: p.project.name,
        description: p.project.description,
        currency: p.currency,
        expires_on: p.expires_on,
        notes: p.notes,
        terms: p.terms,
        lines: v.payload.lines
          .filter(
            (l) => v.calculation.lines.find((x) => x.id === l.id)?.included,
          )
          .map((l) => ({
            id: l.id,
            description: l.description,
            quantity_milli: l.quantity_milli,
            unit: l.unit,
            amount_minor: v.calculation.lines.find((x) => x.id === l.id)!
              .subtotal_minor,
          })),
        subtotal_minor: p.subtotal_minor,
        discount_minor: p.discount_minor,
        tax_minor: p.tax_minor,
        total_minor: p.total_minor,
      },
      mode: 'internal-development',
      read_only: true,
    },
    c,
    v.id,
  );
}
export function compareCustomerVersions(
  before: CustomerReview,
  after: CustomerReview,
) {
  for (const k of [
    'organization_id',
    'customer_id',
    'location_id',
    'estimate_id',
  ] as const)
    if (before[k] !== after[k])
      throw Error('Versions do not share authorized scope');
  if (
    before.scope.currency !== after.scope.currency ||
    before.version_id === after.version_id
  )
    throw Error('Distinct comparable versions required');
  const ids = new Set(
    [...before.scope.lines, ...after.scope.lines].map((l) => l.id),
  );
  return [...ids].flatMap((id) => {
    const a = before.scope.lines.find((l) => l.id === id),
      b = after.scope.lines.find((l) => l.id === id);
    return JSON.stringify(a) === JSON.stringify(b)
      ? []
      : [{ id, before: a ?? null, after: b ?? null }];
  });
}
export function customerResponseDisabled(): never {
  throw Error('Customer response execution disabled');
}
