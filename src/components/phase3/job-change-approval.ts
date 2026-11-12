import { jobFinancials, type Job } from '../../domain/jobs/financials';

/** Existing sample control preflight only; repository remains the sole writer.
 * No durable custody or replacement for server authorization/transaction checks. */
export function jobChangeApprovalPreflight(
  org: string,
  displayed: Job,
  current: Job | null,
  changeId: string,
  authorization: string,
) {
  if (
    !current ||
    displayed.organization_id !== org ||
    current.organization_id !== org ||
    current.id !== displayed.id ||
    current.lock_revision !== displayed.lock_revision ||
    JSON.stringify(current) !== JSON.stringify(displayed)
  )
    throw Error('Job or change proposal changed; reload before approving');
  if (!authorization.trim())
    throw Error('Customer authorization reference required');
  const candidate = structuredClone(current),
    changes = candidate.changes.filter((change) => change.id === changeId),
    change = changes[0];
  if (changes.length !== 1 || change.status !== 'proposed')
    throw Error('Exact proposed change unavailable');
  change.status = 'approved';
  change.authorization_reference = authorization;
  candidate.projection.remaining[change.category] += change.cost_minor;
  // Validate complete prospective financial state before calling the original writer.
  jobFinancials(candidate);
}
