import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { CrewPlanReview } from '../src/components/workflows/CrewPlanReview';
import { FinancialExceptions } from '../src/components/workflows/FinancialExceptions';
import { ServiceDesk } from '../src/components/workflows/ServiceDesk';
import { FollowUpAdmission } from '../src/components/workflows/FollowUpAdmission';
import { PriorityExplanations } from '../src/components/workflows/PriorityExplanations';
import { AdvancedHandoffs } from '../src/components/workflows/AdvancedHandoffs';
import {
  readPriorityExplanations,
  openPriorityExplanation,
  openPriorityExplanationJob,
  inspectPriorityExplanations,
} from '../src/lib/workflows/priority-explanations';
import {
  readAdvancedHandoffRequirements,
  prepareAdvancedHandoff,
  reconcileAdvancedHandoff,
  type AdvancedHandoffInput,
} from '../src/lib/workflows/advanced-handoffs';
import { prepareOperatingAddon } from '../src/lib/workflows/operating-addons';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  reviewCrewPlans,
  reconcileCrewPlans,
  openCrewPlanJob,
  type CrewPlanInput,
} from '../src/lib/workflows/crew-plan-review';
import {
  readFinancialExceptions,
  filterFinancialExceptions,
  openFinancialException,
  inspectFinancialExceptions,
  type FinancialExceptionsInput,
} from '../src/lib/workflows/financial-exceptions';
import {
  readServiceDesk,
  openServiceDeskJob,
  openServiceDeskReport,
  prepareServiceDeskReview,
  inspectServiceDeskPreparation,
  type ServiceDeskInput,
} from '../src/lib/workflows/service-desk';
import {
  readFollowUpDesk,
  prepareFollowUpAdmission,
  reconcileFollowUpAdmission,
  openFollowUpSource,
  type FollowUpDeskInput,
} from '../src/lib/workflows/follow-up-admission';

// Independent integration probes: each fixture is one authoritative repository set,
// with real original receipt/report/issued-version relationships shared by all desks.
afterEach(() => vi.restoreAllMocks());
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate);
  const crew: CrewPlanInput = {
    week_start: sources.entries[0].day,
    timezone: sources.entries[0].timezone,
    job_id: '',
    worker_id: '',
    plan_a: [],
    plan_b: [],
  };
  const finance: FinancialExceptionsInput = {
    basis: 'SAVED_FORECASTS',
    portfolio: {
      as_of: '2026-12-28T12:00:00.000Z',
      input_revision: 1,
      excludes_unpaid_commitments: true,
      proposals: sources.entries.map((e) => ({
        job_id: e.target.job_id!,
        remaining: {
          ...sources.estimates.syntheticJob(
            sources.company.id,
            e.target.job_id!,
          )!.projection.remaining,
        },
      })),
    },
  };
  const service: ServiceDeskInput = { query: '', status: '', page: 0 };
  const followUp: FollowUpDeskInput = {
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
  const priority = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      input_revision: 1,
    },
    advanced: AdvancedHandoffInput = {
      job_id: sources.entries[0].target.job_id!,
      kind: 'trade',
      note: 'Explicit source review; no operational action.',
      review_on: sources.entries[0].day,
      manual_priority: 'normal',
      edition: 'property_services',
    };
  return {
    sources,
    gate,
    crew,
    finance,
    service,
    followUp,
    priority,
    advanced,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function records(f: Fixture) {
  return JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    canonical: f.sources.entries.map((e) =>
      f.sources.estimates.readSyntheticPrototypeSources(e.target),
    ),
    releases: f.sources.entries.map((e) => e.release.read('staff')),
  });
}
async function views(f: Fixture) {
  const [crew, finance, service, followUp, priority, advanced] =
    await Promise.all([
      reviewCrewPlans(f.sources, f.crew, f.gate),
      readFinancialExceptions(f.sources, f.finance, f.gate),
      readServiceDesk(f.sources, f.service, f.gate),
      readFollowUpDesk(f.sources, f.followUp, f.gate),
      readPriorityExplanations(f.sources, f.priority, f.gate),
      readAdvancedHandoffRequirements(f.sources, f.advanced, f.gate),
    ]);
  return { crew, finance, service, followUp, priority, advanced };
}
function confirmation() {
  return {
    confirmed: true,
    association_confirmed: true,
    checks: { scope: true, preference: true, terms: true, boundaries: true },
  };
}
function proposal(v: Awaited<ReturnType<typeof readFollowUpDesk>>) {
  return {
    candidate_key: v.candidates[0].key,
    proposed_on: '2027-01-16',
    purpose: 'service_follow_up' as const,
    plan_kind: 'follow_up' as const,
  };
}

