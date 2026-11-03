import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readMaintenanceSavedRevision as read,
  compareMaintenanceSavedRevisions as compare,
  adoptMaintenanceSavedRevision as adoptDomain,
  assertMaintenanceSavedRevisionCurrent as domainCurrent,
} from '../src/lib/workflows/maintenance-saved-revisions';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  adoptSavedRevision,
} from '../src/lib/workflows/saved-revision-runtime';
import { MaintenanceSavedRevisions } from '../src/components/workflows/MaintenanceSavedRevisions';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2];
  return {
    sources,
    gate,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
function savePlan(f: Awaited<ReturnType<typeof fixture>>) {
  const plan = f.sources.property
    .read(f.org)
    .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.org, {
    ...plan,
    cadence: plan.cadence === 'weekly' ? 'monthly' : 'weekly',
  });
  return plan;
}
it.each([0, 1, 2])(
  'brand %s reads exact saved recurrence, follow-up and contact sources without writes',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.org)),
      writers = [
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'addVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch'),
      snapshot = await read(f.sources, f.job, f.gate);
    expect(snapshot.identity).toEqual(f.entry.target);
    expect(snapshot.evidence.plans.every((p) => p.id === f.entry.plan_id)).toBe(
      true,
    );
    expect(
      snapshot.evidence.occurrences.every((o) =>
        snapshot.evidence.plans.some(
          (p) =>
            p.id === o.source.plan_id && p.revision === o.source.plan_revision,
        ),
      ),
    ).toBe(true);
    expect(Object.isFrozen(snapshot.evidence.plans)).toBe(true);
    expect(Object.values(snapshot.evidence.authority).every((v) => !v)).toBe(
      true,
    );
    expect(snapshot.evidence).toMatchObject({
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
      renewal_terms: 'UNKNOWN',
      recipient: null,
      provider_request: null,
      physical_completion: 'UNVERIFIED',
      count_is_complete: false,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /unit_cost|payroll|supplier|margin|internal_notes|PRIVATE|@example|555010/,
    );
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s compares actual saved plan cadence and revision then explicitly adopts current evidence',
  async (brand) => {
    const f = await fixture(brand),
      a = await read(f.sources, f.job, f.gate),
      serialized = JSON.stringify(a),
      selection = createSavedRevisionSelection(a),
      plan = savePlan(f);
    expect(() => assertSavedRevisionCurrent(a)).toThrow();
    expect(() => assertSavedRevisionAccess(a)).not.toThrow();
    const b = await read(f.sources, f.job, f.gate),
      diff = compare(a, b),
      row = diff.differences.plans.find((r) => r.id === plan.id)!;
    expect(row.state).toBe('MODIFIED');
    expect(row.before!.revision).toBe(plan.revision);
    expect(row.current!.revision).toBe(plan.revision + 1);
    expect(row.current!.cadence).not.toBe(row.before!.cadence);
    expect(() =>
      adoptSavedRevision(selection, diff.comparison, 0, false),
    ).toThrow();
    expect(readSavedRevisionSelection(selection).snapshot).toBe(a);
    const adopted = adoptSavedRevision(selection, diff.comparison, 0, true);
    expect(adopted.snapshot).toBe(b);
    expect(adopted.generation).toBe(1);
    expect(JSON.stringify(a)).toBe(serialized);
    expect(() =>
      adoptSavedRevision(selection, diff.comparison, 1, true),
    ).toThrow();
    expect(diff.differences.send).toBe('BLOCKED');
  },
);
it.each([0, 1, 2])(
  'brand %s preserves actual report/version/finding follow-up identity after saved maintenance review',
  async (brand) => {
    const f = await fixture(brand),
      a = await read(f.sources, f.job, f.gate),
      item = f.sources.property
        .maintenance(f.org, f.entry.target.actor_id)
        .items.find((i) => i.job_id === f.job)!;
    await f.sources.property.saveMaintenance(
      f.org,
      f.entry.target.actor_id,
      item.source,
      item.record.revision,
      {
        priority: 'high',
        assignee_id: null,
        follow_up_on: f.entry.day,
        review: 'reviewed',
        note: 'PRIVATE staff follow-up note excluded',
      },
    );
    const b = await read(f.sources, f.job, f.gate),
      diff = compare(a, b),
      row = diff.differences.followups.find((r) => r.id === item.key)!;
    expect(row.current!.source).toEqual(item.source);
    expect(row.current!.revision).toBe(item.record.revision + 1);
    expect(row.current!.review).toBe('reviewed');
    expect(row.current!.follow_up_on).toBe(f.entry.day);
    expect(JSON.stringify(b)).not.toContain('PRIVATE staff');
    expect(
      b.evidence.occurrences.some(
        (o) =>
          o.kind === 'staff_follow_up' &&
          o.source.report_id === item.source.report_id &&
          o.source.report_version === item.source.report_version &&
          o.source.finding_id === item.source.finding_id &&
          o.source.maintenance_revision === item.record.revision + 1,
      ),
    ).toBe(true);
    expect(b.evidence.physical_completion).toBe('UNVERIFIED');
  },
);
it('changed plan revision keys remain separate occurrence evidence, never a fuzzy identity match', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate);
  savePlan(f);
  const b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  expect(
    diff.differences.occurrences.some(
      (r) => r.state === 'NOT_PRESENT_IN_CURRENT_READ',
    ),
  ).toBe(true);
  expect(diff.differences.occurrences.some((r) => r.state === 'ADDED')).toBe(
    true,
  );
  expect(
    diff.differences.occurrences
      .filter((r) => r.state === 'ADDED')
      .every((r) => r.before === null),
  ).toBe(true);
});
it('recorded channel revocation changes current evidence while purpose/suppression/send remain unverified or blocked', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate);
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  const b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  expect(diff.differences.recorded_channel_changed).toBe(true);
  expect(b.evidence.recorded_channel.state).toBe('RECORDED_DENIED');
  expect(b.evidence.purpose_consent).toBe('UNVERIFIED');
  expect(b.evidence.suppression).toBe('UNVERIFIED');
  expect(diff.differences.send).toBe('BLOCKED');
});
it('same source and review window produces unchanged content and exact IDs', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  expect(diff.comparison.changed).toBe(false);
  expect(a.sha256).toBe(b.sha256);
  expect(diff.differences.plans.every((r) => r.state === 'UNCHANGED')).toBe(
    true,
  );
});
it('a valid future date window stays incomplete evidence and does not infer completed maintenance', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate, {
      from: '2030-01-01',
      through: '2030-01-01',
      as_of: '2026-12-28T12:00:00Z',
      channel: 'email',
    });
  expect(a.evidence.count_is_complete).toBe(false);
  expect(a.evidence.physical_completion).toBe('UNVERIFIED');
  expect(a.evidence.authority.send).toBe(false);
});
it.each([
  {
    from: '2026-02-30',
    through: '2026-03-02',
    as_of: '2026-02-28T12:00:00Z',
    channel: 'email' as const,
  },
  {
    from: '2027-01-01',
    through: '2026-12-01',
    as_of: '2026-12-01T12:00:00Z',
    channel: 'email' as const,
  },
])('invalid maintenance review window %j fails closed', async (input) => {
  const f = await fixture();
  await expect(read(f.sources, f.job, f.gate, input)).rejects.toThrow();
});
it('another authorized property cannot replace the saved comparison source', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    b = await read(f.sources, f.sources.entries[0].target.job_id!, f.gate);
  expect(() => compare(a, b)).toThrow();
});
it('foreign tenant snapshot cannot be compared or adopted', async () => {
  const f = await fixture(0),
    g = await fixture(1),
    a = await read(f.sources, f.job, f.gate),
    b = await read(g.sources, g.job, g.gate);
  expect(() => compare(a, b)).toThrow();
});
it('invalid selected job has no fallback', async () => {
  const f = await fixture();
  await expect(read(f.sources, 'foreign-job', f.gate)).rejects.toThrow();
});
it('competing current comparisons cannot overwrite an already adopted generation', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a);
  savePlan(f);
  const b = await read(f.sources, f.job, f.gate),
    one = compare(a, b),
    two = compare(a, b);
  adoptSavedRevision(s, one.comparison, 0, true);
  expect(() => adoptSavedRevision(s, two.comparison, 0, true)).toThrow();
  expect(readSavedRevisionSelection(s).snapshot).toBe(b);
});
it('further saved plan edits invalidate a prepared comparison before adoption', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a);
  savePlan(f);
  const b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  savePlan(f);
  expect(() => adoptSavedRevision(s, diff.comparison, 0, true)).toThrow();
  expect(readSavedRevisionSelection(s).snapshot).toBe(a);
});
it('reviewer revocation prevents fresh saved reads and adoption', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b),
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() => adoptSavedRevision(s, diff.comparison, 0, true)).toThrow();
  await expect(read(f.sources, f.job, f.gate)).rejects.toThrow();
});
it('actual source change during asynchronous consent read rejects mixed evidence', async () => {
  const f = await fixture(),
    original = f.sources.operations.customerHistory.bind(f.sources.operations);
  let changed = false;
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (org, customer) => {
      const data = await original(org, customer);
      if (!changed) {
        changed = true;
        savePlan(f);
      }
      return data;
    },
  );
  await expect(read(f.sources, f.job, f.gate)).rejects.toThrow();
});
it('window mutation during asynchronous consent read is not silently accepted', async () => {
  const f = await fixture(),
    input = {
      from: '2026-12-28',
      through: '2027-01-25',
      as_of: '2026-12-28T12:00:00Z',
      channel: 'email' as const,
    },
    original = f.sources.operations.customerHistory.bind(f.sources.operations);
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (org, customer) => {
      const data = await original(org, customer);
      input.through = '2027-01-26';
      return data;
    },
  );
  await expect(read(f.sources, f.job, f.gate, input)).rejects.toThrow();
});
it('OFF rejects before source or window getters', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'company', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'];
  await expect(read(sources, 'job')).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('OFF component never exposes source or creates a sender', () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'company', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'];
  expect(
    renderToStaticMarkup(createElement(MaintenanceSavedRevisions, { sources })),
  ).toContain('review is off');
  expect(getter).not.toHaveBeenCalled();
});
it('read-only adoption never writes a plan, sends, enrolls or schedules', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a);
  savePlan(f);
  const b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b),
    before = JSON.stringify(f.sources.property.read(f.org)),
    writers = [
      vi.spyOn(f.sources.property, 'savePlan'),
      vi.spyOn(f.sources.property, 'addVisit'),
      vi.spyOn(f.sources.property, 'saveMaintenance'),
      vi.spyOn(f.sources.operations, 'recordConsent'),
    ],
    network = vi.spyOn(globalThis, 'fetch');
  adoptSavedRevision(s, diff.comparison, 0, true);
  expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
  expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
  expect(network).not.toHaveBeenCalled();
});

