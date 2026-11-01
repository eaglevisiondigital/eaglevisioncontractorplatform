import { Temporal } from '@js-temporal/polyfill';
import type { Customer, Row } from './operations';
import type { Job } from '../domain/jobs/financials';
import type { EstimateVersion } from '../domain/estimating/types';
import type { Worker } from '../domain/workforce/payroll';
import type { PropertyRepository } from './property';
import { fieldSchedulingPreviewEnabled } from './field-scheduling';

type Assignment = Row<'job_assignments'>;
export const fieldWorkOrdersEnabled = fieldSchedulingPreviewEnabled;
export interface CrewMember {
  worker_id: string;
  user_id: string;
  label: string;
}
export interface WorkOrder {
  source: {
    organization_id: string;
    job_id: string;
    job_revision: number;
    estimate_id: string;
    issued_version_id: string;
    issued_version_number: number;
  };
  title: string;
  customer: { id: string; label: string };
  baseline_property: { id: string; label: string } | null;
  crew: CrewMember[];
  assignment_state: 'KNOWN' | 'UNKNOWN';
  scope: {
    id: string;
    description: string;
    quantity_milli: number;
    unit: string;
  }[];
  visits: {
    id: string;
    revision: number;
    plan_id: string;
    plan_revision: number;
    customer_id: string;
    location_id: string;
    property_label: string;
    plan_name: string;
    date: string;
    timezone: string;
    status: 'draft' | 'submitted' | 'published';
  }[];
  recorded_time: {
    id: string;
    worker_id: string;
    started_at: string;
    ended_at: string | null;
    kind: 'work' | 'break_paid' | 'break';
  }[];
}
export interface WorkOrderModel {
  organization_id: string;
  actor: string;
  manager: boolean;
  timezone: string;
  crew: CrewMember[];
  orders: WorkOrder[];
}
type Claim = {
  repo: PropertyRepository;
  org: string;
  actor: string;
  manager: boolean;
  job: Job;
  version: EstimateVersion;
  assignments: Assignment[];
  propertyState: string;
  display: string;
};
const claims = new WeakMap<WorkOrder, Claim>();
const copy = <T>(value: T): T => structuredClone(value);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function eligible(repo: PropertyRepository, org: string, actor: string) {
  if (!repo.operations.sample || !repo.estimates.sample)
    throw Error('Local synthetic field records only');
  const member = repo.operations
    .syntheticMemberships(org)
    .find((m) => m.user_id === actor && m.active);
  const manager =
    !!member &&
    (['owner', 'admin'].includes(member.role) ||
      (member.role === 'staff' && member.staff_type === 'office_manager'));
  if (
    !manager &&
    !(member?.role === 'staff' && member.staff_type === 'field_staff')
  )
    throw Error('Current eligible sample office or field staff required');
  return manager;
}
function currentCrew(repo: PropertyRepository, org: string, workers: Worker[]) {
  const members = repo.operations.syntheticMemberships(org);
  return workers
    .filter(
      (w) =>
        w.organization_id === org &&
        w.active &&
        members.some(
          (m) =>
            m.user_id === w.user_id &&
            m.active &&
            (['owner', 'admin'].includes(m.role) ||
              (m.role === 'staff' &&
                ['office_manager', 'field_staff'].includes(m.staff_type))),
        ),
    )
    .map((w) => ({
      worker_id: w.id,
      user_id: w.user_id,
      label: w.display_name,
    }));
}
async function customers(
  repo: PropertyRepository,
  org: string,
  assertAccess: () => void,
) {
  const rows: Customer[] = [];
  for (let page = 0; ; page++) {
    const result = await repo.operations.listCustomers(org, '', '', page);
    assertAccess();
    if (result.rows.some((c) => c.organization_id !== org))
      throw Error('Foreign CRM source unavailable');
    rows.push(...result.rows);
    if (rows.length >= result.count) return rows;
    if (!result.rows.length) throw Error('CRM coverage UNKNOWN');
  }
}
/** Only reads existing sample business objects; no connected fallback or new work store. */
export async function readFieldWorkOrders(
  repo: PropertyRepository,
  org: string,
  actor: string,
): Promise<WorkOrderModel> {
  const manager = eligible(repo, org, actor);
  const assertAccess = () => {
    if (eligible(repo, org, actor) !== manager)
      throw Error('Sample staff access changed. Reload field records.');
  };
  const [jobs, workforce, summaries, crm] = await Promise.all([
    repo.estimates.jobs(org),
    repo.estimates.workforce(org),
    repo.estimates.list(org),
    customers(repo, org, assertAccess),
  ]);
  assertAccess();
  const versions = (
    await Promise.all(summaries.map((s) => repo.estimates.history(org, s.id)))
  ).flat();
  assertAccess();
  const assignments = repo.estimates.syntheticJobAssignments(org, actor);
  const crew = currentCrew(repo, org, workforce.workers);
  if (
    new Set(jobs.map((j) => j.id)).size !== jobs.length ||
    new Set(crew.map((w) => w.user_id)).size !== crew.length ||
    new Set(
      assignments.map((a) =>
        assignmentKey(a.organization_id, a.job_id, a.user_id),
      ),
    ).size !== assignments.length ||
    assignments.some(
      (a) =>
        a.organization_id !== org ||
        typeof a.active !== 'boolean' ||
        !jobs.some((j) => j.id === a.job_id),
    )
  )
    throw Error('Exact job or crew relationship ambiguous');
  if (!manager && !crew.some((w) => w.user_id === actor))
    throw Error('Current active sample worker required');
  const state = repo.read(org);
  const orders: WorkOrder[] = [];
  for (const job of jobs) {
    if (job.organization_id !== org)
      throw Error('Foreign job source unavailable');
    const linked = assignments.filter(
      (a) => a.organization_id === org && a.job_id === job.id,
    );
    const own = linked.some((a) => a.user_id === actor && a.active);
    if (!manager && !own) continue;
    const sources = versions.filter(
      (v) =>
        v.id === job.baseline.issued_version_id &&
        v.organization_id === org &&
        v.status === 'issued',
    );
    if (sources.length !== 1) throw Error('Exact issued job baseline UNKNOWN');
    const version = sources[0];
    const customer = crm.find((c) => c.id === version.payload.customer_id);
    const summary = summaries.find(
      (s) =>
        s.id === version.estimate_id &&
        s.organization_id === org &&
        s.customer_id === customer?.id,
    );
    if (!customer || !summary)
      throw Error('Current exact job customer UNKNOWN');
    const locations = await repo.operations.listLocations(org, customer.id);
    assertAccess();
    const location = locations.find(
      (l) =>
        l.id === version.payload.location_id &&
        l.organization_id === org &&
        l.customer_id === customer.id,
    );
    if (version.payload.location_id && !location)
      throw Error('Exact baseline property UNKNOWN');
    const assigned = linked
      .filter((a) => a.active)
      .map((a) => crew.find((w) => w.user_id === a.user_id));
    const plans = state.plans.filter((p) => p.job_id === job.id);
    const visits: WorkOrder['visits'] = [];
    for (const plan of plans) {
      const property = locations.find(
        (l) =>
          l.id === plan.location_id &&
          l.organization_id === org &&
          l.customer_id === customer.id,
      );
      if (
        plan.organization_id !== org ||
        plan.customer_id !== customer.id ||
        !property ||
        (location && location.id !== plan.location_id)
      )
        throw Error('Exact inspection job/property association UNKNOWN');
      repo.operations.syntheticProperty(org, customer.id, property.id);
      for (const visit of state.visits.filter((v) => v.plan_id === plan.id)) {
        if (visit.organization_id !== org)
          throw Error('Foreign inspection source unavailable');
        Temporal.PlainDate.from(visit.visited_on, { overflow: 'reject' });
        Temporal.Now.zonedDateTimeISO(plan.timezone);
        visits.push({
          id: visit.id,
          revision: visit.revision,
          plan_id: plan.id,
          plan_revision: plan.revision,
          customer_id: plan.customer_id,
          location_id: plan.location_id,
          property_label: property.address_line1,
          plan_name: plan.name,
          date: visit.visited_on,
          timezone: plan.timezone,
          status: visit.status,
        });
      }
    }
    const included = version.payload.lines.filter((l) =>
      version.calculation.lines.some((c) => c.id === l.id && c.included),
    );
    if (!same(job.baseline.lines, included))
      throw Error('Exact immutable baseline scope UNKNOWN');
    const order: WorkOrder = {
      source: {
        organization_id: org,
        job_id: job.id,
        job_revision: job.lock_revision,
        estimate_id: version.estimate_id,
        issued_version_id: version.id,
        issued_version_number: version.version_number,
      },
      title: job.name,
      customer: { id: customer.id, label: customer.display_name },
      baseline_property: location
        ? { id: location.id, label: location.address_line1 }
        : null,
      crew: assigned.filter((w): w is CrewMember => !!w),
      assignment_state:
        assigned.length && assigned.every(Boolean) ? 'KNOWN' : 'UNKNOWN',
      scope: included.map((l) => ({
        id: l.id,
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
      })),
      visits: visits.sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      ),
      recorded_time: workforce.entries
        .filter(
          (e) =>
            e.job_id === job.id &&
            assigned.some((w) => w?.worker_id === e.worker_id) &&
            (manager ||
              crew.find((w) => w.user_id === actor)?.worker_id === e.worker_id),
        )
        .map((e) => ({
          id: e.id,
          worker_id: e.worker_id,
          started_at: e.started_at,
          ended_at: e.ended_at,
          kind: e.kind,
        })),
    };
    claims.set(order, {
      repo,
      org,
      actor,
      manager,
      job,
      version,
      assignments: linked,
      propertyState: JSON.stringify({
        plans,
        visits: state.visits.filter((v) =>
          plans.some((p) => p.id === v.plan_id),
        ),
      }),
      display: JSON.stringify(order),
    });
    orders.push(order);
  }
  const [currentJobs, currentWorkforce] = await Promise.all([
    repo.estimates.jobs(org),
    repo.estimates.workforce(org),
  ]);
  assertAccess();
  // Reject changes during asynchronous reads instead of returning a mixed source.
  if (
    !same(jobs, currentJobs) ||
    !same(workforce.workers, currentWorkforce.workers) ||
    !same(workforce.entries, currentWorkforce.entries) ||
    workforce.policy?.timezone !== currentWorkforce.policy?.timezone ||
    !same(state.plans, repo.read(org).plans) ||
    !same(state.visits, repo.read(org).visits) ||
    !same(assignments, repo.estimates.syntheticJobAssignments(org, actor)) ||
    !same(crew, currentCrew(repo, org, workforce.workers))
  )
    throw Error('Crew source changed. Reload field records.');
  Temporal.Now.zonedDateTimeISO(workforce.policy?.timezone ?? 'UTC');
  assertAccess();
  return {
    organization_id: org,
    actor,
    manager,
    timezone: workforce.policy?.timezone ?? 'UTC',
    crew: manager ? crew : crew.filter((w) => w.user_id === actor),
    orders,
  };
}
/** A stale or copied card cannot navigate to a different job, source or crew. */
export async function openFieldWorkOrder(
  repo: PropertyRepository,
  org: string,
  actor: string,
  order: WorkOrder,
) {
  const claim = claims.get(order);
  if (
    !claim ||
    claim.repo !== repo ||
    claim.org !== org ||
    claim.actor !== actor ||
    claim.display !== JSON.stringify(order)
  )
    throw Error('Exact retained work-order reference required');
  if (eligible(repo, org, actor) !== claim.manager)
    throw Error('Sample staff access changed. Reload field records.');
  const current = (await readFieldWorkOrders(repo, org, actor)).orders.find(
    (o) => o.source.job_id === claim.job.id,
  );
  if (eligible(repo, org, actor) !== claim.manager)
    throw Error('Sample staff access changed. Reload field records.');
  const fresh = current && claims.get(current);
  if (
    !current ||
    !fresh ||
    !same(claim.job, fresh.job) ||
    !same(claim.version, fresh.version) ||
    claim.propertyState !== fresh.propertyState ||
    !same(current, order)
  )
    throw Error(
      'Work-order source changed or access unavailable. Reload field records.',
    );
  return current;
}
export function dailyCrewSchedule(
  model: WorkOrderModel,
  day: string,
  worker = '',
  property = '',
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw Error('Choose a valid calendar date');
  const date = Temporal.PlainDate.from(day, { overflow: 'reject' });
  const start = date
    .toZonedDateTime(model.timezone)
    .toInstant().epochMilliseconds;
  const end = date
    .add({ days: 1 })
    .toZonedDateTime(model.timezone)
    .toInstant().epochMilliseconds;
  const selected = model.orders.filter(
    (o) => !worker || o.crew.some((w) => w.worker_id === worker),
  );
  return {
    visits: selected.flatMap((order) =>
      order.visits
        .filter(
          (v) => v.date === day && (!property || v.location_id === property),
        )
        .map((visit) => ({ order, visit })),
    ),
    recorded: selected.flatMap((order) =>
      order.recorded_time
        .filter(
          (e) =>
            (!worker || e.worker_id === worker) &&
            (!property || order.baseline_property?.id === property) &&
            Temporal.Instant.from(e.started_at).epochMilliseconds < end &&
            (!e.ended_at ||
              Temporal.Instant.from(e.ended_at).epochMilliseconds > start),
        )
        .map((entry) => ({ order, entry })),
    ),
  };
}

