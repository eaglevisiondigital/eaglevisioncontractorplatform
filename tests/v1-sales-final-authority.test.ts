import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import {
  readSalesDesk,
  prepareSalesDesk,
  reconcileSalesDesk,
  type SalesDeskConfirmation,
} from '../src/lib/workflows/sales-desk';

afterEach(() => vi.restoreAllMocks());
const observations: unknown[] = [];
afterAll(() => {
  mkdirSync('test-results/v1-sales-final-authority', { recursive: true });
  writeFileSync(
    'test-results/v1-sales-final-authority/observations.json',
    JSON.stringify(observations, null, 2) + '\n',
  );
});
const confirmation = (): SalesDeskConfirmation => ({
  confirmed: true,
  association_confirmed: true,
  checks: { scope: true, preference: true, terms: true, boundaries: true },
});
async function fixture(brand: number) {
  const f = await prepareLocalJourney(sampleCompanies[brand], {
    enabled: true,
    confirmed: true,
  });
  await f.operations.configure(
    f.company.id,
    'active',
    'starter',
    {},
    f.company.id + '-final-sales-backup-owner',
  );
  const input = {
      intake_request_id: f.intake_request_id,
      offer_id: f.offer_id,
      receipt_id: f.receipt_id,
      visit_id: f.scheduled_visit_id,
      worker_id: f.worker_id,
      review_note: 'Explicit existing appointment and issued scope review.',
    },
    gate = { enabled: true, confirmed: true },
    view = await readSalesDesk(f, input, gate);
  return { f, input, gate, view };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function nativeActive(f: Fixture) {
  return f.f.operations
    .syntheticMemberships(f.f.company.id)
    .find((row) => row.user_id === f.f.target.actor_id)!.active;
}
function writers(f: Fixture) {
  return [
    vi.spyOn(f.f.release, 'command'),
    vi.spyOn(f.f.property, 'addVisit'),
    vi.spyOn(f.f.property, 'saveVisit'),
    vi.spyOn(f.f.estimates, 'issue'),
    vi.spyOn(f.f.estimates, 'approveJob'),
    vi.spyOn(f.f.estimates, 'assignJob'),
    vi.spyOn(f.f.operations, 'assignIntake'),
    vi.spyOn(f.f.operations, 'recordConsent'),
    vi.spyOn(globalThis, 'fetch'),
  ];
}
for (const brand of [0, 1, 2]) {
  for (const stage of ['prepare', 'reconcile'] as const) {
    for (const change of ['native_revocation', 'gate_withdrawal'] as const) {
      it(`brand ${brand}: ${stage} rejects ${change} in the final original confirmation read`, async () => {
        const f = await fixture(brand),
          input = confirmation();
        let armed = false,
          triggered = false,
          reconciliationChecks = 0,
          revoked: Promise<void> | undefined;
        input.checks = new Proxy(input.checks, {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'boundaries') {
              if (stage === 'reconcile' && armed) reconciliationChecks++;
              // Reconciliation has its original initial and final explicit
              // confirmation reads. Preparation is armed by its actual final hash.
              const final =
                armed && (stage === 'prepare' || reconciliationChecks === 2);
              if (final && !triggered) {
                triggered = true;
                if (change === 'native_revocation')
                  revoked = f.f.operations.revokeOwner(
                    f.f.company.id,
                    f.f.target.actor_id,
                  );
                else f.gate.confirmed = false;
              }
            }
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        });
        const calls = writers(f);
        let returned: unknown;
        if (stage === 'prepare') {
          const digest = crypto.subtle.digest.bind(crypto.subtle);
          vi.spyOn(crypto.subtle, 'digest').mockImplementation(
            async (...args) => {
              const result = await digest(...args),
                body = JSON.parse(
                  new TextDecoder().decode(args[1] as ArrayBuffer),
                );
              if (body.mode === 'LOCAL_BOOKING_TO_CONTRACT_PREPARATION')
                armed = true;
              return result;
            },
          );
          const [result] = await Promise.allSettled([
            prepareSalesDesk(f.view, input),
          ]);
          returned =
            result.status === 'fulfilled'
              ? { outcome: result.status, mode: result.value.mode }
              : { outcome: result.status, error: String(result.reason) };
        } else {
          const packet = await prepareSalesDesk(f.view, input),
            immutable = JSON.stringify(packet);
          armed = true;
          returned = await reconcileSalesDesk(packet);
          expect(JSON.stringify(packet)).toBe(immutable);
        }
        if (revoked) await revoked;
        observations.push({
          brand,
          stage,
          change,
          triggered,
          native_member_active: nativeActive(f),
          original_gate_confirmed: f.gate.confirmed,
          returned,
        });
        expect(triggered).toBe(true);
        if (change === 'native_revocation') expect(nativeActive(f)).toBe(false);
        else expect(f.gate.confirmed).toBe(false);
        if (stage === 'prepare')
          expect(returned).toMatchObject({ outcome: 'rejected' });
        else
          expect(returned).toMatchObject({
            status: 'UNKNOWN',
            replay: false,
            replacement: null,
          });
        for (const call of calls) expect(call).not.toHaveBeenCalled();
        f.gate.confirmed = true;
        if (!nativeActive(f))
          await f.f.operations.configure(
            f.f.company.id,
            'active',
            'starter',
            {},
            f.f.target.actor_id,
          );
        const fresh = await readSalesDesk(f.f, f.input, f.gate);
        await expect(prepareSalesDesk(fresh, confirmation())).rejects.toThrow(
          /already attempted/,
        );
      });
    }
  }
  it(`brand ${brand}: ordinary exact review stays immutable, current and without business writers`, async () => {
    const f = await fixture(brand),
      release = f.f.release.read('staff'),
      property = f.f.property.read(f.f.company.id),
      calls = writers(f),
      packet = await prepareSalesDesk(f.view, confirmation());
    expect(packet.review.lead.id).toBe(f.f.intake_request_id);
    expect(packet.review.source.version_id).toBe(f.f.target.version_id);
    expect(packet.preparation.recorded_estimate_lead_link).toBe('UNAVAILABLE');
    expect(packet.limits.genuine_customer_approval).toBe('UNVERIFIED');
    expect(packet.limits.contract_execution).toBe('BLOCKED');
    expect(Object.isFrozen(packet)).toBe(true);
    expect(await reconcileSalesDesk(packet)).toMatchObject({
      status: 'CURRENT_REVIEW_ONLY',
      replay: false,
    });
    expect(f.f.release.read('staff')).toEqual(release);
    expect(f.f.property.read(f.f.company.id)).toEqual(property);
    expect(JSON.stringify(packet)).not.toMatch(
      /PRIVATE|unit_cost_minor|margin_bps|payroll|internal_notes/,
    );
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: changed canonical appointment remains stale before preparation`, async () => {
    const f = await fixture(brand),
      visit = f.f.property
        .read(f.f.company.id)
        .visits.find((v) => v.id === f.f.scheduled_visit_id)!;
    f.f.property.saveVisit(f.f.company.id, visit, {
      ...visit.content,
      summary: 'Explicit canonical source change',
    });
    await expect(prepareSalesDesk(f.view, confirmation())).rejects.toThrow();
  });
  it(`brand ${brand}: another genuine company cannot replace retained sales source owners`, async () => {
    const f = await fixture(brand),
      other = await fixture((brand + 1) % 3);
    await expect(
      readSalesDesk({ ...f.f, release: other.f.release }, f.input, f.gate),
    ).rejects.toThrow();
  });
}
it('OFF denies before source inspection and confirmation authority', async () => {
  const accessed = vi.fn(() => {
      throw Error('Unadmitted source');
    }),
    source = new Proxy(
      {},
      { getOwnPropertyDescriptor: accessed, get: accessed },
    );
  await expect(readSalesDesk(source as never, {} as never)).rejects.toThrow(
    /OFF/,
  );
  expect(accessed).not.toHaveBeenCalled();
});
it('copied original read and packet confer no preparation or reconciliation authority', async () => {
  const f = await fixture(0);
  await expect(
    prepareSalesDesk({ ...f.view }, confirmation()),
  ).rejects.toThrow();
  const packet = await prepareSalesDesk(f.view, confirmation());
  expect((await reconcileSalesDesk({ ...packet })).status).toBe('UNKNOWN');
});
