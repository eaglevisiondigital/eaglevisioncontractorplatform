import { Temporal } from '@js-temporal/polyfill';
import { parseCustomerReview, projectIssuedReview } from '../customer/review';
import type { CustomerContext, CustomerReview } from '../customer/review';
import type { EstimateVersion } from '../estimating/types';
import type { Job } from '../jobs/financials';
import { sampleCompanies } from '../platform';
import { documentHash } from '../release/preview';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import {
  createPropertyPassportFoundation,
  readPropertyPassportEvidence,
  type PassportReportReference,
  type PropertyPassportAdmission,
  type PropertyPassportFoundation,
} from './passport';
import { reportUuid, type ReportBoundary } from './report-page';

interface JobIdentity extends ReportBoundary {
  job_id: string;
  estimate_id: string;
  issued_version_id: string;
  issued_version_number: number;
}
export interface PassportJobReference extends JobIdentity {
  kind: 'job-documentation';
  issued_source_sha256: string;
}
interface ReportLink {
  reference: PassportReportReference;
  visit_id: string;
  plan_id: string;
}
interface IssuedJobSource extends JobIdentity {
  issued_at: string;
  property_binding: 'issued-location-id' | 'existing-plan-job-id';
  property_plan_ids: string[];
  immutable_property_snapshot:
    | { status: 'UNKNOWN' }
    | {
        status: 'RECORDED';
        id: string;
        address_line1: string;
        city: string;
        region: string;
        postal_code: string;
        country_code: string;
      };
  scope: {
    name: string;
    description: string;
    lines: {
      id: string;
      description: string;
      quantity_milli: number;
      unit: string;
    }[];
  };
}
interface JobDocumentation {
  reference: PassportJobReference;
  issued_source: IssuedJobSource;
  documentation: {
    status: 'RECORDED' | 'UNKNOWN';
    reports: ReportLink[];
    unknown_report_links: {
      status: 'UNKNOWN';
      reference: PassportReportReference;
    }[];
  };
  physical_completion: 'UNVERIFIED';
  warranty: 'UNVERIFIED';
  customer_approval: 'UNVERIFIED';
}
type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;
export type PropertyPassportJobHistory = Immutable<{
  snapshot: ReportBoundary & {
    format: 'synthetic-property-job-documentation-v1';
    synthetic_only: true;
    coverage: 'authorized-issued-jobs-and-available-published-reports';
    history_completeness: 'UNKNOWN';
    physical_proof_of_work: 'UNVERIFIED';
    inspections: PropertyPassportFoundation;
    jobs: JobDocumentation[];
  };
  integrity: { algorithm: 'SHA-256'; sha256: string };
}>;
export type PropertyPassportJobEvidence = Immutable<
  | { status: 'AVAILABLE'; evidence: JobDocumentation }
  | { status: 'UNKNOWN'; evidence: null }
>;

function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}

function admit(
  model: CustomerPortalPreviewModel,
  a: PropertyPassportAdmission,
) {
  if (
    a.enabled !== true ||
    !model.repo.operations.sample ||
    !model.repo.estimates.sample ||
    !sampleCompanies.some((c) => c.id === model.company.id)
  )
    throw Error('Synthetic Passport job documentation disabled');
}

function scope(review: CustomerReview) {
  return {
    name: review.scope.name,
    description: review.scope.description,
    lines: review.scope.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity_milli: line.quantity_milli,
      unit: line.unit,
    })),
  };
}

