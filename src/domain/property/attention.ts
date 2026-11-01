import type { PublishedReport } from './inspections';
import { projectPublishedHistory, reportUuid } from './report-page';
import {
  parseCustomerReview,
  type CustomerContext,
  type CustomerReview,
} from '../customer/review';

type SafeFinding = PublishedReport['findings'][number];
export interface AttentionObservation {
  report_id: string;
  report_version: number;
  visited_on: string;
  published_at: string;
  finding: SafeFinding;
}
export interface AttentionItem {
  id: string;
  category: string;
  location: string;
  severity: SafeFinding['severity'] | 'undetermined';
  first_reported: string;
  last_reported: string;
  newly_reported: boolean;
  inspection_dates: number;
  recurring: boolean;
  observations: AttentionObservation[];
  changes: {
    from: string;
    to: string;
    severity: boolean;
    observation: boolean;
    recommendation: boolean;
  }[];
  repeated_recommendations: { text: string; inspection_dates: number }[];
  uncertainties: string[];
  repair_scopes: {
    version_id: string;
    version_number: number;
    source_report_id: string;
    finding_id: string;
  }[];
  repair_status: 'undetermined';
}
export interface PropertyAttention {
  organization_id: string;
  customer_id: string;
  location_id: string;
  reports_available: number;
  latest_inspection: string | null;
  items: AttentionItem[];
}
const tuple = (...parts: string[]) => JSON.stringify(parts);
const observationValue = (o: AttentionObservation) =>
  tuple(o.finding.severity, o.finding.description, o.finding.recommendation);

/** Derived presentation only. Input must already come from authorized published sources.
 * No text similarity, inferred completion, independent grant or mutation authority. */
