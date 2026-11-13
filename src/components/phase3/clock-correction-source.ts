import type { Phase3Repository, WorkforceData } from '../../lib/phase3';
import { requireCurrentPayrollSource } from './payroll-current-source';

/** Existing management control only. The original writer/server still owns
 * authorization and atomicity; this read fence is not durable transaction custody.
 */
export async function correctCurrentClock(
  repo: Phase3Repository,
  org: string,
  displayed: WorkforceData,
  entryId: string,
  endedAt: string,
  reason: string,
  stillCurrent: () => boolean,
) {
  const entries = displayed.entries.filter((entry) => entry.id === entryId),
    entry = entries[0];
  if (entries.length !== 1 || entry.ended_at)
    throw Error('Exact displayed open clock required');
  await requireCurrentPayrollSource(repo, org, displayed, stillCurrent);
  if (!stillCurrent())
    throw Error('Clock review context changed; no continuation');
  // No further await between the final UI context check and original writer.
  return repo.resolveClock(org, entry.worker_id, endedAt, reason);
}
