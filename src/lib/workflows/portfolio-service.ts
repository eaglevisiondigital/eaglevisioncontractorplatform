import { documentHash } from '../../domain/release/preview';
import {
  readPropertyPassportEvidence,
  type PassportReportReference,
} from '../../domain/property/passport';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { readCustomerWorkflow } from './customer-workflow';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
export interface PortfolioServiceInput {
  location_id: string;
}
function pin(input: PortfolioServiceInput) {
  const p = prototypeFields(input, ['location_id']);
  if (
    Object.keys(p).length !== 1 ||
    typeof p.location_id !== 'string' ||
    p.location_id.length > 200
  )
    throw Error('Exact primitive property filter required');
  return { location_id: p.location_id };
}
type Capture = ReturnType<typeof captureOperatingSources>;
interface Binding {
  sources: OperatingSources;
  capture: Capture;
  gate: JourneyAdmission;
  original: PortfolioServiceInput;
  signature: string;
  models: {
    entry: Capture['entries'][number];
    model: Capture['entries'][number]['customerModel'];
    context: string;
  }[];
  held: boolean;
}
const bindings = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held) throw Error('UNKNOWN is exact read only');
  if (JSON.stringify(pin(b.original)) !== b.signature)
    throw Error('Property filter changed');
  b.capture.check();
  for (const p of b.models)
    if (
      p.entry.customerModel !== p.model ||
      JSON.stringify(p.model.read().context) !== p.context
    )
      throw Error('Customer-safe model context changed');
}
type Read = Awaited<ReturnType<typeof readCustomerWorkflow>>;
type Events = NonNullable<Read['timeline']>['snapshot']['events'];
type Report = Extract<
  Events[number],
  { kind: 'inspection-documentation' }
