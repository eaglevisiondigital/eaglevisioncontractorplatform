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
/** Existing ordinary local draft admission; no new authorization or writer. */
export function assertOrdinaryDraftContext(
  repo: Phase3Repository,
  org: string,
  bundle: EstimateBundle,
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
  if (
    repo.customerRevisionOrigin(org, bundle.estimate.id) ||
    repo.repairOrigin(org, bundle.estimate.id, bundle.version.id)
  )
    throw Error('Special revision preparation must use its original workflow');
}
/** Synchronous editor action, using the original single-item selector's loaded snapshot.
 * No read, writer or permission is created. The existing Save owns canonical CAS.
 */
export function catalogDraftBatch(
  repo: Phase3Repository,
  org: string,
  bundle: EstimateBundle,
  catalog: readonly CatalogItem[],
  rows: readonly CatalogQuantity[],
  liveDraft: () => EstimateInput,
) {
  assertOrdinaryDraftContext(repo, org, bundle);
  if (!rows.length || new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error('Choose distinct catalog items and explicit quantities');
  const draft = liveDraft();
  const lines = rows.map((row) => {
    const found = catalog.filter((item) => item.id === row.id);
    if (
      found.length !== 1 ||
      !found[0].active ||
      found[0].organization_id !== org
    )
      throw Error('Loaded catalog item unavailable; no items added');
    const quantity = decimalToScaled(row.quantity, 3);
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw Error('Enter a positive quantity for every selected item');
    const item = found[0];
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
  const payload = { ...draft, lines: [...draft.lines, ...lines] };
  calculateEstimate(payload, bundle.version.tax_policy_snapshot?.rate_bps ?? 0);
  return payload;
}
