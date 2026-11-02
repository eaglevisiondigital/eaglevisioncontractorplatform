import { afterEach, describe, expect, it, vi } from 'vitest';
import * as proofOfWork from '../../src/domain/property/proof-of-work-pack';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import {
  readSalesWorkflow,
  prepareSalesWorkflowContract,
  verifySalesWorkflowReview,
  type SalesWorkflowTarget,
} from '../../src/lib/workflows/sales-workflow';
import {
  readFieldWorkflow,
  openFieldWorkflowReport,
} from '../../src/lib/workflows/field-workflow';
import {
  readFinanceWorkflow,
  verifyFinanceWorkflow,
} from '../../src/lib/workflows/finance-workflow';
import {
  readCustomerWorkflow,
  prepareCustomerWorkflowPack,
  verifyCustomerWorkflowPack,
} from '../../src/lib/workflows/customer-workflow';
import {
  readGrowthWorkflow,
  verifyGrowthWorkflow,
  prepareGrowthWorkflowProposal,
} from '../../src/lib/workflows/growth-workflow';
import {
  prepareIntelligenceWorkflow,
  inspectIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
} from '../../src/lib/workflows/intelligence-workflow';

const gate = () => ({ enabled: true, confirmed: true });
type Journey = Awaited<ReturnType<typeof prepareLocalJourney>>;
function salesTarget(j: Journey): SalesWorkflowTarget {
  const { job_id: _job, ...target } = j.target;
  void _job;
  return {
    ...target,
    intake_request_id: j.intake_request_id,
    offer_id: j.offer_id,
    receipt_id: j.receipt_id,
  };
}
function reportTarget(j: Journey) {
  return { report_id: j.report_id, published_version: j.published_version };
}
const reminderWindow = () => ({
  from: '2026-12-07',
  through: '2026-12-28',
  as_of: '2026-12-08T12:00:00.000Z',
  channel: 'email' as const,
});
function financeSelection(j: Journey) {
  return {
    job_revision: j.estimates.syntheticJob(j.company.id, j.target.job_id!)!
      .lock_revision,
    currency: j.issued.version.calculation.currency,
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
  };
}
afterEach(() => vi.restoreAllMocks());

