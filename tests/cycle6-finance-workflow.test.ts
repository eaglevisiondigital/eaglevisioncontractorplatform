import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials, type Expense } from '../src/domain/jobs/financials';
import { prototypeFixture } from './program/prototype-fixture';
import { ReleasePreview } from '../src/domain/release/preview';
import {
  readFinanceWorkflow,
  verifyFinanceWorkflow,
  type FinanceWorkflowSelection,
} from '../src/lib/workflows/finance-workflow';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import { prepareProcurementReview } from '../src/lib/program/procurement-review';
import { FinanceWorkflow } from '../src/components/workflows/FinanceWorkflow';
import { Phase3Repository } from '../src/lib/phase3';
import { Operations } from '../src/lib/operations';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0, knownLabor = false, catalogBinding = false) {
  const f = await prototypeFixture(sampleCompanies[index]);
  let bundle = f.bundle;
  if (catalogBinding) {
    const catalog = await f.repo.catalog(f.company.id);
    const line = bundle.version.payload.lines.find((line) =>
      ['material', 'product'].includes(line.kind),
    )!;
    const item = catalog.find(
      (item) => item.kind === line.kind && item.unit === line.unit,
    )!;
    bundle = await f.repo.save(f.company.id, bundle, {
      ...bundle.version.payload,
      lines: bundle.version.payload.lines.map((row) =>
        row.id === line.id ? { ...row, catalog_item_id: item.id } : row,
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
  const selection: FinanceWorkflowSelection = {
    job_revision: f.repo.syntheticJob(f.company.id, jobId)!.lock_revision,
    currency: bundle.version.calculation.currency,
    release: null,
    accounting_aliases: null,
    procurement: null,
  };
  const read = () => readFinanceWorkflow(f.repo, target, selection, f.gate);
  async function expense(
    kind: Expense['kind'],
    amount: number,
    adjusts: string | null = null,
  ) {
    const id = await f.repo.submitExpense(f.company.id, jobId, {
      kind,
      category: 'materials',
      amount_minor: amount,
      supplier: 'PRIVATE SUPPLIER',
      purchase_key: 'cycle6-actual-purchase',
      reference: crypto.randomUUID(),
      description: 'PRIVATE EXPENSE NOTE',
      estimate_line_id: bundle.version.payload.lines[0].id,
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
      'PRIVATE STAFF REVIEW',
    );
    selection.job_revision = f.repo.syntheticJob(
      f.company.id,
      jobId,
    )!.lock_revision;
    return id;
  }
  async function existingInvoice() {
    const preview = new ReleasePreview(f.company.id, bundle.version);
    await preview.command('staff', 'publish_offer', {
      version_id: bundle.version.id,
    });
    const offer = preview.read('staff').release_offers[0];
    await preview.command('customer', 'decide_offer', {
      offer_id: offer.id,
      decision: 'accepted',
      note: 'LOCAL TEST ONLY',
      consent: true,
    });
    const decision = preview.read('staff').release_decisions[0];
    await preview.command('staff', 'create_contract', {
      offer_id: offer.id,
      terms: 'LOCAL TEST TERMS, NO LEGAL ACCEPTANCE',
      legal_reference: 'Synthetic fixture only',
    });
    const contract = preview.read('staff').release_contracts[0];
    await preview.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Synthetic Test',
      consent: true,
    });
    const signature = preview.read('staff').release_signatures[0];
    await preview.command('staff', 'create_invoice', {
      contract_id: contract.id,
    });
    const invoice = preview.read('staff').release_invoices[0];
    selection.release = {
      preview,
      offer_id: offer.id,
      decision_id: decision.id,
      contract_id: contract.id,
      signature_id: signature.id,
      invoice_id: invoice.id,
      as_of: new Date().toISOString(),
    };
    return { preview, invoice };
  }
  return {
    ...f,
    bundle,
    target,
    selection,
    jobId,
    read,
    expense,
    existingInvoice,
  };
}

describe('Cycle 6 same-source Finance workflow', () => {
  it.each([0, 1, 2])(
    'reviews actual issued customer/property/job scope for company %i while missing labor and contract stay UNKNOWN',
    async (index) => {
      const f = await fixture(index),
        before = structuredClone(await f.repo.jobs(f.company.id)),
        history = await f.repo.history(f.company.id, f.target.estimate_id);
      const writes = [
        vi.spyOn(f.repo, 'submitExpense'),
        vi.spyOn(f.repo, 'projection'),
        vi.spyOn(f.repo, 'payroll'),
        vi.spyOn(f.repo, 'issue'),
        vi.spyOn(f.repo, 'approveJob'),
      ];
      const result = await f.read();
      expect(result.target).toEqual(f.target);
      expect(result.costReview.status).toBe('UNKNOWN');
      expect(result.costReview.completion.totals).toBeNull();
      expect(result.invoicePreparation.scope.totals).toEqual({
        subtotal_minor: f.bundle.version.calculation.subtotal_minor,
        discount_minor: f.bundle.version.calculation.discount_minor,
        tax_minor: f.bundle.version.calculation.tax_minor,
        total_minor: f.bundle.version.calculation.total_minor,
      });
      expect(result.invoicePreparation).toMatchObject({
        status: 'UNKNOWN',
        overall: 'NO_GO',
        reference: { invoice_id: null, contract_id: null, signature_id: null },
      });
      expect(
        result.invoicePreparation.requirements.find(
          (row) => row.id === 'CONTRACT',
        )?.status,
      ).toBe('UNKNOWN');
      expect(
        Object.values(result.authority).every((flag) => flag === false),
      ).toBe(true);
      expect(result.genuine_authentication).toBe('UNVERIFIED');
      expect(await f.repo.jobs(f.company.id)).toEqual(before);
      expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
        history,
      );
      writes.forEach((writer) => expect(writer).not.toHaveBeenCalled());
      expect(await verifyFinanceWorkflow(result)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each([0, 1, 2])(
    'uses actual existing locked preparation and canonical commitment/payment/credit math for company %i',
    async (index) => {
      const f = await fixture(index, true);
      const commitment = await f.expense('commitment', 10000),
        payment = await f.expense('payment', 4000),
        credit = await f.expense('credit', 1000, payment);
      const result = await f.read(),
        canonical = jobFinancials(f.repo.syntheticJob(f.company.id, f.jobId)!);
      expect(result.costReview.status).toBe('PARTIAL');
      expect(
        result.costReview.completion.categories.find(
          (row) => row.category === 'materials',
        )?.unpaidCommitmentMinor,
      ).toBe(6000);
      expect(result.costReview.completion.totals?.projectedMinor).toBe(
        canonical.projected_cost_minor,
      );
      expect(
        result.costReview.completion.expenses.map((row) => row.id),
      ).toEqual(expect.arrayContaining([commitment, payment, credit]));
      expect(
        result.costReview.cards.some(
          (row) => row.code === 'FORECAST_OVERLAP_REVIEW',
        ),
      ).toBe(true);
      expect(result.costReview.completion.providerEvidence.refundStatus).toBe(
        'UNKNOWN',
      );
    },
  );
  it('keeps canonical margin warnings distinct from authority and customer-facing invoice totals', async () => {
    const f = await fixture(0, true);
    await f.expense('commitment', 900000000);
    const result = await f.read();
    expect(result.costReview.cards.map((row) => row.code)).toEqual(
      expect.arrayContaining([
        'CATEGORY_OVERRUN',
        'NEGATIVE_CONTRIBUTION',
        'MARGIN_EROSION',
      ]),
    );
    expect(result.invoicePreparation.scope.totals.total_minor).toBe(
      f.bundle.version.calculation.total_minor,
    );
    expect(result.authority.debt).toBe(false);
  });
  it.each([0, 1, 2])(
    'reviews an exact existing synthetic invoice for company %i and reuses the unchanged controlled accounting export',
    async (index) => {
      const f = await fixture(index, true),
        { preview, invoice } = await f.existingInvoice(),
        before = preview.read('staff'),
        commands = vi.spyOn(preview, 'command');
      f.selection.accounting_aliases = {
        receivable: 'Reviewed local receivable',
        sales: 'Reviewed local sales',
        tax_payable: 'Reviewed local tax',
        sandbox_clearing: 'Synthetic clearing only',
      };
      const result = await f.read();
      expect(result.invoicePreparation.status).toBe(
        'EXISTING_SYNTHETIC_REFERENCE',
      );
      expect(result.invoicePreparation.reference.invoice_id).toBe(invoice.id);
      expect(
        result.invoicePreparation.relationship.direct_invoice_job_foreign_key,
      ).toBe('ABSENT');
      expect(result.invoicePreparation.overall).toBe('NO_GO');
      expect(result.accountingHandoff.review?.status).toBe(
        'RECONCILED_SYNTHETIC_ONLY',
      );
      expect(
        result.accountingHandoff.review?.summary?.invoice_total_minor,
      ).toBe(String(invoice.total_minor));
      expect(result.accountingHandoff.review?.externalProviderSchema).toBe(
        'UNVERIFIED',
      );
      expect(result.accountingHandoff.review?.merchantSettlement).toBe(
        'UNKNOWN',
      );
      expect(preview.read('staff')).toEqual(before);
      expect(commands).not.toHaveBeenCalled();
    },
  );
  it('retains missing invoice preparation requirements and exact original references without creating an invoice', async () => {
    const f = await fixture(),
      { preview } = await f.existingInvoice();
    f.selection.release!.invoice_id = null;
    const before = preview.read('staff'),
      command = vi.spyOn(preview, 'command');
    f.selection.accounting_aliases = {
      receivable: 'Local receivable',
      sales: 'Local sales',
      tax_payable: 'Local tax',
      sandbox_clearing: 'Synthetic clearing',
    };
    const result = await f.read();
    expect(result.invoicePreparation.status).toBe('UNKNOWN');
    expect(result.invoicePreparation.reference.contract_id).not.toBeNull();
    expect(result.invoicePreparation.reference.invoice_id).toBeNull();
    expect(result.accountingHandoff.status).toBe('UNKNOWN');
    expect(preview.read('staff')).toEqual(before);
    expect(command).not.toHaveBeenCalled();
  });
  it('projects a customer-safe issued scope without staff notes, supplier costs or workforce details', async () => {
    const f = await fixture(0, true);
    await f.expense('payment', 1000);
    const result = await f.read(),
      safe = JSON.stringify(result.invoicePreparation.scope),
      all = JSON.stringify(result);
    expect(safe).not.toMatch(
      /PRIVATE|unit_cost|markup|cash_hour|payroll|supplier|internal_note/,
    );
    expect(all).not.toMatch(
      /PRIVATE|cash_hour|salary_week|burden_bps|deductions|display_name|PRIVATE SUPPLIER/,
    );
    expect(Object.isFrozen(result.invoicePreparation.scope.lines[0])).toBe(
      true,
    );
  });
  it.each([
    'job_id',
    'customer_id',
    'location_id',
    'version_id',
    'estimate_id',
  ] as const)('rejects wrong exact %s', async (key) => {
    const f = await fixture();
    await expect(
      readFinanceWorkflow(
        f.repo,
        { ...f.target, [key]: crypto.randomUUID() },
        f.selection,
        f.gate,
      ),
    ).rejects.toThrow();
  });
  it('rejects foreign company/actor, revoked staff, connected repositories and dirty revision/currency', async () => {
    const f = await fixture(),
      other = await fixture(1);
    await expect(
      readFinanceWorkflow(
        f.repo,
        {
          ...f.target,
          organization_id: other.company.id,
          actor_id: other.target.actor_id,
        },
        f.selection,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readFinanceWorkflow(
        f.repo,
        { ...f.target, actor_id: `${f.company.id}-field` },
        f.selection,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readFinanceWorkflow(
        new Phase3Repository(new Operations(false)),
        f.target,
        f.selection,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readFinanceWorkflow(
        f.repo,
        f.target,
        { ...f.selection, job_revision: f.selection.job_revision + 1 },
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readFinanceWorkflow(
        f.repo,
        f.target,
        { ...f.selection, currency: 'CAD' },
        f.gate,
      ),
    ).rejects.toThrow();
  });
  it.each([
    {},
    { enabled: true, confirmed: false },
    { enabled: false, confirmed: true },
    { enabled: true, confirmed: 'true' },
    { enabled: true, confirmed: true, extra: true },
  ])(
    'defaults off and rejects invalid confirmation %j before reads',
    async (gate) => {
      const f = await fixture(),
        read = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
      await expect(
        readFinanceWorkflow(f.repo, f.target, f.selection, gate as never),
      ).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('rejects accessors and extra selection fields without invoking caller serialization', async () => {
    const f = await fixture(),
      selection = { ...f.selection },
      getter = vi.fn(() => f.selection.job_revision);
    Object.defineProperty(selection, 'job_revision', { get: getter });
    await expect(
      readFinanceWorkflow(f.repo, f.target, selection, f.gate),
    ).rejects.toThrow();
    await expect(
      readFinanceWorkflow(
        f.repo,
        f.target,
        {
          ...f.selection,
          toJSON() {
            throw Error('called');
          },
        } as never,
        f.gate,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('denies an actual job edit during the last hash wait and preserves original issued history', async () => {
    const f = await fixture(),
      history = await f.repo.history(f.company.id, f.target.estimate_id),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      if (++calls === 4) {
        const job = f.repo.syntheticJob(f.company.id, f.jobId)!;
        await f.repo.projection(f.company.id, job, {
          ...job.projection,
          remaining: { ...job.projection.remaining, equipment: 50 },
        });
      }
      return value;
    });
    await expect(f.read()).rejects.toThrow();
    expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
      history,
    );
  });
  it.each(['confirmation', 'membership'] as const)(
    'denies %s withdrawal during the last hash wait',
    async (mode) => {
      const f = await fixture(),
        actor = `${f.company.id}-estimator`;
      await f.ops.manageMember(
        f.company.id,
        actor,
        true,
        'admin',
        'office_manager',
      );
      const target = { ...f.target, actor_id: actor },
        digest = crypto.subtle.digest.bind(crypto.subtle);
      let calls = 0;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const value = await digest(...args);
        if (++calls === 4) {
          if (mode === 'confirmation') f.gate.confirmed = false;
          else
            await f.ops.manageMember(
              f.company.id,
              actor,
              false,
              'admin',
              'office_manager',
            );
        }
        return value;
      });
      await expect(
        readFinanceWorkflow(f.repo, target, f.selection, f.gate),
      ).rejects.toThrow();
    },
  );
  it('rejects another issued version with identical company/customer/property instead of substituting it', async () => {
    const f = await fixture(),
      { preview } = await f.existingInvoice();
    preview.version.id = crypto.randomUUID();
    await expect(f.read()).rejects.toThrow();
  });
  it('rejects contradictory contract/signature document integrity without treating equal IDs as enough', async () => {
    const f = await fixture(),
      { preview } = await f.existingInvoice(),
      read = preview.read.bind(preview);
    vi.spyOn(preview, 'read').mockImplementation((actor) => {
      const workspace = read(actor);
      workspace.release_contracts[0].document_hash = '0'.repeat(64);
      workspace.release_signatures[0].document_hash = '0'.repeat(64);
      return workspace;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('retains frozen evidence, exact read-only STALE and UNKNOWN without replacement or financial replay', async () => {
    const f = await fixture(),
      review = await f.read(),
      before = JSON.stringify(review);
    const originalRevision = f.selection.job_revision;
    await f.expense('payment', 1000);
    f.selection.job_revision = originalRevision;
    expect(await verifyFinanceWorkflow(review)).toEqual({
      status: 'STALE',
      replacement: null,
    });
    expect(JSON.stringify(review)).toBe(before);
    expect(await verifyFinanceWorkflow(structuredClone(review))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    f.gate.confirmed = false;
    expect(await verifyFinanceWorkflow(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('rechecks current access on verification even if a job source is also stale', async () => {
    const f = await fixture(),
      actor = `${f.company.id}-estimator`;
    await f.ops.manageMember(
      f.company.id,
      actor,
      true,
      'admin',
      'office_manager',
    );
    const review = await readFinanceWorkflow(
      f.repo,
      { ...f.target, actor_id: actor },
      f.selection,
      f.gate,
    );
    await f.expense('payment', 1000);
    await f.ops.manageMember(
      f.company.id,
      actor,
      false,
      'admin',
      'office_manager',
    );
    expect(await verifyFinanceWorkflow(review)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
  it('carries exact existing procurement source selections without becoming an order or expense', async () => {
    const f = await fixture(0, false, true),
      source = await readPrototypeSource(f.repo, f.target, f.gate),
      line = source.snapshot.estimate.lines.find(
        (line) => line.catalog_item_id,
      )!;
    const procurement = await prepareProcurementReview(
      source,
      {
        kind: 'purchase-review',
        selections: [
          {
            line_id: line.id,
            catalog_item_id: line.catalog_item_id!,
            quantity_milli: line.quantity_milli,
            bid_minor: 12345,
          },
        ],
      },
      { enabled: true, confirmed: true },
    );
    f.selection.procurement = procurement;
    const result = await f.read();
    expect(result.procurementHandoff).toMatchObject({
      status: 'CAPTURED_EXISTING_REVIEW_ONLY',
      review_id: procurement.id,
      source_sha256: source.sha256,
      current_admission: 'UNKNOWN',
      approval: 'BLOCKED',
    });
    expect(result.procurementHandoff.selections[0].line_id).toBe(line.id);
    expect(result.authority.purchase_order).toBe(false);
    expect(result.authority.post_expense).toBe(false);
  });
  it('rejects a current procurement review belonging to another customer/property/tenant', async () => {
    const f = await fixture(0, false, true),
      foreign = await fixture(1, false, true),
      source = await readPrototypeSource(
        foreign.repo,
        foreign.target,
        foreign.gate,
      ),
      line = source.snapshot.estimate.lines.find(
        (line) => line.catalog_item_id,
      )!;
    f.selection.procurement = await prepareProcurementReview(
      source,
      {
        kind: 'purchase-review',
        selections: [
          {
            line_id: line.id,
            catalog_item_id: line.catalog_item_id!,
            quantity_milli: 1000,
            bid_minor: null,
          },
        ],
      },
      { enabled: true, confirmed: true },
    );
    await expect(f.read()).rejects.toThrow();
  });
  it('keeps copied or unavailable procurement evidence UNKNOWN without using its fake contents', async () => {
    const f = await fixture();
    f.selection.procurement = { snapshot: { private: 'DO NOT READ' } } as never;
    const result = await f.read();
    expect(result.procurementHandoff.status).toBe('UNKNOWN');
    expect(result.procurementHandoff.selections).toEqual([]);
  });
});

describe('Finance staff panel boundary', () => {
  it('defaults OFF and withholds previous figures during disabled/loading/error states', async () => {
    const f = await fixture(),
      review = await f.read();
    for (const props of [
      { review },
      { review, enabled: true, loading: true },
      { review, enabled: true, error: 'Current source unavailable' },
    ]) {
      const html = renderToStaticMarkup(createElement(FinanceWorkflow, props));
      expect(html).not.toContain('Customer-facing total');
      expect(html).not.toContain(review.target.version_id);
    }
  });
  it('renders canonical issued scope and honest coverage/authority labels with text escaping', async () => {
    const f = await fixture(),
      review = await f.read(),
      html = renderToStaticMarkup(
        createElement(FinanceWorkflow, { enabled: true, review }),
      );
    expect(html).toContain('Invoice Preparation — Staff Review Only');
    expect(html).toContain('NO_GO');
    expect(html).toContain('UNKNOWN');
    expect(html).toContain('Customer-facing total');
    expect(html).toContain(review.target.version_id);
    expect(html).not.toMatch(/PRIVATE|unit_cost_minor|cash_hour|<script/);
  });
});
