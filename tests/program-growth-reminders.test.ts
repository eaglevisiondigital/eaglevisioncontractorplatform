import { afterEach, expect, it, vi } from 'vitest';
import {
  readGrowthReminderReview,
  type ReminderWindow,
} from '../src/lib/growth-reminders';
import { PropertyRepository } from '../src/lib/property';
import { Operations } from '../src/lib/operations';
import { sampleCompanies } from '../src/domain/platform';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';

const enabled = { enabled: true };
const window = (): ReminderWindow => ({
  from: '2026-11-01',
  through: '2026-11-30',
  as_of: new Date(Date.now() + 1000).toISOString(),
  channel: 'email',
});
afterEach(() => vi.restoreAllMocks());
async function setup(index = 0) {
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
  await repo.saveMaintenance(org, actor, item.source, item.record.revision, {
    priority: 'high',
    assignee_id: null,
    review: 'pending',
    follow_up_on: '2026-11-10',
    note: 'PRIVATE supplier pricing and payroll',
  });
  return { operations, repo, org, actor, boundary, item };
}
it.each([0, 1, 2])(
  'reads actual property, recurring plan, follow-up and consent sources for company%s without side effects',
  async (index) => {
    const s = await setup(index);
    await s.operations.recordConsent(
      s.org,
      s.boundary.customer_id,
      true,
      false,
    );
    const before = {
      property: s.repo.read(s.org),
      history: await s.operations.customerHistory(
        s.org,
        s.boundary.customer_id,
      ),
      jobs: await s.repo.estimates.jobs(s.org),
    };
    const review = await readGrowthReminderReview(
      s.repo,
      s.boundary,
      s.actor,
      window(),
      enabled,
    );
    expect(review.count).toBe(review.candidates.length);
    expect(
      review.candidates.some((c) => c.kind === 'inspection_occurrence'),
    ).toBe(true);
    expect(
      review.candidates.find((c) => c.kind === 'staff_follow_up')?.source,
    ).toMatchObject({
      report_id: s.item.source.report_id,
      report_version: s.item.source.report_version,
      finding_id: s.item.source.finding_id,
      maintenance_revision: 1,
    });
    expect(review.consent.observed_channel_state).toBe('RECORDED_ALLOWED');
    expect(review).toMatchObject({
      coverage: 'AVAILABLE_LOCAL_SOURCES_ONLY',
      history_completeness: 'UNKNOWN',
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      recurring_enrollment: 'UNVERIFIED',
      communication_authority: 'BLOCKED',
      recipient: null,
      provider_request: null,
    });
    expect(JSON.stringify(review)).not.toMatch(
      /PRIVATE|INTERNAL|supplier|payroll|@example|internal_notes|author_id|margin|email_allowed/,
    );
    expect(Object.isFrozen(review.candidates[0].source)).toBe(true);
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
it('anchored monthly recurrence preserves February and March without claiming physical work or completion', async () => {
  const s = await setup();
  const plan = s.repo
    .read(s.org)
    .plans.find((p) => p.location_id === s.boundary.location_id)!;
  s.repo.savePlan(s.org, {
    ...plan,
    starts_on: '2026-01-31',
    cadence: 'monthly',
  });
  const r = await readGrowthReminderReview(
    s.repo,
    s.boundary,
    s.actor,
    { ...window(), from: '2026-02-01', through: '2026-03-31' },
    enabled,
  );
  expect(
    r.candidates
      .filter(
        (c) =>
          c.source.plan_id === plan.id && c.kind === 'inspection_occurrence',
      )
      .map((c) => c.due_on),
  ).toEqual(['2026-02-28', '2026-03-31']);
  expect(r.communication_authority).toBe('BLOCKED');
});
it('uses each plan timezone for today without shifting its date', async () => {
  const s = await setup();
  const plan = s.repo
    .read(s.org)
    .plans.find((p) => p.location_id === s.boundary.location_id)!;
  s.repo.savePlan(s.org, {
    ...plan,
    starts_on: '2026-11-01',
    cadence: 'once',
    timezone: 'America/Chicago',
  });
  const r = await readGrowthReminderReview(
    s.repo,
    s.boundary,
    s.actor,
    { ...window(), as_of: '2026-11-02T01:00:00Z' },
    enabled,
  );
  expect(
    r.candidates.find(
      (c) => c.source.plan_id === plan.id && c.kind === 'inspection_occurrence',
    ),
  ).toMatchObject({ due_on: '2026-11-01', timing: 'today' });
});
it('scheduled follow-up is not duplicated or interpreted as repaired', async () => {
  const s = await setup();
  const row = s.repo
    .maintenance(s.org, s.actor)
    .items.find((i) => i.key === s.item.key)!;
  const plan = s.repo.read(s.org).plans.find((p) => p.id === row.plan_id)!;
  await s.repo.scheduleMaintenance(
    s.org,
    s.actor,
    row.source,
    row.record.revision,
    { id: plan.id, revision: plan.revision },
    '2026-11-10',
  );
  const r = await readGrowthReminderReview(
    s.repo,
    s.boundary,
    s.actor,
    window(),
    enabled,
  );
  expect(
    r.candidates.some(
      (c) =>
        c.kind === 'staff_follow_up' &&
        c.source.finding_id === row.source.finding_id,
    ),
  ).toBe(false);
  expect(r.communication_authority).toBe('BLOCKED');
  expect(JSON.stringify(r)).not.toMatch(/resolved|repaired|paid/);
});
it.each([
  'missing',
  'denied',
  'sms-only',
  'future',
  'same-time-conflict',
  'unknown-policy',
] as const)(
  'contact evidence %s never grants a reminder purpose or sender',
  async (state) => {
    const s = await setup();
    if (state !== 'missing')
      await s.operations.recordConsent(
        s.org,
        s.boundary.customer_id,
        state !== 'denied' && state !== 'sms-only',
        true,
      );
    if (['future', 'same-time-conflict', 'unknown-policy'].includes(state)) {
      const h = await s.operations.customerHistory(
        s.org,
        s.boundary.customer_id,
      );
      if (state === 'future')
        h.consents[0].recorded_at = '2100-01-01T00:00:00Z';
      if (state === 'unknown-policy')
        h.consents[0].policy_version = 'PRIVATE arbitrary policy';
      if (state === 'same-time-conflict')
        h.consents.push({
          ...h.consents[0],
          id: crypto.randomUUID(),
          email_allowed: false,
        });
      vi.spyOn(s.operations, 'customerHistory').mockResolvedValue(h);
    }
    const r = await readGrowthReminderReview(
      s.repo,
      s.boundary,
      s.actor,
      window(),
      enabled,
    );
    expect(r.consent.observed_channel_state).toBe(
      ['denied', 'sms-only'].includes(state) ? 'RECORDED_DENIED' : 'UNKNOWN',
    );
    expect(r.purpose_consent).toBe('UNVERIFIED');
    expect(r.communication_authority).toBe('BLOCKED');
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
  },
);
it('latest denial wins by timestamp, never by response ordering or matching channel preference', async () => {
  const s = await setup();
  await s.operations.recordConsent(s.org, s.boundary.customer_id, true, true);
  const h = await s.operations.customerHistory(s.org, s.boundary.customer_id);
  h.consents[0].recorded_at = '2026-10-01T00:00:00Z';
  h.consents.push({
    ...h.consents[0],
    id: crypto.randomUUID(),
    recorded_at: '2026-10-02T00:00:00Z',
    email_allowed: false,
  });
  vi.spyOn(s.operations, 'customerHistory').mockResolvedValue(h);
  expect(
    (
      await readGrowthReminderReview(
        s.repo,
        s.boundary,
        s.actor,
        window(),
        enabled,
      )
    ).consent.observed_channel_state,
  ).toBe('RECORDED_DENIED');
});
it.each(['organization_id', 'customer_id', 'location_id'] as const)(
  'rejects foreign %s and does not substitute another property',
  async (key) => {
    const s = await setup();
    const foreign = {
      ...s.boundary,
      [key]:
        key === 'organization_id' ? sampleCompanies[1].id : crypto.randomUUID(),
    };
    await expect(
      readGrowthReminderReview(s.repo, foreign, s.actor, window(), enabled),
    ).rejects.toThrow();
  },
);
it.each(['field', 'estimator', 'revoked', 'foreign'] as const)(
  'current %s actor cannot read the internal reminder queue',
  async (role) => {
    const s = await setup();
    let actor =
      role === 'foreign'
        ? sampleCompanies[1].id + '-owner'
        : s.org + '-' + role;
    if (role === 'revoked') {
      actor = s.actor;
      const members = s.operations.syntheticMemberships(s.org);
      members.find((m) => m.user_id === actor)!.active = false;
      vi.spyOn(s.operations, 'syntheticMemberships').mockReturnValue(members);
    }
    await expect(
      readGrowthReminderReview(s.repo, s.boundary, actor, window(), enabled),
    ).rejects.toThrow();
  },
);
it.each([
  'off',
  'connected',
  'invalid-date',
  'reversed',
  'too-wide',
  'invalid-instant',
  'invalid-channel',
] as const)(
  'fails closed for %s without connected reads or network calls',
  async (mode) => {
    const s = await setup();
    const w = window();
    const read = vi.spyOn(s.operations, 'customerHistory');
    if (mode === 'connected')
      Object.defineProperty(s.operations, 'sample', { value: false });
    if (mode === 'invalid-date') w.from = '2026-02-30';
    if (mode === 'reversed') w.through = '2026-10-01';
    if (mode === 'too-wide') w.through = '2027-11-30';
    if (mode === 'invalid-instant') w.as_of = 'tomorrow';
    if (mode === 'invalid-channel')
      Object.assign(w, { channel: { toString: () => 'email' } });
    await expect(
      readGrowthReminderReview(
        s.repo,
        s.boundary,
        s.actor,
        w,
        mode === 'off' ? {} : enabled,
      ),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  },
);
it('rejects current source, membership or consent drift across async reads', async () => {
  const s = await setup();
  const original = s.operations.customerHistory.bind(s.operations);
  let calls = 0;
  vi.spyOn(s.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const h = await original(...args);
      if (++calls === 1) {
        const plan = s.repo.read(s.org).plans[0];
        s.repo.savePlan(s.org, { ...plan, name: 'Changed exact plan' });
      }
      return h;
    },
  );
  await expect(
    readGrowthReminderReview(s.repo, s.boundary, s.actor, window(), enabled),
  ).rejects.toThrow('changed');
});
it('rejects object-valued consent fields without coercion, private serialization or source freezing', async () => {
  const s = await setup();
  await s.operations.recordConsent(s.org, s.boundary.customer_id, true, false);
  const h = await s.operations.customerHistory(s.org, s.boundary.customer_id);
  const value = {
    private_note: 'PRIVATE',
    toString: vi.fn(() => 'true'),
    toJSON: vi.fn(() => 'PRIVATE'),
  };
  Object.assign(h.consents[0], { email_allowed: value });
  vi.spyOn(s.operations, 'customerHistory').mockResolvedValue(h);
  await expect(
    readGrowthReminderReview(s.repo, s.boundary, s.actor, window(), enabled),
  ).rejects.toThrow('consent');
  expect(value.toString).not.toHaveBeenCalled();
  expect(value.toJSON).not.toHaveBeenCalled();
  expect(Object.isFrozen(value)).toBe(false);
});

it('bounds large candidate windows without claiming a complete count', async () => {
  const s = await setup();
  const context = s.repo
    .read(s.org)
    .contexts.find(
      (c) =>
        c.customer_id === s.boundary.customer_id &&
        c.location_id === s.boundary.location_id,
    )!;
  while (
    s.repo
      .read(s.org)
      .plans.filter((p) => p.location_id === s.boundary.location_id).length <
    100
  )
    s.repo.createPlan(s.org, context, 'Explicit synthetic review plan');
  for (const plan of s.repo
    .read(s.org)
    .plans.filter((p) => p.location_id === s.boundary.location_id))
    s.repo.savePlan(s.org, {
      ...plan,
      starts_on: '2026-11-01',
      cadence: 'custom',
      interval_days: 1,
    });
  const r = await readGrowthReminderReview(
    s.repo,
    s.boundary,
    s.actor,
    { ...window(), through: '2026-11-06' },
    enabled,
  );
  expect(r.count).toBe(500);
  expect(r.count_is_complete).toBe(false);
  expect(new Set(r.candidates.map((c) => c.key)).size).toBe(500);
});
it('revocation during a history await blocks the read, not just subsequent messages', async () => {
  const s = await setup();
  const original = s.operations.customerHistory.bind(s.operations);
  vi.spyOn(s.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const h = await original(...args);
      const members = s.operations.syntheticMemberships(s.org);
      members.find((m) => m.user_id === s.actor)!.active = false;
      vi.spyOn(s.operations, 'syntheticMemberships').mockReturnValue(members);
      return h;
    },
  );
  await expect(
    readGrowthReminderReview(s.repo, s.boundary, s.actor, window(), enabled),
  ).rejects.toThrow('reviewer');
});
it('changed consent between reads blocks a stale observed channel result', async () => {
  const s = await setup();
  await s.operations.recordConsent(s.org, s.boundary.customer_id, true, true);
  const original = s.operations.customerHistory.bind(s.operations);
  let calls = 0;
  vi.spyOn(s.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const h = await original(...args);
      if (++calls === 2) h.consents[0].email_allowed = false;
      return h;
    },
  );
  await expect(
    readGrowthReminderReview(s.repo, s.boundary, s.actor, window(), enabled),
  ).rejects.toThrow('changed');
});
