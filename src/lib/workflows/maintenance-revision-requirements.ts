import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { freezePrototype } from '../program/prototype-source';
import {
  readMaintenanceRequirementsReview,
  inspectMaintenanceRequirements,
} from './maintenance-requirements-review';
import {
  readSavedRevision,
  assertSavedRevisionCurrent,
  compareSavedRevisions,
} from './saved-revision-runtime';

/** One source-bound review over the original plan/occurrence/renewal readers.
 * No plan writer, consent resolver, sender or new attempt owner exists here. */
export async function readMaintenanceRevisionRequirements(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const original = await readMaintenanceRequirementsReview(
      sources,
      jobId,
      gate,
    ),
    data = inspectMaintenanceRequirements(original);
  const rows = data.occurrences.map((row) => {
    if (
      row.source.plan_id !== data.plan.id ||
      row.source.plan_revision !== data.plan.revision
    )
      throw Error('Exact current occurrence plan revision required');
    const visits = row.exact_visits;
    if (
      new Set(visits.map((v) => v.id)).size !== visits.length ||
      visits.some((v) => v.plan_id !== data.plan.id || v.on !== row.due_on)
    )
      throw Error('Unambiguous exact occurrence visits required');
    return {
      ...row,
      visit_consistency:
        visits.length > 1
          ? ('MULTIPLE_EXACT_VISITS' as const)
          : visits.length === 1
            ? ('EXACT_VISIT_OBSERVED' as const)
            : ('NO_EXACT_VISIT_OBSERVED' as const),
      review_reasons: [
        ...(visits.length > 1 ? ['REVIEW_MULTIPLE_VISIT_IDS'] : []),
        ...(data.recorded_channel.state === 'RECORDED_DENIED'
          ? ['RECORDED_CHANNEL_DENIED']
          : []),
        ...(data.receipt.state === 'UNKNOWN' ? ['ORIGINAL_UNKNOWN_HELD'] : []),
        ...(data.receipt.state === 'PENDING'
          ? ['ORIGINAL_ATTEMPT_PENDING']
          : []),
        ...(data.receipt.state === 'KNOWN_SAVED' &&
        data.receipt.observed !== 'EXACT_RESULT_OBSERVED'
          ? ['CURRENT_REVISION_NOT_ATTRIBUTED_TO_RECEIPT']
          : []),
      ],
    };
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error('Unique exact occurrence identities required');
  return readSavedRevision(
    sources,
    jobId,
    'maintenance',
    gate,
    () => ({
      plan: data.plan,
      window: data.window,
      receipt: data.receipt,
      recorded_channel: data.recorded_channel,
      occurrences: rows,
      requirements: data.requirements,
      coverage: data.coverage,
      count_is_complete: false as const,
      source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
      physical_completion: 'UNVERIFIED' as const,
      send: false as const,
      renew: false as const,
      schedule: false as const,
      bill: false as const,
      replay: 'FORBIDDEN' as const,
    }),
    () => {
      inspectMaintenanceRequirements(original);
    },
  );
}
export type MaintenanceRevisionSnapshot = Awaited<
  ReturnType<typeof readMaintenanceRevisionRequirements>
>;
export function inspectMaintenanceRevisionRequirements(
  snapshot: MaintenanceRevisionSnapshot,
) {
  assertSavedRevisionCurrent(snapshot);
  return snapshot.evidence;
}
function exactId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4000 ||
    value !== value.trim()
  )
    throw Error('Exact occurrence ID required');
  return value;
}
/** Exact immutable occurrence identity, never date/index/wording fallback. */
export function selectMaintenanceRevisionRequirements(
  snapshot: MaintenanceRevisionSnapshot,
  occurrenceId: string,
) {
  const data = inspectMaintenanceRevisionRequirements(snapshot),
    selected = data.occurrences.find((r) => r.id === exactId(occurrenceId));
  if (!selected)
    throw Error('Selected exact occurrence unavailable; no replacement');
  const receipt = data.receipt;
  const checks = [
    {
      requirement: 'Exact current plan revision',
      state: 'RECORDED' as const,
      reference: `${data.plan.id} / ${data.plan.revision}`,
    },
    {
      requirement: 'Original correction receipt',
      state:
        receipt.state === 'UNKNOWN' || receipt.state === 'PENDING'
          ? ('BLOCKED' as const)
          : receipt.observed === 'EXACT_RESULT_OBSERVED'
            ? ('RECORDED' as const)
            : ('UNKNOWN' as const),
      reference: `${receipt.state} / ${receipt.observed}`,
    },
    {
      requirement: 'Exact visit relationship',
      state:
        selected.exact_visits.length === 1
          ? ('RECORDED' as const)
          : selected.exact_visits.length > 1
            ? ('BLOCKED' as const)
            : ('UNKNOWN' as const),
      reference:
        selected.exact_visits.map((v) => v.id).join(', ') ||
        'NO_EXACT_VISIT_OBSERVED',
    },
    {
      requirement: 'Recorded channel preference',
      state:
        data.recorded_channel.state === 'RECORDED_DENIED'
          ? ('BLOCKED' as const)
          : data.recorded_channel.state === 'RECORDED_ALLOWED'
            ? ('RECORDED' as const)
            : ('UNKNOWN' as const),
      reference: data.recorded_channel.reference?.id ?? 'UNAVAILABLE',
    },
    ...(
      [
        'purpose_consent',
        'suppression',
        'enrollment',
        'renewal_terms',
        'sender_authority',
      ] as const
    ).map((requirement) => ({
      requirement,
      state: 'UNKNOWN' as const,
      reference: data.requirements[requirement],
    })),
    {
      requirement: 'Atomic current consent/revocation boundary',
      state: 'BLOCKED' as const,
      reference: data.source_atomicity,
    },
  ];
  return freezePrototype({
    selected,
    checks,
    missing_or_blocked: checks
      .filter((c) => c.state !== 'RECORDED')
      .map((c) => c.requirement),
    authority: 'BLOCKED' as const,
    renewal_agreement_id: null,
    recipient: null,
    send: false as const,
    renew: false as const,
    replay: 'FORBIDDEN' as const,
  });
}
/** Retained same-session reference only. A changed source does not relocate the
 * selection to an occurrence with a similar date, ordinal or description. */
