import { documentHash } from '../../domain/release/preview';
import type { PassportReportReference } from '../../domain/property/passport';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readServiceDesk,
  openServiceDeskJob,
  assertServiceDeskCurrentNow,
  assertServiceDeskDetailCurrentNow,
  type ServiceDeskView,
} from './service-desk';
import {
  readPortfolioService,
  assertPortfolioServiceCurrentNow,
  openPortfolioServiceSource,
  selectPortfolioServiceJob,
  type PortfolioServiceView,
} from './portfolio-service';

export interface ServiceContinuityInput {
  query: string;
  location_id: string;
  job_id: string;
}
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Service continuity is OFF without explicit local admission');
}
function pin(input: ServiceContinuityInput) {
  const p = prototypeFields(input, ['query', 'location_id', 'job_id']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    typeof p.location_id !== 'string' ||
    p.location_id.length > 200 ||
    typeof p.job_id !== 'string' ||
    p.job_id.length > 200
  )
    throw Error('Exact bounded literal search, property and job required');
  return { query: p.query, location_id: p.location_id, job_id: p.job_id };
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  input: ServiceContinuityInput;
  signature: string;
  desk: ServiceDeskView[];
  portfolio: PortfolioServiceView;
  held: boolean;
}
const views = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held) throw Error('UNKNOWN service evidence is exact read only');
  try {
    if (JSON.stringify(pin(b.input)) !== b.signature)
      throw Error('Original continuity filters changed');
    b.capture.check();
    b.desk.forEach(assertServiceDeskCurrentNow);
    assertPortfolioServiceCurrentNow(b.portfolio);
  } catch (e) {
    b.held = true;
    throw e;
  }
}
/** Only the existing allowlisted Passport projection enters customer-facing content. */
function safeProperty(p: PortfolioServiceView['properties'][number]) {
  return {
    organization_id: p.organization_id,
    customer_id: p.customer_id,
    location_id: p.location_id,
    property_label: p.property_label,
    contractor: {
      id: p.contractor.id,
      name: p.contractor.name,
      primary_color: p.contractor.primary_color,
      accent_color: p.contractor.accent_color,
    },
    jobs: p.jobs.map((j) => ({
      job_id: j.job_id,
      estimate_id: j.estimate_id,
      issued_version_id: j.issued_version_id,
      issued_version_number: j.issued_version_number,
      name: j.name,
      description: j.description,
      lines: j.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
      })),
    })),
    reports: p.reports.map((item) => ({
      report: {
        reference: {
          kind: 'report' as const,
          organization_id: item.report.reference.organization_id,
          customer_id: item.report.reference.customer_id,
          location_id: item.report.reference.location_id,
          report_id: item.report.reference.report_id,
          published_version: item.report.reference.published_version,
        },
        visited_on: item.report.visited_on,
        published_at: item.report.published_at,
        phase: item.report.phase,
        summary: item.report.summary,
        checklist: item.report.checklist.map((c) => ({
          reference: { ...c.reference },
          label: c.label,
          recorded_completed: c.recorded_completed,
        })),
        observations: item.report.observations.map((o) => ({
          reference: { ...o.reference },
          category: o.category,
          location: o.location,
          severity: o.severity,
          observation: o.observation,
          recommendation: o.recommendation,
        })),
      },
      linked_job_ids: [...item.linked_job_ids],
      association: item.association,
      sha256: item.sha256,
    })),
  };
}
/** Compose retained request/issued and Passport readers; no records or foreign keys are created. */
export async function readServiceContinuity(
  sources: OperatingSources,
  input: ServiceContinuityInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate),
    signature = JSON.stringify(selected),
    desk: ServiceDeskView[] = [];
  const stable = () => {
    capture.check();
    if (JSON.stringify(pin(input)) !== signature)
      throw Error('Continuity filters changed');
  };
  const first = await readServiceDesk(
    sources,
    { query: '', status: '', page: 0 },
    gate,
  );
  stable();
  desk.push(first);
  for (
    let page = 1;
    page * first.page_size < first.available_requests;
    page++
  ) {
    if (page > 9) throw Error('Bounded prepared request coverage required');
    const next = await readServiceDesk(
      sources,
      { query: '', status: '', page },
      gate,
    );
    stable();
    if (next.available_requests !== first.available_requests)
      throw Error('Request coverage changed');
    desk.push(next);
  }
  const portfolio = await readPortfolioService(
    sources,
    { location_id: '' },
    gate,
  );
  stable();
  const b: Binding = {
    sources,
    capture,
    input,
    signature,
    desk,
    portfolio,
    held: false,
  };
  current(b);
  if (
    selected.location_id &&
    !portfolio.properties.some((p) => p.location_id === selected.location_id)
  )
    throw Error('Exact authorized property required');
  if (
    selected.job_id &&
    !portfolio.properties.some(
      (p) =>
        (!selected.location_id || p.location_id === selected.location_id) &&
        p.jobs.some((j) => j.job_id === selected.job_id),
    )
  )
    throw Error('Exact authorized property/job required');
  const all = desk.flatMap((d) =>
    d.requests.flatMap((group) =>
      group.jobs.map((job) => {
        const property = portfolio.properties.find(
            (p) =>
              p.organization_id === job.organization_id &&
              p.customer_id === job.customer_id &&
              p.location_id === job.location_id,
          ),
          scope = property?.jobs.find(
            (j) =>
              j.job_id === job.job_id &&
              j.issued_version_id === job.issued_version_id &&
              j.estimate_id === job.estimate_id,
          );
        if (!property || !scope)
          throw Error(
            'Exact request, issued job and property continuity required',
          );
        const reports = property.reports.filter(
          (r) =>
            r.association === 'EXACT_RECORDED_LINK' &&
            r.linked_job_ids.length === 1 &&
            r.linked_job_ids[0] === job.job_id,
        );
        return {
          request: {
            id: group.request.id,
            summary: group.request.summary,
            status: group.request.status,
          },
          organization_id: job.organization_id,
          customer_id: job.customer_id,
          customer_label: group.customer_label,
          location_id: job.location_id,
          property_label: group.property_label,
          job_id: job.job_id,
          estimate_id: job.estimate_id,
          estimate_number: job.estimate_number,
          issued_version_id: job.issued_version_id,
          issued_version_number: job.issued_version_number,
          scope_name: scope.name,
          scope_description: scope.description,
          receipt: { id: job.receipt.id, decision: job.receipt.decision },
          request_scope_association:
            'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK' as const,
          linked_reports: reports.map((r) => ({
            reference: { ...r.report.reference },
            summary: r.report.summary,
            visited_on: r.report.visited_on,
            association: r.association,
          })),
          property_report_count: property.reports.length,
          documentation: reports.length
            ? ('EXACT_RECORDED_JOB_LINKS_AVAILABLE' as const)
            : ('JOB_DOCUMENTATION_LINK_UNKNOWN' as const),
        };
      }),
    ),
  );
  if (
    all.length !== capture.entries.length ||
    new Set(all.map((p) => p.job_id)).size !== all.length
  )
    throw Error('Unique original job coverage required');
  const query = selected.query.toLocaleLowerCase('en-US'),
    paths = all.filter(
      (p) =>
        (!selected.location_id || p.location_id === selected.location_id) &&
        (!selected.job_id || p.job_id === selected.job_id) &&
        (!query ||
          [
            p.request.id,
            p.request.summary,
            p.request.status,
            p.customer_id,
            p.customer_label,
            p.location_id,
            p.property_label,
            p.job_id,
            p.estimate_id,
            p.estimate_number,
            p.issued_version_id,
            p.scope_name,
            p.scope_description,
            p.receipt.id,
            ...p.linked_reports.flatMap((r) => [
              r.reference.report_id,
              r.summary,
            ]),
          ].some((v) => v.toLocaleLowerCase('en-US').includes(query))),
    );
  const body = {
    mode: 'LOCAL_SOURCE_SERVICE_CONTINUITY' as const,
    organization_id: capture.organization_id,
    available_jobs: all.length,
    available_properties: portfolio.available_properties,
    available_reports: portfolio.available_reports,
    matching_jobs: paths.length,
    filters: selected,
    property_options: portfolio.properties.map((p) => ({
      location_id: p.location_id,
      label: p.property_label,
    })),
    job_options: all
      .filter(
        (p) => !selected.location_id || p.location_id === selected.location_id,
      )
      .map((p) => ({
        job_id: p.job_id,
        location_id: p.location_id,
        label: p.scope_name,
        issued_version_number: p.issued_version_number,
      })),
    paths,
    coverage: 'PREPARED_AUTHORIZED_HANDLES_ONLY' as const,
    history_completeness: 'UNKNOWN' as const,
    physical_completion: 'UNVERIFIED' as const,
    customer_acceptance: 'UNVERIFIED' as const,
    warranty: 'UNVERIFIED' as const,
    authority: 'READ_ONLY_LOCAL_NAVIGATION' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  views.set(view, b);
  return view;
}
export type ServiceContinuityView = Awaited<
  ReturnType<typeof readServiceContinuity>
