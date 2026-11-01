import { uuidPattern } from '../../src/domain/intake';
import type { MaintenanceSource } from '../../src/domain/property/maintenance';
import type { EstimateInput } from '../../src/domain/estimating/types';
import type { RepairReadinessRequest } from '../../src/domain/property/repair-readiness';
import { validateMaintenanceSource } from './maintenance-persistence';

/** Unwired contract. The only implementation is the disposable native test service. */
export interface RepairReservationRequest {
  request_id: string;
  source: MaintenanceSource;
  maintenance_revision: number;
  plan_id: string;
  plan_revision: number;
  job_id: string | null;
  job_baseline_version_id: string | null;
  estimate_id: string;
  draft_version_id: string;
  line_id: string;
  payload: EstimateInput;
}
export interface ReadinessAppendCommand {
  reservation: RepairReservationRequest;
  review: RepairReadinessRequest;
}
export function validateRepairReservation(value: RepairReservationRequest) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'draft_version_id,estimate_id,job_baseline_version_id,job_id,line_id,maintenance_revision,payload,plan_id,plan_revision,request_id,source'
  )
    throw Error('Exact repair reservation fields required.');
  validateMaintenanceSource(value.source);
  for (const id of [
    value.request_id,
    value.plan_id,
    value.estimate_id,
    value.draft_version_id,
    value.line_id,
  ])
    if (typeof id !== 'string' || !uuidPattern.test(id))
      throw Error('Reserved UUID required.');
  if (
    new Set([value.estimate_id, value.draft_version_id, value.line_id]).size !==
    3
  )
    throw Error('Distinct target identities required.');
  for (const n of [value.maintenance_revision, value.plan_revision])
    if (!Number.isSafeInteger(n) || n < 1 || n >= 2147483647)
      throw Error('Current positive revision required.');
  if (
    (value.job_id === null) !== (value.job_baseline_version_id === null) ||
    [value.job_id, value.job_baseline_version_id].some(
      (id) => id !== null && (typeof id !== 'string' || !uuidPattern.test(id)),
    )
  )
    throw Error('Exact optional job baseline required.');
  const p = value.payload;
  if (
    !p ||
    p.customer_id !== value.source.customer_id ||
    p.location_id !== value.source.location_id ||
    !Array.isArray(p.lines) ||
    p.lines.filter((l) => l.id === value.line_id).length !== 1 ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > 1048576
  )
    throw Error('Exact bounded source/target scope required.');
}

/** No automatic retry or resume. Claim is durable BEFORE the asynchronous target write.
 * A missing receipt/target is UNDETERMINED, including after a proven test rollback.
 * Reconciliation cannot start a new preparation or replace reserved identities.
 */
export interface RepairPersistence {
  reserve(request: RepairReservationRequest): Promise<unknown>;
  prepareOnce(request: RepairReservationRequest): Promise<unknown>;
  reconcile(request: RepairReservationRequest): Promise<unknown>;
  appendReadiness(command: ReadinessAppendCommand): Promise<unknown>;
}
