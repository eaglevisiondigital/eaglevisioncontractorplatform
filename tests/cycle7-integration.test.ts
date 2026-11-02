import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { emptyHistoryFilters } from '../src/domain/property/history-search';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  readBookingSchedulingSource,
  readBookingScheduling,
  reconcileBookingScheduling,
  type BookingSchedulingInput,
} from '../src/lib/workflows/booking-scheduling';
import {
  readJobReview,
  inspectJobReview,
  type JobReviewSelection,
} from '../src/lib/workflows/job-review';
import {
  readCustomerService,
  assertCustomerServiceCurrentNow,
} from '../src/lib/workflows/customer-service';

const gate = () => ({ enabled: true, confirmed: true });
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const j = await prepareLocalJourney(sampleCompanies[index], gate()),
    bookingGate = gate(),
    source = await readBookingSchedulingSource(
      j.property,
      j.target,
      j.scheduled_visit_id,
      bookingGate,
    ),
    original = j.estimates.readSyntheticPrototypeSources(j.target),
    line = original.bundle.version.payload.lines.find(
      (l) =>
        ['material', 'product'].includes(l.kind) &&
        original.bundle.version.calculation.lines.some(
          (c) => c.id === l.id && c.included,
        ),
    )!;
  const booking: BookingSchedulingInput = {
    source,
    source_visit_id: j.scheduled_visit_id,
    day: '2026-12-29',
    timezone: j.timezone,
    worker_id: j.worker_id,
    review_note: 'Explicit unsaved source-bound planning review',
    start: '2026-12-29T09:00',
    end: '2026-12-29T10:00',
    hours_start: '2026-12-29T08:00',
    hours_end: '2026-12-29T16:00',
  };
  const job: JobReviewSelection = {
    finance: {
      job_revision: original.job!.lock_revision,
      currency: j.issued.version.calculation.currency,
      release: null,
      accounting_aliases: null,
      procurement: null,
    },
    time: {
      workerId: j.worker_id,
      startedAt: '2026-12-29T15:00:00Z',
      endedAt: '2026-12-29T16:00:00Z',
      task: 'PRIVATE unsaved staff review',
      allocation: 'job',
      overheadCenter: null,
    },
    material: {
      line_id: line.id,
      quantity_milli: line.quantity_milli + 1000,
      unit_cost_minor: 888887,
      catalog_item_id: line.catalog_item_id,
    },
    input_revision: 1,
  };
  const selected = {
      report_id: j.report_id,
      published_version: j.published_version,
    },
    filters = { ...emptyHistoryFilters };
  return { ...j, source, booking, bookingGate, job, selected, filters };
}

