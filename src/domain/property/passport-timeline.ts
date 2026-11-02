import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import { documentHash } from '../release/preview';
import type { ReportBoundary } from './report-page';
import type { PropertyPassportAdmission } from './passport';
import {
  createPropertyPassportJobHistory,
  type PropertyPassportJobHistory,
} from './passport-job-history';

type History = PropertyPassportJobHistory['snapshot'];
type Report = History['inspections']['snapshot']['reports'][number];
type Job = History['jobs'][number];
type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;

type InspectionEvent = {
  kind: 'inspection-documentation';
  reference: Report['reference'];
  date: string;
  date_meaning: 'recorded-visit-date';
  published_at: string;
  report: Report;
  linked_jobs: Job['reference'][];
  job_link_status: 'EXACT' | 'UNKNOWN';
  completion_documentation: {
    after_phase_recorded: boolean;
    checklist_items_recorded: number;
    checklist_items_recorded_completed: number;
    physical_completion: 'UNVERIFIED';
    warranty: 'UNVERIFIED';
    customer_approval: 'UNVERIFIED';
  };
};
type IssuedEvent = {
  kind: 'issued-job-scope';
  reference: Job['reference'];
  date: string;
  date_meaning: 'issued-scope-utc-date';
  issued_at: string;
  job: Job;
};
export type PassportTimelineEvent = Immutable<
  (InspectionEvent | IssuedEvent) & { source_sha256: string }
>;
export type PassportTimelineReference = Immutable<{
  kind: PassportTimelineEvent['kind'];
  source: Report['reference'] | Job['reference'];
  source_sha256: string;
}>;
export type PropertyPassportTimeline = Immutable<{
  snapshot: ReportBoundary & {
    format: 'synthetic-property-passport-timeline-v1';
    synthetic_only: true;
    property_label: string;
    contractor: {
      id: string;
      name: string;
      primary_color: string;
      accent_color: string;
    };
    coverage: 'currently-authorized-issued-jobs-and-published-reports';
    history_completeness: 'UNKNOWN';
    ordering: 'recorded-date-descending-without-intraday-or-timezone-inference';
    physical_completion: 'UNVERIFIED';
    events: PassportTimelineEvent[];
  };
  integrity: { algorithm: 'SHA-256'; sha256: string };
}>;
export type PassportTimelineEvidence = Immutable<
  | { status: 'AVAILABLE'; evidence: PassportTimelineEvent }
  | { status: 'UNKNOWN'; evidence: null }
>;

function freeze<T>(v: T): Immutable<T> {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v as Immutable<T>;
}
function assertAdmission(admission: PropertyPassportAdmission) {
  if (admission.enabled !== true)
    throw Error('Synthetic Property Passport timeline disabled');
}

function identity(source: PassportTimelineReference['source']) {
  // Named primitives only: never execute a caller's serializer.
  return source.kind === 'report'
    ? [
        source.organization_id,
        source.customer_id,
        source.location_id,
        source.kind,
        source.report_id,
        source.published_version,
      ]
    : [
        source.organization_id,
        source.customer_id,
        source.location_id,
        source.kind,
        source.job_id,
        source.estimate_id,
        source.issued_version_id,
        source.issued_version_number,
        source.issued_source_sha256,
      ];
}
function currentLabel(model: CustomerPortalPreviewModel, t: ReportBoundary) {
  const c = model.read().context;
  if (
    c.organization_id !== t.organization_id ||
    c.customer_id !== t.customer_id ||
    c.location_id !== t.location_id ||
    typeof c.property_label !== 'string' ||
    !c.property_label.trim() ||
    c.property_label.length > 500
  )
    throw Error('Exact customer property unavailable');
  return c.property_label;
}

function contractor(model: CustomerPortalPreviewModel) {
  const c = model.company;
  if (
    ![c.id, c.name, c.primary_color, c.accent_color].every(
      (v) => typeof v === 'string',
    ) ||
    !c.name.trim() ||
    c.name.length > 200 ||
    !/^#[a-f0-9]{6}$/i.test(c.primary_color) ||
    !/^#[a-f0-9]{6}$/i.test(c.accent_color)
  )
    throw Error('Approved synthetic contractor identity unavailable');
  return {
    id: c.id,
    name: c.name,
    primary_color: c.primary_color,
    accent_color: c.accent_color,
  };
}

/** Detached read composition over the existing Passport job/report snapshots.
 * No new completion store, connected access, publication or operational authority. */
