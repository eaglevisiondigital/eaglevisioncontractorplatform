import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import * as originalNavigation from '../src/lib/workflows/finance-review-path';
import {
  openFinanceCaseDesk,
  navigateFinanceCaseDesk,
} from '../src/lib/workflows/finance-case-desk';
import {
  readCostInvoiceReview,
  openCostInvoiceReview,
  focusCostInvoiceReview,
  inspectCostInvoiceSource,
  assertCostInvoiceReviewCurrent,
  continueCostInvoiceReview,
  returnCostInvoiceReview,
  type CostInvoiceContinuationLease,
  type CostInvoiceFocus,
} from '../src/lib/workflows/cost-invoice-review';
import { CostInvoiceReview } from '../src/components/workflows/CostInvoiceReview';

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
async function fixture(index = 0, positive = false) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[index], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] };
  if (positive) {
    await entry.release.command('staff', 'create_contract', {
      offer_id: entry.offer_id,
      terms: 'Explicit synthetic TEST fixture only',
      legal_reference: 'No genuine approval',
    });
    const contract = entry.release.read('staff').release_contracts[0];
    await entry.release.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Synthetic fixture',
      consent: true,
    });
    await entry.release.command('staff', 'create_invoice', {
      contract_id: contract.id,
    });
    const invoice = entry.release.read('staff').release_invoices[0],
      amount = invoice.snapshot.schedule[0].amount_minor;
    await entry.release.command('customer', 'authorize_payment', {
      invoice_id: invoice.id,
      amount_minor: amount,
      consent: true,
    });
    const auth = entry.release.read('staff').release_authorizations[0];
    await entry.release.command('staff', 'synthetic_capture', {
      invoice_id: invoice.id,
      authorization_id: auth.id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: null,
    });
  }
  const input = { as_of: new Date().toISOString(), input_revision: 1 };
  return {
    gate,
    all,
    entry,
    sources,
    input,
    read: () => readCostInvoiceReview(sources, input, gate),
  };
}
async function selected(index = 0, positive = false) {
  const f = await fixture(index, positive),
    review = await f.read(),
    selection = openCostInvoiceReview(
      review,
      f.entry.target.job_id!,
      f.entry.target.job_id!,
    );
  return { ...f, review, selection };
}
const cost = { focus: 'review', query: '', status: 'all' } as const,
  invoice = { ...cost, focus: 'invoice' } as const;
