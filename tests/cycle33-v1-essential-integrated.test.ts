import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  assertTaskCorrectionReviewCurrent,
  readTaskCorrectionReview,
  reconcileTaskCorrectionReview,
  selectTaskCorrectionSource,
} from '../src/lib/workflows/task-correction-review';
import {
  inspectRecordedCostSource,
  readRecordedCostRequirements,
} from '../src/lib/workflows/recorded-cost-requirements';
import {
  assertPublishedServiceHistory,
  publishedServiceContext,
  readPublishedServiceHistory,
} from '../src/lib/workflows/published-service-navigation';
import {
  planCancellationFacts,
  readPlanCancellationReview,
} from '../src/lib/workflows/plan-cancellation-review';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import { checkOwnerActionRequirements } from '../src/lib/workflows/owner-action-verification';
import {
  assertAddonReadinessCurrent,
  navigateAddonReadinessJob,
  openAddonReadinessControls,
  readAddonReadinessGuide,
} from '../src/lib/workflows/addon-readiness-guide';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import { reviewOperationsExperiments } from '../src/lib/operations-experiments';
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
  'brand %i: exact selected task and add-on navigation share the original job and lose all review access on current revocation',
  async (brand) => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareCorrectionPreviewSources(
        sampleCompanies[brand],
        gate,
      ),
      entry = sources.entries[2],
      org = sources.company.id,
      job = entry.target.job_id!,
      remainingOwner = org + '-essential-integrated-remaining-owner';
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
      start =
        Math.max(
          ...native.workforce.entries.map((row) =>
            Date.parse(row.ended_at ?? row.started_at),
          ),
        ) + 86400000,
      taskIds: string[] = [];
    // Explicit setup uses the existing time owner; neither review writes costs.
    for (let index = 0; index < 2; index++) {
      const id = await sources.estimates.recordTime(org, entry.worker_id, {
        job_id: job,
        overhead_center: null,
        task: `Original selected contractor task ${index}`,
        kind: 'work',
        started_at: new Date(start + index * 1800000).toISOString(),
        ended_at: new Date(start + index * 1800000 + 900000).toISOString(),
        billable: false,
        corrects_id: null,
      });
      if (typeof id !== 'string')
        throw Error('Original recorded task acknowledgment required');
      await sources.estimates.submitTime(org, id);
      await sources.estimates.reviewTime(
        org,
        id,
        'approved',
        'Explicit synthetic review only',
      );
      taskIds.push(id);
    }
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
        vi.spyOn(sources.estimates, 'issue'),
        vi.spyOn(sources.estimates, 'assignJob'),
        vi.spyOn(sources.property, 'savePlan'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.operations, 'recordConsent'),
        vi.spyOn(entry.release, 'command'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      initial = await readTaskCorrectionReview(sources, job, gate, taskIds[0]),
      selected = await selectTaskCorrectionSource(initial, taskIds[1]),
      identity = {
        organization_id: org,
        customer_id: entry.target.customer_id,
        location_id: entry.target.location_id,
        job_id: job,
      };
    expect(selected.view).toBe(initial.view);
    expect(selected.view.identity).toMatchObject(identity);
    expect(
      (await assertTaskCorrectionReviewCurrent(selected)).source_entry_id,
    ).toBe(taskIds[1]);
    expect(selected.source.worker_id).toBe(entry.worker_id);
    expect((await reconcileTaskCorrectionReview(selected)).state).toBe(
      'NOT_ATTEMPTED',
    );

    const finance = await readRecordedCostRequirements(sources, job, gate),
      time = inspectRecordedCostSource(finance, {
        kind: 'time',
        id: taskIds[1],
      }),
      history = await readPublishedServiceHistory(sources, job, gate),
      maintenance = await readPlanCancellationReview(
        sources,
        job,
        'recurring_maintenance',
        gate,
      ),
      owner = await readVerifiedOwnerBriefing(sources, job, gate),
      addon = await readAddonReadinessGuide(
        sources,
        { job_id: job, kind: 'offline', edition: 'property_services' },
        gate,
      ),
      reference = openAddonReadinessControls(addon).selection.references.find(
        (row) => row.kind === 'report',
      );
    if (!reference)
      throw Error('Original exact report navigation reference required');
    expect(finance.original.original.costs.identity).toMatchObject(identity);
    expect(time).toMatchObject({
      kind: 'time',
      id: selected.source.source_entry_id,
    });
    expect(
      finance.labor.find((row) => row.entry_id === taskIds[1]),
    ).toMatchObject({
      recorded_review: 'approved',
      requirement: 'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
    });
    expect(finance.invoice_overall).toBe('NO_GO');
    expect(finance.operational_ready).toBe(false);
    expect(publishedServiceContext(history)).toMatchObject(identity);
    expect(history.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(history.customer_acceptance).toBe('UNVERIFIED');
    expect(history.physical_completion).toBe('UNVERIFIED');
    expect(history.delivery).toBe('NOT_SENT');
    const maintenanceFacts = planCancellationFacts(maintenance);
    expect(maintenanceFacts.identity).toMatchObject(identity);
    expect(maintenanceFacts).toMatchObject({
      send: false,
      renew: false,
      consent_mutation: false,
      native_plan_cancellation: 'UNSUPPORTED',
    });
    expect(maintenanceFacts.rows.length).toBeGreaterThan(0);
    expect(
      maintenanceFacts.rows.every((row) => row.renewal_terms === 'UNKNOWN'),
    ).toBe(true);
    expect(owner.original.original.snapshot.identity).toMatchObject(identity);
    const priority = owner.rows.find(
      (row) => row.source.kind === 'finance' && row.source.id === job,
    );
    if (!priority) throw Error('Original source-bound owner priority required');
    const selection = { key: priority.key, ...priority.source };
    expect(checkOwnerActionRequirements(owner, selection)).toMatchObject({
      row: priority,
      operational_authority: false,
      authority: 'HUMAN_REVIEW_NAVIGATION_ONLY',
    });
    expect(addon.source).toMatchObject(identity);
    expect(addon.source.issued_version_id).toBe(entry.target.version_id);
    expect(addon.edition.human_selected_review_context).toBe(
      'property_services',
    );
    const currentNavigation = vi.fn();
    await expect(
      navigateAddonReadinessJob(addon, reference, currentNavigation, {
        current: currentNavigation,
        generation: 0,
      }),
    ).resolves.toBe(job);
    expect(currentNavigation).toHaveBeenCalledExactlyOnceWith(job);

    // The original offline comparison shares this job/visit; it grants no replay.
    const work = await readFieldWorkOrders(
        sources.property,
        org,
        entry.target.actor_id,
      ),
      order = work.orders.find((row) => row.source.job_id === job)!,
      visit = order.visits.find((row) => row.id === entry.scheduled_visit_id)!;
    expect(order.customer.id).toBe(identity.customer_id);
    expect(order.baseline_property?.id).toBe(identity.location_id);
    const experiment = await reviewOperationsExperiments(
        sources.property,
        org,
        entry.target.actor_id,
        {
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
            note: 'Original unposted observation; no completion evidence.',
          },
        },
        gate,
      ),
      offline = await readSyncAdmissionSource(
        sources,
        {
          job_id: job,
          kind: 'offline',
          edition: 'property_services',
          note: 'Exact original source comparison; no synchronization.',
          review_on: entry.day,
          manual_priority: 'normal',
        },
        gate,
      ),
      captured = experiment.offline_capture.source,
      protocol: OfflineSourceProtocol = {
        mode: 'OFFLINE_SOURCE_ADMISSION_V1',
        external_reference: 'cycle33-v1-essential-integrated',
        source: syncSourceReference(offline) as OfflineSourceProtocol['source'],
        visit: {
          visit_id: captured.visit_id,
          visit_revision: captured.visit_revision,
          plan_id: captured.plan_id,
          plan_revision: captured.plan_revision,
        },
      },
      comparison = await reviewOfflineSourceAdmission(
        offline,
        experiment,
        protocol,
        gate,
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
        gate,
      ),
    ).toMatchObject({
      status: 'CURRENT_EXACT_READ_ONLY',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
      operational_ready: false,
    });

    // Revocation happens in the last external callback capture, after all exact
    // source readers opened. Their existing native membership checks must agree.
    let captures = 0,
      revoked: Promise<void> | undefined;
    const deniedNavigation = vi.fn(),
      live = new Proxy(
        { current: deniedNavigation, generation: 1 },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'current' && ++captures === 2)
              revoked = sources.operations.revokeOwner(
                org,
                entry.target.actor_id,
              );
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    await expect(
      navigateAddonReadinessJob(addon, reference, deniedNavigation, live),
    ).rejects.toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(captures).toBe(2);
    expect(deniedNavigation).not.toHaveBeenCalled();
    expect(() => assertAddonReadinessCurrent(addon)).toThrow('UNKNOWN');
    await expect(assertTaskCorrectionReviewCurrent(selected)).rejects.toThrow();
    await expect(
      selectTaskCorrectionSource(selected, taskIds[0]),
    ).rejects.toThrow();
    expect(() =>
      inspectRecordedCostSource(finance, { kind: 'time', id: taskIds[1] }),
    ).toThrow();
    expect(() => assertPublishedServiceHistory(history)).toThrow();
    expect(() => planCancellationFacts(maintenance)).toThrow();
    expect(() => checkOwnerActionRequirements(owner, selection)).toThrow();
    expect(
      await reconcileOfflineSourceAdmission(
        comparison,
        offline,
        experiment,
        protocol,
        gate,
      ),
    ).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
      operational_ready: false,
    });
    gate.confirmed = false;
    gate.confirmed = true;
    expect(() => assertAddonReadinessCurrent(addon)).toThrow('UNKNOWN');
    expect(
      sources.estimates.readSyntheticPrototypeSources({
        ...entry.target,
        actor_id: remainingOwner,
      }),
    ).toEqual(canonical);
    expect(sources.property.read(org)).toEqual(property);
    expect(entry.release.read('staff')).toEqual(financial);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  },
);
