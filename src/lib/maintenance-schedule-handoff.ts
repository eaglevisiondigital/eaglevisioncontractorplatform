import {
  maintenanceDate,
  maintenanceKey,
  type MaintenanceSource,
  type MaintenanceRecord,
} from '../domain/property/maintenance';
import type {
  InspectionPlan,
  PublishedReport,
  Visit,
} from '../domain/property/inspections';
import type { PropertyRepository } from './property';
import {
  fieldSchedulingPreviewEnabled,
  readFieldSchedule,
  type FieldVisitRow,
} from './field-scheduling';

export const maintenanceScheduleHandoffEnabled = fieldSchedulingPreviewEnabled;
export interface HandoffSelection {
  source: MaintenanceSource;
  plan_id: string;
  plan_revision: number;
  date: string;
}
export interface ScheduleCandidate {
  source: MaintenanceSource;
  customer_name: string;
  property_label: string;
  observation: string;
  recommendation: string;
  severity: string;
  report: PublishedReport;
  record: Pick<
    MaintenanceRecord,
    'revision' | 'review' | 'priority' | 'follow_up_on' | 'scheduled_visit_id'
  >;
  responsibility: string;
  plans: Pick<InspectionPlan, 'id' | 'revision' | 'name' | 'timezone'>[];
}
export interface ScheduleReview {
  id: string;
  candidate: ScheduleCandidate;
  selected_plan: Pick<InspectionPlan, 'id' | 'revision' | 'name' | 'timezone'>;
  source_visit: { id: string; revision: number };
  source_plan: { id: string; revision: number };
  date: string;
  reviewer_id: string;
}
export interface HandoffOutcome {
  status: 'prepared' | 'unknown';
  source: MaintenanceSource;
  date: string;
  selected_plan_id: string;
  selected_plan_revision: number;
  visit: FieldVisitRow | null;
}
const clone = <T>(value: T): T => structuredClone(value);
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
function selection(input: HandoffSelection) {
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      'date,plan_id,plan_revision,source' ||
    !input.source ||
    Object.keys(input.source).sort().join(',') !==
      'customer_id,finding_id,location_id,organization_id,report_id,report_version' ||
    Object.entries(input.source).some(([k, v]) =>
      k === 'report_version'
        ? !Number.isSafeInteger(v) || Number(v) < 1
        : typeof v !== 'string' || !v || v.length > 200,
    ) ||
    typeof input.plan_id !== 'string' ||
    !input.plan_id ||
    !Number.isSafeInteger(input.plan_revision) ||
    input.plan_revision < 1
  )
    throw Error('Exact inspection scheduling selection required.');
  maintenanceDate(input.date);
  return clone(input);
}
export function maintenanceScheduleCandidates(
  repo: PropertyRepository,
  org: string,
  actor: string,
): ScheduleCandidate[] {
  const queue = repo.maintenance(org, actor),
    state = repo.read(org);
  return queue.items.map((item) => ({
    source: clone(item.source),
    customer_name: item.customer_name,
    property_label: item.property_label,
    observation: item.finding.description,
    recommendation: item.finding.recommendation,
    severity: item.finding.severity,
    report: clone(item.report),
    record: {
      revision: item.record.revision,
      review: item.record.review,
      priority: item.record.priority,
      follow_up_on: item.record.follow_up_on,
      scheduled_visit_id: item.record.scheduled_visit_id,
    },
    responsibility: item.record.assignee_id
      ? (queue.members.find((m) => m.user_id === item.record.assignee_id)
          ?.label ?? 'Unavailable — current staff relationship unverified')
      : 'Unassigned',
    plans: state.plans
      .filter(
        (p) =>
          p.organization_id === org &&
          p.customer_id === item.source.customer_id &&
          p.location_id === item.source.location_id,
      )
      .map((p) => ({
        id: p.id,
        revision: p.revision,
        name: p.name,
        timezone: p.timezone,
      })),
  }));
}
function capture(
  repo: PropertyRepository,
  org: string,
  actor: string,
  input: HandoffSelection,
) {
  const queue = repo.maintenance(org, actor),
    state = repo.read(org);
  const item = queue.items.find(
    (i) => canonical(i.source) === canonical(input.source),
  );
  const plan = state.plans.find(
    (p) =>
      p.id === input.plan_id &&
      p.revision === input.plan_revision &&
      p.organization_id === org &&
      p.customer_id === input.source.customer_id &&
      p.location_id === input.source.location_id,
  );
  const originVisit =
    item &&
    state.visits.find(
      (v) => v.id === item.report.visit_id && v.organization_id === org,
    );
  const originPlan =
    originVisit &&
    state.plans.find(
      (p) => p.id === originVisit.plan_id && p.organization_id === org,
    );
  const contexts = plan
    ? state.contexts.filter(
        (c) =>
          c.customer_id === plan.customer_id &&
          c.location_id === plan.location_id &&
          c.job_id === plan.job_id,
      )
    : [];
  if (
    !item ||
    input.source.organization_id !== org ||
    !plan ||
    !originVisit ||
    !originPlan ||
    contexts.length !== 1
  )
    throw Error('Current exact report/property/plan source unavailable.');
  if (
    item.record.assignee_id &&
    !queue.members.some(
      (m) => m.user_id === item.record.assignee_id && m.active,
    )
  )
    throw Error('Current responsible staff relationship unavailable.');
  repo.operations.syntheticProperty(org, plan.customer_id, plan.location_id);
  const candidate = maintenanceScheduleCandidates(repo, org, actor).find(
    (c) => canonical(c.source) === canonical(input.source),
  )!;
  const binding = {
    source: input.source,
    report: item.report,
    finding: item.finding,
    record: item.record,
    originVisit: { id: originVisit.id, revision: originVisit.revision },
    originPlan,
    plan,
    context: contexts[0],
  };
  return {
    binding,
    candidate,
    key: canonical([
      org,
      input.source.customer_id,
      input.source.location_id,
      originVisit.id,
      input.source.finding_id,
    ]),
  };
}
type Binding = ReturnType<typeof capture>['binding'];
interface ReviewClaim {
  repo: PropertyRepository;
  org: string;
  actor: string;
  input: HandoffSelection;
  binding: Binding;
  view: string;
  key: string;
}
interface Attempt {
  claim: ReviewClaim;
  outcome: HandoffOutcome;
}
// Attempt custody only. Actual records remain exclusively in the existing repository.
// Shared across adapter/component recreation; intentionally not refresh/crash durability.
const attempts = new WeakMap<PropertyRepository, Map<string, Attempt>>();
const reviews = new WeakMap<ScheduleReview, ReviewClaim>();
export class MaintenanceScheduleHandoff {
  constructor(
    private repo: PropertyRepository,
    private org: string,
    private actor: string,
  ) {}
  candidates() {
    return maintenanceScheduleCandidates(this.repo, this.org, this.actor);
  }
  review(raw: HandoffSelection): ScheduleReview {
    const input = selection(raw),
      current = capture(this.repo, this.org, this.actor, input);
    if (attempts.get(this.repo)?.has(current.key))
      throw Error(
        'A scheduling attempt is already retained. Exact read-only reconciliation only.',
      );
    if (current.binding.record.scheduled_visit_id)
      throw Error(
        'An existing follow-up draft is already linked. Inspect it; do not prepare another.',
      );
    if (current.binding.record.review !== 'pending')
      throw Error('Reopen the existing maintenance review before scheduling.');
    if (
      this.repo
        .read(this.org)
        .visits.some(
          (v) => v.plan_id === input.plan_id && v.visited_on === input.date,
        )
    )
      throw Error('A visit already exists for this plan and date.');
    const view: ScheduleReview = {
      id: crypto.randomUUID(),
      candidate: current.candidate,
      selected_plan: {
        id: current.binding.plan.id,
        revision: current.binding.plan.revision,
        name: current.binding.plan.name,
        timezone: current.binding.plan.timezone,
      },
      source_visit: current.binding.originVisit,
      source_plan: {
        id: current.binding.originPlan.id,
        revision: current.binding.originPlan.revision,
      },
      date: input.date,
      reviewer_id: this.actor,
    };
    reviews.set(view, {
      repo: this.repo,
      org: this.org,
      actor: this.actor,
      input,
      binding: clone(current.binding),
      view: canonical(view),
      key: current.key,
    });
    return view;
  }
  async prepare(
    review: ScheduleReview,
    raw: HandoffSelection,
    confirmed: boolean,
  ): Promise<HandoffOutcome> {
    const claim = reviews.get(review),
      input = selection(raw);
    if (
      confirmed !== true ||
      !claim ||
      claim.repo !== this.repo ||
      claim.org !== this.org ||
      claim.actor !== this.actor ||
      claim.view !== canonical(review) ||
      canonical(input) !== canonical(claim.input)
    )
      throw Error('Confirm the exact current reviewed source, plan and date.');
    const fresh = capture(this.repo, this.org, this.actor, input);
    if (canonical(fresh.binding) !== canonical(claim.binding))
      throw Error(
        'Source, plan, context or maintenance revision changed. Review current records again.',
      );
    const registry = attempts.get(this.repo) ?? new Map<string, Attempt>();
    attempts.set(this.repo, registry);
    if (registry.has(claim.key))
      throw Error(
        'Scheduling already attempted. Exact read-only reconciliation only.',
      );
    const attempt: Attempt = {
      claim,
      outcome: {
        status: 'unknown',
        source: clone(input.source),
        date: input.date,
        selected_plan_id: input.plan_id,
        selected_plan_revision: input.plan_revision,
        visit: null,
      },
    };
    registry.set(claim.key, attempt); // Hold before the sole awaited command. Never cleared or rebound.
    try {
      const acknowledgment = await this.repo.scheduleMaintenance(
        this.org,
        this.actor,
        input.source,
        claim.binding.record.revision,
        { id: input.plan_id, revision: input.plan_revision },
        input.date,
      );
      this.inspectAttempt(attempt, acknowledgment);
    } catch {
      /* A missing/failed acknowledgement is UNKNOWN, never replayed. */
    }
    return clone(attempt.outcome);
  }
  retained(source: MaintenanceSource): HandoffOutcome | null {
    const item = this.repo
      .maintenance(this.org, this.actor)
      .items.find((i) => canonical(i.source) === canonical(source));
    if (!item) throw Error('Exact current source unavailable.');
    const visit = this.repo
      .read(this.org)
      .visits.find((v) => v.id === item.report.visit_id);
    const attempt = attempts
      .get(this.repo)
      ?.get(
        canonical([
          this.org,
          source.customer_id,
          source.location_id,
          visit?.id,
          source.finding_id,
        ]),
      );
    if (!attempt) return null;
    if (attempt.claim.actor !== this.actor)
      throw Error('Retained attempt belongs to its original reviewer.');
    return clone(attempt.outcome);
  }
  reconcile(source: MaintenanceSource): HandoffOutcome {
    const q = this.repo.maintenance(this.org, this.actor),
      item = q.items.find((i) => canonical(i.source) === canonical(source));
    if (!item) throw Error('Exact retained source unavailable.');
    const state = this.repo.read(this.org),
      visit = state.visits.find((v) => v.id === item.report.visit_id);
    const key = canonical([
      this.org,
      source.customer_id,
      source.location_id,
      visit?.id,
      source.finding_id,
    ]);
    const attempt = attempts.get(this.repo)?.get(key);
    if (
      !attempt ||
      attempt.claim.actor !== this.actor ||
      canonical(attempt.claim.input.source) !== canonical(source)
    )
      throw Error('Exact original scheduling attempt required.');
    this.inspectAttempt(attempt);
    return clone(attempt.outcome);
  }
  private inspectAttempt(attempt: Attempt, acknowledgment?: Visit) {
    attempt.outcome = { ...attempt.outcome, status: 'unknown', visit: null };
    try {
      const { claim } = attempt,
        current = capture(this.repo, this.org, this.actor, claim.input),
        record = current.binding.record;
      const expected = {
        ...clone(claim.binding),
        record: {
          ...clone(claim.binding.record),
          revision: claim.binding.record.revision + 1,
          scheduled_visit_id: record.scheduled_visit_id,
        },
      };
      if (
        !record.scheduled_visit_id ||
        (acknowledgment !== undefined &&
          acknowledgment.id !== record.scheduled_visit_id) ||
        canonical(current.binding) !== canonical(expected)
      )
        return;
      const draft = this.repo
        .read(this.org)
        .visits.find(
          (v) =>
            v.id === record.scheduled_visit_id &&
            v.organization_id === this.org &&
            v.plan_id === claim.input.plan_id &&
            v.visited_on === claim.input.date &&
            v.phase === 'during' &&
            v.status === 'draft' &&
            v.revision === 1,
        );
      const expectedContent = {
        summary: 'Scheduled property inspection',
        internal_notes: '',
        checklist: claim.binding.plan.checklist.map((c) => ({
          ...c,
          completed: false,
        })),
        findings: [],
      };
      if (
        !draft ||
        canonical(draft.content) !== canonical(expectedContent) ||
        (acknowledgment !== undefined &&
          canonical(acknowledgment) !== canonical(draft))
      )
        return;
      const row = readFieldSchedule(this.repo, this.org, this.actor).rows.find(
        (r) => r.source.visit_id === draft.id,
      );
      if (
        !row ||
        !row.follow_up_sources.some(
          (s) => maintenanceKey(s) === maintenanceKey(claim.input.source),
        )
      )
        return;
      attempt.outcome = {
        ...attempt.outcome,
        status: 'prepared',
        visit: clone(row),
      };
    } catch {
      /* Absence, revocation or changed source cannot become success. */
    }
  }
  inspectExisting(source: MaintenanceSource) {
    const item = this.repo
      .maintenance(this.org, this.actor)
      .items.find((i) => canonical(i.source) === canonical(source));
    if (!item?.record.scheduled_visit_id)
      throw Error('Exact linked follow-up draft unavailable.');
    const row = readFieldSchedule(this.repo, this.org, this.actor).rows.find(
      (r) =>
        r.source.visit_id === item.record.scheduled_visit_id &&
        r.source.customer_id === source.customer_id &&
        r.source.location_id === source.location_id &&
        r.follow_up_sources.some((s) => canonical(s) === canonical(source)),
    );
    if (!row) throw Error('Exact linked follow-up draft unavailable.');
    return {
      row: clone(row),
      report: clone(item.report),
      finding_id: source.finding_id,
    };
  }
}
