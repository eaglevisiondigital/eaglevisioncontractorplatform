import type {
  CatalogItem,
  EstimateBundle,
  EstimateInput,
} from '../../domain/estimating/types';
import {
  blankLine,
  calculateEstimate,
  decimalToScaled,
} from '../../domain/estimating/calculation';
import type { Phase3Repository } from '../../lib/phase3';
export interface CatalogQuantity {
  id: string;
  quantity: string;
}
/** Editor preparation only. The existing Save owns canonical writes and CAS. */
export async function catalogDraftBatch(
  repo: Phase3Repository,
  org: string,
  bundle: EstimateBundle,
  catalog: readonly CatalogItem[],
  rows: readonly CatalogQuantity[],
  liveDraft: () => EstimateInput,
) {
  if (
    !repo.sample ||
    bundle.estimate.organization_id !== org ||
    bundle.version.organization_id !== org ||
    bundle.version.status !== 'draft' ||
    bundle.estimate.status === 'archived' ||
    bundle.estimate.current_version_id !== bundle.version.id
  )
    throw Error('Current local editable estimate required');
  repo.assertSyntheticDraftCatalogCurrent(org, bundle, []);
  const expected = JSON.stringify(liveDraft());
  const selected = structuredClone(rows);
  const original = structuredClone(catalog);
  if (
    !selected.length ||
    new Set(selected.map((r) => r.id)).size !== selected.length
  )
    throw Error('Choose distinct catalog items and explicit quantities');
  if (!(await repo.operations.companyAccess(org)).estimates)
    throw Error('Current estimating access required');
  const current = await repo.catalog(org);
  const saved = await repo.get(org, bundle.estimate.id);
  if (!(await repo.operations.companyAccess(org)).estimates)
    throw Error('Estimating access changed');
  if (
    JSON.stringify(saved.version) !== JSON.stringify(bundle.version) ||
    saved.estimate.current_version_id !== bundle.version.id ||
    JSON.stringify(liveDraft()) !== expected
  )
    throw Error('Working or saved draft changed; no items added');
  const lines = selected.map((row) => {
    const source = original.filter((item) => item.id === row.id);
    const fresh = current.filter((item) => item.id === row.id);
    if (
      source.length !== 1 ||
      fresh.length !== 1 ||
      !fresh[0].active ||
      fresh[0].organization_id !== org ||
      source[0].organization_id !== org ||
      JSON.stringify(source[0]) !== JSON.stringify(fresh[0])
    )
      throw Error('Catalog source changed or unavailable; no items added');
    const quantity = decimalToScaled(row.quantity, 3);
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw Error('Enter a positive quantity for every selected item');
    const item = fresh[0];
    return {
      ...blankLine(item.kind),
      description: item.description || item.name,
      unit: item.unit,
      quantity_milli: quantity,
      unit_cost_minor: item.unit_cost_minor,
      unit_price_minor: item.unit_price_minor,
      markup_bps: item.markup_bps,
      catalog_item_id: item.id,
    };
  });
  const payload = { ...liveDraft(), lines: [...liveDraft().lines, ...lines] };
  calculateEstimate(payload, bundle.version.tax_policy_snapshot?.rate_bps ?? 0);
  const items = selected.map((row) =>
    original.find((item) => item.id === row.id)!,
  );
  const check = () => {
    repo.assertSyntheticDraftCatalogCurrent(org, bundle, items);
    if (JSON.stringify(liveDraft()) !== expected)
      throw Error('Working draft changed; no items added');
  };
  check();
  return { expected, payload, check };
}
