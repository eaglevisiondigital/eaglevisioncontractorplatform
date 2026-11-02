import { afterEach, expect, it, vi } from 'vitest';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import { sampleCompanies } from '../src/domain/platform';
import { readGrowthReminderReview } from '../src/lib/growth-reminders';

const query = () => ({
  from: '2026-10-20',
  through: '2026-11-30',
  as_of: '2026-11-01T20:00:00Z',
  channel: 'email' as const,
});
const admission = () => ({
  enabled: true,
  eligibility: {
    enabled: true,
    confirmed: true,
    lead_days: 7,
    overdue_days: 3,
  },
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function setup(index = 0) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T18:00:00Z'));
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  await prepareMaintenanceExamples(repo, org, actor);
  const item = repo.maintenance(org, actor).items[0];
  const boundary = {
    organization_id: org,
    customer_id: item.source.customer_id,
    location_id: item.source.location_id,
  };
  const plan = repo.read(org).plans.find((p) => p.id === item.plan_id)!;
  repo.savePlan(org, {
    ...plan,
    cadence: 'once',
    starts_on: '2026-11-03',
    timezone: 'America/Chicago',
  });
  await operations.recordConsent(org, boundary.customer_id, true, false);
  const read = (config = admission(), q = query(), user = actor) =>
    readGrowthReminderReview(repo, boundary, user, q, config);
  return { company, org, actor, operations, repo, boundary, item, plan, read };
}
function forPlan(
  r: Awaited<ReturnType<typeof readGrowthReminderReview>>,
  id: string,
) {
  return r.eligibility_review!.items.find(
    (i) => i.source.plan_id === id && i.source.occurrence_index !== null,
  )!;
}
it.each([0, 1, 2])(
  'all company%s: actual recurrence and observed consent support staff review only with no writes',
  async (index) => {
    const s = await setup(index);
    const before = {
      property: s.repo.read(s.org),
      history: await s.operations.customerHistory(
        s.org,
        s.boundary.customer_id,
      ),
      jobs: await s.repo.estimates.jobs(s.org),
    };
    const r = await s.read(),
      row = forPlan(r, s.plan.id);
    expect(row).toMatchObject({
      planning_status: 'STAFF_REVIEW_CANDIDATE',
      eligible_for_staff_review: true,
      calendar_days_from_as_of: 2,
      message_eligibility: 'BLOCKED',
      exact_visits: [],
      unverified: [
        'purpose_consent',
        'suppression',
        'recurring_enrollment',
        'sender_authority',
      ],
    });
    expect(row.source.plan_id).toBe(s.plan.id);
    expect(row.channel_reference!.id).toBe(before.history.consents[0].id);
    expect(r.eligibility_review!.eligible_for_staff_review_count).toBe(
      r.eligibility_review!.items.filter((i) => i.eligible_for_staff_review)
        .length,
    );
    expect(r).toMatchObject({
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      recurring_enrollment: 'UNVERIFIED',
      communication_authority: 'BLOCKED',
      recipient: null,
      provider_request: null,
    });
    expect(JSON.stringify(r)).not.toMatch(
      /PRIVATE|INTERNAL|internal_notes|payroll|supplier|recorded_by|@example|email_allowed/,
    );
    expect(Object.isFrozen(row.source)).toBe(true);
    expect(Object.isFrozen(row.channel_reference)).toBe(true);
    expect({
      property: s.repo.read(s.org),
      history: await s.operations.customerHistory(
        s.org,
        s.boundary.customer_id,
      ),
      jobs: await s.repo.estimates.jobs(s.org),
    }).toEqual(before);
  },
);
it('new eligibility is default OFF and legacy candidate review still works', async () => {
  const s = await setup();
  const legacy = await readGrowthReminderReview(
    s.repo,
    s.boundary,
    s.actor,
    query(),
    { enabled: true },
  );
  const config = admission();
  config.eligibility.enabled = false;
  expect(legacy.eligibility_review).toBeNull();
  expect(legacy.count).toBeGreaterThan(0);
  const off = await s.read(config);
  expect(off.eligibility_review).toBeNull();
  expect(off.candidates).toEqual(legacy.candidates);
});
it.each([
  { confirmed: false },
  { lead_days: -1 },
  { lead_days: 31 },
  { lead_days: 0.5 },
  { overdue_days: -1 },
  { overdue_days: 94 },
  { lead_days: Number.NaN },
  { overdue_days: Number.POSITIVE_INFINITY },
])(
  'rejects unconfirmed or unbounded review input %j before CRM history reads',
  async (patch) => {
    const s = await setup(),
      config = admission();
    Object.assign(config.eligibility, patch);
    const history = vi.spyOn(s.operations, 'customerHistory');
    await expect(s.read(config)).rejects.toThrow('bounded eligibility');
    expect(history).not.toHaveBeenCalled();
  },
);
it.each([
  ['2026-10-29', true, -3],
  ['2026-10-28', false, -4],
  ['2026-11-08', true, 7],
  ['2026-11-09', false, 8],
] as const)(
  'calendar horizon includes exact bounds %s without counting UTC hours',
  async (date, eligible, delta) => {
    const s = await setup(),
      plan = s.repo.read(s.org).plans.find((p) => p.id === s.plan.id)!;
    s.repo.savePlan(s.org, { ...plan, starts_on: date });
    const row = forPlan(await s.read(), s.plan.id);
    expect(row.calendar_days_from_as_of).toBe(delta);
    expect(row.eligible_for_staff_review).toBe(eligible);
    if (!eligible)
      expect(row.reasons).toContain('OUTSIDE_CONFIRMED_PLANNING_WINDOW');
  },
);
it('uses the plan timezone across the UTC date boundary and DST day', async () => {
  const s = await setup(),
    p = s.repo.read(s.org).plans.find((p) => p.id === s.plan.id)!;
  s.repo.savePlan(s.org, { ...p, starts_on: '2026-11-01' });
  const config = admission();
  config.eligibility.lead_days = 0;
  const r = await s.read(config, { ...query(), as_of: '2026-11-02T01:00:00Z' });
  expect(forPlan(r, p.id)).toMatchObject({
    calendar_days_from_as_of: 0,
    eligible_for_staff_review: true,
  });
});
it('an exact retained draft visit avoids duplicate occurrence planning without proving work or delivery', async () => {
  const s = await setup(),
    visit = s.repo.addVisit(s.org, s.plan.id, '2026-11-03', 'after');
  const r = await s.read(),
    row = forPlan(r, s.plan.id);
  expect(row).toMatchObject({
    planning_status: 'EXACT_VISIT_RECORDED',
    eligible_for_staff_review: false,
    message_eligibility: 'BLOCKED',
    exact_visits: [
      {
        id: visit.id,
        plan_id: s.plan.id,
        revision: 1,
        on: '2026-11-03',
        status: 'draft',
        phase: 'after',
      },
    ],
  });
  expect(r.candidates.some((c) => c.source.plan_id === s.plan.id)).toBe(true);
  expect(JSON.stringify(row)).not.toMatch(
    /resolved|repaired|physical_completion|delivered|paid/,
  );
});
it('a different exact plan on the same property and date does not suppress this occurrence', async () => {
  const s = await setup(),
    context = s.repo
      .read(s.org)
      .contexts.find((c) => c.location_id === s.boundary.location_id)!;
  const other = s.repo.createPlan(
    s.org,
    context,
    'Same property separate plan',
  );
  s.repo.addVisit(s.org, other.id, '2026-11-03');
  expect(forPlan(await s.read(), s.plan.id)).toMatchObject({
    eligible_for_staff_review: true,
    exact_visits: [],
  });
});
it('two distinct visits with the same exact plan/date stay ambiguous rather than being guessed or merged', async () => {
  const s = await setup(),
    visit = s.repo.addVisit(s.org, s.plan.id, '2026-11-03');
  const state = s.repo.read(s.org);
  state.visits.push({ ...visit, id: crypto.randomUUID() });
  vi.spyOn(s.repo, 'read').mockImplementation(() => structuredClone(state));
  const row = forPlan(await s.read(), s.plan.id);
  expect(row).toMatchObject({
    planning_status: 'UNKNOWN',
    eligible_for_staff_review: false,
    message_eligibility: 'BLOCKED',
  });
  expect(row.reasons).toContain('AMBIGUOUS_EXACT_VISITS');
  expect(row.exact_visits).toHaveLength(2);
});
it.each(['foreign', 'duplicate', 'object-status'] as const)(
  'fails closed on %s exact visit evidence without private coercion',
  async (mode) => {
    const s = await setup(),
      visit = s.repo.addVisit(s.org, s.plan.id, '2026-11-03'),
      state = s.repo.read(s.org);
    const target = state.visits.find((v) => v.id === visit.id)!;
    const evil = {
      toString: vi.fn(() => 'draft'),
      toJSON: vi.fn(() => 'PRIVATE'),
    };
    if (mode === 'foreign') target.organization_id = sampleCompanies[1].id;
    if (mode === 'duplicate') state.visits.push({ ...target });
    if (mode === 'object-status') Object.assign(target, { status: evil });
    vi.spyOn(s.repo, 'read').mockReturnValue(state);
    await expect(s.read()).rejects.toThrow();
    expect(evil.toString).not.toHaveBeenCalled();
    expect(evil.toJSON).not.toHaveBeenCalled();
    expect(Object.isFrozen(evil)).toBe(false);
  },
);
it('latest recorded channel denial prevents staff-review eligibility even while within the horizon', async () => {
  const s = await setup();
  vi.setSystemTime(new Date('2026-11-01T18:01:00Z'));
  await s.operations.recordConsent(s.org, s.boundary.customer_id, false, true);
  const row = forPlan(await s.read(), s.plan.id);
  expect(row).toMatchObject({
    planning_status: 'CHANNEL_DENIED',
    eligible_for_staff_review: false,
    message_eligibility: 'BLOCKED',
  });
  expect(row.reasons).toContain('CHANNEL_DECLINED');
});
it('missing or future channel evidence stays UNKNOWN rather than a send or enrollment grant', async () => {
  const s = await setup(),
    h = await s.operations.customerHistory(s.org, s.boundary.customer_id);
  h.consents[0].recorded_at = '2027-01-01T00:00:00Z';
  vi.spyOn(s.operations, 'customerHistory').mockResolvedValue(h);
  expect(forPlan(await s.read(), s.plan.id)).toMatchObject({
    planning_status: 'UNKNOWN',
    eligible_for_staff_review: false,
    message_eligibility: 'BLOCKED',
    channel_reference: null,
  });
});
it.each(['visit', 'confirmation', 'horizon', 'role', 'consent'] as const)(
  'rejects actual %s changes during asynchronous evidence reads',
  async (mode) => {
    const s = await setup(),
      config = admission(),
      actor = s.org + '-field';
    if (mode === 'role')
      await s.operations.manageMember(
        s.org,
        actor,
        true,
        'admin',
        'office_manager',
      );
    const original = s.operations.customerHistory.bind(s.operations);
    let reads = 0;
    vi.spyOn(s.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const h = await original(...args);
        if (++reads === 1) {
          if (mode === 'visit') s.repo.addVisit(s.org, s.plan.id, '2026-11-03');
          if (mode === 'confirmation') config.eligibility.confirmed = false;
          if (mode === 'horizon') config.eligibility.lead_days = 30;
          if (mode === 'role')
            await s.operations.manageMember(
              s.org,
              actor,
              true,
              'staff',
              'field_staff',
            );
          if (mode === 'consent') {
            vi.setSystemTime(new Date('2026-11-01T18:01:00Z'));
            await s.operations.recordConsent(
              s.org,
              s.boundary.customer_id,
              false,
              false,
            );
          }
        }
        return h;
      },
    );
    await expect(
      s.read(config, query(), mode === 'role' ? actor : s.actor),
    ).rejects.toThrow(/changed|reviewer/);
  },
);
it('pins only named primitive review fields and never serializes or freezes a caller policy', async () => {
  const s = await setup(),
    config = admission();
  const inherited = {
    toJSON: vi.fn(() => {
      throw Error('PRIVATE');
    }),
  };
  Object.setPrototypeOf(config.eligibility, inherited);
  Object.assign(config.eligibility, { private_note: 'PRIVATE' });
  const r = await s.read(config);
  expect(JSON.stringify(r.eligibility_review)).not.toContain('PRIVATE');
  expect(inherited.toJSON).not.toHaveBeenCalled();
  expect(Object.isFrozen(config.eligibility)).toBe(false);
});
it('truncated source coverage withholds eligibility rather than claiming complete recurring history', async () => {
  const s = await setup(),
    context = s.repo
      .read(s.org)
      .contexts.find((c) => c.location_id === s.boundary.location_id)!;
  while (
    s.repo
      .read(s.org)
      .plans.filter((p) => p.location_id === s.boundary.location_id).length <
    100
  )
    s.repo.createPlan(s.org, context, 'Bounded plan example');
  for (const p of s.repo
    .read(s.org)
    .plans.filter((p) => p.location_id === s.boundary.location_id))
    s.repo.savePlan(s.org, {
      ...p,
      starts_on: '2026-11-01',
      cadence: 'custom',
      interval_days: 1,
    });
  const r = await s.read(admission(), {
    ...query(),
    from: '2026-11-01',
    through: '2026-11-06',
  });
  expect(r.count).toBe(500);
  expect(r.eligibility_review!.count_is_complete).toBe(false);
  expect(r.eligibility_review!.eligible_for_staff_review_count).toBe(0);
  expect(
    r.eligibility_review!.items.every(
      (i) =>
        i.planning_status === 'UNKNOWN' &&
        i.reasons.includes('INCOMPLETE_CANDIDATE_COVERAGE'),
    ),
  ).toBe(true);
});

it.each(['eligibility', 'lead_days'] as const)(
  'does not execute a getter for caller %s review input',
  async (field) => {
    const s = await setup(),
      config = admission(),
      getter = vi.fn(() => {
        throw Error('PRIVATE');
      });
    if (field === 'eligibility')
      Object.defineProperty(config, field, { get: getter });
    else Object.defineProperty(config.eligibility, field, { get: getter });
    await expect(s.read(config)).rejects.toThrow('Primitive eligibility');
    expect(getter).not.toHaveBeenCalled();
  },
);
