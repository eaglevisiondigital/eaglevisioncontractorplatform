import { privacySerialization } from './support/privacy-serialization';
import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  captureOperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readOperatingSelection,
  assertOperatingSelectionCurrentNow,
  revalidateOperatingSelection,
} from '../src/lib/workflows/operating-selection';
import {
  readPortfolioScheduling,
  reconcilePortfolioScheduling,
  openPortfolioSchedulingJob,
  type PortfolioSchedulingInput,
} from '../src/lib/workflows/portfolio-scheduling';
import {
  readPortfolioFinance,
  inspectPortfolioFinance,
  openPortfolioFinanceJob,
  type PortfolioFinanceInput,
} from '../src/lib/workflows/portfolio-finance';
import {
  readPortfolioService,
  assertPortfolioServiceCurrentNow,
  openPortfolioServiceSource,
} from '../src/lib/workflows/portfolio-service';
import { jobFinancials } from '../src/domain/jobs/financials';
import { Phase3Repository } from '../src/lib/phase3';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import {
  prepareOperatingAddon,
  reconcileOperatingAddon,
  operatingAddonKinds,
} from '../src/lib/workflows/operating-addons';
import {
  readPortfolioMaintenance,
  reconcilePortfolioMaintenance,
  openPortfolioMaintenanceItem,
  reviewPortfolioMaintenanceConsent,
  reconcilePortfolioMaintenanceConsent,
  type PortfolioMaintenanceInput,
} from '../src/lib/workflows/portfolio-maintenance';
import {
  readBusinessBriefing,
  inspectBusinessBriefing,
  filterBusinessBriefing,
  openBusinessBriefingSource,
} from '../src/lib/workflows/business-briefing';

