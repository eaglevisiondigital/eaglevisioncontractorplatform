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
  readMaintenanceRevisionRequirements,
  inspectMaintenanceRevisionRequirements,
  selectMaintenanceRevisionRequirements,
  compareMaintenanceOccurrenceContinuity,
  maintenanceRevisionDestination,
} from '../src/lib/workflows/maintenance-revision-requirements';
import { MaintenanceRevisionRequirements } from '../src/components/workflows/MaintenanceRevisionRequirements';
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
  'brand %i selects exact native occurrence and returns nonauthorizing current requirement matrix',
  async (brand) => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.property, 'savePlan'),
      network = vi.spyOn(globalThis, 'fetch'),
      s = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
      d = inspectMaintenanceRevisionRequirements(s),
      row = d.occurrences.find((r) => r.source.occurrence_index !== null)!,
      selected = selectMaintenanceRevisionRequirements(s, row.id);
    expect(row.due_on).toBe(occurrence(plan(f), row.source.occurrence_index!));
    expect(selected.selected.id).toBe(row.id);
    expect(
      selected.checks.find(
        (c) => c.requirement === 'Exact current plan revision',
      )?.state,
    ).toBe('RECORDED');
    expect(selected.missing_or_blocked).toContain('purpose_consent');
    expect(selected.missing_or_blocked).toContain('suppression');
    expect(selected.missing_or_blocked).toContain(
      'Atomic current consent/revocation boundary',
    );
    expect(selected.authority).toBe('BLOCKED');
    expect(selected.recipient).toBeNull();
    expect(selected.renewal_agreement_id).toBeNull();
    expect(selected.send).toBe(false);
    expect(selected.renew).toBe(false);
    expect(maintenanceRevisionDestination(s, row.id)).toEqual({
      job_id: f.job,
      step: 'maintenance',
    });
    expect(writer).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i does not silently replace an occurrence after actual native plan revision',
  async (brand) => {
    const f = await fixture(brand),
      before = await readMaintenanceRevisionRequirements(
        f.sources,
        f.job,
        f.gate,
      ),
      selectedId = before.evidence.occurrences[0].id,
      r = await correction(f);
    await saveMaintenancePlanCorrectionReview(r.review, r.input, true);
    const current = await readMaintenanceRevisionRequirements(
        f.sources,
        f.job,
        f.gate,
      ),
      diff = compareMaintenanceOccurrenceContinuity(
        before,
        current,
        selectedId,
      );
    expect(diff.continuity).toBe('NOT_IN_CURRENT_REVIEW');
    expect(diff.current_plan_revision).toBe(diff.previous_plan_revision + 1);
    expect(diff.source_replaced).toBe(false);
    expect(diff.completion).toBe('UNVERIFIED');
    expect(() =>
      selectMaintenanceRevisionRequirements(current, selectedId),
    ).toThrow();
    expect(() => maintenanceRevisionDestination(current, selectedId)).toThrow();
    expect(() => inspectMaintenanceRevisionRequirements(before)).toThrow();
    const detail = selectMaintenanceRevisionRequirements(
      current,
      current.evidence.occurrences[0].id,
    );
    expect(detail.selected.source.plan_revision).toBe(r.input.revision + 1);
    expect(
      detail.checks.find((c) => c.requirement === 'Original correction receipt')
        ?.state,
    ).toBe('RECORDED');
    expect(detail.authority).toBe('BLOCKED');
  },
);
it('unchanged exact occurrence ID remains selected without inventing completion or renewal authority', async () => {
  const f = await fixture(),
    a = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    b = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    diff = compareMaintenanceOccurrenceContinuity(
      a,
      b,
      a.evidence.occurrences[0].id,
    );
  expect(diff.continuity).toBe('EXACT_ID_RETAINED');
  expect(diff.contact_reference_changed).toBe(false);
  expect(diff.send).toBe(false);
});
it('actual visit creation changes exact requirement from missing to recorded but never verifies completion', async () => {
  const f = await fixture(),
    before = await readMaintenanceRevisionRequirements(
      f.sources,
      f.job,
      f.gate,
    ),
    row = before.evidence.occurrences.find((r) => r.exact_visits.length === 0)!;
  expect(row).toBeTruthy();
  expect(
    selectMaintenanceRevisionRequirements(before, row.id).checks.find(
      (c) => c.requirement === 'Exact visit relationship',
    )?.state,
  ).toBe('UNKNOWN');
  const visit = f.sources.property.addVisit(f.org, plan(f).id, row.due_on);
  const current = await readMaintenanceRevisionRequirements(
      f.sources,
      f.job,
      f.gate,
    ),
    detail = selectMaintenanceRevisionRequirements(current, row.id);
  expect(detail.selected.visit_consistency).toBe('EXACT_VISIT_OBSERVED');
  expect(detail.selected.exact_visits.map((v) => v.id)).toEqual([visit.id]);
  expect(
    detail.checks.find((c) => c.requirement === 'Exact visit relationship')
      ?.state,
  ).toBe('RECORDED');
  expect(current.evidence.physical_completion).toBe('UNVERIFIED');
  expect(detail.authority).toBe('BLOCKED');
  expect(() => selectMaintenanceRevisionRequirements(before, row.id)).toThrow();
  expect(() =>
    f.sources.property.addVisit(f.org, plan(f).id, row.due_on),
  ).toThrow();
});
it('later independent native edit is not attributed to the original saved correction receipt', async () => {
  const f = await fixture(),
    r = await correction(f);
  await saveMaintenancePlanCorrectionReview(r.review, r.input, true);
  f.sources.property.savePlan(f.org, {
    ...plan(f),
    name: 'Later independent current edit',
  });
  const s = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    detail = selectMaintenanceRevisionRequirements(
      s,
      s.evidence.occurrences[0].id,
    );
  expect(s.evidence.receipt.state).toBe('KNOWN_SAVED');
  expect(detail.selected.review_reasons).toContain(
    'CURRENT_REVISION_NOT_ATTRIBUTED_TO_RECEIPT',
  );
  expect(
    detail.checks.find((c) => c.requirement === 'Original correction receipt')
      ?.state,
  ).toBe('UNKNOWN');
  expect(detail.replay).toBe('FORBIDDEN');
});
it.each(['lost', 'absent'] as const)(
  'ambiguous %s plan acknowledgment preserves UNKNOWN despite available revision facts',
  async (mode) => {
    const f = await fixture(),
      r = await correction(f),
      native = f.sources.property.savePlan.bind(f.sources.property);
    const spy = vi
      .spyOn(f.sources.property, 'savePlan')
      .mockImplementation((...a) => {
        if (mode === 'lost') native(...a);
        throw Error('No ACK');
      });
    await expect(
      saveMaintenancePlanCorrectionReview(r.review, r.input, true),
    ).rejects.toThrow();
    spy.mockRestore();
    const writer = vi.spyOn(f.sources.property, 'savePlan'),
      s = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
      detail = selectMaintenanceRevisionRequirements(
        s,
        s.evidence.occurrences[0].id,
      );
    expect(s.evidence.receipt.state).toBe('UNKNOWN');
    expect(detail.selected.review_reasons).toContain('ORIGINAL_UNKNOWN_HELD');
    expect(
      detail.checks.find((c) => c.requirement === 'Original correction receipt')
        ?.state,
    ).toBe('BLOCKED');
    expect(s.evidence.receipt.result_id).toBeNull();
    expect(detail.replay).toBe('FORBIDDEN');
    await expect(
      saveMaintenancePlanCorrectionReview(r.review, r.input, true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it('concurrent original plan corrections and read matrices never create a second plan revision', async () => {
  const f = await fixture(),
    r = await correction(f),
    writer = vi.spyOn(f.sources.property, 'savePlan'),
    results = await Promise.allSettled([
      saveMaintenancePlanCorrectionReview(r.review, r.input, true),
      saveMaintenancePlanCorrectionReview(r.review, r.input, true),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const [a, b] = await Promise.all([
    readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
  ]);
  expect(a.evidence).toEqual(b.evidence);
  expect(writer).toHaveBeenCalledTimes(1);
});
it.each([0, 1, 2])(
  'brand %i current recorded channel withdrawal stales selection and remains blocking after fresh read',
  async (brand) => {
    const f = await fixture(brand);
    await f.sources.operations.recordConsent(
      f.org,
      f.entry.target.customer_id,
      true,
      true,
    );
    const before = await readMaintenanceRevisionRequirements(
        f.sources,
        f.job,
        f.gate,
      ),
      id = before.evidence.occurrences[0].id;
    await f.sources.operations.recordConsent(
      f.org,
      f.entry.target.customer_id,
      false,
      false,
    );
    expect(() => selectMaintenanceRevisionRequirements(before, id)).toThrow();
    const current = await readMaintenanceRevisionRequirements(
        f.sources,
        f.job,
        f.gate,
      ),
      detail = selectMaintenanceRevisionRequirements(current, id),
      diff = compareMaintenanceOccurrenceContinuity(before, current, id);
    expect(detail.selected.review_reasons).toContain('RECORDED_CHANNEL_DENIED');
    expect(
      detail.checks.find((c) => c.requirement === 'Recorded channel preference')
        ?.state,
    ).toBe('BLOCKED');
    expect(diff.contact_reference_changed).toBe(true);
    expect(detail.send).toBe(false);
  },
);
it('recorded permission does not manufacture purpose, suppression, enrollment or sender evidence', async () => {
  const f = await fixture();
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    true,
    true,
  );
  const s = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    detail = selectMaintenanceRevisionRequirements(
      s,
      s.evidence.occurrences[0].id,
    );
  expect(
    detail.checks.find((c) => c.requirement === 'Recorded channel preference')
      ?.state,
  ).toBe('RECORDED');
  for (const name of [
    'purpose_consent',
    'suppression',
    'enrollment',
    'renewal_terms',
    'sender_authority',
  ])
    expect(detail.checks.find((c) => c.requirement === name)?.state).toBe(
      'UNKNOWN',
    );
  expect(detail.authority).toBe('BLOCKED');
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'job_id',
] as const)('foreign %s denies occurrence detail and handoff', async (key) => {
  const f = await fixture(),
    s = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    id = s.evidence.occurrences[0].id;
  f.entry.target[key] = crypto.randomUUID();
  expect(() => selectMaintenanceRevisionRequirements(s, id)).toThrow();
  expect(() => maintenanceRevisionDestination(s, id)).toThrow();
  await expect(
    readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it.each(['inactive', 'demoted'] as const)(
  'current %s membership withholds maintenance matrix',
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
    const s = await readMaintenanceRevisionRequirements(
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
    expect(() =>
      selectMaintenanceRevisionRequirements(s, s.evidence.occurrences[0].id),
    ).toThrow();
  },
);
it.each(['gate', 'property', 'plan', 'contact'] as const)(
  'new occurrence final hash detects live %s mutation',
  async (mode) => {
    const f = await fixture(),
      native = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await native(...args);
      if (
        !changed &&
        new TextDecoder().decode(args[1]).includes('"visit_consistency"')
      ) {
        changed = true;
        if (mode === 'gate') f.gate.enabled = false;
        if (mode === 'property')
          f.entry.target.location_id = crypto.randomUUID();
        if (mode === 'plan')
          f.sources.property.savePlan(f.org, {
            ...plan(f),
            name: 'Actual concurrent plan revision',
          });
        if (mode === 'contact')
          await f.sources.operations.recordConsent(
            f.org,
            f.entry.target.customer_id,
            false,
            false,
          );
      }
      return out;
    });
    await expect(
      readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('same-property other job cannot substitute an occurrence or comparison reference', async () => {
  const f = await fixture(),
    a = await readMaintenanceRevisionRequirements(f.all, f.job, f.gate),
    b = await readMaintenanceRevisionRequirements(
      f.all,
      f.all.entries[1].target.job_id!,
      f.gate,
    ),
    id = a.evidence.occurrences[0].id;
  expect(() => selectMaintenanceRevisionRequirements(b, id)).toThrow();
  expect(() => compareMaintenanceOccurrenceContinuity(a, b, id)).toThrow();
});
it('unknown ID and executable ID cannot execute coercion or choose a nearest occurrence', async () => {
  const f = await fixture(),
    s = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    coerce = vi.fn(() => s.evidence.occurrences[0].id);
  expect(() => selectMaintenanceRevisionRequirements(s, 'missing')).toThrow();
  expect(() =>
    selectMaintenanceRevisionRequirements(s, {
      toString: coerce,
    } as unknown as string),
  ).toThrow();
  expect(coerce).not.toHaveBeenCalled();
});
it('requirements contain no private notes, recipient, financial or business effects', async () => {
  const f = await fixture(),
    before = JSON.stringify(f.sources.property.read(f.org)),
    s = await readMaintenanceRevisionRequirements(f.sources, f.job, f.gate),
    detail = selectMaintenanceRevisionRequirements(
      s,
      s.evidence.occurrences[0].id,
    );
  expect(JSON.stringify(s.evidence)).not.toMatch(
    /internal_notes|PRIVATE|cash_hour|supplier_cost|margin|payroll|unit_cost/,
  );
  expect(detail.recipient).toBeNull();
  expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
  expect(s.evidence.schedule).toBe(false);
  expect(s.evidence.bill).toBe(false);
});
it('OFF denies before any source getter or requirement rendering', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readMaintenanceRevisionRequirements(sources, 'untrusted'),
  ).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(MaintenanceRevisionRequirements, {
        sources,
        enabled: false,
        selectedJobId: 'untrusted',
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %i retains original native correction form and labelled occurrence controls',
  async (brand) => {
    const f = await fixture(brand),
      html = renderToStaticMarkup(
        createElement(MaintenanceRevisionRequirements, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      );
    expect(html).toContain('Maintenance revision requirements');
    expect(html).toContain('Read occurrence revision requirements');
    expect(html).toContain('Original maintenance plan correction controls');
    expect(html).toContain('aria-live="polite"');
  },
);
