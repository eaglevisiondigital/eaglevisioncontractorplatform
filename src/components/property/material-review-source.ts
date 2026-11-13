import type { PropertyRepository } from '../../lib/property';
import { Phase3Repository } from '../../lib/phase3';
const canonicalJobs = Phase3Repository.prototype.jobs;

import type { Job } from '../../domain/jobs/financials';
import {
  unbilledRows,
  type MaterialDecision,
  type prepareMaterialDecision,
} from '../../domain/property/unbilled';

/** Existing local review control only: not a ledger, permission issuer or durable CAS. */
export async function reviewCurrentMaterial(
  repo: PropertyRepository,
  org: string,
  displayed: Job,
  expenseId: string,
  history: readonly MaterialDecision[],
  input: Parameters<typeof prepareMaterialDecision>[2],
  stillCurrent: () => boolean,
) {
  if (!repo.operations.sample || !repo.estimates.sample || !stillCurrent())
    throw Error('Current local material review required');
  if (repo.estimates.jobs !== canonicalJobs)
    throw Error('Original local job reader required; review unavailable');
  const shown = structuredClone(displayed),
    previous = structuredClone(history),
    proposal = structuredClone(input);
  const access = await repo.operations.companyAccess(org);
  if (!stillCurrent()) throw Error('Material review context changed; no write');
  if (!access.crm || !access.estimates)
    throw Error('Current contractor material-review access required');
  if (repo.estimates.jobs !== canonicalJobs)
    throw Error('Original local job reader required; review unavailable');
  const actual = repo.estimates.syntheticJob(org, shown.id),
    decisions = repo
      .read(org)
      .decisions.filter((d) => d.expense_id === expenseId);
  if (
    !actual ||
    shown.organization_id !== org ||
    actual.organization_id !== org ||
    JSON.stringify(actual) !== JSON.stringify(shown) ||
    JSON.stringify(decisions) !== JSON.stringify(previous) ||
    previous.some((d) => d.expense_id !== expenseId) ||
    unbilledRows(shown).filter(
      (row) => row.expense.id === expenseId && row.expense.job_id === shown.id,
    ).length !== 1
  )
    throw Error(
      'Purchase cost or review source changed; refresh evidence before reviewing',
    );
  // Final current-source check and original writer invocation are synchronous here.
  return repo.decide(org, shown.id, expenseId, previous.length, proposal);
}
