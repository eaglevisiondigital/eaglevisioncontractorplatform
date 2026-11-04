import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
const ui = vi.hoisted(() => ({ index: 0, seeds: new Map<number, unknown>() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      const i = ui.index++;
      return actual.useState(ui.seeds.has(i) ? ui.seeds.get(i) : initial);
    }) as typeof actual.useState,
  };
});
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { RecordedOwnerActions } from '../src/components/workflows/RecordedOwnerActions';
import {
  readRecordedOwnerActions,
  recordedOwnerActionCards,
} from '../src/lib/workflows/recorded-owner-actions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  ui.index = 0;
  ui.seeds.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    job = entry.target.job_id!,
    view = await readRecordedOwnerActions(sources, job, gate);
  return { gate, sources, entry, job, view, org: sources.company.id };
}
type F = Awaited<ReturnType<typeof fixture>>;
function markup(f: F) {
  ui.index = 0;
  ui.seeds = new Map([[1, f.view]]);
  return renderToStaticMarkup(
    createElement(RecordedOwnerActions, {
      sources: f.sources,
      selectedJobId: f.job,
      enabled: true,
    }),
  );
}
it.each([0, 1, 2])(
  'brand %i one owner render performs one full original guarded-card read without duplicate source work',
  async (brand) => {
    const f = await fixture(brand),
      reader = vi.spyOn(f.sources.estimates, 'readSyntheticPrototypeSources');
    const started = performance.now(),
      cards = recordedOwnerActionCards(f.view),
      guardedMs = performance.now() - started,
      guardedCalls = reader.mock.calls.length;
    reader.mockClear();
    const renderStarted = performance.now(),
      html = markup(f),
      renderMs = performance.now() - renderStarted,
      renderCalls = reader.mock.calls.length;
    if (process.env.CYCLE30_MEASURE_DIRECTORY) {
      mkdirSync(process.env.CYCLE30_MEASURE_DIRECTORY, { recursive: true });
      writeFileSync(
        `${process.env.CYCLE30_MEASURE_DIRECTORY}/owner-render-${brand}.json`,
        JSON.stringify(
          {
            brand,
            jobs: f.sources.entries.length,
            cards: cards.length,
            guardedCalls,
            renderCalls,
            guardedMs,
            renderMs,
          },
          null,
          2,
        ) + '\n',
      );
    }
    expect(guardedCalls).toBeGreaterThan(0);
    expect(cards.length).toBeGreaterThan(0);
    expect(html).toContain(cards[0].recorded_fact);
    expect(renderCalls).toBe(guardedCalls);
  },
);
it.each([0, 1, 2])(
  'brand %i a later render still invokes original current authority and withholds revoked private cards',
  async (brand) => {
    const f = await fixture(brand),
      fact = recordedOwnerActionCards(f.view)[0].recorded_fact,
      original = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
    expect(markup(f)).toContain(fact);
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        original(org).map((m) =>
          m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
        ),
    );
    const html = markup(f);
    expect(html).not.toContain(fact);
    expect(html).toContain(
      'Recorded sources changed. Details and navigation are withheld',
    );
  },
);
it.each([0, 1, 2])(
  'brand %i native source drift is never cached by a prior successful owner render',
  async (brand) => {
    const f = await fixture(brand),
      fact = recordedOwnerActionCards(f.view)[0].recorded_fact;
    expect(markup(f)).toContain(fact);
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      f.sources.estimates
        .syntheticJob(f.org, f.job)!
        .expenses.find(
          (e) =>
            !f.sources.estimates
              .syntheticJob(f.org, f.job)!
              .events.some((r) => r.submission_id === e.id),
        )!.id,
      'approved',
      'Explicit native source review',
    );
    const html = markup(f);
    expect(html).not.toContain(fact);
    expect(html).toContain(
      'Recorded sources changed. Details and navigation are withheld',
    );
  },
);
it('OFF rendering reads no sources', () => {
  const read = vi.fn(() => {
      throw Error('Private source');
    }),
    sources = Object.defineProperty({}, 'company', { get: read });
  expect(
    renderToStaticMarkup(
      createElement(RecordedOwnerActions, {
        sources: sources as never,
        enabled: false,
      }),
    ),
  ).toContain('Recorded owner actions are OFF');
  expect(read).not.toHaveBeenCalled();
});
