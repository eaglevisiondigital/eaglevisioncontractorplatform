import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { tradeEditions, type TradeEdition } from '../program/trade-editions';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  advancedHandoffKinds,
  type AdvancedHandoffInput,
} from './advanced-handoffs';
import {
  readAddonReviewDesk,
  inspectAddonReviewSource,
  assertAddonReviewDetailCurrentNow,
  openAddonOriginalControl,
  selectAddonReviewJob,
  type AddonReviewDetail,
} from './addon-review-desk';
export interface AddonTaskInput {
  job_id: string;
  kind: AdvancedHandoffInput['kind'];
  edition: TradeEdition;
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error(
      'Advanced task continuity is OFF without explicit local admission',
    );
}
function pin(input: AddonTaskInput) {
  const p = prototypeFields(input, ['job_id', 'kind', 'edition']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200 ||
    !advancedHandoffKinds.includes(p.kind as AdvancedHandoffInput['kind']) ||
    !tradeEditions.includes(p.edition as TradeEdition)
  )
    throw Error('Exact original job, mode and edition required');
  return {
    job_id: p.job_id,
    kind: p.kind,
    edition: p.edition,
  } as AddonTaskInput;
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  input: AddonTaskInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  selection: AddonReviewDetail;
  controls: Readonly<{
    sources: OperatingSources;
    selection: AddonReviewDetail;
  }>;
  held: boolean;
}
const tasks = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held)
    throw Error(
      'UNKNOWN advanced task source permits exact retained read only',
    );
  try {
    admit(b.gate);
    if (JSON.stringify(pin(b.input)) !== b.signature)
      throw Error('Original advanced task context changed');
    b.capture.check();
    assertAddonReviewDetailCurrentNow(b.selection);
    if (openAddonOriginalControl(b.selection) !== b.sources)
      throw Error('Same original source root required');
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Navigation and retention of the actual existing source selection; no new engine or attempt. */
export async function readAddonTaskContinuity(
  sources: OperatingSources,
  input: AddonTaskInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate),
    view = await readAddonReviewDesk(sources, { query: '', ...selected }, gate);
  capture.check();
  if (JSON.stringify(pin(input)) !== JSON.stringify(selected))
    throw Error('Original advanced task changed');
  const rows = view.rows.filter(
    (r) =>
      r.reference.job_id === selected.job_id &&
      r.reference.kind === selected.kind,
  );
  if (rows.length !== 1)
    throw Error('Exact unique selected task source required');
  const selection = await inspectAddonReviewSource(view, rows[0].reference),
    b: Binding = {
      sources,
      gate,
      input,
      signature: JSON.stringify(selected),
      capture,
      selection,
      controls: Object.freeze({ sources, selection }),
      held: false,
    };
  current(b);
  if (
    selection.reference.job_id !== selected.job_id ||
    selection.reference.kind !== selected.kind ||
    selection.edition.human_selected_review_context !== selected.edition
  )
    throw Error('Exact task mode and edition pin required');
  const body = {
    mode: 'LOCAL_RETAINED_ADDON_TASK_CONTEXT' as const,
    company: selection.company,
    source: selection.reference,
    edition: selection.edition,
    report: selection.report,
    workflow: selection.source_references.workflow,
    job_label: selection.job_label,
    requirements: selection.requirements,
    return_context: {
      job_id: selected.job_id,
      kind: selected.kind,
      edition: selected.edition,
      issued_version_id: selection.reference.issued_version_id,
      source_sha256: selection.reference.source_sha256,
    },
    original_control: 'UNCHANGED_SOURCE_BOUND_ADDONS' as const,
    original_review_status: 'NOT_INFERRED_BY_NAVIGATION_METADATA' as const,
    authority: 'PRESENTATION_AND_EXACT_SOURCE_RETURN_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const task = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  tasks.set(task, b);
  return task;
}
export type AddonTaskRead = Awaited<ReturnType<typeof readAddonTaskContinuity>>;
function binding(task: AddonTaskRead) {
  const b = tasks.get(task);
  if (!b) throw Error('Exact retained advanced task required');
  current(b);
  return b;
}
export function assertAddonTaskContinuityCurrent(task: AddonTaskRead) {
  binding(task);
}
/** Same props and original selection object on every local return/resume. Consumers keep the original child mounted. */
export function openAddonTaskControls(task: AddonTaskRead) {
  return binding(task).controls;
}
export const resumeAddonTaskControls = openAddonTaskControls;
export function returnAddonTaskContext(task: AddonTaskRead) {
  binding(task);
  return task.return_context;
}
export function selectAddonTaskJob(task: AddonTaskRead) {
  const b = binding(task),
    job = selectAddonReviewJob(b.selection);
  if (job !== task.source.job_id) throw Error('Original task job changed');
  return job;
}
export function reconcileAddonTaskContinuity(task: AddonTaskRead) {
  try {
    binding(task);
    return {
      status: 'CURRENT_SOURCE_CONTEXT_ONLY' as const,
      original_review_status: 'OWNED_BY_RETAINED_ORIGINAL_CONTROL' as const,
      replay: false,
      replacement: null,
      operational_ready: false,
    };
  } catch {
    return {
      status: 'UNKNOWN' as const,
      original_review_status: 'NOT_INFERRED' as const,
      replay: false,
      replacement: null,
      operational_ready: false,
    };
  }
}
