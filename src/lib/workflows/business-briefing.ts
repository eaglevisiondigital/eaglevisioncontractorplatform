import { capacityDay } from '../../domain/field/crew-capacity';
import { documentHash } from '../../domain/release/preview';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readDailyOperations,
  inspectDailyOperations,
  filterDailyOperations,
  openDailyOperationsSource,
  type DailyOperationsInput,
  type DailyOperationsFilter,
  type DailyOperationsReview,
  type DailyPriorityCard,
} from './daily-operations';

export type BusinessBriefingInput = DailyOperationsInput;
export interface BusinessBriefingFilter extends DailyOperationsFilter {
  job_id: string | null;
}
const denied = () =>
  Error('Exact current confirmed business briefing sources required');
function own(value: unknown, keys: readonly string[]) {
  const p = prototypeFields(value, keys);
  if (Reflect.ownKeys(p).length !== keys.length) throw denied();
  return p;
}
function pin(value: BusinessBriefingInput) {
  const p = own(value, ['review_on', 'timezone', 'input_revision']);
  if (
    typeof p.review_on !== 'string' ||
    typeof p.timezone !== 'string' ||
    p.timezone.length > 100 ||
    !Number.isSafeInteger(p.input_revision) ||
    Number(p.input_revision) < 1
  )
    throw denied();
  capacityDay(p.review_on, p.timezone);
  return p as unknown as BusinessBriefingInput;
}
function pinFilter(value: BusinessBriefingFilter) {
  const p = own(value, ['area', 'level', 'job_id', 'query']);
  if (
    typeof p.area !== 'string' ||
    !['all', 'finance', 'field', 'scope', 'documentation'].includes(p.area) ||
    typeof p.level !== 'string' ||
    !['all', 'evidence', 'review'].includes(p.level) ||
    (p.job_id !== null &&
      (typeof p.job_id !== 'string' || !p.job_id || p.job_id.length > 200)) ||
    typeof p.query !== 'string' ||
    p.query.length > 200
  )
    throw denied();
  return p as unknown as BusinessBriefingFilter;
}
export interface BusinessBriefingCard extends DailyPriorityCard {
  key: string;
  job_id: string;
  customer_id: string;
  property_id: string;
  job_label: string;
  customer_label: string;
  property_label: string;
}
const records = new WeakMap<
  object,
  { check: () => void; children: DailyOperationsReview[] }
