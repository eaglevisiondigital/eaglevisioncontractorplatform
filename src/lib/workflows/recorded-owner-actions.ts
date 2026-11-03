import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readPrioritySavedRevision,
  comparePrioritySavedRevisions,
  filterPrioritySavedRevisions,
  type PrioritySavedRevision,
} from './priority-saved-revisions';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
} from './saved-revision-runtime';
import {
  recordedPriorityNavigationEnabled,
  readRecordedPriorityNavigation,
  assertRecordedPriorityNavigationCurrent,
  inspectRecordedPrioritySource,
  continueRecordedPrioritySource,
} from './recorded-priority-navigation';
export const recordedOwnerActionsEnabled = recordedPriorityNavigationEnabled;
/** Read handles only. Ranking, source ownership and navigation custody remain
 * in the existing priority engines; no business state or new action registry. */
const reads = new WeakSet<object>();
export async function readRecordedOwnerActions(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const admission = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(admission).length !== 2 ||
    admission.enabled !== true ||
    admission.confirmed !== true ||
    !recordedOwnerActionsEnabled(true)
  )
    throw Error('Recorded owner actions are OFF');
  const snapshot = await readPrioritySavedRevision(sources, jobId, gate),
    navigation = await readRecordedPriorityNavigation(sources, jobId, gate);
  assertSavedRevisionCurrent(snapshot);
  assertRecordedPriorityNavigationCurrent(navigation);
  const value = freezePrototype({
    snapshot,
    navigation,
    meaning: 'CURRENT_RECORDED_SOURCES_NOT_AUTHORIZED_ACTIONS' as const,
    model: 'NONE' as const,
    operational_ready: false as const,
  });
  reads.add(value);
  return value;
}
export type RecordedOwnerActionReview = Awaited<
  ReturnType<typeof readRecordedOwnerActions>
>;
export function assertRecordedOwnerActionsCurrent(
  value: RecordedOwnerActionReview,
) {
  if (!reads.has(value)) throw Error('Original owner action read required');
  assertSavedRevisionCurrent(value.snapshot);
  assertRecordedPriorityNavigationCurrent(value.navigation);
}
export function assertRecordedOwnerActionsAccess(
  value: RecordedOwnerActionReview,
) {
  if (!reads.has(value)) throw Error('Original owner action read required');
  assertSavedRevisionAccess(value.snapshot);
}
export function compareRecordedOwnerActions(
  previous: RecordedOwnerActionReview,
  current: RecordedOwnerActionReview,
  input: { query: string; area: string; changed_only: boolean },
) {
  assertRecordedOwnerActionsAccess(previous);
  assertRecordedOwnerActionsCurrent(current);
  const comparison = comparePrioritySavedRevisions(
    previous.snapshot,
    current.snapshot,
  );
  return filterPrioritySavedRevisions(comparison, input);
}
export function recordedOwnerActionCards(value: RecordedOwnerActionReview) {
  assertRecordedOwnerActionsCurrent(value);
  return value.snapshot.evidence.cards;
}
export async function inspectRecordedOwnerAction(
  value: RecordedOwnerActionReview,
  key: string,
) {
  assertRecordedOwnerActionsCurrent(value);
  const source = await inspectRecordedPrioritySource(value.navigation, key);
  assertRecordedOwnerActionsCurrent(value);
  return source;
}
export type RecordedOwnerActionInspection = Awaited<
  ReturnType<typeof inspectRecordedOwnerAction>
>;
export async function continueRecordedOwnerAction(
  value: RecordedOwnerActionReview,
  source: RecordedOwnerActionInspection,
  ...args: Parameters<typeof continueRecordedPrioritySource> extends [
    unknown,
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) {
  try {
    assertRecordedOwnerActionsCurrent(value);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
  return continueRecordedPrioritySource(value.navigation, source, ...args);
}
export type RecordedOwnerCard =
  PrioritySavedRevision['evidence']['cards'][number];