describe('independent Cycle 6 integration review against actual shared engines', () => {
  it.each(sampleCompanies)(
    'keeps one actual lead/scope/job/report through all six workflows: $name',
    async (company) => {
      const j = await prepareLocalJourney(company, gate()),
        original = JSON.stringify(j.issued.version),
        state = j.property.read(company.id),
        jobs = await j.estimates.jobs(company.id),
        release = j.release.read('staff'),
        writes = [
          vi.spyOn(j.release, 'command'),
          vi.spyOn(j.estimates, 'approveJob'),
          vi.spyOn(j.estimates, 'issue'),
          vi.spyOn(j.estimates, 'assignJob'),
          vi.spyOn(j.estimates, 'submitExpense'),
          vi.spyOn(j.property, 'publish'),
          vi.spyOn(j.property, 'saveVisit'),
          vi.spyOn(j.property, 'addVisit'),
          vi.spyOn(j.property, 'savePlan'),
          vi.spyOn(j.operations, 'recordConsent'),
        ];
      const sales = await readSalesWorkflow(
        j.estimates,
        j.release,
        salesTarget(j),
        gate(),
      );
      expect(sales.status).toBe('current');
      expect(sales.evidence?.lead.id).toBe(j.intake_request_id);
      expect(sales.evidence?.receipt.id).toBe(j.receipt_id);
      const preparation = await prepareSalesWorkflowContract(
        j.estimates,
        j.release,
        salesTarget(j),
        {
          ...gate(),
          association_confirmed: true,
          reviewed_source_hash: sales.source_hash!,
          checks: {
            scope: true,
            preference: true,
            terms: true,
            boundaries: true,
          },
        },
      );
      expect(preparation.contract_execution).toBe('BLOCKED');
      const field = await readFieldWorkflow(
        j.property,
        j.target,
        { day: j.day, timezone: j.timezone },
        gate(),
      );
      const source = await openFieldWorkflowReport(field, reportTarget(j));
      expect(source.handoff).toMatchObject({
        organization_id: company.id,
        customer_id: j.target.customer_id,
        location_id: j.target.location_id,
        job_id: j.target.job_id,
        issued_version_id: j.target.version_id,
        report_id: j.report_id,
        published_version: j.published_version,
      });
      const customer = await readCustomerWorkflow(
        j.customerModel,
        j.target,
        source.handoff,
        gate(),
      );
      // Navigation evidence must be stripped to the exact destination selector.
      expect(customer.status).toBe('UNKNOWN');
      const actual = await readCustomerWorkflow(
        j.customerModel,
        j.target,
        reportTarget(j),
        gate(),
      );
      expect(actual.status).toBe('CURRENT');
      const pack = await prepareCustomerWorkflowPack(
        j.customerModel,
        j.target,
        reportTarget(j),
        {
          ...gate(),
          reviewed_source_hash: actual.source_hash!,
        },
      );
      expect(pack.snapshot.events).toHaveLength(2);
      expect(JSON.stringify(pack)).not.toMatch(
        /PRIVATE|unit_cost_minor|internal_notes|worker_id|payroll|supplier|profit_margin/,
      );
      const finance = await readFinanceWorkflow(
        j.estimates,
        j.target,
        financeSelection(j),
        gate(),
      );
      expect(finance.invoicePreparation.reference).toMatchObject({
        offer_id: j.offer_id,
        decision_id: j.receipt_id,
        contract_id: null,
        signature_id: null,
        invoice_id: null,
      });
      expect(finance.invoicePreparation.scope.totals.total_minor).toBe(
        j.issued.version.calculation.total_minor,
      );
      expect(finance.invoicePreparation.overall).toBe('NO_GO');
      expect(await verifyFinanceWorkflow(finance)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
      const growth = await readGrowthWorkflow(
        j.property,
        j.target,
        reminderWindow(),
        gate(),
      );
      expect(growth.source.source_sha256).toBe(finance.source_sha256);
      expect(field.source.source_sha256).toBe(finance.source_sha256);
      expect(growth.maintenance_opportunities[0].source).toMatchObject({
        report_id: j.report_id,
        report_version: j.published_version,
        job_id: j.target.job_id,
        plan_id: j.plan_id,
      });
      const eligible = growth.candidates.find(
        (c) => c.can_prepare_visit_proposal,
      )!;
      expect(eligible).toBeDefined();
      const proposal = await prepareGrowthWorkflowProposal(
        growth,
        eligible.selection,
      );
      expect(proposal.current_channel_authority).toBe('UNKNOWN');
      expect(proposal.proposal.scheduling_authority).toBe('BLOCKED');
      expect(proposal.proposal.recipient).toBeNull();
      const catalog = await j.estimates.catalog(company.id),
        item = catalog[0];
      const intelligence = await prepareIntelligenceWorkflow(
        j.estimates,
        j.target,
        {
          review_on: '2026-12-08',
          advanced: {
            transcript: `2 ${item.unit} ${item.name}`,
            edition:
              company.industry === 'construction'
                ? 'remodeling'
                : company.industry,
            catalog_item_ids: [item.id],
            procurement: null,
          },
        },
        gate(),
      );
      expect(intelligence.source_sha256).toBe(finance.source_sha256);
      expect(intelligence.copilot.snapshot.target).toEqual(j.target);
      expect(intelligence.advanced?.voice).toBeDefined();
      expect(intelligence.advanced?.trade).toBeDefined();
      expect(await inspectIntelligenceWorkflow(intelligence)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
      expect(
        Object.values(intelligence.authority).every((v) => v === false),
      ).toBe(true);
      expect(JSON.stringify(intelligence)).not.toMatch(
        /PRIVATE|unit_cost|cash_hour|"phone"\s*:|"email"\s*:|internal_note/,
      );
      expect(j.property.read(company.id)).toEqual(state);
      expect(await j.estimates.jobs(company.id)).toEqual(jobs);
      expect(j.release.read('staff')).toEqual(release);
      expect(JSON.stringify(j.issued.version)).toBe(original);
      writes.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    },
  );

  it('withholds Sales result if selected property changes during its final hash', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], gate()),
      selected = salesTarget(j),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.lead && body.source && body.receipt) {
        reached = true;
        selected.location_id = crypto.randomUUID();
      }
      return value;
    });
    expect(
      (await readSalesWorkflow(j.estimates, j.release, selected, gate()))
        .status,
    ).toBe('unknown');
    expect(reached).toBe(true);
  });

  it('withholds customer history when exact report selection changes at final hash', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], gate()),
      selected = reportTarget(j),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.timeline_sha256 && body.sources) {
        reached = true;
        selected.published_version++;
      }
      return value;
    });
    expect(
      (await readCustomerWorkflow(j.customerModel, j.target, selected, gate()))
        .status,
    ).toBe('UNKNOWN');
    expect(reached).toBe(true);
  });

  it('never admits accessor selectors or an unconfirmed journey through customer rendering', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], gate());
    j.customerModel.logout();
    let called = false;
    const selected = Object.defineProperty({ ...j.target }, 'actor_id', {
      get: () => {
        called = true;
        return j.target.actor_id;
      },
    });
    expect(() => j.customerModel.admitLocalJourney(selected, gate())).toThrow();
    expect(called).toBe(false);
    expect(() =>
      j.customerModel.admitLocalJourney(j.target, {
        enabled: true,
        confirmed: false,
      }),
    ).toThrow();
    expect(() => j.customerModel.read()).toThrow();
  });

  for (const operation of ['prepare', 'verify'] as const) {
    it(`withholds Sales ${operation} when original selection changes after its last hash`, async () => {
      const j = await prepareLocalJourney(sampleCompanies[0], gate()),
        selected = salesTarget(j),
        read = await readSalesWorkflow(
          j.estimates,
          j.release,
          selected,
          gate(),
        ),
        input = {
          ...gate(),
          association_confirmed: true,
          reviewed_source_hash: read.source_hash!,
          checks: {
            scope: true,
            preference: true,
            terms: true,
            boundaries: true,
          },
        };
      const retained =
        operation === 'verify'
          ? await prepareSalesWorkflowContract(
              j.estimates,
              j.release,
              selected,
              input,
            )
          : null;
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let reached = false;
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
        const value = await digest(...args),
          body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
        if (body.preparation && body.lead) {
          reached = true;
          selected.intake_request_id = crypto.randomUUID();
        }
        return value;
      });
      if (retained)
        expect(
          await verifySalesWorkflowReview(
            j.estimates,
            j.release,
            selected,
            retained,
          ),
        ).toBe('unknown');
      else
        await expect(
          prepareSalesWorkflowContract(j.estimates, j.release, selected, input),
        ).rejects.toThrow();
      expect(reached).toBe(true);
    });

    it(`withholds customer ${operation} when selected published version changes after underlying engine returns`, async () => {
      const j = await prepareLocalJourney(sampleCompanies[0], gate()),
        selected = reportTarget(j),
        read = await readCustomerWorkflow(
          j.customerModel,
          j.target,
          selected,
          gate(),
        ),
        input = { ...gate(), reviewed_source_hash: read.source_hash! };
      if (operation === 'prepare') {
        const original = proofOfWork.prepareProofOfWorkPack;
        vi.spyOn(proofOfWork, 'prepareProofOfWorkPack').mockImplementation(
          async (...args) => {
            const pack = await original(...args);
            selected.published_version++;
            return pack;
          },
        );
        await expect(
          prepareCustomerWorkflowPack(
            j.customerModel,
            j.target,
            selected,
            input,
          ),
        ).rejects.toThrow();
      } else {
        const retained = await prepareCustomerWorkflowPack(
            j.customerModel,
            j.target,
            selected,
            input,
          ),
          original = proofOfWork.verifyProofOfWorkPack;
        vi.spyOn(proofOfWork, 'verifyProofOfWorkPack').mockImplementation(
          async (...args) => {
            const result = await original(...args);
            selected.published_version++;
            return result;
          },
        );
        expect(
          await verifyCustomerWorkflowPack(
            j.customerModel,
            j.target,
            selected,
            retained,
            gate(),
          ),
        ).toBe('UNKNOWN');
      }
    });
  }

  it('revoked reviewer cannot reuse a previously admitted model, work order or finance result', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], gate()),
      field = await readFieldWorkflow(
        j.property,
        j.target,
        { day: j.day, timezone: j.timezone },
        gate(),
      ),
      finance = await readFinanceWorkflow(
        j.estimates,
        j.target,
        financeSelection(j),
        gate(),
      ),
      growth = await readGrowthWorkflow(
        j.property,
        j.target,
        reminderWindow(),
        gate(),
      ),
      intelligence = await prepareIntelligenceWorkflow(
        j.estimates,
        j.target,
        {
          review_on: '2026-12-08',
          advanced: null,
        },
        gate(),
      );
    await j.operations.configure(
      j.company.id,
      'active',
      'starter',
      {},
      j.company.id + '-backup-owner',
    );
    await j.operations.revokeOwner(j.company.id, j.target.actor_id);
    expect(() => j.customerModel.read()).toThrow();
    expect(
      (
        await readCustomerWorkflow(
          j.customerModel,
          j.target,
          reportTarget(j),
          gate(),
        )
      ).timeline,
    ).toBeNull();
    expect(
      (await readSalesWorkflow(j.estimates, j.release, salesTarget(j), gate()))
        .evidence,
    ).toBeNull();
    await expect(
      openFieldWorkflowReport(field, reportTarget(j)),
    ).rejects.toThrow();
    expect(await verifyFinanceWorkflow(finance)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(await verifyGrowthWorkflow(growth)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(await inspectIntelligenceWorkflow(intelligence)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    j.customerModel.logout();
    expect(() => j.customerModel.admitLocalJourney(j.target, gate())).toThrow();
  });

  it('retains an ambiguous Intelligence result as UNKNOWN without new-version/job-null replay', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], gate()),
      digest = crypto.subtle.digest.bind(crypto.subtle),
      input = { review_on: '2026-12-08', advanced: null };
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const body = JSON.parse(
          new TextDecoder().decode(args[1] as ArrayBuffer),
        );
        if (body.mode === 'LOCAL_SYNTHETIC_INTELLIGENCE_WORKFLOW')
          throw Error('Independent acknowledgment loss');
        return digest(...args);
      });
    await expect(
      prepareIntelligenceWorkflow(j.estimates, j.target, input, gate()),
    ).rejects.toThrow('acknowledgment');
    spy.mockRestore();
    expect(
      readIntelligenceWorkflowAttempt(j.estimates, j.target, gate()),
    ).toMatchObject({ status: 'UNKNOWN', retry: false, replacement: null });
    await expect(
      prepareIntelligenceWorkflow(
        j.estimates,
        { ...j.target, job_id: null },
        input,
        gate(),
      ),
    ).rejects.toThrow(/Existing|UNKNOWN/);
    expect(j.release.read('staff').release_invoices).toHaveLength(0);
  });

  it('withdrawn recorded consent invalidates exact Growth review and cannot prepare a replacement visit', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], gate()),
      view = await readGrowthWorkflow(
        j.property,
        j.target,
        reminderWindow(),
        gate(),
      ),
      candidate = view.candidates.find((c) => c.can_prepare_visit_proposal)!;
    expect(view.consent.status).toBe('CAPTURED_NOT_ATOMIC');
    expect(view.consent.current_channel_authority).toBe('UNKNOWN');
    const before = j.property.read(j.company.id);
    await j.operations.recordConsent(
      j.company.id,
      j.target.customer_id,
      false,
      false,
    );
    expect(await verifyGrowthWorkflow(view)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    await expect(
      prepareGrowthWorkflowProposal(view, candidate.selection),
    ).rejects.toThrow();
    expect(j.property.read(j.company.id)).toEqual(before);
  });

  it('does not join an actual second job/report on the same customer property by identical words', async () => {
    const j = await prepareLocalJourney(sampleCompanies[0], gate()),
      otherDraft = await j.estimates.create(
        j.company,
        structuredClone(j.issued.version.payload),
      ),
      otherIssued = await j.estimates.issue(j.company.id, otherDraft),
      otherJob = await j.estimates.approveJob(j.company.id, otherIssued);
    await j.property.refreshContexts(j.company.id);
    const context = j.property
      .read(j.company.id)
      .contexts.find((c) => c.job_id === otherJob)!;
    const plan = j.property.createPlan(
      j.company.id,
      context,
      'Separate exact job with same wording',
    );
    let visit = j.property.addVisit(
      j.company.id,
      plan.id,
      '2026-12-09',
      'after',
    );
    j.property.saveVisit(j.company.id, visit, {
      summary:
        'Recorded synthetic after-stage documentation. Physical completion has not been verified.',
      internal_notes: 'PRIVATE second-job staffing',
      checklist: [],
      findings: [
        {
          id: crypto.randomUUID(),
          category: 'Maintenance',
          location: 'Exterior joint',
          severity: 'moderate',
          description: 'A weathered exterior joint was documented.',
          recommendation: 'Plan a separate maintenance assessment.',
          customer_visible: true,
        },
      ],
    });
    visit = j.property
      .read(j.company.id)
      .visits.find((v) => v.id === visit.id)!;
    j.property.submit(j.company.id, visit);
    visit = j.property
      .read(j.company.id)
      .visits.find((v) => v.id === visit.id)!;
    const report = j.property.publish(j.company.id, visit);
    const field = await readFieldWorkflow(
      j.property,
      j.target,
      { day: j.day, timezone: j.timezone },
      gate(),
    );
    expect(field.published_reports.map((r) => r.report_id)).toEqual([
      j.report_id,
    ]);
    await expect(
      openFieldWorkflowReport(field, {
        report_id: report.id,
        published_version: report.version,
      }),
    ).rejects.toThrow();
    expect(
      (
        await readCustomerWorkflow(
          j.customerModel,
          j.target,
          {
            report_id: report.id,
            published_version: report.version,
          },
          gate(),
        )
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readFinanceWorkflow(
        j.estimates,
        { ...j.target, job_id: otherJob },
        financeSelection(j),
        gate(),
      ),
    ).rejects.toThrow();
    const customer = await readCustomerWorkflow(
      j.customerModel,
      j.target,
      reportTarget(j),
      gate(),
    );
    expect(customer.status).toBe('CURRENT');
    const pack = await prepareCustomerWorkflowPack(
      j.customerModel,
      j.target,
      reportTarget(j),
      {
        ...gate(),
        reviewed_source_hash: customer.source_hash!,
      },
    );
    expect(pack.snapshot.events).toHaveLength(2);
    expect(
      pack.snapshot.events.some(
        (e) =>
          e.kind === 'inspection-documentation' &&
          e.reference.report_id === report.id,
      ),
    ).toBe(false);
  });
});