>();
const all: DailyOperationsFilter = { area: 'all', level: 'all', query: '' };
/** Actual exact selected-job Daily Operations composition, not an AI or action engine. */
export async function readBusinessBriefing(
  sources: OperatingSources,
  originalInput: BusinessBriefingInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const captured = captureOperatingSources(sources, gate),
    selected = pin(originalInput),
    identity = JSON.stringify(selected),
    children: DailyOperationsReview[] = [];
  const check = () => {
    captured.check();
    if (JSON.stringify(pin(originalInput)) !== identity) throw denied();
    // Public synchronous existing-child checks include current Copilot attempt metadata.
    for (const child of children) filterDailyOperations(child, all);
  };
  check();
  for (const entry of captured.entries) {
    children.push(await readDailyOperations(entry, { ...selected }, gate));
    check();
  }
  const cards: BusinessBriefingCard[] = children.flatMap((child) =>
    child.cards.map((card) => ({
      ...card,
      source: { ...card.source, related_ids: [...card.source.related_ids] },
      key: `${child.target.job_id}:${card.id}`,
      job_id: child.target.job_id!,
      customer_id: child.target.customer_id,
      property_id: child.target.location_id,
      job_label: child.context.job_title,
      customer_label: child.context.customer,
      property_label: child.context.property,
    })),
  );
  if (new Set(cards.map((c) => c.key)).size !== cards.length)
    throw Error('Duplicate exact briefing card source');
  const areas = ['finance', 'field', 'documentation', 'scope'];
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  cards.sort(
    (a, b) =>
      Number(a.level === 'review') - Number(b.level === 'review') ||
      compare(a.recorded_day ?? '9999', b.recorded_day ?? '9999') ||
      areas.indexOf(a.area) - areas.indexOf(b.area) ||
      compare(a.job_id, b.job_id) ||
      compare(a.id, b.id),
  );
  const body = {
    mode: 'LOCAL_SYNTHETIC_BUSINESS_BRIEFING' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    organization_id: captured.organization_id,
    actor_id: captured.actor_id,
    review_on: selected.review_on,
    timezone: selected.timezone,
    input_revision: selected.input_revision,
    date_meaning: children[0].date_meaning,
    order_meaning:
      'Deterministic review priority only: evidence gaps first, recorded dates, Finance/Field/documentation/scope, then exact job and source identity. No severity, urgency, deadline or execution authority is inferred.',
    coverage: {
      selected_jobs: children.length,
      available_cards: cards.length,
      history:
        'AVAILABLE_EXACT_SELECTED_JOB_SOURCES_ONLY_NOT_WHOLE_COMPANY' as const,
      physical_completion: 'UNVERIFIED' as const,
      availability: 'UNKNOWN' as const,
    },
    jobs: children.map((child) => ({
      target: { ...child.target },
      context: { ...child.context },
      source_sha256: child.source_sha256,
      review_sha256: child.sha256,
      finance: { ...child.finance },
      field: { ...child.field },
      existing_intelligence: { ...child.existing_intelligence },
    })),
    cards,
    model: 'NONE' as const,
    addons: {
      mode: 'EXISTING_CONTRACT_METADATA_ONLY' as const,
      voice: 'NOT_EXECUTED' as const,
      trade: 'NOT_EXECUTED' as const,
      meaning:
        'Existing Copilot/Voice/trade preparation remains in its separately confirmed source-bound workflow. This briefing reads exact attempt status only; it consumes no claim and starts no generation or action.',
    },
    authority: {
      save: false,
      assign: false,
      schedule: false,
      dispatch: false,
      issue: false,
      financial: false,
      communicate: false,
      microphone: false,
      model_provider: false,
      hosted: false,
    },
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  for (const child of children) {
    if ((await inspectDailyOperations(child)).status !== 'CURRENT_LOCAL_SOURCE')
      throw denied();
    check();
  }
  check();
  const result = freezePrototype({ ...body, sha256 });
  records.set(result, { check, children });
  return result;
}
export type BusinessBriefingReview = Awaited<
  ReturnType<typeof readBusinessBriefing>
>;

export function filterBusinessBriefing(
  review: BusinessBriefingReview,
  value: BusinessBriefingFilter,
) {
  const record = records.get(review);
  if (!record) throw denied();
  record.check();
  const selected = pinFilter(value),
    query = selected.query.trim().toLowerCase();
  if (
    selected.job_id !== null &&
    !review.jobs.some((j) => j.target.job_id === selected.job_id)
  )
    throw denied();
  const cards = review.cards.filter(
    (c) =>
      (selected.area === 'all' || c.area === selected.area) &&
      (selected.level === 'all' || c.level === selected.level) &&
      (selected.job_id === null || c.job_id === selected.job_id) &&
      (!query ||
        `${c.observation} ${c.suggested_review} ${c.source.id} ${c.job_label} ${c.customer_label} ${c.property_label}`
          .toLowerCase()
          .includes(query)),
  );
  record.check();
  return freezePrototype({
    cards,
    matching: cards.length,
    available: review.cards.length,
    coverage: review.coverage,
  });
}
export async function inspectBusinessBriefing(review: BusinessBriefingReview) {
  const record = records.get(review);
  if (!record)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.check();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    record.check();
    for (const child of record.children) {
      if (
        (await inspectDailyOperations(child)).status !== 'CURRENT_LOCAL_SOURCE'
      )
        throw denied();
      record.check();
    }
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch {
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
export function openBusinessBriefingJob(
  review: BusinessBriefingReview,
  jobId: string,
) {
  const record = records.get(review);
  if (!record || typeof jobId !== 'string') throw denied();
  record.check();
  const jobs = review.jobs.filter((j) => j.target.job_id === jobId);
  if (jobs.length !== 1) throw denied();
  record.check();
  return freezePrototype({
    authority: 'NAVIGATION_ONLY' as const,
    target: { ...jobs[0].target },
  });
}
export async function openBusinessBriefingSource(
  review: BusinessBriefingReview,
  key: string,
) {
  const record = records.get(review);
  if (!record || typeof key !== 'string' || key.length > 700) throw denied();
  record.check();
  const cards = review.cards.filter((c) => c.key === key);
  if (cards.length !== 1) throw denied();
  const card = cards[0],
    child = record.children.find((c) => c.target.job_id === card.job_id);
  if (!child) throw denied();
  const detail = await openDailyOperationsSource(child, card.id);
  record.check();
  return freezePrototype({
    key,
    target: { ...detail.target },
    source: { ...card.source },
    observation: card.observation,
    suggested_review: card.suggested_review,
    detail: detail.detail,
    authority: 'NAVIGATION_ONLY' as const,
  });
}
