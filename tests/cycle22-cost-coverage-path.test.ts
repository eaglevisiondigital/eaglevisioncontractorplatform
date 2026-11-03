import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readSavedSourceExercise,
  readSavedTaskCorrection,
  executeSavedTaskCorrection,
} from '../src/lib/workflows/saved-revision-exercise';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readCostCoveragePath,
  assertCostCoveragePathCurrent,
  inspectCostCoverageSource,
  continueCostCoverageSource,
} from '../src/lib/workflows/cost-coverage-path';
import { CostCoveragePath } from '../src/components/workflows/CostCoveragePath';
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
async function fixture(brand = 0, prepared = true) {
  const gate = { enabled: true, confirmed: true },
    sources = await (
      prepared ? prepareCorrectionPreviewSources : prepareOperatingSources
    )(sampleCompanies[brand], gate),
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
const read = (f: Fixture) => readCostCoveragePath(f.sources, f.job, f.gate);
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
describe('Cycle22 original cost coverage and invoice source path', () => {
  it.each([0, 1, 2])(
    'case %# brand %i connects actual time/material events to canonical cost and NO_GO requirements',
    async (brand) => {
      const f = await fixture(brand),
        before = f.sources.estimates.syntheticJob(f.org, f.job)!,
        view = await read(f),
        e = view.original.costs.evidence;
      expect(view.original.canonical).toEqual(jobFinancials(before));
      expect(view.invoice_status).toBe('NO_GO');
      expect(view.coverage).toBe(e.facts.cost_coverage);
      expect(view.coverage).not.toBe('DECLARED_COSTS_COMPLETE');
      expect(
        view.rows.filter((r) => r.kind === 'time').map((r) => r.id),
      ).toEqual(e.time.map((t) => t.id));
      expect(
        view.rows.filter((r) => r.kind === 'material_review').map((r) => r.id),
      ).toEqual(e.reviews.map((r) => r.id));
      expect(
        view.rows.find((r) => r.kind === 'time')?.facts.join(' '),
      ).toContain('UNPOSTED OR UNVERIFIED');
      expect(
        view.rows.filter((r) => r.kind === 'invoice_requirement'),
      ).toHaveLength(e.invoice.requirements.length);
      expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(before);
      expect(view.operational_ready).toBe(false);
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i native material review changes exact event/cost source without completeness inference',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        id = before.original.material.expense_id!;
      await confirmCostCorrectionReview(
        before.original,
        {
          expense_id: id,
          decision: 'approved',
          reason: 'Explicit synthetic material evidence review.',
        },
        true,
      );
      expect(() => assertCostCoveragePathCurrent(before)).toThrow();
      const fresh = await read(f),
        row = inspectCostCoverageSource(fresh, { kind: 'material', id }),
        event = fresh.original.costs.evidence.reviews.find(
          (r) => r.submission_id === id,
        )!;
      expect(row.status).toBe('approved');
      expect(row.references).toContain(event.id);
      expect(
        inspectCostCoverageSource(fresh, {
          kind: 'material_review',
          id: event.id,
        }).references,
      ).toContain(id);
      expect(
        fresh.original.canonical.projected_cost_minor -
          before.original.canonical.projected_cost_minor,
      ).toBe(2500);
      expect(fresh.coverage).not.toBe('DECLARED_COSTS_COMPLETE');
      expect(fresh.invoice_status).toBe('NO_GO');
      expect(fresh.original.material.can_review).toBe(false);
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i exact time correction lineage remains unposted rather than zero cost',
    async (brand) => {
      const f = await fixture(brand),
        source = await readSavedSourceExercise(f.sources, f.job, f.gate),
        task = await readSavedTaskCorrection(source);
      await executeSavedTaskCorrection(
        source,
        {
          source_entry_id: task.source_entry_id!,
          task: 'Explicit corrected task',
          started_at: task.started_at!,
          ended_at: task.ended_at!,
          billable: true,
        },
        true,
      );
      const view = await read(f),
        time = view.original.costs.evidence.time,
        corrected = time.find((t) => t.corrects_id === task.source_entry_id)!;
      expect(
        inspectCostCoverageSource(view, {
          kind: 'time',
          id: task.source_entry_id!,
        }).references,
      ).toContain(corrected.id);
      expect(
        inspectCostCoverageSource(view, { kind: 'time', id: corrected.id })
          .references,
      ).toContain(task.source_entry_id);
      expect(view.original.costs.evidence.labor_entry_ids).toHaveLength(0);
      expect(view.coverage).not.toBe('DECLARED_COSTS_COMPLETE');
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i exact source handoff retains authorized job and original destination',
    async (brand) => {
      const f = await fixture(brand),
        view = await read(f),
        time = view.rows.find((r) => r.kind === 'time')!,
        source = inspectCostCoverageSource(view, { kind: 'time', id: time.id }),
        callback = vi.fn();
      expect(
        (
          await continueCostCoverageSource(view, source, callback, {
            current: callback,
            generation: 0,
          })
        ).status,
      ).toBe('CURRENT_REVIEW_ONLY');
      expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, 'field');
    },
  );
  it('locked original labor references are visible without posting or reopening a period', async () => {
    const f = await fixture(0, false),
      id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'Ended source',
        kind: 'work',
        started_at: '2026-02-03T10:00:00.000Z',
        ended_at: '2026-02-03T11:00:00.000Z',
        billable: false,
        corrects_id: null,
      });
    if (typeof id !== 'string') throw Error('Exact time ID required');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'Explicit synthetic review',
    );
    await f.sources.estimates.payroll(
      f.org,
      '2026-02-03T00:00:00.000Z',
      '2026-02-04T00:00:00.000Z',
      {},
      true,
    );
    const payroll = vi.spyOn(f.sources.estimates, 'payroll'),
      before = JSON.stringify(
        (await f.sources.estimates.workforce(f.org)).periods,
      ),
      view = await read(f);
    expect(
      inspectCostCoverageSource(view, { kind: 'time', id }).facts,
    ).toContain('Included in available canonical locked-labor evidence.');
    expect(
      JSON.stringify((await f.sources.estimates.workforce(f.org)).periods),
    ).toBe(before);
    expect(payroll).not.toHaveBeenCalled();
  });
  it('pending material remains unapproved and historical source rows stay unchanged on read', async () => {
    const f = await fixture(),
      view = await read(f),
      id = view.original.material.expense_id!;
    expect(
      inspectCostCoverageSource(view, { kind: 'material', id }).status,
    ).toBe('NO_UNIQUE_RECORDED_REVIEW');
    expect(
      view.original.costs.evidence.reviews.some((r) => r.submission_id === id),
    ).toBe(false);
  });
  it.each([
    'time',
    'material',
    'material_review',
    'invoice_requirement',
  ] as const)(
    'case %# exact %s source never falls back by wording or amount',
    async (kind) => {
      const f = await fixture(),
        view = await read(f);
      expect(() =>
        inspectCostCoverageSource(view, { kind, id: 'missing' }),
      ).toThrow();
    },
  );
  it.each(['revoked', 'property', 'version', 'job', 'gate'] as const)(
    'case %# %s drift withholds current details and all callbacks',
    async (mode) => {
      const f = await fixture(),
        view = await read(f),
        row = view.rows[0],
        callback = vi.fn();
      if (mode === 'revoked') revoke(f);
      if (mode === 'property')
        f.entry.target.location_id = f.sources.entries[1].target.location_id;
      if (mode === 'version') f.entry.target.version_id = crypto.randomUUID();
      if (mode === 'job')
        f.entry.target.job_id = f.sources.entries[1].target.job_id;
      if (mode === 'gate') f.gate.enabled = false;
      expect(() => assertCostCoveragePathCurrent(view)).toThrow();
      expect(
        (
          await continueCostCoverageSource(view, row, callback, {
            current: callback,
            generation: 0,
          })
        ).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('native job revision drift blocks a retained source handoff', async () => {
    const f = await fixture(),
      view = await read(f),
      row = view.rows[0],
      callback = vi.fn();
    await forecast(f);
    expect(() =>
      inspectCostCoverageSource(view, { kind: row.kind, id: row.id }),
    ).toThrow();
    expect(
      (
        await continueCostCoverageSource(view, row, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  });
  it('foreign company or job cannot be read with another original source host', async () => {
    const f = await fixture(),
      other = await fixture(1);
    await expect(
      readCostCoveragePath(f.sources, other.job, f.gate),
    ).rejects.toThrow();
  });
  it('copied rows and source views do not carry navigation authority', async () => {
    const f = await fixture(),
      view = await read(f),
      callback = vi.fn();
    expect(() => assertCostCoveragePathCurrent({ ...view })).toThrow();
    expect(
      (
        await continueCostCoverageSource(view, { ...view.rows[0] }, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('original daily navigation UNKNOWN survives fresh cost-path wrappers', async () => {
    const f = await fixture(),
      view = await read(f),
      callback = vi.fn(async () => {
        throw Error('lost outcome');
      });
    expect(
      (
        await continueCostCoverageSource(view, view.rows[0], callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readCostCoveragePath({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('concurrent views share original PENDING navigation custody', async () => {
    const f = await fixture(),
      a = await read(f),
      b = await readCostCoveragePath({ ...f.sources }, f.job, f.gate);
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
    const first = continueCostCoverageSource(a, a.rows[0], callback, {
      current: callback,
      generation: 0,
    });
    await started;
    expect(
      (
        await continueCostCoverageSource(b, b.rows[0], callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('PENDING');
    release();
    expect((await first).status).toBe('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('removed live callback is withheld before dispatch', async () => {
    const f = await fixture(),
      view = await read(f),
      callback = vi.fn();
    expect(
      (
        await continueCostCoverageSource(view, view.rows[0], callback, {
          current: undefined,
          generation: 1,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('post-dispatch source change is UNKNOWN rather than successful navigation', async () => {
    const f = await fixture(),
      view = await read(f),
      callback = vi.fn(() => forecast(f));
    expect(
      (
        await continueCostCoverageSource(view, view.rows[0], callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(read(f)).rejects.toThrow();
  });
  it('OFF and executable admission deny before any source getter', async () => {
    const getter = vi.fn(() => {
      throw Error('executed');
    });
    await expect(
      readCostCoveragePath(
        Object.defineProperty({}, 'entries', { get: getter }) as never,
        'missing',
      ),
    ).rejects.toThrow('OFF');
    await expect(
      readCostCoveragePath(
        {} as never,
        'missing',
        Object.defineProperty({ confirmed: true }, 'enabled', {
          get: getter,
        }) as never,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('source inspection rejects executable selectors without invoking them', async () => {
    const f = await fixture(),
      view = await read(f),
      getter = vi.fn(() => {
        throw Error('executed');
      });
    expect(() =>
      inspectCostCoverageSource(
        view,
        Object.defineProperty({ kind: 'time' }, 'id', { get: getter }) as never,
      ),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('no native writes, payroll, file archive, provider or contract/invoice side effects are added', async () => {
    const f = await fixture(),
      submit = vi.spyOn(f.sources.estimates, 'submitExpense'),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense'),
      payroll = vi.spyOn(f.sources.estimates, 'payroll'),
      save = vi.spyOn(f.sources.property, 'saveVisit'),
      fetch = vi.fn(),
      release = JSON.stringify(f.entry.release.read('staff'));
    vi.stubGlobal('fetch', fetch);
    const view = await read(f);
    inspectCostCoverageSource(view, {
      kind: view.rows[0].kind,
      id: view.rows[0].id,
    });
    expect(submit).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(f.entry.release.read('staff'))).toBe(release);
  });
  it('default-OFF rendering preserves original controls without reading sources', () => {
    const html = renderToStaticMarkup(
      createElement(CostCoveragePath, { sources: {} as never }),
    );
    expect(html).toContain('Cost coverage path is OFF');
    expect(html).not.toContain('Read current recorded cost review');
  });
});
