import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { PublishedReport } from '../../domain/property/inspections';
import { reportUuid } from '../../domain/property/report-page';
import type { OperatingSources } from './operating-center-runtime';
import {
  journeyEnabled,
  type JourneyAdmission,
  type LocalJourney,
} from './journey-runtime';
import {
  readSavedRevision,
  assertSavedRevisionCurrent,
  assertSavedRevisionAccess,
  type SavedRevisionSnapshot,
} from './saved-revision-runtime';
export const savedSourceExercises = [
  'visit-draft',
  'time-record',
  'time-correction',
  'material-review',
  'plan-revision',
  'report-revision',
] as const;
export type SavedSourceExercise = (typeof savedSourceExercises)[number];
type Evidence = {
  job_id: string;
  job_revision: number;
  visit_id: string;
  plan_id: string;
};
export type SavedSourceExerciseView = SavedRevisionSnapshot<Evidence>;
interface Binding {
  sources: OperatingSources;
  entry: LocalJourney;
  gate: JourneyAdmission;
}
const bindings = new WeakMap<object, Binding>();
interface Attempt {
  pending?: SavedSourceExercise;
  unknown: boolean;
  done: Set<SavedSourceExercise>;
}
// Finite same-tab engineering-exercise custody only; no operational writer/store.
const attempts = new WeakMap<
  OperatingSources['operations'],
  Map<string, Attempt>
