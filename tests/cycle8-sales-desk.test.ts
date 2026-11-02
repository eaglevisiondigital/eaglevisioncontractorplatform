import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  prepareSalesDesk,
  readSalesDesk,
  reconcileSalesDesk,
  type SalesDeskConfirmation,
} from '../src/lib/workflows/sales-desk';
afterEach(() => vi.restoreAllMocks());
const confirm = (): SalesDeskConfirmation => ({
  confirmed: true,
  association_confirmed: true,
  checks: { scope: true, preference: true, terms: true, boundaries: true },
});
async function fixture(index = 0) {
  const f = await prepareLocalJourney(sampleCompanies[index], {
    enabled: true,
    confirmed: true,
  });
  return {
    f,
    input: {
      intake_request_id: f.intake_request_id,
      offer_id: f.offer_id,
      receipt_id: f.receipt_id,
      visit_id: f.scheduled_visit_id,
      worker_id: f.worker_id,
      review_note: 'Exact recorded appointment and issued scope reviewed.',
    },
    gate: { enabled: true, confirmed: true },
  };
}
it.each([0, 1, 2])(
  'company %s retains actual sources through booking and contract preparation without writers',
  async (i) => {
    const { f, input, gate } = await fixture(i),
      before = f.release.read('staff'),
      property = f.property.read(f.company.id),
      version = await f.estimates.get(f.company.id, f.target.estimate_id);
    const writers = [
      vi.spyOn(f.release, 'command'),
      vi.spyOn(f.property, 'addVisit'),
      vi.spyOn(f.property, 'saveVisit'),
      vi.spyOn(f.estimates, 'issue'),
      vi.spyOn(f.estimates, 'approveJob'),
      vi.spyOn(f.estimates, 'assignJob'),
    ];
    const view = await readSalesDesk(f, input, gate);
    expect(view.lead.id).toBe(f.intake_request_id);
    expect(view.receipt.id).toBe(f.receipt_id);
    expect(view.source.version_id).toBe(f.target.version_id);
    expect(view.appointment).toMatchObject({
      visit_id: f.scheduled_visit_id,
      date: f.day,
      availability: 'UNKNOWN',
    });
    expect(view.source.scope.total_minor).toBe(
      f.issued.version.calculation.total_minor,
    );
    const packet = await prepareSalesDesk(view, confirm());
    expect(packet.preparation.preparation.reference.receipt.id).toBe(
      f.receipt_id,
    );
    expect(packet.preparation.preparation.reference.source.version_id).toBe(
      f.target.version_id,
    );
    expect(packet.review.appointment.visit_id).toBe(f.scheduled_visit_id);
    expect(packet.integrity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(packet.review.source.scope.lines)).toBe(true);
    expect(await reconcileSalesDesk(packet)).toEqual({
      status: 'CURRENT_REVIEW_ONLY',
      replacement: null,
      replay: false,
    });
    expect(f.release.read('staff')).toEqual(before);
    expect(f.property.read(f.company.id)).toEqual(property);
    expect(await f.estimates.get(f.company.id, f.target.estimate_id)).toEqual(
      version,
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|unit_cost_minor|margin_bps|payroll|internal_notes/,
    );
  },
);
it('stays OFF before reading sources', async () => {
  const { f, input } = await fixture();
  const read = vi.spyOn(f.estimates, 'readSyntheticPrototypeSources');
  await expect(readSalesDesk(f, input)).rejects.toThrow(/OFF/);
  expect(read).not.toHaveBeenCalled();
});
it.each([
  'intake_request_id',
  'offer_id',
  'receipt_id',
  'visit_id',
  'worker_id',
] as const)('rejects incorrect exact %s without substitution', async (key) => {
  const { f, input, gate } = await fixture();
  await expect(
    readSalesDesk(f, { ...input, [key]: 'foreign-id' }, gate),
  ).rejects.toThrow();
});
it.each([
  'customer_id',
  'location_id',
  'organization_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const)('rejects foreign target %s', async (key) => {
  const { f, input, gate } = await fixture();
  f.target[key] = 'foreign-source';
  await expect(readSalesDesk(f, input, gate)).rejects.toThrow();
});
it('selects an actual published visit without implying physical completion or changing its date', async () => {
  const { f, input, gate } = await fixture();
  input.visit_id = f.visit_id;
  const view = await readSalesDesk(f, input, gate);
  expect(view.appointment.date).toBe('2026-12-07');
  expect(view.appointment.visit_id).toBe(f.visit_id);
  expect(view.appointment.availability).toBe('UNKNOWN');
  expect(view.authority).toMatchObject({
    book: false,
    dispatch: false,
    contract: false,
    financial: false,
  });
});
it.each(['-field', '-estimator', '-foreign'])(
  'denies ineligible %s reviewer',
  async (suffix) => {
    const { f, input, gate } = await fixture();
    f.target.actor_id = f.company.id + suffix;
    await expect(readSalesDesk(f, input, gate)).rejects.toThrow();
  },
);
it('revocation after read blocks preparation', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate);
  await f.operations.configure(
    f.company.id,
    'active',
    'starter',
    {},
    f.company.id + '-backup-owner',
  );
  await f.operations.revokeOwner(f.company.id, f.target.actor_id);
  await expect(prepareSalesDesk(view, confirm())).rejects.toThrow();
});
it('rejects stale issued source after a revised draft exists', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate);
  await f.estimates.revise(f.company.id, f.issued);
  await expect(prepareSalesDesk(view, confirm())).rejects.toThrow();
});
it('rejects changed recorded visit revision', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate),
    visit = f.property
      .read(f.company.id)
      .visits.find((v) => v.id === f.scheduled_visit_id)!;
  f.property.saveVisit(f.company.id, visit, {
    ...visit.content,
    summary: 'Changed recorded source',
  });
  await expect(prepareSalesDesk(view, confirm())).rejects.toThrow();
});
it('prevents concurrent and subsequent duplicate preparation, even through a freshly read view', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate);
  const results = await Promise.allSettled([
    prepareSalesDesk(view, confirm()),
    prepareSalesDesk(view, confirm()),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const fresh = await readSalesDesk(f, input, gate);
  await expect(prepareSalesDesk(fresh, confirm())).rejects.toThrow(
    /already attempted/,
  );
});
it('failed acknowledgment/hash leaves UNKNOWN claim and forbids source-view replacement', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let lost = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const bytes = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (bytes.mode === 'LOCAL_BOOKING_TO_CONTRACT_PREPARATION') {
      lost = true;
      throw Error('Lost result');
    }
    return digest(...args);
  });
  await expect(prepareSalesDesk(view, confirm())).rejects.toThrow();
  expect(lost).toBe(true);
  vi.restoreAllMocks();
  const fresh = await readSalesDesk(f, input, gate);
  await expect(prepareSalesDesk(fresh, confirm())).rejects.toThrow(
    /already attempted/,
  );
  expect(f.release.read('staff').release_contracts).toEqual([]);
});
it('keeps an immutable packet stale/UNKNOWN after later appointment change', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate),
    packet = await prepareSalesDesk(view, confirm()),
    immutable = JSON.stringify(packet),
    visit = f.property
      .read(f.company.id)
      .visits.find((v) => v.id === f.scheduled_visit_id)!;
  f.property.saveVisit(f.company.id, visit, {
    ...visit.content,
    summary: 'Newer review',
  });
  expect((await reconcileSalesDesk(packet)).status).toBe('UNKNOWN');
  expect((await reconcileSalesDesk(packet)).status).toBe('UNKNOWN');
  expect(JSON.stringify(packet)).toBe(immutable);
});
it.each(['selection', 'target', 'gate', 'confirmation', 'lead'] as const)(
  'rechecks original %s at final packet hash',
  async (change) => {
    const { f, input, gate } = await fixture(),
      view = await readSalesDesk(f, input, gate),
      confirmed = confirm(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let reached = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args),
        body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
      if (body.mode === 'LOCAL_BOOKING_TO_CONTRACT_PREPARATION') {
        reached = true;
        if (change === 'selection') input.visit_id = 'foreign';
        if (change === 'target') f.target.location_id = 'foreign';
        if (change === 'gate') gate.confirmed = false;
        if (change === 'confirmation') confirmed.confirmed = false;
        if (change === 'lead')
          await f.operations.assignIntake(
            f.company.id,
            f.intake_request_id,
            null,
            'reviewed',
          );
      }
      return result;
    });
    await expect(prepareSalesDesk(view, confirmed)).rejects.toThrow();
    expect(reached).toBe(true);
  },
);
it('requires each explicit existing checklist and association confirmation', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate);
  for (const bad of [
    { ...confirm(), confirmed: false },
    { ...confirm(), association_confirmed: false },
    { ...confirm(), checks: { ...confirm().checks, scope: false } },
  ])
    await expect(prepareSalesDesk(view, bad)).rejects.toThrow();
  expect(
    (await prepareSalesDesk(view, confirm())).limits.contract_execution,
  ).toBe('BLOCKED');
});
it('rejects accessors and coercive data without invoking them', async () => {
  const { f, input, gate } = await fixture();
  let invoked = false;
  const evil = Object.defineProperty({ ...input }, 'visit_id', {
    enumerable: true,
    get() {
      invoked = true;
      return f.visit_id;
    },
  });
  await expect(readSalesDesk(f, evil, gate)).rejects.toThrow();
  const coercive = {
    ...input,
    review_note: {
      toString() {
        invoked = true;
        return 'fake';
      },
    },
  };
  await expect(readSalesDesk(f, coercive as never, gate)).rejects.toThrow();
  expect(invoked).toBe(false);
});
it('rejects foreign reconstructed snapshot during preparation and reconciliation', async () => {
  const { f, input, gate } = await fixture(),
    view = await readSalesDesk(f, input, gate);
  await expect(
    prepareSalesDesk(JSON.parse(JSON.stringify(view)), confirm()),
  ).rejects.toThrow();
  const packet = await prepareSalesDesk(view, confirm());
  expect(
    (await reconcileSalesDesk(JSON.parse(JSON.stringify(packet)))).status,
  ).toBe('UNKNOWN');
});

it('a second eligible reviewer cannot reopen the same exact source preparation', async () => {
  const { f, input, gate } = await fixture(),
    other = f.company.id + '-backup-owner';
  await f.operations.configure(f.company.id, 'active', 'starter', {}, other);
  const view = await readSalesDesk(f, input, gate);
  await prepareSalesDesk(view, confirm());
  f.target.actor_id = other;
  const second = await readSalesDesk(f, input, gate);
  await expect(prepareSalesDesk(second, confirm())).rejects.toThrow(
    /already attempted/,
  );
});
