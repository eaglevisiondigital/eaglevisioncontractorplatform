import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  assertVerifiedOwnerBriefingCurrent,
  compareVerifiedOwnerBriefing,
  inspectVerifiedOwnerPriority,
  continueVerifiedOwnerPriority,
  type VerifiedOwnerBriefingRead,
} from './verified-owner-briefing';

export interface OwnerActionSelection {
  key: string;
  kind: string;
  id: string;
  revision: number | null;
  version: number | null;
}
/** Validate an explicit action selection against the original current reader.
 * Missing/stale rows never fall back to text, another revision or another job. */
export function checkOwnerActionRequirements(
  view: VerifiedOwnerBriefingRead,
  selection: OwnerActionSelection,
) {
  assertVerifiedOwnerBriefingCurrent(view);
  const p = prototypeFields(selection, [
    'key',
    'kind',
    'id',
    'revision',
    'version',
  ]);
  if (
    Object.keys(p).length !== 5 ||
    typeof p.key !== 'string' ||
    p.key.length > 700 ||
    typeof p.kind !== 'string' ||
    typeof p.id !== 'string' ||
    p.id.length > 200 ||
    ![p.revision, p.version].every(
      (v) => v === null || (Number.isSafeInteger(v) && (v as number) > 0),
    )
  )
    throw Error('Exact original owner action selection required');
  const matches = view.rows.filter((row) => row.key === p.key),
    row = matches.length === 1 ? matches[0] : undefined,
    exact =
      row &&
      row.source.kind === p.kind &&
      row.source.id === p.id &&
      row.source.revision === p.revision &&
      row.source.version === p.version,
    status = !row
      ? 'UNKNOWN_SOURCE_MISSING'
      : !exact
        ? 'SOURCE_CHANGED_RESELECT_REQUIRED'
        : row.state === 'UNKNOWN_SOURCE_UNAVAILABLE'
          ? 'UNKNOWN_SOURCE_UNAVAILABLE'
          : 'VERIFIED_ORIGINAL_REVIEW_DESTINATION';
  const requirements = exact
    ? row.missing_evidence.map((item) => ({ ...item }))
    : [];
  return freezePrototype({
    status,
    can_open_original: status === 'VERIFIED_ORIGINAL_REVIEW_DESTINATION',
    row: exact ? row : null,
    requirements,
    facts: exact
      ? row.facts
      : [
          'Exact recorded source is missing or changed. No completion, resolution or replacement is inferred.',
        ],
    authority: 'HUMAN_REVIEW_NAVIGATION_ONLY' as const,
    operational_authority: false as const,
    limits:
      'Current source verification permits only its original review destination. Missing evidence stays independent; no completion, contract approval, posting, dispatch, payment or sending is authorized.',
  });
}
/** Literal filtering of the original current authorized rows only. It never
 * selects, ranks, resolves an ID or extends the original action authority. */
