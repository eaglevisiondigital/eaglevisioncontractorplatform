import type { LocalJourney } from './journey-runtime';
import { readFinanceWorkflow, verifyFinanceWorkflow } from './finance-workflow';
import {
  readFieldWorkflow,
  verifyFieldWorkflow,
  openFieldWorkflowReport,
} from './field-workflow';
import { readIntelligenceWorkflowAttempt } from './intelligence-workflow';
import { capacityDay } from '../../domain/field/crew-capacity';
import { detached } from '../../domain/jobs/margin-analysis';
import { documentHash } from '../../domain/release/preview';
import {
  completionReviewGuard,
  type CompletionReviewAdmission,
} from '../job-cost-completion';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
} from '../program/prototype-source';

export interface DailyOperationsInput {
  review_on: string;
  timezone: string;
  input_revision: number;
}
export interface DailyOperationsFilter {
  area: 'all' | 'finance' | 'field' | 'scope' | 'documentation';
  level: 'all' | 'evidence' | 'review';
  query: string;
}
export interface DailyPriorityCard {
  id: string;
  area: Exclude<DailyOperationsFilter['area'], 'all'>;
  level: 'evidence' | 'review';
  observation: string;
  suggested_review: string;
  recorded_day: string | null;
  source: {
    kind: 'finance' | 'visit' | 'time' | 'issued' | 'report';
    id: string;
    version: number | null;
    revision: number | null;
    related_ids: string[];
  };
  destination:
    'journey-finance' | 'journey-field' | 'journey-sales' | 'journey-customer';
}
const denied = () =>
  Error('Exact current admitted daily operating source required');
function own(value: unknown, keys: readonly string[]) {
  const p = prototypeFields(value, keys);
  if (Reflect.ownKeys(p).length !== keys.length) throw denied();
  return p;
}
function pin(value: DailyOperationsInput) {
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
  return p as unknown as DailyOperationsInput;
}
function filterInput(value: DailyOperationsFilter) {
  const p = own(value, ['area', 'level', 'query']);
  if (
    typeof p.area !== 'string' ||
    !['all', 'finance', 'field', 'scope', 'documentation'].includes(p.area) ||
    typeof p.level !== 'string' ||
    !['all', 'evidence', 'review'].includes(p.level) ||
    typeof p.query !== 'string' ||
    p.query.length > 200
  )
    throw denied();
  return p as unknown as DailyOperationsFilter;
}
const records = new WeakMap<
  object,
  {
    check: () => void;
    access: () => void;
    finance: Awaited<ReturnType<typeof readFinanceWorkflow>>;
    field: Awaited<ReturnType<typeof readFieldWorkflow>>;
  }
>();

