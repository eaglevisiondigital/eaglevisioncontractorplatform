import { documentHash } from '../../domain/release/preview';
import { completionReviewGuard } from '../job-cost-completion';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { financialEvidenceEnabled } from './financial-evidence-review';
import { readDailyActionCenter } from './daily-action-center';
import {
  readSavedRevision,
  compareSavedRevisions,
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  adoptSavedRevision,
  type SavedRevisionSnapshot,
  type SavedRevisionSelection,
} from './saved-revision-runtime';
export const prioritySavedRevisionsEnabled = financialEvidenceEnabled;
/** Original deterministic source/card/rank engine, not a replacement recommender. */
async function project(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission,
) {
  const entry = sources.entries.find((e) => e.target.job_id === jobId);
  if (!entry) throw Error('Exact original saved priority job required');
  const review = await readDailyActionCenter(
    { ...sources, entries: [entry] },
    {
      review_on: entry.day,
      timezone: entry.timezone,
      input_revision: 1,
      ordering: 'EVIDENCE_FIRST',
    },
    gate,
  );
  const cards = [];
  for (const card of review.cards) {
    if (card.job_id !== jobId) throw Error('Foreign priority card rejected');
    const body = {
      key: card.key,
      rank: card.rank,
      area: card.area,
      level: card.level,
      job_id: card.job_id,
      context: {
        job: card.context.job,
        customer: card.context.customer,
        property: card.context.property,
      },
      recorded_fact: card.recorded_fact,
      suggested_human_review: card.suggested_human_review,
      recorded_day: card.recorded_day,
      review_band: card.review_band,
      order_reasons: [...card.order_reasons],
      missing_evidence: card.missing_evidence.map((e) => ({
        code: e.code,
        status: e.status,
        detail: e.detail,
      })),
      source: {
        kind: card.source.kind,
        id: card.source.id,
        version: card.source.version,
        revision: card.source.revision,
        related_ids: [...card.source.related_ids],
        job_revision: card.source.job_revision,
        issued_version: { ...card.source.issued_version },
        source_sha256: card.source.source_sha256,
      },
      authority: 'HUMAN_REVIEW_SUGGESTION_ONLY' as const,
    };
    cards.push({ ...body, sha256: await documentHash(body) });
  }
  const raw = entry.estimates.readSyntheticPrototypeSources(entry.target);
  if (!raw.job) throw Error('Exact saved job required');
  return {
    job_revision: raw.job.lock_revision,
    review_on: review.review_on,
    timezone: review.timezone,
    cards,
    coverage: {
      selected_jobs: review.coverage.selected_jobs,
      history: review.coverage.history,
    },
    model: 'NONE' as const,
    authority: 'READ_ONLY_NO_ACTION_RENEWAL' as const,
  };
}
export type PrioritySavedEvidence = Awaited<ReturnType<typeof project>>;
export type PrioritySavedRevision =
  SavedRevisionSnapshot<PrioritySavedEvidence>;
const originals = new WeakSet<object>();
export async function readPrioritySavedRevision(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<PrioritySavedRevision> {
  completionReviewGuard(gate)();
  if (!prioritySavedRevisionsEnabled(true))
    throw Error('Saved priority review is OFF');
  const snapshot = await readSavedRevision(
    sources,
    jobId,
    'priorities',
    gate,
    () => project(sources, jobId, gate),
  );
  originals.add(snapshot);
  return snapshot;
}
export type PriorityChangeStatus =
  'ADDED' | 'CHANGED' | 'UNCHANGED' | 'NOT_PRESENT_IN_CURRENT_READ';
type Card = PrioritySavedRevision['evidence']['cards'][number];
function identity(card: Card) {
  return JSON.stringify([
    card.job_id,
    card.source.kind,
    card.source.id,
    card.key,
  ]);
}
export interface PriorityRevisionRow {
  identity: string;
  status: PriorityChangeStatus;
  before: Card | null;
  current: Card | null;
}
export function comparePrioritySavedRevisions(
  before: PrioritySavedRevision,
  current: PrioritySavedRevision,
) {
  if (!originals.has(before) || !originals.has(current))
    throw Error('Original priority snapshots required');
  const comparison = compareSavedRevisions(before, current),
    a = new Map(before.evidence.cards.map((c) => [identity(c), c])),
    b = new Map(current.evidence.cards.map((c) => [identity(c), c]));
  if (
    a.size !== before.evidence.cards.length ||
    b.size !== current.evidence.cards.length
  )
    throw Error('Ambiguous exact priority identity');
  // Existing current order is retained. Removed rows follow in their original order.
  const rows: PriorityRevisionRow[] = [
    ...new Set([...b.keys(), ...a.keys()]),
  ].map((key) => {
    const left = a.get(key),
      right = b.get(key);
    return {
      identity: key,
      before: left ?? null,
      current: right ?? null,
      status: !left
        ? 'ADDED'
        : !right
          ? 'NOT_PRESENT_IN_CURRENT_READ'
          : left.sha256 === right.sha256
            ? 'UNCHANGED'
            : 'CHANGED',
    };
  });
  const result = freezePrototype({
    comparison,
    rows,
    meaning:
      'Exact original source/card differences only. Not present in this available read never means resolved, repaired or completed.',
  });
  comparisons.set(result, comparison);
  return result;
}
export type PrioritySavedComparison = ReturnType<
  typeof comparePrioritySavedRevisions
>;
const comparisons = new WeakMap<
  object,
  ReturnType<typeof compareSavedRevisions<PrioritySavedEvidence>>
>();
export function filterPrioritySavedRevisions(
  value: PrioritySavedComparison,
  input: { query: string; area: string; changed_only: boolean },
) {
  if (!comparisons.has(value))
    throw Error('Original saved priority comparison required');
  // Capture caller-controlled primitives before checking original native access.
  // No executable selector may run after those guards and disclose private rows.
  const p = prototypeFields(input, ['query', 'area', 'changed_only']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 200 ||
    !['all', 'finance', 'field', 'documentation', 'scope'].includes(
      p.area as string,
    ) ||
    typeof p.changed_only !== 'boolean'
  )
    throw Error('Exact original priority area and literal query required');
  assertSavedRevisionAccess(value.comparison.before);
  assertSavedRevisionCurrent(value.comparison.current);
  const query = p.query.trim().toLowerCase();
  const rows = value.rows.filter((row) => {
    const card = row.current ?? row.before!;
    return (
      (!p.changed_only || row.status !== 'UNCHANGED') &&
      (p.area === 'all' || card.area === p.area) &&
      (!query ||
        [
          row.status,
          card.source.kind,
          card.source.id,
          card.recorded_fact,
          card.suggested_human_review,
          ...card.order_reasons,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query))
    );
  });
  return freezePrototype({
    rows,
    matching: rows.length,
    available: value.rows.length,
  });
}
export function adoptPrioritySavedRevision(
  selection: SavedRevisionSelection<PrioritySavedEvidence>,
  value: PrioritySavedComparison,
  generation: number,
  confirmed: boolean,
) {
  const comparison = comparisons.get(value);
  if (!comparison)
    throw Error('Original inspected priority comparison required');
  return adoptSavedRevision(selection, comparison, generation, confirmed);
}
