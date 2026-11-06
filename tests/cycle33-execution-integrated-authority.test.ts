import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskReceiptContinuity,
  inspectTaskReceiptContinuity,
} from '../src/lib/workflows/task-receipt-reconciliation';
import {
  readCostCoveragePath,
  inspectCostCoverageSource,
} from '../src/lib/workflows/cost-coverage-path';
import {
  readServiceSourceReview,
  readServiceSourceLineage,
} from '../src/lib/workflows/service-source-review';
import {
  readPrioritySavedRevision,
  comparePrioritySavedRevisions,
  filterPrioritySavedRevisions,
} from '../src/lib/workflows/priority-saved-revisions';
import {
  readMaintenancePlanCorrectionReview,
  maintenancePlanRenewalReview,
} from '../src/lib/workflows/maintenance-plan-correction';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
for (const brand of [0, 1, 2])
  it(`brand ${brand}: one canonical environment retains cross-module identities and all readers deny actual revocation`, async () => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(sampleCompanies[brand], gate),
      entry = sources.entries[0],
      org = sources.company.id,
      job = entry.target.job_id!;
    await sources.operations.configure(
      org,
      'active',
      'synthetic',
      {},
      org + '-independent-remaining-owner',
    );
    const field = await readTaskReceiptContinuity(sources, job, gate),
      finance = await readCostCoveragePath(sources, job, gate),
      customer = await readServiceSourceReview(
        sources,
        { job_id: job, staff_context_confirmed: true },
        gate,
      ),
      before = await readPrioritySavedRevision(sources, job, gate),
      current = await readPrioritySavedRevision(sources, job, gate),
      owner = comparePrioritySavedRevisions(before, current),
      maintenance = await readMaintenancePlanCorrectionReview(
        sources,
        sources.entries[2].target.job_id!,
        gate,
      );
    const state = sources.estimates.readSyntheticPrototypeSources(entry.target),
      property = sources.property.read(org),
      jobs = await sources.estimates.jobs(org),
      ledger = entry.release.read('staff'),
      writers = [
        vi.spyOn(sources.property, 'savePlan'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.estimates, 'recordTime'),
      ];
    const task = inspectTaskReceiptContinuity(field),
      cost = finance.rows.find((row) => row.kind === 'invoice_requirement')!,
      lineage = readServiceSourceLineage(customer),
      renewal = maintenancePlanRenewalReview(maintenance);
    expect(field.graph.identity).toEqual(field.receipt.view.identity);
    expect(field.graph.identity.job_id).toBe(job);
    expect(task.receipt).toBe(field.receipt.receipt);
    expect(
      inspectCostCoverageSource(finance, { kind: cost.kind, id: cost.id }),
    ).toBe(cost);
    expect(lineage.scope.job_id).toBe(job);
    expect(lineage.reports.every((report) => report.job_id === job)).toBe(true);
    expect(lineage).toMatchObject({
      history_completeness: 'UNKNOWN',
      authority: 'READ_ONLY_SOURCE_REVIEW_NOT_COMPLETION_OR_ACCEPTANCE',
    });
    expect(
      filterPrioritySavedRevisions(owner, {
        query: '',
        area: 'all',
        changed_only: false,
      }).available,
    ).toBe(owner.rows.length);
    expect(renewal).toMatchObject({ send: false, renew: false });
    await sources.operations.revokeOwner(org, entry.target.actor_id);
    expect(() => inspectTaskReceiptContinuity(field)).toThrow();
    expect(() =>
      inspectCostCoverageSource(finance, { kind: cost.kind, id: cost.id }),
    ).toThrow();
    expect(() => readServiceSourceLineage(customer)).toThrow();
    expect(() =>
      filterPrioritySavedRevisions(owner, {
        query: '',
        area: 'all',
        changed_only: false,
      }),
    ).toThrow();
    expect(() => maintenancePlanRenewalReview(maintenance)).toThrow();
    expect(() =>
      sources.estimates.readSyntheticPrototypeSources(entry.target),
    ).toThrow('Current synthetic owner/admin required');
    expect(
      sources.estimates.readSyntheticPrototypeSources({
        ...entry.target,
        actor_id: org + '-independent-remaining-owner',
      }),
    ).toEqual(state);
    expect(sources.property.read(org)).toEqual(property);
    expect(await sources.estimates.jobs(org)).toEqual(jobs);
    expect(entry.release.read('staff')).toEqual(ledger);
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
  });