>['report'];
function safeReport(r: Report) {
  return {
    reference: {
      kind: 'report' as const,
      organization_id: r.reference.organization_id,
      customer_id: r.reference.customer_id,
      location_id: r.reference.location_id,
      report_id: r.reference.report_id,
      published_version: r.reference.published_version,
    },
    visited_on: r.visited_on,
    published_at: r.published_at,
    phase: r.phase,
    summary: r.summary,
    checklist: r.checklist.map((c) => ({
      reference: {
        kind: 'checklist' as const,
        organization_id: c.reference.organization_id,
        customer_id: c.reference.customer_id,
        location_id: c.reference.location_id,
        report_id: c.reference.report_id,
        published_version: c.reference.published_version,
        source_index: c.reference.source_index,
      },
      label: c.label,
      recorded_completed: c.recorded_completed,
    })),
    observations: r.observations.map((o) => ({
      reference: {
        kind: 'finding' as const,
        organization_id: o.reference.organization_id,
        customer_id: o.reference.customer_id,
        location_id: o.reference.location_id,
        report_id: o.reference.report_id,
        published_version: o.reference.published_version,
        finding_id: o.reference.finding_id,
        source_index: o.reference.source_index,
      },
      category: o.category,
      location: o.location,
      severity: o.severity,
      observation: o.observation,
      recommendation: o.recommendation,
    })),
  };
}
type SafeReport = ReturnType<typeof safeReport>;
interface Group {
  organization_id: string;
  customer_id: string;
  location_id: string;
  property_label: string;
  contractor: {
    id: string;
    name: string;
    primary_color: string;
    accent_color: string;
  };
  jobs: {
    job_id: string;
    estimate_id: string;
    issued_version_id: string;
    issued_version_number: number;
    name: string;
    description: string;
    lines: {
      id: string;
      description: string;
      quantity_milli: number;
      unit: string;
    }[];
  }[];
  reports: {
    report: SafeReport;
    linked_job_ids: string[];
    association: 'EXACT_RECORDED_LINK' | 'UNKNOWN';
    sha256: string;
  }[];
}
/** Safe union of existing published timelines. Exact property IDs group; exact report/version deduplicates. */
export async function readPortfolioService(
  sources: OperatingSources,
  input: PortfolioServiceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate),
    models = capture.entries.map((entry) => ({
      entry,
      model: entry.customerModel,
      context: JSON.stringify(entry.customerModel.read().context),
    })),
    b: Binding = {
      sources,
      capture,
      gate,
      original: input,
      signature: JSON.stringify(selected),
      models,
      held: false,
    };
  current(b);
  const groups = new Map<string, Group>(),
    reportOwners = new Map<string, string>(),
    reportLinks = new Map<string, Set<string>>(),
    ambiguousReports = new Set<string>();
  for (const entry of capture.entries) {
    const t = entry.target,
      read = await readCustomerWorkflow(
        entry.customerModel,
        t,
        {
          report_id: entry.report_id,
          published_version: entry.published_version,
        },
        gate,
      );
    current(b);
    if (read.status !== 'CURRENT' || !read.timeline)
      throw Error('Exact safe job/report source unavailable');
    const snapshot = read.timeline.snapshot,
      key = JSON.stringify([t.organization_id, t.customer_id, t.location_id]);
    let group = groups.get(key);
    if (!group) {
      group = {
        organization_id: t.organization_id,
        customer_id: t.customer_id,
        location_id: t.location_id,
        property_label: snapshot.property_label,
        contractor: { ...snapshot.contractor },
        jobs: [],
        reports: [],
      };
      groups.set(key, group);
    }
    if (
      group.property_label !== snapshot.property_label ||
      JSON.stringify(group.contractor) !== JSON.stringify(snapshot.contractor)
    )
      throw Error('Conflicting exact property identity');
    const jobEvents = snapshot.events.filter(
      (e) =>
        e.kind === 'issued-job-scope' &&
        e.reference.kind === 'job-documentation' &&
        e.reference.job_id === t.job_id &&
        e.reference.estimate_id === t.estimate_id &&
        e.reference.issued_version_id === t.version_id,
    );
    if (jobEvents.length !== 1 || jobEvents[0].kind !== 'issued-job-scope')
      throw Error('Exact authorized issued job scope required');
    const job = jobEvents[0].job;
    group.jobs.push({
      job_id: job.reference.job_id,
      estimate_id: job.reference.estimate_id,
      issued_version_id: job.reference.issued_version_id,
      issued_version_number: job.reference.issued_version_number,
      name: job.issued_source.scope.name,
      description: job.issued_source.scope.description,
      lines: job.issued_source.scope.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
      })),
    });
    for (const event of snapshot.events) {
      if (event.kind !== 'inspection-documentation') continue;
      const r = safeReport(event.report);
      if (
        r.reference.organization_id !== t.organization_id ||
        r.reference.customer_id !== t.customer_id ||
        r.reference.location_id !== t.location_id
      )
        throw Error('Foreign report property');
      const reportKey = JSON.stringify([
        r.reference.organization_id,
        r.reference.report_id,
        r.reference.published_version,
      ]);
      if (reportOwners.has(reportKey) && reportOwners.get(reportKey) !== key)
        throw Error('Report identity conflicts across properties');
      reportOwners.set(reportKey, key);
      let item = group.reports.find(
        (item) =>
          item.report.reference.report_id === r.reference.report_id &&
          item.report.reference.published_version ===
            r.reference.published_version,
      );
      if (item && JSON.stringify(item.report) !== JSON.stringify(r))
        throw Error('Conflicting published report content');
      if (!item) {
        const sha256 = await documentHash(r);
        current(b);
        item = {
          report: r,
          linked_job_ids: [],
          association: 'UNKNOWN',
          sha256,
        };
        group.reports.push(item);
      }
      let links = reportLinks.get(reportKey);
      if (!links) {
        links = new Set();
        reportLinks.set(reportKey, links);
      }
      if (event.linked_jobs.length > 1) ambiguousReports.add(reportKey);
      for (const link of event.linked_jobs) {
        if (
          capture.entries.some(
            (e) =>
              e.target.organization_id === link.organization_id &&
              e.target.customer_id === link.customer_id &&
              e.target.location_id === link.location_id &&
              e.target.job_id === link.job_id &&
              e.target.estimate_id === link.estimate_id &&
              e.target.version_id === link.issued_version_id,
          )
        )
          links.add(link.job_id);
      }
      item.linked_job_ids = [...links].sort();
      item.association =
        item.linked_job_ids.length === 1 && !ambiguousReports.has(reportKey)
          ? 'EXACT_RECORDED_LINK'
          : 'UNKNOWN';
    }
  }
  const available = [...groups.values()];
  for (const g of available) {
    g.jobs.sort((a, b) => a.job_id.localeCompare(b.job_id));
    g.reports.sort(
      (a, b) =>
        b.report.visited_on.localeCompare(a.report.visited_on) ||
        a.report.reference.report_id.localeCompare(
          b.report.reference.report_id,
        ),
    );
  }
  available.sort(
    (a, b) =>
      a.property_label.localeCompare(b.property_label) ||
      a.location_id.localeCompare(b.location_id),
  );
  const body = {
    mode: 'LOCAL_CUSTOMER_SAFE_PROPERTY_PORTFOLIO' as const,
    organization_id: capture.organization_id,
    available_properties: available.length,
    available_jobs: capture.entries.length,
    available_reports: available.reduce((n, g) => n + g.reports.length, 0),
    location_id: selected.location_id,
    properties: available.filter(
      (g) => !selected.location_id || g.location_id === selected.location_id,
    ),
    history_completeness: 'UNKNOWN' as const,
    physical_completion: 'UNVERIFIED' as const,
    customer_acceptance: 'UNVERIFIED' as const,
    warranty: 'UNVERIFIED' as const,
    media: 'UNAVAILABLE' as const,
    authority: 'DOCUMENTATION_NAVIGATION_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  bindings.set(view, b);
  return view;
}
export type PortfolioServiceView = Awaited<
  ReturnType<typeof readPortfolioService>
