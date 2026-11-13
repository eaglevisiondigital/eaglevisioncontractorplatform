import type { Phase3Repository, WorkforceData } from '../../lib/phase3';
import { validateTime, type TimeEntry } from '../../domain/workforce/payroll';
type TimeDraft = Parameters<Phase3Repository['recordTime']>[2];
// Ephemeral attempt/UNKNOWN guards only; not business records or durable custody.
const correcting = new WeakMap<
  Phase3Repository,
  Map<string, 'pending' | 'unknown'>
>();

/** Existing visible-workforce control fence; canonical writer retains permissions.
 * No new payroll-admin restriction, execution authority or durable transaction custody.
 */
export async function saveCurrentTimeDraft(
  repo: Phase3Repository,
  org: string,
  displayed: WorkforceData,
  workerId: string,
  input: TimeDraft,
  stillCurrent: () => boolean,
) {
  const source = structuredClone(displayed),
    draft = structuredClone(input);
  if (!stillCurrent()) throw Error('Current timesheet context required');
  const key = draft.corrects_id === null ? null : `${org}/${draft.corrects_id}`;
  const active =
    correcting.get(repo) ?? new Map<string, 'pending' | 'unknown'>();
  if (key !== null && active.get(key) === 'unknown')
    throw Error(
      'Time correction outcome UNKNOWN; exact read only, do not retry',
    );
  if (key !== null && active.has(key))
    throw Error('A correction for this original time is already in progress');
  if (key !== null) {
    active.set(key, 'pending');
    correcting.set(repo, active);
  }
  try {
    const current = await repo.workforce(org);
    if (!stillCurrent()) throw Error('Timesheet context changed; no write');
    if (
      JSON.stringify(current) !== JSON.stringify(source) ||
      current.workers.filter(
        (w) => w.id === workerId && w.organization_id === org,
      ).length !== 1
    )
      throw Error(
        'Current visible workforce source changed; refresh before saving',
      );
    if (draft.corrects_id !== null) {
      const inOrg = (entry: TimeEntry) => {
        const value = (entry as TimeEntry & { organization_id?: unknown })
          .organization_id;
        return value === undefined || value === org;
      };
      const originals = current.entries.filter(
          (e) => e.id === draft.corrects_id,
        ),
        original = originals[0];
      const reviews = current.reviews.filter(
        (r) => r.entry_id === draft.corrects_id,
      );
      if (
        originals.length !== 1 ||
        original.worker_id !== workerId ||
        !inOrg(original) ||
        !original.submitted ||
        !original.ended_at ||
        reviews.length !== 1 ||
        reviews[0].decision !== 'approved'
      )
        throw Error('Exact approved closed time for this same worker required');
      const seen = new Set([original.id]);
      let cursor = original;
      while (cursor.corrects_id !== null) {
        const parentId = cursor.corrects_id;
        if (seen.has(parentId))
          throw Error(
            'Original correction lineage is UNKNOWN; exact source review required',
          );
        const ancestor = active.get(`${org}/${parentId}`);
        if (ancestor === 'unknown')
          throw Error(
            'Time correction ancestor outcome UNKNOWN; exact read only, do not retry',
          );
        if (ancestor === 'pending')
          throw Error('Original correction ancestor is still in progress');
        const parents = current.entries.filter(
            (entry) => entry.id === parentId,
          ),
          parent = parents[0];
        const parentReviews = current.reviews.filter(
          (review) => review.entry_id === parentId,
        );
        if (
          parents.length !== 1 ||
          parent.worker_id !== workerId ||
          !inOrg(parent) ||
          !parent.submitted ||
          !parent.ended_at ||
          parentReviews.length !== 1 ||
          parentReviews[0].decision !== 'approved'
        )
          throw Error(
            'Original correction lineage is UNKNOWN; exact source review required',
          );
        seen.add(parentId);
        cursor = parent;
      }
      if (
        current.entries.some(
          (e) =>
            e.corrects_id === original.id &&
            !current.reviews.some(
              (r) => r.entry_id === e.id && r.decision === 'rejected',
            ),
        )
      )
        throw Error(
          'Original time already has a correction; review that exact record',
        );
      const start = Date.parse(original.started_at),
        end = Date.parse(original.ended_at);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        current.periods.some(
          (p) =>
            p.status === 'locked' &&
            (!Number.isFinite(Date.parse(p.starts_at)) ||
              !Number.isFinite(Date.parse(p.ends_at)) ||
              Date.parse(p.starts_at) >= Date.parse(p.ends_at) ||
              (Date.parse(p.starts_at) < end && Date.parse(p.ends_at) > start)),
        )
      )
        throw Error(
          'Original time is locked or UNKNOWN; use the existing payroll adjustment workflow',
        );
    }
    validateTime([{ ...draft, id: '', worker_id: workerId, submitted: false }]);
    if (key === null) return await repo.recordTime(org, workerId, draft);
    try {
      return await repo.recordTime(org, workerId, draft);
    } catch {
      active.set(key, 'unknown');
      throw Error(
        'Time correction outcome UNKNOWN; exact read only, do not retry',
      );
    }
  } finally {
    if (key !== null && active.get(key) !== 'unknown') active.delete(key);
  }
}
