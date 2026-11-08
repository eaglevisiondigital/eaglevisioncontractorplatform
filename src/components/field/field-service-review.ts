import type { PropertyRepository } from '../../lib/property';
import {
  openFieldOrigin,
  openFieldSource,
  type FieldVisitReference,
} from '../../lib/field-scheduling';
import {
  readFieldWorkOrders,
  openFieldWorkOrder,
} from '../../lib/field-work-orders';
import { projectPublishedHistory } from '../../domain/property/report-page';
import { LocalJobMarginReader } from '../../lib/job-margin-analysis';
import type { CompletionReviewAdmission } from '../../lib/job-cost-completion';
import type {
  MarginReviewInput,
  MarginScope,
} from '../../domain/jobs/margin-analysis';

type Selection = ReturnType<typeof openFieldSource> & { finding_id?: string };

/** Reuse the original source admission and Passport's allowlisted report projection. */
export function fieldServiceDocumentation(
  repo: PropertyRepository,
  org: string,
  actor: string,
  selected: Selection,
) {
  const ref = selected.row.source;
  let current: Selection;
  if (!selected.published) {
    const visit = openFieldSource(repo, org, actor, ref);
    if (visit.row.reports.length !== 1) return null;
    current = openFieldSource(repo, org, actor, ref, visit.row.reports[0]);
  } else if (selected.published.visit_id === ref.visit_id) {
    current = openFieldSource(repo, org, actor, ref, selected.published);
  } else {
    const origin = selected.row.follow_up_sources.find(
      (source) =>
        source.report_id === selected.published!.id &&
        source.report_version === selected.published!.version &&
        source.finding_id === selected.finding_id,
    );
    if (!origin) throw Error('Exact originating documentation UNKNOWN');
    current = openFieldOrigin(repo, org, actor, ref, origin);
  }
  if (!current.published) return null;
  return projectPublishedHistory([current.published], {
    organization_id: ref.organization_id,
    customer_id: ref.customer_id,
    location_id: ref.location_id,
  });
}

/** Navigation only. The existing margin reader retains financial authorization. */
export async function fieldVisitCostScope(
  repo: PropertyRepository,
  org: string,
  actor: string,
  ref: FieldVisitReference,
): Promise<MarginScope | null> {
  openFieldSource(repo, org, actor, ref);
  const jobId = repo.read(org).plans.find((p) => p.id === ref.plan_id)?.job_id;
  if (!jobId) return null;
  const model = await readFieldWorkOrders(repo, org, actor);
  const order = model.orders.find((o) => o.source.job_id === jobId);
  if (!order) return null;
  const current = await openFieldWorkOrder(repo, org, actor, order);
  openFieldSource(repo, org, actor, ref);
  const plan = repo.read(org).plans.find((p) => p.id === ref.plan_id);
  if (
    plan?.job_id !== jobId ||
    current.source.organization_id !== ref.organization_id ||
    current.customer.id !== ref.customer_id ||
    (current.baseline_property !== null &&
      current.baseline_property.id !== ref.location_id) ||
    !current.visits.some(
      (v) =>
        v.id === ref.visit_id &&
        v.revision === ref.visit_revision &&
        v.plan_id === ref.plan_id &&
        v.plan_revision === ref.plan_revision &&
        v.customer_id === ref.customer_id &&
        v.location_id === ref.location_id,
    )
  )
    throw Error('Exact visit/job relationship UNKNOWN');
  const job = repo.estimates.syntheticJob(org, jobId);
  if (
    !job ||
    job.lock_revision !== current.source.job_revision ||
    job.baseline.issued_version_id !== current.source.issued_version_id
  )
    throw Error('Exact job source changed');
  return {
    organizationId: org,
    jobId,
    jobRevision: current.source.job_revision,
    estimateId: current.source.estimate_id,
    issuedVersionId: current.source.issued_version_id,
    customerId: ref.customer_id,
    propertyId: current.baseline_property?.id ?? null,
    currency: job.baseline.currency,
  };
}

/** Keep the original visit relationship current across the existing financial read. */
export function fieldVisitMarginReader(
  repo: PropertyRepository,
  org: string,
  actor: string,
  reference: FieldVisitReference,
  inputScope: MarginScope,
): LocalJobMarginReader {
  const ref = structuredClone(reference),
    scope = structuredClone(inputScope);
  const check = (request: MarginScope, user: string) => {
    if (user !== actor || JSON.stringify(request) !== JSON.stringify(scope))
      throw Error('Original visit cost target required');
    openFieldSource(repo, org, actor, ref);
    const plan = repo.read(org).plans.find((p) => p.id === ref.plan_id);
    if (
      scope.organizationId !== org ||
      scope.customerId !== ref.customer_id ||
      (scope.propertyId !== null && scope.propertyId !== ref.location_id) ||
      plan?.job_id !== scope.jobId
    )
      throw Error('Exact visit/job relationship UNKNOWN');
  };
  return new (class extends LocalJobMarginReader {
    override async read(
      request: MarginScope,
      user: string,
      review: MarginReviewInput | null = null,
    ) {
      check(request, user);
      const result = await super.read(request, user, review);
      check(request, user);
      return result;
    }
    override async readCompletion(
      request: MarginScope,
      user: string,
      admission: CompletionReviewAdmission = {
        enabled: false,
        confirmed: false,
      },
    ) {
      check(request, user);
      const result = await super.readCompletion(request, user, admission);
      check(request, user);
      return result;
    }
  })(repo.estimates, true);
}
