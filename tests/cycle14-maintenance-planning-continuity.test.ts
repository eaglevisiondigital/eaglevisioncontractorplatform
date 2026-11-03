import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  inspectFollowUpReadinessRequirements,
  type FollowUpReadinessInput,
} from '../src/lib/workflows/follow-up-readiness';
import {
  readMaintenancePlanningContinuity as read,
  selectMaintenancePlanningSource as select,
  prepareMaintenancePlanningContinuity as prepare,
  assertMaintenancePlanningContinuityNow as current,
  reconcileMaintenancePlanningContinuity as reconcile,
  closeMaintenancePlanningContinuity as close,
  openMaintenancePlanningContinuitySource as open,
} from '../src/lib/workflows/maintenance-planning-continuity';
import { MaintenancePlanningContinuity } from '../src/components/workflows/MaintenancePlanningContinuity';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate);
  const input: FollowUpReadinessInput = {
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
    purpose: 'recurring_maintenance',
    channel_state: 'all',
  };
  return {
    sources,
    gate,
    input,
    proposal: { proposed_on: '2027-01-04', plan_kind: 'follow_up' as const },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const load = (f: Fixture) => read(f.sources, f.input, f.gate);
async function selection(f: Fixture) {
  const view = await load(f);
  return { view, selected: await select(view, view.rows[0].key, f.gate) };
}
it.each([0, 1, 2])(
  'brand %s exact occurrence → original requirements → terminal withdrawal preserves canonical sources',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.property, 'addVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const { view, selected } = await selection(f),
      review = await prepare(selected, f.proposal, f.gate);
    expect(selected.occurrence).toBe(view.rows[0]);
    expect(review.occurrence).toBe(selected.occurrence);
    expect(review.requested_purpose).toBe(f.input.purpose);
    expect(review.original_control.envelope.purpose).toBe(f.input.purpose);
    expect(review.original_control.envelope.candidate_key).toBe(
      selected.occurrence.key,
    );
    expect(review.original_control.envelope.job_id).toBe(
      selected.occurrence.context.job_id,
    );
    expect(review.original_control.envelope.customer_id).toBe(
      selected.occurrence.context.customer_id,
    );
    expect(review.original_control.envelope.property_id).toBe(
      selected.occurrence.context.location_id,
    );
    expect(review.original_control.envelope.plan_id).toBe(
      selected.occurrence.plan_reference.id,
    );
    expect(review.original_control.envelope.source_revision).toBe(
      selected.occurrence.plan_reference.revision,
    );
    expect(review.source_sha256).toBe(view.integrity.sha256);
    expect(review.selection_sha256).toBe(selected.integrity.sha256);
    expect(review.missing_gates.length).toBeGreaterThan(0);
    expect(review.operational_authority).toBe('BLOCKED');
    expect(review.renewal_terms).toBe('UNKNOWN');
    expect(Object.values(review.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(Object.isFrozen(review)).toBe(true);
    expect(current(review)).toBe('BLOCKED_LOCAL_REVIEW');
    expect((await reconcile(selected)).status).toBe('BLOCKED_LOCAL_REVIEW');
    const detail = await open(review);
    expect(detail.plan_reference).toEqual(selected.occurrence.plan_reference);
    expect(JSON.stringify(review)).not.toMatch(
      /unit_cost|supplier|payroll|PRIVATE|@example.invalid|555010/,
    );
    close(review, 'CANCEL');
    expect((await reconcile(review)).status).toBe('CANCELLED_LOCAL_REVIEW');
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'requested purpose %s remains a proposal, never genuine consent',
  async (purpose) => {
    const f = await fixture();
    f.input.purpose = purpose;
    const { selected } = await selection(f),
      p = await prepare(selected, f.proposal, f.gate);
    expect(p.requested_purpose).toBe(purpose);
    expect(p.original_control.envelope.purpose).toBe(purpose);
    expect(p.purpose_is).toBe('REQUESTED_REVIEW_CONTEXT_ONLY');
    expect(p.observed.purpose).toBe('UNVERIFIED');
    expect(p.observed.suppression).toBe('UNVERIFIED');
  },
);
it.each(['follow_up', 'renewal'] as const)(
  'explicit %s planning retains exact dates without enrollment or renewal authority',
  async (plan_kind) => {
    const f = await fixture(),
      { selected } = await selection(f),
      p = await prepare(selected, { ...f.proposal, plan_kind }, f.gate);
    expect(p.plan_kind).toBe(plan_kind);
    expect(p.proposed_on).toBe(f.proposal.proposed_on);
    expect(p.original_control.envelope.proposed_on).toBe(
      f.proposal.proposed_on,
    );
    expect(p.renewal_terms).toBe('UNKNOWN');
  },
);
it('source inspection is read only and does not consume the original one-use review', async () => {
  const f = await fixture(),
    { view, selected } = await selection(f);
  await open(selected);
  await open(selected);
  expect((await reconcile(selected)).status).toBe('READY_FOR_REQUIREMENTS');
  await expect(prepare(selected, f.proposal)).rejects.toThrow();
  expect(current(selected)).toBe('READY_FOR_REQUIREMENTS');
  await expect(
    inspectFollowUpReadinessRequirements(
      view,
      selected.occurrence.key,
      f.proposal,
      f.gate,
    ),
  ).resolves.toBeTruthy();
  await expect(prepare(selected, f.proposal, f.gate)).rejects.toThrow();
  expect((await reconcile(selected)).status).toBe('UNKNOWN');
});
it('concurrent retained handles cannot create competing original requirements', async () => {
  const f = await fixture(),
    { view, selected } = await selection(f),
    other = await select(view, selected.occurrence.key, f.gate);
  const results = await Promise.allSettled([
    prepare(selected, f.proposal, f.gate),
    prepare(other, { proposed_on: '2027-01-05', plan_kind: 'renewal' }, f.gate),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expect(prepare(selected, f.proposal, f.gate)).rejects.toThrow();
  await expect(prepare(other, f.proposal, f.gate)).rejects.toThrow();
});
it.each(['CANCEL', 'REVOKE'] as const)(
  '%s is terminal same-tab withdrawal, not consent mutation',
  async (action) => {
    const f = await fixture(),
      { selected } = await selection(f),
      p = await prepare(selected, f.proposal, f.gate);
    close(p, action);
    expect((await reconcile(p)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
    await expect(open(p)).rejects.toThrow();
    await expect(prepare(selected, f.proposal, f.gate)).rejects.toThrow();
    const { selected: replacement } = await selection(f);
    await expect(
      prepare(
        replacement,
        { proposed_on: '2027-01-06', plan_kind: 'renewal' },
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it('expiry preserves exact blocked evidence without allowing a replacement date', async () => {
  const f = await fixture(),
    { selected } = await selection(f),
    p = await prepare(selected, f.proposal, f.gate);
  vi.spyOn(Date, 'now').mockReturnValue(p.original_control.expires_at);
  expect((await reconcile(p)).status).toBe('EXPIRED_LOCAL_REVIEW');
  await expect(open(p)).rejects.toThrow();
  await expect(prepare(selected, f.proposal, f.gate)).rejects.toThrow();
});
it.each(['staff', 'root', 'purpose', 'gate', 'clock'] as const)(
  '%s drift withholds retained planning rather than substituting sources',
  async (kind) => {
    const f = await fixture(),
      { selected } = await selection(f);
    if (kind === 'staff')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'root') f.sources.entries = [...f.sources.entries];
    if (kind === 'purpose') f.input.purpose = 'marketing';
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'clock') vi.spyOn(Date, 'now').mockReturnValue(0);
    await expect(prepare(selected, f.proposal, f.gate)).rejects.toThrow();
    expect((await reconcile(selected)).status).toBe('UNKNOWN');
  },
);
it('proposal changed while awaiting the original reader becomes UNKNOWN with no rewrap bypass', async () => {
  const f = await fixture(),
    { selected } = await selection(f),
    real = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await real(...args);
    if (!changed) {
      changed = true;
      f.proposal.proposed_on = '2027-01-05';
    }
    return result;
  });
  await expect(prepare(selected, f.proposal, f.gate)).rejects.toThrow();
  vi.restoreAllMocks();
  expect((await reconcile(selected)).status).toBe('UNKNOWN');
  const { selected: newSelection } = await selection(f);
  await expect(prepare(newSelection, f.proposal, f.gate)).rejects.toThrow();
});
it('lost acknowledgement before delegated custody still prevents a new date, purpose or retained view', async () => {
  const f = await fixture(),
    { selected } = await selection(f);
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(Error('Lost ACK'));
  await expect(prepare(selected, f.proposal, f.gate)).rejects.toThrow();
  vi.restoreAllMocks();
  const hash = vi.spyOn(crypto.subtle, 'digest');
  expect((await reconcile(selected)).status).toBe('UNKNOWN');
  expect(hash).not.toHaveBeenCalled();
  hash.mockRestore();
  f.input.purpose = 'marketing';
  const { selected: other } = await selection(f);
  await expect(
    prepare(other, { proposed_on: '2027-01-08', plan_kind: 'renewal' }, f.gate),
  ).rejects.toThrow();
});
it('immutable snapshot remains exact when later caller input invalidates its use', async () => {
  const f = await fixture(),
    { selected } = await selection(f),
    p = await prepare(selected, f.proposal, f.gate),
    saved = JSON.stringify(p);
  f.proposal.proposed_on = '2027-01-09';
  expect(() => current(p)).toThrow();
  expect((await reconcile(p)).status).toBe('UNKNOWN');
  expect(JSON.stringify(p)).toBe(saved);
});
it('copied source or packet identities cannot authorize requirements, navigation or reconciliation', async () => {
  const f = await fixture(),
    { view, selected } = await selection(f);
  await expect(
    select(structuredClone(view), selected.occurrence.key, f.gate),
  ).rejects.toThrow();
  await expect(
    prepare(structuredClone(selected), f.proposal, f.gate),
  ).rejects.toThrow();
  expect((await reconcile(structuredClone(selected))).status).toBe('UNKNOWN');
  await expect(open(structuredClone(selected))).rejects.toThrow();
});
it('exact selected job filters maintenance occurrences without widening customer/property context', async () => {
  const f = await fixture();
  f.input.job_id = f.sources.entries[2].target.job_id!;
  const v = await load(f);
  expect(v.rows.length).toBeGreaterThan(0);
  expect(v.rows.every((r) => r.context.job_id === f.input.job_id)).toBe(true);
  const selected = await select(v, v.rows[0].key, f.gate);
  expect(selected.occurrence.context.job_id).toBe(f.input.job_id);
});
it.each(['foreign-job', 'another-company-job'])(
  'unknown job %s never falls back to the first source',
  async (job_id) => {
    const f = await fixture();
    f.input.job_id = job_id;
    await expect(load(f)).rejects.toThrow();
  },
);
it('unknown occurrence key cannot select a similar or newest maintenance source', async () => {
  const f = await fixture(),
    v = await load(f);
  await expect(select(v, 'not-an-exact-key', f.gate)).rejects.toThrow();
});
it.each(['2027-02-30', '', 'tomorrow'])(
  'invalid human date %s does not consume a selected source',
  async (proposed_on) => {
    const f = await fixture(),
      { selected } = await selection(f);
    await expect(
      prepare(selected, { ...f.proposal, proposed_on }, f.gate),
    ).rejects.toThrow();
    expect(current(selected)).toBe('READY_FOR_REQUIREMENTS');
  },
);
it('OFF precedes every source/input getter', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'entries', {
      get: getter,
    }) as Fixture['sources'],
    input = Object.defineProperty({}, 'window', {
      get: getter,
    }) as FollowUpReadinessInput;
  await expect(read(sources, input)).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(MaintenancePlanningContinuity, { sources }),
    ),
  ).toContain('continuity is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:', 'ftp:'])(
  'protocol %s remains OFF without source getters',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'entries', {
        get: getter,
      }) as Fixture['sources'];
    expect(
      renderToStaticMarkup(
        createElement(MaintenancePlanningContinuity, {
          sources,
          enabled: true,
        }),
      ),
    ).toContain('continuity is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s initial accessible controls preserve selected Operating Center context',
  async (brand) => {
    const f = await fixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(MaintenancePlanningContinuity, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.sources.entries[1].target.job_id!,
      }),
    );
    expect(html).toContain('Requested planning purpose');
    expect(html).toContain('Review maintenance continuity sources');
    expect(html).toContain(f.sources.entries[1].target.job_id!);
    expect(html).toContain('permission to send');
    expect(html).not.toMatch(/PRIVATE|supplier|payroll/);
  },
);
