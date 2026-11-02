import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { completionReviewGuard } from '../job-cost-completion';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  verifiedSuggestionsEnabled,
  readVerifiedOperatingSuggestions,
  filterVerifiedOperatingSuggestions,
  openVerifiedSuggestionSource,
  openVerifiedSuggestionJob,
  inspectVerifiedOperatingSuggestions,
  assertVerifiedSuggestionsCurrent,
  type VerifiedSuggestionsInput,
  type VerifiedOperatingSuggestionsReview,
  type VerifiedSuggestionDetail,
} from './verified-operating-suggestions';
import { actionReviewBands } from './daily-action-center';

/** Presentation destinations in the existing selected-job host, never URLs,
 * commands, permission scopes or operational actions. */
export type OperatingJobSection =
  'sales' | 'field' | 'finance' | 'completion' | 'maintenance' | 'daily';
export interface OperatingNavigationFilter {
  query: string;
  section: 'all' | OperatingJobSection;
  job_id: string | null;
  band: 'all' | (typeof actionReviewBands)[number];
}
export const operatingNavigationEnabled = verifiedSuggestionsEnabled;
const denied = () =>
  Error(
    'Exact inspected current operating source required; UNKNOWN permits exact read-only reconciliation only',
  );
const unknown = () =>
  freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
function admit(gate: JourneyAdmission) {
  completionReviewGuard(gate)();
  if (!operatingNavigationEnabled(true)) throw denied();
}
type Card = VerifiedOperatingSuggestionsReview['cards'][number];
/** Only maps the unchanged canonical source-identity checks. Overall evidence may
 * stay UNKNOWN while its exact existing read-only review is a known destination. */
function destination(card: Card) {
  const rule = {
    finance: {
      area: 'finance',
      check: 'EXACT_FINANCIAL_SOURCE',
      section: 'finance',
      label: 'Review saved financial requirements',
    },
    issued: {
      area: 'scope',
      check: 'EXACT_ISSUED_VERSION',
      section: 'sales',
      label: 'Review original issued scope',
    },
    visit: {
      area: 'field',
      check: 'EXACT_VISIT_PLAN',
      section: 'field',
      label: 'Review recorded visit and crew context',
    },
    time: {
      area: 'field',
      check: 'EXACT_TIME_SEGMENT',
      section: 'field',
      label: 'Review recorded time context',
    },
    report: {
      area: 'documentation',
      check: 'EXACT_REPORT_VERSION',
      section: 'completion',
      label: 'Review published documentation',
    },
  } as const;
  const selected = rule[card.source.kind],
    checks =
      selected &&
      card.verification.required_checks.filter(
        (c) => c.code === selected.check,
      );
  if (
    !selected ||
    selected.area !== card.area ||
    checks.length !== 1 ||
    checks[0].status !== 'MATCHED' ||
    !card.job_id ||
    card.job_id !== card.source.target.job_id
  )
    return {
      status: 'UNKNOWN' as const,
      section: null,
      label: 'Exact task destination UNKNOWN',
      meaning:
        'Missing or ambiguous source identity cannot select an existing job review.',
    };
  return {
    status: 'EXACT_LOCAL_REVIEW_TARGET' as const,
    section: selected.section,
    label: selected.label,
    meaning:
      'Open an existing local source review only. Recommendations, evidence gaps and all action authority remain unchanged.',
  };
}
const reviews = new WeakMap<
  object,
  {
    original: VerifiedOperatingSuggestionsReview;
    check: () => void;
    uncertain: boolean;
  }
>();
const details = new WeakMap<
  object,
  { review: OperatingNavigationReview; original: VerifiedSuggestionDetail }
>();

/** One finite existing C12 source-set read. This adapter adds navigation metadata,
 * not a new ranking/suggestion engine, preparation layer, hold or business store. */
export async function readOperatingNavigation(
  sources: OperatingSources,
  input: VerifiedSuggestionsInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const capture = captureOperatingSources(sources, gate);
  const original = await readVerifiedOperatingSuggestions(sources, input, gate);
  const check = () => {
    admit(gate);
    capture.check();
    assertVerifiedSuggestionsCurrent(original);
  };
  check();
  const result = freezePrototype({
    mode: 'LOCAL_SOURCE_BOUND_OPERATING_NAVIGATION' as const,
    source_sha256: original.sha256,
    organization_id: original.organization_id,
    review_on: original.review_on,
    timezone: original.timezone,
    selected_criteria: original.selected_criteria,
    jobs: original.jobs,
    tasks: original.cards.map((card) => ({
      ...card,
      navigation: destination(card),
    })),
    coverage: original.coverage,
    limits: original.limits,
    authority: original.authority,
    read_custody: original.read_custody,
  });
  check();
  reviews.set(result, { original, check, uncertain: false });
  return result;
}
export type OperatingNavigationReview = Awaited<
  ReturnType<typeof readOperatingNavigation>
