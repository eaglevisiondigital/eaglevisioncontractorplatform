import { Temporal } from '@js-temporal/polyfill';
import {
  readGrowthReminderReview,
  type ReminderWindow,
} from '../growth-reminders';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission, LocalJourney } from './journey-runtime';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  readSavedRevision,
  compareSavedRevisions,
  assertSavedRevisionCurrent,
  adoptSavedRevision,
  type SavedRevisionSelection,
  type SavedRevisionSnapshot,
} from './saved-revision-runtime';
function window(input: ReminderWindow) {
  const p = prototypeFields(input, ['from', 'through', 'as_of', 'channel']);
  if (
    Object.keys(p).length !== 4 ||
    ['from', 'through', 'as_of'].some((k) => typeof p[k] !== 'string') ||
    !['email', 'sms'].includes(p.channel as string)
  )
    throw Error('Exact primitive maintenance window required');
  return p as unknown as ReminderWindow;
}

// Private read-reference fences only, never maintenance or contact business records.
const bindings = new WeakMap<
  object,
  {
    entry: LocalJourney;
    window: ReminderWindow;
    followups: string;
    contact: string;
  }
>();
function followups(entry: LocalJourney) {
  const t = entry.target,
    plans = entry.property
      .read(t.organization_id)
      .plans.filter((p) => p.job_id === t.job_id);
  return entry.property
    .maintenance(t.organization_id, t.actor_id)
    .items.filter((i) => i.job_id === t.job_id)
    .map((i) => {
      if (
        i.source.organization_id !== t.organization_id ||
        i.source.customer_id !== t.customer_id ||
        i.source.location_id !== t.location_id ||
        !plans.some((p) => p.id === i.plan_id)
      )
        throw Error('Exact follow-up property source required');
      return {
        id: i.key,
        source: i.source,
        plan_id: i.plan_id,
        revision: i.record.revision,
        priority: i.record.priority,
        review: i.record.review,
        follow_up_on: i.record.follow_up_on,
        scheduled_visit_id: i.record.scheduled_visit_id,
        status: i.status,
      };
    });
}
export function assertMaintenanceSavedRevisionCurrent(
  snapshot: SavedRevisionSnapshot<unknown>,
) {
  assertSavedRevisionCurrent(snapshot);
  const b = bindings.get(snapshot);
  if (!b || JSON.stringify(followups(b.entry)) !== b.followups)
    throw Error('Saved follow-up evidence changed');
  assertSavedRevisionCurrent(snapshot);
}
/** Original async contact reader plus final synchronous maintenance/source fences.
 * Captured contact evidence is not an atomic consent-at-send or operational grant. */
export async function verifyMaintenanceSavedRevisionCurrent(
  snapshot: SavedRevisionSnapshot<unknown>,
) {
  assertMaintenanceSavedRevisionCurrent(snapshot);
  const b = bindings.get(snapshot)!,
    t = b.entry.target;
  const result = await readGrowthReminderReview(
    b.entry.property,
    {
      organization_id: t.organization_id,
      customer_id: t.customer_id,
      location_id: t.location_id,
    },
    t.actor_id,
    b.window,
    { enabled: true },
  );
  assertMaintenanceSavedRevisionCurrent(snapshot);
  if (JSON.stringify(result.consent) !== b.contact)
    throw Error('Recorded channel evidence changed; exact new read required');
  return { status: 'CAPTURED_NOT_ATOMIC' as const, send: false as const };
}

