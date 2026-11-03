import {
  readFieldWorkOrders,
  fieldWorkOrderBinding,
} from '../field-work-orders';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { freezePrototype } from '../program/prototype-source';
import {
  readSavedRevision,
  compareSavedRevisions,
  type SavedRevisionSnapshot,
} from './saved-revision-runtime';

/** Original source readers own all task, assignment and visit facts. This is not a task store. */
export function readFieldSavedRevision(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  return readSavedRevision(sources, jobId, 'field', gate, async (entry) => {
    const t = entry.target,
      model = await readFieldWorkOrders(
        entry.property,
        t.organization_id,
        t.actor_id,
      );
    const matches = model.orders.filter((o) => o.source.job_id === t.job_id);
    if (matches.length !== 1)
      throw Error('Exact current saved work order required');
    const order = matches[0];
    fieldWorkOrderBinding(entry.property, t.organization_id, t.actor_id, order);
    if (
      order.customer.id !== t.customer_id ||
      order.baseline_property?.id !== t.location_id ||
      order.source.issued_version_id !== t.version_id ||
      order.source.estimate_id !== t.estimate_id
    )
      throw Error('Exact immutable work-order ownership required');
    const current = entry.estimates.readSyntheticPrototypeSources(t),
      state = entry.property.read(t.organization_id);
    const plans = state.plans.filter((p) => p.job_id === t.job_id);
    if (
      plans.some(
        (p) =>
          p.organization_id !== t.organization_id ||
          p.customer_id !== t.customer_id ||
          p.location_id !== t.location_id,
      )
    )
      throw Error('Exact saved property plans required');
    const visits = state.visits.filter((v) =>
      plans.some((p) => p.id === v.plan_id),
    );
    if (
      visits.some((v) => v.organization_id !== t.organization_id) ||
      new Set(visits.map((v) => v.id)).size !== visits.length
    )
      throw Error('Unambiguous saved visits required');
    const tasks = current.workforce.entries
      .filter(
        (e) =>
          e.job_id === t.job_id &&
          order.recorded_time.some((r) => r.id === e.id),
      )
      .map((e) => {
        const reviews = current.workforce.reviews.filter(
          (r) => r.entry_id === e.id,
        );
        if (
          reviews.length > 1 ||
          (e.corrects_id &&
            !current.workforce.entries.some(
              (x) =>
                x.id === e.corrects_id &&
                x.job_id === e.job_id &&
                x.worker_id === e.worker_id,
            ))
        )
          throw Error('Exact task correction/review evidence required');
        return {
          id: e.id,
          worker_id: e.worker_id,
          task: e.task,
          kind: e.kind,
          started_at: e.started_at,
          ended_at: e.ended_at,
          submitted: e.submitted,
          corrects_id: e.corrects_id,
          review: reviews[0]?.decision ?? ('unreviewed' as const),
        };
      });
    if (new Set(tasks.map((e) => e.id)).size !== tasks.length)
      throw Error('Unambiguous saved task identities required');
    return {
      source: order.source,
      title: order.title,
      customer: order.customer,
      property: order.baseline_property,
      crew: order.crew,
      assignment_state: order.assignment_state,
      plans: plans.map((p) => ({
        id: p.id,
        revision: p.revision,
        name: p.name,
        checklist: p.checklist.map((c) => ({
          id: c.id,
          label: c.label,
          required: c.required,
          completed: c.completed,
        })),
      })),
      visits: visits.map((v) => ({
        id: v.id,
        plan_id: v.plan_id,
        revision: v.revision,
        visited_on: v.visited_on,
        phase: v.phase,
        status: v.status,
        summary: v.content.summary,
        checklist: v.content.checklist.map((c) => ({
          id: c.id,
          label: c.label,
          required: c.required,
          completed: c.completed,
        })),
      })),
      tasks,
      task_revision_model: 'EXACT_ENTRY_AND_CORRECTION_LINK_ONLY' as const,
      physical_completion: 'UNVERIFIED' as const,
      availability: 'UNKNOWN' as const,
      authority: {
        write: false,
        dispatch: false,
        record_time: false,
        approve_time: false,
        financial: false,
        complete: false,
        communicate: false,
      },
      coverage: 'AVAILABLE_EXACT_JOB_RECORDS_ONLY' as const,
    };
  });
}
export type FieldSavedSnapshot = Awaited<
  ReturnType<typeof readFieldSavedRevision>
>;
export type FieldSavedEvidence = FieldSavedSnapshot['evidence'];
function changes<T extends { readonly id: string }>(
  before: readonly T[],
  current: readonly T[],
) {
  if (
    new Set(before.map((x) => x.id)).size !== before.length ||
    new Set(current.map((x) => x.id)).size !== current.length
  )
    throw Error('Unique exact source IDs required');
  return [
    ...new Set([...before.map((x) => x.id), ...current.map((x) => x.id)]),
  ].map((id) => {
    const a = before.find((x) => x.id === id) ?? null,
      b = current.find((x) => x.id === id) ?? null;
    return {
      id,
      state: !a
        ? ('ADDED' as const)
        : !b
          ? ('NOT_PRESENT_IN_CURRENT_READ' as const)
          : JSON.stringify(a) === JSON.stringify(b)
            ? ('UNCHANGED' as const)
            : ('MODIFIED' as const),
      before: a,
      current: b,
    };
  });
}
export function compareFieldSavedRevisions(
  before: SavedRevisionSnapshot<FieldSavedEvidence>,
  current: SavedRevisionSnapshot<FieldSavedEvidence>,
) {
  const comparison = compareSavedRevisions(before, current);
  if (before.kind !== 'field' || current.kind !== 'field')
    throw Error('Exact field snapshots required');
  return Object.freeze({
    comparison,
    differences: freezePrototype({
      job_revision: {
        before: before.evidence.source.job_revision,
        current: current.evidence.source.job_revision,
      },
      visits: changes(before.evidence.visits, current.evidence.visits),
      plans: changes(before.evidence.plans, current.evidence.plans),
      tasks: changes(before.evidence.tasks, current.evidence.tasks),
      crew_changed:
        JSON.stringify(before.evidence.crew) !==
        JSON.stringify(current.evidence.crew),
      meaning: 'OBSERVED_DIFFERENCES_ONLY' as const,
      physical_completion: 'UNVERIFIED' as const,
    }),
  });
}
