import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ui = vi.hoisted(() => ({ index: 0, seeds: new Map<number, unknown>() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      const index = ui.index++;
      return actual.useState(
        ui.seeds.has(index) ? ui.seeds.get(index) : initial,
      );
    }) as typeof actual.useState,
  };
});
import { sampleCompanies } from '../src/domain/platform';
import { RecordedOwnerActions } from '../src/components/workflows/RecordedOwnerActions';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readRecordedOwnerActions,
  recordedOwnerActionCards,
  inspectRecordedOwnerAction,
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
  const gate = { enabled: true, confirmed: true };
  const sources = await prepareCorrectionPreviewSources(
    sampleCompanies[brand],
    gate,
  );
  const entry = sources.entries[2],
    job = entry.target.job_id!;
  const view = await readRecordedOwnerActions(sources, job, gate);
  const card = recordedOwnerActionCards(view)[0];
  const inspection = await inspectRecordedOwnerAction(view, card.key);
  function markup(busy: boolean, comparison = false) {
    ui.index = 0;
    ui.seeds = new Map<number, unknown>([
      [1, view],
      [2, comparison ? view : undefined],
      [3, inspection],
      [4, busy],
    ]);
    return renderToStaticMarkup(
      createElement(RecordedOwnerActions, {
        sources,
        selectedJobId: job,
        enabled: true,
      }),
    );
  }
  return { sources, entry, card, job, markup };
}
for (const comparison of [false, true])
  it.each([0, 1, 2])(
    `brand %i pending owner rendering with comparison=${comparison} withholds private DOM without repeating native reads`,
    async (brand) => {
      const f = await fixture(brand);
      const reader = vi.spyOn(
        f.sources.estimates,
        'readSyntheticPrototypeSources',
      );
      const html = f.markup(true, comparison);
      expect(reader).not.toHaveBeenCalled();
      expect(html).toContain('Verifying exact current source state');
      expect(html).not.toContain(f.card.source.id);
      expect(html).not.toContain(f.job);
      expect(html).not.toContain('Exact owner priority source');
      expect(html).not.toContain('Recorded priority changes');
      expect(html).not.toContain('Inspect owner priority source:');
      expect(html).toContain('disabled=""');
    },
  );
it.each([0, 1, 2])(
  'brand %i idle return repeats original fresh validation and withholds revoked evidence',
  async (brand) => {
    const f = await fixture(brand);
    const reader = vi.spyOn(
      f.sources.estimates,
      'readSyntheticPrototypeSources',
    );
    expect(f.markup(false)).toContain(f.card.source.id);
    expect(reader.mock.calls.length).toBeGreaterThan(0);
    const members = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        members(org).map((member) =>
          member.user_id === f.entry.target.actor_id
            ? { ...member, active: false }
            : member,
        ),
    );
    const html = f.markup(false);
    expect(html).not.toContain(f.card.source.id);
    expect(html).not.toContain('Open exact owner priority review');
    expect(html).toContain(
      'Recorded sources changed. Details and navigation are withheld',
    );
  },
);
