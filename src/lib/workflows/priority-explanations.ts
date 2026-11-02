import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readBusinessBriefing,
  filterBusinessBriefing,
  inspectBusinessBriefing,
  openBusinessBriefingJob,
  openBusinessBriefingSource,
  type BusinessBriefingInput,
  type BusinessBriefingFilter,
  type BusinessBriefingReview,
} from './business-briefing';

export type PriorityExplanationsInput = BusinessBriefingInput;
export type PriorityExplanationsFilter = BusinessBriefingFilter;
const all: BusinessBriefingFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
};
const denied = () =>
  Error('Exact current confirmed priority explanation required');
function pin(value: PriorityExplanationsInput) {
  const p = prototypeFields(value, ['review_on', 'timezone', 'input_revision']);
  if (
    Reflect.ownKeys(p).length !== 3 ||
    typeof p.review_on !== 'string' ||
    typeof p.timezone !== 'string' ||
    typeof p.input_revision !== 'number'
  )
    throw denied();
  return {
    review_on: p.review_on,
    timezone: p.timezone,
    input_revision: p.input_revision,
  };
}
interface MissingEvidence {
  code: string;
  status: 'UNKNOWN' | 'UNVERIFIED' | 'NO_GO';
  detail: string;
}
const records = new WeakMap<
  object,
  { check: () => void; briefing: BusinessBriefingReview }
>();

