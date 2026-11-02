import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPortfolioMaintenance,
  reconcilePortfolioMaintenance,
  openPortfolioMaintenanceItem,
  reviewPortfolioMaintenanceConsent,
  reconcilePortfolioMaintenanceConsent,
  type PortfolioMaintenanceInput,
} from '../src/lib/workflows/portfolio-maintenance';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input: PortfolioMaintenanceInput = {
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
  return { sources, gate, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) =>
  readPortfolioMaintenance(f.sources, f.input, f.gate);
function row(v: Awaited<ReturnType<typeof read>>) {
  return v.candidates.find((c) => c.staff_planning_eligible)!;
}
it.each([0, 1, 2])(
  'company %s combines actual four-job maintenance without duplication, contact leaks or business effects',
  async (index) => {
    const f = await fixture(index),
      s = f.sources,
      state = s.property.read(s.company.id),
      jobs = await s.estimates.jobs(s.company.id),
      releases = s.entries.map((e) => e.release.read('staff')),
      histories = await Promise.all(
        [...new Set(s.entries.map((e) => e.target.customer_id))].map((c) =>
          s.operations.customerHistory(s.company.id, c),
        ),
      ),
      writers = [
        vi.spyOn(s.property, 'addVisit'),
        vi.spyOn(s.property, 'saveVisit'),
        vi.spyOn(s.property, 'publish'),
        vi.spyOn(s.property, 'saveMaintenance'),
        vi.spyOn(s.estimates, 'assignJob'),
        vi.spyOn(s.estimates, 'recordTime'),
        vi.spyOn(s.operations, 'recordConsent'),
      ],
      v = await read(f);
    expect(v.jobs).toHaveLength(4);
    expect(new Set(v.jobs.map((j) => j.customer_id)).size).toBe(3);
    expect(new Set(v.jobs.map((j) => j.location_id)).size).toBe(3);
    expect(v.findings).toHaveLength(4);
    expect(new Set(v.candidates.map((c) => c.key)).size).toBe(
      v.candidates.length,
    );
    expect(new Set(v.findings.map((c) => c.key)).size).toBe(4);
    expect(v.available_occurrences).toBe(v.matching_occurrences);
    expect(v.candidates.length).toBeGreaterThan(4);
    expect(
      v.findings.every((r) => r.physical_completion === 'UNVERIFIED'),
    ).toBe(true);
    expect(v.renewal_terms).toBe('UNKNOWN');
    expect(v.consent_currentness).toBe('CAPTURED_NOT_ATOMIC');
    expect(v.current_channel_authority).toBe('UNKNOWN');
    expect(Object.values(v.authority).every((a) => a === false)).toBe(true);
    expect(JSON.stringify(v)).not.toMatch(
      /unit_cost|margin|payroll|supplier|internal_notes|@example.invalid|555010|PRIVATE|channel_reference|contact_reference/,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(s.property.read(s.company.id)).toEqual(state);
    expect(await s.estimates.jobs(s.company.id)).toEqual(jobs);
    expect(s.entries.map((e) => e.release.read('staff'))).toEqual(releases);
    expect(
      await Promise.all(
        [...new Set(s.entries.map((e) => e.target.customer_id))].map((c) =>
          s.operations.customerHistory(s.company.id, c),
        ),
      ),
    ).toEqual(histories);
    expect(await reconcilePortfolioMaintenance(v)).toMatchObject({
      status: 'CAPTURED_NOT_ATOMIC',
      send: false,
      replacement: null,
    });
  },
);
it('two jobs at one property retain separate exact plans, occurrences and published report identities', async () => {
  const f = await fixture(),
    first = f.sources.entries[0];
  f.input.location_id = first.target.location_id;
  const v = await read(f);
  expect(v.matching_jobs).toBe(2);
  expect(new Set(v.candidates.map((c) => c.context.job_id)).size).toBe(2);
  expect(new Set(v.findings.map((c) => c.source.plan_id)).size).toBe(2);
  expect(
    v.findings.every((c) => c.source.location_id === first.target.location_id),
  ).toBe(true);
  expect(v.findings[0].observation).toBe(v.findings[1].observation);
  expect(v.findings[0].key).not.toBe(v.findings[1].key);
});
it('combined exact customer/property/job/type/readiness filters have accurate available/matching counts', async () => {
  const f = await fixture(),
    e = f.sources.entries[0];
  f.input.customer_id = e.target.customer_id;
  f.input.location_id = e.target.location_id;
  f.input.job_id = e.target.job_id!;
  f.input.kind = 'inspection_occurrence';
  f.input.readiness = 'preparable';
  const v = await read(f);
  expect(v.matching_jobs).toBe(1);
  expect(v.available_jobs).toBe(4);
  expect(v.matching_occurrences).toBe(v.candidates.length);
  expect(v.matching_occurrences).toBeLessThan(v.available_occurrences);
  expect(
    v.candidates.every(
      (c) =>
        c.context.job_id === e.target.job_id &&
        c.selection.kind === 'inspection_occurrence' &&
        c.staff_planning_eligible,
    ),
  ).toBe(true);
});
it('literal text search covers allowed observation and recommendation separately from occurrence text', async () => {
  const f = await fixture();
  f.input.query = 'weathered exterior joint';
  let v = await read(f);
  expect(v.matching_findings).toBe(4);
  expect(v.matching_occurrences).toBe(0);
  f.input.query = 'maintenance assessment';
  v = await read(f);
  expect(v.findings).toHaveLength(4);
  f.input.query = 'PRIVATE';
  v = await read(f);
  expect(v.findings).toHaveLength(0);
  expect(v.candidates).toHaveLength(0);
});
it('no matching available evidence never implies repaired, renewed or complete', async () => {
  const f = await fixture();
  f.input.query = 'no-such-source-needle';
  const v = await read(f);
  expect(v.matching_occurrences).toBe(0);
  expect(v.matching_findings).toBe(0);
  expect(v.count_is_complete).toBe(false);
  expect(v.available_findings).toBe(4);
});
it('exact finding source navigation preserves report version, finding, property and job', async () => {
  const f = await fixture(),
    v = await read(f),
    r = v.findings[2],
    result = await openPortfolioMaintenanceItem(v, r.key);
  expect(result).toMatchObject({
    job_id: r.context.job_id,
    customer_id: r.context.customer_id,
    location_id: r.context.location_id,
    kind: 'PUBLISHED_FINDING',
    source: r.source,
    authority: 'NAVIGATION_ONLY',
  });
  expect(Object.isFrozen(v.candidates)).toBe(true);
  await expect(openPortfolioMaintenanceItem(v, 'foreign')).rejects.toThrow(
    'displayed',
  );
  await expect(
    openPortfolioMaintenanceItem(structuredClone(v), r.key),
  ).rejects.toThrow();
});
it('occurrence source opens the exact recorded plan/occurrence instead of fabricating a report', async () => {
  const f = await fixture(),
    v = await read(f),
    r = row(v),
    result = await openPortfolioMaintenanceItem(v, r.key);
  expect(result.source).toEqual(r.selection);
  expect(result.job_id).toBe(r.context.job_id);
  if (r.selection.kind === 'inspection_occurrence')
    expect(r.selection.source.report_id).toBeNull();
});
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'purpose %s has source-bound but blocked consent review with no recipient or provider',
  async (purpose) => {
    const f = await fixture(),
      v = await read(f),
      r = row(v),
      review = await reviewPortfolioMaintenanceConsent(
        v,
        r.key,
        { purpose },
        f.gate,
      );
    expect(review).toMatchObject({
      status: 'UNKNOWN',
      decision: 'BLOCKED',
      send: false,
      recipient: null,
      provider_request: null,
      requested_purpose: purpose,
      observed_channel_state: 'UNKNOWN',
      current_contact_reference: null,
      purpose_scope: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
      sender: 'UNVERIFIED',
    });
    expect(review).toHaveProperty('integrity');
    expect(JSON.stringify(review)).not.toMatch(
      /RECORDED_ALLOWED|@example.invalid|555010|channel_reference/,
    );
    expect(await reconcilePortfolioMaintenanceConsent(review)).toMatchObject({
      status: 'UNKNOWN',
      decision: 'BLOCKED',
      send: false,
      historical_binding: 'MATCHED_HISTORICAL_CAPTURE_ONLY',
    });
  },
);
it('copied/foreign/hidden occurrence cannot produce a consent packet', async () => {
  const f = await fixture(),
    v = await read(f),
    r = row(v);
  expect(
    await reviewPortfolioMaintenanceConsent(
      structuredClone(v),
      r.key,
      { purpose: 'marketing' },
      f.gate,
    ),
  ).not.toHaveProperty('integrity');
  expect(
    await reviewPortfolioMaintenanceConsent(
      v,
      'foreign',
      { purpose: 'marketing' },
      f.gate,
    ),
  ).not.toHaveProperty('integrity');
  f.input.query = 'no-matching';
  const filtered = await read(f);
  expect(
    await reviewPortfolioMaintenanceConsent(
      filtered,
      r.key,
      { purpose: 'marketing' },
      f.gate,
    ),
  ).not.toHaveProperty('integrity');
});
it('actual channel withdrawal invalidates historical consent capture without replay or capability', async () => {
  const f = await fixture(),
    v = await read(f),
    r = row(v),
    review = await reviewPortfolioMaintenanceConsent(
      v,
      r.key,
      { purpose: 'recurring_maintenance' },
      f.gate,
    ),
    before = JSON.stringify(review);
  await f.sources.operations.recordConsent(
    f.sources.company.id,
    r.context.customer_id,
    false,
    false,
  );
  expect(await reconcilePortfolioMaintenanceConsent(review)).not.toHaveProperty(
    'historical_binding',
  );
  expect((await reconcilePortfolioMaintenance(v)).status).toBe('UNKNOWN');
  expect(JSON.stringify(review)).toBe(before);
});
it('withdrawal during final aggregate consent hash never returns a current allowance', async () => {
  const f = await fixture(),
    v = await read(f),
    r = row(v),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = new TextDecoder().decode(args[1] as ArrayBuffer);
    if (!changed && body.includes('LOCAL_PORTFOLIO_CONSENT_BOUNDARY_REVIEW')) {
      changed = true;
      await f.sources.operations.recordConsent(
        f.sources.company.id,
        r.context.customer_id,
        false,
        false,
      );
    }
    return result;
  });
  const review = await reviewPortfolioMaintenanceConsent(
    v,
    r.key,
    { purpose: 'recurring_maintenance' },
    f.gate,
  );
  expect(changed).toBe(true);
  expect(review).toMatchObject({
    status: 'UNKNOWN',
    send: false,
    recipient: null,
    provider_request: null,
  });
  expect(review).not.toHaveProperty('integrity');
});
it.each(['job_id', 'customer_id', 'location_id'] as const)(
  'foreign %s filter denied',
  async (key) => {
    const f = await fixture();
    f.input[key] = 'foreign';
    await expect(read(f)).rejects.toThrow();
  },
);
it('conflicting admitted customer/property/job association denied rather than substituted', async () => {
  const f = await fixture();
  f.input.customer_id = f.sources.entries[0].target.customer_id;
  f.input.location_id = f.sources.entries[1].target.location_id;
  await expect(read(f)).rejects.toThrow('Conflicting');
});
it.each(['getter', 'serializer', 'symbol', 'window-getter'] as const)(
  'strict %s input rejected without hooks',
  async (kind) => {
    const f = await fixture(),
      hook = vi.fn();
    if (kind === 'getter')
      Object.defineProperty(f.input, 'query', { get: hook });
    if (kind === 'serializer') Object.assign(f.input, { toJSON: hook });
    if (kind === 'symbol')
      Object.assign(f.input, { [Symbol('foreign')]: true });
    if (kind === 'window-getter')
      Object.defineProperty(f.input.window, 'channel', { get: hook });
    await expect(read(f)).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
  },
);
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('default OFF %s denies before source read', async (gate) => {
  const f = await fixture(),
    spy = vi.spyOn(f.sources.estimates, 'jobs');
  await expect(
    readPortfolioMaintenance(f.sources, f.input, gate),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it.each(['horizon', 'range', 'date', 'asof', 'channel', 'enum'] as const)(
  'invalid %s review input fails closed',
  async (kind) => {
    const f = await fixture();
    if (kind === 'horizon') f.input.lead_days = 31;
    if (kind === 'range') f.input.window.from = '2027-03-01';
    if (kind === 'date') f.input.window.through = '2027-02-30';
    if (kind === 'asof') f.input.window.as_of = 'tomorrow';
    if (kind === 'channel') Object.assign(f.input.window, { channel: 'voice' });
    if (kind === 'enum')
      Object.assign(f.input, { kind: { toString: () => 'all' } });
    await expect(read(f)).rejects.toThrow();
  },
);
it('actual reviewer revocation denies current and retained multi-job view', async () => {
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
  expect((await reconcilePortfolioMaintenance(v)).status).toBe('UNKNOWN');
  await expect(read(f)).rejects.toThrow();
});
it('foreign repository or duplicate source selection denied', async () => {
  const f = await fixture(),
    foreign = await fixture(1);
  await expect(
    readPortfolioMaintenance(
      { ...f.sources, property: foreign.sources.property },
      f.input,
      f.gate,
    ),
  ).rejects.toThrow();
  (f.sources.entries as (typeof f.sources.entries)[0][]).push(
    f.sources.entries[0],
  );
  await expect(read(f)).rejects.toThrow();
});
it.each(['input', 'target', 'confirmation', 'container'] as const)(
  'original live %s checked after async consent source',
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
          if (kind === 'input') f.input.query = 'changed';
          if (kind === 'target')
            f.sources.entries[2].target.location_id = 'foreign';
          if (kind === 'confirmation') f.gate.confirmed = false;
          if (kind === 'container') f.sources.entries = [...f.sources.entries];
        }
        return result;
      },
    );
    await expect(read(f)).rejects.toThrow();
  },
);
it('terminal portfolio hash rejects actual plan/source edits', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = new TextDecoder().decode(args[1] as ArrayBuffer);
    if (!changed && body.includes('LOCAL_MULTI_JOB_MAINTENANCE_REVIEW')) {
      changed = true;
      const p = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.id === f.sources.entries[0].plan_id)!;
      f.sources.property.savePlan(f.sources.company.id, {
        ...p,
        name: 'Terminal source mutation',
      });
    }
    return result;
  });
  await expect(read(f)).rejects.toThrow();
  expect(changed).toBe(true);
});
it('changed source keeps immutable earlier view and exact source navigation UNKNOWN', async () => {
  const f = await fixture(),
    v = await read(f),
    before = JSON.stringify(v),
    p = f.sources.property
      .read(f.sources.company.id)
      .plans.find((p) => p.id === f.sources.entries[0].plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...p,
    name: 'Source revision changed',
  });
  expect((await reconcilePortfolioMaintenance(v)).status).toBe('UNKNOWN');
  await expect(
    openPortfolioMaintenanceItem(v, v.findings[0].key),
  ).rejects.toThrow('UNKNOWN');
  expect(JSON.stringify(v)).toBe(before);
});
it('lost source reads never replay or create replacement visits/messages', async () => {
  const f = await fixture(),
    v = await read(f),
    writer = vi.spyOn(f.sources.property, 'addVisit');
  vi.spyOn(f.sources.operations, 'customerHistory').mockRejectedValue(
    Error('Read acknowledgment lost'),
  );
  expect(await reconcilePortfolioMaintenance(v)).toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
    send: false,
  });
  expect(writer).not.toHaveBeenCalled();
});
it.each(['purpose', 'confirmation'] as const)(
  'final consent %s race blocks the exact review',
  async (kind) => {
    const f = await fixture(),
      v = await read(f),
      r = row(v),
      input = { purpose: 'recurring_maintenance' as const },
      gate = { enabled: true, confirmed: true },
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = new TextDecoder().decode(args[1] as ArrayBuffer);
      if (
        !changed &&
        body.includes('LOCAL_PORTFOLIO_CONSENT_BOUNDARY_REVIEW')
      ) {
        changed = true;
        if (kind === 'purpose') Object.assign(input, { purpose: 'marketing' });
        else gate.confirmed = false;
      }
      return result;
    });
    const review = await reviewPortfolioMaintenanceConsent(
      v,
      r.key,
      input,
      gate,
    );
    expect(changed).toBe(true);
    expect(review).not.toHaveProperty('integrity');
    expect(review.send).toBe(false);
  },
);
