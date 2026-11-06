import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertPublishedServiceHistory,
  continuePublishedServiceReview,
  inspectPublishedServiceReport,
  readPublishedServiceHistory,
  type PublishedServiceCallback,
  type PublishedServiceContinue,
} from '../src/lib/workflows/published-service-navigation';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function loaded(brand: number) {
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
    org + '-navigation-remaining-owner',
  );
  const history = await readPublishedServiceHistory(sources, job, gate),
    report = inspectPublishedServiceReport(
      history,
      history.reports[0].reference,
    );
  return { gate, sources, entry, org, job, history, report };
}
type Fixture = Awaited<ReturnType<typeof loaded>>;
function nativeRevoke(f: Fixture) {
  return f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
}
function callbackCapture(
  expected: PublishedServiceContinue,
  at: number,
  change: () => void,
) {
  let captures = 0;
  const live = new Proxy(
    { current: expected, generation: 0 },
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'current' && ++captures === at) change();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  return { live, count: () => captures };
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: final pre-dispatch capture revocation withholds the original private job callback`, async () => {
    const f = await loaded(brand);
    let revoked: Promise<void> | undefined;
    const observed: boolean[] = [],
      expected = vi.fn(async () => {
        observed.push(
          f.sources.operations
            .syntheticMemberships(f.org)
            .find((m) => m.user_id === f.entry.target.actor_id)!.active,
        );
      }),
      capture = callbackCapture(expected, 2, () => {
        revoked = nativeRevoke(f);
      });
    await expect(
      continuePublishedServiceReview(
        f.history,
        f.report,
        expected,
        capture.live,
      ),
    ).rejects.toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(capture.count()).toBe(2);
    expect(() => assertPublishedServiceHistory(f.history)).toThrow();
    expect(observed).toEqual([]);
    expect(expected).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: final post-callback capture revocation withholds local success`, async () => {
    const f = await loaded(brand);
    let revoked: Promise<void> | undefined;
    const observed: boolean[] = [],
      expected = vi.fn(async () => {
        observed.push(
          f.sources.operations
            .syntheticMemberships(f.org)
            .find((m) => m.user_id === f.entry.target.actor_id)!.active,
        );
      }),
      capture = callbackCapture(expected, 3, () => {
        revoked = nativeRevoke(f);
      });
    await expect(
      continuePublishedServiceReview(
        f.history,
        f.report,
        expected,
        capture.live,
      ),
    ).rejects.toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(capture.count()).toBe(3);
    expect(observed).toEqual([true]);
    expect(expected).toHaveBeenCalledExactlyOnceWith(f.job, 'maintenance');
    expect(() => assertPublishedServiceHistory(f.history)).toThrow();
  });

  it(`brand ${brand}: ordinary exact navigation invokes once without changing canonical evidence`, async () => {
    const f = await loaded(brand),
      property = f.sources.property.read(f.org),
      estimates = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      writers = [
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      expected = vi.fn(async () => {}),
      live = { current: expected, generation: 0 };
    await expect(
      continuePublishedServiceReview(f.history, f.report, expected, live),
    ).resolves.toEqual({
      status: 'LOCAL_REVIEW_NAVIGATION_ONLY',
      job_id: f.job,
    });
    expect(expected).toHaveBeenCalledExactlyOnceWith(f.job, 'maintenance');
    expect(f.history.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(f.history.physical_completion).toBe('UNVERIFIED');
    expect(f.history.customer_acceptance).toBe('UNVERIFIED');
    expect(f.history.delivery).toBe('NOT_SENT');
    assertPublishedServiceHistory(f.history);
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(estimates);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: known generation withdrawal before invocation releases only its own claim`, async () => {
    const f = await loaded(brand),
      expected = vi.fn(async () => {}),
      live: PublishedServiceCallback = { current: expected, generation: 0 },
      first = continuePublishedServiceReview(
        f.history,
        f.report,
        expected,
        live,
      );
    live.current = undefined;
    live.generation++;
    await expect(first).rejects.toThrow(/callback/i);
    expect(expected).not.toHaveBeenCalled();
    assertPublishedServiceHistory(f.history);
    live.current = expected;
    live.generation++;
    await expect(
      continuePublishedServiceReview(f.history, f.report, expected, live),
    ).resolves.toMatchObject({ job_id: f.job });
    expect(expected).toHaveBeenCalledTimes(1);
  });

  it(`brand ${brand}: generation withdrawal after invocation keeps canonical UNKNOWN without replay`, async () => {
    const f = await loaded(brand),
      live: PublishedServiceCallback = { current: undefined, generation: 0 },
      expected = vi.fn(async () => {
        live.current = undefined;
        live.generation++;
      });
    live.current = expected;
    await expect(
      continuePublishedServiceReview(f.history, f.report, expected, live),
    ).rejects.toThrow(/callback/i);
    expect(expected).toHaveBeenCalledTimes(1);
    live.current = expected;
    live.generation++;
    await expect(
      continuePublishedServiceReview(f.history, f.report, expected, live),
    ).rejects.toThrow('UNKNOWN');
    await expect(
      readPublishedServiceHistory(f.sources, f.job, f.gate),
    ).rejects.toThrow('UNKNOWN');
    expect(expected).toHaveBeenCalledTimes(1);
  });

  it(`brand ${brand}: observed native revocation cannot resume after original membership restoration`, async () => {
    const f = await loaded(brand),
      expected = vi.fn(async () => {}),
      live = { current: expected, generation: 0 },
      first = continuePublishedServiceReview(
        f.history,
        f.report,
        expected,
        live,
      ),
      rejected = expect(first).rejects.toThrow();
    await nativeRevoke(f);
    await rejected;
    expect(expected).not.toHaveBeenCalled();
    await f.sources.operations.configure(
      f.org,
      'active',
      'synthetic',
      {},
      f.entry.target.actor_id,
    );
    await expect(
      readPublishedServiceHistory(f.sources, f.job, f.gate),
    ).rejects.toThrow('UNKNOWN');
    await expect(
      continuePublishedServiceReview(f.history, f.report, expected, live),
    ).rejects.toThrow('UNKNOWN');
    expect(expected).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: confirmation withdrawn during callback capture stays UNKNOWN after restoration`, async () => {
    const f = await loaded(brand),
      expected = vi.fn(async () => {}),
      capture = callbackCapture(expected, 2, () => {
        f.gate.confirmed = false;
      });
    await expect(
      continuePublishedServiceReview(
        f.history,
        f.report,
        expected,
        capture.live,
      ),
    ).rejects.toThrow();
    expect(expected).not.toHaveBeenCalled();
    f.gate.confirmed = true;
    await expect(
      readPublishedServiceHistory(f.sources, f.job, f.gate),
    ).rejects.toThrow('UNKNOWN');
    expect(() => assertPublishedServiceHistory(f.history)).toThrow('UNKNOWN');
  });

  it(`brand ${brand}: a foreign company's exact inspected report cannot navigate the retained own job`, async () => {
    const f = await loaded(brand),
      other = await loaded((brand + 1) % 3),
      expected = vi.fn(async () => {});
    expect(f.org).not.toBe(other.org);
    await expect(
      continuePublishedServiceReview(f.history, other.report, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow('Inspect the exact report');
    expect(expected).not.toHaveBeenCalled();
    assertPublishedServiceHistory(f.history);
  });
}

it('one original operations owner excludes a competing callback until its exact pending claim settles', async () => {
  const f = await loaded(0),
    other = await readPublishedServiceHistory(f.sources, f.job, f.gate),
    report = inspectPublishedServiceReport(other, other.reports[0].reference);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    pending = new Promise<void>((resolve) => {
      release = resolve;
    }),
    expected = vi.fn(async () => {
      entered();
      await pending;
    }),
    live = { current: expected, generation: 0 },
    first = continuePublishedServiceReview(f.history, f.report, expected, live);
  await started;
  await expect(
    continuePublishedServiceReview(other, report, expected, live),
  ).rejects.toThrow('pending');
  expect(expected).toHaveBeenCalledTimes(1);
  release();
  await expect(first).resolves.toMatchObject({ job_id: f.job });
});

it('a copied report cannot replace the exact original inspected source object', async () => {
  const f = await loaded(0),
    expected = vi.fn(async () => {});
  await expect(
    continuePublishedServiceReview(f.history, { ...f.report }, expected, {
      current: expected,
      generation: 0,
    }),
  ).rejects.toThrow('Inspect the exact report');
  expect(expected).not.toHaveBeenCalled();
  assertPublishedServiceHistory(f.history);
});

it('an accessor callback is rejected without executing its getter or invoking navigation', async () => {
  const f = await loaded(0),
    expected = vi.fn(async () => {}),
    getter = vi.fn(() => expected),
    live = Object.defineProperty({ generation: 0 }, 'current', {
      enumerable: true,
      get: getter,
    });
  await expect(
    continuePublishedServiceReview(
      f.history,
      f.report,
      expected,
      live as never,
    ),
  ).rejects.toThrow('Own primitive review fields required');
  expect(getter).not.toHaveBeenCalled();
  expect(expected).not.toHaveBeenCalled();
  assertPublishedServiceHistory(f.history);
});

it.each(['production', 'remote'] as const)(
  '%s admission is OFF before navigation even for previously retained evidence',
  async (mode) => {
    const f = await loaded(0),
      expected = vi.fn(async () => {});
    if (mode === 'production') vi.stubEnv('DEV', false);
    else
      vi.stubGlobal('window', {
        location: { hostname: 'example.invalid', protocol: 'https:' },
      });
    await expect(
      continuePublishedServiceReview(f.history, f.report, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow('OFF');
    expect(expected).not.toHaveBeenCalled();
  },
);
