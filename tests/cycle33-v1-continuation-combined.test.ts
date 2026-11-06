import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  assertTaskCorrectionReviewCurrent,
  readTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  inspectTaskReceiptReconciliation,
  readTaskReceiptReconciliation,
} from '../src/lib/workflows/task-receipt-reconciliation';
import {
  inspectRecordedCostSource,
  readRecordedCostRequirements,
} from '../src/lib/workflows/recorded-cost-requirements';
import {
  assertPublishedServiceHistory,
  continuePublishedServiceReview,
  inspectPublishedServiceReport,
  publishedServiceContext,
  readPublishedServiceHistory,
} from '../src/lib/workflows/published-service-navigation';
import {
  planCancellationFacts,
  readPlanCancellationReview,
} from '../src/lib/workflows/plan-cancellation-review';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import { checkOwnerActionRequirements } from '../src/lib/workflows/owner-action-verification';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  reviewOperationsExperiments,
  type OperationsExperimentInput,
} from '../src/lib/operations-experiments';
import {
  readSyncAdmissionSource,
  syncSourceReference,
} from '../src/lib/workflows/sync-admission-review';
import {
  reconcileOfflineSourceAdmission,
  reviewOfflineSourceAdmission,
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
});

it.each([0, 1, 2])(
  'brand %i: one original job binds task, cost, history, maintenance, owner and offline review through final navigation revocation',
  async (brand) => {
    const gate = { enabled: true, confirmed: true },
      offlineGate = { enabled: true, confirmed: true },
      sources = await prepareCorrectionPreviewSources(
        sampleCompanies[brand],
        gate,
      ),
      entry = sources.entries[2],
      org = sources.company.id,
      job = entry.target.job_id!,
      remainingOwner = org + '-continuation-review-owner';
    await sources.operations.configure(
      org,
      'active',
      'synthetic',
      {},
      remainingOwner,
    );
    const native = sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ),
      started =
        Math.max(
          ...native.workforce.entries.map((row) =>
            Date.parse(row.ended_at ?? row.started_at),
          ),
        ) + 86400000,
      taskId = await sources.estimates.recordTime(org, entry.worker_id, {
        job_id: job,
        overhead_center: null,
        task: 'Original shared contractor task retained across review modules',
        kind: 'work',
        started_at: new Date(started).toISOString(),
        ended_at: new Date(started + 900000).toISOString(),
        billable: false,
        corrects_id: null,
      });
    if (typeof taskId !== 'string')
      throw Error('Original native recorded task acknowledgment required');
    await sources.estimates.submitTime(org, taskId);
    await sources.estimates.reviewTime(
      org,
      taskId,
      'approved',
      'Explicit local staff evidence only',
    );

    // Every reader below uses this same source environment and exact job.
    // These setup operations belong to the existing canonical fixture owners.
    const canonical = sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ),
      property = sources.property.read(org),
      financial = entry.release.read('staff'),
      writers = [
        vi.spyOn(sources.estimates, 'recordTime'),
        vi.spyOn(sources.estimates, 'submitTime'),
        vi.spyOn(sources.estimates, 'reviewTime'),
        vi.spyOn(sources.estimates, 'submitExpense'),
        vi.spyOn(sources.estimates, 'reviewExpense'),
        vi.spyOn(sources.estimates, 'assignJob'),
        vi.spyOn(sources.property, 'savePlan'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.operations, 'recordConsent'),
        vi.spyOn(entry.release, 'command'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      task = await readTaskCorrectionReview(sources, job, gate, taskId),
      receipt = await readTaskReceiptReconciliation(sources, job, gate),
      finance = await readRecordedCostRequirements(sources, job, gate),
      history = await readPublishedServiceHistory(sources, job, gate),
      maintenance = await readPlanCancellationReview(
        sources,
        job,
        'recurring_maintenance',
        gate,
      ),
      owner = await readVerifiedOwnerBriefing(sources, job, gate),
      identity = {
        organization_id: org,
        customer_id: entry.target.customer_id,
        location_id: entry.target.location_id,
        job_id: job,
      };
    expect(task.view.identity).toMatchObject(identity);
    expect(
      (await assertTaskCorrectionReviewCurrent(task)).source_entry_id,
    ).toBe(taskId);
    expect(task.source.worker_id).toBe(entry.worker_id);
    expect(inspectTaskReceiptReconciliation(receipt)).toMatchObject({
      identity,
      state: 'NOT_ATTEMPTED',
      classification: 'NO_ORIGINAL_CLAIM',
      source_id: null,
      result_id: null,
      replay: 'FORBIDDEN',
      dispatch: false,
      payroll: false,
      financial: false,
    });
    expect(finance.original.original.costs.identity).toMatchObject(identity);
    const requirements = finance.original.rows.filter(
      (row) => row.kind === 'invoice_requirement',
    );
    expect(requirements.length).toBeGreaterThan(1);
    let captures = 0;
    const selector = new Proxy(
      { kind: requirements[0].kind, id: requirements[0].id },
      {
        getOwnPropertyDescriptor(target, key) {
          const d = Reflect.getOwnPropertyDescriptor(target, key),
            row = captures === 0 ? requirements[0] : requirements[1];
          if (key === 'id') captures++;
          return d && (key === 'kind' || key === 'id')
            ? { ...d, value: row[key] }
            : d;
        },
      },
    );
    expect(inspectRecordedCostSource(finance, selector)).toBe(requirements[0]);
    expect(captures).toBe(1);
    expect(finance.invoice_overall).toBe('NO_GO');
    expect(finance.operational_ready).toBe(false);
    expect(publishedServiceContext(history)).toMatchObject(identity);
    const report = inspectPublishedServiceReport(
        history,
        history.reports[0].reference,
      ),
      maintenanceFacts = planCancellationFacts(maintenance);
    expect(history.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(history.customer_acceptance).toBe('UNVERIFIED');
    expect(history.physical_completion).toBe('UNVERIFIED');
    expect(history.delivery).toBe('NOT_SENT');
    expect(maintenanceFacts.identity).toMatchObject(identity);
    expect(maintenanceFacts.send).toBe(false);
    expect(maintenanceFacts.renew).toBe(false);
    expect(maintenanceFacts.consent_mutation).toBe(false);
    expect(maintenanceFacts.native_plan_cancellation).toBe('UNSUPPORTED');
    expect(maintenanceFacts.rows.length).toBeGreaterThan(0);
    expect(
      maintenanceFacts.rows.every((row) => row.renewal_terms === 'UNKNOWN'),
    ).toBe(true);
    expect(owner.original.original.snapshot.identity).toMatchObject(identity);
    const priority = owner.rows.find(
      (row) => row.source.kind === 'finance' && row.source.id === job,
    );
    expect(priority).toBeDefined();
    const selection = {
      key: priority!.key,
      kind: priority!.source.kind,
      id: priority!.source.id,
      revision: priority!.source.revision,
      version: priority!.source.version,
    };
    expect(checkOwnerActionRequirements(owner, selection)).toMatchObject({
      row: priority,
      operational_authority: false,
      authority: 'HUMAN_REVIEW_NAVIGATION_ONLY',
    });

    const work = await readFieldWorkOrders(
        sources.property,
        org,
        entry.target.actor_id,
      ),
      order = work.orders.find((row) => row.source.job_id === job)!,
      visit = order.visits.find((row) => row.id === entry.scheduled_visit_id)!;
    expect(order.source).toMatchObject({ organization_id: org, job_id: job });
    expect(order.customer.id).toBe(identity.customer_id);
    expect(order.baseline_property?.id).toBe(identity.location_id);
    expect(visit).toMatchObject({
      customer_id: identity.customer_id,
      location_id: identity.location_id,
    });
    const proposal: OperationsExperimentInput = {
        day: entry.day,
        timezone: entry.timezone,
        booking: {
          order,
          worker_id: entry.worker_id,
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
          note: 'Original unposted field observation; no completion evidence.',
        },
      },
      experiment = await reviewOperationsExperiments(
        sources.property,
        org,
        entry.target.actor_id,
        proposal,
        gate,
      ),
      offline = await readSyncAdmissionSource(
        sources,
        {
          job_id: job,
          kind: 'offline',
          edition: 'property_services',
          note: 'Same exact authorized source; read-only comparison.',
          review_on: entry.day,
          manual_priority: 'normal',
        },
        gate,
      ),
      original = experiment.offline_capture.source,
      protocol: OfflineSourceProtocol = {
        mode: 'OFFLINE_SOURCE_ADMISSION_V1',
        external_reference: 'cycle33-v1-continuation-review',
        source: syncSourceReference(offline) as OfflineSourceProtocol['source'],
        visit: {
          visit_id: original.visit_id,
          visit_revision: original.visit_revision,
          plan_id: original.plan_id,
          plan_revision: original.plan_revision,
        },
      },
      comparison = await reviewOfflineSourceAdmission(
        offline,
        experiment,
        protocol,
        offlineGate,
      );
    expect(comparison.source).toMatchObject(identity);
    expect(comparison.exact_reference).toBe(true);
    expect(Object.values(comparison.authority).every((value) => !value)).toBe(
      true,
    );
    expect(
      await reconcileOfflineSourceAdmission(
        comparison,
        offline,
        experiment,
        protocol,
        offlineGate,
      ),
    ).toMatchObject({
      status: 'CURRENT_EXACT_READ_ONLY',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
      operational_ready: false,
    });

    // Revocation is real original membership state, triggered during the last
    // caller-owned callback capture. It must not leak the exact job to navigation.
    let callbacksCaptured = 0,
      revoked: Promise<void> | undefined;
    const callback = vi.fn(async () => {}),
      live = new Proxy(
        { current: callback, generation: 0 },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'current' && ++callbacksCaptured === 2)
              revoked = sources.operations.revokeOwner(
                org,
                entry.target.actor_id,
              );
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    await expect(
      continuePublishedServiceReview(history, report, callback, live),
    ).rejects.toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(callback).not.toHaveBeenCalled();
    await expect(assertTaskCorrectionReviewCurrent(task)).rejects.toThrow();
    expect(() => inspectTaskReceiptReconciliation(receipt)).toThrow();
    expect(() =>
      inspectRecordedCostSource(finance, {
        kind: requirements[0].kind,
        id: requirements[0].id,
      }),
    ).toThrow();
    expect(() => assertPublishedServiceHistory(history)).toThrow('UNKNOWN');
    expect(() => planCancellationFacts(maintenance)).toThrow();
    expect(() => checkOwnerActionRequirements(owner, selection)).toThrow();
    expect(
      await reconcileOfflineSourceAdmission(
        comparison,
        offline,
        experiment,
        protocol,
        offlineGate,
      ),
    ).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
      operational_ready: false,
    });
    // A presentation checkbox cannot clear any observed original UNKNOWN hold.
    gate.confirmed = false;
    gate.confirmed = true;
    expect(() => assertPublishedServiceHistory(history)).toThrow('UNKNOWN');
    expect(
      sources.estimates.readSyntheticPrototypeSources({
        ...entry.target,
        actor_id: remainingOwner,
      }),
    ).toEqual(canonical);
    expect(sources.property.read(org)).toEqual(property);
    expect(entry.release.read('staff')).toEqual(financial);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();

    const read = vi.fn(() => {
        throw Error('Unadmitted source must remain private');
      }),
      unopened = new Proxy({}, { get: read });
    await expect(
      readTaskCorrectionReview(unopened as never, job),
    ).rejects.toThrow('OFF');
    await expect(
      readRecordedCostRequirements(unopened as never, job),
    ).rejects.toThrow('OFF');
    await expect(
      readPublishedServiceHistory(unopened as never, job),
    ).rejects.toThrow('OFF');
    await expect(
      readPlanCancellationReview(
        unopened as never,
        job,
        'recurring_maintenance',
      ),
    ).rejects.toThrow('OFF');
    await expect(
      readVerifiedOwnerBriefing(unopened as never, job),
    ).rejects.toThrow('OFF');
    expect(read).not.toHaveBeenCalled();
  },
);