function context(model: CustomerPortalPreviewModel, target: ReportBoundary) {
  const data = model.read();
  const c = data.context;
  if (
    c.organization_id !== model.company.id ||
    c.organization_id !== target.organization_id ||
    c.customer_id !== target.customer_id ||
    c.location_id !== target.location_id ||
    c.reports !== true ||
    !reportUuid(c.customer_id) ||
    !reportUuid(c.location_id) ||
    !Array.isArray(c.version_ids) ||
    c.version_ids.length > 500 ||
    !c.version_ids.every(reportUuid) ||
    new Set(c.version_ids).size !== c.version_ids.length
  )
    throw Error('Exact authorized customer property unavailable');
  model.repo.operations.syntheticProperty(
    c.organization_id,
    c.customer_id,
    c.location_id,
  );
  if (
    !Array.isArray(data.reviews) ||
    data.reviews.length !== c.version_ids.length ||
    new Set(data.reviews.map((r) => r.version_id)).size !== data.reviews.length
  )
    throw Error('Authorized issued sources unavailable');
  // Existing review parser establishes the current authorized source set. Its
  // financial fields are never copied into this documentation projection.
  const authorized = data.reviews.map((r) => {
    const review = parseCustomerReview(r, c, r.version_id);
    if (!reportUuid(review.estimate_id)) throw Error('Invalid issued source');
    return {
      version_id: review.version_id,
      estimate_id: review.estimate_id,
      version_number: review.version_number,
      scope: scope(review),
    };
  });
  return { data, c, authorized };
}

const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max;

function propertySnapshot(v: EstimateVersion, c: CustomerContext) {
  const location = v.location_snapshot;
  if (location === null) return { status: 'UNKNOWN' as const };
  if (
    !location ||
    location.id !== c.location_id ||
    !text(location.address_line1, 300) ||
    !location.address_line1.trim() ||
    !text(location.city, 200) ||
    !text(location.region, 100) ||
    !text(location.postal_code, 40) ||
    !text(location.country_code, 2) ||
    !/^[A-Z]{2}$/.test(location.country_code)
  )
    throw Error('Immutable issued property evidence unavailable');
  return {
    status: 'RECORDED' as const,
    id: c.location_id,
    address_line1: location.address_line1,
    city: location.city,
    region: location.region,
    postal_code: location.postal_code,
    country_code: location.country_code,
  };
}

