import type { Phase3Repository, WorkforceData } from '../../lib/phase3';
/** A read fence for the existing private payroll controls, never an authorization issuer. */
export async function requireCurrentPayrollSource(
  repo: Phase3Repository,
  org: string,
  displayed: WorkforceData,
  stillCurrent: () => boolean,
) {
  if (!stillCurrent() || displayed.payroll_admin !== true)
    throw Error('Current payroll administration access required');
  const current = await repo.workforce(org);
  if (!stillCurrent()) throw Error('Payroll context changed; no continuation');
  if (
    current.payroll_admin !== true ||
    current.workers.some((w) => w.organization_id !== org)
  )
    throw Error(
      'Payroll access unavailable; refresh your authorized workspace',
    );
  if (JSON.stringify(current) !== JSON.stringify(displayed))
    throw Error('Payroll source changed; refresh and prepare again');
  return current;
}
