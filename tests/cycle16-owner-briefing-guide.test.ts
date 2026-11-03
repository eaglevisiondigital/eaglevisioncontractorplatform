import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { filterOwnerBriefingGuide } from '../src/lib/workflows/owner-briefing-guide';
import * as navigation from '../src/lib/workflows/operating-navigation';
import * as originalHandoff from '../src/lib/workflows/verified-task-handoff';
import { readDailyActionCenter } from '../src/lib/workflows/daily-action-center';
import {
  prepareIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readOwnerBriefingGuide,
  openOwnerBriefingTask,
  assertOwnerBriefingTaskCurrent,
  inspectOwnerBriefingDestination,
  assertOwnerBriefingDestinationCurrent,
  returnOwnerBriefingTask,
  navigateOwnerBriefingTask,
} from '../src/lib/workflows/owner-briefing-guide';
import { OwnerBriefingGuide } from '../src/components/workflows/OwnerBriefingGuide';

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
    allSources = await prepareOperatingSources(sampleCompanies[index], gate),
    sources = { ...allSources, entries: [allSources.entries[0]] },
    input = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      ordering: 'EVIDENCE_FIRST' as const,
      input_revision: 1,
    };
  return {
    allSources,
    gate,
    sources,
    input,
    read: () => readOwnerBriefingGuide(sources, input, gate),
  };
}
const snapshot = (f: Awaited<ReturnType<typeof fixture>>) =>
  JSON.stringify(
    f.sources.entries.map((entry) => ({
      source: f.sources.estimates.readSyntheticPrototypeSources(entry.target),
      release: entry.release.read('staff'),
      property: f.sources.property.read(f.sources.company.id),
      attempt: readIntelligenceWorkflowAttempt(
        f.sources.estimates,
        entry.target,
        f.gate,
      ),
    })),
  );
