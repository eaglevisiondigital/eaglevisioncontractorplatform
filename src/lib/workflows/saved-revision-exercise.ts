import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  occurrence,
  type InspectionPlan,
  type PublishedReport,
} from '../../domain/property/inspections';
import { validateTime, type TimeEntry } from '../../domain/workforce/payroll';
import { jobFinancials } from '../../domain/jobs/financials';
import { reportUuid } from '../../domain/property/report-page';
import { documentHash } from '../../domain/release/preview';
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
  type SavedRevisionIdentity,
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
  corrections?: Partial<Record<CorrectionKind, CorrectionIntent>>;
  service_request?: ServiceRequestIntent;
}
type CorrectionKind = 'time-correction' | 'plan-revision' | 'material-review';
type TaskReceiptSource = Pick<
  TimeEntry,
  | 'id'
  | 'worker_id'
  | 'job_id'
  | 'task'
  | 'kind'
  | 'started_at'
  | 'ended_at'
  | 'billable'
  | 'submitted'
  | 'corrects_id'
>;
interface CorrectionIntent {
  task_binding?: {
    identity: SavedRevisionIdentity;
    visit_id: string;
    plan_id: string;
    original: TaskReceiptSource;
  };
  source_id: string;
  result_id: string | null;
  expected: unknown;
  state: 'PENDING' | 'KNOWN_SAVED' | 'UNKNOWN';
}
export interface SavedTaskCorrection {
  source_entry_id: string;
  task: string;
  started_at: string;
  ended_at: string;
  billable: boolean;
}
export interface SavedPlanCorrection {
  plan_id: string;
  revision: number;
  name: string;
  cadence: InspectionPlan['cadence'];
  interval_days: number;
}
export interface SavedMaterialCorrection {
  expense_id: string;
  decision: 'approved' | 'rejected';
  reason: string;
}
type Correction =
  | { kind: 'time-correction'; input: SavedTaskCorrection }
  | { kind: 'plan-revision'; input: SavedPlanCorrection }
  | { kind: 'material-review'; input: SavedMaterialCorrection };
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
function attempt(b: Binding, namespace?: string) {
  let rows = attempts.get(b.sources.operations);
  if (!rows) attempts.set(b.sources.operations, (rows = new Map()));
  const key =
    namespace ??
    JSON.stringify([b.entry.target.organization_id, b.entry.target.job_id]);
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
  correction?: Correction & { checkLive: () => void },
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
      .filter(
        (t) =>
          correction?.kind !== 'time-correction' ||
          t.id === correction.input.source_entry_id,
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
    !correction &&
    job.expenses.some((x) => x.reference === 'LOCAL-C19-SAVED-MATERIAL')
  )
    throw Error('Synthetic source document already exists');
  check(view, b, true);
  correction?.checkLive();
  a.pending = kind; // Canonical Operations/company/job, before every first await.
  let intent: CorrectionIntent | undefined;
  if (correction) {
    if (correction.kind !== kind) throw Error('Exact correction kind required');
    intent = {
      source_id:
        correction.kind === 'time-correction'
          ? correction.input.source_entry_id
          : correction.kind === 'plan-revision'
            ? correction.input.plan_id
            : correction.input.expense_id,
      result_id: null,
      expected: freezePrototype(structuredClone(correction.input)),
      state: 'PENDING',
      ...(correction.kind === 'time-correction'
        ? {
            task_binding: freezePrototype({
              identity: structuredClone(view.identity),
              visit_id: view.evidence.visit_id,
              plan_id: view.evidence.plan_id,
              original: {
                id: old!.id,
                worker_id: old!.worker_id,
                job_id: old!.job_id,
                task: old!.task,
                kind: old!.kind,
                started_at: old!.started_at,
                ended_at: old!.ended_at,
                billable: old!.billable,
                submitted: old!.submitted,
                corrects_id: old!.corrects_id,
              },
            }),
          }
        : {}),
    };
    (a.corrections ??= {})[correction.kind] = intent;
  }
  let invoked = false;
  try {
    if (kind === 'visit-draft') {
      const content = {
        ...visit!.content,
        summary:
          edit?.summary ??
          'Synthetic saved draft observation revision; physical completion remains unverified.',
        checklist: edit
          ? visit!.content.checklist.map((row, index) => ({
              ...row,
              completed: edit.checklist[index].completed,
            }))
          : visit!.content.checklist,
      };
      invoked = true;
      ack(s.property.saveVisit(org, visit!, content));
      check(view, b);
      correction?.checkLive();
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
              task:
                correction?.kind === 'time-correction'
                  ? correction.input.task
                  : 'Synthetic corrected technician task',
              kind:
                correction?.kind === 'time-correction'
                  ? old!.kind
                  : ('work' as const),
              started_at:
                correction?.kind === 'time-correction'
                  ? correction.input.started_at
                  : old!.started_at,
              ended_at:
                correction?.kind === 'time-correction'
                  ? correction.input.ended_at
                  : old!.ended_at,
              billable:
                correction?.kind === 'time-correction'
                  ? correction.input.billable
                  : old!.billable,
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
      if (intent) intent.result_id = id;
      check(view, b);
      correction?.checkLive();
      const expected = {
        ...input,
        id,
        worker_id: e.worker_id,
        submitted: false,
      };
      const timeAck = (submitted: boolean, reviewed: boolean) => {
        check(view, b);
        correction?.checkLive();
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
      if (correction?.kind === 'material-review') {
        const input = correction.input;
        invoked = true;
        ack(
          await s.estimates.reviewExpense(
            org,
            jobId,
            input.expense_id,
            input.decision,
            input.reason,
          ),
        );
        check(view, b);
        correction?.checkLive();
        const after = s.estimates.readSyntheticPrototypeSources(e.target).job,
          events = after?.events.filter(
            (row) => row.submission_id === input.expense_id,
          ),
          event = events?.[0];
        if (
          !after ||
          !event ||
          events?.length !== 1 ||
          !reportUuid(event.id) ||
          !Number.isFinite(Date.parse(event.created_at)) ||
          !same(event, {
            id: event.id,
            submission_id: input.expense_id,
            decision: input.decision,
            reason: input.reason,
            created_at: event.created_at,
          }) ||
          !same(after, {
            ...job,
            events: [...job.events, event],
            lock_revision: job.lock_revision + 1,
          })
        )
          throw Error(
            'Exact pending material review acknowledgment unavailable',
          );
        if (intent) intent.result_id = event.id;
      } else {
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
        const id = exactId(
          await s.estimates.submitExpense(org, jobId, expense),
        );
        check(view, b);
        correction?.checkLive();
        const submitted = s.estimates.readSyntheticPrototypeSources(
            e.target,
          ).job,
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
        ack(
          await s.estimates.reviewExpense(org, jobId, id, 'approved', reason),
        );
        check(view, b);
        correction?.checkLive();
        const reviewed = s.estimates.readSyntheticPrototypeSources(
            e.target,
          ).job,
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
      }
    } else if (kind === 'plan-revision') {
      const next = {
        ...plan!,
        ...(correction?.kind === 'plan-revision'
          ? {
              name: correction.input.name,
              cadence: correction.input.cadence,
              interval_days: correction.input.interval_days,
            }
          : {
              cadence:
                plan!.cadence === 'monthly'
                  ? ('weekly' as const)
                  : ('monthly' as const),
            }),
      };
      invoked = true;
      ack(s.property.savePlan(org, next));
      check(view, b);
      correction?.checkLive();
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
      if (intent) intent.result_id = next.id;
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
      correction?.checkLive();
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
    correction?.checkLive();
    a.done.add(kind);
    a.pending = undefined;
    if (intent) intent.state = 'KNOWN_SAVED';
    return {
      status: 'SYNTHETIC_SOURCE_SAVED' as const,
      kind,
      job_id: jobId,
      operational_ready: false as const,
    };
  } catch (error) {
    a.pending = undefined;
    if (invoked) {
      a.unknown = true;
      if (intent) intent.state = 'UNKNOWN';
    }
    throw error;
  }
}

export interface SavedDraftEdit {
  summary: string;
  checklist: { id: string; label: string; completed: boolean }[];
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
    const c = prototypeFields(d.value, ['id', 'label', 'completed']);
    if (
      Object.keys(c).length !== 3 ||
      c.id !== row.id ||
      c.label !== row.label ||
      typeof c.completed !== 'boolean'
    )
      throw Error('Exact original checklist identity required');
    return { id: row.id, label: row.label, completed: c.completed };
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

function correctionBinding(view: SavedSourceExerciseView) {
  const b = bindings.get(view);
  if (!b) throw Error('Original saved source required');
  check(view, b, true);
  return b;
}
function blocked(a: Attempt, kind: CorrectionKind) {
  return a.unknown
    ? 'UNKNOWN'
    : a.pending
      ? 'PENDING'
      : a.done.has(kind)
        ? 'ALREADY_ATTEMPTED'
        : null;
}
/** Reads original assigned worker entries; the source ID is never inferred from task text. */
export async function readSavedTaskCorrection(
  view: SavedSourceExerciseView,
  sourceEntryId?: string,
) {
  const b = correctionBinding(view),
    canonical = b.sources.estimates.readSyntheticPrototypeSources(
      b.entry.target,
    ),
    entries = canonical.workforce.entries.filter(
      (t) =>
        t.job_id === view.identity.job_id && t.worker_id === b.entry.worker_id,
    ),
    eligible = entries.filter(
      (t) =>
        t.ended_at &&
        t.submitted &&
        canonical.workforce.reviews.some(
          (r) => r.entry_id === t.id && r.decision === 'approved',
        ) &&
        !entries.some((c) => c.corrects_id === t.id),
    ),
    selected =
      sourceEntryId === undefined
        ? eligible.at(-1)
        : eligible.find((t) => t.id === sourceEntryId);
  if (!selected?.ended_at)
    throw Error('Exact closed approved non-superseded task source unavailable');
  const workforce = await b.sources.estimates.workforce(
    view.identity.organization_id,
  );
  check(view, b, true);
  if (!Array.isArray(workforce.periods))
    throw Error('Current period evidence unavailable');
  const locked = workforce.periods.some(
      (p) =>
        p.status === 'locked' &&
        p.starts_at < selected.ended_at! &&
        p.ends_at > selected.started_at,
    ),
    reason =
      blocked(attempt(b), 'time-correction') ??
      (locked ? 'LOCKED_PERIOD' : null);
  check(view, b, true);
  return freezePrototype({
    source_entry_id: selected.id,
    worker_id: selected.worker_id,
    task: selected.task,
    started_at: selected.started_at,
    ended_at: selected.ended_at,
    billable: selected.billable,
    kind: selected.kind,
    submitted: selected.submitted,
    review: 'approved' as const,
    locked,
    blocked_reason: reason,
    can_edit: reason === null,
    eligible_entries: eligible.map((t) => ({
      source_entry_id: t.id,
      task: t.task,
      started_at: t.started_at,
      ended_at: t.ended_at!,
      billable: t.billable,
      kind: t.kind,
    })),
  });
}
export async function executeSavedTaskCorrection(
  view: SavedSourceExerciseView,
  input: SavedTaskCorrection,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error('Explicit reviewed correction confirmation required');
  const f = prototypeFields(input, [
    'source_entry_id',
    'task',
    'started_at',
    'ended_at',
    'billable',
  ]);
  if (
    Object.keys(f).length !== 5 ||
    !reportUuid(f.source_entry_id) ||
    typeof f.task !== 'string' ||
    f.task !== f.task.trim() ||
    !f.task ||
    f.task.length > 2000 ||
    typeof f.started_at !== 'string' ||
    typeof f.ended_at !== 'string' ||
    typeof f.billable !== 'boolean'
  )
    throw Error('Exact bounded task correction required');
  const current = await readSavedTaskCorrection(view, f.source_entry_id);
  if (!current.can_edit)
    throw Error('Task correction blocked: ' + current.blocked_reason);
  const b = correctionBinding(view),
    canonical = b.sources.estimates.readSyntheticPrototypeSources(
      b.entry.target,
    ),
    superseded = new Set(
      canonical.workforce.entries
        .filter(
          (e) =>
            e.corrects_id &&
            canonical.workforce.reviews.some(
              (r) => r.entry_id === e.id && r.decision === 'approved',
            ),
        )
        .map((e) => e.corrects_id),
    ),
    proposal = {
      id: 'correction-preflight',
      worker_id: current.worker_id,
      job_id: view.identity.job_id,
      overhead_center: null,
      task: f.task,
      started_at: f.started_at,
      ended_at: f.ended_at,
      billable: f.billable,
      kind: current.kind,
      corrects_id: current.source_entry_id,
      submitted: false,
    };
  validateTime([
    ...canonical.workforce.entries.filter(
      (e) =>
        !superseded.has(e.id) &&
        !canonical.workforce.reviews.some(
          (r) => r.entry_id === e.id && r.decision === 'rejected',
        ),
    ),
    proposal,
  ]);
  const workforce = await b.sources.estimates.workforce(
      view.identity.organization_id,
    ),
    start = f.started_at,
    end = f.ended_at;
  check(view, b, true);
  if (!Array.isArray(workforce.periods))
    throw Error('Current period evidence unavailable');
  if (
    workforce.periods.some(
      (p) => p.status === 'locked' && p.starts_at < end && p.ends_at > start,
    )
  )
    throw Error('Correction intersects locked period');
  return executeSourceExercise(view, 'time-correction', confirmed, undefined, {
    kind: 'time-correction',
    checkLive: () => {
      if (
        !same(
          prototypeFields(input, [
            'source_entry_id',
            'task',
            'started_at',
            'ended_at',
            'billable',
          ]),
          f,
        )
      )
        throw Error('Live task correction changed');
    },
    input: {
      source_entry_id: f.source_entry_id,
      task: f.task,
      started_at: f.started_at,
      ended_at: f.ended_at,
      billable: f.billable,
    },
  });
}
export function readSavedPlanCorrection(view: SavedSourceExerciseView) {
  const b = correctionBinding(view),
    plan = b.sources.property
      .read(view.identity.organization_id)
      .plans.find((p) => p.id === b.entry.plan_id);
  if (
    !plan ||
    plan.customer_id !== view.identity.customer_id ||
    plan.location_id !== view.identity.location_id ||
    plan.job_id !== view.identity.job_id
  )
    throw Error('Exact bound inspection plan unavailable');
  const reason = blocked(attempt(b), 'plan-revision');
  check(view, b, true);
  return freezePrototype({
    plan_id: plan.id,
    revision: plan.revision,
    name: plan.name,
    cadence: plan.cadence,
    interval_days: plan.interval_days,
    can_edit: reason === null,
    blocked_reason: reason,
  });
}
export async function executeSavedPlanCorrection(
  view: SavedSourceExerciseView,
  input: SavedPlanCorrection,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error('Explicit plan correction confirmation required');
  const f = prototypeFields(input, [
      'plan_id',
      'revision',
      'name',
      'cadence',
      'interval_days',
    ]),
    current = readSavedPlanCorrection(view);
  if (
    Object.keys(f).length !== 5 ||
    f.plan_id !== current.plan_id ||
    f.revision !== current.revision ||
    !current.can_edit ||
    typeof f.name !== 'string' ||
    !f.name ||
    f.name !== f.name.trim() ||
    f.name.length > 200 ||
    typeof f.cadence !== 'string' ||
    !['once', 'weekly', 'monthly', 'custom'].includes(f.cadence) ||
    !Number.isSafeInteger(f.interval_days) ||
    typeof f.interval_days !== 'number' ||
    f.interval_days < 1 ||
    f.interval_days > 365
  )
    throw Error('Exact current plan correction required');
  const b = correctionBinding(view),
    plan = b.sources.property
      .read(view.identity.organization_id)
      .plans.find((p) => p.id === f.plan_id)!;
  const next = {
    ...plan,
    name: f.name,
    cadence: f.cadence as InspectionPlan['cadence'],
    interval_days: f.interval_days,
  };
  occurrence(next, 1);
  return executeSourceExercise(view, 'plan-revision', confirmed, undefined, {
    kind: 'plan-revision',
    checkLive: () => {
      if (
        !same(
          prototypeFields(input, [
            'plan_id',
            'revision',
            'name',
            'cadence',
            'interval_days',
          ]),
          f,
        )
      )
        throw Error('Live plan correction changed');
    },
    input: {
      plan_id: f.plan_id,
      revision: current.revision,
      name: next.name,
      cadence: next.cadence,
      interval_days: next.interval_days,
    },
  });
}
export function readSavedMaterialCorrection(
  view: SavedSourceExerciseView,
  expenseId?: string,
) {
  const b = correctionBinding(view),
    job = b.sources.estimates.readSyntheticPrototypeSources(b.entry.target).job;
  if (!job) throw Error('Exact current job required');
  const eligible = job.expenses.filter(
      (e) =>
        e.category === 'materials' &&
        e.kind === 'commitment' &&
        e.job_id === job.id &&
        reportUuid(e.id) &&
        e.adjusts_expense_id == null &&
        !job.events.some((r) => r.submission_id === e.id),
    ),
    selected =
      expenseId === undefined
        ? eligible.at(-1)
        : eligible.find((e) => e.id === expenseId);
  if (!selected && expenseId !== undefined)
    throw Error('Exact pending material commitment unavailable');
  const project = (e: (typeof eligible)[number]) => ({
      expense_id: e.id,
      supplier: e.supplier,
      reference: e.reference,
      purchase_key: e.purchase_key,
      description: e.description,
      category: e.category,
      kind: e.kind,
      amount_minor: e.amount_minor,
      adjusts_expense_id: e.adjusts_expense_id ?? null,
    }),
    reason = blocked(attempt(b), 'material-review');
  check(view, b, true);
  return freezePrototype({
    ...(selected
      ? project(selected)
      : {
          expense_id: null,
          supplier: null,
          reference: null,
          purchase_key: null,
          description: null,
          category: null,
          kind: null,
          amount_minor: null,
          adjusts_expense_id: null,
        }),
    revision: job.lock_revision,
    can_review: reason === null && selected !== undefined,
    blocked_reason: reason ?? (selected ? null : 'NO_PENDING_MATERIAL'),
    eligible_expenses: eligible.map(project),
  });
}
export async function executeSavedMaterialCorrection(
  view: SavedSourceExerciseView,
  input: SavedMaterialCorrection,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error('Explicit internal material review confirmation required');
  const f = prototypeFields(input, ['expense_id', 'decision', 'reason']);
  if (
    Object.keys(f).length !== 3 ||
    !reportUuid(f.expense_id) ||
    typeof f.decision !== 'string' ||
    !['approved', 'rejected'].includes(f.decision) ||
    typeof f.reason !== 'string' ||
    !f.reason ||
    f.reason !== f.reason.trim() ||
    f.reason.length > 2000
  )
    throw Error('Exact pending material decision and reason required');
  const current = readSavedMaterialCorrection(view, f.expense_id);
  if (!current.can_review) throw Error('Material review already held');
  const b = correctionBinding(view),
    job = b.sources.estimates.readSyntheticPrototypeSources(
      b.entry.target,
    ).job!;
  jobFinancials({
    ...job,
    events: [
      ...job.events,
      {
        id: 'preflight',
        submission_id: f.expense_id,
        decision: f.decision as 'approved' | 'rejected',
        reason: f.reason,
        created_at: '',
      },
    ],
  });
  return executeSourceExercise(view, 'material-review', confirmed, undefined, {
    kind: 'material-review',
    checkLive: () => {
      if (
        !same(prototypeFields(input, ['expense_id', 'decision', 'reason']), f)
      )
        throw Error('Live material review changed');
    },
    input: {
      expense_id: f.expense_id,
      decision: f.decision as 'approved' | 'rejected',
      reason: f.reason,
    },
  });
}
/** Same original custody, exact read-only observation. UNKNOWN is never cleared. */
export async function reconcileSavedSourceCorrection(
  view: SavedSourceExerciseView,
  kind: CorrectionKind,
) {
  const b = bindings.get(view);
  if (
    !b ||
    !['time-correction', 'plan-revision', 'material-review'].includes(kind)
  )
    throw Error('Original exact correction required');
  check(view, b);
  const current = await readSavedSourceExercise(
      b.sources,
      view.identity.job_id,
      b.gate,
    ),
    fresh = correctionBinding(current),
    a = attempt(fresh),
    intent = a.corrections?.[kind];
  check(view, b);
  let observed:
    'EXACT_RESULT_OBSERVED' | 'SOURCE_CHANGED_UNATTRIBUTED' | 'UNAVAILABLE' =
    'UNAVAILABLE';
  if (intent) {
    const canonical = b.sources.estimates.readSyntheticPrototypeSources(
        b.entry.target,
      ),
      state = b.sources.property.read(view.identity.organization_id);
    if (kind === 'time-correction') {
      const expected = intent.expected as SavedTaskCorrection,
        results = canonical.workforce.entries.filter(
          (t) =>
            t.id === intent.result_id &&
            t.corrects_id === intent.source_id &&
            t.job_id === view.identity.job_id &&
            t.worker_id === b.entry.worker_id &&
            t.task === expected.task &&
            t.started_at === expected.started_at &&
            t.ended_at === expected.ended_at &&
            t.billable === expected.billable &&
            t.submitted &&
            canonical.workforce.reviews.some(
              (r) => r.entry_id === t.id && r.decision === 'approved',
            ),
        );
      observed =
        results.length === 1
          ? 'EXACT_RESULT_OBSERVED'
          : canonical.workforce.entries.some(
                (t) => t.corrects_id === intent.source_id,
              )
            ? 'SOURCE_CHANGED_UNATTRIBUTED'
            : 'UNAVAILABLE';
    } else if (kind === 'plan-revision') {
      const expected = intent.expected as SavedPlanCorrection,
        plan = state.plans.find((p) => p.id === intent.source_id);
      observed =
        intent.result_id === plan?.id &&
        plan.revision === expected.revision + 1 &&
        plan.name === expected.name &&
        plan.cadence === expected.cadence &&
        plan.interval_days === expected.interval_days
          ? 'EXACT_RESULT_OBSERVED'
          : plan && plan.revision !== expected.revision
            ? 'SOURCE_CHANGED_UNATTRIBUTED'
            : 'UNAVAILABLE';
    } else {
      const expected = intent.expected as SavedMaterialCorrection,
        event = canonical.job?.events.find(
          (e) =>
            e.id === intent.result_id &&
            e.submission_id === intent.source_id &&
            e.decision === expected.decision &&
            e.reason === expected.reason,
        );
      observed = event
        ? 'EXACT_RESULT_OBSERVED'
        : canonical.job?.events.some(
              (e) => e.submission_id === intent.source_id,
            )
          ? 'SOURCE_CHANGED_UNATTRIBUTED'
          : 'UNAVAILABLE';
    }
  }
  check(current, fresh, true);
  check(view, b);
  return freezePrototype({
    kind,
    state: a.unknown
      ? ('UNKNOWN' as const)
      : a.pending
        ? ('PENDING' as const)
        : (intent?.state ?? ('NOT_ATTEMPTED' as const)),
    source_id: intent?.source_id ?? null,
    result_id: intent?.result_id ?? null,
    observed,
    replay: 'FORBIDDEN' as const,
  });
}

/** Detailed observation of the SAME original task intent. No receipt is guessed
 * from matching text/time or an unacknowledged successor, and no hold is changed.
 * Missing legacy binding is unverified; historical intents are never backfilled. */
export async function reconcileSavedTaskReceipt(view: SavedSourceExerciseView) {
  const b = bindings.get(view);
  if (!b) throw Error('Original exact task receipt source required');
  check(view, b);
  const a = attempt(b),
    before = JSON.stringify([a.unknown, a.pending, [...a.done], a.corrections]),
    current = await readSavedSourceExercise(
      b.sources,
      view.identity.job_id,
      b.gate,
    ),
    fresh = correctionBinding(current),
    intent = a.corrections?.['time-correction'],
    binding = intent?.task_binding;
  check(view, b);
  if (
    before !==
    JSON.stringify([a.unknown, a.pending, [...a.done], a.corrections])
  )
    throw Error(
      'Original task custody changed during reconciliation; read only again',
    );
  if (
    binding &&
    (!same(binding.identity, view.identity) ||
      binding.visit_id !== view.evidence.visit_id ||
      binding.plan_id !== view.evidence.plan_id)
  )
    throw Error(
      'Exact original task receipt version, visit and plan binding required',
    );
  const workforce = b.sources.estimates.readSyntheticPrototypeSources(
      b.entry.target,
    ).workforce,
    sourceRows = intent
      ? workforce.entries.filter((t) => t.id === intent.source_id)
      : [],
    resultRows = intent?.result_id
      ? workforce.entries.filter((t) => t.id === intent.result_id)
      : [],
    successors = intent
      ? workforce.entries.filter((t) => t.corrects_id === intent.source_id)
      : [],
    reviews = intent?.result_id
      ? workforce.reviews.filter((r) => r.entry_id === intent.result_id)
      : [],
    approved = reviews.filter((r) => r.decision === 'approved'),
    sourceReviews = intent
      ? workforce.reviews.filter((r) => r.entry_id === intent.source_id)
      : [],
    expected = intent?.expected as SavedTaskCorrection | undefined,
    source = sourceRows.length === 1 ? sourceRows[0] : null,
    result = resultRows.length === 1 ? resultRows[0] : null,
    scopeMatches = (t: { job_id: string | null; worker_id: string }) =>
      t.job_id === view.identity.job_id && t.worker_id === b.entry.worker_id,
    expectedMatches = resultRows.filter(
      (t) =>
        expected &&
        binding &&
        scopeMatches(t) &&
        t.corrects_id === intent!.source_id &&
        t.task === expected.task &&
        t.started_at === expected.started_at &&
        t.ended_at === expected.ended_at &&
        t.billable === expected.billable &&
        t.kind === binding.original.kind,
    ),
    project = (t: TaskReceiptSource) => ({
      id: t.id,
      worker_id: t.worker_id,
      job_id: t.job_id,
      task: t.task,
      kind: t.kind,
      started_at: t.started_at,
      ended_at: t.ended_at,
      billable: t.billable,
      submitted: t.submitted,
      corrects_id: t.corrects_id,
    }),
    conflicts: string[] = [];
  if (sourceRows.length > 1) conflicts.push('DUPLICATE_SOURCE_ID');
  if (sourceRows.length && sourceReviews.length !== 1)
    conflicts.push('AMBIGUOUS_SOURCE_REVIEW');
  if (sourceReviews.length === 1 && sourceReviews[0].decision !== 'approved')
    conflicts.push('SOURCE_REVIEW_NOT_APPROVED');
  if (source && !scopeMatches(source))
    conflicts.push('SOURCE_BINDING_MISMATCH');
  if (source && binding && !same(project(source), binding.original))
    conflicts.push('SOURCE_CONTENT_CHANGED');
  if (resultRows.length > 1) conflicts.push('DUPLICATE_RESULT_ID');
  if (result && !scopeMatches(result))
    conflicts.push('RESULT_BINDING_MISMATCH');
  if (result && binding && expectedMatches.length !== 1)
    conflicts.push('RESULT_CONTENT_MISMATCH');
  if (successors.length > 1) conflicts.push('COMPETING_CORRECTIONS');
  if (reviews.length > 1) conflicts.push('AMBIGUOUS_RESULT_REVIEW');
  if (reviews.length === 1 && approved.length !== 1)
    conflicts.push('RESULT_REVIEW_NOT_APPROVED');
  let nativeStage:
    | 'NOT_OBSERVED'
    | 'UNATTRIBUTED_SUCCESSOR'
    | 'RECORDED_UNSUBMITTED'
    | 'SUBMITTED_UNREVIEWED'
    | 'APPROVED' = 'NOT_OBSERVED';
  if (result && expectedMatches.length === 1)
    nativeStage = !result.submitted
      ? 'RECORDED_UNSUBMITTED'
      : approved.length === 1 && reviews.length === 1
        ? 'APPROVED'
        : 'SUBMITTED_UNREVIEWED';
  else if (!intent?.result_id && successors.length)
    nativeStage = 'UNATTRIBUTED_SUCCESSOR';
  const classification = !intent
    ? 'NO_ORIGINAL_CLAIM'
    : !binding
      ? 'LEGACY_BINDING_UNVERIFIED'
      : conflicts.length
        ? 'CONFLICT_REVIEW_REQUIRED'
        : sourceRows.length !== 1
          ? 'ORIGINAL_SOURCE_UNAVAILABLE'
          : !intent.result_id
            ? successors.length
              ? 'UNACKNOWLEDGED_SUCCESSOR'
              : 'NO_ACKNOWLEDGED_RESULT'
            : resultRows.length !== 1
              ? 'ACKNOWLEDGED_RESULT_UNAVAILABLE'
              : nativeStage === 'APPROVED'
                ? 'EXACT_NATIVE_RESULT'
                : 'PARTIAL_NATIVE_RESULT';
  check(current, fresh, true);
  check(view, b);
  if (
    before !==
    JSON.stringify([a.unknown, a.pending, [...a.done], a.corrections])
  )
    throw Error('Original task custody changed during reconciliation');
  return freezePrototype({
    identity: { ...view.identity },
    visit_id: view.evidence.visit_id,
    plan_id: view.evidence.plan_id,
    state: a.unknown
      ? ('UNKNOWN' as const)
      : a.pending
        ? ('PENDING' as const)
        : (intent?.state ?? ('NOT_ATTEMPTED' as const)),
    source_id: intent?.source_id ?? null,
    result_id: intent?.result_id ?? null,
    binding: binding
      ? ('EXACT_ORIGINAL_BINDING' as const)
      : ('UNVERIFIED' as const),
    classification,
    native_stage: nativeStage,
    counts: {
      source_rows: sourceRows.length,
      source_reviews: sourceReviews.length,
      result_rows: resultRows.length,
      expected_match_rows: expectedMatches.length,
      successor_rows: successors.length,
      result_reviews: reviews.length,
      approved_reviews: approved.length,
    },
    conflicts,
    expected:
      binding && expected ? { ...expected, kind: binding.original.kind } : null,
    original: binding ? { ...binding.original } : null,
    observed_source: source && scopeMatches(source) ? project(source) : null,
    observed_result: result && scopeMatches(result) ? project(result) : null,
    coverage: 'EXACT_ORIGINAL_CLAIM_ONLY' as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    replay: 'FORBIDDEN' as const,
    dispatch: false as const,
    payroll: false as const,
    financial: false as const,
  });
}

export const savedRequestStatuses = [
  'new',
  'reviewing',
  'qualified',
  'closed',
] as const;
export interface SavedRequestActionInput {
  request_id: string;
  status: (typeof savedRequestStatuses)[number];
  assigned_to: string | null;
  expected_status: string;
  expected_assigned_to: string | null;
  expected_updated_at: string;
}
interface ServiceRequestIntent {
  readonly metadata: Readonly<{
    organization_id: string;
    customer_id: string;
    location_id: string;
    request_id: string;
    source_view_sha256: string;
    source_status: string;
    source_assigned_to: string | null;
    source_updated_at: string;
    requested_status: SavedRequestActionInput['status'];
    requested_assigned_to: string | null;
  }>;
  fingerprint: string;
  immutable_fingerprint: string;
  state: 'PENDING' | 'KNOWN_SAVED' | 'UNKNOWN';
}
function requestAttempt(b: Binding) {
  // Same original registry, explicitly separate from job-scoped exercise keys.
  // The request hold spans every job/view referring to this exact request.
  return attempt(
    b,
    JSON.stringify([
      'service-request',
      b.entry.target.organization_id,
      b.entry.intake_request_id,
    ]),
  );
}
function requestRow(view: SavedSourceExerciseView, b: Binding) {
  return b.sources.operations.syntheticIntakeRequest(
    view.identity.organization_id,
    view.identity.customer_id,
    view.identity.location_id,
    b.entry.intake_request_id,
  );
}
function requestImmutableFields(row: ReturnType<typeof requestRow>) {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => !['status', 'assigned_to', 'updated_at'].includes(key),
    ),
  );
}
function requestState(a: Attempt) {
  return a.unknown
    ? ('UNKNOWN' as const)
    : (a.service_request?.state ?? ('NOT_ATTEMPTED' as const));
}
/** Current exact native request and eligible original membership IDs only. No
 * request history/PII copy, operational assignment grant or new request store. */
export function readSavedRequestAction(view: SavedSourceExerciseView) {
  const b = correctionBinding(view),
    row = requestRow(view, b),
    a = requestAttempt(b),
    eligible = b.sources.operations
      .syntheticMemberships(view.identity.organization_id)
      .filter(
        (m) => m.active && m.organization_id === view.identity.organization_id,
      );
  if (new Set(eligible.map((m) => m.user_id)).size !== eligible.length)
    throw Error('Unambiguous current request assignees required');
  check(view, b, true);
  return freezePrototype({
    request_id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    location_id: row.service_location_id,
    status: row.status,
    assigned_to: row.assigned_to,
    updated_at: row.updated_at,
    eligible_assignees: eligible.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      staff_type: m.staff_type,
    })),
    statuses: [...savedRequestStatuses],
    state: requestState(a),
    can_edit: !a.unknown && !a.service_request,
    replay: 'FORBIDDEN' as const,
    native_cas: false as const,
    durable_receipt: false as const,
  });
}
/** Explicit one-use LOCAL request review. assignIntake has a void ACK and no
 * native CAS/receipt: this is an in-process fingerprint fence, never server or
 * durable command authority. Missing/failed/lost ACK is permanently UNKNOWN. */
