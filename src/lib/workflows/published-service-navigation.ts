import type {
  PassportFindingReference,
  PassportReportReference,
} from '../../domain/property/passport';
import { readPropertyPassportEvidence } from '../../domain/property/passport';
import type { PropertyReportPage } from '../../domain/property/report-page';
import { prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { DailyWorkbenchProps } from './daily-workbench-contract';
import { readCompletionReview } from './completion-review';
import {
  serviceRevisionReviewEnabled,
  readServiceRevisionReview,
  readServiceRevisionUpdates,
  assertServiceRevisionAccess,
  inspectServiceRevisionReport,
  type ServiceRevisionRead,
} from './service-revision-review';
export const publishedServiceNavigationEnabled = serviceRevisionReviewEnabled;
/** The original C19 safe evidence object, not another history snapshot or store. */
export type PublishedServiceHistory = ServiceRevisionRead['evidence'];
export type PublishedServiceReport = PublishedServiceHistory['reports'][number];
export interface PublishedServiceFilters {
  query: string;
  phase: string;
  severity: string;
}
export type PublishedServiceContinue = NonNullable<
  DailyWorkbenchProps['onContinue']
>;
export interface PublishedServiceCallback {
  current: PublishedServiceContinue | undefined;
  generation: number;
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  entry: OperatingSources['entries'][number];
  operations: OperatingSources['operations'];
  read?: ServiceRevisionRead;
  capture: ReturnType<typeof captureOperatingSources>;
  key: string;
  inspected: Set<PublishedServiceReport>;
}
const bindings = new WeakMap<object, Binding>(),
  holds = new WeakMap<object, Set<string>>(),
  pending = new WeakMap<object, Map<string, object>>();
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !publishedServiceNavigationEnabled(true)
  )
    throw Error(
      'Published service navigation is OFF without explicit DEV HTTP loopback admission',
    );
}
function hold(b: Binding) {
  let keys = holds.get(b.operations);
  if (!keys) holds.set(b.operations, (keys = new Set()));
  keys.add(b.key);
}
function check(b: Binding) {
  if (holds.get(b.operations)?.has(b.key))
    throw Error('UNKNOWN published source navigation; no fresh-view replay');
  try {
    admit(b.gate);
    if (b.read) assertServiceRevisionAccess(b.read);
    else b.capture.check();
  } catch (error) {
    hold(b);
    throw error;
  }
}
function binding(view: PublishedServiceHistory) {
  const b = bindings.get(view);
  if (!b) throw Error('Original published history evidence required');
  check(b);
  return b;
}
/** Admission precedes selectors/getters; the unchanged C19 reader proves ownership. */
export async function readPublishedServiceHistory(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<PublishedServiceHistory> {
  admit(gate);
  if (typeof jobId !== 'string' || !jobId || jobId.length > 200)
    throw Error('Exact retained job required');
  const capture = captureOperatingSources(sources, gate),
    matches = capture.entries.filter((e) => e.target.job_id === jobId);
  if (matches.length !== 1)
    throw Error('Unique exact job required; no fallback');
  const b: Binding = {
    sources,
    gate,
    entry: matches[0],
    operations: matches[0].operations,
    capture,
    key: JSON.stringify([capture.organization_id, jobId]),
    inspected: new Set(),
  };
  check(b);
  try {
    b.read = await readServiceRevisionReview(sources, jobId, gate);
    capture.check();
    check(b);
    bindings.set(b.read.evidence, b);
    return b.read.evidence;
  } catch (error) {
    hold(b);
    throw error;
  }
}
export function assertPublishedServiceHistory(view: PublishedServiceHistory) {
  binding(view);
}
export function publishedServiceContext(view: PublishedServiceHistory) {
  const { identity: i } = binding(view).read!;
  return {
    organization_id: i.organization_id,
    customer_id: i.customer_id,
    location_id: i.location_id,
    job_id: i.job_id,
    estimate_id: i.estimate_id,
    issued_version_id: i.version_id,
  };
}
/** Known mutable plan/draft/task edits do not replace published report contents. */
export async function refreshPublishedServiceHistory(
  view: PublishedServiceHistory,
) {
  const b = binding(view);
  try {
    const next = await readServiceRevisionUpdates(b.read!);
    check(b);
    const fresh: Binding = { ...b, read: next, inspected: new Set() };
    check(fresh);
    bindings.set(next.evidence, fresh);
    return next.evidence;
  } catch (error) {
    hold(b);
    throw error;
  }
}
export function filterPublishedServiceHistory(
  view: PublishedServiceHistory,
  input: PublishedServiceFilters,
) {
  binding(view);
  const p = prototypeFields(input, ['query', 'phase', 'severity']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    !['', 'before', 'during', 'after'].includes(p.phase as string) ||
    !['', 'low', 'moderate', 'urgent'].includes(p.severity as string)
  )
    throw Error('Bounded literal published-history filters required');
  const q = p.query.trim().toLocaleLowerCase('en-US');
  const rows = view.reports.filter((r) => {
    if (p.phase && r.report.phase !== p.phase) return false;
    const reportMatch = [
      r.reference.report_id,
      String(r.reference.published_version),
      r.report.visited_on,
      r.report.summary,
    ].some((v) => v.toLocaleLowerCase('en-US').includes(q));
    return p.severity
      ? r.report.observations.some(
          (o) =>
            o.severity === p.severity &&
            (reportMatch ||
              [o.category, o.location, o.observation, o.recommendation].some(
                (v) => v.toLocaleLowerCase('en-US').includes(q),
              )),
        )
      : reportMatch ||
          r.report.observations.some((o) =>
            [o.category, o.location, o.observation, o.recommendation].some(
              (v) => v.toLocaleLowerCase('en-US').includes(q),
            ),
          );
  });
  binding(view);
  return rows;
}
export function inspectPublishedServiceReport(
  view: PublishedServiceHistory,
  reference: PassportReportReference,
) {
  const b = binding(view),
    report = inspectServiceRevisionReport(b.read!, reference);
  b.inspected.add(report);
  return report;
}
export function inspectPublishedServiceFinding(
  view: PublishedServiceHistory,
  reference: PassportFindingReference,
) {
  const b = binding(view),
    original = view.reports
      .flatMap((r) => r.report.observations)
      .find((o) => o.reference === reference);
  if (!original) throw Error('Exact original finding reference required');
  const actual = readPropertyPassportEvidence(
    b.entry.customerModel,
    reference,
    { enabled: true },
  );
  check(b);
  if (
    actual.status !== 'AVAILABLE' ||
    JSON.stringify(actual.evidence) !== JSON.stringify(original)
  ) {
    hold(b);
    throw Error('Exact published finding unavailable');
  }
  return original;
}
/** Adapt only the original safe report DTO to the unchanged approved report renderer. */
export function publishedServiceReportPage(
  view: PublishedServiceHistory,
  reference: PassportReportReference,
): PropertyReportPage['reports'] {
  const r = inspectPublishedServiceReport(view, reference),
    s = r.report;
  return [
    {
      id: reference.report_id,
      version: reference.published_version,
      published_at: s.published_at,
      snapshot: {
        visited_on: s.visited_on,
        phase: s.phase,
        summary: s.summary,
        media: [],
        checklist: s.checklist.map((c) => ({
          label: c.label,
          completed: c.recorded_completed,
        })),
        findings: s.observations.map((o) => ({
          id: o.reference.finding_id,
          category: o.category,
          location: o.location,
          severity: o.severity,
          description: o.observation,
          recommendation: o.recommendation,
        })),
      },
    },
  ];
}
/** Original read-only completion review only; never preparation, publication or approval. */
export async function readPublishedServiceRequirements(
  view: PublishedServiceHistory,
  reference: PassportReportReference,
) {
  const b = binding(view);
  inspectPublishedServiceReport(view, reference);
  try {
    const review = await readCompletionReview(
      b.entry,
      {
        report_id: reference.report_id,
        published_version: reference.published_version,
      },
      b.gate,
    );
    check(b);
    if (
      review.report.reference.report_id !== reference.report_id ||
      review.report.reference.published_version !==
        reference.published_version ||
      review.job.reference.job_id !== b.read!.identity.job_id
    )
      throw Error('Exact completion-review source required');
    return review;
  } catch (error) {
    hold(b);
    throw error;
  }
}
class Withdrawn extends Error {}
function callback(
  expected: PublishedServiceContinue,
  live: PublishedServiceCallback,
) {
  const p = prototypeFields(live, ['current', 'generation']);
  if (
    Object.keys(p).length !== 2 ||
    typeof expected !== 'function' ||
    p.current !== expected ||
    !Number.isSafeInteger(p.generation) ||
    Number(p.generation) < 0
  )
    throw new Withdrawn('Published-history callback withdrawn');
  return p.generation;
}
/** Source-checked local host navigation, retaining canonical pending/UNKNOWN ownership. */
export async function continuePublishedServiceReview(
  view: PublishedServiceHistory,
  report: PublishedServiceReport,
  expected: PublishedServiceContinue,
  live: PublishedServiceCallback,
) {
  const b = binding(view),
    generation = callback(expected, live);
  if (!b.inspected.has(report) || !view.reports.includes(report))
    throw Error('Inspect the exact report before local continuation');
  let claims = pending.get(b.operations);
  if (!claims) pending.set(b.operations, (claims = new Map()));
  if (claims.has(b.key))
    throw Error('Canonical published-service continuation already pending');
  const claim = {};
  claims.set(b.key, claim);
  let invoked = false;
  try {
    await Promise.resolve();
    check(b);
    if (callback(expected, live) !== generation)
      throw new Withdrawn('Callback changed before dispatch');
    invoked = true;
    await expected(b.read!.identity.job_id, 'maintenance');
    check(b);
    if (callback(expected, live) !== generation)
      throw new Withdrawn('Callback changed after dispatch');
    return {
      status: 'LOCAL_REVIEW_NAVIGATION_ONLY' as const,
      job_id: b.read!.identity.job_id,
    };
  } catch (error) {
    if (invoked || !(error instanceof Withdrawn)) hold(b);
    throw error;
  } finally {
    if (claims.get(b.key) === claim) claims.delete(b.key);
  }
}
