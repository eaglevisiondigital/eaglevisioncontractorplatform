import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { verifyLedger } from '../src/domain/release/types';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { openFinancialCaseworkJob } from '../src/lib/workflows/financial-casework';
import { prepareFinancialEvidenceReview } from '../src/lib/workflows/financial-evidence-review';
import {
  readFinanceReviewPath,
  openFinanceReviewPath,
  inspectFinanceReviewEvidence,
  assertFinanceReviewPathCurrent,
  assertFinanceReviewEvidenceCurrent,
  returnFinanceReviewPath,
  navigateFinanceReviewPath,
} from '../src/lib/workflows/finance-review-path';
import { FinanceReviewPath } from '../src/components/workflows/FinanceReviewPath';

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
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    entry = sources.entries[0],
    preview = entry.release;
  if (positive) {
    await preview.command('staff', 'create_contract', {
      offer_id: entry.offer_id,
      terms: 'Explicit synthetic TEST fixture only',
      legal_reference: 'No genuine approval',
    });
    const contract = preview.read('staff').release_contracts[0];
    await preview.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Synthetic fixture',
      consent: true,
    });
    await preview.command('staff', 'create_invoice', {
      contract_id: contract.id,
    });
    const invoice = preview.read('staff').release_invoices[0],
      amount = invoice.snapshot.schedule[0].amount_minor;
    await preview.command('customer', 'authorize_payment', {
      invoice_id: invoice.id,
      amount_minor: amount,
      consent: true,
    });
    const auth = preview.read('staff').release_authorizations[0];
    await preview.command('staff', 'synthetic_capture', {
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
    sources,
    entry,
    preview,
    input,
    read: () => readFinanceReviewPath(sources, input, gate),
  };
}
function first(
  review: Awaited<ReturnType<typeof readFinanceReviewPath>>,
  jobId: string,
) {
  return review.jobs.find((job) => job.target.job_id === jobId)!
    .original_exception_ids[0];
}
describe('Cycle15 exact exception to canonical evidence and local return', () => {
  it.each([0, 1, 2])(
    'brand %i follows missing coverage through original invoice requirements and returns to same exception',
    async (index) => {
      const f = await fixture(index),
        review = await f.read(),
        id = first(review, f.entry.target.job_id!),
        path = openFinanceReviewPath(review, id, f.entry.target.job_id!);
      expect(path.coverage.costs).toBeNull();
      expect(path.invoice.overall).toBe('NO_GO');
      expect(path.anchor.as_of).toBe(f.input.as_of);
      const detail = inspectFinanceReviewEvidence(path, {
        kind: 'requirement',
        id: 'CONTRACT',
      });
      expect(detail.selection.item).toMatchObject({
        status: 'UNKNOWN',
        amount_minor: null,
      });
      expect(detail.invoice_source).toBeNull();
      expect(returnFinanceReviewPath(path)).toEqual({
        status: 'CURRENT_EXACT_CASE_RETURN',
        anchor: path.anchor,
        replacement: null,
      });
      expect(detail.anchor.exception_id).toBe(id);
      const callback = vi.fn();
      expect(navigateFinanceReviewPath(path, callback).status).toBe(
        'ORIGINAL_FINANCE_REVIEW_REQUESTED',
      );
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        f.entry.target.job_id,
        'finance',
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i binds actual immutable event/posting content, invoice snapshot hash and canonical aggregate without writes',
    async (index) => {
      const f = await fixture(index, true),
        before = JSON.stringify(f.preview.read('staff')),
        writers = [
          vi.spyOn(f.preview, 'command'),
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
        ],
        review = await f.read(),
        path = openFinanceReviewPath(
          review,
          first(review, f.entry.target.job_id!),
        );
      const workspace = f.preview.read('staff'),
        event = workspace.release_payment_events[0],
        invoice = workspace.release_invoices[0],
        posting = workspace.release_ledger_entries.find(
          (row) => row.event_id === event.id,
        )!;
      const eventDetail = inspectFinanceReviewEvidence(path, {
          kind: 'event',
          id: event.id,
        }),
        postingDetail = inspectFinanceReviewEvidence(path, {
          kind: 'posting',
          id: posting.id,
        });
      expect(eventDetail.event).toMatchObject({
        id: event.id,
        kind: event.kind,
        created_at: event.created_at,
        authorization_id: event.authorization_id,
      });
      expect(eventDetail.event).not.toHaveProperty('version');
      expect(postingDetail.posting).not.toHaveProperty('version');
      expect(postingDetail.posting?.event_id).toBe(event.id);
      expect(eventDetail.invoice_source?.snapshot_sha256).toBe(
        await documentHash(invoice.snapshot),
      );
      expect(eventDetail.invoice_source?.summary?.balance_minor).toBe(
        String(
          verifyLedger(
            invoice,
            workspace.release_ledger_entries,
            workspace.release_payment_events,
          ),
        ),
      );
      expect(eventDetail.anchor.issued_scope_sha256).toBe(
        path.anchor.issued_scope_sha256,
      );
      expect(path.invoice.overall).toBe('NO_GO');
      expect(returnFinanceReviewPath(path).status).toBe(
        'CURRENT_EXACT_CASE_RETURN',
      );
      expect(JSON.stringify(eventDetail)).not.toMatch(
        /unit_cost_minor|cash_minor|burden_minor|internal_notes|@example|5550100100|supplier/,
      );
      expect(JSON.stringify(f.preview.read('staff'))).toBe(before);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    },
  );
  it.each(['hint', 'exception', 'property'] as const)(
    'denies wrong %s context and never substitutes same-property jobs',
    async (kind) => {
      const f = await fixture(),
        review = await f.read(),
        id = first(review, f.entry.target.job_id!);
      if (kind === 'hint')
        expect(() =>
          openFinanceReviewPath(
            review,
            id,
            f.sources.entries[3].target.job_id!,
          ),
        ).toThrow();
      if (kind === 'exception')
        expect(() =>
          openFinanceReviewPath(review, 'missing', f.entry.target.job_id!),
        ).toThrow();
      if (kind === 'property') {
        const path = openFinanceReviewPath(review, id);
        f.entry.target.location_id = f.sources.entries[1].target.location_id;
        expect(returnFinanceReviewPath(path)).toEqual({
          status: 'UNKNOWN',
          replacement: null,
        });
      }
      expect(() =>
        openFinanceReviewPath(structuredClone(review), id),
      ).toThrow();
    },
  );
  it.each(['snapshot', 'job', 'issued-handle', 'as-of', 'role'] as const)(
    'withdraws %s drift from evidence and exact return without replacing immutable context',
    async (kind) => {
      const f = await fixture(0, true),
        review = await f.read(),
        path = openFinanceReviewPath(
          review,
          first(review, f.entry.target.job_id!),
        ),
        event = f.preview.read('staff').release_payment_events[0],
        detail = inspectFinanceReviewEvidence(path, {
          kind: 'event',
          id: event.id,
        }),
        bytes = JSON.stringify(detail);
      if (kind === 'snapshot') {
        const bad = f.preview.read('staff');
        bad.release_invoices[0].snapshot = structuredClone(
          bad.release_invoices[0].snapshot,
        );
        bad.release_invoices[0].snapshot.total_minor++;
        vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
          ...structuredClone(bad),
          actor,
        }));
      }
      if (kind === 'job') {
        const raw = f.sources.estimates.readSyntheticPrototypeSources(
          f.entry.target,
        ).job!;
        await f.sources.estimates.projection(f.sources.company.id, raw, {
          ...raw.projection,
          remaining: {
            ...raw.projection.remaining,
            other: raw.projection.remaining.other + 1,
          },
        });
      }
      if (kind === 'issued-handle') f.entry.issued = { ...f.entry.issued };
      if (kind === 'as-of')
        f.input.as_of = new Date(
          Date.parse(f.input.as_of) + 1000,
        ).toISOString();
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
      expect(() => assertFinanceReviewEvidenceCurrent(detail)).toThrow();
      expect(() => assertFinanceReviewPathCurrent(path)).toThrow();
      expect(returnFinanceReviewPath(path)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(JSON.stringify(detail)).toBe(bytes);
      const callback = vi.fn();
      expect(navigateFinanceReviewPath(path, callback).status).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('rechecks the original cutoff and source after actual invoice snapshot hashing awaits', async () => {
    const f = await fixture(0, true),
      snapshot = JSON.stringify(
        f.preview.read('staff').release_invoices[0].snapshot,
      ),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (
        !changed &&
        new TextDecoder().decode(args[1] as ArrayBuffer) === snapshot
      ) {
        changed = true;
        f.input.input_revision++;
      }
      return result;
    });
    await expect(f.read()).rejects.toThrow();
    expect(changed).toBe(true);
  });
  it('keeps inconsistent posting identities unreconciled and financial amounts UNKNOWN', async () => {
    const f = await fixture(0, true),
      bad = f.preview.read('staff'),
      event = bad.release_payment_events[0];
    bad.release_ledger_entries.find(
      (row) => row.event_id === event.id,
    )!.event_id = crypto.randomUUID();
    vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
      ...structuredClone(bad),
      actor,
    }));
    const review = await f.read(),
      path = openFinanceReviewPath(
        review,
        first(review, f.entry.target.job_id!),
      ),
      detail = inspectFinanceReviewEvidence(path, {
        kind: 'event',
        id: event.id,
      });
    expect(detail.invoice_source?.verification).toBe('UNRECONCILED');
    expect(detail.invoice_source?.summary).toBeNull();
    expect(detail.selection.item?.amount_minor).toBeNull();
  });
  it('foreign canonical evidence and missing exact source IDs never become another job source', async () => {
    const f = await fixture(0, true),
      bad = f.preview.read('staff');
    bad.release_payment_events[0].customer_id = crypto.randomUUID();
    vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
      ...structuredClone(bad),
      actor,
    }));
    await expect(f.read()).rejects.toThrow();
    vi.restoreAllMocks();
    const review = await f.read(),
      path = openFinanceReviewPath(
        review,
        first(review, f.entry.target.job_id!),
      );
    expect(
      inspectFinanceReviewEvidence(path, {
        kind: 'event',
        id: crypto.randomUUID(),
      }).selection.status,
    ).toBe('UNKNOWN');
  });
  it('concurrent/fresh/relabelled views and copied return anchors cannot reset original correction holds', async () => {
    const f = await fixture(),
      [a, b] = await Promise.all([f.read(), f.read()]),
      id = first(a, f.entry.target.job_id!),
      path = openFinanceReviewPath(a, id),
      detail = openFinancialCaseworkJob(a, f.entry.target.job_id!),
      proposal = {
        remaining: { ...detail.evidence.correction.before.remaining },
        reason: 'Exact original correction',
        confirmed: true as const,
        excludes_unpaid_commitments: true as const,
        source_sha256: detail.evidence.correction.source_sha256,
        input_revision: 2,
      };
    await prepareFinancialEvidenceReview(detail.evidence, proposal);
    const fresh = openFinancialCaseworkJob(b, f.entry.target.job_id!);
    await expect(
      prepareFinancialEvidenceReview(fresh.evidence, {
        ...proposal,
        reason: 'Relabelled review',
        source_sha256: fresh.evidence.correction.source_sha256,
      }),
    ).rejects.toThrow('already held');
    expect(returnFinanceReviewPath(structuredClone(path))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it.each(['off', 'production', 'remote', 'https'] as const)(
    '%s admission precedes source and input getters',
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
      const sources = poison as Parameters<typeof readFinanceReviewPath>[0];
      await expect(
        readFinanceReviewPath(
          sources,
          poison as Parameters<typeof readFinanceReviewPath>[1],
          { enabled: mode !== 'off', confirmed: true },
        ),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(FinanceReviewPath, {
            sources,
            enabled: mode !== 'off',
          }),
        ),
      ).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'brand %i independently validates the selected job hint before initial controls',
    async (index) => {
      const f = await fixture(index),
        good = renderToStaticMarkup(
          createElement(FinanceReviewPath, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.entry.target.job_id!,
          }),
        ),
        bad = renderToStaticMarkup(
          createElement(FinanceReviewPath, {
            sources: f.sources,
            enabled: true,
            selectedJobId: crypto.randomUUID(),
          }),
        );
      expect(good).toContain('Read financial exception sources');
      expect(good).not.toContain('<pre');
      expect(bad).toContain('unavailable');
      expect(bad).not.toContain('<input');
    },
  );
});
