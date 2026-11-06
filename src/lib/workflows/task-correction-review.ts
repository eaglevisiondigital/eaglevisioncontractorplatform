import { Temporal } from '@js-temporal/polyfill';
import { validateTime } from '../../domain/workforce/payroll';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readSavedSourceExercise,
  readSavedTaskCorrection,
  executeSavedTaskCorrection,
  reconcileSavedSourceCorrection,
  inspectSavedSourceExercise,
  type SavedSourceExerciseView,
} from './saved-revision-exercise';
import { assertSavedRevisionCurrent } from './saved-revision-runtime';

export type TaskCorrectionSource = Awaited<
  ReturnType<typeof readSavedTaskCorrection>
>;
export interface TaskCorrectionInput {
  source_entry_id: string;
  task: string;
  started_at: string;
  ended_at: string;
  billable: boolean;
}
export interface TaskCorrectionReview {
  readonly view: SavedSourceExerciseView;
  readonly source: TaskCorrectionSource;
}

/** Forms preserve exact source identity; the original engine owns eligibility,
 * overlaps, locked periods, append semantics and the sole command attempt. */
export function parseTaskCorrectionInput(
  value: unknown,
  source: TaskCorrectionSource,
  jobId: string,
): TaskCorrectionInput {
  const f = prototypeFields(value, [
    'source_entry_id',
    'task',
    'started_at',
    'ended_at',
    'billable',
  ]);
  if (
    Object.keys(f).length !== 5 ||
    f.source_entry_id !== source.source_entry_id ||
    typeof f.task !== 'string' ||
    !f.task.trim() ||
    f.task !== f.task.trim() ||
    f.task.length > 2000 ||
    typeof f.started_at !== 'string' ||
    typeof f.ended_at !== 'string' ||
    typeof f.billable !== 'boolean'
  )
    throw Error('Exact source and bounded correction fields required');
  for (const timestamp of [f.started_at, f.ended_at]) {
    if (timestamp.length > 60 || !/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp))
      throw Error('Explicit correction time offset required');
    Temporal.Instant.from(timestamp);
  }
  validateTime([
    {
      id: source.source_entry_id,
      worker_id: source.worker_id,
      job_id: jobId,
      overhead_center: null,
      task: f.task,
      kind: source.kind,
      started_at: f.started_at,
      ended_at: f.ended_at,
      submitted: false,
      billable: f.billable,
      corrects_id: source.source_entry_id,
    },
  ]);
  // A descriptor-bearing Proxy must not substitute different confirmed fields
  // at the native owner's next capture. The clone is never used as authority.
  if (JSON.stringify(structuredClone(value)) !== JSON.stringify(f))
    throw Error('Plain stable original task correction fields required');
  return freezePrototype({
    source_entry_id: source.source_entry_id,
    task: f.task,
    started_at: f.started_at,
    ended_at: f.ended_at,
    billable: f.billable,
  });
}

export async function readTaskCorrectionReview(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
  sourceEntryId?: string,
): Promise<TaskCorrectionReview> {
  const view = await readSavedSourceExercise(sources, jobId, gate);
  return freezePrototype({
    view,
    source: await readSavedTaskCorrection(view, sourceEntryId),
  });
}
export async function assertTaskCorrectionReviewCurrent(
  review: TaskCorrectionReview,
) {
  // Capture caller-owned references and comparison data before native access.
  // Keep the original view; serialized data never becomes source authority.
  const current = prototypeFields(review, [
      'view',
      'source',
    ]) as unknown as TaskCorrectionReview,
    sourceEntryId = current.source.source_entry_id,
    expected = JSON.stringify(current.source);
  const source = await readSavedTaskCorrection(current.view, sourceEntryId);
  if (JSON.stringify(source) !== expected)
    throw Error('Original task correction review is stale or held');
  assertTaskCorrectionDisplayCurrent(current);
  return source;
}
export function assertTaskCorrectionDisplayCurrent(
  review: TaskCorrectionReview,
) {
  // Capture original caller-owned references before native access/hold checks.
  const current = prototypeFields(review, [
    'view',
    'source',
  ]) as unknown as TaskCorrectionReview;
  assertSavedRevisionCurrent(current.view);
  const held = inspectSavedSourceExercise(current.view);
  if (held.state !== 'REVIEW_ONLY' || held.done.includes('time-correction'))
    throw Error('Original task correction is held');
  return current.source;
}
export async function selectTaskCorrectionSource(
  review: TaskCorrectionReview,
  sourceEntryId: string,
): Promise<TaskCorrectionReview> {
  await assertTaskCorrectionReviewCurrent(review);
  return freezePrototype({
    view: review.view,
    source: await readSavedTaskCorrection(review.view, sourceEntryId),
  });
}
export async function saveTaskCorrectionReview(
  review: TaskCorrectionReview,
  input: unknown,
  confirmed: boolean,
) {
  const source = assertTaskCorrectionDisplayCurrent(review);
  if (confirmed !== true || !source.can_edit)
    throw Error(
      'Explicit current eligible task correction confirmation required',
    );
  const captured = parseTaskCorrectionInput(
    input,
    source,
    review.view.identity.job_id,
  );
  await assertTaskCorrectionReviewCurrent(review);
  if (
    JSON.stringify(
      parseTaskCorrectionInput(input, source, review.view.identity.job_id),
    ) !== JSON.stringify(captured)
  )
    throw Error('Confirmed task correction input changed during source review');
  return executeSavedTaskCorrection(
    review.view,
    input as TaskCorrectionInput,
    true,
  );
}
export function reconcileTaskCorrectionReview(review: TaskCorrectionReview) {
  return reconcileSavedSourceCorrection(review.view, 'time-correction');
}
