import {
  maintenanceDate,
  type MaintenanceSource,
} from '../domain/property/maintenance';
import type { PublishedReport, Visit } from '../domain/property/inspections';
import type { PropertyRepository } from './property';

export interface FieldVisitReference {
  organization_id: string;
  customer_id: string;
  location_id: string;
  plan_id: string;
  plan_revision: number;
  visit_id: string;
  visit_revision: number;
}
export interface FieldVisitRow {
  source: FieldVisitReference;
  date: string;
  timezone: string;
  plan_name: string;
  customer_name: string;
  property_label: string;
  cadence: string;
  phase: Visit['phase'];
  status: Visit['status'];
  summary: string;
  responsibility: { id: string; label: string }[];
  responsibility_uncertain: boolean;
  reports: { id: string; version: number }[];
  follow_up_sources: MaintenanceSource[];
}
export const blankFieldFilters = {
  from: '',
  to: '',
  property: '',
  responsibility: '',
  status: '',
};
export type FieldFilters = typeof blankFieldFilters;
export function fieldSchedulingPreviewEnabled(input: {
  development: boolean;
  flag: string | undefined;
  hostname: string;
  protocol: string;
}) {
  return (
    input.development &&
    input.flag === 'true' &&
    ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(input.hostname) &&
    ['http:', 'https:'].includes(input.protocol)
  );
}
/** Read-only projection over the existing synthetic repository. No secondary store. */
export function readFieldSchedule(
  repo: PropertyRepository,
  org: string,
  actor: string,
) {
  const maintenance = repo.maintenance(org, actor); // current local membership; connected use rejects first
  const state = repo.read(org);
  const rows: FieldVisitRow[] = state.visits.map((visit) => {
    const plan = state.plans.find(
      (p) => p.id === visit.plan_id && p.organization_id === org,
    );
    const context =
      plan &&
      state.contexts.find(
        (c) =>
          c.customer_id === plan.customer_id &&
          c.location_id === plan.location_id &&
          c.job_id === plan.job_id,
      );
    if (!plan || !context || visit.organization_id !== org)
      throw Error('Exact inspection/property source unavailable.');
    repo.operations.syntheticProperty(org, plan.customer_id, plan.location_id);
    maintenanceDate(visit.visited_on);
    const followups = maintenance.items.filter(
      (i) => i.record.scheduled_visit_id === visit.id,
    );
    if (
      followups.some(
        (i) =>
          i.source.organization_id !== org ||
          i.source.customer_id !== plan.customer_id ||
          i.source.location_id !== plan.location_id,
      )
    )
      throw Error('Follow-up source belongs to another property.');
    const assigned = [
      ...new Set(
        followups
          .map((i) => i.record.assignee_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    const responsibility = assigned.flatMap((id) => {
      const member = maintenance.members.find(
        (m) => m.user_id === id && m.active,
      );
      return member ? [{ id, label: member.label }] : [];
    });
    const reports = state.reports.filter((r) => r.visit_id === visit.id);
    if (
      reports.some(
        (r) =>
          r.organization_id !== org ||
          r.customer_id !== plan.customer_id ||
          r.location_id !== plan.location_id ||
          r.visited_on !== visit.visited_on,
      )
    )
      throw Error('Exact report/property source unavailable.');
    return {
      source: {
        organization_id: org,
        customer_id: plan.customer_id,
        location_id: plan.location_id,
        plan_id: plan.id,
        plan_revision: plan.revision,
        visit_id: visit.id,
        visit_revision: visit.revision,
      },
      date: visit.visited_on,
      timezone: plan.timezone,
      plan_name: plan.name,
      customer_name: context.customer_name,
      property_label: context.location_label,
      cadence: plan.cadence,
      phase: visit.phase,
      status: visit.status,
      summary: visit.content.summary,
      responsibility,
      responsibility_uncertain: assigned.length !== responsibility.length,
      reports: reports
        .map((r) => ({ id: r.id, version: r.version }))
        .sort((a, b) => a.version - b.version),
      follow_up_sources: followups.map((i) => structuredClone(i.source)),
    };
  });
  return {
    rows: rows.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.source.visit_id.localeCompare(b.source.visit_id),
    ),
    members: maintenance.members,
  };
}
export function filterFieldSchedule(
  rows: FieldVisitRow[],
  filters: FieldFilters,
) {
  if (filters.from) maintenanceDate(filters.from);
  if (filters.to) maintenanceDate(filters.to);
  if (filters.from && filters.to && filters.from > filters.to)
    throw Error('Start date must be on or before end date.');
  if (
    filters.status &&
    !['draft', 'submitted', 'published'].includes(filters.status)
  )
    throw Error('Unknown inspection status.');
  return rows.filter(
    (r) =>
      (!filters.from || r.date >= filters.from) &&
      (!filters.to || r.date <= filters.to) &&
      (!filters.property || r.source.location_id === filters.property) &&
      (!filters.status || r.status === filters.status) &&
      (!filters.responsibility ||
        (filters.responsibility === 'unassigned'
          ? !r.responsibility.length && !r.responsibility_uncertain
          : r.responsibility.some((m) => m.id === filters.responsibility))),
  );
}
/** Exact current reference check prevents a stale card or another property selecting a source. */
export function openFieldSource(
  repo: PropertyRepository,
  org: string,
  actor: string,
  ref: FieldVisitReference,
  report?: { id: string; version: number },
) {
  const row = readFieldSchedule(repo, org, actor).rows.find(
    (r) => JSON.stringify(r.source) === JSON.stringify(ref),
  );
  if (!row) throw Error('Inspection source changed. Reload the schedule.');
  let published: PublishedReport | null = null;
  if (report) {
    if (
      !row.reports.some(
        (r) => r.id === report.id && r.version === report.version,
      )
    )
      throw Error('Exact published report unavailable.');
    published =
      repo
        .read(org)
        .reports.find(
          (r) =>
            r.id === report.id &&
            r.version === report.version &&
            r.visit_id === ref.visit_id &&
            r.organization_id === org &&
            r.customer_id === ref.customer_id &&
            r.location_id === ref.location_id,
        ) ?? null;
    if (!published) throw Error('Exact published report unavailable.');
  }
  return { row: structuredClone(row), published: structuredClone(published) };
}
export function openFieldOrigin(
  repo: PropertyRepository,
  org: string,
  actor: string,
  ref: FieldVisitReference,
  source: MaintenanceSource,
) {
  const { row } = openFieldSource(repo, org, actor, ref);
  if (
    !row.follow_up_sources.some(
      (s) => JSON.stringify(s) === JSON.stringify(source),
    )
  )
    throw Error('Exact follow-up finding unavailable.');
  const item = repo
    .maintenance(org, actor)
    .items.find(
      (i) =>
        JSON.stringify(i.source) === JSON.stringify(source) &&
        i.record.scheduled_visit_id === ref.visit_id,
    );
  if (!item) throw Error('Exact follow-up finding unavailable.');
  return {
    row,
    published: structuredClone(item.report),
    finding_id: source.finding_id,
  };
}
