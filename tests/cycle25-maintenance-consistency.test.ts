import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
  planCancellationOccurrenceFacts,
  verifyPlanCancellationRequirements,
  preparePlanCancellationReview,
  closePlanCancellationReview,
  reconcilePlanCancellationReview,
  type MaintenanceReviewPurpose,
} from '../src/lib/workflows/plan-cancellation-review';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(
  brand = 0,
  purpose: MaintenanceReviewPurpose = 'recurring_maintenance',
) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!,
    review = await readPlanCancellationReview(sources, job, purpose, gate),
    key = review.desk.rows[0].key,
    selected = await selectPlanCancellationOccurrence(review, key),
    proposal = {
      proposed_on: review.desk.rows[0].recorded_due_on,
      plan_kind: 'follow_up' as const,
    };
  return {
    gate,
    all,
    entry,
    sources,
    org,
    job,
    review,
    key,
    selected,
    proposal,
  };
}
it.each([0, 1, 2])(
  'brand %i selected occurrence shows actual saved plan/channel/renewal facts without authority',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.org)),
      save = vi.spyOn(f.sources.property, 'savePlan'),
      consent = vi.spyOn(f.sources.operations, 'recordConsent'),
      fetcher = vi.spyOn(globalThis, 'fetch'),
      facts = planCancellationOccurrenceFacts(f.selected),
      result = await verifyPlanCancellationRequirements(f.selected),
      native = f.sources.property
        .read(f.org)
        .plans.find((p) => p.id === f.entry.plan_id)!;
    expect(facts.identity).toEqual(f.entry.target);
    expect(facts.plan.id).toBe(native.id);
    expect(facts.plan.revision).toBe(native.revision);
    expect(facts.plan.cadence).toBe(native.cadence);
    expect(facts.occurrence_key).toBe(f.key);
    expect(facts.recorded_channel).toBe(
      f.review.desk.rows[0].observed_contact_v1.observed_channel_state,
    );
    expect(result.facts).toEqual(facts);
    expect(result.blocked_requirements).toContain('PURPOSE_SPECIFIC_CONSENT');
    expect(result.status).toBe('CURRENT_REQUIREMENTS_CAPTURED_NOT_ATOMIC');
    expect(result.durable_receipt).toBe('NOT_IMPLEMENTED');
    expect(facts.native_plan_cancellation).toBe('UNSUPPORTED');
    expect(facts.enrollment_cancellation).toBe('UNSUPPORTED');
    expect(facts.purpose_consent).toBe('UNVERIFIED');
    expect(facts.suppression).toBe('UNVERIFIED');
    expect(facts.enrollment).toBe('UNVERIFIED');
    expect(facts.renewal_terms).toBe('UNKNOWN');
    expect(result.send).toBe(false);
    expect(result.renew).toBe(false);
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
    expect([save, consent, fetcher].every((s) => !s.mock.calls.length)).toBe(
      true,
    );
    expect(JSON.stringify(facts)).not.toMatch(
      /email_address|phone_number|unit_cost|margin|supplier|staff_note/,
    );
  },
);
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'explicit purpose %s is review context and never substitutes for consent',
  async (purpose) => {
    const f = await fixture(0, purpose),
      result = await verifyPlanCancellationRequirements(f.selected);
    expect(result.facts.requested_purpose).toBe(purpose);
    expect(result.facts.requested_purpose_is).toBe(
      'REVIEW_CONTEXT_NOT_CONSENT',
    );
    expect(result.facts.purpose_consent).toBe('UNVERIFIED');
    expect(result.facts.current_channel_authority).toBe('UNKNOWN');
  },
);
it('repeated read-only verification consumes no attempt and original concurrent prepares remain exactly one', async () => {
  const f = await fixture();
  await Promise.all([
    verifyPlanCancellationRequirements(f.selected),
    verifyPlanCancellationRequirements(f.selected),
  ]);
  const results = await Promise.allSettled([
    preparePlanCancellationReview(f.selected, f.proposal, true),
    preparePlanCancellationReview(f.selected, f.proposal, true),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'BLOCKED_LOCAL_REVIEW',
  );
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'verified original %s is terminal staff review only and cannot reopen through a fresh purpose',
  async (action) => {
    const f = await fixture(),
      before = JSON.stringify(f.sources.property.read(f.org));
    await verifyPlanCancellationRequirements(f.selected);
    await preparePlanCancellationReview(f.selected, f.proposal, true);
    await verifyPlanCancellationRequirements(f.selected);
    await closePlanCancellationReview(f.selected, action, true);
    const read = await reconcilePlanCancellationReview(f.selected);
    expect(read.status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
    expect(read.plan_mutation_performed).toBe(false);
    const fresh = await readPlanCancellationReview(
        f.sources,
        f.job,
        'marketing',
        f.gate,
      ),
      selection = await selectPlanCancellationOccurrence(fresh, f.key);
    await expect(
      preparePlanCancellationReview(
        selection,
        { ...f.proposal, plan_kind: 'renewal' },
        true,
      ),
    ).rejects.toThrow();
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
  },
);
it('native plan CAS changes invalidate both selected requirement display and explicit verification', async () => {
  const f = await fixture(),
    p = f.sources.property
      .read(f.org)
      .plans.find((p) => p.id === f.entry.plan_id)!;
  await verifyPlanCancellationRequirements(f.selected);
  f.sources.property.savePlan(f.org, {
    ...p,
    name: 'Actual current changed native plan',
  });
  expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
  await expect(
    verifyPlanCancellationRequirements(f.selected),
  ).rejects.toThrow();
  await expect(
    preparePlanCancellationReview(f.selected, f.proposal, true),
  ).rejects.toThrow();
});
it.each(['inactive', 'demoted'] as const)(
  'current %s staff cannot verify or consume original selected sources',
  async (mode) => {
    const f = await fixture(),
      actor = f.org + '-estimator';
    await f.sources.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    f.entry.target.actor_id = actor;
    const r = await readPlanCancellationReview(
        f.sources,
        f.job,
        'recurring_maintenance',
        f.gate,
      ),
      s = await selectPlanCancellationOccurrence(r, r.desk.rows[0].key);
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    expect(() => planCancellationOccurrenceFacts(s)).toThrow();
    await expect(verifyPlanCancellationRequirements(s)).rejects.toThrow();
  },
);
it.each(['customer_id', 'location_id', 'job_id', 'version_id'] as const)(
  'retained exact %s cannot be rebound during maintenance verification',
  async (key) => {
    const f = await fixture();
    f.entry.target[key] = crypto.randomUUID();
    await expect(
      verifyPlanCancellationRequirements(f.selected),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'UNKNOWN',
    );
  },
);
it('valid selection from another requested purpose cannot share the displayed review', async () => {
  const f = await fixture(),
    other = await readPlanCancellationReview(
      f.sources,
      f.job,
      'marketing',
      f.gate,
    ),
    mixed = { ...f.selected, review: other };
  expect(() => planCancellationOccurrenceFacts(mixed)).toThrow();
  await expect(verifyPlanCancellationRequirements(mixed)).rejects.toThrow();
});
it('valid selection from another company cannot share the displayed review', async () => {
  const f = await fixture(),
    other = await fixture(1),
    mixed = { ...f.selected, review: other.review };
  expect(() => planCancellationOccurrenceFacts(mixed)).toThrow();
  await expect(verifyPlanCancellationRequirements(mixed)).rejects.toThrow();
});
it('lost original preparation acknowledgment stays UNKNOWN after successful read-only requirement verification', async () => {
  const f = await fixture();
  await verifyPlanCancellationRequirements(f.selected);
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('Lost preparation ACK'),
  );
  await expect(
    preparePlanCancellationReview(f.selected, f.proposal, true),
  ).rejects.toThrow();
  vi.restoreAllMocks();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
  await expect(
    verifyPlanCancellationRequirements(f.selected),
  ).rejects.toThrow();
  const r = await readPlanCancellationReview(
      f.sources,
      f.job,
      'marketing',
      f.gate,
    ),
    s = await selectPlanCancellationOccurrence(r, f.key);
  await expect(
    preparePlanCancellationReview(s, f.proposal, true),
  ).rejects.toThrow();
});
it('channel withdrawal during the actual async contact read blocks verification and never updates consent itself', async () => {
  const f = await fixture(),
    native = f.sources.operations.customerHistory.bind(f.sources.operations);
  let changed = false;
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const value = await native(...args);
      if (!changed) {
        changed = true;
        await f.sources.operations.recordConsent(
          f.org,
          f.entry.target.customer_id,
          false,
          false,
        );
      }
      return value;
    },
  );
  await expect(
    verifyPlanCancellationRequirements(f.selected),
  ).rejects.toThrow();
});
it('OFF rejects before reading arbitrary source getters', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readPlanCancellationReview(sources, 'foreign', 'marketing'),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
