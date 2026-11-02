import { Temporal } from '@js-temporal/polyfill';
import { sampleCompanies } from '../domain/platform';
import { occurrence } from '../domain/property/inspections';
import { maintenanceDate } from '../domain/property/maintenance';
import type { ReportBoundary } from '../domain/property/report-page';
import { reportUuid } from '../domain/property/report-page';
import type { PropertyRepository } from './property';
import type { CustomerHistory } from './operations';

export interface ReminderWindow {
  from: string;
  through: string;
  as_of: string;
  channel: 'email' | 'sms';
}
export interface ReminderEligibilityPolicy {
  enabled?: boolean;
  confirmed: boolean;
  lead_days: number;
  overdue_days: number;
}
interface EligibilityVisit {
  id: string;
  plan_id: string;
  revision: number;
  on: string;
  status: 'draft' | 'submitted' | 'published';
  phase: 'before' | 'during' | 'after';
}
interface Candidate {
  key: string;
  kind: 'inspection_occurrence' | 'staff_follow_up';
  due_on: string;
  timezone: string;
  timing: 'overdue' | 'today' | 'upcoming';
  source: {
    plan_id: string;
    plan_revision: number;
    occurrence_index: number | null;
    report_id: string | null;
    report_version: number | null;
    finding_id: string | null;
    maintenance_revision: number | null;
  };
}
function frozen<T>(v: T): Readonly<T> {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(frozen);
    Object.freeze(v);
  }
  return v;
}
function checkedText(value: unknown, max = 100): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw Error('Invalid reminder source');
}
function revision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw Error('Invalid reminder source revision');
}
/** Planning facts only. contact-v1 does not establish purpose-specific reminder
 * consent, suppression, enrollment or sender authority. No network/send seam. */