async function sources(
  model: CustomerPortalPreviewModel,
  target: ReportBoundary,
  inspections: PropertyPassportFoundation,
  admission: PropertyPassportAdmission,
) {
  admit(model, admission);
  const initial = context(model, target);
  const estimates = [...new Set(initial.authorized.map((r) => r.estimate_id))];
  const [jobs, histories] = await Promise.all([
    model.repo.estimates.jobs(target.organization_id),
    Promise.all(
      estimates.map((id) =>
        model.repo.estimates.history(target.organization_id, id),
      ),
    ),
  ]);
  admit(model, admission);
  const current = context(model, target);
  if (JSON.stringify(current.authorized) !== JSON.stringify(initial.authorized))
    throw Error('Authorized issued sources changed');
  const { c, data } = current;
  const state = model.repo.read(c.organization_id);
  // The final checkpoint is synchronous. Reuse exact foundation readers rather
  // than trust an earlier snapshot, report ID alone, or mutable visit contents.
  if (data.reports.length !== inspections.snapshot.reports.length)
    throw Error('Published evidence changed');
  for (const report of inspections.snapshot.reports) {
    const read = readPropertyPassportEvidence(
      model,
      report.reference,
      admission,
    );
    if (
      read.status !== 'AVAILABLE' ||
      JSON.stringify(read.evidence) !== JSON.stringify(report)
    )
      throw Error('Published evidence changed');
  }
  const authorized = new Set(c.version_ids);
  const versions = histories.flat().filter((v) => authorized.has(v.id));
  if (
    versions.length !== authorized.size ||
    new Set(versions.map((v) => v.id)).size !== versions.length ||
    !Array.isArray(jobs) ||
    jobs.length > 5000
  )
    throw Error('Ambiguous issued job sources');

  const plansFor = (job: Job) =>
    state.plans.filter(
      (p) =>
        p.job_id === job.id &&
        p.organization_id === c.organization_id &&
        p.customer_id === c.customer_id &&
        p.location_id === c.location_id &&
        reportUuid(p.id) &&
        state.plans.filter((x) => x.id === p.id).length === 1,
    );

  return jobs
    .flatMap((job) => {
      // Global internal job lists never grant customer visibility. Only the exact
      // current authorized issued version set is eligible for further validation.
      if (!job?.baseline || !authorized.has(job.baseline.issued_version_id))
        return [];
      if (
        !reportUuid(job.id) ||
        job.organization_id !== c.organization_id ||
        jobs.filter((j) => j.id === job.id).length !== 1 ||
        jobs.filter(
          (j) =>
            j.baseline?.issued_version_id === job.baseline.issued_version_id,
        ).length !== 1
      )
        throw Error('Ambiguous issued job identity');
      const v = versions.find((v) => v.id === job.baseline.issued_version_id)!;
      const authorizedSource = current.authorized.find(
        (r) => r.version_id === v.id,
      )!;
      const plans = plansFor(job);
      if (
        v.status !== 'issued' ||
        v.organization_id !== c.organization_id ||
        v.estimate_id !== authorizedSource.estimate_id ||
        v.customer_snapshot?.id !== c.customer_id ||
        v.payload.customer_id !== c.customer_id ||
        !Number.isSafeInteger(v.version_number) ||
        v.version_number < 1 ||
        v.version_number !== authorizedSource.version_number ||
        typeof v.issued_at !== 'string'
      )
        throw Error('Exact immutable issued source unavailable');
      Temporal.Instant.from(v.issued_at);
      if (
        v.payload.location_id !== c.location_id &&
        !(v.payload.location_id === null && plans.length)
      )
        throw Error('Exact issued job property unavailable');
      const review = projectIssuedReview(
        v,
        c,
        null,
        plans.length
          ? {
              ...target,
              estimate_id: v.estimate_id,
            }
          : null,
      );
      const identity: JobIdentity = {
        ...target,
        job_id: job.id,
        estimate_id: v.estimate_id,
        issued_version_id: v.id,
        issued_version_number: v.version_number,
      };
      const issued_source: IssuedJobSource = {
        ...identity,
        issued_at: v.issued_at,
        property_binding:
          v.payload.location_id === c.location_id
            ? 'issued-location-id'
            : 'existing-plan-job-id',
        property_plan_ids:
          v.payload.location_id === null ? plans.map((p) => p.id).sort() : [],
        immutable_property_snapshot: propertySnapshot(v, c),
        scope: scope(review),
      };
      if (
        JSON.stringify(issued_source.scope) !==
        JSON.stringify(authorizedSource.scope)
      )
        throw Error('Current authorized issued scope changed');
      const reports = inspections.snapshot.reports.flatMap(
        (report): ReportLink[] => {
          const raw = data.reports.filter(
            (r) =>
              r.id === report.reference.report_id &&
              r.version === report.reference.published_version,
          );
          if (raw.length !== 1 || !reportUuid(raw[0].visit_id)) return [];
          const visits = state.visits.filter(
            (visit) => visit.id === raw[0].visit_id,
          );
          if (
            visits.length !== 1 ||
            visits[0].organization_id !== c.organization_id
          )
            return [];
          const plan = plans.find((plan) => plan.id === visits[0].plan_id);
          return plan
            ? [
                {
                  reference: { ...report.reference },
                  visit_id: visits[0].id,
                  plan_id: plan.id,
                },
              ]
            : [];
        },
      );
      return [
        {
          identity,
          issued_source,
          documentation: {
            status: reports.length
              ? ('RECORDED' as const)
              : ('UNKNOWN' as const),
            reports,
            unknown_report_links: inspections.snapshot.reports
              .filter(
                (report) =>
                  !reports.some(
                    (link) =>
                      link.reference.report_id === report.reference.report_id &&
                      link.reference.published_version ===
                        report.reference.published_version,
                  ),
              )
              .map((report) => ({
                status: 'UNKNOWN' as const,
                reference: { ...report.reference },
              })),
          },
          physical_completion: 'UNVERIFIED' as const,
          warranty: 'UNVERIFIED' as const,
          customer_approval: 'UNVERIFIED' as const,
        },
      ];
    })
    .sort((a, b) => a.identity.job_id.localeCompare(b.identity.job_id));
}

