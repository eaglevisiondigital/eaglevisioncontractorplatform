import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readSavedSourceExercise,
  reconcileSavedSourceCorrection,
  inspectSavedSourceExercise,
} from './saved-revision-exercise';
import {
  readSavedRevision,
  assertSavedRevisionCurrent,
} from './saved-revision-runtime';

type Receipt = Awaited<ReturnType<typeof reconcileSavedSourceCorrection>>;
/** Only canonical, exact-job task facts. Worker rates and review reasons never
 * enter this staff review projection. The original command owns its sole hold. */
export async function readTaskCustodyReview(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const original = await readSavedSourceExercise(sources, jobId, gate),
    receipt = await reconcileSavedSourceCorrection(original, 'time-correction'),
    held = JSON.stringify(inspectSavedSourceExercise(original));
  const snapshot = await readSavedRevision(
    sources,
    jobId,
    'field',
    gate,
    (entry) => {
      const canonical = entry.estimates.readSyntheticPrototypeSources(
          entry.target,
        ),
        rows = canonical.workforce.entries
          .filter((t) => t.job_id === jobId && t.worker_id === entry.worker_id)
          .map((t) => {
            const reviews = canonical.workforce.reviews.filter(
              (r) => r.entry_id === t.id,
            );
            if (
              reviews.length > 1 ||
              (t.corrects_id &&
                !canonical.workforce.entries.some(
                  (old) =>
                    old.id === t.corrects_id &&
                    old.job_id === t.job_id &&
                    old.worker_id === t.worker_id,
                ))
            )
              throw Error(
                'Unambiguous exact canonical correction and review required',
              );
            return {
              id: t.id,
              job_id: t.job_id,
              worker_id: t.worker_id,
              corrects_id: t.corrects_id,
              task: t.task,
              kind: t.kind,
              started_at: t.started_at,
              ended_at: t.ended_at,
              billable: t.billable,
              submitted: t.submitted,
              review: reviews[0]?.decision ?? null,
            };
          });
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        throw Error('Unique canonical task identities required');
      const source = rows.find((t) => t.id === receipt.source_id) ?? null,
        result = rows.find((t) => t.id === receipt.result_id) ?? null;
      if (result && (!source || result.corrects_id !== source.id))
        throw Error('Exact original correction provenance required');
      const fields = [
        'task',
        'kind',
        'started_at',
        'ended_at',
        'billable',
        'submitted',
        'review',
      ] as const;
      return {
        receipt,
        status: status(receipt),
        original: source,
        recorded: result,
        original_evidence: source
          ? ('EXACT_SOURCE_OBSERVED' as const)
          : ('UNAVAILABLE' as const),
        recorded_evidence: result
          ? ('EXACT_ID_OBSERVED' as const)
          : ('UNAVAILABLE' as const),
        differences: fields.map((field) => ({
          field,
          original: source?.[field] ?? null,
          recorded: result?.[field] ?? null,
          comparison:
            !source || !result
              ? ('NOT_COMPARABLE' as const)
              : source[field] === result[field]
                ? ('UNCHANGED' as const)
                : ('CHANGED' as const),
        })),
        available_tasks: rows,
        coverage: 'AVAILABLE_EXACT_JOB_WORKER_ONLY' as const,
        source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
        operational_ready: false as const,
        dispatch: false as const,
        payroll: false as const,
        replay: 'FORBIDDEN' as const,
      };
    },
    () => {
      if (JSON.stringify(inspectSavedSourceExercise(original)) !== held)
        throw Error(
          'Original correction custody changed; read again without replay',
        );
    },
  );
  const final = await reconcileSavedSourceCorrection(
    original,
    'time-correction',
  );
  assertSavedRevisionCurrent(snapshot);
  if (JSON.stringify(final) !== JSON.stringify(receipt))
    throw Error('Exact correction receipt changed during review');
  return snapshot;
}
function status(receipt: Receipt) {
  if (receipt.state === 'UNKNOWN') return 'HELD_UNKNOWN' as const;
  if (receipt.state === 'PENDING') return 'PENDING' as const;
  if (receipt.state === 'NOT_ATTEMPTED') return 'NOT_ATTEMPTED' as const;
  return receipt.observed === 'EXACT_RESULT_OBSERVED'
    ? ('KNOWN_SAVED' as const)
    : ('SAVED_RECEIPT_SOURCE_UNAVAILABLE' as const);
}
export type TaskCustodySnapshot = Awaited<
  ReturnType<typeof readTaskCustodyReview>
>;
export function inspectTaskCustodyReview(snapshot: TaskCustodySnapshot) {
  assertSavedRevisionCurrent(snapshot);
  return snapshot.evidence;
}
/** Exact current job hint only. The receiving original workflow rechecks its own
 * source; this read grants no write, replay, dispatch or payroll authority. */
export function taskCustodyDestination(snapshot: TaskCustodySnapshot) {
  inspectTaskCustodyReview(snapshot);
  return { job_id: snapshot.identity.job_id, step: 'field' as const };
}
