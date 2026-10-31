import type { PublishedReport } from './inspections';
import { Temporal } from '@js-temporal/polyfill';
import { projectPublishedHistory, type ReportBoundary } from './report-page';

export const emptyHistoryFilters = {
  query: '',
  from: '',
  to: '',
  month: '',
  frequency: '',
  category: '',
  severity: '',
  location: '',
  recommendation: '',
};
export type HistoryFilters = typeof emptyHistoryFilters;
export const historyFrequencies = [
  'once',
  'weekly',
  'monthly',
  'custom',
  'unknown',
] as const;
export function recordedFrequency(value: unknown) {
  return historyFrequencies.includes(
    value as (typeof historyFrequencies)[number],
  )
    ? String(value)
    : 'unknown';
}
function terms(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
function contains(values: string[], query: string) {
  const text = values.join('\n').normalize('NFKC').toLowerCase();
  return terms(query).every((term) => text.includes(term));
}
function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Temporal.PlainDate.from(value, { overflow: 'reject' }).toString() !== value
  )
    throw Error('Use a valid inspection date in YYYY-MM-DD format.');
}
/** Read-only filtering of strictly projected, already authorized property sources.
 * No lookup, index, inference or authorization is performed by the search. */
export function searchInspectionHistory(
  input: PublishedReport[],
  context: ReportBoundary & { reports: boolean },
  filters: HistoryFilters,
  cadences: Record<string, string> = {},
) {
  if (context.reports !== true)
    throw Error('Property reports are unavailable.');
  const boundary = {
    organization_id: context.organization_id,
    customer_id: context.customer_id,
    location_id: context.location_id,
  };
  const reports = projectPublishedHistory(input, boundary);
  if (new Set(reports.map((r) => r.id)).size !== reports.length)
    throw Error('Duplicate published report identity.');
  if (
    !filters ||
    Object.keys(filters).length !== Object.keys(emptyHistoryFilters).length ||
    Object.keys(emptyHistoryFilters).some(
      (k) =>
        !Object.hasOwn(filters, k) ||
        typeof filters[k as keyof HistoryFilters] !== 'string',
    )
  )
    throw Error('Invalid history filters.');
  if (filters.query.length > 200 || filters.recommendation.length > 200)
    throw Error('Keep each search to 200 characters or fewer.');
  try {
    if (filters.from) date(filters.from);
    if (filters.to) date(filters.to);
  } catch {
    throw Error('Use a valid inspection date in YYYY-MM-DD format.');
  }
  if (filters.from && filters.to && filters.from > filters.to)
    throw Error('Start date must be on or before end date.');
  const unique = (values: string[]) =>
    [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const options = {
    months: unique(
      reports.map((r) => r.snapshot.visited_on.slice(0, 7)),
    ).reverse(),
    frequencies: historyFrequencies.filter((f) =>
      reports.some((r) => recordedFrequency(cadences[r.id]) === f),
    ),
    categories: unique(
      reports.flatMap((r) => r.snapshot.findings.map((f) => f.category)),
    ),
    severities: ['low', 'moderate', 'urgent'].filter((s) =>
      reports.some((r) => r.snapshot.findings.some((f) => f.severity === s)),
    ),
    locations: unique(
      reports.flatMap((r) => r.snapshot.findings.map((f) => f.location)),
    ),
  };
  for (const [value, allowed] of [
    [filters.month, options.months],
    [filters.frequency, historyFrequencies],
    [filters.category, options.categories],
    [filters.severity, options.severities],
    [filters.location, options.locations],
  ] as const)
    if (value && !(allowed as readonly string[]).includes(value))
      throw Error(
        'A selected filter is unavailable for this property. Clear it to continue.',
      );
  const hasConcernFilter = !!(
    filters.category ||
    filters.severity ||
    filters.location ||
    filters.recommendation.trim()
  );
  const results = reports
    .filter((r) => {
      const s = r.snapshot;
      const matchingFinding = s.findings.some(
        (f) =>
          (!filters.category || f.category === filters.category) &&
          (!filters.severity || f.severity === filters.severity) &&
          (!filters.location || f.location === filters.location) &&
          contains([f.recommendation], filters.recommendation),
      );
      return (
        (!filters.from || s.visited_on >= filters.from) &&
        (!filters.to || s.visited_on <= filters.to) &&
        (!filters.month || s.visited_on.startsWith(filters.month)) &&
        (!filters.frequency ||
          recordedFrequency(cadences[r.id]) === filters.frequency) &&
        (!hasConcernFilter || matchingFinding) &&
        contains(
          [
            s.summary,
            ...s.checklist.map((c) => c.label),
            ...s.findings.flatMap((f) => [
              f.category,
              f.location,
              f.severity,
              f.description,
              f.recommendation,
            ]),
          ],
          filters.query,
        )
      );
    })
    .sort(
      (a, b) =>
        b.snapshot.visited_on.localeCompare(a.snapshot.visited_on) ||
        b.version - a.version ||
        b.published_at.localeCompare(a.published_at) ||
        b.id.localeCompare(a.id),
    );
  return { reports: results, available: reports.length, options };
}
