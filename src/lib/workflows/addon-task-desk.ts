import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readAddonReadinessGuide,
  assertAddonReadinessCurrent,
  openAddonReadinessControls,
  resumeAddonReadinessControls,
  returnAddonReadinessContext,
  inspectAddonReadinessReference,
  type AddonReadinessGuideRead,
  type AddonTaskInput,
  type AddonRecordReference,
  type AddonReadinessReferenceRead,
  type AddonReadinessCallback,
  type AddonReadinessLiveCallback,
} from './addon-readiness-guide';
import { addonReviewModes } from './addon-review-desk';
import { selectAddonTaskJob } from './addon-task-continuity';
export {
  addonReadinessGuideEnabled as addonTaskDeskEnabled,
  readAddonReadinessJobs as readAddonTaskDeskJobs,
  assertAddonReadinessJobsCurrent as assertAddonTaskDeskJobsCurrent,
  selectAddonReadinessJob as selectAddonTaskDeskJob,
  filterAddonReadinessJobs as filterAddonTaskDeskJobs,
  advancedHandoffKinds,
  tradeEditions,
  addonReviewModes,
} from './addon-readiness-guide';
export type {
  AddonTaskInput,
  AddonReadinessJobs as AddonTaskDeskJobs,
  AddonReadinessCallback as AddonTaskDeskCallback,
  AddonReadinessLiveCallback as AddonTaskDeskLiveCallback,
} from './addon-readiness-guide';
interface Binding {
  navigationPending: boolean;
  held: boolean;
  operations: OperatingSources['operations'];
}
const tasks = new WeakMap<object, Binding>();
// Presentation outcome holds use the existing repository identity, never a new
// business reservation, source body, expiry window or engine attempt.
const unknownNavigation = new WeakMap<object, Set<string>>();
function navigationKey(task: AddonTaskDeskRead) {
  return JSON.stringify([task.source.organization_id, task.source.job_id]);
}
function requireKnownNavigation(b: Binding, task: AddonTaskDeskRead) {
  if (b.held || unknownNavigation.get(b.operations)?.has(navigationKey(task)))
    throw Error(
      'UNKNOWN add-on navigation outcome; no retry or same-job reselection',
    );
}
function holdNavigation(b: Binding, task: AddonTaskDeskRead) {
  b.held = true;
  let held = unknownNavigation.get(b.operations);
  if (!held) unknownNavigation.set(b.operations, (held = new Set()));
  held.add(navigationKey(task));
}
/** Same original task/source/control handles. No new engine, business object or review window. */
export async function readAddonTaskDesk(
  sources: OperatingSources,
  input: AddonTaskInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const task = await readAddonReadinessGuide(sources, input, gate);
  assertAddonReadinessCurrent(task);
  const capture = captureOperatingSources(sources, gate),
    b = {
      navigationPending: false,
      held: false,
      operations: capture.entries[0].operations,
    };
  capture.check();
  requireKnownNavigation(b, task);
  tasks.set(task, b);
  return task;
}
export type AddonTaskDeskRead = AddonReadinessGuideRead;
function current(task: AddonTaskDeskRead) {
  const b = tasks.get(task);
  if (!b) throw Error('Exact retained add-on task desk source required');
  requireKnownNavigation(b, task);
  assertAddonReadinessCurrent(task);
  return b;
}
export function assertAddonTaskDeskCurrent(task: AddonTaskDeskRead) {
  current(task);
}
export function openAddonTaskDeskControls(task: AddonTaskDeskRead) {
  current(task);
  return openAddonReadinessControls(task);
}
export function resumeAddonTaskDeskControls(task: AddonTaskDeskRead) {
  current(task);
  return resumeAddonReadinessControls(task);
}
export function returnAddonTaskDeskContext(task: AddonTaskDeskRead) {
  current(task);
  return returnAddonReadinessContext(task);
}
const records = new WeakMap<object, AddonTaskDeskRead>();
export async function inspectAddonTaskDeskReference(
  task: AddonTaskDeskRead,
  reference: AddonRecordReference,
) {
  current(task);
  const record = await inspectAddonReadinessReference(task, reference);
  current(task);
  records.set(record, task);
  return record;
}
export type AddonTaskDeskReference = AddonReadinessReferenceRead;
/** Breadcrumbs are source-bound visibility links, never lifecycle state or authority. */
export function addonTaskDeskBreadcrumbs(
  task: AddonTaskDeskRead,
  record?: AddonTaskDeskReference,
) {
  current(task);
  if (record && records.get(record) !== task)
    throw Error('Exact retained recorded source/context required');
  return freezePrototype([
    {
      kind: 'job' as const,
      label: `Job ${task.job_label}`,
      id: task.source.job_id,
    },
    {
      kind: 'mode' as const,
      label: `Mode ${addonReviewModes[task.source.kind]}`,
      id: task.source.kind,
    },
    {
      kind: 'edition' as const,
      label: `Edition ${task.edition.human_selected_review_context}`,
      id: task.edition.human_selected_review_context,
    },
    {
      kind: 'source' as const,
      label: 'Exact sources',
      id: task.source.source_sha256,
    },
    ...(record
      ? [
          {
            kind: 'record' as const,
            label: `Source ${record.reference.kind} ${record.reference.id} version ${record.reference.version ?? 'not recorded'}`,
            id: record.reference.id,
          },
        ]
      : []),
    {
      kind: 'review' as const,
      label: 'Original review',
      id: task.source.issued_version_id,
    },
  ]);
}
class NavigationWithdrawn extends Error {}
function callbackCurrent(
  expected: AddonReadinessCallback,
  live: AddonReadinessLiveCallback,
) {
  const p = prototypeFields(live, ['current', 'generation']);
  if (
    Object.keys(p).length !== 2 ||
    typeof expected !== 'function' ||
    p.current !== expected ||
    typeof p.generation !== 'number' ||
    !Number.isSafeInteger(p.generation) ||
    p.generation < 0
  )
    throw new NavigationWithdrawn(
      'Add-on navigation callback withdrawn or replaced',
    );
  return p.generation;
}
/** Original exact inspection/selector with a live callback and terminal ambiguous-outcome fence. */
export async function navigateAddonTaskDeskJob(
  task: AddonTaskDeskRead,
  record: AddonTaskDeskReference,
  expected: AddonReadinessCallback,
  live: AddonReadinessLiveCallback,
) {
  const b = current(task),
    generation = callbackCurrent(expected, live);
  if (records.get(record) !== task)
    throw Error('Exact inspected source required');
  if (b.navigationPending)
    throw Error('Add-on task navigation already pending');
  b.navigationPending = true;
  let invoked = false;
  try {
    const inspected = await inspectAddonReadinessReference(
      task,
      record.reference,
    );
    current(task);
    const job = selectAddonTaskJob(task);
    if (inspected.reference.job_id !== job)
      throw Error('Exact inspected add-on job required');
    if (callbackCurrent(expected, live) !== generation)
      throw new NavigationWithdrawn(
        'Add-on navigation callback withdrawn or replaced during inspection',
      );
    invoked = true;
    await expected(job);
    return job;
  } catch (error) {
    if (invoked || !(error instanceof NavigationWithdrawn))
      holdNavigation(b, task);
    throw error;
  } finally {
    b.navigationPending = false;
  }
}
