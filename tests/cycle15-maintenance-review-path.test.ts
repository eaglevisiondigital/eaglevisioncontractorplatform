import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import {
  readMaintenancePlanningContinuity,
  selectMaintenancePlanningSource,
  prepareMaintenancePlanningContinuity,
  closeMaintenancePlanningContinuity,
} from '../src/lib/workflows/maintenance-planning-continuity';
import {
  readMaintenanceReviewRequirements as read,
  assertMaintenanceReviewRequirementsNow as current,
  reconcileMaintenanceReviewRequirements as reconcile,
  returnMaintenancePlanningReview as back,
} from '../src/lib/workflows/maintenance-review-path';
import { MaintenanceReviewPath } from '../src/components/workflows/MaintenanceReviewPath';
import * as reminders from '../src/lib/growth-reminders';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(
  brand = 0,
  purpose: FollowUpReadinessInput['purpose'] = 'recurring_maintenance',
  channel: 'email' | 'sms' = 'email',
) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate);
  const input: FollowUpReadinessInput = {
    window: {
      from: '2026-12-28',
      through: '2027-01-25',
      as_of: '2026-12-28T12:00:00.000Z',
      channel,
    },
    lead_days: 14,
    overdue_days: 7,
    query: '',
    kind: 'all',
    readiness: 'all',
    job_id: sources.entries[2].target.job_id!,
    customer_id: '',
    location_id: '',
    purpose,
    channel_state: 'all',
  };
  const view = await readMaintenancePlanningContinuity(sources, input, gate),
    selection = await selectMaintenancePlanningSource(
      view,
      view.rows[0].key,
      gate,
    ),
    proposal = {
      proposed_on: selection.occurrence.recorded_due_on,
      plan_kind: 'follow_up' as const,
    },
    review = await prepareMaintenancePlanningContinuity(
      selection,
      proposal,
      gate,
    );
  return { gate, sources, input, view, selection, proposal, review };
}
it.each([0, 1, 2])(
  'brand %s carries exact occurrence/purpose/channel to original requirements and returns without writes',
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
    const packet = await read(f.review, f.gate);
    expect(packet.occurrence.key).toBe(f.selection.occurrence.key);
    expect(packet.occurrence.context).toEqual(f.selection.occurrence.context);
    expect(packet.occurrence.context.job_id).toBe(f.input.job_id);
    expect(packet.occurrence.plan_reference).toEqual(
      f.selection.occurrence.plan_reference,
    );
    expect(packet.requested_purpose).toBe(f.input.purpose);
    expect(packet.channel).toBe(f.input.window.channel);
    expect(packet.original_control).toEqual(f.review.original_control);
    expect(packet.original_control.envelope.candidate_key).toBe(
      packet.occurrence.key,
    );
    expect(packet.original_control.envelope.purpose).toBe(
      packet.requested_purpose,
    );
    expect(packet.original_control.envelope.channel).toBe(packet.channel);
    expect(packet.missing_gates).toEqual(f.review.missing_gates);
    expect(packet.current_channel_authority).toBe('UNKNOWN');
    expect(packet.purpose_consent).toBe('UNVERIFIED');
    expect(packet.suppression).toBe('UNVERIFIED');
    expect(packet.renewal_terms).toBe('UNKNOWN');
    expect(packet.suppression_reference).toBeNull();
    expect(packet.enrollment_reference).toBeNull();
    expect(packet.operational_authority).toBe('BLOCKED');
    expect(
      Object.values(packet.authority).every((value) => value === false),
    ).toBe(true);
    expect((await reconcile(packet)).status).toBe('BLOCKED_LOCAL_REVIEW');
    expect(await back(packet)).toBe(f.review);
    expect(Object.isFrozen(packet.original_control)).toBe(true);
    expect(JSON.stringify(packet)).not.toMatch(
      /unit_cost|supplier|payroll|PRIVATE|@example.invalid|555010/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it.each(['service_follow_up', 'recurring_maintenance', 'marketing'] as const)(
  'purpose %s remains requested context, never purpose consent',
  async (purpose) => {
    const f = await fixture(0, purpose),
      v = await read(f.review, f.gate);
    expect(v.requested_purpose).toBe(purpose);
    expect(v.purpose_consent).toBe('UNVERIFIED');
    expect(v.original_control.envelope.purpose).toBe(purpose);
  },
);
it.each(['email', 'sms'] as const)(
  'channel %s is exact historical evidence, never current sending permission',
  async (channel) => {
    const f = await fixture(0, 'service_follow_up', channel),
      v = await read(f.review, f.gate);
    expect(v.channel).toBe(channel);
    expect(v.current_channel_authority).toBe('UNKNOWN');
    expect(v.operational_authority).toBe('BLOCKED');
  },
);
it('OFF precedes retained-view getters', async () => {
  const getter = vi.fn(),
    view = Object.defineProperty({}, 'occurrence', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['review'];
  await expect(read(view)).rejects.toThrow();
  const sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
    ReturnType<typeof fixture>
  >['sources'];
  expect(
    renderToStaticMarkup(createElement(MaintenanceReviewPath, { sources })),
  ).toContain('review path is off');
  expect(getter).not.toHaveBeenCalled();
});
it('copied views cannot authorize inspection, return or reconciliation', async () => {
  const f = await fixture(),
    v = await read(f.review, f.gate),
    copy = structuredClone(v);
  await expect(read(structuredClone(f.review), f.gate)).rejects.toThrow();
  expect(() => current(copy)).toThrow();
  expect((await reconcile(copy)).status).toBe('UNKNOWN');
  await expect(back(copy)).rejects.toThrow();
});
it.each(['CANCEL', 'REVOKE'] as const)(
  '%s is terminal original local-review withdrawal, never a consent change',
  async (action) => {
    const f = await fixture(),
      v = await read(f.review, f.gate);
    closeMaintenancePlanningContinuity(f.review, action);
    expect(() => current(v)).toThrow();
    expect((await reconcile(v)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
    await expect(back(v)).rejects.toThrow();
    await expect(read(f.review, f.gate)).rejects.toThrow();
  },
);
it('original expiration blocks requirements and return without replacing the occurrence', async () => {
  const f = await fixture(),
    v = await read(f.review, f.gate);
  vi.spyOn(Date, 'now').mockReturnValue(f.review.original_control.expires_at);
  expect(() => current(v)).toThrow();
  expect((await reconcile(v)).status).toBe('EXPIRED_LOCAL_REVIEW');
  await expect(back(v)).rejects.toThrow();
});
it.each([
  'purpose',
  'channel',
  'staff',
  'source',
  'proposal',
  'gate',
  'clock',
] as const)(
  'late %s drift withholds immutable evidence and retains terminal UNKNOWN',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.review, f.gate),
      saved = JSON.stringify(v);
    if (kind === 'purpose') f.input.purpose = 'marketing';
    if (kind === 'channel') f.input.window.channel = 'sms';
    if (kind === 'staff')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'source') f.sources.entries = [...f.sources.entries];
    if (kind === 'proposal') f.proposal.proposed_on = '2027-01-19';
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'clock') vi.spyOn(Date, 'now').mockReturnValue(0);
    expect(() => current(v)).toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(back(v)).rejects.toThrow();
    expect(JSON.stringify(v)).toBe(saved);
  },
);
it.each(['suppression', 'purpose', 'channel'] as const)(
  'conflicting %s observation during an awaited requirements hash is rejected by the original reader',
  async (kind) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle),
      original = reminders.readGrowthReminderReview;
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const r = await digest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_MAINTENANCE_REQUIREMENTS_PATH')
      ) {
        changed = true;
        vi.spyOn(reminders, 'readGrowthReminderReview').mockImplementation(
          async (...call) => {
            const result = await original(...call);
            if (kind === 'suppression')
              return {
                ...result,
                suppression:
                  'CONFLICTING_SUPPRESSION_FIXTURE' as typeof result.suppression,
              };
            if (kind === 'purpose')
              return {
                ...result,
                purpose_consent:
                  'CONFLICTING_PURPOSE_FIXTURE' as typeof result.purpose_consent,
              };
            return {
              ...result,
              consent: { ...result.consent, observed_channel_state: 'UNKNOWN' },
            };
          },
        );
      }
      return r;
    });
    await expect(read(f.review, f.gate)).rejects.toThrow();
    expect(changed).toBe(true);
    vi.restoreAllMocks();
    await expect(read(f.review, f.gate)).rejects.toThrow();
  },
);
it('lost read acknowledgement never replays original review or creates another planning date', async () => {
  const f = await fixture();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('Lost path acknowledgement'),
  );
  await expect(read(f.review, f.gate)).rejects.toThrow();
  vi.restoreAllMocks();
  const digest = vi.spyOn(crypto.subtle, 'digest');
  await expect(read(f.review, f.gate)).rejects.toThrow();
  expect(digest).not.toHaveBeenCalled();
  await expect(
    prepareMaintenancePlanningContinuity(
      f.selection,
      { proposed_on: '2027-01-20', plan_kind: 'renewal' },
      f.gate,
    ),
  ).rejects.toThrow();
});
it('independent inspections share original hold: no duplicate requirements preparation', async () => {
  const f = await fixture(),
    [a, b] = await Promise.all([
      read(f.review, f.gate),
      read(f.review, f.gate),
    ]);
  expect(a.original_control).toBe(b.original_control);
  expect(a.planning_sha256).toBe(b.planning_sha256);
  await expect(
    prepareMaintenancePlanningContinuity(f.selection, f.proposal, f.gate),
  ).rejects.toThrow();
});
it('unrelated occurrence, property and company cannot replace exact original source identities', async () => {
  const f = await fixture(),
    copy = {
      ...structuredClone(f.review),
      organization_id: sampleCompanies[1].id,
      occurrence: {
        ...f.review.occurrence,
        context: {
          ...f.review.occurrence.context,
          job_id: 'foreign-job',
          customer_id: 'foreign-customer',
          location_id: 'foreign-property',
        },
      },
    };
  await expect(read(copy, f.gate)).rejects.toThrow();
});
it.each(['https:', 'file:', 'data:'])(
  'protocol %s stays off without source reads',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
        ReturnType<typeof fixture>
      >['sources'];
    expect(
      renderToStaticMarkup(
        createElement(MaintenanceReviewPath, { sources, enabled: true }),
      ),
    ).toContain('review path is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s accessible path controls retain selected-job context and blocked authority',
  async (brand) => {
    const f = await fixture(brand),
      selectedJobId = f.sources.entries[2].target.job_id!;
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(MaintenanceReviewPath, {
        sources: f.sources,
        enabled: true,
        selectedJobId,
      }),
    );
    expect(html).toContain(selectedJobId);
    expect(html).toContain('Maintenance path purpose');
    expect(html).toContain('Maintenance path channel');
    expect(html).toContain('Review maintenance path sources');
    expect(html).toContain('no permission to send');
    expect(html).not.toMatch(/PRIVATE|supplier|payroll/);
  },
);
it.each(['staff', 'source'] as const)(
  'known cancellation never masks current %s withdrawal',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.review, f.gate);
    closeMaintenancePlanningContinuity(f.review, 'CANCEL');
    if (kind === 'staff')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    else f.sources.entries = [...f.sources.entries];
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(back(v)).rejects.toThrow();
  },
);
