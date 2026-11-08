import type { PropertyRepository } from '../../lib/property';
import { readFieldSchedule } from '../../lib/field-scheduling';
import {
  maintenanceKey,
  type MaintenanceSource,
} from '../../domain/property/maintenance';
import { projectPublishedHistory } from '../../domain/property/report-page';

/** Read composition only: the original maintenance authorization precedes source access. */
export function maintenancePlanHistory(
  repo: PropertyRepository,
  org: string,
  actor: string,
  source: MaintenanceSource,
  recordRevision: number,
  selectedPlan: { id: string; revision: number },
) {
  const queue = repo.maintenance(org, actor);
  const keys = [
    'organization_id',
    'customer_id',
    'location_id',
    'report_id',
    'report_version',
    'finding_id',
  ];
  const fields = Object.getOwnPropertyDescriptors(source);
  if (
    Object.getPrototypeOf(source) !== Object.prototype ||
    Reflect.ownKeys(source).length !== keys.length ||
    keys.some((key) => !fields[key] || !('value' in fields[key]))
  )
    throw Error('Exact maintenance source required');
  const item = queue.items.find(
    (i) => maintenanceKey(i.source) === maintenanceKey(source),
  );
  if (
    !item ||
    source.organization_id !== org ||
    item.record.revision !== recordRevision
  )
    throw Error('Maintenance source changed — review current saved evidence');
  const state = repo.read(org),
    plan = state.plans.find((p) => p.id === selectedPlan.id);
  if (
    !plan ||
    plan.organization_id !== org ||
    plan.customer_id !== source.customer_id ||
    plan.location_id !== source.location_id ||
    plan.revision !== selectedPlan.revision
  )
    throw Error(
      'Selected plan changed or unavailable — review its exact revision',
    );
  const propertyVisits = readFieldSchedule(repo, org, actor).rows.filter(
    (row) =>
      row.source.organization_id === org &&
      row.source.customer_id === source.customer_id &&
      row.source.location_id === source.location_id,
  );
  const visits = propertyVisits.filter(
    (row) =>
      row.source.plan_id === plan.id &&
      row.source.plan_revision === plan.revision,
  );
  const propertyReports = projectPublishedHistory(
    state.reports.filter((r) =>
      propertyVisits.some((v) => v.source.visit_id === r.visit_id),
    ),
    {
      organization_id: org,
      customer_id: source.customer_id,
      location_id: source.location_id,
    },
  );
  const reportIds = new Set(visits.flatMap((v) => v.reports.map((r) => r.id)));
  const reports = propertyReports.filter((r) => reportIds.has(r.id));
  return {
    plan: {
      id: plan.id,
      revision: plan.revision,
      name: plan.name,
      cadence: plan.cadence,
      interval_days: plan.interval_days,
      starts_on: plan.starts_on,
      timezone: plan.timezone,
    },
    visits,
    reports,
    propertyVisits,
    propertyReports,
    withoutPublishedEvidence: visits.filter((v) => v.reports.length === 0)
      .length,
  };
}
