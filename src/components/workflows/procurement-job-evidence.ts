import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
} from '../../lib/program/prototype-source';
import {
  readAdvancedHandoffRequirements,
  assertAdvancedRequirementsCurrentNow,
} from '../../lib/workflows/advanced-handoffs';
import { readOwnerCostEvidence } from './owner-cost-evidence';

/** Read-only composition: issued requirements and original procurement/cost readers. */
export async function readProcurementJobEvidence(j: LocalJourney) {
  const cost = await readOwnerCostEvidence(j);
  cost.check();
  const source = await readPrototypeSource(j.estimates, j.target, j.gate);
  cost.check();
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
      kind: 'procurement',
      note: 'Review recorded material scope; no purchase authority.',
      review_on: j.day,
      manual_priority: 'normal',
      edition: 'property_services',
    },
    j.gate,
  );
  const check = () => {
    cost.check();
    assertPrototypeSourceCurrentNow(source);
    assertAdvancedRequirementsCurrentNow(requirements);
  };
  check();
  const materials = source.snapshot.estimate.lines
    .filter((l) => l.included && ['material', 'product'].includes(l.kind))
    .map((line) => {
      const matches = source.snapshot.catalog.filter(
        (c) =>
          c.id === line.catalog_item_id &&
          c.unit === line.unit &&
          c.kind === line.kind,
      );
      return {
        ...line,
        recordedVendor: matches.length === 1 ? matches[0].vendor : null,
        catalogMapping: matches.length === 1 ? 'EXACT' : 'UNKNOWN',
      };
    });
  return { sources: j, source, materials, requirements, cost, check };
}