/** Explains existing deterministic review order; never generates a new priority or AI action. */
export async function readPriorityExplanations(
  sources: OperatingSources,
  originalInput: PriorityExplanationsInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    selected = pin(originalInput),
    identity = JSON.stringify(selected);
  let briefing: BusinessBriefingReview | null = null;
  const check = () => {
    capture.check();
    if (JSON.stringify(pin(originalInput)) !== identity) throw denied();
    if (briefing) filterBusinessBriefing(briefing, all);
  };
  check();
  briefing = await readBusinessBriefing(sources, originalInput, gate);
  check();
  const explanations = briefing.cards.map((card, index) => {
    const job = briefing!.jobs.find((j) => j.target.job_id === card.job_id);
    if (!job) throw denied();
    const missing: MissingEvidence[] = [];
    if (card.area === 'finance') {
      missing.push({
        code: 'COST_COVERAGE',
        status: job.finance.coverage === 'UNKNOWN' ? 'UNKNOWN' : 'UNVERIFIED',
        detail: `Existing cost coverage: ${job.finance.coverage}. This does not prove complete costs, final profit, refund or merchant settlement.`,
      });
      if (job.finance.invoice_readiness === 'NO_GO')
        missing.push({
          code: 'INVOICE_AUTHORITY',
          status: 'NO_GO',
          detail:
            'Existing invoice requirements remain NO_GO. This recommendation creates no invoice, receivable, ledger or payment authority.',
        });
    }
    if (card.area === 'field') {
      missing.push({
        code: 'ACTUAL_AVAILABILITY',
        status: job.field.actual_availability,
        detail:
          'Recorded visit or time evidence does not establish actual staff availability, working hours or dispatch.',
      });
      missing.push({
        code: 'CAPACITY',
        status: job.field.capacity,
        detail:
          'This source has no confirmed operational capacity or assignment execution.',
      });
      if (card.source.kind === 'visit')
        missing.push({
          code: 'VISIT_TIMING',
          status: 'UNKNOWN',
          detail:
            'The existing source records a visit date only, not a timed appointment or conflict-free slot.',
        });
    }
    if (card.source.kind === 'report')
      missing.push({
        code: 'PHYSICAL_COMPLETION',
        status: job.field.physical_completion,
        detail:
          'An exact published report documents observations. It does not verify physical repair, completion, warranty or customer acceptance.',
      });
    if (card.source.kind === 'issued')
      missing.push({
        code: 'CONTRACT_AUTHORITY',
        status: 'UNVERIFIED',
        detail:
          'An immutable issued scope and local test preference do not establish genuine contract, signature, work or payment authority.',
      });
    missing.push({
      code: 'HISTORY_COVERAGE',
      status: 'UNKNOWN',
      detail:
        'Only the available exact selected-job sources are reviewed. Absence of an item does not prove resolution or complete historical coverage.',
    });
    return {
      key: card.key,
      rank: index + 1,
      area: card.area,
      level: card.level,
      job_id: card.job_id,
      context: {
        job: card.job_label,
        customer: card.customer_label,
        property: card.property_label,
      },
      recorded_fact: card.observation,
      suggested_human_review: card.suggested_review,
      why_this_order: [
        card.level === 'evidence'
          ? 'The existing briefing classifies this item as an evidence gap, ordered before recorded-evidence review.'
          : 'The existing briefing classifies this item as a review of recorded evidence, after evidence-gap items.',
        card.recorded_day === null
          ? 'No recorded source day is present; the existing ordering keeps undated context after dated items within its review class.'
          : `Recorded source day ${card.recorded_day} participates in the existing review ordering. It is not a due date, urgency or prediction.`,
        `The existing area tie-break is Finance, Field, documentation, then scope; exact job/source identity breaks remaining ties.`,
      ],
      source: {
        ...card.source,
        related_ids: [...card.source.related_ids],
        target: { ...job.target },
        job_revision: job.context.job_revision,
        issued_version: { ...job.context.issued_version },
        source_sha256: job.source_sha256,
        child_review_sha256: job.review_sha256,
      },
      missing_evidence: missing,
      authority: 'HUMAN_REVIEW_SUGGESTION_ONLY' as const,
    };
  });
  const body = {
    mode: 'LOCAL_SYNTHETIC_PRIORITY_EXPLANATIONS' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    organization_id: capture.organization_id,
    actor_id: capture.actor_id,
    review_on: briefing.review_on,
    timezone: briefing.timezone,
    input_revision: briefing.input_revision,
    briefing_sha256: briefing.sha256,
    jobs: briefing.jobs,
    explanations,
    counts: {
      available: explanations.length,
      evidence: explanations.filter((e) => e.level === 'evidence').length,
      review: explanations.filter((e) => e.level === 'review').length,
    },
    coverage: briefing.coverage,
    order_meaning: briefing.order_meaning,
    date_meaning: briefing.date_meaning,
    existing_intelligence: briefing.addons,
    model: 'NONE' as const,
    authority: {
      save: false,
      assign: false,
      schedule: false,
      dispatch: false,
      issue: false,
      financial: false,
      communicate: false,
      model_provider: false,
      microphone: false,
      hosted: false,
    },
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  if (
    (await inspectBusinessBriefing(briefing)).status !== 'CURRENT_LOCAL_SOURCE'
  )
    throw denied();
  check();
  const result = freezePrototype({ ...body, sha256 });
  records.set(result, { check, briefing });
  return result;
}
export type PriorityExplanationsReview = Awaited<
  ReturnType<typeof readPriorityExplanations>
>;
export function filterPriorityExplanations(
  review: PriorityExplanationsReview,
  value: PriorityExplanationsFilter,
) {
  const record = records.get(review);
  if (!record) throw denied();
  record.check();
  const filtered = filterBusinessBriefing(record.briefing, value),
    keys = new Set(filtered.cards.map((c) => c.key)),
    explanations = review.explanations.filter((e) => keys.has(e.key));
  record.check();
  return freezePrototype({
    explanations,
    matching: filtered.matching,
    available: filtered.available,
    coverage: review.coverage,
  });
}
export function openPriorityExplanationJob(
  review: PriorityExplanationsReview,
  jobId: string,
) {
  const record = records.get(review);
  if (!record) throw denied();
  record.check();
  const result = openBusinessBriefingJob(record.briefing, jobId);
  record.check();
  return result;
}
export async function openPriorityExplanation(
  review: PriorityExplanationsReview,
  key: string,
) {
  const record = records.get(review);
  if (!record || typeof key !== 'string' || key.length > 700) throw denied();
  record.check();
  const rows = review.explanations.filter((e) => e.key === key);
  if (rows.length !== 1) throw denied();
  const detail = await openBusinessBriefingSource(record.briefing, key);
  record.check();
  return freezePrototype({
    explanation: rows[0],
    target: { ...detail.target },
    source: detail.source,
    detail: detail.detail,
    authority: 'NAVIGATION_ONLY' as const,
  });
}
export async function inspectPriorityExplanations(
  review: PriorityExplanationsReview,
) {
  const record = records.get(review);
  if (!record)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.check();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    record.check();
    if (
      (await inspectBusinessBriefing(record.briefing)).status !==
      'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    record.check();
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch {
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
