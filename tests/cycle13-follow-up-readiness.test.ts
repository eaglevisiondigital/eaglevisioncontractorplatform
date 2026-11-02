import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFollowUpDesk,
  followUpAttemptState,
  prepareFollowUpAdmission,
} from '../src/lib/workflows/follow-up-admission';
import { readGrowthReminderReview } from '../src/lib/growth-reminders';
import {
  readConsentCancellationSources,
  prepareConsentCancellationReview,
} from '../src/lib/workflows/consent-cancellation-review';
import {
  readFollowUpReadiness,
  assertFollowUpReadinessCurrentNow,
  reconcileFollowUpReadiness,
  openFollowUpReadinessSource,
  inspectFollowUpReadinessRequirements,
  reconcileFollowUpReadinessRequirements,
  closeFollowUpReadinessReview,
  type FollowUpReadinessInput,
} from '../src/lib/workflows/follow-up-readiness';
import { FollowUpReadiness } from '../src/components/workflows/FollowUpReadiness';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function input(): FollowUpReadinessInput {
  return {
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
    purpose: 'service_follow_up',
    channel_state: 'all',
  };
}
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate);
  return { gate, sources, input: input() };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) => readFollowUpReadiness(f.sources, f.input, f.gate);
function deskInput(f: Fixture) {
  const { purpose: _purpose, channel_state: _state, ...desk } = f.input;
  void _purpose;
  void _state;
  return desk;
}
it.each([0, 1, 2])(
  'brand %s triages actual maintenance/plan sources with exact identity and no effects',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'addVisit'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const view = await read(f),
      canonical = await readFollowUpDesk(f.sources, deskInput(f), f.gate);
    expect(view.jobs).toHaveLength(4);
    expect(view.rows.map((r) => r.key)).toEqual(
      canonical.candidates.map((c) => c.key),
    );
    for (const row of view.rows) {
      const source = canonical.candidates.find((c) => c.key === row.key)!;
      expect(row.recorded_due_on).toBe(source.selection.due_on);
      expect(row.plan_reference.id).toBe(source.selection.source.plan_id);
      expect(row.plan_reference.revision).toBe(
        source.selection.source.plan_revision,
      );
      expect(row.suppression).toBe('UNVERIFIED');
      expect(row.enrollment_reference).toBeNull();
      expect(row.renewal_terms).toBe('UNKNOWN');
      expect(row.communication_authority).toBe('BLOCKED');
      expect(followUpAttemptState(canonical, row.key)).toBe('NOT_REVIEWED');
    }
    expect(view.authority).toEqual({
      send: false,
      provider: false,
      outbox: false,
      enroll: false,
      schedule: false,
      financial: false,
    });
    expect(view.count_is_complete).toBe(false);
    expect(view.purpose_is).toBe('REQUESTED_REVIEW_CONTEXT_ONLY');
    expect(JSON.stringify(view)).not.toMatch(
      /@example.invalid|555010|PRIVATE|unit_cost|supplier|payroll|internal_notes/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect((await reconcileFollowUpReadiness(view)).status).toBe(
      'CAPTURED_NOT_ATOMIC',
    );
  },
);
it('literal query, exact job/customer/property and channel evidence filters combine on one existing row', async () => {
  const f = await fixture(),
    all = await read(f),
    row = all.rows[0];
  f.input = {
    ...f.input,
    query: row.plan_name.toUpperCase(),
    job_id: row.context.job_id,
    customer_id: row.context.customer_id,
    location_id: row.context.location_id,
    channel_state: row.observed_contact_v1.observed_channel_state,
  };
  const v = await read(f);
  expect(v.rows.length).toBeGreaterThan(0);
  expect(
    v.rows.every(
      (r) =>
        r.context.job_id === row.context.job_id &&
        r.context.customer_id === row.context.customer_id &&
        r.context.location_id === row.context.location_id,
    ),
  ).toBe(true);
  expect(v.rows.every((r) => r.plan_name === row.plan_name)).toBe(true);
});
it.each(['.*', '[joint]', '%', 'NEVER PRESENT LITERAL'])(
  'query %s remains literal with honest empty results',
  async (query) => {
    const f = await fixture();
    f.input.query = query;
    const v = await read(f);
    expect(v.rows).toHaveLength(0);
    expect(v.matching_occurrences).toBe(0);
    expect(v.available_occurrences).toBeGreaterThan(0);
  },
);
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'requested purpose %s cannot fabricate purpose consent/enrollment or renewals',
  async (purpose) => {
    const f = await fixture();
    f.input.purpose = purpose;
    const v = await read(f);
    expect(v.requested_purpose).toBe(purpose);
    expect(
      v.rows.every(
        (r) =>
          r.requested_purpose === purpose &&
          r.purpose_consent === 'UNVERIFIED' &&
          r.enrollment === 'UNVERIFIED' &&
          r.renewal_terms === 'UNKNOWN',
      ),
    ).toBe(true);
    expect(
      v.rows.every(
        (r) =>
          r.next_missing_evidence ===
          'EXACT_ORIGINAL_CONSENT_REQUIREMENTS_REVIEW',
      ),
    ).toBe(true);
  },
);
it('historical SMS denial is observed and filterable while current consent and suppression remain UNKNOWN', async () => {
  const f = await fixture();
  f.input.window.channel = 'sms';
  f.input.channel_state = 'RECORDED_DENIED';
  const v = await read(f);
  expect(v.rows.length).toBeGreaterThan(0);
  expect(
    v.rows.every(
      (r) => r.observed_contact_v1.observed_channel_state === 'RECORDED_DENIED',
    ),
  ).toBe(true);
  expect(
    v.rows.every(
      (r) =>
        r.current_channel_authority === 'UNKNOWN' &&
        r.suppression === 'UNVERIFIED',
    ),
  ).toBe(true);
  f.input = { ...f.input, channel_state: 'RECORDED_ALLOWED' };
  expect((await read(f)).rows).toHaveLength(0);
});
it.each(['job_id', 'customer_id', 'location_id'] as const)(
  'foreign %s selector denies instead of broadening sources',
  async (key) => {
    const f = await fixture();
    f.input[key] = 'foreign';
    await expect(read(f)).rejects.toThrow();
  },
);
it('incompatible admitted job and customer filters deny cross-property matches', async () => {
  const f = await fixture(),
    v = await read(f);
  f.input.job_id = v.jobs[0].job_id;
  f.input.customer_id = v.jobs[1].customer_id;
  await expect(read(f)).rejects.toThrow('Conflicting');
});
it('exact inspection shows recorded plan and contact reference while absent suppression/enrollment/control stay explicit', async () => {
  const f = await fixture(),
    v = await read(f),
    row = v.rows[0],
    detail = await openFollowUpReadinessSource(v, row.key);
  expect(detail).toMatchObject({
    ...row.context,
    source: row.selection,
    plan_reference: row.plan_reference,
    historical_contact_reference: row.observed_contact_v1.reference,
    suppression: 'UNVERIFIED',
    enrollment: 'UNVERIFIED',
    suppression_reference: null,
    enrollment_reference: null,
    original_control_status: 'NOT_REVIEWED',
    original_control_reference: null,
    send: false,
  });
  await expect(openFollowUpReadinessSource(v, 'foreign')).rejects.toThrow();
  await expect(
    openFollowUpReadinessSource(structuredClone(v), row.key),
  ).rejects.toThrow('retained');
});
it('explicit original control produces canonical missing gates and exact control source references without consent writes', async () => {
  const f = await fixture(),
    v = await read(f),
    row = v.rows[0],
    writer = vi.spyOn(f.sources.operations, 'recordConsent');
  const original = await inspectFollowUpReadinessRequirements(
    v,
    row.key,
    { proposed_on: '2027-01-15', plan_kind: 'renewal' },
    f.gate,
  );
  expect(original.envelope).toMatchObject({
    candidate_key: row.key,
    plan_id: row.plan_reference.id,
    purpose: f.input.purpose,
    proposed_on: '2027-01-15',
  });
  expect(original.operational_authority).toBe('BLOCKED');
  expect(original.missing_gates).toContain('SUPPRESSION');
  expect(original.observed).toMatchObject({
    current_channel: 'UNKNOWN',
    purpose: 'UNVERIFIED',
    suppression: 'UNVERIFIED',
    enrollment: 'UNVERIFIED',
  });
  expect(writer).not.toHaveBeenCalled();
  const detail = await openFollowUpReadinessSource(v, row.key);
  expect(detail.original_control_reference).toEqual({
    requirements_sha256: original.original_requirements_sha256,
    review_sha256: original.integrity.sha256,
  });
  expect(
    (await reconcileFollowUpReadinessRequirements(v, row.key)).status,
  ).toBe('ACTIVE_LOCAL_REVIEW');
  expect(row.recorded_due_on).toBe(row.selection.due_on);
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'original %s control withdraws only C12 review and preserves immutable missing evidence',
  async (action) => {
    const f = await fixture(),
      v = await read(f),
      key = v.rows[0].key;
    const original = await inspectFollowUpReadinessRequirements(
        v,
        key,
        { proposed_on: '2027-01-15', plan_kind: 'follow_up' },
        f.gate,
      ),
      bytes = JSON.stringify(original);
    const result = closeFollowUpReadinessReview(v, key, action);
    expect(result.consent_mutation).toBe(false);
    expect(JSON.stringify(original)).toBe(bytes);
    expect((await reconcileFollowUpReadinessRequirements(v, key)).status).toBe(
      result.status,
    );
    expect(
      (await openFollowUpReadinessSource(v, key)).original_control_status,
    ).toBe(result.status);
    await expect(
      inspectFollowUpReadinessRequirements(
        v,
        key,
        { proposed_on: '2027-01-16', plan_kind: 'renewal' },
        f.gate,
      ),
    ).rejects.toThrow('Existing');
  },
);
it('original C10 hold remains authoritative through new readiness views, purpose and date labels', async () => {
  const f = await fixture(),
    desk = await readFollowUpDesk(f.sources, deskInput(f), f.gate),
    c = desk.candidates[0];
  await prepareFollowUpAdmission(
    desk,
    {
      candidate_key: c.key,
      proposed_on: '2027-01-15',
      purpose: 'service_follow_up',
      plan_kind: 'follow_up',
    },
    f.gate,
  );
  const v = await read(f);
  await expect(
    inspectFollowUpReadinessRequirements(
      v,
      c.key,
      { proposed_on: '2027-01-16', plan_kind: 'renewal' },
      f.gate,
    ),
  ).rejects.toThrow();
  f.input = { ...f.input, purpose: 'marketing' };
  const replacement = await read(f);
  await expect(
    inspectFollowUpReadinessRequirements(
      replacement,
      c.key,
      { proposed_on: '2027-01-17', plan_kind: 'follow_up' },
      f.gate,
    ),
  ).rejects.toThrow();
});
it('existing C12 control cannot be replaced and does not become fabricated original control evidence', async () => {
  const f = await fixture(),
    old = await readConsentCancellationSources(f.sources, deskInput(f), f.gate),
    key = old.candidates[0].key;
  await prepareConsentCancellationReview(
    old,
    {
      proposal: {
        candidate_key: key,
        proposed_on: '2027-01-15',
        purpose: 'service_follow_up',
        plan_kind: 'follow_up',
      },
      expires_at: Date.now() + 30 * 60_000,
    },
    f.gate,
  );
  const view = await read(f);
  await expect(
    inspectFollowUpReadinessRequirements(
      view,
      key,
      { proposed_on: '2027-01-16', plan_kind: 'follow_up' },
      f.gate,
    ),
  ).rejects.toThrow('Existing');
  expect(
    (await openFollowUpReadinessSource(view, key)).original_control_reference,
  ).toBeNull();
});
it('a reloaded same-repository view can reconcile only the exact original retained C12 control', async () => {
  const f = await fixture(),
    v = await read(f),
    key = v.rows[0].key;
  const original = await inspectFollowUpReadinessRequirements(
    v,
    key,
    { proposed_on: '2027-01-15', plan_kind: 'follow_up' },
    f.gate,
  );
  const second = await readFollowUpReadiness(
    { ...f.sources },
    { ...f.input, window: { ...f.input.window } },
    f.gate,
  );
  expect(
    (await openFollowUpReadinessSource(second, key)).original_control_reference
      ?.review_sha256,
  ).toBe(original.integrity.sha256);
  expect(
    (await reconcileFollowUpReadinessRequirements(second, key)).status,
  ).toBe('ACTIVE_LOCAL_REVIEW');
  await expect(
    inspectFollowUpReadinessRequirements(
      second,
      key,
      { proposed_on: '2027-01-16', plan_kind: 'renewal' },
      f.gate,
    ),
  ).rejects.toThrow('Existing');
});
it.each(['purpose', 'query', 'gate', 'root', 'staff'] as const)(
  'retained readiness withholds %s drift and never navigates stale sources',
  async (kind) => {
    const f = await fixture(),
      v = await read(f),
      key = v.rows[0].key;
    if (kind === 'purpose') f.input.purpose = 'marketing';
    if (kind === 'query') f.input.query = 'changed';
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'root') f.sources.entries = [...f.sources.entries];
    if (kind === 'staff')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    expect(() => assertFollowUpReadinessCurrentNow(v)).toThrow();
    expect((await reconcileFollowUpReadiness(v)).status).toBe('UNKNOWN');
    await expect(openFollowUpReadinessSource(v, key)).rejects.toThrow();
  },
);
it('actual contact change is detected by explicit reconciliation and permanently withholds captured evidence', async () => {
  const f = await fixture(),
    v = await read(f),
    row = v.rows[0],
    before = JSON.stringify(v);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-27T12:00:00.000Z'));
  await f.sources.operations.recordConsent(
    f.sources.company.id,
    row.context.customer_id,
    false,
    false,
  );
  expect((await reconcileFollowUpReadiness(v)).status).toBe('UNKNOWN');
  expect(() => assertFollowUpReadinessCurrentNow(v)).toThrow();
  expect(JSON.stringify(v)).toBe(before);
  await expect(openFollowUpReadinessSource(v, row.key)).rejects.toThrow();
});
it('missing contact evidence remains UNKNOWN, never a suppression-clear or enrollment fact', async () => {
  const f = await fixture(),
    history = f.sources.operations.customerHistory.bind(f.sources.operations);
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => ({ ...(await history(...args)), consents: [] }),
  );
  f.input.channel_state = 'UNKNOWN';
  const view = await read(f);
  expect(view.rows.length).toBeGreaterThan(0);
  expect(
    view.rows.every(
      (r) =>
        r.observed_contact_v1.reference === null &&
        r.observed_contact_v1.observed_channel_state === 'UNKNOWN' &&
        r.suppression === 'UNVERIFIED',
    ),
  ).toBe(true);
});
it('final awaited digest rechecks original purpose and source inputs before returning a view', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !changed &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_FOLLOW_UP_READINESS_TRIAGE')
    ) {
      changed = true;
      f.input.purpose = 'marketing';
    }
    return result;
  });
  await expect(read(f)).rejects.toThrow();
  expect(changed).toBe(true);
});
it('default OFF and protocol gates prevent source/filter getter execution', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'entries', {
      get: getter,
    }) as Fixture['sources'],
    bad = Object.defineProperty({}, 'window', {
      get: getter,
    }) as FollowUpReadinessInput;
  await expect(readFollowUpReadiness(sources, bad)).rejects.toThrow('OFF');
  expect(
    renderToStaticMarkup(createElement(FollowUpReadiness, { sources })),
  ).toContain('readiness is off');
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'https:' },
  });
  expect(
    renderToStaticMarkup(
      createElement(FollowUpReadiness, { sources, enabled: true }),
    ),
  ).toContain('readiness is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %s markup has source-first controls and explicit human-only purpose/channel labels',
  async (brand) => {
    const f = await fixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(FollowUpReadiness, { sources: f.sources, enabled: true }),
    );
    expect(html).toContain('Load follow-up readiness');
    expect(html).toContain('Literal follow-up search');
    expect(html).toContain('Requested purpose review');
    expect(html).toContain('Historical contact-v1 preference never proves');
    expect(html).not.toContain('PRIVATE');
  },
);
it('strict own-data filters reject getters and serializers without executing them', async () => {
  const f = await fixture(),
    getter = vi.fn(),
    bad = Object.defineProperty({ ...f.input }, 'query', { get: getter });
  await expect(readFollowUpReadiness(f.sources, bad, f.gate)).rejects.toThrow();
  const serialized = {
    ...f.input,
    window: { ...f.input.window, toJSON: getter },
  };
  await expect(
    readFollowUpReadiness(f.sources, serialized, f.gate),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('triage contact references agree with the canonical reader without inventing recipient endpoints', async () => {
  const f = await fixture(),
    view = await read(f),
    row = view.rows[0];
  const actual = await readGrowthReminderReview(
    f.sources.property,
    {
      organization_id: row.context.organization_id,
      customer_id: row.context.customer_id,
      location_id: row.context.location_id,
    },
    f.sources.entries[0].target.actor_id,
    f.input.window,
    { enabled: true },
  );
  expect(row.observed_contact_v1).toEqual(actual.consent);
  expect(row.purpose_consent).toBe(actual.purpose_consent);
  expect(row.suppression).toBe(actual.suppression);
  expect(row.enrollment).toBe(actual.recurring_enrollment);
});
it('filtered-out original keys cannot disclose or close a retained control through a hidden source', async () => {
  const f = await fixture(),
    view = await read(f),
    key = view.rows[0].key;
  await inspectFollowUpReadinessRequirements(
    view,
    key,
    { proposed_on: '2027-01-15', plan_kind: 'follow_up' },
    f.gate,
  );
  const hidden = await readFollowUpReadiness(
    f.sources,
    { ...f.input, query: 'NEVER PRESENT' },
    f.gate,
  );
  expect(hidden.rows).toHaveLength(0);
  expect(
    (await reconcileFollowUpReadinessRequirements(hidden, key)).status,
  ).toBe('UNKNOWN');
  expect(() => closeFollowUpReadinessReview(hidden, key, 'CANCEL')).toThrow(
    'Exact original',
  );
  await expect(openFollowUpReadinessSource(hidden, key)).rejects.toThrow(
    'displayed',
  );
});
it('human proposal drift after original C12 await cannot produce a replacement control or fabricated receipt', async () => {
  const f = await fixture(),
    view = await read(f),
    key = view.rows[0].key,
    proposal = { proposed_on: '2027-01-15', plan_kind: 'follow_up' as const },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !changed &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_CONSENT_CANCELLATION_REVIEW')
    ) {
      changed = true;
      proposal.proposed_on = '2027-01-16';
    }
    return result;
  });
  await expect(
    inspectFollowUpReadinessRequirements(view, key, proposal, f.gate),
  ).rejects.toThrow('proposal changed');
  expect(changed).toBe(true);
  expect((await reconcileFollowUpReadinessRequirements(view, key)).status).toBe(
    'UNKNOWN',
  );
  await expect(
    inspectFollowUpReadinessRequirements(
      view,
      key,
      { proposed_on: '2027-01-17', plan_kind: 'renewal' },
      f.gate,
    ),
  ).rejects.toThrow('Existing');
});