it('new read-only maintenance adoption cannot clear an original UNKNOWN continuation hold', async () => {
  const { readMaintenanceAgenda, continueMaintenanceAgenda } =
    await import('../src/lib/workflows/maintenance-agenda');
  const f = await fixture(),
    input = {
      window: {
        from: f.entry.day,
        through: '2027-01-25',
        as_of: f.entry.day + 'T12:00:00Z',
        channel: 'email' as const,
      },
      lead_days: 14,
      overdue_days: 7,
      query: '',
      kind: 'all' as const,
      readiness: 'all' as const,
      job_id: f.job,
      customer_id: '',
      location_id: '',
      purpose: 'recurring_maintenance' as const,
      channel_state: 'all' as const,
    };
  const agenda = await readMaintenanceAgenda(f.sources, input, f.gate),
    row = agenda.rows[0],
    failed = vi.fn(() => {
      throw Error('lost local acknowledgment');
    });
  await expect(
    continueMaintenanceAgenda(agenda, row.key, failed),
  ).rejects.toThrow();
  const a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  adoptSavedRevision(selection, diff.comparison, 0, true);
  const replacement = await readMaintenanceAgenda(f.sources, input, f.gate),
    replay = vi.fn();
  await expect(
    continueMaintenanceAgenda(replacement, row.key, replay),
  ).rejects.toThrow();
  expect(failed).toHaveBeenCalledTimes(1);
  expect(replay).not.toHaveBeenCalled();
});