export function filterOwnerActionSources(
  view: VerifiedOwnerBriefingRead,
  input: { query: string },
) {
  assertVerifiedOwnerBriefingCurrent(view);
  const p = prototypeFields(input, ['query']);
  if (
    Object.keys(p).length !== 1 ||
    typeof p.query !== 'string' ||
    p.query.length > 200
  )
    throw Error('Bounded literal original-priority query required');
  const query = p.query.trim().toLowerCase();
  const rows = view.rows.filter(
    (row) =>
      !query ||
      [
        row.key,
        row.source.kind,
        row.source.id,
        row.recorded_fact,
        row.suggested_human_review,
        ...row.facts,
        ...row.order_reasons,
        ...row.missing_evidence.map((r) => `${r.code} ${r.status} ${r.detail}`),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
  );
  assertVerifiedOwnerBriefingCurrent(view);
  return freezePrototype({
    rows,
    matching: rows.length,
    available: view.rows.length,
    meaning:
      'LITERAL_PRESENTATION_NOT_SELECTION_RANKING_OR_AUTHORIZATION' as const,
  });
}
/** Compare two explicit original reads. This has no independent reader, ranking,
 * registry, custody, or restored-state authority. Retention is presentation only. */
export function compareOwnerActionRefresh(
  before: VerifiedOwnerBriefingRead,
  current: VerifiedOwnerBriefingRead,
  selection?: OwnerActionSelection,
) {
  const comparison = compareVerifiedOwnerBriefing(before, current);
  let status:
    | 'NO_PREVIOUS_SELECTION'
    | 'UNCHANGED_REVERIFY_REQUIRED'
    | 'SOURCE_CHANGED_RESELECT_REQUIRED'
    | 'UNKNOWN_SOURCE_MISSING' = 'NO_PREVIOUS_SELECTION';
  let retained: OwnerActionSelection | null = null;
  if (selection !== undefined) {
    const p = prototypeFields(selection, [
      'key',
      'kind',
      'id',
      'revision',
      'version',
    ]);
    if (
      Object.keys(p).length !== 5 ||
      typeof p.key !== 'string' ||
      p.key.length > 700 ||
      typeof p.kind !== 'string' ||
      typeof p.id !== 'string' ||
      p.id.length > 200 ||
      ![p.revision, p.version].every(
        (v) => v === null || (Number.isSafeInteger(v) && (v as number) > 0),
      )
    )
      throw Error('Exact previous owner action selection required');
    const previous = before.rows.filter((row) => row.key === p.key);
    const rows = current.rows.filter((row) => row.key === p.key);
    const old = previous.length === 1 ? previous[0] : undefined;
    const row = rows.length === 1 ? rows[0] : undefined;
    if (
      !old ||
      old.source.kind !== p.kind ||
      old.source.id !== p.id ||
      old.source.revision !== p.revision ||
      old.source.version !== p.version
    )
      throw Error('Exact original previous selection required');
    const difference = comparison.rows.filter((item) => item.key === p.key);
    // A global original-card hash can change after an unrelated canonical edit.
    // Only the identical selected current row can retain presentation context;
    // the original comparison remains unchanged and every action is reverified.
    const unchanged =
      row &&
      difference.length === 1 &&
      row.state !== 'UNKNOWN_SOURCE_UNAVAILABLE' &&
      JSON.stringify(old) === JSON.stringify(row);
    status = !row
      ? 'UNKNOWN_SOURCE_MISSING'
      : unchanged
        ? 'UNCHANGED_REVERIFY_REQUIRED'
        : 'SOURCE_CHANGED_RESELECT_REQUIRED';
    if (unchanged) retained = { key: row.key, ...row.source };
  }
  assertVerifiedOwnerBriefingCurrent(current);
  return freezePrototype({
    comparison,
    selection: retained,
    status,
    requires_verification: true as const,
    previous_confirmation_retained: false as const,
    meaning:
      'EXPLICIT_READ_COMPARISON_NOT_ACTION_RENEWAL_OR_COMPLETION' as const,
    operational_authority: false as const,
  });
}
export type OwnerActionRefresh = ReturnType<typeof compareOwnerActionRefresh>;
export async function verifyOwnerActionRequirements(
  view: VerifiedOwnerBriefingRead,
  selection: OwnerActionSelection,
) {
  const checked = checkOwnerActionRequirements(view, selection);
  if (!checked.can_open_original || !checked.row)
    return freezePrototype({ ...checked, inspection: null });
  const selected = checked.row,
    inspection = await inspectVerifiedOwnerPriority(view, selected.key),
    current = checkOwnerActionRequirements(view, selection);
  if (
    !current.can_open_original ||
    current.row !== selected ||
    inspection.key !== selected.key ||
    inspection.source.kind !== selected.source.kind ||
    inspection.source.id !== selected.source.id ||
    inspection.source.revision !== selected.source.revision ||
    inspection.source.version !== selected.source.version
  )
    throw Error('Original owner source changed during verification');
  return freezePrototype({ ...current, inspection });
}
export type OwnerActionVerificationResult = Awaited<
  ReturnType<typeof verifyOwnerActionRequirements>
>;
export async function continueVerifiedOwnerAction(
  view: VerifiedOwnerBriefingRead,
  selection: OwnerActionSelection,
  inspection: NonNullable<OwnerActionVerificationResult['inspection']>,
  confirmed: boolean,
  ...args: Parameters<typeof continueVerifiedOwnerPriority> extends [
    unknown,
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) {
  if (confirmed !== true)
    return {
      status: 'WITHHELD_NO_DISPATCH' as const,
      replay: 'FORBIDDEN' as const,
    };
  try {
    const current = checkOwnerActionRequirements(view, selection);
    if (
      !current.can_open_original ||
      !current.row ||
      inspection.key !== current.row.key ||
      inspection.source.kind !== current.row.source.kind ||
      inspection.source.id !== current.row.source.id ||
      inspection.source.revision !== current.row.source.revision ||
      inspection.source.version !== current.row.source.version
    )
      return {
        status: 'WITHHELD_NO_DISPATCH' as const,
        replay: 'FORBIDDEN' as const,
      };
    return await continueVerifiedOwnerPriority(view, inspection, ...args);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
}