>;
export function assertOperatingNavigationCurrent(
  value: OperatingNavigationReview | OperatingNavigationDetail,
) {
  const detail = details.get(value),
    review = detail?.review ?? value;
  const record = reviews.get(review);
  if (!record || record.uncertain) throw denied();
  try {
    record.check();
    if (detail) assertVerifiedSuggestionsCurrent(detail.original);
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
export function filterOperatingNavigation(
  review: OperatingNavigationReview,
  filter: OperatingNavigationFilter,
) {
  assertOperatingNavigationCurrent(review);
  const p = prototypeFields(filter, ['query', 'section', 'job_id', 'band']);
  if (
    Reflect.ownKeys(p).length !== 4 ||
    typeof p.query !== 'string' ||
    p.query.length > 200 ||
    typeof p.section !== 'string' ||
    ![
      'all',
      'sales',
      'field',
      'finance',
      'completion',
      'maintenance',
      'daily',
    ].includes(p.section) ||
    typeof p.band !== 'string' ||
    !['all', ...actionReviewBands].includes(p.band)
  )
    throw denied();
  const original = reviews.get(review)!.original;
  const filtered = filterVerifiedOperatingSuggestions(original, {
    area: 'all',
    level: 'all',
    query: '',
    job_id: p.job_id as string | null,
    band: p.band as OperatingNavigationFilter['band'],
    source_kind: 'all',
    verification: 'all',
  });
  const keys = new Set(filtered.cards.map((c) => c.key)),
    query = p.query.trim().toLowerCase();
  const tasks = review.tasks.filter(
    (t) =>
      keys.has(t.key) &&
      (p.section === 'all' || p.section === t.navigation.section) &&
      (!query ||
        [
          t.context.job,
          t.context.customer,
          t.context.property,
          t.job_id,
          t.source.id,
          t.source.target.version_id,
          ...t.source.related_ids,
          t.source.kind,
          t.recorded_fact,
          t.suggested_human_review,
          t.navigation.label,
          ...t.verification.facts.flatMap((f) => [
            f.label,
            f.value ?? 'UNKNOWN',
          ]),
          ...t.verification.gaps.map((g) => g.detail),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );
  assertOperatingNavigationCurrent(review);
  return freezePrototype({
    tasks,
    matching: tasks.length,
    available: review.tasks.length,
    exact_targets: tasks.filter(
      (t) => t.navigation.status === 'EXACT_LOCAL_REVIEW_TARGET',
    ).length,
    unknown_targets: tasks.filter((t) => t.navigation.status === 'UNKNOWN')
      .length,
  });
}
/** Explicit source inspection is mandatory before task navigation. */
export async function inspectOperatingNavigationSource(
  review: OperatingNavigationReview,
  key: string,
) {
  assertOperatingNavigationCurrent(review);
  if (typeof key !== 'string' || key.length > 700) throw denied();
  const rows = review.tasks.filter((t) => t.key === key);
  if (rows.length !== 1) throw denied();
  const original = await openVerifiedSuggestionSource(
    reviews.get(review)!.original,
    key,
  );
  assertOperatingNavigationCurrent(review);
  const task = rows[0];
  if (
    original.card.key !== task.key ||
    JSON.stringify(original.target) !== JSON.stringify(task.source.target) ||
    original.source.kind !== task.source.kind ||
    original.source.id !== task.source.id ||
    original.source.version !== task.source.version ||
    original.source.revision !== task.source.revision
  )
    throw denied();
  const result = freezePrototype({
    task,
    target: { ...original.target },
    source: original.source,
    original_detail: original.detail,
    source_sha256: original.sha256,
    authority: 'LOCAL_PRESENTATION_NAVIGATION_ONLY' as const,
  });
  assertOperatingNavigationCurrent(review);
  details.set(result, { review, original });
  return result;
}
export type OperatingNavigationDetail = Awaited<
  ReturnType<typeof inspectOperatingNavigationSource>
>;

/** This is the only callback boundary. No async gap, URL, command, AI request or
 * writer follows the final current-source/member/gate check. Old one-argument
 * callbacks may ignore the optional presentation section. */
export function navigateOperatingSuggestion(
  detail: OperatingNavigationDetail,
  onSelectJob: (jobId: string, section?: OperatingJobSection) => void,
) {
  const retained = details.get(detail);
  if (!retained || typeof onSelectJob !== 'function') return unknown();
  try {
    assertOperatingNavigationCurrent(detail);
    if (
      detail.task.navigation.status !== 'EXACT_LOCAL_REVIEW_TARGET' ||
      !detail.task.navigation.section
    )
      return unknown();
    const original = openVerifiedSuggestionJob(retained.original);
    if (JSON.stringify(original.target) !== JSON.stringify(detail.target))
      throw denied();
    const jobId = detail.target.job_id!,
      section = detail.task.navigation.section;
    assertOperatingNavigationCurrent(detail);
    onSelectJob(jobId, section);
    return freezePrototype({
      status: 'LOCAL_REVIEW_NAVIGATION_REQUESTED' as const,
      job_id: jobId,
      section,
      authority: 'PRESENTATION_ONLY' as const,
    });
  } catch {
    const record = reviews.get(retained.review);
    if (record) record.uncertain = true;
    return unknown();
  }
}
export async function inspectOperatingNavigation(
  review: OperatingNavigationReview,
) {
  const record = reviews.get(review);
  if (!record) return unknown();
  try {
    assertOperatingNavigationCurrent(review);
    const result = await inspectVerifiedOperatingSuggestions(record.original);
    assertOperatingNavigationCurrent(review);
    if (result.status !== 'CURRENT_READ_ONLY_SUGGESTIONS') throw denied();
    return freezePrototype({
      status: 'CURRENT_READ_ONLY_NAVIGATION' as const,
      replacement: null,
    });
  } catch {
    record.uncertain = true;
    return unknown();
  }
}