it.each([0, 1, 2])(
  'composes actual booking, staff costs and safe evidence on one company %i source without writes',
  async (index) => {
    const f = await fixture(index),
      before = {
        property: f.property.read(f.company.id),
        source: f.estimates.readSyntheticPrototypeSources(f.target),
        release: f.release.read('staff'),
      },
      writes = [
        vi.spyOn(f.property, 'addVisit'),
        vi.spyOn(f.property, 'saveVisit'),
        vi.spyOn(f.property, 'savePlan'),
        vi.spyOn(f.property, 'publish'),
        vi.spyOn(f.estimates, 'recordTime'),
        vi.spyOn(f.estimates, 'submitExpense'),
        vi.spyOn(f.estimates, 'assignJob'),
        vi.spyOn(f.release, 'command'),
      ];
    const booking = await readBookingScheduling(
        f.property,
        f.target,
        f.booking,
        gate(),
      ),
      job = await readJobReview(f.estimates, f.target, f.job, gate()),
      customer = await readCustomerService(
        f.customerModel,
        f.target,
        f.selected,
        f.filters,
        gate(),
      );
    expect(booking.source.source_sha256).toBe(job.source_sha256);
    expect(booking.source.job_id).toBe(job.target.job_id);
    expect(booking.original_visit.id).toBe(f.scheduled_visit_id);
    expect(booking.proposal).toMatchObject({
      kind: 'UNSAVED_JOB_WINDOW_RESCHEDULE',
      visit_moved: false,
    });
    expect(booking.capacity.actual_availability).toBe('UNKNOWN');
    expect(job.proposed.material?.posting).toBe('UNSAVED_NOT_ACTUAL_COST');
    expect(job.proposed.time?.posting).toBe('UNSAVED_NOT_POSTED');
    expect(job.proposed.time?.monetaryAllocation).toBeNull();
    expect(job.report.snapshot.customer_issued_totals.total_minor).toBe(
      f.issued.version.calculation.total_minor,
    );
    expect(job.invoiceRequirements.reference.invoice_id).toBeNull();
    expect(customer.status).toBe('CURRENT');
    expect(customer.issued_scope).toMatchObject({
      job_id: f.target.job_id,
      estimate_id: f.target.estimate_id,
      issued_version_id: f.target.version_id,
    });
    expect(customer.reports.map((r) => r.id)).toEqual([f.report_id]);
    expect(JSON.stringify(customer)).not.toMatch(
      /PRIVATE|888887|unit_cost|worker_id|supplier|payroll|internal_notes/,
    );
    expect(Object.values(job.authority).every((v) => v === false)).toBe(true);
    expect(Object.values(booking.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(customer.physical_completion).toBe('UNVERIFIED');
    expect(customer.history_completeness).toBe('UNKNOWN');
    expect(() =>
      assertCustomerServiceCurrentNow(
        f.customerModel,
        f.target,
        f.selected,
        f.filters,
        customer,
      ),
    ).not.toThrow();
    expect((await reconcileBookingScheduling(booking)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect((await inspectJobReview(job)).status).toBe('CURRENT_LOCAL_SOURCE');
    expect({
      property: f.property.read(f.company.id),
      source: f.estimates.readSyntheticPrototypeSources(f.target),
      release: f.release.read('staff'),
    }).toEqual(before);
    writes.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);

it('invalidates only affected review contexts after an actual plan change without rewriting published evidence or staff costs', async () => {
  const f = await fixture(),
    booking = await readBookingScheduling(
      f.property,
      f.target,
      f.booking,
      gate(),
    ),
    job = await readJobReview(f.estimates, f.target, f.job, gate()),
    customer = await readCustomerService(
      f.customerModel,
      f.target,
      f.selected,
      f.filters,
      gate(),
    ),
    report = JSON.stringify(customer.reports);
  const plan = f.property
    .read(f.company.id)
    .plans.find((p) => p.id === f.plan_id)!;
  f.property.savePlan(f.company.id, { ...plan, name: plan.name + ' changed' });
  expect((await reconcileBookingScheduling(booking)).status).toBe('UNKNOWN');
  expect(() =>
    assertCustomerServiceCurrentNow(
      f.customerModel,
      f.target,
      f.selected,
      f.filters,
      customer,
    ),
  ).toThrow();
  expect((await inspectJobReview(job)).status).toBe('CURRENT_LOCAL_SOURCE');
  expect(JSON.stringify(customer.reports)).toBe(report);
});

it('rejects real foreign-company and second same-property job evidence without fuzzy association', async () => {
  const f = await fixture(),
    payload = structuredClone(f.issued.version.payload);
  payload.lines = payload.lines.map((l) => ({ ...l, id: crypto.randomUUID() }));
  const issued = await f.estimates.issue(
      f.company.id,
      await f.estimates.create(f.company, payload),
    ),
    job = await f.estimates.approveJob(f.company.id, issued);
  await f.property.refreshContexts(f.company.id);
  const context = f.property
      .read(f.company.id)
      .contexts.find((c) => c.job_id === job)!,
    plan = f.property.createPlan(
      f.company.id,
      context,
      'Same wording, different exact job',
    );
  let visit = f.property.addVisit(f.company.id, plan.id, f.day, 'after');
  f.property.saveVisit(f.company.id, visit, {
    summary: 'A weathered exterior joint was documented.',
    internal_notes: 'PRIVATE',
    findings: [],
    checklist: [],
  });
  visit = f.property.read(f.company.id).visits.find((v) => v.id === visit.id)!;
  f.property.submit(f.company.id, visit);
  visit = f.property.read(f.company.id).visits.find((v) => v.id === visit.id)!;
  const report = f.property.publish(f.company.id, visit);
  await expect(
    readBookingSchedulingSource(f.property, f.target, visit.id, gate()),
  ).rejects.toThrow();
  await expect(
    readJobReview(
      f.estimates,
      f.target,
      {
        ...f.job,
        material: { ...f.job.material!, line_id: payload.lines[0].id },
      },
      gate(),
    ),
  ).rejects.toThrow();
  expect(
    (
      await readCustomerService(
        f.customerModel,
        f.target,
        {
          report_id: report.id,
          published_version: report.version,
        },
        f.filters,
        gate(),
      )
    ).status,
  ).toBe('UNKNOWN');
  const foreign = await fixture(1);
  await expect(
    readBookingScheduling(foreign.property, f.target, f.booking, gate()),
  ).rejects.toThrow();
  await expect(
    readJobReview(foreign.estimates, f.target, f.job, gate()),
  ).rejects.toThrow();
  expect(
    (
      await readCustomerService(
        foreign.customerModel,
        f.target,
        f.selected,
        f.filters,
        gate(),
      )
    ).status,
  ).toBe('UNKNOWN');
});

it('revoked staff cannot reconcile any retained adapter or reveal previous customer-safe evidence', async () => {
  const f = await fixture(),
    booking = await readBookingScheduling(
      f.property,
      f.target,
      f.booking,
      gate(),
    ),
    job = await readJobReview(f.estimates, f.target, f.job, gate()),
    customer = await readCustomerService(
      f.customerModel,
      f.target,
      f.selected,
      f.filters,
      gate(),
    );
  await f.operations.configure(
    f.company.id,
    'active',
    'starter',
    {},
    f.company.id + '-backup-owner',
  );
  await f.operations.revokeOwner(f.company.id, f.target.actor_id);
  expect((await reconcileBookingScheduling(booking)).status).toBe('UNKNOWN');
  expect((await inspectJobReview(job)).status).toBe('UNKNOWN');
  expect(() =>
    assertCustomerServiceCurrentNow(
      f.customerModel,
      f.target,
      f.selected,
      f.filters,
      customer,
    ),
  ).toThrow();
});

it('withholds all three adapters when original proposal/filter inputs change during hashing', async () => {
  for (const mode of ['booking', 'job', 'customer']) {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const value = await digest(...args),
          body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
        if (
          (mode === 'booking' && body.mode === 'LOCAL_BOOKING_REVIEW_ONLY') ||
          (mode === 'job' && body.mode === 'LOCAL_SYNTHETIC_JOB_REVIEW') ||
          (mode === 'customer' && body.timeline_sha256 && body.sources)
        ) {
          reached = true;
          if (mode === 'booking') f.booking.review_note += ' changed';
          if (mode === 'job') f.job.input_revision++;
          if (mode === 'customer') f.filters.query = 'changed filter';
        }
        return value;
      });
    if (mode === 'booking')
      await expect(
        readBookingScheduling(f.property, f.target, f.booking, gate()),
      ).rejects.toThrow();
    if (mode === 'job')
      await expect(
        readJobReview(f.estimates, f.target, f.job, gate()),
      ).rejects.toThrow();
    if (mode === 'customer')
      expect(
        (
          await readCustomerService(
            f.customerModel,
            f.target,
            f.selected,
            f.filters,
            gate(),
          )
        ).status,
      ).toBe('UNKNOWN');
    expect(reached).toBe(true);
    spy.mockRestore();
  }
});

it('rejects nonprimitive allocation without invoking caller conversion code', async () => {
  const f = await fixture();
  let called = false;
  f.job.time = {
    ...f.job.time!,
    allocation: {
      toString: () => {
        called = true;
        return 'job';
      },
    } as never,
    overheadCenter: 'synthetic-overhead',
  };
  let rejected = false;
  try {
    await readJobReview(f.estimates, f.target, f.job, gate());
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
  expect(called).toBe(false);
});
