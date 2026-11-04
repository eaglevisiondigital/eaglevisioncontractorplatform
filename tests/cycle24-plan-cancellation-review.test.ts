import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPlanCancellationReview,
  planCancellationFacts,
  selectPlanCancellationOccurrence,
  preparePlanCancellationReview,
  closePlanCancellationReview,
  reconcilePlanCancellationReview,
  type MaintenanceReviewPurpose,
} from '../src/lib/workflows/plan-cancellation-review';
import { MaintenanceCancellationActions } from '../src/components/workflows/MaintenanceCancellationActions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
    review = await readPlanCancellationReview(sources, job, purpose, gate);
  if (!review.desk.rows.length)
    throw Error('Actual native occurrence required');
  const key = review.desk.rows[0].key,
    selected = await selectPlanCancellationOccurrence(review, key),
    proposal = {
      proposed_on: review.desk.rows[0].recorded_due_on,
      plan_kind: 'follow_up' as const,
    };
  return {
    gate,
    all,
    sources,
    entry,
    org,
    job,
    review,
    key,
    selected,
    proposal,
  };
}
it.each([0, 1, 2])(
  'brand %i original blocked review preparation and terminal cancellation never mutate native plans',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.org)),
      jobs = await f.sources.estimates.jobs(f.org),
      save = vi.spyOn(f.sources.property, 'savePlan'),
      visit = vi.spyOn(f.sources.property, 'addVisit'),
      consent = vi.spyOn(f.sources.operations, 'recordConsent'),
      network = vi.spyOn(globalThis, 'fetch');
    const facts = planCancellationFacts(f.review),
      prepared = await preparePlanCancellationReview(
        f.selected,
        f.proposal,
        true,
      );
    expect(facts.native_plan_cancellation).toBe('UNSUPPORTED');
    expect(facts.enrollment_cancellation).toBe('UNSUPPORTED');
    expect(prepared.original_control.envelope.candidate_key).toBe(f.key);
    expect(prepared.original_control.envelope.purpose).toBe(
      'recurring_maintenance',
    );
    expect(prepared.original_control.envelope.job_id).toBe(f.job);
    expect(prepared.original_control.envelope.property_id).toBe(
      f.entry.target.location_id,
    );
    expect(prepared.original_control.envelope.customer_id).toBe(
      f.entry.target.customer_id,
    );
    expect(prepared.original_control.envelope.source_revision).toBe(
      f.selected.selection.occurrence.plan_reference.revision,
    );
    expect(prepared.operational_authority).toBe('BLOCKED');
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'BLOCKED_LOCAL_REVIEW',
    );
    expect(
      (await closePlanCancellationReview(f.selected, 'CANCEL', true)).status,
    ).toBe('CANCELLED_LOCAL_REVIEW');
    const result = await reconcilePlanCancellationReview(f.selected);
    expect(result.status).toBe('CANCELLED_LOCAL_REVIEW');
    expect(result.replay).toBe('FORBIDDEN');
    expect(result.plan_mutation_performed).toBe(false);
    expect(result.send).toBe(false);
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
    expect(await f.sources.estimates.jobs(f.org)).toEqual(jobs);
    expect(
      [save, visit, consent, network].every((s) => s.mock.calls.length === 0),
    ).toBe(true);
  },
);
it.each([0, 1, 2])(
  'brand %i terminal revoke is original review state not consent or enrollment revocation',
  async (brand) => {
    const f = await fixture(brand);
    await preparePlanCancellationReview(f.selected, f.proposal, true);
    const result = await closePlanCancellationReview(
      f.selected,
      'REVOKE',
      true,
    );
    expect(result.status).toBe('REVOKED_LOCAL_REVIEW');
    expect(result.consent_mutation).toBe(false);
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'REVOKED_LOCAL_REVIEW',
    );
    await expect(
      closePlanCancellationReview(f.selected, 'CANCEL', true),
    ).rejects.toThrow();
  },
);
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'purpose %s is explicit requested context and cannot become purpose-specific consent',
  async (purpose) => {
    const f = await fixture(0, purpose),
      facts = planCancellationFacts(f.review),
      actual = await preparePlanCancellationReview(
        f.selected,
        f.proposal,
        true,
      );
    expect(facts.purpose).toBe(purpose);
    expect(actual.requested_purpose).toBe(purpose);
    expect(actual.original_control.envelope.purpose).toBe(purpose);
    expect(actual.observed.purpose).toBe('UNVERIFIED');
    expect(actual.observed.suppression).toBe('UNVERIFIED');
    expect(Object.values(actual.authority).every((v) => v === false)).toBe(
      true,
    );
  },
);
it('a current channel preference does not fill purpose, suppression, enrollment or renewal gates', async () => {
  const f = await fixture(),
    facts = planCancellationFacts(f.review);
  expect(facts.source_atomicity).toBe('CAPTURED_NOT_ATOMIC');
  expect(facts.send).toBe(false);
  expect(facts.renew).toBe(false);
  for (const row of facts.rows) {
    expect(row.purpose_consent).toBe('UNVERIFIED');
    expect(row.suppression).toBe('UNVERIFIED');
    expect(row.enrollment).toBe('UNVERIFIED');
    expect(row.renewal_terms).toBe('UNKNOWN');
  }
});
it('confirmation is required before original preparation and terminal action', async () => {
  const f = await fixture();
  await expect(
    preparePlanCancellationReview(f.selected, f.proposal, false),
  ).rejects.toThrow();
  await preparePlanCancellationReview(f.selected, f.proposal, true);
  await expect(
    closePlanCancellationReview(f.selected, 'CANCEL', false),
  ).rejects.toThrow();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'BLOCKED_LOCAL_REVIEW',
  );
});
it('actual concurrent preparation retains exactly one original one-use blocked review', async () => {
  const f = await fixture(),
    results = await Promise.allSettled([
      preparePlanCancellationReview(f.selected, f.proposal, true),
      preparePlanCancellationReview(f.selected, f.proposal, true),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'BLOCKED_LOCAL_REVIEW',
  );
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'terminal %s cannot be bypassed by a new view, purpose or date',
  async (action) => {
    const f = await fixture();
    await preparePlanCancellationReview(f.selected, f.proposal, true);
    await closePlanCancellationReview(f.selected, action, true);
    const other = await readPlanCancellationReview(
        f.sources,
        f.job,
        'marketing',
        f.gate,
      ),
      selected = await selectPlanCancellationOccurrence(other, f.key);
    await expect(
      preparePlanCancellationReview(
        selected,
        { proposed_on: '2027-01-04', plan_kind: 'renewal' },
        true,
      ),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
  },
);
it('lost original preparation hash acknowledgement stays UNKNOWN and new purpose cannot replay', async () => {
  const f = await fixture();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('Lost original ACK'),
  );
  await expect(
    preparePlanCancellationReview(f.selected, f.proposal, true),
  ).rejects.toThrow();
  vi.restoreAllMocks();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
  const fresh = await readPlanCancellationReview(
      f.sources,
      f.job,
      'marketing',
      f.gate,
    ),
    selected = await selectPlanCancellationOccurrence(fresh, f.key);
  await expect(
    preparePlanCancellationReview(selected, f.proposal, true),
  ).rejects.toThrow();
  await expect(
    closePlanCancellationReview(f.selected, 'CANCEL', true),
  ).rejects.toThrow();
});
it('changing a caller proposal after preparation invalidates original control without changing its immutable evidence', async () => {
  const f = await fixture(),
    actual = await preparePlanCancellationReview(f.selected, f.proposal, true),
    before = JSON.stringify(actual);
  f.proposal.proposed_on = '2027-01-05';
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
  expect(JSON.stringify(actual)).toBe(before);
});
it('exact native plan revision change blocks retained cancellation and never restores historical scheduling', async () => {
  const f = await fixture();
  await preparePlanCancellationReview(f.selected, f.proposal, true);
  const plan = f.sources.property
    .read(f.org)
    .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.org, {
    ...plan,
    name: 'Independent actual plan revision',
  });
  await expect(
    closePlanCancellationReview(f.selected, 'CANCEL', true),
  ).rejects.toThrow();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
  expect(
    f.sources.property.read(f.org).plans.find((p) => p.id === plan.id)
      ?.revision,
  ).toBe(plan.revision + 1);
});
it.each(['customer_id', 'location_id', 'version_id', 'job_id'] as const)(
  'foreign %s cannot cancel or reconcile a retained staff review',
  async (key) => {
    const f = await fixture();
    await preparePlanCancellationReview(f.selected, f.proposal, true);
    f.entry.target[key] = crypto.randomUUID();
    await expect(
      closePlanCancellationReview(f.selected, 'CANCEL', true),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'UNKNOWN',
    );
  },
);
it.each(['inactive', 'demoted'] as const)(
  'current %s member loses terminal control',
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
    const review = await readPlanCancellationReview(
        f.sources,
        f.job,
        'recurring_maintenance',
        f.gate,
      ),
      selected = await selectPlanCancellationOccurrence(
        review,
        review.desk.rows[0].key,
      );
    await preparePlanCancellationReview(selected, f.proposal, true);
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    await expect(
      closePlanCancellationReview(selected, 'CANCEL', true),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(selected)).status).toBe(
      'UNKNOWN',
    );
  },
);
it('nonexistent exact occurrence cannot fall back to a date or similarly named plan', async () => {
  const f = await fixture();
  await expect(
    selectPlanCancellationOccurrence(f.review, 'missing'),
  ).rejects.toThrow();
  await expect(
    selectPlanCancellationOccurrence(f.review, f.key + '-same-date'),
  ).rejects.toThrow();
});
it('strict proposal fields exclude getters before original review preparation', async () => {
  const f = await fixture(),
    getter = vi.fn(),
    proposal = Object.create(null);
  Object.defineProperty(proposal, 'proposed_on', {
    enumerable: true,
    get: getter,
  });
  proposal.plan_kind = 'renewal';
  await expect(
    preparePlanCancellationReview(f.selected, proposal, true),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'READY_FOR_REQUIREMENTS',
  );
});
it('copied original selection cannot prepare a replacement review', async () => {
  const f = await fixture(),
    copied = {
      ...f.selected,
      selection: structuredClone(f.selected.selection),
    };
  await expect(
    preparePlanCancellationReview(copied, f.proposal, true),
  ).rejects.toThrow();
  expect((await reconcilePlanCancellationReview(copied)).status).toBe(
    'UNKNOWN',
  );
});
it('public review facts exclude addresses, staff rates, internal notes and actual provider requests', async () => {
  const f = await fixture(),
    facts = planCancellationFacts(f.review);
  expect(JSON.stringify(facts)).not.toMatch(
    /@example.invalid|555010|unit_cost|salary|cash_hour|PRIVATE|supplier|internal_notes/,
  );
});
it('OFF denies before source getters and exposes no cancellation action', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readPlanCancellationReview(sources, 'untrusted', 'recurring_maintenance'),
  ).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(MaintenanceCancellationActions, {
        sources,
        enabled: false,
        selectedJobId: 'untrusted',
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %i action labels limit cancellation to staff review and retain explicit requested purpose',
  async (brand) => {
    const f = await fixture(brand),
      html = renderToStaticMarkup(
        createElement(MaintenanceCancellationActions, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      );
    expect(html).toContain('Requested staff review purpose');
    expect(html).toContain('Read staff cancellation sources');
    expect(html).toContain('Native plan cancellation');
    expect(html).toContain('UNSUPPORTED');
    expect(html).toContain('aria-live="polite"');
  },
);

it.each([0, 1, 2])(
  'brand %i actual recorded channel withdrawal invalidates a prepared terminal action',
  async (brand) => {
    const f = await fixture(brand);
    await preparePlanCancellationReview(f.selected, f.proposal, true);
    await f.sources.operations.recordConsent(
      f.org,
      f.entry.target.customer_id,
      false,
      false,
    );
    await expect(
      closePlanCancellationReview(f.selected, 'CANCEL', true),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'UNKNOWN',
    );
    const current = await readPlanCancellationReview(
      f.sources,
      f.job,
      'recurring_maintenance',
      f.gate,
    );
    expect(
      planCancellationFacts(current).rows.every(
        (r) => r.recorded_channel === 'RECORDED_DENIED',
      ),
    ).toBe(true);
    expect(planCancellationFacts(current).send).toBe(false);
  },
);
it('caller proposal change at the actual final contact await requires fresh explicit review before original preparation', async () => {
  const f = await fixture(),
    native = f.sources.operations.customerHistory.bind(f.sources.operations);
  let changed = false;
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const result = await native(...args);
      if (!changed) {
        changed = true;
        f.proposal.proposed_on = '2027-01-05';
      }
      return result;
    },
  );
  await expect(
    preparePlanCancellationReview(f.selected, f.proposal, true),
  ).rejects.toThrow(/proposal changed/);
  expect(changed).toBe(true);
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'READY_FOR_REQUIREMENTS',
  );
});
it('live current-source revocation during terminal contact await prevents cancellation', async () => {
  const f = await fixture();
  await preparePlanCancellationReview(f.selected, f.proposal, true);
  const native = f.sources.operations.customerHistory.bind(
    f.sources.operations,
  );
  let changed = false;
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const result = await native(...args);
      if (!changed) {
        changed = true;
        f.gate.enabled = false;
      }
      return result;
    },
  );
  await expect(
    closePlanCancellationReview(f.selected, 'CANCEL', true),
  ).rejects.toThrow();
  expect(changed).toBe(true);
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
});
it('actual original finite expiry is terminal and cannot be cancelled or prepared again', async () => {
  const f = await fixture();
  await preparePlanCancellationReview(f.selected, f.proposal, true);
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60_000);
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'EXPIRED_LOCAL_REVIEW',
  );
  await expect(
    closePlanCancellationReview(f.selected, 'CANCEL', true),
  ).rejects.toThrow();
  await expect(
    preparePlanCancellationReview(f.selected, f.proposal, true),
  ).rejects.toThrow();
});
it('executable review reference fields never run before original opaque-source admission', async () => {
  const getter = vi.fn(),
    selected = Object.create(null);
  Object.defineProperty(selected, 'selection', {
    enumerable: true,
    get: getter,
  });
  selected.review = {};
  await expect(reconcilePlanCancellationReview(selected)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each(['marketing', 'service_follow_up'] as const)(
  'crossed requested purpose %s cannot consume another displayed review selection',
  async (purpose) => {
    const f = await fixture(),
      displayed = await readPlanCancellationReview(
        f.sources,
        f.job,
        purpose,
        f.gate,
      ),
      mixed = { review: displayed, selection: f.selected.selection };
    await expect(
      preparePlanCancellationReview(mixed, f.proposal, true),
    ).rejects.toThrow(/Exact displayed/);
    expect((await reconcilePlanCancellationReview(mixed)).status).toBe(
      'UNKNOWN',
    );
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'READY_FOR_REQUIREMENTS',
    );
    await preparePlanCancellationReview(f.selected, f.proposal, true);
    await expect(
      closePlanCancellationReview(mixed, 'CANCEL', true),
    ).rejects.toThrow(/Exact displayed/);
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'BLOCKED_LOCAL_REVIEW',
    );
  },
);
it('same-purpose equivalent source hashes do not substitute a different displayed original row', async () => {
  const f = await fixture(),
    other = await readPlanCancellationReview(
      f.sources,
      f.job,
      'recurring_maintenance',
      f.gate,
    ),
    mixed = { review: other, selection: f.selected.selection };
  expect(other.desk.integrity.sha256).toBe(f.review.desk.integrity.sha256);
  expect(other.desk.rows[0]).not.toBe(f.selected.selection.occurrence);
  await expect(
    preparePlanCancellationReview(mixed, f.proposal, true),
  ).rejects.toThrow(/Exact displayed/);
  expect((await reconcilePlanCancellationReview(mixed)).status).toBe('UNKNOWN');
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'READY_FOR_REQUIREMENTS',
  );
});
it('another authorized job review cannot cancel or inspect the original job selection', async () => {
  const f = await fixture(),
    otherJob = f.all.entries[0].target.job_id!,
    other = await readPlanCancellationReview(
      f.all,
      otherJob,
      'recurring_maintenance',
      f.gate,
    ),
    mixed = { review: other, selection: f.selected.selection };
  await expect(
    preparePlanCancellationReview(mixed, f.proposal, true),
  ).rejects.toThrow(/Exact displayed/);
  expect((await reconcilePlanCancellationReview(mixed)).status).toBe('UNKNOWN');
  await preparePlanCancellationReview(f.selected, f.proposal, true);
  await expect(
    closePlanCancellationReview(mixed, 'REVOKE', true),
  ).rejects.toThrow(/Exact displayed/);
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'BLOCKED_LOCAL_REVIEW',
  );
});
