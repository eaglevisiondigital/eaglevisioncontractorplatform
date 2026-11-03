import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  recordedOwnerActionsEnabled,
  readRecordedOwnerActions,
  assertRecordedOwnerActionsCurrent,
  recordedOwnerActionCards,
  inspectRecordedOwnerAction,
  continueRecordedOwnerAction,
} from './recorded-owner-actions';
import {
  readCostCorrectionReview,
  assertCostCorrectionReviewCurrent,
} from './cost-correction-review';
export const currentOwnerPrioritiesEnabled = recordedOwnerActionsEnabled;
/** Read composition only. The original ranker and navigation custody stay intact. */
const reads = new WeakSet<object>();
export async function readCurrentOwnerPriorities(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(g).length !== 2 ||
    g.enabled !== true ||
    g.confirmed !== true ||
    !currentOwnerPrioritiesEnabled(true)
  )
    throw Error('Current owner priorities are OFF');
  const original = await readRecordedOwnerActions(sources, jobId, gate),
    costs = await readCostCorrectionReview(sources, jobId, gate),
    e = costs.costs.evidence,
    property = sources.property.read(
      original.snapshot.identity.organization_id,
    ),
    identity = original.snapshot.identity;
  assertRecordedOwnerActionsCurrent(original);
  assertCostCorrectionReviewCurrent(costs);
  const rows = recordedOwnerActionCards(original).map((card) => {
    let state = 'UNKNOWN_SOURCE_UNAVAILABLE',
      facts: string[] = [
        'Exact current source is unavailable or ambiguous. No completion or action is inferred.',
      ];
    if (card.source.kind === 'finance' && card.source.id === identity.job_id) {
      state = 'RECORDED_FINANCE_REQUIREMENTS';
      facts = [
        `Current job revision: ${e.job_revision}`,
        `Original cost coverage: ${e.facts.cost_coverage}`,
        `Original invoice requirement outcome: ${e.invoice.overall}`,
        `Canonical projected cost: ${costs.canonical.projected_cost_minor} ${e.currency} minor units`,
        `Canonical cost-complete flag: ${costs.canonical.complete}; independent coverage requirements remain binding.`,
        ...e.facts.missing_evidence,
      ];
    } else if (card.source.kind === 'time') {
      const entries = e.time.filter((t) => t.id === card.source.id),
        entry = entries[0];
      if (entries.length === 1 && entry) {
        state = 'RECORDED_TIME_STATE';
        facts = [
          `Submitted: ${entry.submitted}`,
          `Recorded staff review: ${entry.review ?? 'not present in available source'}`,
          `Closed timestamp: ${entry.ended_at ?? 'not recorded; OPEN'}`,
          `Corrects entry: ${entry.corrects_id ?? 'none recorded'}`,
          `Recorded correcting entries: ${
            e.time
              .filter((t) => t.corrects_id === entry.id)
              .map((t) => t.id)
              .join(', ') || 'none recorded'
          }`,
          e.labor_entry_ids.includes(entry.id)
            ? 'Included in available canonical locked-labor evidence.'
            : 'UNPOSTED OR UNVERIFIED in available locked-labor evidence; no zero-cost or payroll claim.',
        ];
      }
    } else if (card.source.kind === 'visit') {
      const visits = property.visits.filter(
          (v) =>
            v.id === card.source.id &&
            v.organization_id === identity.organization_id &&
            property.plans.some(
              (p) =>
                p.id === v.plan_id &&
                p.customer_id === identity.customer_id &&
                p.location_id === identity.location_id &&
                p.job_id === identity.job_id,
            ),
        ),
        visit = visits[0];
      if (
        visits.length === 1 &&
        visit &&
        visit.revision === card.source.revision
      ) {
        state = 'RECORDED_VISIT_STATE';
        facts = [
          `Native visit status: ${visit.status}`,
          `Exact visit revision: ${visit.revision}`,
          `Recorded visit date: ${visit.visited_on}`,
          `Plan: ${visit.plan_id}`,
          'Visit state is documentation/scheduling evidence, not verified physical completion or availability.',
        ];
      }
    } else if (card.source.kind === 'report') {
      const reports = property.reports.filter(
          (r) =>
            r.id === card.source.id &&
            r.version === card.source.version &&
            r.customer_id === identity.customer_id &&
            r.location_id === identity.location_id,
        ),
        report = reports[0];
      if (reports.length === 1 && report) {
        state = 'RECORDED_PUBLISHED_REPORT';
        facts = [
          `Exact report: ${report.id}; published version: ${report.version}`,
          `Published at: ${report.published_at}`,
          `Original visit: ${report.visit_id}`,
          'Publication preserves recorded observations; it does not establish acceptance, repair or verified physical completion.',
        ];
      }
    } else if (
      card.source.kind === 'issued' &&
      card.source.id === identity.version_id &&
      card.source.version === e.issued.version_number
    ) {
      state = 'RECORDED_IMMUTABLE_ISSUED_SCOPE';
      facts = [
        `Original estimate: ${identity.estimate_id}`,
        `Exact issued version: ${e.issued.version_id}; number: ${e.issued.version_number}`,
        `Original scope SHA-256: ${e.issued.scope_sha256}`,
        'Issued scope is not a new contract, work authorization, invoice or payment mandate.',
      ];
    }
    return {
      key: card.key,
      rank: card.rank,
      area: card.area,
      level: card.level,
      source: {
        kind: card.source.kind,
        id: card.source.id,
        revision: card.source.revision,
        version: card.source.version,
      },
      state,
      facts,
      recorded_fact: card.recorded_fact,
      suggested_human_review: card.suggested_human_review,
      order_reasons: [...card.order_reasons],
      missing_evidence: card.missing_evidence.map((item) => ({ ...item })),
      authority: 'ORIGINAL_REVIEW_SUGGESTION_ONLY' as const,
    };
  });
  assertRecordedOwnerActionsCurrent(original);
  assertCostCorrectionReviewCurrent(costs);
  const view = freezePrototype({
    original,
    costs,
    rows,
    coverage: original.snapshot.evidence.coverage,
    meaning: 'CURRENT_RECORDED_WORKFLOW_STATE_NOT_ACTION_AUTHORITY' as const,
    operational_ready: false as const,
  });
  reads.add(view);
  return view;
}
export type CurrentOwnerPrioritiesRead = Awaited<
  ReturnType<typeof readCurrentOwnerPriorities>
