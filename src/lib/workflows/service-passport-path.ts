import { prototypeFields, freezePrototype } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { OperatingJobSection } from './operating-navigation';
import type {
  PassportReportReference,
  PassportFindingReference,
} from '../../domain/property/passport';
import {
  serviceCompletionGuideEnabled,
  readServiceCompletionGuide,
  assertServiceCompletionGuideCurrent,
  selectServiceCompletionContext,
  filterServiceCompletionRequests,
  openServiceCompletionContext,
  assertServiceCompletionContextCurrent,
  openServiceCompletionFinding,
  returnServiceCompletionSelection,
  selectServiceCompletionJob,
  type ServiceCompletionGuideView,
  type ServiceCompletionContext,
} from './service-completion-guide';
import {
  openServiceReviewReport,
  type ServiceReviewContext,
} from './service-review-path';
export {
  serviceCompletionGuideEnabled as servicePassportPathEnabled,
  filterServiceCompletionRequests as filterServicePassportPaths,
};
export type { ServiceCompletionFilters as ServicePassportFilters } from './service-completion-guide';
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !serviceCompletionGuideEnabled(true)
  )
    throw Error(
      'Service Passport path is OFF without explicit development HTTP loopback admission',
    );
}
interface Binding {
  gate: JourneyAdmission;
  capture: ReturnType<typeof captureOperatingSources>;
}
const selections = new WeakMap<object, Binding>();
export async function readServicePassportPath(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const capture = captureOperatingSources(sources, gate),
    view = await readServiceCompletionGuide(sources, gate);
  admit(gate);
  capture.check();
  assertServiceCompletionGuideCurrent(view);
  selections.set(view, { gate, capture });
  return view;
}
export type ServicePassportSelection = ServiceCompletionGuideView;
function selection(view: ServicePassportSelection) {
  const b = selections.get(view);
  if (!b) throw Error('Exact retained service Passport selection required');
  admit(b.gate);
  b.capture.check();
  assertServiceCompletionGuideCurrent(view);
  return b;
}
export function assertServicePassportSelectionCurrent(
  view: ServicePassportSelection,
) {
  selection(view);
}
export function selectServicePassportContext(
  view: ServicePassportSelection,
  jobId?: string,
) {
  selection(view);
  return selectServiceCompletionContext(view, jobId);
}
interface PathBinding {
  parent: Binding;
  view: ServicePassportSelection;
  controls: Readonly<{ sources: Binding['capture']['entries'][number] }>;
  navigationPending: boolean;
}
const paths = new WeakMap<object, PathBinding>();
export async function openServicePassportContext(
  view: ServicePassportSelection,
  input: ServiceReviewContext,
) {
  const parent = selection(view),
    path = await openServiceCompletionContext(view, input);
  selection(view);
  assertServiceCompletionContextCurrent(path);
  const entry = parent.capture.entries.find(
    (e) => e.target.job_id === path.context.job_id,
  );
  if (!entry) throw Error('Original exact job handle required');
  paths.set(path, {
    parent,
    view,
    controls: Object.freeze({ sources: entry }),
    navigationPending: false,
  });
  return path;
}
export type ServicePassportContext = ServiceCompletionContext;
function current(path: ServicePassportContext) {
  const b = paths.get(path);
  if (!b) throw Error('Exact retained service Passport context required');
  selection(b.view);
  assertServiceCompletionContextCurrent(path);
  return b;
}
export function assertServicePassportContextCurrent(
  path: ServicePassportContext,
) {
  current(path);
}
const reports = new WeakMap<object, ServicePassportContext>();
export async function openServicePassportDocumentation(
  path: ServicePassportContext,
  reference: PassportReportReference,
) {
  current(path);
  const report = await openServiceReviewReport(path, reference);
  current(path);
  reports.set(report, path);
  return report;
}
export type ServicePassportReport = Awaited<
  ReturnType<typeof openServicePassportDocumentation>
>;
function reportCurrent(
  path: ServicePassportContext,
  report: ServicePassportReport,
) {
  current(path);
  if (reports.get(report) !== path)
    throw Error('Exact inspected report/context required');
}
const findings = new WeakMap<object, ServicePassportContext>();
export async function openServicePassportFinding(
  path: ServicePassportContext,
  reference: PassportFindingReference,
) {
  current(path);
  const finding = await openServiceCompletionFinding(path, reference);
  current(path);
  findings.set(finding, path);
  return finding;
}
export type ServicePassportFinding = Awaited<
  ReturnType<typeof openServicePassportFinding>
