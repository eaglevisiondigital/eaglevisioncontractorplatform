import { Temporal } from '@js-temporal/polyfill';
import {
  readFieldSavedRevision,
  type FieldSavedEvidence,
} from './field-saved-revisions';
import type { SavedRevisionSnapshot } from './saved-revision-runtime';
export type WorkOrderEvidence = Omit<FieldSavedEvidence, 'tasks'> & {
  readonly tasks: readonly (Omit<
    FieldSavedEvidence['tasks'][number],
    'review'
  > & { readonly review: 'approved' | 'rejected' | 'unreviewed' })[];
};
import {
  evidenceFields,
  evidenceText,
  evidenceNumber,
  evidenceList,
  evidenceLiteral,
  type EvidenceRecipe,
  type EvidenceIdentity,
} from './saved-evidence-runtime';
const id = (v: unknown) => {
  const s = evidenceText(v, 200);
  if (!s || s !== s.trim())
    throw Error('Exact nonempty field identity required');
  return s;
};
const bool = (v: unknown) => {
  if (typeof v !== 'boolean') throw Error('Recorded boolean required');
  return v;
};
function choice<const T extends string>(v: unknown, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T))
    throw Error('Recorded field enum required');
  return v as T;
}
function date(v: unknown) {
  const s = evidenceText(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Temporal.PlainDate.from(s, { overflow: 'reject' }).toString() !== s
  )
    throw Error('Exact recorded date required');
  return s;
}
function timestamp(v: unknown) {
  const s = evidenceText(v, 60);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !Number.isFinite(Date.parse(s)))
    throw Error('Recorded instant required');
  return s;
}
function unique<T extends { id: string }>(rows: T[]) {
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error('Duplicate exact field identity');
  return rows;
}
function checklist(v: unknown) {
  return unique(
    evidenceList(v, 100).map((value) => {
      const f = evidenceFields(value, ['id', 'label', 'required', 'completed']);
      return {
        id: id(f.id),
        label: evidenceText(f.label, 200),
        required: bool(f.required),
        completed: bool(f.completed),
      };
    }),
  );
}
/** Complete historical allowlist. File metadata never supplies source authority. */
export function parseWorkOrderEvidence(
  value: unknown,
  identity?: EvidenceIdentity,
): WorkOrderEvidence {
  const f = evidenceFields(value, [
    'source',
    'title',
    'customer',
    'property',
    'crew',
    'assignment_state',
    'plans',
    'visits',
    'tasks',
    'task_revision_model',
    'physical_completion',
    'availability',
    'authority',
    'coverage',
  ]);
  const s = evidenceFields(f.source, [
    'organization_id',
    'job_id',
    'job_revision',
    'estimate_id',
    'issued_version_id',
    'issued_version_number',
  ]);
  const source = {
    organization_id: id(s.organization_id),
    job_id: id(s.job_id),
    job_revision: evidenceNumber(s.job_revision, 1),
    estimate_id: id(s.estimate_id),
    issued_version_id: id(s.issued_version_id),
    issued_version_number: evidenceNumber(s.issued_version_number, 1),
  };
  const named = (value: unknown) => {
    const n = evidenceFields(value, ['id', 'label']);
    return { id: id(n.id), label: evidenceText(n.label, 500) };
  };
  const customer = named(f.customer),
    property = named(f.property);
  if (
    identity &&
    (source.organization_id !== identity.organization_id ||
      source.job_id !== identity.job_id ||
      source.estimate_id !== identity.estimate_id ||
      source.issued_version_id !== identity.version_id ||
      customer.id !== identity.customer_id ||
      property.id !== identity.location_id)
  )
    throw Error('Field payload differs from exact authorized file identity');
  const crew = evidenceList(f.crew, 200).map((v) => {
    const c = evidenceFields(v, ['worker_id', 'user_id', 'label']);
    return {
      worker_id: id(c.worker_id),
      user_id: id(c.user_id),
      label: evidenceText(c.label, 500),
    };
  });
  if (
    new Set(crew.map((c) => c.worker_id)).size !== crew.length ||
    new Set(crew.map((c) => c.user_id)).size !== crew.length
  )
    throw Error('Duplicate crew identity');
  const plans = unique(
    evidenceList(f.plans, 1000).map((v) => {
      const p = evidenceFields(v, ['id', 'revision', 'name', 'checklist']);
      return {
        id: id(p.id),
        revision: evidenceNumber(p.revision, 1),
        name: evidenceText(p.name, 200),
        checklist: checklist(p.checklist),
      };
    }),
  );
  const visits = unique(
    evidenceList(f.visits, 1000).map((v) => {
      const p = evidenceFields(v, [
        'id',
        'plan_id',
        'revision',
        'visited_on',
        'phase',
        'status',
        'summary',
        'checklist',
      ]);
      const visit = {
        id: id(p.id),
        plan_id: id(p.plan_id),
        revision: evidenceNumber(p.revision, 1),
        visited_on: date(p.visited_on),
        phase: choice(p.phase, ['before', 'during', 'after'] as const),
        status: choice(p.status, ['draft', 'submitted', 'published'] as const),
        summary: evidenceText(p.summary, 2000),
        checklist: checklist(p.checklist),
      };
      if (!plans.some((p) => p.id === visit.plan_id))
        throw Error('Exact visit plan missing');
      return visit;
    }),
  );
  const tasks = unique(
    evidenceList(f.tasks, 1000).map((v) => {
      const t = evidenceFields(v, [
        'id',
        'worker_id',
        'task',
        'kind',
        'started_at',
        'ended_at',
        'submitted',
        'corrects_id',
        'review',
      ]);
      const task = {
        id: id(t.id),
        worker_id: id(t.worker_id),
        task: evidenceText(t.task, 2000),
        kind: choice(t.kind, ['work', 'break_paid', 'break'] as const),
        started_at: timestamp(t.started_at),
        ended_at: t.ended_at === null ? null : timestamp(t.ended_at),
        submitted: bool(t.submitted),
        corrects_id: t.corrects_id === null ? null : id(t.corrects_id),
        review: choice(t.review, [
          'approved',
          'rejected',
          'unreviewed',
        ] as const),
      };
      if (
        !crew.some((c) => c.worker_id === task.worker_id) ||
        (task.ended_at !== null &&
          Date.parse(task.ended_at) <= Date.parse(task.started_at))
      )
        throw Error('Exact recorded task worker/time required');
      return task;
    }),
  );
  for (const t of tasks) {
    const seen = new Set([t.id]);
    let current = t;
    while (current.corrects_id) {
      const previous = tasks.find((p) => p.id === current.corrects_id);
      if (
        !previous ||
        previous.worker_id !== t.worker_id ||
        seen.has(previous.id)
      )
        throw Error('Exact noncyclic correction chain required');
      seen.add(previous.id);
      current = previous;
    }
  }
  const a = evidenceFields(f.authority, [
    'write',
    'dispatch',
    'record_time',
    'approve_time',
    'financial',
    'complete',
    'communicate',
  ]);
  const authority = {
    write: evidenceLiteral(a.write, false),
    dispatch: evidenceLiteral(a.dispatch, false),
    record_time: evidenceLiteral(a.record_time, false),
    approve_time: evidenceLiteral(a.approve_time, false),
    financial: evidenceLiteral(a.financial, false),
    complete: evidenceLiteral(a.complete, false),
    communicate: evidenceLiteral(a.communicate, false),
  };
  return {
    source,
    title: evidenceText(f.title, 500),
    customer,
    property,
    crew,
    assignment_state: choice(f.assignment_state, ['KNOWN', 'UNKNOWN'] as const),
    plans,
    visits,
    tasks,
    task_revision_model: evidenceLiteral(
      f.task_revision_model,
      'EXACT_ENTRY_AND_CORRECTION_LINK_ONLY',
    ),
    physical_completion: evidenceLiteral(f.physical_completion, 'UNVERIFIED'),
    availability: evidenceLiteral(f.availability, 'UNKNOWN'),
    authority,
    coverage: evidenceLiteral(f.coverage, 'AVAILABLE_EXACT_JOB_RECORDS_ONLY'),
  };
}
/** Current canonical references admit source ownership; historical bytes never authorize writes. */
export function assertWorkOrderEvidenceSource(
  payload: WorkOrderEvidence,
  current: SavedRevisionSnapshot<unknown>,
) {
  if (current.kind !== 'field') throw Error('Exact field source required');
  const actual = parseWorkOrderEvidence(current.evidence, current.identity);
  parseWorkOrderEvidence(payload, current.identity);
  if (payload.source.job_revision > actual.source.job_revision)
    throw Error('Future job revision is not current evidence');
  for (const c of payload.crew)
    if (
      !actual.crew.some(
        (a) => a.worker_id === c.worker_id && a.user_id === c.user_id,
      )
    )
      throw Error('Archived crew source unavailable');
  for (const kind of ['plans', 'visits'] as const)
    for (const old of payload[kind]) {
      const now = actual[kind].find((v) => v.id === old.id);
      if (!now || old.revision > now.revision)
        throw Error('Exact archived plan/visit revision unavailable');
      if (
        kind === 'visits' &&
        'plan_id' in old &&
        (!('plan_id' in now) || old.plan_id !== now.plan_id)
      )
        throw Error('Visit plan ownership changed');
      if (
        old.revision === now.revision &&
        JSON.stringify(old) !== JSON.stringify(now)
      )
        throw Error('Same saved revision has contradictory content');
    }
  for (const old of payload.tasks) {
    const now = actual.tasks.find((t) => t.id === old.id);
    if (
      !now ||
      (
        [
          'id',
          'worker_id',
          'task',
          'kind',
          'started_at',
          'ended_at',
          'corrects_id',
        ] as const
      ).some((k) => old[k] !== now[k])
    )
      throw Error('Immutable task/correction source unavailable');
  }
}
export const workOrderEvidenceRecipe: EvidenceRecipe<WorkOrderEvidence> =
  Object.freeze({
    kind: 'field',
    title: 'Work order',
    read: readFieldSavedRevision,
    project(snapshot: SavedRevisionSnapshot<unknown>) {
      if (snapshot.kind !== 'field')
        throw Error('Exact field snapshot required');
      return parseWorkOrderEvidence(snapshot.evidence, snapshot.identity);
    },
    parse: parseWorkOrderEvidence,
    assertSource: assertWorkOrderEvidenceSource,
  });
