import { capacityDay } from '../../domain/field/crew-capacity';
import { detached } from '../../domain/jobs/margin-analysis';
import { documentHash } from '../../domain/release/preview';
import { completionReviewGuard } from '../job-cost-completion';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { journeyEnabled, type JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readDailyActionCenter,
  filterDailyActionCenter,
  openDailyActionSource,
  openDailyActionJob,
  inspectDailyActionCenter,
  type DailyActionCenterInput,
  type DailyActionCenterFilter,
  type DailyActionCenterReview,
} from './daily-action-center';

export type VerifiedSuggestionsInput = DailyActionCenterInput;
export const suggestionSourceKinds = [
  'finance',
  'visit',
  'time',
  'issued',
  'report',
] as const;
export const suggestionVerificationStates = [
  'MATCHED_RECORDED_STATE',
  'UNKNOWN',
] as const;
export interface VerifiedSuggestionsFilter extends DailyActionCenterFilter {
  source_kind: 'all' | (typeof suggestionSourceKinds)[number];
  verification: 'all' | (typeof suggestionVerificationStates)[number];
}
const all = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
  band: 'all',
} as const;
const denied = () =>
  Error(
    'Exact retained current suggestion review required; UNKNOWN permits exact read-only inspection only',
  );
export function verifiedSuggestionsEnabled(enabled = false) {
  return (
    enabled === true &&
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: 'true',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  );
}
function admit(gate: JourneyAdmission) {
  completionReviewGuard(gate)();
  if (!verifiedSuggestionsEnabled(true)) throw denied();
}
function own(value: unknown, keys: readonly string[]) {
  const p = prototypeFields(value, keys);
  if (Object.keys(p).length !== keys.length) throw denied();
  return p;
}
function pin(input: VerifiedSuggestionsInput) {
  const p = own(input, ['review_on', 'timezone', 'input_revision', 'ordering']);
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
  return p as unknown as VerifiedSuggestionsInput;
}
type Card = DailyActionCenterReview['cards'][number];
interface StateFact {
  code: string;
  label: string;
  status: 'RECORDED' | 'UNKNOWN';
  value: string | null;
  source_ids: string[];
}
interface StateCheck {
  code: string;
  status: 'MATCHED' | 'UNKNOWN' | 'UNVERIFIED' | 'NO_GO';
  required_for_source: boolean;
  detail: string;
  source_ids: string[];
}
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function stateVerification(
  sources: OperatingSources,
  daily: DailyActionCenterReview,
  card: Card,
) {
  const entries = sources.entries.filter(
      (e) => e.target.job_id === card.job_id,
    ),
    context = daily.jobs.filter((j) => j.target.job_id === card.job_id);
  if (
    entries.length !== 1 ||
    context.length !== 1 ||
    JSON.stringify(entries[0].target) !== JSON.stringify(card.source.target)
  )
    throw denied();
  const entry = entries[0],
    target = entry.target,
    raw = sources.estimates.readSyntheticPrototypeSources(target),
    job = raw.job!,
    state = detached(sources.property.read(target.organization_id));
  if (
    !job ||
    job.id !== target.job_id ||
    job.organization_id !== target.organization_id ||
    job.lock_revision !== card.source.job_revision ||
    job.baseline.issued_version_id !== target.version_id ||
    card.source.issued_version.version_id !== target.version_id ||
    card.source.issued_version.saved_revision !==
      raw.bundle.version.lock_revision ||
    card.source.issued_version.version_number !==
      raw.bundle.version.version_number
  )
    throw denied();
  const facts: StateFact[] = [],
    checks: StateCheck[] = [];
  const fact = (code: string, label: string, value: unknown, ids: string[]) => {
    const safe =
      typeof value === 'string'
        ? value
        : typeof value === 'boolean'
          ? value
            ? 'true'
            : 'false'
          : typeof value === 'number' && Number.isSafeInteger(value)
            ? String(value)
            : null;
    facts.push({
      code,
      label,
      status: safe === null ? 'UNKNOWN' : 'RECORDED',
      value: safe,
      source_ids: ids,
    });
  };
  const check = (
    code: string,
    matches: boolean,
    detail: string,
    ids: string[],
    required = true,
  ) =>
    checks.push({
      code,
      status: matches ? 'MATCHED' : 'UNKNOWN',
      required_for_source: required,
      detail,
      source_ids: ids,
    });
  const gap = (
    code: string,
    detail: string,
    status: StateCheck['status'] = 'UNKNOWN',
  ) =>
    checks.push({
      code,
      status,
      required_for_source: false,
      detail,
      source_ids: [card.source.id],
    });
  const exactRelated = (ids: readonly string[]) =>
    JSON.stringify(card.source.related_ids) === JSON.stringify(ids);
  fact('JOB_REVISION', 'Saved job revision', job.lock_revision, [job.id]);
  fact('JOB_COMPLETION_STATE', 'Verified physical job completion', null, [
    job.id,
  ]);
  gap(
    'JOB_COMPLETION_STATE',
    'The existing Job type has no canonical physical-completion status. Costs, visits and checkmarks cannot supply it.',
    'UNVERIFIED',
  );
  switch (card.source.kind) {
    case 'finance': {
      const finance = context[0].finance,
        coverage = ['UNKNOWN', 'PARTIAL', 'DECLARED_COSTS_COMPLETE'].includes(
          finance.coverage,
        )
          ? finance.coverage
          : null;
      check(
        'EXACT_FINANCIAL_SOURCE',
        card.source.id === job.id &&
          card.source.revision === job.lock_revision &&
          card.source.version === null &&
          card.source.related_ids.every(
            (id) =>
              id === target.version_id || job.expenses.some((e) => e.id === id),
          ),
        'Exact existing Finance workflow job/revision/issued/expense references must match.',
        [job.id, target.version_id],
      );
      fact('COST_COVERAGE', 'Existing canonical cost coverage', coverage, [
        job.id,
      ]);
      fact(
        'INVOICE_READINESS',
        'Existing invoice-readiness result',
        finance.invoice_readiness === 'NO_GO' ? 'NO_GO' : null,
        [target.version_id],
      );
      fact(
        'INVOICE_REFERENCE',
        'Existing selected invoice-reference status',
        ['UNKNOWN', 'EXISTING_SYNTHETIC_REFERENCE'].includes(
          finance.invoice_status,
        )
          ? finance.invoice_status
          : null,
        [target.version_id],
      );
      check(
        'COST_WORKFLOW_STATE',
        coverage !== null && coverage !== 'UNKNOWN',
        'Unknown or partial cost evidence never proves complete costs or final profit. Only the existing canonical coverage classification is read.',
        [job.id],
      );
      gap(
        'INVOICE_AUTHORITY',
        'The existing invoice requirements remain NO_GO; this suggestion cannot issue, change or pay an invoice.',
        'NO_GO',
      );
      gap(
        'PROVIDER_OUTCOME',
        'Payment-event/ledger verification belongs to the separately reviewed financial workflow. This component performs no ledger verification and infers no capture, refund, paid or settled state.',
      );
      break;
    }
    case 'visit': {
      const visits = state.visits.filter((v) => v.id === card.source.id),
        visit = visits.length === 1 ? visits[0] : null,
        plans = visit ? state.plans.filter((p) => p.id === visit.plan_id) : [],
        plan = plans.length === 1 ? plans[0] : null;
      if (
        (visit && visit.organization_id !== target.organization_id) ||
        (plan &&
          (plan.organization_id !== target.organization_id ||
            plan.customer_id !== target.customer_id ||
            plan.location_id !== target.location_id ||
            plan.job_id !== target.job_id))
      )
        throw denied();
      check(
        'EXACT_VISIT_PLAN',
        !!visit &&
          !!plan &&
          visit.revision === card.source.revision &&
          card.source.version === null &&
          visit.visited_on === card.recorded_day &&
          exactRelated([plan.id]),
        'Exact recorded visit revision, date and explicit plan/job/property relationship are required.',
        [card.source.id, ...(plan ? [plan.id] : [])],
      );
      const status =
          visit && ['draft', 'submitted', 'published'].includes(visit.status)
            ? visit.status
            : null,
        phase =
          visit && ['before', 'during', 'after'].includes(visit.phase)
            ? visit.phase
            : null;
      fact('VISIT_STATUS', 'Recorded visit workflow status', status, [
        card.source.id,
      ]);
      fact('VISIT_PHASE', 'Recorded visit phase', phase, [card.source.id]);
      fact(
        'PLAN_REVISION',
        'Recorded plan revision',
        plan?.revision,
        plan ? [plan.id] : [],
      );
      fact(
        'PLAN_CADENCE',
        'Recorded plan cadence definition',
        plan && ['once', 'weekly', 'monthly', 'custom'].includes(plan.cadence)
          ? plan.cadence
          : null,
        plan ? [plan.id] : [],
      );
      check(
        'PLAN_DEFINITION_STATE',
        !!plan &&
          Number.isSafeInteger(plan.revision) &&
          plan.revision >= 1 &&
          ['once', 'weekly', 'monthly', 'custom'].includes(plan.cadence),
        'The exact existing plan revision and recognized recurrence definition are required; no operational active status is invented.',
        plan ? [plan.id] : [],
      );
      check(
        'VISIT_WORKFLOW_STATE',
        status !== null && phase !== null,
        'Only recognized recorded visit status/phase values are matched; neither proves completed physical work.',
        [card.source.id],
      );
      gap(
        'PLAN_ACTIVATION',
        'The plan records recurrence rules and a revision, with no canonical operational activation/availability status.',
      );
      gap(
        'TIMED_AVAILABILITY',
        'Date-only visit evidence has no verified appointment window, available crew or dispatch authority. A date before the review day does not prove overdue work.',
      );
      break;
    }
    case 'report': {
      const reports = state.reports.filter(
          (r) => r.id === card.source.id && r.version === card.source.version,
        ),
        report = reports.length === 1 ? reports[0] : null,
        visits = report
          ? state.visits.filter((v) => v.id === report.visit_id)
          : [],
        visit = visits.length === 1 ? visits[0] : null,
        plans = visit ? state.plans.filter((p) => p.id === visit.plan_id) : [],
        plan = plans.length === 1 ? plans[0] : null;
      if (
        (report &&
          (report.organization_id !== target.organization_id ||
            report.customer_id !== target.customer_id ||
            report.location_id !== target.location_id)) ||
        (plan &&
          (plan.job_id !== target.job_id ||
            plan.organization_id !== target.organization_id ||
            plan.customer_id !== target.customer_id ||
            plan.location_id !== target.location_id)) ||
        (visit && visit.organization_id !== target.organization_id)
      )
        throw denied();
      check(
        'EXACT_REPORT_VERSION',
        !!report &&
          !!visit &&
          !!plan &&
          report.visited_on === card.recorded_day &&
          card.source.revision === null &&
          exactRelated([visit.id, plan.id]),
        'The exact immutable published report/version must bind its original visit, plan and current job/property source.',
        [card.source.id, ...(visit && plan ? [visit.id, plan.id] : [])],
      );
      const phase =
        report && ['before', 'during', 'after'].includes(report.phase)
          ? report.phase
          : null;
      fact(
        'SOURCE_VISIT_REVISION',
        'Recorded source visit revision',
        visit?.revision,
        visit ? [visit.id] : [],
      );
      fact(
        'SOURCE_PLAN_REVISION',
        'Recorded source plan revision',
        plan?.revision,
        plan ? [plan.id] : [],
      );
      fact(
        'SOURCE_VISIT_STATUS',
        'Recorded source visit workflow status',
        visit && ['draft', 'submitted', 'published'].includes(visit.status)
          ? visit.status
          : null,
        visit ? [visit.id] : [],
      );
      check(
        'REPORT_PLAN_DEFINITION',
        !!plan &&
          Number.isSafeInteger(plan.revision) &&
          plan.revision >= 1 &&
          ['once', 'weekly', 'monthly', 'custom'].includes(plan.cadence),
        'The exact report/visit plan retains a recognized revision and recurrence definition, with no inferred operational active status.',
        plan ? [plan.id] : [],
      );
      fact(
        'REPORT_VERSION',
        'Recorded published report version',
        report?.version,
        [card.source.id],
      );
      fact('REPORT_PHASE', 'Recorded report phase', phase, [card.source.id]);
      fact(
        'REPORT_PUBLISHED_AT',
        'Recorded report publication timestamp',
        timestamp(report?.published_at) ? report!.published_at : null,
        [card.source.id],
      );
      fact(
        'REPORTED_CHECKLIST_COUNT',
        'Recorded checklist entries (not completion proof)',
        report?.checklist.length,
        [card.source.id],
      );
      check(
        'DOCUMENTATION_STATE',
        phase !== null &&
          timestamp(report?.published_at) &&
          !!visit &&
          ['draft', 'submitted', 'published'].includes(visit.status),
        'Published documentation and a recognized recorded visit state are distinct from physical completion.',
        [card.source.id],
      );
      gap(
        'PHYSICAL_ACCEPTANCE',
        'After-phase reports and checklist marks are documentation only; repair, warranty, physical completion and customer acceptance remain UNVERIFIED.',
        'UNVERIFIED',
      );
      break;
    }
    case 'issued': {
      const version = raw.bundle.version;
      check(
        'EXACT_ISSUED_VERSION',
        card.source.id === version.id &&
          card.source.version === version.version_number &&
          card.source.revision === version.lock_revision &&
          exactRelated([target.estimate_id]),
        'Exact canonical immutable issued version, saved revision, original estimate and job baseline are required.',
        [version.id, target.estimate_id],
      );
      fact(
        'ISSUED_STATUS',
        'Canonical estimate-version status',
        version.status === 'issued' ? version.status : null,
        [version.id],
      );
      fact(
        'ISSUED_LOCK_REVISION',
        'Canonical issued-version saved revision',
        version.lock_revision,
        [version.id],
      );
      const decisions = entry.release
          .read('staff')
          .release_decisions.filter(
            (d) => d.id === entry.receipt_id && d.offer_id === entry.offer_id,
          ),
        decision = decisions.length === 1 ? decisions[0] : null;
      fact(
        'TEST_PREFERENCE',
        'Recorded local test preference',
        decision &&
          ['accepted', 'declined', 'changes_requested'].includes(
            decision.decision,
          )
          ? decision.decision
          : null,
        [entry.offer_id, entry.receipt_id],
      );
      check(
        'ISSUED_WORKFLOW_STATE',
        version.status === 'issued',
        'Only the actual immutable issued state is recognized.',
        [version.id],
      );
      gap(
        'CONTRACT_AUTHORITY',
        'Issued scope and a local test preference do not establish genuine contract, signature, work or financial authority.',
        'UNVERIFIED',
      );
      break;
    }
    case 'time': {
      const times = raw.workforce.entries.filter(
          (e) => e.id === card.source.id,
        ),
        time = times.length === 1 ? times[0] : null;
      check(
        'EXACT_TIME_SEGMENT',
        !!time &&
          time.job_id === target.job_id &&
          card.source.version === null &&
          card.source.revision === null &&
          exactRelated([job.id]),
        'Exact existing time segment and job relationship are required; no private workforce amounts are projected.',
        [card.source.id, job.id],
      );
      const kind =
        time && ['work', 'break_paid', 'break'].includes(time.kind)
          ? time.kind
          : null;
      fact('TIME_KIND', 'Recorded time-segment kind', kind, [card.source.id]);
      fact('TIME_SUBMITTED', 'Recorded submitted flag', time?.submitted, [
        card.source.id,
      ]);
      fact('TIME_STARTED_AT', 'Recorded segment start', time?.started_at, [
        card.source.id,
      ]);
      fact('TIME_ENDED_AT', 'Recorded segment end', time?.ended_at, [
        card.source.id,
      ]);
      check(
        'TIME_WORKFLOW_STATE',
        kind !== null &&
          typeof time?.submitted === 'boolean' &&
          timestamp(time?.started_at),
        'Recognized recorded segment kind/submitted flag is not approved payroll, paid labor or future availability.',
        [card.source.id],
      );
      check(
        'TIME_END_RECORDED',
        timestamp(time?.ended_at),
        'An open or missing segment end is incomplete recorded evidence; no end, worked duration or future availability is invented.',
        [card.source.id],
      );
      gap(
        'TIME_AVAILABILITY',
        'Recorded work/break segments do not establish current crew availability, physical completion, payroll approval or payroll payment.',
      );
      break;
    }
    default:
      gap(
        'UNRECOGNIZED_SOURCE',
        'The source kind is unrecognized. No workflow state or action eligibility is inferred.',
      );
  }
  gap(
    'GENUINE_AUTH',
    'Only current eligible synthetic owner/admin membership is checked; genuine Auth/MFA and operational custody are UNVERIFIED.',
    'UNVERIFIED',
  );
  return {
    status:
      checks.some((c) => c.required_for_source) &&
      checks
        .filter((c) => c.required_for_source)
        .every((c) => c.status === 'MATCHED')
        ? ('MATCHED_RECORDED_STATE' as const)
        : ('UNKNOWN' as const),
    meaning:
      'Matched means exact recorded local state only. Suggestion visibility and manual review never authorize an action.',
    facts,
    required_checks: checks,
    gaps: checks
      .filter((c) => c.status !== 'MATCHED')
      .map((c) => ({ code: c.code, status: c.status, detail: c.detail })),
    manual_next_review: card.suggested_human_review,
    action_authority: 'BLOCKED_SEPARATE_AUTHORITY_UNVERIFIED' as const,
  };
}
interface ReadHold {
  status: 'PENDING' | 'RETAINED' | 'UNKNOWN';
}
const readHolds = new WeakMap<object, Map<string, ReadHold>>();
const records = new WeakMap<
  object,
  {
    check: () => void;
    daily: DailyActionCenterReview;
    uncertain: boolean;
    hold: ReadHold;
  }
