import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  prepareIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readBusinessBriefing,
  filterBusinessBriefing,
  inspectBusinessBriefing,
  openBusinessBriefingSource,
  openBusinessBriefingJob,
  type BusinessBriefingInput,
  type BusinessBriefingFilter,
} from '../src/lib/workflows/business-briefing';
import { BusinessBriefing } from '../src/components/workflows/BusinessBriefing';
afterEach(() => vi.restoreAllMocks());
const clear: BusinessBriefingFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
};
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input: BusinessBriefingInput = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      input_revision: 1,
    };
  return {
    sources,
    gate,
    input,
    read: () => readBusinessBriefing(sources, input, gate),
  };
}
function digestChange(change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let triggered = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !triggered &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_SYNTHETIC_BUSINESS_BRIEFING')
    ) {
      triggered = true;
      await change();
    }
    return result;
  });
  return () => triggered;
}
describe('Cycle 9 source-bound cross-job business briefing', () => {
  it.each([0, 1, 2])(
    'company %i composes actual selected jobs without actions, private data or Copilot claims',
    async (index) => {
      const f = await fixture(index),
        { sources: s } = f,
        original = JSON.stringify(
          s.entries.map((e) => ({
            source: s.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
        ),
        prior = s.entries.map((e) =>
          readIntelligenceWorkflowAttempt(s.estimates, e.target, f.gate),
        );
      const writers = [
        vi.spyOn(s.estimates, 'recordTime'),
        vi.spyOn(s.estimates, 'submitExpense'),
        vi.spyOn(s.estimates, 'projection'),
        vi.spyOn(s.estimates, 'payroll'),
        vi.spyOn(s.property, 'saveVisit'),
        vi.spyOn(s.property, 'submit'),
        ...s.entries.map((e) => vi.spyOn(e.release, 'command')),
      ];
      const r = await f.read();
      expect(r.jobs.map((j) => j.target)).toEqual(
        s.entries.map((e) => e.target),
      );
      expect(r.coverage.selected_jobs).toBe(4);
      expect(new Set(r.jobs.map((j) => j.target.location_id)).size).toBe(3);
      expect(r.cards.length).toBeGreaterThan(4);
      expect(new Set(r.cards.map((c) => c.key)).size).toBe(r.cards.length);
      expect(r.coverage.history).toBe(
        'AVAILABLE_EXACT_SELECTED_JOB_SOURCES_ONLY_NOT_WHOLE_COMPANY',
      );
      expect(
        r.jobs.every(
          (j) =>
            j.finance.coverage === 'UNKNOWN' &&
            j.finance.invoice_readiness === 'NO_GO',
        ),
      ).toBe(true);
      expect(r.model).toBe('NONE');
      expect(r.addons.voice).toBe('NOT_EXECUTED');
      expect(Object.values(r.authority).every((v) => v === false)).toBe(true);
      expect(JSON.stringify(r)).not.toMatch(
        /PRIVATE staff|Synthetic planning supplier|journey-.*@example|5550100100|internal_notes|unit_cost_minor|cash_minor|burden_minor/,
      );
      expect(
        s.entries.map((e) =>
          readIntelligenceWorkflowAttempt(s.estimates, e.target, f.gate),
        ),
      ).toEqual(prior);
      expect(
        JSON.stringify(
          s.entries.map((e) => ({
            source: s.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
        ),
      ).toBe(original);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
      expect(await inspectBusinessBriefing(r)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each([0, 1, 2])(
    'company %i navigates every exact published report/version and issued source',
    async (index) => {
      const f = await fixture(index),
        r = await f.read();
      for (const job of r.jobs) {
        const entry = f.sources.entries.find(
          (e) => e.target.job_id === job.target.job_id,
        )!;
        const report = r.cards.find(
          (c) => c.job_id === job.target.job_id && c.source.kind === 'report',
        )!;
        expect(report.source).toMatchObject({
          id: entry.report_id,
          version: entry.published_version,
        });
        const opened = await openBusinessBriefingSource(r, report.key);
        expect(opened.target).toEqual(entry.target);
        expect(opened.source).toEqual(report.source);
        expect(
          'report' in opened.detail && opened.detail.report.report_id,
        ).toBe(entry.report_id);
        expect(
          'report' in opened.detail && opened.detail.report.published_version,
        ).toBe(entry.published_version);
        expect(openBusinessBriefingJob(r, entry.target.job_id!)).toEqual({
          authority: 'NAVIGATION_ONLY',
          target: entry.target,
        });
      }
      const issued = r.cards.find((c) => c.source.kind === 'issued')!,
        opened = await openBusinessBriefingSource(r, issued.key);
      expect(
        'issued' in opened.detail && opened.detail.issued?.version_id,
      ).toBe(opened.target.version_id);
    },
  );
  it('orders review gaps deterministically without inferring physical urgency', async () => {
    const f = await fixture(),
      a = await f.read(),
      b = await f.read();
    expect(a.cards.map((c) => c.key)).toEqual(b.cards.map((c) => c.key));
    const firstReview = a.cards.findIndex((c) => c.level === 'review');
    expect(
      a.cards.slice(0, firstReview).every((c) => c.level === 'evidence'),
    ).toBe(true);
    expect(a.order_meaning).toContain('No severity, urgency, deadline');
    expect(a.coverage.physical_completion).toBe('UNVERIFIED');
    expect(a.cards.every((c) => !('urgency' in c) && !('resolved' in c))).toBe(
      true,
    );
  });
  it('combines job, area, review type and literal source query with accurate counts', async () => {
    const f = await fixture(),
      r = await f.read(),
      report = r.cards.find((c) => c.source.kind === 'report')!;
    const result = filterBusinessBriefing(r, {
      job_id: report.job_id,
      area: 'documentation',
      level: 'review',
      query: report.source.id,
    });
    expect(result.matching).toBe(1);
    expect(result.cards[0]).toEqual(report);
    expect(result.available).toBe(r.cards.length);
    expect(filterBusinessBriefing(r, clear).matching).toBe(r.cards.length);
    const no = filterBusinessBriefing(r, {
      ...clear,
      query: '[not.*a literal match]',
    });
    expect(no.matching).toBe(0);
    expect(no.coverage.history).toBe(r.coverage.history);
  });
  it('preserves two different jobs at the same property as separate exact contexts', async () => {
    const f = await fixture(),
      r = await f.read(),
      shared = f.sources.entries[0].target.location_id,
      jobs = r.jobs.filter((j) => j.target.location_id === shared);
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((j) => j.target.job_id)).size).toBe(2);
    for (const job of jobs) {
      expect(
        filterBusinessBriefing(r, {
          ...clear,
          job_id: job.target.job_id,
        }).cards.every((c) => c.job_id === job.target.job_id),
      ).toBe(true);
    }
  });
  it('civil-day context filters recorded field events but retains available report/scope context', async () => {
    const f = await fixture(),
      a = await f.read();
    f.input.review_on = f.sources.entries[1].day;
    f.input.input_revision++;
    const b = await f.read();
    expect(
      a.cards
        .filter((c) => c.source.kind === 'visit')
        .every((c) => c.recorded_day === f.sources.entries[0].day),
    ).toBe(true);
    expect(
      b.cards
        .filter((c) => c.source.kind === 'visit')
        .every((c) => c.recorded_day === f.sources.entries[1].day),
    ).toBe(true);
    expect(a.cards.some((c) => c.source.kind === 'visit')).toBe(true);
    expect(b.cards.some((c) => c.source.kind === 'visit')).toBe(true);
    expect(a.cards.filter((c) => c.source.kind === 'report').length).toBe(
      b.cards.filter((c) => c.source.kind === 'report').length,
    );
    expect(a.date_meaning).toContain('no deadline');
  });
  it('shows existing source-bound Copilot metadata without replaying preparation', async () => {
    const f = await fixture(),
      entry = f.sources.entries[0];
    await prepareIntelligenceWorkflow(
      f.sources.estimates,
      entry.target,
      { review_on: entry.day, advanced: null },
      f.gate,
    );
    const prior = readIntelligenceWorkflowAttempt(
        f.sources.estimates,
        entry.target,
        f.gate,
      ),
      r = await f.read();
    expect(r.jobs[0].existing_intelligence.status).toBe(prior.status);
    expect(r.jobs[0].existing_intelligence.phase).toBe(prior.phase);
    expect(r.jobs[0].existing_intelligence.retry).toBe(false);
    expect(
      readIntelligenceWorkflowAttempt(
        f.sources.estimates,
        entry.target,
        f.gate,
      ),
    ).toEqual(prior);
  });
  it('rejects Copilot metadata changes at the final hash rather than reporting old metadata current', async () => {
    const f = await fixture(),
      entry = f.sources.entries[0],
      triggered = digestChange(async () => {
        await prepareIntelligenceWorkflow(
          f.sources.estimates,
          entry.target,
          { review_on: entry.day, advanced: null },
          f.gate,
        );
      });
    await expect(f.read()).rejects.toThrow();
    expect(triggered()).toBe(true);
  });
  it.each([
    [
      'review day',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.review_on = '2026-12-09';
      },
    ],
    [
      'timezone',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.timezone = 'UTC';
      },
    ],
    [
      'receipt',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[3].receipt_id = crypto.randomUUID();
      },
    ],
    [
      'offer',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[2].offer_id = crypto.randomUUID();
      },
    ],
    [
      'source handle',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries = [...f.sources.entries];
      },
    ],
    [
      'gate',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.gate.confirmed = false;
      },
    ],
  ] as const)(
    'rejects original %s drift during final asynchronous work',
    async (_name, change) => {
      const f = await fixture(),
        triggered = digestChange(() => change(f));
      await expect(f.read()).rejects.toThrow();
      expect(triggered()).toBe(true);
    },
  );
  it('rejects current role withdrawal at the final hash', async () => {
    const f = await fixture(),
      members = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      triggered = digestChange(() => {
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          members(org).map((m) => ({ ...m, active: false })),
        );
      });
    await expect(f.read()).rejects.toThrow();
    expect(triggered()).toBe(true);
  });
  it('rejects foreign company, wrong property and duplicate job contexts', async () => {
    const f = await fixture(),
      foreign = await fixture(1);
    await expect(
      readBusinessBriefing(
        { ...f.sources, entries: [foreign.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readBusinessBriefing(
        { ...f.sources, entries: [f.sources.entries[0], f.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    f.sources.entries[0].target.location_id =
      f.sources.entries[1].target.location_id;
    await expect(f.read()).rejects.toThrow();
  });
  it.each(['staff', 'inactive'] as const)(
    'denies %s staff without exposing manager evidence',
    async (role) => {
      const f = await fixture(),
        members = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          members(org).map((m) =>
            m.user_id === f.sources.entries[0].target.actor_id
              ? {
                  ...m,
                  active: role !== 'inactive',
                  role: role === 'inactive' ? m.role : 'staff',
                }
              : m,
          ),
      );
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('retains immutable exact evidence and withholds after actual visit source changes', async () => {
    const f = await fixture(),
      r = await f.read(),
      bytes = JSON.stringify(r),
      entry = f.sources.entries[0],
      visit = f.sources.property
        .read(f.sources.company.id)
        .visits.find((v) => v.id === entry.scheduled_visit_id)!;
    f.sources.property.saveVisit(f.sources.company.id, visit, {
      ...visit.content,
      summary: 'Changed recorded visit',
    });
    expect(await inspectBusinessBriefing(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(JSON.stringify(r)).toBe(bytes);
    expect(() => filterBusinessBriefing(r, clear)).toThrow();
    await expect(
      openBusinessBriefingSource(r, r.cards[0].key),
    ).rejects.toThrow();
  });
  it('rejects imported evidence, unknown job/source and false report-version references', async () => {
    const f = await fixture(),
      r = await f.read(),
      copy = structuredClone(r);
    expect(await inspectBusinessBriefing(copy)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() => openBusinessBriefingJob(r, crypto.randomUUID())).toThrow();
    expect(() =>
      filterBusinessBriefing(r, { ...clear, job_id: crypto.randomUUID() }),
    ).toThrow();
    await expect(
      openBusinessBriefingSource(
        r,
        r.cards
          .find((c) => c.source.kind === 'report')!
          .key.replace(':v1', ':v999'),
      ),
    ).rejects.toThrow();
    const { sha256, ...body } = r;
    expect(await documentHash(body)).toBe(sha256);
    expect(Object.isFrozen(r.cards[0].source.related_ids)).toBe(true);
  });
  it.each(['2026-02-30', 'not-a-day'])(
    'rejects invalid civil day %s',
    async (day) => {
      const f = await fixture();
      f.input.review_on = day;
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('rejects nonprimitive filter values without calling conversion code', async () => {
    const f = await fixture(),
      r = await f.read(),
      convert = vi.fn(() => 'all');
    expect(() =>
      filterBusinessBriefing(r, {
        ...clear,
        area: { toString: convert } as unknown as 'all',
      }),
    ).toThrow();
    expect(convert).not.toHaveBeenCalled();
  });
  it('rejects input accessors without evaluating them', async () => {
    const f = await fixture(),
      getter = vi.fn(() => '2026-12-07');
    Object.defineProperty(f.input, 'review_on', {
      get: getter,
      enumerable: true,
    });
    await expect(f.read()).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])(
    'company %i has an accessible explicit-confirmation form and default OFF',
    async (index) => {
      const f = await fixture(index),
        off = renderToStaticMarkup(
          createElement(BusinessBriefing, { sources: f.sources }),
        ),
        on = renderToStaticMarkup(
          createElement(BusinessBriefing, {
            sources: f.sources,
            enabled: true,
          }),
        );
      expect(off).toContain('Business briefing is off');
      expect(off).not.toContain('<input');
      expect(on).toContain('aria-label="Business operating briefing"');
      expect(on).toContain('Review day');
      expect(on).toContain('IANA timezone');
      expect(on).toContain('I confirm this exact selected-job set');
      expect(on).not.toContain('<header');
    },
  );
});