>;
export function assertPortfolioServiceCurrentNow(view: PortfolioServiceView) {
  const b = bindings.get(view);
  if (!b) throw Error('Exact retained portfolio required');
  current(b);
}
export function selectPortfolioServiceJob(
  view: PortfolioServiceView,
  jobId: string,
) {
  const b = bindings.get(view);
  if (!b) throw Error('Exact original portfolio required');
  try {
    current(b);
    if (
      typeof jobId !== 'string' ||
      !view.properties.some((g) => g.jobs.some((j) => j.job_id === jobId))
    )
      throw Error('Exact visible job required');
    return jobId;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Read the same published report/version through the existing safe evidence reader. */
export async function openPortfolioServiceSource(
  view: PortfolioServiceView,
  reference: PassportReportReference,
) {
  const b = bindings.get(view);
  if (!b) throw Error('Exact retained portfolio required');
  try {
    current(b);
    const r = prototypeFields(reference, [
      'kind',
      'organization_id',
      'customer_id',
      'location_id',
      'report_id',
      'published_version',
    ]);
    if (
      Object.keys(r).length !== 6 ||
      r.kind !== 'report' ||
      typeof r.published_version !== 'number' ||
      !Number.isSafeInteger(r.published_version) ||
      r.published_version < 1 ||
      ['organization_id', 'customer_id', 'location_id', 'report_id'].some(
        (k) =>
          typeof r[k] !== 'string' || !r[k] || (r[k] as string).length > 200,
      )
    )
      throw Error('Exact report reference required');
    const signature = JSON.stringify(r);
    const group = view.properties.find(
        (g) =>
          g.organization_id === r.organization_id &&
          g.customer_id === r.customer_id &&
          g.location_id === r.location_id,
      ),
      selected = group?.reports.filter(
        (item) =>
          item.report.reference.report_id === r.report_id &&
          item.report.reference.published_version === r.published_version,
      );
    if (!group || selected?.length !== 1)
      throw Error('Exact visible published report required');
    const m = b.models.find(
      (p) =>
        p.entry.target.customer_id === group.customer_id &&
        p.entry.target.location_id === group.location_id,
    );
    if (!m) throw Error('Exact property model required');
    const result = readPropertyPassportEvidence(m.model, reference, {
      enabled: true,
    });
    if (result.status !== 'AVAILABLE' || !('observations' in result.evidence))
      throw Error('Exact published report unavailable');
    const safe = safeReport(result.evidence);
    const digest = await documentHash(safe);
    current(b);
    if (
      JSON.stringify(
        prototypeFields(reference, [
          'kind',
          'organization_id',
          'customer_id',
          'location_id',
          'report_id',
          'published_version',
        ]),
      ) !== signature ||
      digest !== selected[0].sha256
    )
      throw Error('Exact published source changed');
    return freezePrototype(safe);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
