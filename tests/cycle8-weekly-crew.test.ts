import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  readWeeklyCrew,
  reconcileWeeklyCrew,
  compareWeeklyCrewSnapshots,
  type WeeklyCrewInput,
} from '../src/lib/workflows/weekly-crew';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const sources = await prepareLocalJourney(sampleCompanies[index], {
    enabled: true,
    confirmed: true,
  });
  const gate = { enabled: true, confirmed: true },
    input: WeeklyCrewInput = {
      week_start: sources.day,
      timezone: sources.timezone,
      worker_id: '',
      proposals: [],
    };
  const proposal = {
    day: sources.day,
    source_visit_id: sources.scheduled_visit_id,
    worker_id: sources.worker_id,
    start: sources.day + 'T09:00',
    end: sources.day + 'T11:00',
    hours_start: sources.day + 'T08:00',
    hours_end: sources.day + 'T16:00',
  };
  return { sources, gate, input, proposal };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) => readWeeklyCrew(f.sources, f.input, f.gate);
it.each([0, 1, 2])(
  'company %s derives seven exact selected-job days and preserves canonical source without writes',
  async (index) => {
    const f = await fixture(index),
      s = f.sources,
      state = s.property.read(s.company.id),
      jobs = await s.estimates.jobs(s.company.id),
      workforce = await s.estimates.workforce(s.company.id),
      history = await s.estimates.history(s.company.id, s.target.estimate_id),
      release = s.release.read('staff');
    const writers = [
      vi.spyOn(s.property, 'addVisit'),
      vi.spyOn(s.property, 'saveVisit'),
      vi.spyOn(s.property, 'savePlan'),
      vi.spyOn(s.property, 'publish'),
      vi.spyOn(s.estimates, 'assignJob'),
      vi.spyOn(s.estimates, 'recordTime'),
      vi.spyOn(s.estimates, 'approveJob'),
    ];
    const view = await read(f);
    expect(view.days.map((d) => d.day)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(view.source).toMatchObject({
      organization_id: s.company.id,
      customer_id: s.target.customer_id,
      location_id: s.target.location_id,
      job_id: s.target.job_id,
      issued_version_id: s.target.version_id,
    });
    const events = view.days.flatMap((d) => d.lanes.flatMap((w) => w.events));
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'DATE_ONLY_VISIT',
        visit_id: s.scheduled_visit_id,
        timing: 'TIME_UNKNOWN',
      }),
    );
    expect(
      events.every(
        (e) =>
          e.job_id === s.target.job_id &&
          e.property_id === s.target.location_id &&
          e.customer_id === s.target.customer_id,
      ),
    ).toBe(true);
    expect(view.coverage).toBe('SELECTED_JOB_PROPERTY_AVAILABLE_RECORDS_ONLY');
    expect(view.actual_availability).toBe('UNKNOWN');
    expect(Object.values(view.authority).every((v) => v === false)).toBe(true);
    const { integrity, ...body } = view;
    expect(integrity.sha256).toBe(
      Buffer.from(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ).toString('hex'),
    );
    expect(JSON.stringify(view)).not.toMatch(
      /unit_cost|supplier|margin|payroll|internal_notes|@example.invalid|555010|PRIVATE/,
    );
    expect(await reconcileWeeklyCrew(view)).toEqual({
      status: 'CURRENT_REVIEW_ONLY',
      replacement: null,
      replay: 'FORBIDDEN',
    });
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(s.property.read(s.company.id)).toEqual(state);
    expect(await s.estimates.jobs(s.company.id)).toEqual(jobs);
    expect(await s.estimates.workforce(s.company.id)).toEqual(workforce);
    expect(
      await s.estimates.history(s.company.id, s.target.estimate_id),
    ).toEqual(history);
    expect(s.release.read('staff')).toEqual(release);
  },
);
it('reviews canonical same-day proposal overlaps without claiming a booked slot', async () => {
  const f = await fixture();
  f.input.proposals.push(f.proposal, {
    ...f.proposal,
    start: f.sources.day + 'T10:00',
    end: f.sources.day + 'T12:00',
  });
  const view = await read(f),
    lane = view.days[0].lanes.find((w) => w.worker_id === f.sources.worker_id)!;
  expect(lane.capacity?.planned_minutes).toBe(180);
  expect(lane.conflicts).toContainEqual(
    expect.objectContaining({ kind: 'SAME_SOURCE_WINDOWS', minutes: 60 }),
  );
  expect(view.proposals.every((p) => p.visit_moved === false)).toBe(true);
});
it('alternate-day proposal preserves original visit/plan/revisions as unsaved JOB_WINDOW', async () => {
  const f = await fixture();
  f.input.proposals.push({
    ...f.proposal,
    day: '2026-12-29',
    start: '2026-12-29T09:00',
    end: '2026-12-29T11:00',
    hours_start: null,
    hours_end: null,
  });
  const view = await read(f),
    proposal = view.proposals[0];
  expect(proposal).toMatchObject({
    kind: 'UNSAVED_JOB_WINDOW',
    original_visit: { id: f.sources.scheduled_visit_id, date: f.sources.day },
    visit_moved: false,
  });
  const events = view.days[1].lanes.flatMap((w) => w.events);
  expect(events).toContainEqual(
    expect.objectContaining({
      kind: 'PROPOSED_WINDOW',
      visit_id: null,
      timing: 'HUMAN_PROPOSAL',
    }),
  );
  expect(view.days[1].lanes[0].capacity?.proposed_available_minutes).toBeNull();
});
it('date-only proposal and existing date-only visits retain UNKNOWN timing', async () => {
  const f = await fixture();
  f.input.proposals.push({
    ...f.proposal,
    start: null,
    end: null,
    hours_start: null,
    hours_end: null,
  });
  const view = await read(f);
  expect(
    view.days[0].lanes[0].events.every((e) => e.kind !== 'PROPOSED_WINDOW'),
  ).toBe(true);
  expect(view.days[0].lanes[0].capacity?.recorded_coverage).toBe(
    'AVAILABLE_RECORDS_ONLY',
  );
  expect(view.actual_availability).toBe('UNKNOWN');
});
it('real recorded time conflict comes from the existing canonical day reader', async () => {
  const f = await fixture(),
    s = f.sources;
  await s.estimates.recordTime(s.company.id, s.worker_id, {
    job_id: s.target.job_id!,
    overhead_center: null,
    task: 'Actual synthetic recorded field segment',
    kind: 'work',
    started_at: s.day + 'T15:30:00Z',
    ended_at: s.day + 'T16:30:00Z',
    billable: false,
    corrects_id: null,
  });
  f.input.proposals.push(f.proposal);
  const view = await read(f);
  expect(view.days[0].lanes[0].conflicts).toContainEqual(
    expect.objectContaining({ kind: 'PROPOSAL_RECORDED_OVERLAP', minutes: 60 }),
  );
});
it('two actual eligible synthetic staff compare exact source/CAS and conflicting proposals without assignment effects', async () => {
  const f = await fixture(),
    s = f.sources,
    actor = s.company.id + '-estimator';
  await s.operations.manageMember(
    s.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.input.proposals.push(f.proposal);
  const first = await read(f),
    secondSources = { ...s, target: { ...s.target, actor_id: actor } };
  const second = await readWeeklyCrew(
    secondSources,
    {
      ...f.input,
      proposals: [
        { ...f.proposal, start: s.day + 'T10:00', end: s.day + 'T12:00' },
      ],
    },
    { enabled: true, confirmed: true },
  );
  expect(first.source_revision_sha256).toBe(second.source_revision_sha256);
  const assignments = s.estimates.syntheticJobAssignments(
      s.company.id,
      s.target.actor_id,
    ),
    writer = vi.spyOn(s.estimates, 'assignJob');
  const comparison = await compareWeeklyCrewSnapshots(
    first,
    second,
    {
      expected_first_sha256: first.integrity.sha256,
      expected_second_sha256: second.integrity.sha256,
    },
    { enabled: true, confirmed: true },
  );
  expect(comparison).toMatchObject({
    status: 'MATCHING_SOURCE_REVIEW_ONLY',
    reviewers: 'DISTINCT_SYNTHETIC_REVIEWERS',
    applied: false,
    replacement: null,
    replay: 'FORBIDDEN',
  });
  if (comparison.status !== 'MATCHING_SOURCE_REVIEW_ONLY')
    throw Error('Exact source comparison required');
  expect(comparison.conflicts).toContainEqual(
    expect.objectContaining({ minutes: 60, kind: 'SAME_SOURCE_WINDOWS' }),
  );
  expect(writer).not.toHaveBeenCalled();
  expect(
    s.estimates.syntheticJobAssignments(s.company.id, s.target.actor_id),
  ).toEqual(assignments);
});
it('same-reviewer snapshots do not masquerade as independent human supervision', async () => {
  const f = await fixture(),
    first = await read(f),
    second = await read(f);
  expect(
    await compareWeeklyCrewSnapshots(
      first,
      second,
      {
        expected_first_sha256: first.integrity.sha256,
        expected_second_sha256: second.integrity.sha256,
      },
      f.gate,
    ),
  ).toMatchObject({
    status: 'MATCHING_SOURCE_REVIEW_ONLY',
    reviewers: 'SAME_SYNTHETIC_REVIEWER',
    applied: false,
  });
});
it('CAS mismatch, copied snapshots and changed exact source never apply or replace proposals', async () => {
  const f = await fixture(),
    first = await read(f),
    second = await read(f),
    before = JSON.stringify(first);
  expect(
    await compareWeeklyCrewSnapshots(
      first,
      second,
      {
        expected_first_sha256: 'wrong',
        expected_second_sha256: second.integrity.sha256,
      },
      f.gate,
    ),
  ).toMatchObject({ status: 'CAS_REFERENCE_MISMATCH', applied: false });
  expect(
    await compareWeeklyCrewSnapshots(
      structuredClone(first),
      second,
      {
        expected_first_sha256: first.integrity.sha256,
        expected_second_sha256: second.integrity.sha256,
      },
      f.gate,
    ),
  ).toMatchObject({ status: 'UNKNOWN', replacement: null });
  const visit = f.sources.property
    .read(f.sources.company.id)
    .visits.find((v) => v.id === f.sources.scheduled_visit_id)!;
  f.sources.property.saveVisit(f.sources.company.id, visit, {
    ...visit.content,
    summary: 'Concurrent source edit',
  });
  expect(
    await compareWeeklyCrewSnapshots(
      first,
      second,
      {
        expected_first_sha256: first.integrity.sha256,
        expected_second_sha256: second.integrity.sha256,
      },
      f.gate,
    ),
  ).toMatchObject({ status: 'UNKNOWN', applied: false });
  expect(JSON.stringify(first)).toBe(before);
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('default OFF %s rejects before source reads', async (gate) => {
  const f = await fixture(),
    source = vi.spyOn(f.sources.estimates, 'readSyntheticPrototypeSources');
  await expect(readWeeklyCrew(f.sources, f.input, gate)).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const)('foreign %s cannot authorize a weekly source', async (key) => {
  const f = await fixture();
  f.sources.target[key] = 'foreign';
  await expect(read(f)).rejects.toThrow();
});
it('different tenant composition or a foreign selected visit/worker is denied', async () => {
  const f = await fixture(),
    foreign = await fixture(1);
  await expect(
    readWeeklyCrew(
      { ...f.sources, property: foreign.sources.property },
      f.input,
      f.gate,
    ),
  ).rejects.toThrow('repositories');
  f.input.worker_id = foreign.sources.worker_id;
  await expect(read(f)).rejects.toThrow('technician');
  f.input.worker_id = '';
  f.input.proposals.push({
    ...f.proposal,
    source_visit_id: foreign.sources.scheduled_visit_id,
  });
  await expect(read(f)).rejects.toThrow('original property visit');
});
it('actual admin revocation invalidates retained source and comparison', async () => {
  const f = await fixture(),
    s = f.sources,
    actor = s.company.id + '-estimator';
  await s.operations.manageMember(
    s.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  s.target.actor_id = actor;
  const view = await read(f);
  await s.operations.manageMember(
    s.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect(await reconcileWeeklyCrew(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  await expect(read(f)).rejects.toThrow();
});
it.each(['getter', 'serializer', 'symbol', 'row-getter', 'source-getter'])(
  'rejects %s without caller hooks',
  async (kind) => {
    const f = await fixture(),
      hook = vi.fn();
    if (kind === 'getter')
      Object.defineProperty(f.input, 'week_start', { get: hook });
    if (kind === 'serializer') Object.assign(f.input, { toJSON: hook });
    if (kind === 'symbol') Object.assign(f.input, { [Symbol('extra')]: true });
    if (kind === 'row-getter') {
      f.input.proposals.push(f.proposal);
      Object.defineProperty(f.input.proposals, 0, { get: hook });
    }
    if (kind === 'source-getter')
      Object.defineProperty(f.sources, 'property', { get: hook });
    await expect(read(f)).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
  },
);
it.each(['2026-02-30', '2026-12-2', 'not-a-date'])(
  'invalid week %s fails closed',
  async (week) => {
    const f = await fixture();
    f.input.week_start = week;
    await expect(read(f)).rejects.toThrow();
  },
);
it('out-of-week, foreign worker, unpaired and invalid proposal times reject', async () => {
  const f = await fixture();
  f.input.proposals.push({ ...f.proposal, day: '2027-01-04' });
  await expect(read(f)).rejects.toThrow();
  f.input.proposals[0] = { ...f.proposal, worker_id: 'foreign' };
  await expect(read(f)).rejects.toThrow();
  f.input.proposals[0] = { ...f.proposal, end: null };
  await expect(read(f)).rejects.toThrow();
  f.input.proposals[0] = { ...f.proposal, end: f.sources.day + 'T08:00' };
  await expect(read(f)).rejects.toThrow();
});
it.each([
  ['2026-03-08', 1380],
  ['2026-11-01', 1500],
] as const)(
  'seven-day calendar preserves DST length on %s',
  async (day, minutes) => {
    const f = await fixture();
    f.input.week_start = day;
    expect((await read(f)).days[0].civil_day_minutes).toBe(minutes);
    f.input.proposals.push({
      ...f.proposal,
      day,
      start: day + (minutes === 1380 ? 'T02:15' : 'T01:15'),
      end: day + 'T03:30',
      hours_start: null,
      hours_end: null,
    });
    await expect(read(f)).rejects.toThrow();
  },
);
it.each(['input', 'target', 'confirmation', 'journey-confirmation'] as const)(
  'awaited sources recheck live %s',
  async (kind) => {
    const f = await fixture(),
      original = f.sources.estimates.workforce.bind(f.sources.estimates);
    let once = true;
    vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
      async (org) => {
        const result = await original(org);
        if (once) {
          once = false;
          if (kind === 'input') f.input.week_start = '2026-12-29';
          if (kind === 'target') f.sources.target.location_id = 'foreign';
          if (kind === 'confirmation') f.gate.confirmed = false;
          if (kind === 'journey-confirmation') f.sources.gate.confirmed = false;
        }
        return result;
      },
    );
    await expect(read(f)).rejects.toThrow();
  },
);
it('last awaited source hash cannot hide actual plan edits', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (++calls === 7) {
      const plan = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.id === f.sources.plan_id)!;
      f.sources.property.savePlan(f.sources.company.id, {
        ...plan,
        name: 'Final awaited source race',
      });
    }
    return result;
  });
  await expect(read(f)).rejects.toThrow();
  expect(calls).toBe(7);
});
it('comparison rechecks exact CAS fields after awaited combined calculation', async () => {
  const f = await fixture(),
    first = await read(f),
    second = await read(f),
    selection = {
      expected_first_sha256: first.integrity.sha256,
      expected_second_sha256: second.integrity.sha256,
    },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    selection.expected_second_sha256 = 'changed';
    return result;
  });
  expect(
    await compareWeeklyCrewSnapshots(first, second, selection, f.gate),
  ).toMatchObject({ status: 'UNKNOWN', applied: false, replay: 'FORBIDDEN' });
});
it('lost read acknowledgments remain UNKNOWN, without new IDs or source replay', async () => {
  const f = await fixture(),
    view = await read(f),
    writer = vi.spyOn(f.sources.property, 'addVisit');
  vi.spyOn(
    f.sources.estimates,
    'readSyntheticPrototypeSources',
  ).mockImplementation(() => {
    throw Error('Read unavailable');
  });
  expect(await reconcileWeeklyCrew(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(writer).not.toHaveBeenCalled();
  expect(await reconcileWeeklyCrew(structuredClone(view))).toMatchObject({
    status: 'UNKNOWN',
  });
});