>;
/** Presentation breadcrumbs only, derived from exact retained objects; no new history/relationship store. */
export function servicePassportBreadcrumbs(
  path: ServicePassportContext,
  report?: ServicePassportReport,
  finding?: ServicePassportFinding,
) {
  current(path);
  if (report) reportCurrent(path, report);
  if (finding && findings.get(finding) !== path)
    throw Error('Exact inspected finding/context required');
  if (
    finding &&
    (!report ||
      finding.report_reference.report_id !== report.reference.report_id ||
      finding.report_reference.published_version !==
        report.reference.published_version)
  )
    throw Error('Finding must belong to the retained exact report/version');
  return freezePrototype([
    {
      kind: 'request' as const,
      label: `Request ${path.request.id}`,
      id: path.request.id,
    },
    {
      kind: 'property' as const,
      label: `Property ${path.customer_safe.property.label}`,
      id: path.customer_safe.property.location_id,
    },
    {
      kind: 'job' as const,
      label: `Job ${path.customer_safe.scope.name}`,
      id: path.context.job_id,
    },
    ...(report
      ? [
          {
            kind: 'report' as const,
            label: `Report ${report.reference.report_id} version ${report.reference.published_version}`,
            id: report.reference.report_id,
          },
        ]
      : []),
    ...(finding
      ? [
          {
            kind: 'finding' as const,
            label: `Finding ${finding.finding.reference.finding_id}`,
            id: finding.finding.reference.finding_id,
          },
        ]
      : []),
    {
      kind: 'passport' as const,
      label: 'Safe Passport',
      id: path.customer_safe.property.location_id,
    },
  ]);
}
/** Direct unchanged original control, only for its actual recorded job/report/version. Never clone/rebind its sources. */
export function openServicePassportOriginalReview(
  path: ServicePassportContext,
  report: ServicePassportReport,
) {
  reportCurrent(path, report);
  const b = current(path),
    entry = b.controls.sources,
    doc = path.customer_safe.documentation.find(
      (d) =>
        d.report.reference.report_id === report.reference.report_id &&
        d.report.reference.published_version ===
          report.reference.published_version,
    );
  if (
    !doc ||
    doc.selected_job_association !== 'EXACT_RECORDED_JOB_LINK' ||
    report.reference.report_id !== entry.report_id ||
    report.reference.published_version !== entry.published_version ||
    report.reference.location_id !== entry.target.location_id ||
    report.reference.customer_id !== entry.target.customer_id
  )
    throw Error(
      'Original completion control unavailable for property-only or different report evidence; association UNKNOWN',
    );
  return b.controls;
}
export function returnServicePassportSelection(path: ServicePassportContext) {
  current(path);
  return returnServiceCompletionSelection(path);
}
export type ServicePassportCallback = (
  jobId: string,
  section?: OperatingJobSection,
) => void;
export interface ServicePassportLiveCallback {
  current: ServicePassportCallback | undefined;
  generation: number;
}
function callback(
  expected: ServicePassportCallback,
  live: ServicePassportLiveCallback,
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
    throw Error('Service navigation callback withdrawn or replaced');
  return p.generation;
}
/** Read-only navigation; one in-flight callback per exact retained context, never a business reservation. */
export async function navigateServicePassportJob(
  path: ServicePassportContext,
  report: ServicePassportReport,
  expected: ServicePassportCallback,
  live: ServicePassportLiveCallback,
) {
  reportCurrent(path, report);
  const b = current(path),
    generation = callback(expected, live);
  if (b.navigationPending)
    throw Error('Service job navigation already pending');
  b.navigationPending = true;
  try {
    const exact = await openServiceReviewReport(path, report.reference);
    current(path);
    reportCurrent(path, report);
    if (
      exact.reference.report_id !== report.reference.report_id ||
      exact.reference.published_version !== report.reference.published_version
    )
      throw Error('Exact report changed');
    const job = selectServiceCompletionJob(path);
    if (callback(expected, live) !== generation)
      throw Error(
        'Service navigation callback withdrawn or replaced during inspection',
      );
    expected(job, 'completion');
    return job;
  } finally {
    b.navigationPending = false;
  }
}
