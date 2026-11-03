import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { journeyEnabled, type JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readOperatingSelection,
  assertOperatingSelectionCurrentNow,
  type OperatingSelectionView,
} from './operating-selection';
import {
  readAddonTaskContinuity,
  assertAddonTaskContinuityCurrent,
  openAddonTaskControls,
  resumeAddonTaskControls,
  returnAddonTaskContext,
  selectAddonTaskJob,
  type AddonTaskInput,
  type AddonTaskRead,
} from './addon-task-continuity';
import {
  inspectAddonReviewReference,
  type AddonRecordReference,
} from './addon-review-desk';
import type { OperatingJobSection } from './operating-navigation';
export { advancedHandoffKinds } from './advanced-handoffs';
export { addonReviewModes } from './addon-review-desk';
export { tradeEditions } from '../program/trade-editions';
export type { AddonTaskInput, AddonRecordReference };
export function addonReadinessGuideEnabled(enabled = false) {
  return (
    enabled === true &&
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: 'true',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  );
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !addonReadinessGuideEnabled(true)
  )
    throw Error(
      'Add-on readiness guide is OFF without explicit development HTTP loopback admission',
    );
}
interface JobBinding {
  gate: JourneyAdmission;
  capture: ReturnType<typeof captureOperatingSources>;
  held: boolean;
}
const jobs = new WeakMap<object, JobBinding>();
/** Original finite job selection only; no duplicate job/source store. */
export async function readAddonReadinessJobs(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const capture = captureOperatingSources(sources, gate),
    view = await readOperatingSelection(
      sources,
      { query: '', page: 0, page_size: 10 },
      gate,
    );
  admit(gate);
  capture.check();
  assertOperatingSelectionCurrentNow(view);
  if (view.available !== view.rows.length)
    throw Error('Complete admitted finite handle page required');
  jobs.set(view, { gate, capture, held: false });
  return view;
}
export type AddonReadinessJobs = OperatingSelectionView;
export function assertAddonReadinessJobsCurrent(view: AddonReadinessJobs) {
  const b = jobs.get(view);
  if (!b || b.held)
    throw Error('UNKNOWN or unretained exact add-on job selection');
  try {
    admit(b.gate);
    b.capture.check();
    assertOperatingSelectionCurrentNow(view);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export function selectAddonReadinessJob(
  view: AddonReadinessJobs,
  jobId?: string,
) {
  assertAddonReadinessJobsCurrent(view);
  if (
    jobId !== undefined &&
    (typeof jobId !== 'string' || !jobId || jobId.length > 200)
  )
    throw Error('Exact selected job hint required');
  const matches = view.rows.filter(
    (row) => jobId === undefined || row.job_id === jobId,
  );
  if (jobId !== undefined && matches.length !== 1)
    throw Error('Selected add-on job unavailable or ambiguous; no fallback');
  return matches[0]?.job_id ?? null;
}
export interface AddonReadinessJobFilters {
  query: string;
  location_id: string;
}
export function filterAddonReadinessJobs(
  view: AddonReadinessJobs,
  input: AddonReadinessJobFilters,
) {
  assertAddonReadinessJobsCurrent(view);
  const p = prototypeFields(input, ['query', 'location_id']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    typeof p.location_id !== 'string' ||
    p.location_id.length > 200 ||
    (p.location_id && !view.rows.some((r) => r.location_id === p.location_id))
  )
    throw Error('Exact bounded literal add-on filters required');
  const query = p.query.trim().toLocaleLowerCase('en-US');
  return freezePrototype(
    view.rows.filter(
      (r) =>
        (!p.location_id || r.location_id === p.location_id) &&
        [
          r.organization_id,
          r.customer_id,
          r.location_id,
          r.job_id,
          r.job_label,
          r.customer_label,
          r.property_label,
          r.issued_version_id,
          r.scope_summary,
        ].some((value) => value.toLocaleLowerCase('en-US').includes(query)),
    ),
  );
}
interface Binding {
  gate: JourneyAdmission;
  held: boolean;
}
const guides = new WeakMap<object, Binding>();
/** Same original C15 task and immutable source/edition; no new lifecycle, window or reservation. */
export async function readAddonReadinessGuide(
  sources: OperatingSources,
  input: AddonTaskInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const task = await readAddonTaskContinuity(sources, input, gate);
  const b = { gate, held: false };
  guides.set(task, b);
  assertAddonReadinessCurrent(task);
  return task;
}
export type AddonReadinessGuideRead = AddonTaskRead;
export function assertAddonReadinessCurrent(task: AddonReadinessGuideRead) {
  const b = guides.get(task);
  if (!b || b.held)
    throw Error('UNKNOWN or unretained exact add-on readiness source');
  try {
    admit(b.gate);
    assertAddonTaskContinuityCurrent(task);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export function openAddonReadinessControls(task: AddonReadinessGuideRead) {
  assertAddonReadinessCurrent(task);
  return openAddonTaskControls(task);
}
export function resumeAddonReadinessControls(task: AddonReadinessGuideRead) {
  assertAddonReadinessCurrent(task);
  return resumeAddonTaskControls(task);
}
export function returnAddonReadinessContext(task: AddonReadinessGuideRead) {
  assertAddonReadinessCurrent(task);
  return returnAddonTaskContext(task);
}
function query(input: string) {
  if (typeof input !== 'string' || input.length > 100)
    throw Error('Bounded literal add-on search required');
  return input.trim().toLocaleLowerCase('en-US');
}
export function filterAddonReadinessRequirements(
  task: AddonReadinessGuideRead,
  input: string,
) {
  assertAddonReadinessCurrent(task);
  const q = query(input);
  return task.requirements.filter((text) =>
    text.toLocaleLowerCase('en-US').includes(q),
  );
}
export function filterAddonReadinessReferences(
  task: AddonReadinessGuideRead,
  input: string,
) {
  const props = openAddonReadinessControls(task),
    q = query(input);
  return props.selection.references.filter((r) =>
    [
      r.kind,
      r.id,
      r.job_id,
      r.issued_version_id,
      r.version === null ? 'unknown' : String(r.version),
    ].some((value) => value.toLocaleLowerCase('en-US').includes(q)),
  );
}
export async function inspectAddonReadinessReference(
  task: AddonReadinessGuideRead,
  reference: AddonRecordReference,
) {
  const props = openAddonReadinessControls(task),
    record = await inspectAddonReviewReference(props.selection, reference);
  assertAddonReadinessCurrent(task);
  return record;
}
export type AddonReadinessReferenceRead = Awaited<
  ReturnType<typeof inspectAddonReadinessReference>
>;
export type AddonReadinessCallback = (
  jobId: string,
  section?: OperatingJobSection,
) => void;
export interface AddonReadinessLiveCallback {
  current: AddonReadinessCallback | undefined;
  generation: number;
}
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
    throw Error('Add-on navigation callback withdrawn or replaced');
  return p.generation as number;
}
/** Re-inspect the original exact reference, then fence the live callback after the final await. */
export async function navigateAddonReadinessJob(
  task: AddonReadinessGuideRead,
  reference: AddonRecordReference,
  expected: AddonReadinessCallback,
  live: AddonReadinessLiveCallback,
) {
  const generation = callbackCurrent(expected, live);
  const inspected = await inspectAddonReadinessReference(task, reference);
  assertAddonReadinessCurrent(task);
  const job = selectAddonTaskJob(task);
  if (inspected.reference.job_id !== job)
    throw Error('Exact inspected add-on job required');
  if (callbackCurrent(expected, live) !== generation)
    throw Error(
      'Add-on navigation callback withdrawn or replaced during inspection',
    ); // Restoration cannot revive an earlier navigation.
  expected(job);
  return job;
}
