import type { CompanyProfile } from '../../domain/platform';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  prepareOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  executeSavedSourceExercise,
  readSavedSourceExercise,
} from './saved-revision-exercise';

/** An optional part of the ORIGINAL explicit disposable fixture preparation.
 * The host owns the single pending/UNKNOWN attempt before calling this function.
 * No restore, second business store, ledger or independent retry owner is created.
 */
export async function prepareCorrectionPreviewSources(
  company: CompanyProfile,
  gate: JourneyAdmission,
): Promise<OperatingSources> {
  const sources = await prepareOperatingSources(company, gate);
  const admitted = captureOperatingSources(sources, gate);
  admitted.check();
  for (const entry of admitted.entries) {
    // Read fresh native state after each expected write; never reuse a stale snapshot.
    captureOperatingSources(sources, gate).check();
    const target = entry.target;
    if (!target.job_id) throw Error('Exact original job required');
    const view = await readSavedSourceExercise(sources, target.job_id, gate);
    captureOperatingSources(sources, gate).check();
    await executeSavedSourceExercise(view, 'time-record', true);
    captureOperatingSources(sources, gate).check();
    const before = sources.estimates.readSyntheticPrototypeSources(target).job;
    if (!before) throw Error('Exact canonical job required');
    const input = {
      purchase_key: 'C21-DISPOSABLE-PENDING',
      supplier: 'Synthetic materials supplier',
      reference: 'C21-PENDING-MATERIAL-REVIEW',
      category: 'materials' as const,
      kind: 'commitment' as const,
      amount_minor: 2500,
      description:
        'Disposable synthetic pending material commitment for explicit staff review',
      estimate_line_id: null,
      quantity_milli: null,
      unit: null,
      unit_cost_minor: null,
      document_ids: [],
      material_approval_id: null,
      adjusts_expense_id: null,
    };
    const id = await sources.estimates.submitExpense(
      company.id,
      target.job_id,
      input,
    );
    captureOperatingSources(sources, gate).check();
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))
      throw Error('Exact canonical expense acknowledgment required');
    const after = sources.estimates.readSyntheticPrototypeSources(target).job;
    const added = after?.expenses.find((expense) => expense.id === id);
    if (
      !added ||
      !Number.isFinite(Date.parse(added.submitted_at)) ||
      !after ||
      JSON.stringify(after) !==
        JSON.stringify({
          ...before,
          expenses: [
            ...before.expenses,
            {
              ...input,
              id,
              job_id: target.job_id,
              submitted_at: added.submitted_at,
            },
          ],
        })
    )
      throw Error('Exact pending material acknowledgment unavailable');
  }
  captureOperatingSources(sources, gate).check();
  return sources;
}
