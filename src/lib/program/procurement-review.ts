import { MAX_ESTIMATE_MINOR } from '../../domain/estimating/calculation';
import { documentHash } from '../../domain/release/preview';
import {
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeSource,
  type PrototypeAdmission,
} from './prototype-source';

export interface ProcurementSelection {
  line_id: string;
  catalog_item_id: string;
  quantity_milli: number;
  bid_minor: number | null;
}
export interface ProcurementInput {
  kind: 'purchase-review' | 'subcontractor-scope-review';
  selections: ProcurementSelection[];
}
function admission(gate: PrototypeAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Explicit local procurement review confirmation required');
}
function input(value: ProcurementInput, source: PrototypeSource) {
  const p = prototypeFields(value, ['kind', 'selections']);
  if (
    !['purchase-review', 'subcontractor-scope-review'].includes(
      p.kind as string,
    ) ||
    !Array.isArray(p.selections) ||
    !p.selections.length ||
    p.selections.length > 50
  )
    throw Error('Bounded procurement selections required');
  const descriptors = Object.getOwnPropertyDescriptors(p.selections);
  if (Reflect.ownKeys(p.selections).length !== p.selections.length + 1)
    throw Error('Plain selection array required');
  const seen = new Set<string>();
  const selections = Array.from({ length: p.selections.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw Error('Own selection data required');
    const s = prototypeFields(descriptor.value, [
      'line_id',
      'catalog_item_id',
      'quantity_milli',
      'bid_minor',
    ]);
    if (
      typeof s.line_id !== 'string' ||
      typeof s.catalog_item_id !== 'string' ||
      seen.has(s.line_id) ||
      !Number.isSafeInteger(s.quantity_milli) ||
      (s.quantity_milli as number) <= 0 ||
      (s.quantity_milli as number) > 1000000000 ||
      (s.bid_minor !== null &&
        (!Number.isSafeInteger(s.bid_minor) ||
          (s.bid_minor as number) < 0 ||
          (s.bid_minor as number) > MAX_ESTIMATE_MINOR))
    )
      throw Error('Exact unique scope and bounded quantity/bid required');
    seen.add(s.line_id);
    const line = source.snapshot.estimate.lines.find(
      (x) => x.id === s.line_id && x.included,
    );
    const catalog = source.snapshot.catalog.find(
      (x) => x.id === s.catalog_item_id,
    );
    if (
      !line ||
      !catalog ||
      line.catalog_item_id !== catalog.id ||
      line.unit !== catalog.unit ||
      line.kind !== catalog.kind
    )
      throw Error('Exact existing catalog/scope association required');
    if (
      p.kind === 'purchase-review' &&
      !['material', 'product'].includes(line.kind)
    )
      throw Error('Purchase review requires recorded material/product scope');
    if (
      p.kind === 'subcontractor-scope-review' &&
      !['labor', 'service'].includes(line.kind)
    )
      throw Error('Subcontractor review requires recorded labor/service scope');
    return {
      line_id: line.id,
      catalog_item_id: catalog.id,
      description: line.description,
      unit: line.unit,
      quantity_milli: s.quantity_milli as number,
      bid_minor: s.bid_minor as number | null,
      recorded_vendor: catalog.vendor,
      vendor_identity: 'UNVERIFIED' as const,
      quantity_basis: 'HUMAN_PROPOSAL' as const,
    };
  });
  return { kind: p.kind as ProcurementInput['kind'], selections };
}
const prepared = new WeakMap<
  object,
  { source: PrototypeSource; gate: PrototypeAdmission }
>();
export async function prepareProcurementReview(
  source: PrototypeSource,
  value: ProcurementInput,
  gate: PrototypeAdmission = {},
) {
  admission(gate);
  await assertPrototypeSourceCurrent(source);
  const chosen = input(value, source);
  const snapshot = {
    mode: 'LOCAL_STAFF_REVIEW_ONLY' as const,
    source_sha256: source.sha256,
    target: { ...source.snapshot.target },
    estimate_version: source.snapshot.estimate.version_number,
    saved_revision: source.snapshot.estimate.lock_revision,
    currency: source.snapshot.estimate.currency,
    ...chosen,
    supplier_purchase_matching: 'UNKNOWN' as const,
    existing_job_commitments: source.snapshot.job
      ? {
          job_id: source.snapshot.job.id,
          revision: source.snapshot.job.lock_revision,
        }
      : null,
    approval: 'BLOCKED' as const,
    authority: {
      order: false,
      subcontract: false,
      payment: false,
      send: false,
      save: false,
      hosted: false,
    },
  };
  const sha256 = await documentHash(snapshot);
  await assertPrototypeSourceCurrent(source);
  admission(gate);
  assertPrototypeSourceCurrentNow(source);
  const result = freezePrototype({
    id: `procurement-review:${sha256}`,
    sha256,
    snapshot,
  });
  prepared.set(result, { source, gate });
  return result;
}
export type ProcurementReview = Awaited<
  ReturnType<typeof prepareProcurementReview>
>;
/** Only exact admitted session evidence can prove drift. Unknown never retries. */
export async function verifyProcurementReview(
  review: ProcurementReview,
): Promise<'CURRENT' | 'STALE' | 'UNKNOWN'> {
  const binding = prepared.get(review);
  if (!binding) return 'UNKNOWN';
  try {
    admission(binding.gate);
    if ((await documentHash(review.snapshot)) !== review.sha256)
      return 'UNKNOWN';
    await assertPrototypeSourceCurrent(binding.source);
    admission(binding.gate);
    assertPrototypeSourceCurrentNow(binding.source);
    return 'CURRENT';
  } catch (error) {
    try {
      admission(binding.gate);
    } catch {
      return 'UNKNOWN';
    }
    return error instanceof Error && error.message === 'Stale prototype source'
      ? 'STALE'
      : 'UNKNOWN';
  }
}
