import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  assertVerifiedOwnerBriefingCurrent,
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
export async function verifyOwnerActionRequirements(
  view: VerifiedOwnerBriefingRead,
  selection: OwnerActionSelection,
) {
  const checked = checkOwnerActionRequirements(view, selection);
  if (!checked.can_open_original)
    return freezePrototype({ ...checked, inspection: null });
  const inspection = await inspectVerifiedOwnerPriority(view, selection.key),
    current = checkOwnerActionRequirements(view, selection);
  if (
    !current.can_open_original ||
    inspection.key !== selection.key ||
    inspection.source.kind !== selection.kind ||
    inspection.source.id !== selection.id ||
    inspection.source.revision !== selection.revision ||
    inspection.source.version !== selection.version
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
      inspection.key !== selection.key ||
      inspection.source.kind !== selection.kind ||
      inspection.source.id !== selection.id ||
      inspection.source.revision !== selection.revision ||
      inspection.source.version !== selection.version
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