const gate = () => ({ enabled: true, confirmed: true });
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0, knownLabor = false) {
  const admitted = gate(),
    sources = await prepareOperatingSources(sampleCompanies[index], admitted);
  if (knownLabor)
    await sources.estimates.payroll(
      sources.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      {},
      true,
    );
  const scheduling: PortfolioSchedulingInput = {
    week_start: '2026-12-28',
    timezone: 'America/Chicago',
    job_id: '',
    worker_id: '',
    proposals: [],
  };
  const finance: PortfolioFinanceInput = {
    as_of: '2026-12-08T12:00:00.000Z',
    input_revision: 1,
    excludes_unpaid_commitments: true,
    proposals: sources.entries.map((entry, i) => ({
      job_id: entry.target.job_id!,
      remaining: {
        materials: 1500 + i,
        labor: 2100,
        subcontractors: 0,
        equipment: 0,
        other: 0,
      },
    })),
  };
  const maintenance: PortfolioMaintenanceInput = {
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
  return {
    sources,
    gate: admitted,
    selection: { query: '', page: 0, page_size: 5 },
    scheduling,
    finance,
    service: { location_id: '' },
    maintenance,
    briefing: {
      review_on: '2026-12-28',
      timezone: 'America/Chicago',
      input_revision: 1,
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function reviews(f: Fixture) {
  const [selection, scheduling, finance, service, maintenance, briefing] =
    await Promise.all([
      readOperatingSelection(f.sources, f.selection, f.gate),
      readPortfolioScheduling(f.sources, f.scheduling, f.gate),
      readPortfolioFinance(f.sources, f.finance, f.gate),
      readPortfolioService(f.sources, f.service, f.gate),
      readPortfolioMaintenance(f.sources, f.maintenance, f.gate),
      readBusinessBriefing(f.sources, f.briefing, f.gate),
    ]);
  return { selection, scheduling, finance, service, maintenance, briefing };
}

it('rejects executable company source serialization without invoking caller code', async () => {
  const admitted = gate(),
    sources = await prepareOperatingSources(sampleCompanies[0], admitted),
    serialize = vi.fn(() => sources.company),
    company = { ...sources.company, toJSON: serialize },
    substituted = {
      ...sources,
      company,
      entries: sources.entries.map((entry) => ({ ...entry, company })),
    };
  expect(() => captureOperatingSources(substituted, admitted)).toThrow();
  expect(serialize).not.toHaveBeenCalled();
});

it.each(['day', 'report_id', 'published_version', 'issued'] as const)(
  'rejects executable %s source evidence before serialization',
  async (field) => {
    const admitted = gate(),
      sources = await prepareOperatingSources(sampleCompanies[0], admitted),
      original = sources.entries[0],
      serialize = vi.fn(() => original[field]),
      entry = { ...original, [field]: { toJSON: serialize } },
      entries = [entry, ...sources.entries.slice(1)];
    expect(() =>
      captureOperatingSources({ ...sources, entries } as never, admitted),
    ).toThrow();
    expect(serialize).not.toHaveBeenCalled();
  },
);

it('never invokes a newly substituted root admission getter during terminal source checks', async () => {
  const admitted = gate(),
    sources = await prepareOperatingSources(sampleCompanies[0], admitted),
    captured = captureOperatingSources(sources, admitted),
    getter = vi.fn(() => admitted);
  Object.defineProperty(sources, 'gate', { get: getter, enumerable: true });
  expect(captured.check).toThrow();
  expect(getter).not.toHaveBeenCalled();
});

it('rejects startup company serialization before any fixture initialization', async () => {
  const serialize = vi.fn(() => sampleCompanies[0]),
    company = { ...sampleCompanies[0], toJSON: serialize },
    initialize = vi.spyOn(Phase3Repository.prototype, 'initialize');
  await expect(prepareOperatingSources(company, gate())).rejects.toThrow();
  expect(serialize).not.toHaveBeenCalled();
  expect(initialize).not.toHaveBeenCalled();
});

it.each(['id', 'version_number'] as const)(
  'rejects data-only issued %s metadata that contradicts the canonical target version',
  async (field) => {
    const admitted = gate(),
      sources = await prepareOperatingSources(sampleCompanies[0], admitted),
      first = sources.entries[0],
      issued = structuredClone(first.issued);
    if (field === 'id')
      issued.version.id = sources.entries[1].target.version_id;
    else issued.version.version_number += 40;
    const entry = { ...first, issued };
    expect(() =>
      captureOperatingSources(
        { ...sources, entries: [entry, ...sources.entries.slice(1)] },
        admitted,
      ),
    ).toThrow();
  },
);

it.each([0, 1, 2])(
  'composes brand %i four canonical jobs across three exact properties without duplicate reports, costs or writer effects',
  async (index) => {
    const f = await fixture(index),
      s = f.sources,
      original = {
        property: s.property.read(s.company.id),
        jobs: s.entries.map((e) =>
          s.estimates.readSyntheticPrototypeSources(e.target),
        ),
        releases: s.entries.map((e) => e.release.read('staff')),
      },
      writers = [
        vi.spyOn(s.property, 'addVisit'),
        vi.spyOn(s.property, 'saveVisit'),
        vi.spyOn(s.property, 'savePlan'),
        vi.spyOn(s.property, 'publish'),
        vi.spyOn(s.estimates, 'assignJob'),
        vi.spyOn(s.estimates, 'recordTime'),
        vi.spyOn(s.estimates, 'projection'),
        vi.spyOn(s.estimates, 'submitExpense'),
        vi.spyOn(s.estimates, 'issue'),
        vi.spyOn(s.estimates, 'approveJob'),
        ...s.entries.map((e) => vi.spyOn(e.release, 'command')),
      ];
    const r = await reviews(f),
      ids = s.entries.map((e) => e.target.job_id!);
    expect(r.selection.available).toBe(4);
    expect(r.selection.matching).toBe(4);
    expect(new Set(r.selection.rows.map((row) => row.job_id))).toEqual(
      new Set(ids),
    );
    expect(r.scheduling.available_jobs).toBe(4);
    expect(r.scheduling.days).toHaveLength(7);
    expect(r.scheduling.actual_availability).toBe('UNKNOWN');
    expect(
      new Set(r.scheduling.jobs.flatMap((j) => j.crew.map((w) => w.worker_id)))
        .size,
    ).toBe(2);
    expect(r.finance.jobs.map((j) => j.target.job_id)).toEqual(ids);
    expect(r.finance.coverage).toMatchObject({
      selected_jobs: 4,
      covered_jobs: 0,
      status: 'UNKNOWN',
    });
    expect(r.finance.totals.recorded).toBeNull();
    expect(r.finance.totals.proposed).toBeNull();
    expect(r.finance.totals.issued_quoted_total_minor).toBe(
      original.jobs.reduce(
        (sum, j) => sum + j.bundle.version.calculation.total_minor,
        0,
      ),
    );
    expect(Object.values(r.finance.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(
      Object.values(r.scheduling.authority).every((v) => v === false),
    ).toBe(true);
    expect(r.service).toMatchObject({
      available_properties: 3,
      available_jobs: 4,
      available_reports: 4,
      history_completeness: 'UNKNOWN',
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
    });
    const shared = r.service.properties.find(
      (p) => p.location_id === s.entries[0].target.location_id,
    )!;
    expect(shared.jobs).toHaveLength(2);
    expect(shared.reports).toHaveLength(2);
    expect(
      new Set(
        r.service.properties.flatMap((p) =>
          p.reports.map((item) => JSON.stringify(item.report.reference)),
        ),
      ).size,
    ).toBe(4);
    expect(privacySerialization(r.service)).not.toMatch(
      /PRIVATE|internal_notes|unit_cost_minor|supplier|margin|payroll|actor_id|worker_id|staff_type|@example.invalid|555010/,
    );
    for (const e of s.entries) {
      expect(
        await revalidateOperatingSelection(s, r.selection, e.target.job_id!),
      ).toMatchObject({
        job_id: e.target.job_id,
        customer_id: e.target.customer_id,
        location_id: e.target.location_id,
        issued_version_id: e.target.version_id,
        authority: 'NAVIGATION_ONLY',
      });
      expect(
        await openPortfolioSchedulingJob(r.scheduling, e.target.job_id!),
      ).toMatchObject({
        job_id: e.target.job_id,
        customer_id: e.target.customer_id,
        location_id: e.target.location_id,
        version_id: e.target.version_id,
      });
      expect(
        openPortfolioFinanceJob(r.finance, e.target.job_id!).target,
      ).toEqual(e.target);
      const property = r.service.properties.find(
          (p) => p.location_id === e.target.location_id,
        )!,
        source = property.reports.find(
          (item) => item.report.reference.report_id === e.report_id,
        )!;
      expect(source.linked_job_ids).toEqual([e.target.job_id]);
      expect(
        await openPortfolioServiceSource(r.service, {
          ...source.report.reference,
        }),
      ).toEqual(source.report);
    }
    expect((await inspectPortfolioFinance(r.finance)).status).toBe(
      'CURRENT_LOCAL_SOURCE',
    );
    expect((await reconcilePortfolioScheduling(r.scheduling)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect(r.maintenance.available_jobs).toBe(4);
    expect(r.maintenance.findings).toHaveLength(4);
    expect(new Set(r.maintenance.findings.map((item) => item.key)).size).toBe(
      4,
    );
    expect(r.maintenance.matching_occurrences).toBe(
      r.maintenance.candidates.length,
    );
    expect(r.maintenance.current_channel_authority).toBe('UNKNOWN');
    expect(
      Object.values(r.maintenance.authority).every((v) => v === false),
    ).toBe(true);
    const finding = r.maintenance.findings.find(
      (item) => item.context.job_id === s.entries[0].target.job_id,
    )!;
    expect(
      await openPortfolioMaintenanceItem(r.maintenance, finding.key),
    ).toMatchObject({
      authority: 'NAVIGATION_ONLY',
      job_id: s.entries[0].target.job_id,
      customer_id: s.entries[0].target.customer_id,
      location_id: s.entries[0].target.location_id,
    });
    expect(r.briefing.coverage.selected_jobs).toBe(4);
    expect(r.briefing.model).toBe('NONE');
    expect(Object.values(r.briefing.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(r.briefing.jobs.map((item) => item.target.job_id)).toEqual(ids);
    const sourceCard = r.briefing.cards.find(
      (card) =>
        card.job_id === s.entries[0].target.job_id &&
        card.source.kind === 'report',
    )!;
    expect(sourceCard.source).toMatchObject({
      id: s.entries[0].report_id,
      version: s.entries[0].published_version,
    });
    expect(
      (await openBusinessBriefingSource(r.briefing, sourceCard.key)).target,
    ).toEqual(s.entries[0].target);
    expect(
      filterBusinessBriefing(r.briefing, {
        area: 'all',
        level: 'all',
        job_id: s.entries[0].target.job_id,
        query: '',
      }).cards.every((card) => card.job_id === s.entries[0].target.job_id),
    ).toBe(true);
    expect((await inspectBusinessBriefing(r.briefing)).status).toBe(
      'CURRENT_LOCAL_SOURCE',
    );
    expect((await reconcilePortfolioMaintenance(r.maintenance)).status).toBe(
      'CAPTURED_NOT_ATOMIC',
    );
    expect(writers.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(s.property.read(s.company.id)).toEqual(original.property);
    expect(
      s.entries.map((e) => s.estimates.readSyntheticPrototypeSources(e.target)),
    ).toEqual(original.jobs);
    expect(s.entries.map((e) => e.release.read('staff'))).toEqual(
      original.releases,
    );
  },
);

it('sums canonical known-cost facts once for four jobs, including two jobs at one property, while quoted scope is never earned revenue', async () => {
  const f = await fixture(0, true),
    s = f.sources,
    original = s.entries.map(
      (e) => s.estimates.readSyntheticPrototypeSources(e.target).job!,
    ),
    canonical = original.map((job, i) =>
      jobFinancials({
        ...structuredClone(job),
        projection: {
          ...job.projection,
          remaining: f.finance.proposals[i].remaining,
          costs_complete: false,
        },
      }),
    ),
    reviewed = await readPortfolioFinance(s, f.finance, f.gate);
  expect(reviewed.coverage).toMatchObject({
    covered_jobs: 4,
    status: 'PARTIAL_NOT_FINAL',
  });
  expect(reviewed.totals.proposed?.projectedMinor).toBe(
    canonical.reduce((sum, j) => sum + j.projected_cost_minor, 0),
  );
  expect(reviewed.totals.proposed?.unpaidCommitmentMinor).toBe(125000);
  expect(reviewed.totals.proposed?.remainingForecastMinor).toBe(
    f.finance.proposals.reduce(
      (sum, p) => sum + Object.values(p.remaining).reduce((a, b) => a + b, 0),
      0,
    ),
  );
  expect(reviewed.jobs.every((j) => j.review.invoice.overall === 'NO_GO')).toBe(
    true,
  );
  expect(
    s.entries.map(
      (e) => s.estimates.readSyntheticPrototypeSources(e.target).job,
    ),
  ).toEqual(original);
});

it('actual current CRM edits withhold every retained portfolio while published report bytes remain immutable', async () => {
  const f = await fixture(),
    r = await reviews(f),
    e = f.sources.entries[0],
    s = f.sources,
    before = JSON.stringify(r.service),
    customer = await s.operations.getCustomer(
      s.company.id,
      e.target.customer_id,
    );
  await s.operations.saveCustomer(
    s.company.id,
    {
      display_name: customer.display_name + ' amended',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      customer_type: customer.customer_type,
      preferred_contact: customer.preferred_contact,
    },
    customer.id,
  );
  expect(() => assertOperatingSelectionCurrentNow(r.selection)).toThrow();
  expect(() => assertPortfolioServiceCurrentNow(r.service)).toThrow();
  expect((await inspectPortfolioFinance(r.finance)).status).toBe('UNKNOWN');
  expect((await reconcilePortfolioScheduling(r.scheduling)).status).toBe(
    'UNKNOWN',
  );
  expect((await reconcilePortfolioMaintenance(r.maintenance)).status).toBe(
    'UNKNOWN',
  );
  expect((await inspectBusinessBriefing(r.briefing)).status).toBe('UNKNOWN');
  expect(JSON.stringify(r.service)).toBe(before);
  await expect(
    openPortfolioServiceSource(
      r.service,
      r.service.properties[0].reports[0].report.reference,
    ),
  ).rejects.toThrow();
});

it.each([
  'selection',
  'scheduling',
  'finance',
  'service',
  'maintenance',
  'briefing',
] as const)(
  'withholds %s when the original live input changes after its final payload hash',
  async (kind) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle),
      modes = {
        selection: 'LOCAL_OPERATING_SOURCE_SELECTION',
        scheduling: 'LOCAL_MULTI_JOB_WEEKLY_REVIEW',
        finance: 'LOCAL_SYNTHETIC_PORTFOLIO_FINANCE',
        service: 'LOCAL_CUSTOMER_SAFE_PROPERTY_PORTFOLIO',
        maintenance: 'LOCAL_MULTI_JOB_MAINTENANCE_REVIEW',
        briefing: 'LOCAL_SYNTHETIC_BUSINESS_BRIEFING',
      };
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === modes[kind]) {
        reached = true;
        if (kind === 'selection') f.selection.query = 'changed original search';
        if (kind === 'scheduling')
          f.scheduling.job_id = f.sources.entries[1].target.job_id!;
        if (kind === 'finance') f.finance.proposals[0].remaining.materials++;
        if (kind === 'service')
          f.service.location_id = f.sources.entries[1].target.location_id;
        if (kind === 'maintenance')
          f.maintenance.query = 'changed original maintenance filter';
        if (kind === 'briefing') f.briefing.input_revision++;
      }
      return result;
    });
    const readers = {
      selection: () => readOperatingSelection(f.sources, f.selection, f.gate),
      scheduling: () =>
        readPortfolioScheduling(f.sources, f.scheduling, f.gate),
      finance: () => readPortfolioFinance(f.sources, f.finance, f.gate),
      service: () => readPortfolioService(f.sources, f.service, f.gate),
      maintenance: () =>
        readPortfolioMaintenance(f.sources, f.maintenance, f.gate),
      briefing: () => readBusinessBriefing(f.sources, f.briefing, f.gate),
    };
    await expect(readers[kind]()).rejects.toThrow();
    expect(reached).toBe(true);
  },
);

it('revoked staff cannot reconcile any exact retained desk or open its previous sources', async () => {
  const f = await fixture(),
    r = await reviews(f),
    s = f.sources;
  await s.operations.configure(
    s.company.id,
    'active',
    'starter',
    {},
    s.company.id + '-backup-owner',
  );
  await s.operations.revokeOwner(s.company.id, s.entries[0].target.actor_id);
  expect(() => assertOperatingSelectionCurrentNow(r.selection)).toThrow();
  expect(() => assertPortfolioServiceCurrentNow(r.service)).toThrow();
  expect((await reconcilePortfolioScheduling(r.scheduling)).status).toBe(
    'UNKNOWN',
  );
  expect((await inspectPortfolioFinance(r.finance)).status).toBe('UNKNOWN');
  expect((await reconcilePortfolioMaintenance(r.maintenance)).status).toBe(
    'UNKNOWN',
  );
  expect((await inspectBusinessBriefing(r.briefing)).status).toBe('UNKNOWN');
  await expect(
    openBusinessBriefingSource(r.briefing, r.briefing.cards[0].key),
  ).rejects.toThrow();
  await expect(reviews(f)).rejects.toThrow();
});

it('rejects duplicate handles, a real foreign company handle and a wrong customer/property pairing without selecting replacement jobs', async () => {
  const f = await fixture(),
    other = await fixture(1),
    s = f.sources,
    variants = [
      { ...s, entries: [s.entries[0], s.entries[0]] },
      { ...s, entries: [s.entries[0], other.sources.entries[0]] },
      {
        ...s,
        entries: [
          {
            ...s.entries[0],
            target: {
              ...s.entries[0].target,
              location_id: s.entries[1].target.location_id,
            },
          },
          ...s.entries.slice(1),
        ],
      },
    ];
  for (const sources of variants) {
    expect(() => captureOperatingSources(sources, f.gate)).toThrow();
    await expect(
      readOperatingSelection(sources, f.selection, f.gate),
    ).rejects.toThrow();
    await expect(
      readPortfolioFinance(sources, f.finance, f.gate),
    ).rejects.toThrow();
    await expect(
      readPortfolioService(sources, f.service, f.gate),
    ).rejects.toThrow();
  }
});

it('retains exact property ownership when reviewing historical consent and withholds the historical match after actual withdrawal', async () => {
  const f = await fixture(),
    view = await readPortfolioMaintenance(f.sources, f.maintenance, f.gate),
    row = view.candidates.find(
      (candidate) => candidate.staff_planning_eligible,
    )!,
    review = await reviewPortfolioMaintenanceConsent(
      view,
      row.key,
      { purpose: 'recurring_maintenance' },
      f.gate,
    ),
    before = JSON.stringify(review);
  expect(review).toMatchObject({
    status: 'UNKNOWN',
    decision: 'BLOCKED',
    send: false,
    recipient: null,
    provider_request: null,
  });
  if (!('context' in review)) throw Error('Exact historical review missing');
  expect(review.context).toEqual(row.context);
  expect(review.current_contact_reference).toBeNull();
  expect(review.observed_channel_state).toBe('UNKNOWN');
  expect(await reconcilePortfolioMaintenanceConsent(review)).toMatchObject({
    status: 'UNKNOWN',
    decision: 'BLOCKED',
    historical_binding: 'MATCHED_HISTORICAL_CAPTURE_ONLY',
    send: false,
  });
  await f.sources.operations.recordConsent(
    f.sources.company.id,
    row.context.customer_id,
    false,
    false,
  );
  expect(await reconcilePortfolioMaintenanceConsent(review)).not.toHaveProperty(
    'historical_binding',
  );
  expect(JSON.stringify(review)).toBe(before);
});

it('withholds a safe portfolio when an equal-context customer model instance is replaced during its final hash', async () => {
  const f = await fixture(),
    first = f.sources.entries[0],
    replacement = new CustomerPortalPreviewModel(
      f.sources.company,
      f.sources.property,
    ),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  replacement.admitLocalJourney(first.target, f.gate);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_CUSTOMER_SAFE_PROPERTY_PORTFOLIO') {
      reached = true;
      first.customerModel = replacement;
    }
    return value;
  });
  await expect(
    readPortfolioService(f.sources, f.service, f.gate),
  ).rejects.toThrow();
  expect(reached).toBe(true);
});

it('all six existing-engine addon kinds keep the same fourth job and manual context without writers, external crew or execution', async () => {
  const f = await fixture(),
    s = f.sources,
    entry = s.entries[3],
    original = {
      source: s.estimates.readSyntheticPrototypeSources(entry.target),
      property: s.property.read(s.company.id),
      release: entry.release.read('staff'),
    },
    writers = [
      vi.spyOn(s.estimates, 'recordTime'),
      vi.spyOn(s.estimates, 'submitExpense'),
      vi.spyOn(s.estimates, 'issue'),
      vi.spyOn(s.estimates, 'assignJob'),
      vi.spyOn(s.estimates, 'projection'),
      vi.spyOn(s.property, 'saveVisit'),
      vi.spyOn(s.property, 'addVisit'),
      vi.spyOn(s.operations, 'recordConsent'),
      vi.spyOn(entry.release, 'command'),
    ],
    fetch = vi.spyOn(globalThis, 'fetch');
  for (const kind of operatingAddonKinds) {
    const result = await prepareOperatingAddon(
      s,
      {
        job_id: entry.target.job_id!,
        kind,
        note: 'Urgent? This is literal human text; stop contact. Do not execute repairs or pay anyone.',
        review_on: '2026-12-29',
        manual_priority: 'low',
      },
      f.gate,
    );
    expect(result.snapshot.target).toEqual(entry.target);
    expect(result.snapshot.intake_request_id).toBe(entry.intake_request_id);
    expect(result.snapshot.review_on).toBe('2026-12-29');
    expect(
      Object.values(result.snapshot.authority).every(
        (value) => value === false,
      ),
    ).toBe(true);
    expect(result.snapshot.durable_custody).toBe('NOT_PROVIDED');
    expect(await reconcileOperatingAddon(result)).toBe(
      'CURRENT_LOCAL_REVIEW_ONLY',
    );
    expect(await reconcileOperatingAddon(structuredClone(result))).toBe(
      'UNKNOWN',
    );
    if (kind === 'storm_network') {
      expect(JSON.stringify(result.snapshot.evidence)).toContain(
        '"manual_priority":"low"',
      );
      expect(JSON.stringify(result.snapshot.evidence)).toContain(
        '"reported_on":null',
      );
      expect(JSON.stringify(result.snapshot.evidence)).toContain(
        'INTERNAL_COORDINATION_REVIEW',
      );
    }
    if (kind === 'offline')
      expect(JSON.stringify(result.snapshot.evidence)).toContain(
        'EXACT_READ_ONLY_RECONCILIATION_ONLY',
      );
    if (kind === 'receptionist')
      expect(result.snapshot.evidence).toMatchObject({
        channel_currentness: 'UNKNOWN',
        purpose_consent: 'UNVERIFIED',
        recipient: null,
        provider_request: null,
      });
    if (kind === 'procurement')
      expect(result.snapshot.evidence).toMatchObject({
        order: false,
        save: false,
        supplier_bid: 'UNKNOWN',
        recipient: null,
        provider_request: null,
      });
  }
  expect(writers.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(s.estimates.readSyntheticPrototypeSources(entry.target)).toEqual(
    original.source,
  );
  expect(s.property.read(s.company.id)).toEqual(original.property);
  expect(entry.release.read('staff')).toEqual(original.release);
});

it('lost addon hash acknowledgment leaves a permanent same-engine hold across new source containers and changed notes', async () => {
  const f = await fixture(),
    input = {
      job_id: f.sources.entries[0].target.job_id!,
      kind: 'procurement' as const,
      note: 'Exact scope only',
      review_on: '2026-12-28',
      manual_priority: 'normal' as const,
    },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_STAFF_ADDON_REVIEW_ONLY') {
      reached = true;
      throw Error('Lost final result acknowledgment');
    }
    return digest(...args);
  });
  await expect(
    prepareOperatingAddon(f.sources, input, f.gate),
  ).rejects.toThrow();
  expect(reached).toBe(true);
  vi.restoreAllMocks();
  await expect(
    prepareOperatingAddon(
      { ...f.sources, entries: [...f.sources.entries] },
      { ...input, note: 'A different note cannot clear uncertainty' },
      f.gate,
    ),
  ).rejects.toThrow(/Existing or UNKNOWN/);
});

it('addon final input edits are rejected and restoring confirmation cannot replay the attempted original source', async () => {
  const f = await fixture(),
    input = {
      job_id: f.sources.entries[2].target.job_id!,
      kind: 'storm_network' as const,
      note: 'Human incident label',
      review_on: '2026-12-28',
      manual_priority: 'normal' as 'normal' | 'urgent',
    },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_STAFF_ADDON_REVIEW_ONLY') {
      reached = true;
      input.manual_priority = 'urgent';
    }
    return value;
  });
  await expect(
    prepareOperatingAddon(f.sources, input, f.gate),
  ).rejects.toThrow();
  expect(reached).toBe(true);
  vi.restoreAllMocks();
  input.manual_priority = 'normal';
  await expect(prepareOperatingAddon(f.sources, input, f.gate)).rejects.toThrow(
    /Existing or UNKNOWN/,
  );
});
