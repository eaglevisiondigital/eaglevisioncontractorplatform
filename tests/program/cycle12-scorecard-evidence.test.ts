import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import evidence from '../../docs/FEATURE_ACCEPTANCE_EVIDENCE.json';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareOperatingSources } from '../../src/lib/workflows/operating-center-runtime';
import { readPilotScorecard } from '../../src/lib/workflows/pilot-scorecard';
for (const company of sampleCompanies)
  it(`public source citations remain detached and source-bound ${company.slug}`, async () => {
    const sources = await prepareOperatingSources(company, {
      enabled: true,
      confirmed: true,
    });
    const view = readPilotScorecard(sources, {
      enabled: true,
      confirmed: true,
    });
    for (const feature of view.features) {
      const original = evidence.features.find((f) => f.id === feature.id)!;
      expect(feature.evidence_sources).toEqual(original.sources);
      expect(Object.isFrozen(feature.evidence_sources)).toBe(true);
      for (const source of feature.evidence_sources) {
        expect(Object.keys(source).sort()).toEqual(['anchor', 'path']);
        expect(source.path).not.toMatch(
          /(^\.|\.staging|credentials|private\.json|^\/)/,
        );
        expect(Object.isFrozen(source)).toBe(true);
      }
    }
    expect(JSON.stringify(view)).not.toContain(
      sources.entries[0].target.customer_id,
    );
    expect(JSON.stringify(view)).not.toContain(
      sources.entries[0].target.job_id,
    );
  });
it('keeps all original capability stage/approval values exact rather than promoting local packages', () => {
  // Exact2691 owner-approved state projection; no runtime Git-history dependency.
  const projected = evidence.features.map((f) => [
    f.id,
    f.scope,
    f.design,
    f.local,
    f.hosted,
    f.release,
    f.approval,
    f.ci,
  ]);
  expect(
    createHash('sha256').update(JSON.stringify(projected)).digest('hex'),
  ).toBe('9e3f2b68e5edf11dfec71d93e83796f6f26d755fb5307d5dbb323a97bc27e827');
});
