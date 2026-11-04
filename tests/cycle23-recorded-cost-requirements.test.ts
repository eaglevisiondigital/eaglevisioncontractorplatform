import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readSavedSourceExercise,
  readSavedTaskCorrection,
  executeSavedTaskCorrection,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readRecordedCostRequirements,
  assertRecordedCostRequirementsCurrent,
  inspectRecordedCostCategory,
  inspectRecordedCostRequirement,
  inspectRecordedCostSource,
  continueRecordedCostSource,
} from '../src/lib/workflows/recorded-cost-requirements';
import { RecordedCostRequirements } from '../src/components/workflows/RecordedCostRequirements';
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
async function fixture(brand = 0, correction = true) {
  const gate = { enabled: true, confirmed: true },
    sources = await (
      correction ? prepareCorrectionPreviewSources : prepareOperatingSources
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
const read = (f: Fixture) =>
  readRecordedCostRequirements(f.sources, f.job, f.gate);
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
describe('Cycle23 exact recorded costs and independent financial requirements', () => {
  it.each([0, 1, 2])(
    'case %# brand %i uses original category totals and requirement identities without mutation',
    async (brand) => {
      const f = await fixture(brand),
        before = f.sources.estimates.syntheticJob(f.org, f.job)!,
        view = await read(f),
        canonical = jobFinancials(before);
      expect(
        view.categories.map((category) =>
          Object.fromEntries(
            Object.entries(category).filter(
              ([key]) => !['source_keys', 'meaning'].includes(key),
            ),
          ),
        ),
      ).toEqual(canonical.categories);
      expect(view.requirements).toEqual(view.detail.job.requirements);
      expect(view.invoices).toEqual(view.detail.job.financial.invoices);
      expect(view.original.original.canonical).toEqual(canonical);
      expect(view.invoice_overall).toBe('NO_GO');
      expect(view.operational_ready).toBe(false);
      expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(before);
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i native reviewed material changes canonical category but does not clear invoice prerequisites',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        id = before.original.original.material.expense_id!;
      await confirmCostCorrectionReview(
        before.original.original,
        {
          expense_id: id,
          decision: 'approved',
          reason: 'Explicit synthetic material review.',
        },
        true,
      );
      expect(() => assertRecordedCostRequirementsCurrent(before)).toThrow();
      const current = await read(f),
        category = inspectRecordedCostCategory(current, 'materials');
      expect(
        category.projected_minor -
          before.categories.find((c) => c.category === 'materials')!
            .projected_minor,
      ).toBe(2500);
      expect(current.invoice_overall).toBe('NO_GO');
      expect(current.coverage).not.toBe('DECLARED_COSTS_COMPLETE');
      expect(
        inspectRecordedCostSource(current, { kind: 'material', id }).status,
      ).toBe('approved');
      expect(category.source_keys).toContain(`material:${id}`);
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i corrected time retains both exact lineage references and no per-entry money allocation',
    async (brand) => {
      const f = await fixture(brand),
        source = await readSavedSourceExercise(f.sources, f.job, f.gate),
        task = await readSavedTaskCorrection(source);
      await executeSavedTaskCorrection(
        source,
        {
          source_entry_id: task.source_entry_id!,
          task: 'Exact corrected recorded task',
          started_at: task.started_at!,
          ended_at: task.ended_at!,
          billable: true,
        },
        true,
      );
      const view = await read(f),
        old = view.labor.find((t) => t.entry_id === task.source_entry_id)!,
        next = view.labor.find((t) => t.corrects_id === old.entry_id)!;
      expect(old.correcting_entry_ids).toContain(next.entry_id);
      expect(next.requirement).toBe('UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST');
      expect(view.locked_period_ids).toHaveLength(0);
      expect(view.labor.every((t) => !('amount_minor' in t))).toBe(true);
      expect(inspectRecordedCostCategory(view, 'labor').source_keys).toContain(
        `time:${next.entry_id}`,
      );
    },
  );
  it('original locked labor source is visible without payroll preparation, reopening or double posting', async () => {
    const f = await fixture(0, false),
      id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'Ended native labor',
        kind: 'work',
        started_at: '2026-02-03T10:00:00.000Z',
        ended_at: '2026-02-03T11:00:00.000Z',
        billable: false,
        corrects_id: null,
      });
    if (typeof id !== 'string') throw Error('Exact ID');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'Synthetic original review',
    );
    await f.sources.estimates.payroll(
      f.org,
      '2026-02-03T00:00:00.000Z',
      '2026-02-04T00:00:00.000Z',
      {},
      true,
    );
    const payroll = vi.spyOn(f.sources.estimates, 'payroll'),
      before = await f.sources.estimates.workforce(f.org),
      view = await read(f);
    expect(
      view.labor.find((t) => t.entry_id === id)?.locked_labor_reference,
    ).toBe(true);
    expect(view.labor.find((t) => t.entry_id === id)?.requirement).toBe(
      'EXACT_ENTRY_IN_AVAILABLE_LOCKED_LABOR_EVIDENCE',
    );
    expect(view.locked_period_ids.length).toBeGreaterThan(0);
    expect(await f.sources.estimates.workforce(f.org)).toEqual(before);
    expect(payroll).not.toHaveBeenCalled();
  });
  it('exact independent invoice requirements retain original status and no invented ledger evidence', async () => {
    const f = await fixture(),
      view = await read(f);
    for (const r of view.requirements)
      expect(inspectRecordedCostRequirement(view, r.id)).toBe(r);
    expect(view.invoices).toHaveLength(0);
    expect(view.financial_coverage).toBe('UNVERIFIED');
    expect(view.unlinked_events).toHaveLength(0);
    expect(
      view.original.original.costs.evidence.accounting.missing_evidence.join(
        ' ',
      ),
    ).toContain('No canonical invoice');
    expect(
      view.requirements.some(
        (r) => r.kind === 'canonical_evidence' && r.status === 'UNKNOWN',
      ),
    ).toBe(true);
  });
  it('existing synthetic invoice/event/ledger evidence retains exact canonical IDs without financial commands on read', async () => {
    const f = await fixture(),
      release = f.entry.release;
    await release.command('staff', 'create_contract', {
      offer_id: f.entry.offer_id,
      terms: 'Synthetic test fixture only',
      legal_reference: 'No genuine legal authority',
    });
    const contract = release.read('staff').release_contracts[0];
    await release.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Synthetic fixture',
      consent: true,
    });
    await release.command('staff', 'create_invoice', {
      contract_id: contract.id,
    });
    const invoice = release.read('staff').release_invoices[0],
      amount = invoice.snapshot.schedule[0].amount_minor;
    await release.command('customer', 'authorize_payment', {
      invoice_id: invoice.id,
      amount_minor: amount,
      consent: true,
    });
    const authorization = release.read('staff').release_authorizations[0];
    await release.command('staff', 'synthetic_capture', {
      invoice_id: invoice.id,
      authorization_id: authorization.id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: null,
    });
    const before = release.read('staff'),
      command = vi.spyOn(release, 'command'),
      view = await read(f),
      evidence = view.invoices.find((row) => row.invoice_id === invoice.id)!;
    expect(evidence.linkage).toBe('LINKED');
    expect(evidence.issued_version_id).toBe(f.entry.target.version_id);
    expect(evidence.offer_id).toBe(f.entry.offer_id);
    expect(evidence.contract_id).toBe(contract.id);
    expect(evidence.events.map((e) => e.id)).toEqual(
      before.release_payment_events.map((e) => e.id).sort(),
    );
    expect(evidence.ledger.map((e) => e.id)).toEqual(
      before.release_ledger_entries.map((e) => e.id).sort(),
    );
    expect(evidence.events.length).toBeGreaterThan(0);
    expect(evidence.ledger.length).toBeGreaterThan(0);
    expect(release.read('staff')).toEqual(before);
    expect(command).not.toHaveBeenCalled();
    expect(view.operational_ready).toBe(false);
  });
  it.each(['labor', 'materials', 'subcontractors', 'equipment', 'other'])(
    'case %# %s drill-down includes exact category only',
    async (category) => {
      const f = await fixture(),
        view = await read(f),
        selected = inspectRecordedCostCategory(view, category),
        e = view.original.original.costs.evidence;
      for (const key of selected.source_keys) {
        const row = view.original.rows.find((r) => r.key === key)!;
        if (row.kind === 'time') expect(category).toBe('labor');
        else
          expect(e.expenses.find((x) => x.id === row.id)?.category).toBe(
            category,
          );
      }
    },
  );
  it.each(['revoked', 'property', 'version', 'job', 'gate'] as const)(
    'case %# %s drift removes all details and prevents callback',
    async (mode) => {
      const f = await fixture(),
        view = await read(f),
        row = view.original.rows[0],
        callback = vi.fn();
      if (mode === 'revoked') revoke(f);
      if (mode === 'property') f.entry.target.location_id = 'foreign';
      if (mode === 'version') f.entry.target.version_id = 'foreign';
      if (mode === 'job') await forecast(f);
      if (mode === 'gate') f.gate.confirmed = false;
      expect(() => inspectRecordedCostCategory(view, 'labor')).toThrow();
      expect(() =>
        inspectRecordedCostRequirement(view, view.requirements[0].id),
      ).toThrow();
      expect(
        (
          await continueRecordedCostSource(view, row, callback, {
            current: callback,
            generation: 0,
          })
        ).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('foreign company job, ambiguous entry and invalid category/requirement never fall back', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      view = await read(f);
    await expect(
      readRecordedCostRequirements(f.sources, foreign.job, f.gate),
    ).rejects.toThrow();
    expect(() => inspectRecordedCostCategory(view, 'staff-cost')).toThrow();
    expect(() => inspectRecordedCostRequirement(view, 'missing')).toThrow();
    await expect(
      readRecordedCostRequirements(
        { ...f.sources, entries: [f.entry, f.entry] },
        f.job,
        f.gate,
      ),
    ).rejects.toThrow();
  });
  it('forged view and row copies do not confer original source navigation', async () => {
    const f = await fixture(),
      view = await read(f),
      callback = vi.fn();
    expect(() => inspectRecordedCostCategory({ ...view }, 'labor')).toThrow();
    expect(
      (
        await continueRecordedCostSource(
          view,
          { ...view.original.rows[0] },
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('exact source navigation preserves job and original destination once; competing attempts do not duplicate', async () => {
    const f = await fixture(),
      view = await read(f),
      row = inspectRecordedCostSource(view, {
        kind: 'time',
        id: view.labor[0].entry_id,
      }),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    const results = await Promise.all([
      continueRecordedCostSource(view, row, callback, live),
      continueRecordedCostSource(view, row, callback, live),
    ]);
    expect(results.map((r) => r.status)).toContain('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, 'field');
  });
  it('lost navigation acknowledgment retains original UNKNOWN across fresh wrapper and exact read without replay', async () => {
    const f = await fixture(),
      view = await read(f),
      row = view.original.rows[0],
      callback = vi.fn(() => {
        throw Error('Lost acknowledgment');
      });
    expect(
      (
        await continueRecordedCostSource(view, row, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(read(f)).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('callback withdrawal before dispatch withholds navigation', async () => {
    const f = await fixture(),
      view = await read(f),
      callback = vi.fn();
    expect(
      (
        await continueRecordedCostSource(
          view,
          view.original.rows[0],
          callback,
          { current: undefined, generation: 1 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('OFF admission precedes malicious source getters and production remains OFF', async () => {
    const getter = vi.fn(() => {
        throw Error('No source read');
      }),
      sources = Object.defineProperty({}, 'entries', {
        get: getter,
      }) as Fixture['sources'];
    await expect(readRecordedCostRequirements(sources, 'x')).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    vi.stubEnv('DEV', false);
    await expect(
      readRecordedCostRequirements(sources, 'x', {
        enabled: true,
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('source replacement during asynchronous read rejects stale details', async () => {
    const f = await fixture(),
      pending = read(f);
    f.gate.enabled = false;
    await expect(pending).rejects.toThrow();
  });
  it('strict selectors reject executable or extra source fields', async () => {
    const f = await fixture(),
      view = await read(f),
      getter = vi.fn(() => view.original.rows[0].id);
    expect(() =>
      inspectRecordedCostSource(
        view,
        Object.defineProperty({ kind: 'time' }, 'id', { get: getter }) as never,
      ),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      inspectRecordedCostSource(view, {
        kind: 'time',
        id: view.labor[0].entry_id,
        extra: true,
      } as never),
    ).toThrow();
  });
  it('unmounted/default component emits no private facts or workflow activation', () => {
    const html = renderToStaticMarkup(
      createElement(RecordedCostRequirements, {
        sources: {} as Fixture['sources'],
        enabled: false,
      }),
    );
    expect(html).toContain('Recorded cost requirements are OFF');
    expect(html).not.toContain('staff-cost');
    expect(html).not.toContain('<table');
  });
});