const lease = (fn = vi.fn()): CostInvoiceContinuationLease => ({
  current: fn,
  generation: 1,
});
describe('Cycle18 canonical cost to invoice review', () => {
  it.each([0, 1, 2])(
    'brand %i retains one source read across costs, exact invoice requirements and canonical money',
    async (index) => {
      const f = await selected(index),
        before = JSON.stringify({
          source: f.sources.estimates.readSyntheticPrototypeSources(
            f.entry.target,
          ),
          release: f.entry.release.read('staff'),
          customer: f.entry.release.read('customer'),
        }),
        writers = [
          vi.spyOn(f.entry.release, 'command'),
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
        ],
        costView = focusCostInvoiceReview(f.selection, cost),
        invoiceView = focusCostInvoiceReview(f.selection, invoice),
        canonical = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        ).bundle.version.calculation;
      expect(costView.requirements).toEqual(f.selection.job.requirements);
      expect(
        invoiceView.requirements.map((r) => ({
          id: r.id,
          status: r.status,
          detail: r.observation,
        })),
      ).toEqual(f.selection.job.invoice.requirements);
      expect(invoiceView.anchor).toBe(costView.anchor);
      expect(invoiceView.anchor.target).toEqual(f.entry.target);
      expect(invoiceView.invoice.scope.totals).toEqual({
        subtotal_minor: canonical.subtotal_minor,
        discount_minor: canonical.discount_minor,
        tax_minor: canonical.tax_minor,
        total_minor: canonical.total_minor,
      });
      expect(costView.costs).toBeNull();
      expect(costView.margin).toBeNull();
      expect(costView.missing_evidence.length).toBeGreaterThan(0);
      expect(invoiceView.invoice.overall).toBe('NO_GO');
      expect(invoiceView.accounting.status).toBe(
        'BLOCKED_NO_OPERATIONAL_ACCOUNTING_AUTHORITY',
      );
      expect(invoiceView.sources.every((s) => s.kind !== 'expense')).toBe(true);
      expect(costView.requirement_count).toBe(
        f.selection.job.requirements.length,
      );
      expect(invoiceView.requirement_count).toBe(
        f.selection.job.invoice.requirements.length,
      );
      expect(JSON.stringify({ costView, invoiceView })).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100/,
      );
      expect(
        JSON.stringify({
          source: f.sources.estimates.readSyntheticPrototypeSources(
            f.entry.target,
          ),
          release: f.entry.release.read('staff'),
          customer: f.entry.release.read('customer'),
        }),
      ).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    },
  );
  it.each([0, 1, 2])(
    'brand %i exact issued/invoice/event/posting evidence uses original hashes and canonical amounts',
    async (index) => {
      const f = await selected(index, true),
        view = focusCostInvoiceReview(f.selection, invoice),
        snapshot = f.entry.release.read('staff').release_invoices[0].snapshot;
      for (const kind of ['invoice', 'event', 'posting'] as const) {
        const source = view.sources.find((s) => s.kind === kind)!;
        expect(source).toBeTruthy();
        const evidence = inspectCostInvoiceSource(f.selection, {
          kind,
          id: source.id,
        });
        expect(evidence.selection.item).toEqual(source);
        expect(evidence.invoice_source?.snapshot_sha256).toBe(
          await documentHash(snapshot),
        );
        expect(evidence.invoice_source?.verification).toBe(
          'RECONCILED_SYNTHETIC_ONLY',
        );
        expect(evidence.selection.item?.amount_minor).toBe(source.amount_minor);
      }
      expect(
        view.requirements.find((r) => r.id === 'ISSUED_SCOPE')?.status,
      ).toBe('RECORDED_LOCAL_SOURCE');
      expect(view.invoice.issued.version_id).toBe(f.entry.target.version_id);
      expect(view.invoice.overall).toBe('NO_GO');
    },
  );
  it('combines literal query and exact original status filters with truthful separate counts', async () => {
    const f = await selected(),
      one = focusCostInvoiceReview(f.selection, {
        ...invoice,
        query: 'CONTRACT',
        status: 'UNKNOWN',
      });
    expect(one.requirements.map((r) => r.id)).toEqual(['CONTRACT']);
    expect(one.requirement_count).toBe(1);
    expect(one.available_requirements).toBe(
      f.selection.job.invoice.requirements.length,
    );
    expect(
      focusCostInvoiceReview(f.selection, { ...invoice, query: '[literal.*]' })
        .requirement_count,
    ).toBe(0);
    const row = f.selection.sources.find((s) => s.kind === 'requirement')!,
      source = focusCostInvoiceReview(f.selection, {
        ...invoice,
        query: row.id,
        status: row.status,
      });
    expect(source.sources.map((s) => s.id)).toContain(row.id);
  });
  it.each(['focus', 'status', 'query', 'extra', 'getter'] as const)(
    'rejects invalid %s filter without source broadening or getter invocation',
    async (kind) => {
      const f = await selected(),
        poison = { ...invoice } as unknown as CostInvoiceFocus,
        getter = vi.fn();
      if (kind === 'focus') Object.assign(poison, { focus: 'latest' });
      if (kind === 'status') poison.status = 'APPROVED';
      if (kind === 'query') poison.query = 'x'.repeat(201);
      if (kind === 'extra')
        Object.assign(poison, { organization_id: sampleCompanies[1].id });
      if (kind === 'getter')
        Object.defineProperty(poison, 'query', { get: getter });
      expect(() => focusCostInvoiceReview(f.selection, poison)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['source', 'member', 'input', 'gate', 'root', 'invoice'] as const)(
    'observed %s drift makes the retained view terminal after restoration',
    async (kind) => {
      const f = await selected(0, kind === 'invoice'),
        originalEntries = f.sources.entries,
        callback = vi.fn(),
        nav = lease(callback);
      if (kind === 'source') {
        const job = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        ).job!;
        await f.sources.estimates.projection(f.sources.company.id, job, {
          ...job.projection,
          remaining: {
            ...job.projection.remaining,
            other: job.projection.remaining.other + 1,
          },
        });
      }
      if (kind === 'member') {
        const members = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          members(org).map((m) => ({ ...m, active: false })),
        );
      }
      if (kind === 'input') f.input.input_revision++;
      if (kind === 'gate') f.gate.confirmed = false;
      if (kind === 'root') f.sources.entries = [...f.sources.entries];
      if (kind === 'invoice') {
        const state = f.entry.release.read('staff');
        state.release_invoices[0].snapshot.total_minor++;
        vi.spyOn(f.entry.release, 'read').mockImplementation((actor) => ({
          ...structuredClone(state),
          actor,
        }));
      }
      expect(() => assertCostInvoiceReviewCurrent(f.selection)).toThrow();
      f.gate.confirmed = true;
      f.sources.entries = originalEntries;
      vi.restoreAllMocks();
      expect(() => focusCostInvoiceReview(f.selection, invoice)).toThrow();
      expect(
        continueCostInvoiceReview(f.selection, 'invoice', nav, nav).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it.each(['foreign', 'property', 'job'] as const)(
    'rejects wrong %s association before any review context',
    async (kind) => {
      const f = await fixture();
      if (kind === 'foreign') f.sources.company = sampleCompanies[1];
      if (kind === 'property')
        f.entry.target.location_id = f.all.entries[1].target.location_id;
      if (kind === 'job')
        f.entry.target.job_id = f.all.entries[3].target.job_id;
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each(['staff', 'inactive'] as const)(
    'denies %s staff before private financial reads',
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
      expect(
        renderToStaticMarkup(
          createElement(CostInvoiceReview, {
            sources: f.sources,
            enabled: true,
          }),
        ),
      ).not.toContain('<input');
    },
  );
  it('rejects same-property different-job hints, copied selections and unbound original views', async () => {
    const f = await selected(),
      other = f.all.entries[3];
    expect(other.target.location_id).toBe(f.entry.target.location_id);
    expect(() =>
      openCostInvoiceReview(
        f.review,
        f.entry.target.job_id!,
        other.target.job_id!,
      ),
    ).toThrow();
    expect(() =>
      focusCostInvoiceReview(structuredClone(f.selection), invoice),
    ).toThrow();
    const callback = vi.fn(),
      nav = lease(callback),
      unbound = openFinanceCaseDesk(f.review, f.entry.target.job_id!);
    expect(continueCostInvoiceReview(unbound, 'invoice', nav, nav).status).toBe(
      'UNKNOWN',
    );
    expect(
      continueCostInvoiceReview(
        f.selection,
        'invoice',
        nav,
        nav,
        other.target.job_id!,
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])(
    'brand %i separately continues review→invoice→customer on the SAME retained read without a duplicate callback',
    async (index) => {
      const f = await selected(index),
        callback = vi.fn(),
        nav = lease(callback),
        read = vi.spyOn(f.sources.estimates, 'submitExpense');
      expect(
        continueCostInvoiceReview(f.selection, 'invoice', nav, nav).status,
      ).toBe('EXACT_DAILY_FINANCE_CONTINUATION_REQUESTED');
      expect(focusCostInvoiceReview(f.selection, invoice).anchor).toBe(
        f.selection.anchor,
      );
      expect(
        continueCostInvoiceReview(f.selection, 'customer', nav, nav).status,
      ).toBe('EXACT_DAILY_FINANCE_CONTINUATION_REQUESTED');
      expect(callback.mock.calls).toEqual([
        [f.entry.target.job_id, 'invoice'],
        [f.entry.target.job_id, 'customer'],
      ]);
      expect(
        continueCostInvoiceReview(f.selection, 'invoice', nav, nav).status,
      ).toBe('NO_DISPATCH');
      expect(
        continueCostInvoiceReview(f.selection, 'customer', nav, nav).status,
      ).toBe('NO_DISPATCH');
      expect(callback).toHaveBeenCalledTimes(2);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(['removed', 'replaced', 'generation'] as const)(
    'known %s callback change is NO_DISPATCH and does not poison original canonical outcome',
    async (kind) => {
      const f = await selected(),
        callback = vi.fn(),
        expected = lease(callback),
        current = { ...expected };
      if (kind === 'removed') current.current = undefined;
      if (kind === 'replaced') current.current = vi.fn();
      if (kind === 'generation') current.generation++;
      expect(
        continueCostInvoiceReview(f.selection, 'invoice', expected, current)
          .status,
      ).toBe('NO_DISPATCH');
      expect(callback).not.toHaveBeenCalled();
      expect(returnCostInvoiceReview(f.selection).status).toBe(
        'CURRENT_EXACT_DESK_RETURN',
      );
      expect(
        continueCostInvoiceReview(f.selection, 'invoice', expected, expected)
          .status,
      ).toBe('EXACT_DAILY_FINANCE_CONTINUATION_REQUESTED');
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it('callback change in the original final pre-dispatch boundary is known NO_DISPATCH without a global UNKNOWN', async () => {
    const f = await selected(),
      callback = vi.fn(),
      expected = lease(callback),
      current = { ...expected },
      original = originalNavigation.navigateFinanceReviewPath;
    vi.spyOn(
      originalNavigation,
      'navigateFinanceReviewPath',
    ).mockImplementation((path, forward) =>
      original(path, (job, section) => {
        current.generation++;
        forward(job, section);
      }),
    );
    expect(
      continueCostInvoiceReview(f.selection, 'invoice', expected, current)
        .status,
    ).toBe('NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
    expect(returnCostInvoiceReview(f.selection).status).toBe(
      'CURRENT_EXACT_DESK_RETURN',
    );
    vi.restoreAllMocks();
    expect(
      continueCostInvoiceReview(f.selection, 'invoice', expected, expected)
        .status,
    ).toBe('EXACT_DAILY_FINANCE_CONTINUATION_REQUESTED');
  });
  it.each(
    [0, 1, 2].flatMap((index) =>
      (['wrapper', 'saved-revision'] as const).map((mode) => ({ index, mode })),
    ),
  )(
    'brand $index retains original ambiguous UNKNOWN across $mode and both continuation steps',
    async ({ index, mode }) => {
      const f = await selected(index),
        lost = vi.fn(() => {
          throw Error('Host continued; acknowledgment lost');
        }),
        originalLease = lease(lost);
      expect(
        continueCostInvoiceReview(
          f.selection,
          'invoice',
          originalLease,
          originalLease,
        ).status,
      ).toBe('UNKNOWN');
      expect(lost).toHaveBeenCalledTimes(1);
      if (mode === 'saved-revision') {
        const job = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        ).job!;
        await f.sources.estimates.projection(f.sources.company.id, job, {
          ...job.projection,
          remaining: {
            ...job.projection.remaining,
            other: job.projection.remaining.other + 1,
          },
        });
      }
      const review = await readCostInvoiceReview(
          { ...f.sources, entries: [...f.sources.entries] },
          { ...f.input, input_revision: 2 },
          f.gate,
        ),
        fresh = openCostInvoiceReview(review, f.entry.target.job_id!),
        callback = vi.fn(),
        nav = lease(callback);
      expect(focusCostInvoiceReview(fresh, invoice).invoice.overall).toBe(
        'NO_GO',
      );
      expect(returnCostInvoiceReview(fresh).status).toBe('UNKNOWN');
      expect(continueCostInvoiceReview(fresh, 'invoice', nav, nav).status).toBe(
        'UNKNOWN',
      );
      expect(
        continueCostInvoiceReview(fresh, 'customer', nav, nav).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('a C17 original ambiguous navigation cannot be bypassed by a new Cycle18 continuation', async () => {
    const f = await selected(),
      lost = vi.fn(() => {
        throw Error('Original host lost acknowledgement');
      });
    expect(navigateFinanceCaseDesk(f.selection, lost).status).toBe('UNKNOWN');
    const fresh = openCostInvoiceReview(await f.read(), f.entry.target.job_id!),
      callback = vi.fn(),
      nav = lease(callback);
    expect(continueCostInvoiceReview(fresh, 'customer', nav, nav).status).toBe(
      'UNKNOWN',
    );
    expect(callback).not.toHaveBeenCalled();
  });
  it('claims a step before reentrant/double continuation and cannot hide an ambiguous outcome behind another step', async () => {
    const f = await selected();
    let nested: unknown;
    const callback = vi.fn(() => {
        nested = continueCostInvoiceReview(f.selection, 'invoice', nav, nav);
        throw Error('Lost host acknowledgement');
      }),
      nav = lease(callback);
    expect(
      continueCostInvoiceReview(f.selection, 'invoice', nav, nav).status,
    ).toBe('UNKNOWN');
    expect(nested).toMatchObject({ status: 'UNKNOWN' });
    expect(
      continueCostInvoiceReview(f.selection, 'customer', nav, nav).status,
    ).toBe('UNKNOWN');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it.each(['off', 'truthy', 'production', 'remote', 'https'] as const)(
    '%s denies before source getters, serialization and controls',
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
      const enabled =
          mode === 'truthy' ? ('true' as unknown as boolean) : mode !== 'off',
        sources = poison as Parameters<typeof readCostInvoiceReview>[0];
      await expect(
        readCostInvoiceReview(
          sources,
          { as_of: '', input_revision: 1 },
          { enabled, confirmed: true },
        ),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(CostInvoiceReview, {
            sources,
            enabled,
            focus: 'invoice',
          }),
        ),
      ).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'brand %i accepts review/invoice hints but leaves original controls unopened until explicit action',
    async (index) => {
      const f = await fixture(index);
      for (const focus of ['review', 'invoice'] as const) {
        const html = renderToStaticMarkup(
          createElement(CostInvoiceReview, {
            sources: f.sources,
            enabled: true,
            focus,
            selectedJobId: f.entry.target.job_id!,
          }),
        );
        expect(html).toContain('Cost and invoice review');
        expect(html).toContain('Read cost and invoice sources');
        expect(html).not.toContain('aria-label="Finance case desk"');
      }
      expect(
        renderToStaticMarkup(
          createElement(CostInvoiceReview, {
            sources: f.sources,
            enabled: true,
            selectedJobId: crypto.randomUUID(),
          }),
        ),
      ).not.toContain('<input');
    },
  );
  it('invalid presentation focus never falls back to cost controls or a continuation', async () => {
    const f = await fixture();
    expect(
      renderToStaticMarkup(
        createElement(CostInvoiceReview, {
          sources: f.sources,
          enabled: true,
          focus: 'latest' as unknown as 'invoice',
          onContinue: vi.fn(),
        }),
      ),
    ).not.toContain('<input');
  });
  it('canonical event evidence newer than the requested cutoff is rejected rather than silently included', async () => {
    const f = await fixture(0, true);
    f.input.as_of = '2000-01-01T00:00:00.000Z';
    await expect(f.read()).rejects.toThrow(
      'Exact current Finance workflow source required',
    );
  });
  it('pins the expected callback before original navigation so simultaneous lease mutation is known no-dispatch', async () => {
    const f = await selected(),
      callback = vi.fn(),
      replacement = vi.fn(),
      expected = lease(callback),
      current = { ...expected },
      original = originalNavigation.navigateFinanceReviewPath;
    vi.spyOn(
      originalNavigation,
      'navigateFinanceReviewPath',
    ).mockImplementation((path, forward) =>
      original(path, (job, section) => {
        expected.current = replacement;
        current.current = replacement;
        forward(job, section);
      }),
    );
    expect(
      continueCostInvoiceReview(f.selection, 'invoice', expected, current)
        .status,
    ).toBe('NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(returnCostInvoiceReview(f.selection).status).toBe(
      'CURRENT_EXACT_DESK_RETURN',
    );
  });
  it.each(['resolve', 'reject'] as const)(
    'invoked async %s is fail-closed canonical UNKNOWN with rejection consumed and no fresh-wrapper replay',
    async (mode) => {
      const f = await selected(),
        unhandled = vi.fn(),
        callback = vi.fn(async () => {
          await Promise.resolve();
          if (mode === 'reject')
            throw Error('Actual async acknowledgement lost');
        }),
        nav = lease(callback);
      process.on('unhandledRejection', unhandled);
      try {
        expect(
          continueCostInvoiceReview(f.selection, 'invoice', nav, nav),
        ).toEqual({ status: 'UNKNOWN', replacement: null });
        await new Promise<void>((resolve) => setImmediate(resolve));
        const fresh = openCostInvoiceReview(
            await readCostInvoiceReview(
              { ...f.sources, entries: [...f.sources.entries] },
              { ...f.input, input_revision: 2 },
              f.gate,
            ),
            f.entry.target.job_id!,
          ),
          second = vi.fn(),
          newLease = lease(second);
        expect(returnCostInvoiceReview(fresh).status).toBe('UNKNOWN');
        expect(
          continueCostInvoiceReview(fresh, 'invoice', newLease, newLease)
            .status,
        ).toBe('UNKNOWN');
        expect(
          continueCostInvoiceReview(fresh, 'customer', newLease, newLease)
            .status,
        ).toBe('UNKNOWN');
        expect(callback).toHaveBeenCalledExactlyOnceWith(
          f.entry.target.job_id,
          'invoice',
        );
        expect(second).not.toHaveBeenCalled();
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    },
  );
  it('post-invocation lease change is ambiguous UNKNOWN and cannot be retried through a new wrapper', async () => {
    const f = await selected(),
      callback = vi.fn(() => {
        current.generation++;
      }),
      expected = lease(callback),
      current = { ...expected };
    expect(
      continueCostInvoiceReview(f.selection, 'invoice', expected, current)
        .status,
    ).toBe('UNKNOWN');
    expect(callback).toHaveBeenCalledTimes(1);
    const fresh = openCostInvoiceReview(await f.read(), f.entry.target.job_id!),
      next = vi.fn(),
      nav = lease(next);
    expect(continueCostInvoiceReview(fresh, 'customer', nav, nav).status).toBe(
      'UNKNOWN',
    );
    expect(next).not.toHaveBeenCalled();
  });
});
