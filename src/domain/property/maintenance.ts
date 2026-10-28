import { Temporal } from '@js-temporal/polyfill';
import type { AttentionItem } from './attention';
import type { PublishedReport } from './inspections';

export const maintenancePriorities = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;
export type MaintenancePriority = (typeof maintenancePriorities)[number];
export interface MaintenanceSource {
  organization_id: string;
  customer_id: string;
  location_id: string;
  report_id: string;
  report_version: number;
  finding_id: string;
}
export interface MaintenanceRecord {
  revision: number;
  priority: MaintenancePriority;
  assignee_id: string | null;
  follow_up_on: string;
  review: 'pending' | 'reviewed';
  notes: { id: string; author_id: string; text: string; recorded_at: string }[];
  scheduled_visit_id: string | null;
}
export interface MaintenanceEdit {
  priority: MaintenancePriority;
  assignee_id: string | null;
  follow_up_on: string;
  review: 'pending' | 'reviewed';
  note: string;
}
export type MaintenanceStatus = 'pending' | 'scheduled' | 'reviewed';
export interface MaintenanceItem {
  key: string;
  source: MaintenanceSource;
  property_label: string;
  customer_name: string;
  report: PublishedReport;
  finding: PublishedReport['findings'][number];
  plan_id: string;
  job_id: string | null;
  record: MaintenanceRecord;
  status: MaintenanceStatus;
  recurring: boolean;
  inspection_dates: number;
  uncertainties: string[];
  repair_status: AttentionItem['repair_status'];
  scheduled_on: string | null;
}
export function maintenanceKey(source: MaintenanceSource) {
  return JSON.stringify([
    source.organization_id,
    source.customer_id,
    source.location_id,
    source.report_id,
    source.report_version,
    source.finding_id,
  ]);
}
export function blankMaintenance(): MaintenanceRecord {
  return {
    revision: 0,
    priority: 'normal',
    assignee_id: null,
    follow_up_on: '',
    review: 'pending',
    notes: [],
    scheduled_visit_id: null,
  };
}
export function maintenanceDate(value: string) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Temporal.PlainDate.from(value, { overflow: 'reject' }).toString() !== value
  )
    throw Error('Use a valid follow-up date in YYYY-MM-DD format.');
}
export function editMaintenance(
  current: MaintenanceRecord,
  revision: number,
  input: MaintenanceEdit,
  actor: string,
  assignees: string[],
): MaintenanceRecord {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    current.revision !== revision ||
    current.revision >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Maintenance item changed. Reload before saving.');
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      'assignee_id,follow_up_on,note,priority,review' ||
    !maintenancePriorities.includes(input.priority) ||
    !['pending', 'reviewed'].includes(input.review) ||
    typeof input.note !== 'string' ||
    input.note.length > 2000 ||
    typeof input.follow_up_on !== 'string' ||
    (input.assignee_id !== null && !assignees.includes(input.assignee_id))
  )
    throw Error('Invalid maintenance review or inactive responsibility.');
  if (input.follow_up_on) maintenanceDate(input.follow_up_on);
  if (
    input.note.trim() &&
    current.notes.at(-1)?.text === input.note.trim() &&
    current.notes.at(-1)?.author_id === actor
  )
    throw Error('Identical follow-up note already recorded.');
  return {
    ...structuredClone(current),
    revision: revision + 1,
    priority: input.priority,
    assignee_id: input.assignee_id,
    follow_up_on: input.follow_up_on,
    review: input.review,
    notes: [
      ...structuredClone(current.notes),
      ...(input.note.trim()
        ? [
            {
              id: crypto.randomUUID(),
              author_id: actor,
              text: input.note.trim(),
              recorded_at: new Date().toISOString(),
            },
          ]
        : []),
    ],
  };
}
export function maintenanceStatus(
  record: MaintenanceRecord,
): MaintenanceStatus {
  return record.review === 'reviewed'
    ? 'reviewed'
    : record.scheduled_visit_id
      ? 'scheduled'
      : 'pending';
}
export const emptyMaintenanceFilters = {
  property: '',
  priority: '',
  responsibility: '',
  from: '',
  to: '',
  status: '',
  attention: '',
};
export type MaintenanceFilters = typeof emptyMaintenanceFilters;
export function filterMaintenance(
  items: MaintenanceItem[],
  filters: MaintenanceFilters,
) {
  if (filters.from) maintenanceDate(filters.from);
  if (filters.to) maintenanceDate(filters.to);
  if (filters.from && filters.to && filters.from > filters.to)
    throw Error('Follow-up start date must be on or before end date.');
  return items.filter(
    (i) =>
      (!filters.property || i.source.location_id === filters.property) &&
      (!filters.priority || i.record.priority === filters.priority) &&
      (!filters.responsibility ||
        (filters.responsibility === 'unassigned'
          ? i.record.assignee_id === null
          : i.record.assignee_id === filters.responsibility)) &&
      (!filters.from ||
        (!!i.record.follow_up_on && i.record.follow_up_on >= filters.from)) &&
      (!filters.to ||
        (!!i.record.follow_up_on && i.record.follow_up_on <= filters.to)) &&
      (!filters.status || i.status === filters.status) &&
      (!filters.attention ||
        (filters.attention === 'recurring'
          ? i.recurring
          : i.record.review === 'pending')),
  );
}