async function selected(index = 0) {
  const f = await fixture(index),
    review = await f.read(),
    task = review.tasks.find((task) => task.source.kind === 'report')!,
    link = await openOwnerBriefingTask(review, task.key, task.job_id!);
  return { ...f, review, task, link };
}
describe('Cycle16 original-source owner briefing and retained local navigation', () => {
  it.each([
    ...[0, 1, 2].map(
      (index) => ({ index, kind: 'finance', section: 'finance' }) as const,
    ),
    ...(
      [
        ['issued', 'sales'],
        ['visit', 'field'],
        ['report', 'completion'],
      ] as const
    ).map(([kind, section]) => ({ index: 0, kind, section })),
  ])(
    'brand $index explains actual $kind source and returns before original $section navigation without effects',
    async ({ index, kind, section }) => {
      const f = await fixture(index),
        before = snapshot(f),
        writers = [
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
          ...f.sources.entries.map((entry) =>
            vi.spyOn(entry.release, 'command'),
          ),
        ],
        review = await f.read(),
        task = review.tasks.find((task) => task.source.kind === kind)!,
        link = await openOwnerBriefingTask(review, task.key, task.job_id!),
        inspect = vi.spyOn(originalHandoff, 'inspectVerifiedTaskHandoff');
      expect(link.anchor).toMatchObject({
        key: task.key,
        job_id: task.job_id,
        source_id: task.source.id,
        source_kind: kind,
        source_version: task.source.version,
        source_revision: task.source.revision,
        section,
        target: task.source.target,
      });
      expect(link.recorded_fact).toBe(task.recorded_fact);
      expect(link.recommended_manual_review).toBe(task.suggested_human_review);
      expect(link.original_rank).toBe(task.rank);
      expect(link.why_this_order).toEqual(task.why_this_order);
      expect(link.order_reasons).toEqual(task.order_reasons);
      expect(link.missing_evidence).toEqual(task.missing_evidence);
      expect(
        link.missing_evidence.some((item) => item.status === 'UNKNOWN'),
      ).toBe(true);
      const destination = inspectOwnerBriefingDestination(link, task.job_id!);
      expect(destination.required_checks).toEqual(
        task.verification.required_checks,
      );
      expect(destination.destination).toEqual(task.navigation);
      expect(returnOwnerBriefingTask(link, task.job_id!)).toEqual({
        status: 'CURRENT_EXACT_SUGGESTION_RETURN',
        anchor: link.anchor,
        replacement: null,
      });
      const again = inspectOwnerBriefingDestination(link, task.job_id!),
        callback = vi.fn();
      expect(again.expires_at).toBe(link.expires_at);
      expect(Date.parse(link.expires_at) - Date.parse(link.inspected_at)).toBe(
        originalHandoff.taskHandoffWindowMs,
      );
      expect(inspect).not.toHaveBeenCalled();
      expect(
        navigateOwnerBriefingTask(again, callback, task.job_id!).status,
      ).toBe('ORIGINAL_TASK_REVIEW_REQUESTED');
      expect(callback).toHaveBeenCalledExactlyOnceWith(task.job_id, section);
      expect(
        Object.values(review.authority).every((value) => value === false),
      ).toBe(true);
      expect(JSON.stringify({ link, destination })).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100|Synthetic planning supplier/,
      );
      expect(snapshot(f)).toBe(before);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    },
  );
  it('uses original daily ranks/reasons and literal filters without changing the selected identity or window', async () => {
    const f = await fixture(),
      daily = await readDailyActionCenter(f.sources, f.input, f.gate),
      review = await f.read(),
      task = review.tasks.find((task) => task.source.kind === 'report')!,
      link = await openOwnerBriefingTask(review, task.key),
      bytes = JSON.stringify(link);
    expect(review.tasks.map((task) => task.key)).toEqual(
      daily.cards.map((card) => card.key),
    );
    expect(link.original_rank).toBe(
      daily.cards.find((card) => card.key === task.key)!.rank,
    );
    const filtered = filterOwnerBriefingGuide(review, {
      query: '[literal.*]',
      section: 'finance',
      job_id: null,
      band: 'all',
    });
    expect(filtered.matching).toBe(0);
    const exact = filterOwnerBriefingGuide(review, {
      query: task.source.id,
      section: 'completion',
      job_id: task.job_id,
      band: task.review_band,
    });
    expect(exact.tasks.some((row) => row.key === task.key)).toBe(true);
    expect(
      exact.tasks.every(
        (row) =>
          row.job_id === task.job_id && row.review_band === task.review_band,
      ),
    ).toBe(true);
    expect(exact.tasks.map((row) => row.rank)).toEqual(
      review.tasks
        .filter((row) =>
          exact.tasks.some((selected) => selected.key === row.key),
        )
        .map((row) => row.rank),
    );
    expect(JSON.stringify(link)).toBe(bytes);
    expect(returnOwnerBriefingTask(link).status).toBe(
      'CURRENT_EXACT_SUGGESTION_RETURN',
    );
  });
  it('an actual existing-engine time source retains its exact ID and only Field destination', async () => {
    const f = await fixture(),
      entry = f.sources.entries[0],
      timeId = await f.sources.estimates.recordTime(
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
      ),
      before = snapshot(f),
      review = await f.read(),
      task = review.tasks.find((task) => task.source.id === timeId)!,
      link = await openOwnerBriefingTask(review, task.key),
      callback = vi.fn();
    expect(link.anchor).toMatchObject({
      source_kind: 'time',
      source_id: timeId,
      section: 'field',
    });
    expect(
      navigateOwnerBriefingTask(inspectOwnerBriefingDestination(link), callback)
        .status,
    ).toBe('ORIGINAL_TASK_REVIEW_REQUESTED');
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      entry.target.job_id,
      'field',
    );
    expect(snapshot(f)).toBe(before);
  });
  it.each(['expiry', 'rollback', 'invalid-clock'] as const)(
    'makes %s terminal UNKNOWN without replacement or deadline renewal',
    async (kind) => {
      const f = await selected(),
        destination = inspectOwnerBriefingDestination(f.link),
        bytes = JSON.stringify(f.link),
        original = Date.now(),
        clock = vi.spyOn(Date, 'now'),
        callback = vi.fn();
      clock.mockReturnValue(
        kind === 'expiry'
          ? Date.parse(f.link.expires_at)
          : kind === 'rollback'
            ? Date.parse(f.link.inspected_at) - 1
            : Number.NaN,
      );
      expect(navigateOwnerBriefingTask(destination, callback)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(callback).not.toHaveBeenCalled();
      clock.mockReturnValue(original);
      expect(returnOwnerBriefingTask(f.link)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(() => inspectOwnerBriefingDestination(f.link)).toThrow();
      expect(JSON.stringify(f.link)).toBe(bytes);
      await expect(openOwnerBriefingTask(f.review, f.task.key)).rejects.toThrow(
        'already held',
      );
    },
  );
  it.each([
    'role',
    'source',
    'report-version',
    'workflow',
    'input',
    'gate',
    'root',
  ] as const)(
    'withholds %s drift and keeps original attempt holds',
    async (kind) => {
      const f = await selected(),
        destination = inspectOwnerBriefingDestination(f.link),
        callback = vi.fn(),
        entry = f.sources.entries[0];
      if (kind === 'role') {
        const original = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          original(org).map((member) => ({ ...member, active: false })),
        );
      }
      if (kind === 'source') {
        const raw = f.sources.estimates.readSyntheticPrototypeSources(
          entry.target,
        ).job!;
        await f.sources.estimates.projection(f.sources.company.id, raw, {
          ...raw.projection,
          remaining: {
            ...raw.projection.remaining,
            other: raw.projection.remaining.other + 1,
          },
        });
      }
      if (kind === 'report-version') {
        const original = f.sources.property.read.bind(f.sources.property),
          state = original(f.sources.company.id),
          report = state.reports.find(
            (report) => report.id === f.link.anchor.source_id,
          )!;
        report.version++;
        vi.spyOn(f.sources.property, 'read').mockImplementation(() =>
          structuredClone(state),
        );
      }
      if (kind === 'workflow')
        await prepareIntelligenceWorkflow(
          entry.estimates,
          entry.target,
          { review_on: entry.day, advanced: null },
          f.gate,
        );
      if (kind === 'input') f.input.input_revision++;
      if (kind === 'gate') f.gate.confirmed = false;
      if (kind === 'root') f.sources.entries = [...f.sources.entries];
      expect(navigateOwnerBriefingTask(destination, callback).status).toBe(
        'UNKNOWN',
      );
      expect(callback).not.toHaveBeenCalled();
      expect(returnOwnerBriefingTask(f.link).status).toBe('UNKNOWN');
      if (kind === 'workflow')
        await expect(
          prepareIntelligenceWorkflow(
            entry.estimates,
            entry.target,
            { review_on: entry.day, advanced: null },
            f.gate,
          ),
        ).rejects.toThrow();
    },
  );
  it.each(['expiry', 'revocation'] as const)(
    'checks %s again inside the final original navigation callback',
    async (kind) => {
      const f = await selected(),
        destination = inspectOwnerBriefingDestination(f.link),
        original = navigation.navigateOperatingSuggestion,
        callback = vi.fn(),
        clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
      vi.spyOn(navigation, 'navigateOperatingSuggestion').mockImplementation(
        (detail, forward) =>
          original(detail, (jobId, section) => {
            if (kind === 'expiry')
              clock.mockReturnValue(Date.parse(f.link.expires_at));
            else f.gate.confirmed = false;
            forward(jobId, section);
          }),
      );
      expect(navigateOwnerBriefingTask(destination, callback).status).toBe(
        'UNKNOWN',
      );
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('lost acknowledgment and final-await revocation retain the original source inspection hold', async () => {
    const f = await fixture(),
      review = await f.read(),
      task = review.tasks[0],
      original = originalHandoff.inspectVerifiedTaskHandoff;
    vi.spyOn(originalHandoff, 'inspectVerifiedTaskHandoff').mockImplementation(
      async (...args) => {
        const handoff = await original(...args);
        f.gate.confirmed = false;
        return handoff;
      },
    );
    await expect(openOwnerBriefingTask(review, task.key)).rejects.toThrow();
    f.gate.confirmed = true;
    vi.restoreAllMocks();
    await expect(openOwnerBriefingTask(review, task.key)).rejects.toThrow();
    await expect(f.read()).rejects.toThrow();
  });
  it('concurrent/original/fresh/relabelled modes cannot reset a finite read or source inspection', async () => {
    const f = await fixture(),
      review = await f.read(),
      task = review.tasks[0],
      results = await Promise.allSettled([
        openOwnerBriefingTask(review, task.key),
        originalHandoff.inspectVerifiedTaskHandoff(review, task.key),
      ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(openOwnerBriefingTask(review, task.key)).rejects.toThrow(
      'already held',
    );
    await expect(
      readOwnerBriefingGuide(
        { ...f.sources },
        { ...f.input, ordering: 'RECORDED_DAY_FIRST', input_revision: 2 },
        f.gate,
      ),
    ).rejects.toThrow('already held');
    await expect(
      originalHandoff.readVerifiedTaskHandoff(f.sources, f.input, f.gate),
    ).rejects.toThrow('already held');
  });
  it('validates selected-job hints independently, including a different job at the same property and changed selection', async () => {
    const f = await fixture(),
      review = await f.read(),
      first = f.sources.entries[0],
      sameProperty = f.allSources.entries[3],
      task = review.tasks.find((task) => task.job_id === first.target.job_id)!;
    expect(first.target.location_id).toBe(sameProperty.target.location_id);
    await expect(
      openOwnerBriefingTask(review, task.key, sameProperty.target.job_id!),
    ).rejects.toThrow();
    await expect(
      openOwnerBriefingTask(review, task.key, crypto.randomUUID()),
    ).rejects.toThrow();
    const link = await openOwnerBriefingTask(
        review,
        task.key,
        first.target.job_id!,
      ),
      destination = inspectOwnerBriefingDestination(link),
      callback = vi.fn();
    expect(
      navigateOwnerBriefingTask(
        destination,
        callback,
        sameProperty.target.job_id!,
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
    expect(returnOwnerBriefingTask(link, first.target.job_id!).status).toBe(
      'UNKNOWN',
    );
  });
  it.each(['foreign', 'property', 'missing-job', 'ambiguous'] as const)(
    'never makes an original destination from %s sources',
    async (kind) => {
      const f = await fixture();
      if (kind === 'foreign') {
        const foreign = await fixture(1);
        f.sources.entries = [
          foreign.sources.entries[0],
          ...f.sources.entries.slice(1),
        ];
      }
      if (kind === 'property')
        f.sources.entries[0].target.location_id =
          f.allSources.entries[1].target.location_id;
      if (kind === 'missing-job')
        f.sources.entries[0].target.job_id = crypto.randomUUID();
      if (kind === 'ambiguous')
        f.sources.entries = [...f.sources.entries, f.sources.entries[0]];
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('rejects unknown/uninspected/copied destinations and arbitrary section/URL without callbacks', async () => {
    const f = await selected(),
      destination = inspectOwnerBriefingDestination(f.link),
      callback = vi.fn(),
      forged = structuredClone(destination);
    Object.assign(forged.destination, {
      section: 'https://example.invalid',
      status: 'EXACT_LOCAL_REVIEW_TARGET',
    });
    expect(navigateOwnerBriefingTask(forged, callback).status).toBe('UNKNOWN');
    expect(
      navigateOwnerBriefingTask(
        f.link as unknown as typeof destination,
        callback,
      ).status,
    ).toBe('UNKNOWN');
    expect(() =>
      assertOwnerBriefingDestinationCurrent(structuredClone(destination)),
    ).toThrow();
    expect(() =>
      assertOwnerBriefingTaskCurrent(structuredClone(f.link)),
    ).toThrow();
    expect(returnOwnerBriefingTask(structuredClone(f.link)).status).toBe(
      'UNKNOWN',
    );
    await expect(
      openOwnerBriefingTask(f.review, 'unknown-key'),
    ).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
  it.each(['off', 'truthy', 'production', 'remote', 'https'] as const)(
    '%s admission precedes getters/serializers and controls',
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
      const sources = poison as Parameters<typeof readOwnerBriefingGuide>[0],
        enabled =
          mode === 'truthy' ? ('true' as unknown as boolean) : mode !== 'off';
      await expect(
        readOwnerBriefingGuide(
          sources,
          {
            review_on: '',
            timezone: '',
            ordering: 'EVIDENCE_FIRST',
            input_revision: 1,
          },
          { enabled, confirmed: true },
        ),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(OwnerBriefingGuide, {
            sources,
            enabled,
          }),
        ),
      ).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['staff', 'inactive'] as const)(
    'denies %s access before creating a private owner briefing',
    async (kind) => {
      const f = await fixture(),
        original = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          original(org).map((member) => ({
            ...member,
            role: kind === 'staff' ? 'staff' : member.role,
            active: kind !== 'inactive',
          })),
      );
      await expect(f.read()).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(OwnerBriefingGuide, {
            sources: f.sources,
            enabled: true,
          }),
        ),
      ).not.toContain('<input');
    },
  );
  it.each([0, 1, 2])(
    'brand %i consumer validates optional hint before controls and retains approved scoped presentation',
    async (index) => {
      const f = await fixture(index),
        markup = renderToStaticMarkup(
          createElement(OwnerBriefingGuide, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.sources.entries[0].target.job_id!,
          }),
        );
      expect(markup).toContain('Owner briefing guide');
      expect(markup).toContain('Read owner briefing sources');
      expect(markup).not.toContain('<pre');
      expect(markup).not.toContain('aria-label="Verified task handoff"');
      expect(markup).not.toContain('Open original workflow review');
      expect(
        renderToStaticMarkup(
          createElement(OwnerBriefingGuide, {
            sources: f.sources,
            enabled: true,
            selectedJobId: crypto.randomUUID(),
          }),
        ),
      ).not.toContain('<input');
    },
  );
});
