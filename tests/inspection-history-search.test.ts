import { expect, it } from 'vitest';
import {
  searchInspectionHistory,
  emptyHistoryFilters,
} from '../src/domain/property/history-search';
import type { PublishedReport } from '../src/domain/property/inspections';
const uid = () => crypto.randomUUID();
const context = {
  organization_id: uid(),
  customer_id: uid(),
  location_id: uid(),
  reports: true,
};
const boundary = {
  organization_id: context.organization_id,
  customer_id: context.customer_id,
  location_id: context.location_id,
};
function source(date = '2026-10-01', version = 1): PublishedReport {
  return {
    ...boundary,
    id: uid(),
    visit_id: uid(),
    visited_on: date,
    phase: 'during',
    version,
    published_at: date + 'T12:00:00Z',
    summary: 'Published exterior inspection',
    checklist: [{ label: 'Drain check', completed: false }],
    findings: [
      {
        id: uid(),
        category: 'Damage',
        location: 'East window',
        severity: 'urgent',
        description: 'Gap observed by frame.',
        recommendation: 'Arrange seal assessment.',
      },
      {
        id: uid(),
        category: 'Maintenance',
        location: 'Garden',
        severity: 'low',
        description: 'Leaves documented.',
        recommendation: 'Clear leaf debris.',
      },
    ],
  };
}
function page(
  reports: PublishedReport[] = [source(), source('2026-11-01', 3)],
): PublishedReport[] {
  return reports;
}
const run = (p = page(), f = {}, cadence = {}) =>
  searchInspectionHistory(
    p,
    context,
    { ...emptyHistoryFilters, ...f },
    cadence,
  );
it('combines inclusive dates, frequency, report text and same-finding filters while preserving exact immutable versions', () => {
  const p = page();
  const original = structuredClone(p);
  const first = p[0];
  const r = run(
    p,
    {
      query: 'GAP exterior',
      from: '2026-10-01',
      to: '2026-10-01',
      frequency: 'weekly',
      category: 'Damage',
      severity: 'urgent',
      location: 'East window',
      recommendation: 'seal assessment',
    },
    { [first.id]: 'weekly', [p[1].id]: 'monthly' },
  );
  expect(r.reports.map((r) => [r.id, r.version])).toEqual([[first.id, 1]]);
  expect(r.available).toBe(2);
  expect(p).toEqual(original);
  r.reports[0].snapshot.summary = 'Changed result';
  expect(p).toEqual(original);
});
it('cannot combine category, severity, location or recommendation from unrelated findings', () => {
  const p = page();
  for (const f of [
    { category: 'Damage', severity: 'low' },
    { category: 'Maintenance', location: 'East window' },
    { severity: 'urgent', recommendation: 'leaf' },
  ])
    expect(run(p, f).reports).toEqual([]);
  expect(
    run(p, { category: 'Maintenance', recommendation: 'debris' }).reports,
  ).toHaveLength(2);
});
it('searches only literal allowed report text, with case/Unicode normalization and all-term matching', () => {
  const p = page();
  for (const query of ['DRAIN', 'ｇａｐ', 'assessment window', 'exterior'])
    expect(run(p, { query }).reports).toHaveLength(2);
  for (const query of ['.*', '<script>', p[0].id, 'payroll', 'resolved'])
    expect(run(p, { query }).reports).toEqual([]);
  expect(run(p, { query: '  \n  ' }).reports).toHaveLength(2);
});
it('retains exact same-date report versions, available counts and stable full-history options after filters', () => {
  const p = page([source('2026-10-01'), source('2026-10-01', 8)]);
  const r = run(p, { query: 'unmatched' });
  expect(r.reports).toEqual([]);
  expect(r.available).toBe(2);
  expect(r.options.locations).toEqual(['East window', 'Garden']);
  expect(run(p).reports.map((r) => r.version)).toEqual([8, 1]);
});
it.each(['once', 'weekly', 'monthly', 'custom', 'unknown'])(
  'supports recorded %s frequency without inventing cadence',
  (frequency) => {
    const p = page();
    expect(
      run(
        p,
        { frequency },
        {
          [p[0].id]: frequency,
          [p[1].id]: 'private payroll metadata',
        },
      ).reports,
    ).toHaveLength(frequency === 'unknown' ? 2 : 1);
  },
);
it.each([
  { from: '2026-02-30' },
  { to: '10/01/2026' },
  { from: '2026-11-01', to: '2026-10-01' },
  { month: '2026-99' },
  { severity: 'resolved' },
  { location: 'foreign property' },
  { category: 'unpublished' },
  { frequency: 'daily' },
  { query: 'a'.repeat(201) },
  { recommendation: 'a'.repeat(201) },
])('fails closed on invalid filters %j', (f) =>
  expect(() => run(page(), f)).toThrow(),
);
it('combines month and range, empty properties, individual clearing and full reset', () => {
  const p = page();
  expect(run(p, { month: '2026-10', from: '2026-11-01' }).reports).toEqual([]);
  expect(run(p, { month: '2026-10' }).reports).toHaveLength(1);
  expect(run(p).reports).toHaveLength(2);
  expect(run(page([]))).toMatchObject({ reports: [], available: 0 });
});
it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'rejects a foreign %s even if the filter would conceal its reports',
  (key) => {
    const p = page();
    p[0][key] = uid();
    expect(() => run(p, { query: 'no match' })).toThrow();
  },
);
it('rejects disabled access, duplicates, malformed snapshots and private payload contamination before filtering', () => {
  const p = page();
  expect(() =>
    searchInspectionHistory(
      p,
      { ...context, reports: false },
      emptyHistoryFilters,
    ),
  ).toThrow();
  for (const mutate of [
    (p: PublishedReport[]) => p.push(p[0]),
    (p: PublishedReport[]) =>
      Object.assign(p[0].checklist[0], { internal_notes: 'SECRET' }),
    (p: PublishedReport[]) =>
      Object.assign(p[0].findings[0], { supplier_cost: 123 }),
    (p: PublishedReport[]) => {
      p[0].version = 0;
    },
  ]) {
    const bad = structuredClone(p);
    mutate(bad);
    expect(() => run(bad, { query: 'unmatched' })).toThrow();
  }
});
it('never indexes excluded source fields or emits financial or inferred issue-state data', () => {
  const raw = Object.assign(source(), {
    internal_notes: 'PRIVATE payroll token',
    supplier_cost: 'SECRET financial token',
    media: ['private.png'],
  });
  const p = page([raw]);
  for (const query of ['PRIVATE', 'SECRET', 'payroll', 'private.png'])
    expect(run(p, { query }).reports).toEqual([]);
  expect(JSON.stringify(run(p))).not.toMatch(
    /PRIVATE|SECRET|supplier_cost|repair_status|approved|paid/,
  );
});

