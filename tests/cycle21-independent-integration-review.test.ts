import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { Phase3Repository } from '../src/lib/phase3';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { captureOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
  reconcileTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readCostCorrectionReview,
  confirmCostCorrectionReview,
  reconcileCostCorrectionReview,
  assertCostCorrectionReviewCurrent,
} from '../src/lib/workflows/cost-correction-review';
import {
  readMaintenancePlanCorrectionReview,
  saveMaintenancePlanCorrectionReview,
  reconcileMaintenancePlanCorrectionReview,
  maintenancePlanRenewalReview,
} from '../src/lib/workflows/maintenance-plan-correction';
import {
  readPublishedServiceHistory,
  inspectPublishedServiceReport,
  inspectPublishedServiceFinding,
  publishedServiceReportPage,
  publishedServiceContext,
  readPublishedServiceRequirements,
  continuePublishedServiceReview,
} from '../src/lib/workflows/published-service-navigation';
import {
  readRecordedOwnerActions,
  compareRecordedOwnerActions,
  recordedOwnerActionCards,
  inspectRecordedOwnerAction,
  continueRecordedOwnerAction,
} from '../src/lib/workflows/recorded-owner-actions';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
import { TaskCorrectionReview } from '../src/components/workflows/TaskCorrectionReview';
import { CostCorrectionReview } from '../src/components/workflows/CostCorrectionReview';
import { PublishedServiceNavigator } from '../src/components/workflows/PublishedServiceNavigator';
import { MaintenancePlanCorrection } from '../src/components/workflows/MaintenancePlanCorrection';
import { RecordedOwnerActions } from '../src/components/workflows/RecordedOwnerActions';

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true };
  const sources = await prepareCorrectionPreviewSources(
    sampleCompanies[brand],
    gate,
  );
  const entry = sources.entries[0];
  return {
    gate,
    sources,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Task = Awaited<ReturnType<typeof readTaskCorrectionReview>>;
type Plan = Awaited<ReturnType<typeof readMaintenancePlanCorrectionReview>>;
function taskInput(t: Task, suffix = 'independently reviewed') {
  return {
    source_entry_id: t.source.source_entry_id,
    task: `${t.source.task}: ${suffix}`,
    started_at: t.source.started_at,
    ended_at: t.source.ended_at,
    billable: !t.source.billable,
  };
}
function planInput(p: Plan) {
  return {
    plan_id: p.source.plan_id,
    revision: p.source.revision,
    name: 'Independent exact-source maintenance revision',
    cadence: 'monthly' as const,
    interval_days: 30,
  };
}
const reviewInput = (
  expense: string,
  decision: 'approved' | 'rejected' = 'approved',
) => ({
  expense_id: expense,
  decision,
  reason:
    'Independent manual review of this exact canonical pending commitment',
});
function materialId(r: Awaited<ReturnType<typeof readCostCorrectionReview>>) {
  if (!r.material.expense_id) throw Error('Native pending fixture must exist');
  return r.material.expense_id;
}
function job(f: Fixture) {
  return f.sources.estimates.syntheticJob(f.org, f.job)!;
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
function privateFields(value: unknown) {
  if (Array.isArray(value)) value.forEach(privateFields);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(
        /^(internal_notes|unit_cost_minor|cost_minor|supplier|payroll|worker_id|actor_id|margin|staff_notes)$/i,
      );
      privateFields(child);
    }
  }
}

