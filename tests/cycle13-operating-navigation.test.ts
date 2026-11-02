import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readDailyActionCenter } from '../src/lib/workflows/daily-action-center';
import {
  readIntelligenceWorkflowAttempt,
  prepareIntelligenceWorkflow,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readVerifiedOperatingSuggestions,
  type VerifiedSuggestionsInput,
} from '../src/lib/workflows/verified-operating-suggestions';
import {
  operatingNavigationEnabled,
  readOperatingNavigation,
  filterOperatingNavigation,
  inspectOperatingNavigationSource,
  navigateOperatingSuggestion,
  inspectOperatingNavigation,
  assertOperatingNavigationCurrent,
  type OperatingNavigationDetail,
  type OperatingNavigationFilter,
} from '../src/lib/workflows/operating-navigation';
import { OperatingNavigation } from '../src/components/workflows/OperatingNavigation';
import * as verifiedSuggestions from '../src/lib/workflows/verified-operating-suggestions';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const clear: OperatingNavigationFilter = {
  query: '',
  section: 'all',
  job_id: null,
  band: 'all',
};
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate);
  const input: VerifiedSuggestionsInput = {
    review_on: sources.entries[0].day,
    timezone: sources.entries[0].timezone,
    input_revision: 1,
    ordering: 'EVIDENCE_FIRST',
  };
  return {
    sources,
    gate,
    input,
    read: () => readOperatingNavigation(sources, input, gate),
  };
}
const snapshot = (f: Awaited<ReturnType<typeof fixture>>) =>
  JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    entries: f.sources.entries.map((e) => ({
      canonical: f.sources.estimates.readSyntheticPrototypeSources(e.target),
      release: e.release.read('staff'),
      attempt: readIntelligenceWorkflowAttempt(
        f.sources.estimates,
        e.target,
        f.gate,
      ),
    })),
  });
function atHash(marker: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !fired &&
      new TextDecoder().decode(args[1] as ArrayBuffer).includes(marker)
    ) {
      fired = true;
      await change();
    }
    return result;
  });
  return () => fired;
}

