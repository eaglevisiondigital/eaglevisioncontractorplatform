import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../../src/lib/workflows/operating-center-runtime';
import { readPilotScorecard } from '../../src/lib/workflows/pilot-scorecard';
import { PilotScorecard } from '../../src/components/workflows/PilotScorecard';
for (const company of sampleCompanies)
  it(`source-bound two-track scorecard ${company.slug}`, async () => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(company, gate);
    const view = readPilotScorecard(sources, gate);
    expect(view.organization_id).toBe(company.id);
    expect(view.features).toHaveLength(25);
    expect(view.phase_one).toHaveLength(8);
    expect(view.features.every((f) => f.release === 'not_authorized')).toBe(
      true,
    );
    expect(view.release).toBe('NOT_READY_NOT_AUTHORIZED');
    expect(Object.values(view.authority).every((v) => v === false)).toBe(true);
    expect(Object.isFrozen(view.features)).toBe(true);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(sources.entries[0].target.customer_id);
    expect(serialized).not.toContain(sources.entries[0].target.job_id);
    gate.confirmed = false;
    expect(() => readPilotScorecard(sources, gate)).toThrow();
  });
it('default OFF scorecard does not execute source getters', () => {
  const sources = Object.defineProperty({}, 'entries', {
    get() {
      throw Error('GETTER_EXECUTED');
    },
  }) as OperatingSources;
  expect(() => readPilotScorecard(sources)).toThrow();
  expect(() =>
    renderToStaticMarkup(createElement(PilotScorecard, { sources })),
  ).not.toThrow();
});
it('never treats missing CI or broad partial local status as release acceptance', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[0], gate),
    v = readPilotScorecard(sources, gate);
  expect(v.features.some((f) => f.ci.state === 'unknown')).toBe(true);
  expect(v.features.some((f) => f.local === 'partial')).toBe(true);
  expect(
    v.phase_one.every(
      (g) => !['READY', 'PASS', 'AUTHORIZED'].includes(g.status),
    ),
  ).toBe(true);
  expect(v.features.every((f) => f.source && f.next)).toBe(true);
});
