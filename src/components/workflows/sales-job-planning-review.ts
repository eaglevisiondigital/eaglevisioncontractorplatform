import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  openFieldSource,
  readFieldSchedule,
  type FieldVisitReference,
} from '../../lib/field-scheduling';
import { fieldVisitCostScope } from '../field/field-service-review';

/** Read the original job baseline alongside Sales; never create an association. */
export async function readSalesJobPlanning(
  sources: LocalJourney,
  reference?: FieldVisitReference,
) {
  const capture = captureOperatingSources(
    {
      company: sources.company,
      operations: sources.operations,
      estimates: sources.estimates,
      property: sources.property,
      entries: [sources],
      gate: sources.gate,
    },
    sources.gate,
  );
  const target = sources.target;
  const ref =
    reference ??
    readFieldSchedule(
      sources.property,
      target.organization_id,
      target.actor_id,
    ).rows.find((r) => r.source.visit_id === sources.scheduled_visit_id)
      ?.source;
  if (
    !ref ||
    ref.organization_id !== target.organization_id ||
    ref.customer_id !== target.customer_id ||
    ref.location_id !== target.location_id ||
    ref.plan_id !== sources.plan_id
  )
    throw Error('Exact original job visit UNKNOWN');
  const scope = await fieldVisitCostScope(
    sources.property,
    target.organization_id,
    target.actor_id,
    ref,
  );
  capture.check();
  if (
    !scope ||
    scope.organizationId !== target.organization_id ||
    scope.jobId !== target.job_id ||
    scope.estimateId !== target.estimate_id ||
    scope.issuedVersionId !== target.version_id ||
    scope.customerId !== target.customer_id ||
    (scope.propertyId !== null && scope.propertyId !== target.location_id)
  )
    throw Error('Exact issued estimate/job relationship UNKNOWN');
  const { row } = openFieldSource(
    sources.property,
    target.organization_id,
    target.actor_id,
    ref,
  );
  capture.check();
  return { sources, reference: row.source, scope, row, check: capture.check };
}
