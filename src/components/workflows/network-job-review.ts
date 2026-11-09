import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { readOfflineCrewContext } from './offline-crew-context';
/** Original source/Field admission only. Internal worker profiles are not Network partners. */
export async function readNetworkJobReview(j: LocalJourney) {
  const work = await readOfflineCrewContext(j);
  work.check();
  const read = () => {
    work.check();
    return j.estimates
      .readSyntheticPrototypeSources(j.target)
      .workforce.workers.map((w) => ({
        id: w.id,
        organization_id: w.organization_id,
        display_name: w.display_name,
        worker_type: w.worker_type,
        active: w.active,
      }));
  };
  const profiles = read();
  if (
    profiles.some((p) => p.organization_id !== j.target.organization_id) ||
    new Set(profiles.map((p) => p.id)).size !== profiles.length
  )
    throw Error('Exact tenant profile identities required');
  const fingerprint = JSON.stringify(profiles);
  let held = false;
  const check = () => {
    if (held) throw Error('UNKNOWN profile review held');
    try {
      if (JSON.stringify(read()) !== fingerprint)
        throw Error('Recorded profiles changed');
    } catch (e) {
      held = true;
      throw e;
    }
  };
  check();
  return {
    work,
    profiles: profiles.filter((p) => p.worker_type === 'contractor_1099'),
    requirements: work.issued.snapshot.estimate.lines.filter(
      (l) => l.included && ['labor', 'service'].includes(l.kind),
    ),
    check,
  };
}