export function compareMaintenanceOccurrenceContinuity(
  before: MaintenanceRevisionSnapshot,
  current: MaintenanceRevisionSnapshot,
  occurrenceId: string,
) {
  compareSavedRevisions(before, current);
  const id = exactId(occurrenceId),
    old = before.evidence.occurrences.find((r) => r.id === id),
    next = current.evidence.occurrences.find((r) => r.id === id);
  if (!old || before.evidence.plan.id !== current.evidence.plan.id)
    throw Error('Exact original plan and selected occurrence required');
  return freezePrototype({
    occurrence_id: id,
    previous_plan_revision: old.source.plan_revision,
    current_plan_revision: current.evidence.plan.revision,
    continuity: next
      ? ('EXACT_ID_RETAINED' as const)
      : ('NOT_IN_CURRENT_REVIEW' as const),
    source_replaced: false as const,
    completion: 'UNVERIFIED' as const,
    contact_reference_changed:
      JSON.stringify(before.evidence.recorded_channel) !==
      JSON.stringify(current.evidence.recorded_channel),
    original_receipt_state: current.evidence.receipt.state,
    replay: 'FORBIDDEN' as const,
    send: false as const,
  });
}
export function maintenanceRevisionDestination(
  snapshot: MaintenanceRevisionSnapshot,
  occurrenceId: string,
) {
  selectMaintenanceRevisionRequirements(snapshot, occurrenceId);
  return { job_id: snapshot.identity.job_id, step: 'maintenance' as const };
}
