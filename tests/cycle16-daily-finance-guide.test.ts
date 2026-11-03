import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  filterFinancialCasework,
  openFinancialCaseworkJob,
} from '../src/lib/workflows/financial-casework';
import {
  readFinanceReviewPath,
  inspectFinanceReviewEvidence,
} from '../src/lib/workflows/finance-review-path';
import { prepareFinancialEvidenceReview } from '../src/lib/workflows/financial-evidence-review';
import {
  readDailyFinanceGuide,
  filterDailyFinanceGuide,
  selectDailyFinanceReview,
  assertDailyFinanceGuideCurrent,
  assertDailyFinanceReviewCurrent,
  returnDailyFinanceReview,
  navigateDailyFinanceReview,
} from '../src/lib/workflows/daily-finance-guide';
import { DailyFinanceGuide } from '../src/components/workflows/DailyFinanceGuide';

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
async function fixture(index = 0, positive = false, portfolio = false) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[index], gate),
    entry = all.entries[0],
    sources = { ...all, entries: portfolio ? all.entries : [entry] };
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
    all,
    sources,
    gate,
    entry,
    input,
    read: () => readDailyFinanceGuide(sources, input, gate),
  };
}
const all = { query: '', kind: 'all', job_id: null } as const;
function first(
  review: Awaited<ReturnType<typeof readDailyFinanceGuide>>,
  jobId: string,
) {
  return review.jobs.find((job) => job.target.job_id === jobId)!
    .original_exception_ids[0];
}
describe('Cycle16 current canonical daily financial guide', () => {
  it.each([0, 1, 2])(
    'brand %i retains original next review and missing coverage without inferred zero or authority',
    async (index) => {
      const f = await fixture(index),
        review = await f.read(),
        view = filterDailyFinanceGuide(review, all),
        item = view.jobs[0],
        original = filterFinancialCasework(review, all);
      expect(view.jobs.map((item) => item.job)).toEqual(original.jobs);
      expect(item.next_review).toBe(
        item.job.requirements.find((row) =>
          item.job.original_exception_ids.includes(row.id),
        ),
      );
      expect(item.job.facts.costs).toBeNull();
      expect(item.profitability).toBe('UNKNOWN');
      expect(item.invoice_readiness).toBe('NO_GO');
      expect(item.job.facts.missing_evidence.length).toBeGreaterThan(0);
      const selected = selectDailyFinanceReview(
          review,
          {
            job_id: f.entry.target.job_id!,
            exception_id: item.next_review!.id,
          },
          f.entry.target.job_id!,
        ),
        callback = vi.fn();
      expect(selected.anchor).toMatchObject({
        target: f.entry.target,
        exception_id: item.next_review!.id,
        as_of: f.input.as_of,
        job_revision: item.job.source.job_revision,
      });
      expect(returnDailyFinanceReview(structuredClone(selected))).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(returnDailyFinanceReview(selected)).toMatchObject({
        status: 'CURRENT_EXACT_CASE_RETURN',
        anchor: selected.anchor,
      });
      expect(navigateDailyFinanceReview(selected, callback).status).toBe(
        'ORIGINAL_FINANCE_REVIEW_REQUESTED',
      );
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        f.entry.target.job_id,
        'finance',
      );
      expect(
        Object.values(review.authority).every((value) => value === false),
      ).toBe(true);
    },
  );
  it.each([0, 1, 2])(
    'brand %i finds exact canonical event and original invoice snapshot through unchanged source APIs without writes',
    async (index) => {
      const f = await fixture(index, true),
        before = JSON.stringify(f.entry.release.read('staff')),
        customer = JSON.stringify(f.entry.release.read('customer')),
        writers = [
          vi.spyOn(f.entry.release, 'command'),
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
        ],
        workspace = f.entry.release.read('staff'),
        event = workspace.release_payment_events[0],
        invoice = workspace.release_invoices[0],
        review = await f.read(),
        filtered = filterDailyFinanceGuide(review, { ...all, query: event.id }),
        selected = selectDailyFinanceReview(review, {
          job_id: f.entry.target.job_id!,
          exception_id: filtered.jobs[0].next_review!.id,
        }),
        detail = inspectFinanceReviewEvidence(selected, {
          kind: 'event',
          id: event.id,
        });
      expect(filtered.matching).toBe(1);
      expect(detail.event?.id).toBe(event.id);
      expect(detail.event).not.toHaveProperty('version');
      expect(detail.invoice_source?.snapshot_sha256).toBe(
        await documentHash(invoice.snapshot),
      );
      expect(detail.invoice_source?.verification).toBe(
        'RECONCILED_SYNTHETIC_ONLY',
      );
      expect(detail.invoice_source?.contract_id).toBe(invoice.contract_id);
      expect(JSON.stringify({ filtered, selected, detail })).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100|Synthetic planning supplier/,
      );
      expect(JSON.stringify(f.entry.release.read('staff'))).toBe(before);
      expect(JSON.stringify(f.entry.release.read('customer'))).toBe(customer);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    },
  );
  it('uses literal job/source filtering and original requirement order without a substitute next review', async () => {
    const f = await fixture(0, false, true),
      review = await f.read(),
      target = f.entry.target.job_id!,
      one = filterDailyFinanceGuide(review, {
        query: target,
        kind: 'invoice_readiness',
        job_id: target,
      });
    expect(one.jobs.map((item) => item.job.target.job_id)).toEqual([target]);
    expect(one.jobs[0].next_review?.kind).toBe('invoice_readiness');
    expect(one.order_meaning).toBe(review.order_meaning);
    expect(
      filterDailyFinanceGuide(review, { ...all, query: '[literal.*]' })
        .matching,
    ).toBe(0);
    const gap = filterDailyFinanceGuide(review, {
      ...all,
      kind: 'canonical_evidence',
      job_id: target,
    });
    expect(gap.jobs[0].next_review).toBeNull();
    expect(() =>
      filterDailyFinanceGuide(review, { ...all, job_id: crypto.randomUUID() }),
    ).toThrow();
    const getter = vi.fn(),
      bad = { ...all };
    Object.defineProperty(bad, 'query', { get: getter });
    expect(() => filterDailyFinanceGuide(review, bad)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['source', 'gate', 'role', 'input', 'root', 'invoice'] as const)(
    'withdraws %s changes from original figures, source controls and retained return',
    async (kind) => {
      const f = await fixture(0, kind === 'invoice'),
        review = await f.read(),
        selected = selectDailyFinanceReview(review, {
          job_id: f.entry.target.job_id!,
          exception_id: first(review, f.entry.target.job_id!),
        }),
        bytes = JSON.stringify(selected),
        callback = vi.fn();
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
      if (kind === 'gate') f.gate.confirmed = false;
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
      if (kind === 'input') f.input.input_revision++;
      if (kind === 'root') f.sources.entries = [...f.sources.entries];
      if (kind === 'invoice') {
        const bad = f.entry.release.read('staff');
        bad.release_invoices[0].snapshot.total_minor++;
        vi.spyOn(f.entry.release, 'read').mockImplementation((actor) => ({
          ...structuredClone(bad),
          actor,
        }));
      }
      expect(() => assertDailyFinanceGuideCurrent(review)).toThrow();
      expect(() => filterDailyFinanceGuide(review, all)).toThrow();
      expect(() => assertDailyFinanceReviewCurrent(selected)).toThrow();
      expect(returnDailyFinanceReview(selected)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(navigateDailyFinanceReview(selected, callback).status).toBe(
        'UNKNOWN',
      );
      expect(callback).not.toHaveBeenCalled();
      expect(JSON.stringify(selected)).toBe(bytes);
    },
  );
  it.each(['tenant', 'property', 'job'] as const)(
    'rejects %s evidence rather than selecting another source',
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
  it('rejects wrong job hints, cross-job exception IDs, canonical-only gaps and copied reviews without fallback', async () => {
    const f = await fixture(),
      review = await f.read(),
      selection = {
        job_id: f.entry.target.job_id!,
        exception_id: first(review, f.entry.target.job_id!),
      };
    expect(() =>
      selectDailyFinanceReview(
        review,
        selection,
        f.all.entries[3].target.job_id!,
      ),
    ).toThrow();
    expect(() =>
      selectDailyFinanceReview(review, {
        ...selection,
        job_id: f.all.entries[3].target.job_id!,
      }),
    ).toThrow();
    expect(() =>
      selectDailyFinanceReview(review, {
        ...selection,
        exception_id: `${selection.job_id}:canonical-evidence`,
      }),
    ).toThrow();
    expect(() =>
      selectDailyFinanceReview(structuredClone(review), selection),
    ).toThrow();
    const getter = vi.fn(),
      poison = { ...selection };
    Object.defineProperty(poison, 'exception_id', { get: getter });
    expect(() => selectDailyFinanceReview(review, poison)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('rechecks current staff after the final actual invoice snapshot hash await', async () => {
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
          memberships(org).map((member) => ({ ...member, active: false })),
        );
      }
      return result;
    });
    await expect(f.read()).rejects.toThrow();
    expect(changed).toBe(true);
  });
  it('concurrent guide/original views and relabelled reviews preserve the same exact-job correction hold', async () => {
    const f = await fixture(),
      [a, b] = await Promise.all([
        f.read(),
        readFinanceReviewPath(f.sources, f.input, f.gate),
      ]),
      firstView = openFinancialCaseworkJob(a, f.entry.target.job_id!),
      secondView = openFinancialCaseworkJob(b, f.entry.target.job_id!),
      proposal = {
        remaining: { ...firstView.evidence.correction.before.remaining },
        reason: 'Exact original TEST review',
        confirmed: true as const,
        excludes_unpaid_commitments: true as const,
        source_sha256: firstView.evidence.correction.source_sha256,
        input_revision: 2,
      };
    await prepareFinancialEvidenceReview(firstView.evidence, proposal);
    await expect(
      prepareFinancialEvidenceReview(secondView.evidence, {
        ...proposal,
        reason: 'Relabelled guide review',
        source_sha256: secondView.evidence.correction.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });
  it.each(['off', 'truthy', 'production', 'remote', 'https'] as const)(
    '%s denies admission before source getters/serializers or original controls mount',
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
        sources = poison as Parameters<typeof readDailyFinanceGuide>[0];
      await expect(
        readDailyFinanceGuide(
          sources,
          { as_of: '', input_revision: 1 },
          { enabled, confirmed: true },
        ),
      ).rejects.toThrow();
      const markup = renderToStaticMarkup(
        createElement(DailyFinanceGuide, { sources, enabled }),
      );
      expect(markup).not.toContain('<input');
      expect(markup).not.toContain(
        'aria-label="Financial exception review path"',
      );
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['staff', 'inactive'] as const)(
    'denies %s roles before returning private financial facts',
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
    },
  );
  it.each([0, 1, 2])(
    'brand %i validates hints before controls and leaves original source workflow explicitly unopened',
    async (index) => {
      const f = await fixture(index),
        markup = renderToStaticMarkup(
          createElement(DailyFinanceGuide, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.entry.target.job_id!,
          }),
        );
      expect(markup).toContain('Daily financial guide');
      expect(markup).toContain('Read daily financial sources');
      expect(markup).not.toContain(
        'aria-label="Financial exception review path"',
      );
      expect(markup).not.toContain('<pre');
      expect(
        renderToStaticMarkup(
          createElement(DailyFinanceGuide, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.all.entries[3].target.job_id!,
          }),
        ),
      ).not.toContain('<input');
    },
  );
});
