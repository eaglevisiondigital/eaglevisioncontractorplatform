import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { fieldVisitMarginReader } from '../field/field-service-review';
import { readSalesJobPlanning } from './sales-job-planning-review';

/** Reuse the exact issued-job/visit admission and canonical financial reader. */
export async function readOwnerCostEvidence(sources: LocalJourney) {
  const source = await readSalesJobPlanning(sources);
  const reader = fieldVisitMarginReader(
    sources.property,
    sources.target.organization_id,
    sources.target.actor_id,
    source.reference,
    source.scope,
  );
  const read = reader.read.bind(reader);
  reader.read = async (...args) => {
    source.check();
    const result = await read(...args);
    source.check();
    return result;
  };
  const readCompletion = reader.readCompletion.bind(reader);
  reader.readCompletion = async (...args) => {
    source.check();
    const result = await readCompletion(...args);
    source.check();
    return result;
  };
  source.check();
  return { ...source, reader };
}
