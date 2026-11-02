import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { documentHash } from '../src/domain/release/preview';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import { prepareProcurementReview } from '../src/lib/program/procurement-review';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  readFinanceDesk,
  inspectFinanceDesk,
  type FinanceDeskSelection,
} from '../src/lib/workflows/finance-desk';
import { FinanceDesk } from '../src/components/workflows/FinanceDesk';
import { prototypeFixture } from './program/prototype-fixture';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0, knownLabor = true, catalogBinding = false) {
  const f = await prototypeFixture(sampleCompanies[index]);
  let bundle = f.bundle;
  if (catalogBinding) {
    const line = bundle.version.payload.lines.find(
      (l) =>
        ['material', 'product'].includes(l.kind) &&
        bundle.version.calculation.lines.some(
          (c) => c.id === l.id && c.included,
        ),
    )!;
    const catalog = (await f.repo.catalog(f.company.id)).find(
      (c) => c.kind === line.kind && c.unit === line.unit,
    )!;
    bundle = await f.repo.save(f.company.id, bundle, {
      ...bundle.version.payload,
      lines: bundle.version.payload.lines.map((l) =>
        l.id === line.id ? { ...l, catalog_item_id: catalog.id } : l,
      ),
    });
  }
  bundle = await f.repo.issue(f.company.id, bundle);
  const jobId = await f.repo.approveJob(f.company.id, bundle);
  if (knownLabor)
    await f.repo.payroll(
      f.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      {},
      true,
    );
  const target = { ...f.target, version_id: bundle.version.id, job_id: jobId };
  const input: FinanceDeskSelection = {
    job_review: {
      finance: {
        job_revision: f.repo.syntheticJob(f.company.id, jobId)!.lock_revision,
        currency: bundle.version.calculation.currency,
        release: null,
        accounting_aliases: null,
        procurement: null,
      },
      time: null,
      material: null,
      input_revision: 1,
    },
    remaining: {
      materials: 2000,
      labor: 3000,
      subcontractors: 0,
      equipment: 0,
      other: 0,
    },
    excludes_unpaid_commitments: true,
    input_revision: 1,
  };
  async function expense(
    kind: 'commitment' | 'payment' | 'credit',
    amount: number,
    adjusts: string | null = null,
  ) {
    const id = await f.repo.submitExpense(f.company.id, jobId, {
      purchase_key: 'actual-existing-source',
      supplier: 'PRIVATE supplier',
      reference: crypto.randomUUID(),
      category: 'materials',
      kind,
      amount_minor: amount,
      description: 'PRIVATE cost evidence',
      estimate_line_id: null,
      quantity_milli: null,
      unit: null,
      unit_cost_minor: null,
      document_ids: [],
      material_approval_id: null,
      adjusts_expense_id: adjusts,
    });
    await f.repo.reviewExpense(
      f.company.id,
      jobId,
      id,
      'approved',
      'PRIVATE review',
    );
    input.job_review.finance.job_revision = f.repo.syntheticJob(
      f.company.id,
      jobId,
    )!.lock_revision;
    return id;
  }
  return {
    ...f,
    bundle,
    target,
    jobId,
    input,
    expense,
    read: () => readFinanceDesk(f.repo, target, input, f.gate),
  };
}
describe('Cycle 8 Finance operating desk', () => {
  it.each([0, 1, 2])(
    'uses company %i actual journey and preserves missing labor UNKNOWN while proposal inputs stay visible',
    async (index) => {
      const gate = { enabled: true, confirmed: true },
        j = await prepareLocalJourney(sampleCompanies[index], gate);
      const source = j.estimates.readSyntheticPrototypeSources(j.target),
        original = JSON.stringify(source),
        release = j.release.read('staff');
      const writers = [
        vi.spyOn(j.estimates, 'projection'),
        vi.spyOn(j.estimates, 'submitExpense'),
        vi.spyOn(j.estimates, 'payroll'),
        vi.spyOn(j.estimates, 'recordTime'),
        vi.spyOn(j.release, 'command'),
      ];
      const result = await readFinanceDesk(
        j.estimates,
        j.target,
        {
          job_review: {
            finance: {
              job_revision: source.job!.lock_revision,
              currency: source.job!.baseline.currency,
              release: {
                preview: j.release,
                offer_id: j.offer_id,
                decision_id: j.receipt_id,
                contract_id: null,
                signature_id: null,
                invoice_id: null,
                as_of: new Date().toISOString(),
              },
              accounting_aliases: null,
              procurement: null,
            },
            time: null,
            material: null,
            input_revision: 2,
          },
          remaining: {
            materials: 2500,
            labor: 3500,
            subcontractors: 0,
            equipment: 0,
            other: 0,
          },
          excludes_unpaid_commitments: true,
          input_revision: 2,
        },
        gate,
      );
      expect(result.target).toEqual(j.target);
      expect(result.recorded.recorded.costReview.status).toBe('UNKNOWN');
      expect(result.scenario.completion.totals).toBeNull();
      expect(result.scenario.margin.totals).toBeNull();
      expect(result.scenario.proposed_remaining.materials).toBe(2500);
      expect(result.invoice.reference.decision_id).toBe(j.receipt_id);
      expect(result.compatibility.accounting.status).toBe('UNKNOWN');
      expect(result.compatibility.accounting.retained_mapping).toBeNull();
      expect(
        result.compatibility.accounting.quickbooks.external_realm_id,
      ).toBeNull();
      expect(result.compatibility.procurement.status).toBe(
        'UNKNOWN_NO_EXACT_EXISTING_REVIEW',
      );
      expect(
        Object.values(result.authority).every((flag) => flag === false),
      ).toBe(true);
      expect(
        JSON.stringify(j.estimates.readSyntheticPrototypeSources(j.target)),
      ).toBe(original);
      expect(j.release.read('staff')).toEqual(release);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    },
  );
  it.each([0, 1, 2])(
    'uses canonical actual/commitment/credit netting exactly once for company %i',
    async (index) => {
      const f = await fixture(index);
      await f.expense('commitment', 10000);
      const payment = await f.expense('payment', 4000);
      await f.expense('credit', 1000, payment);
      const before = f.repo.syntheticJob(f.company.id, f.jobId)!,
        history = await f.repo.history(f.company.id, f.target.estimate_id);
      const r = await f.read(),
        proposed = structuredClone(before);
      proposed.projection = {
        ...proposed.projection,
        remaining: { ...f.input.remaining },
        costs_complete: false,
      };
      const canonical = jobFinancials(proposed);
      expect(r.scenario.completion.totals).toMatchObject({
        recordedMinor: 3000,
        unpaidCommitmentMinor: 6000,
        remainingForecastMinor: 5000,
        costToCompleteMinor: 11000,
        projectedMinor: 14000,
      });
      expect(r.scenario.margin.totals?.projectedContributionMinor).toBe(
        canonical.projected_profit_minor,
      );
      expect(r.scenario.margin.totals?.projectedMarginBps).toBe(
        canonical.projected_margin_bps,
      );
      expect(r.scenario.margin.status).toBe('PARTIAL');
      expect(r.scenario.original_remaining).toEqual(
        before.projection.remaining,
      );
      expect(f.repo.syntheticJob(f.company.id, f.jobId)).toEqual(before);
      expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
        history,
      );
      expect(r.invoice.scope.totals.total_minor).toBe(
        f.bundle.version.calculation.total_minor,
      );
    },
  );
  it('reuses canonical margin warning thresholds without granting final-profit or management-completion status', async () => {
    const f = await fixture();
    f.input.remaining.materials = 900000000;
    const r = await f.read();
    expect(r.scenario.margin.warningReview.negativeContribution).toBe(true);
    expect(r.scenario.margin.warningReview.erosionThresholdExceeded).toBe(true);
    expect(
      r.scenario.margin.warningReview.aboveBudgetCategories,
    ).toContainEqual({ category: 'materials', thresholdExceeded: true });
    expect(r.scenario.margin.coverage?.managementCostsComplete).toBe(false);
    expect(r.invoice.overall).toBe('NO_GO');
  });
  it.each([
    'organization_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ] as const)('denies foreign %s', async (key) => {
    const f = await fixture();
    f.target[key] = crypto.randomUUID();
    await expect(f.read()).rejects.toThrow();
  });
  it.each(['foreign', 'field', 'inactive'] as const)(
    'denies %s financial actor',
    async (kind) => {
      const f = await fixture();
      if (kind === 'foreign')
        f.target.actor_id = `${sampleCompanies[1].id}-owner`;
      else if (kind === 'field') f.target.actor_id = `${f.company.id}-field`;
      else {
        f.target.actor_id = `${f.company.id}-estimator`;
        await f.ops.manageMember(
          f.company.id,
          f.target.actor_id,
          false,
          'admin',
          'office_manager',
        );
      }
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each([
    'negative',
    'fraction',
    'object',
    'extra',
    'unconfirmed_exclusion',
    'revision',
    'currency',
  ] as const)(
    'rejects invalid %s without coercion or assumed commitment exclusion',
    async (kind) => {
      const f = await fixture(),
        coercion = vi.fn(() => 500);
      if (kind === 'negative') f.input.remaining.materials = -1;
      if (kind === 'fraction') f.input.remaining.labor = 1.1;
      if (kind === 'object')
        Object.assign(f.input.remaining, { materials: { valueOf: coercion } });
      if (kind === 'extra') Object.assign(f.input.remaining, { invented: 100 });
      if (kind === 'unconfirmed_exclusion')
        Object.assign(f.input, { excludes_unpaid_commitments: false });
      if (kind === 'revision') f.input.job_review.finance.job_revision++;
      if (kind === 'currency') f.input.job_review.finance.currency = 'JPY';
      await expect(f.read()).rejects.toThrow();
      expect(coercion).not.toHaveBeenCalled();
    },
  );
  it('rejects disabled, unconfirmed and accessor gates before repository reads', async () => {
    const f = await fixture(),
      reads = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
    for (const gate of [
      { enabled: false, confirmed: true },
      { enabled: true, confirmed: false },
      {
        enabled: true,
        get confirmed(): boolean {
          throw Error('Getter executed');
        },
      },
    ])
      await expect(
        readFinanceDesk(f.repo, f.target, f.input, gate),
      ).rejects.toThrow();
    expect(reads).not.toHaveBeenCalled();
  });
  it('rejects aggregate overflow through the canonical engine rather than floating-point summation', async () => {
    const f = await fixture();
    for (const c of Object.keys(f.input.remaining))
      f.input.remaining[c as keyof typeof f.input.remaining] =
        9_000_000_000_000;
    await expect(f.read()).rejects.toThrow();
  });
  it('preserves strict customer-safe invoice scope while account aliases remain nonexternal and invoice mapping UNKNOWN', async () => {
    const f = await fixture();
    f.input.job_review.finance.accounting_aliases = {
      receivable: 'Local receivable',
      sales: 'Local revenue',
      tax_payable: 'Local tax',
      sandbox_clearing: 'Local clearing',
    };
    const r = await f.read();
    expect(r.compatibility.accounting.selected_local_aliases).toEqual(
      f.input.job_review.finance.accounting_aliases,
    );
    expect(r.compatibility.accounting.status).toBe('UNKNOWN');
    expect(r.compatibility.accounting.retained_mapping).toBeNull();
    expect(r.compatibility.accounting.quickbooks.external_schema).toBe(
      'UNVERIFIED',
    );
    expect(r.compatibility.accounting.direct_invoice_job_foreign_key).toBe(
      'ABSENT',
    );
    expect(JSON.stringify(r.invoice.scope)).not.toMatch(
      /PRIVATE|unit_cost|supplier|worker|payroll|internal_note/,
    );
    expect(JSON.stringify(r.compatibility)).not.toMatch(
      /PRIVATE|rates|deductions/,
    );
  });
  it('connects only the actual existing exact procurement review, preserving UNKNOWN live admission and no orders', async () => {
    const f = await fixture(0, true, true),
      source = await readPrototypeSource(f.repo, f.target, f.gate);
    const line = f.bundle.version.payload.lines.find((l) => l.catalog_item_id)!;
    const procurement = await prepareProcurementReview(
      source,
      {
        kind: 'purchase-review',
        selections: [
          {
            line_id: line.id,
            catalog_item_id: line.catalog_item_id!,
            quantity_milli: line.quantity_milli,
            bid_minor: 10000,
          },
        ],
      },
      f.gate,
    );
    f.input.job_review.finance.procurement = procurement;
    const r = await f.read();
    expect(r.compatibility.procurement.exact_existing_review.review_id).toBe(
      procurement.id,
    );
    expect(
      r.compatibility.procurement.exact_existing_review.current_admission,
    ).toBe('UNKNOWN');
    expect(r.compatibility.procurement.exact_existing_review.approval).toBe(
      'BLOCKED',
    );
    expect(r.authority.purchase_order).toBe(false);
  });
  it('rejects stale original live proposal changes across a real digest await', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await digest(...args);
      if (!changed) {
        changed = true;
        f.input.remaining.materials++;
      }
      return out;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('rejects original target replacement across an await rather than trusting a copied selection', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await digest(...args);
      if (!changed) {
        changed = true;
        f.target.location_id = crypto.randomUUID();
      }
      return out;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('denies actual administrator revocation after a hash instead of returning private costs', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    f.target.actor_id = `${f.company.id}-estimator`;
    await f.ops.manageMember(
      f.company.id,
      f.target.actor_id,
      true,
      'admin',
      'office_manager',
    );
    const review = await f.read();
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await digest(...args);
      await f.ops.manageMember(
        f.company.id,
        f.target.actor_id,
        false,
        'admin',
        'office_manager',
      );
      return out;
    });
    expect(await inspectFinanceDesk(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('freezes exact scenario and identifies later actual source drift without replacement', async () => {
    const f = await fixture(),
      review = await f.read(),
      hash = review.sha256;
    const { sha256, ...body } = review;
    expect(await documentHash(body)).toBe(sha256);
    expect(Object.isFrozen(review.scenario.proposed_remaining)).toBe(true);
    expect(await inspectFinanceDesk(review)).toEqual({
      status: 'CURRENT_LOCAL_SOURCE',
      replacement: null,
    });
    await f.expense('commitment', 1000);
    expect(await inspectFinanceDesk(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(review.sha256).toBe(hash);
    expect(await inspectFinanceDesk(structuredClone(review))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('labels unchanged-input actual job drift STALE and withdrawn original admission UNKNOWN', async () => {
    const f = await fixture(),
      r = await f.read();
    await f.repo.submitExpense(f.company.id, f.jobId, {
      purchase_key: crypto.randomUUID(),
      supplier: 'PRIVATE source',
      reference: 'later',
      category: 'materials',
      kind: 'commitment',
      amount_minor: 100,
      description: 'source edit',
      estimate_line_id: null,
      quantity_milli: null,
      unit: null,
      unit_cost_minor: null,
      document_ids: [],
      material_approval_id: null,
    });
    expect(await inspectFinanceDesk(r)).toEqual({
      status: 'STALE',
      replacement: null,
    });
    f.gate.confirmed = false;
    expect(await inspectFinanceDesk(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('defaults the panel OFF and presents source-bound accessible forecast controls without inherited raw header', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], {
      enabled: true,
      confirmed: true,
    });
    const off = renderToStaticMarkup(
      createElement(FinanceDesk, { sources: j }),
    );
    expect(off).not.toContain('<form');
    const on = renderToStaticMarkup(
      createElement(FinanceDesk, { sources: j, enabled: true }),
    );
    expect(on).toContain('aria-label="Finance operating review"');
    expect(on).toContain('aria-label="Remaining cost proposal"');
    expect(on).toContain('Use saved forecast as starting values');
    expect(on).toContain('Review cost to complete');
    expect(on).not.toContain('<header');
    expect(on).not.toMatch(/PRIVATE|deductions|rates/);
  });
});
