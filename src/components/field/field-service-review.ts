import type { PropertyRepository } from '../../lib/property';
import {
  openFieldOrigin,
  openFieldSource,
  readFieldSchedule,
  type FieldVisitReference,
} from '../../lib/field-scheduling';
import {
  readFieldWorkOrders,
  openFieldWorkOrder,
  fieldWorkOrderBinding,
  type WorkOrder,
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
async function fieldVisitJobSource(
  repo: PropertyRepository,
  org: string,
  actor: string,
  ref: FieldVisitReference,
): Promise<{ scope: MarginScope; order: WorkOrder } | null> {
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
    order: current,
    scope: {
      organizationId: org,
      jobId,
      jobRevision: current.source.job_revision,
      estimateId: current.source.estimate_id,
      issuedVersionId: current.source.issued_version_id,
      customerId: ref.customer_id,
      propertyId: current.baseline_property?.id ?? null,
      currency: job.baseline.currency,
    },
  };
}

/** Existing cost-navigation contract remains unchanged. */
export async function fieldVisitCostScope(
  repo: PropertyRepository,
  org: string,
  actor: string,
  ref: FieldVisitReference,
): Promise<MarginScope | null> {
  return (await fieldVisitJobSource(repo, org, actor, ref))?.scope ?? null;
}

/** Inspect only the issued producer source matching the cost review already open. */
export async function fieldVisitIssuedJobSource(
  repo: PropertyRepository,
  org: string,
  actor: string,
  ref: FieldVisitReference,
  scope: MarginScope,
) {
  const source = await fieldVisitJobSource(repo, org, actor, ref);
  if (!source) throw Error('Issued job source UNKNOWN');
  assertFieldIssuedJobSource(repo, org, actor, ref, scope, source.order);
  return source.order;
}

/** Synchronous render/navigation fence over original canonical objects, no authority renewal. */
export function assertFieldIssuedJobSource(
  repo: PropertyRepository,
  org: string,
  actor: string,
  ref: FieldVisitReference,
  scope: MarginScope,
  order: WorkOrder,
) {
  fieldWorkOrderBinding(repo, org, actor, order);
  openFieldSource(repo, org, actor, ref);
  const job = repo.estimates.syntheticJob(org, order.source.job_id);
  const state = repo.read(org);
  const plan = state.plans.find((p) => p.id === ref.plan_id);
  if (
    !job ||
    plan?.job_id !== job.id ||
    job.lock_revision !== order.source.job_revision ||
    job.baseline.issued_version_id !== order.source.issued_version_id
  )
    throw Error('Issued job source changed. Refresh the original review.');
  const expected: MarginScope = {
    organizationId: org,
    jobId: order.source.job_id,
    jobRevision: order.source.job_revision,
    estimateId: order.source.estimate_id,
    issuedVersionId: order.source.issued_version_id,
    customerId: ref.customer_id,
    propertyId: order.baseline_property?.id ?? null,
    currency: job.baseline.currency,
  };
  const keys = Object.keys(expected) as (keyof MarginScope)[];
  const descriptors = Object.getOwnPropertyDescriptors(scope);
  if (
    Object.getPrototypeOf(scope) !== Object.prototype ||
    Reflect.ownKeys(scope).length !== keys.length ||
    keys.some(
      (key) =>
        !descriptors[key] ||
        !('value' in descriptors[key]) ||
        descriptors[key].value !== expected[key],
    ) ||
    order.customer.id !== ref.customer_id ||
    order.source.organization_id !== ref.organization_id ||
    (order.baseline_property !== null &&
      order.baseline_property.id !== ref.location_id) ||
    JSON.stringify(order.scope) !==
      JSON.stringify(
        job.baseline.lines.map((line) => ({
          id: line.id,
          description: line.description,
          quantity_milli: line.quantity_milli,
          unit: line.unit,
        })),
      )
  )
    throw Error('Exact issued source/cost identity required');
  const rows = readFieldSchedule(repo, org, actor).rows.filter(
    (row) =>
      row.source.customer_id === ref.customer_id &&
      row.source.location_id === ref.location_id &&
      state.plans.some(
        (p) => p.id === row.source.plan_id && p.job_id === job.id,
      ),
  );
  const visits = order.visits.filter(
    (v) =>
      v.customer_id === ref.customer_id && v.location_id === ref.location_id,
  );
  if (
    rows.length !== visits.length ||
    visits.some(
      (v) =>
        !rows.some(
          (row) =>
            row.source.visit_id === v.id &&
            row.source.visit_revision === v.revision &&
            row.source.plan_id === v.plan_id &&
            row.source.plan_revision === v.plan_revision &&
            row.date === v.date &&
            row.status === v.status,
        ),
    )
  )
    throw Error('Recorded job visits changed. Refresh the original review.');
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
