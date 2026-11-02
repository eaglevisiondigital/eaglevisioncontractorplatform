import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  readSalesDesk,
  prepareSalesDesk,
  reconcileSalesDesk,
} from '../src/lib/workflows/sales-desk';
import {
  readCompletionReview,
  prepareCompletionReview,
  reconcileCompletionReview,
  openCompletionSource,
} from '../src/lib/workflows/completion-review';
import {
  readFinanceDesk,
  inspectFinanceDesk,
  type FinanceDeskSelection,
} from '../src/lib/workflows/finance-desk';
import {
  readWeeklyCrew,
  reconcileWeeklyCrew,
  compareWeeklyCrewSnapshots,
  type WeeklyCrewInput,
} from '../src/lib/workflows/weekly-crew';
import {
  readDailyOperations,
  inspectDailyOperations,
  filterDailyOperations,
  openDailyOperationsSource,
} from '../src/lib/workflows/daily-operations';
import {
  prepareIntelligenceWorkflow,
  readIntelligenceWorkflowAttempt,
} from '../src/lib/workflows/intelligence-workflow';
import {
  readMaintenanceDesk,
  reconcileMaintenanceDesk,
  prepareMaintenanceDeskReview,
  reconcileMaintenanceDeskPreparation,
  reviewMaintenanceConsentPreflight,
  reconcileMaintenanceConsentPreflight,
  type MaintenanceDeskInput,
} from '../src/lib/workflows/maintenance-desk';
import { SalesDesk } from '../src/components/workflows/SalesDesk';
import { WeeklyCrew } from '../src/components/workflows/WeeklyCrew';
import { FinanceDesk } from '../src/components/workflows/FinanceDesk';
import { CompletionReview } from '../src/components/workflows/CompletionReview';
import { MaintenanceDesk } from '../src/components/workflows/MaintenanceDesk';
import { DailyOperations } from '../src/components/workflows/DailyOperations';