it('uses actual synthetic projections for all three contractors and rejects a foreign property before searching', async () => {
  const { CustomerPortalPreviewModel } =
    await import('../src/lib/customer-preview');
  const { PropertyRepository } = await import('../src/lib/property');
  const { Operations } = await import('../src/lib/operations');
  const { sampleCompanies } = await import('../src/domain/platform');
  for (const company of sampleCompanies) {
    const model = new CustomerPortalPreviewModel(
      company,
      new PropertyRepository(new Operations(true)),
    );
    await model.login();
    await model.prepareHistory();
    model.prepareAttentionExamples();
    model.prepareComparisonExamples();
    const data = model.read();
    expect(
      searchInspectionHistory(
        data.reports,
        data.context,
        emptyHistoryFilters,
        data.cadences,
      ).reports,
    ).toEqual(
      [...data.history].sort((a, b) =>
        b.snapshot.visited_on.localeCompare(a.snapshot.visited_on),
      ),
    );
    expect(
      searchInspectionHistory(
        data.reports,
        data.context,
        {
          ...emptyHistoryFilters,
          category: 'Damage',
          location: 'Comparison window seal',
          severity: 'urgent',
        },
        data.cadences,
      ).reports,
    ).toHaveLength(1);
    const other = model
      .properties()
      .find((p) => p.id !== data.context.location_id)!;
    model.selectProperty(other.id);
    const empty = model.read();
    expect(
      searchInspectionHistory(empty.reports, empty.context, emptyHistoryFilters)
        .available,
    ).toBe(0);
    expect(() =>
      searchInspectionHistory(data.reports, empty.context, emptyHistoryFilters),
    ).toThrow('unavailable');
    model.logout();
  }
});
it('rejects malformed filter shapes instead of inheriting or coercing values', () => {
  for (const value of [
    { ...emptyHistoryFilters, extra: 'untrusted' },
    { ...emptyHistoryFilters, query: 1 },
    Object.assign(Object.create({ query: 'hidden' }) as object, {
      ...emptyHistoryFilters,
      query: undefined,
    }),
  ])
    expect(() =>
      searchInspectionHistory(
        page(),
        context,
        value as typeof emptyHistoryFilters,
      ),
    ).toThrow('Invalid history filters');
});
