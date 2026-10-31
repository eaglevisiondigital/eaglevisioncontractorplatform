import { expect, it } from 'vitest';
import { comparePublishedInspections } from '../src/domain/property/inspection-comparison';
import type { PublishedReport } from '../src/domain/property/inspections';
import {
  projectIssuedReview,
  type CustomerContext,
} from '../src/domain/customer/review';
import { releasePreviewVersion } from '../src/lib/release';
import { sampleCompanies } from '../src/domain/platform';
const uid = () => crypto.randomUUID();
const context: CustomerContext = {
  organization_id: uid(),
  customer_id: uid(),
  location_id: uid(),
  company_name: 'Synthetic',
  primary_color: '#247364',
  property_label: 'Synthetic property',
  reports: true,
  version_ids: [],
};
const id = uid();
const finding = (extra: Partial<PublishedReport['findings'][number]> = {}) => ({
  id,
  category: 'Damage',
  location: 'East window',
  severity: 'moderate' as const,
  description: 'Gap documented.',
  recommendation: 'Request assessment.',
  ...extra,
});
function report(date = '2026-10-01'): PublishedReport {
  return {
    ...context,
    id: uid(),
    visit_id: uid(),
    visited_on: date,
    phase: 'during',
    version: 3,
    published_at: date + 'T12:00:00Z',
    summary: 'Synthetic published inspection',
    findings: [finding()],
    checklist: [{ label: 'Exterior', completed: true }],
  };
}
const pair = () => [report(), report('2026-10-08')] as const;
const run = (a: PublishedReport, b: PublishedReport) =>
  comparePublishedInspections(context, [a, b], a, b);
