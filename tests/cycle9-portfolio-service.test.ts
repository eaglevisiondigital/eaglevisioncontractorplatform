import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertPortfolioServiceCurrentNow,
  openPortfolioServiceSource,
  readPortfolioService,
  selectPortfolioServiceJob,
} from '../src/lib/workflows/portfolio-service';
afterEach(() => vi.restoreAllMocks());
async function fixture(i = 0) {
  const gate = { enabled: true, confirmed: true };
  return {
    sources: await prepareOperatingSources(sampleCompanies[i], gate),
    gate,
    input: { location_id: '' },
  };
}
it.each([0, 1, 2])(
  'brand %s groups three exact properties and deduplicates shared-property published reports',
  async (i) => {
    const { sources, gate, input } = await fixture(i),
      before = sources.property.read(sources.company.id),
      writers = [
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.estimates, 'issue'),
        vi.spyOn(sources.estimates, 'approveJob'),
      ];
    const view = await readPortfolioService(sources, input, gate);
    expect(view.available_properties).toBe(3);
    expect(view.available_jobs).toBe(4);
    expect(view.available_reports).toBe(4);
    expect(view.properties).toHaveLength(3);
    const shared = view.properties.find(
      (g) => g.location_id === sources.entries[0].target.location_id,
    )!;
    expect(shared.jobs).toHaveLength(2);
    expect(shared.reports).toHaveLength(2);
    expect(
      shared.reports.every((r) => r.association === 'EXACT_RECORDED_LINK'),
    ).toBe(true);
    expect(
      new Set(
        view.properties.flatMap((g) =>
          g.reports.map(
            (r) =>
              r.report.reference.report_id +
              ':' +
              r.report.reference.published_version,
          ),
        ),
      ).size,
    ).toBe(4);
    for (const g of view.properties)
      for (const item of g.reports) {
        const exact = await openPortfolioServiceSource(
          view,
          item.report.reference,
        );
        expect(exact).toEqual(item.report);
        expect(exact.reference.location_id).toBe(g.location_id);
        expect(exact.observations).toHaveLength(1);
      }
    expect(selectPortfolioServiceJob(view, shared.jobs[0].job_id)).toBe(
      shared.jobs[0].job_id,
    );
    expect(Object.isFrozen(view.properties[0].reports)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /PRIVATE|unit_cost_minor|amount_minor|internal_notes|profit_margin|payroll|actor_id|worker_id|supplier|staff_type/,
    );
    expect(view.history_completeness).toBe('UNKNOWN');
    expect(view.physical_completion).toBe('UNVERIFIED');
    expect(view.customer_acceptance).toBe('UNVERIFIED');
    expect(view.warranty).toBe('UNVERIFIED');
    expect(sources.property.read(sources.company.id)).toEqual(before);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);
