import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskReceiptContinuity,
  inspectTaskReceiptContinuity,
  inspectTaskReceiptTask,
  verifyTaskReceiptCorrectionSource,
  taskReceiptControlsDestination,
  rereadTaskReceiptContinuity,
} from '../src/lib/workflows/task-receipt-reconciliation';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    org = sources.company.id,
    job = entry.target.job_id!;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const id = await sources.estimates.recordTime(org, entry.worker_id, {
    job_id: job,
    overhead_center: null,
    task: 'Exact assigned native continuity task',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Exact native task ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(org, id, 'approved', 'Staff-only review');
  const review = await readTaskReceiptContinuity(sources, job, gate);
  return { gate, sources, entry, org, job, id, review };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const revoke = (f: Fixture) =>
  f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: late outer continuity selector cannot revoke current access and disclose original private facts`, async () => {
    const f = await fixture(brand);
    let reads = 0,
      revoked: Promise<void> | undefined,
      result: unknown;
    const review = new Proxy(f.review, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key === 'receipt' && ++reads === 2) revoked = revoke(f);
        return value;
      },
    });
    try {
      result = inspectTaskReceiptContinuity(review);
    } catch {
      /* No private facts after revocation. */
    }
    if (revoked) {
      await revoked;
      expect(result).toBeUndefined();
      expect(() => inspectTaskReceiptContinuity(f.review)).toThrow();
    } else {
      expect(reads).toBe(0);
      expect(result).toEqual(inspectTaskReceiptContinuity(f.review));
    }
  });

  it(`brand ${brand}: late nested receipt-view selector cannot revoke current access after its native guard`, async () => {
    const f = await fixture(brand);
    let reads = 0,
      revoked: Promise<void> | undefined,
      result: unknown;
    const receipt = new Proxy(f.review.receipt, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key === 'view' && ++reads === 1) revoked = revoke(f);
        return value;
      },
    });
    try {
      result = inspectTaskReceiptContinuity({ ...f.review, receipt });
    } catch {
      /* Original source guards remain authoritative. */
    }
    if (revoked) {
      await revoked;
      expect(result).toBeUndefined();
    } else {
      expect(reads).toBe(0);
      expect(result).toEqual(inspectTaskReceiptContinuity(f.review));
    }
  });

  it(`brand ${brand}: outer and nested accessors are denied without invoking private selectors`, async () => {
    const f = await fixture(brand),
      getter = vi.fn(() => {
        throw Error('Private selector');
      });
    const outer = Object.defineProperty({ ...f.review }, 'graph', {
      get: getter,
    });
    const receipt = Object.defineProperty({ ...f.review.receipt }, 'view', {
      get: getter,
    });
    expect(() => inspectTaskReceiptContinuity(outer)).toThrow();
    expect(() =>
      inspectTaskReceiptContinuity({ ...f.review, receipt }),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => inspectTaskReceiptContinuity(f.review)).not.toThrow();
  });

  it(`brand ${brand}: executable descriptor effects precede original native authorization`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const review = new Proxy(f.review, {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === 'order' && !revoked) revoked = revoke(f);
        return descriptor;
      },
    });
    expect(() => inspectTaskReceiptContinuity(review)).toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => inspectTaskReceiptTask(f.review, f.id)).toThrow();
  });

  it(`brand ${brand}: captured original references survive all read-only consumers without invoking outer or nested get traps`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      jobs = await f.sources.estimates.jobs(f.org),
      getter = vi.fn(() => {
        throw Error('Executable wrapper must not select source');
      }),
      receipt = new Proxy(f.review.receipt, { get: getter }),
      wrapper = new Proxy({ ...f.review, receipt }, { get: getter }),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    expect(inspectTaskReceiptContinuity(wrapper).receipt).toBe(
      f.review.receipt.receipt,
    );
    const task = inspectTaskReceiptTask(wrapper, f.id);
    expect(task.identity).toEqual(f.review.graph.identity);
    expect(task.task.id).toBe(f.id);
    expect(task.availability).toBe('UNKNOWN');
    expect(task.durable_receipt).toBe('NOT_IMPLEMENTED');
    expect(task.write).toBe(false);
    expect(
      (await verifyTaskReceiptCorrectionSource(wrapper, f.id)).source_entry_id,
    ).toBe(f.id);
    expect(await taskReceiptControlsDestination(wrapper, f.id)).toEqual({
      job_id: f.job,
      step: 'field',
      source_entry_id: f.id,
      meaning: 'OPEN_ORIGINAL_CONTROLS_ONLY',
    });
    const reread = await rereadTaskReceiptContinuity(
      wrapper,
      f.sources,
      f.job,
      f.gate,
    );
    expect(inspectTaskReceiptTask(reread, f.id).task.id).toBe(f.id);
    expect(getter).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.org)).toEqual(before);
    expect(await f.sources.estimates.jobs(f.org)).toEqual(jobs);
  });

  it(`brand ${brand}: actual revocation during a pending native workforce read blocks returned correction facts and navigation`, async () => {
    const f = await fixture(brand),
      original = f.sources.estimates.workforce.bind(f.sources.estimates);
    let release: () => void = () => undefined,
      arrived: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
      async (org) => {
        arrived();
        await held;
        return original(org);
      },
    );
    const pending = verifyTaskReceiptCorrectionSource({ ...f.review }, f.id);
    await entered;
    await revoke(f);
    release();
    await expect(pending).rejects.toThrow();
    expect(() => inspectTaskReceiptTask(f.review, f.id)).toThrow();
    await expect(
      taskReceiptControlsDestination(f.review, f.id),
    ).rejects.toThrow();
  });

  it(`brand ${brand}: independently valid other-job or foreign-company handles cannot join original receipt custody`, async () => {
    const f = await fixture(brand),
      other = await readTaskReceiptContinuity(
        f.sources,
        f.sources.entries[2].target.job_id!,
        f.gate,
      ),
      foreign = await fixture((brand + 1) % 3);
    expect(other.graph.identity.job_id).not.toBe(f.job);
    expect(foreign.review.graph.identity.organization_id).not.toBe(f.org);
    for (const graft of [other, foreign.review])
      for (const key of ['receipt', 'graph', 'order'] as const) {
        expect(() =>
          inspectTaskReceiptContinuity({ ...f.review, [key]: graft[key] }),
        ).toThrow();
      }
    expect(() => inspectTaskReceiptTask(f.review, f.id)).not.toThrow();
  });

  it(`brand ${brand}: competing canonical task evidence stales old detail and exact reread keeps the originally selected ID`, async () => {
    const f = await fixture(brand),
      source = inspectTaskReceiptTask(f.review, f.id).task;
    const successor = await f.sources.estimates.recordTime(
      f.org,
      f.entry.worker_id,
      {
        job_id: f.job,
        overhead_center: null,
        task: 'Competing native task revision',
        kind: 'work',
        started_at: source.started_at,
        ended_at: source.ended_at,
        billable: source.billable,
        corrects_id: f.id,
      },
    );
    expect(() => inspectTaskReceiptTask(f.review, f.id)).toThrow();
    const fresh = await rereadTaskReceiptContinuity(
        { ...f.review },
        f.sources,
        f.job,
        f.gate,
      ),
      selected = inspectTaskReceiptTask(fresh, f.id);
    expect(selected.task.id).toBe(f.id);
    expect(selected.successor_ids).toEqual([successor]);
    expect(selected.correction_requirement).toBe('NATIVE_SOURCE_NOT_ELIGIBLE');
    expect(selected.replay).toBe('FORBIDDEN');
    await expect(taskReceiptControlsDestination(fresh, f.id)).rejects.toThrow();
  });

  it(`brand ${brand}: a new presentation wrapper cannot release original UNKNOWN after a lost native correction acknowledgment`, async () => {
    const f = await fixture(brand),
      original = await readTaskCorrectionReview(f.sources, f.job, f.gate, f.id),
      reviewTime = f.sources.estimates.reviewTime.bind(f.sources.estimates),
      input = {
        source_entry_id: f.id,
        task: 'Explicit corrected native task',
        started_at: original.source.started_at,
        ended_at: original.source.ended_at,
        billable: true,
      };
    vi.spyOn(f.sources.estimates, 'reviewTime').mockImplementation(
      async (...args) => {
        await reviewTime(...args);
        throw Error('Synthetic caller acknowledgment lost');
      },
    );
    await expect(
      saveTaskCorrectionReview(original, input, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      retained = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      wrapper = { ...retained, receipt: { ...retained.receipt } },
      task = inspectTaskReceiptTask(wrapper, f.id);
    expect(task.custody).toBe('UNKNOWN');
    expect(task.replay).toBe('FORBIDDEN');
    const successors = f.sources.estimates
      .readSyntheticPrototypeSources(f.entry.target)
      .workforce.entries.filter((entry) => entry.corrects_id === f.id);
    expect(successors).toHaveLength(1);
    // The append acknowledgment preceded the later review acknowledgment loss.
    // UNKNOWN preserves that exact known ID without claiming a known outcome.
    expect(task.acknowledged_result_id).toBe(successors[0].id);
    await expect(
      taskReceiptControlsDestination(wrapper, f.id),
    ).rejects.toThrow();
    await expect(
      saveTaskCorrectionReview(original, input, true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  });
}

it('OFF current reread rejects before caller selectors and cannot revive original source access', async () => {
  const getter = vi.fn(() => {
      throw Error('Private selector');
    }),
    previous = new Proxy({}, { get: getter, getOwnPropertyDescriptor: getter });
  await expect(
    rereadTaskReceiptContinuity(previous as never, {} as never, 'unknown'),
  ).rejects.toThrow('Explicit local current-source reread required');
  expect(getter).not.toHaveBeenCalled();
});
