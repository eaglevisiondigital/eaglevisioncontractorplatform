import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import * as planning from '../src/lib/maintenance-renewal-planning';
import {
  readMaintenanceDesk,
  reconcileMaintenanceDesk,
  openMaintenanceDeskSource,
  prepareMaintenanceDeskReview,
  reconcileMaintenanceDeskPreparation,
  maintenanceDeskAttemptState,
  reviewMaintenanceConsentPreflight,
  reconcileMaintenanceConsentPreflight,
  type MaintenanceDeskInput,
  type MaintenanceConsentInput,
} from '../src/lib/workflows/maintenance-desk';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const sources = await prepareLocalJourney(sampleCompanies[index], {
      enabled: true,
      confirmed: true,
    }),
    gate = { enabled: true, confirmed: true };
  const input: MaintenanceDeskInput = {
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
  };
  return { sources, gate, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) => readMaintenanceDesk(f.sources, f.input, f.gate);
const eligible = (view: Awaited<ReturnType<typeof read>>) =>
  view.candidates.find((c) => c.can_prepare_visit_proposal)!;
function consentInput(
  view: Awaited<ReturnType<typeof read>>,
): MaintenanceConsentInput {
  return {
    recipient_customer_id: view.source.customer_id,
    channel: view.window.channel,
    purpose: 'recurring_maintenance',
    expected_source_sha256: view.source.source_sha256,
    expected_consent_id: view.consent.reference?.id ?? null,
  };
}
it.each([0, 1, 2])(
  'company %s uses editable horizons, exact published sources and existing immutable planning with no effects',
  async (index) => {
    const f = await fixture(index),
      s = f.sources,
      state = s.property.read(s.company.id),
      jobs = await s.estimates.jobs(s.company.id),
      history = await s.operations.customerHistory(
        s.company.id,
        s.target.customer_id,
      ),
      release = s.release.read('staff');
    const writers = [
      vi.spyOn(s.property, 'addVisit'),
      vi.spyOn(s.property, 'saveVisit'),
      vi.spyOn(s.property, 'savePlan'),
      vi.spyOn(s.property, 'publish'),
      vi.spyOn(s.estimates, 'assignJob'),
      vi.spyOn(s.estimates, 'recordTime'),
      vi.spyOn(s.estimates, 'approveJob'),
      vi.spyOn(s.operations, 'recordConsent'),
    ];
    const view = await read(f),
      candidate = eligible(view);
    expect(view.source).toMatchObject({
      organization_id: s.company.id,
      customer_id: s.target.customer_id,
      location_id: s.target.location_id,
      job_id: s.target.job_id,
      issued_version_id: s.target.version_id,
    });
    expect(view.review_policy).toEqual({ lead_days: 14, overdue_days: 7 });
    expect(
      view.candidates.find((c) => c.selection.due_on === '2027-01-11')
        ?.can_prepare_visit_proposal,
    ).toBe(true);
    expect(view.maintenance_findings[0].source).toMatchObject({
      report_id: s.report_id,
      report_version: s.published_version,
      plan_id: s.plan_id,
      job_id: s.target.job_id,
    });
    expect(
      await openMaintenanceDeskSource(
        view,
        view.maintenance_findings[0].source,
      ),
    ).toMatchObject({
      authority: 'NAVIGATION_ONLY',
      source: view.maintenance_findings[0].source,
    });
    expect(maintenanceDeskAttemptState(view, candidate)).toBe('NOT_PREPARED');
    const proposal = await prepareMaintenanceDeskReview(view, candidate, {
      enabled: true,
      confirmed: true,
    });
    expect(proposal).toMatchObject({
      scope: 'STAFF_PLANNING_ONLY',
      recipient: null,
      provider_request: null,
      renewal_terms: 'UNKNOWN',
      scheduling_authority: 'BLOCKED',
      message_authority: 'BLOCKED',
      billing_authority: 'BLOCKED',
    });
    expect(proposal.snapshot.selection).toEqual(candidate.selection);
    expect(Object.isFrozen(proposal.snapshot)).toBe(true);
    expect(maintenanceDeskAttemptState(view, candidate)).toBe('PREPARED');
    await expect(
      prepareMaintenanceDeskReview(view, candidate, f.gate),
    ).rejects.toThrow('Existing');
    expect(
      await reconcileMaintenanceDeskPreparation(view, candidate),
    ).toMatchObject({
      status: 'EXACT_PREPARED_REVIEW_ONLY',
      proposal,
      attempt_state: 'PREPARED',
      replacement: null,
      replay: 'FORBIDDEN',
    });
    const refreshed = await read(f);
    expect(
      maintenanceDeskAttemptState(
        refreshed,
        refreshed.candidates.find(
          (c) =>
            c.selection.candidate_key === candidate.selection.candidate_key,
        )!,
      ),
    ).toBe('PREPARED');
    const preflight = await reviewMaintenanceConsentPreflight(
      view,
      candidate,
      consentInput(view),
      f.gate,
    );
    expect(preflight).toMatchObject({
      status: 'UNKNOWN',
      decision: 'BLOCKED',
      send: false,
      current_contact_reference: null,
      observed_channel_state: 'UNKNOWN',
      current_channel_authority: 'UNKNOWN',
      recipient: null,
      provider_request: null,
      purpose_scope: 'UNVERIFIED',
    });
    expect(await reconcileMaintenanceConsentPreflight(preflight)).toMatchObject(
      {
        status: 'UNKNOWN',
        decision: 'BLOCKED',
        historical_binding: 'MATCHED_CAPTURE_ONLY',
        send: false,
      },
    );
    expect(await reconcileMaintenanceDesk(view)).toEqual({
      status: 'CAPTURED_NOT_ATOMIC',
      replacement: null,
      replay: 'FORBIDDEN',
    });
    expect(JSON.stringify(view)).not.toMatch(
      /unit_cost|supplier|payroll|margin|internal_notes|@example.invalid|555010|PRIVATE/,
    );
    expect(JSON.stringify(preflight)).not.toMatch(
      /RECORDED_ALLOWED|@example.invalid|555010|unit_cost|payroll/,
    );
    expect(Object.values(view.authority).every((v) => v === false)).toBe(true);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(s.property.read(s.company.id)).toEqual(state);
    expect(await s.estimates.jobs(s.company.id)).toEqual(jobs);
    expect(
      await s.operations.customerHistory(s.company.id, s.target.customer_id),
    ).toEqual(history);
    expect(s.release.read('staff')).toEqual(release);
  },
);
it('combined literal/type/readiness/date filtering has accurate available counts without complete-history claims', async () => {
  const f = await fixture(),
    all = await read(f);
  f.input.query = '2027-01-11';
  f.input.kind = 'inspection_occurrence';
  f.input.readiness = 'preparable';
  const filtered = await read(f);
  expect(filtered.matching_count).toBe(1);
  expect(filtered.available_count).toBe(all.available_count);
  expect(filtered.candidates[0].selection.due_on).toBe('2027-01-11');
  expect(filtered.count_is_complete).toBe(false);
  f.input.query = 'private contractor notes';
  expect((await read(f)).matching_count).toBe(0);
  f.input.query = 'weathered';
  const findings = await read(f);
  expect(findings.matching_count).toBe(0);
  expect(findings.maintenance_findings).toHaveLength(1);
  expect(findings.maintenance_findings[0].observation).toContain('weathered');
});
it('blocked recorded visit is not physical completion and cannot prepare a duplicate', async () => {
  const f = await fixture(),
    view = await read(f),
    row = view.candidates.find((c) => c.selection.due_on === f.sources.day)!;
  expect(row.planning_status).toBe('EXACT_VISIT_RECORDED');
  expect(row.can_prepare_visit_proposal).toBe(false);
  await expect(prepareMaintenanceDeskReview(view, row, f.gate)).rejects.toThrow(
    'eligible',
  );
  expect(view.maintenance_findings[0].physical_completion).toBe('UNVERIFIED');
});
it('concurrent staff preparation calls the existing producer once and never duplicates its identity', async () => {
  const f = await fixture(),
    view = await read(f),
    row = eligible(view),
    producer = vi.spyOn(planning, 'prepareMaintenanceVisitProposal');
  const results = await Promise.allSettled([
    prepareMaintenanceDeskReview(view, row, f.gate),
    prepareMaintenanceDeskReview(view, row, f.gate),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(producer).toHaveBeenCalledTimes(1);
  expect(maintenanceDeskAttemptState(view, row)).toBe('PREPARED');
  const plan = f.sources.property
    .read(f.sources.company.id)
    .plans.find((p) => p.id === f.sources.plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...plan,
    name: 'Explicit newer plan revision cannot bypass UNKNOWN',
  });
  const revised = await read(f),
    revisedRow = revised.candidates.find(
      (c) => c.selection.due_on === row.selection.due_on,
    )!;
  await expect(
    prepareMaintenanceDeskReview(revised, revisedRow, f.gate),
  ).rejects.toThrow('Existing');
  expect(producer).toHaveBeenCalledTimes(1);
  expect(maintenanceDeskAttemptState(view, row)).toBe('UNKNOWN');
});
it('lost preparation acknowledgment is held UNKNOWN across rereads and never retries/new IDs', async () => {
  const f = await fixture(),
    view = await read(f),
    row = eligible(view),
    producer = vi
      .spyOn(planning, 'prepareMaintenanceVisitProposal')
      .mockRejectedValueOnce(Error('Lost read acknowledgment'));
  await expect(prepareMaintenanceDeskReview(view, row, f.gate)).rejects.toThrow(
    'Lost',
  );
  expect(maintenanceDeskAttemptState(view, row)).toBe('UNKNOWN');
  await expect(prepareMaintenanceDeskReview(view, row, f.gate)).rejects.toThrow(
    'Existing',
  );
  const next = await read(f),
    same = next.candidates.find(
      (c) => c.selection.candidate_key === row.selection.candidate_key,
    )!;
  await expect(
    prepareMaintenanceDeskReview(next, same, f.gate),
  ).rejects.toThrow('Existing');
  expect(producer).toHaveBeenCalledTimes(1);
  expect(await reconcileMaintenanceDeskPreparation(view, row)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  const plan = f.sources.property
    .read(f.sources.company.id)
    .plans.find((p) => p.id === f.sources.plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...plan,
    name: 'UNKNOWN must not reset after plan edit',
  });
  const revised = await read(f),
    revisedRow = revised.candidates.find(
      (c) => c.selection.due_on === row.selection.due_on,
    )!;
  await expect(
    prepareMaintenanceDeskReview(revised, revisedRow, f.gate),
  ).rejects.toThrow('Existing');
  expect(producer).toHaveBeenCalledTimes(1);
});
it('confirmation withdrawn after actual producer output retains UNKNOWN even when exact snapshot bytes are available', async () => {
  const f = await fixture(),
    view = await read(f),
    row = eligible(view),
    gate = { enabled: true, confirmed: true },
    original = planning.prepareMaintenanceVisitProposal;
  vi.spyOn(planning, 'prepareMaintenanceVisitProposal').mockImplementation(
    async (...args) => {
      const result = await original(...args);
      gate.confirmed = false;
      return result;
    },
  );
  await expect(prepareMaintenanceDeskReview(view, row, gate)).rejects.toThrow();
  expect(maintenanceDeskAttemptState(view, row)).toBe('UNKNOWN');
  expect(await reconcileMaintenanceDeskPreparation(view, row)).toMatchObject({
    status: 'UNKNOWN',
    attempt_state: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  await expect(prepareMaintenanceDeskReview(view, row, f.gate)).rejects.toThrow(
    'Existing',
  );
});
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'contact-v1 never grants requested %s purpose',
  async (purpose) => {
    const f = await fixture(),
      view = await read(f),
      row = eligible(view),
      input = consentInput(view);
    input.purpose = purpose;
    const preflight = await reviewMaintenanceConsentPreflight(
      view,
      row,
      input,
      f.gate,
    );
    expect(preflight).toMatchObject({
      status: 'UNKNOWN',
      decision: 'BLOCKED',
      requested_purpose: purpose,
      observed_channel_state: 'UNKNOWN',
      current_contact_reference: null,
      purpose_scope: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      sender: 'UNVERIFIED',
      recurring_enrollment: 'UNVERIFIED',
      recipient_endpoint: 'UNRESOLVED',
      send: false,
    });
  },
);
it.each([
  'recipient_customer_id',
  'channel',
  'expected_source_sha256',
  'expected_consent_id',
  'purpose',
] as const)(
  'foreign/mismatched preflight %s remains UNKNOWN without a capability',
  async (key) => {
    const f = await fixture(),
      view = await read(f),
      input = consentInput(view);
    Object.assign(input, { [key]: key === 'channel' ? 'sms' : 'foreign' });
    expect(
      await reviewMaintenanceConsentPreflight(
        view,
        eligible(view),
        input,
        f.gate,
      ),
    ).toMatchObject({
      status: 'UNKNOWN',
      replacement: null,
      send: false,
      recipient: null,
      provider_request: null,
    });
  },
);
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('default OFF %s rejects before source access', async (gate) => {
  const f = await fixture(),
    source = vi.spyOn(f.sources.estimates, 'readSyntheticPrototypeSources');
  await expect(readMaintenanceDesk(f.sources, f.input, gate)).rejects.toThrow();
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
] as const)('foreign exact target %s cannot enter the desk', async (key) => {
  const f = await fixture();
  f.sources.target[key] = 'foreign';
  await expect(read(f)).rejects.toThrow();
});
it('current admin revocation withholds desk, proposal reconciliation and historical consent binding', async () => {
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
  const view = await read(f),
    row = eligible(view),
    preflight = await reviewMaintenanceConsentPreflight(
      view,
      row,
      consentInput(view),
      f.gate,
    );
  await s.operations.manageMember(
    s.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect(await reconcileMaintenanceDesk(view)).toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
  });
  expect(
    await reconcileMaintenanceConsentPreflight(preflight),
  ).not.toHaveProperty('historical_binding');
  expect(await reconcileMaintenanceDeskPreparation(view, row)).toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
  });
  await expect(read(f)).rejects.toThrow();
});
it('stale plan/maintenance revisions preserve immutable bytes and cannot reconcile as current', async () => {
  const f = await fixture(),
    view = await read(f),
    before = JSON.stringify(view),
    plan = f.sources.property
      .read(f.sources.company.id)
      .plans.find((p) => p.id === f.sources.plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...plan,
    name: 'Actual source revision changed',
  });
  expect(await reconcileMaintenanceDesk(view)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(JSON.stringify(view)).toBe(before);
  expect(
    await reviewMaintenanceConsentPreflight(
      view,
      eligible(view),
      consentInput(view),
      f.gate,
    ),
  ).not.toHaveProperty('integrity');
});
it('cloned view/candidate/source cannot import provenance or trigger input hooks', async () => {
  const f = await fixture(),
    view = await read(f),
    row = eligible(view),
    hook = vi.fn();
  expect(await reconcileMaintenanceDesk(structuredClone(view))).toMatchObject({
    status: 'UNKNOWN',
  });
  await expect(
    prepareMaintenanceDeskReview(view, structuredClone(row), f.gate),
  ).rejects.toThrow('displayed');
  await expect(
    openMaintenanceDeskSource(
      view,
      structuredClone(view.maintenance_findings[0].source),
    ),
  ).rejects.toThrow('displayed');
  const input = consentInput(view);
  Object.defineProperty(input, 'purpose', { get: hook });
  expect(
    await reviewMaintenanceConsentPreflight(view, row, input, f.gate),
  ).toMatchObject({ status: 'UNKNOWN' });
  expect(hook).not.toHaveBeenCalled();
});
it.each([
  'getter',
  'serializer',
  'symbol',
  'window-getter',
  'source-getter',
  'filter-coercion',
])('rejects %s without executing caller code', async (kind) => {
  const f = await fixture(),
    hook = vi.fn();
  if (kind === 'getter') Object.defineProperty(f.input, 'query', { get: hook });
  if (kind === 'serializer') Object.assign(f.input, { toJSON: hook });
  if (kind === 'symbol') Object.assign(f.input, { [Symbol('x')]: true });
  if (kind === 'window-getter')
    Object.defineProperty(f.input.window, 'channel', { get: hook });
  if (kind === 'source-getter')
    Object.defineProperty(f.sources, 'property', { get: hook });
  if (kind === 'filter-coercion')
    Object.assign(f.input, { kind: { toString: hook } });
  await expect(read(f)).rejects.toThrow();
  expect(hook).not.toHaveBeenCalled();
});
it.each([
  'bad-date',
  'reverse-range',
  'too-wide',
  'wrong-channel',
  'horizon',
  'invalid-asof',
])('invalid %s rejects instead of showing stale candidates', async (kind) => {
  const f = await fixture();
  if (kind === 'bad-date') f.input.window.from = '2026-02-30';
  if (kind === 'reverse-range') f.input.window.from = '2027-02-01';
  if (kind === 'too-wide') f.input.window.through = '2027-12-31';
  if (kind === 'wrong-channel')
    Object.assign(f.input.window, { channel: 'voice' });
  if (kind === 'horizon') f.input.lead_days = 31;
  if (kind === 'invalid-asof') f.input.window.as_of = 'tomorrow';
  await expect(read(f)).rejects.toThrow();
});
it.each(['input', 'target', 'confirmation', 'journey-confirmation'] as const)(
  'live %s mutation after consent await rejects',
  async (kind) => {
    const f = await fixture(),
      original = f.sources.operations.customerHistory.bind(
        f.sources.operations,
      );
    let once = true;
    vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const result = await original(...args);
        if (once) {
          once = false;
          if (kind === 'input') f.input.lead_days = 8;
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
it.each([2, 3])(
  'consent withdrawal during final preflight hash %s never exposes current allowed/reference',
  async (trigger) => {
    const f = await fixture(),
      view = await read(f),
      row = eligible(view),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (++calls === trigger)
        await f.sources.operations.recordConsent(
          f.sources.company.id,
          f.sources.target.customer_id,
          false,
          false,
        );
      return result;
    });
    const preflight = await reviewMaintenanceConsentPreflight(
      view,
      row,
      consentInput(view),
      f.gate,
    );
    expect(calls).toBe(3);
    expect(preflight).toMatchObject({
      status: 'UNKNOWN',
      decision: 'BLOCKED',
      observed_channel_state: 'UNKNOWN',
      current_contact_reference: null,
      send: false,
      recipient: null,
      provider_request: null,
    });
    expect(JSON.stringify(preflight)).not.toContain('RECORDED_ALLOWED');
    expect(
      await reconcileMaintenanceConsentPreflight(preflight),
    ).not.toHaveProperty('historical_binding');
  },
);
it('detected captured consent withdrawal invalidates exact historical preflight and keeps UNKNOWN', async () => {
  const f = await fixture(),
    view = await read(f),
    preflight = await reviewMaintenanceConsentPreflight(
      view,
      eligible(view),
      consentInput(view),
      f.gate,
    ),
    before = JSON.stringify(preflight);
  await f.sources.operations.recordConsent(
    f.sources.company.id,
    f.sources.target.customer_id,
    false,
    false,
  );
  expect(await reconcileMaintenanceConsentPreflight(preflight)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
    send: false,
  });
  expect(JSON.stringify(preflight)).toBe(before);
});
it('final consent preflight input/gate/source edits cannot produce a source-bound review', async () => {
  const f = await fixture(),
    view = await read(f),
    input = consentInput(view),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (++calls === 3) input.recipient_customer_id = 'foreign';
    return result;
  });
  expect(
    await reviewMaintenanceConsentPreflight(
      view,
      eligible(view),
      input,
      f.gate,
    ),
  ).not.toHaveProperty('integrity');
});
it('final source hash cannot hide an actual plan revision while loading the desk', async () => {
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
        name: 'Last hash source revision',
      });
    }
    return result;
  });
  await expect(read(f)).rejects.toThrow();
  expect(calls).toBe(7);
});
it('withdrawn preflight confirmation at the last await yields UNKNOWN without historical match or packet', async () => {
  const f = await fixture(),
    view = await read(f),
    gate = { enabled: true, confirmed: true },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (++calls === 3) gate.confirmed = false;
    return result;
  });
  expect(
    await reviewMaintenanceConsentPreflight(
      view,
      eligible(view),
      consentInput(view),
      gate,
    ),
  ).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
    send: false,
    recipient: null,
    provider_request: null,
  });
});