it.each([0, 1, 2])(
  'brand %s keeps exact source identity across crew, finance, service, staff preparation and follow-up without canonical side effects',
  async (brand) => {
    const f = await fixture(brand),
      before = records(f),
      network = vi.spyOn(globalThis, 'fetch'),
      v = await views(f);
    expect(f.sources.entries).toHaveLength(4);
    expect(
      new Set(f.sources.entries.map((e) => e.target.customer_id)).size,
    ).toBe(3);
    expect(
      new Set(f.sources.entries.map((e) => e.target.location_id)).size,
    ).toBe(3);
    expect(new Set(f.sources.entries.map((e) => e.worker_id)).size).toBe(2);
    const first = f.sources.entries[0],
      fourth = f.sources.entries[3];
    expect(first.target.location_id).toBe(fourth.target.location_id);
    expect(first.intake_request_id).toBe(fourth.intake_request_id);
    expect(first.target.version_id).not.toBe(fourth.target.version_id);
    const request = v.service.requests.find(
      (r) => r.request.id === first.intake_request_id,
    )!;
    expect(request.jobs.map((j) => j.job_id)).toEqual(
      expect.arrayContaining([first.target.job_id, fourth.target.job_id]),
    );
    for (const entry of [first, fourth]) {
      const target = await openCrewPlanJob(v.crew, entry.target.job_id!),
        detail = await openServiceDeskJob(v.service, entry.target.job_id!),
        exception = v.finance.queue.find(
          (q) => q.job_id === entry.target.job_id,
        )!,
        financial = openFinancialException(v.finance, exception.id),
        report = await openServiceDeskReport(detail);
      expect(target).toMatchObject({
        organization_id: entry.target.organization_id,
        customer_id: entry.target.customer_id,
        location_id: entry.target.location_id,
        job_id: entry.target.job_id,
        estimate_id: entry.target.estimate_id,
        version_id: entry.target.version_id,
      });
      expect(financial.target).toEqual(entry.target);
      expect(detail.staff.source.version_id).toBe(entry.target.version_id);
      expect(detail.staff.receipt.id).toBe(entry.receipt_id);
      expect(detail.staff.offer.id).toBe(entry.offer_id);
      expect(report.reference.report_id).toBe(entry.report_id);
      expect(report.reference.published_version).toBe(entry.published_version);
      expect(report.reference.location_id).toBe(entry.target.location_id);
      expect(detail.customer_safe.job.reference.job_id).toBe(
        entry.target.job_id,
      );
      expect(JSON.stringify(detail.customer_safe)).not.toMatch(
        /PRIVATE|unit_cost|supplier|payroll|margin|worker_id|actor_id|internal_notes/,
      );
      const staff = await prepareServiceDeskReview(detail, confirmation());
      expect(staff.review.source.version_id).toBe(entry.target.version_id);
      expect(staff.review.receipt.id).toBe(entry.receipt_id);
      expect((await inspectServiceDeskPreparation(staff)).status).toBe(
        'CURRENT_REVIEW_ONLY',
      );
    }
    const p = proposal(v.followUp),
      admission = await prepareFollowUpAdmission(v.followUp, p, f.gate),
      source = await openFollowUpSource(v.followUp, p.candidate_key);
    expect(source.organization_id).toBe(f.sources.company.id);
    expect(
      f.sources.entries.some(
        (e) =>
          e.target.job_id === source.job_id &&
          e.target.customer_id === source.customer_id &&
          e.target.location_id === source.location_id &&
          e.target.version_id === source.issued_version_id,
      ),
    ).toBe(true);
    expect(admission.decision).toBe('BLOCKED');
    expect(admission.authoritative_send_gate).toBe('ABSENT');
    expect(admission.recipient).toBeNull();
    expect(admission.provider_request).toBeNull();
    expect(admission.suppression).toBe('UNVERIFIED');
    expect(admission.current_channel_authority).toBe('UNKNOWN');
    const explanation = v.priority.explanations.find(
      (e) => e.job_id === first.target.job_id,
    )!;
    const explained = await openPriorityExplanation(
      v.priority,
      explanation.key,
    );
    expect(explained.target).toEqual(first.target);
    expect(
      openPriorityExplanationJob(v.priority, first.target.job_id!).target,
    ).toEqual(first.target);
    expect(explanation.source.target).toEqual(first.target);
    expect(
      explanation.missing_evidence.some(
        (e) => e.code === 'HISTORY_COVERAGE' && e.status === 'UNKNOWN',
      ),
    ).toBe(true);
    expect(v.priority.model).toBe('NONE');
    expect(v.advanced.source.issued_version_id).toBe(first.target.version_id);
    expect(v.advanced.source.receipt_id).toBe(first.receipt_id);
    expect(v.advanced.source.report_id).toBe(first.report_id);
    const handoff = await prepareAdvancedHandoff(v.advanced, {
      confirmed: true,
      reviewed_requirements_sha256: v.advanced.integrity.sha256,
    });
    expect(handoff.requirements.source.job_id).toBe(first.target.job_id);
    expect(handoff.operational_ready).toBe(false);
    expect(handoff.delivery).toBe('NOT_SENT');
    expect((await reconcileAdvancedHandoff(handoff)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect(JSON.stringify(handoff)).not.toMatch(
      /unit_cost_minor|supplier|worker_id|actor_id|payroll|internal_notes|tax_policy_snapshot/,
    );
    expect(v.crew.actual_availability).toBe('UNKNOWN');
    expect(v.finance.portfolio.totals.recorded).toBeNull();
    expect(v.service.history_completeness).toBe('UNKNOWN');
    expect(records(f)).toBe(before);
    expect(network).not.toHaveBeenCalled();
  },
);

it('shared source invalidation withholds all previously valid desks and exact original navigation', async () => {
  const f = await fixture(),
    v = await views(f),
    first = f.sources.entries[0];
  await f.sources.operations.configure(
    f.sources.company.id,
    'active',
    'starter',
    {},
    f.sources.company.id + '-backup-owner',
  );
  await f.sources.operations.revokeOwner(
    f.sources.company.id,
    first.target.actor_id,
  );
  expect((await reconcileCrewPlans(v.crew)).status).toBe('UNKNOWN');
  expect((await inspectFinancialExceptions(v.finance)).status).toBe('UNKNOWN');
  await expect(openCrewPlanJob(v.crew, first.target.job_id!)).rejects.toThrow();
  expect(() =>
    openFinancialException(v.finance, v.finance.queue[0].id),
  ).toThrow();
  await expect(
    openServiceDeskJob(v.service, first.target.job_id!),
  ).rejects.toThrow();
  await expect(
    openFollowUpSource(v.followUp, v.followUp.candidates[0].key),
  ).rejects.toThrow();
});

it('foreign company job, exception and occurrence selectors cannot cross any desk', async () => {
  const f = await fixture(),
    foreign = await fixture(1),
    v = await views(f),
    foreignViews = await views(foreign);
  await expect(
    openCrewPlanJob(v.crew, foreign.sources.entries[0].target.job_id!),
  ).rejects.toThrow();
  expect(() =>
    openFinancialException(v.finance, foreignViews.finance.queue[0].id),
  ).toThrow();
  await expect(
    openServiceDeskJob(v.service, foreign.sources.entries[0].target.job_id!),
  ).rejects.toThrow();
  await expect(
    openFollowUpSource(v.followUp, foreignViews.followUp.candidates[0].key),
  ).rejects.toThrow();
  expect(() =>
    filterFinancialExceptions(v.finance, {
      kind: 'all',
      job_id: foreign.sources.entries[0].target.job_id!,
      query: '',
    }),
  ).toThrow();
});

it('cloned reviews and cross-company repository substitution never become retained evidence', async () => {
  const f = await fixture(),
    v = await views(f),
    foreign = await fixture(1),
    forged = { ...f.sources, estimates: foreign.sources.estimates };
  expect((await reconcileCrewPlans(structuredClone(v.crew))).status).toBe(
    'UNKNOWN',
  );
  expect(
    (await inspectFinancialExceptions(structuredClone(v.finance))).status,
  ).toBe('UNKNOWN');
  await expect(
    openServiceDeskJob(
      structuredClone(v.service),
      f.sources.entries[0].target.job_id!,
    ),
  ).rejects.toThrow();
  await expect(
    openFollowUpSource(
      structuredClone(v.followUp),
      v.followUp.candidates[0].key,
    ),
  ).rejects.toThrow();
  const attempts = await Promise.allSettled([
    reviewCrewPlans(forged, f.crew, f.gate),
    readFinancialExceptions(forged, f.finance, f.gate),
    readServiceDesk(forged, f.service, f.gate),
    readFollowUpDesk(forged, f.followUp, f.gate),
  ]);
  expect(attempts.every((a) => a.status === 'rejected')).toBe(true);
});

it('field and financial presentation filters preserve the same source job rather than a matching text/property substitute', async () => {
  const f = await fixture(),
    first = f.sources.entries[0],
    fourth = f.sources.entries[3];
  f.crew.job_id = fourth.target.job_id!;
  const v = await views(f),
    filtered = filterFinancialExceptions(v.finance, {
      kind: 'all',
      job_id: fourth.target.job_id!,
      query: '',
    });
  expect(
    v.crew.jobs.find((j) => j.source.job_id === fourth.target.job_id),
  ).toBeDefined();
  expect(filtered.queue.length).toBeGreaterThan(0);
  expect(
    filtered.queue.every(
      (q) =>
        q.job_id === fourth.target.job_id &&
        q.source.issued_version_id === fourth.target.version_id,
    ),
  ).toBe(true);
  expect(
    filtered.queue.some(
      (q) => q.source.issued_version_id === first.target.version_id,
    ),
  ).toBe(false);
  expect(
    openFinancialException(v.finance, filtered.queue[0].id).target,
  ).toEqual(fourth.target);
});

it('concurrent explicit staff and follow-up preparations reserve separate exact source holds before await', async () => {
  const f = await fixture(),
    v = await views(f),
    detail = await openServiceDeskJob(
      v.service,
      f.sources.entries[0].target.job_id!,
    ),
    p = proposal(v.followUp);
  const staff = await Promise.allSettled([
      prepareServiceDeskReview(detail, confirmation()),
      prepareServiceDeskReview(detail, confirmation()),
    ]),
    growth = await Promise.allSettled([
      prepareFollowUpAdmission(v.followUp, p, f.gate),
      prepareFollowUpAdmission(v.followUp, { ...p }, f.gate),
    ]);
  expect(staff.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(growth.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const copied = await readServiceDesk(
      { ...f.sources },
      { ...f.service },
      f.gate,
    ),
    again = await openServiceDeskJob(
      copied,
      f.sources.entries[0].target.job_id!,
    );
  await expect(
    prepareServiceDeskReview(again, confirmation()),
  ).rejects.toThrow();
  const desk = await readFollowUpDesk(
    { ...f.sources },
    { ...f.followUp, window: { ...f.followUp.window } },
    f.gate,
  );
  await expect(
    prepareFollowUpAdmission(desk, { ...p, purpose: 'marketing' }, f.gate),
  ).rejects.toThrow();
  expect((await reconcileFollowUpAdmission(desk, p.candidate_key)).status).toBe(
    'UNKNOWN',
  );
});

it('withdrawal after the final async preparation hash preserves UNKNOWN and cannot replay through a new detail or proposal', async () => {
  const f = await fixture(),
    v = await views(f),
    detail = await openServiceDeskJob(
      v.service,
      f.sources.entries[0].target.job_id!,
    ),
    p = proposal(v.followUp),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (!fired) {
      fired = true;
      f.gate.confirmed = false;
    }
    return result;
  });
  await expect(
    prepareServiceDeskReview(detail, confirmation()),
  ).rejects.toThrow();
  expect(fired).toBe(true);
  vi.restoreAllMocks();
  f.gate.confirmed = true;
  const again = await openServiceDeskJob(
    v.service,
    f.sources.entries[0].target.job_id!,
  );
  await expect(
    prepareServiceDeskReview(again, confirmation()),
  ).rejects.toThrow();
  const admitted = await prepareFollowUpAdmission(v.followUp, p, f.gate),
    bytes = JSON.stringify(admitted);
  p.proposed_on = '2027-01-17';
  expect(
    (await reconcileFollowUpAdmission(v.followUp, p.candidate_key)).status,
  ).toBe('UNKNOWN');
  p.proposed_on = '2027-01-16';
  await expect(
    prepareFollowUpAdmission(v.followUp, { ...p }, f.gate),
  ).rejects.toThrow();
  expect(JSON.stringify(admitted)).toBe(bytes);
});

for (const module of [
  'crew',
  'finance',
  'service',
  'followUp',
  'priority',
  'advanced',
] as const) {
  it(`${module} is default OFF before authoritative reader admission`, async () => {
    const f = await fixture(),
      reader = vi.spyOn(f.sources.estimates, 'readSyntheticPrototypeSources');
    const call = {
      crew: () => reviewCrewPlans(f.sources, f.crew),
      finance: () => readFinancialExceptions(f.sources, f.finance),
      service: () => readServiceDesk(f.sources, f.service),
      followUp: () => readFollowUpDesk(f.sources, f.followUp),
      priority: () => readPriorityExplanations(f.sources, f.priority),
      advanced: () => readAdvancedHandoffRequirements(f.sources, f.advanced),
    }[module];
    await expect(call()).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
  });
  it(`${module} final-await original admission withdrawal prevents a stale result`, async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let fired = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const r = await digest(...args);
      if (!fired) {
        fired = true;
        f.gate.confirmed = false;
      }
      return r;
    });
    const call = {
      crew: () => reviewCrewPlans(f.sources, f.crew, f.gate),
      finance: () => readFinancialExceptions(f.sources, f.finance, f.gate),
      service: () => readServiceDesk(f.sources, f.service, f.gate),
      followUp: () => readFollowUpDesk(f.sources, f.followUp, f.gate),
      priority: () => readPriorityExplanations(f.sources, f.priority, f.gate),
      advanced: () =>
        readAdvancedHandoffRequirements(f.sources, f.advanced, f.gate),
    }[module];
    await expect(call()).rejects.toThrow();
    expect(fired).toBe(true);
  });
}

