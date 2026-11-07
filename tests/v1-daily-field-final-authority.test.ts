import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readDailyFieldGuide,
  assertDailyFieldGuideNow,
  reconcileDailyFieldGuide,
  inspectDailyFieldStep,
  openDailyFieldControls,
  navigateDailyFieldJob,
} from '../src/lib/workflows/daily-field-guide';

const observations: unknown[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  mkdirSync('test-results/v1-daily-field-final-authority', { recursive: true });
  writeFileSync(
    'test-results/v1-daily-field-final-authority/observations.json',
    JSON.stringify(observations, null, 2) + '\n',
  );
});
async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0];
  await sources.operations.configure(
    sources.company.id,
    'active',
    'starter',
    {},
    sources.company.id + '-daily-final-backup-owner',
  );
  return {
    gate,
    sources,
    entry,
    input: { job_id: entry.target.job_id!, worker_id: '' },
  };
}
function writers(f: Awaited<ReturnType<typeof fixture>>) {
  return [
    vi.spyOn(f.sources.estimates, 'assignJob'),
    vi.spyOn(f.sources.estimates, 'recordTime'),
    vi.spyOn(f.sources.estimates, 'issue'),
    vi.spyOn(f.sources.property, 'saveVisit'),
    vi.spyOn(f.sources.property, 'addVisit'),
    vi.spyOn(f.sources.property, 'savePlan'),
    vi.spyOn(f.sources.operations, 'assignIntake'),
    vi.spyOn(f.sources.operations, 'recordConsent'),
    vi.spyOn(globalThis, 'fetch'),
  ];
}
for (const brand of [0, 1, 2]) {
  for (const stage of ['step', 'read'] as const) {
    for (const change of ['native_revocation', 'gate_withdrawal'] as const) {
      const name =
        stage === 'step'
          ? `brand ${brand}: final daily step input read rejects ${change} before returning scope`
          : `brand ${brand}: final daily guide input read rejects ${change} before returning scope`;
      it(name, async () => {
        const f = await fixture(brand);
        let armed = stage === 'read',
          reads = 0,
          triggered = false,
          revoked: Promise<void> | undefined;
        const finalRead = stage === 'step' ? 4 : 5;
        const input = new Proxy(f.input, {
          getOwnPropertyDescriptor(target, key) {
            if (armed && key === 'worker_id' && ++reads === finalRead) {
              triggered = true;
              if (change === 'native_revocation')
                revoked = f.sources.operations.revokeOwner(
                  f.sources.company.id,
                  f.entry.target.actor_id,
                );
              else f.gate.confirmed = false;
            }
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        });
        const view =
          stage === 'step'
            ? await readDailyFieldGuide(f.sources, input, f.gate)
            : null;
        if (view) expect(view.scope.length).toBeGreaterThan(0);
        const calls = writers(f);
        armed = true;
        const [result] = await Promise.allSettled([
          view
            ? inspectDailyFieldStep(view, 'scope')
            : readDailyFieldGuide(f.sources, input, f.gate),
        ]);
        if (revoked) await revoked;
        const active = f.sources.operations
          .syntheticMemberships(f.sources.company.id)
          .find((row) => row.user_id === f.entry.target.actor_id)!.active;
        observations.push({
          brand,
          stage,
          change,
          reads,
          triggered,
          native_member_active: active,
          original_gate_confirmed: f.gate.confirmed,
          returned:
            result.status === 'fulfilled'
              ? {
                  outcome: result.status,
                  authority: result.value.authority,
                  scope_rows: result.value.scope.length,
                  exact_original_scope: view
                    ? result.value.scope === view.scope
                    : null,
                }
              : { outcome: result.status, error: String(result.reason) },
        });
        expect(triggered).toBe(true);
        expect(reads).toBe(finalRead);
        if (change === 'native_revocation') expect(active).toBe(false);
        else expect(f.gate.confirmed).toBe(false);
        expect(result.status).toBe('rejected');
        for (const call of calls) expect(call).not.toHaveBeenCalled();
        if (view) {
          f.gate.confirmed = true;
          if (!active)
            await f.sources.operations.configure(
              f.sources.company.id,
              'active',
              'starter',
              {},
              f.entry.target.actor_id,
            );
          expect((await reconcileDailyFieldGuide(view)).status).toBe('UNKNOWN');
          expect(() => assertDailyFieldGuideNow(view)).toThrow();
          const callback = vi.fn();
          await expect(navigateDailyFieldJob(view, callback)).rejects.toThrow();
          expect(callback).not.toHaveBeenCalled();
        }
      });
    }
  }
  it(`brand ${brand}: ordinary exact daily review and synchronous navigation remain current without writers`, async () => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      calls = writers(f),
      view = await readDailyFieldGuide(f.sources, f.input, f.gate),
      snapshot = JSON.stringify(view),
      detail = await inspectDailyFieldStep(view, 'scope'),
      callback = vi.fn();
    expect(detail.scope).toBe(view.scope);
    expect(detail.scope.length).toBeGreaterThan(0);
    expect(Object.isFrozen(detail)).toBe(true);
    expect(view.physical_completion).toBe('UNVERIFIED');
    expect(view.actual_availability).toBe('UNKNOWN');
    expect(Object.values(view.authority).every((value) => !value)).toBe(true);
    expect(await openDailyFieldControls(view)).toBe(f.input.job_id);
    await navigateDailyFieldJob(view, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(f.input.job_id, 'field');
    expect((await reconcileDailyFieldGuide(view)).status).toBe(
      'CURRENT_REVIEW_ONLY',
    );
    expect(JSON.stringify(view)).toBe(snapshot);
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
}
it('retained input drift permanently withholds the original guide after restoration', async () => {
  const f = await fixture(0),
    view = await readDailyFieldGuide(f.sources, f.input, f.gate);
  f.input.worker_id = 'foreign-worker';
  expect((await reconcileDailyFieldGuide(view)).status).toBe('UNKNOWN');
  f.input.worker_id = '';
  expect((await reconcileDailyFieldGuide(view)).status).toBe('UNKNOWN');
  await expect(inspectDailyFieldStep(view, 'scope')).rejects.toThrow();
});
it('actual canonical visit revision change withholds retained daily scope', async () => {
  const f = await fixture(0),
    view = await readDailyFieldGuide(f.sources, f.input, f.gate),
    visit = f.sources.property
      .read(f.sources.company.id)
      .visits.find((row) => row.id === f.entry.scheduled_visit_id)!;
  f.sources.property.saveVisit(f.sources.company.id, visit, {
    ...visit.content,
    summary: 'Explicit actual canonical visit correction',
  });
  await expect(inspectDailyFieldStep(view, 'scope')).rejects.toThrow();
  expect((await reconcileDailyFieldGuide(view)).status).toBe('UNKNOWN');
});
it('a real foreign repository cannot replace the retained daily source owner', async () => {
  const f = await fixture(0),
    other = await fixture(1),
    view = await readDailyFieldGuide(f.sources, f.input, f.gate);
  f.sources.property = other.sources.property;
  await expect(inspectDailyFieldStep(view, 'scope')).rejects.toThrow();
  expect((await reconcileDailyFieldGuide(view)).status).toBe('UNKNOWN');
});
it('copied guide data grants no current evidence or navigation identity', async () => {
  const f = await fixture(0),
    view = await readDailyFieldGuide(f.sources, f.input, f.gate),
    copy = structuredClone(view),
    callback = vi.fn();
  expect(() => assertDailyFieldGuideNow(copy)).toThrow();
  expect((await reconcileDailyFieldGuide(copy)).status).toBe('UNKNOWN');
  await expect(inspectDailyFieldStep(copy, 'scope')).rejects.toThrow();
  await expect(navigateDailyFieldJob(copy, callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
it('OFF denies before any input or source inspection', async () => {
  const accessed = vi.fn(() => {
      throw Error('Unadmitted source access');
    }),
    foreign = new Proxy(
      {},
      { get: accessed, getOwnPropertyDescriptor: accessed },
    );
  await expect(
    readDailyFieldGuide(foreign as never, foreign as never),
  ).rejects.toThrow();
  expect(accessed).not.toHaveBeenCalled();
});
it('accessor selection is denied without executing the getter', async () => {
  const f = await fixture(0),
    getter = vi.fn(),
    input = Object.defineProperty({ worker_id: '' }, 'job_id', {
      enumerable: true,
      get: getter,
    });
  await expect(
    readDailyFieldGuide(f.sources, input as never, f.gate),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
