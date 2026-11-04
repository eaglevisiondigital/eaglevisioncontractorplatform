import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  taskReceiptControlsDestination,
} from '../src/lib/workflows/task-receipt-reconciliation';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import {
  validateCostCoverageAction,
  filterCostCoverageActionSources,
  type CostCoverageActionInput,
} from '../src/lib/workflows/cost-coverage-actions';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  readServiceRequestEvidence,
  inspectServiceRequestEvidence,
  inspectServiceRequestReport,
  saveServiceRequestAction,
  reconcileServiceRequestAction,
} from '../src/lib/workflows/service-request-actions';
import {
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
} from '../src/lib/workflows/verified-owner-briefing';
import {
  compareOwnerActionRefresh,
  verifyOwnerActionRequirements,
  type OwnerActionSelection,
} from '../src/lib/workflows/owner-action-verification';
import {
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
  planCancellationOccurrenceFacts,
  verifyPlanCancellationRequirements,
  preparePlanCancellationReview,
  closePlanCancellationReview,
  reconcilePlanCancellationReview,
} from '../src/lib/workflows/plan-cancellation-review';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import { reviewOperationsExperiments } from '../src/lib/operations-experiments';
import {
  readSyncAdmissionSource,
  syncSourceReference,
} from '../src/lib/workflows/sync-admission-review';
import {
  reviewOfflineSourceAdmission,
  reconcileOfflineSourceAdmission,
  type OfflineSourceProtocol,
} from '../src/lib/workflows/offline-source-admission';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0, index = 2) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
    entry = all.entries[index],
    sources = { ...all, entries: [entry] },
    org = all.company.id,
    job = entry.target.job_id!;
  const task = await readTaskCorrectionReview(sources, job, gate);
  return { gate, all, entry, sources, org, job, task };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Costs = Awaited<ReturnType<typeof readRecordedCostRequirements>>;
function costInput(
  view: Costs,
  kind: CostCoverageActionInput['kind'],
  id?: string,
): CostCoverageActionInput {
  const row = view.original.rows.find(
    (r) => r.kind === kind && (!id || r.id === id),
  );
  if (!row) throw Error('Exact native source required by integration case');
  return {
    kind,
    id: row.id,
    expected_job_revision: view.original.original.costs.evidence.job_revision,
    purpose:
      kind === 'invoice_requirement' ? 'invoice_preparation' : 'cost_review',
  };
}
function ownerInput(
  view: Awaited<ReturnType<typeof readVerifiedOwnerBriefing>>,
): OwnerActionSelection {
  const row = view.rows.find(
    (r) =>
      r.source.kind === 'finance' && r.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
  );
  if (!row)
    throw Error('Exact native finance priority required by integration case');
  return { key: row.key, ...row.source };
}
async function service(f: Fixture) {
  const view = await readServiceRequestActions(f.sources, f.job, f.gate),
    expected = inspectServiceRequestActions(view),
    evidence = await readServiceRequestEvidence(
      view,
      f.sources,
      f.job,
      expected,
      f.gate,
    );
  return { view, expected, evidence };
}
async function maintenance(f: Fixture) {
  const review = await readPlanCancellationReview(
    f.sources,
    f.job,
    'recurring_maintenance',
    f.gate,
  );
  const row = review.desk.rows.find(
    (r) => r.plan_reference.id === f.entry.plan_id,
  );
  if (!row)
    throw Error(
      'Existing explicit native plan occurrence required by integration case',
    );
  return {
    review,
    row,
    selected: await selectPlanCancellationOccurrence(review, row.key),
  };
}
async function offline(f: Fixture) {
  const field = await readFieldWorkOrders(
      f.sources.property,
      f.org,
      f.entry.target.actor_id,
    ),
    order = field.orders.find((o) => o.source.job_id === f.job);
  if (!order) throw Error('Exact native work order required');
  const visit = order.visits.find((v) => v.id === f.entry.scheduled_visit_id);
  if (!visit) throw Error('Exact native visit required');
  const experiment = await reviewOperationsExperiments(
    f.sources.property,
    f.org,
    f.entry.target.actor_id,
    {
      day: f.entry.day,
      timezone: f.entry.timezone,
      booking: {
        order,
        worker_id: f.entry.worker_id,
        visit_id: visit.id,
        start: null,
        end: null,
      },
      other_windows: [],
      proposed_hours: [],
      route: [{ order, visit_id: visit.id }],
      capture: {
        order,
        visit_id: visit.id,
        note: 'Untrusted local integration observation; no work completion.',
      },
    },
    f.gate,
  );
  const requirements = await readSyncAdmissionSource(
    f.sources,
    {
      job_id: f.job,
      kind: 'offline',
      edition: 'property_services',
      note: 'Source-only isolated protocol review',
      review_on: f.entry.day,
      manual_priority: 'normal',
    },
    f.gate,
  );
  const source = experiment.offline_capture.source;
  const input: OfflineSourceProtocol = {
    mode: 'OFFLINE_SOURCE_ADMISSION_V1',
    external_reference: 'cycle25-combined-source',
    source: syncSourceReference(
      requirements,
    ) as OfflineSourceProtocol['source'],
    visit: {
      visit_id: source.visit_id!,
      visit_revision: source.visit_revision!,
      plan_id: source.plan_id!,
      plan_revision: source.plan_revision!,
    },
  };
  const comparison = await reviewOfflineSourceAdmission(
    requirements,
    experiment,
    input,
    f.gate,
  );
  return { experiment, requirements, input, comparison };
}
async function bundle(f: Fixture) {
  const [task, costs, request, growth, owner, advanced] = await Promise.all([
    readTaskReceiptContinuity(f.sources, f.job, f.gate),
    readRecordedCostRequirements(f.sources, f.job, f.gate),
    service(f),
    maintenance(f),
    readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
    offline(f),
  ]);
  return { task, costs, request, growth, owner, advanced };
}
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
}
const reconcileOffline = (
  f: Fixture,
  value: Awaited<ReturnType<typeof offline>>,
  input: unknown = value.input,
) =>
  reconcileOfflineSourceAdmission(
    value.comparison,
    value.requirements,
    value.experiment,
    input,
    f.gate,
  );

