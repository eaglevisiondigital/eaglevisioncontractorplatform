import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readRecordedOwnerActions,
  recordedOwnerActionCards,
} from '../src/lib/workflows/recorded-owner-actions';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readSavedSourceExercise,
  readSavedTaskCorrection,
  executeSavedTaskCorrection,
  executeSavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readCurrentOwnerPriorities,
  assertCurrentOwnerPriorities,
  inspectCurrentOwnerPriority,
  continueCurrentOwnerPriority,
} from '../src/lib/workflows/current-owner-priorities';
import { CurrentOwnerPriorities } from '../src/components/workflows/CurrentOwnerPriorities';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[0];
  return {
    gate,
    sources,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) =>
  readCurrentOwnerPriorities(f.sources, f.job, f.gate);
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
}
async function forecast(f: Fixture) {
  const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
  await f.sources.estimates.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 1,
    },
  });
}
describe('Cycle22 current owner priorities quote original saved workflow state', () => {
  it.each([0, 1, 2])(
    'case %# brand %i preserves original ranks and exact native source identities',
    async (brand) => {
      const f = await fixture(brand),
        view = await read(f),
        cards = recordedOwnerActionCards(view.original);
      expect(view.rows.map((r) => r.key)).toEqual(cards.map((c) => c.key));
      expect(view.rows.map((r) => r.rank)).toEqual(cards.map((c) => c.rank));
      expect(
        view.rows.every(
          (r, i) =>
            r.source.id === cards[i].source.id &&
            r.recorded_fact === cards[i].recorded_fact,
        ),
      ).toBe(true);
      expect(
        view.rows.some((r) => r.state === 'RECORDED_FINANCE_REQUIREMENTS'),
      ).toBe(true);
      expect(view.rows.some((r) => r.state === 'RECORDED_TIME_STATE')).toBe(
        true,
      );
      expect(view.rows.some((r) => r.state === 'RECORDED_VISIT_STATE')).toBe(
        true,
      );
      expect(
        view.rows.some((r) => r.state === 'RECORDED_PUBLISHED_REPORT'),
      ).toBe(true);
      expect(
        view.rows.some((r) => r.state === 'RECORDED_IMMUTABLE_ISSUED_SCOPE'),
      ).toBe(true);
      expect(view.meaning).toBe(
        'CURRENT_RECORDED_WORKFLOW_STATE_NOT_ACTION_AUTHORITY',
      );
      expect(view.operational_ready).toBe(false);
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i reviewed material updates actual recorded finance state but retains incomplete costs',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        id = before.costs.material.expense_id!;
      await confirmCostCorrectionReview(
        before.costs,
        {
          expense_id: id,
          decision: 'approved',
          reason: 'Explicit synthetic source review.',
        },
        true,
      );
      expect(() => assertCurrentOwnerPriorities(before)).toThrow();
      const fresh = await read(f),
        finance = fresh.rows.filter((r) => r.source.kind === 'finance');
      expect(fresh.costs.costs.evidence.job_revision).toBe(
        before.costs.costs.evidence.job_revision + 1,
      );
      expect(
        finance.some((r) =>
          r.facts.includes(
            `Current job revision: ${fresh.costs.costs.evidence.job_revision}`,
          ),
        ),
      ).toBe(true);
      expect(
        finance.some((r) => r.facts.some((fact) => fact.includes('NO_GO'))),
      ).toBe(true);
      expect(fresh.costs.costs.evidence.facts.cost_coverage).not.toBe(
        'DECLARED_COSTS_COMPLETE',
      );
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i corrected task states keep exact original and correcting IDs without posting claims',
    async (brand) => {
      const f = await fixture(brand),
        source = await readSavedSourceExercise(f.sources, f.job, f.gate),
        task = await readSavedTaskCorrection(source);
      await executeSavedTaskCorrection(
        source,
        {
          source_entry_id: task.source_entry_id!,
          task: 'Manually corrected recorded task',
          started_at: task.started_at!,
          ended_at: task.ended_at!,
          billable: true,
        },
        true,
      );
      const view = await read(f),
        corrected = view.costs.costs.evidence.time.find(
          (t) => t.corrects_id === task.source_entry_id,
        )!,
        original = view.rows.find(
          (r) =>
            r.source.kind === 'time' && r.source.id === task.source_entry_id,
        )!,
        current = view.rows.find(
          (r) => r.source.kind === 'time' && r.source.id === corrected.id,
        )!;
      expect(original.facts.some((text) => text.includes(corrected.id))).toBe(
        true,
      );
      expect(current.facts).toContain(
        `Corrects entry: ${task.source_entry_id}`,
      );
      expect(
        current.facts.some((text) => text.includes('UNPOSTED OR UNVERIFIED')),
      ).toBe(true);
      expect(view.costs.costs.evidence.locked_periods).toHaveLength(0);
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i workflow inspection uses original authorized navigation once',
    async (brand) => {
      const f = await fixture(brand),
        view = await read(f),
        source = await inspectCurrentOwnerPriority(view, view.rows[0].key),
        callback = vi.fn(),
        live = { current: callback, generation: 0 };
      expect(
        (await continueCurrentOwnerPriority(view, source, callback, live))
          .status,
      ).toBe('CURRENT_REVIEW_ONLY');
      expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, source.step);
      expect(
        (await continueCurrentOwnerPriority(view, source, callback, live))
          .status,
      ).toBe('WITHHELD_NO_DISPATCH');
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it('changed derived visit card identity is not treated as resolved or matched by text', async () => {
    const f = await fixture(),
      before = await read(f),
      old = before.rows.find(
        (r) =>
          r.source.kind === 'visit' &&
          r.source.id === f.entry.scheduled_visit_id,
      )!;
    const visit = f.sources.property
      .read(f.org)
      .visits.find((v) => v.id === old.source.id)!;
    f.sources.property.saveVisit(f.org, visit, {
      ...visit.content,
      summary: 'Explicit saved source observation change.',
    });
    const current = await read(f);
    expect(current.rows.some((r) => r.key === old.key)).toBe(false);
    expect(
      current.rows.some(
        (r) =>
          r.source.id === old.source.id &&
          r.source.revision === old.source.revision! + 1,
      ),
    ).toBe(true);
    await expect(
      inspectCurrentOwnerPriority(current, old.key),
    ).rejects.toThrow();
    expect(() => assertCurrentOwnerPriorities(before)).toThrow();
    expect(
      current.rows.every((r) => !r.facts.some((text) => text === 'RESOLVED')),
    ).toBe(true);
  });
  it('new publication keeps original immutable report/version facts without completion inference', async () => {
    const f = await fixture(),
      before = await read(f),
      reports = f.sources.property.read(f.org).reports,
      source = await readSavedSourceExercise(f.sources, f.job, f.gate);
    await executeSavedSourceExercise(source, 'report-revision', true);
    const current = await read(f);
    expect(
      f.sources.property.read(f.org).reports.slice(0, reports.length),
    ).toEqual(reports);
    expect(
      current.rows.filter((r) => r.source.kind === 'report').length,
    ).toBeGreaterThan(
      before.rows.filter((r) => r.source.kind === 'report').length,
    );
    expect(
      current.rows.some((r) =>
        r.facts.some((text) => text.includes('does not establish acceptance')),
      ),
    ).toBe(true);
  });
  it.each(['revoked', 'property', 'version', 'job', 'gate'] as const)(
    'case %# %s drift withholds source facts and navigation',
    async (mode) => {
      const f = await fixture(),
        view = await read(f),
        source = await inspectCurrentOwnerPriority(view, view.rows[0].key),
        callback = vi.fn();
      if (mode === 'revoked') revoke(f);
      if (mode === 'property')
        f.entry.target.location_id = f.sources.entries[1].target.location_id;
      if (mode === 'version') f.entry.target.version_id = crypto.randomUUID();
      if (mode === 'job')
        f.entry.target.job_id = f.sources.entries[1].target.job_id;
      if (mode === 'gate') f.gate.enabled = false;
      expect(() => assertCurrentOwnerPriorities(view)).toThrow();
      expect(
        (
          await continueCurrentOwnerPriority(view, source, callback, {
            current: callback,
            generation: 0,
          })
        ).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('foreign company and absent job cannot reuse source records', async () => {
    const f = await fixture(),
      other = await fixture(1);
    await expect(
      readCurrentOwnerPriorities(f.sources, other.job, f.gate),
    ).rejects.toThrow();
    await expect(
      readCurrentOwnerPriorities(f.sources, 'missing', f.gate),
    ).rejects.toThrow();
  });
  it('missing source keys never select another similarly worded priority', async () => {
    const f = await fixture(),
      view = await read(f);
    await expect(
      inspectCurrentOwnerPriority(view, 'missing'),
    ).rejects.toThrow();
    await expect(
      inspectCurrentOwnerPriority(view, view.rows[0].recorded_fact),
    ).rejects.toThrow();
  });
  it('copied views and inspections are not original navigation handles', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectCurrentOwnerPriority(view, view.rows[0].key),
      callback = vi.fn();
    expect(() => assertCurrentOwnerPriorities({ ...view })).toThrow();
    expect(
      (
        await continueCurrentOwnerPriority(view, { ...source }, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('pre-dispatch saved source drift is UNKNOWN without a callback', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectCurrentOwnerPriority(view, view.rows[0].key),
      callback = vi.fn();
    await forecast(f);
    expect(
      (
        await continueCurrentOwnerPriority(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  });
  it('failed original navigation cannot be retried from a fresh wrapper or revision', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectCurrentOwnerPriority(view, view.rows[0].key),
      callback = vi.fn(async () => {
        throw Error('lost outcome');
      });
    expect(
      (
        await continueCurrentOwnerPriority(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await forecast(f);
    await expect(
      readCurrentOwnerPriorities({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('concurrent wrappers share original PENDING custody', async () => {
    const f = await fixture(),
      a = await read(f),
      b = await readCurrentOwnerPriorities({ ...f.sources }, f.job, f.gate),
      one = await inspectCurrentOwnerPriority(a, a.rows[0].key),
      two = await inspectCurrentOwnerPriority(b, b.rows[0].key);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      wait = new Promise<void>((r) => {
        release = r;
      }),
      callback = vi.fn(async () => {
        entered();
        await wait;
      });
    const first = continueCurrentOwnerPriority(a, one, callback, {
      current: callback,
      generation: 0,
    });
    await started;
    expect(
      (
        await continueCurrentOwnerPriority(b, two, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('PENDING');
    release();
    expect((await first).status).toBe('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('live callback removal is withheld before invocation', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectCurrentOwnerPriority(view, view.rows[0].key),
      callback = vi.fn();
    expect(
      (
        await continueCurrentOwnerPriority(view, source, callback, {
          current: undefined,
          generation: 1,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('post-dispatch workflow change retains original UNKNOWN', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectCurrentOwnerPriority(view, view.rows[0].key),
      callback = vi.fn(() => forecast(f));
    expect(
      (
        await continueCurrentOwnerPriority(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(read(f)).rejects.toThrow();
  });
  it('OFF and executable admission are rejected before source getters', async () => {
    const getter = vi.fn(() => {
      throw Error('executed');
    });
    await expect(
      readCurrentOwnerPriorities(
        Object.defineProperty({}, 'entries', { get: getter }) as never,
        'missing',
      ),
    ).rejects.toThrow('OFF');
    await expect(
      readCurrentOwnerPriorities(
        {} as never,
        'missing',
        Object.defineProperty({ confirmed: true }, 'enabled', {
          get: getter,
        }) as never,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('read-only state retains the original ranker and produces no writes, provider or financial action', async () => {
    const f = await fixture(),
      before = await readRecordedOwnerActions(f.sources, f.job, f.gate),
      submit = vi.spyOn(f.sources.estimates, 'submitExpense'),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense'),
      payroll = vi.spyOn(f.sources.estimates, 'payroll'),
      save = vi.spyOn(f.sources.property, 'saveVisit'),
      fetch = vi.fn(),
      release = JSON.stringify(f.entry.release.read('staff'));
    vi.stubGlobal('fetch', fetch);
    const view = await read(f);
    expect(view.rows.map((r) => r.key)).toEqual(
      before.snapshot.evidence.cards.map((c) => c.key),
    );
    expect(submit).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(f.entry.release.read('staff'))).toBe(release);
    expect(JSON.stringify(view.rows)).not.toMatch(
      /unit_cost_minor|worker_rate|staff_notes|payroll_deductions/,
    );
  });
  it('default-OFF renderer creates no implicit reads or original action controls', () => {
    const html = renderToStaticMarkup(
      createElement(CurrentOwnerPriorities, { sources: {} as never }),
    );
    expect(html).toContain('Current owner priorities are OFF');
    expect(html).not.toContain('Read current owner priorities');
  });
});
