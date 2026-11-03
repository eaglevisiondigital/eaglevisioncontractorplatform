import { documentHash } from '../../domain/release/preview';
import { createPropertyPassportJobHistory } from '../../domain/property/passport-job-history';
import {
  readPropertyPassportEvidence,
  type PassportReportReference,
} from '../../domain/property/passport';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission, LocalJourney } from './journey-runtime';
import { serviceCompletionGuideEnabled } from './service-completion-guide';
import {
  readSavedRevision,
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  compareSavedRevisions,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  adoptSavedRevision,
  type SavedRevisionSnapshot,
  type SavedRevisionSelection,
} from './saved-revision-runtime';
export const serviceRevisionReviewEnabled = serviceCompletionGuideEnabled;
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    p.enabled !== true ||
    p.confirmed !== true ||
    !serviceRevisionReviewEnabled(true)
  )
    throw Error(
      'Service revision review is OFF without development HTTP loopback admission',
    );
}
type History = Awaited<ReturnType<typeof createPropertyPassportJobHistory>>;
type SafeReport =
  History['snapshot']['inspections']['snapshot']['reports'][number];
interface ServiceReport {
  reference: PassportReportReference;
  visit_id: string;
  plan_id: string;
  sha256: string;
  report: SafeReport;
}
interface ServiceRevisionEvidence {
  request_id: string;
  request_job_link: 'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT';
  property_label: string;
  scope: History['snapshot']['jobs'][number]['issued_source']['scope'];
  issued_source_sha256: string;
  selected: ServiceReport;
  reports: ServiceReport[];
  physical_completion: 'UNVERIFIED';
  customer_acceptance: 'UNVERIFIED';
  warranty: 'UNVERIFIED';
  delivery: 'NOT_SENT';
  history_completeness: 'UNKNOWN';
}
export type ServiceRevisionRead =
  SavedRevisionSnapshot<ServiceRevisionEvidence>;
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  entry: LocalJourney;
  key: string;
}
const bindings = new WeakMap<object, Binding>(),
  held = new WeakMap<object, Set<string>>();
