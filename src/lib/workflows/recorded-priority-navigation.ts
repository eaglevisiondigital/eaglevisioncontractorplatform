import { prototypeFields, freezePrototype } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { DailyWorkbenchProps } from './daily-workbench-contract';
import {
  readPrioritySavedRevision,
  prioritySavedRevisionsEnabled,
  type PrioritySavedEvidence,
} from './priority-saved-revisions';
import type { SavedRevisionSnapshot } from './saved-revision-runtime';
import {
  evidenceFields,
  evidenceText,
  evidenceNumber,
  evidenceList,
  evidenceLiteral,
  type EvidenceRecipe,
  type EvidenceIdentity,
} from './saved-evidence-runtime';
import {
  readPriorityActions,
  filterPriorityActions,
  assertPriorityActionsCurrent,
  inspectPriorityAction,
  priorityContinuationStep,
  continuePriorityAction,
  type PriorityActionsRead,
  type PriorityLiveCallback,
} from './priority-actions';
import {
  readDailyWorkContext,
  assertDailyWorkContextNow,
  continueDailyWorkContext,
  type DailyWorkContext,
} from './daily-workbench-runtime';

export const recordedPriorityNavigationEnabled = prioritySavedRevisionsEnabled;
type Parser = (v: unknown) => unknown;
const text: Parser = (v) => evidenceText(v),
  number: Parser = (v) => evidenceNumber(v),
  id: Parser = (v) => {
    const s = evidenceText(v, 700);
    if (!s) throw Error('Exact source identity required');
    return s;
  },
  hash: Parser = (v) => {
    const s = evidenceText(v, 64);
    if (!/^[a-f0-9]{64}$/.test(s)) throw Error('Exact source hash required');
    return s;
  };
const optional =
    (parse: Parser): Parser =>
    (v) =>
      v === null ? null : parse(v),
  list =
    (parse: Parser): Parser =>
    (v) =>
      evidenceList(v).map(parse),
  choice =
    (...values: unknown[]): Parser =>
    (v) => {
      if (!values.includes(v))
        throw Error('Exact original priority state required');
      return v;
    };
const shape =
  (schema: Record<string, Parser>): Parser =>
  (v) => {
    const p = evidenceFields(v, Object.keys(schema));
    return Object.fromEntries(Object.keys(p).map((k) => [k, schema[k](p[k])]));
  };
const sourceSchema = shape({
  kind: choice('finance', 'visit', 'time', 'issued', 'report'),
  id,
  version: optional(number),
  revision: optional(number),
  related_ids: list(id),
  job_revision: number,
  issued_version: shape({
    estimate_id: id,
    version_id: id,
    version_number: number,
    saved_revision: number,
  }),
  source_sha256: hash,
});
const cardSchema = shape({
  key: id,
  rank: number,
  area: choice('finance', 'field', 'scope', 'documentation'),
  level: choice('evidence', 'review'),
  job_id: id,
  context: shape({ job: text, customer: text, property: text }),
  recorded_fact: text,
  suggested_human_review: text,
  recorded_day: optional(text),
  review_band: choice(
    'EVIDENCE_GAP',
    'EARLIER_CONTEXT',
    'REVIEW_DAY_CONTEXT',
    'LATER_CONTEXT',
    'UNDATED_CONTEXT',
  ),
  order_reasons: list(text),
  missing_evidence: list(shape({ code: id, status: text, detail: text })),
  source: sourceSchema,
  authority: (v) => evidenceLiteral(v, 'HUMAN_REVIEW_SUGGESTION_ONLY'),
  sha256: hash,
});
const payloadSchema = shape({
  job_revision: number,
  review_on: text,
  timezone: text,
  cards: list(cardSchema),
  coverage: shape({
    selected_jobs: number,
    history: (v) =>
      evidenceLiteral(
        v,
        'AVAILABLE_EXACT_SELECTED_JOB_SOURCES_ONLY_NOT_WHOLE_COMPANY',
      ),
  }),
  model: (v) => evidenceLiteral(v, 'NONE'),
  authority: (v) => evidenceLiteral(v, 'READ_ONLY_NO_ACTION_RENEWAL'),
});
export function parseRecordedPriorityEvidence(
  value: unknown,
  identity: EvidenceIdentity,
): PrioritySavedEvidence {
  const parsed = payloadSchema(value) as PrioritySavedEvidence;
  if (
    !/^\d{4}-\d\d-\d\d$/.test(parsed.review_on) ||
    !parsed.timezone ||
    parsed.coverage.selected_jobs !== 1 ||
    new Set(parsed.cards.map((c) => c.key)).size !== parsed.cards.length
  )
    throw Error('Exact selected-job priority evidence required');
  for (const c of parsed.cards)
    if (
      c.job_id !== identity.job_id ||
      c.source.issued_version.estimate_id !== identity.estimate_id ||
      c.source.issued_version.version_id !== identity.version_id ||
      c.source.job_revision !== parsed.job_revision ||
      new Set(c.source.related_ids).size !== c.source.related_ids.length
    )
      throw Error('Exact priority source ownership required');
  return parsed;
}
function project(
  snapshot: SavedRevisionSnapshot<unknown>,
): PrioritySavedEvidence {
  return snapshot.evidence as PrioritySavedEvidence;
}
export function assertRecordedPrioritySource(
  payload: PrioritySavedEvidence,
  snapshot: SavedRevisionSnapshot<unknown>,
) {
  const current = project(snapshot);
  parseRecordedPriorityEvidence(payload, snapshot.identity);
  if (
    payload.job_revision > current.job_revision ||
    payload.review_on !== current.review_on ||
    payload.timezone !== current.timezone
  )
    throw Error('Exact historical priority context required');
  for (const card of payload.cards) {
    const match = current.cards.find(
      (c) =>
        c.key === card.key &&
        c.source.id === card.source.id &&
        c.source.kind === card.source.kind,
    );
    if (
      !match ||
      JSON.stringify(card.context) !== JSON.stringify(match.context) ||
      JSON.stringify(card.source.issued_version) !==
        JSON.stringify(match.source.issued_version) ||
      card.source.version !== match.source.version ||
      (card.source.revision !== null &&
        (match.source.revision === null ||
          card.source.revision > match.source.revision)) ||
      card.source.related_ids.some(
        (id) => !match.source.related_ids.includes(id),
      )
    )
      throw Error('Unrecorded priority source rejected');
    if (
      JSON.stringify(card.source) === JSON.stringify(match.source) &&
      JSON.stringify(card) !== JSON.stringify(match)
    )
      throw Error('Exact current priority content required');
  }
}
export const recordedPriorityRecipe: EvidenceRecipe<PrioritySavedEvidence> =
  Object.freeze({
    kind: 'priorities',
    title: 'Recorded priorities',
    read: readPrioritySavedRevision,
    project,
    parse: parseRecordedPriorityEvidence,
    assertSource: assertRecordedPrioritySource,
  });

interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  review: PriorityActionsRead;
  context: DailyWorkContext;
  job: string;
}
const views = new WeakMap<object, Binding>();
type OriginalTask = Awaited<ReturnType<typeof inspectPriorityAction>>;
const inspected = new WeakMap<
  object,
  { binding: Binding; task: OriginalTask; used: boolean }
>();
export async function readRecordedPriorityNavigation(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  if (!recordedPriorityNavigationEnabled(gate.enabled))
    throw Error('Recorded priority navigation is OFF');
  const review = await readPriorityActions(sources, { job_id: jobId }, gate);
  const context = await readDailyWorkContext(sources, jobId, gate);
  assertPriorityActionsCurrent(review);
  assertDailyWorkContextNow(context);
  const filtered = filterPriorityActions(review, {
    area: 'all',
    level: 'all',
    job_id: jobId,
    query: '',
    band: 'all',
  });
  const view = freezePrototype({
    job_id: jobId,
    organization_id: context.organization_id,
    customer_id: context.customer_id,
    location_id: context.location_id,
    cards: filtered.cards,
    coverage: filtered.coverage,
    authority: 'INSPECTED_LOCAL_REVIEW_NAVIGATION_ONLY' as const,
    operational_ready: false as const,
  });
  views.set(view, { sources, gate, review, context, job: jobId });
  return view;
}
export type RecordedPriorityNavigation = Awaited<
  ReturnType<typeof readRecordedPriorityNavigation>
>;
function current(view: RecordedPriorityNavigation) {
  const b = views.get(view);
  if (!b) throw Error('Original recorded priority view required');
  assertPriorityActionsCurrent(b.review);
  assertDailyWorkContextNow(b.context);
  return b;
}
export function assertRecordedPriorityNavigationCurrent(
  view: RecordedPriorityNavigation,
) {
  current(view);
}
export async function inspectRecordedPrioritySource(
  view: RecordedPriorityNavigation,
  key: string,
) {
  const b = current(view);
  if (!view.cards.some((c) => c.key === key))
    throw Error('Exact displayed source required');
  const task = await inspectPriorityAction(b.review, key);
  current(view);
  const step = priorityContinuationStep(task);
  const result = freezePrototype({
    key,
    job_id: b.job,
    source: {
      kind: task.source.kind,
      id: task.source.id,
      version: task.source.version,
      revision: task.source.revision,
      related_ids: [...task.source.related_ids],
    },
    recorded_fact: task.card.recorded_fact,
    suggested_human_review: task.card.suggested_human_review,
    step,
    meaning: 'EXACT_INSPECTED_SOURCE_ONLY' as const,
  });
  inspected.set(result, { binding: b, task, used: false });
  return result;
}
export type RecordedPriorityInspection = Awaited<
  ReturnType<typeof inspectRecordedPrioritySource>
>;
export async function continueRecordedPrioritySource(
  view: RecordedPriorityNavigation,
  source: RecordedPriorityInspection,
  callback: NonNullable<DailyWorkbenchProps['onContinue']>,
  live: PriorityLiveCallback,
) {
  let b: Binding;
  try {
    b = current(view);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
  const record = inspected.get(source);
  if (!record || record.binding !== b || record.used)
    return {
      status: 'WITHHELD_NO_DISPATCH' as const,
      replay: 'FORBIDDEN' as const,
    };
  const p = prototypeFields(live, ['current', 'generation']);
  if (
    p.current !== callback ||
    typeof callback !== 'function' ||
    !Number.isSafeInteger(p.generation)
  )
    return {
      status: 'WITHHELD_NO_DISPATCH' as const,
      replay: 'FORBIDDEN' as const,
    };
  const generation = p.generation;
  const dispatch = async () => {
    current(view);
    await continuePriorityAction(b.review, record.task, callback, live);
    current(view);
  };
  const lease = () => {
    current(view);
    const currentLease = prototypeFields(live, ['current', 'generation']);
    return currentLease.current === callback &&
      currentLease.generation === generation
      ? dispatch
      : undefined;
  };
  record.used = true;
  return continueDailyWorkContext(b.context, source.step, dispatch, lease);
}
