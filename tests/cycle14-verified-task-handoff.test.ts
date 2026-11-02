import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { filterOperatingNavigation } from '../src/lib/workflows/operating-navigation';
import * as navigation from '../src/lib/workflows/operating-navigation';
import {
  readIntelligenceWorkflowAttempt,
  prepareIntelligenceWorkflow,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readVerifiedTaskHandoff,
  inspectVerifiedTaskHandoff,
  assertVerifiedTaskHandoffCurrent,
  navigateVerifiedTaskHandoff,
  reconcileVerifiedTaskHandoff,
  taskHandoffWindowMs,
} from '../src/lib/workflows/verified-task-handoff';
import { VerifiedTaskHandoff } from '../src/components/workflows/VerifiedTaskHandoff';

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
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      ordering: 'EVIDENCE_FIRST' as const,
      input_revision: 1,
    };
  return {
    gate,
    sources,
    input,
    read: () => readVerifiedTaskHandoff(sources, input, gate),
  };
}
const snapshot = (f: Awaited<ReturnType<typeof fixture>>) =>
  JSON.stringify(
    f.sources.entries.map((e) => ({
      source: f.sources.estimates.readSyntheticPrototypeSources(e.target),
      release: e.release.read('staff'),
      attempt: readIntelligenceWorkflowAttempt(
        f.sources.estimates,
        e.target,
        f.gate,
      ),
    })),
  );
