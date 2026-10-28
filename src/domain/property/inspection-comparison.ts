import { buildPropertyAttention, type AttentionObservation } from './attention';
import type { PublishedReport } from './inspections';
import type { CustomerContext, CustomerReview } from '../customer/review';
import { projectPublishedHistory } from './report-page';

export interface ReportReference {
  id: string;
  version: number;
}
type ChecklistEvidence = {
  report_id: string;
  report_version: number;
  source_index: number;
  label: string;
  completed: boolean;
};
export interface InspectionComparison {
  organization_id: string;
  customer_id: string;
  location_id: string;
  same_date: boolean;
  sides: {
    report: ReturnType<typeof projectPublishedHistory>[number];
    frequency: 'once' | 'weekly' | 'monthly' | 'custom' | 'unknown';
  }[];
  checklist: {
    key: string;
    label: string;
    earlier: ChecklistEvidence | null;
    later: ChecklistEvidence | null;
    result_differs: boolean | null;
    uncertainty: string;
  }[];
  findings: {
    key: string;
    category: string;
    location: string;
    presence: 'both' | 'earlier_only' | 'later_only' | 'unmatched';
    earlier: AttentionObservation | null;
    later: AttentionObservation | null;
    differences: {
      severity: boolean;
      observation: boolean;
      recommendation: boolean;
    } | null;
    uncertainties: string[];
    repair_scopes: ReturnType<
      typeof buildPropertyAttention
    >['items'][number]['repair_scopes'];
    repair_status: 'undetermined';
  }[];
}

/** Published evidence comparison only. Full authorized history detects identifier
 * collisions outside the selected pair. No fuzzy matching or issue-state mutation. */
export function comparePublishedInspections(
  context: CustomerContext,
  reports: PublishedReport[],
  first: ReportReference,
  second: ReportReference,
  reviews: CustomerReview[] = [],
  cadences: Record<string, string> = {},
): InspectionComparison {
  const attention = buildPropertyAttention(context, reports, reviews);
  const history = projectPublishedHistory(reports, context);
  const selected = [first, second].map((ref) =>
    history.find((r) => r.id === ref.id && r.version === ref.version),
  );
  if (!selected[0] || !selected[1] || first.id === second.id)
    throw Error('Select two distinct available published reports');
  // Same-date evidence retains selection order; version/publication is not visit chronology.
  const ordered = [selected[0], selected[1]].sort((a, b) =>
    a.snapshot.visited_on.localeCompare(b.snapshot.visited_on),
  );
  const [a, b] = ordered;
  const sameDate = a.snapshot.visited_on === b.snapshot.visited_on;
  const checklist: InspectionComparison['checklist'] = [];
  const labels = new Set([
    ...a.snapshot.checklist.map((c) => c.label),
    ...b.snapshot.checklist.map((c) => c.label),
  ]);
  const rows = (r: typeof a, label: string) =>
    r.snapshot.checklist.flatMap((c, index) =>
      c.label === label
        ? [
            {
              report_id: r.id,
              report_version: r.version,
              source_index: index,
              ...c,
            },
          ]
        : [],
    );
  for (const label of labels) {
    const left = rows(a, label),
      right = rows(b, label);
    if (left.length === 1 && right.length === 1) {
      checklist.push({
        key: JSON.stringify([label]),
        label,
        earlier: left[0],
        later: right[0],
        result_differs: left[0].completed !== right[0].completed,
        uncertainty:
          'Exact label comparison only. Published checklist item IDs are unavailable; physical task continuity cannot be verified.',
      });
    } else {
      for (const c of [...left, ...right])
        checklist.push({
          key: JSON.stringify([c.report_id, c.source_index]),
          label,
          earlier: c.report_id === a.id ? c : null,
          later: c.report_id === b.id ? c : null,
          result_differs: null,
          uncertainty:
            left.length > 1 || right.length > 1
              ? 'Duplicate checklist labels cannot establish item identity. Entries remain separate.'
              : 'No exact checklist label on the other report. Missing information does not establish task completion.',
        });
    }
  }
  return {
    organization_id: context.organization_id,
    customer_id: context.customer_id,
    location_id: context.location_id,
    same_date: sameDate,
    sides: ordered.map((report) => ({
      report,
      frequency: (['once', 'weekly', 'monthly', 'custom'].includes(
        cadences[report.id],
      )
        ? cadences[report.id]
        : 'unknown') as InspectionComparison['sides'][number]['frequency'],
    })),
    checklist,
    findings: attention.items.flatMap((item) => {
      const earlier =
        item.observations.find((o) => o.report_id === a.id) ?? null;
      const later = item.observations.find((o) => o.report_id === b.id) ?? null;
      if (!earlier && !later) return [];
      const uncertainties = [
        ...item.uncertainties.filter(
          (u) => !u.startsWith('Not mentioned in the latest'),
        ),
      ];
      if (!earlier || !later)
        uncertainties.push(
          'No supported matching observation on the other selected report. Absence is not evidence of repair; current condition remains unknown.',
        );
      if (sameDate)
        uncertainties.push(
          'Same inspection date: these are selected report versions, not evidence of recurrence or chronological condition change.',
        );
      return [
        {
          key: item.id,
          category: item.category,
          location: item.location,
          presence:
            earlier && later
              ? 'both'
              : sameDate
                ? 'unmatched'
                : earlier
                  ? 'earlier_only'
                  : 'later_only',
          earlier,
          later,
          differences:
            earlier && later
              ? {
                  severity: earlier.finding.severity !== later.finding.severity,
                  observation:
                    earlier.finding.description !== later.finding.description,
                  recommendation:
                    earlier.finding.recommendation !==
                    later.finding.recommendation,
                }
              : null,
          uncertainties,
          repair_scopes: item.repair_scopes.filter(
            (s) => s.source_report_id === a.id || s.source_report_id === b.id,
          ),
          repair_status: 'undetermined',
        },
      ];
    }),
  };
}
