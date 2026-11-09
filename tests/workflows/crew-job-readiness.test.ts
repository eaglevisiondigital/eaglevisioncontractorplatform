import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readCrewJobReadiness } from '../../src/components/workflows/crew-job-readiness';
afterEach(() => vi.restoreAllMocks());
async function fixture(i = 0) {
  const j = await prepareLocalJourney(sampleCompanies[i], {
    enabled: true,
    confirmed: true,
  });
  return {
    j,
    input: {
      week_start: j.day,
      timezone: j.timezone,
      worker_id: j.worker_id,
      proposals: [
        {
          day: j.day,
          source_visit_id: j.scheduled_visit_id,
          worker_id: j.worker_id,
          start: j.day + 'T09:00',
          end: j.day + 'T12:00',
          hours_start: j.day + 'T10:00',
          hours_end: j.day + 'T11:00',
        },
      ],
    },
  };
}
it.each([0, 1, 2])(
  'brand %i native proposed-hours shortage beside canonical scope and materials',
  async (i) => {
    const f = await fixture(i);
    const before = JSON.stringify(
      f.j.estimates.readSyntheticPrototypeSources(f.j.target),
    );
    const v = await readCrewJobReadiness(f.j, f.input);
    expect(v.weekly.days[0].lanes[0].capacity?.capacity_state).toBe(
      'OUTSIDE_PROPOSED_HOURS',
    );
    expect(
      v.weekly.days[0].lanes[0].capacity?.outside_proposed_hours_minutes,
    ).toBe(120);
    expect(v.materials.cost.scope.jobId).toBe(f.j.target.job_id);
    expect(v.weekly.actual_availability).toBe('UNKNOWN');
    expect(v.cost.status).toBe('UNKNOWN');
    v.check();
    expect(
      JSON.stringify(f.j.estimates.readSyntheticPrototypeSources(f.j.target)),
    ).toBe(before);
  },
);
it('original engine detects competing windows without resolving them', async () => {
  const f = await fixture();
  f.input.proposals.push({
    ...f.input.proposals[0],
    start: f.j.day + 'T10:00',
    end: f.j.day + 'T13:00',
  });
  const v = await readCrewJobReadiness(f.j, f.input);
  expect(v.weekly.days[0].lanes[0].conflicts.length).toBeGreaterThan(0);
});
it('date-only proposal never proves working hours', async () => {
  const f = await fixture();
  const input = {
    ...f.input,
    proposals: [
      {
        ...f.input.proposals[0],
        start: null,
        end: null,
        hours_start: null,
        hours_end: null,
      },
    ],
  };
  const v = await readCrewJobReadiness(f.j, input);
  expect(v.weekly.days[0].lanes[0].capacity?.capacity_state).toBe('UNKNOWN');
  expect(v.weekly.actual_availability).toBe('UNKNOWN');
});
it('changed proposal holds prior readiness', async () => {
  const f = await fixture();
  const v = await readCrewJobReadiness(f.j, f.input);
  f.input.proposals[0].end = f.j.day + 'T14:00';
  expect(() => v.check()).toThrow();
  f.input.proposals[0].end = f.j.day + 'T12:00';
  expect(() => v.check()).toThrow();
});
it('revocation denies retained readiness', async () => {
  const f = await fixture();
  const v = await readCrewJobReadiness(f.j, f.input);
  f.j.gate.confirmed = false;
  expect(() => v.check()).toThrow();
});
it.each(['organization_id', 'customer_id', 'job_id', 'version_id'] as const)(
  'foreign %s denied',
  async (key) => {
    const f = await fixture();
    f.j.target[key] = crypto.randomUUID();
    await expect(readCrewJobReadiness(f.j, f.input)).rejects.toThrow();
  },
);
it('unassigned proposed worker denied', async () => {
  const f = await fixture();
  f.input.worker_id = crypto.randomUUID();
  f.input.proposals[0].worker_id = f.input.worker_id;
  await expect(readCrewJobReadiness(f.j, f.input)).rejects.toThrow();
});
it('revocation while reading denies disclosure', async () => {
  const f = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    f.j.gate.enabled = false;
    return digest(...args);
  });
  await expect(readCrewJobReadiness(f.j, f.input)).rejects.toThrow();
});

it('proposal changes during the first source await are denied', async () => {
  const f = await fixture();
  const pending = readCrewJobReadiness(f.j, f.input);
  f.input.proposals[0].end = f.j.day + 'T14:00';
  await expect(pending).rejects.toThrow();
});
it('cross-job recorded time invalidates exact retained crew reconciliation', async () => {
  const f = await fixture();
  const other = (await f.j.estimates.jobs(f.j.company.id)).find(
    (j) => j.id !== f.j.target.job_id,
  )!;
  const worker = (await f.j.estimates.workforce(f.j.company.id)).workers.find(
    (w) => w.id === f.j.worker_id,
  )!;
  await f.j.estimates.assignJob(f.j.company.id, other.id, worker.user_id, true);
  const v = await readCrewJobReadiness(f.j, f.input);
  await f.j.estimates.recordTime(f.j.company.id, f.j.worker_id, {
    job_id: other.id,
    overhead_center: null,
    task: 'Recorded synthetic other-job segment',
    kind: 'work',
    started_at: f.j.day + 'T15:30:00Z',
    ended_at: f.j.day + 'T16:30:00Z',
    billable: false,
    corrects_id: null,
  });
  await expect(v.inspect()).rejects.toThrow();
  expect(() => v.check()).toThrow();
});
