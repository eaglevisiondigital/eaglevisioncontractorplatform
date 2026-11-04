import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customerPreview } from '../src/domain/estimating/customer-preview';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readTaskReceiptContinuity,
  inspectTaskReceiptContinuity,
  inspectTaskReceiptTask,
} from '../src/lib/workflows/task-receipt-reconciliation';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  readServiceRequestEvidence,
  inspectServiceRequestEvidence,
  inspectServiceRequestReport,
} from '../src/lib/workflows/service-request-actions';
import {
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
  verifyPlanCancellationRequirements,
} from '../src/lib/workflows/plan-cancellation-review';
import {
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
} from '../src/lib/workflows/verified-owner-briefing';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each([0, 1, 2])('brand %i original contractor journey', (brand) => {
  const gate = { enabled: true, confirmed: true };
  let all: Awaited<ReturnType<typeof prepareCorrectionPreviewSources>>;
  let originals: { issued: string; baseline: unknown; release: string }[];
  let resultId: string;
  it('pins inquiry, issued scope, separate local job and proposed visit across four native jobs', async () => {
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate);
    const org = all.company.id;
    expect(new Set(all.entries.map((e) => e.target.job_id)).size).toBe(4);
    expect(new Set(all.entries.map((e) => e.target.customer_id)).size).toBe(3);
    // Every link is read from its original owner. The intake source has no job FK.
    originals = all.entries.map((e) => {
      const target = e.target,
        inquiry = all.operations.syntheticIntakeRequest(
          org,
          target.customer_id,
          target.location_id,
          e.intake_request_id,
        ),
        source = all.estimates.readSyntheticPrototypeSources(target),
        release = e.release.read('staff');
      expect(inquiry.service_location_id).toBe(target.location_id);
      expect(inquiry.customer_id).toBe(target.customer_id);
      expect(source.job?.baseline.issued_version_id).toBe(target.version_id);
      expect(source.bundle.version.id).toBe(target.version_id);
      expect(inquiry.id).toBe(e.intake_request_id);
      const decision = release.release_decisions.find(
        (r) => r.id === e.receipt_id,
      )!;
      expect(decision).toMatchObject({
        organization_id: org,
        customer_id: target.customer_id,
        offer_id: e.offer_id,
        decision: 'accepted',
        consent_version: 'internal-test-v1',
        note: 'Explicit LOCAL TEST preference; no contract authority.',
      });
      const offer = release.release_offers.find((r) => r.id === e.offer_id)!;
      expect(offer).toMatchObject({
        organization_id: org,
        customer_id: target.customer_id,
        version_id: target.version_id,
      });
      expect(offer.snapshot).toEqual({
        ...customerPreview(source.bundle.version),
        internal_test: true,
      });
      const visit = all.property
        .read(org)
        .visits.find((v) => v.id === e.scheduled_visit_id);
      expect(visit?.plan_id).toBe(e.plan_id);
      return {
        issued: JSON.stringify(source.bundle.version),
        baseline: source.job!.baseline,
        release: JSON.stringify(release),
      };
    });
  });
  it('records exact native task/material review and invalidates the old owner view without posting labor or issuing invoices', async () => {
    const org = all.company.id;
    const entry = all.entries[2],
      sources = { ...all, entries: [entry] },
      job = entry.target.job_id!,
      task = await readTaskCorrectionReview(sources, job, gate);
    const beforeOwner = await readVerifiedOwnerBriefing(sources, job, gate);
    await saveTaskCorrectionReview(
      task,
      {
        source_entry_id: task.source.source_entry_id,
        task: 'Explicit native technician correction for local journey',
        started_at: task.source.started_at,
        ended_at: task.source.ended_at,
        billable: !task.source.billable,
      },
      true,
    );
    expect(() => assertVerifiedOwnerBriefingCurrent(beforeOwner)).toThrow();
    const continuity = await readTaskReceiptContinuity(sources, job, gate),
      receipt = inspectTaskReceiptContinuity(continuity).receipt;
    expect(receipt.state).toBe('KNOWN_SAVED');
    resultId = receipt.result_id!;
    const selected = inspectTaskReceiptTask(continuity, receipt.result_id!);
    expect(selected.task.corrects_id).toBe(task.source.source_entry_id);
    expect(selected.assigned_worker.worker_id).toBe(entry.worker_id);
    expect(selected.physical_completion).toBe('UNVERIFIED');
    const costs = await readRecordedCostRequirements(sources, job, gate),
      expense = costs.original.original.material.expense_id!;
    await confirmCostCorrectionReview(
      costs.original.original,
      {
        expense_id: expense,
        decision: 'approved',
        reason: 'Explicit local native material review',
      },
      true,
    );
    const currentCosts = await readRecordedCostRequirements(sources, job, gate),
      raw = all.estimates.syntheticJob(org, job)!;
    expect(
      currentCosts.categories.map(
        ({ source_keys: _keys, meaning: _meaning, ...native }) => {
          void _keys;
          void _meaning;
          return native;
        },
      ),
    ).toEqual(jobFinancials(raw).categories);
    expect(
      currentCosts.labor.find((t) => t.entry_id === resultId)?.requirement,
    ).toBe('UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST');
    expect(currentCosts.invoice_overall).toBe('NO_GO');
    expect(currentCosts.operational_ready).toBe(false);
  });
  it('retains published history, explicit request/job UNKNOWN and consent requirements after recorded changes', async () => {
    const org = all.company.id,
      entry = all.entries[2],
      sources = { ...all, entries: [entry] },
      job = entry.target.job_id!;
    const service = await readServiceRequestActions(sources, job, gate),
      expected = inspectServiceRequestActions(service),
      evidence = await readServiceRequestEvidence(
        service,
        sources,
        job,
        expected,
        gate,
      ),
      history = inspectServiceRequestEvidence(service, evidence, expected);
    expect(history.request.id).toBe(entry.intake_request_id);
    expect(history.scope.issued_version_id).toBe(entry.target.version_id);
    expect(history.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(history.customer_acceptance).toBe('UNKNOWN');
    const report = await inspectServiceRequestReport(
      service,
      evidence,
      expected,
      history.reports[0].reference,
    );
    expect(report.completion?.job.reference.job_id).toBe(job);
    expect(report.completion?.interpretation.physical_completion).toBe(
      'UNVERIFIED',
    );
    expect(JSON.stringify(report)).not.toMatch(
      /unit_cost|cash_hour|margin|supplier|deduction/,
    );
    const plans = all.property.read(org).plans,
      review = await readPlanCancellationReview(
        sources,
        job,
        'recurring_maintenance',
        gate,
      ),
      row = review.desk.rows.find(
        (r) => r.plan_reference.id === entry.plan_id,
      )!;
    const maintenance = await verifyPlanCancellationRequirements(
      await selectPlanCancellationOccurrence(review, row.key),
    );
    expect(maintenance.facts.identity).toEqual(entry.target);
    expect(maintenance.blocked_requirements).toContain(
      'PURPOSE_SPECIFIC_CONSENT',
    );
    expect(maintenance.send).toBe(false);
    expect(all.property.read(org).plans).toEqual(plans);
    const currentOwner = await readVerifiedOwnerBriefing(sources, job, gate);
    assertVerifiedOwnerBriefingCurrent(currentOwner);
    all.entries.forEach((e, i) => {
      const current = all.estimates.readSyntheticPrototypeSources(e.target);
      expect(JSON.stringify(current.bundle.version)).toBe(originals[i].issued);
      expect(current.job!.baseline).toEqual(originals[i].baseline);
      expect(JSON.stringify(e.release.read('staff'))).toBe(
        originals[i].release,
      );
      const release = e.release.read('staff');
      for (const k of [
        'release_contracts',
        'release_signatures',
        'release_invoices',
        'release_ledger_entries',
        'release_payment_events',
      ] as const)
        expect(release[k]).toHaveLength(0);
    });
    const foreign = sampleCompanies[(brand + 1) % sampleCompanies.length].id;
    expect(() =>
      all.operations.syntheticIntakeRequest(
        foreign,
        entry.target.customer_id,
        entry.target.location_id,
        entry.intake_request_id,
      ),
    ).toThrow();
  });
});
