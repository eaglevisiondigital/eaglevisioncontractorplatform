import type { EstimateLine } from '../../domain/estimating/types';
import { documentHash } from '../../domain/release/preview';
import {
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeAdmission,
  type PrototypeSource,
} from './prototype-source';

/** Review contexts only: these do not extend CompanyProfile or its Industry union. */
export const tradeEditions = [
  'property_services',
  'roofing',
  'landscaping',
  'remodeling',
  'hvac',
  'plumbing',
  'electrical',
  'commercial',
] as const;
export type TradeEdition = (typeof tradeEditions)[number];
const prompts: Record<TradeEdition, readonly [string, string]> = {
  property_services: [
    'Confirm the exact property area and recorded service scope.',
    'Review any proposed recurrence against the existing inspection or visit workflow.',
  ],
  roofing: [
    'Review measured roof quantities and their existing estimate units.',
    'Record access and safety review in the existing process; no safety clearance is inferred.',
  ],
  landscaping: [
    'Review measured area, length and the selected material scope.',
    'Review proposed access, disposal and maintenance assumptions manually.',
  ],
  remodeling: [
    'Review existing-condition assumptions against exact saved scope.',
    'Review any required permit and site-access evidence separately.',
  ],
  hvac: [
    'Review exact equipment and labor scope with a qualified reviewer.',
    'Review proposed commissioning evidence; no technical approval is implied.',
  ],
  plumbing: [
    'Review exact fixtures, measured quantities and work boundaries.',
    'Review any required isolation, permit and inspection evidence separately.',
  ],
  electrical: [
    'Review exact equipment, circuits and measured scope with a qualified reviewer.',
    'Review any required permit and inspection evidence separately.',
  ],
  commercial: [
    'Review exact property, occupancy and staged work boundaries.',
    'Review proposed access windows and operational constraints separately.',
  ],
};
export interface TradeEditionInput {
  edition: TradeEdition;
  catalog_item_ids: string[];
}
function confirm(gate: PrototypeAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Explicit enabled and confirmed edition review required');
}
function selection(input: TradeEditionInput) {
  const p = prototypeFields(input, ['edition', 'catalog_item_ids']);
  if (!tradeEditions.some((edition) => edition === p.edition))
    throw Error('Known explicit trade review context required');
  if (
    !Array.isArray(p.catalog_item_ids) ||
    Object.getPrototypeOf(p.catalog_item_ids) !== Array.prototype ||
    p.catalog_item_ids.length > 20
  )
    throw Error('Bounded exact catalog selection required');
  const descriptors = Object.getOwnPropertyDescriptors(p.catalog_item_ids);
  if (
    Reflect.ownKeys(p.catalog_item_ids).some(
      (key) =>
        typeof key !== 'string' ||
        (key !== 'length' &&
          (!/^\d+$/.test(key) || !Object.hasOwn(descriptors[key], 'value'))),
    )
  )
    throw Error('Own primitive catalog IDs required');
  const ids: string[] = [];
  for (let index = 0; index < p.catalog_item_ids.length; index++) {
    const d = descriptors[index];
    if (
      !d ||
      !Object.hasOwn(d, 'value') ||
      typeof d.value !== 'string' ||
      !d.value ||
      d.value.length > 200
    )
      throw Error('Exact existing catalog IDs required');
    ids.push(d.value);
  }
  if (new Set(ids).size !== ids.length)
    throw Error('Duplicate catalog selection denied');
  return { edition: p.edition as TradeEdition, ids };
}
function projection(
  source: PrototypeSource,
  input: ReturnType<typeof selection>,
) {
  const s = source.snapshot;
  const selected = input.ids.map((id) => {
    const matches = s.catalog.filter((item) => item.id === id);
    if (matches.length !== 1)
      throw Error('Exact current tenant catalog selection unavailable');
    return matches[0];
  });
  const scope: Pick<
    EstimateLine,
    | 'id'
    | 'kind'
    | 'description'
    | 'quantity_milli'
    | 'unit'
    | 'catalog_item_id'
  >[] = s.estimate.lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    description: line.description,
    quantity_milli: line.quantity_milli,
    unit: line.unit,
    catalog_item_id: line.catalog_item_id,
  }));
  return {
    mode: 'local-trade-context-review' as const,
    edition: input.edition,
    edition_meaning:
      'Explicit human-selected review context; original company industry and branding remain unchanged.',
    source_sha256: source.sha256,
    target: { ...s.target },
    estimate_lock_revision: s.estimate.lock_revision,
    scope,
    checklist: prompts[input.edition].map((prompt, index) => ({
      section: index + 1,
      prompt,
      status: 'NOT_REVIEWED' as const,
      source_line_ids: scope.map((line) => line.id),
      authority: 'EXISTING_REVIEW_WORKFLOW_ONLY' as const,
    })),
    catalog_draft_fields: selected.map((item) => ({
      catalog_item_id: item.id,
      kind: item.kind,
      description: item.description,
      unit: item.unit,
      quantity: 'REQUIRES_EXPLICIT_MEASUREMENT' as const,
      price: 'NOT_PROJECTED' as const,
    })),
    licensing: 'UNVERIFIED' as const,
    physical_completion: 'UNVERIFIED' as const,
    code_compliance: 'UNVERIFIED' as const,
    history_coverage: 'UNKNOWN' as const,
    authority: {
      save: false,
      issue: false,
      dispatch: false,
      communicate: false,
      financial: false,
      hosted: false,
      change_company_profile: false,
    },
  };
}
function result(body: ReturnType<typeof projection>, sha256: string) {
  return freezePrototype({ snapshot: body, sha256 });
}
export type TradeEditionReview = ReturnType<typeof result>;
const holds = new Set<string>();
const bindings = new WeakMap<
  TradeEditionReview,
  { source: PrototypeSource; gate: PrototypeAdmission }
>();
function key(source: PrototypeSource) {
  const t = source.snapshot.target;
  return JSON.stringify([
    t.organization_id,
    t.customer_id,
    t.location_id,
    t.estimate_id,
    t.version_id,
    t.job_id,
  ]);
}
export async function prepareTradeEdition(
  source: PrototypeSource,
  input: TradeEditionInput,
  gate: PrototypeAdmission = {},
): Promise<TradeEditionReview> {
  confirm(gate);
  const pinned = selection(input);
  await assertPrototypeSourceCurrent(source);
  confirm(gate);
  const body = projection(source, pinned);
  const exact = key(source);
  if (holds.has(exact))
    throw Error('Existing or UNKNOWN edition review; no replay');
  holds.add(exact);
  const sha256 = await documentHash(body);
  await assertPrototypeSourceCurrent(source);
  confirm(gate);
  assertPrototypeSourceCurrentNow(source);
  confirm(gate);
  const review = result(body, sha256);
  bindings.set(review, { source, gate });
  return review;
}
export async function inspectTradeEdition(review: TradeEditionReview) {
  const binding = bindings.get(review);
  if (!binding) throw Error('Unknown edition review');
  confirm(binding.gate);
  if ((await documentHash(review.snapshot)) !== review.sha256)
    throw Error('Edition integrity mismatch');
  await assertPrototypeSourceCurrent(binding.source);
  confirm(binding.gate);
  assertPrototypeSourceCurrentNow(binding.source);
  confirm(binding.gate);
  return freezePrototype({ status: 'CURRENT' as const, replacement: null });
}
