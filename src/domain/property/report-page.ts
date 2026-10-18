import { Temporal } from '@js-temporal/polyfill';
import type { PublishedReport } from './inspections';

export interface ReportBoundary {
  organization_id: string;
  customer_id: string;
  location_id: string;
}
export interface PropertyReportPage extends ReportBoundary {
  reports: (Pick<PublishedReport, 'id' | 'version' | 'published_at'> & {
    snapshot: Pick<
      PublishedReport,
      'visited_on' | 'phase' | 'summary' | 'findings' | 'checklist'
    > & { media: never[] };
  })[];
  media: never[];
  mode: 'internal-development';
  report_only: true;
}
export const reportUuid = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s);
const keys = (v: unknown, expected: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === expected.length &&
  expected.every((k) => Object.hasOwn(v, k));
const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function report(v: unknown) {
  if (
    !keys(v, ['id', 'version', 'published_at', 'snapshot']) ||
    !reportUuid(v.id) ||
    !Number.isSafeInteger(v.version) ||
    Number(v.version) < 1 ||
    typeof v.published_at !== 'string'
  )
    return false;
  Temporal.Instant.from(v.published_at);
  const s = v.snapshot;
  if (
    !keys(s, [
      'summary',
      'visited_on',
      'phase',
      'checklist',
      'findings',
      'media',
    ]) ||
    !text(s.summary, 2000) ||
    typeof s.visited_on !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s.visited_on) ||
    !['before', 'during', 'after'].includes(String(s.phase)) ||
    !Array.isArray(s.media) ||
    s.media.length ||
    !Array.isArray(s.findings) ||
    s.findings.length > 100 ||
    !Array.isArray(s.checklist) ||
    s.checklist.length > 100
  )
    return false;
  if (
    Temporal.PlainDate.from(s.visited_on, { overflow: 'reject' }).toString() !==
    s.visited_on
  )
    return false;
  const ids = new Set();
  return (
    s.findings.every((x) => {
      if (
        !keys(x, [
          'id',
          'category',
          'location',
          'severity',
          'description',
          'recommendation',
        ]) ||
        !text(x.id, 100) ||
        ids.has(x.id) ||
        !text(x.category, 100) ||
        !text(x.location, 200) ||
        !['low', 'moderate', 'urgent'].includes(String(x.severity)) ||
        !text(x.description, 1000) ||
        !text(x.recommendation, 1000)
      )
        return false;
      ids.add(x.id);
      return true;
    }) &&
    s.checklist.every(
      (x) =>
        keys(x, ['label', 'completed']) &&
        text(x.label, 200) &&
        typeof x.completed === 'boolean',
    )
  );
}
/** Fail closed at the read boundary, before rendering/caching any payload. SQL remains authoritative. */
export function parsePropertyReportPage(
  value: unknown,
  boundary: ReportBoundary,
): PropertyReportPage {
  try {
    if (
      !keys(boundary, ['organization_id', 'customer_id', 'location_id']) ||
      !Object.values(boundary).every(reportUuid) ||
      !keys(value, [
        'organization_id',
        'customer_id',
        'location_id',
        'reports',
        'media',
        'mode',
        'report_only',
      ]) ||
      value.organization_id !== boundary.organization_id ||
      value.customer_id !== boundary.customer_id ||
      value.location_id !== boundary.location_id ||
      value.mode !== 'internal-development' ||
      value.report_only !== true ||
      !Array.isArray(value.media) ||
      value.media.length ||
      !Array.isArray(value.reports) ||
      value.reports.length > 50 ||
      !value.reports.every(report) ||
      new Set(value.reports.map((r) => r.id)).size !== value.reports.length
    )
      throw Error();
    return structuredClone(value) as unknown as PropertyReportPage;
  } catch {
    throw Error('Invalid report-only response');
  }
}
