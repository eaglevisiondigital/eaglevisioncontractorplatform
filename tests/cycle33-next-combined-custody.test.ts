import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import { reviewOperationsExperiments } from '../src/lib/operations-experiments';
import {
  readSyncAdmissionSource,
  syncSourceReference,
} from '../src/lib/workflows/sync-admission-review';
import {
  readMaintenancePlanCorrectionReview,
  maintenancePlanRenewalReview,
} from '../src/lib/workflows/maintenance-plan-correction';
import {
  reviewOfflineSourceAdmission,
  reconcileOfflineSourceAdmission,
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

for (const brand of [0, 1, 2])
  it(`brand ${brand}: shared current authority fences distinct original jobs without changing canonical records`, async () => {
    const gate = { enabled: true, confirmed: true },
      reviewGate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(sampleCompanies[brand], gate),
      field = sources.entries[0],
      maintenance = sources.entries[2],
      org = sources.company.id,
      orders = await readFieldWorkOrders(
        sources.property,
        org,
        field.target.actor_id,
      ),
      order = orders.orders.find(
        (o) => o.source.job_id === field.target.job_id,
      )!,
      visit = order.visits.find((v) => v.id === field.scheduled_visit_id)!,
      experiment = await reviewOperationsExperiments(
        sources.property,
        org,
        field.target.actor_id,
        {
          day: field.day,
          timezone: field.timezone,
          booking: {
            order,
            worker_id: field.worker_id,
            visit_id: visit.id,
            start: null,
            end: null,
          },
          other_windows: [],
          proposed_hours: [],
          route: [{ order, visit_id: visit.id }],
          capture: { order, visit_id: visit.id, note: 'Unsaved review only.' },
        },
        gate,
      ),
      requirements = await readSyncAdmissionSource(
        sources,
        {
          job_id: field.target.job_id!,
          kind: 'offline',
          edition: 'property_services',
          note: 'Original read-only reference comparison.',
          review_on: field.day,
          manual_priority: 'normal',
        },
        gate,
      ),
      source = syncSourceReference(requirements),
      native = experiment.offline_capture.source,
      protocol = {
        mode: 'OFFLINE_SOURCE_ADMISSION_V1',
        external_reference: 'synthetic-original-multi-job-reference',
        source,
        visit: {
          visit_id: native.visit_id,
          visit_revision: native.visit_revision,
          plan_id: native.plan_id,
          plan_revision: native.plan_revision,
        },
      },
      before = sources.property.read(org),
      jobs = await sources.estimates.jobs(org),
      ledger = field.release.read('staff'),
      writers = [
        vi.spyOn(sources.property, 'savePlan'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.estimates, 'recordTime'),
      ],
      planReview = await readMaintenancePlanCorrectionReview(
        sources,
        maintenance.target.job_id!,
        gate,
      ),
      renewal = maintenancePlanRenewalReview(planReview),
      comparison = await reviewOfflineSourceAdmission(
        requirements,
        experiment,
        protocol,
        reviewGate,
      );

    expect(field.target.job_id).not.toBe(maintenance.target.job_id);
    expect(field.target.organization_id).toBe(org);
    expect(maintenance.target.organization_id).toBe(org);
    expect(comparison.source).toEqual(source);
    expect(comparison.exact_reference).toBe(true);
    expect(renewal.plan_id).toBe(planReview.source.plan_id);
    expect(renewal).toMatchObject({ send: false, renew: false });

    reviewGate.confirmed = false;
    await expect(
      reconcileOfflineSourceAdmission(
        comparison,
        requirements,
        experiment,
        protocol,
        reviewGate,
      ),
    ).resolves.toEqual({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      operational_ready: false,
      durable_receipt: false,
      reason: 'LOCAL_REVIEW_NOT_ADMITTED',
    });
    // One review's withdrawal neither changes the other job nor grants authority.
    expect(maintenancePlanRenewalReview(planReview)).toEqual(renewal);

    const members = sources.operations.syntheticMemberships.bind(
      sources.operations,
    );
    vi.spyOn(sources.operations, 'syntheticMemberships').mockImplementation(
      (company) =>
        members(company).map((m) =>
          m.user_id === field.target.actor_id ? { ...m, active: false } : m,
        ),
    );
    reviewGate.confirmed = true;
    expect(() => maintenancePlanRenewalReview(planReview)).toThrow();
    await expect(
      reconcileOfflineSourceAdmission(
        comparison,
        requirements,
        experiment,
        protocol,
        reviewGate,
      ),
    ).resolves.toEqual({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      operational_ready: false,
      durable_receipt: false,
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
    });
    expect(sources.property.read(org)).toEqual(before);
    expect(await sources.estimates.jobs(org)).toEqual(jobs);
    expect(field.release.read('staff')).toEqual(ledger);
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
  });
