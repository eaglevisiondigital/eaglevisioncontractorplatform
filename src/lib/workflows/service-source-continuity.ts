import { documentHash } from '../../domain/release/preview';
import type {
  PassportReportReference,
  PassportFindingReference,
} from '../../domain/property/passport';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readServicePassportDesk,
  openServicePassportJob,
  openServicePassportReport,
  openServicePassportFinding,
  assertServicePassportCurrentNow,
  assertServicePassportDetailCurrentNow,
  selectServicePassportJob,
  type ServicePassportView,
  type ServicePassportDetail,
} from './service-passport-desk';
export interface ServiceSourceInput {
  job_id: string;
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error(
      'Service source continuity is OFF without explicit local admission',
    );
}
function pin(input: ServiceSourceInput) {
  const p = prototypeFields(input, ['job_id']);
  if (
    Object.keys(p).length !== 1 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200
  )
    throw Error('Exact bounded original job identity required');
  return p.job_id;
}
interface Binding {
  input: ServiceSourceInput;
  job: string;
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  view: ServicePassportView;
  detail: ServicePassportDetail;
  held: boolean;
}
const reads = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held)
    throw Error('UNKNOWN exact service source is read only; no replacement');
  try {
    admit(b.gate);
    if (pin(b.input) !== b.job) throw Error('Original job selection changed');
    b.capture.check();
    assertServicePassportCurrentNow(b.view);
    assertServicePassportDetailCurrentNow(b.detail);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Direct continuity from the original job/request into the existing safe Passport readers. */
export async function readServiceSourceContinuity(
  sources: OperatingSources,
  input: ServiceSourceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const job = pin(input),
    capture = captureOperatingSources(sources, gate),
    view = await readServicePassportDesk(
      sources,
      { query: '', customer_id: '', location_id: '', job_id: job, state: '' },
      gate,
    );
  capture.check();
  if (pin(input) !== job) throw Error('Original job selection changed');
  const detail = await openServicePassportJob(view, job),
    b: Binding = { input, job, capture, gate, view, detail, held: false };
  current(b);
  const body = {
    mode: 'LOCAL_SERVICE_SOURCE_CONTINUITY' as const,
    staff_request: detail.staff.request,
    request_scope_relationship: detail.staff.request_scope_association,
    customer_label: detail.staff.customer_label,
    customer_safe: detail.customer_safe,
    coverage:
      'AVAILABLE_ORIGINAL_PUBLISHED_SOURCES_NOT_COMPLETE_HISTORY' as const,
    authority:
      'EXACT_READ_ONLY_NAVIGATION_NOT_COMPLETION_OR_ACCEPTANCE' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const read = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  reads.set(read, b);
  return read;
}
export type ServiceSourceRead = Awaited<
  ReturnType<typeof readServiceSourceContinuity>
>;
function binding(read: ServiceSourceRead) {
  const b = reads.get(read);
  if (!b) throw Error('Exact retained service continuity source required');
  current(b);
  return b;
}
export function assertServiceSourceContinuityCurrentNow(
  read: ServiceSourceRead,
) {
  binding(read);
}
export async function openServiceSourceReport(
  read: ServiceSourceRead,
  reference: PassportReportReference,
) {
  const b = binding(read);
  try {
    const report = await openServicePassportReport(b.detail, reference);
    current(b);
    return report;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export async function openServiceSourceFinding(
  read: ServiceSourceRead,
  reference: PassportFindingReference,
) {
  const b = binding(read);
  try {
    const finding = await openServicePassportFinding(b.detail, reference);
    current(b);
    return finding;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export function selectServiceSourceJob(read: ServiceSourceRead) {
  return selectServicePassportJob(binding(read).detail);
}
export function inspectServiceSourceContinuity(read: ServiceSourceRead) {
  try {
    binding(read);
    return {
      status: 'CURRENT_EXACT_READ_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    return { status: 'UNKNOWN' as const, replay: false, replacement: null };
  }
}
