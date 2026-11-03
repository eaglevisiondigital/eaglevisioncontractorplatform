import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { occurrence } from '../src/domain/property/inspections';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readMaintenancePlanCorrectionReview,
  saveMaintenancePlanCorrectionReview,
} from '../src/lib/workflows/maintenance-plan-correction';
import {
  readMaintenanceRequirementsReview,
  inspectMaintenanceRequirements,
  compareMaintenanceRequirements,
  maintenanceRequirementsDestination,
} from '../src/lib/workflows/maintenance-requirements-review';
import { MaintenanceRequirementsReview } from '../src/components/workflows/MaintenanceRequirementsReview';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!;
  return { gate, all, entry, sources, org, job };
}
type F = Awaited<ReturnType<typeof fixture>>;
const plan = (f: F) =>
  f.sources.property.read(f.org).plans.find((p) => p.id === f.entry.plan_id)!;
async function correction(f: F) {
  const review = await readMaintenancePlanCorrectionReview(
    f.sources,
    f.job,
    f.gate,
  );
  return {
    review,
    input: {
      plan_id: review.source.plan_id,
      revision: review.source.revision,
      name: 'Current revised maintenance scope',
      cadence: 'custom' as const,
      interval_days: 10,
    },
  };
}
it.each([0, 1, 2])(
  'brand %i reviews actual plan revision, native occurrence identity and blocked requirements',
  async (brand) => {
    const f = await fixture(brand),
      native = plan(f),
      writer = vi.spyOn(f.sources.property, 'savePlan'),
      network = vi.spyOn(globalThis, 'fetch'),
      snapshot = await readMaintenanceRequirementsReview(
        f.sources,
        f.job,
        f.gate,
      ),
      d = inspectMaintenanceRequirements(snapshot);
    expect(d.plan.id).toBe(native.id);
    expect(d.plan.revision).toBe(native.revision);
    const scheduled = d.occurrences.filter(
      (r) => r.source.occurrence_index !== null,
    );
    expect(scheduled.length).toBeGreaterThan(0);
    for (const r of scheduled) {
      expect(r.source.plan_id).toBe(native.id);
      expect(r.source.plan_revision).toBe(native.revision);
      expect(r.due_on).toBe(occurrence(native, r.source.occurrence_index!));
    }
    expect(d.requirements).toMatchObject({
      source_atomicity: 'CAPTURED_NOT_ATOMIC',
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
      sender_authority: 'UNVERIFIED',
      renewal_terms: 'UNKNOWN',
    });
    expect(Object.values(d.authority).every((v) => v === false)).toBe(true);
    expect(d.recipient).toBeNull();
    expect(d.provider_request).toBeNull();
    expect(d.count_is_complete).toBe(false);
    expect(maintenanceRequirementsDestination(snapshot)).toEqual({
      job_id: f.job,
      step: 'maintenance',
    });
    expect(writer).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i compares original current plan with actual original-engine corrected revision',
  async (brand) => {
    const f = await fixture(brand),
      before = await readMaintenanceRequirementsReview(
        f.sources,
        f.job,
        f.gate,
      ),
      oldPlan = before.evidence.plan,
      r = await correction(f),
      beforeJSON = JSON.stringify(before.evidence);
    await saveMaintenancePlanCorrectionReview(r.review, r.input, true);
    expect(() => inspectMaintenanceRequirements(before)).toThrow();
    const current = await readMaintenanceRequirementsReview(
        f.sources,
        f.job,
        f.gate,
      ),
      d = inspectMaintenanceRequirements(current),
      comparison = compareMaintenanceRequirements(before, current);
    expect(d.plan.revision).toBe(oldPlan.revision + 1);
    expect(d.receipt.state).toBe('KNOWN_SAVED');
    expect(d.receipt.source_id).toBe(oldPlan.id);
    expect(d.receipt.result_id).toBe(oldPlan.id);
    expect(comparison.fields.find((x) => x.field === 'cadence')?.state).toBe(
      'CHANGED',
    );
    expect(comparison.fields.find((x) => x.field === 'starts_on')?.state).toBe(
      'UNCHANGED',
    );
    expect(
      comparison.occurrences.some((x) => x.state === 'NOT_IN_CURRENT_REVIEW'),
    ).toBe(true);
    expect(comparison.occurrences.some((x) => x.state === 'ADDED')).toBe(true);
    expect(comparison.meaning).toBe('OBSERVED_DIFFERENCES_ONLY');
    expect(comparison.send).toBe(false);
    expect(comparison.renew).toBe(false);
    expect(JSON.stringify(before.evidence)).toBe(beforeJSON);
  },
);
it('an unchanged same-session source explicitly reports unchanged fields and occurrences', async () => {
  const f = await fixture(),
    a = await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    b = await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    diff = compareMaintenanceRequirements(a, b);
  expect(diff.fields.every((x) => x.state === 'UNCHANGED')).toBe(true);
  expect(diff.occurrences.every((x) => x.state === 'UNCHANGED')).toBe(true);
});
it('another native plan on the same job does not substitute into this exact-plan requirements review', async () => {
  const f = await fixture(),
    context = f.sources.property
      .read(f.org)
      .contexts.find((c) => c.job_id === f.job)!;
  const other = f.sources.property.createPlan(
    f.org,
    context,
    'Separate same-job plan',
  );
  f.sources.property.savePlan(f.org, {
    ...other,
    starts_on: f.entry.day,
    cadence: 'weekly',
  });
  const d = inspectMaintenanceRequirements(
    await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
  );
  expect(d.plan.id).toBe(f.entry.plan_id);
  expect(d.occurrences.length).toBeGreaterThan(0);
  expect(d.occurrences.every((r) => r.source.plan_id === f.entry.plan_id)).toBe(
    true,
  );
});
it('actual published report and finding provenance remains separate from unverified physical completion', async () => {
  const f = await fixture(),
    item = f.sources.property
      .maintenance(f.org, f.entry.target.actor_id)
      .items.find((r) => r.source.report_id === f.entry.report_id)!;
  await f.sources.property.saveMaintenance(
    f.org,
    f.entry.target.actor_id,
    item.source,
    item.record.revision,
    {
      priority: 'normal',
      assignee_id: null,
      follow_up_on: f.entry.day,
      review: 'pending',
      note: 'Actual source-bound synthetic follow-up review',
    },
  );
  const d = inspectMaintenanceRequirements(
    await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
  );
  const findings = d.occurrences.filter((r) => r.source.report_id !== null);
  expect(findings.length).toBeGreaterThan(0);
  for (const r of findings) {
    expect(r.source.report_id).toBe(f.entry.report_id);
    expect(r.source.report_version).toBe(f.entry.published_version);
    expect(r.source.finding_id).toBeTruthy();
  }
  expect(d.physical_completion).toBe('UNVERIFIED');
});
it('actual recorded channel withdrawal invalidates old evidence and remains nonauthorizing after a fresh read', async () => {
  const f = await fixture();
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    true,
    true,
  );
  const before = await readMaintenanceRequirementsReview(
    f.sources,
    f.job,
    f.gate,
  );
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  expect(() => inspectMaintenanceRequirements(before)).toThrow();
  const current = await readMaintenanceRequirementsReview(
      f.sources,
      f.job,
      f.gate,
    ),
    d = inspectMaintenanceRequirements(current),
    diff = compareMaintenanceRequirements(before, current);
  expect(d.recorded_channel.state).toBe('RECORDED_DENIED');
  expect(diff.recorded_channel_changed).toBe(true);
  expect(d.authority.send).toBe(false);
  expect(d.requirements.suppression).toBe('UNVERIFIED');
});
it('recorded permission still leaves purpose, suppression and sender requirements unverified', async () => {
  const f = await fixture();
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    true,
    true,
  );
  const d = inspectMaintenanceRequirements(
    await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
  );
  expect(d.recorded_channel.state).toBe('RECORDED_ALLOWED');
  expect(d.recorded_channel.reference?.id).toBeTruthy();
  expect(d.requirements.purpose_consent).toBe('UNVERIFIED');
  expect(d.authority.send).toBe(false);
});
it('lost canonical save acknowledgment remains UNKNOWN and does not infer an exact receipt result', async () => {
  const f = await fixture(),
    r = await correction(f),
    native = f.sources.property.savePlan.bind(f.sources.property);
  const spy = vi
    .spyOn(f.sources.property, 'savePlan')
    .mockImplementation((...args) => {
      native(...args);
      throw Error('Lost ACK');
    });
  await expect(
    saveMaintenancePlanCorrectionReview(r.review, r.input, true),
  ).rejects.toThrow();
  spy.mockRestore();
  const writer = vi.spyOn(f.sources.property, 'savePlan'),
    d = inspectMaintenanceRequirements(
      await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    );
  expect(d.receipt.state).toBe('UNKNOWN');
  expect(d.receipt.observed).toBe('SOURCE_CHANGED_UNATTRIBUTED');
  expect(d.receipt.result_id).toBeNull();
  expect(d.plan.revision).toBe(r.input.revision + 1);
  expect(d.replay).toBe('FORBIDDEN');
  expect(writer).not.toHaveBeenCalled();
});
it('missing acknowledgment with no result stays UNKNOWN rather than failed', async () => {
  const f = await fixture(),
    r = await correction(f);
  vi.spyOn(f.sources.property, 'savePlan').mockImplementation(() => {
    throw Error('No ACK');
  });
  await expect(
    saveMaintenancePlanCorrectionReview(r.review, r.input, true),
  ).rejects.toThrow();
  const d = inspectMaintenanceRequirements(
    await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
  );
  expect(d.receipt.state).toBe('UNKNOWN');
  expect(d.receipt.observed).toBe('UNAVAILABLE');
  expect(d.plan.revision).toBe(r.input.revision);
});
it('concurrent original corrections retain a single plan CAS and repeated reads do not replay', async () => {
  const f = await fixture(),
    r = await correction(f),
    writer = vi.spyOn(f.sources.property, 'savePlan');
  const outcome = await Promise.allSettled([
    saveMaintenancePlanCorrectionReview(r.review, r.input, true),
    saveMaintenancePlanCorrectionReview(r.review, r.input, true),
  ]);
  expect(outcome.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  const a = await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    b = await readMaintenanceRequirementsReview(f.sources, f.job, f.gate);
  expect(a.evidence.receipt).toEqual(b.evidence.receipt);
  expect(writer).toHaveBeenCalledTimes(1);
});
it('later independent native plan edits retain original known receipt but report unattributed current revision', async () => {
  const f = await fixture(),
    r = await correction(f);
  await saveMaintenancePlanCorrectionReview(r.review, r.input, true);
  f.sources.property.savePlan(f.org, {
    ...plan(f),
    name: 'Later independently recorded edit',
  });
  const d = inspectMaintenanceRequirements(
    await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
  );
  expect(d.receipt.state).toBe('KNOWN_SAVED');
  expect(d.receipt.observed).toBe('SOURCE_CHANGED_UNATTRIBUTED');
  expect(d.plan.revision).toBe(r.input.revision + 2);
  expect(d.authority.renew).toBe(false);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'job_id',
] as const)(
  'source %s mismatch blocks requirements and exact handoff',
  async (key) => {
    const f = await fixture(),
      snapshot = await readMaintenanceRequirementsReview(
        f.sources,
        f.job,
        f.gate,
      );
    f.entry.target[key] =
      key === 'organization_id' ? sampleCompanies[1].id : crypto.randomUUID();
    expect(() => inspectMaintenanceRequirements(snapshot)).toThrow();
    expect(() => maintenanceRequirementsDestination(snapshot)).toThrow();
    await expect(
      readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each(['inactive', 'demoted'] as const)(
  'current %s reviewer cannot read retained requirements',
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
    const snapshot = await readMaintenanceRequirementsReview(
      f.sources,
      f.job,
      f.gate,
    );
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    expect(() => inspectMaintenanceRequirements(snapshot)).toThrow();
  },
);
it('withdrawal during original contact await denies a captured requirements result', async () => {
  const f = await fixture(),
    native = f.sources.operations.customerHistory.bind(f.sources.operations);
  let revoked = false;
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const result = await native(...args);
      if (!revoked) {
        revoked = true;
        await f.sources.operations.recordConsent(
          f.org,
          f.entry.target.customer_id,
          false,
          false,
        );
      }
      return result;
    },
  );
  await expect(
    readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  expect(revoked).toBe(true);
});
it.each(['gate', 'selector', 'plan'] as const)(
  'final hash await denies live %s changes',
  async (mode) => {
    const f = await fixture(),
      native = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await native(...args);
      if (!changed) {
        changed = true;
        if (mode === 'gate') f.gate.confirmed = false;
        if (mode === 'selector')
          f.entry.target.location_id = crypto.randomUUID();
        if (mode === 'plan')
          f.sources.property.savePlan(f.org, {
            ...plan(f),
            name: 'Concurrent revision',
          });
      }
      return result;
    });
    await expect(
      readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('cross-job or cross-repository references cannot be compared as the same plan', async () => {
  const f = await fixture(),
    a = await readMaintenanceRequirementsReview(f.all, f.job, f.gate),
    b = await readMaintenanceRequirementsReview(
      f.all,
      f.all.entries[1].target.job_id!,
      f.gate,
    );
  expect(() => compareMaintenanceRequirements(a, b)).toThrow();
  const other = await fixture(),
    c = await readMaintenanceRequirementsReview(
      other.sources,
      other.job,
      other.gate,
    );
  expect(() => compareMaintenanceRequirements(a, c)).toThrow();
});
it('allowlist excludes recipient addresses, internal notes, prices and workforce data', async () => {
  const f = await fixture(),
    d = inspectMaintenanceRequirements(
      await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    );
  expect(JSON.stringify(d)).not.toMatch(
    /PRIVATE|@|supplier|unit_cost|margin|cash_minor|payroll|staff_only/,
  );
  expect(Object.isFrozen(d.plan)).toBe(true);
});
it('OFF rejects before getters and renders no plan or message controls', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readMaintenanceRequirementsReview(sources, 'untrusted'),
  ).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(MaintenanceRequirementsReview, {
        sources,
        enabled: false,
        selectedJobId: 'untrusted',
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:'])(
  'protocol %s withholds the maintenance interface',
  async (protocol) => {
    const f = await fixture();
    vi.stubGlobal('window', { location: { hostname: '127.0.0.1', protocol } });
    expect(
      renderToStaticMarkup(
        createElement(MaintenanceRequirementsReview, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      ),
    ).toBe('');
  },
);
it.each([0, 1, 2])(
  'brand %i retains original plan writer with accessible read-only requirements',
  async (brand) => {
    const f = await fixture(brand),
      html = renderToStaticMarkup(
        createElement(MaintenanceRequirementsReview, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      );
    expect(html).toContain('Maintenance requirements and revision review');
    expect(html).toContain('Read current maintenance requirements');
    expect(html).toContain('Original maintenance plan correction controls');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Load current maintenance plan');
  },
);
