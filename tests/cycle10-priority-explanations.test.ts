import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readBusinessBriefing } from '../src/lib/workflows/business-briefing';
import {
  prepareIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readPriorityExplanations,
  filterPriorityExplanations,
  openPriorityExplanation,
  openPriorityExplanationJob,
  inspectPriorityExplanations,
  type PriorityExplanationsInput,
  type PriorityExplanationsFilter,
} from '../src/lib/workflows/priority-explanations';
import { PriorityExplanations } from '../src/components/workflows/PriorityExplanations';
afterEach(() => vi.restoreAllMocks());
const clear: PriorityExplanationsFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
};
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input: PriorityExplanationsInput = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      input_revision: 1,
    };
  return {
    sources,
    gate,
    input,
    read: () => readPriorityExplanations(sources, input, gate),
  };
}
function digestChange(change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !fired &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_SYNTHETIC_PRIORITY_EXPLANATIONS')
    ) {
      fired = true;
      await change();
    }
    return result;
  });
  return () => fired;
}
describe('Cycle 10 explainable source-based daily review', () => {
  it.each([0, 1, 2])(
    'company %i separates source facts, review suggestions and explicit unknowns without actions',
    async (index) => {
      const f = await fixture(index),
        s = f.sources,
        original = JSON.stringify(
          s.entries.map((e) => ({
            source: s.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
        ),
        claims = s.entries.map((e) =>
          readIntelligenceWorkflowAttempt(s.estimates, e.target, f.gate),
        ),
        writers = [
          vi.spyOn(s.estimates, 'recordTime'),
          vi.spyOn(s.estimates, 'projection'),
          vi.spyOn(s.estimates, 'submitExpense'),
          vi.spyOn(s.estimates, 'payroll'),
          vi.spyOn(s.property, 'saveVisit'),
          ...s.entries.map((e) => vi.spyOn(e.release, 'command')),
        ];
      const r = await f.read();
      expect(r.jobs.map((j) => j.target)).toEqual(
        s.entries.map((e) => e.target),
      );
      expect(r.coverage.selected_jobs).toBe(4);
      expect(r.model).toBe('NONE');
      expect(r.counts.available).toBe(r.explanations.length);
      expect(r.counts.evidence + r.counts.review).toBe(r.counts.available);
      expect(
        r.explanations.every(
          (e, i) =>
            e.rank === i + 1 &&
            e.recorded_fact.length > 0 &&
            e.suggested_human_review.length > 0,
        ),
      ).toBe(true);
      expect(
        r.explanations.every((e) =>
          e.missing_evidence.some(
            (m) => m.code === 'HISTORY_COVERAGE' && m.status === 'UNKNOWN',
          ),
        ),
      ).toBe(true);
      expect(
        r.explanations
          .filter((e) => e.area === 'finance')
          .every((e) =>
            e.missing_evidence.some(
              (m) => m.code === 'COST_COVERAGE' && m.status === 'UNKNOWN',
            ),
          ),
      ).toBe(true);
      expect(
        r.explanations.every(
          (e) => e.authority === 'HUMAN_REVIEW_SUGGESTION_ONLY',
        ),
      ).toBe(true);
      expect(Object.values(r.authority).every((a) => a === false)).toBe(true);
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
      ).toBe(original);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
      expect(await inspectPriorityExplanations(r)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each([0, 1, 2])(
    'company %i opens exact original report/version and issued sources for every job',
    async (index) => {
      const f = await fixture(index),
        r = await f.read();
      for (const entry of f.sources.entries) {
        const report = r.explanations.find(
          (e) => e.job_id === entry.target.job_id && e.source.kind === 'report',
        )!;
        expect(report.source).toMatchObject({
          id: entry.report_id,
          version: entry.published_version,
          target: entry.target,
        });
        const opened = await openPriorityExplanation(r, report.key);
        expect(opened.target).toEqual(entry.target);
        expect(
          'report' in opened.detail && opened.detail.report.report_id,
        ).toBe(entry.report_id);
        expect(
          'report' in opened.detail && opened.detail.report.published_version,
        ).toBe(entry.published_version);
        expect(
          opened.explanation.missing_evidence.some(
            (m) =>
              m.code === 'PHYSICAL_COMPLETION' && m.status === 'UNVERIFIED',
          ),
        ).toBe(true);
        expect(openPriorityExplanationJob(r, entry.target.job_id!)).toEqual({
          authority: 'NAVIGATION_ONLY',
          target: entry.target,
        });
      }
      const issued = r.explanations.find((e) => e.source.kind === 'issued')!,
        opened = await openPriorityExplanation(r, issued.key);
      expect(
        'issued' in opened.detail && opened.detail.issued?.version_id,
      ).toBe(issued.source.target.version_id);
      expect(
        issued.missing_evidence.some(
          (m) => m.code === 'CONTRACT_AUTHORITY' && m.status === 'UNVERIFIED',
        ),
      ).toBe(true);
    },
  );
  it('annotates the existing briefing order and exact facts without implementing a competing priority engine', async () => {
    const f = await fixture(),
      source = await readBusinessBriefing(f.sources, f.input, f.gate),
      r = await f.read();
    expect(r.explanations.map((e) => e.key)).toEqual(
      source.cards.map((c) => c.key),
    );
    for (const [index, explanation] of r.explanations.entries()) {
      expect(explanation.recorded_fact).toBe(source.cards[index].observation);
      expect(explanation.suggested_human_review).toBe(
        source.cards[index].suggested_review,
      );
      expect(explanation.why_this_order).toHaveLength(3);
      expect(explanation.source.id).toBe(source.cards[index].source.id);
      expect(explanation.source.target.job_id).toBe(source.cards[index].job_id);
    }
    expect(r.order_meaning).toContain('No severity, urgency, deadline');
  });
  it('combines area/evidence/job/literal filters with accurate counts and keeps original positions', async () => {
    const f = await fixture(),
      r = await f.read(),
      report = r.explanations.find((e) => e.source.kind === 'report')!,
      result = filterPriorityExplanations(r, {
        area: 'documentation',
        level: 'review',
        job_id: report.job_id,
        query: report.source.id,
      });
    expect(result.matching).toBe(1);
    expect(result.explanations[0]).toEqual(report);
    expect(result.explanations[0].rank).toBe(report.rank);
    expect(result.available).toBe(r.explanations.length);
    expect(
      filterPriorityExplanations(r, { ...clear, query: '[literal.*no-match]' })
        .matching,
    ).toBe(0);
    expect(filterPriorityExplanations(r, clear).matching).toBe(
      r.explanations.length,
    );
  });
  it('date-only visits retain availability/capacity gaps and dates never become urgency', async () => {
    const f = await fixture(),
      r = await f.read(),
      visits = r.explanations.filter((e) => e.source.kind === 'visit');
    expect(visits.length).toBeGreaterThan(0);
    for (const visit of visits) {
      expect(visit.missing_evidence.map((m) => m.code)).toEqual(
        expect.arrayContaining([
          'ACTUAL_AVAILABILITY',
          'CAPACITY',
          'VISIT_TIMING',
        ]),
      );
      expect(visit.why_this_order[1]).toContain(
        'not a due date, urgency or prediction',
      );
    }
    expect(
      r.explanations.every(
        (e) => !('urgent' in e) && !('resolved' in e) && !('forecast' in e),
      ),
    ).toBe(true);
  });
  it('same-property jobs retain independent source identity and no fuzzy grouping', async () => {
    const f = await fixture(),
      r = await f.read(),
      property = f.sources.entries[0].target.location_id,
      ids = r.jobs
        .filter((j) => j.target.location_id === property)
        .map((j) => j.target.job_id);
    expect(ids).toHaveLength(2);
    for (const job_id of ids) {
      const own = filterPriorityExplanations(r, { ...clear, job_id });
      expect(own.explanations.length).toBeGreaterThan(0);
      expect(own.explanations.every((e) => e.job_id === job_id)).toBe(true);
    }
    expect(new Set(r.explanations.map((e) => e.key)).size).toBe(
      r.explanations.length,
    );
  });
  it('known partial cost evidence is not relabeled UNKNOWN or final profit', async () => {
    const f = await fixture();
    await f.sources.estimates.payroll(
      f.sources.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      {},
      true,
    );
    const r = await f.read();
    for (const row of r.explanations.filter((e) => e.area === 'finance')) {
      expect(
        row.missing_evidence.find((m) => m.code === 'COST_COVERAGE')?.status,
      ).toBe('UNVERIFIED');
      expect(
        row.missing_evidence.find((m) => m.code === 'COST_COVERAGE')?.detail,
      ).toContain('PARTIAL');
    }
  });
  it('reads existing Copilot metadata without starting or replaying a preparation', async () => {
    const f = await fixture(),
      e = f.sources.entries[0];
    await prepareIntelligenceWorkflow(
      f.sources.estimates,
      e.target,
      { review_on: e.day, advanced: null },
      f.gate,
    );
    const status = readIntelligenceWorkflowAttempt(
        f.sources.estimates,
        e.target,
        f.gate,
      ),
      r = await f.read();
    expect(r.jobs[0].existing_intelligence.status).toBe(status.status);
    expect(r.existing_intelligence.voice).toBe('NOT_EXECUTED');
    expect(
      readIntelligenceWorkflowAttempt(f.sources.estimates, e.target, f.gate),
    ).toEqual(status);
  });
  it('rejects changing Copilot status at the final explanation hash', async () => {
    const f = await fixture(),
      e = f.sources.entries[0],
      fired = digestChange(async () => {
        await prepareIntelligenceWorkflow(
          f.sources.estimates,
          e.target,
          { review_on: e.day, advanced: null },
          f.gate,
        );
      });
    await expect(f.read()).rejects.toThrow();
    expect(fired()).toBe(true);
  });
  it.each([
    [
      'day',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.review_on = '2026-12-30';
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
      'root handle',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries = [...f.sources.entries];
      },
    ],
    [
      'confirmation',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.gate.confirmed = false;
      },
    ],
  ] as const)(
    'rejects original %s drift at the final await',
    async (_name, change) => {
      const f = await fixture(),
        fired = digestChange(() => change(f));
      await expect(f.read()).rejects.toThrow();
      expect(fired()).toBe(true);
    },
  );
  it('rejects last-await staff revocation', async () => {
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
  it.each(['staff', 'inactive'] as const)(
    'rejects %s membership before staff projections',
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
                  role: role === 'inactive' ? m.role : 'staff',
                  active: role !== 'inactive',
                }
              : m,
          ),
      );
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('rejects foreign, duplicate and wrong-property job targets', async () => {
    const f = await fixture(),
      foreign = await fixture(1);
    await expect(
      readPriorityExplanations(
        { ...f.sources, entries: [foreign.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readPriorityExplanations(
        { ...f.sources, entries: [f.sources.entries[0], f.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    f.sources.entries[0].target.location_id =
      f.sources.entries[1].target.location_id;
    await expect(f.read()).rejects.toThrow();
  });
  it('retains immutable UNKNOWN after actual visit changes and rejects stale filters/navigation', async () => {
    const f = await fixture(),
      r = await f.read(),
      before = JSON.stringify(r),
      entry = f.sources.entries[0],
      visit = f.sources.property
        .read(f.sources.company.id)
        .visits.find((v) => v.id === entry.scheduled_visit_id)!;
    f.sources.property.saveVisit(f.sources.company.id, visit, {
      ...visit.content,
      summary: 'Changed source observation',
    });
    expect(await inspectPriorityExplanations(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() => filterPriorityExplanations(r, clear)).toThrow();
    await expect(
      openPriorityExplanation(r, r.explanations[0].key),
    ).rejects.toThrow();
    expect(JSON.stringify(r)).toBe(before);
  });
  it('rejects copied evidence and source substitutions while preserving hash/version integrity', async () => {
    const f = await fixture(),
      r = await f.read();
    expect(await inspectPriorityExplanations(structuredClone(r))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() => openPriorityExplanationJob(r, crypto.randomUUID())).toThrow();
    await expect(openPriorityExplanation(r, 'foreign-card')).rejects.toThrow();
    const report = r.explanations.find((e) => e.source.kind === 'report')!;
    await expect(
      openPriorityExplanation(r, report.key.replace(':v1', ':v999')),
    ).rejects.toThrow();
    expect(() =>
      filterPriorityExplanations(r, { ...clear, job_id: crypto.randomUUID() }),
    ).toThrow();
    const { sha256, ...body } = r;
    expect(await documentHash(body)).toBe(sha256);
    expect(Object.isFrozen(r.explanations[0].source.related_ids)).toBe(true);
  });
  it('rejects executable filters/input without invoking caller coercion', async () => {
    const f = await fixture(),
      r = await f.read(),
      coerce = vi.fn(() => 'all');
    expect(() =>
      filterPriorityExplanations(r, {
        ...clear,
        area: { toString: coerce } as unknown as 'all',
      }),
    ).toThrow();
    expect(coerce).not.toHaveBeenCalled();
    const getter = vi.fn(() => '2026-12-28');
    Object.defineProperty(f.input, 'review_on', {
      get: getter,
      enumerable: true,
    });
    await expect(f.read()).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['2026-02-30', 'not-a-day'])(
    'rejects invalid day %s through the existing daily admission',
    async (day) => {
      const f = await fixture();
      f.input.review_on = day;
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each([0, 1, 2])(
    'company %i renders an accessible explicit-context form and defaults OFF',
    async (index) => {
      const f = await fixture(index),
        off = renderToStaticMarkup(
          createElement(PriorityExplanations, { sources: f.sources }),
        ),
        on = renderToStaticMarkup(
          createElement(PriorityExplanations, {
            sources: f.sources,
            enabled: true,
          }),
        );
      expect(off).toContain('Priority explanations are off');
      expect(off).not.toContain('<input');
      expect(on).toContain('aria-label="Explainable operating priorities"');
      expect(on).toContain('Review day');
      expect(on).toContain('IANA timezone');
      expect(on).toContain('I confirm this exact selected-job set');
      expect(on).toContain(
        'No urgency, future outcome or completed work is inferred',
      );
    },
  );
});