describe('Cycle13 exact local task navigation over unchanged C12 suggestions', () => {
  it.each(
    [0, 1, 2].flatMap((index) =>
      (
        [
          ['finance', 'finance'],
          ['issued', 'sales'],
          ['visit', 'field'],
          ['report', 'completion'],
        ] as const
      ).map(([kind, section]) => ({ index, kind, section })),
    ),
  )(
    'brand $index preserves canonical suggestions and opens $kind in exact $section review after source inspection',
    async ({ index, kind, section }) => {
      const f = await fixture(index),
        before = snapshot(f),
        writers = [
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
          vi.spyOn(f.sources.estimates, 'payroll'),
          vi.spyOn(f.sources.property, 'savePlan'),
          vi.spyOn(f.sources.property, 'saveVisit'),
          ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
        ],
        review = await f.read();
      expect(review.tasks.length).toBeGreaterThan(0);
      expect(Object.values(review.authority).every((v) => v === false)).toBe(
        true,
      );
      // One exact retained-source inspection per case leaves finite CI headroom
      // within the existing 30-second budget; every brand/source pair is retained.
      const task = review.tasks.find((t) => t.source.kind === kind)!;
      expect(task).toBeDefined();
      expect(task.navigation).toMatchObject({
        status: 'EXACT_LOCAL_REVIEW_TARGET',
        section,
      });
      const callback = vi.fn();
      expect(
        navigateOperatingSuggestion(
          task as unknown as OperatingNavigationDetail,
          callback,
        ).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
      const detail = await inspectOperatingNavigationSource(review, task.key);
      expect(detail.target).toEqual(task.source.target);
      expect(detail.source.id).toBe(task.source.id);
      expect(detail.task.rank).toBe(task.rank);
      expect(detail.task.recorded_fact).toBe(task.recorded_fact);
      expect(navigateOperatingSuggestion(detail, callback)).toMatchObject({
        status: 'LOCAL_REVIEW_NAVIGATION_REQUESTED',
        job_id: task.job_id,
        section,
        authority: 'PRESENTATION_ONLY',
      });
      expect(callback).toHaveBeenCalledExactlyOnceWith(task.job_id, section);
      expect(JSON.stringify(detail)).not.toMatch(
        /PRIVATE staff|internal_notes|unit_cost_minor|cash_minor|burden_minor|Synthetic planning supplier|5550100100|@example/,
      );
      const finance = review.tasks.find((t) => t.source.kind === 'finance')!;
      expect(finance.verification.status).toBe('UNKNOWN');
      expect(finance.navigation.section).toBe('finance');
      expect(
        finance.verification.facts.find((v) => v.code === 'INVOICE_READINESS')
          ?.value,
      ).toBe('NO_GO');
      expect(
        review.tasks.some((t) =>
          new Set(['maintenance', 'daily']).has(t.navigation.section ?? ''),
        ),
      ).toBe(false);
      expect(snapshot(f)).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    },
  );

  it('retains exact C11 keys/ranks/criteria/recommendations without a new priority engine', async () => {
    const f = await fixture(),
      canonical = await readDailyActionCenter(f.sources, f.input, f.gate),
      review = await f.read();
    expect(review.tasks.map((t) => t.key)).toEqual(
      canonical.cards.map((t) => t.key),
    );
    expect(review.selected_criteria).toEqual(canonical.selected_criteria);
    review.tasks.forEach((task, i) => {
      expect(task.rank).toBe(canonical.cards[i].rank);
      expect(task.source).toEqual(canonical.cards[i].source);
      expect(task.suggested_human_review).toBe(
        canonical.cards[i].suggested_human_review,
      );
    });
  });

  it('combines literal search, exact job, category and recorded-day context without changing original ranks', async () => {
    const f = await fixture(),
      review = await f.read(),
      report = review.tasks.find((t) => t.source.kind === 'report')!;
    const result = filterOperatingNavigation(review, {
      query: report.source.id,
      section: 'completion',
      job_id: report.job_id,
      band: report.review_band,
    });
    expect(result.tasks.map((t) => t.key)).toEqual([report.key]);
    expect(result.matching).toBe(1);
    expect(result.available).toBe(review.tasks.length);
    expect(
      filterOperatingNavigation(review, {
        ...clear,
        query: report.source.target.version_id,
      }).matching,
    ).toBe(
      review.tasks.filter(
        (t) => t.source.target.version_id === report.source.target.version_id,
      ).length,
    );
    expect(
      filterOperatingNavigation(review, {
        ...clear,
        query: '<script>.*[literal]',
      }),
    ).toMatchObject({ matching: 0, available: review.tasks.length });
    expect(
      filterOperatingNavigation(review, { ...clear, section: 'maintenance' })
        .matching,
    ).toBe(0);
    expect(
      filterOperatingNavigation(review, clear).tasks.map((t) => t.rank),
    ).toEqual(review.tasks.map((t) => t.rank));
    const a = f.sources.entries[0],
      b = f.sources.entries[3];
    expect(a.target.location_id).toBe(b.target.location_id);
    expect(
      filterOperatingNavigation(review, {
        ...clear,
        job_id: b.target.job_id!,
      }).tasks.every((t) => t.source.target.version_id === b.target.version_id),
    ).toBe(true);
  });

  it('an actual existing-engine recorded time source maps only to Field review without payroll effects', async () => {
    const f = await fixture(),
      entry = f.sources.entries[0];
    const timeId = await f.sources.estimates.recordTime(
      f.sources.company.id,
      entry.worker_id,
      {
        job_id: entry.target.job_id!,
        overhead_center: null,
        task: 'Explicit TEST recorded segment',
        kind: 'work',
        started_at: entry.day + 'T15:30:00.000Z',
        ended_at: entry.day + 'T16:30:00.000Z',
        billable: false,
        corrects_id: null,
      },
    );
    const before = snapshot(f),
      review = await f.read(),
      task = review.tasks.find((t) => t.source.id === timeId)!;
    expect(task.source.kind).toBe('time');
    expect(task.navigation.section).toBe('field');
    const detail = await inspectOperatingNavigationSource(review, task.key),
      callback = vi.fn();
    expect(navigateOperatingSuggestion(detail, callback).status).toBe(
      'LOCAL_REVIEW_NAVIGATION_REQUESTED',
    );
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      entry.target.job_id,
      'field',
    );
    expect(snapshot(f)).toBe(before);
  });

  it.each([
    'unknown-job',
    'unknown-section',
    'unknown-band',
    'accessor',
  ] as const)(
    'rejects %s filter data without coercing or broadening sources',
    async (kind) => {
      const f = await fixture(),
        review = await f.read(),
        filter = { ...clear },
        getter = vi.fn();
      if (kind === 'unknown-job') filter.job_id = crypto.randomUUID();
      if (kind === 'unknown-section')
        filter.section =
          'https://example.invalid' as OperatingNavigationFilter['section'];
      if (kind === 'unknown-band')
        filter.band = 'latest' as OperatingNavigationFilter['band'];
      if (kind === 'accessor')
        Object.defineProperty(filter, 'query', { get: getter });
      expect(() => filterOperatingNavigation(review, filter)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it('missing keys, copied details, forged section/URL and uninspected cards remain UNKNOWN with no callback', async () => {
    const f = await fixture(),
      review = await f.read(),
      callback = vi.fn();
    await expect(
      inspectOperatingNavigationSource(review, 'missing'),
    ).rejects.toThrow();
    await expect(
      inspectOperatingNavigationSource(
        structuredClone(review),
        review.tasks[0].key,
      ),
    ).rejects.toThrow();
    const detail = await inspectOperatingNavigationSource(
        review,
        review.tasks[0].key,
      ),
      forged = structuredClone(detail);
    Object.assign(forged.task.navigation, {
      section: 'https://example.invalid',
      status: 'EXACT_LOCAL_REVIEW_TARGET',
    });
    expect(navigateOperatingSuggestion(forged, callback)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(
      navigateOperatingSuggestion(structuredClone(detail), callback).status,
    ).toBe('UNKNOWN');
    expect(
      navigateOperatingSuggestion(
        review.tasks[0] as unknown as OperatingNavigationDetail,
        callback,
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
    expect(await inspectOperatingNavigation(structuredClone(review))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });

  it.each(['missing-job', 'ambiguous-job', 'ambiguous-visit'] as const)(
    'does not manufacture task destinations for %s sources',
    async (kind) => {
      const f = await fixture();
      if (kind === 'missing-job')
        f.sources.entries[0].target.job_id = crypto.randomUUID();
      if (kind === 'ambiguous-job')
        f.sources.entries = [...f.sources.entries, f.sources.entries[0]];
      if (kind === 'ambiguous-visit') {
        const original = f.sources.property.read.bind(f.sources.property),
          bad = original(f.sources.company.id),
          visit = bad.visits.find(
            (v) => v.id === f.sources.entries[0].scheduled_visit_id,
          )!;
        bad.visits.push(structuredClone(visit));
        vi.spyOn(f.sources.property, 'read').mockImplementation(() =>
          structuredClone(bad),
        );
      }
      await expect(f.read()).rejects.toThrow();
    },
  );

  it.each(['staff', 'inactive', 'foreign'] as const)(
    'denies %s source access before creating task navigation',
    async (kind) => {
      const f = await fixture();
      if (kind === 'foreign') {
        const foreign = await fixture(1);
        f.sources.entries = [
          foreign.sources.entries[0],
          ...f.sources.entries.slice(1),
        ];
      } else {
        const original = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          original(org).map((m) => ({
            ...m,
            role: kind === 'staff' ? 'staff' : m.role,
            active: kind !== 'inactive',
          })),
        );
      }
      await expect(f.read()).rejects.toThrow();
    },
  );

  it.each(['gate', 'root', 'membership', 'source'] as const)(
    'rechecks %s immediately before the exact callback and leaves UNKNOWN read-only',
    async (kind) => {
      const f = await fixture(),
        review = await f.read(),
        detail = await inspectOperatingNavigationSource(
          review,
          review.tasks.find((t) => t.source.kind === 'report')!.key,
        ),
        callback = vi.fn();
      if (kind === 'gate') f.gate.confirmed = false;
      if (kind === 'root') f.sources.entries = [...f.sources.entries];
      if (kind === 'membership') {
        const original = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          original(org).map((m) => ({ ...m, active: false })),
        );
      }
      if (kind === 'source') {
        const e = f.sources.entries[0],
          raw = f.sources.estimates.readSyntheticPrototypeSources(
            e.target,
          ).job!;
        await f.sources.estimates.projection(f.sources.company.id, raw, {
          ...raw.projection,
          remaining: {
            ...raw.projection.remaining,
            other: raw.projection.remaining.other + 1,
          },
        });
      }
      expect(navigateOperatingSuggestion(detail, callback)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(callback).not.toHaveBeenCalled();
      expect(await inspectOperatingNavigation(review)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(() => assertOperatingNavigationCurrent(detail)).toThrow();
    },
  );

  it.each(['late-revocation', 'conflicting-target'] as const)(
    'withholds %s between original job resolution and the final callback',
    async (kind) => {
      const f = await fixture(),
        review = await f.read(),
        detail = await inspectOperatingNavigationSource(
          review,
          review.tasks[0].key,
        ),
        callback = vi.fn();
      const original = verifiedSuggestions.openVerifiedSuggestionJob;
      vi.spyOn(
        verifiedSuggestions,
        'openVerifiedSuggestionJob',
      ).mockImplementation((retained) => {
        const result = original(retained);
        if (kind === 'late-revocation') f.gate.confirmed = false;
        return kind === 'conflicting-target'
          ? {
              ...result,
              target: {
                ...result.target,
                job_id: f.sources.entries[1].target.job_id,
              },
            }
          : result;
      });
      expect(navigateOperatingSuggestion(detail, callback)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(callback).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      f.gate.confirmed = true;
      expect(navigateOperatingSuggestion(detail, callback)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(callback).not.toHaveBeenCalled();
      expect(await inspectOperatingNavigation(review)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
    },
  );

  it.each(['criteria', 'model', 'gate'] as const)(
    'rejects %s changes across the final existing suggestion await without a replacement read',
    async (kind) => {
      const f = await fixture(),
        fired = atHash('"mode":"LOCAL_VERIFIED_OPERATING_SUGGESTIONS"', () => {
          if (kind === 'criteria') f.input.ordering = 'RECORDED_DAY_FIRST';
          if (kind === 'model')
            f.sources.entries[0].release = f.sources.entries[1].release;
          if (kind === 'gate') f.gate.confirmed = false;
        });
      await expect(f.read()).rejects.toThrow();
      expect(fired()).toBe(true);
      if (kind === 'criteria') {
        f.input.ordering = 'EVIDENCE_FIRST';
        await expect(f.read()).rejects.toThrow('already held');
      }
    },
  );

  it('a late source-inspection result cannot navigate after final-await confirmation withdrawal', async () => {
    const f = await fixture(),
      review = await f.read(),
      task = review.tasks.find((t) => t.source.kind === 'report')!,
      fired = atHash(
        'EXACT_READ_ONLY_SOURCE_INSPECTION_NOT_ACTION_AUTHORITY',
        () => {
          f.gate.confirmed = false;
        },
      );
    await expect(
      inspectOperatingNavigationSource(review, task.key),
    ).rejects.toThrow();
    expect(fired()).toBe(true);
    expect(await inspectOperatingNavigation(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });

  it('delegates concurrency, subset/fresh views and direct C12 reads to the unchanged finite hold', async () => {
    const f = await fixture(),
      results = await Promise.allSettled([f.read(), f.read()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(
      readOperatingNavigation(
        { ...f.sources },
        { ...f.input, ordering: 'RECORDED_DAY_FIRST' },
        f.gate,
      ),
    ).rejects.toThrow('already held');
    await expect(
      readOperatingNavigation(
        { ...f.sources, entries: [f.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow('already held');
    await expect(
      readVerifiedOperatingSuggestions(f.sources, f.input, f.gate),
    ).rejects.toThrow('already held');
  });

  it('preserves original Intelligence attempt holds and invalidates navigation after actual attempt-state change', async () => {
    const f = await fixture(),
      review = await f.read(),
      e = f.sources.entries[0],
      detail = await inspectOperatingNavigationSource(
        review,
        review.tasks.find((t) => t.job_id === e.target.job_id)!.key,
      ),
      callback = vi.fn();
    await prepareIntelligenceWorkflow(
      e.estimates,
      e.target,
      { review_on: e.day, advanced: null },
      f.gate,
    );
    expect(navigateOperatingSuggestion(detail, callback).status).toBe(
      'UNKNOWN',
    );
    expect(callback).not.toHaveBeenCalled();
    await expect(
      prepareIntelligenceWorkflow(
        e.estimates,
        e.target,
        { review_on: e.day, advanced: null },
        f.gate,
      ),
    ).rejects.toThrow();
    expect(await inspectOperatingNavigation(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });

  it('retains old one-argument job callback compatibility and exact current reconciliation', async () => {
    const f = await fixture(),
      review = await f.read(),
      detail = await inspectOperatingNavigationSource(
        review,
        review.tasks[0].key,
      ),
      selected: string[] = [];
    expect(
      navigateOperatingSuggestion(detail, (jobId) => {
        selected.push(jobId);
      }).status,
    ).toBe('LOCAL_REVIEW_NAVIGATION_REQUESTED');
    expect(selected).toEqual([detail.target.job_id]);
    expect(await inspectOperatingNavigation(review)).toEqual({
      status: 'CURRENT_READ_ONLY_NAVIGATION',
      replacement: null,
    });
    f.gate.confirmed = false;
    expect(await inspectOperatingNavigation(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    f.gate.confirmed = true;
    expect(navigateOperatingSuggestion(detail, () => {}).status).toBe(
      'UNKNOWN',
    );
  });

  it.each(['off', 'production', 'remote', 'https'] as const)(
    '%s gates precede source/input getters and serializers',
    async (mode) => {
      const getter = vi.fn(() => {
          throw Error('Must not read');
        }),
        poison = {};
      Object.defineProperties(poison, {
        company: { get: getter, enumerable: true },
        toJSON: { value: getter, enumerable: true },
      });
      if (mode === 'production') vi.stubEnv('DEV', false);
      if (mode === 'remote')
        vi.stubGlobal('window', {
          location: { hostname: 'example.com', protocol: 'http:' },
        });
      if (mode === 'https')
        vi.stubGlobal('window', {
          location: { hostname: 'localhost', protocol: 'https:' },
        });
      const sources = poison as Parameters<typeof readOperatingNavigation>[0],
        input = poison as VerifiedSuggestionsInput;
      await expect(
        mode === 'off'
          ? readOperatingNavigation(sources, input)
          : readOperatingNavigation(sources, input, {
              enabled: true,
              confirmed: true,
            }),
      ).rejects.toThrow();
      const markup = renderToStaticMarkup(
        createElement(OperatingNavigation, {
          sources,
          enabled: mode !== 'off',
        }),
      );
      expect(markup).not.toContain('<input');
      expect(markup).not.toContain('href=');
      expect(getter).not.toHaveBeenCalled();
      expect(operatingNavigationEnabled(mode !== 'off')).toBe(false);
    },
  );

  it.each([0, 1, 2])(
    'brand %i initial component provides labeled local review controls without suggestions or automatic navigation',
    async (index) => {
      const f = await fixture(index),
        callback = vi.fn(),
        markup = renderToStaticMarkup(
          createElement(OperatingNavigation, {
            sources: f.sources,
            enabled: true,
            onSelectJob: callback,
          }),
        );
      expect(markup).toContain('Daily operating navigation');
      expect(markup).toContain(sampleCompanies[index].name);
      expect(markup).toContain('Review daily operating suggestions');
      expect(markup).toContain('Review ordering');
      expect(markup).toContain('disabled=""');
      expect(markup).not.toContain('Open existing task review');
      expect(markup).not.toContain('href=');
      expect(callback).not.toHaveBeenCalled();
    },
  );
});