export async function executeSavedRequestAction(
  view: SavedSourceExerciseView,
  input: SavedRequestActionInput,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error('Explicit native request review confirmation required');
  const f = prototypeFields(input, [
    'request_id',
    'status',
    'assigned_to',
    'expected_status',
    'expected_assigned_to',
    'expected_updated_at',
  ]);
  if (
    Object.keys(f).length !== 6 ||
    !reportUuid(f.request_id) ||
    !savedRequestStatuses.includes(
      f.status as SavedRequestActionInput['status'],
    ) ||
    !(f.assigned_to === null || typeof f.assigned_to === 'string') ||
    typeof f.expected_status !== 'string' ||
    !(
      f.expected_assigned_to === null ||
      typeof f.expected_assigned_to === 'string'
    ) ||
    typeof f.expected_updated_at !== 'string'
  )
    throw Error('Exact bounded request review fields required');
  const b = correctionBinding(view),
    current = readSavedRequestAction(view),
    row = requestRow(view, b),
    a = requestAttempt(b);
  if (
    !current.can_edit ||
    current.request_id !== f.request_id ||
    current.status !== f.expected_status ||
    current.assigned_to !== f.expected_assigned_to ||
    current.updated_at !== f.expected_updated_at ||
    (f.assigned_to !== null &&
      !current.eligible_assignees.some((m) => m.user_id === f.assigned_to))
  )
    throw Error('Exact current request source and eligible assignee required');
  const fingerprint = JSON.stringify(row);
  check(view, b, true);
  if (JSON.stringify(requestRow(view, b)) !== fingerprint)
    throw Error('Native request source changed before original claim');
  const intent: ServiceRequestIntent = {
    metadata: freezePrototype({
      organization_id: view.identity.organization_id,
      customer_id: view.identity.customer_id,
      location_id: view.identity.location_id,
      request_id: current.request_id,
      source_view_sha256: view.sha256,
      source_status: current.status,
      source_assigned_to: current.assigned_to,
      source_updated_at: current.updated_at,
      requested_status: f.status as SavedRequestActionInput['status'],
      requested_assigned_to: f.assigned_to as string | null,
    }),
    fingerprint: '',
    immutable_fingerprint: '',
    state: 'PENDING',
  };
  a.service_request = intent; // SAME original registry, before the first native await.
  try {
    // Claim precedes hashing too. Retain only hashes, never a request snapshot.
    intent.fingerprint = await documentHash(row);
    check(view, b, true);
    if (
      !same(
        prototypeFields(input, [
          'request_id',
          'status',
          'assigned_to',
          'expected_status',
          'expected_assigned_to',
          'expected_updated_at',
        ]),
        f,
      )
    )
      throw Error('Confirmed request input changed during source hashing');
    intent.immutable_fingerprint = await documentHash(
      requestImmutableFields(row),
    );
    check(view, b, true);
    if (
      !same(
        prototypeFields(input, [
          'request_id',
          'status',
          'assigned_to',
          'expected_status',
          'expected_assigned_to',
          'expected_updated_at',
        ]),
        f,
      )
    )
      throw Error('Confirmed request input changed during source hashing');
    // No await between this final current source/member check and invocation.
    check(view, b, true);
    if (
      JSON.stringify(requestRow(view, b)) !== fingerprint ||
      (intent.metadata.requested_assigned_to !== null &&
        !b.sources.operations
          .syntheticMemberships(view.identity.organization_id)
          .some(
            (m) =>
              m.active && m.user_id === intent.metadata.requested_assigned_to,
          ))
    )
      throw Error('Native request or assignee changed at invocation');
    ack(
      await b.sources.operations.assignIntake(
        view.identity.organization_id,
        intent.metadata.request_id,
        intent.metadata.requested_assigned_to,
        intent.metadata.requested_status,
      ),
    );
    check(view, b);
    if (
      !same(
        prototypeFields(input, [
          'request_id',
          'status',
          'assigned_to',
          'expected_status',
          'expected_assigned_to',
          'expected_updated_at',
        ]),
        f,
      )
    )
      throw Error(
        'Confirmed native request input changed during acknowledgment',
      );
    const after = requestRow(view, b);
    if (
      !Number.isFinite(Date.parse(after.updated_at)) ||
      Date.parse(after.updated_at) < Date.parse(row.updated_at) ||
      !same(after, {
        ...row,
        status: intent.metadata.requested_status,
        assigned_to: intent.metadata.requested_assigned_to,
        updated_at: after.updated_at,
      })
    )
      throw Error(
        'Exact native request current row unavailable after void acknowledgment',
      );
    if (
      intent.metadata.requested_assigned_to !== null &&
      !b.sources.operations
        .syntheticMemberships(view.identity.organization_id)
        .some(
          (m) =>
            m.active && m.user_id === intent.metadata.requested_assigned_to,
        )
    )
      throw Error('Request assignee changed during acknowledgment');
    check(view, b);
    intent.state = 'KNOWN_SAVED';
    return {
      status: 'SYNTHETIC_SOURCE_SAVED' as const,
      kind: 'service-request' as const,
      request_id: intent.metadata.request_id,
    };
  } catch (error) {
    a.unknown = true;
    intent.state = 'UNKNOWN';
    throw error;
  }
}
/** Exact current-row observation only, NOT a native receipt or attribution proof.
 * The original UNKNOWN hold is never cleared, including after an observed write. */
