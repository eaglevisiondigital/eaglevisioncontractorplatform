import { Temporal } from '@js-temporal/polyfill';
import { maintenanceDate } from '../../domain/property/maintenance';
import type { FieldFilters } from '../../lib/field-scheduling';

/** Presentation filters over recorded property dates, never a planned shift. */
export function scheduleWeek(
  anchor: string,
  offset: -1 | 0 | 1 = 0,
): Pick<FieldFilters, 'from' | 'to'> | null {
  try {
    maintenanceDate(anchor);
    const date = Temporal.PlainDate.from(anchor);
    const start = date
      .subtract({ days: date.dayOfWeek - 1 })
      .add({ weeks: offset });
    const range = {
      from: start.toString(),
      to: start.add({ days: 6 }).toString(),
    };
    maintenanceDate(range.from);
    maintenanceDate(range.to);
    return range;
  } catch {
    return null;
  }
}