for (const brand of [0, 1, 2]) {
  for (const jobIndex of [0, 1, 2, 3]) {
    it(`brand ${brand}, job ${jobIndex}: actual correction journey preserves canonical records`, async () => {
      const f = await fixture(brand);
      const reports = f.sources.property.read(f.org).reports;
      const ids = f.sources.entries.map((e) => e.target.job_id);
      expect(new Set(ids).size).toBe(4);
      {
        const entry = f.sources.entries[jobIndex];
        const id = entry.target.job_id!;
        const t = await readTaskCorrectionReview(f.sources, id, f.gate);
        const oldCost = await readCostCorrectionReview(f.sources, id, f.gate);
        const oldOwner = await readRecordedOwnerActions(f.sources, id, f.gate);
        const history = await readPublishedServiceHistory(
          f.sources,
          id,
          f.gate,
        );
        const published = JSON.stringify(history);
        const originalJob = f.sources.estimates.syntheticJob(f.org, id)!;
        const release = entry.release.read('staff');
        const originalTime = (
          await f.sources.estimates.workforce(f.org)
        ).entries.find((x) => x.id === t.source.source_entry_id)!;
        await saveTaskCorrectionReview(t, taskInput(t), true);
        expect(() => assertCostCorrectionReviewCurrent(oldCost)).toThrow();
        const afterTime = await f.sources.estimates.workforce(f.org);
        expect(afterTime.entries.find((x) => x.id === originalTime.id)).toEqual(
          originalTime,
        );
        const appended = afterTime.entries.filter(
          (x) => x.corrects_id === originalTime.id,
        );
        expect(appended).toHaveLength(1);
        expect(appended[0]).toMatchObject({
          job_id: id,
          worker_id: entry.worker_id,
          submitted: true,
        });
        const costs = await readCostCorrectionReview(f.sources, id, f.gate);
        await confirmCostCorrectionReview(
          costs,
          reviewInput(materialId(costs)),
          true,
        );
        const nextCost = await readCostCorrectionReview(f.sources, id, f.gate);
        expect(nextCost.canonical).toEqual(
          jobFinancials(f.sources.estimates.syntheticJob(f.org, id)!),
        );
        expect(
          nextCost.canonical.categories.find((c) => c.category === 'materials')!
            .committed_remaining_minor -
            costs.canonical.categories.find((c) => c.category === 'materials')!
              .committed_remaining_minor,
        ).toBe(2500);
        expect(nextCost.costs.evidence.facts.cost_coverage).not.toBe(
          'DECLARED_COSTS_COMPLETE',
        );
        expect(nextCost.costs.evidence.facts.costs).toBeNull();
        const p = await readMaintenancePlanCorrectionReview(
          f.sources,
          id,
          f.gate,
        );
        const consent = maintenancePlanRenewalReview(p);
        expect(consent).toMatchObject({
          source_atomicity: 'CAPTURED_NOT_ATOMIC',
          purpose_consent: 'UNVERIFIED',
          suppression: 'UNVERIFIED',
          enrollment: 'UNVERIFIED',
          renewal_terms: 'UNKNOWN',
        });
        await saveMaintenancePlanCorrectionReview(p, planInput(p), true);
        const afterPlan = f.sources.property
          .read(f.org)
          .plans.find((x) => x.id === p.source.plan_id)!;
        expect(afterPlan.revision).toBe(p.source.revision + 1);
        expect(afterPlan).toMatchObject({
          job_id: id,
          customer_id: entry.target.customer_id,
          location_id: entry.target.location_id,
        });
        expect(JSON.stringify(history)).toBe(published);
        const report = inspectPublishedServiceReport(
          history,
          history.reports[0].reference,
        );
        expect(
          publishedServiceReportPage(history, report.reference)[0].version,
        ).toBe(report.reference.published_version);
        if (report.report.observations[0]) {
          expect(
            inspectPublishedServiceFinding(
              history,
              report.report.observations[0].reference,
            ),
          ).toEqual(report.report.observations[0]);
        }
        privateFields(history);
        const requirements = await readPublishedServiceRequirements(
          history,
          report.reference,
        );
        expect(requirements.job.reference.job_id).toBe(id);
        expect(requirements.interpretation).toEqual({
          physical_completion: 'UNVERIFIED',
          customer_acceptance: 'UNVERIFIED',
          warranty: 'UNVERIFIED',
          repair_status: 'NOT_INFERRED',
          delivery: 'NOT_SENT',
          authority: 'DOCUMENTATION_ONLY',
        });
        const owner = await readRecordedOwnerActions(f.sources, id, f.gate);
        const changed = compareRecordedOwnerActions(oldOwner, owner, {
          query: '',
          area: 'all',
          changed_only: true,
        });
        expect(changed.matching).toBeGreaterThan(0);
        expect(
          recordedOwnerActionCards(owner).every(
            (c) =>
              c.job_id === id && c.authority === 'HUMAN_REVIEW_SUGGESTION_ONLY',
          ),
        ).toBe(true);
        const finalJob = f.sources.estimates.syntheticJob(f.org, id)!;
        expect(finalJob.expenses).toEqual(originalJob.expenses);
        expect(finalJob.events).toHaveLength(originalJob.events.length + 1);
        expect(finalJob.labor).toEqual(originalJob.labor);
        expect(finalJob.changes).toEqual(originalJob.changes);
        expect(entry.release.read('staff')).toEqual(release);
        expect(await reconcileTaskCorrectionReview(t)).toMatchObject({
          state: 'KNOWN_SAVED',
          source_id: originalTime.id,
          result_id: appended[0].id,
          replay: 'FORBIDDEN',
        });
        expect(await reconcileCostCorrectionReview(costs)).toMatchObject({
          state: 'KNOWN_SAVED',
          replay: 'FORBIDDEN',
        });
        expect(await reconcileMaintenancePlanCorrectionReview(p)).toMatchObject(
          {
            state: 'KNOWN_SAVED',
            replay: 'FORBIDDEN',
          },
        );
      }
      expect(f.sources.property.read(f.org).reports).toEqual(reports);
      expect(f.sources.entries.map((e) => e.target.job_id)).toEqual(ids);
      expect((await f.sources.estimates.workforce(f.org)).periods).toEqual([]);
      captureOperatingSources(f.sources, f.gate).check();
    });
  }

  it(`brand ${brand}: one actual saved task invalidates a previously read finance confirmation`, async () => {
    const f = await fixture(brand),
      t = await readTaskCorrectionReview(f.sources, f.job, f.gate),
      c = await readCostCorrectionReview(f.sources, f.job, f.gate);
    const writer = vi.spyOn(f.sources.estimates, 'reviewExpense');
    await saveTaskCorrectionReview(t, taskInput(t), true);
    await expect(
      confirmCostCorrectionReview(c, reviewInput(materialId(c)), true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
    const fresh = await readCostCorrectionReview(f.sources, f.job, f.gate);
    expect(
      (
        await confirmCostCorrectionReview(
          fresh,
          reviewInput(materialId(fresh)),
          true,
        )
      ).status,
    ).toBe('SYNTHETIC_SOURCE_SAVED');
  });

  it(`brand ${brand}: revoked staff cannot save any of three already-open correction forms`, async () => {
    const f = await fixture(brand),
      t = await readTaskCorrectionReview(f.sources, f.job, f.gate),
      c = await readCostCorrectionReview(f.sources, f.job, f.gate),
      p = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate);
    const record = vi.spyOn(f.sources.estimates, 'recordTime'),
      expense = vi.spyOn(f.sources.estimates, 'reviewExpense'),
      plan = vi.spyOn(f.sources.property, 'savePlan');
    revoke(f);
    await expect(
      saveTaskCorrectionReview(t, taskInput(t), true),
    ).rejects.toThrow();
    await expect(
      confirmCostCorrectionReview(c, reviewInput(materialId(c)), true),
    ).rejects.toThrow();
    await expect(
      saveMaintenancePlanCorrectionReview(p, planInput(p), true),
    ).rejects.toThrow();
    expect(record).not.toHaveBeenCalled();
    expect(expense).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: foreign job, property and canonical expense cannot replace retained sources`, async () => {
    const f = await fixture(brand),
      other = await fixture((brand + 1) % 3);
    const beforeEvents = job(f).events;
    await expect(
      readTaskCorrectionReview(f.sources, other.job, f.gate),
    ).rejects.toThrow();
    await expect(
      readCostCorrectionReview(f.sources, other.job, f.gate),
    ).rejects.toThrow();
    await expect(
      readPublishedServiceHistory(f.sources, other.job, f.gate),
    ).rejects.toThrow();
    const c = await readCostCorrectionReview(f.sources, f.job, f.gate),
      foreign = await readCostCorrectionReview(
        other.sources,
        other.job,
        other.gate,
      );
    await expect(
      confirmCostCorrectionReview(c, reviewInput(materialId(foreign)), true),
    ).rejects.toThrow();
    const source = f.entry.target;
    f.entry.target = { ...source, location_id: other.entry.target.location_id };
    await expect(
      readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(job(f).events).toEqual(beforeEvents);
  });

  it(`brand ${brand}: navigation retains exact job and published version without action authority`, async () => {
    const f = await fixture(brand),
      h = await readPublishedServiceHistory(f.sources, f.job, f.gate);
    const r = inspectPublishedServiceReport(h, h.reports[0].reference),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    expect(publishedServiceContext(h)).toMatchObject({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.job,
    });
    expect(
      (await continuePublishedServiceReview(h, r, callback, live)).status,
    ).toBe('LOCAL_REVIEW_NAVIGATION_ONLY');
    expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, 'maintenance');
    const owner = await readRecordedOwnerActions(f.sources, f.job, f.gate),
      inspected = await inspectRecordedOwnerAction(
        owner,
        owner.navigation.cards[0].key,
      ),
      navigate = vi.fn(),
      lease = { current: navigate, generation: 0 };
    expect(
      (await continueRecordedOwnerAction(owner, inspected, navigate, lease))
        .status,
    ).toBe('CURRENT_REVIEW_ONLY');
    expect(navigate).toHaveBeenCalledExactlyOnceWith(f.job, inspected.step);
    expect(
      (await continueRecordedOwnerAction(owner, inspected, navigate, lease))
        .status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(navigate).toHaveBeenCalledTimes(1);
  });
}

it('competing Field and Finance confirmations share the original whole-family pending owner', async () => {
  const f = await fixture(),
    t = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    c = await readCostCorrectionReview(f.sources, f.job, f.gate);
  const original = f.sources.estimates.recordTime.bind(f.sources.estimates);
  const beforeEvents = job(f).events;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi
    .spyOn(f.sources.estimates, 'recordTime')
    .mockImplementation(async (...args) => {
      await wait;
      return original(...args);
    });
  const pending = saveTaskCorrectionReview(t, taskInput(t), true);
  await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  await expect(
    confirmCostCorrectionReview(c, reviewInput(materialId(c)), true),
  ).rejects.toThrow();
  release();
  await expect(pending).resolves.toMatchObject({
    status: 'SYNTHETIC_SOURCE_SAVED',
  });
  expect(job(f).events).toEqual(beforeEvents);
});

it('two independently loaded task forms append only one correction under simultaneous confirmation', async () => {
  const f = await fixture(),
    a = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    b = await readTaskCorrectionReview(f.sources, f.job, f.gate);
  const spy = vi.spyOn(f.sources.estimates, 'recordTime');
  const results = await Promise.allSettled([
    saveTaskCorrectionReview(a, taskInput(a), true),
    saveTaskCorrectionReview(b, taskInput(b), true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(
    (await f.sources.estimates.workforce(f.org)).entries.filter(
      (e) => e.corrects_id === a.source.source_entry_id,
    ),
  ).toHaveLength(1);
});

it('a lost native time acknowledgment stays UNKNOWN and blocks Finance or Growth bypass through fresh views', async () => {
  const f = await fixture(),
    t = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.estimates.recordTime.bind(f.sources.estimates);
  const spy = vi
    .spyOn(f.sources.estimates, 'recordTime')
    .mockImplementation(async (...args) => {
      await original(...args);
      throw Error('Independent lost time acknowledgment');
    });
  await expect(saveTaskCorrectionReview(t, taskInput(t), true)).rejects.toThrow(
    'Independent lost time acknowledgment',
  );
  expect(await reconcileTaskCorrectionReview(t)).toMatchObject({
    state: 'UNKNOWN',
    result_id: null,
    observed: 'SOURCE_CHANGED_UNATTRIBUTED',
    replay: 'FORBIDDEN',
  });
  const c = await readCostCorrectionReview(f.sources, f.job, f.gate),
    p = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate);
  expect(c.material.blocked_reason).toBe('UNKNOWN');
  expect(p.source.blocked_reason).toBe('UNKNOWN');
  await expect(
    confirmCostCorrectionReview(c, reviewInput(materialId(c)), true),
  ).rejects.toThrow();
  await expect(
    saveMaintenancePlanCorrectionReview(p, planInput(p), true),
  ).rejects.toThrow();
  await expect(
    saveTaskCorrectionReview(t, taskInput(t), true),
  ).rejects.toThrow();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('lost expense acknowledgment preserves the actual review event without inventing an owned receipt', async () => {
  const f = await fixture(),
    c = await readCostCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.estimates.reviewExpense.bind(f.sources.estimates);
  const spy = vi
    .spyOn(f.sources.estimates, 'reviewExpense')
    .mockImplementation(async (...args) => {
      await original(...args);
      throw Error('Independent lost material acknowledgment');
    });
  await expect(
    confirmCostCorrectionReview(c, reviewInput(materialId(c)), true),
  ).rejects.toThrow('Independent lost material acknowledgment');
  expect(job(f).events.at(-1)?.submission_id).toBe(materialId(c));
  expect(await reconcileCostCorrectionReview(c)).toMatchObject({
    state: 'UNKNOWN',
    result_id: null,
    observed: 'SOURCE_CHANGED_UNATTRIBUTED',
    replay: 'FORBIDDEN',
  });
  const exercise = await readSavedSourceExercise(f.sources, f.job, f.gate);
  await expect(
    executeSavedSourceExercise(exercise, 'visit-draft', true),
  ).rejects.toThrow(/UNKNOWN/);
  expect(spy).toHaveBeenCalledTimes(1);
});

it('a contradictory material acknowledgment retains UNKNOWN after exact canonical event success', async () => {
  const f = await fixture(),
    c = await readCostCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.estimates.reviewExpense.bind(f.sources.estimates);
  const spy = vi
    .spyOn(f.sources.estimates, 'reviewExpense')
    .mockImplementation(async (...args) => {
      await original(...args);
      return false as never;
    });
  await expect(
    confirmCostCorrectionReview(c, reviewInput(materialId(c)), true),
  ).rejects.toThrow();
  expect(await reconcileCostCorrectionReview(c)).toMatchObject({
    state: 'UNKNOWN',
    result_id: null,
    observed: 'SOURCE_CHANGED_UNATTRIBUTED',
  });
  expect(spy).toHaveBeenCalledTimes(1);
});

it('lost plan acknowledgment cannot be adopted by text matching or a replacement plan revision', async () => {
  const f = await fixture(),
    p = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.property.savePlan.bind(f.sources.property);
  const spy = vi
    .spyOn(f.sources.property, 'savePlan')
    .mockImplementation((...args) => {
      original(...args);
      throw Error('Independent lost plan acknowledgment');
    });
  await expect(
    saveMaintenancePlanCorrectionReview(p, planInput(p), true),
  ).rejects.toThrow('Independent lost plan acknowledgment');
  expect(await reconcileMaintenancePlanCorrectionReview(p)).toMatchObject({
    state: 'UNKNOWN',
    result_id: null,
    observed: 'SOURCE_CHANGED_UNATTRIBUTED',
  });
  const fresh = await readMaintenancePlanCorrectionReview(
    f.sources,
    f.job,
    f.gate,
  );
  expect(fresh.source.revision).toBe(p.source.revision + 1);
  await expect(
    saveMaintenancePlanCorrectionReview(fresh, planInput(fresh), true),
  ).rejects.toThrow();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('live task input drift after native append stops before submit or review and permanently holds UNKNOWN', async () => {
  const f = await fixture(),
    t = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    input = taskInput(t),
    original = f.sources.estimates.recordTime.bind(f.sources.estimates);
  vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
    async (...args) => {
      const result = await original(...args);
      input.task = 'Changed after confirmation';
      return result;
    },
  );
  const submit = vi.spyOn(f.sources.estimates, 'submitTime'),
    review = vi.spyOn(f.sources.estimates, 'reviewTime');
  await expect(saveTaskCorrectionReview(t, input, true)).rejects.toThrow(
    /Live task correction changed/,
  );
  expect(submit).not.toHaveBeenCalled();
  expect(review).not.toHaveBeenCalled();
  expect(await reconcileTaskCorrectionReview(t)).toMatchObject({
    state: 'UNKNOWN',
    replay: 'FORBIDDEN',
  });
});

it('revocation at the native append acknowledgment prevents later time submission and review', async () => {
  const f = await fixture(),
    t = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.estimates.recordTime.bind(f.sources.estimates);
  vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
    async (...args) => {
      const result = await original(...args);
      revoke(f);
      return result;
    },
  );
  const submit = vi.spyOn(f.sources.estimates, 'submitTime'),
    review = vi.spyOn(f.sources.estimates, 'reviewTime');
  await expect(
    saveTaskCorrectionReview(t, taskInput(t), true),
  ).rejects.toThrow();
  expect(submit).not.toHaveBeenCalled();
  expect(review).not.toHaveBeenCalled();
  await expect(reconcileTaskCorrectionReview(t)).rejects.toThrow();
});

it('source preparation rejects a wrong native pending-material acknowledgment and does not prepare the next job', async () => {
  const original = Phase3Repository.prototype.submitExpense;
  let called = 0;
  vi.spyOn(Phase3Repository.prototype, 'submitExpense').mockImplementation(
    async function (this: Phase3Repository, ...args) {
      const id = await original.apply(this, args);
      if (args[2].reference === 'C21-PENDING-MATERIAL-REVIEW') {
        called++;
        return crypto.randomUUID();
      }
      return id;
    },
  );
  await expect(
    prepareCorrectionPreviewSources(sampleCompanies[0], {
      enabled: true,
      confirmed: true,
    }),
  ).rejects.toThrow(/acknowledgment/);
  expect(called).toBe(1);
});

it('source preparation withdrawal at the first pending material acknowledgment prevents the next job seed', async () => {
  const original = Phase3Repository.prototype.submitExpense,
    gate = { enabled: true, confirmed: true };
  let called = 0;
  vi.spyOn(Phase3Repository.prototype, 'submitExpense').mockImplementation(
    async function (this: Phase3Repository, ...args) {
      const id = await original.apply(this, args);
      if (args[2].reference === 'C21-PENDING-MATERIAL-REVIEW') {
        called++;
        gate.enabled = false;
        gate.confirmed = false;
      }
      return id;
    },
  );
  await expect(
    prepareCorrectionPreviewSources(sampleCompanies[0], gate),
  ).rejects.toThrow();
  expect(called).toBe(1);
});

it.each(['field', 'finance', 'customer', 'growth', 'intelligence'] as const)(
  '%s readers reject non-loopback and default OFF before native writers',
  async (module) => {
    const f = await fixture();
    const readers = {
      field: () => readTaskCorrectionReview(f.sources, f.job),
      finance: () => readCostCorrectionReview(f.sources, f.job),
      customer: () => readPublishedServiceHistory(f.sources, f.job),
      growth: () => readMaintenancePlanCorrectionReview(f.sources, f.job),
      intelligence: () => readRecordedOwnerActions(f.sources, f.job),
    };
    await expect(readers[module]()).rejects.toThrow();
    vi.stubGlobal('window', {
      location: { hostname: 'example.invalid', protocol: 'https:' },
    });
    const enabled = {
      field: () => readTaskCorrectionReview(f.sources, f.job, f.gate),
      finance: () => readCostCorrectionReview(f.sources, f.job, f.gate),
      customer: () => readPublishedServiceHistory(f.sources, f.job, f.gate),
      growth: () =>
        readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
      intelligence: () => readRecordedOwnerActions(f.sources, f.job, f.gate),
    };
    await expect(enabled[module]()).rejects.toThrow();
  },
);

it('all five disabled presentations render without dereferencing an untrusted source container', () => {
  const getter = vi.fn(() => {
    throw Error('Disabled presentation touched source');
  });
  const source = Object.defineProperty({}, 'company', { get: getter });
  const props = {
    enabled: false,
    sources: source as never,
    selectedJobId: 'not-authority',
  };
  for (const component of [
    TaskCorrectionReview,
    CostCorrectionReview,
    PublishedServiceNavigator,
    MaintenancePlanCorrection,
    RecordedOwnerActions,
  ]) {
    expect(() =>
      renderToStaticMarkup(createElement(component, props)),
    ).not.toThrow();
  }
  expect(getter).not.toHaveBeenCalled();
});

it('reviewed composition retains the original host pending owner and future restart review boundary', () => {
  const host = readFileSync(
    'src/components/workflows/OperatingCenterPreview.tsx',
    'utf8',
  );
  expect(host.indexOf('attempts.current.set(id, a)')).toBeLessThan(
    host.indexOf('await prepareSources(company, a.gate)'),
  );
  expect(host).toContain("a.state = 'UNKNOWN'");
  expect(host).toContain('preparer.current === prepareSources');
  for (const wrapper of ['Eleven', 'Twelve', 'Thirteen']) {
    expect(
      readFileSync(
        `src/components/workflows/OperatingCenterCycle${wrapper}.tsx`,
        'utf8',
      ),
    ).toContain('prepareSources={prepareSources}');
  }
  const parent = readFileSync(
    'src/components/workflows/OperatingCenterCycleFifteen.tsx',
    'utf8',
  );
  expect(parent).toContain(
    'corrections ? prepareCorrectionPreviewSources : undefined',
  );
  expect(parent).toMatch(/\[corrections, setCorrections\] = useState\(false\)/);
  const boundary = readFileSync(
    'docs/program/CYCLE21_PERSISTENCE_REVIEW_SCOPE.md',
    'utf8',
  );
  expect(boundary).toContain('Cycle 21 introduces no restart adapter');
  expect(boundary).toContain('before any adapter is implemented');
  expect(boundary).toContain(
    'Historical JSON files or a same-machine simulation cannot satisfy',
  );
});
