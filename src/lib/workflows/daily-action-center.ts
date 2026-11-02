import { capacityDay } from '../../domain/field/crew-capacity';
import { documentHash } from '../../domain/release/preview';
import { completionReviewGuard } from '../job-cost-completion';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readPriorityExplanations,
  filterPriorityExplanations,
  inspectPriorityExplanations,
  openPriorityExplanation,
  openPriorityExplanationJob,
  type PriorityExplanationsReview,
  type PriorityExplanationsFilter,
} from './priority-explanations';
import {
  readBusinessBriefing,
  filterBusinessBriefing,
  inspectBusinessBriefing,
  type BusinessBriefingReview,
} from './business-briefing';

export const actionReviewBands = [
  'EVIDENCE_GAP',
  'EARLIER_CONTEXT',
  'REVIEW_DAY_CONTEXT',
  'LATER_CONTEXT',
  'UNDATED_CONTEXT',
] as const;
export interface DailyActionCenterInput {
  review_on: string;
  timezone: string;
  input_revision: number;
  ordering: 'EVIDENCE_FIRST' | 'RECORDED_DAY_FIRST';
}
export interface DailyActionCenterFilter extends PriorityExplanationsFilter {
  band: 'all' | (typeof actionReviewBands)[number];
}
const all = { area: 'all', level: 'all', job_id: null, query: '' } as const;
const denied = () =>
  Error('Exact current daily action review and source identity required');
function own(value: unknown, keys: readonly string[]) {
  const p = prototypeFields(value, keys);
  if (Reflect.ownKeys(p).length !== keys.length) throw denied();
  return p;
}
function pin(value: DailyActionCenterInput) {
  const p = own(value, ['review_on', 'timezone', 'input_revision', 'ordering']);
  if (
    typeof p.review_on !== 'string' ||
    typeof p.timezone !== 'string' ||
    p.timezone.length > 100 ||
    !Number.isSafeInteger(p.input_revision) ||
    Number(p.input_revision) < 1 ||
    !['EVIDENCE_FIRST', 'RECORDED_DAY_FIRST'].includes(p.ordering as string)
  )
    throw denied();
  capacityDay(p.review_on, p.timezone);
  return p as unknown as DailyActionCenterInput;
}
const records = new WeakMap<
  object,
  {
    check: () => void;
    explanations: PriorityExplanationsReview;
    briefing: BusinessBriefingReview;
    uncertain: boolean;
  }
