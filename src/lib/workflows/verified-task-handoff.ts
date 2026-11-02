import { freezePrototype } from '../program/prototype-source';
import {
  operatingNavigationEnabled,
  readOperatingNavigation,
  assertOperatingNavigationCurrent,
  inspectOperatingNavigationSource,
  navigateOperatingSuggestion,
  inspectOperatingNavigation,
  type OperatingNavigationReview,
  type OperatingNavigationDetail,
  type OperatingJobSection,
} from './operating-navigation';

export const verifiedTaskHandoffEnabled = operatingNavigationEnabled;
export const readVerifiedTaskHandoff = readOperatingNavigation;
export const taskHandoffWindowMs = 5 * 60 * 1000;
const denied = () =>
  Error(
    'Exact current unexpired task handoff required; UNKNOWN allows exact retained read-only reconciliation only',
  );
const unknown = () =>
  freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
const inspected = new WeakMap<object, Set<string>>();
const records = new WeakMap<
  object,
  {
    review: OperatingNavigationReview;
    detail: OperatingNavigationDetail;
    expires: number;
    last: number;
    uncertain: boolean;
  }
>();
function now() {
  const value = Date.now();
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER - taskHandoffWindowMs
  )
    throw denied();
  return value;
}
/** One exact source inspection, not a new suggestion, priority or preparation
 * engine. A finite local display window is not operational Auth or custody. */
export async function inspectVerifiedTaskHandoff(
  review: OperatingNavigationReview,
  key: string,
) {
  assertOperatingNavigationCurrent(review);
  if (typeof key !== 'string' || key.length > 700) throw denied();
  const tasks = review.tasks.filter((task) => task.key === key);
  if (tasks.length !== 1) throw denied();
  const task = tasks[0],
    sourceKey = JSON.stringify([
      task.job_id,
      task.source.kind,
      task.source.id,
      task.source.version,
      task.source.revision,
    ]);
  const held = inspected.get(review) ?? new Set<string>();
  if (held.has(sourceKey))
    throw Error(
      'Exact task handoff inspection already held; no replacement or renewed expiry.',
    );
  held.add(sourceKey);
  inspected.set(review, held); // Read-association metadata before await; no business command reservation.
  const started = now(),
    expires = started + taskHandoffWindowMs;
  const detail = await inspectOperatingNavigationSource(review, key);
  assertOperatingNavigationCurrent(detail);
  const checked = now();
  if (checked < started || checked >= expires) throw denied();
  const result = freezePrototype({
    mode: 'EXACT_LOCAL_VERIFIED_TASK_HANDOFF' as const,
    selected: {
      key: detail.task.key,
      job_id: detail.target.job_id!,
      source_kind: detail.source.kind,
      source_id: detail.source.id,
      source_version: detail.source.version,
      source_revision: detail.source.revision,
      issued_version_id: detail.target.version_id,
      section: detail.task.navigation.section,
    },
    task: detail.task,
    target: { ...detail.target },
    source_sha256: detail.source_sha256,
    inspected_at: new Date(started).toISOString(),
    expires_at: new Date(expires).toISOString(),
    clock_meaning:
      'LOCAL_BROWSER_REVIEW_WINDOW_ONLY_NOT_AUTH_OR_DURABLE_CUSTODY' as const,
    authority: 'LOCAL_PRESENTATION_NAVIGATION_ONLY' as const,
  });
  records.set(result, {
    review,
    detail,
    expires,
    last: checked,
    uncertain: false,
  });
  assertVerifiedTaskHandoffCurrent(result);
  return result;
}
export type VerifiedTaskHandoffSelection = Awaited<
  ReturnType<typeof inspectVerifiedTaskHandoff>
>;
export function assertVerifiedTaskHandoffCurrent(
  handoff: VerifiedTaskHandoffSelection,
) {
  const record = records.get(handoff);
  if (!record || record.uncertain) throw denied();
  try {
    const checked = now();
    if (checked < record.last || checked >= record.expires) throw denied();
    assertOperatingNavigationCurrent(record.detail);
    record.last = checked;
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
/** C13 retains all canonical source/current workflow-state checks and exact section
 * resolution. The callback wrapper closes clock/source drift during that resolution. */
export function navigateVerifiedTaskHandoff(
  handoff: VerifiedTaskHandoffSelection,
  callback: (jobId: string, section?: OperatingJobSection) => void,
) {
  const record = records.get(handoff);
  if (!record || typeof callback !== 'function') return unknown();
  try {
    assertVerifiedTaskHandoffCurrent(handoff);
    const result = navigateOperatingSuggestion(
      record.detail,
      (jobId, section) => {
        assertVerifiedTaskHandoffCurrent(handoff);
        if (
          jobId !== handoff.selected.job_id ||
          section !== handoff.selected.section
        )
          throw denied();
        callback(jobId, section);
      },
    );
    if (result.status !== 'LOCAL_REVIEW_NAVIGATION_REQUESTED') throw denied();
    return freezePrototype({
      status: 'EXACT_LOCAL_TASK_REVIEW_REQUESTED' as const,
    });
  } catch {
    record.uncertain = true;
    return unknown();
  }
}
export async function reconcileVerifiedTaskHandoff(
  handoff: VerifiedTaskHandoffSelection,
) {
  const record = records.get(handoff);
  if (!record) return unknown();
  try {
    assertVerifiedTaskHandoffCurrent(handoff);
    const current = await inspectOperatingNavigation(record.review);
    assertVerifiedTaskHandoffCurrent(handoff);
    if (current.status !== 'CURRENT_READ_ONLY_NAVIGATION') throw denied();
    return freezePrototype({
      status: 'CURRENT_UNEXPIRED_LOCAL_REVIEW_ONLY' as const,
      replacement: null,
    });
  } catch {
    record.uncertain = true;
    return unknown();
  }
}