/** Unwired/default OFF. Existing issued sources and exact published documentation
 * are observations; no completion ledger, archive, action or connected port. */
export async function createPropertyPassportJobHistory(
  model: CustomerPortalPreviewModel,
  boundary: ReportBoundary,
  admission: PropertyPassportAdmission = {},
): Promise<PropertyPassportJobHistory> {
  admit(model, admission);
  const target = {
    organization_id: boundary.organization_id,
    customer_id: boundary.customer_id,
    location_id: boundary.location_id,
  };
  const inspections = await createPropertyPassportFoundation(
    model,
    target,
    admission,
  );
  const captured = await sources(model, target, inspections, admission);
  const jobs: JobDocumentation[] = await Promise.all(
    captured.map(async ({ identity, ...job }) => ({
      reference: {
        ...identity,
        kind: 'job-documentation' as const,
        issued_source_sha256: await documentHash(job.issued_source),
      },
      ...job,
    })),
  );
  const snapshot = {
    ...target,
    format: 'synthetic-property-job-documentation-v1' as const,
    synthetic_only: true as const,
    coverage: 'authorized-issued-jobs-and-available-published-reports' as const,
    history_completeness: 'UNKNOWN' as const,
    physical_proof_of_work: 'UNVERIFIED' as const,
    inspections,
    jobs,
  };
  const sha256 = await documentHash(snapshot);
  const final = await sources(model, target, inspections, admission);
  if (JSON.stringify(final) !== JSON.stringify(captured))
    throw Error('Issued job documentation changed; snapshot unavailable');
  return freeze({ snapshot, integrity: { algorithm: 'SHA-256', sha256 } });
}

/** Retained IDs/digest never grant access. Missing/changed/denied remains UNKNOWN;
 * no fuzzy/latest lookup, new ID, preparation, retry or source mutation. */
export async function readPropertyPassportJobEvidence(
  model: CustomerPortalPreviewModel,
  reference: PassportJobReference,
  admission: PropertyPassportAdmission = {},
): Promise<PropertyPassportJobEvidence> {
  admit(model, admission);
  try {
    const fields = [
      'organization_id',
      'customer_id',
      'location_id',
      'job_id',
      'estimate_id',
      'issued_version_id',
      'issued_version_number',
      'kind',
      'issued_source_sha256',
    ];
    if (
      Object.keys(reference).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(reference, field)) ||
      reference.kind !== 'job-documentation' ||
      !reportUuid(reference.job_id) ||
      !reportUuid(reference.estimate_id) ||
      !reportUuid(reference.issued_version_id) ||
      !Number.isSafeInteger(reference.issued_version_number) ||
      reference.issued_version_number < 1 ||
      typeof reference.issued_source_sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(reference.issued_source_sha256)
    )
      throw Error('Invalid job documentation reference');
    // Pin primitives before await; never stringify/freeze the caller's object or
    // invoke inherited serializers to compare an evidence reference.
    const expected: PassportJobReference = {
      organization_id: reference.organization_id,
      customer_id: reference.customer_id,
      location_id: reference.location_id,
      job_id: reference.job_id,
      estimate_id: reference.estimate_id,
      issued_version_id: reference.issued_version_id,
      issued_version_number: reference.issued_version_number,
      kind: reference.kind,
      issued_source_sha256: reference.issued_source_sha256,
    };
    const history = await createPropertyPassportJobHistory(
      model,
      expected,
      admission,
    );
    const job = history.snapshot.jobs.find((job) =>
      (Object.keys(expected) as (keyof PassportJobReference)[]).every(
        (key) => job.reference[key] === expected[key],
      ),
    );
    if (job) return freeze({ status: 'AVAILABLE', evidence: job });
  } catch {
    // Current authorization/source failure never reveals a retained source.
  }
  return freeze({ status: 'UNKNOWN', evidence: null });
}
