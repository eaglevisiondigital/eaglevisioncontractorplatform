import { Temporal } from '@js-temporal/polyfill';

export interface CapacityInterval {
  key: string;
  worker_id: string;
  job_id: string;
  visit_id: string | null;
  start: number;
  end: number;
}
export interface CapacityHours {
  worker_id: string;
  start: number;
  end: number;
}
export interface CapacityOverlap {
  worker_id: string;
  kind:
    | 'WORK_ORDER_OVERLAP'
    | 'VISIT_OVERLAP'
    | 'SAME_SOURCE_WINDOWS'
    | 'PROPOSAL_RECORDED_OVERLAP'
    | 'RECORDED_OVERLAP';
  first: string;
  second: string;
  minutes: number;
}
/** Local input has no offset: reject missing and repeated DST wall times. */
export function capacityLocalInstant(value: string, timezone: string) {
  if (
    typeof value !== 'string' ||
    typeof timezone !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    throw Error('Use a complete local date and minute');
  return Temporal.PlainDateTime.from(value, { overflow: 'reject' })
    .toZonedDateTime(timezone, { disambiguation: 'reject' })
    .toInstant().epochMilliseconds;
}
export function capacityDay(day: string, timezone: string) {
  if (
    typeof day !== 'string' ||
    typeof timezone !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day)
  )
    throw Error('Choose a valid crew day');
  const date = Temporal.PlainDate.from(day, { overflow: 'reject' });
  const start = date.toZonedDateTime(timezone).epochMilliseconds;
  const end = date.add({ days: 1 }).toZonedDateTime(timezone).epochMilliseconds;
  // A skipped civil day cannot be treated as zero available hours.
  if (end <= start)
    throw Error('This civil day is unavailable in the timezone');
  return { start, end, minutes: (end - start) / 60000 };
}
export function capacityWindow(
  start: string,
  end: string,
  timezone: string,
  day: ReturnType<typeof capacityDay>,
) {
  const from = capacityLocalInstant(start, timezone),
    through = capacityLocalInstant(end, timezone);
  if (through <= from || through - from > 48 * 60 * 60000)
    throw Error('Window end must follow start within 48 hours');
  if (from >= day.end || through <= day.start)
    throw Error('Window must overlap the selected crew day');
  return { start: Math.max(from, day.start), end: Math.min(through, day.end) };
}
function union(intervals: { start: number; end: number }[]) {
  const merged: { start: number; end: number }[] = [];
  for (const value of [...intervals].sort((a, b) => a.start - b.start)) {
    if (
      !Number.isFinite(value.start) ||
      !Number.isFinite(value.end) ||
      value.end <= value.start
    )
      throw Error('Invalid timed evidence');
    const previous = merged.at(-1);
    if (previous && value.start <= previous.end)
      previous.end = Math.max(previous.end, value.end);
    else merged.push({ start: value.start, end: value.end });
  }
  return merged;
}
const duration = (rows: { start: number; end: number }[]) =>
  union(rows).reduce((total, row) => total + (row.end - row.start) / 60000, 0);
const overlap = (
  a: { start: number; end: number },
  b: { start: number; end: number },
) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 60000;
const identical = (a: CapacityInterval, b: CapacityInterval) =>
  a.key === b.key &&
  a.worker_id === b.worker_id &&
  a.start === b.start &&
  a.end === b.end;

/** Pure duration arithmetic only; inputs do not grant access or dispatch authority. */
export function calculateCrewCapacity(
  workers: string[],
  proposals: CapacityInterval[],
  hours: CapacityHours[],
  recorded: CapacityInterval[],
  recordedUnknown: string[],
) {
  if (new Set(workers).size !== workers.length)
    throw Error('Worker identity is ambiguous');
  for (const row of [...proposals, ...hours, ...recorded])
    if (!workers.includes(row.worker_id))
      throw Error('Foreign worker evidence');
  const planned = proposals.filter(
    (row, index) =>
      !proposals.slice(0, index).some((prior) => identical(row, prior)),
  );
  const overlaps: CapacityOverlap[] = [];
  const add = (
    a: CapacityInterval,
    b: CapacityInterval,
    kind: CapacityOverlap['kind'],
  ) => {
    const minutes = overlap(a, b);
    if (a.worker_id === b.worker_id && minutes > 0)
      overlaps.push({
        worker_id: a.worker_id,
        kind,
        first: a.key,
        second: b.key,
        minutes,
      });
  };
  planned.forEach((row, i) => {
    planned
      .slice(i + 1)
      .forEach((other) =>
        add(
          row,
          other,
          row.key === other.key
            ? 'SAME_SOURCE_WINDOWS'
            : row.visit_id || other.visit_id
              ? 'VISIT_OVERLAP'
              : 'WORK_ORDER_OVERLAP',
        ),
      );
    recorded.forEach((entry) => add(row, entry, 'PROPOSAL_RECORDED_OVERLAP'));
  });
  recorded.forEach((row, i) =>
    recorded
      .slice(i + 1)
      .forEach((other) => add(row, other, 'RECORDED_OVERLAP')),
  );
  return {
    duplicate_proposals_ignored: proposals.length - planned.length,
    overlaps,
    workers: workers.map((worker_id) => {
      const windows = planned.filter((row) => row.worker_id === worker_id),
        available = union(hours.filter((row) => row.worker_id === worker_id)),
        planned_union = union(windows),
        planned_minutes = duration(planned_union),
        proposed_available_minutes = available.length
          ? duration(available)
          : null,
        within = planned_union.reduce(
          (total, row) =>
            total +
            available.reduce((sum, period) => sum + overlap(row, period), 0),
          0,
        ),
        outside_proposed_hours_minutes = available.length
          ? planned_minutes - within
          : null;
      return {
        worker_id,
        planned_minutes,
        proposed_available_minutes,
        outside_proposed_hours_minutes,
        unused_proposed_minutes:
          proposed_available_minutes === null
            ? null
            : proposed_available_minutes - within,
        capacity_state:
          proposed_available_minutes === null
            ? ('UNKNOWN' as const)
            : outside_proposed_hours_minutes! > 0
              ? ('OUTSIDE_PROPOSED_HOURS' as const)
              : ('WITHIN_PROPOSED_HOURS' as const),
        recorded_minutes: recordedUnknown.includes(worker_id)
          ? null
          : duration(recorded.filter((row) => row.worker_id === worker_id)),
        known_recorded_minutes: duration(
          recorded.filter((row) => row.worker_id === worker_id),
        ),
        recorded_coverage: recordedUnknown.includes(worker_id)
          ? ('UNKNOWN' as const)
          : ('AVAILABLE_RECORDS_ONLY' as const),
      };
    }),
  };
}
