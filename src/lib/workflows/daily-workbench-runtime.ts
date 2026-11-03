import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readOperatingSelection,
  assertOperatingSelectionCurrentNow,
  revalidateOperatingSelection,
  type OperatingSelectionView,
} from './operating-selection';
import type { JourneyAdmission } from './journey-runtime';
import {
  dailyWorkbenchSteps,
  type DailyWorkbenchStep,
} from './daily-workbench-contract';
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit local daily review required');
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  selection: OperatingSelectionView;
  job: string;
  operations: OperatingSources['operations'];
  key: string;
  held: boolean;
}
const contexts = new WeakMap<object, Binding>();
// Presentation outcome metadata only. No canonical task, state transition or durable store.
const outcomes = new WeakMap<
  OperatingSources['operations'],
  Map<string, 'PENDING' | 'UNKNOWN'>
>();
function map(b: Binding) {
  let value = outcomes.get(b.operations);
  if (!value) outcomes.set(b.operations, (value = new Map()));
  return value;
}
function current(b: Binding, evidenceOnly = false) {
  if (b.held) throw Error('Retained daily context UNKNOWN');
  try {
    admit(b.gate);
    b.capture.check();
    assertOperatingSelectionCurrentNow(b.selection);
    if (!evidenceOnly && map(b).get(b.key) === 'UNKNOWN')
      throw Error('Daily navigation outcome UNKNOWN');
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export async function readDailyWorkContext(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  if (typeof jobId !== 'string' || !jobId || jobId.length > 100)
    throw Error('Exact prepared job required');
  const capture = captureOperatingSources(sources, gate);
  const operations = prototypeFields(sources, [
    'company',
    'operations',
    'estimates',
    'property',
    'entries',
    'gate',
  ]).operations as OperatingSources['operations'];
  const selection = await readOperatingSelection(
    sources,
    { query: jobId, page: 0, page_size: 2 },
    gate,
  );
  capture.check();
  assertOperatingSelectionCurrentNow(selection);
  const rows = selection.rows.filter((r) => r.job_id === jobId);
  if (rows.length !== 1 || selection.matching !== 1)
    throw Error('Unique exact authorized source required');
  const r = rows[0];
  await revalidateOperatingSelection(sources, selection, jobId);
  capture.check();
  const view = freezePrototype({
    mode: 'LOCAL_DAILY_WORK_CONTEXT' as const,
    organization_id: r.organization_id,
    customer_id: r.customer_id,
    location_id: r.location_id,
    job_id: r.job_id,
    issued_version_id: r.issued_version_id,
    issued_version_number: r.issued_version_number,
    customer_label: r.customer_label,
    property_label: r.property_label,
    job_label: r.job_label,
    source_sha256: selection.integrity.sha256,
    coverage: selection.coverage,
    meaning:
      'Navigation and visited review steps only; no work, repair, contract, invoice, communication or financial completion.',
    operational_ready: false as const,
  });
  const b: Binding = {
    sources,
    capture,
    gate,
    selection,
    job: jobId,
    operations,
    key: JSON.stringify([r.organization_id, jobId]),
    held: false,
  };
  current(b, true);
  contexts.set(view, b);
  return view;
}
export type DailyWorkContext = Awaited<ReturnType<typeof readDailyWorkContext>>;
export function assertDailyWorkContextNow(view: DailyWorkContext) {
  const b = contexts.get(view);
  if (!b) throw Error('Original daily source context required');
  current(b);
}
export async function continueDailyWorkContext(
  view: DailyWorkContext,
  step: DailyWorkbenchStep,
  callback: () => void | Promise<void>,
  live: () => unknown = () => callback,
) {
  const b = contexts.get(view);
  if (!b) return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  if (map(b).get(b.key) === 'PENDING')
    return { status: 'PENDING' as const, replay: 'FORBIDDEN' as const };
  let dispatched = false;
  try {
    current(b);
    if (!dailyWorkbenchSteps.includes(step) || typeof callback !== 'function')
      throw Error('Exact local review destination required');
    map(b).set(b.key, 'PENDING');
    await revalidateOperatingSelection(b.sources, b.selection, b.job);
    current(b);
    const before = live();
    current(b);
    if (before !== callback) {
      map(b).delete(b.key);
      return {
        status: 'WITHHELD_NO_DISPATCH' as const,
        replay: 'FORBIDDEN' as const,
      };
    }
    dispatched = true;
    await callback();
    current(b);
    const after = live();
    current(b);
    if (after !== callback)
      throw Error('Dispatched local continuation became uncertain');
    map(b).delete(b.key);
    return {
      status: 'CURRENT_REVIEW_ONLY' as const,
      replay: 'FORBIDDEN' as const,
    };
  } catch {
    b.held = true;
    // Hold before any possible acknowledgement; no fresh-wrapper/job revision bypass.
    map(b).set(b.key, 'UNKNOWN');
    return {
      status: 'UNKNOWN' as const,
      replay: 'FORBIDDEN' as const,
      dispatched,
    };
  }
}
export async function reconcileDailyWorkContext(view: DailyWorkContext) {
  const b = contexts.get(view);
  try {
    if (!b) throw Error('Unknown context');
    current(b);
    await revalidateOperatingSelection(b.sources, b.selection, b.job);
    current(b);
    return freezePrototype({
      status:
        map(b).get(b.key) === 'PENDING'
          ? ('PENDING' as const)
          : ('CURRENT_REVIEW_ONLY' as const),
      replay: 'FORBIDDEN' as const,
    });
  } catch {
    return freezePrototype({
      status: 'UNKNOWN' as const,
      replay: 'FORBIDDEN' as const,
    });
  }
}
export async function readNextDailyWorkContext(view: DailyWorkContext) {
  const b = contexts.get(view);
  if (!b) throw Error('Original current job required');
  current(b);
  const first = await readOperatingSelection(
    b.sources,
    { query: '', page: 0, page_size: 10 },
    b.gate,
  );
  current(b);
  const pages = [first];
  if (first.matching > 10)
    pages.push(
      await readOperatingSelection(
        b.sources,
        { query: '', page: 1, page_size: 10 },
        b.gate,
      ),
    );
  current(b);
  for (const p of pages) assertOperatingSelectionCurrentNow(p);
  const rows = pages.flatMap((p) => p.rows);
  if (
    rows.length !== first.matching ||
    new Set(rows.map((r) => r.job_id)).size !== rows.length
  )
    throw Error('Prepared source coverage changed');
  const index = rows.findIndex((r) => r.job_id === view.job_id);
  if (index < 0) throw Error('Current job absent from exact prepared sources');
  if (index + 1 === rows.length) return null;
  const page = pages.find((p) =>
    p.rows.some((r) => r.job_id === rows[index + 1].job_id),
  )!;
  await revalidateOperatingSelection(b.sources, page, rows[index + 1].job_id);
  current(b);
  const next = await readDailyWorkContext(
    b.sources,
    rows[index + 1].job_id,
    b.gate,
  );
  current(b);
  return next;
}