/** Read-only deterministic source composition. Never consumes a Copilot/Voice preparation claim. */
export async function readDailyOperations(
  sources: LocalJourney,
  originalInput: DailyOperationsInput,
  gate: CompletionReviewAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  completionReviewGuard(sources.gate)();
  const journeyGate = sources.gate,
    offerId = sources.offer_id,
    receiptId = sources.receipt_id;
  if (
    [offerId, receiptId].some(
      (value) => typeof value !== 'string' || !value || value.length > 200,
    )
  )
    throw denied();
  const selected = pin(originalInput),
    identity = JSON.stringify(selected);
  const originalTarget = sources.target,
    target = detached(originalTarget);
  const repo = sources.estimates,
    property = sources.property,
    release = sources.release,
    company = sources.company;
  if (
    property.estimates !== repo ||
    repo.operations !== sources.operations ||
    company.id !== target.organization_id
  )
    throw denied();
  const source = await readPrototypeSource(repo, target, gate);
  const access = () => {
    completionReviewGuard(gate)();
    completionReviewGuard(journeyGate)();
    const members = repo.operations
      .syntheticMemberships(target.organization_id)
      .filter((m) => m.user_id === target.actor_id);
    if (
      members.length !== 1 ||
      !members[0].active ||
      !['owner', 'admin'].includes(members[0].role)
    )
      throw denied();
    return `${members[0].role}:${members[0].staff_type}`;
  };
  const role = access();
  const fence = () =>
    JSON.stringify({
      property: property.read(target.organization_id),
      assignments: repo.syntheticJobAssignments(
        target.organization_id,
        target.actor_id,
      ),
      release: release.read('staff'),
      version: release.version,
      intelligence: readIntelligenceWorkflowAttempt(repo, target, gate),
    });
  const initialFence = fence();
  const check = () => {
    if (
      access() !== role ||
      sources.estimates !== repo ||
      sources.property !== property ||
      sources.release !== release ||
      sources.company !== company ||
      sources.gate !== journeyGate ||
      sources.offer_id !== offerId ||
      sources.receipt_id !== receiptId ||
      company.id !== target.organization_id ||
      sources.target !== originalTarget ||
      repo.operations !== sources.operations ||
      JSON.stringify(detached(sources.target)) !== JSON.stringify(target) ||
      JSON.stringify(pin(originalInput)) !== identity
    )
      throw denied();
    assertPrototypeSourceCurrentNow(source);
    if (fence() !== initialFence) throw Error('Daily operating source changed');
  };
  check();
  const original = repo.readSyntheticPrototypeSources(target);
  if (!original.job || original.bundle.version.status !== 'issued')
    throw denied();
  const finance = await readFinanceWorkflow(
    repo,
    originalTarget,
    {
      job_revision: original.job.lock_revision,
      currency: original.job.baseline.currency,
      release: {
        preview: release,
        offer_id: offerId,
        decision_id: receiptId,
        contract_id: null,
        signature_id: null,
        invoice_id: null,
        as_of: new Date().toISOString(),
      },
      accounting_aliases: null,
      procurement: null,
    },
    gate,
  );
  check();
  const field = await readFieldWorkflow(
    property,
    originalTarget,
    { day: selected.review_on, timezone: selected.timezone },
    gate,
  );
  check();
  const copilot = readIntelligenceWorkflowAttempt(repo, originalTarget, gate);
  const cards: DailyPriorityCard[] = finance.costReview.cards.map(
    (card, index) => ({
      id: `finance:${card.code}:${card.category ?? 'job'}:${index}`,
      area: 'finance',
      level: card.level === 'UNKNOWN' ? 'evidence' : 'review',
      observation: card.label,
      suggested_review:
        'Inspect the exact saved cost/coverage evidence in the existing Finance workflow. No posting or financial action follows.',
      recorded_day: null,
      source: {
        kind: 'finance',
        id: target.job_id!,
        version: null,
        revision: original.job!.lock_revision,
        related_ids: [target.version_id, ...card.expenseIds],
      },
      destination: 'journey-finance',
    }),
  );
  cards.push({
    id: `issued:${target.version_id}`,
    area: 'scope',
    level: 'review',
    observation: `${finance.invoicePreparation.scope.lines.length} customer-safe scope lines remain in immutable issued version ${finance.invoicePreparation.issued.version_number}.`,
    suggested_review:
      'Review this exact issued scope before using the existing separate revision workflow. No new quote or contract is prepared.',
    recorded_day: null,
    source: {
      kind: 'issued',
      id: target.version_id,
      version: finance.invoicePreparation.issued.version_number,
      revision: finance.invoicePreparation.issued.saved_revision,
      related_ids: [target.estimate_id],
    },
    destination: 'journey-sales',
  });
  const seen = new Set<string>();
  for (const lane of field.day.crew)
    for (const event of lane.events) {
      const key = JSON.stringify([
        event.kind,
        event.visit_id,
        event.visit_revision,
        event.recorded_id,
        event.plan_id,
        event.plan_revision,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      if (event.kind === 'DATE_ONLY_VISIT' && event.visit_id)
        cards.push({
          id: `visit:${event.visit_id}:${event.visit_revision}`,
          area: 'field',
          level: 'evidence',
          observation: `An existing property visit is recorded for ${event.date}. Its time and actual availability are UNKNOWN.`,
          suggested_review:
            'Inspect the exact visit and plan before any separate scheduling review; this is not a booked appointment or dispatch.',
          recorded_day: event.date,
          source: {
            kind: 'visit',
            id: event.visit_id,
            version: null,
            revision: event.visit_revision,
            related_ids: event.plan_id ? [event.plan_id] : [],
          },
          destination: 'journey-field',
        });
      else if (event.kind === 'RECORDED_SEGMENT' && event.recorded_id)
        cards.push({
          id: `time:${event.recorded_id}`,
          area: 'field',
          level: event.end === null ? 'evidence' : 'review',
          observation:
            event.end === null
              ? 'An exact recorded time segment has no end timestamp.'
              : 'An exact recorded time segment overlaps the selected civil day.',
          suggested_review:
            'Inspect the existing segment. This does not submit time, prove available hours or execute payroll.',
          recorded_day: selected.review_on,
          source: {
            kind: 'time',
            id: event.recorded_id,
            version: null,
            revision: null,
            related_ids: [target.job_id!],
          },
          destination: 'journey-field',
        });
    }
  for (const report of field.published_reports)
    cards.push({
      id: `report:${report.report_id}:v${report.published_version}`,
      area: 'documentation',
      level: 'review',
      observation: `Published inspection version ${report.published_version} records: ${report.snapshot.summary}`,
      suggested_review:
        'Open this exact published report and version. Reported documentation does not prove physical repair, approval or complete history.',
      recorded_day: report.snapshot.visited_on,
      source: {
        kind: 'report',
        id: report.report_id,
        version: report.published_version,
        revision: null,
        related_ids: [report.visit_id, report.plan_id],
      },
      destination: 'journey-customer',
    });
  const areas = ['finance', 'field', 'documentation', 'scope'];
  cards.sort(
    (a, b) =>
      Number(a.level === 'review') - Number(b.level === 'review') ||
      (a.recorded_day ?? '9999').localeCompare(b.recorded_day ?? '9999') ||
      areas.indexOf(a.area) - areas.indexOf(b.area) ||
      a.id.localeCompare(b.id),
  );
  const body = {
    mode: 'LOCAL_SYNTHETIC_DAILY_OPERATING_REVIEW' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    target,
    review_on: selected.review_on,
    timezone: selected.timezone,
    input_revision: selected.input_revision,
    source_sha256: source.sha256,
    context: {
      job_title: field.job.title,
      customer: field.job.customer_label,
      property: field.job.property_label,
      issued_version: finance.invoicePreparation.issued,
      job_revision: original.job.lock_revision,
    },
    date_meaning:
      'Human-selected civil-day context filters Field activity only. Scope, Finance and available exact published reports remain selected-job review context; no deadline, overdue or urgency is inferred.',
    order_meaning:
      'Review ordering only: evidence gaps first, then recorded source dates, then Finance/Field/documentation/scope and exact identity. This is not reported physical severity or urgent execution authority.',
    cards,
    coverage:
      'AVAILABLE_EXACT_SELECTED_JOB_SOURCES_ONLY_NOT_WHOLE_COMPANY' as const,
    finance: {
      coverage: finance.costReview.status,
      invoice_readiness: finance.invoicePreparation.overall,
      invoice_status: finance.invoicePreparation.status,
      authority: 'NO_FINANCIAL_ACTION' as const,
    },
    field: {
      actual_availability: 'UNKNOWN' as const,
      capacity: 'UNKNOWN' as const,
      physical_completion: 'UNVERIFIED' as const,
    },
    existing_intelligence: {
      status: copilot.status,
      phase: copilot.phase,
      retry: false,
      replacement: null,
      destination: 'journey-intelligence' as const,
      meaning:
        'Existing Copilot/Voice/trade controls remain separate. This dashboard neither consumes nor replays their one-shot preparation.',
    },
    model: 'NONE' as const,
    authority: {
      save: false,
      assign: false,
      schedule: false,
      dispatch: false,
      issue: false,
      post_time: false,
      financial: false,
      communicate: false,
      microphone: false,
      provider: false,
      hosted: false,
    },
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  if ((await verifyFinanceWorkflow(finance)).status !== 'CURRENT_LOCAL_SOURCE')
    throw denied();
  check();
  if ((await verifyFieldWorkflow(field)).status !== 'CURRENT') throw denied();
  check();
  const result = freezePrototype({ ...body, sha256 });
  records.set(result, {
    check,
    access: () => {
      if (access() !== role) throw denied();
    },
    finance,
    field,
  });
  return result;
}
export type DailyOperationsReview = Awaited<
  ReturnType<typeof readDailyOperations>
>;

export function filterDailyOperations(
  review: DailyOperationsReview,
  value: DailyOperationsFilter,
) {
  const record = records.get(review);
  if (!record) throw denied();
  record.check();
  const selected = filterInput(value),
    query = selected.query.trim().toLowerCase();
  const cards = review.cards.filter(
    (c) =>
      (selected.area === 'all' || c.area === selected.area) &&
      (selected.level === 'all' || c.level === selected.level) &&
      (!query ||
        `${c.observation} ${c.suggested_review} ${c.source.id}`
          .toLowerCase()
          .includes(query)),
  );
  return freezePrototype({
    cards,
    matching: cards.length,
    available: review.cards.length,
    coverage: review.coverage,
  });
}
export async function inspectDailyOperations(review: DailyOperationsReview) {
  const r = records.get(review);
  if (!r)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    r.access();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    r.check();
    if (
      (await verifyFinanceWorkflow(r.finance)).status !== 'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    r.check();
    if ((await verifyFieldWorkflow(r.field)).status !== 'CURRENT')
      throw denied();
    r.check();
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch (error) {
    try {
      r.access();
    } catch {
      return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
    }
    return freezePrototype({
      status:
        error instanceof Error &&
        ['Stale prototype source', 'Daily operating source changed'].includes(
          error.message,
        )
          ? ('STALE' as const)
          : ('UNKNOWN' as const),
      replacement: null,
    });
  }
}
export async function openDailyOperationsSource(
  review: DailyOperationsReview,
  cardId: string,
) {
  const record = records.get(review);
  if (!record || typeof cardId !== 'string' || cardId.length > 400)
    throw denied();
  if ((await inspectDailyOperations(review)).status !== 'CURRENT_LOCAL_SOURCE')
    throw denied();
  record.check();
  const cards = review.cards.filter((c) => c.id === cardId);
  if (cards.length !== 1) throw denied();
  const card = cards[0];
  const detail =
    card.source.kind === 'report'
      ? await openFieldWorkflowReport(record.field, {
          report_id: card.source.id,
          published_version: card.source.version!,
        })
      : card.source.kind === 'issued'
        ? {
            scope: record.finance.invoicePreparation.scope,
            issued: record.finance.invoicePreparation.issued,
          }
        : {
            source: card.source,
            observation: card.observation,
            meaning: card.suggested_review,
          };
  record.check();
  return freezePrototype({
    card_id: cardId,
    target: { ...review.target },
    detail,
    authority: 'NAVIGATION_ONLY' as const,
  });
}
