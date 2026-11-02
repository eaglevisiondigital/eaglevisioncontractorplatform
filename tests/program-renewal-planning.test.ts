import { afterEach, expect, it, vi } from 'vitest';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareMaintenanceVisitProposal,
  readMaintenanceRenewalPlanning,
  reconcileMaintenanceVisitProposal,
  type MaintenanceVisitProposal,
} from '../src/lib/maintenance-renewal-planning';

const query = () => ({
  from: '2026-10-20',
  through: '2026-11-30',
  as_of: '2026-11-01T20:00:00Z',
  channel: 'email' as const,
});
const admission = () => ({
  enabled: true,
  confirmed: true,
  lead_days: 7,
  overdue_days: 3,
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function setup(index = 0, now = '2026-11-01T18:00:00Z') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner',
    operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  await prepareMaintenanceExamples(repo, org, actor);
  const item = repo.maintenance(org, actor).items[0],
    boundary = {
      organization_id: org,
      customer_id: item.source.customer_id,
      location_id: item.source.location_id,
    },
    plan = repo.read(org).plans.find((p) => p.id === item.plan_id)!;
  repo.savePlan(org, {
    ...plan,
    cadence: 'once',
    starts_on: '2026-11-03',
    timezone: 'America/Chicago',
  });
  await operations.recordConsent(org, boundary.customer_id, true, false);
  const read = (config = admission(), q = query(), who = actor) =>
    readMaintenanceRenewalPlanning(repo, boundary, who, q, config);
  const selection = async () =>
    (await read()).candidates.find(
      (c) =>
        c.selection.source.plan_id === plan.id &&
        c.selection.kind === 'inspection_occurrence',
    )!.selection;
  const prepare = async (config = admission()) =>
    prepareMaintenanceVisitProposal(
      repo,
      boundary,
      actor,
      query(),
      await selection(),
      config,
    );
  const reconcile = (proposal: unknown, config = admission(), who = actor) =>
    reconcileMaintenanceVisitProposal(repo, who, proposal, config);
  return {
    company,
    org,
    actor,
    operations,
    repo,
    item,
    boundary,
    plan,
    read,
    selection,
    prepare,
    reconcile,
  };
}
async function state(s: Awaited<ReturnType<typeof setup>>) {
  return {
    property: s.repo.read(s.org),
    history: await s.operations.customerHistory(s.org, s.boundary.customer_id),
    jobs: await s.repo.estimates.jobs(s.org),
  };
}
it.each([0, 1, 2])(
  'company%s: prepares only exact real-source, immutable planning evidence without business side effects',
  async (index) => {
    const s = await setup(index),
      before = await state(s),
      selected = await s.selection(),
      packet = await s.prepare();
    expect(packet.snapshot.selection).toEqual(selected);
    expect(packet.snapshot.selection.source.plan_revision).toBe(
      s.repo.read(s.org).plans.find((p) => p.id === s.plan.id)!.revision,
    );
    expect(packet.snapshot.boundary).toEqual(s.boundary);
    expect(packet.snapshot.reviewer_id).toBe(s.actor);
    expect(packet.snapshot.channel_reference.id).toBe(
      before.history.consents[0].id,
    );
    expect(packet).toMatchObject({
      version: 'maintenance-visit-proposal/v1',
      scope: 'STAFF_PLANNING_ONLY',
      renewal_terms: 'UNKNOWN',
      renewal_anchor: null,
      agreement_id: null,
      scheduling_authority: 'BLOCKED',
      message_authority: 'BLOCKED',
      billing_authority: 'BLOCKED',
      recipient: null,
      provider_request: null,
    });
    expect(packet.id).toBe('maintenance-visit-proposal:' + packet.sha256);
    expect(packet.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.snapshot.selection.source)).toBe(true);
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|internal_notes|supplier|payroll|margin|@example|recorded_by|email_allowed/,
    );
    expect(await s.reconcile(packet)).toMatchObject({
      status: 'CURRENT',
      proposal_id: packet.id,
      replacement: null,
      scheduling_authority: 'BLOCKED',
      message_authority: 'BLOCKED',
    });
    expect(await state(s)).toEqual(before);
  },
);
it('same source and horizon produce the same stable identity across repeated and concurrent read preparation', async () => {
  const s = await setup(),
    a = await s.prepare(),
    [b, c] = await Promise.all([s.prepare(), s.prepare()]);
  expect(a).toEqual(b);
  expect(c.id).toBe(a.id);
});
it.each([
  { enabled: false },
  { confirmed: false },
  { enabled: 'true' },
  { confirmed: 1 },
  { lead_days: 31 },
  { overdue_days: 94 },
  { lead_days: 0.5 },
  { overdue_days: Number.NaN },
])(
  'default-denies invalid admission %j before any source or CRM history read',
  async (patch) => {
    const s = await setup(),
      config = admission(),
      read = vi.spyOn(s.repo, 'read'),
      history = vi.spyOn(s.operations, 'customerHistory');
    Object.assign(config, patch);
    await expect(s.read(config)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  },
);
it('connected mode rejects before CRM history or property reads', async () => {
  const operations = new Operations(false),
    repo = new PropertyRepository(operations),
    history = vi.spyOn(operations, 'customerHistory'),
    read = vi.spyOn(repo, 'read');
  await expect(
    readMaintenanceRenewalPlanning(
      repo,
      {
        organization_id: sampleCompanies[0].id,
        customer_id: crypto.randomUUID(),
        location_id: crypto.randomUUID(),
      },
      'owner',
      query(),
      admission(),
    ),
  ).rejects.toThrow('disabled');
  expect(history).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
it.each(['boundary', 'window', 'admission', 'selection'] as const)(
  'never invokes caller %s getters or serializers',
  async (mode) => {
    const s = await setup(),
      b = { ...s.boundary },
      q = query(),
      config = admission(),
      selected = await s.selection(),
      getter = vi.fn(() => {
        throw Error('PRIVATE');
      }),
      serializer = vi.fn(() => 'PRIVATE');
    Object.assign(config, { toJSON: serializer, private_note: 'PRIVATE' });
    if (mode === 'boundary')
      Object.defineProperty(b, 'customer_id', { get: getter });
    if (mode === 'window') Object.defineProperty(q, 'channel', { get: getter });
    if (mode === 'admission')
      Object.defineProperty(config, 'confirmed', { get: getter });
    if (mode === 'selection') {
      const clone = structuredClone(selected);
      Object.defineProperty(clone.source, 'plan_revision', { get: getter });
      await expect(
        prepareMaintenanceVisitProposal(s.repo, b, s.actor, q, clone, config),
      ).rejects.toThrow('Primitive');
    } else
      await expect(
        readMaintenanceRenewalPlanning(s.repo, b, s.actor, q, config),
      ).rejects.toThrow('Primitive');
    expect(getter).not.toHaveBeenCalled();
    expect(serializer).not.toHaveBeenCalled();
    expect(Object.isFrozen(config)).toBe(false);
  },
);
it('ignores private caller extras without invoking or freezing them', async () => {
  const s = await setup(),
    selected = structuredClone(await s.selection()),
    fn = vi.fn(() => 'PRIVATE');
  Object.assign(selected, { private_note: 'PRIVATE', toJSON: fn });
  Object.setPrototypeOf(selected.source, { toJSON: fn });
  const p = await prepareMaintenanceVisitProposal(
    s.repo,
    s.boundary,
    s.actor,
    query(),
    selected,
    admission(),
  );
  expect(JSON.stringify(p)).not.toContain('PRIVATE');
  expect(fn).not.toHaveBeenCalled();
  expect(Object.isFrozen(selected)).toBe(false);
});
it.each(['customer', 'property', 'organization'] as const)(
  'rejects an incorrect actual %s association',
  async (mode) => {
    const s = await setup(),
      b = { ...s.boundary };
    if (mode === 'customer') b.customer_id = crypto.randomUUID();
    if (mode === 'property') b.location_id = crypto.randomUUID();
    if (mode === 'organization') b.organization_id = sampleCompanies[1].id;
    await expect(
      readMaintenanceRenewalPlanning(s.repo, b, s.actor, query(), admission()),
    ).rejects.toThrow();
  },
);
it.each(['foreign', 'field', 'inactive'] as const)(
  'rejects %s staff and never invents role authority',
  async (mode) => {
    const s = await setup(),
      actor =
        mode === 'foreign'
          ? sampleCompanies[1].id + '-owner'
          : s.org + '-field';
    if (mode === 'inactive')
      await s.operations.manageMember(
        s.org,
        actor,
        false,
        'admin',
        'office_manager',
      );
    await expect(s.read(admission(), query(), actor)).rejects.toThrow(
      'reviewer',
    );
  },
);
it('missing consent remains UNKNOWN and cannot prepare a proposal', async () => {
  const s = await setup(),
    h = await s.operations.customerHistory(s.org, s.boundary.customer_id);
  h.consents = [];
  vi.spyOn(s.operations, 'customerHistory').mockResolvedValue(h);
  const rows = await s.read();
  expect(
    rows.candidates.every(
      (c) => !c.can_prepare_visit_proposal && c.planning_status === 'UNKNOWN',
    ),
  ).toBe(true);
  await expect(s.prepare()).rejects.toThrow('eligible');
});
it('current channel denial is separate from unverified purpose and blocks further proposal use', async () => {
  const s = await setup(),
    proposal = await s.prepare();
  vi.setSystemTime(new Date('2026-11-01T18:01:00Z'));
  await s.operations.recordConsent(s.org, s.boundary.customer_id, false, true);
  expect(
    (await s.read()).candidates.find(
      (c) => c.selection.source.plan_id === s.plan.id,
    ),
  ).toMatchObject({
    planning_status: 'CHANNEL_DENIED',
    can_prepare_visit_proposal: false,
    message_authority: 'BLOCKED',
  });
  await expect(s.prepare()).rejects.toThrow('eligible');
  expect(await s.reconcile(proposal)).toMatchObject({
    status: 'STALE',
    proposal_id: proposal.id,
    replacement: null,
  });
});
it('an exact draft visit blocks duplicate planning without proving completion and stales the earlier proposal', async () => {
  const s = await setup(),
    proposal = await s.prepare(),
    visit = s.repo.addVisit(s.org, s.plan.id, '2026-11-03');
  expect(
    (await s.read()).candidates.find(
      (c) => c.selection.source.plan_id === s.plan.id,
    ),
  ).toMatchObject({
    planning_status: 'EXACT_VISIT_RECORDED',
    can_prepare_visit_proposal: false,
    exact_visits: [
      {
        id: visit.id,
        plan_id: s.plan.id,
        revision: visit.revision,
        on: '2026-11-03',
        status: 'draft',
      },
    ],
  });
  expect(await s.reconcile(proposal)).toMatchObject({
    status: 'STALE',
    replacement: null,
  });
  await expect(s.prepare()).rejects.toThrow('eligible');
});
it('a same-property/date visit for another plan does not suppress the selected exact plan', async () => {
  const s = await setup(),
    context = s.repo
      .read(s.org)
      .contexts.find((c) => c.location_id === s.boundary.location_id)!,
    other = s.repo.createPlan(s.org, context, 'Another actual plan');
  s.repo.addVisit(s.org, other.id, '2026-11-03');
  expect((await s.prepare()).snapshot.selection.source.plan_id).toBe(s.plan.id);
});
it('ambiguous exact visits remain UNKNOWN and retain the existing proposal identity during reconciliation', async () => {
  const s = await setup(),
    proposal = await s.prepare(),
    visit = s.repo.addVisit(s.org, s.plan.id, '2026-11-03'),
    state = s.repo.read(s.org);
  state.visits.push({ ...visit, id: crypto.randomUUID() });
  vi.spyOn(s.repo, 'read').mockReturnValue(state);
  expect(
    (await s.read()).candidates.find(
      (c) => c.selection.source.plan_id === s.plan.id,
    ),
  ).toMatchObject({
    planning_status: 'UNKNOWN',
    can_prepare_visit_proposal: false,
  });
  expect(await s.reconcile(proposal)).toMatchObject({
    status: 'UNKNOWN',
    proposal_id: proposal.id,
    replacement: null,
  });
});
it('exact manual follow-up retains immutable published finding/version plus current review revision', async () => {
  const s = await setup();
  await s.repo.saveMaintenance(
    s.org,
    s.actor,
    s.item.source,
    s.item.record.revision,
    {
      priority: 'high',
      assignee_id: null,
      review: 'pending',
      follow_up_on: '2026-11-04',
      note: 'PRIVATE supplier and employee cost notes',
    },
  );
  const row = (await s.read()).candidates.find(
    (c) =>
      c.selection.kind === 'staff_follow_up' &&
      c.selection.source.finding_id === s.item.source.finding_id,
  )!;
  const beforeReport = s.repo
      .read(s.org)
      .reports.find((r) => r.id === s.item.source.report_id)!,
    p = await prepareMaintenanceVisitProposal(
      s.repo,
      s.boundary,
      s.actor,
      query(),
      row.selection,
      admission(),
    );
  expect(p.snapshot.selection.source).toMatchObject({
    report_id: s.item.source.report_id,
    report_version: s.item.source.report_version,
    finding_id: s.item.source.finding_id,
    maintenance_revision: 1,
  });
  expect(JSON.stringify(p)).not.toContain('PRIVATE');
  expect(
    s.repo.read(s.org).reports.find((r) => r.id === beforeReport.id),
  ).toEqual(beforeReport);
});
it('uses the existing anchored monthly recurrence rather than inventing a renewal date', async () => {
  const s = await setup(0, '2026-02-01T18:00:00Z'),
    plan = s.repo.read(s.org).plans.find((p) => p.id === s.plan.id)!;
  s.repo.savePlan(s.org, {
    ...plan,
    starts_on: '2026-01-31',
    cadence: 'monthly',
  });
  const q = {
      ...query(),
      from: '2026-02-01',
      through: '2026-03-31',
      as_of: '2026-02-28T20:00:00Z',
    },
    rows = await s.read({ ...admission(), lead_days: 30 }, q);
  const dates = rows.candidates
    .filter(
      (c) =>
        c.selection.source.plan_id === s.plan.id &&
        c.selection.kind === 'inspection_occurrence',
    )
    .map((c) => c.selection.due_on);
  expect(dates).toEqual(['2026-02-28', '2026-03-31']);
  const feb = rows.candidates.find((c) => c.selection.due_on === '2026-02-28')!;
  const p = await prepareMaintenanceVisitProposal(
    s.repo,
    s.boundary,
    s.actor,
    q,
    feb.selection,
    { ...admission(), lead_days: 30 },
  );
  expect(p).toMatchObject({
    renewal_terms: 'UNKNOWN',
    renewal_anchor: null,
    agreement_id: null,
  });
});
it('calendar-day horizon follows the plan timezone at a UTC boundary and on DST transition', async () => {
  const s = await setup(),
    plan = s.repo.read(s.org).plans.find((p) => p.id === s.plan.id)!;
  s.repo.savePlan(s.org, {
    ...plan,
    starts_on: '2026-11-01',
    timezone: 'America/Los_Angeles',
  });
  const q = { ...query(), as_of: '2026-11-02T00:30:00Z' },
    rows = await s.read({ ...admission(), lead_days: 0, overdue_days: 0 }, q),
    row = rows.candidates.find(
      (c) =>
        c.selection.source.plan_id === s.plan.id &&
        c.selection.kind === 'inspection_occurrence',
    )!;
  expect(row.can_prepare_visit_proposal).toBe(true);
  expect(row.selection.due_on).toBe('2026-11-01');
  await expect(
    prepareMaintenanceVisitProposal(
      s.repo,
      s.boundary,
      s.actor,
      q,
      row.selection,
      { ...admission(), lead_days: 0, overdue_days: 0 },
    ),
  ).resolves.toMatchObject({
    snapshot: {
      selection: { due_on: '2026-11-01', timezone: 'America/Los_Angeles' },
    },
  });
});
it.each(['plan', 'consent', 'confirmation', 'horizon', 'role'] as const)(
  'blocks actual %s changes during asynchronous reads',
  async (mode) => {
    const s = await setup(),
      selected = await s.selection(),
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
    let calls = 0;
    vi.spyOn(s.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const history = await original(...args);
        if (++calls === 1) {
          if (mode === 'plan') {
            const p = s.repo.read(s.org).plans.find((p) => p.id === s.plan.id)!;
            s.repo.savePlan(s.org, { ...p, starts_on: '2026-11-04' });
          }
          if (mode === 'consent') {
            vi.setSystemTime(new Date('2026-11-01T18:01:00Z'));
            await s.operations.recordConsent(
              s.org,
              s.boundary.customer_id,
              false,
              false,
            );
          }
          if (mode === 'confirmation') config.confirmed = false;
          if (mode === 'horizon') config.lead_days = 30;
          if (mode === 'role')
            await s.operations.manageMember(
              s.org,
              actor,
              true,
              'staff',
              'field_staff',
            );
        }
        return history;
      },
    );
    await expect(
      prepareMaintenanceVisitProposal(
        s.repo,
        s.boundary,
        mode === 'role' ? actor : s.actor,
        query(),
        selected,
        config,
      ),
    ).rejects.toThrow();
  },
);
it.each(['plan', 'confirmation'] as const)(
  'rechecks %s after the actual hash await before returning a proposal',
  async (mode) => {
    const s = await setup(),
      selected = await s.selection(),
      config = admission(),
      original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const hash = await original(...args);
      if (mode === 'confirmation') config.confirmed = false;
      else {
        const p = s.repo.read(s.org).plans.find((p) => p.id === s.plan.id)!;
        s.repo.savePlan(s.org, { ...p, name: p.name + ' changed' });
      }
      return hash;
    });
    await expect(
      prepareMaintenanceVisitProposal(
        s.repo,
        s.boundary,
        s.actor,
        query(),
        selected,
        config,
      ),
    ).rejects.toThrow(/changed|confirmation/);
  },
);
it('a later saved plan revision stales but never mutates the original source-bound proposal', async () => {
  const s = await setup(),
    p = await s.prepare(),
    original = structuredClone(p),
    plan = s.repo.read(s.org).plans.find((x) => x.id === s.plan.id)!;
  s.repo.savePlan(s.org, { ...plan, name: 'Changed actual plan' });
  expect(await s.reconcile(p)).toMatchObject({
    status: 'STALE',
    proposal_id: p.id,
    replacement: null,
  });
  expect(p).toEqual(original);
});
it.each(['hash', 'extra', 'symbol', 'getter', 'source', 'authority'] as const)(
  'tampered or malformed %s retained evidence stays UNKNOWN without caller execution or replacement',
  async (mode) => {
    const s = await setup(),
      p = structuredClone(await s.prepare()),
      getter = vi.fn(() => {
        throw Error('PRIVATE');
      });
    if (mode === 'hash') p.sha256 = '0'.repeat(64);
    if (mode === 'extra')
      Object.assign(p.snapshot.selection.source, { private_notes: 'PRIVATE' });
    if (mode === 'symbol')
      Object.assign(p.snapshot, { [Symbol('private')]: 'PRIVATE' });
    if (mode === 'getter')
      Object.defineProperty(p.snapshot.selection.source, 'plan_id', {
        get: getter,
      });
    if (mode === 'source') p.snapshot.selection.source.plan_revision++;
    if (mode === 'authority')
      Object.assign(p, { scheduling_authority: 'ALLOWED' });
    expect(await s.reconcile(p)).toEqual({
      status: 'UNKNOWN',
      proposal_id: null,
      scheduling_authority: 'BLOCKED',
      message_authority: 'BLOCKED',
      billing_authority: 'BLOCKED',
      replacement: null,
    });
    expect(getter).not.toHaveBeenCalled();
    expect(Object.isFrozen(p)).toBe(false);
  },
);
it('reconciliation never replaces an unavailable exact source with a newer source and does not replay preparation', async () => {
  const s = await setup(),
    p = await s.prepare(),
    state = s.repo.read(s.org);
  state.plans = state.plans.filter((x) => x.id !== s.plan.id);
  state.reports = [];
  state.visits = [];
  vi.spyOn(s.repo, 'read').mockReturnValue(state);
  expect(await s.reconcile(p)).toMatchObject({
    status: 'UNKNOWN',
    proposal_id: p.id,
    replacement: null,
  });
});
it('a different reviewer or newly supplied horizon cannot rebind the retained proposal', async () => {
  const s = await setup(),
    p = await s.prepare();
  expect(await s.reconcile(p, admission(), s.org + '-field')).toMatchObject({
    status: 'UNKNOWN',
    proposal_id: null,
  });
  expect(await s.reconcile(p, { ...admission(), lead_days: 8 })).toMatchObject({
    status: 'UNKNOWN',
    proposal_id: null,
  });
});
it('known ledger absence and uncertain read failure never become successful or failed execution evidence', async () => {
  const s = await setup(),
    p = await s.prepare(),
    before = await state(s);
  vi.spyOn(s.operations, 'customerHistory').mockRejectedValue(
    Error('lost read acknowledgement'),
  );
  expect(await s.reconcile(p)).toMatchObject({
    status: 'UNKNOWN',
    proposal_id: p.id,
    replacement: null,
  });
  expect(s.repo.read(s.org)).toEqual(before.property);
  expect(Object.keys(p).sort()).not.toContain('receipt');
});
it('captured proposal types have no execution, customer obligation, or delivery capability', async () => {
  const s = await setup(),
    p: MaintenanceVisitProposal = await s.prepare(),
    text = JSON.stringify(p);
  expect(text).not.toMatch(
    /invoice_id|contract_id|payment_id|recipient_address|customer_url|signed_url|storage_url|dispatch|work_order/,
  );
  expect(
    (await s.read()).candidates.every(
      (r) =>
        r.message_authority === 'BLOCKED' &&
        r.billing_authority === 'BLOCKED' &&
        r.renewal_terms === 'UNKNOWN',
    ),
  ).toBe(true);
});
it.each([
  { from: '2026-02-30' },
  { through: '2026-10-01' },
  { through: '2027-12-01' },
  { as_of: 'not-an-instant' },
  { channel: 'fax' },
])(
  'rejects invalid date/channel input %j rather than producing guessed renewal dates',
  async (patch) => {
    const s = await setup(),
      q = query();
    Object.assign(q, patch);
    await expect(s.read(admission(), q)).rejects.toThrow();
  },
);
it.each(['revision', 'key', 'date'] as const)(
  'will not substitute a new selected source for a mismatched %s',
  async (mode) => {
    const s = await setup(),
      selected = structuredClone(await s.selection());
    if (mode === 'revision') selected.source.plan_revision++;
    if (mode === 'key') selected.candidate_key = 'another source';
    if (mode === 'date') selected.due_on = '2026-11-04';
    await expect(
      prepareMaintenanceVisitProposal(
        s.repo,
        s.boundary,
        s.actor,
        query(),
        selected,
        admission(),
      ),
    ).rejects.toThrow('Exact eligible');
  },
);
it('a newer allowed channel reference stales earlier planning evidence without claiming message suppression is verified', async () => {
  const s = await setup(),
    p = await s.prepare();
  vi.setSystemTime(new Date('2026-11-01T18:01:00Z'));
  await s.operations.recordConsent(s.org, s.boundary.customer_id, true, true);
  expect(await s.reconcile(p)).toMatchObject({
    status: 'STALE',
    proposal_id: p.id,
    replacement: null,
  });
  expect(p).toMatchObject({
    purpose_consent: 'UNVERIFIED',
    suppression: 'UNVERIFIED',
    recurring_enrollment: 'UNVERIFIED',
    sender_authority: 'UNVERIFIED',
    message_authority: 'BLOCKED',
  });
});
it('retains exact after-phase visit evidence without marking repairs or work complete', async () => {
  const s = await setup(),
    visit = s.repo.addVisit(s.org, s.plan.id, '2026-11-03', 'after'),
    row = (await s.read()).candidates.find(
      (c) => c.selection.source.plan_id === s.plan.id,
    )!;
  expect(row).toMatchObject({
    planning_status: 'EXACT_VISIT_RECORDED',
    exact_visits: [{ id: visit.id, status: 'draft', phase: 'after' }],
    renewal_terms: 'UNKNOWN',
    scheduling_authority: 'BLOCKED',
  });
  expect(JSON.stringify(row)).not.toMatch(
    /resolved|repair_complete|physically_completed/,
  );
});
it('truncated coverage never permits proposal preparation or complete-history claims', async () => {
  const s = await setup(),
    selected = await s.selection(),
    context = s.repo
      .read(s.org)
      .contexts.find((c) => c.location_id === s.boundary.location_id)!;
  while (
    s.repo
      .read(s.org)
      .plans.filter((p) => p.location_id === s.boundary.location_id).length <
    100
  )
    s.repo.createPlan(s.org, context, 'Actual bounded synthetic plan');
  for (const p of s.repo
    .read(s.org)
    .plans.filter((p) => p.location_id === s.boundary.location_id))
    s.repo.savePlan(s.org, {
      ...p,
      starts_on: '2026-11-01',
      cadence: 'custom',
      interval_days: 1,
    });
  const q = { ...query(), from: '2026-11-01', through: '2026-11-06' },
    r = await s.read(admission(), q);
  expect(r.count_is_complete).toBe(false);
  expect(r.history_completeness).toBe('UNKNOWN');
  expect(r.candidates.every((c) => !c.can_prepare_visit_proposal)).toBe(true);
  await expect(
    prepareMaintenanceVisitProposal(
      s.repo,
      s.boundary,
      s.actor,
      q,
      selected,
      admission(),
    ),
  ).rejects.toThrow('Exact eligible');
});
