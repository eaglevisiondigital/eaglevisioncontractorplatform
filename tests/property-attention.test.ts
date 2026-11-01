import { describe, expect, it } from 'vitest';
import { buildPropertyAttention } from '../src/domain/property/attention';
import type { PublishedReport } from '../src/domain/property/inspections';
import { sampleCompanies } from '../src/domain/platform';
import { releasePreviewVersion } from '../src/lib/release';
import {
  projectIssuedReview,
  type CustomerContext,
} from '../src/domain/customer/review';
const uid = () => crypto.randomUUID();
const context: CustomerContext = {
  organization_id: uid(),
  customer_id: uid(),
  location_id: uid(),
  company_name: 'Synthetic contractor',
  primary_color: '#247364',
  property_label: 'Synthetic property',
  reports: true,
  version_ids: [],
};
const finding = (
  id: string = uid(),
  extra: Partial<PublishedReport['findings'][number]> = {},
) => ({
  id,
  category: 'Damage',
  location: 'East window',
  severity: 'moderate' as const,
  description: 'Gap documented in exterior seal.',
  recommendation: 'Ask the contractor to assess the seal.',
  ...extra,
});
function report(
  date: string,
  findings = [finding()],
  version = 1,
): PublishedReport {
  return {
    id: uid(),
    ...context,
    visit_id: uid(),
    visited_on: date,
    phase: 'during',
    version,
    published_at: date + 'T14:00:00Z',
    summary: 'Reviewed inspection',
    findings,
    checklist: [{ label: 'Exterior checked', completed: true }],
  };
}
it('groups repeated identifiers conservatively, distinguishes observations and recommendations, retains all exact sources', () => {
  const id = uid(),
    a = report('2026-10-01', [finding(id)]),
    b = report('2026-10-08', [
      finding(id, {
        severity: 'urgent',
        description: 'Water marks documented below seal.',
      }),
    ]);
  const result = buildPropertyAttention(context, [b, a]);
  const item = result.items[0];
  expect(item.recurring).toBe(true);
  expect(item.inspection_dates).toBe(2);
  expect(item.severity).toBe('urgent');
  expect(item.newly_reported).toBe(false);
  expect(item.changes).toEqual([
    {
      from: '2026-10-01',
      to: '2026-10-08',
      severity: true,
      observation: true,
      recommendation: false,
    },
  ]);
  expect(item.repeated_recommendations).toEqual([
    { text: a.findings[0].recommendation, inspection_dates: 2 },
  ]);
  expect(
    item.observations.map((o) => [o.report_id, o.report_version, o.finding.id]),
  ).toEqual([
    [a.id, 1, id],
    [b.id, 1, id],
  ]);
  expect(item.uncertainties.join(' ')).toContain('not independently confirmed');
  expect(item.repair_status).toBe('undetermined');
  expect(buildPropertyAttention(context, [a, b])).toEqual(result);
});
it('marks first appearance within available history, never asserts when damage began', () => {
  const a = report('2026-10-01', []),
    b = report('2026-10-08');
  const item = buildPropertyAttention(context, [a, b]).items[0];
  expect(item.newly_reported).toBe(true);
  expect(item.recurring).toBe(false);
  expect(item.first_reported).toBe(b.visited_on);
  expect(item.repair_status).toBe('undetermined');
});
it('absence from a later inspection, including an empty one, never proves repair', () => {
  const a = report('2026-10-01'),
    b = report('2026-10-08', []);
  const item = buildPropertyAttention(context, [a, b]).items[0];
  expect(item.uncertainties.join(' ')).toContain(
    'absence is not evidence of repair',
  );
  expect(item.repair_status).toBe('undetermined');
  expect(item.changes).toEqual([]);
});
it('similar descriptions under distinct IDs remain independent, explicitly uncertain findings', () => {
  const result = buildPropertyAttention(context, [
    report('2026-10-01'),
    report('2026-10-08'),
  ]);
  expect(result.items).toHaveLength(2);
  for (const item of result.items) {
    expect(item.recurring).toBe(false);
    expect(item.uncertainties.join(' ')).toContain('different finding IDs');
  }
});
it.each(['location', 'category'] as const)(
  'reused ID with another %s remains separate',
  (field) => {
    const id = uid();
    const rows = [
      report('2026-10-01', [finding(id)]),
      report('2026-10-08', [finding(id, { [field]: 'Different area' })]),
    ];
    const items = buildPropertyAttention(context, rows).items;
    expect(items).toHaveLength(2);
    expect(
      items.every(
        (i) =>
          !i.recurring &&
          i.uncertainties.some((u) => u.includes('reused for different')),
      ),
    ).toBe(true);
  },
);
it('generic text finding IDs cannot establish recurrence', () => {
  const items = buildPropertyAttention(context, [
    report('2026-10-01', [finding('repair')]),
    report('2026-10-08', [finding('repair')]),
  ]).items;
  expect(items).toHaveLength(2);
  expect(
    items.every(
      (i) =>
        i.inspection_dates === 1 &&
        i.uncertainties.some((u) => u.includes('no reliable')),
    ),
  ).toBe(true);
});
it('multiple report versions on the same date are evidence, not multiple inspections or condition changes', () => {
  const id = uid(),
    a = report('2026-10-01', [finding(id)]),
    b = report('2026-10-01', [finding(id)], 2);
  const item = buildPropertyAttention(context, [a, b]).items[0];
  expect(item.observations).toHaveLength(2);
  expect(item.inspection_dates).toBe(1);
  expect(item.recurring).toBe(false);
  expect(item.repeated_recommendations).toEqual([]);
  expect(item.changes).toEqual([]);
});
it('conflicting same-date evidence does not select a convenient latest version or imply improvement', () => {
  const id = uid(),
    a = report('2026-10-01', [finding(id)]),
    b = report(
      '2026-10-01',
      [finding(id, { severity: 'low', description: 'Different observation' })],
      2,
    ),
    c = report('2026-10-08', [finding(id, { severity: 'urgent' })]);
  const item = buildPropertyAttention(context, [a, b, c]).items[0];
  expect(item.changes).toEqual([]);
  expect(item.uncertainties.join(' ')).toContain(
    'same inspection date disagree',
  );
  expect(buildPropertyAttention(context, [a, b]).items[0].severity).toBe(
    'undetermined',
  );
});
it('recommendation changes stay distinct from observed changes, with literal text rendering data', () => {
  const id = uid();
  const rows = [
    report('2026-10-01', [finding(id)]),
    report('2026-10-08', [
      finding(id, { recommendation: '<script>Not instructions</script>' }),
    ]),
  ];
  const item = buildPropertyAttention(context, rows).items[0];
  expect(item.changes[0]).toMatchObject({
    severity: false,
    observation: false,
    recommendation: true,
  });
  expect(item.observations[1].finding.recommendation).toContain('<script>');
});
describe('authorized customer-safe evidence boundary', () => {
  it.each(['organization_id', 'customer_id', 'location_id'] as const)(
    'rejects foreign report %s without returning a partial summary',
    (key) => {
      const row = report('2026-10-01');
      row[key] = uid();
      expect(() =>
        buildPropertyAttention(context, [report('2026-10-08'), row]),
      ).toThrow();
    },
  );
  it('rejects duplicate report IDs, bad dates and disabled report access', () => {
    const row = report('2026-10-01');
    expect(() => buildPropertyAttention(context, [row, row])).toThrow();
    expect(() =>
      buildPropertyAttention({ ...context, reports: false }, []),
    ).toThrow();
    expect(() =>
      buildPropertyAttention(context, [{ ...row, visited_on: '2026-02-30' }]),
    ).toThrow();
  });
  it('rejects private/invalid nested findings and strips internal root fields from returned data', () => {
    const row = report('2026-10-01');
    const data = buildPropertyAttention(context, [
      {
        ...row,
        internal_notes: 'INTERNAL',
        unit_cost_minor: 900,
      } as PublishedReport,
    ]);
    expect(JSON.stringify(data)).not.toMatch(
      /INTERNAL|unit_cost_minor|payroll|internal_notes/,
    );
    Object.assign(row.findings[0], {
      customer_visible: false,
      internal_notes: 'PRIVATE',
    });
    expect(() => buildPropertyAttention(context, [row])).toThrow();
  });
  it('returns independent snapshots and distinguishes no reports from reports without concerns', () => {
    expect(buildPropertyAttention(context, [])).toMatchObject({
      reports_available: 0,
      items: [],
      latest_inspection: null,
    });
    expect(
      buildPropertyAttention(context, [report('2026-10-01', [])]),
    ).toMatchObject({ reports_available: 1, items: [] });
    const row = report('2026-10-01');
    const result = buildPropertyAttention(context, [row]);
    result.items[0].observations[0].finding.description = 'Changed';
    expect(row.findings[0].description).not.toBe('Changed');
  });
  it('links only an allowed issued version with the exact report/finding and rejects forged estimate boundaries/private fields', () => {
    const row = report('2026-10-01');
    const version = releasePreviewVersion(sampleCompanies[0]);
    version.organization_id = context.organization_id;
    version.payload.customer_id = context.customer_id;
    version.payload.location_id = context.location_id;
    const c = { ...context, version_ids: [version.id] };
    const review = projectIssuedReview(version, c, {
      source_report_id: row.id,
      finding_id: row.findings[0].id,
      source_line_id: version.payload.lines[0].id,
    });
    const attention = buildPropertyAttention(c, [row], [review]);
    expect(attention.items[0].repair_scopes).toEqual([
      {
        version_id: version.id,
        version_number: version.version_number,
        source_report_id: row.id,
        finding_id: row.findings[0].id,
      },
    ]);
    expect(JSON.stringify(attention)).not.toMatch(
      /amount_minor|unit_cost|subtotal|terms|internal_note/,
    );
    expect(
      buildPropertyAttention(c, [row], [{ ...review, finding_id: uid() }])
        .items[0].repair_scopes,
    ).toEqual([]);
    expect(
      buildPropertyAttention(c, [row], [{ ...review, source_report_id: uid() }])
        .items[0].repair_scopes,
    ).toEqual([]);
    for (const key of [
      'organization_id',
      'customer_id',
      'location_id',
      'version_id',
    ] as const)
      expect(() =>
        buildPropertyAttention(c, [row], [{ ...review, [key]: uid() }]),
      ).toThrow();
    expect(() =>
      buildPropertyAttention(
        c,
        [row],
        [{ ...review, unit_cost_minor: 100 } as typeof review],
      ),
    ).toThrow();
  });
});