it('orders by inspection date and retains exact published identities, cadence and independent immutable snapshots', () => {
  const [a, b] = pair();
  b.version = 7;
  const before = structuredClone([a, b]);
  const result = comparePublishedInspections(context, [b, a], b, a, [], {
    [a.id]: 'weekly',
    [b.id]: 'monthly',
  });
  expect(
    result.sides.map((s) => [s.report.id, s.report.version, s.frequency]),
  ).toEqual([
    [a.id, 3, 'weekly'],
    [b.id, 7, 'monthly'],
  ]);
  expect([a, b]).toEqual(before);
  result.sides[0].report.snapshot.findings[0].description =
    'Edited returned projection';
  expect(a.findings[0].description).toBe('Gap documented.');
  expect(result.findings[0].repair_status).toBe('undetermined');
});
it('separates factual severity, observation and recommendation differences', () => {
  const [a, b] = pair();
  b.findings[0].recommendation = 'A different recommendation';
  expect(run(a, b).findings[0].differences).toEqual({
    severity: false,
    observation: false,
    recommendation: true,
  });
  b.findings[0].severity = 'urgent';
  b.findings[0].description = 'Different recorded observation';
  const row = run(a, b).findings[0];
  expect(row.presence).toBe('both');
  expect(row.differences).toEqual({
    severity: true,
    observation: true,
    recommendation: true,
  });
  expect(row.uncertainties.join(' ')).toContain('not independently confirmed');
});
it('omission never means repaired; later-only is limited to selected evidence, even when present in older history', () => {
  const [a, b] = pair();
  const older = report('2026-09-01');
  a.findings = [];
  const r = comparePublishedInspections(context, [older, a, b], a, b)
    .findings[0];
  expect(r.presence).toBe('later_only');
  expect(r.repair_status).toBe('undetermined');
  expect(r.uncertainties.join(' ')).toContain(
    'Absence is not evidence of repair',
  );
  expect(run(b, { ...a, visited_on: '2026-10-15' }).findings[0].presence).toBe(
    'earlier_only',
  );
});
it('identical wording and generic IDs do not establish a match', () => {
  const [a, b] = pair();
  b.findings[0].id = uid();
  const r = run(a, b);
  expect(r.findings).toHaveLength(2);
  expect(
    r.findings.every(
      (f) =>
        !f.differences &&
        f.uncertainties.some((u) => u.includes('different finding IDs')),
    ),
  ).toBe(true);
  a.findings[0].id = 'repair';
  b.findings[0].id = 'repair';
  expect(run(a, b).findings).toHaveLength(2);
});
it.each(['category', 'location'] as const)(
  'colliding %s IDs stay separate, including conflicts outside the selected pair',
  (key) => {
    const [a, b] = pair();
    const other = report('2026-10-15');
    other.findings[0][key] = 'Different';
    const r = comparePublishedInspections(context, [a, b, other], a, b);
    expect(r.findings).toHaveLength(2);
    expect(r.findings.every((f) => f.differences === null)).toBe(true);
    expect(r.findings[0].uncertainties.join(' ')).toContain(
      'reused for different',
    );
  },
);
it('same-date versions preserve selection order without claiming recurrence or temporal change', () => {
  const a = report(),
    b = report();
  b.version = 9;
  b.findings[0].severity = 'low';
  const r = comparePublishedInspections(context, [a, b], b, a);
  expect(r.same_date).toBe(true);
  expect(r.sides[0].report.version).toBe(9);
  expect(r.findings[0].uncertainties.join(' ')).toContain(
    'not evidence of recurrence',
  );
  a.findings = [];
  expect(run(a, b).findings[0].presence).toBe('unmatched');
});
it('checklists compare exact unique label results, retaining report/version/source position without inventing stable IDs', () => {
  const [a, b] = pair();
  b.checklist[0].completed = false;
  const c = run(a, b).checklist[0];
  expect(c.result_differs).toBe(true);
  expect(c.earlier).toEqual({
    report_id: a.id,
    report_version: 3,
    source_index: 0,
    ...a.checklist[0],
  });
  expect(c.uncertainty).toContain('IDs are unavailable');
  b.checklist[0].label = 'Renamed exterior';
  expect(run(a, b).checklist).toHaveLength(2);
  expect(run(a, b).checklist.every((c) => c.result_differs === null)).toBe(
    true,
  );
});
it('duplicate checklist labels remain separate; missing checklist/finding observations remain explicit', () => {
  const [a, b] = pair();
  a.checklist.push({ ...a.checklist[0], completed: false });
  expect(run(a, b).checklist).toHaveLength(3);
  expect(
    run(a, b).checklist.every(
      (c) => c.result_differs === null && c.uncertainty.includes('Duplicate'),
    ),
  ).toBe(true);
  a.checklist = [];
  b.checklist = [];
  a.findings = [];
  b.findings = [];
  expect(run(a, b)).toMatchObject({ checklist: [], findings: [] });
});
it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'rejects foreign %s in full history, not just selection',
  (key) => {
    const [a, b] = pair(),
      foreign = report();
    foreign[key] = uid();
    expect(() =>
      comparePublishedInspections(context, [a, b, foreign], a, b),
    ).toThrow();
  },
);
it('rejects unavailable, stale version, duplicate selection/source IDs and disabled access', () => {
  const [a, b] = pair();
  for (const other of [{ ...b, id: uid() }, { ...b, version: 4 }, a])
    expect(() =>
      comparePublishedInspections(context, [a, b], a, other),
    ).toThrow();
  expect(() => comparePublishedInspections(context, [a, b, a], a, b)).toThrow();
  expect(() =>
    comparePublishedInspections({ ...context, reports: false }, [a, b], a, b),
  ).toThrow();
});
it('fails closed on missing observation values or private nested data; excludes root financial/private data', () => {
  const [a, b] = pair();
  Object.assign(a, {
    internal_notes: 'PRIVATE',
    unit_cost_minor: 900,
    payroll: 'SECRET',
    media: ['private'],
  });
  expect(JSON.stringify(run(a, b))).not.toMatch(
    /PRIVATE|SECRET|unit_cost|payroll|media.*private/,
  );
  for (const key of ['description', 'recommendation'] as const) {
    const bad = structuredClone(b);
    bad.findings[0][key] = '';
    expect(() => run(a, bad)).toThrow();
  }
  Object.assign(b.findings[0], { internal_notes: 'PRIVATE' });
  expect(() => run(a, b)).toThrow();
});
it('issued scope navigation requires exact selected report/finding and allowlisted version, returning no financial payload', () => {
  const [a, b] = pair();
  const v = releasePreviewVersion(sampleCompanies[0]);
  v.organization_id = context.organization_id;
  v.payload.customer_id = context.customer_id;
  v.payload.location_id = context.location_id;
  const c = { ...context, version_ids: [v.id] };
  const review = projectIssuedReview(v, c, {
    source_report_id: a.id,
    finding_id: id,
    source_line_id: v.payload.lines[0].id,
  });
  const result = comparePublishedInspections(c, [a, b], a, b, [review]);
  expect(result.findings[0].repair_scopes).toEqual([
    {
      version_id: v.id,
      version_number: v.version_number,
      source_report_id: a.id,
      finding_id: id,
    },
  ]);
  expect(JSON.stringify(result)).not.toMatch(
    /amount_minor|subtotal|terms|unit_cost|margin/,
  );
  for (const key of ['source_report_id', 'finding_id'] as const)
    expect(
      comparePublishedInspections(c, [a, b], a, b, [
        { ...review, [key]: uid() },
      ]).findings[0].repair_scopes,
    ).toEqual([]);
  for (const key of [
    'organization_id',
    'customer_id',
    'location_id',
    'version_id',
  ] as const)
    expect(() =>
      comparePublishedInspections(c, [a, b], a, b, [
        { ...review, [key]: uid() },
      ]),
    ).toThrow();
  expect(() =>
    comparePublishedInspections(c, [a, b], a, b, [
      Object.assign({ ...review }, { internal_notes: 'PRIVATE' }),
    ]),
  ).toThrow();
});
it('untrusted frequency metadata never enters the safe view', () => {
  const [a, b] = pair();
  expect(
    comparePublishedInspections(context, [a, b], a, b, [], {
      [a.id]: 'INTERNAL payroll',
    }).sides[0].frequency,
  ).toBe('unknown');
});
