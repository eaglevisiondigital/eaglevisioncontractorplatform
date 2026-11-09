import type {
  EstimateBundle,
  EstimateInput,
} from '../../domain/estimating/types';
import {
  calculateEstimate,
  decimalToScaled,
} from '../../domain/estimating/calculation';
import type { Phase3Repository } from '../../lib/phase3';
import { assertOrdinaryDraftContext } from './catalog-draft-batch';
export type DraftLineAction = 'quantity' | 'remove';
/** Synchronous working-copy edit. Save remains the sole canonical writer/CAS. */
export function editDraftLines(
  repo: Phase3Repository,
  org: string,
  bundle: EstimateBundle,
  draft: EstimateInput,
  selected: readonly string[],
  action: DraftLineAction,
  quantity = '',
): EstimateInput {
  assertOrdinaryDraftContext(repo, org, bundle);
  if (!selected.length || new Set(selected).size !== selected.length)
    throw Error('Choose distinct existing scope items');
  if (action !== 'quantity' && action !== 'remove')
    throw Error('Choose an explicit draft edit');
  for (const id of selected) {
    const found = draft.lines.filter((l) => l.id === id);
    if (
      found.length !== 1 ||
      found[0].import_approval_id ||
      found[0].material_import_line_ids.length
    )
      throw Error(
        'Exact editable items required; approved import items cannot be changed here',
      );
  }
  const amount = action === 'quantity' ? decimalToScaled(quantity, 3) : null;
  if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0))
    throw Error('Enter a positive quantity with at most three decimal places');
  const lines =
    action === 'remove'
      ? draft.lines.filter((l) => !selected.includes(l.id))
      : draft.lines.map((l) =>
          selected.includes(l.id) ? { ...l, quantity_milli: amount! } : l,
        );
  if (!lines.length) throw Error('Keep at least one scope item in the draft');
  const payload = { ...draft, lines };
  calculateEstimate(payload, bundle.version.tax_policy_snapshot?.rate_bps ?? 0);
  return payload;
}
