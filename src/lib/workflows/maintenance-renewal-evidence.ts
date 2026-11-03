import { Temporal } from '@js-temporal/polyfill';
import { occurrence } from '../../domain/property/inspections';
import {
  readMaintenanceSavedRevision,
  assertMaintenanceSavedRevisionCurrent,
  verifyMaintenanceSavedRevisionCurrent,
  type MaintenanceSavedEvidence,
} from './maintenance-saved-revisions';
import { readMaintenanceRenewalPlanning } from '../maintenance-renewal-planning';
import {
  evidenceFields,
  evidenceText,
  evidenceNumber,
  evidenceList,
  evidenceLiteral,
  type EvidenceRecipe,
  type EvidenceIdentity,
} from './saved-evidence-runtime';
import type { SavedRevisionSnapshot } from './saved-revision-runtime';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
type Renewal = Awaited<
  ReturnType<typeof readMaintenanceRenewalPlanning>
>['candidates'][number];
export interface MaintenanceRenewalEvidence {
  saved: MaintenanceSavedEvidence;
  renewal: readonly Renewal[];
}
const extra = new WeakMap<object, readonly Renewal[]>();
const references = new WeakMap<
  object,
  {
    contacts: {
      id: string;
      recorded_at: string;
      policy: string;
      allowed: boolean;
    }[];
    visits: {
      id: string;
      plan_id: string;
      revision: number;
      on: string;
      status: string;
      phase: string;
    }[];
  }