async function selected(index = 0) {
  const f = await fixture(index),
    review = await f.read(),
    task = review.tasks.find((t) => t.source.kind === 'report')!,
    handoff = await inspectVerifiedTaskHandoff(review, task.key);
  return { ...f, review, task, handoff };
}
describe('Cycle14 finite exact-source verified task handoff', () => {
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
    'brand $index retains $kind identity and hands off only to exact existing $section section',
    async ({ index, kind, section }) => {
      const f = await fixture(index),
        before = snapshot(f),
        writers = [
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
          ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
        ],
        review = await f.read(),
        task = review.tasks.find((t) => t.source.kind === kind)!;
      const handoff = await inspectVerifiedTaskHandoff(review, task.key),
        callback = vi.fn();
      expect(handoff.selected).toMatchObject({
        key: task.key,
        job_id: task.job_id,
        source_id: task.source.id,
        source_version: task.source.version,
        source_revision: task.source.revision,
        section,
      });
      expect(handoff.task).toEqual(task);
      expect(
        Date.parse(handoff.expires_at) - Date.parse(handoff.inspected_at),
      ).toBe(taskHandoffWindowMs);
      expect(navigateVerifiedTaskHandoff(handoff, callback).status).toBe(
        'EXACT_LOCAL_TASK_REVIEW_REQUESTED',
      );
      expect(callback).toHaveBeenCalledExactlyOnceWith(task.job_id, section);
      expect(Object.values(review.authority).every((v) => v === false)).toBe(
        true,
      );
      expect(JSON.stringify(handoff)).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100/,
      );
      expect(snapshot(f)).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    },
  );
  it('keeps selected identity while original category/search filters change without selecting another task', async () => {
    const f = await selected(),
      bytes = JSON.stringify(f.handoff),
      empty = filterOperatingNavigation(f.review, {
        query: '[literal.*]',
        section: 'finance',
        job_id: null,
        band: 'all',
      });
    expect(empty.matching).toBe(0);
    expect(JSON.stringify(f.handoff)).toBe(bytes);
    expect(f.handoff.selected.source_id).toBe(f.task.source.id);
    expect(await reconcileVerifiedTaskHandoff(f.handoff)).toEqual({
      status: 'CURRENT_UNEXPIRED_LOCAL_REVIEW_ONLY',
      replacement: null,
    });
    await expect(
      inspectVerifiedTaskHandoff(f.review, f.task.key),
    ).rejects.toThrow('already held');
  });
  it.each(['expiry', 'rollback', 'invalid-clock'] as const)(
    'makes %s terminal UNKNOWN without renewing the retained inspection',
    async (kind) => {
      const f = await selected(),
        frozen = JSON.stringify(f.handoff),
        original = Date.now(),
        clock = vi.spyOn(Date, 'now');
      clock.mockReturnValue(
        kind === 'expiry'
          ? Date.parse(f.handoff.expires_at)
          : kind === 'rollback'
            ? Date.parse(f.handoff.inspected_at) - 1
            : Number.NaN,
      );
      const callback = vi.fn();
      expect(navigateVerifiedTaskHandoff(f.handoff, callback)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(callback).not.toHaveBeenCalled();
      clock.mockReturnValue(original);
      expect(await reconcileVerifiedTaskHandoff(f.handoff)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(JSON.stringify(f.handoff)).toBe(frozen);
      await expect(
        inspectVerifiedTaskHandoff(f.review, f.task.key),
      ).rejects.toThrow('already held');
    },
  );
  it('checks expiry again inside the original C13 final navigation callback', async () => {
    const f = await selected(),
      original = navigation.navigateOperatingSuggestion,
      callback = vi.fn(),
      clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    vi.spyOn(navigation, 'navigateOperatingSuggestion').mockImplementation(
      (detail, forward) =>
        original(detail, (jobId, section) => {
          clock.mockReturnValue(Date.parse(f.handoff.expires_at));
          forward(jobId, section);
        }),
    );
    expect(navigateVerifiedTaskHandoff(f.handoff, callback)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(callback).not.toHaveBeenCalled();
  });
  it('rechecks the local deadline after exact read-only reconciliation awaits', async () => {
    const f = await selected(),
      original = navigation.inspectOperatingNavigation,
      clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    vi.spyOn(navigation, 'inspectOperatingNavigation').mockImplementation(
      async (review) => {
        const result = await original(review);
        clock.mockReturnValue(Date.parse(f.handoff.expires_at));
        return result;
      },
    );
    expect(await reconcileVerifiedTaskHandoff(f.handoff)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it.each(['gate', 'role', 'source'] as const)(
    'blocks %s workflow-state drift and cannot revive a retained selection',
    async (kind) => {
      const f = await selected(),
        callback = vi.fn();
      if (kind === 'gate') f.gate.confirmed = false;
      if (kind === 'role') {
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
      expect(navigateVerifiedTaskHandoff(f.handoff, callback).status).toBe(
        'UNKNOWN',
      );
      expect(callback).not.toHaveBeenCalled();
      f.gate.confirmed = true;
      expect(() => assertVerifiedTaskHandoffCurrent(f.handoff)).toThrow();
    },
  );
  it('original Intelligence attempt-state changes invalidate the handoff without replaying or resetting original holds', async () => {
    const f = await selected(),
      e = f.sources.entries[0];
    await prepareIntelligenceWorkflow(
      e.estimates,
      e.target,
      { review_on: e.day, advanced: null },
      f.gate,
    );
    expect(navigateVerifiedTaskHandoff(f.handoff, vi.fn()).status).toBe(
      'UNKNOWN',
    );
    await expect(
      prepareIntelligenceWorkflow(
        e.estimates,
        e.target,
        { review_on: e.day, advanced: null },
        f.gate,
      ),
    ).rejects.toThrow();
  });
  it('concurrent exact-source inspections retain one original identity and cannot create a second deadline', async () => {
    const f = await fixture(),
      review = await f.read(),
      key = review.tasks[0].key,
      results = await Promise.allSettled([
        inspectVerifiedTaskHandoff(review, key),
        inspectVerifiedTaskHandoff(review, key),
      ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(inspectVerifiedTaskHandoff(review, key)).rejects.toThrow(
      'already held',
    );
    await expect(
      readVerifiedTaskHandoff({ ...f.sources }, { ...f.input }, f.gate),
    ).rejects.toThrow('already held');
  });
  it('rejects copied/foreign/uninspected identities and missing source keys without callbacks', async () => {
    const f = await selected(),
      callback = vi.fn();
    expect(
      navigateVerifiedTaskHandoff(structuredClone(f.handoff), callback),
    ).toEqual({ status: 'UNKNOWN', replacement: null });
    expect(
      navigateVerifiedTaskHandoff(
        f.task as unknown as typeof f.handoff,
        callback,
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      inspectVerifiedTaskHandoff(f.review, 'missing'),
    ).rejects.toThrow();
    expect(
      await reconcileVerifiedTaskHandoff(structuredClone(f.handoff)),
    ).toEqual({ status: 'UNKNOWN', replacement: null });
    expect(callback).not.toHaveBeenCalled();
    const foreign = await fixture(1);
    await expect(
      readVerifiedTaskHandoff(
        { ...foreign.sources, entries: [f.sources.entries[0]] },
        foreign.input,
        foreign.gate,
      ),
    ).rejects.toThrow();
  });
  it('lost final source-inspection acknowledgment retains the exact source hold with no replacement', async () => {
    const f = await fixture(),
      review = await f.read(),
      task = review.tasks[0],
      original = navigation.inspectOperatingNavigationSource;
    vi.spyOn(navigation, 'inspectOperatingNavigationSource').mockImplementation(
      async (...args) => {
        await original(...args);
        throw Error('Lost source acknowledgment');
      },
    );
    await expect(
      inspectVerifiedTaskHandoff(review, task.key),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    await expect(inspectVerifiedTaskHandoff(review, task.key)).rejects.toThrow(
      'already held',
    );
  });
  it.each(['off', 'production', 'remote', 'https'] as const)(
    '%s admission precedes getters and serializers',
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
      const sources = poison as Parameters<typeof readVerifiedTaskHandoff>[0];
      await expect(
        readVerifiedTaskHandoff(
          sources,
          {
            review_on: '',
            timezone: '',
            ordering: 'EVIDENCE_FIRST',
            input_revision: 1,
          },
          { enabled: mode !== 'off', confirmed: true },
        ),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(VerifiedTaskHandoff, {
            sources,
            enabled: mode !== 'off',
          }),
        ),
      ).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'brand %i initial view has explicit controls and no duplicated role region or serialized detail',
    async (index) => {
      const f = await fixture(index),
        markup = renderToStaticMarkup(
          createElement(VerifiedTaskHandoff, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.sources.entries[0].target.job_id!,
          }),
        );
      expect(markup).toContain('Verified task handoff');
      expect(markup).toContain('Read verified task sources');
      expect(markup).not.toContain('<pre');
      expect(markup).not.toContain('aria-label="Daily operating navigation"');
      expect(markup).not.toContain('Open retained task review');
    },
  );
});
