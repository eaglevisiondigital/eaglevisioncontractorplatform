import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readCostSavedRevision,
  compareCostSavedRevisions,
  filterCostSavedRevisions,
  adoptCostSavedRevision,
} from '../src/lib/workflows/cost-saved-revisions';
import {
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  assertSavedRevisionCurrent,
} from '../src/lib/workflows/saved-revision-runtime';
import {
  readCostInvoiceReview,
  openCostInvoiceReview,
  continueCostInvoiceReview,
  returnCostInvoiceReview,
} from '../src/lib/workflows/cost-invoice-review';
import { CostSavedRevisions } from '../src/components/workflows/CostSavedRevisions';
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
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] };
  return {
    gate,
    all,
    entry,
    sources,
    read: () => readCostSavedRevision(sources, entry.target.job_id!, gate),
    job: () =>
      sources.estimates.syntheticJob(sources.company.id, entry.target.job_id!)!,
  };
}
async function forecast(f: Awaited<ReturnType<typeof fixture>>, amount = 1250) {
  const job = f.job();
  await f.sources.estimates.projection(f.sources.company.id, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + amount,
    },
  });
}
async function expense(
  f: Awaited<ReturnType<typeof fixture>>,
  decision: 'approved' | 'rejected' = 'approved',
) {
  const id = await f.sources.estimates.submitExpense(
    f.sources.company.id,
    f.entry.target.job_id!,
    {
      purchase_key: crypto.randomUUID(),
      supplier: 'PRIVATE_SUPPLIER_SENTINEL',
      reference: crypto.randomUUID(),
      category: 'materials',
      kind: 'payment',
      amount_minor: 2300,
      description: 'PRIVATE_COST_NOTE_SENTINEL',
      estimate_line_id: null,
      quantity_milli: 1000,
      unit: 'each',
      unit_cost_minor: 2300,
      document_ids: [],
      material_approval_id: null,
    },
  );
  await f.sources.estimates.reviewExpense(
    f.sources.company.id,
    f.entry.target.job_id!,
    id,
    decision,
    'PRIVATE_REVIEW_REASON_SENTINEL',
  );
  return id;
}
function during(change: () => void | Promise<void>) {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let hit = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const r = await original(...args);
    if (!hit) {
      hit = true;
      await change();
    }
    return r;
  });
  return () => expect(hit).toBe(true);
}
const clear = { query: '', changed_only: false };
describe('Cycle19 saved canonical cost revision continuity', () => {
  it.each([0, 1, 2])(
    'brand %i explicitly compares actual saved forecast and adopts through opaque CAS without mutating prior evidence',
    async (brand) => {
      const f = await fixture(brand),
        before = await f.read(),
        frozen = JSON.stringify(before),
        selection = createSavedRevisionSelection(before);
      await forecast(f);
      const current = await f.read(),
        comparison = compareCostSavedRevisions(before, current);
      expect(before.evidence.job_revision + 1).toBe(
        current.evidence.job_revision,
      );
      expect(comparison.comparison.changed).toBe(true);
      expect(comparison.canonical.status).toBe('SOURCE_CHANGED');
      expect(comparison.rows.find((r) => r.id === 'facts')?.status).toBe(
        'CHANGED',
      );
      expect(before.evidence.facts.remaining.other + 1250).toBe(
        current.evidence.facts.remaining.other,
      );
      expect(() => assertSavedRevisionCurrent(before)).toThrow();
      expect(JSON.stringify(before)).toBe(frozen);
      expect(readSavedRevisionSelection(selection).snapshot).toBe(before);
      const result = adoptCostSavedRevision(selection, comparison, 0, true);
      expect(result.snapshot).toBe(current);
      expect(result.generation).toBe(1);
      expect(JSON.stringify(before)).toBe(frozen);
      expect(current.operational_ready).toBe(false);
    },
  );
  it.each([0, 1, 2])(
    'brand %i actual approved expense/review IDs remain exact and private fields stay excluded',
    async (brand) => {
      const f = await fixture(brand),
        before = await f.read(),
        id = await expense(f),
        current = await f.read(),
        comparison = compareCostSavedRevisions(before, current),
        event = f.job().events.find((e) => e.submission_id === id)!;
      expect(
        comparison.rows.find((r) => r.kind === 'expenses' && r.id === id)
          ?.status,
      ).toBe('ADDED');
      expect(
        comparison.rows.find((r) => r.kind === 'reviews' && r.id === event.id)
          ?.status,
      ).toBe('ADDED');
      expect(
        current.evidence.reviews.find((r) => r.id === event.id)?.submission_id,
      ).toBe(id);
      expect(
        current.evidence.expenses.find((e) => e.id === id)?.amount_minor,
      ).toBe(2300);
      expect(JSON.stringify(current)).not.toMatch(
        /PRIVATE_SUPPLIER|PRIVATE_COST_NOTE|PRIVATE_REVIEW_REASON|cash_hour_minor|salary_week_minor|burden_bps|classification_review_reference/,
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i canonical locked coverage yields existing-engine totals and expense deltas rather than a second calculator',
    async (brand) => {
      const f = await fixture(brand);
      await f.sources.estimates.payroll(
        f.sources.company.id,
        '2026-01-01T00:00:00Z',
        '2026-01-02T00:00:00Z',
        {},
        true,
      );
      const before = await f.read();
      await expense(f);
      const current = await f.read(),
        canonical = jobFinancials(f.job());
      expect(current.evidence.facts.costs).not.toBeNull();
      expect(
        current.evidence.facts.costs!.recordedMinor -
          before.evidence.facts.costs!.recordedMinor,
      ).toBe(2300);
      expect(current.evidence.facts.costs!.projectedMinor).toBe(
        canonical.projected_cost_minor,
      );
      expect(current.evidence.invoice.overall).toBe('NO_GO');
    },
  );
  it('rejected expense remains recorded evidence and never enters canonical approved costs', async () => {
    const f = await fixture();
    await f.sources.estimates.payroll(
      f.sources.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      {},
      true,
    );
    const before = await f.read(),
      id = await expense(f, 'rejected'),
      current = await f.read();
    expect(
      current.evidence.reviews.find((r) => r.submission_id === id)?.decision,
    ).toBe('rejected');
    expect(current.evidence.facts.costs?.recordedMinor).toBe(
      before.evidence.facts.costs?.recordedMinor,
    );
  });
  it('actual submitted approved but unposted time remains UNKNOWN until original payroll lock evidence exists', async () => {
    const f = await fixture(),
      worker = (await f.sources.estimates.workforce(f.sources.company.id))
        .workers[0];
    const id = await f.sources.estimates.recordTime(
      f.sources.company.id,
      worker.id,
      {
        job_id: f.entry.target.job_id!,
        overhead_center: null,
        task: 'PRIVATE_TIME_TASK',
        kind: 'work',
        started_at: '2026-01-03T10:00:00Z',
        ended_at: '2026-01-03T11:00:00Z',
        billable: true,
        corrects_id: null,
      },
    );
    if (typeof id !== 'string') throw Error('Original time ID required');
    await f.sources.estimates.submitTime(f.sources.company.id, id);
    await f.sources.estimates.reviewTime(
      f.sources.company.id,
      id,
      'approved',
      'PRIVATE_TIME_REASON',
    );
    const approved = await f.read();
    expect(approved.evidence.time.find((t) => t.id === id)?.review).toBe(
      'approved',
    );
    expect(approved.evidence.facts.costs).toBeNull();
    expect(approved.evidence.facts.cost_coverage).toBe('UNKNOWN');
    expect(JSON.stringify(approved)).not.toContain('PRIVATE_TIME');
    await f.sources.estimates.payroll(
      f.sources.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-04T00:00:00Z',
      {},
      true,
    );
    const locked = await f.read();
    expect(locked.evidence.locked_periods.length).toBeGreaterThan(0);
    expect(locked.evidence.facts.costs).not.toBeNull();
  });
  it('unchanged saved evidence has explicit unchanged rows and does not manufacture a financial revision', async () => {
    const f = await fixture(),
      before = await f.read(),
      current = await f.read(),
      c = compareCostSavedRevisions(before, current);
    expect(c.comparison.changed).toBe(false);
    expect(c.rows.every((r) => r.status === 'UNCHANGED')).toBe(true);
    expect(
      filterCostSavedRevisions(c, { query: '', changed_only: true }).matching,
    ).toBe(0);
  });
  it('literal source filters keep truthful counts and support empty results', async () => {
    const f = await fixture(),
      before = await f.read();
    await forecast(f);
    const c = compareCostSavedRevisions(before, await f.read());
    expect(
      filterCostSavedRevisions(c, { ...clear, query: 'facts' }).rows.map(
        (r) => r.id,
      ),
    ).toEqual(['facts']);
    expect(
      filterCostSavedRevisions(c, { ...clear, query: '[missing.*]' }).matching,
    ).toBe(0);
    expect(filterCostSavedRevisions(c, clear).available).toBe(c.rows.length);
  });
  it.each(['getter', 'extra', 'query', 'flag'] as const)(
    'invalid %s filter cannot broaden or execute hooks',
    async (kind) => {
      const f = await fixture(),
        a = await f.read(),
        c = compareCostSavedRevisions(a, await f.read()),
        p = { ...clear },
        getter = vi.fn();
      if (kind === 'getter') Object.defineProperty(p, 'query', { get: getter });
      if (kind === 'extra') Object.assign(p, { tenant: 'other' });
      if (kind === 'query') p.query = 'x'.repeat(201);
      if (kind === 'flag') Object.assign(p, { changed_only: 'true' });
      expect(() => filterCostSavedRevisions(c, p)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['duplicate', 'competing', 'unconfirmed', 'copy'] as const)(
    'rejects %s adoption without changing selected presentation',
    async (kind) => {
      const f = await fixture(),
        a = await f.read(),
        s = createSavedRevisionSelection(a);
      await forecast(f);
      const b = await f.read(),
        c = compareCostSavedRevisions(a, b),
        other = compareCostSavedRevisions(a, b);
      if (kind === 'duplicate' || kind === 'competing')
        adoptCostSavedRevision(s, c, 0, true);
      expect(() =>
        adoptCostSavedRevision(
          s,
          kind === 'competing'
            ? other
            : kind === 'copy'
              ? structuredClone(c)
              : c,
          0,
          kind !== 'unconfirmed',
        ),
      ).toThrow();
      expect(readSavedRevisionSelection(s).generation).toBe(
        kind === 'duplicate' || kind === 'competing' ? 1 : 0,
      );
    },
  );
  it('a later saved revision makes a pending comparison non-adoptable', async () => {
    const f = await fixture(),
      a = await f.read(),
      s = createSavedRevisionSelection(a);
    await forecast(f);
    const c = compareCostSavedRevisions(a, await f.read());
    await forecast(f);
    expect(() => adoptCostSavedRevision(s, c, 0, true)).toThrow();
    expect(readSavedRevisionSelection(s).snapshot).toBe(a);
  });
  it.each(['member', 'property', 'company', 'source', 'gate'] as const)(
    'actual async %s change prevents reading a mixed snapshot',
    async (kind) => {
      const f = await fixture(),
        hit = during(async () => {
          if (kind === 'member') {
            const own = f.sources.operations.syntheticMemberships.bind(
              f.sources.operations,
            );
            vi.spyOn(
              f.sources.operations,
              'syntheticMemberships',
            ).mockImplementation((org) =>
              own(org).map((m) => ({ ...m, active: false })),
            );
          }
          if (kind === 'property')
            f.entry.target.location_id = f.all.entries[1].target.location_id;
          if (kind === 'company') f.sources.company = sampleCompanies[1];
          if (kind === 'source') await forecast(f);
          if (kind === 'gate') f.gate.confirmed = false;
        });
      await expect(f.read()).rejects.toThrow();
      hit();
    },
  );
  it.each(['member', 'property', 'foreign', 'issued'] as const)(
    'denies %s source before adopting any private data',
    async (kind) => {
      const f = await fixture(),
        a = await f.read(),
        s = createSavedRevisionSelection(a),
        c = compareCostSavedRevisions(a, await f.read());
      if (kind === 'member') {
        const own = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          own(org).map((m) => ({ ...m, active: false })),
        );
      }
      if (kind === 'property')
        f.entry.target.location_id = f.all.entries[1].target.location_id;
      if (kind === 'foreign') f.sources.company = sampleCompanies[1];
      if (kind === 'issued') f.entry.target.version_id = crypto.randomUUID();
      expect(() => adoptCostSavedRevision(s, c, 0, true)).toThrow();
    },
  );
  it('same-property sibling job and copied snapshots never substitute source identity', async () => {
    const f = await fixture(),
      a = await f.read(),
      sibling = f.all.entries[3];
    expect(sibling.target.location_id).toBe(f.entry.target.location_id);
    const other = await readCostSavedRevision(
      f.all,
      sibling.target.job_id!,
      f.gate,
    );
    expect(() => compareCostSavedRevisions(a, other)).toThrow();
    expect(() => compareCostSavedRevisions(structuredClone(a), a)).toThrow();
    await expect(
      readCostSavedRevision(f.sources, crypto.randomUUID(), f.gate),
    ).rejects.toThrow();
  });
  it('read/adopt cannot clear the original canonical UNKNOWN navigation hold', async () => {
    const f = await fixture(),
      read = await readCostInvoiceReview(
        f.sources,
        { as_of: new Date().toISOString(), input_revision: 1 },
        f.gate,
      ),
      original = openCostInvoiceReview(read, f.entry.target.job_id!),
      lost = () => {
        throw Error('ack lost');
      },
      lease = { current: lost, generation: 0 };
    expect(
      continueCostInvoiceReview(original, 'invoice', lease, lease).status,
    ).toBe('UNKNOWN');
    const a = await f.read(),
      s = createSavedRevisionSelection(a);
    await forecast(f);
    const c = compareCostSavedRevisions(a, await f.read());
    adoptCostSavedRevision(s, c, 0, true);
    const fresh = openCostInvoiceReview(
      await readCostInvoiceReview(
        { ...f.sources, entries: [f.entry] },
        { as_of: new Date().toISOString(), input_revision: 2 },
        f.gate,
      ),
      f.entry.target.job_id!,
    );
    expect(returnCostInvoiceReview(fresh).status).toBe('UNKNOWN');
  });
  it('read/compare/adopt have no existing-engine or communication writes', async () => {
    const f = await fixture(),
      a = await f.read(),
      s = createSavedRevisionSelection(a),
      writers = [
        vi.spyOn(f.sources.estimates, 'projection'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.estimates, 'payroll'),
        vi.spyOn(f.entry.release, 'command'),
      ],
      c = compareCostSavedRevisions(a, await f.read());
    adoptCostSavedRevision(s, c, 0, true);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  });
  it.each(['off', 'truthy', 'production', 'remote', 'https'] as const)(
    '%s denies before source access and renders no controls',
    async (mode) => {
      const getter = vi.fn(() => {
          throw Error('no access');
        }),
        poison = {};
      Object.defineProperty(poison, 'company', { get: getter });
      if (mode === 'production') vi.stubEnv('DEV', false);
      if (mode === 'remote')
        vi.stubGlobal('window', {
          location: { hostname: 'example.com', protocol: 'http:' },
        });
      if (mode === 'https')
        vi.stubGlobal('window', {
          location: { hostname: 'localhost', protocol: 'https:' },
        });
      const enabled =
          mode === 'truthy' ? ('true' as unknown as boolean) : mode !== 'off',
        sources = poison as OperatingSources;
      await expect(
        readCostSavedRevision(sources, 'job', { enabled, confirmed: true }),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(CostSavedRevisions, { sources, enabled }),
        ),
      ).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'brand %i retains approved identity and exact hint without automatic source reads or callbacks',
    async (brand) => {
      const f = await fixture(brand),
        read = vi.spyOn(f.sources.estimates, 'jobs'),
        callback = vi.fn(),
        html = renderToStaticMarkup(
          createElement(CostSavedRevisions, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.entry.target.job_id!,
            onContinue: callback,
            onSelectJob: callback,
          }),
        );
      expect(html).toContain('Read saved cost revision');
      expect(html).toContain(f.entry.target.job_id!);
      expect(html).not.toContain('Shared record search');
      expect(read).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
      expect(
        renderToStaticMarkup(
          createElement(CostSavedRevisions, {
            sources: f.sources,
            enabled: true,
            selectedJobId: crypto.randomUUID(),
          }),
        ),
      ).not.toContain('<button');
    },
  );
});