>();
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    g.enabled !== true ||
    g.confirmed !== true ||
    typeof window === 'undefined' ||
    !journeyEnabled({
      development: import.meta.env.DEV,
      flag: 'true',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  )
    throw Error(
      'Disposable saved-source exercise is OFF without development HTTP loopback admission',
    );
}
function attempt(b: Binding) {
  let rows = attempts.get(b.sources.operations);
  if (!rows) attempts.set(b.sources.operations, (rows = new Map()));
  const key = JSON.stringify([
    b.entry.target.organization_id,
    b.entry.target.job_id,
  ]);
  let row = rows.get(key);
  if (!row) rows.set(key, (row = { unknown: false, done: new Set() }));
  return row;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function exactId(value: unknown) {
  if (!reportUuid(value))
    throw Error('Exact original saved UUID acknowledgment required');
  return value;
}
function ack(value: unknown) {
  if (value !== undefined) {
    void Promise.resolve(value).catch(() => undefined);
    throw Error('Exact original void acknowledgment required');
  }
}
function publishedAck(value: unknown): asserts value is PublishedReport {
  const fields = [
    'id',
    'organization_id',
    'customer_id',
    'location_id',
    'visit_id',
    'visited_on',
    'phase',
    'version',
    'published_at',
    'summary',
    'findings',
    'checklist',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== fields.length ||
    fields.some(
      (key) =>
        !Object.hasOwn(
          Object.getOwnPropertyDescriptor(value, key) ?? {},
          'value',
        ),
    )
  ) {
    // Observe unexpected Promise/thenable rejection, without awaiting it or
    // continuing the synchronous original publication sequence.
    void Promise.resolve(value).catch(() => undefined);
    throw Error(
      'Exact original synchronous published report acknowledgment required',
    );
  }
}
function check(view: SavedSourceExerciseView, b: Binding, current = false) {
  admit(b.gate);
  if (current) assertSavedRevisionCurrent(view);
  else assertSavedRevisionAccess(view);
}
export async function readSavedSourceExercise(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // Before any source descriptors, serialization or projector.
  let retained: LocalJourney | undefined;
  const view = await readSavedRevision(sources, jobId, 'field', gate, (e) => {
    retained = e;
    const row = sources.estimates.readSyntheticPrototypeSources(e.target).job;
    if (!row) throw Error('Exact synthetic job required');
    return {
      job_id: jobId,
      job_revision: row.lock_revision,
      visit_id: e.scheduled_visit_id,
      plan_id: e.plan_id,
    };
  });
  if (!retained) throw Error('Original engineering source required');
  const b = { sources, entry: retained, gate };
  check(view, b, true);
  bindings.set(view, b);
  return view;
}
export function inspectSavedSourceExercise(view: SavedSourceExerciseView) {
  const b = bindings.get(view);
  if (!b) throw Error('Original engineering source required');
  check(view, b);
  const a = attempt(b);
  return {
    state: a.unknown ? 'UNKNOWN' : a.pending ? 'PENDING' : 'REVIEW_ONLY',
    done: [...a.done],
    replay: 'FORBIDDEN' as const,
  };
}
/** Explicit disposable LOCAL fixture exercise only. Original commands run only
 * after confirmation and current CAS; UNKNOWN never repairs/replays/replaces. */
async function executeSourceExercise(
  view: SavedSourceExerciseView,
  kind: SavedSourceExercise,
  confirmed: boolean,
  edit?: SavedDraftEdit,
) {
  if (confirmed !== true || !savedSourceExercises.includes(kind))
    throw Error('Explicit disposable source exercise confirmation required');
  const b = bindings.get(view);
  if (!b) throw Error('Original engineering source required');
  check(view, b, true);
  const a = attempt(b);
  if (a.unknown || a.pending || a.done.has(kind))
    throw Error('Source exercise already attempted or UNKNOWN; no replay');
  const { sources: s, entry: e } = b,
    org = view.identity.organization_id,
    jobId = view.identity.job_id,
    canonical = s.estimates.readSyntheticPrototypeSources(e.target),
    state = s.property.read(org);
  if (
    !canonical.job ||
    canonical.job.id !== jobId ||
    canonical.job.lock_revision !== view.evidence.job_revision
  )
    throw Error('Exact current job revision required');
  const job = canonical.job,
    visit = state.visits.find((v) => v.id === e.scheduled_visit_id),
    plan = state.plans.find((p) => p.id === e.plan_id),
    published = state.visits.find((v) => v.id === e.visit_id),
    tasks = canonical.workforce.entries.filter(
      (t) => t.job_id === jobId && t.worker_id === e.worker_id,
    ),
    old = tasks
      .filter(
        (t) =>
          t.submitted &&
          canonical.workforce.reviews.some(
            (r) => r.entry_id === t.id && r.decision === 'approved',
          ) &&
          !tasks.some((c) => c.corrects_id === t.id),
      )
      .at(-1);
  if (kind === 'visit-draft' && (!visit || visit.status !== 'draft'))
    throw Error('Exact saved draft visit required');
  if (kind === 'time-record' && tasks.length)
    throw Error('Initial time already recorded');
  if (kind === 'time-correction' && (!old || !old.ended_at))
    throw Error('Exact approved time source required');
  if (kind === 'plan-revision' && !plan)
    throw Error('Exact current plan required');
  if (
    kind === 'report-revision' &&
    (!published || published.status !== 'published')
  )
    throw Error('Exact published visit required');
  if (
    kind === 'material-review' &&
    job.expenses.some((x) => x.reference === 'LOCAL-C19-SAVED-MATERIAL')
  )
    throw Error('Synthetic source document already exists');
  check(view, b, true);
  a.pending = kind; // Canonical Operations/company/job, before every first await.
  let invoked = false;
  try {
    if (kind === 'visit-draft') {
      const content = {
        ...visit!.content,
        summary:
          edit?.summary ??
          'Synthetic saved draft observation revision; physical completion remains unverified.',
        checklist: edit
          ? edit.checklist.map((row) => ({ ...row }))
          : visit!.content.checklist,
      };
      invoked = true;
      ack(s.property.saveVisit(org, visit!, content));
      check(view, b);
      const after = s.property.read(org),
        expected = { ...visit!, content, revision: visit!.revision + 1 };
      if (
        !same(after, {
          ...state,
          visits: state.visits.map((v) => (v.id === visit!.id ? expected : v)),
        })
      )
        throw Error('Exact saved draft acknowledgment unavailable');
    } else if (kind === 'time-record' || kind === 'time-correction') {
      const index = s.entries.findIndex((x) => x === e),
        hour = 8 + index * 2;
      const input =
        kind === 'time-correction'
          ? {
              job_id: jobId,
              overhead_center: null,
              task: 'Synthetic corrected technician task',
              kind: 'work' as const,
              started_at: old!.started_at,
              ended_at: old!.ended_at,
              billable: old!.billable,
              corrects_id: old!.id,
            }
          : {
              job_id: jobId,
              overhead_center: null,
              task: 'Synthetic recorded technician task',
              kind: 'work' as const,
              started_at: `${e.day}T${String(hour).padStart(2, '0')}:00:00Z`,
              ended_at: `${e.day}T${String(hour + 1).padStart(2, '0')}:00:00Z`,
              billable: false,
              corrects_id: null,
            };
      invoked = true;
      const id = exactId(await s.estimates.recordTime(org, e.worker_id, input));
      check(view, b);
      const expected = {
        ...input,
        id,
        worker_id: e.worker_id,
        submitted: false,
      };
      const timeAck = (submitted: boolean, reviewed: boolean) => {
        check(view, b);
        const now = s.estimates.readSyntheticPrototypeSources(e.target),
          reason =
            'Explicit disposable synthetic review; unposted labor, no payroll or payment execution.';
        if (
          !same(now.job, job) ||
          !same(now.workforce.entries, [
            ...canonical.workforce.entries,
            { ...expected, submitted },
          ]) ||
          !same(now.workforce.reviews, [
            ...canonical.workforce.reviews,
            ...(reviewed
              ? [{ entry_id: id, decision: 'approved', reason }]
              : []),
          ])
        )
          throw Error('Exact saved time/review acknowledgment unavailable');
      };
      timeAck(false, false);
      ack(await s.estimates.submitTime(org, id));
      timeAck(true, false);
      ack(
        await s.estimates.reviewTime(
          org,
          id,
          'approved',
          'Explicit disposable synthetic review; unposted labor, no payroll or payment execution.',
        ),
      );
      timeAck(true, true);
    } else if (kind === 'material-review') {
      const expense = {
        purchase_key: `LOCAL-C19-${jobId}`,
        supplier: 'Synthetic planning supplier',
        reference: 'LOCAL-C19-SAVED-MATERIAL',
        category: 'materials' as const,
        kind: 'commitment' as const,
        amount_minor: 2500,
        description:
          'Disposable reviewed commitment only; no purchase or payment executed.',
        estimate_line_id: null,
        quantity_milli: null,
        unit: null,
        unit_cost_minor: null,
        document_ids: [] as string[],
        material_approval_id: null,
      };
      invoked = true;
      const id = exactId(await s.estimates.submitExpense(org, jobId, expense));
      check(view, b);
      const submitted = s.estimates.readSyntheticPrototypeSources(e.target).job,
        rows = submitted?.expenses.filter((x) => x.id === id),
        saved = rows?.[0];
      if (
        !submitted ||
        rows?.length !== 1 ||
        !saved ||
        typeof saved.submitted_at !== 'string' ||
        !Number.isFinite(Date.parse(saved.submitted_at)) ||
        !same(saved, {
          ...expense,
          id,
          job_id: jobId,
          submitted_at: saved.submitted_at,
        }) ||
        !same(submitted, { ...job, expenses: [...job.expenses, saved] })
      )
        throw Error('Exact saved material acknowledgment unavailable');
      const reason =
        'Disposable synthetic internal cost review only; no ledger or payment authority.';
      ack(await s.estimates.reviewExpense(org, jobId, id, 'approved', reason));
      check(view, b);
      const reviewed = s.estimates.readSyntheticPrototypeSources(e.target).job,
        events = reviewed?.events.filter((x) => x.submission_id === id),
        event = events?.[0];
      if (
        !reviewed ||
        events?.length !== 1 ||
        !event ||
        !reportUuid(event.id) ||
        typeof event.created_at !== 'string' ||
        !Number.isFinite(Date.parse(event.created_at)) ||
        !same(event, {
          id: event.id,
          submission_id: id,
          decision: 'approved',
          reason,
          created_at: event.created_at,
        }) ||
        !same(reviewed, {
          ...submitted,
          events: [...job.events, event],
          lock_revision: job.lock_revision + 1,
        })
      )
        throw Error('Exact saved material review acknowledgment unavailable');
    } else if (kind === 'plan-revision') {
      const next = {
        ...plan!,
        cadence:
          plan!.cadence === 'monthly'
            ? ('weekly' as const)
            : ('monthly' as const),
      };
      invoked = true;
      ack(s.property.savePlan(org, next));
      check(view, b);
      const after = s.property.read(org);
      if (
        !same(after, {
          ...state,
          plans: state.plans.map((p) =>
            p.id === next.id ? { ...next, revision: next.revision + 1 } : p,
          ),
        })
      )
        throw Error('Exact saved plan acknowledgment unavailable');
    } else {
      // Original synchronous CAS sequence never yields with published selector in
      // draft/submitted state. Any throw permanently holds this exercise UNKNOWN.
      invoked = true;
      ack(s.property.revise(org, published!));
      let now = s.property.read(org).visits.find((v) => v.id === published!.id);
      if (
        !now ||
        !same(now, {
          ...published!,
          status: 'draft',
          revision: published!.revision + 1,
        })
      )
        throw Error('Exact revised visit acknowledgment unavailable');
      const content = {
        ...now.content,
        summary:
          'Synthetic published observation revision; physical completion remains unverified.',
      };
      ack(s.property.saveVisit(org, now, content));
      now = s.property.read(org).visits.find((v) => v.id === published!.id);
      if (
        !now ||
        !same(now, {
          ...published!,
          content,
          status: 'draft',
          revision: published!.revision + 2,
        })
      )
        throw Error('Exact revised content acknowledgment unavailable');
      ack(s.property.submit(org, now));
      now = s.property.read(org).visits.find((v) => v.id === published!.id);
      if (
        !now ||
        !same(now, {
          ...published!,
          content,
          status: 'submitted',
          revision: published!.revision + 3,
        })
      )
        throw Error('Exact submitted visit acknowledgment unavailable');
      const report: unknown = s.property.publish(org, now);
      publishedAck(report);
      check(view, b);
      const after = s.property.read(org),
        version =
          state.reports.filter((r) => r.visit_id === published!.id).length + 1;
      if (
        !report ||
        !reportUuid(report.id) ||
        state.reports.some((r) => r.id === report.id) ||
        report.version !== version ||
        report.organization_id !== org ||
        report.customer_id !== view.identity.customer_id ||
        report.location_id !== view.identity.location_id ||
        report.visit_id !== published!.id ||
        report.summary !== content.summary ||
        report.phase !== published!.phase ||
        report.visited_on !== published!.visited_on ||
        typeof report.published_at !== 'string' ||
        !Number.isFinite(Date.parse(report.published_at)) ||
        !same(
          report.findings,
          content.findings
            .filter((f) => f.customer_visible)
            .map((f) => ({
              id: f.id,
              description: f.description,
              recommendation: f.recommendation,
              severity: f.severity,
              category: f.category,
              location: f.location,
            })),
        ) ||
        !same(
          report.checklist,
          content.checklist.map((c) => ({
            label: c.label,
            completed: c.completed,
          })),
        ) ||
        !same(after, {
          ...state,
          visits: state.visits.map((v) =>
            v.id === published!.id
              ? {
                  ...published!,
                  content,
                  status: 'published',
                  revision: published!.revision + 4,
                }
              : v,
          ),
          reports: [...state.reports, report],
        })
      )
        throw Error('Exact published report acknowledgment unavailable');
    }
    check(view, b);
    a.done.add(kind);
    a.pending = undefined;
    return {
      status: 'SYNTHETIC_SOURCE_SAVED' as const,
      kind,
      job_id: jobId,
      operational_ready: false as const,
    };
  } catch (error) {
    a.pending = undefined;
    if (invoked) a.unknown = true;
    throw error;
  }
}

export interface SavedDraftEdit {
  summary: string;
  checklist: { label: string; completed: boolean }[];
}
export function readSavedDraftEdit(view: SavedSourceExerciseView) {
  const b = bindings.get(view);
  if (!b) throw Error('Original saved source required');
  check(view, b, true);
  const v = b.sources.property
    .read(view.identity.organization_id)
    .visits.find((v) => v.id === view.evidence.visit_id);
  if (!v || v.status !== 'draft') throw Error('Exact current draft required');
  const a = attempt(b);
  return freezePrototype({
    visit_id: v.id,
    revision: v.revision,
    summary: v.content.summary,
    checklist: v.content.checklist.map((row) => ({ ...row })),
    can_edit: !a.unknown && !a.pending && !a.done.has('visit-draft'),
  });
}
export async function executeSavedDraftEdit(
  view: SavedSourceExerciseView,
  input: SavedDraftEdit,
  confirmed: boolean,
) {
  const current = readSavedDraftEdit(view),
    f = prototypeFields(input, ['summary', 'checklist']);
  if (
    Object.keys(f).length !== 2 ||
    typeof f.summary !== 'string' ||
    !f.summary.trim() ||
    f.summary !== f.summary.trim() ||
    f.summary.length > 2000 ||
    !Array.isArray(f.checklist) ||
    f.checklist.length !== current.checklist.length
  )
    throw Error('Exact bounded draft edit required');
  const ds = Object.getOwnPropertyDescriptors(f.checklist);
  if (Reflect.ownKeys(f.checklist).length !== f.checklist.length + 1)
    throw Error('Dense saved checklist required');
  const checklist = current.checklist.map((row, index) => {
    const d = ds[String(index)];
    if (!d || !Object.hasOwn(d, 'value'))
      throw Error('Own saved checklist required');
    const c = prototypeFields(d.value, ['label', 'completed']);
    if (
      Object.keys(c).length !== 2 ||
      c.label !== row.label ||
      typeof c.completed !== 'boolean'
    )
      throw Error('Exact original checklist identity required');
    return { label: row.label, completed: c.completed };
  });
  return executeSourceExercise(view, 'visit-draft', confirmed, {
    summary: f.summary,
    checklist,
  });
}
/** Existing fixed synthetic exercise API remains unchanged. */
export async function executeSavedSourceExercise(
  view: SavedSourceExerciseView,
  kind: SavedSourceExercise,
  confirmed: boolean,
) {
  return executeSourceExercise(view, kind, confirmed);
}
