import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { openFinancialCaseworkJob } from '../src/lib/workflows/financial-casework';
import { prepareFinancialEvidenceReview } from '../src/lib/workflows/financial-evidence-review';
import {
  readFinanceCaseDesk,
  filterFinanceCaseDesk,
  openFinanceCaseDesk,
  assertFinanceCaseDeskCurrent,
  inspectFinanceCaseDeskSource,
  returnFinanceCaseDesk,
  navigateFinanceCaseDesk,
} from '../src/lib/workflows/finance-case-desk';
import { FinanceCaseDesk } from '../src/components/workflows/FinanceCaseDesk';

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
    read: () => readFinanceCaseDesk(sources, input, gate),
  };
}
const allFilter = { query: '', kind: 'all', job_id: null } as const;
describe('Cycle17 retained canonical financial case desk', () => {
  it.each([0, 1, 2])(
    'brand %i combines exact original requirements without selecting a replacement case',
    async (index) => {
      const f = await fixture(index),
        review = await f.read(),
        desk = openFinanceCaseDesk(
          review,
          f.entry.target.job_id!,
          f.entry.target.job_id!,
        );
      expect(desk.job.requirements).toEqual(review.jobs[0].requirements);
      expect(desk.anchor.target).toEqual(f.entry.target);
      expect(desk.job.facts.costs).toBeNull();
      expect(desk.job.facts.margin).toBeNull();
      expect(desk.job.invoice.overall).toBe('NO_GO');
      expect(desk.accounting.status).toBe(
        'BLOCKED_NO_OPERATIONAL_ACCOUNTING_AUTHORITY',
      );
      expect(
        filterFinanceCaseDesk(review, {
          ...allFilter,
          query: f.entry.target.version_id,
        }).matching,
      ).toBe(1);
      expect(returnFinanceCaseDesk(desk)).toMatchObject({
        status: 'CURRENT_EXACT_DESK_RETURN',
        anchor: desk.anchor,
        replacement: null,
      });
      expect(Object.values(review.authority).every((v) => v === false)).toBe(
        true,
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i directly inspects exact original event/posting/invoice hashes with no writes or customer leakage',
    async (index) => {
      const f = await fixture(index, true),
        before = JSON.stringify(f.entry.release.read('staff')),
        customer = JSON.stringify(f.entry.release.read('customer')),
        command = vi.spyOn(f.entry.release, 'command'),
        projection = vi.spyOn(f.sources.estimates, 'projection'),
        review = await f.read(),
        desk = openFinanceCaseDesk(review, f.entry.target.job_id!),
        ws = f.entry.release.read('staff'),
        invoice = ws.release_invoices[0];
      for (const kind of ['invoice', 'event', 'posting'] as const) {
        const source = desk.sources.find((s) => s.kind === kind)!;
        expect(source).toBeTruthy();
        const inspected = inspectFinanceCaseDeskSource(desk, {
          kind,
          id: source.id,
        });
        expect(inspected.selection.identity).toEqual({ kind, id: source.id });
        expect(inspected.invoice_source?.snapshot_sha256).toBe(
          await documentHash(invoice.snapshot),
        );
        expect(inspected.selection.target).toEqual(f.entry.target);
        expect(inspected.invoice_source?.verification).toBe(
          'RECONCILED_SYNTHETIC_ONLY',
        );
      }
      expect(JSON.stringify(desk)).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100/,
      );
      expect(JSON.stringify(f.entry.release.read('staff'))).toBe(before);
      expect(JSON.stringify(f.entry.release.read('customer'))).toBe(customer);
      expect(command).not.toHaveBeenCalled();
      expect(projection).not.toHaveBeenCalled();
    },
  );
  it.each(['gate', 'input', 'root', 'source', 'member'] as const)(
    'withdraws %s and permanently withholds retained sources even after restoration',
    async (kind) => {
      const f = await fixture(),
        review = await f.read(),
        desk = openFinanceCaseDesk(review, f.entry.target.job_id!),
        callback = vi.fn();
      const original = f.sources.entries;
      if (kind === 'gate') f.gate.confirmed = false;
      if (kind === 'input') f.input.input_revision++;
      if (kind === 'root') f.sources.entries = [...f.sources.entries];
      if (kind === 'member') {
        const memberships = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          memberships(org).map((m) => ({ ...m, active: false })),
        );
      }
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
      expect(() => assertFinanceCaseDeskCurrent(desk)).toThrow();
      f.gate.confirmed = true;
      f.sources.entries = original;
      expect(returnFinanceCaseDesk(desk)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(navigateFinanceCaseDesk(desk, callback).status).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it.each(['tenant', 'property', 'job'] as const)(
    'rejects wrong %s association without a fallback',
    async (kind) => {
      const f = await fixture();
      if (kind === 'tenant') f.sources.company = sampleCompanies[1];
      if (kind === 'property')
        f.entry.target.location_id = f.all.entries[1].target.location_id;
      if (kind === 'job')
        f.entry.target.job_id = f.all.entries[3].target.job_id;
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('blocks a foreign job hint, copied retained selection and invalid literal filters', async () => {
    const f = await fixture(),
      review = await f.read(),
      desk = openFinanceCaseDesk(review, f.entry.target.job_id!);
    expect(() =>
      openFinanceCaseDesk(
        review,
        f.entry.target.job_id!,
        f.all.entries[3].target.job_id!,
      ),
    ).toThrow();
    expect(() =>
      openFinanceCaseDesk(review, f.all.entries[3].target.job_id!),
    ).toThrow();
    expect(returnFinanceCaseDesk(structuredClone(desk))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() =>
      filterFinanceCaseDesk(review, { ...allFilter, query: 'x'.repeat(201) }),
    ).toThrow();
    expect(
      filterFinanceCaseDesk(review, { ...allFilter, query: '[literal.*]' })
        .matching,
    ).toBe(0);
    const getter = vi.fn(),
      poison = { ...allFilter };
    Object.defineProperty(poison, 'query', { get: getter });
    expect(() => filterFinanceCaseDesk(review, poison)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('missing exact source remains UNKNOWN with no nearest invoice or guessed amount', async () => {
    const f = await fixture(),
      desk = openFinanceCaseDesk(await f.read(), f.entry.target.job_id!);
    const result = inspectFinanceCaseDeskSource(desk, {
      kind: 'invoice',
      id: crypto.randomUUID(),
    });
    expect(result.selection.status).toBe('UNKNOWN');
    expect(result.invoice_source).toBeNull();
    expect(result.event).toBeNull();
    expect(result.posting).toBeNull();
  });
  it('claims one direct host navigation attempt before reentrant or duplicate callbacks', async () => {
    const f = await fixture(),
      desk = openFinanceCaseDesk(await f.read(), f.entry.target.job_id!);
    let nested: unknown;
    const callback = vi.fn(() => {
      nested = navigateFinanceCaseDesk(desk, callback);
    });
    expect(navigateFinanceCaseDesk(desk, callback).status).toBe('UNKNOWN');
    expect(nested).toEqual({ status: 'UNKNOWN', replacement: null });
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      f.entry.target.job_id,
      'finance',
    );
    expect(navigateFinanceCaseDesk(desk, callback).status).toBe('UNKNOWN');
  });
  it('retains UNKNOWN after a lost host acknowledgement and never retries the callback', async () => {
    const f = await fixture(),
      desk = openFinanceCaseDesk(await f.read(), f.entry.target.job_id!),
      callback = vi.fn(() => {
        throw Error('Lost acknowledgement');
      });
    expect(navigateFinanceCaseDesk(desk, callback).status).toBe('UNKNOWN');
    expect(navigateFinanceCaseDesk(desk, callback).status).toBe('UNKNOWN');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(returnFinanceCaseDesk(desk).status).toBe('UNKNOWN');
  });
  it('rechecks staff after the original final snapshot hash await', async () => {
    const f = await fixture(0, true),
      snapshot = JSON.stringify(
        f.entry.release.read('staff').release_invoices[0].snapshot,
      ),
      original = crypto.subtle.digest.bind(crypto.subtle),
      memberships = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (
        !changed &&
        new TextDecoder().decode(args[1] as ArrayBuffer) === snapshot
      ) {
        changed = true;
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          memberships(org).map((m) => ({ ...m, active: false })),
        );
      }
      return result;
    });
    await expect(f.read()).rejects.toThrow();
    expect(changed).toBe(true);
  });
  it('concurrent desk/original readers preserve the original single correction hold', async () => {
    const f = await fixture(),
      [a, b] = await Promise.all([f.read(), f.read()]),
      one = openFinancialCaseworkJob(a, f.entry.target.job_id!),
      two = openFinancialCaseworkJob(b, f.entry.target.job_id!),
      proposal = {
        remaining: { ...one.evidence.correction.before.remaining },
        reason: 'Explicit synthetic TEST review',
        confirmed: true as const,
        excludes_unpaid_commitments: true as const,
        source_sha256: one.evidence.correction.source_sha256,
        input_revision: 2,
      };
    await prepareFinancialEvidenceReview(one.evidence, proposal);
    await expect(
      prepareFinancialEvidenceReview(two.evidence, {
        ...proposal,
        source_sha256: two.evidence.correction.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });
  it.each(['off', 'truthy', 'production', 'remote', 'https'] as const)(
    '%s hides controls and rejects source getters before reads',
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
        sources = poison as Parameters<typeof readFinanceCaseDesk>[0];
      await expect(
        readFinanceCaseDesk(
          sources,
          { as_of: '', input_revision: 1 },
          { enabled, confirmed: true },
        ),
      ).rejects.toThrow();
      const markup = renderToStaticMarkup(
        createElement(FinanceCaseDesk, { sources, enabled }),
      );
      expect(markup).not.toContain('<input');
      expect(markup).not.toContain('Financial exception review path');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['staff', 'inactive'] as const)(
    'denies %s private financial access',
    async (kind) => {
      const f = await fixture(),
        memberships = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          memberships(org).map((m) => ({
            ...m,
            role: kind === 'staff' ? 'staff' : m.role,
            active: kind !== 'inactive',
          })),
      );
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each([0, 1, 2])(
    'brand %i renders one clear confirmation and keeps original controls explicitly unopened',
    async (index) => {
      const f = await fixture(index),
        html = renderToStaticMarkup(
          createElement(FinanceCaseDesk, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.entry.target.job_id!,
          }),
        );
      expect(html).toContain('Finance case desk');
      expect(html).toContain('Read finance case desk');
      expect(html).not.toContain('Financial exception review path');
      expect(
        renderToStaticMarkup(
          createElement(FinanceCaseDesk, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.all.entries[3].target.job_id!,
          }),
        ),
      ).not.toContain('<input');
    },
  );
  it.each(
    [0, 1, 2].flatMap((index) =>
      (
        ['fresh-wrapper', 'saved-revision', 'mutated-root-on-loss'] as const
      ).map((mode) => ({ index, mode })),
    ),
  )(
    'brand $index retains ambiguous canonical navigation across $mode without a second callback',
    async ({ index, mode }) => {
      const f = await fixture(index),
        first = openFinanceCaseDesk(await f.read(), f.entry.target.job_id!),
        canonical = f.sources.operations;
      const different =
        mode === 'mutated-root-on-loss' ? await fixture((index + 1) % 3) : null;
      const firstCallback = vi.fn(() => {
        if (different) f.sources.operations = different.sources.operations;
        throw Error('Host navigated, acknowledgment lost');
      });
      expect(navigateFinanceCaseDesk(first, firstCallback).status).toBe(
        'UNKNOWN',
      );
      expect(firstCallback).toHaveBeenCalledExactlyOnceWith(
        f.entry.target.job_id,
        'finance',
      );
      f.sources.operations = canonical;
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
      const freshSources = { ...f.sources, entries: [...f.sources.entries] },
        freshReview = await readFinanceCaseDesk(
          freshSources,
          { ...f.input, input_revision: 2 },
          f.gate,
        ),
        fresh = openFinanceCaseDesk(freshReview, f.entry.target.job_id!),
        source = fresh.sources[0],
        secondCallback = vi.fn();
      // Source inspection is still genuinely read-only; no business data is lost.
      expect(
        inspectFinanceCaseDeskSource(fresh, {
          kind: source.kind,
          id: source.id,
        }).selection.status,
      ).toBe('EXACT_RECORDED_SOURCE');
      expect(returnFinanceCaseDesk(fresh)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(navigateFinanceCaseDesk(fresh, secondCallback)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(secondCallback).not.toHaveBeenCalled();
      expect(returnFinanceCaseDesk(first)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
    },
  );
  it('reserves the canonical org/job before forwarding against a concurrent fresh wrapper', async () => {
    const f = await fixture(),
      [a, b] = await Promise.all([
        f.read(),
        readFinanceCaseDesk(
          { ...f.sources, entries: [...f.sources.entries] },
          { ...f.input, input_revision: 2 },
          f.gate,
        ),
      ]),
      one = openFinanceCaseDesk(a, f.entry.target.job_id!),
      two = openFinanceCaseDesk(b, f.entry.target.job_id!),
      second = vi.fn();
    let nested: unknown;
    const first = vi.fn(() => {
      nested = navigateFinanceCaseDesk(two, second);
    });
    expect(navigateFinanceCaseDesk(one, first).status).toBe(
      'EXACT_FINANCE_DESK_NAVIGATION_REQUESTED',
    );
    expect(nested).toEqual({ status: 'UNKNOWN', replacement: null });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