for (const component of [
  CrewPlanReview,
  FinancialExceptions,
  ServiceDesk,
  FollowUpAdmission,
  PriorityExplanations,
  AdvancedHandoffs,
]) {
  it(`${component.name} default-OFF rendering never invokes executable source getters`, () => {
    const getter = vi.fn(() => {
      throw Error('SOURCE_GETTER_EXECUTED');
    });
    const sources = Object.defineProperty({}, 'entries', {
      get: getter,
      enumerable: true,
    }) as OperatingSources;
    expect(() =>
      renderToStaticMarkup(createElement(component, { sources })),
    ).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
}
it('existing canonical addon custody cannot be bypassed through the new two-step handoff adapter', async () => {
  const f = await fixture(),
    before = records(f);
  f.advanced.kind = 'voice';
  const canonical = await prepareOperatingAddon(
      f.sources,
      {
        job_id: f.advanced.job_id,
        kind: 'voice',
        note: f.advanced.note,
        review_on: f.advanced.review_on,
        manual_priority: f.advanced.manual_priority,
      },
      f.gate,
    ),
    requirements = await readAdvancedHandoffRequirements(
      f.sources,
      f.advanced,
      f.gate,
    );
  expect(requirements.source.job_id).toBe(canonical.snapshot.target.job_id);
  await expect(
    prepareAdvancedHandoff(requirements, {
      confirmed: true,
      reviewed_requirements_sha256: requirements.integrity.sha256,
    }),
  ).rejects.toThrow();
  const fresh = await readAdvancedHandoffRequirements(
    { ...f.sources },
    {
      ...f.advanced,
      note: 'Changed text cannot reopen the held canonical mode.',
    },
    f.gate,
  );
  expect(fresh.prior_attempt).toBe('EXACT_READ_ONLY_PREVIOUS_ATTEMPT');
  await expect(
    prepareAdvancedHandoff(fresh, {
      confirmed: true,
      reviewed_requirements_sha256: fresh.integrity.sha256,
    }),
  ).rejects.toThrow();
  expect(records(f)).toBe(before);
});
it('procurement and accounting handoffs preserve missing authoritative records instead of fabricating catalog, invoice or contract links', async () => {
  const f = await fixture(),
    before = records(f);
  for (const kind of ['procurement', 'accounting'] as const) {
    const input = { ...f.advanced, kind },
      requirements = await readAdvancedHandoffRequirements(
        f.sources,
        input,
        f.gate,
      ),
      handoff = await prepareAdvancedHandoff(requirements, {
        confirmed: true,
        reviewed_requirements_sha256: requirements.integrity.sha256,
      });
    expect(requirements.catalog_links.state).toBe(
      'MISSING_RECORDED_CATALOG_ASSOCIATION',
    );
    expect(requirements.catalog_links.manual_association).toBe('NOT_CREATED');
    expect(requirements.local_release_invoice_rows).toBe(0);
    expect(requirements.invoice_job_association).toBe('NOT_INFERRED');
    expect(handoff.operational_ready).toBe(false);
    expect(handoff.delivery).toBe('NOT_SENT');
    expect(
      Object.values(requirements.authority).every((v) => v === false),
    ).toBe(true);
  }
  expect(records(f)).toBe(before);
});
it('restoring inputs never reopens an UNKNOWN advanced handoff and copied priority evidence remains unauthenticated', async () => {
  const f = await fixture(),
    requirements = await readAdvancedHandoffRequirements(
      f.sources,
      f.advanced,
      f.gate,
    ),
    confirmation = {
      confirmed: true,
      reviewed_requirements_sha256: requirements.integrity.sha256,
    },
    handoff = await prepareAdvancedHandoff(requirements, confirmation),
    bytes = JSON.stringify(handoff),
    priority = await readPriorityExplanations(f.sources, f.priority, f.gate);
  confirmation.confirmed = false;
  expect((await reconcileAdvancedHandoff(handoff)).status).toBe('UNKNOWN');
  confirmation.confirmed = true;
  expect((await reconcileAdvancedHandoff(handoff)).status).toBe('UNKNOWN');
  const newRequirements = await readAdvancedHandoffRequirements(
    { ...f.sources },
    { ...f.advanced, edition: 'roofing' },
    f.gate,
  );
  await expect(
    prepareAdvancedHandoff(newRequirements, {
      confirmed: true,
      reviewed_requirements_sha256: newRequirements.integrity.sha256,
    }),
  ).rejects.toThrow();
  expect(JSON.stringify(handoff)).toBe(bytes);
  expect(
    (await inspectPriorityExplanations(structuredClone(priority))).status,
  ).toBe('UNKNOWN');
  await expect(
    openPriorityExplanation(
      structuredClone(priority),
      priority.explanations[0].key,
    ),
  ).rejects.toThrow();
});
