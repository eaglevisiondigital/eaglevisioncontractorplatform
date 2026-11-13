import type { PropertyRepository } from '../../lib/property';
import {
  editMaintenance,
  maintenanceDate,
  maintenanceKey,
  type MaintenanceEdit,
  type MaintenanceRecord,
  type MaintenanceSource,
} from '../../domain/property/maintenance';
type Attempt = {
  status: 'pending' | 'partial' | 'unknown' | 'prepared';
  savedRevision?: number;
  visitId?: string;
};
// Same-repository/session attempt holds only; canonical records remain in the existing repository.
const attempts = new WeakMap<PropertyRepository, Map<string, Attempt>>();
export function maintenanceSavePreparation(
  repo: PropertyRepository,
  source: MaintenanceSource,
) {
  const state = attempts.get(repo)?.get(maintenanceKey(source));
  return state ? { ...state } : undefined;
}
export function maintenanceSavePreparationHeld(
  repo: PropertyRepository,
  source: MaintenanceSource,
) {
  const state = maintenanceSavePreparation(repo, source);
  return Boolean(state && state.status !== 'prepared');
}
export async function saveReviewAndPrepareMaintenance(
  repo: PropertyRepository,
  org: string,
  actor: string,
  shownSource: MaintenanceSource,
  shownRecord: MaintenanceRecord,
  entered: MaintenanceEdit,
  chosenPlan: { id: string; revision: number },
  date: string,
  confirmed: boolean,
  stillCurrent: () => boolean,
) {
  if (!confirmed || !stillCurrent())
    throw Error(
      'Confirm saving this exact review and preparing one inspection draft',
    );
  const source = structuredClone(shownSource),
    record = structuredClone(shownRecord),
    input = structuredClone(entered),
    plan = structuredClone(chosenPlan),
    key = maintenanceKey(source);
  const registry = attempts.get(repo) ?? new Map<string, Attempt>();
  if (registry.has(key))
    throw Error(
      'Combined preparation already attempted; read the exact source, do not repeat',
    );
  if (
    Object.keys(source).sort().join(',') !==
      'customer_id,finding_id,location_id,organization_id,report_id,report_version' ||
    source.organization_id !== org ||
    input.review !== 'pending' ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0 ||
    record.revision > Number.MAX_SAFE_INTEGER - 2 ||
    record.scheduled_visit_id
  )
    throw Error(
      'An unscheduled pending review with two available revisions is required',
    );
  maintenanceDate(date);
  // Reuse the existing authority/source reader and pure edit validator; never a new business writer.
  const current = repo.maintenance(org, actor),
    row = current.items.find((r) => maintenanceKey(r.source) === key);
  if (!row || JSON.stringify(row.record) !== JSON.stringify(record))
    throw Error(
      'Maintenance source changed; reload before combined preparation',
    );
  editMaintenance(
    record,
    record.revision,
    input,
    actor,
    current.members.map((m) => m.user_id),
  );
  const selected = repo
    .read(org)
    .plans.find(
      (p) =>
        p.id === plan.id &&
        p.organization_id === org &&
        p.customer_id === source.customer_id &&
        p.location_id === source.location_id &&
        p.revision === plan.revision,
    );
  if (!selected) throw Error('Exact current inspection plan required');
  if (!stillCurrent()) throw Error('Maintenance context changed; no save');
  const state: Attempt = { status: 'pending' };
  registry.set(key, state);
  attempts.set(repo, registry);
  let savedKnown = false,
    scheduleDispatched = false;
  try {
    const saved = await repo.saveMaintenance(
      org,
      actor,
      source,
      record.revision,
      input,
    );
    const oldNotes = record.notes.length,
      extra = input.note.trim() ? 1 : 0,
      last = saved?.notes?.at(-1);
    if (
      !saved ||
      saved.revision !== record.revision + 1 ||
      saved.priority !== input.priority ||
      saved.assignee_id !== input.assignee_id ||
      saved.follow_up_on !== input.follow_up_on ||
      saved.review !== input.review ||
      saved.scheduled_visit_id !== record.scheduled_visit_id ||
      !Array.isArray(saved.notes) ||
      saved.notes.length !== oldNotes + extra ||
      JSON.stringify(saved.notes.slice(0, oldNotes)) !==
        JSON.stringify(record.notes) ||
      (extra &&
        (!last ||
          last.text !== input.note.trim() ||
          last.author_id !== actor ||
          typeof last.id !== 'string' ||
          !last.id ||
          !Number.isFinite(Date.parse(last.recorded_at))))
    )
      throw Error();
    state.savedRevision = saved.revision;
    savedKnown = true;
    if (!stillCurrent()) throw Error();
    const observed = repo
      .maintenance(org, actor)
      .items.find((r) => maintenanceKey(r.source) === key);
    if (!observed || JSON.stringify(observed.record) !== JSON.stringify(saved))
      throw Error();
    if (!stillCurrent()) throw Error();
    // Both existing methods recheck current authority/source and CAS. These are two
    // explicit session operations, not an atomic hosted transaction or durable ACK.
    scheduleDispatched = true;
    const visit = await repo.scheduleMaintenance(
      org,
      actor,
      source,
      saved.revision,
      plan,
      date,
    );
    if (!stillCurrent()) throw Error();
    const after = repo
        .maintenance(org, actor)
        .items.find((r) => maintenanceKey(r.source) === key),
      visits = repo.read(org).visits.filter((v) => v.id === visit?.id);
    if (
      !visit ||
      typeof visit.id !== 'string' ||
      !visit.id ||
      visit.organization_id !== org ||
      visit.plan_id !== plan.id ||
      visit.visited_on !== date ||
      visit.status !== 'draft' ||
      visits.length !== 1 ||
      JSON.stringify(visits[0]) !== JSON.stringify(visit) ||
      !after ||
      after.record.revision !== saved.revision + 1 ||
      after.record.scheduled_visit_id !== visit.id ||
      JSON.stringify({
        ...after.record,
        revision: saved.revision,
        scheduled_visit_id: null,
      }) !== JSON.stringify(saved)
    )
      throw Error();
    state.status = 'prepared';
    state.visitId = visit.id;
    return { ...state };
  } catch {
    state.status = savedKnown && !scheduleDispatched ? 'partial' : 'unknown';
    throw Error(
      state.status === 'partial'
        ? `Review saved at revision ${state.savedRevision}; inspection preparation was not attempted. Read the exact source; do not repeat the combined action.`
        : `Combined preparation outcome UNKNOWN${savedKnown ? `; review saved at revision ${state.savedRevision}` : ''}. Read the exact source; do not replay either step.`,
    );
  }
}
