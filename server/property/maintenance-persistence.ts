import { uuidPattern } from '../../src/domain/intake';
import {
  maintenanceDate,
  maintenancePriorities,
  type MaintenanceEdit,
  type MaintenanceRecord,
  type MaintenanceSource,
} from '../../src/domain/property/maintenance';

/** Workstream 2A contract only. No production transport, credential reader or UI binding. */
export type MaintenanceCommand = {
  request_id: string;
  source: MaintenanceSource;
  expected_revision: number;
} & (
  | { action: 'edit'; input: MaintenanceEdit }
  | {
      action: 'follow_up';
      input: { plan_id: string; plan_revision: number; visited_on: string };
    }
);
export interface MaintenanceReceipt {
  request_id: string;
  source: MaintenanceSource;
  revision: number;
  actor_id: string;
  recorded_at: string;
  scheduled_visit_id: string | null;
}
export interface RetainedMaintenance {
  source: MaintenanceSource;
  record: MaintenanceRecord;
  updated_by: string | null;
  updated_at: string | null;
}
/** Each instance is caller-bound by its eventual trusted adapter, never by a UI actor parameter.
 * A failed/absent response is UNKNOWN. Retain the original command before sending;
 * reconcile by exact command only. An absent receipt is not permission to retry.
 */
export interface MaintenancePersistence {
  read(source: MaintenanceSource): Promise<RetainedMaintenance>;
  execute(command: MaintenanceCommand): Promise<MaintenanceReceipt>;
  reconcile(
    command: MaintenanceCommand,
  ): Promise<
    | { status: 'committed'; receipt: MaintenanceReceipt }
    | { status: 'undetermined' }
  >;
}
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw Error('Exact maintenance contract fields required.');
}
export function validateMaintenanceSource(
  value: unknown,
): asserts value is MaintenanceSource {
  exact(value, [
    'organization_id',
    'customer_id',
    'location_id',
    'report_id',
    'report_version',
    'finding_id',
  ]);
  for (const key of [
    'organization_id',
    'customer_id',
    'location_id',
    'report_id',
  ])
    if (typeof value[key] !== 'string' || !uuidPattern.test(value[key]))
      throw Error('Invalid maintenance source identity.');
  if (
    !Number.isSafeInteger(value.report_version) ||
    Number(value.report_version) < 1 ||
    typeof value.finding_id !== 'string' ||
    !value.finding_id.trim() ||
    value.finding_id.length > 100
  )
    throw Error('Invalid exact published version/finding.');
}
/** Reject additions such as resolved, prices or customer decisions before any persistence call. */
export function validateMaintenanceCommand(
  value: unknown,
): asserts value is MaintenanceCommand {
  exact(value, [
    'request_id',
    'source',
    'expected_revision',
    'action',
    'input',
  ]);
  validateMaintenanceSource(value.source);
  if (
    typeof value.request_id !== 'string' ||
    !uuidPattern.test(value.request_id) ||
    !Number.isSafeInteger(value.expected_revision) ||
    Number(value.expected_revision) < 0 ||
    Number(value.expected_revision) >= 2147483647
  )
    throw Error(
      'Exact request UUID and current maintenance revision required.',
    );
  if (value.action === 'edit') {
    exact(value.input, [
      'priority',
      'assignee_id',
      'follow_up_on',
      'review',
      'note',
    ]);
    const input = value.input;
    if (
      !maintenancePriorities.some((p) => p === input.priority) ||
      typeof input.review !== 'string' ||
      !['pending', 'reviewed'].includes(input.review) ||
      (input.assignee_id !== null &&
        (typeof input.assignee_id !== 'string' ||
          !uuidPattern.test(input.assignee_id))) ||
      typeof input.follow_up_on !== 'string' ||
      typeof input.note !== 'string' ||
      input.note.length > 2000
    )
      throw Error('Invalid manual maintenance coordination.');
    if (input.follow_up_on) maintenanceDate(input.follow_up_on);
  } else if (value.action === 'follow_up') {
    exact(value.input, ['plan_id', 'plan_revision', 'visited_on']);
    if (
      typeof value.input.plan_id !== 'string' ||
      !uuidPattern.test(value.input.plan_id) ||
      !Number.isSafeInteger(value.input.plan_revision) ||
      Number(value.input.plan_revision) < 1 ||
      Number(value.input.plan_revision) > 2147483647 ||
      typeof value.input.visited_on !== 'string'
    )
      throw Error('Exact existing plan revision required.');
    maintenanceDate(value.input.visited_on);
  } else
    throw Error(
      'Unsupported maintenance command; no repair/financial authority.',
    );
}