>;
export function assertCurrentOwnerPriorities(view: CurrentOwnerPrioritiesRead) {
  if (!reads.has(view))
    throw Error('Original current owner source read required');
  assertRecordedOwnerActionsCurrent(view.original);
  assertCostCorrectionReviewCurrent(view.costs);
}
export async function inspectCurrentOwnerPriority(
  view: CurrentOwnerPrioritiesRead,
  key: string,
) {
  assertCurrentOwnerPriorities(view);
  if (
    typeof key !== 'string' ||
    key.length > 700 ||
    !view.rows.some(
      (row) => row.key === key && row.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
    )
  )
    throw Error('Exact available current priority source required');
  const source = await inspectRecordedOwnerAction(view.original, key);
  assertCurrentOwnerPriorities(view);
  return source;
}
export async function continueCurrentOwnerPriority(
  view: CurrentOwnerPrioritiesRead,
  source: Awaited<ReturnType<typeof inspectCurrentOwnerPriority>>,
  ...args: Parameters<typeof continueRecordedOwnerAction> extends [
    unknown,
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) {
  try {
    assertCurrentOwnerPriorities(view);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
  if (
    !view.rows.some(
      (row) =>
        row.key === source.key && row.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
    )
  )
    return {
      status: 'WITHHELD_NO_DISPATCH' as const,
      replay: 'FORBIDDEN' as const,
    };
  return continueRecordedOwnerAction(view.original, source, ...args);
}
