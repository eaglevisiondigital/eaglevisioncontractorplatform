import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import { readSalesWorkflow } from '../../lib/workflows/sales-workflow';

/** Reuse original exact Sales reader. Caller text never resolves an identity. */
export async function receptionistSalesSource(j: LocalJourney) {
  const capture = captureOperatingSources(
    {
      company: j.company,
      operations: j.operations,
      estimates: j.estimates,
      property: j.property,
      entries: [j],
      gate: j.gate,
    },
    j.gate,
  );
  capture.check();
  const target = {
    organization_id: j.target.organization_id,
    actor_id: j.target.actor_id,
    customer_id: j.target.customer_id,
    location_id: j.target.location_id,
    estimate_id: j.target.estimate_id,
    version_id: j.target.version_id,
    offer_id: j.offer_id,
    receipt_id: j.receipt_id,
    intake_request_id: j.intake_request_id,
  };
  const row = () => {
    capture.check();
    const value = j.operations.syntheticIntakeRequest(
      target.organization_id,
      target.customer_id,
      target.location_id,
      target.intake_request_id,
    );
    capture.check();
    return JSON.stringify(value);
  };
  const fingerprint = row();
  const view = await readSalesWorkflow(j.estimates, j.release, target, j.gate);
  const check = () => {
    if (row() !== fingerprint) throw Error('Original intake changed; UNKNOWN');
  };
  check();
  if (view.status === 'unknown' || !view.evidence)
    throw Error('Exact Sales source UNKNOWN');
  return {
    lead: view.evidence.lead,
    salesStatus: view.status,
    reason: view.reason,
    check,
  };
}