it('filters by exact property ID while retaining honest available counts', async () => {
  const { sources, gate, input } = await fixture(),
    all = await readPortfolioService(sources, input, gate),
    property = all.properties[0],
    filtered = await readPortfolioService(
      sources,
      { location_id: property.location_id },
      gate,
    );
  expect(filtered.properties).toHaveLength(1);
  expect(filtered.available_properties).toBe(3);
  expect(filtered.available_reports).toBe(4);
  expect(filtered.properties[0].location_id).toBe(property.location_id);
  const empty = await readPortfolioService(
    sources,
    { location_id: 'foreign-property' },
    gate,
  );
  expect(empty.properties).toEqual([]);
  expect(empty.available_properties).toBe(3);
});
it('never opens a report or job outside the visible exact property filter', async () => {
  const { sources, gate, input } = await fixture(),
    all = await readPortfolioService(sources, input, gate),
    filtered = await readPortfolioService(
      sources,
      { location_id: all.properties[0].location_id },
      gate,
    );
  await expect(
    openPortfolioServiceSource(
      filtered,
      all.properties[1].reports[0].report.reference,
    ),
  ).rejects.toThrow();
  const fresh = await readPortfolioService(
    sources,
    { location_id: all.properties[0].location_id },
    gate,
  );
  expect(() =>
    selectPortfolioServiceJob(fresh, all.properties[1].jobs[0].job_id),
  ).toThrow();
});
it('stays OFF without reading customer models', async () => {
  const { sources, input } = await fixture(),
    reader = vi.spyOn(sources.entries[0].customerModel, 'read');
  await expect(readPortfolioService(sources, input)).rejects.toThrow();
  expect(reader).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'version_id',
] as const)('rejects foreign actual %s handle', async (key) => {
  const { sources, input, gate } = await fixture();
  sources.entries[0].target[key] = 'foreign';
  await expect(readPortfolioService(sources, input, gate)).rejects.toThrow();
});
it('rejects a missing exact published primary report/version without fallback', async () => {
  const { sources, input, gate } = await fixture();
  sources.entries[0].published_version = 2;
  await expect(readPortfolioService(sources, input, gate)).rejects.toThrow();
});
it('rejects logout or wrong property context after displaying documentation', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readPortfolioService(sources, input, gate),
    reference = view.properties[0].reports[0].report.reference;
  sources.entries[0].customerModel.logout();
  await expect(openPortfolioServiceSource(view, reference)).rejects.toThrow();
  expect(() => assertPortfolioServiceCurrentNow(view)).toThrow();
});
it('revoked staff cannot retain a safe navigation handoff', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readPortfolioService(sources, input, gate),
    actor = sources.entries[0].target.actor_id;
  await sources.operations.configure(
    sources.company.id,
    'active',
    'starter',
    {},
    sources.company.id + '-backup-owner',
  );
  await sources.operations.revokeOwner(sources.company.id, actor);
  await expect(
    openPortfolioServiceSource(
      view,
      view.properties[0].reports[0].report.reference,
    ),
  ).rejects.toThrow();
});
it('retains immutable historical output when new documentation extends history; no inferred repair', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readPortfolioService(sources, input, gate),
    immutable = JSON.stringify(view),
    entry = sources.entries[0];
  let visit = sources.property.addVisit(
    sources.company.id,
    entry.plan_id,
    '2026-12-21',
    'after',
  );
  sources.property.saveVisit(sources.company.id, visit, {
    summary:
      'Later documentation records no additional findings; repair not verified.',
    internal_notes: 'PRIVATE',
    findings: [],
    checklist: [],
  });
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.submit(sources.company.id, visit);
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.publish(sources.company.id, visit);
  await expect(
    openPortfolioServiceSource(
      view,
      view.properties[0].reports[0].report.reference,
    ),
  ).rejects.toThrow();
  expect(JSON.stringify(view)).toBe(immutable);
  const fresh = await readPortfolioService(sources, input, gate);
  expect(fresh.available_reports).toBe(5);
  expect(fresh.physical_completion).toBe('UNVERIFIED');
  expect(
    fresh.properties
      .flatMap((g) => g.reports)
      .some((r) => r.report.observations.length === 0),
  ).toBe(true);
});
it.each(['filter', 'target', 'gate', 'model'] as const)(
  'rechecks original %s after final portfolio digest',
  async (change) => {
    const { sources, input, gate } = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'LOCAL_CUSTOMER_SAFE_PROPERTY_PORTFOLIO') {
        reached = true;
        if (change === 'filter') input.location_id = 'changed';
        if (change === 'target')
          sources.entries[0].target.location_id = 'foreign';
        if (change === 'gate') gate.confirmed = false;
        if (change === 'model') sources.entries[0].customerModel.logout();
      }
      return value;
    });
    await expect(readPortfolioService(sources, input, gate)).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it('revalidates original report reference after the final navigation hash', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readPortfolioService(sources, input, gate),
    reference = { ...view.properties[0].reports[0].report.reference },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    reference.published_version = 2;
    return value;
  });
  await expect(openPortfolioServiceSource(view, reference)).rejects.toThrow();
  reference.published_version = 1;
  await expect(openPortfolioServiceSource(view, reference)).rejects.toThrow(
    /UNKNOWN/,
  );
});
it('rejects reconstructed portfolio views and accessor input without executing getters', async () => {
  const { sources, input, gate } = await fixture();
  let invoked = false;
  const evil = Object.defineProperty({ ...input }, 'location_id', {
    enumerable: true,
    get() {
      invoked = true;
      return '';
    },
  });
  await expect(readPortfolioService(sources, evil, gate)).rejects.toThrow();
  expect(invoked).toBe(false);
  const view = await readPortfolioService(sources, input, gate);
  await expect(
    openPortfolioServiceSource(
      JSON.parse(JSON.stringify(view)),
      view.properties[0].reports[0].report.reference,
    ),
  ).rejects.toThrow();
});
it('withholds ambiguous duplicate plan identity instead of assigning a report by wording', async () => {
  const { sources, input, gate } = await fixture(),
    read = sources.property.read.bind(sources.property),
    planId = sources.entries[0].plan_id;
  vi.spyOn(sources.property, 'read').mockImplementation((org) => {
    const value = read(org),
      plan = value.plans.find((p) => p.id === planId)!;
    return { ...value, plans: [...value.plans, structuredClone(plan)] };
  });
  await expect(readPortfolioService(sources, input, gate)).rejects.toThrow();
});
it('groups identical address labels by exact customer and property identity', async () => {
  const { sources, input, gate } = await fixture(),
    first = sources.entries[0],
    second = sources.entries[1],
    location = await sources.operations.getLocation(
      sources.company.id,
      first.target.customer_id,
      first.target.location_id,
    );
  await sources.operations.saveLocation(
    sources.company.id,
    second.target.customer_id,
    {
      address_line1: location.address_line1,
      address_line2: location.address_line2,
      city: location.city,
      region: location.region,
      postal_code: location.postal_code,
      country_code: location.country_code,
    },
    second.target.location_id,
  );
  await sources.property.refreshContexts(sources.company.id);
  const view = await readPortfolioService(sources, input, gate);
  expect(view.properties).toHaveLength(3);
  expect(new Set(view.properties.map((p) => p.location_id)).size).toBe(3);
  expect(new Set(view.properties.map((p) => p.customer_id)).size).toBe(3);
  expect(
    view.properties.find((p) => p.location_id === first.target.location_id)
      ?.jobs,
  ).toHaveLength(2);
});
