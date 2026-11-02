import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readIntelligenceWorkflowAttempt,
  prepareIntelligenceWorkflow,
} from '../src/lib/workflows/intelligence-workflow';
import { readBusinessBriefing } from '../src/lib/workflows/business-briefing';
import {
  actionReviewBands,
  readDailyActionCenter,
  filterDailyActionCenter,
  openDailyActionSource,
  openDailyActionJob,
  inspectDailyActionCenter,
  type DailyActionCenterInput,
  type DailyActionCenterFilter,
} from '../src/lib/workflows/daily-action-center';
import { DailyActionCenter } from '../src/components/workflows/DailyActionCenter';
afterEach(() => vi.restoreAllMocks());
const clear: DailyActionCenterFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
  band: 'all',
};
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input: DailyActionCenterInput = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      input_revision: 1,
      ordering: 'EVIDENCE_FIRST',
    };
  return {
    sources,
    gate,
    input,
    read: () => readDailyActionCenter(sources, input, gate),
  };
}
function digestChange(
  change: () => void | Promise<void>,
  mode = 'LOCAL_DAILY_ACTION_CENTER',
) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !fired &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes(`"mode":"${mode}"`)
    ) {
      fired = true;
      await change();
    }
    return result;
  });
  return () => fired;
}
describe('Cycle 11 deterministic source-linked daily action desk', () => {
  it.each([0, 1, 2])(
    'company %i keeps exact facts, criteria and recommendations separate without side effects',
    async (index) => {
      const f = await fixture(index),
        s = f.sources,
        before = JSON.stringify(
          s.entries.map((e) => ({
            source: s.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
        ),
        claims = s.entries.map((e) =>
          readIntelligenceWorkflowAttempt(s.estimates, e.target, f.gate),
        ),
        writers = [
          vi.spyOn(s.estimates, 'projection'),
          vi.spyOn(s.estimates, 'submitExpense'),
          vi.spyOn(s.estimates, 'recordTime'),
          vi.spyOn(s.estimates, 'payroll'),
          vi.spyOn(s.property, 'saveVisit'),
          ...s.entries.map((e) => vi.spyOn(e.release, 'command')),
        ];
      const r = await f.read();
      expect(r.jobs.map((j) => j.target)).toEqual(
        s.entries.map((e) => e.target),
      );
      expect(r.coverage.selected_jobs).toBe(4);
      expect(r.counts.available).toBe(r.cards.length);
      expect(r.counts.evidence + r.counts.review).toBe(r.cards.length);
      expect(
        r.cards.every(
          (c, i) =>
            c.rank === i + 1 &&
            c.recorded_fact &&
            c.suggested_human_review &&
            c.order_reasons.length === 5,
        ),
      ).toBe(true);
      expect(
        r.cards.every(
          (c) => c.urgency_authority === 'NO_OPERATIONAL_URGENCY_INFERRED',
        ),
      ).toBe(true);
      expect(
        r.cards.every((c) =>
          c.missing_evidence.some(
            (e) => e.code === 'HISTORY_COVERAGE' && e.status === 'UNKNOWN',
          ),
        ),
      ).toBe(true);
      expect(
        r.cards.some((c) => c.evidence_status === 'UNKNOWN_EVIDENCE_REMAINS'),
      ).toBe(true);
      expect(r.selected_criteria.ordering).toBe('EVIDENCE_FIRST');
      expect(r.model).toBe('NONE');
      expect(Object.values(r.authority).every((v) => v === false)).toBe(true);
      expect(JSON.stringify(r)).not.toMatch(
        /PRIVATE staff|Synthetic planning supplier|journey-.*@example|5550100100|internal_notes|cash_minor|burden_minor|unit_cost_minor/,
      );
      expect(
        s.entries.map((e) =>
          readIntelligenceWorkflowAttempt(s.estimates, e.target, f.gate),
        ),
      ).toEqual(claims);
      expect(
        JSON.stringify(
          s.entries.map((e) => ({
            source: s.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
        ),
      ).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
      const { sha256, ...body } = r;
      expect(await documentHash(body)).toBe(sha256);
      expect(Object.isFrozen(r.cards[0].order_reasons)).toBe(true);
      expect(await inspectDailyActionCenter(r)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each([0, 1, 2])(
    'company %i opens exact original report/version and issued scope for every job',
    async (index) => {
      const f = await fixture(index),
        r = await f.read();
      for (const entry of f.sources.entries) {
        const card = r.cards.find(
          (c) => c.job_id === entry.target.job_id && c.source.kind === 'report',
        )!;
        expect(card.source.id).toBe(entry.report_id);
        expect(card.source.version).toBe(entry.published_version);
        const source = await openDailyActionSource(r, card.key);
        expect(source.target).toEqual(entry.target);
        expect(source.source.id).toBe(entry.report_id);
        expect(source.source.version).toBe(entry.published_version);
        expect(openDailyActionJob(r, entry.target.job_id!).target).toEqual(
          entry.target,
        );
        const issued = r.cards.find(
          (c) => c.job_id === entry.target.job_id && c.source.kind === 'issued',
        )!;
        expect((await openDailyActionSource(r, issued.key)).source.id).toBe(
          entry.target.version_id,
        );
      }
    },
  );
  it.each(['EVIDENCE_FIRST', 'RECORDED_DAY_FIRST'] as const)(
    'uses explicit deterministic %s ordering over the same canonical cards',
    async (ordering) => {
      const f = await fixture();
      f.input.ordering = ordering;
      const r = await f.read(),
        briefing = await readBusinessBriefing(
          f.sources,
          {
            review_on: f.input.review_on,
            timezone: f.input.timezone,
            input_revision: 1,
          },
          f.gate,
        );
      expect(new Set(r.cards.map((c) => c.key))).toEqual(
        new Set(briefing.cards.map((c) => c.key)),
      );
      for (const c of r.cards) {
        const canonical = briefing.cards.find((b) => b.key === c.key)!;
        expect(c.recorded_day).toBe(canonical.recorded_day);
        expect(c.recorded_fact).toBe(canonical.observation);
        expect(c.source.id).toBe(canonical.source.id);
        expect(c.original_briefing_rank).toBe(
          briefing.cards.indexOf(canonical) + 1,
        );
      }
      const tuples = r.cards.map((c) =>
        ordering === 'EVIDENCE_FIRST'
          ? [Number(c.level === 'review'), c.recorded_day ?? '9999']
          : [c.recorded_day ?? '9999', Number(c.level === 'review')],
      );
      expect(tuples).toEqual(
        [...tuples].sort((a, b) =>
          a[0] < b[0]
            ? -1
            : a[0] > b[0]
              ? 1
              : a[1] < b[1]
                ? -1
                : a[1] > b[1]
                  ? 1
                  : 0,
        ),
      );
    },
  );
  it.each([
    ['2020-01-01', 'LATER'],
    ['2030-01-01', 'EARLIER'],
  ] as const)(
    'classifies recorded context against %s without inferring missed visits or deadlines',
    async (review_on, expected) => {
      const f = await fixture();
      f.input.review_on = review_on;
      const r = await f.read();
      expect(
        r.cards
          .filter((c) => c.recorded_day !== null)
          .every((c) => c.date_relation === expected),
      ).toBe(true);
      expect(
        r.cards.every((c) =>
          c.order_reasons.some((s) =>
            s.includes('not deadlines, missed appointments'),
          ),
        ),
      ).toBe(true);
      expect(r.cards.some((c) => c.review_band === 'EVIDENCE_GAP')).toBe(true);
    },
  );
  it('combines job, area, level, band and literal query with accurate counts and empty states', async () => {
    const f = await fixture(),
      r = await f.read(),
      card = r.cards.find((c) => c.source.kind === 'report')!;
    const selected = filterDailyActionCenter(r, {
      area: card.area,
      level: card.level,
      job_id: card.job_id,
      query: card.source.id,
      band: card.review_band,
    });
    expect(selected.cards.map((c) => c.key)).toEqual([card.key]);
    expect(selected.matching).toBe(1);
    expect(selected.available).toBe(r.cards.length);
    expect(
      filterDailyActionCenter(r, {
        ...clear,
        query: '<script>.*[not-an-expression]',
      }).matching,
    ).toBe(0);
    expect(filterDailyActionCenter(r, clear).matching).toBe(r.cards.length);
    for (const band of actionReviewBands)
      expect(filterDailyActionCenter(r, { ...clear, band }).matching).toBe(
        r.counts.bands[band],
      );
  });
  it('preserves distinct source identity for two jobs at the same property', async () => {
    const f = await fixture(),
      r = await f.read(),
      a = f.sources.entries[0],
      b = f.sources.entries[3];
    expect(a.target.location_id).toBe(b.target.location_id);
    expect(
      new Set(
        r.cards
          .filter((c) => c.source.target.location_id === a.target.location_id)
          .map((c) => c.job_id),
      ),
    ).toEqual(new Set([a.target.job_id, b.target.job_id]));
    for (const e of [a, b])
      expect(
        filterDailyActionCenter(r, {
          ...clear,
          job_id: e.target.job_id!,
        }).cards.every(
          (c) => c.source.target.version_id === e.target.version_id,
        ),
      ).toBe(true);
  });
  it('rejects foreign IDs, company/root substitutions and copied review evidence', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      r = await f.read();
    await expect(
      readDailyActionCenter(
        { ...f.sources, entries: [foreign.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readDailyActionCenter(
        { ...f.sources, estimates: foreign.sources.estimates },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    expect(() =>
      filterDailyActionCenter(r, { ...clear, job_id: crypto.randomUUID() }),
    ).toThrow();
    expect(() => openDailyActionJob(r, crypto.randomUUID())).toThrow();
    await expect(
      openDailyActionSource(r, crypto.randomUUID()),
    ).rejects.toThrow();
    expect(() => filterDailyActionCenter(structuredClone(r), clear)).toThrow();
    expect(await inspectDailyActionCenter(structuredClone(r))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it.each(['staff', 'inactive'] as const)(
    'denies %s membership before reading action evidence',
    async (kind) => {
      const f = await fixture(),
        members = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          members(org).map((m) => ({
            ...m,
            role: kind === 'staff' ? 'staff' : m.role,
            active: kind !== 'inactive',
          })),
      );
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('withholds stale immutable evidence and keeps UNKNOWN after restored confirmation', async () => {
    const f = await fixture(),
      r = await f.read(),
      before = JSON.stringify(r);
    f.gate.confirmed = false;
    expect(await inspectDailyActionCenter(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    f.gate.confirmed = true;
    expect((await inspectDailyActionCenter(r)).status).toBe('UNKNOWN');
    expect(() => filterDailyActionCenter(r, clear)).toThrow();
    expect(JSON.stringify(r)).toBe(before);
  });
  it('detects an actual source job revision before source navigation', async () => {
    const f = await fixture(),
      r = await f.read(),
      job = f.sources.estimates.syntheticJob(
        f.sources.company.id,
        f.sources.entries[0].target.job_id!,
      )!;
    await f.sources.estimates.projection(f.sources.company.id, job, {
      ...job.projection,
      remaining: { ...job.projection.remaining, other: 2400 },
    });
    expect((await inspectDailyActionCenter(r)).status).toBe('UNKNOWN');
    await expect(openDailyActionSource(r, r.cards[0].key)).rejects.toThrow();
  });
  it.each([
    [
      'ordering',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.ordering = 'RECORDED_DAY_FIRST';
      },
    ],
    [
      'review day',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.review_on = '2030-01-01';
      },
    ],
    [
      'input revision',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.input_revision++;
      },
    ],
    [
      'root entries',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries = [...f.sources.entries];
      },
    ],
    [
      'published version',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[0].published_version++;
      },
    ],
    [
      'confirmation',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.gate.confirmed = false;
      },
    ],
  ] as const)(
    'rejects original %s changes after the final action hash',
    async (_name, change) => {
      const f = await fixture(),
        fired = digestChange(() => change(f));
      await expect(f.read()).rejects.toThrow();
      expect(fired()).toBe(true);
    },
  );
  it('rechecks eligible membership after the final hash', async () => {
    const f = await fixture(),
      members = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      fired = digestChange(() => {
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          members(org).map((m) => ({ ...m, active: false })),
        );
      });
    await expect(f.read()).rejects.toThrow();
    expect(fired()).toBe(true);
  });
  it('existing Copilot attempt drift invalidates the action source instead of regenerating it', async () => {
    const f = await fixture(),
      r = await f.read(),
      e = f.sources.entries[0];
    await prepareIntelligenceWorkflow(
      e.estimates,
      e.target,
      { review_on: e.day, advanced: null },
      f.gate,
    );
    expect((await inspectDailyActionCenter(r)).status).toBe('UNKNOWN');
  });
  it('default OFF rejects before source getters and rendering reads no source property', async () => {
    const f = await fixture(),
      poison = { ...f.sources },
      getter = vi.fn(() => f.sources.estimates);
    Object.defineProperty(poison, 'estimates', {
      get: getter,
      enumerable: true,
    });
    await expect(readDailyActionCenter(poison, f.input)).rejects.toThrow();
    const markup = renderToStaticMarkup(
      createElement(DailyActionCenter, { sources: poison }),
    );
    expect(markup).toContain('Daily action center is off');
    expect(markup).not.toContain('<input');
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects accessors and executable filters without invoking them', async () => {
    const f = await fixture(),
      r = await f.read(),
      getter = vi.fn(() => 'EVIDENCE_FIRST');
    Object.defineProperty(f.input, 'ordering', {
      get: getter,
      enumerable: true,
    });
    await expect(f.read()).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    const filterGetter = vi.fn(() => 'all'),
      bad = { ...clear };
    Object.defineProperty(bad, 'band', { get: filterGetter, enumerable: true });
    expect(() => filterDailyActionCenter(r, bad)).toThrow();
    expect(filterGetter).not.toHaveBeenCalled();
  });
  it.each([
    'bad day',
    'bad zone',
    'bad order',
    'zero revision',
    'unknown field',
  ] as const)('rejects %s without weakening source admission', async (kind) => {
    const f = await fixture(),
      input = {
        ...f.input,
        ...(kind === 'bad day'
          ? { review_on: '2026-02-30' }
          : kind === 'bad zone'
            ? { timezone: 'not-a-zone' }
            : kind === 'bad order'
              ? { ordering: 'urgency' }
              : kind === 'zero revision'
                ? { input_revision: 0 }
                : { execute: true }),
      };
    await expect(
      readDailyActionCenter(f.sources, input as DailyActionCenterInput, f.gate),
    ).rejects.toThrow();
  });
  it.each([0, 1, 2])(
    'company %i presents a named accessible default-off-safe staff review form',
    async (index) => {
      const f = await fixture(index),
        markup = renderToStaticMarkup(
          createElement(DailyActionCenter, {
            sources: f.sources,
            enabled: true,
          }),
        );
      expect(markup).toContain('aria-label="Daily action center"');
      expect(markup).toContain('Staff-selected review order');
      expect(markup).toContain('Evidence gaps first');
      expect(markup).toContain('Recorded source day first');
      expect(markup).toContain('Prepare daily action review');
      expect(markup).not.toContain('Original source evidence');
    },
  );
});
