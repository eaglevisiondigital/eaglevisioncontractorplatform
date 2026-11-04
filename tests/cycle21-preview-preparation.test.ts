import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Phase3Repository } from '../src/lib/phase3';
import {
  prepareOperatingSources,
  captureOperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readSavedSourceExercise,
  readSavedTaskCorrection,
  readSavedMaterialCorrection,
  executeSavedTaskCorrection,
  executeSavedMaterialCorrection,
  executeSavedPlanCorrection,
  readSavedPlanCorrection,
} from '../src/lib/workflows/saved-revision-exercise';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
for (const [index, company] of sampleCompanies.entries()) {
  it(`brand ${index} one original environment exposes native correction sources and preserves published history`, async () => {
    const gate = { enabled: true, confirmed: true },
      s = await prepareCorrectionPreviewSources(company, gate);
    expect(s.entries).toHaveLength(4);
    for (const e of s.entries) {
      const view = await readSavedSourceExercise(s, e.target.job_id!, gate),
        task = await readSavedTaskCorrection(view),
        material = readSavedMaterialCorrection(view);
      expect(task.can_edit).toBe(true);
      expect(material.can_review).toBe(true);
      expect(material.eligible_expenses).toHaveLength(1);
      const published = s.property.read(company.id).reports;
      const releaseBefore = e.release.read('staff');
      const oldJob = s.estimates.readSyntheticPrototypeSources(e.target).job!;
      await executeSavedTaskCorrection(
        view,
        {
          source_entry_id: task.source_entry_id!,
          task: 'Manually corrected synthetic task',
          started_at: task.started_at!,
          ended_at: task.ended_at!,
          billable: true,
        },
        true,
      );
      const next = await readSavedSourceExercise(s, e.target.job_id!, gate);
      const pending = readSavedMaterialCorrection(next);
      await executeSavedMaterialCorrection(
        next,
        {
          expense_id: pending.expense_id!,
          decision: 'approved',
          reason: 'Explicit local internal material review',
        },
        true,
      );
      const fresh = await readSavedSourceExercise(s, e.target.job_id!, gate),
        plan = readSavedPlanCorrection(fresh);
      await executeSavedPlanCorrection(
        fresh,
        {
          plan_id: plan.plan_id,
          revision: plan.revision,
          name: 'Manually reviewed maintenance plan',
          cadence: 'monthly',
          interval_days: 30,
        },
        true,
      );
      const job = s.estimates.readSyntheticPrototypeSources(e.target).job!;
      expect(job.expenses).toEqual(oldJob.expenses);
      expect(job.events).toHaveLength(oldJob.events.length + 1);
      expect(e.release.read('staff')).toEqual(releaseBefore);
      expect(s.property.read(company.id).reports).toEqual(published);
      captureOperatingSources(s, gate).check();
    }
  });
  it(`brand ${index} default original preparation does not add C21 records`, async () => {
    const s = await prepareOperatingSources(company, {
      enabled: true,
      confirmed: true,
    });
    for (const e of s.entries) {
      const job = s.estimates.readSyntheticPrototypeSources(e.target).job!;
      expect(
        job.expenses.some((x) => x.reference === 'C21-PENDING-MATERIAL-REVIEW'),
      ).toBe(false);
    }
  });
}
it('disabled preparation never constructs repositories', async () => {
  const spy = vi.spyOn(Phase3Repository.prototype, 'initialize');
  await expect(
    prepareCorrectionPreviewSources(sampleCompanies[0], {
      enabled: false,
      confirmed: true,
    }),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('wrong company is denied before source initialization', async () => {
  const spy = vi.spyOn(Phase3Repository.prototype, 'initialize');
  await expect(
    prepareCorrectionPreviewSources(
      { ...sampleCompanies[0], id: crypto.randomUUID() },
      { enabled: true, confirmed: true },
    ),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('withdrawn approval after time acknowledgment stops before any material submission', async () => {
  const gate = { enabled: true, confirmed: true },
    real = Phase3Repository.prototype.reviewTime;
  vi.spyOn(Phase3Repository.prototype, 'reviewTime').mockImplementation(
    async function (this: Phase3Repository, ...args) {
      const result = await real.apply(this, args);
      gate.confirmed = false;
      return result;
    },
  );
  const submit = vi.spyOn(Phase3Repository.prototype, 'submitExpense');
  await expect(
    prepareCorrectionPreviewSources(sampleCompanies[0], gate),
  ).rejects.toThrow();
  expect(
    submit.mock.calls.some(
      ([, , e]) => e.reference === 'C21-PENDING-MATERIAL-REVIEW',
    ),
  ).toBe(false);
});
it('lost material acknowledgment stops original preparation, never adopts or retries', async () => {
  const real = Phase3Repository.prototype.submitExpense;
  let targeted = 0;
  vi.spyOn(Phase3Repository.prototype, 'submitExpense').mockImplementation(
    async function (this: Phase3Repository, ...args) {
      const id = await real.apply(this, args);
      if (args[2].reference === 'C21-PENDING-MATERIAL-REVIEW') {
        targeted++;
        throw Error('Lost ACK');
      }
      return id;
    },
  );
  await expect(
    prepareCorrectionPreviewSources(sampleCompanies[0], {
      enabled: true,
      confirmed: true,
    }),
  ).rejects.toThrow('Lost ACK');
  expect(targeted).toBe(1);
});
