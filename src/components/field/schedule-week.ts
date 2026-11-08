import { Temporal } from '@js-temporal/polyfill';
import { maintenanceDate } from '../../domain/property/maintenance';
import type {
  FieldFilters,
  FieldVisitReference,
  FieldVisitRow,
} from '../../lib/field-scheduling';

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

/** Exact-property browsing over existing rows; never infer missing service history. */
export function propertyVisitHistory(
  rows: FieldVisitRow[],
  selected: FieldVisitReference,
): FieldVisitRow[] {
  if (
    !rows.some((row) => JSON.stringify(row.source) === JSON.stringify(selected))
  )
    return [];
  return rows.filter(
    (row) =>
      row.source.organization_id === selected.organization_id &&
      row.source.customer_id === selected.customer_id &&
      row.source.location_id === selected.location_id,
  );
}