it('domain adoption explicitly verifies original contact and private follow-up fences before local selection CAS', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a);
  savePlan(f);
  const b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  const result = await adoptDomain(selection, diff, 0, true);
  expect(result.snapshot).toBe(b);
  expect(result.generation).toBe(1);
  expect(b.evidence.source_atomicity).toBe('CAPTURED_NOT_ATOMIC');
});
it('actual private maintenance edit after a saved read blocks domain adoption and stale comparison', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b),
    item = f.sources.property
      .maintenance(f.org, f.entry.target.actor_id)
      .items.find((i) => i.job_id === f.job)!;
  await f.sources.property.saveMaintenance(
    f.org,
    f.entry.target.actor_id,
    item.source,
    item.record.revision,
    {
      priority: 'urgent',
      assignee_id: null,
      follow_up_on: f.entry.day,
      review: 'reviewed',
      note: 'Private changed evidence',
    },
  );
  expect(() => domainCurrent(b)).toThrow();
  expect(() => compare(a, b)).toThrow();
  await expect(adoptDomain(selection, diff, 0, true)).rejects.toThrow();
  expect(readSavedRevisionSelection(selection).snapshot).toBe(a);
});
it('actual recorded consent change after the saved snapshot blocks domain adoption without interpreting it as send authority', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  await expect(adoptDomain(selection, diff, 0, true)).rejects.toThrow();
  expect(readSavedRevisionSelection(selection).snapshot).toBe(a);
  expect(b.evidence.authority.send).toBe(false);
});
it('competing asynchronous domain adoptions admit one selection generation and reject the other', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a);
  savePlan(f);
  const b = await read(f.sources, f.job, f.gate),
    one = compare(a, b),
    two = compare(a, b),
    results = await Promise.allSettled([
      adoptDomain(selection, one, 0, true),
      adoptDomain(selection, two, 0, true),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(readSavedRevisionSelection(selection).generation).toBe(1);
});

