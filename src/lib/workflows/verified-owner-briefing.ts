import { freezePrototype } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  currentOwnerPrioritiesEnabled,
  readCurrentOwnerPriorities,
  assertCurrentOwnerPriorities,
  inspectCurrentOwnerPriority,
  continueCurrentOwnerPriority,
} from './current-owner-priorities';
import {
  assertRecordedOwnerActionsAccess,
  compareRecordedOwnerActions,
} from './recorded-owner-actions';
export const verifiedOwnerBriefingEnabled = currentOwnerPrioritiesEnabled;
/** Original immutable read handles only, not a priority history store or action owner. */
const reads = new WeakSet<object>();
export async function readVerifiedOwnerBriefing(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const original = await readCurrentOwnerPriorities(sources, jobId, gate);
  assertCurrentOwnerPriorities(original);
  const view = freezePrototype({
    original,
    rows: original.rows,
    coverage: original.coverage,
    meaning:
      'ORIGINAL_RANKED_CURRENT_STATE_NOT_COMPLETION_OR_AUTHORITY' as const,
    operational_ready: false as const,
  });
  reads.add(view);
  return view;
}
export type VerifiedOwnerBriefingRead = Awaited<
  ReturnType<typeof readVerifiedOwnerBriefing>
>;
export function assertVerifiedOwnerBriefingCurrent(
  view: VerifiedOwnerBriefingRead,
) {
  if (!reads.has(view)) throw Error('Original verified briefing read required');
  assertCurrentOwnerPriorities(view.original);
}
function previousAccess(view: VerifiedOwnerBriefingRead) {
  if (!reads.has(view)) throw Error('Original earlier briefing read required');
  assertRecordedOwnerActionsAccess(view.original.original);
}
const comparisons = new WeakMap<
  object,
  { before: VerifiedOwnerBriefingRead; current: VerifiedOwnerBriefingRead }
>();
export function compareVerifiedOwnerBriefing(
  before: VerifiedOwnerBriefingRead,
  current: VerifiedOwnerBriefingRead,
) {
  previousAccess(before);
  assertVerifiedOwnerBriefingCurrent(current);
  const original = compareRecordedOwnerActions(
    before.original.original,
    current.original.original,
    { query: '', area: 'all', changed_only: false },
  );
  const rows = original.rows.map((row) => {
    const card = row.current ?? row.before!,
      matches = current.rows.filter(
        (r) =>
          row.current &&
          r.key === row.current.key &&
          r.source.kind === row.current.source.kind &&
          r.source.id === row.current.source.id &&
          r.source.version === row.current.source.version &&
          r.source.revision === row.current.source.revision,
      ),
      verified = matches.length === 1 ? matches[0] : undefined;
    return {
      key: card.key,
      status: row.status,
      original_rank: row.current?.rank ?? row.before!.rank,
      source: {
        kind: card.source.kind,
        id: card.source.id,
        revision: card.source.revision,
        version: card.source.version,
      },
      before_fact: row.before?.recorded_fact ?? null,
      current_fact: row.current?.recorded_fact ?? null,
      recorded_state: !row.current
        ? 'NOT_PRESENT_IN_CURRENT_READ_UNKNOWN'
        : (verified?.state ?? 'UNKNOWN_SOURCE_UNAVAILABLE'),
      facts: verified?.facts ?? [
        'Exact current source is unavailable. A disappeared suggestion is not evidence of completion, repair or acceptance.',
      ],
      can_inspect:
        !!verified && verified.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
      meaning: 'SOURCE_COMPARISON_NOT_RESOLUTION_OR_REPRIORITIZATION' as const,
    };
  });
  assertVerifiedOwnerBriefingCurrent(current);
  previousAccess(before);
  const view = freezePrototype({
    original,
    rows,
    meaning: 'OBSERVED_ORIGINAL_SOURCE_DIFFERENCES_ONLY' as const,
    history: 'TWO_EXPLICIT_LOCAL_READS_NOT_DURABLE_BUSINESS_HISTORY' as const,
    operational_ready: false as const,
  });
  comparisons.set(view, { before, current });
  return view;
}
export type VerifiedOwnerBriefingComparison = ReturnType<
  typeof compareVerifiedOwnerBriefing
>;
export function assertVerifiedOwnerComparisonCurrent(
  value: VerifiedOwnerBriefingComparison,
) {
  const b = comparisons.get(value);
  if (!b) throw Error('Original briefing comparison required');
  previousAccess(b.before);
  assertVerifiedOwnerBriefingCurrent(b.current);
}
export async function inspectVerifiedOwnerDifference(
  value: VerifiedOwnerBriefingComparison,
  key: string,
) {
  assertVerifiedOwnerComparisonCurrent(value);
  const b = comparisons.get(value)!,
    rows = value.rows.filter((r) => r.key === key && r.can_inspect);
  if (typeof key !== 'string' || key.length > 700 || rows.length !== 1)
    throw Error('Unique exact current comparison source required');
  const inspected = await inspectCurrentOwnerPriority(b.current.original, key);
  assertVerifiedOwnerComparisonCurrent(value);
  return inspected;
}
export async function inspectVerifiedOwnerPriority(
  view: VerifiedOwnerBriefingRead,
  key: string,
) {
  assertVerifiedOwnerBriefingCurrent(view);
  const result = await inspectCurrentOwnerPriority(view.original, key);
  assertVerifiedOwnerBriefingCurrent(view);
  return result;
}
export async function continueVerifiedOwnerPriority(
  view: VerifiedOwnerBriefingRead,
  ...args: Parameters<typeof continueCurrentOwnerPriority> extends [
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) {
  try {
    assertVerifiedOwnerBriefingCurrent(view);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
  return continueCurrentOwnerPriority(view.original, ...args);
}