>();
/** Deterministic staff-selected review ordering over existing exact evidence, never operational urgency. */
export async function readDailyActionCenter(
  sources: OperatingSources,
  originalInput: DailyActionCenterInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  const capture = captureOperatingSources(sources, gate),
    selected = pin(originalInput),
    identity = JSON.stringify(selected);
  let explanations: PriorityExplanationsReview | null = null,
    briefing: BusinessBriefingReview | null = null;
  const check = () => {
    capture.check();
    if (JSON.stringify(pin(originalInput)) !== identity) throw denied();
    if (explanations) filterPriorityExplanations(explanations, all);
    if (briefing) filterBusinessBriefing(briefing, all);
  };
  const childInput = {
    review_on: selected.review_on,
    timezone: selected.timezone,
    input_revision: selected.input_revision,
  };
  check();
  explanations = await readPriorityExplanations(sources, childInput, gate);
  check();
  // The original briefing exposes the recorded source day. Do not parse dates out of explanation prose.
  briefing = await readBusinessBriefing(sources, childInput, gate);
  check();
  const cards = explanations.explanations.map((explanation) => {
    const matches = briefing!.cards.filter(
      (card) => card.key === explanation.key,
    );
    if (matches.length !== 1) throw denied();
    const card = matches[0],
      job = briefing!.jobs.find((j) => j.target.job_id === card.job_id);
    if (
      !job ||
      JSON.stringify(job.target) !==
        JSON.stringify(explanation.source.target) ||
      card.source.id !== explanation.source.id ||
      card.source.kind !== explanation.source.kind ||
      card.source.version !== explanation.source.version ||
      card.source.revision !== explanation.source.revision ||
      JSON.stringify(card.source.related_ids) !==
        JSON.stringify(explanation.source.related_ids) ||
      card.observation !== explanation.recorded_fact ||
      card.suggested_review !== explanation.suggested_human_review
    )
      throw denied();
    const relation =
      card.recorded_day === null
        ? ('UNDATED' as const)
        : card.recorded_day < selected.review_on
          ? ('EARLIER' as const)
          : card.recorded_day === selected.review_on
            ? ('REVIEW_DAY' as const)
            : ('LATER' as const);
    const band =
      explanation.level === 'evidence'
        ? ('EVIDENCE_GAP' as const)
        : relation === 'EARLIER'
          ? ('EARLIER_CONTEXT' as const)
          : relation === 'REVIEW_DAY'
            ? ('REVIEW_DAY_CONTEXT' as const)
            : relation === 'LATER'
              ? ('LATER_CONTEXT' as const)
              : ('UNDATED_CONTEXT' as const);
    return {
      ...explanation,
      recorded_day: card.recorded_day,
      date_relation: relation,
      review_band: band,
      evidence_status: explanation.missing_evidence.some(
        (e) => e.status === 'UNKNOWN',
      )
        ? ('UNKNOWN_EVIDENCE_REMAINS' as const)
        : ('SEPARATE_AUTHORITY_UNVERIFIED' as const),
      order_reasons: [
        `Staff-selected criterion: ${selected.ordering === 'EVIDENCE_FIRST' ? 'evidence gaps before recorded context' : 'recorded source day before evidence class'}.`,
        `Existing source classification: ${explanation.level === 'evidence' ? 'evidence gap' : 'recorded evidence review'}; source kind ${card.source.kind}.`,
        card.recorded_day === null
          ? 'No source day is recorded; this is undated context.'
          : `Recorded source day ${card.recorded_day} is ${relation === 'EARLIER' ? 'before' : relation === 'REVIEW_DAY' ? 'on' : 'after'} the selected review day ${selected.review_on}.`,
        'Dates are source context, not deadlines, missed appointments, overdue debt, physical severity or available working hours.',
        'Remaining ties use the existing briefing rank and exact job/source identity.',
      ],
      urgency_authority: 'NO_OPERATIONAL_URGENCY_INFERRED' as const,
    };
  });
  if (
    cards.length !== briefing.cards.length ||
    new Set(cards.map((c) => c.key)).size !== cards.length
  )
    throw denied();
  const textCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const dayCompare = (a: (typeof cards)[number], b: (typeof cards)[number]) =>
    textCompare(a.recorded_day ?? '9999', b.recorded_day ?? '9999');
  const evidenceCompare = (
    a: (typeof cards)[number],
    b: (typeof cards)[number],
  ) => Number(a.level === 'review') - Number(b.level === 'review');
  cards.sort(
    (a, b) =>
      (selected.ordering === 'EVIDENCE_FIRST'
        ? evidenceCompare(a, b) || dayCompare(a, b)
        : dayCompare(a, b) || evidenceCompare(a, b)) ||
      a.rank - b.rank ||
      textCompare(a.key, b.key),
  );
  const ranked = cards.map((card, index) => ({
    ...card,
    original_briefing_rank: card.rank,
    rank: index + 1,
  }));
  const body = {
    mode: 'LOCAL_DAILY_ACTION_CENTER' as const,
    organization_id: capture.organization_id,
    actor_id: capture.actor_id,
    review_on: selected.review_on,
    timezone: selected.timezone,
    input_revision: selected.input_revision,
    selected_criteria: {
      ordering: selected.ordering,
      meaning:
        'Explicit staff review organization only. No saved priority, operational urgency or autonomous recommendation authority.',
    },
    source_sha256: explanations.sha256,
    briefing_sha256: briefing.sha256,
    source_status: 'CURRENT_LOCAL_SOURCE' as const,
    cards: ranked,
    jobs: explanations.jobs,
    counts: {
      available: ranked.length,
      evidence: ranked.filter((c) => c.level === 'evidence').length,
      review: ranked.filter((c) => c.level === 'review').length,
      bands: Object.fromEntries(
        actionReviewBands.map((band) => [
          band,
          ranked.filter((c) => c.review_band === band).length,
        ]),
      ) as Record<(typeof actionReviewBands)[number], number>,
    },
    coverage: explanations.coverage,
    limits:
      'Available exact selected-job records only. Missing history, physical completion, availability, consent, contract and financial authority remain UNKNOWN or UNVERIFIED. Absence never means resolved.',
    model: 'NONE' as const,
    authority: {
      save: false,
      assign: false,
      dispatch: false,
      schedule: false,
      issue: false,
      financial: false,
      communicate: false,
      model_provider: false,
      hosted: false,
    },
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  if (
    (await inspectPriorityExplanations(explanations)).status !==
      'CURRENT_LOCAL_SOURCE' ||
    (await inspectBusinessBriefing(briefing)).status !== 'CURRENT_LOCAL_SOURCE'
  )
    throw denied();
  check();
  const result = freezePrototype({ ...body, sha256 });
  records.set(result, { check, explanations, briefing, uncertain: false });
  return result;
}
export type DailyActionCenterReview = Awaited<
  ReturnType<typeof readDailyActionCenter>
>;
function current(review: DailyActionCenterReview) {
  const record = records.get(review);
  if (!record || record.uncertain) throw denied();
  try {
    record.check();
  } catch {
    record.uncertain = true;
    throw denied();
  }
  return record;
}
export function filterDailyActionCenter(
  review: DailyActionCenterReview,
  value: DailyActionCenterFilter,
) {
  const record = current(review),
    p = own(value, ['area', 'level', 'job_id', 'query', 'band']);
  if (
    typeof p.band !== 'string' ||
    !['all', ...actionReviewBands].includes(p.band)
  )
    throw denied();
  const child = filterPriorityExplanations(record.explanations, {
      area: p.area,
      level: p.level,
      job_id: p.job_id,
      query: p.query,
    } as PriorityExplanationsFilter),
    keys = new Set(child.explanations.map((c) => c.key));
  const cards = review.cards.filter(
    (c) => keys.has(c.key) && (p.band === 'all' || c.review_band === p.band),
  );
  current(review);
  return freezePrototype({
    cards,
    matching: cards.length,
    available: review.cards.length,
    coverage: review.coverage,
  });
}
export async function openDailyActionSource(
  review: DailyActionCenterReview,
  key: string,
) {
  const record = current(review);
  if (typeof key !== 'string' || key.length > 700) throw denied();
  const rows = review.cards.filter((c) => c.key === key);
  if (rows.length !== 1) throw denied();
  try {
    const detail = await openPriorityExplanation(record.explanations, key);
    current(review);
    return freezePrototype({
      card: rows[0],
      target: { ...detail.target },
      source: detail.source,
      detail: detail.detail,
      authority: 'EXACT_LOCAL_NAVIGATION_ONLY' as const,
    });
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
export function openDailyActionJob(
  review: DailyActionCenterReview,
  jobId: string,
) {
  const record = current(review),
    result = openPriorityExplanationJob(record.explanations, jobId);
  current(review);
  return result;
}
export async function inspectDailyActionCenter(
  review: DailyActionCenterReview,
) {
  try {
    const record = current(review),
      { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    current(review);
    if (
      (await inspectPriorityExplanations(record.explanations)).status !==
        'CURRENT_LOCAL_SOURCE' ||
      (await inspectBusinessBriefing(record.briefing)).status !==
        'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    current(review);
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch {
    const record = records.get(review);
    if (record) record.uncertain = true;
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
