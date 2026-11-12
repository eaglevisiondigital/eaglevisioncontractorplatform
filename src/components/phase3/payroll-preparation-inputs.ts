import type { WorkforceData } from '../../lib/phase3';
import { employerBoundary, payrollCsv } from '../../domain/workforce/payroll';

/** Validate the existing preparation control before its original writer runs.
 * This is not a substitute for server validation or permission to disburse payroll.
 */
export function payrollPreparationInputs(
  data: WorkforceData,
  startDate: string,
  endDate: string,
  deductions: Record<string, number>,
) {
  const timezone = data.policy?.timezone;
  if (!timezone) throw Error('Reviewed employer policy required');
  const start = employerBoundary(startDate, timezone),
    end = employerBoundary(endDate, timezone);
  if (Date.parse(start) >= Date.parse(end))
    throw Error('Pay period end must follow its start');
  const workerIds = new Set(data.workers.map((worker) => worker.id));
  if (Object.keys(deductions).some((id) => !workerIds.has(id)))
    throw Error('Deductions require an exact current worker');
  // Reuse the canonical nonnegative safe-integer and currency rules before lock,
  // rather than discovering an invalid saved deduction only during CSV export.
  payrollCsv([], deductions, data.policy?.currency ?? 'USD');
  return { start, end };
}