it('the shared CAS itself rejects a post-read private follow-up edit through the registered domain fence', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b),
    item = f.sources.property
      .maintenance(f.org, f.entry.target.actor_id)
      .items.find((i) => i.job_id === f.job)!;
  await f.sources.property.saveMaintenance(
    f.org,
    f.entry.target.actor_id,
    item.source,
    item.record.revision,
    {
      priority: 'urgent',
      assignee_id: null,
      follow_up_on: f.entry.day,
      review: 'reviewed',
      note: 'Private CAS fence review',
    },
  );
  expect(() => assertSavedRevisionCurrent(b)).toThrow();
  expect(() => assertSavedRevisionAccess(a)).not.toThrow();
  expect(() =>
    adoptSavedRevision(selection, diff.comparison, 0, true),
  ).toThrow();
  expect(readSavedRevisionSelection(selection).snapshot).toBe(a);
});
it('the shared CAS itself rejects a post-read contact edit and terminal reviewer revocation', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  expect(() => assertSavedRevisionCurrent(b)).toThrow();
  expect(() => assertSavedRevisionAccess(a)).not.toThrow();
  expect(() =>
    adoptSavedRevision(selection, diff.comparison, 0, true),
  ).toThrow();
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  await expect(adoptDomain(selection, diff, 0, true)).rejects.toThrow();
});