export async function readGrowthReminderReview(
  repo: PropertyRepository,
  boundary: ReportBoundary,
  actor: string,
  query: ReminderWindow,
  admission: {
    enabled?: boolean;
    eligibility?: ReminderEligibilityPolicy;
  } = {},
) {
  const target = {
    organization_id: boundary.organization_id,
    customer_id: boundary.customer_id,
    location_id: boundary.location_id,
  };
  const window = {
    from: query.from,
    through: query.through,
    as_of: query.as_of,
    channel: query.channel,
  };
  function currentPolicy() {
    const descriptor = Object.getOwnPropertyDescriptor(
      admission,
      'eligibility',
    );
    if (!descriptor) return null;
    if (!('value' in descriptor))
      throw Error('Primitive eligibility review required');
    const value: unknown = descriptor.value;
    if (value === undefined) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Primitive eligibility review required');
    const field = (name: string) => {
      const d = Object.getOwnPropertyDescriptor(value, name);
      if (!d) return undefined;
      if (!('value' in d)) throw Error('Primitive eligibility review required');
      return d.value as unknown;
    };
    const enabled = field('enabled');
    if (enabled === undefined || enabled === false) return null;
    const confirmed = field('confirmed'),
      lead_days = field('lead_days'),
      overdue_days = field('overdue_days');
    if (
      enabled !== true ||
      confirmed !== true ||
      typeof lead_days !== 'number' ||
      !Number.isSafeInteger(lead_days) ||
      lead_days < 0 ||
      lead_days > 30 ||
      typeof overdue_days !== 'number' ||
      !Number.isSafeInteger(overdue_days) ||
      overdue_days < 0 ||
      overdue_days > 93
    )
      throw Error('Explicit bounded eligibility review required');
    return { confirmed, lead_days, overdue_days };
  }
  const policy = currentPolicy();
  maintenanceDate(window.from);
  maintenanceDate(window.through);
  if (
    window.from > window.through ||
    Temporal.PlainDate.from(window.from).until(window.through).days > 93 ||
    typeof window.as_of !== 'string' ||
    !['email', 'sms'].includes(window.channel)
  )
    throw Error('Invalid reminder window');
  const instant = Temporal.Instant.from(window.as_of);
  function authority() {
    if (policy) {
      let live: ReturnType<typeof currentPolicy>;
      try {
        live = currentPolicy();
      } catch {
        throw Error('Eligibility confirmation changed; reload review');
      }
      if (
        !live ||
        live.confirmed !== policy.confirmed ||
        live.lead_days !== policy.lead_days ||
        live.overdue_days !== policy.overdue_days
      )
        throw Error('Eligibility confirmation changed; reload review');
    }
    if (
      admission.enabled !== true ||
      !repo.operations.sample ||
      !sampleCompanies.some((c) => c.id === target.organization_id) ||
      !reportUuid(target.customer_id) ||
      !reportUuid(target.location_id) ||
      typeof actor !== 'string'
    )
      throw Error('Synthetic reminder review disabled');
    const member = repo.operations
      .syntheticMemberships(target.organization_id)
      .find(
        (m) =>
          m.organization_id === target.organization_id && m.user_id === actor,
      );
    if (!member || !member.active || !['owner', 'admin'].includes(member.role))
      throw Error('Reminder reviewer unavailable');
    repo.operations.syntheticProperty(
      target.organization_id,
      target.customer_id,
      target.location_id,
    );
  }
  function sources() {
    authority();
    const state = repo.read(target.organization_id);
    const plans = state.plans.filter((p) => {
      if (
        p.organization_id !== target.organization_id ||
        (p.location_id === target.location_id &&
          p.customer_id !== target.customer_id)
      )
        throw Error('Foreign reminder source');
      return (
        p.customer_id === target.customer_id &&
        p.location_id === target.location_id
      );
    });
    if (
      plans.length > 100 ||
      new Set(plans.map((p) => p.id)).size !== plans.length
    )
      throw Error('Ambiguous reminder plans');
    const rows: Candidate[] = [];
    let truncated = false;
    function add(row: Omit<Candidate, 'key' | 'timing'>) {
      if (row.due_on < window.from || row.due_on > window.through) return;
      if (rows.length >= 500) {
        truncated = true;
        return;
      }
      const today = instant
        .toZonedDateTimeISO(row.timezone)
        .toPlainDate()
        .toString();
      rows.push({
        ...row,
        key: JSON.stringify([row.kind, row.source, row.due_on]),
        timing:
          row.due_on < today
            ? 'overdue'
            : row.due_on === today
              ? 'today'
              : 'upcoming',
      });
    }
    for (const plan of plans) {
      if (
        !reportUuid(plan.id) ||
        typeof plan.cadence !== 'string' ||
        !['once', 'weekly', 'monthly', 'custom'].includes(plan.cadence)
      )
        throw Error('Invalid reminder plan');
      revision(plan.revision);
      if (plan.revision < 1) throw Error('Invalid reminder plan revision');
      checkedText(plan.timezone);
      maintenanceDate(plan.starts_on);
      // Use the existing anchored recurrence engine. Advance near the requested
      // date first, then enumerate only a bounded window (no polling/scheduler).
      const start = Temporal.PlainDate.from(plan.starts_on);
      const from = Temporal.PlainDate.from(window.from);
      let index =
        plan.cadence === 'monthly'
          ? Math.max(0, start.until(from, { largestUnit: 'month' }).months - 1)
          : plan.cadence === 'once'
            ? 0
            : Math.max(
                0,
                Math.floor(
                  start.until(from).days /
                    (plan.cadence === 'weekly' ? 7 : plan.interval_days),
                ) - 1,
              );
      for (let attempt = 0; attempt < 97; attempt++, index++) {
        const due = occurrence(plan, index);
        if (due === null || due > window.through) break;
        add({
          kind: 'inspection_occurrence',
          due_on: due,
          timezone: plan.timezone,
          source: {
            plan_id: plan.id,
            plan_revision: plan.revision,
            occurrence_index: index,
            report_id: null,
            report_version: null,
            finding_id: null,
            maintenance_revision: null,
          },
        });
      }
    }
    const maintenance = repo.maintenance(target.organization_id, actor).items;
    for (const item of maintenance) {
      const s = item.source;
      if (
        s.organization_id !== target.organization_id ||
        (s.location_id === target.location_id &&
          s.customer_id !== target.customer_id)
      )
        throw Error('Foreign follow-up source');
      if (
        s.location_id !== target.location_id ||
        s.customer_id !== target.customer_id ||
        !item.record.follow_up_on
      )
        continue;
      const plan = plans.find((p) => p.id === item.plan_id);
      if (!plan || !reportUuid(s.report_id))
        throw Error('Exact follow-up source unavailable');
      revision(s.report_version);
      if (s.report_version < 1) throw Error('Invalid report version');
      revision(item.record.revision);
      checkedText(s.finding_id);
      maintenanceDate(item.record.follow_up_on);
      // A retained scheduled visit supersedes this reminder candidate. It proves
      // neither customer delivery nor physical work/completion.
      if (item.record.scheduled_visit_id !== null) {
        const visit = state.visits.find(
          (v) => v.id === item.record.scheduled_visit_id,
        );
        if (
          !visit ||
          visit.plan_id !== plan.id ||
          visit.organization_id !== target.organization_id
        )
          throw Error('Scheduled follow-up evidence unavailable');
        continue;
      }
      add({
        kind: 'staff_follow_up',
        due_on: item.record.follow_up_on,
        timezone: plan.timezone,
        source: {
          plan_id: plan.id,
          plan_revision: plan.revision,
          occurrence_index: null,
          report_id: s.report_id,
          report_version: s.report_version,
          finding_id: s.finding_id,
          maintenance_revision: item.record.revision,
        },
      });
    }
    rows.sort(
      (a, b) => a.due_on.localeCompare(b.due_on) || a.key.localeCompare(b.key),
    );
    // Visits have a plan/date/status, not a completion receipt or notification
    // record. Only exact selected-plan identities enter the optional review.
    const eligibilityVisits: EligibilityVisit[] = [];
    if (policy) {
      for (const visit of state.visits) {
        if (!plans.some((p) => p.id === visit.plan_id)) continue;
        if (
          visit.organization_id !== target.organization_id ||
          !reportUuid(visit.id) ||
          !['draft', 'submitted', 'published'].includes(visit.status) ||
          !['before', 'during', 'after'].includes(visit.phase)
        )
          throw Error('Invalid exact reminder visit');
        revision(visit.revision);
        if (visit.revision < 1)
          throw Error('Invalid exact reminder visit revision');
        maintenanceDate(visit.visited_on);
        if (visit.visited_on < window.from || visit.visited_on > window.through)
          continue;
        eligibilityVisits.push({
          id: visit.id,
          plan_id: visit.plan_id,
          revision: visit.revision,
          on: visit.visited_on,
          status: visit.status,
          phase: visit.phase,
        });
      }
      if (
        eligibilityVisits.length > 5000 ||
        new Set(eligibilityVisits.map((v) => v.id)).size !==
          eligibilityVisits.length
      )
        throw Error('Ambiguous reminder visit identity');
      eligibilityVisits.sort((a, b) => a.id.localeCompare(b.id));
    }
    return { rows, truncated, eligibilityVisits };
  }
  function consent(history: CustomerHistory) {
    if (!Array.isArray(history.consents) || history.consents.length > 500)
      throw Error('Consent history unavailable');
    const rows = history.consents.map((c) => {
      if (
        c.organization_id !== target.organization_id ||
        c.customer_id !== target.customer_id ||
        !reportUuid(c.id) ||
        typeof c.recorded_at !== 'string' ||
        typeof c.email_allowed !== 'boolean' ||
        typeof c.sms_allowed !== 'boolean' ||
        typeof c.policy_version !== 'string'
      )
        throw Error('Invalid consent evidence');
      const at = Temporal.Instant.from(c.recorded_at);
      return {
        id: c.id,
        recorded_at: at.toString(),
        allowed: window.channel === 'email' ? c.email_allowed : c.sms_allowed,
        policy:
          c.policy_version === 'contact-v1' ? 'contact-v1' : 'unrecognized',
      };
    });
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw Error('Ambiguous consent history');
    rows.sort((a, b) => Temporal.Instant.compare(b.recorded_at, a.recorded_at));
    const latest = rows[0];
    const uncertain =
      !latest ||
      rows.some((r) => Temporal.Instant.compare(r.recorded_at, instant) > 0) ||
      rows.filter((r) => r.recorded_at === latest.recorded_at).length !== 1 ||
      latest.policy !== 'contact-v1';
    return {
      observed_channel_state: uncertain
        ? ('UNKNOWN' as const)
        : latest.allowed
          ? ('RECORDED_ALLOWED' as const)
          : ('RECORDED_DENIED' as const),
      reference: uncertain
        ? null
        : {
            id: latest.id,
            recorded_at: latest.recorded_at,
            policy: 'contact-v1',
          },
    };
  }
  const initial = sources();
  const first = consent(
    await repo.operations.customerHistory(
      target.organization_id,
      target.customer_id,
    ),
  );
  authority();
  const second = consent(
    await repo.operations.customerHistory(
      target.organization_id,
      target.customer_id,
    ),
  );
  const current = sources();
  if (
    JSON.stringify(initial) !== JSON.stringify(current) ||
    JSON.stringify(first) !== JSON.stringify(second)
  )
    throw Error('Reminder evidence changed; reload review');
  const eligibilityReview = policy
    ? (() => {
        const items = current.rows.map((candidate) => {
          const today = instant
            .toZonedDateTimeISO(candidate.timezone)
            .toPlainDate();
          const days = today.until(candidate.due_on, {
            largestUnit: 'days',
          }).days;
          const inWindow =
            days >= -policy.overdue_days && days <= policy.lead_days;
          const visits = current.eligibilityVisits.filter(
            (v) =>
              v.plan_id === candidate.source.plan_id &&
              v.on === candidate.due_on,
          );
          const ambiguous = visits.length > 1;
          const channel = second.observed_channel_state;
          const planningStatus =
            current.truncated || ambiguous || channel === 'UNKNOWN'
              ? ('UNKNOWN' as const)
              : channel === 'RECORDED_DENIED'
                ? ('CHANNEL_DENIED' as const)
                : visits.length === 1
                  ? ('EXACT_VISIT_RECORDED' as const)
                  : !inWindow
                    ? ('OUTSIDE_REVIEW_WINDOW' as const)
                    : ('STAFF_REVIEW_CANDIDATE' as const);
          const reasons: string[] = [];
          if (current.truncated) reasons.push('INCOMPLETE_CANDIDATE_COVERAGE');
          if (ambiguous) reasons.push('AMBIGUOUS_EXACT_VISITS');
          if (channel === 'UNKNOWN') reasons.push('CHANNEL_EVIDENCE_UNKNOWN');
          if (channel === 'RECORDED_DENIED') reasons.push('CHANNEL_DECLINED');
          if (visits.length === 1) reasons.push('EXACT_PLAN_DATE_VISIT_EXISTS');
          if (!inWindow) reasons.push('OUTSIDE_CONFIRMED_PLANNING_WINDOW');
          return {
            candidate_key: candidate.key,
            calendar_days_from_as_of: days,
            planning_status: planningStatus,
            eligible_for_staff_review:
              planningStatus === 'STAFF_REVIEW_CANDIDATE',
            source: { ...candidate.source },
            exact_visits: visits.map((v) => ({ ...v })),
            channel_reference: second.reference
              ? { ...second.reference }
              : null,
            reasons,
            message_eligibility: 'BLOCKED' as const,
            unverified: [
              'purpose_consent',
              'suppression',
              'recurring_enrollment',
              'sender_authority',
            ] as const,
          };
        });
        return {
          policy: {
            confirmed: true as const,
            lead_days: policy.lead_days,
            overdue_days: policy.overdue_days,
          },
          scope: 'STAFF_PLANNING_ONLY' as const,
          items,
          eligible_for_staff_review_count: items.filter(
            (i) => i.eligible_for_staff_review,
          ).length,
          count_is_complete: !current.truncated,
          message_eligibility: 'BLOCKED' as const,
        };
      })()
    : null;
  return frozen({
    boundary: target,
    window,
    coverage: 'AVAILABLE_LOCAL_SOURCES_ONLY' as const,
    history_completeness: 'UNKNOWN' as const,
    count: current.rows.length,
    count_is_complete: !current.truncated,
    candidates: current.rows,
    consent: second,
    eligibility_review: eligibilityReview,
    purpose_consent: 'UNVERIFIED' as const,
    suppression: 'UNVERIFIED' as const,
    recurring_enrollment: 'UNVERIFIED' as const,
    communication_authority: 'BLOCKED' as const,
    recipient: null,
    provider_request: null,
    note: 'Staff review candidates only. Recorded channel preference and inspection recurrence do not authorize reminders, enrollment or communication.',
  });
}