>();
const id = (v: unknown, max = 2000) => {
  const s = evidenceText(v, max);
  if (!s || s !== s.trim()) throw Error('Exact maintenance identity required');
  return s;
};
const bool = (v: unknown) => {
  if (typeof v !== 'boolean') throw Error('Recorded boolean required');
  return v;
};
function choice<const T extends string>(v: unknown, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T))
    throw Error('Exact maintenance enum required');
  return v as T;
}
function day(v: unknown) {
  const s = evidenceText(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Temporal.PlainDate.from(s, { overflow: 'reject' }).toString() !== s
  )
    throw Error('Exact maintenance day required');
  return s;
}
function instant(v: unknown) {
  const s = evidenceText(v, 100);
  Temporal.Instant.from(s);
  return s;
}
function timezone(v: unknown) {
  const s = id(v, 100);
  Temporal.Now.zonedDateTimeISO(s);
  return s;
}
function unique<T extends { id: string }>(rows: T[]) {
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error('Duplicate maintenance identity');
  return rows;
}
function channel(value: unknown) {
  if (value === null) return null;
  const c = evidenceFields(value, ['id', 'recorded_at', 'policy']);
  return {
    id: id(c.id, 200),
    recorded_at: instant(c.recorded_at),
    policy: evidenceLiteral(c.policy, 'contact-v1'),
  };
}
function occurrenceSource(value: unknown) {
  const s = evidenceFields(value, [
    'plan_id',
    'plan_revision',
    'occurrence_index',
    'report_id',
    'report_version',
    'finding_id',
    'maintenance_revision',
  ]);
  return {
    plan_id: id(s.plan_id, 200),
    plan_revision: evidenceNumber(s.plan_revision, 1),
    occurrence_index:
      s.occurrence_index === null ? null : evidenceNumber(s.occurrence_index),
    report_id: s.report_id === null ? null : id(s.report_id, 200),
    report_version:
      s.report_version === null ? null : evidenceNumber(s.report_version, 1),
    finding_id: s.finding_id === null ? null : id(s.finding_id, 100),
    maintenance_revision:
      s.maintenance_revision === null
        ? null
        : evidenceNumber(s.maintenance_revision),
  };
}
const statuses = [
  'UNKNOWN',
  'CHANNEL_DENIED',
  'EXACT_VISIT_RECORDED',
  'OUTSIDE_REVIEW_WINDOW',
  'STAFF_REVIEW_CANDIDATE',
] as const;
function saved(
  value: unknown,
  identity?: EvidenceIdentity,
): MaintenanceSavedEvidence {
  const f = evidenceFields(value, [
    'title',
    'window',
    'plans',
    'followups',
    'occurrences',
    'recorded_channel',
    'source_atomicity',
    'purpose_consent',
    'suppression',
    'enrollment',
    'renewal_terms',
    'coverage',
    'count_is_complete',
    'physical_completion',
    'authority',
    'recipient',
    'provider_request',
  ]);
  const w = evidenceFields(f.window, ['from', 'through', 'as_of', 'channel']),
    window = {
      from: day(w.from),
      through: day(w.through),
      as_of: instant(w.as_of),
      channel: choice(w.channel, ['email', 'sms'] as const),
    };
  if (
    window.from > window.through ||
    Temporal.PlainDate.from(window.from).until(window.through).days > 93
  )
    throw Error('Bounded exact review window required');
  const plans = unique(
    evidenceList(f.plans, 100).map((v) => {
      const p = evidenceFields(v, [
        'id',
        'revision',
        'name',
        'cadence',
        'interval_days',
        'starts_on',
        'timezone',
      ]);
      const row = {
        id: id(p.id, 200),
        revision: evidenceNumber(p.revision, 1),
        name: evidenceText(p.name, 200),
        cadence: choice(p.cadence, [
          'once',
          'weekly',
          'monthly',
          'custom',
        ] as const),
        interval_days: evidenceNumber(p.interval_days, 1),
        starts_on: day(p.starts_on),
        timezone: timezone(p.timezone),
      };
      if (row.interval_days > 365) throw Error('Bounded cadence required');
      return row;
    }),
  );
  const followups = unique(
    evidenceList(f.followups, 1000).map((v) => {
      const p = evidenceFields(v, [
          'id',
          'source',
          'plan_id',
          'revision',
          'priority',
          'review',
          'follow_up_on',
          'scheduled_visit_id',
          'status',
        ]),
        s = evidenceFields(p.source, [
          'organization_id',
          'customer_id',
          'location_id',
          'report_id',
          'report_version',
          'finding_id',
        ]);
      const source = {
        organization_id: id(s.organization_id, 200),
        customer_id: id(s.customer_id, 200),
        location_id: id(s.location_id, 200),
        report_id: id(s.report_id, 200),
        report_version: evidenceNumber(s.report_version, 1),
        finding_id: id(s.finding_id, 100),
      };
      if (
        identity &&
        (source.organization_id !== identity.organization_id ||
          source.customer_id !== identity.customer_id ||
          source.location_id !== identity.location_id)
      )
        throw Error('Exact follow-up ownership required');
      const row = {
        id: id(p.id),
        source,
        plan_id: id(p.plan_id, 200),
        revision: evidenceNumber(p.revision),
        priority: choice(p.priority, [
          'low',
          'normal',
          'high',
          'urgent',
        ] as const),
        review: choice(p.review, ['pending', 'reviewed'] as const),
        follow_up_on: p.follow_up_on === '' ? '' : day(p.follow_up_on),
        scheduled_visit_id:
          p.scheduled_visit_id === null ? null : id(p.scheduled_visit_id, 200),
        status: choice(p.status, ['pending', 'scheduled', 'reviewed'] as const),
      };
      if (!plans.some((p) => p.id === row.plan_id))
        throw Error('Exact follow-up plan unavailable');
      return row;
    }),
  );
  const occurrences = unique(
    evidenceList(f.occurrences, 1000).map((v) => {
      const o = evidenceFields(v, [
        'id',
        'kind',
        'due_on',
        'timezone',
        'timing',
        'source',
        'planning_status',
      ]);
      const row = {
        id: id(o.id),
        kind: choice(o.kind, [
          'inspection_occurrence',
          'staff_follow_up',
        ] as const),
        due_on: day(o.due_on),
        timezone: timezone(o.timezone),
        timing: choice(o.timing, ['overdue', 'today', 'upcoming'] as const),
        source: occurrenceSource(o.source),
        planning_status: choice(o.planning_status, statuses),
      };
      const p = plans.find(
        (p) =>
          p.id === row.source.plan_id &&
          p.revision === row.source.plan_revision,
      );
      if (
        !p ||
        p.timezone !== row.timezone ||
        row.due_on < window.from ||
        row.due_on > window.through
      )
        throw Error('Exact anchored occurrence required');
      if (row.id !== JSON.stringify([row.kind, row.source, row.due_on]))
        throw Error('Original occurrence identity required');
      if (row.kind === 'inspection_occurrence') {
        if (
          row.source.occurrence_index === null ||
          row.source.report_id !== null ||
          row.source.report_version !== null ||
          row.source.finding_id !== null ||
          row.source.maintenance_revision !== null
        )
          throw Error('Contradictory recurrence source');
        const expected = occurrence(p, row.source.occurrence_index);
        if (expected !== row.due_on)
          throw Error('Canonical cadence does not match occurrence');
      } else {
        if (
          row.source.occurrence_index !== null ||
          !followups.some(
            (x) =>
              x.plan_id === row.source.plan_id &&
              x.source.report_id === row.source.report_id &&
              x.source.report_version === row.source.report_version &&
              x.source.finding_id === row.source.finding_id &&
              x.revision === row.source.maintenance_revision &&
              x.follow_up_on === row.due_on,
          )
        )
          throw Error('Exact saved follow-up occurrence required');
      }
      return row;
    }),
  );
  const c = evidenceFields(f.recorded_channel, [
      'channel',
      'state',
      'reference',
    ]),
    recorded_channel = {
      channel: choice(c.channel, ['email', 'sms'] as const),
      state: choice(c.state, [
        'UNKNOWN',
        'RECORDED_ALLOWED',
        'RECORDED_DENIED',
      ] as const),
      reference: channel(c.reference),
    };
  if (
    recorded_channel.channel !== window.channel ||
    (recorded_channel.state === 'UNKNOWN') !==
      (recorded_channel.reference === null)
  )
    throw Error('Exact contact evidence required');
  const a = evidenceFields(f.authority, [
    'send',
    'provider',
    'outbox',
    'enroll',
    'renew',
    'schedule',
    'write',
    'financial',
  ]);
  return {
    title: evidenceText(f.title, 500),
    window,
    plans,
    followups,
    occurrences,
    recorded_channel,
    source_atomicity: evidenceLiteral(
      f.source_atomicity,
      'CAPTURED_NOT_ATOMIC',
    ),
    purpose_consent: evidenceLiteral(f.purpose_consent, 'UNVERIFIED'),
    suppression: evidenceLiteral(f.suppression, 'UNVERIFIED'),
    enrollment: evidenceLiteral(f.enrollment, 'UNVERIFIED'),
    renewal_terms: evidenceLiteral(f.renewal_terms, 'UNKNOWN'),
    coverage: evidenceLiteral(f.coverage, 'AVAILABLE_LOCAL_SOURCES_ONLY'),
    count_is_complete: evidenceLiteral(f.count_is_complete, false),
    physical_completion: evidenceLiteral(f.physical_completion, 'UNVERIFIED'),
    authority: {
      send: evidenceLiteral(a.send, false),
      provider: evidenceLiteral(a.provider, false),
      outbox: evidenceLiteral(a.outbox, false),
      enroll: evidenceLiteral(a.enroll, false),
      renew: evidenceLiteral(a.renew, false),
      schedule: evidenceLiteral(a.schedule, false),
      write: evidenceLiteral(a.write, false),
      financial: evidenceLiteral(a.financial, false),
    },
    recipient: evidenceLiteral(f.recipient, null),
    provider_request: evidenceLiteral(f.provider_request, null),
  };
}
export function parseMaintenanceRenewalEvidence(
  value: unknown,
  identity?: EvidenceIdentity,
): MaintenanceRenewalEvidence {
  const root = evidenceFields(value, ['saved', 'renewal']),
    s = saved(root.saved, identity);
  const renewal = evidenceList(root.renewal, 1000).map((v) => {
    const r = evidenceFields(v, [
        'selection',
        'planning_status',
        'can_prepare_visit_proposal',
        'exact_visits',
        'channel_reference',
        'renewal_terms',
        'purpose_consent',
        'suppression',
        'recurring_enrollment',
        'sender_authority',
        'renewal_anchor',
        'agreement_id',
        'message_authority',
        'scheduling_authority',
        'billing_authority',
      ]),
      selection = evidenceFields(r.selection, [
        'candidate_key',
        'kind',
        'due_on',
        'timezone',
        'source',
      ]);
    const item = {
      candidate_key: id(selection.candidate_key),
      kind: choice(selection.kind, [
        'inspection_occurrence',
        'staff_follow_up',
      ] as const),
      due_on: day(selection.due_on),
      timezone: timezone(selection.timezone),
      source: occurrenceSource(selection.source),
    };
    if (
      !s.occurrences.some(
        (o) =>
          o.id === item.candidate_key &&
          o.kind === item.kind &&
          o.due_on === item.due_on &&
          o.timezone === item.timezone &&
          JSON.stringify(o.source) === JSON.stringify(item.source),
      )
    )
      throw Error('Renewal references exact original occurrence only');
    const visits = unique(
      evidenceList(r.exact_visits, 1000).map((value) => {
        const v = evidenceFields(value, [
          'id',
          'plan_id',
          'revision',
          'on',
          'status',
          'phase',
        ]);
        const row = {
          id: id(v.id, 200),
          plan_id: id(v.plan_id, 200),
          revision: evidenceNumber(v.revision, 1),
          on: day(v.on),
          status: choice(v.status, [
            'draft',
            'submitted',
            'published',
          ] as const),
          phase: choice(v.phase, ['before', 'during', 'after'] as const),
        };
        if (row.plan_id !== item.source.plan_id || row.on !== item.due_on)
          throw Error('Exact original visit required');
        return row;
      }),
    );
    const planning_status = choice(r.planning_status, statuses),
      can_prepare_visit_proposal = bool(r.can_prepare_visit_proposal);
    if (
      can_prepare_visit_proposal !==
      (planning_status === 'STAFF_REVIEW_CANDIDATE')
    )
      throw Error('Planning eligibility is not permission');
    return {
      selection: item,
      planning_status,
      can_prepare_visit_proposal,
      exact_visits: visits,
      channel_reference: channel(r.channel_reference),
      renewal_terms: evidenceLiteral(r.renewal_terms, 'UNKNOWN'),
      purpose_consent: evidenceLiteral(r.purpose_consent, 'UNVERIFIED'),
      suppression: evidenceLiteral(r.suppression, 'UNVERIFIED'),
      recurring_enrollment: evidenceLiteral(
        r.recurring_enrollment,
        'UNVERIFIED',
      ),
      sender_authority: evidenceLiteral(r.sender_authority, 'UNVERIFIED'),
      renewal_anchor: evidenceLiteral(r.renewal_anchor, null),
      agreement_id: evidenceLiteral(r.agreement_id, null),
      message_authority: evidenceLiteral(r.message_authority, 'BLOCKED'),
      scheduling_authority: evidenceLiteral(r.scheduling_authority, 'BLOCKED'),
      billing_authority: evidenceLiteral(r.billing_authority, 'BLOCKED'),
    };
  });
  if (
    new Set(renewal.map((r) => r.selection.candidate_key)).size !==
      renewal.length ||
    renewal.length !== s.occurrences.length
  )
    throw Error('Complete available same-job renewal evidence required');
  return { saved: s, renewal };
}
/** Retain original C19 binding; additional canonical planner data is only read-reference metadata. */
export async function readMaintenanceRenewalEvidence(
  sources: OperatingSources,
  job: string,
  gate: JourneyAdmission,
) {
  const snapshot = await readMaintenanceSavedRevision(sources, job, gate),
    t = snapshot.identity;
  const entry = sources.entries.find((e) => e.target.job_id === job)!;
  const result = await readMaintenanceRenewalPlanning(
    entry.property,
    {
      organization_id: t.organization_id,
      customer_id: t.customer_id,
      location_id: t.location_id,
    },
    t.actor_id,
    { ...snapshot.evidence.window },
    { enabled: true, confirmed: true, lead_days: 14, overdue_days: 7 },
  );
  assertMaintenanceSavedRevisionCurrent(snapshot);
  await verifyMaintenanceSavedRevisionCurrent(snapshot);
  assertMaintenanceSavedRevisionCurrent(snapshot);
  const rows = result.candidates.filter((r) =>
    snapshot.evidence.plans.some((p) => p.id === r.selection.source.plan_id),
  );
  extra.set(snapshot, rows);
  references.set(snapshot, {
    contacts: entry.operations
      .syntheticContactConsentSources(
        t.organization_id,
        t.customer_id,
        t.actor_id,
      )
      .map((c) => ({
        id: c.id,
        recorded_at: Temporal.Instant.from(c.recorded_at).toString(),
        policy: c.policy_version,
        allowed:
          snapshot.evidence.window.channel === 'email'
            ? c.email_allowed
            : c.sms_allowed,
      })),
    visits: entry.property
      .read(t.organization_id)
      .visits.filter((v) =>
        snapshot.evidence.plans.some((p) => p.id === v.plan_id),
      )
      .map((v) => ({
        id: v.id,
        plan_id: v.plan_id,
        revision: v.revision,
        on: v.visited_on,
        status: v.status,
        phase: v.phase,
      })),
  });
  assertMaintenanceSavedRevisionCurrent(snapshot);
  return snapshot;
}
export function projectMaintenanceRenewalEvidence(
  snapshot: SavedRevisionSnapshot<unknown>,
) {
  if (snapshot.kind !== 'maintenance' || !extra.has(snapshot))
    throw Error('Exact original renewal reader required');
  return parseMaintenanceRenewalEvidence(
    { saved: snapshot.evidence, renewal: extra.get(snapshot) },
    snapshot.identity,
  );
}
export function assertMaintenanceRenewalEvidenceSource(
  payload: MaintenanceRenewalEvidence,
  current: SavedRevisionSnapshot<unknown>,
) {
  const actual = projectMaintenanceRenewalEvidence(current),
    savedOld = payload.saved,
    savedNow = actual.saved;
  parseMaintenanceRenewalEvidence(payload, current.identity);
  const refs = references.get(current);
  if (!refs) throw Error('Exact current renewal references required');
  const contact = payload.saved.recorded_channel;
  if (
    contact.reference &&
    !refs.contacts.some(
      (c) =>
        c.id === contact.reference!.id &&
        c.recorded_at === contact.reference!.recorded_at &&
        c.policy === contact.reference!.policy &&
        (c.allowed ? 'RECORDED_ALLOWED' : 'RECORDED_DENIED') === contact.state,
    )
  )
    throw Error('Archived contact reference unavailable');
  for (const r of payload.renewal)
    for (const v of r.exact_visits) {
      const a = refs.visits.find(
        (a) => a.id === v.id && a.plan_id === v.plan_id && a.on === v.on,
      );
      if (
        !a ||
        v.revision > a.revision ||
        (v.revision === a.revision &&
          (v.status !== a.status || v.phase !== a.phase))
      )
        throw Error('Exact recorded renewal visit unavailable');
    }

  for (const p of savedOld.plans) {
    const a = savedNow.plans.find((a) => a.id === p.id);
    if (
      !a ||
      p.revision > a.revision ||
      (p.revision === a.revision && JSON.stringify(p) !== JSON.stringify(a))
    )
      throw Error('Archived maintenance plan source unavailable');
  }
  for (const p of savedOld.followups) {
    const a = savedNow.followups.find((a) => a.id === p.id);
    if (
      !a ||
      p.revision > a.revision ||
      JSON.stringify(p.source) !== JSON.stringify(a.source) ||
      p.plan_id !== a.plan_id ||
      (p.revision === a.revision && JSON.stringify(p) !== JSON.stringify(a))
    )
      throw Error('Exact saved published finding/follow-up unavailable');
  }
}
export const maintenanceRenewalEvidenceRecipe: EvidenceRecipe<MaintenanceRenewalEvidence> =
  Object.freeze({
    kind: 'maintenance',
    title: 'Maintenance renewal',
    read: readMaintenanceRenewalEvidence,
    project: projectMaintenanceRenewalEvidence,
    parse: parseMaintenanceRenewalEvidence,
    assertSource: assertMaintenanceRenewalEvidenceSource,
  });