describe('Cycle25 combined canonical workflow acceptance', () => {
  it.each([0, 1, 2])(
    'brand %i native task → cost review → service evidence → maintenance → owner → offline retains exact identities',
    async (brand) => {
      const f = await fixture(brand),
        baseline = f.sources.estimates.syntheticJob(f.org, f.job)!.baseline,
        issued = JSON.stringify(
          f.sources.estimates.readSyntheticPrototypeSources(f.entry.target)
            .bundle.version,
        ),
        reports = f.sources.property.read(f.org).reports,
        release = f.entry.release.read('staff');
      expect(
        f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).bundle
          .version.id,
      ).toBe(f.entry.target.version_id);
      const beforeOwner = await readVerifiedOwnerBriefing(
          f.sources,
          f.job,
          f.gate,
        ),
        selection = ownerInput(beforeOwner);
      await saveTaskCorrectionReview(
        f.task,
        {
          source_entry_id: f.task.source.source_entry_id,
          task: 'Explicit combined technician correction',
          started_at: f.task.source.started_at,
          ended_at: f.task.source.ended_at,
          billable: !f.task.source.billable,
        },
        true,
      );
      const task = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
        receipt = inspectTaskReceiptContinuity(task).receipt;
      expect(receipt.state).toBe('KNOWN_SAVED');
      expect(receipt.native_stage).toBe('APPROVED');
      expect(receipt.identity).toEqual(f.entry.target);
      expect(receipt.result_id).toBeTruthy();
      const successor = inspectTaskReceiptTask(task, receipt.result_id!);
      expect(successor.receipt_role).toBe('EXACT_RECEIPT_RESULT');
      expect(successor.task.corrects_id).toBe(f.task.source.source_entry_id);
      expect(successor.assigned_worker.worker_id).toBe(f.entry.worker_id);
      expect(successor.durable_receipt).toBe('NOT_IMPLEMENTED');
      expect(successor.physical_completion).toBe('UNVERIFIED');
      await expect(
        taskReceiptControlsDestination(task, successor.task.id),
      ).rejects.toThrow();
      const beforeCost = await readRecordedCostRequirements(
          f.sources,
          f.job,
          f.gate,
        ),
        expenseId = beforeCost.original.original.material.expense_id!;
      await confirmCostCorrectionReview(
        beforeCost.original.original,
        {
          expense_id: expenseId,
          decision: 'approved',
          reason: 'Explicit source-bound local staff review',
        },
        true,
      );
      expect(() =>
        validateCostCoverageAction(
          beforeCost,
          costInput(beforeCost, 'material', expenseId),
        ),
      ).toThrow();
      const costs = await readRecordedCostRequirements(
          f.sources,
          f.job,
          f.gate,
        ),
        material = validateCostCoverageAction(
          costs,
          costInput(costs, 'material', expenseId),
        ),
        time = validateCostCoverageAction(
          costs,
          costInput(costs, 'time', successor.task.id),
        ),
        rawJob = f.sources.estimates.syntheticJob(f.org, f.job)!;
      expect(material.recorded_source.identity).toEqual(f.entry.target);
      expect(material.recorded_source.review_events.map((r) => r.id)).toEqual(
        rawJob.events
          .filter((r) => r.submission_id === expenseId)
          .map((r) => r.id),
      );
      expect(material.canonical_totals.categories).toEqual(
        jobFinancials(rawJob).categories,
      );
      expect(material.canonical_totals.projected_profit_minor).toBe(
        jobFinancials(rawJob).projected_profit_minor,
      );
      expect(time.recorded_source.time?.corrects_id).toBe(receipt.source_id);
      expect(time.labor?.requirement).toBe(
        'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
      );
      expect(material.invoice_overall).toBe('NO_GO');
      expect(material.invoice_prepared).toBe(false);
      expect(material.recorded_source.durable_receipt).toBe(
        'UNVERIFIED_NO_OPERATIONAL_CUSTODY',
      );
      const owner = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
        refreshed = compareOwnerActionRefresh(beforeOwner, owner, selection);
      expect(refreshed.status).toBe('SOURCE_CHANGED_RESELECT_REQUIRED');
      expect(refreshed.selection).toBeNull();
      expect(refreshed.requires_verification).toBe(true);
      expect(
        refreshed.comparison.rows
          .find((r) => r.key === selection.key)
          ?.facts.join(' '),
      ).toContain('NO_GO');
      const request = await service(f),
        lineage = inspectServiceRequestEvidence(
          request.view,
          request.evidence,
          request.expected,
        ),
        reference = lineage.reports[0].reference,
        published = await inspectServiceRequestReport(
          request.view,
          request.evidence,
          request.expected,
          reference,
        );
      expect(lineage.property).toMatchObject({
        organization_id: f.org,
        customer_id: f.entry.target.customer_id,
        location_id: f.entry.target.location_id,
      });
      expect(lineage.scope).toMatchObject({
        job_id: f.job,
        estimate_id: f.entry.target.estimate_id,
        issued_version_id: f.entry.target.version_id,
      });
      expect(lineage.request.id).toBe(f.entry.intake_request_id);
      expect(lineage.request_job_link).toBe(
        'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
      );
      expect(lineage.required_proof.every((r) => r.status === 'UNKNOWN')).toBe(
        true,
      );
      expect(lineage.customer_acceptance).toBe('UNKNOWN');
      expect(published.report.reference).toEqual(reference);
      expect(published.completion?.job.reference.job_id).toBe(f.job);
      expect(published.completion?.interpretation.physical_completion).toBe(
        'UNVERIFIED',
      );
      expect(JSON.stringify(published)).not.toMatch(
        /unit_cost|cash_hour|margin|supplier|deduction/,
      );
      await saveServiceRequestAction(
        request.view,
        {
          request_id: request.expected.request_id,
          status: 'reviewing',
          assigned_to: null,
          expected_status: request.expected.status,
          expected_assigned_to: request.expected.assigned_to,
          expected_updated_at: request.expected.updated_at,
        },
        true,
      );
      expect(await reconcileServiceRequestAction(request.view)).toMatchObject({
        state: 'KNOWN_SAVED',
        observed: 'EXACT_CURRENT_ROW_OBSERVED',
        native_cas: false,
        durable_receipt: false,
        attribution: 'CURRENT_ROW_OBSERVATION_ONLY',
      });
      const growth = await maintenance(f),
        planBefore = f.sources.property.read(f.org).plans,
        verified = await verifyPlanCancellationRequirements(growth.selected);
      expect(verified.facts.identity).toEqual(f.entry.target);
      expect(verified.facts.plan.id).toBe(f.entry.plan_id);
      expect(verified.facts.requested_purpose).toBe('recurring_maintenance');
      expect(verified.blocked_requirements).toContain(
        'PURPOSE_SPECIFIC_CONSENT',
      );
      expect(verified.facts.renewal_terms).toBe('UNKNOWN');
      expect(verified.send).toBe(false);
      await preparePlanCancellationReview(
        growth.selected,
        { proposed_on: growth.row.recorded_due_on, plan_kind: 'follow_up' },
        true,
      );
      await closePlanCancellationReview(growth.selected, 'CANCEL', true);
      expect(
        await reconcilePlanCancellationReview(growth.selected),
      ).toMatchObject({
        status: 'CANCELLED_LOCAL_REVIEW',
        native_plan_cancellation: 'UNSUPPORTED',
        plan_mutation_performed: false,
        consent_mutation: false,
      });
      expect(f.sources.property.read(f.org).plans).toEqual(planBefore);
      const advanced = await offline(f),
        jobsBefore = await f.sources.estimates.jobs(f.org),
        propertyBefore = f.sources.property.read(f.org),
        writers = [
          vi.spyOn(f.sources.estimates, 'recordTime'),
          vi.spyOn(f.sources.estimates, 'reviewExpense'),
          vi.spyOn(f.sources.operations, 'assignIntake'),
          vi.spyOn(f.sources.property, 'saveVisit'),
          vi.spyOn(f.sources.property, 'publish'),
        ];
      expect(advanced.input.source).toMatchObject({
        organization_id: f.org,
        customer_id: f.entry.target.customer_id,
        location_id: f.entry.target.location_id,
        job_id: f.job,
        estimate_id: f.entry.target.estimate_id,
        issued_version_id: f.entry.target.version_id,
      });
      expect(advanced.input.visit).toMatchObject({
        plan_id: f.entry.plan_id,
        visit_id: f.entry.scheduled_visit_id,
      });
      expect(await reconcileOffline(f, advanced)).toMatchObject({
        status: 'CURRENT_EXACT_READ_ONLY',
        replay: 'FORBIDDEN',
        replacement: null,
        durable_receipt: false,
        operational_ready: false,
      });
      expect(writers.every((writer) => writer.mock.calls.length === 0)).toBe(
        true,
      );
      expect(f.sources.property.read(f.org)).toEqual(propertyBefore);
      expect(await f.sources.estimates.jobs(f.org)).toEqual(jobsBefore);
      expect(rawJob.baseline).toEqual(baseline);
      expect(
        JSON.stringify(
          f.sources.estimates.readSyntheticPrototypeSources(f.entry.target)
            .bundle.version,
        ),
      ).toBe(issued);
      expect(f.sources.property.read(f.org).reports).toEqual(reports);
      expect(f.entry.release.read('staff')).toEqual(release);
    },
  );
  it.each([0, 1, 2])(
    'brand %i revoked reviewer loses every retained module source and no callback/writer runs',
    async (brand) => {
      const f = await fixture(brand),
        b = await bundle(f),
        id = f.task.source.source_entry_id,
        selection = ownerInput(b.owner),
        source = costInput(b.costs, 'time', id),
        writes = [
          vi.spyOn(f.sources.estimates, 'recordTime'),
          vi.spyOn(f.sources.estimates, 'reviewExpense'),
          vi.spyOn(f.sources.operations, 'assignIntake'),
          vi.spyOn(f.sources.property, 'savePlan'),
        ];
      revoke(f);
      expect(() => inspectTaskReceiptTask(b.task, id)).toThrow();
      expect(() => validateCostCoverageAction(b.costs, source)).toThrow();
      expect(() =>
        inspectServiceRequestEvidence(
          b.request.view,
          b.request.evidence,
          b.request.expected,
        ),
      ).toThrow();
      await expect(
        verifyPlanCancellationRequirements(b.growth.selected),
      ).rejects.toThrow();
      await expect(
        verifyOwnerActionRequirements(b.owner, selection),
      ).rejects.toThrow();
      expect(await reconcileOffline(f, b.advanced)).toMatchObject({
        status: 'UNKNOWN',
        durable_receipt: false,
        replacement: null,
        replay: 'FORBIDDEN',
      });
      expect(writes.every((writer) => writer.mock.calls.length === 0)).toBe(
        true,
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i native plan revision invalidates retained cross-module sources without newest-source substitution',
    async (brand) => {
      const f = await fixture(brand),
        b = await bundle(f),
        plan = f.sources.property
          .read(f.org)
          .plans.find((p) => p.id === f.entry.plan_id)!,
        oldSource = JSON.stringify(b.advanced.input);
      f.sources.property.savePlan(f.org, {
        ...plan,
        name: 'Explicit newer native plan revision',
      });
      expect(() =>
        inspectTaskReceiptTask(b.task, f.task.source.source_entry_id),
      ).toThrow();
      expect(() =>
        filterCostCoverageActionSources(b.costs, { query: '', kind: 'all' }),
      ).toThrow();
      expect(() =>
        inspectServiceRequestEvidence(
          b.request.view,
          b.request.evidence,
          b.request.expected,
        ),
      ).toThrow();
      expect(() =>
        planCancellationOccurrenceFacts(b.growth.selected),
      ).toThrow();
      expect(() => assertVerifiedOwnerBriefingCurrent(b.owner)).toThrow();
      expect(await reconcileOffline(f, b.advanced)).toMatchObject({
        status: 'UNKNOWN',
        replacement: null,
        replay: 'FORBIDDEN',
      });
      expect(JSON.stringify(b.advanced.input)).toBe(oldSource);
    },
  );
  it('same-property sibling job cannot stand in for original service scope, finance source or priority history', async () => {
    const f = await fixture(0, 0),
      siblingEntry = f.all.entries[3];
    expect(siblingEntry.target.location_id).toBe(f.entry.target.location_id);
    expect(siblingEntry.target.job_id).not.toBe(f.job);
    const sibling = {
        ...f,
        entry: siblingEntry,
        sources: { ...f.all, entries: [siblingEntry] },
        job: siblingEntry.target.job_id!,
      },
      [request, otherRequest, costs, otherCosts, owner, otherOwner] =
        await Promise.all([
          service(f),
          service(sibling),
          readRecordedCostRequirements(f.sources, f.job, f.gate),
          readRecordedCostRequirements(
            sibling.sources,
            sibling.job,
            sibling.gate,
          ),
          readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
          readVerifiedOwnerBriefing(sibling.sources, sibling.job, sibling.gate),
        ]);
    expect(() =>
      inspectServiceRequestEvidence(
        request.view,
        otherRequest.evidence,
        request.expected,
      ),
    ).toThrow();
    expect(() =>
      validateCostCoverageAction(costs, {
        ...costInput(otherCosts, 'time'),
        expected_job_revision:
          costs.original.original.costs.evidence.job_revision,
      }),
    ).toThrow();
    expect(() =>
      compareOwnerActionRefresh(owner, otherOwner, ownerInput(owner)),
    ).toThrow();
    expect(
      inspectServiceRequestEvidence(
        request.view,
        request.evidence,
        request.expected,
      ).request_job_link,
    ).toBe('UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT');
  });
  it('foreign company records cannot join retained task, cost, service, consent or offline evidence', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      b = await bundle(f),
      other = await bundle(foreign);
    expect(() =>
      inspectTaskReceiptContinuity({ ...b.task, order: other.task.order }),
    ).toThrow();
    expect(() =>
      validateCostCoverageAction(b.costs, {
        ...costInput(other.costs, 'material'),
        expected_job_revision:
          b.costs.original.original.costs.evidence.job_revision,
      }),
    ).toThrow();
    expect(() =>
      inspectServiceRequestEvidence(
        b.request.view,
        other.request.evidence,
        b.request.expected,
      ),
    ).toThrow();
    expect(() =>
      planCancellationOccurrenceFacts({
        ...b.growth.selected,
        selection: other.growth.selected.selection,
      }),
    ).toThrow();
    expect(() =>
      compareOwnerActionRefresh(b.owner, other.owner, ownerInput(b.owner)),
    ).toThrow();
    expect(
      await reconcileOffline(f, b.advanced, other.advanced.input),
    ).toMatchObject({
      status: 'UNKNOWN',
      replacement: null,
      durable_receipt: false,
    });
    expect(await reconcileOffline(f, b.advanced)).toMatchObject({
      status: 'CURRENT_EXACT_READ_ONLY',
    });
  });
  it('exact field UNKNOWN with an observed native successor never permits fresh-wrapper retry or financial attribution', async () => {
    const f = await fixture(),
      original = f.sources.estimates.recordTime.bind(f.sources.estimates),
      writer = vi
        .spyOn(f.sources.estimates, 'recordTime')
        .mockImplementation(async (...args) => {
          await original(...args);
          throw Error('Lost exact native acknowledgment');
        });
    const input = {
      source_entry_id: f.task.source.source_entry_id,
      task: 'Ambiguous native correction',
      started_at: f.task.source.started_at,
      ended_at: f.task.source.ended_at,
      billable: !f.task.source.billable,
    };
    await expect(saveTaskCorrectionReview(f.task, input, true)).rejects.toThrow(
      'Lost exact native acknowledgment',
    );
    const task = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      receipt = inspectTaskReceiptContinuity(task).receipt;
    expect(receipt.state).toBe('UNKNOWN');
    expect(receipt.classification).toBe('UNACKNOWLEDGED_SUCCESSOR');
    expect(receipt.result_id).toBeNull();
    expect(receipt.counts.successor_rows).toBe(1);
    expect(receipt.replay).toBe('FORBIDDEN');
    const native = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      successor = native.workforce.entries.find(
        (row) => row.corrects_id === input.source_entry_id,
      )!;
    expect(successor).toBeTruthy();
    expect(inspectTaskReceiptTask(task, successor.id).receipt_role).not.toBe(
      'EXACT_RECEIPT_RESULT',
    );
    const costs = await readRecordedCostRequirements(f.sources, f.job, f.gate),
      cost = validateCostCoverageAction(
        costs,
        costInput(costs, 'time', successor.id),
      );
    expect(cost.labor?.requirement).toBe(
      'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
    );
    expect(cost.recorded_source.durable_receipt).toBe(
      'UNVERIFIED_NO_OPERATIONAL_CUSTODY',
    );
    expect(cost.invoice_prepared).toBe(false);
    await expect(
      saveTaskCorrectionReview(f.task, input, true),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
  });
  it('concurrent same-original task corrections append one native successor and no new command owner', async () => {
    const f = await fixture(),
      writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      input = {
        source_entry_id: f.task.source.source_entry_id,
        task: 'One exact correction under competing reviews',
        started_at: f.task.source.started_at,
        ended_at: f.task.source.ended_at,
        billable: !f.task.source.billable,
      };
    const outcomes = await Promise.allSettled([
      saveTaskCorrectionReview(f.task, input, true),
      saveTaskCorrectionReview(f.task, input, true),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(writer).toHaveBeenCalledTimes(1);
    const task = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      receipt = inspectTaskReceiptContinuity(task).receipt;
    expect(receipt.state).toBe('KNOWN_SAVED');
    expect(receipt.counts.successor_rows).toBe(1);
    expect(receipt.counts.result_reviews).toBe(1);
  });
  it.each(['development-off', 'non-loopback', 'production'] as const)(
    '%s denies all module readers before hostile sources are accessed',
    async (mode) => {
      const getter = vi.fn(() => {
          throw Error('Hostile source read');
        }),
        sources = Object.defineProperty({}, 'entries', {
          get: getter,
        }) as Fixture['sources'],
        gate = { enabled: mode !== 'development-off', confirmed: true };
      if (mode === 'non-loopback')
        vi.stubGlobal('window', {
          location: { hostname: 'example.com', protocol: 'https:' },
        });
      if (mode === 'production') vi.stubEnv('DEV', false);
      await expect(
        readTaskReceiptContinuity(sources, 'foreign', gate),
      ).rejects.toThrow();
      await expect(
        readRecordedCostRequirements(sources, 'foreign', gate),
      ).rejects.toThrow();
      await expect(
        readServiceRequestActions(sources, 'foreign', gate),
      ).rejects.toThrow();
      await expect(
        readPlanCancellationReview(
          sources,
          'foreign',
          'recurring_maintenance',
          gate,
        ),
      ).rejects.toThrow();
      await expect(
        readVerifiedOwnerBriefing(sources, 'foreign', gate),
      ).rejects.toThrow();
      await expect(
        reviewOfflineSourceAdmission(
          sources as never,
          sources as never,
          sources,
          gate,
        ),
      ).rejects.toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
});
