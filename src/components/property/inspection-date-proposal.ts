import {
  occurrence,
  type InspectionPlan,
  type Visit,
} from '../../domain/property/inspections';
import { maintenanceDate } from '../../domain/property/maintenance';
/** First unoccupied anchored date, NOT future availability, completion or booking.
 * All recurrence arithmetic stays in the original occurrence engine. */
export function inspectionDateProposal(
  org: string,
  plan: InspectionPlan,
  visits: Visit[],
): string | null {
  try {
    if (
      !plan ||
      plan.organization_id !== org ||
      typeof plan.id !== 'string' ||
      !plan.id ||
      !Number.isSafeInteger(plan.revision) ||
      plan.revision < 1 ||
      !Array.isArray(visits) ||
      visits.some((v) => !v || v.organization_id !== org)
    )
      throw Error();
    maintenanceDate(plan.starts_on);
    const exact = visits.filter((v) => v.plan_id === plan.id),
      dates = new Set<string>(),
      ids = new Set<string>();
    for (const visit of exact) {
      if (
        typeof visit.id !== 'string' ||
        !visit.id ||
        ids.has(visit.id) ||
        dates.has(visit.visited_on) ||
        !['draft', 'submitted', 'published'].includes(visit.status)
      )
        throw Error();
      maintenanceDate(visit.visited_on);
      ids.add(visit.id);
      dates.add(visit.visited_on);
    }
    for (let index = 0; index <= Math.min(dates.size, 10000); index++) {
      const proposed = occurrence(plan, index);
      if (proposed === null) return null;
      if (!dates.has(proposed)) return proposed;
    }
    throw Error();
  } catch {
    throw Error('Saved-plan date proposal unavailable · UNKNOWN');
  }
}