export async function createPropertyPassportTimeline(
  model: CustomerPortalPreviewModel,
  boundary: ReportBoundary,
  admission: PropertyPassportAdmission = {},
): Promise<PropertyPassportTimeline> {
  assertAdmission(admission);
  const t = {
    organization_id: boundary.organization_id,
    customer_id: boundary.customer_id,
    location_id: boundary.location_id,
  };
  const property_label = currentLabel(model, t);
  const brand = contractor(model);
  const history = await createPropertyPassportJobHistory(model, t, admission);
  assertAdmission(admission);
  const h = history.snapshot;
  const facts: (InspectionEvent | IssuedEvent)[] = [
    ...h.inspections.snapshot.reports.map((report): InspectionEvent => {
      const linked_jobs = h.jobs
        .filter((job) =>
          job.documentation.reports.some(
            (link) =>
              link.reference.report_id === report.reference.report_id &&
              link.reference.published_version ===
                report.reference.published_version,
          ),
        )
        .map((job) => job.reference);
      return {
        kind: 'inspection-documentation',
        reference: report.reference,
        date: report.visited_on,
        date_meaning: 'recorded-visit-date',
        published_at: report.published_at,
        report,
        linked_jobs,
        job_link_status: linked_jobs.length === 1 ? 'EXACT' : 'UNKNOWN',
        completion_documentation: {
          after_phase_recorded: report.phase === 'after',
          checklist_items_recorded: report.checklist.length,
          checklist_items_recorded_completed: report.checklist.filter(
            (item) => item.recorded_completed,
          ).length,
          physical_completion: 'UNVERIFIED',
          warranty: 'UNVERIFIED',
          customer_approval: 'UNVERIFIED',
        },
      };
    }),
    ...h.jobs.map((job): IssuedEvent => ({
      kind: 'issued-job-scope',
      reference: job.reference,
      date: new Date(job.issued_source.issued_at).toISOString().slice(0, 10),
      date_meaning: 'issued-scope-utc-date',
      issued_at: job.issued_source.issued_at,
      job,
    })),
  ];
  const events = await Promise.all(
    facts.map(async (fact) => {
      const source_sha256 = await documentHash(fact);
      assertAdmission(admission);
      return { ...fact, source_sha256 };
    }),
  );
  assertAdmission(admission);
  events.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.kind.localeCompare(b.kind) ||
      JSON.stringify(identity(a.reference)).localeCompare(
        JSON.stringify(identity(b.reference)),
      ),
  );
  const snapshot = {
    ...t,
    format: 'synthetic-property-passport-timeline-v1' as const,
    synthetic_only: true as const,
    property_label,
    contractor: brand,
    coverage: 'currently-authorized-issued-jobs-and-published-reports' as const,
    history_completeness: 'UNKNOWN' as const,
    ordering:
      'recorded-date-descending-without-intraday-or-timezone-inference' as const,
    physical_completion: 'UNVERIFIED' as const,
    events,
  };
  const sha256 = await documentHash(snapshot);
  assertAdmission(admission);
  const final = await createPropertyPassportJobHistory(model, t, admission);
  assertAdmission(admission);
  if (
    history.integrity.sha256 !== final.integrity.sha256 ||
    currentLabel(model, t) !== property_label ||
    JSON.stringify(contractor(model)) !== JSON.stringify(brand)
  )
    throw Error('Property Passport sources changed; timeline unavailable');
  return freeze({ snapshot, integrity: { algorithm: 'SHA-256', sha256 } });
}

/** Exact current read only. A retained digest/reference is never access authority. */
export async function readPropertyPassportTimelineEvidence(
  model: CustomerPortalPreviewModel,
  reference: PassportTimelineReference,
  admission: PropertyPassportAdmission = {},
): Promise<PassportTimelineEvidence> {
  try {
    assertAdmission(admission);
    const keys = Object.keys(reference);
    if (
      keys.length !== 3 ||
      !['kind', 'source', 'source_sha256'].every((k) =>
        Object.hasOwn(reference, k),
      ) ||
      !['inspection-documentation', 'issued-job-scope'].includes(
        reference.kind,
      ) ||
      typeof reference.source_sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(reference.source_sha256)
    )
      throw Error('Invalid timeline reference');
    const source = reference.source;
    const report = reference.kind === 'inspection-documentation';
    const names = report
      ? [
          'organization_id',
          'customer_id',
          'location_id',
          'kind',
          'report_id',
          'published_version',
        ]
      : [
          'organization_id',
          'customer_id',
          'location_id',
          'kind',
          'job_id',
          'estimate_id',
          'issued_version_id',
          'issued_version_number',
          'issued_source_sha256',
        ];
    if (
      !source ||
      Object.keys(source).length !== names.length ||
      !names.every((k) => Object.hasOwn(source, k)) ||
      source.kind !== (report ? 'report' : 'job-documentation')
    )
      throw Error('Invalid exact source');
    const expected = [...identity(source)];
    if (expected.some((v) => typeof v !== 'string' && typeof v !== 'number'))
      throw Error('Invalid source primitives');
    const kind = reference.kind;
    const digest = reference.source_sha256;
    const target = {
      organization_id: source.organization_id,
      customer_id: source.customer_id,
      location_id: source.location_id,
    };
    const timeline = await createPropertyPassportTimeline(
      model,
      target,
      admission,
    );
    assertAdmission(admission);
    const event = timeline.snapshot.events.find(
      (event) =>
        event.kind === kind &&
        event.source_sha256 === digest &&
        identity(event.reference).every((v, i) => v === expected[i]),
    );
    if (event) return freeze({ status: 'AVAILABLE', evidence: event });
  } catch {
    // Denied, missing, ambiguous or changed sources remain UNKNOWN; no replay.
  }
  return freeze({ status: 'UNKNOWN', evidence: null });
}