const admitted = () => ({ enabled: true, confirmed: true });
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const j = await prepareLocalJourney(sampleCompanies[index], admitted()),
    original = j.estimates.readSyntheticPrototypeSources(j.target);
  const finance: FinanceDeskSelection = {
    job_review: {
      finance: {
        job_revision: original.job!.lock_revision,
        currency: j.issued.version.calculation.currency,
        release: null,
        accounting_aliases: null,
        procurement: null,
      },
      time: null,
      material: null,
      input_revision: 1,
    },
    remaining: {
      materials: 1700,
      labor: 2300,
      subcontractors: 0,
      equipment: 0,
      other: 0,
    },
    excludes_unpaid_commitments: true,
    input_revision: 1,
  };
  const weekly: WeeklyCrewInput = {
    week_start: j.day,
    timezone: j.timezone,
    worker_id: '',
    proposals: [],
  };
  const maintenance: MaintenanceDeskInput = {
    window: {
      from: j.day,
      through: '2027-01-25',
      as_of: j.day + 'T12:00:00.000Z',
      channel: 'email',
    },
    lead_days: 14,
    overdue_days: 7,
    query: '',
    kind: 'all',
    readiness: 'all',
  };
  return {
    ...j,
    selected: {
      report_id: j.report_id,
      published_version: j.published_version,
    },
    sales: {
      intake_request_id: j.intake_request_id,
      offer_id: j.offer_id,
      receipt_id: j.receipt_id,
      visit_id: j.scheduled_visit_id,
      worker_id: j.worker_id,
      review_note: 'Explicit independent review of exact existing source.',
    },
    finance,
    weekly,
    maintenance,
    daily: { review_on: j.day, timezone: j.timezone, input_revision: 1 },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const salesConfirmation = () => ({
  confirmed: true,
  association_confirmed: true,
  checks: { scope: true, preference: true, terms: true, boundaries: true },
});
const completionConfirmation = () => ({
  confirmed: true,
  checks: { scope: true, documentation: true, limitations: true },
});
async function readDesks(f: Fixture, gate = admitted()) {
  const [sales, finance, customer, field, daily, maintenance] =
    await Promise.all([
      readSalesDesk(f, f.sales, gate),
      readFinanceDesk(f.estimates, f.target, f.finance, gate),
      readCompletionReview(f, f.selected, gate),
      readWeeklyCrew(f, f.weekly, gate),
      readDailyOperations(f, f.daily, gate),
      readMaintenanceDesk(f, f.maintenance, gate),
    ]);
  return { sales, finance, customer, field, daily, maintenance };
}

it.each([0, 1, 2])(
  'independent composition keeps company %i same exact issued source, property and published documentation without writers',
  async (index) => {
    const f = await fixture(index),
      before = {
        property: f.property.read(f.company.id),
        source: f.estimates.readSyntheticPrototypeSources(f.target),
        release: f.release.read('staff'),
      },
      writers = [
        vi.spyOn(f.property, 'addVisit'),
        vi.spyOn(f.property, 'saveVisit'),
        vi.spyOn(f.property, 'savePlan'),
        vi.spyOn(f.property, 'publish'),
        vi.spyOn(f.estimates, 'assignJob'),
        vi.spyOn(f.estimates, 'issue'),
        vi.spyOn(f.estimates, 'approveJob'),
        vi.spyOn(f.estimates, 'projection'),
        vi.spyOn(f.estimates, 'recordTime'),
        vi.spyOn(f.estimates, 'submitExpense'),
        vi.spyOn(f.estimates, 'payroll'),
        vi.spyOn(f.release, 'command'),
      ];
    const r = await readDesks(f),
      [contract, packet] = await Promise.all([
        prepareSalesDesk(r.sales, salesConfirmation()),
        prepareCompletionReview(r.customer, completionConfirmation()),
      ]);
    expect(r.sales.target).toEqual(f.target);
    expect(r.finance.target).toEqual(f.target);
    expect(r.field.source).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
      job_id: f.target.job_id,
      issued_version_id: f.target.version_id,
    });
    expect(r.customer.property).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
    });
    expect(r.customer.job.reference).toMatchObject({
      job_id: f.target.job_id,
      estimate_id: f.target.estimate_id,
      issued_version_id: f.target.version_id,
    });
    expect(await openCompletionSource(r.customer)).toEqual(r.customer.report);
    expect(r.sales.appointment.visit_id).toBe(f.scheduled_visit_id);
    expect(r.customer.report.reference).toMatchObject(f.selected);
    expect(r.sales.appointment.visit_id).not.toBe(f.visit_id);
    expect(r.field.days).toHaveLength(7);
    expect(r.field.actual_availability).toBe('UNKNOWN');
    expect(r.field.workforce_currentness).toBe('CAPTURED_NOT_ATOMIC');
    expect(r.finance.scenario.proposed_remaining).toEqual(f.finance.remaining);
    expect(r.finance.scenario.original_remaining).toEqual(
      before.source.job!.projection.remaining,
    );
    expect(r.finance.recorded.recorded.costReview.status).toBe('UNKNOWN');
    expect(r.finance.scenario.completion.status).toBe('UNKNOWN');
    expect(r.finance.compatibility.accounting.source_invoice_id).toBeNull();
    expect(
      r.finance.compatibility.accounting.quickbooks.external_realm_id,
    ).toBeNull();
    expect(Object.values(r.finance.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(Object.values(r.field.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(Object.values(r.sales.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(packet.physical_completion).toBe('UNVERIFIED');
    expect(packet.delivery).toBe('NOT_SENT');
    expect(
      r.customer.job.lines.every(
        (line) => line.documentation_match === 'NOT_ESTABLISHED',
      ),
    ).toBe(true);
    expect(r.customer.coverage.line_to_finding_links).toBe('NOT_RECORDED');
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|internal_notes|supplier|unit_cost|profit|margin|payroll|@example.invalid|555010|staff_type|worker_id/,
    );
    const { integrity, ...body } = packet;
    expect(
      Buffer.from(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ).toString('hex'),
    ).toBe(integrity.sha256);
    expect(Object.isFrozen(packet.review.report.observations)).toBe(true);
    expect((await reconcileSalesDesk(contract)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect((await reconcileCompletionReview(packet)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect((await inspectFinanceDesk(r.finance)).status).toBe(
      'CURRENT_LOCAL_SOURCE',
    );
    expect((await reconcileWeeklyCrew(r.field)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect(r.daily.target).toEqual(f.target);
    expect(r.daily.model).toBe('NONE');
    expect(r.daily.existing_intelligence.status).toBe('NOT_STARTED');
    expect(Object.values(r.daily.authority).every((v) => v === false)).toBe(
      true,
    );
    const reportCard = r.daily.cards.find((c) => c.source.kind === 'report')!;
    expect(reportCard.source).toMatchObject({
      id: f.report_id,
      version: f.published_version,
    });
    expect(
      await openDailyOperationsSource(r.daily, reportCard.id),
    ).toMatchObject({
      target: f.target,
      authority: 'NAVIGATION_ONLY',
      detail: {
        report: {
          report_id: f.report_id,
          published_version: f.published_version,
        },
      },
    });
    expect(
      filterDailyOperations(r.daily, {
        area: 'documentation',
        level: 'all',
        query: f.report_id,
      }),
    ).toMatchObject({ matching: 1, available: r.daily.cards.length });
    expect((await inspectDailyOperations(r.daily)).status).toBe(
      'CURRENT_LOCAL_SOURCE',
    );
    expect(r.maintenance.source).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
      job_id: f.target.job_id,
      issued_version_id: f.target.version_id,
    });
    expect(r.maintenance.matching_count).toBe(r.maintenance.candidates.length);
    expect(r.maintenance.count_is_complete).toBe(false);
    expect(
      Object.values(r.maintenance.authority).every((v) => v === false),
    ).toBe(true);
    const candidate = r.maintenance.candidates.find(
      (c) => c.can_prepare_visit_proposal,
    )!;
    expect(candidate).toBeDefined();
    const proposal = await prepareMaintenanceDeskReview(
      r.maintenance,
      candidate,
      admitted(),
    );
    expect(proposal).toBeDefined();
    expect(
      (await reconcileMaintenanceDeskPreparation(r.maintenance, candidate))
        .status,
    ).toBe('EXACT_PREPARED_REVIEW_ONLY');
    await expect(
      prepareMaintenanceDeskReview(r.maintenance, candidate, admitted()),
    ).rejects.toThrow();
    expect((await reconcileMaintenanceDesk(r.maintenance)).status).toBe(
      'CAPTURED_NOT_ATOMIC',
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(f.property.read(f.company.id)).toEqual(before.property);
    expect(f.estimates.readSyntheticPrototypeSources(f.target)).toEqual(
      before.source,
    );
    expect(f.release.read('staff')).toEqual(before.release);
  },
);

it('invalidates exact appointment-dependent views after actual plan change while immutable customer packet and recorded finance remain intact', async () => {
  const f = await fixture(),
    r = await readDesks(f),
    contract = await prepareSalesDesk(r.sales, salesConfirmation()),
    packet = await prepareCompletionReview(
      r.customer,
      completionConfirmation(),
    ),
    frozen = JSON.stringify(packet),
    plan = f.property.read(f.company.id).plans.find((p) => p.id === f.plan_id)!;
  f.property.savePlan(f.company.id, { ...plan, name: plan.name + ' changed' });
  expect((await reconcileSalesDesk(contract)).status).toBe('UNKNOWN');
  expect((await reconcileCompletionReview(packet)).status).toBe('UNKNOWN');
  expect((await reconcileWeeklyCrew(r.field)).status).toBe('UNKNOWN');
  expect((await inspectDailyOperations(r.daily)).status).toBe('STALE');
  expect((await reconcileMaintenanceDesk(r.maintenance)).status).toBe(
    'UNKNOWN',
  );
  expect((await inspectFinanceDesk(r.finance)).status).toBe(
    'CURRENT_LOCAL_SOURCE',
  );
  expect(JSON.stringify(packet)).toBe(frozen);
  await expect(openCompletionSource(r.customer)).rejects.toThrow();
});

it('retains permanent preparation holds after withdrawn confirmation, across freshly read views and copied packets', async () => {
  const f = await fixture(),
    r = await readDesks(f),
    sc = salesConfirmation(),
    cc = completionConfirmation(),
    sales = await prepareSalesDesk(r.sales, sc),
    packet = await prepareCompletionReview(r.customer, cc);
  sc.confirmed = false;
  cc.confirmed = false;
  expect((await reconcileSalesDesk(sales)).status).toBe('UNKNOWN');
  expect((await reconcileCompletionReview(packet)).status).toBe('UNKNOWN');
  sc.confirmed = true;
  cc.confirmed = true;
  expect((await reconcileSalesDesk(sales)).status).toBe('UNKNOWN');
  expect((await reconcileCompletionReview(packet)).status).toBe('UNKNOWN');
  expect((await reconcileSalesDesk(structuredClone(sales))).status).toBe(
    'UNKNOWN',
  );
  expect(
    (await reconcileCompletionReview(structuredClone(packet))).status,
  ).toBe('UNKNOWN');
  const next = await readDesks(f);
  await expect(
    prepareSalesDesk(next.sales, salesConfirmation()),
  ).rejects.toThrow();
  await expect(
    prepareCompletionReview(next.customer, completionConfirmation()),
  ).rejects.toThrow();
});

it('denies revoked staff across all retained desks without replacement, source reopening or packet replay', async () => {
  const f = await fixture(),
    r = await readDesks(f),
    sales = await prepareSalesDesk(r.sales, salesConfirmation()),
    packet = await prepareCompletionReview(
      r.customer,
      completionConfirmation(),
    );
  await f.operations.configure(
    f.company.id,
    'active',
    'starter',
    {},
    f.company.id + '-backup-owner',
  );
  await f.operations.revokeOwner(f.company.id, f.target.actor_id);
  expect((await reconcileSalesDesk(sales)).status).toBe('UNKNOWN');
  expect((await reconcileCompletionReview(packet)).status).toBe('UNKNOWN');
  expect((await inspectFinanceDesk(r.finance)).status).toBe('UNKNOWN');
  expect((await reconcileWeeklyCrew(r.field)).status).toBe('UNKNOWN');
  expect((await inspectDailyOperations(r.daily)).status).toBe('UNKNOWN');
  expect((await reconcileMaintenanceDesk(r.maintenance)).status).toBe(
    'UNKNOWN',
  );
  await expect(openCompletionSource(r.customer)).rejects.toThrow();
  await expect(readDesks(f)).rejects.toThrow();
});

it('rejects cross-company source substitution and foreign exact report, appointment and job selectors', async () => {
  const a = await fixture(),
    b = await fixture(1);
  await expect(readSalesDesk(a, b.sales, admitted())).rejects.toThrow();
  await expect(
    readCompletionReview(a, b.selected, admitted()),
  ).rejects.toThrow();
  await expect(
    readFinanceDesk(a.estimates, b.target, a.finance, admitted()),
  ).rejects.toThrow();
  await expect(
    readWeeklyCrew({ ...a, target: b.target }, a.weekly, admitted()),
  ).rejects.toThrow();
  await expect(
    readCompletionReview(
      { ...a, customerModel: b.customerModel },
      a.selected,
      admitted(),
    ),
  ).rejects.toThrow();
  await expect(
    readSalesDesk({ ...a, release: b.release }, a.sales, admitted()),
  ).rejects.toThrow();
  await expect(
    readDailyOperations({ ...a, target: b.target }, a.daily, admitted()),
  ).rejects.toThrow();
  await expect(
    readMaintenanceDesk({ ...a, target: b.target }, a.maintenance, admitted()),
  ).rejects.toThrow();
});

it('rejects a real second CRM location owned by the same customer when the immutable job still belongs to the original property', async () => {
  const f = await fixture(),
    original = await f.operations.getLocation(
      f.company.id,
      f.target.customer_id,
      f.target.location_id,
    );
  await f.operations.saveLocation(f.company.id, f.target.customer_id, {
    ...original,
    address_line1: 'A second exact synthetic property',
  });
  const other = (
    await f.operations.listLocations(f.company.id, f.target.customer_id)
  ).find((p) => p.id !== original.id)!;
  expect(other.customer_id).toBe(f.target.customer_id);
  expect(other.organization_id).toBe(f.company.id);
  const changed = { ...f, target: { ...f.target, location_id: other.id } };
  await expect(readSalesDesk(changed, f.sales, admitted())).rejects.toThrow();
  await expect(
    readCompletionReview(changed, f.selected, admitted()),
  ).rejects.toThrow();
  await expect(
    readFinanceDesk(f.estimates, changed.target, f.finance, admitted()),
  ).rejects.toThrow();
  await expect(readWeeklyCrew(changed, f.weekly, admitted())).rejects.toThrow();
  await expect(
    readDailyOperations(changed, f.daily, admitted()),
  ).rejects.toThrow();
  await expect(
    readMaintenanceDesk(changed, f.maintenance, admitted()),
  ).rejects.toThrow();
});

it.each([
  'sales',
  'finance',
  'customer',
  'weekly',
  'daily',
  'maintenance',
] as const)(
  'withholds %s after admission is withdrawn at its real final payload hash',
  async (mode) => {
    const f = await fixture(),
      gate = admitted(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      const matches = {
        sales: body.mode === 'LOCAL_SALES_DESK_REVIEW_ONLY',
        finance: body.mode === 'LOCAL_SYNTHETIC_FINANCE_DESK',
        customer:
          body.mode === 'LOCAL_CUSTOMER_COMPLETION_DOCUMENTATION_REVIEW',
        weekly: body.mode === 'LOCAL_WEEKLY_CREW_REVIEW',
        daily: body.mode === 'LOCAL_SYNTHETIC_DAILY_OPERATING_REVIEW',
        maintenance: body.mode === 'LOCAL_MAINTENANCE_DESK',
      };
      if (matches[mode]) {
        reached = true;
        gate.confirmed = false;
      }
      return result;
    });
    const read = {
      sales: () => readSalesDesk(f, f.sales, gate),
      finance: () => readFinanceDesk(f.estimates, f.target, f.finance, gate),
      customer: () => readCompletionReview(f, f.selected, gate),
      weekly: () => readWeeklyCrew(f, f.weekly, gate),
      daily: () => readDailyOperations(f, f.daily, gate),
      maintenance: () => readMaintenanceDesk(f, f.maintenance, gate),
    };
    await expect(read[mode]()).rejects.toThrow();
    expect(reached).toBe(true);
  },
);

it('compares two exact retained weekly proposals using canonical overlap evidence without moving the original visit or claiming a lock', async () => {
  const f = await fixture(),
    originalVisits = f.property.read(f.company.id).visits,
    proposal = {
      day: '2026-12-29',
      source_visit_id: f.scheduled_visit_id,
      worker_id: f.worker_id,
      start: '2026-12-29T09:00',
      end: '2026-12-29T11:00',
      hours_start: '2026-12-29T08:00',
      hours_end: '2026-12-29T16:00',
    },
    first = await readWeeklyCrew(
      f,
      { ...f.weekly, proposals: [proposal] },
      admitted(),
    ),
    second = await readWeeklyCrew(
      f,
      {
        ...f.weekly,
        proposals: [
          { ...proposal, start: '2026-12-29T10:00', end: '2026-12-29T12:00' },
        ],
      },
      admitted(),
    ),
    expected = {
      expected_first_sha256: first.integrity.sha256,
      expected_second_sha256: second.integrity.sha256,
    },
    compared = await compareWeeklyCrewSnapshots(
      first,
      second,
      expected,
      admitted(),
    );
  expect(compared).toMatchObject({
    status: 'MATCHING_SOURCE_REVIEW_ONLY',
    applied: false,
    replay: 'FORBIDDEN',
    actual_availability: 'UNKNOWN',
    reviewers: 'SAME_SYNTHETIC_REVIEWER',
  });
  if (compared.status !== 'MATCHING_SOURCE_REVIEW_ONLY')
    throw Error('Comparison unavailable');
  expect(compared.conflicts).toContainEqual(
    expect.objectContaining({
      day: '2026-12-29',
      kind: 'SAME_SOURCE_WINDOWS',
      minutes: 60,
    }),
  );
  expect(first.proposals[0]).toMatchObject({
    kind: 'UNSAVED_JOB_WINDOW',
    visit_moved: false,
    original_visit: { id: f.scheduled_visit_id, date: f.day },
  });
  expect(f.property.read(f.company.id).visits).toEqual(originalVisits);
  expect(
    (
      await compareWeeklyCrewSnapshots(
        first,
        second,
        { ...expected, expected_second_sha256: '0'.repeat(64) },
        admitted(),
      )
    ).status,
  ).toBe('CAS_REFERENCE_MISMATCH');
});

it.each(['offer_id', 'receipt_id'] as const)(
  'rejects Daily source when original %s changes after its own final hash',
  async (selector) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'LOCAL_SYNTHETIC_DAILY_OPERATING_REVIEW') {
        reached = true;
        f[selector] = crypto.randomUUID();
      }
      return result;
    });
    await expect(readDailyOperations(f, f.daily, admitted())).rejects.toThrow();
    expect(reached).toBe(true);
  },
);

it('detects an actual concurrent Copilot preparation at the final Daily hash without consuming or replaying its existing claim', async () => {
  const f = await fixture(),
    gate = admitted(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  expect(
    readIntelligenceWorkflowAttempt(f.estimates, f.target, gate).status,
  ).toBe('NOT_STARTED');
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_SYNTHETIC_DAILY_OPERATING_REVIEW') {
      reached = true;
      await prepareIntelligenceWorkflow(
        f.estimates,
        f.target,
        { review_on: f.day, advanced: null },
        gate,
      );
    }
    return result;
  });
  await expect(readDailyOperations(f, f.daily, gate)).rejects.toThrow();
  expect(reached).toBe(true);
  expect(
    readIntelligenceWorkflowAttempt(f.estimates, f.target, gate).status,
  ).toBe('PREPARED');
  vi.restoreAllMocks();
  const reviewed = await readDailyOperations(f, f.daily, gate);
  expect(reviewed.existing_intelligence).toMatchObject({
    status: 'PREPARED',
    retry: false,
    replacement: null,
  });
  expect((await inspectDailyOperations(reviewed)).status).toBe(
    'CURRENT_LOCAL_SOURCE',
  );
});

it.each(['preflight-body', 'last-source-await'] as const)(
  'consent withdrawal at %s cannot expose a current channel allowance, recipient or send capability',
  async (trigger) => {
    const f = await fixture(),
      gate = admitted(),
      view = await readMaintenanceDesk(f, f.maintenance, gate),
      candidate = view.candidates.find((c) => c.can_prepare_visit_proposal)!,
      input = {
        recipient_customer_id: f.target.customer_id,
        channel: 'email' as const,
        purpose: 'recurring_maintenance' as const,
        expected_source_sha256: view.source.source_sha256,
        expected_consent_id: view.consent.reference?.id ?? null,
      },
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let sawPreflight = false,
      withdrew = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      const isPreflight = Object.hasOwn(body, 'captured_planning_view_sha256');
      const shouldWithdraw =
        trigger === 'preflight-body'
          ? isPreflight
          : sawPreflight && !isPreflight;
      if (isPreflight) sawPreflight = true;
      if (shouldWithdraw && !withdrew) {
        withdrew = true;
        await f.operations.recordConsent(
          f.company.id,
          f.target.customer_id,
          false,
          false,
        );
      }
      return result;
    });
    const preflight = await reviewMaintenanceConsentPreflight(
        view,
        candidate,
        input,
        gate,
      ),
      captured = JSON.stringify(preflight);
    expect(sawPreflight && withdrew).toBe(true);
    expect(preflight).toMatchObject({
      status: 'UNKNOWN',
      decision: 'BLOCKED',
      observed_channel_state: 'UNKNOWN',
      current_contact_reference: null,
      send: false,
      recipient: null,
      provider_request: null,
      replay: 'FORBIDDEN',
    });
    expect(captured).not.toMatch(
      /RECORDED_ALLOWED|email_allowed|sms_allowed|@example.invalid|555010/,
    );
    vi.restoreAllMocks();
    expect(
      await reconcileMaintenanceConsentPreflight(preflight),
    ).not.toHaveProperty('historical_binding');
    expect((await reconcileMaintenanceDesk(view)).status).toBe('UNKNOWN');
    expect(JSON.stringify(preflight)).toBe(captured);
  },
);

it('all six new React panels default off without reading canonical engines or exposing source content', async () => {
  const f = await fixture(),
    source = vi.spyOn(f.estimates, 'readSyntheticPrototypeSources'),
    property = vi.spyOn(f.property, 'read'),
    release = vi.spyOn(f.release, 'read'),
    rendered = [
      SalesDesk,
      WeeklyCrew,
      FinanceDesk,
      CompletionReview,
      MaintenanceDesk,
      DailyOperations,
    ]
      .map((Component) =>
        renderToStaticMarkup(createElement(Component, { sources: f })),
      )
      .join('');
  expect(source).not.toHaveBeenCalled();
  expect(property).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  expect(rendered).not.toContain(f.target.job_id);
  expect(rendered).not.toContain(f.target.customer_id);
  expect(rendered).not.toContain(f.report_id);
  expect(rendered).not.toContain('<button');
  expect(rendered).toContain('off');
});
