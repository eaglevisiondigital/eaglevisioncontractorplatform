import { mkdirSync, writeFileSync } from 'node:fs';
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
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import {
  compareOwnerActionRefresh,
  filterOwnerActionSources,
  type OwnerActionRefresh,
} from '../src/lib/workflows/owner-action-verification';
import { OwnerActionVerification } from '../src/components/workflows/OwnerActionVerification';

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
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    job = entry.target.job_id!,
    view = await readVerifiedOwnerBriefing(sources, job, gate),
    row = view.rows[0],
    selection = { key: row.key, ...row.source };
  return { sources, entry, job, view, row, selection, gate };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function markup(
  f: Fixture,
  query = f.row.source.id,
  refresh?: OwnerActionRefresh,
) {
  ui.index = 0;
  ui.seeds = new Map<number, unknown>([
    [1, f.view],
    [2, f.selection],
    [3, query],
    [5, refresh],
  ]);
  return renderToStaticMarkup(
    createElement(OwnerActionVerification, {
      sources: f.sources,
      selectedJobId: f.job,
      enabled: true,
    }),
  );
}
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((member) =>
        member.user_id === f.entry.target.actor_id
          ? { ...member, active: false }
          : member,
      ),
  );
}
async function changeMaterial(f: Fixture) {
  const org = f.sources.company.id,
    job = f.sources.estimates.syntheticJob(org, f.job)!,
    expense = job.expenses.find(
      (item) => !job.events.some((event) => event.submission_id === item.id),
    )!;
  await f.sources.estimates.reviewExpense(
    org,
    f.job,
    expense.id,
    'approved',
    'Explicit synthetic native source review',
  );
}

it.each([0, 1, 2])(
  'brand %i literal owner filtering renders one original fully guarded filter without an extra leading currentness read',
  async (brand) => {
    const f = await fixture(brand),
      reader = vi.spyOn(f.sources.estimates, 'readSyntheticPrototypeSources'),
      started = performance.now(),
      filtered = filterOwnerActionSources(f.view, { query: f.row.source.id }),
      filterMs = performance.now() - started,
      filterCalls = reader.mock.calls.length;
    reader.mockClear();
    const renderStarted = performance.now(),
      html = markup(f),
      renderMs = performance.now() - renderStarted,
      renderCalls = reader.mock.calls.length;
    if (process.env.CYCLE32_MEASURE_DIRECTORY) {
      mkdirSync(process.env.CYCLE32_MEASURE_DIRECTORY, { recursive: true });
      writeFileSync(
        `${process.env.CYCLE32_MEASURE_DIRECTORY}/owner-filter-${brand}.json`,
        JSON.stringify(
          {
            jobs: f.sources.entries.length,
            filterCalls,
            renderCalls,
            filterMs,
            renderMs,
          },
          null,
          2,
        ) + '\n',
      );
    }
    expect(f.sources.entries).toHaveLength(4);
    expect(filterCalls).toBeGreaterThan(0);
    expect(html).toContain(f.row.source.id);
    expect(html).toContain(
      `${filtered.matching} matching of ${filtered.available}`,
    );
    expect(renderCalls).toBe(filterCalls);
  },
);

it.each([0, 1, 2])(
  'brand %i a later owner filter render still withholds original private source choices after revocation',
  async (brand) => {
    const f = await fixture(brand);
    expect(markup(f)).toContain(f.row.source.id);
    revoke(f);
    const html = markup(f);
    expect(html).not.toContain(f.row.source.id);
    expect(html).toContain('Exact owner source or staff access changed');
    expect(html).not.toContain('Exact recorded owner action source');
  },
);

it.each([0, 1, 2])(
  'brand %i an actual canonical source edit invalidates the retained owner selection at the next filter render',
  async (brand) => {
    const f = await fixture(brand);
    expect(markup(f)).toContain(f.row.source.id);
    await changeMaterial(f);
    const html = markup(f);
    expect(html).not.toContain(f.row.source.id);
    expect(html).toContain('No replacement source or');
    expect(html).not.toContain('Verify selected owner action');
  },
);

it('a retained original refresh comparison is still independently current-checked before its private facts render', async () => {
  const f = await fixture(),
    current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
    refresh = compareOwnerActionRefresh(f.view, current, f.selection),
    selected = { ...f, view: current };
  expect(markup(selected, '', refresh)).toContain(
    'Explicit previous and current source reads',
  );
  await changeMaterial(f);
  const fresh = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
    html = markup({ ...selected, view: fresh }, '', refresh);
  expect(html).not.toContain('Explicit previous and current source reads');
  expect(html).not.toContain(f.row.source.id);
  expect(html).toContain('Exact owner source or staff access changed');
});

it('a literal no-hit search keeps only the exact prior selection and never replaces it with another ranked row', async () => {
  const f = await fixture(),
    original = JSON.stringify(f.selection),
    html = markup(f, '[literal].* no matching source');
  expect(html).toContain('0 matching of');
  expect(html).toContain('Retained exact selection outside results');
  expect(html).toContain(f.row.source.id);
  expect(html).not.toContain('Open verified original owner review');
  expect(JSON.stringify(f.selection)).toBe(original);
});

it('default OFF rendering still performs no source read', () => {
  const getter = vi.fn(() => {
      throw Error('Private source');
    }),
    sources = Object.defineProperty({}, 'company', { get: getter });
  expect(
    renderToStaticMarkup(
      createElement(OwnerActionVerification, {
        sources: sources as never,
        enabled: false,
      }),
    ),
  ).toContain('Owner action verification is OFF');
  expect(getter).not.toHaveBeenCalled();
});
