import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { openFinancialCaseworkJob } from '../src/lib/workflows/financial-casework';
import { prepareFinancialEvidenceReview } from '../src/lib/workflows/financial-evidence-review';
import {
  readFinanceCaseContinuity,
  financialCaseSourceItems,
  inspectFinanceCaseSource,
  assertFinanceCaseSelectionCurrent,
  compareFinanceCaseSelection,
  navigateFinanceCaseSelection,
} from '../src/lib/workflows/finance-case-continuity';
import { FinanceCaseContinuity } from '../src/components/workflows/FinanceCaseContinuity';

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
      terms: 'Explicit TEST fixture',
      legal_reference: 'No genuine approval',
    });
    const contract = preview.read('staff').release_contracts[0];
    await preview.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Synthetic Fixture',
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
    sources,
    gate,
    entry,
    preview,
    input,
    read: () => readFinanceCaseContinuity(sources, input, gate),
  };
}
describe('Cycle14 exact financial case source continuity', () => {
  it.each([0, 1, 2])(
    'brand %i keeps empty canonical evidence honest and inspects original invoice requirements/cost identities',
    async (index) => {
      const f = await fixture(index),
        review = await f.read(),
        detail = openFinancialCaseworkJob(review, f.entry.target.job_id!),
        items = financialCaseSourceItems(detail);
      expect(
        items.filter((i) => ['invoice', 'event', 'posting'].includes(i.kind)),
      ).toEqual([]);
      const requirement = inspectFinanceCaseSource(
        review,
        f.entry.target.job_id!,
        { kind: 'requirement', id: 'CONTRACT' },
      );
      expect(requirement).toMatchObject({
        status: 'EXACT_RECORDED_SOURCE',
        invoice_readiness: 'NO_GO',
        canonical_coverage: 'UNVERIFIED',
        item: { status: 'UNKNOWN', amount_minor: null },
      });
      const expense = inspectFinanceCaseSource(review, f.entry.target.job_id!, {
        kind: 'expense',
        id: detail.job.source.expense_ids[0],
      });
      expect(expense.item).toMatchObject({
        status: 'RECORDED_ID_ONLY',
        invoice_id: null,
        amount_minor: null,
        related_ids: [],
      });
      expect(compareFinanceCaseSelection(requirement, review).status).toBe(
        'MATCHING_CURRENT_SOURCE',
      );
      const callback = vi.fn();
      expect(navigateFinanceCaseSelection(requirement, callback).status).toBe(
        'LOCAL_FINANCE_REVIEW_REQUESTED',
      );
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        f.entry.target.job_id,
        'finance',
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i drills through actual TEST-engine event/posting/invoice proof without writes or readiness promotion',
    async (index) => {
      const f = await fixture(index, true),
        before = JSON.stringify(f.preview.read('staff')),
        writers = [
          vi.spyOn(f.preview, 'command'),
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
        ],
        review = await f.read(),
        workspace = f.preview.read('staff'),
        event = workspace.release_payment_events[0];
      const selected = inspectFinanceCaseSource(
        review,
        f.entry.target.job_id!,
        { kind: 'event', id: event.id },
      );
      expect(selected.item).toMatchObject({
        status: 'RECONCILED_SYNTHETIC_ONLY',
        invoice_id: event.invoice_id,
        amount_minor: String(event.amount_minor),
      });
      expect(selected.item?.related_ids).toContain(event.authorization_id);
      const posting = workspace.release_ledger_entries.find(
        (p) => p.event_id === event.id,
      )!;
      expect(selected.item?.related_ids).toContain(posting.id);
      expect(
        inspectFinanceCaseSource(review, f.entry.target.job_id!, {
          kind: 'posting',
          id: posting.id,
        }).item?.related_ids,
      ).toEqual([event.id]);
      expect(selected.invoice_readiness).toBe('NO_GO');
      expect(
        inspectFinanceCaseSource(review, f.sources.entries[3].target.job_id!, {
          kind: 'event',
          id: event.id,
        }),
      ).toMatchObject({ status: 'UNKNOWN', item: null });
      expect(JSON.stringify(selected)).not.toMatch(
        /unit_cost_minor|cash_minor|burden_minor|supplier|internal_notes|@example|5550100100/,
      );
      expect(JSON.stringify(f.preview.read('staff'))).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    },
  );
  it('retains an exact event identity across a new current read and reports missing without selecting another event', async () => {
    const f = await fixture(0, true),
      old = await f.read(),
      event = f.preview.read('staff').release_payment_events[0],
      selected = inspectFinanceCaseSource(old, f.entry.target.job_id!, {
        kind: 'event',
        id: event.id,
      }),
      bytes = JSON.stringify(selected),
      bad = f.preview.read('staff');
    bad.release_payment_events = [];
    bad.release_ledger_entries = bad.release_ledger_entries.filter(
      (p) => p.event_id === null,
    );
    vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
      ...structuredClone(bad),
      actor,
    }));
    expect(() => assertFinanceCaseSelectionCurrent(selected)).toThrow();
    const fresh = await f.read(),
      comparison = compareFinanceCaseSelection(selected, fresh);
    expect(comparison).toMatchObject({
      status: 'UNKNOWN_SELECTED_SOURCE_MISSING',
      selected_identity: { kind: 'event', id: event.id },
      current_status: 'UNKNOWN',
      replacement: null,
    });
    expect(JSON.stringify(selected)).toBe(bytes);
    expect(navigateFinanceCaseSelection(selected, vi.fn()).status).toBe(
      'UNKNOWN',
    );
  });
  it('saved forecast CAS change requires current-source reinspection and cannot restore retained authority', async () => {
    const f = await fixture(),
      old = await f.read(),
      selected = inspectFinanceCaseSource(old, f.entry.target.job_id!, {
        kind: 'requirement',
        id: 'CONTRACT',
      }),
      raw = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ).job!;
    await f.sources.estimates.projection(f.sources.company.id, raw, {
      ...raw.projection,
      remaining: {
        ...raw.projection.remaining,
        other: raw.projection.remaining.other + 1,
      },
    });
    const fresh = await f.read();
    expect(compareFinanceCaseSelection(selected, fresh)).toMatchObject({
      status: 'SOURCE_CHANGED_REINSPECTION_REQUIRED',
      current_revision: selected.source_job_revision + 1,
      replacement: null,
    });
    const callback = vi.fn();
    expect(navigateFinanceCaseSelection(selected, callback).status).toBe(
      'UNKNOWN',
    );
    expect(callback).not.toHaveBeenCalled();
    expect(
      inspectFinanceCaseSource(fresh, f.entry.target.job_id!, selected.identity)
        .status,
    ).toBe('EXACT_RECORDED_SOURCE');
  });
  it.each(['gate', 'role', 'root'] as const)(
    'withholds %s drift, copied and missing identities before callback',
    async (kind) => {
      const f = await fixture(),
        review = await f.read(),
        selected = inspectFinanceCaseSource(review, f.entry.target.job_id!, {
          kind: 'requirement',
          id: 'CONTRACT',
        }),
        callback = vi.fn();
      expect(
        navigateFinanceCaseSelection(structuredClone(selected), callback)
          .status,
      ).toBe('UNKNOWN');
      const missing = inspectFinanceCaseSource(review, f.entry.target.job_id!, {
        kind: 'invoice',
        id: crypto.randomUUID(),
      });
      expect(navigateFinanceCaseSelection(missing, callback).status).toBe(
        'UNKNOWN',
      );
      if (kind === 'gate') f.gate.confirmed = false;
      if (kind === 'root') f.sources.entries = [...f.sources.entries];
      if (kind === 'role') {
        const original = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          original(org).map((m) => ({ ...m, active: false })),
        );
      }
      expect(navigateFinanceCaseSelection(selected, callback).status).toBe(
        'UNKNOWN',
      );
      expect(callback).not.toHaveBeenCalled();
      f.gate.confirmed = true;
      expect(() => assertFinanceCaseSelectionCurrent(selected)).toThrow();
    },
  );
  it('concurrent source reads cannot bypass the unchanged C12/C11 correction hold', async () => {
    const f = await fixture(),
      [a, b] = await Promise.all([f.read(), f.read()]),
      da = openFinancialCaseworkJob(a, f.entry.target.job_id!),
      db = openFinancialCaseworkJob(b, f.entry.target.job_id!),
      proposal = {
        remaining: { ...da.evidence.correction.before.remaining },
        reason: 'Explicit existing correction review',
        confirmed: true as const,
        excludes_unpaid_commitments: true as const,
        source_sha256: da.evidence.correction.source_sha256,
        input_revision: 2,
      };
    await prepareFinancialEvidenceReview(da.evidence, proposal);
    await expect(
      prepareFinancialEvidenceReview(db.evidence, {
        ...proposal,
        source_sha256: db.evidence.correction.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });
  it('denies foreign canonical event source and source accessors without executing them', async () => {
    const f = await fixture(0, true),
      bad = f.preview.read('staff');
    bad.release_payment_events[0].organization_id = sampleCompanies[1].id;
    vi.spyOn(f.preview, 'read').mockImplementation((actor) => ({
      ...structuredClone(bad),
      actor,
    }));
    await expect(f.read()).rejects.toThrow();
    vi.restoreAllMocks();
    const review = await f.read(),
      getter = vi.fn(),
      input = { kind: 'requirement', id: 'CONTRACT' };
    Object.defineProperty(input, 'id', { get: getter });
    expect(() =>
      inspectFinanceCaseSource(
        review,
        f.entry.target.job_id!,
        input as Parameters<typeof inspectFinanceCaseSource>[2],
      ),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['off', 'production', 'remote', 'https'] as const)(
    '%s gates precede getters and serializers in reader and component',
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
      const sources = poison as Parameters<typeof readFinanceCaseContinuity>[0];
      await expect(
        readFinanceCaseContinuity(
          sources,
          { as_of: '', input_revision: 1 },
          { enabled: mode !== 'off', confirmed: true },
        ),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(FinanceCaseContinuity, {
            sources,
            enabled: mode !== 'off',
          }),
        ),
      ).not.toContain('<select');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'brand %i initial component is explicit and has no duplicate original role region or internal dump',
    async (index) => {
      const f = await fixture(index),
        markup = renderToStaticMarkup(
          createElement(FinanceCaseContinuity, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.entry.target.job_id!,
          }),
        );
      expect(markup).toContain('Financial case source continuity');
      expect(markup).toContain('Read financial case sources');
      expect(markup).not.toContain('<pre');
      expect(markup).not.toContain('aria-label="Financial casework desk"');
      expect(markup).not.toContain('Open existing Finance review');
    },
  );
});