>();
const details = new WeakMap<
  object,
  { review: VerifiedOperatingSuggestionsReview; key: string }
>();
/** Finite local read custody only, not a second Copilot engine or business store.
 * Neither rereading a fresh container nor changing criteria can erase an UNKNOWN outcome. */
export async function readVerifiedOperatingSuggestions(
  sources: OperatingSources,
  input: VerifiedSuggestionsInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const capture = captureOperatingSources(sources, gate),
    selected = pin(input),
    identity = JSON.stringify(selected);
  let daily: DailyActionCenterReview | null = null;
  const check = () => {
    admit(gate);
    capture.check();
    if (JSON.stringify(pin(input)) !== identity) throw denied();
    if (daily) filterDailyActionCenter(daily, all);
  };
  check();
  const held = readHolds.get(sources.estimates) ?? new Map<string, ReadHold>(),
    keys = capture.entries.map(
      (e) =>
        `${capture.organization_id}:${capture.actor_id}:${e.target.job_id}`,
    );
  if (keys.some((k) => held.has(k)))
    throw Error(
      'Suggestion source review already held; exact retained read-only inspection only. No replay or replacement.',
    );
  const hold: ReadHold = { status: 'PENDING' };
  keys.forEach((key) => held.set(key, hold));
  readHolds.set(sources.estimates, held);
  try {
    daily = await readDailyActionCenter(sources, input, gate);
    check();
    const cards = daily.cards.map((card) => ({
      ...card,
      verification: stateVerification(sources, daily!, card),
    }));
    check();
    const { sha256: parent_sha256, ...parent } = daily;
    const body = {
      ...parent,
      mode: 'LOCAL_VERIFIED_OPERATING_SUGGESTIONS' as const,
      parent_sha256,
      cards,
      verification_counts: {
        matched_recorded_state: cards.filter(
          (c) => c.verification.status === 'MATCHED_RECORDED_STATE',
        ).length,
        unknown: cards.filter((c) => c.verification.status === 'UNKNOWN')
          .length,
      },
      verification_meaning:
        'Exact current recorded workflow checks only. Missing/unrecognized state is UNKNOWN, all action authority remains BLOCKED.',
      read_custody:
        'ONE_FINITE_SOURCE_SET_READ_NO_REPLAY_OR_REPLACEMENT' as const,
    };
    const sha256 = await documentHash(body);
    check();
    if (
      (await inspectDailyActionCenter(daily)).status !== 'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    check();
    const result = freezePrototype({ ...body, sha256 });
    hold.status = 'RETAINED';
    records.set(result, { check, daily, uncertain: false, hold });
    return result;
  } catch (error) {
    hold.status = 'UNKNOWN';
    throw error;
  }
}
export type VerifiedOperatingSuggestionsReview = Awaited<
  ReturnType<typeof readVerifiedOperatingSuggestions>
>;
function current(review: VerifiedOperatingSuggestionsReview) {
  const record = records.get(review);
  if (!record || record.uncertain || record.hold.status !== 'RETAINED')
    throw denied();
  try {
    record.check();
  } catch {
    record.uncertain = true;
    record.hold.status = 'UNKNOWN';
    throw denied();
  }
  return record;
}
export function assertVerifiedSuggestionsCurrent(
  value: VerifiedOperatingSuggestionsReview | VerifiedSuggestionDetail,
) {
  const detail = details.get(value);
  current(
    detail ? detail.review : (value as VerifiedOperatingSuggestionsReview),
  );
}
export function filterVerifiedOperatingSuggestions(
  review: VerifiedOperatingSuggestionsReview,
  filter: VerifiedSuggestionsFilter,
) {
  const record = current(review),
    p = own(filter, [
      'area',
      'level',
      'job_id',
      'query',
      'band',
      'source_kind',
      'verification',
    ]);
  if (
    typeof p.source_kind !== 'string' ||
    !['all', ...suggestionSourceKinds].includes(p.source_kind) ||
    typeof p.verification !== 'string' ||
    !['all', ...suggestionVerificationStates].includes(p.verification) ||
    typeof p.query !== 'string' ||
    p.query.length > 200
  )
    throw denied();
  const child = filterDailyActionCenter(record.daily, {
      area: p.area,
      level: p.level,
      job_id: p.job_id,
      query: '',
      band: p.band,
    } as DailyActionCenterFilter),
    keys = new Set(child.cards.map((c) => c.key)),
    query = p.query.trim().toLowerCase(),
    cards = review.cards.filter(
      (c) =>
        keys.has(c.key) &&
        (p.source_kind === 'all' || c.source.kind === p.source_kind) &&
        (p.verification === 'all' ||
          c.verification.status === p.verification) &&
        (!query ||
          [
            c.recorded_fact,
            c.suggested_human_review,
            c.source.id,
            c.source.kind,
            c.context.job,
            c.context.customer,
            c.context.property,
            ...c.verification.facts.flatMap((f) => [
              f.label,
              f.value ?? 'UNKNOWN',
            ]),
            ...c.verification.required_checks.map((v) => v.detail),
          ]
            .join(' ')
            .toLowerCase()
            .includes(query)),
    );
  current(review);
  return freezePrototype({
    cards,
    matching: cards.length,
    available: review.cards.length,
    coverage: review.coverage,
    matched_recorded_state: cards.filter(
      (c) => c.verification.status === 'MATCHED_RECORDED_STATE',
    ).length,
    unknown: cards.filter((c) => c.verification.status === 'UNKNOWN').length,
  });
}
export async function openVerifiedSuggestionSource(
  review: VerifiedOperatingSuggestionsReview,
  key: string,
) {
  const record = current(review);
  if (typeof key !== 'string' || key.length > 700) throw denied();
  const rows = review.cards.filter((c) => c.key === key);
  if (rows.length !== 1) throw denied();
  try {
    const original = await openDailyActionSource(record.daily, key);
    current(review);
    if (
      JSON.stringify(original.target) !==
        JSON.stringify(rows[0].source.target) ||
      original.source.id !== rows[0].source.id ||
      original.source.version !== rows[0].source.version ||
      original.source.revision !== rows[0].source.revision
    )
      throw denied();
    const body = {
      card: rows[0],
      target: { ...original.target },
      source: { ...original.source },
      detail: original.detail,
      authority:
        'EXACT_READ_ONLY_SOURCE_INSPECTION_NOT_ACTION_AUTHORITY' as const,
    };
    const sha256 = await documentHash(body);
    current(review);
    const result = freezePrototype({ ...body, sha256 });
    details.set(result, { review, key });
    return result;
  } catch {
    record.uncertain = true;
    record.hold.status = 'UNKNOWN';
    throw denied();
  }
}
export type VerifiedSuggestionDetail = Awaited<
  ReturnType<typeof openVerifiedSuggestionSource>
>;
/** Navigation requires the exact separately inspected source detail, not a card or copied view. */
export function openVerifiedSuggestionJob(detail: VerifiedSuggestionDetail) {
  const retained = details.get(detail);
  if (!retained) throw denied();
  const record = current(retained.review),
    row = retained.review.cards.find((c) => c.key === retained.key);
  if (
    !row ||
    JSON.stringify(row.source.target) !== JSON.stringify(detail.target)
  )
    throw denied();
  const result = openDailyActionJob(record.daily, detail.target.job_id!);
  current(retained.review);
  return result;
}
export async function inspectVerifiedOperatingSuggestions(
  review: VerifiedOperatingSuggestionsReview,
) {
  try {
    const record = current(review),
      { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    current(review);
    if (
      (await inspectDailyActionCenter(record.daily)).status !==
      'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    current(review);
    return freezePrototype({
      status: 'CURRENT_READ_ONLY_SUGGESTIONS' as const,
      replacement: null,
    });
  } catch {
    const record = records.get(review);
    if (record) {
      record.uncertain = true;
      record.hold.status = 'UNKNOWN';
    }
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