>;
export function assertServiceContinuityCurrentNow(view: ServiceContinuityView) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained continuity required');
  current(b);
}
interface DetailBinding {
  parent: Binding;
  job: Awaited<ReturnType<typeof openServiceDeskJob>>;
  jobId: string;
}
const details = new WeakMap<object, DetailBinding>();
export async function openServiceContinuityJob(
  view: ServiceContinuityView,
  jobId: string,
) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained continuity required');
  current(b);
  if (typeof jobId !== 'string' || !view.paths.some((p) => p.job_id === jobId))
    throw Error('Exact visible continuity job required');
  const path = view.paths.find((p) => p.job_id === jobId)!,
    desk = b.desk.find((d) =>
      d.requests.some((g) => g.jobs.some((j) => j.job_id === jobId)),
    );
  if (!desk) throw Error('Original service page unavailable');
  const job = await openServiceDeskJob(desk, jobId);
  current(b);
  assertServiceDeskDetailCurrentNow(job);
  const property = b.portfolio.properties.find(
    (p) =>
      p.organization_id === path.organization_id &&
      p.customer_id === path.customer_id &&
      p.location_id === path.location_id,
  );
  if (
    !property ||
    job.staff.request.id !== path.request.id ||
    job.staff.source.version_id !== path.issued_version_id ||
    job.staff.receipt.id !== path.receipt.id ||
    job.customer_safe.job.reference.job_id !== path.job_id
  )
    throw Error(
      'Exact request/issued/receipt/documentation continuity changed',
    );
  const body = {
    mode: 'LOCAL_SERVICE_CONTINUITY_DETAIL' as const,
    staff: {
      request: { ...path.request },
      customer_label: path.customer_label,
      property_label: path.property_label,
      organization_id: path.organization_id,
      customer_id: path.customer_id,
      location_id: path.location_id,
      job_id: path.job_id,
      estimate_id: path.estimate_id,
      estimate_number: path.estimate_number,
      issued_version_id: path.issued_version_id,
      issued_version_number: path.issued_version_number,
      receipt: { ...path.receipt },
      offer_id: job.staff.offer.id,
      request_scope_association: path.request_scope_association,
      genuine_customer_approval: 'UNVERIFIED' as const,
      contract_execution: 'BLOCKED' as const,
    },
    customer_safe: {
      property_passport: safeProperty(property),
      selected_job_id: path.job_id,
      selected_documentation: job.customer_safe,
      history_completeness: 'UNKNOWN' as const,
      physical_completion: 'UNVERIFIED' as const,
      customer_acceptance: 'UNVERIFIED' as const,
      warranty: 'UNVERIFIED' as const,
      delivery: 'NOT_SENT' as const,
    },
  };
  const sha256 = await documentHash(body);
  current(b);
  assertServiceDeskDetailCurrentNow(job);
  const detail = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  details.set(detail, { parent: b, job, jobId });
  return detail;
}
export type ServiceContinuityDetail = Awaited<
  ReturnType<typeof openServiceContinuityJob>
