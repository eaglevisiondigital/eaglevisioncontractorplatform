import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { DailyWorkbenchStep } from './daily-workbench-contract';
import type { FollowUpReadinessInput } from './follow-up-readiness';
import type { RetentionReviewFilter } from './retention-review-guide';
import {
  readRetainedMaintenanceDesk,
  assertRetainedMaintenanceDeskNow,
  filterRetainedMaintenanceDesk,
  reconcileRetainedMaintenanceDesk,
  selectRetainedMaintenanceCase,
  assertRetainedMaintenanceCaseNow,
  type RetainedMaintenanceDeskView,
} from './retained-maintenance-desk';

function admit(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit local maintenance agenda review required');
}
interface Binding {
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  original: RetainedMaintenanceDeskView;
  holds: Map<string, 'PENDING' | 'UNKNOWN'>;
  unknown: boolean;
}
const retained = new WeakMap<object, Binding>();
// Same-tab navigation outcome metadata only; not a maintenance, consent or customer store.
const holds = new WeakMap<
  OperatingSources['operations'],
  Map<string, 'PENDING' | 'UNKNOWN'>
>();
const jobKey = (org: string, job: string) => JSON.stringify([org, job]);
function check(b: Binding) {
  try {
    admit(b.gate);
    b.capture.check();
    assertRetainedMaintenanceDeskNow(b.original);
    if (b.unknown) throw Error('Maintenance agenda UNKNOWN');
  } catch (error) {
    b.unknown = true;
    throw error;
  }
}
/** Original recurring/consent readers own every occurrence, date and planning eligibility fact. */
export async function readMaintenanceAgenda(
  sources: OperatingSources,
  input: FollowUpReadinessInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // OFF before source/input getters.
  const root = prototypeFields(sources, [
      'company',
      'operations',
      'estimates',
      'property',
      'entries',
      'gate',
    ]),
    capture = captureOperatingSources(sources, gate),
    operations = root.operations as OperatingSources['operations'],
    outcomes =
      holds.get(operations) ?? new Map<string, 'PENDING' | 'UNKNOWN'>();
  holds.set(operations, outcomes); // Pin before await; mutable wrappers cannot rebind an uncertain outcome.
  const original = await readRetainedMaintenanceDesk(sources, input, gate),
    b: Binding = { capture, gate, original, holds: outcomes, unknown: false };
  check(b);
  const body = {
    mode: 'LOCAL_MAINTENANCE_AGENDA' as const,
    organization_id: original.organization_id,
    selected_job_id: original.selected_job_id,
    requested_purpose: original.requested_purpose,
    window: original.window,
    rows: original.rows,
    available_occurrences: original.available_occurrences,
    captured_occurrences: original.rows.length,
    source_sha256: original.integrity.sha256,
    blockers: {
      current_channel_authority: 'UNKNOWN' as const,
      purpose_consent: 'UNVERIFIED' as const,
      suppression: 'UNVERIFIED' as const,
      enrollment: 'UNVERIFIED' as const,
      renewal_terms: 'UNKNOWN' as const,
      send: 'BLOCKED' as const,
    },
    renewal_review: 'REQUIREMENTS_ONLY_NO_VERIFIED_AGREEMENT' as const,
    coverage: original.coverage,
    count_is_complete: false as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    authority: original.authority,
    recipient: null,
    provider_request: null,
    custody: 'SAME_TAB_REFERENCE_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  check(b);
  if (
    (await reconcileRetainedMaintenanceDesk(original)).status !==
    'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Original maintenance source UNKNOWN');
  check(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(view, b);
  return view;
}
export type MaintenanceAgendaView = Awaited<
  ReturnType<typeof readMaintenanceAgenda>
>;
export interface MaintenanceAgendaFilter extends RetentionReviewFilter {
  job_id: string;
  scope: 'all' | 'planning_eligible' | 'needs_review';
}
export function assertMaintenanceAgendaNow(view: MaintenanceAgendaView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained maintenance agenda required');
  check(b);
}
export function filterMaintenanceAgenda(
  view: MaintenanceAgendaView,
  input: MaintenanceAgendaFilter,
) {
  assertMaintenanceAgendaNow(view);
  const f = prototypeFields(input, [
    'query',
    'kind',
    'channel_state',
    'from',
    'through',
    'job_id',
    'scope',
  ]);
  if (
    Object.keys(f).length !== 7 ||
    typeof f.job_id !== 'string' ||
    !['all', 'planning_eligible', 'needs_review'].includes(f.scope as string)
  )
    throw Error('Exact maintenance agenda scope required');
  const b = retained.get(view)!;
  if (f.job_id && !b.capture.entries.some((e) => e.target.job_id === f.job_id))
    throw Error('Exact authorized maintenance job required');
  if (view.selected_job_id && f.job_id && f.job_id !== view.selected_job_id)
    throw Error('Selected source job cannot be substituted');
  const base = filterRetainedMaintenanceDesk(b.original, {
      query: f.query,
      kind: f.kind,
      channel_state: f.channel_state,
      from: f.from,
      through: f.through,
    } as RetentionReviewFilter),
    rows = base.rows.filter(
      (row) =>
        (!f.job_id || row.context.job_id === f.job_id) &&
        (f.scope === 'all' ||
          (f.scope === 'planning_eligible'
            ? row.staff_planning_eligible
            : !row.staff_planning_eligible)),
    );
  assertMaintenanceAgendaNow(view);
  return freezePrototype({
    rows,
    matching: rows.length,
    captured: view.captured_occurrences,
    available: view.available_occurrences,
    count_is_complete: false as const,
    send: false as const,
    renewal_terms: 'UNKNOWN' as const,
  });
}
export async function reconcileMaintenanceAgenda(view: MaintenanceAgendaView) {
  const b = retained.get(view),
    result = {
      status: 'UNKNOWN' as 'UNKNOWN' | 'CAPTURED_NOT_ATOMIC',
      send: false as const,
      replay: 'FORBIDDEN' as const,
      replacement: null,
    };
  if (!b) return result;
  try {
    check(b);
    if (
      (await reconcileRetainedMaintenanceDesk(b.original)).status !==
      'CAPTURED_NOT_ATOMIC'
    )
      throw Error('Original maintenance evidence changed');
    check(b);
    if (
      view.rows.some(
        (r) =>
          b.holds.get(jobKey(view.organization_id, r.context.job_id)) ===
          'UNKNOWN',
      )
    )
      return result;
    return { ...result, status: 'CAPTURED_NOT_ATOMIC' as const };
  } catch {
    b.unknown = true;
    return result;
  }
}
export async function inspectMaintenanceAgendaOccurrence(
  view: MaintenanceAgendaView,
  occurrenceKey: string,
) {
  const b = retained.get(view);
  if (!b || !view.rows.some((row) => row.key === occurrenceKey))
    throw Error('Exact displayed maintenance occurrence required');
  check(b);
  const result = await selectRetainedMaintenanceCase(b.original, occurrenceKey);
  check(b);
  assertRetainedMaintenanceCaseNow(result);
  return result;
}
export async function continueMaintenanceAgenda(
  view: MaintenanceAgendaView,
  occurrenceKey: string,
  callback: (jobId: string, step: DailyWorkbenchStep) => void | Promise<void>,
  stillCurrent: () => boolean = () => true,
) {
  const b = retained.get(view),
    row = b && view.rows.find((r) => r.key === occurrenceKey);
  if (
    !b ||
    !row ||
    typeof callback !== 'function' ||
    typeof stillCurrent !== 'function'
  )
    throw Error('Exact displayed maintenance continuation required');
  check(b);
  const key = jobKey(view.organization_id, row.context.job_id);
  if (b.holds.has(key))
    throw Error('Maintenance continuation pending or UNKNOWN; exact read only');
  b.holds.set(key, 'PENDING');
  let invoked = false;
  try {
    await inspectMaintenanceAgendaOccurrence(view, occurrenceKey);
    check(b);
    if (!stillCurrent())
      return { status: 'WITHDRAWN' as const, send: false as const };
    invoked = true;
    await callback(row.context.job_id, 'priorities');
    check(b);
    return { status: 'LOCAL_NAVIGATION_ONLY' as const, send: false as const };
  } catch (error) {
    if (invoked || b.unknown) {
      b.unknown = true;
      b.holds.set(key, 'UNKNOWN');
    }
    throw error;
  } finally {
    if (b.holds.get(key) === 'PENDING') b.holds.delete(key);
  }
}
