import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFollowUpDesk,
  prepareFollowUpAdmission,
  reconcileFollowUpAdmission,
  openFollowUpSource,
  assertFollowUpCurrentNow,
  followUpAttemptState,
  type FollowUpDeskInput,
  type FollowUpProposalInput,
} from '../src/lib/workflows/follow-up-admission';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input: FollowUpDeskInput = {
      window: {
        from: '2026-12-28',
        through: '2027-01-25',
        as_of: '2026-12-28T12:00:00.000Z',
        channel: 'email',
      },
      lead_days: 14,
      overdue_days: 7,
      query: '',
      kind: 'all',
      readiness: 'all',
      job_id: '',
      customer_id: '',
      location_id: '',
    };
  return { gate, sources, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) => readFollowUpDesk(f.sources, f.input, f.gate);
function proposed(
  view: Awaited<ReturnType<typeof read>>,
): FollowUpProposalInput {
  const c =
    view.candidates.find((c) => c.staff_planning_eligible) ??
    view.candidates[0];
  return {
    candidate_key: c.key,
    proposed_on: '2027-01-15',
    purpose: 'service_follow_up',
    plan_kind: 'follow_up',
  };
}
it.each([0, 1, 2])(
  'brand %s completes two explicit source-bound review steps without messages or mutations',
  async (index) => {
    const f = await fixture(index),
      before = f.sources.property.read(f.sources.company.id),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'addVisit'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
      ],
      network = vi.spyOn(globalThis, 'fetch'),
      v = await read(f),
      p = proposed(v);
    expect(v.jobs).toHaveLength(4);
    expect(v.candidates.length).toBeGreaterThan(4);
    expect(followUpAttemptState(v, p.candidate_key)).toBe('NOT_REVIEWED');
    const r = await prepareFollowUpAdmission(v, p, f.gate);
    expect(r).toMatchObject({
      status: 'BLOCKED_REVIEW',
      decision: 'BLOCKED',
      recipient: null,
      provider_request: null,
      authoritative_send_gate: 'ABSENT',
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      recurring_enrollment: 'UNVERIFIED',
      current_channel_authority: 'UNKNOWN',
      consent_currentness: 'CAPTURED_NOT_ATOMIC',
    });
    expect(Object.values(r.authority).every((a) => a === false)).toBe(true);
    expect(r.proposal).toMatchObject({
      proposed_on: p.proposed_on,
      purpose: p.purpose,
      authority: 'UNSAVED_HUMAN_PROPOSAL',
    });
    expect(r.recorded_due_on).toBe(
      v.candidates.find((c) => c.key === p.candidate_key)!.selection.due_on,
    );
    expect(r.planning_sha256).toBe(v.planning_integrity.sha256);
    expect(r.integrity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(r.proposal)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(
      /@example.invalid|555010|unit_cost|payroll|margin|supplier|private_notes|internal_notes|PRIVATE/,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(followUpAttemptState(v, p.candidate_key)).toBe('BLOCKED_REVIEW');
    expect((await reconcileFollowUpAdmission(v, p.candidate_key)).status).toBe(
      'EXACT_BLOCKED_REVIEW',
    );
  },
);
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'purpose %s cannot create authority even with historical channel allowance',
  async (purpose) => {
    const f = await fixture(),
      v = await read(f),
      r = await prepareFollowUpAdmission(
        v,
        { ...proposed(v), purpose, plan_kind: 'renewal' },
        f.gate,
      );
    expect(r.proposal.purpose).toBe(purpose);
    expect(r.renewal_terms).toBe('UNKNOWN');
    expect(r.purpose_consent).toBe('UNVERIFIED');
    expect(r.suppression).toBe('UNVERIFIED');
    expect(r.missing_gates).toContain('ATOMIC_CONSENT_AT_SEND');
    expect(r.missing_gates).toContain('SUPPRESSION');
    expect(r.authority.send).toBe(false);
  },
);
it('actual channel denial stays denied evidence and cannot grant renewal or send permission', async () => {
  const f = await fixture();
  await f.sources.operations.recordConsent(
    f.sources.company.id,
    f.sources.entries[0].target.customer_id,
    false,
    false,
  );
  const v = await read(f),
    c = v.candidates.find(
      (c) => c.context.customer_id === f.sources.entries[0].target.customer_id,
    )!,
    r = await prepareFollowUpAdmission(
      v,
      { ...proposed(v), candidate_key: c.key },
      f.gate,
    );
  expect(r.observed_contact_v1_state).toBe('RECORDED_DENIED');
  expect(r.current_channel_authority).toBe('UNKNOWN');
  expect(r.decision).toBe('BLOCKED');
  expect(r.recipient).toBeNull();
});
it('missing authoritative suppression is explicitly unavailable rather than assumed clear', async () => {
  const f = await fixture(),
    v = await read(f),
    r = await prepareFollowUpAdmission(v, proposed(v), f.gate);
  expect(r.suppression).toBe('UNVERIFIED');
  expect(r.authoritative_send_gate).toBe('ABSENT');
  expect(r.authority.resolve_recipient).toBe(false);
  expect(r.provider_request).toBeNull();
});
it('immutable review remains original after input mutation and reconciliation becomes UNKNOWN', async () => {
  const f = await fixture(),
    v = await read(f),
    p = proposed(v),
    r = await prepareFollowUpAdmission(v, p, f.gate),
    bytes = JSON.stringify(r);
  p.proposed_on = '2027-01-16';
  expect((await reconcileFollowUpAdmission(v, p.candidate_key)).status).toBe(
    'UNKNOWN',
  );
  expect(JSON.stringify(r)).toBe(bytes);
  await expect(prepareFollowUpAdmission(v, { ...p }, f.gate)).rejects.toThrow(
    'Existing',
  );
});
it('duplicate and changed-purpose attempts cannot bypass source hold through a new desk or container', async () => {
  const f = await fixture(),
    v = await read(f),
    p = proposed(v);
  await prepareFollowUpAdmission(v, p, f.gate);
  await expect(
    prepareFollowUpAdmission(v, { ...p, purpose: 'marketing' }, f.gate),
  ).rejects.toThrow('Existing');
  const second = await readFollowUpDesk(
    { ...f.sources },
    { ...f.input, window: { ...f.input.window } },
    f.gate,
  );
  expect(followUpAttemptState(second, p.candidate_key)).toBe('BLOCKED_REVIEW');
  await expect(
    prepareFollowUpAdmission(second, { ...p }, f.gate),
  ).rejects.toThrow('Existing');
  expect(
    (await reconcileFollowUpAdmission(second, p.candidate_key)).status,
  ).toBe('UNKNOWN');
});
it('concurrent staff inspections consume only one source-bound in-memory attempt', async () => {
  const f = await fixture(),
    v = await read(f),
    p = proposed(v),
    all = await Promise.allSettled([
      prepareFollowUpAdmission(v, p, f.gate),
      prepareFollowUpAdmission(v, { ...p }, f.gate),
    ]);
  expect(all.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(all.filter((x) => x.status === 'rejected')).toHaveLength(1);
  expect(followUpAttemptState(v, p.candidate_key)).toBe('BLOCKED_REVIEW');
});
it('lost read retains UNKNOWN and forbids a new view or proposed date retry', async () => {
  const f = await fixture(),
    v = await read(f),
    p = proposed(v),
    spy = vi
      .spyOn(f.sources.operations, 'customerHistory')
      .mockRejectedValue(Error('Read lost'));
  await expect(prepareFollowUpAdmission(v, p, f.gate)).rejects.toThrow();
  expect(followUpAttemptState(v, p.candidate_key)).toBe('UNKNOWN');
  spy.mockRestore();
  expect((await reconcileFollowUpAdmission(v, p.candidate_key)).status).toBe(
    'UNKNOWN',
  );
  const second = await read(f);
  await expect(
    prepareFollowUpAdmission(
      second,
      { ...p, proposed_on: '2027-01-20' },
      f.gate,
    ),
  ).rejects.toThrow('Existing');
});
it('foreign/hidden candidates and copied desks cannot prepare or navigate', async () => {
  const f = await fixture(),
    v = await read(f),
    p = proposed(v);
  await expect(
    prepareFollowUpAdmission(v, { ...p, candidate_key: 'foreign' }, f.gate),
  ).rejects.toThrow('Exact displayed');
  await expect(
    prepareFollowUpAdmission(structuredClone(v), p, f.gate),
  ).rejects.toThrow('Exact retained');
  await expect(openFollowUpSource(v, 'foreign')).rejects.toThrow();
  expect(
    (await reconcileFollowUpAdmission(structuredClone(v), p.candidate_key))
      .status,
  ).toBe('UNKNOWN');
});
it('exact source navigation preserves company, customer, property, job, issued version and occurrence', async () => {
  const f = await fixture(),
    v = await read(f),
    c = v.candidates[0],
    target = await openFollowUpSource(v, c.key);
  expect(target).toMatchObject({
    ...c.context,
    authority: 'NAVIGATION_ONLY',
    source: c.selection,
  });
});
it.each(['job_id', 'customer_id', 'location_id'] as const)(
  'foreign %s filter denies rather than broadening records',
  async (key) => {
    const f = await fixture();
    f.input[key] = 'foreign';
    await expect(read(f)).rejects.toThrow();
  },
);
it('wrong property association and foreign repository are denied', async () => {
  const f = await fixture();
  f.sources.entries[0].target.location_id =
    f.sources.entries[1].target.location_id;
  await expect(read(f)).rejects.toThrow();
  const a = await fixture(),
    b = await fixture(1);
  a.sources.property = b.sources.property;
  await expect(read(a)).rejects.toThrow();
});
it('actual source edits stale opportunity and withhold exact navigation', async () => {
  const f = await fixture(),
    v = await read(f),
    p = f.sources.property
      .read(f.sources.company.id)
      .plans.find((p) => p.id === f.sources.entries[0].plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...p,
    name: 'Changed plan',
  });
  expect(() => assertFollowUpCurrentNow(v)).toThrow();
  await expect(openFollowUpSource(v, v.candidates[0].key)).rejects.toThrow();
  await expect(
    prepareFollowUpAdmission(v, proposed(v), f.gate),
  ).rejects.toThrow();
});
it('current reviewer revocation denies staff preparation', async () => {
  const f = await fixture(),
    actor = f.sources.company.id + '-estimator';
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.sources.entries.forEach((e) => (e.target.actor_id = actor));
  const v = await read(f);
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  await expect(
    prepareFollowUpAdmission(v, proposed(v), f.gate),
  ).rejects.toThrow();
  expect(() => assertFollowUpCurrentNow(v)).toThrow();
});
it('actual channel withdrawal invalidates immutable review with no replay', async () => {
  const f = await fixture(),
    v = await read(f),
    p = proposed(v),
    r = await prepareFollowUpAdmission(v, p, f.gate),
    bytes = JSON.stringify(r);
  await f.sources.operations.recordConsent(
    f.sources.company.id,
    r.context.customer_id,
    false,
    false,
  );
  expect((await reconcileFollowUpAdmission(v, p.candidate_key)).status).toBe(
    'UNKNOWN',
  );
  expect(JSON.stringify(r)).toBe(bytes);
  await expect(prepareFollowUpAdmission(v, p, f.gate)).rejects.toThrow();
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('both review stages preserve default-OFF gate %s', async (gate) => {
  const f = await fixture();
  await expect(readFollowUpDesk(f.sources, f.input, gate)).rejects.toThrow();
  const v = await read(f);
  await expect(
    prepareFollowUpAdmission(v, proposed(v), gate),
  ).rejects.toThrow();
});
it.each(['getter', 'serializer', 'symbol'] as const)(
  'strict proposal %s rejects without invoking hook or reserving',
  async (kind) => {
    const f = await fixture(),
      v = await read(f),
      p = proposed(v),
      hook = vi.fn();
    if (kind === 'getter')
      Object.defineProperty(p, 'proposed_on', { get: hook });
    if (kind === 'serializer') Object.assign(p, { toJSON: hook });
    if (kind === 'symbol') Object.assign(p, { [Symbol('hook')]: true });
    await expect(prepareFollowUpAdmission(v, p, f.gate)).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
    expect(followUpAttemptState(v, p.candidate_key)).toBe('NOT_REVIEWED');
  },
);
it('desk getters are rejected without execution', async () => {
  const f = await fixture(),
    hook = vi.fn();
  Object.defineProperty(f.input.window, 'from', { get: hook });
  await expect(read(f)).rejects.toThrow();
  expect(hook).not.toHaveBeenCalled();
});
it.each(['date', 'purpose', 'kind'] as const)(
  'invalid %s proposal fails before one-use claim',
  async (kind) => {
    const f = await fixture(),
      v = await read(f),
      p = proposed(v);
    if (kind === 'date') p.proposed_on = '2026-02-30';
    if (kind === 'purpose') p.purpose = 'send_now' as typeof p.purpose;
    if (kind === 'kind') p.plan_kind = 'enroll' as typeof p.plan_kind;
    await expect(prepareFollowUpAdmission(v, p, f.gate)).rejects.toThrow();
    expect(followUpAttemptState(v, p.candidate_key)).toBe('NOT_REVIEWED');
  },
);
it.each(['proposal', 'window', 'gate', 'same-id-container', 'model'] as const)(
  'final hash rejects live %s changes and retains UNKNOWN',
  async (kind) => {
    const f = await fixture(),
      v = await read(f),
      p = proposed(v),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_FOLLOW_UP_ADMISSION_BOUNDARY_REVIEW')
      ) {
        changed = true;
        if (kind === 'proposal') p.proposed_on = '2027-01-16';
        if (kind === 'window') f.input.window.channel = 'sms';
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'same-id-container')
          f.sources.entries = [...f.sources.entries];
        if (kind === 'model')
          f.sources.entries[0].customerModel =
            f.sources.entries[1].customerModel;
      }
      return value;
    });
    await expect(prepareFollowUpAdmission(v, p, f.gate)).rejects.toThrow();
    expect(changed).toBe(true);
    expect(followUpAttemptState(v, p.candidate_key)).toBe('UNKNOWN');
  },
);
it('last canonical contact read detects withdrawal after hashing and cannot return a successful review', async () => {
  const f = await fixture(),
    v = await read(f),
    p = proposed(v),
    customer = v.candidates.find((c) => c.key === p.candidate_key)!.context
      .customer_id,
    digest = crypto.subtle.digest.bind(crypto.subtle),
    history = f.sources.operations.customerHistory.bind(f.sources.operations);
  let finalRead = false,
    changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_FOLLOW_UP_ADMISSION_BOUNDARY_REVIEW')
    )
      finalRead = true;
    return value;
  });
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (org, id) => {
      const value = await history(org, id);
      if (finalRead && !changed && id === customer) {
        changed = true;
        await f.sources.operations.recordConsent(org, id, false, false);
      }
      return value;
    },
  );
  await expect(prepareFollowUpAdmission(v, p, f.gate)).rejects.toThrow();
  expect(changed).toBe(true);
  expect(followUpAttemptState(v, p.candidate_key)).toBe('UNKNOWN');
});
it('final reader runs after hashing even when historical evidence is stable', async () => {
  const f = await fixture(),
    v = await read(f),
    digest = crypto.subtle.digest.bind(crypto.subtle),
    history = f.sources.operations.customerHistory.bind(f.sources.operations);
  let hashed = false,
    readsAfterHash = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_FOLLOW_UP_ADMISSION_BOUNDARY_REVIEW')
    )
      hashed = true;
    return value;
  });
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const value = await history(...args);
      if (hashed) readsAfterHash++;
      return value;
    },
  );
  const r = await prepareFollowUpAdmission(v, proposed(v), f.gate);
  expect(readsAfterHash).toBe(2);
  expect(r.decision).toBe('BLOCKED');
});
it('literal empty search does not claim complete history or repair completion', async () => {
  const f = await fixture();
  f.input.query = 'missing [literal]';
  const v = await read(f);
  expect(v.candidates).toHaveLength(0);
  expect(v.count_is_complete).toBe(false);
  expect(v.communication_authority).toBe('BLOCKED');
  expect(v.renewal_terms).toBe('UNKNOWN');
});

it('unretained view getters are never invoked by status or reconciliation', async () => {
  const hook = vi.fn(),
    view = Object.defineProperty({}, 'candidates', { get: hook }) as Awaited<
      ReturnType<typeof read>
    >;
  expect(followUpAttemptState(view, 'foreign')).toBe('UNKNOWN');
  expect((await reconcileFollowUpAdmission(view, 'foreign')).status).toBe(
    'UNKNOWN',
  );
  expect(hook).not.toHaveBeenCalled();
});