export interface CrewAssignmentReview {
  order: WorkOrder;
  target: CrewMember;
  current_active: boolean | null;
}
type Attempt = {
  review: CrewAssignmentReview;
  status: 'PREPARED' | 'UNKNOWN';
  acknowledged: boolean;
};
const reviews = new WeakMap<
  CrewAssignmentReview,
  {
    repo: PropertyRepository;
    org: string;
    actor: string;
    claim: Claim;
    display: string;
  }
>();
const attempts = new WeakMap<PropertyRepository, Map<string, Attempt>>();
const assignmentKey = (org: string, job: string, user: string) =>
  JSON.stringify([org, job, user]);
function attemptMap(repo: PropertyRepository) {
  let map = attempts.get(repo);
  if (!map) {
    map = new Map();
    attempts.set(repo, map);
  }
  return map;
}
export async function reviewCrewAssignment(
  repo: PropertyRepository,
  org: string,
  actor: string,
  order: WorkOrder,
  user: string,
): Promise<CrewAssignmentReview> {
  if (!eligible(repo, org, actor))
    throw Error('Current eligible sample office reviewer required');
  const current = await openFieldWorkOrder(repo, org, actor, order);
  if (!eligible(repo, org, actor))
    throw Error('Current eligible sample office reviewer required');
  const claim = claims.get(current)!;
  const model = await readFieldWorkOrders(repo, org, actor);
  if (!eligible(repo, org, actor) || !model.manager)
    throw Error('Current eligible sample office reviewer required');
  const currentOrder = model.orders.find(
    (o) => o.source.job_id === current.source.job_id,
  );
  const currentClaim = currentOrder && claims.get(currentOrder);
  if (
    !currentOrder ||
    !currentClaim ||
    !same(currentOrder, current) ||
    !same(currentClaim.job, claim.job) ||
    !same(currentClaim.version, claim.version) ||
    currentClaim.propertyState !== claim.propertyState
  )
    throw Error('Work-order source changed. Reload field records.');
  const target = model.crew.find((w) => w.user_id === user);
  if (!target) throw Error('Current eligible active sample worker required');
  if (attemptMap(repo).has(assignmentKey(org, current.source.job_id, user)))
    throw Error(
      'Assignment already attempted. Exact read-only inspection only.',
    );
  const existing = claim.assignments.filter((a) => a.user_id === user);
  if (existing.length > 1 || existing[0]?.active)
    throw Error('Crew relationship already active or ambiguous');
  const review = {
    order: current,
    target: copy(target),
    current_active: existing[0]?.active ?? null,
  };
  reviews.set(review, {
    repo,
    org,
    actor,
    claim,
    display: JSON.stringify(review),
  });
  return review;
}
function assertReviewCurrent(
  review: CrewAssignmentReview,
  expectedActive: boolean | null,
) {
  const retained = reviews.get(review);
  if (!retained || retained.display !== JSON.stringify(review))
    throw Error('Exact retained assignment review required');
  const { repo, org, actor, claim } = retained;
  if (!eligible(repo, org, actor))
    throw Error('Current eligible sample office reviewer required');
  const rows = repo.estimates.syntheticJobAssignments(org, actor);
  const assignment = rows.filter(
    (a) =>
      a.organization_id === org &&
      a.job_id === claim.job.id &&
      a.user_id === review.target.user_id,
  );
  if (
    assignment.length > 1 ||
    (assignment[0]?.active ?? null) !== expectedActive
  )
    throw Error('Reviewed assignment changed');
  const state = repo.read(org);
  const plans = state.plans.filter((p) => p.job_id === claim.job.id);
  if (
    claim.propertyState !==
    JSON.stringify({
      plans,
      visits: state.visits.filter((v) => plans.some((p) => p.id === v.plan_id)),
    })
  )
    throw Error('Reviewed inspection source changed');
  if (review.order.baseline_property)
    repo.operations.syntheticProperty(
      org,
      review.order.customer.id,
      review.order.baseline_property.id,
    );
  for (const visit of review.order.visits)
    repo.operations.syntheticProperty(
      org,
      visit.customer_id,
      visit.location_id,
    );
  return retained;
}
/** One exact local relationship update. An uncertain acknowledgement never permits replay. */
export async function confirmCrewAssignment(
  review: CrewAssignmentReview,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error('Explicit current crew review confirmation required');
  const retained = assertReviewCurrent(review, review.current_active);
  const { repo, org, actor } = retained;
  const key = assignmentKey(
    org,
    review.order.source.job_id,
    review.target.user_id,
  );
  const map = attemptMap(repo);
  if (map.has(key))
    throw Error(
      'Assignment already attempted. Exact read-only inspection only.',
    );
  const attempt: Attempt = { review, status: 'UNKNOWN', acknowledged: false };
  map.set(key, attempt); // Reserve before the first await; no component/review recreation bypass.
  try {
    await repo.estimates.assignJob(
      org,
      review.order.source.job_id,
      review.target.user_id,
      true,
      {
        reviewer: actor,
        job_revision: review.order.source.job_revision,
        issued_version_id: review.order.source.issued_version_id,
        expected_active: review.current_active,
        assertCurrent: () => {
          assertReviewCurrent(review, review.current_active);
        },
      },
    );
    attempt.acknowledged = true;
    return await reconcileCrewAssignment(review);
  } catch {
    return {
      status: 'UNKNOWN' as const,
      job_id: review.order.source.job_id,
      user_id: review.target.user_id,
    };
  }
}
export async function reconcileCrewAssignment(review: CrewAssignmentReview) {
  const retained = reviews.get(review);
  if (!retained) throw Error('Exact retained assignment review required');
  const { repo, org, actor, claim } = retained;
  const attempt = attemptMap(repo).get(
    assignmentKey(org, claim.job.id, review.target.user_id),
  );
  if (!attempt || attempt.review !== review)
    throw Error('Exact retained assignment attempt required');
  try {
    assertReviewCurrent(review, true);
    const model = await readFieldWorkOrders(repo, org, actor);
    assertReviewCurrent(review, true);
    if (!model.manager)
      throw Error('Current eligible sample office reviewer required');
    const current = model.orders.find((o) => o.source.job_id === claim.job.id);
    const fresh = current && claims.get(current);
    if (
      !fresh ||
      !same(claim.job, fresh.job) ||
      !same(claim.version, fresh.version) ||
      !current.crew.some((w) => same(w, review.target))
    )
      throw Error('Exact current assignment evidence UNKNOWN');
    // The existing Row has no command receipt or assignment revision. A matching
    // current relationship cannot retrospectively acknowledge an uncertain write.
    attempt.status = attempt.acknowledged ? 'PREPARED' : 'UNKNOWN';
    return {
      status: attempt.status,
      current_relationship: 'ACTIVE' as const,
      job_id: claim.job.id,
      user_id: review.target.user_id,
    };
  } catch {
    attempt.status = 'UNKNOWN';
    return {
      status: 'UNKNOWN' as const,
      job_id: claim.job.id,
      user_id: review.target.user_id,
    };
  }
}
