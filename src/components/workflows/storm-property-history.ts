import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { readSalesJobPlanning } from './sales-job-planning-review';
import {
  readAdvancedHandoffRequirements,
  assertAdvancedRequirementsCurrentNow,
} from '../../lib/workflows/advanced-handoffs';
import {
  emptyHistoryFilters,
  searchInspectionHistory,
  type HistoryFilters,
} from '../../domain/property/history-search';
export async function readStormPropertyHistory(j: LocalJourney) {
  const work = await readSalesJobPlanning(j);
  work.check();
  const requirements = await readAdvancedHandoffRequirements(
    {
      company: j.company,
      operations: j.operations,
      estimates: j.estimates,
      property: j.property,
      entries: [j],
      gate: j.gate,
    },
    {
      job_id: j.target.job_id!,
      kind: 'storm_network',
      note: 'Compare reported conditions with published evidence; attribution UNKNOWN.',
      review_on: j.day,
      manual_priority: 'normal',
      edition: 'property_services',
    },
    j.gate,
  );
  const boundary = {
    organization_id: j.target.organization_id,
    customer_id: j.target.customer_id,
    location_id: j.target.location_id,
    reports: true,
  };
  const read = () => {
    work.check();
    assertAdvancedRequirementsCurrentNow(requirements);
    return j.property
      .read(boundary.organization_id)
      .reports.filter(
        (r) =>
          r.organization_id === boundary.organization_id &&
          r.customer_id === boundary.customer_id &&
          r.location_id === boundary.location_id,
      );
  };
  const fingerprint = JSON.stringify(read());
  let held = false;
  const check = () => {
    if (held) throw Error('UNKNOWN evidence held');
    try {
      if (JSON.stringify(read()) !== fingerprint)
        throw Error('Published history changed');
    } catch (e) {
      held = true;
      throw e;
    }
  };
  const search = (filters: HistoryFilters) => {
    check();
    const result = searchInspectionHistory(read(), boundary, filters);
    check();
    return result;
  };
  search({ ...emptyHistoryFilters });
  return { work, requirements, boundary, check, search };
}
