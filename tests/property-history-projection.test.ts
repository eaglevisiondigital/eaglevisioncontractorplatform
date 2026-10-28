import { expect, it } from 'vitest';
import { projectPublishedHistory } from '../src/domain/property/report-page';
import type { PublishedReport } from '../src/domain/property/inspections';
const boundary = {
  organization_id: crypto.randomUUID(),
  customer_id: crypto.randomUUID(),
  location_id: crypto.randomUUID(),
};
function source(): PublishedReport {
  return {
    ...boundary,
    id: crypto.randomUUID(),
    visit_id: crypto.randomUUID(),
    version: 1,
    visited_on: '2026-10-28',
    phase: 'after',
    published_at: '2026-10-28T12:00:00Z',
    summary: 'Reviewed synthetic exterior check',
    findings: [
      {
        id: 'repair',
        category: 'Damage',
        location: 'Rear entry',
        severity: 'moderate',
        description: '<script>literal text only</script>',
        recommendation: 'Review repair scope',
      },
    ],
    checklist: [{ label: 'Exterior', completed: true }],
  };
}
it('projects published sources into an independent allowlist without private fields, media or mutable references', () => {
  const report = {
    ...source(),
    internal_notes: 'INTERNAL',
    unit_cost_minor: 500,
    media: ['private-object'],
  };
  const history = projectPublishedHistory([report], boundary);
  expect(Object.keys(history[0]).sort()).toEqual([
    'id',
    'published_at',
    'snapshot',
    'version',
  ]);
  expect(JSON.stringify(history)).not.toMatch(
    /INTERNAL|unit_cost|private-object|visit_id|organization_id/,
  );
  history[0].snapshot.findings[0].description = 'Changed outside source';
  expect(report.findings[0].description).toContain('<script>');
});
it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'rejects a forged %s rather than silently merging histories',
  (key) => {
    const report = source();
    report[key] = crypto.randomUUID();
    expect(() => projectPublishedHistory([source(), report], boundary)).toThrow(
      'unavailable',
    );
  },
);
it.each(['private-finding', 'invalid-date', 'invalid-severity'] as const)(
  'rejects contaminated published data: %s',
  (attack) => {
    const report = source();
    if (attack === 'private-finding')
      Object.assign(report.findings[0], {
        customer_visible: false,
        internal_note: 'PRIVATE',
      });
    if (attack === 'invalid-date') report.visited_on = '2026-02-30';
    if (attack === 'invalid-severity')
      Object.assign(report.findings[0], { severity: 'invented' });
    expect(() => projectPublishedHistory([report], boundary)).toThrow();
  },
);
