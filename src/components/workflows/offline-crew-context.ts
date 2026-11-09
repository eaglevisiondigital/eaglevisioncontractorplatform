import {
  readPrototypeSource,
  assertPrototypeSourceCurrentNow,
} from '../../lib/program/prototype-source';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  readSyncAdmissionSource,
  syncSourceReference,
} from '../../lib/workflows/sync-admission-review';
import { readSalesJobPlanning } from './sales-job-planning-review';
export async function readOfflineCrewContext(j: LocalJourney) {
  const work = await readSalesJobPlanning(j);
  work.check();
  const source = await readSyncAdmissionSource(
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
      kind: 'offline',
      note: 'Review exact assigned work only; no replay.',
      review_on: j.day,
      manual_priority: 'normal',
      edition: 'property_services',
    },
    j.gate,
  );
  const issued = await readPrototypeSource(j.estimates, j.target, j.gate);
  let held = false;
  const check = () => {
    if (held) throw Error('UNKNOWN source held');
    try {
      syncSourceReference(source);
      work.check();
      assertPrototypeSourceCurrentNow(issued);
    } catch (e) {
      held = true;
      throw e;
    }
  };
  check();
  return {
    work,
    source,
    issued,
    reference: syncSourceReference(source),
    check,
  };
}