export async function reconcileSavedRequestAction(
  view: SavedSourceExerciseView,
) {
  const b = bindings.get(view);
  if (!b) throw Error('Original native request source required');
  check(view, b);
  const a = requestAttempt(b),
    before = JSON.stringify([a.unknown, a.service_request]),
    current = await readSavedSourceExercise(
      b.sources,
      view.identity.job_id,
      b.gate,
    ),
    fresh = correctionBinding(current),
    intent = a.service_request;
  check(view, b);
  if (before !== JSON.stringify([a.unknown, a.service_request]))
    throw Error('Original native request custody changed during read');
  if (
    intent &&
    (intent.metadata.organization_id !== view.identity.organization_id ||
      intent.metadata.customer_id !== view.identity.customer_id ||
      intent.metadata.location_id !== view.identity.location_id ||
      intent.metadata.request_id !== b.entry.intake_request_id)
  )
    throw Error('Exact original request/property binding required');
  let observed:
    | 'EXACT_CURRENT_ROW_OBSERVED'
    | 'SOURCE_CHANGED_UNATTRIBUTED'
    | 'UNAVAILABLE' = 'UNAVAILABLE';
  let row: ReturnType<typeof requestRow> | null;
  try {
    row = requestRow(view, b);
  } catch {
    row = null;
  }
  if (row && intent) {
    const immutableHash = await documentHash(requestImmutableFields(row));
    check(current, fresh, true);
    check(view, b);
    const fullHash = await documentHash(row);
    check(current, fresh, true);
    check(view, b);
    observed =
      intent.immutable_fingerprint &&
      immutableHash === intent.immutable_fingerprint &&
      row.status === intent.metadata.requested_status &&
      row.assigned_to === intent.metadata.requested_assigned_to &&
      Number.isFinite(Date.parse(row.updated_at)) &&
      Date.parse(row.updated_at) >=
        Date.parse(intent.metadata.source_updated_at)
        ? 'EXACT_CURRENT_ROW_OBSERVED'
        : intent.fingerprint && fullHash !== intent.fingerprint
          ? 'SOURCE_CHANGED_UNATTRIBUTED'
          : 'UNAVAILABLE';
  }
  check(current, fresh, true);
  check(view, b);
  if (before !== JSON.stringify([a.unknown, a.service_request]))
    throw Error('Native request custody changed during read');
  return freezePrototype({
    state: requestState(a),
    request_id: b.entry.intake_request_id,
    source_status: intent?.metadata.source_status ?? null,
    source_assigned_to: intent?.metadata.source_assigned_to ?? null,
    source_updated_at: intent?.metadata.source_updated_at ?? null,
    requested_status: intent?.metadata.requested_status ?? null,
    requested_assigned_to: intent?.metadata.requested_assigned_to ?? null,
    observed,
    current: row
      ? {
          request_id: row.id,
          status: row.status,
          assigned_to: row.assigned_to,
          updated_at: row.updated_at,
        }
      : null,
    replay: 'FORBIDDEN' as const,
    native_cas: false as const,
    durable_receipt: false as const,
    attribution: 'CURRENT_ROW_OBSERVATION_ONLY' as const,
  });
}