export function buildPropertyAttention(
  context: CustomerContext,
  reports: PublishedReport[],
  reviews: CustomerReview[] = [],
): PropertyAttention {
  if (
    !context.reports ||
    reports.length > 500 ||
    new Set(reports.map((r) => r.id)).size !== reports.length
  )
    throw Error('Property attention unavailable');
  const history = projectPublishedHistory(reports, context);
  const latest =
    history
      .map((r) => r.snapshot.visited_on)
      .sort()
      .at(-1) ?? null;
  const groups = new Map<string, AttentionObservation[]>();
  const idBoundaries = new Map<string, Set<string>>();
  const wordingIds = new Map<string, Set<string>>();
  for (const r of history)
    for (const f of r.snapshot.findings) {
      const area = tuple(f.category, f.location);
      const boundaries = idBoundaries.get(f.id) ?? new Set<string>();
      boundaries.add(area);
      idBoundaries.set(f.id, boundaries);
      const signature = tuple(f.category, f.location, f.description);
      const ids = wordingIds.get(signature) ?? new Set<string>();
      ids.add(f.id);
      wordingIds.set(signature, ids);
    }
  for (const r of history)
    for (const f of r.snapshot.findings) {
      const trackable = reportUuid(f.id) && idBoundaries.get(f.id)?.size === 1;
      const key = trackable
        ? tuple(f.id, f.category, f.location)
        : tuple(r.id, f.id);
      const group = groups.get(key) ?? [];
      group.push({
        report_id: r.id,
        report_version: r.version,
        visited_on: r.snapshot.visited_on,
        published_at: r.published_at,
        finding: structuredClone(f),
      });
      groups.set(key, group);
    }
  const safeReviews = reviews.map((v) =>
    parseCustomerReview(v, context, v.version_id),
  );
  if (new Set(safeReviews.map((v) => v.version_id)).size !== safeReviews.length)
    throw Error('Property attention unavailable');
  const items: AttentionItem[] = [];
  for (const [key, observations] of groups) {
    observations.sort(
      (a, b) =>
        a.visited_on.localeCompare(b.visited_on) ||
        a.published_at.localeCompare(b.published_at) ||
        a.report_id.localeCompare(b.report_id),
    );
    const first = observations[0],
      last = observations.at(-1)!;
    const dates = [...new Set(observations.map((o) => o.visited_on))];
    const uncertainties: string[] = [];
    if (!reportUuid(first.finding.id))
      uncertainties.push(
        'This report has no reliable cross-inspection finding identifier. It remains separate.',
      );
    if (idBoundaries.get(first.finding.id)!.size > 1)
      uncertainties.push(
        'The finding identifier is reused for different categories or locations. These observations remain separate.',
      );
    if (
      observations.some(
        (o) =>
          wordingIds.get(
            tuple(
              o.finding.category,
              o.finding.location,
              o.finding.description,
            ),
          )!.size > 1,
      )
    )
      uncertainties.push(
        'Similar wording appears under different finding IDs. No relationship is assumed.',
      );
    const coherent = dates.map((date) => {
      const rows = observations.filter((o) => o.visited_on === date);
      return new Set(rows.map(observationValue)).size === 1 ? rows[0] : null;
    });
    if (coherent.some((o) => !o))
      uncertainties.push(
        'Reports on the same inspection date disagree. Condition changes cannot be reliably determined for that date.',
      );
    if (last.visited_on !== latest)
      uncertainties.push(
        'Not mentioned in the latest available inspection. Its current condition is unknown; absence is not evidence of repair.',
      );
    if (dates.length > 1)
      uncertainties.push(
        'Continuity is based on a repeated published identifier, category and location; the contractor has not independently confirmed the same physical issue.',
      );
    const changes: AttentionItem['changes'] = [];
    for (let i = 1; i < coherent.length; i++) {
      const a = coherent[i - 1],
        b = coherent[i];
      if (!a || !b) continue;
      const severity = a.finding.severity !== b.finding.severity;
      const observation = a.finding.description !== b.finding.description;
      const recommendation =
        a.finding.recommendation !== b.finding.recommendation;
      if (severity || observation || recommendation)
        changes.push({
          from: a.visited_on,
          to: b.visited_on,
          severity,
          observation,
          recommendation,
        });
    }
    const recommendations = [
      ...new Set(observations.map((o) => o.finding.recommendation)),
    ]
      .map((text) => ({
        text,
        inspection_dates: new Set(
          observations
            .filter((o) => o.finding.recommendation === text)
            .map((o) => o.visited_on),
        ).size,
      }))
      .filter((r) => r.inspection_dates > 1);
    const latestRows = observations.filter(
      (o) => o.visited_on === last.visited_on,
    );
    const severities = new Set(latestRows.map((o) => o.finding.severity));
    const scopes = safeReviews.filter((v) =>
      observations.some(
        (o) =>
          o.report_id === v.source_report_id && o.finding.id === v.finding_id,
      ),
    );
    items.push({
      id: key,
      category: first.finding.category,
      location: first.finding.location,
      severity: severities.size === 1 ? last.finding.severity : 'undetermined',
      first_reported: first.visited_on,
      last_reported: last.visited_on,
      newly_reported: first.visited_on === latest,
      inspection_dates: dates.length,
      recurring: dates.length > 1,
      observations,
      changes,
      repeated_recommendations: recommendations,
      uncertainties,
      repair_scopes: scopes.map((v) => ({
        version_id: v.version_id,
        version_number: v.version_number,
        source_report_id: v.source_report_id!,
        finding_id: v.finding_id!,
      })),
      repair_status: 'undetermined',
    });
  }
  const priority = { urgent: 0, moderate: 1, low: 2, undetermined: 3 };
  items.sort(
    (a, b) =>
      priority[a.severity] - priority[b.severity] ||
      b.last_reported.localeCompare(a.last_reported) ||
      a.id.localeCompare(b.id),
  );
  return {
    organization_id: context.organization_id,
    customer_id: context.customer_id,
    location_id: context.location_id,
    reports_available: history.length,
    latest_inspection: latest,
    items,
  };
}