/** Recurrence and contact facts remain owned by original property/consent readers. No renewal or message engine. */
export async function readMaintenanceSavedRevision(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
  input?: ReminderWindow,
) {
  let bound:
    | {
        entry: LocalJourney;
        window: ReminderWindow;
        followups: string;
        contact: string;
        consent_source: string;
      }
    | undefined;
  const snapshot = await readSavedRevision(
    sources,
    jobId,
    'maintenance',
    gate,
    async (entry) => {
      const t = entry.target,
        requested = input
          ? window(input)
          : {
              from: entry.day,
              through: Temporal.PlainDate.from(entry.day)
                .add({ days: 28 })
                .toString(),
              as_of: entry.day + 'T12:00:00Z',
              channel: 'email' as const,
            },
        signature = JSON.stringify(requested),
        consent_source = JSON.stringify(
          entry.operations.syntheticContactConsentSources(
            t.organization_id,
            t.customer_id,
            t.actor_id,
          ),
        );
      const result = await readGrowthReminderReview(
        entry.property,
        {
          organization_id: t.organization_id,
          customer_id: t.customer_id,
          location_id: t.location_id,
        },
        t.actor_id,
        requested,
        {
          enabled: true,
          eligibility: {
            enabled: true,
            confirmed: true,
            lead_days: 14,
            overdue_days: 7,
          },
        },
      );
      if (input && JSON.stringify(window(input)) !== signature)
        throw Error('Maintenance review window changed');
      const state = entry.property.read(t.organization_id),
        plans = state.plans.filter((p) => p.job_id === t.job_id);
      if (
        plans.some(
          (p) =>
            p.organization_id !== t.organization_id ||
            p.customer_id !== t.customer_id ||
            p.location_id !== t.location_id,
        ) ||
        new Set(plans.map((p) => p.id)).size !== plans.length
      )
        throw Error('Exact maintenance plan ownership required');
      const candidates = result.candidates.filter((c) =>
        plans.some((p) => p.id === c.source.plan_id),
      );
      for (const c of candidates)
        if (
          !plans.some(
            (p) =>
              p.id === c.source.plan_id &&
              p.revision === c.source.plan_revision,
          )
        )
          throw Error('Exact current occurrence plan revision required');
      const savedFollowups = followups(entry);
      bound = {
        entry,
        window: requested,
        followups: JSON.stringify(savedFollowups),
        contact: JSON.stringify(result.consent),
        consent_source,
      };
      const canonical = entry.estimates.readSyntheticPrototypeSources(t);
      return {
        title: canonical.job!.name,
        window: requested,
        plans: plans.map((p) => ({
          id: p.id,
          revision: p.revision,
          name: p.name,
          cadence: p.cadence,
          interval_days: p.interval_days,
          starts_on: p.starts_on,
          timezone: p.timezone,
        })),
        followups: savedFollowups,
        occurrences: candidates.map((c) => ({
          id: c.key,
          kind: c.kind,
          due_on: c.due_on,
          timezone: c.timezone,
          timing: c.timing,
          source: c.source,
          planning_status:
            result.eligibility_review?.items.find(
              (r) => r.candidate_key === c.key,
            )?.planning_status ?? 'UNKNOWN',
        })),
        recorded_channel: {
          channel: requested.channel,
          state: result.consent.observed_channel_state,
          reference: result.consent.reference,
        },
        source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
        purpose_consent: 'UNVERIFIED' as const,
        suppression: 'UNVERIFIED' as const,
        enrollment: 'UNVERIFIED' as const,
        renewal_terms: 'UNKNOWN' as const,
        coverage: result.coverage,
        count_is_complete: false as const,
        physical_completion: 'UNVERIFIED' as const,
        authority: {
          send: false,
          provider: false,
          outbox: false,
          enroll: false,
          renew: false,
          schedule: false,
          write: false,
          financial: false,
        },
        recipient: null,
        provider_request: null,
      };
    },
    () => {
      if (!bound) throw Error('Original saved maintenance fence required');
      const t = bound.entry.target;
      if (
        JSON.stringify(followups(bound.entry)) !== bound.followups ||
        JSON.stringify(
          bound.entry.operations.syntheticContactConsentSources(
            t.organization_id,
            t.customer_id,
            t.actor_id,
          ),
        ) !== bound.consent_source
      )
        throw Error('Saved maintenance or recorded contact source changed');
    },
  );
  if (!bound) throw Error('Original maintenance read binding required');
  bindings.set(snapshot, bound);
  await verifyMaintenanceSavedRevisionCurrent(snapshot);
  return snapshot;
}
export type MaintenanceSavedSnapshot = Awaited<
  ReturnType<typeof readMaintenanceSavedRevision>
>;
export type MaintenanceSavedEvidence = MaintenanceSavedSnapshot['evidence'];
function changes<T extends { readonly id: string }>(
  before: readonly T[],
  current: readonly T[],
) {
  if (
    new Set(before.map((r) => r.id)).size !== before.length ||
    new Set(current.map((r) => r.id)).size !== current.length
  )
    throw Error('Unambiguous exact maintenance identities required');
  return [
    ...new Set([...before.map((r) => r.id), ...current.map((r) => r.id)]),
  ].map((id) => {
    const a = before.find((r) => r.id === id) ?? null,
      b = current.find((r) => r.id === id) ?? null;
    return {
      id,
      state: !a
        ? ('ADDED' as const)
        : !b
          ? ('NOT_PRESENT_IN_CURRENT_READ' as const)
          : JSON.stringify(a) === JSON.stringify(b)
            ? ('UNCHANGED' as const)
            : ('MODIFIED' as const),
      before: a,
      current: b,
    };
  });
}
export function compareMaintenanceSavedRevisions(
  before: SavedRevisionSnapshot<MaintenanceSavedEvidence>,
  current: SavedRevisionSnapshot<MaintenanceSavedEvidence>,
) {
  const comparison = compareSavedRevisions(before, current);
  assertMaintenanceSavedRevisionCurrent(current);
  if (
    before.kind !== 'maintenance' ||
    current.kind !== 'maintenance' ||
    JSON.stringify(before.evidence.window) !==
      JSON.stringify(current.evidence.window)
  )
    throw Error('Same exact maintenance source and review window required');
  return Object.freeze({
    comparison,
    differences: freezePrototype({
      plans: changes(before.evidence.plans, current.evidence.plans),
      followups: changes(before.evidence.followups, current.evidence.followups),
      occurrences: changes(
        before.evidence.occurrences,
        current.evidence.occurrences,
      ),
      recorded_channel_changed:
        JSON.stringify(before.evidence.recorded_channel) !==
        JSON.stringify(current.evidence.recorded_channel),
      meaning: 'OBSERVED_DIFFERENCES_ONLY' as const,
      send: 'BLOCKED' as const,
    }),
  });
}

/** Domain freshness surrounds the unchanged shared opaque selection CAS. */
export async function adoptMaintenanceSavedRevision(
  selection: SavedRevisionSelection<MaintenanceSavedEvidence>,
  view: ReturnType<typeof compareMaintenanceSavedRevisions>,
  expectedGeneration: number,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error('Explicit maintenance revision confirmation required');
  await verifyMaintenanceSavedRevisionCurrent(view.comparison.current);
  assertMaintenanceSavedRevisionCurrent(view.comparison.current);
  return adoptSavedRevision(
    selection,
    view.comparison,
    expectedGeneration,
    confirmed,
  );
}
