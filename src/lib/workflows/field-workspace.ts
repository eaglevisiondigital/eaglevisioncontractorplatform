import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import type { OperatingJobSection } from './operating-navigation';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readDailyFieldGuide,
  assertDailyFieldGuideNow,
  reconcileDailyFieldGuide,
  inspectDailyFieldReport,
  dailyFieldReportReference,
  type DailyFieldSelection,
  type DailyFieldGuideView,
} from './daily-field-guide';

function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit local field workspace source review required');
}
interface Binding {
  original: DailyFieldGuideView;
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  unknown: boolean;
  navigationOutcomes: Map<string, 'PENDING' | 'UNKNOWN'>;
  navigationKey: string;
}
// Reader references only. Original task controls remain the sole attempt owners.
const retained = new WeakMap<object, Binding>();
// Ambiguous local navigation follows the canonical Operations handle and exact org/job,
// not a replaceable wrapper, view, selected worker or source revision. No business rows.
const navigationOutcomes = new WeakMap<
  OperatingSources['operations'],
  Map<string, 'PENDING' | 'UNKNOWN'>
>();
function check(b: Binding, evidenceOnly = false) {
  try {
    admit(b.gate);
    b.capture.check();
    assertDailyFieldGuideNow(b.original);
    if (
      b.unknown ||
      (!evidenceOnly && b.navigationOutcomes.get(b.navigationKey) === 'UNKNOWN')
    )
      throw Error('Field workspace source UNKNOWN');
  } catch (error) {
    b.unknown = true;
    throw error;
  }
}
/** Compose retained source breadcrumbs and truthful browser-readiness gaps, never a task store. */
export async function readFieldWorkspace(
  sources: OperatingSources,
  input: DailyFieldSelection,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // OFF before source/input access.
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
    selection = prototypeFields(input, ['job_id', 'worker_id']);
  if (typeof selection.job_id !== 'string' || !selection.job_id)
    throw Error('Exact field job required');
  const outcomes =
    navigationOutcomes.get(operations) ??
    new Map<string, 'PENDING' | 'UNKNOWN'>();
  navigationOutcomes.set(operations, outcomes);
  const navigationKey = JSON.stringify([
      capture.organization_id,
      selection.job_id,
    ]),
    original = await readDailyFieldGuide(sources, input, gate),
    b: Binding = {
      original,
      capture,
      gate,
      unknown: false,
      navigationOutcomes: outcomes,
      navigationKey,
    };
  check(b, true); // Fresh source reads never clear or authorize an UNKNOWN navigation.
  const body = {
    mode: 'LOCAL_RETAINED_FIELD_WORKSPACE' as const,
    source: original.source,
    day: original.day,
    timezone: original.timezone,
    job: original.job,
    selected_worker_id: original.selected_worker_id,
    crew: original.crew,
    scope: original.scope,
    visits: original.visits,
    reports: original.published_reports,
    breadcrumbs: [
      {
        kind: 'company' as const,
        id: original.source.organization_id,
        label: sources.company.name,
      },
      {
        kind: 'customer' as const,
        id: original.source.customer_id,
        label: original.job.customer_label,
      },
      {
        kind: 'property' as const,
        id: original.source.location_id,
        label: original.job.property_label,
      },
      {
        kind: 'job' as const,
        id: original.source.job_id,
        label: original.job.title,
      },
      {
        kind: 'issued_scope' as const,
        id: original.source.issued_version_id,
        label: 'Issued version ' + original.source.issued_version_number,
      },
    ],
    requirements: [
      {
        key: 'browser_context',
        status: 'SAME_TAB_REFERENCE_ONLY' as const,
        detail:
          'This workspace retains original source and control references while mounted; refresh or process loss is not durable recovery.',
      },
      {
        key: 'operational_custody',
        status: 'NOT_CONNECTED' as const,
        detail:
          'Existing disposable custody tests do not connect this browser to an operational command journal or prove independent recovery.',
      },
      {
        key: 'physical_recovery',
        status: 'UNVERIFIED' as const,
        detail:
          'The independent physical recovery acceptance gate is not established by these local records.',
      },
      {
        key: 'authentication',
        status: 'UNVERIFIED' as const,
        detail:
          'Synthetic membership checks are not genuine hosted authentication, MFA or operational staff acceptance.',
      },
      {
        key: 'availability',
        status: 'UNKNOWN' as const,
        detail:
          'Recorded crew, date-only visits and human schedule proposals do not establish actual working availability.',
      },
      {
        key: 'dispatch',
        status: 'BLOCKED' as const,
        detail:
          'No live dispatch, assignment, time recording or verified completion authority is enabled.',
      },
    ],
    history_coverage: 'AVAILABLE_EXACT_JOB_RECORDS_ONLY' as const,
    physical_completion: 'UNVERIFIED' as const,
    operational_ready: false as const,
    authority: original.authority,
    original_source_sha256: original.integrity.sha256,
  };
  const sha256 = await documentHash(body);
  check(b, true);
  if (
    (await reconcileDailyFieldGuide(original)).status !== 'CURRENT_REVIEW_ONLY'
  )
    throw Error('Original field source UNKNOWN');
  check(b, true);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(view, b);
  return view;
}
export type FieldWorkspaceView = Awaited<ReturnType<typeof readFieldWorkspace>>;
export type FieldWorkspaceSection = 'controls' | 'sources' | 'readiness';
export function assertFieldWorkspaceNow(view: FieldWorkspaceView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained field workspace required');
  check(b);
}
export async function reconcileFieldWorkspace(view: FieldWorkspaceView) {
  const b = retained.get(view),
    result = {
      status: 'UNKNOWN' as 'UNKNOWN' | 'CURRENT_REVIEW_ONLY',
      replay: 'FORBIDDEN' as const,
      replacement: null,
      dispatch: false as const,
    };
  if (!b) return result;
  try {
    check(b);
    if (
      (await reconcileDailyFieldGuide(b.original)).status !==
      'CURRENT_REVIEW_ONLY'
    )
      throw Error('Original field source changed');
    check(b);
    return { ...result, status: 'CURRENT_REVIEW_ONLY' as const };
  } catch {
    b.unknown = true;
    return result;
  }
}
async function verified(view: FieldWorkspaceView) {
  if ((await reconcileFieldWorkspace(view)).status !== 'CURRENT_REVIEW_ONLY')
    throw Error('Field workspace UNKNOWN; exact read only');
  assertFieldWorkspaceNow(view);
  return retained.get(view)!;
}
export async function openFieldWorkspaceSection(
  view: FieldWorkspaceView,
  section: FieldWorkspaceSection,
) {
  await verified(view);
  if (!['controls', 'sources', 'readiness'].includes(section))
    throw Error('Exact displayed field destination required');
  assertFieldWorkspaceNow(view);
  return { view, section };
}
/** Preserve original two-field report admission even though the displayed row carries source context. */
export async function openFieldWorkspaceReport(
  view: FieldWorkspaceView,
  reportId: string,
  publishedVersion: number,
) {
  const b = await verified(view),
    matches = view.reports.filter(
      (r) =>
        r.report_id === reportId && r.published_version === publishedVersion,
    );
  if (matches.length !== 1)
    throw Error('Exact displayed field report/version required');
  const report = await inspectDailyFieldReport(
    b.original,
    dailyFieldReportReference(matches[0]),
  );
  assertFieldWorkspaceNow(view);
  return report;
}
export async function navigateFieldWorkspace(
  view: FieldWorkspaceView,
  callback: (jobId: string, section?: OperatingJobSection) => void,
) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained field workspace required');
  check(b);
  if (b.navigationOutcomes.get(b.navigationKey) === 'PENDING')
    throw Error('Exact field navigation already pending');
  b.navigationOutcomes.set(b.navigationKey, 'PENDING');
  try {
    await verified(view);
    assertFieldWorkspaceNow(view);
    const acknowledgment: unknown = callback(view.source.job_id, 'field');
    if (acknowledgment !== undefined)
      throw Error(
        'Exact synchronous void field navigation acknowledgment required',
      );
    assertFieldWorkspaceNow(view);
  } catch (error) {
    b.unknown = true;
    b.navigationOutcomes.set(b.navigationKey, 'UNKNOWN');
    throw error;
  } finally {
    if (b.navigationOutcomes.get(b.navigationKey) === 'PENDING')
      b.navigationOutcomes.delete(b.navigationKey);
  }
}
