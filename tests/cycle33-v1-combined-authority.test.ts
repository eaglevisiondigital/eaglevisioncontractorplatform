import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readTaskCorrectionReview,
  assertTaskCorrectionDisplayCurrent,
} from '../src/lib/workflows/task-correction-review';
import {
  readCostCoveragePath,
  inspectCostCoverageSource,
  continueCostCoverageSource,
} from '../src/lib/workflows/cost-coverage-path';
import {
  readPublishedServiceHistory,
  publishedServiceContext,
  filterPublishedServiceHistory,
  inspectPublishedServiceReport,
  continuePublishedServiceReview,
} from '../src/lib/workflows/published-service-navigation';
import {
  readPlanCancellationReview,
  planCancellationFacts,
} from '../src/lib/workflows/plan-cancellation-review';
import {
  readAddonReadinessJobs,
  filterAddonReadinessJobs,
} from '../src/lib/workflows/addon-readiness-guide';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import { checkOwnerActionRequirements } from '../src/lib/workflows/owner-action-verification';

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
  'brand %i: one canonical job retains exact private source continuity and every review denies shared native revocation',
  async (brand) => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareCorrectionPreviewSources(
        sampleCompanies[brand],
        gate,
      ),
      entry = sources.entries[2],
      org = sources.company.id,
      remainingOwner = org + '-combined-remaining-owner',
      job = entry.target.job_id!;
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
          ...native.workforce.entries.map((time) =>
            Date.parse(time.ended_at ?? time.started_at),
          ),
        ) + 86400000,
      timeId = await sources.estimates.recordTime(org, entry.worker_id, {
        job_id: job,
        overhead_center: null,
        task: 'Exact shared canonical technician source',
        kind: 'break_paid',
        started_at: new Date(started).toISOString(),
        ended_at: new Date(started + 900000).toISOString(),
        billable: false,
        corrects_id: null,
      });
    if (typeof timeId !== 'string')
      throw Error('Exact original recorded time acknowledgment required');
    await sources.estimates.submitTime(org, timeId);
    await sources.estimates.reviewTime(
      org,
      timeId,
      'approved',
      'Explicit local staff evidence only',
    );

    // All setup is through existing fixture/command owners, before these reads.
    // The six consumers share this one source environment, never copied records.
    const before = sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ),
      property = sources.property.read(org),
      release = entry.release.read('staff'),
      writers = [
        vi.spyOn(sources.estimates, 'recordTime'),
        vi.spyOn(sources.estimates, 'submitTime'),
        vi.spyOn(sources.estimates, 'reviewTime'),
        vi.spyOn(sources.estimates, 'submitExpense'),
        vi.spyOn(sources.property, 'savePlan'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.operations, 'recordConsent'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      task = await readTaskCorrectionReview(sources, job, gate, timeId),
      finance = await readCostCoveragePath(sources, job, gate),
      history = await readPublishedServiceHistory(sources, job, gate),
      maintenance = await readPlanCancellationReview(
        sources,
        job,
        'recurring_maintenance',
        gate,
      ),
      addonJobs = await readAddonReadinessJobs(sources, gate),
      owner = await readVerifiedOwnerBriefing(sources, job, gate),
      identity = {
        organization_id: org,
        customer_id: entry.target.customer_id,
        location_id: entry.target.location_id,
        job_id: job,
      };
    expect(task.view.identity).toMatchObject(identity);
    expect(finance.original.costs.identity).toMatchObject(identity);
    expect(publishedServiceContext(history)).toMatchObject(identity);
    const maintenanceFacts = planCancellationFacts(maintenance);
    expect(maintenanceFacts.identity).toMatchObject(identity);
    expect(owner.original.original.snapshot.identity).toMatchObject(identity);
    expect(assertTaskCorrectionDisplayCurrent(task)).toBe(task.source);
    expect(task.source.source_entry_id).toBe(timeId);
    expect(task.source.worker_id).toBe(entry.worker_id);
    const time = inspectCostCoverageSource(finance, {
        kind: 'time',
        id: timeId,
      }),
      reports = filterPublishedServiceHistory(history, {
        query: '',
        phase: '',
        severity: '',
      }),
      jobs = filterAddonReadinessJobs(addonJobs, {
        query: job,
        location_id: identity.location_id,
      });
    expect(time.facts).toContain('Recorded time kind: break_paid');
    expect(time.facts.join(' ')).toContain('UNPOSTED OR UNVERIFIED');
    expect(finance.invoice_status).toBe('NO_GO');
    expect(finance.operational_ready).toBe(false);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0]).toBe(history.reports[0]);
    const inspected = inspectPublishedServiceReport(
      history,
      reports[0].reference,
    );
    expect(inspected).toBe(reports[0]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject(identity);
    expect(jobs[0]).toBe(addonJobs.rows.find((row) => row.job_id === job));
    expect(history.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(history.physical_completion).toBe('UNVERIFIED');
    expect(history.customer_acceptance).toBe('UNVERIFIED');
    expect(maintenanceFacts.send).toBe(false);
    expect(maintenanceFacts.renew).toBe(false);
    expect(maintenanceFacts.native_plan_cancellation).toBe('UNSUPPORTED');
    expect(maintenanceFacts.enrollment_cancellation).toBe('UNSUPPORTED');
    expect(maintenanceFacts.rows.length).toBeGreaterThan(0);
    expect(
      maintenanceFacts.rows.every((row) => row.renewal_terms === 'UNKNOWN'),
    ).toBe(true);
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
      },
      suggestion = checkOwnerActionRequirements(owner, selection);
    expect(suggestion.operational_authority).toBe(false);
    expect(suggestion.row).toBe(priority);
    expect(owner.operational_ready).toBe(false);

    // Current native owner revocation applies to every original retained reader.
    await sources.operations.revokeOwner(org, entry.target.actor_id);
    expect(() => assertTaskCorrectionDisplayCurrent(task)).toThrow();
    expect(() =>
      inspectCostCoverageSource(finance, { kind: 'time', id: timeId }),
    ).toThrow();
    expect(() =>
      filterPublishedServiceHistory(history, {
        query: '',
        phase: '',
        severity: '',
      }),
    ).toThrow();
    expect(() => planCancellationFacts(maintenance)).toThrow();
    expect(() =>
      filterAddonReadinessJobs(addonJobs, { query: job, location_id: '' }),
    ).toThrow();
    expect(() => checkOwnerActionRequirements(owner, selection)).toThrow();
    const callback = vi.fn(),
      live = { current: callback, generation: 0 };
    expect(
      await continueCostCoverageSource(finance, time, callback, live),
    ).toEqual({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    await expect(
      continuePublishedServiceReview(history, inspected, callback, live),
    ).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();

    // Restoring a presentation checkbox cannot release original terminal holds.
    gate.confirmed = false;
    gate.confirmed = true;
    expect(() =>
      filterAddonReadinessJobs(addonJobs, { query: '', location_id: '' }),
    ).toThrow('UNKNOWN');
    expect(() =>
      filterPublishedServiceHistory(history, {
        query: '',
        phase: '',
        severity: '',
      }),
    ).toThrow('UNKNOWN');
    expect(() =>
      sources.estimates.readSyntheticPrototypeSources(entry.target),
    ).toThrow('Current synthetic owner/admin required');
    // Inspect unchanged records using the independently configured still-current
    // native owner. The revoked original actor cannot perform this read.
    expect(
      sources.estimates.readSyntheticPrototypeSources({
        ...entry.target,
        actor_id: remainingOwner,
      }),
    ).toEqual(before);
    expect(sources.property.read(org)).toEqual(property);
    expect(entry.release.read('staff')).toEqual(release);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();

    const touched = vi.fn(() => {
        throw Error('Unadmitted private caller source');
      }),
      unadmitted = new Proxy({}, { get: touched });
    await expect(
      readTaskCorrectionReview(unadmitted as never, job),
    ).rejects.toThrow('OFF');
    await expect(
      readCostCoveragePath(unadmitted as never, job),
    ).rejects.toThrow('OFF');
    await expect(
      readPublishedServiceHistory(unadmitted as never, job),
    ).rejects.toThrow('OFF');
    await expect(
      readPlanCancellationReview(
        unadmitted as never,
        job,
        'recurring_maintenance',
      ),
    ).rejects.toThrow('OFF');
    await expect(readAddonReadinessJobs(unadmitted as never)).rejects.toThrow(
      'OFF',
    );
    await expect(
      readVerifiedOwnerBriefing(unadmitted as never, job),
    ).rejects.toThrow('OFF');
    expect(touched).not.toHaveBeenCalled();
  },
);