function hold(b: Binding) {
  let set = held.get(b.sources.operations);
  if (!set) held.set(b.sources.operations, (set = new Set()));
  set.add(b.key);
}
function known(b: Binding) {
  if (held.get(b.sources.operations)?.has(b.key))
    throw Error('UNKNOWN service revision source; no restored-source bypass');
}
function binding(view: ServiceRevisionRead) {
  const b = bindings.get(view);
  if (!b) throw Error('Exact retained service revision required');
  known(b);
  return b;
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
/** Check ALL previously observed published versions against their actual current
 * safe source and recorded visit/plan/job lineage, not only the issued-source pin. */
export function assertServiceRevisionAccess(view: ServiceRevisionRead) {
  const b = binding(view);
  try {
    admit(b.gate);
    assertSavedRevisionAccess(view);
    const state = b.sources.property.read(view.identity.organization_id);
    for (const saved of view.evidence.reports) {
      const raw = state.reports.filter(
        (r) => r.id === saved.reference.report_id,
      );
      const visits = state.visits.filter((v) => v.id === saved.visit_id);
      const plans = state.plans.filter((p) => p.id === saved.plan_id);
      const current = readPropertyPassportEvidence(
        b.entry.customerModel,
        saved.reference,
        { enabled: true },
      );
      if (
        raw.length !== 1 ||
        raw[0].version !== saved.reference.published_version ||
        raw[0].visit_id !== saved.visit_id ||
        raw[0].organization_id !== view.identity.organization_id ||
        raw[0].customer_id !== view.identity.customer_id ||
        raw[0].location_id !== view.identity.location_id ||
        raw[0].summary !== saved.report.summary ||
        raw[0].phase !== saved.report.phase ||
        raw[0].visited_on !== saved.report.visited_on ||
        raw[0].published_at !== saved.report.published_at ||
        !same(
          raw[0].findings,
          saved.report.observations.map((o) => ({
            id: o.reference.finding_id,
            description: o.observation,
            recommendation: o.recommendation,
            severity: o.severity,
            category: o.category,
            location: o.location,
          })),
        ) ||
        !same(
          raw[0].checklist,
          saved.report.checklist.map((c) => ({
            label: c.label,
            completed: c.recorded_completed,
          })),
        ) ||
        visits.length !== 1 ||
        visits[0].plan_id !== saved.plan_id ||
        plans.length !== 1 ||
        plans[0].job_id !== view.identity.job_id ||
        plans[0].organization_id !== view.identity.organization_id ||
        plans[0].customer_id !== view.identity.customer_id ||
        plans[0].location_id !== view.identity.location_id ||
        current.status !== 'AVAILABLE' ||
        !same(current.evidence, saved.report)
      )
        throw Error(
          'Historical published report changed, missing or ownership ambiguous',
        );
    }
    assertSavedRevisionAccess(view);
  } catch (error) {
    hold(b);
    throw error;
  }
}
export function assertServiceRevisionCurrent(view: ServiceRevisionRead) {
  assertServiceRevisionAccess(view);
  // A known saved edit may stale this mutable fence; it does not itself reset
  // an original held control or silently adopt any replacement source.
  assertSavedRevisionCurrent(view);
}
async function project(
  entry: LocalJourney,
  previous?: ServiceRevisionRead,
): Promise<ServiceRevisionEvidence> {
  const t = entry.target,
    history = await createPropertyPassportJobHistory(
      entry.customerModel,
      {
        organization_id: t.organization_id,
        customer_id: t.customer_id,
        location_id: t.location_id,
      },
      { enabled: true },
    ),
    jobs = history.snapshot.jobs.filter(
      (j) =>
        j.reference.job_id === t.job_id &&
        j.reference.issued_version_id === t.version_id,
    );
  if (jobs.length !== 1)
    throw Error('Unique exact issued job documentation required');
  const job = jobs[0],
    state = entry.property.read(t.organization_id),
    reports: ServiceReport[] = [];
  for (const link of job.documentation.reports) {
    const report = history.snapshot.inspections.snapshot.reports.find((r) =>
      same(r.reference, link.reference),
    );
    if (!report) throw Error('Exact published report unavailable');
    reports.push({
      reference: { ...link.reference },
      visit_id: link.visit_id,
      plan_id: link.plan_id,
      report,
      sha256: await documentHash({
        visit_id: link.visit_id,
        plan_id: link.plan_id,
        report,
      }),
    });
  }
  // Revisions are per visit, not per property, date or report UUID. No gaps or
  // duplicate version claims can establish an unambiguous latest sibling.
  for (const visitId of new Set(reports.map((r) => r.visit_id))) {
    const versions = reports
      .filter((r) => r.visit_id === visitId)
      .map((r) => r.reference.published_version)
      .sort((a, b) => a - b);
    if (versions.some((v, i) => v !== i + 1))
      throw Error('Published sibling versions missing or ambiguous');
  }
  const anchor = previous?.evidence.selected;
  const candidates = reports.filter((r) =>
    anchor
      ? r.visit_id === anchor.visit_id && r.plan_id === anchor.plan_id
      : r.reference.report_id === entry.report_id &&
        r.reference.published_version === entry.published_version,
  );
  const selected = [...candidates].sort(
    (a, b) => b.reference.published_version - a.reference.published_version,
  )[0];
  if (!selected) throw Error('Exact selected report family unavailable');
  // Validate raw identity too; safe projections intentionally do not expose visits.
  for (const r of reports) {
    const raw = state.reports.filter(
      (x) =>
        x.id === r.reference.report_id &&
        x.version === r.reference.published_version,
    );
    const visits = state.visits.filter(
      (v) => v.id === r.visit_id && v.organization_id === t.organization_id,
    );
    const plans = state.plans.filter(
      (p) =>
        p.id === r.plan_id &&
        p.organization_id === t.organization_id &&
        p.customer_id === t.customer_id &&
        p.location_id === t.location_id &&
        p.job_id === t.job_id,
    );
    if (
      raw.length !== 1 ||
      raw[0].visit_id !== r.visit_id ||
      visits.length !== 1 ||
      visits[0].plan_id !== r.plan_id ||
      plans.length !== 1
    )
      throw Error('Exact report/visit/plan/job provenance required');
  }
  return {
    request_id: entry.intake_request_id,
    request_job_link: 'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    property_label:
      state.contexts.find(
        (c) =>
          c.customer_id === t.customer_id &&
          c.location_id === t.location_id &&
          c.job_id === t.job_id,
      )?.location_label ?? t.location_id,
    scope: job.issued_source.scope,
    issued_source_sha256: job.reference.issued_source_sha256,
    selected,
    reports,
    physical_completion: 'UNVERIFIED',
    customer_acceptance: 'UNVERIFIED',
    warranty: 'UNVERIFIED',
    delivery: 'NOT_SENT',
    history_completeness: 'UNKNOWN',
  };
}
async function read(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission,
  previous?: ServiceRevisionRead,
) {
  admit(gate);
  if (previous) assertServiceRevisionAccess(previous);
  let entry: LocalJourney | undefined;
  const view = await readSavedRevision(
    sources,
    jobId,
    'customer',
    gate,
    (e) => {
      entry = e;
      const b = {
        sources,
        gate,
        entry: e,
        key: JSON.stringify([e.target.organization_id, jobId]),
      };
      known(b);
      return project(e, previous);
    },
  );
  const b = {
    sources,
    gate,
    entry: entry!,
    key: JSON.stringify([view.identity.organization_id, jobId]),
  };
  bindings.set(view, b);
  assertServiceRevisionAccess(view);
  if (previous) {
    assertServiceRevisionAccess(previous);
    for (const old of previous.evidence.reports) {
      const next = view.evidence.reports.find((r) =>
        same(r.reference, old.reference),
      );
      if (!next || next.sha256 !== old.sha256 || !same(next, old)) {
        hold(b);
        throw Error('Previously published evidence was rewritten or removed');
      }
    }
  }
  assertServiceRevisionCurrent(view);
  return view;
}
export async function readServiceRevisionReview(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  return read(sources, jobId, gate);
}
export async function readServiceRevisionUpdates(before: ServiceRevisionRead) {
  const b = binding(before);
  assertServiceRevisionAccess(before);
  return read(b.sources, before.identity.job_id, b.gate, before);
}
export function filterServiceRevisionReports(
  view: ServiceRevisionRead,
  query: string,
  phase = '',
) {
  assertServiceRevisionAccess(view);
  if (
    typeof query !== 'string' ||
    query.length > 100 ||
    !['', 'before', 'during', 'after'].includes(phase)
  )
    throw Error('Bounded literal published-report filters required');
  const q = query.trim().toLocaleLowerCase('en-US');
  return view.evidence.reports.filter(
    (r) =>
      (!phase || r.report.phase === phase) &&
      [
        r.reference.report_id,
        String(r.reference.published_version),
        r.report.summary,
        r.visit_id,
      ].some((v) => v.toLocaleLowerCase('en-US').includes(q)),
  );
}
export function inspectServiceRevisionReport(
  view: ServiceRevisionRead,
  reference: PassportReportReference,
) {
  assertServiceRevisionAccess(view);
  const report =
    reference === view.evidence.selected.reference
      ? view.evidence.selected
      : view.evidence.reports.find((r) => r.reference === reference);
  if (!report)
    throw Error('Exact retained published report reference required');
  return report;
}
export function inspectServiceRevisionComparison(
  before: ServiceRevisionRead,
  next: ServiceRevisionRead,
) {
  assertServiceRevisionAccess(before);
  assertServiceRevisionCurrent(next);
  const a = before.evidence.selected,
    b = next.evidence.selected,
    original = binding(next);
  if (
    a.visit_id !== b.visit_id ||
    a.plan_id !== b.plan_id ||
    a.reference.report_id === b.reference.report_id ||
    b.reference.published_version <= a.reference.published_version
  )
    throw Error(
      'Inspect a distinct newer published sibling for the same visit and exact job',
    );
  const comparison = compareSavedRevisions(before, next);
  const diff = original.entry.customerModel.compareReports(
    { id: a.reference.report_id, version: a.reference.published_version },
    { id: b.reference.report_id, version: b.reference.published_version },
  );
  const inspection = freezePrototype({
    before: a,
    current: b,
    changed: comparison.changed,
    differences: {
      same_date: diff.same_date,
      checklist: diff.checklist.map((r) => ({
        label: r.label,
        earlier: r.earlier,
        later: r.later,
        result_differs: r.result_differs,
        uncertainty: r.uncertainty,
      })),
      findings: diff.findings.map((r) => ({
        category: r.category,
        location: r.location,
        presence: r.presence,
        differences: r.differences,
        uncertainties: [...r.uncertainties],
      })),
    },
    physical_completion: 'UNVERIFIED' as const,
    meaning: 'OBSERVED_PUBLISHED_DIFFERENCES_ONLY' as const,
  });
  assertServiceRevisionAccess(before);
  assertServiceRevisionCurrent(next);
  inspections.set(inspection, { before, next, comparison });
  return inspection;
}
export type ServiceRevisionInspection = ReturnType<
  typeof inspectServiceRevisionComparison
>;
const inspections = new WeakMap<
  object,
  {
    before: ServiceRevisionRead;
    next: ServiceRevisionRead;
    comparison: ReturnType<
      typeof compareSavedRevisions<ServiceRevisionEvidence>
    >;
  }
>();
export type ServiceRevisionSelection =
  SavedRevisionSelection<ServiceRevisionEvidence>;
const selectionSources = new WeakMap<object, ServiceRevisionRead>();
export function createServiceRevisionSelection(view: ServiceRevisionRead) {
  assertServiceRevisionCurrent(view);
  const selection = createSavedRevisionSelection(view);
  selectionSources.set(selection, view);
  return selection;
}
export function readServiceRevisionSelection(
  selection: ServiceRevisionSelection,
) {
  const source = selectionSources.get(selection);
  if (!source) throw Error('Original retained service selection required');
  assertServiceRevisionAccess(source); // Before a generic fence can mask our terminal observation.
  const result = readSavedRevisionSelection(selection);
  assertServiceRevisionAccess(result.snapshot);
  return result;
}
export function adoptServiceRevisionReview(
  selection: ServiceRevisionSelection,
  inspection: ServiceRevisionInspection,
  expectedGeneration: number,
  confirmed: boolean,
) {
  const b = inspections.get(inspection);
  if (!b) throw Error('Exact inspected published comparison required');
  assertServiceRevisionAccess(b.before);
  assertServiceRevisionCurrent(b.next);
  const result = adoptSavedRevision(
    selection,
    b.comparison,
    expectedGeneration,
    confirmed,
  );
  selectionSources.set(selection, result.snapshot);
  return result;
}
