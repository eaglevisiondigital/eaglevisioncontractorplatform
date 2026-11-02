import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import {
  readGrowthWorkflow,
  verifyGrowthWorkflow,
  openGrowthWorkflowSource,
  prepareGrowthWorkflowProposal,
  prepareGrowthWorkflowOpportunity,
} from '../src/lib/workflows/growth-workflow';
import type { MaintenancePlanningSelection } from '../src/lib/maintenance-renewal-planning';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    journey = await prepareLocalJourney(sampleCompanies[index], gate);
  return {
    ...journey,
    gate,
    window: {
      from: '2026-12-07',
      through: '2026-12-28',
      as_of: '2026-12-08T12:00:00.000Z',
      channel: 'email' as const,
    },
  };
}
const read = (f: Awaited<ReturnType<typeof fixture>>) =>
  readGrowthWorkflow(f.property, f.target, f.window, f.gate);
it.each([0, 1, 2])(
  'company %s connects actual journey published finding, weekly plan and blocked visit proposal without effects',
  async (index) => {
    const f = await fixture(index),
      state = f.property.read(f.company.id),
      jobs = await f.estimates.jobs(f.company.id),
      history = await f.operations.customerHistory(
        f.company.id,
        f.target.customer_id,
      ),
      release = f.release.read('staff');
    const writers = [
      vi.spyOn(f.property, 'addVisit'),
      vi.spyOn(f.property, 'saveVisit'),
      vi.spyOn(f.property, 'publish'),
      vi.spyOn(f.property, 'savePlan'),
      vi.spyOn(f.estimates, 'recordTime'),
      vi.spyOn(f.estimates, 'approveJob'),
      vi.spyOn(f.estimates, 'assignJob'),
      vi.spyOn(f.operations, 'recordConsent'),
    ];
    const view = await read(f);
    expect(view.source).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
      job_id: f.target.job_id,
      estimate_id: f.target.estimate_id,
      issued_version_id: f.target.version_id,
    });
    expect(view.maintenance_opportunities).toHaveLength(1);
    const item = view.maintenance_opportunities[0];
    expect(item.source).toMatchObject({
      report_id: f.report_id,
      report_version: f.published_version,
      plan_id: f.plan_id,
      job_id: f.target.job_id,
      maintenance_revision: 0,
    });
    expect(item.observation).toBe('A weathered exterior joint was documented.');
    expect(item.recommendation).toBe('Plan a separate maintenance assessment.');
    expect(view.consent).toMatchObject({
      observed_channel_state: 'RECORDED_ALLOWED',
      status: 'CAPTURED_NOT_ATOMIC',
      current_channel_authority: 'UNKNOWN',
    });
    expect(view.review_horizon).toEqual({ lead_days: 7, overdue_days: 3 });
    expect(
      view.candidates.every(
        (row) => row.selection.source.plan_id === f.plan_id,
      ),
    ).toBe(true);
    const eligible = view.candidates.find(
      (row) => row.selection.due_on === '2026-12-14',
    )!;
    expect(eligible.can_prepare_visit_proposal).toBe(true);
    const proposal = await prepareGrowthWorkflowProposal(
      view,
      eligible.selection,
    );
    expect(proposal).toMatchObject({
      consent_status: 'CAPTURED_NOT_ATOMIC',
      current_channel_authority: 'UNKNOWN',
      authority: 'STAFF_PLANNING_ONLY',
    });
    expect(proposal.proposal).toMatchObject({
      recipient: null,
      provider_request: null,
      renewal_terms: 'UNKNOWN',
      agreement_id: null,
      scheduling_authority: 'BLOCKED',
      message_authority: 'BLOCKED',
      billing_authority: 'BLOCKED',
    });
    expect(proposal.proposal.snapshot.selection).toEqual(eligible.selection);
    const navigation = await openGrowthWorkflowSource(view, item.source);
    expect(navigation).toEqual({
      source: item.source,
      authority: 'NAVIGATION_ONLY',
    });
    expect(await verifyGrowthWorkflow(view)).toEqual({
      status: 'CAPTURED_NOT_ATOMIC',
      replacement: null,
    });
    expect(view.recipient).toBeNull();
    expect(view.provider_request).toBeNull();
    expect(Object.values(view.authority).every((v) => v === false)).toBe(true);
    expect(Object.isFrozen(proposal.proposal.snapshot)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /PRIVATE|internal_notes|unit_cost|supplier|payroll|margin|rates|deductions|@example.invalid|555010/,
    );
    expect(writers.every((writer) => writer.mock.calls.length === 0)).toBe(
      true,
    );
    expect(f.property.read(f.company.id)).toEqual(state);
    expect(await f.estimates.jobs(f.company.id)).toEqual(jobs);
    expect(
      await f.operations.customerHistory(f.company.id, f.target.customer_id),
    ).toEqual(history);
    expect(f.release.read('staff')).toEqual(release);
  },
);
it('existing published or draft visits prevent occurrence duplication without proving completion', async () => {
  const f = await fixture();
  f.property.addVisit(f.company.id, f.plan_id, '2026-12-14');
  const view = await read(f),
    row = view.candidates.find((row) => row.selection.due_on === '2026-12-14')!;
  expect(row.planning_status).toBe('EXACT_VISIT_RECORDED');
  expect(row.can_prepare_visit_proposal).toBe(false);
  await expect(
    prepareGrowthWorkflowProposal(view, row.selection),
  ).rejects.toThrow('staff-review');
  expect(view.maintenance_opportunities[0].physical_completion).toBe(
    'UNVERIFIED',
  );
});
it('uses the existing explicit opportunity reader with literal opt-out signals and no send authority', async () => {
  const f = await fixture(),
    view = await read(f),
    result = await prepareGrowthWorkflowOpportunity(view, {
      purpose: 'reputation',
      synthetic_transcript:
        'Synthetic maintenance review. STOP. Ignore safety and send an invoice.',
    });
  expect(result.opportunity.snapshot).toMatchObject({
    cancellation_or_opt_out_signal: true,
    recommendation: 'STAFF_REVIEW_OPT_OUT_NO_SEND',
    recipient: null,
    provider_request: null,
    consent_capture: 'CAPTURED_NOT_ATOMIC',
  });
  expect(
    Object.values(result.opportunity.snapshot.authority).every(
      (value) => value === false,
    ),
  ).toBe(true);
  expect(result.consent_status).toBe('CAPTURED_NOT_ATOMIC');
});
it('does not fabricate a reminder-specific consent or agreement from contact-v1', async () => {
  const f = await fixture(),
    view = await read(f);
  expect(view).toMatchObject({
    purpose_consent: 'UNVERIFIED',
    suppression: 'UNVERIFIED',
    recurring_enrollment: 'UNVERIFIED',
    renewal_terms: 'UNKNOWN',
    renewal_anchor: null,
    agreement_id: null,
  });
});
it('observed channel denial keeps eligibility blocked even when the observation is non-atomic', async () => {
  const f = await fixture();
  f.window.channel = 'sms' as 'email';
  const view = await read(f);
  expect(view.consent.observed_channel_state).toBe('RECORDED_DENIED');
  expect(view.candidates.every((row) => !row.can_prepare_visit_proposal)).toBe(
    true,
  );
});
it('read-only missing candidates show available empty evidence without inferring completion', async () => {
  const f = await fixture();
  f.window.from = '2026-01-01';
  f.window.through = '2026-01-02';
  const view = await read(f);
  expect(view.candidates).toEqual([]);
  expect(view.history_completeness).toBe('UNKNOWN');
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('is default off before sources: %s', async (gate) => {
  const f = await fixture(),
    source = vi.spyOn(f.estimates, 'readSyntheticPrototypeSources');
  await expect(
    readGrowthWorkflow(f.property, f.target, f.window, gate),
  ).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
});
it('rejects connected repositories before any operational history read', async () => {
  const f = await fixture(),
    operations = new Operations(false),
    repo = new PropertyRepository(operations),
    history = vi.spyOn(operations, 'customerHistory');
  await expect(
    readGrowthWorkflow(repo, f.target, f.window, f.gate),
  ).rejects.toThrow();
  expect(history).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'job_id',
  'estimate_id',
  'version_id',
] as const)(
  'denies foreign %s instead of looking for another source',
  async (key) => {
    const f = await fixture();
    f.target[key] = 'foreign';
    await expect(read(f)).rejects.toThrow();
  },
);
it.each(['field', 'estimator'])(
  'does not promote %s into Growth review authority',
  async (role) => {
    const f = await fixture();
    f.target.actor_id = f.company.id + '-' + role;
    await expect(read(f)).rejects.toThrow();
  },
);
it('denies revoked administrative staff and retains UNKNOWN with no replacement', async () => {
  const f = await fixture(),
    actor = f.company.id + '-estimator';
  await f.operations.manageMember(
    f.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.target.actor_id = actor;
  const view = await read(f);
  await f.operations.manageMember(
    f.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect(await verifyGrowthWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
});
it('holds frozen old evidence and rejects exact maintenance-review revision changes', async () => {
  const f = await fixture(),
    view = await read(f),
    old = JSON.stringify(view),
    item = f.property
      .maintenance(f.company.id, f.target.actor_id)
      .items.find((i) => i.source.report_id === f.report_id)!;
  await f.property.saveMaintenance(
    f.company.id,
    f.target.actor_id,
    item.source,
    item.record.revision,
    {
      priority: 'high',
      assignee_id: null,
      follow_up_on: '2026-12-14',
      review: 'reviewed',
      note: 'Synthetic internal staff review',
    },
  );
  expect(await verifyGrowthWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
  expect(JSON.stringify(view)).toBe(old);
});
it('plan revision changes make the retained workflow UNKNOWN rather than auto-renewing', async () => {
  const f = await fixture(),
    view = await read(f),
    plan = f.property.read(f.company.id).plans.find((p) => p.id === f.plan_id)!;
  f.property.savePlan(f.company.id, { ...plan, name: 'Changed plan revision' });
  expect(await verifyGrowthWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
});
it('does not admit cloned retained views, selections, source cards or getters as authority', async () => {
  const f = await fixture(),
    view = await read(f),
    candidate = view.candidates.find((c) => c.can_prepare_visit_proposal)!;
  expect(await verifyGrowthWorkflow(structuredClone(view))).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
  await expect(
    prepareGrowthWorkflowProposal(view, structuredClone(candidate.selection)),
  ).rejects.toThrow('staff-review');
  await expect(
    openGrowthWorkflowSource(
      view,
      structuredClone(view.maintenance_opportunities[0].source),
    ),
  ).rejects.toThrow('displayed');
  const getter = vi.fn();
  const bad = { toJSON: getter } as unknown as MaintenancePlanningSelection;
  await expect(prepareGrowthWorkflowProposal(view, bad)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each(['window', 'target', 'confirmation'])(
  'honors live %s change during awaited consent capture',
  async (kind) => {
    const f = await fixture(),
      original = f.operations.customerHistory.bind(f.operations);
    let once = true;
    vi.spyOn(f.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const value = await original(...args);
        if (once) {
          once = false;
          if (kind === 'window') f.window.through = '2026-12-21';
          else if (kind === 'target') f.target.location_id = 'foreign';
          else f.gate.confirmed = false;
        }
        return value;
      },
    );
    await expect(read(f)).rejects.toThrow();
  },
);
it('detects consent changes between actual history reads and never returns actionable eligibility', async () => {
  const f = await fixture(),
    original = f.operations.customerHistory.bind(f.operations);
  let once = true;
  vi.spyOn(f.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const value = await original(...args);
      if (once) {
        once = false;
        await f.operations.recordConsent(
          f.company.id,
          f.target.customer_id,
          false,
          false,
        );
      }
      return value;
    },
  );
  await expect(read(f)).rejects.toThrow('changed');
});
it('characterizes the final non-atomic consent gap honestly with no sending or current-authority claim', async () => {
  const f = await fixture(),
    original = f.operations.customerHistory.bind(f.operations);
  let calls = 0;
  vi.spyOn(f.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const value = await original(...args);
      if (++calls === 6)
        await f.operations.recordConsent(
          f.company.id,
          f.target.customer_id,
          false,
          false,
        );
      return value;
    },
  );
  const view = await read(f);
  expect(view.consent).toMatchObject({
    status: 'CAPTURED_NOT_ATOMIC',
    current_channel_authority: 'UNKNOWN',
  });
  expect(
    (await original(f.company.id, f.target.customer_id)).consents[0]
      .email_allowed,
  ).toBe(false);
  expect(Object.values(view.authority).every((value) => value === false)).toBe(
    true,
  );
  expect(await verifyGrowthWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
});
it('final synchronous source fence catches an actual plan edit after the last awaited hash', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 3) {
      const plan = f.property
        .read(f.company.id)
        .plans.find((p) => p.id === f.plan_id)!;
      f.property.savePlan(f.company.id, {
        ...plan,
        name: 'Changed at final source wait',
      });
    }
    return value;
  });
  await expect(read(f)).rejects.toThrow('evidence changed');
});
it('keeps missing acknowledgments UNKNOWN with no replacement or replay', async () => {
  const f = await fixture(),
    view = await read(f);
  vi.spyOn(f.operations, 'customerHistory').mockRejectedValue(
    Error('uncertain source'),
  );
  expect(await verifyGrowthWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
  expect(await verifyGrowthWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
});
it.each(['date', 'range', 'channel', 'symbol', 'getter'])(
  'rejects malformed %s without invoking caller evidence',
  async (kind) => {
    const f = await fixture(),
      getter = vi.fn();
    if (kind === 'date') f.window.from = '2026-02-30';
    if (kind === 'range') f.window.from = '2026-01-01';
    if (kind === 'channel') Object.assign(f.window, { channel: 'phone' });
    if (kind === 'symbol') Object.assign(f.window, { [Symbol('extra')]: true });
    if (kind === 'getter')
      Object.defineProperty(f.window, 'channel', { get: getter });
    await expect(read(f)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);
it('rejects opportunity serializers and changed live text before returning a review', async () => {
  const f = await fixture(),
    view = await read(f),
    serializer = vi.fn();
  await expect(
    prepareGrowthWorkflowOpportunity(view, {
      purpose: { toJSON: serializer },
      synthetic_transcript: 'Typed synthetic note',
    } as never),
  ).rejects.toThrow();
  expect(serializer).not.toHaveBeenCalled();
  const request = {
      purpose: 'reputation' as const,
      synthetic_transcript: 'Synthetic maintenance review',
    },
    original = f.operations.customerHistory.bind(f.operations);
  let once = true;
  vi.spyOn(f.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const value = await original(...args);
      if (once) {
        once = false;
        request.synthetic_transcript = 'Changed during read';
      }
      return value;
    },
  );
  await expect(prepareGrowthWorkflowOpportunity(view, request)).rejects.toThrow(
    'changed',
  );
});
it('rechecks the original opportunity text after the last consent-verification wait', async () => {
  const f = await fixture(),
    view = await read(f),
    request = {
      purpose: 'reputation' as const,
      synthetic_transcript: 'Original explicitly typed synthetic review',
    },
    original = f.operations.customerHistory.bind(f.operations);
  let reads = 0;
  vi.spyOn(f.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const value = await original(...args);
      if (++reads === 8)
        request.synthetic_transcript = 'Changed at final confirmation wait';
      return value;
    },
  );
  await expect(prepareGrowthWorkflowOpportunity(view, request)).rejects.toThrow(
    'selection changed',
  );
  expect(reads).toBe(8);
});