>;
export function assertServiceContinuityDetailCurrentNow(
  detail: ServiceContinuityDetail,
) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained continuity detail required');
  current(b.parent);
  assertServiceDeskDetailCurrentNow(b.job);
}
/** Every report keeps its own exact property/report/version; no nearest, latest or inferred job link. */
export async function openServiceContinuityReport(
  detail: ServiceContinuityDetail,
  reference: PassportReportReference,
) {
  assertServiceContinuityDetailCurrentNow(detail);
  const b = details.get(detail)!,
    own = prototypeFields(reference, [
      'kind',
      'organization_id',
      'customer_id',
      'location_id',
      'report_id',
      'published_version',
    ]);
  const p = detail.customer_safe.property_passport;
  if (
    Object.keys(own).length !== 6 ||
    own.organization_id !== p.organization_id ||
    own.customer_id !== p.customer_id ||
    own.location_id !== p.location_id ||
    !p.reports.some(
      (r) =>
        r.report.reference.report_id === own.report_id &&
        r.report.reference.published_version === own.published_version,
    )
  )
    throw Error('Exact selected property report/version required');
  const report = await openPortfolioServiceSource(
    b.parent.portfolio,
    reference,
  );
  assertServiceContinuityDetailCurrentNow(detail);
  return report;
}
/** This checked local callback target never confers customer or financial authority. */
export function selectServiceContinuityJob(detail: ServiceContinuityDetail) {
  assertServiceContinuityDetailCurrentNow(detail);
  const b = details.get(detail)!;
  return selectPortfolioServiceJob(b.parent.portfolio, b.jobId);
}
export function inspectServiceContinuity(view: ServiceContinuityView) {
  try {
    assertServiceContinuityCurrentNow(view);
    return {
      status: 'CURRENT_NAVIGATION_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    return { status: 'UNKNOWN' as const, replay: false, replacement: null };
  }
}
