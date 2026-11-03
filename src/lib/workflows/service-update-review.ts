import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { DailyWorkbenchProps } from './daily-workbench-contract';
import {
  servicePassportPathEnabled,
  readServicePassportPath,
  selectServicePassportContext,
  openServicePassportContext,
  assertServicePassportContextCurrent,
  openServicePassportDocumentation,
  type ServicePassportContext,
  type ServicePassportReport,
} from './service-passport-path';
export const serviceUpdateReviewEnabled = servicePassportPathEnabled;
export interface ServiceUpdateInput {
  job_id: string;
  staff_context_confirmed: boolean;
}
export interface ServiceEvidenceFilter {
  query: string;
  phase: string;
  association: string;
}
export type ServiceUpdateContinue = NonNullable<
  DailyWorkbenchProps['onContinue']
>;
export interface ServiceUpdateLiveCallback {
  current: ServiceUpdateContinue | undefined;
  generation: number;
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !serviceUpdateReviewEnabled(true)
  )
    throw Error(
      'Service update review is OFF without explicit development HTTP loopback admission',
    );
}
function pin(input: ServiceUpdateInput) {
  const p = prototypeFields(input, ['job_id', 'staff_context_confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200 ||
    p.staff_context_confirmed !== true
  )
    throw Error('Exact job and explicit staff summary context required');
  return JSON.stringify([p.job_id, p.staff_context_confirmed]);
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  input: ServiceUpdateInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  operations: OperatingSources['operations'];
  key: string;
  path?: ServicePassportContext;
  held: boolean;
  pending: boolean;
}
const holds = new WeakMap<object, Set<string>>(),
  bindings = new WeakMap<object, Binding>(),
  pendingClaims = new WeakMap<object, Map<string, object>>();
function hold(b: Binding) {
  b.held = true;
  let set = holds.get(b.operations);
  if (!set) holds.set(b.operations, (set = new Set()));
  set.add(b.key);
}
function check(b: Binding) {
  if (b.held || holds.get(b.operations)?.has(b.key))
    throw Error('UNKNOWN service summary; no reset, replacement or retry');
  try {
    admit(b.gate);
    b.capture.check();
    if (pin(b.input) !== b.signature)
      throw Error('Original service summary context changed');
    if (b.path) assertServicePassportContextCurrent(b.path);
  } catch (error) {
    hold(b);
    throw error;
  }
}
/** Customer-safe presentation over the original path; no update record/transaction. */
export async function readServiceUpdateReview(
  sources: OperatingSources,
  input: ServiceUpdateInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const signature = pin(input),
    capture = captureOperatingSources(sources, gate),
    selected = prototypeFields(input, ['job_id', 'staff_context_confirmed'])
      .job_id as string;
  if (capture.entries.filter((e) => e.target.job_id === selected).length !== 1)
    throw Error('Exact unique service job required; no fallback');
  const b: Binding = {
    sources,
    gate,
    input,
    signature,
    capture,
    operations: capture.entries[0].operations,
    key: JSON.stringify([capture.organization_id, selected]),
    held: false,
    pending: false,
  };
  check(b);
  try {
    const selection = await readServicePassportPath(sources, gate);
    check(b);
    const context = selectServicePassportContext(selection, selected);
    if (!context) throw Error('Exact actual request context unavailable');
    b.path = await openServicePassportContext(selection, {
      ...context,
      staff_context_confirmed: true,
    });
    check(b);
    const safe = b.path.customer_safe,
      scope = safe.scope;
    const view = freezePrototype({
      organization_id: capture.organization_id,
      request_id: b.path.context.request_id,
      relationship: b.path.context.recorded_request_job_link,
      customer_id: safe.property.customer_id,
      location_id: safe.property.location_id,
      property_label: safe.property.label,
      job_id: scope.job_id,
      scope_name: scope.name,
      issued_version_id: scope.issued_version_id,
      issued_version_number: scope.issued_version_number,
      summary: `Published service documentation for ${scope.name}. Physical completion, customer acceptance and warranty remain unverified.`,
      scope_description: scope.description,
      evidence: safe.documentation.map((d) => ({
        reference: d.report.reference,
        phase: d.report.phase,
        visited_on: d.report.visited_on,
        summary: d.report.summary,
        association: d.selected_job_association,
      })),
      requirements: safe.required_proof.map((r) => ({
        kind: r.kind,
        status: r.status,
        required: r.required,
      })),
      physical_completion: 'UNKNOWN' as const,
      customer_acceptance: 'UNKNOWN' as const,
      warranty: 'UNKNOWN' as const,
      history_completeness: 'UNKNOWN' as const,
      delivery: 'NOT_SENT' as const,
      authority: 'SAFE_STAFF_REVIEW_ONLY' as const,
    });
    check(b);
    bindings.set(view, b);
    return view;
  } catch (error) {
    hold(b);
    throw error;
  }
}
export type ServiceUpdateRead = Awaited<
  ReturnType<typeof readServiceUpdateReview>
>;
function current(view: ServiceUpdateRead) {
  const b = bindings.get(view);
  if (!b) throw Error('Exact retained service summary required');
  check(b);
  return b;
}
export function assertServiceUpdateCurrent(view: ServiceUpdateRead) {
  current(view);
}
export function filterServiceUpdateEvidence(
  view: ServiceUpdateRead,
  input: ServiceEvidenceFilter,
) {
  current(view);
  const p = prototypeFields(input, ['query', 'phase', 'association']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    !['', 'before', 'during', 'after'].includes(p.phase as string) ||
    !['', 'EXACT_RECORDED_JOB_LINK', 'UNKNOWN'].includes(
      p.association as string,
    )
  )
    throw Error('Exact bounded literal service evidence filters required');
  const q = p.query.trim().toLocaleLowerCase('en-US');
  return view.evidence.filter(
    (e) =>
      (!p.phase || e.phase === p.phase) &&
      (!p.association || e.association === p.association) &&
      [
        e.reference.report_id,
        String(e.reference.published_version),
        e.summary,
        e.visited_on,
      ].some((v) => v.toLocaleLowerCase('en-US').includes(q)),
  );
}
const reports = new WeakMap<object, ServiceUpdateRead>();
export async function inspectServiceUpdateReport(
  view: ServiceUpdateRead,
  reference: ServiceUpdateRead['evidence'][number]['reference'],
) {
  const b = current(view);
  if (!view.evidence.some((e) => e.reference === reference))
    throw Error('Exact visible report/version reference required');
  try {
    const report = await openServicePassportDocumentation(b.path!, reference);
    current(view);
    reports.set(report, view);
    return report;
  } catch (error) {
    hold(b);
    throw error;
  }
}
export function serviceUpdateOriginalProps(view: ServiceUpdateRead) {
  const b = current(view);
  return { sources: b.sources, selectedJobId: view.job_id };
}
class Withdrawn extends Error {}
function callback(
  expected: ServiceUpdateContinue,
  live: ServiceUpdateLiveCallback,
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
    throw new Withdrawn('Service continuation callback withdrawn or replaced');
  return p.generation;
}
/** Local presentation navigation only, with canonical repository/job outcome holds. */
export async function continueServiceUpdateReview(
  view: ServiceUpdateRead,
  report: ServicePassportReport,
  expected: ServiceUpdateContinue,
  live: ServiceUpdateLiveCallback,
) {
  const b = current(view),
    generation = callback(expected, live);
  if (reports.get(report) !== view)
    throw Error('Inspect exact summary report before continuation');
  if (b.pending) throw Error('Service continuation already pending');
  let claims = pendingClaims.get(b.operations);
  if (!claims) pendingClaims.set(b.operations, (claims = new Map()));
  if (claims.has(b.key))
    throw Error('Service continuation already pending for the canonical job');
  const claim = {};
  claims.set(b.key, claim); // Before the first await, across retained wrappers.
  b.pending = true;
  let invoked = false;
  try {
    await openServicePassportDocumentation(b.path!, report.reference);
    current(view);
    if (callback(expected, live) !== generation)
      throw new Withdrawn(
        'Service continuation callback withdrawn or replaced',
      );
    invoked = true;
    await expected(view.job_id, 'maintenance');
    current(view);
    if (callback(expected, live) !== generation)
      throw new Withdrawn(
        'Service continuation callback changed after dispatch',
      );
    return view.job_id;
  } catch (error) {
    if (invoked || !(error instanceof Withdrawn)) hold(b);
    throw error;
  } finally {
    if (claims.get(b.key) === claim) claims.delete(b.key);
    b.pending = false;
  }
}
