import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertAddonReadinessCurrent,
  navigateAddonReadinessJob,
  openAddonReadinessControls,
  readAddonReadinessGuide,
  type AddonReadinessCallback,
} from '../src/lib/workflows/addon-readiness-guide';

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
    input = {
      job_id: entry.target.job_id!,
      kind: 'offline' as const,
      edition: 'property_services' as const,
    };
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-addon-navigation-remaining-owner',
  );
  const task = await readAddonReadinessGuide(sources, input, gate),
    controls = openAddonReadinessControls(task),
    reference = controls.selection.references.find((r) => r.kind === 'report');
  if (!reference) throw Error('Original report reference required');
  return { gate, sources, entry, org, input, task, controls, reference };
}
type Fixture = Awaited<ReturnType<typeof loaded>>;
function revoke(f: Fixture) {
  return f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
}
function capture(
  expected: AddonReadinessCallback,
  onFinal: (live: {
    current: AddonReadinessCallback;
    generation: number;
  }) => void,
) {
  let count = 0;
  const live = new Proxy(
    { current: expected, generation: 0 },
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'current' && ++count === 2) onFinal(target);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  return { live, count: () => count };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: final callback capture revocation withholds the private original job`, async () => {
    const f = await loaded(brand),
      observed: boolean[] = [];
    let revoked: Promise<void> | undefined;
    const expected = vi.fn(() => {
        observed.push(
          f.sources.operations
            .syntheticMemberships(f.org)
            .find((m) => m.user_id === f.entry.target.actor_id)!.active,
        );
      }),
      final = capture(expected, () => {
        revoked = revoke(f);
      });
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, final.live),
    ).rejects.toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(final.count()).toBe(2);
    expect(observed).toEqual([]);
    expect(expected).not.toHaveBeenCalled();
    expect(() => assertAddonReadinessCurrent(f.task)).toThrow('UNKNOWN');
  });

  it(`brand ${brand}: synchronous callback revocation cannot return local success`, async () => {
    const f = await loaded(brand),
      observed: boolean[] = [];
    let revoked: Promise<void> | undefined;
    const expected = vi.fn(() => {
      observed.push(
        f.sources.operations
          .syntheticMemberships(f.org)
          .find((m) => m.user_id === f.entry.target.actor_id)!.active,
      );
      revoked = revoke(f);
    });
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(observed).toEqual([true]);
    expect(expected).toHaveBeenCalledExactlyOnceWith(f.input.job_id);
    expect(() => assertAddonReadinessCurrent(f.task)).toThrow('UNKNOWN');
  });

  it(`brand ${brand}: ordinary current navigation retains original context and permits explicit repeat without business effects`, async () => {
    const f = await loaded(brand),
      before = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      property = f.sources.property.read(f.org),
      financial = f.entry.release.read('staff'),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'save'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.entry.release, 'command'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      expected = vi.fn(),
      live = { current: expected, generation: 0 };
    for (let count = 0; count < 2; count++) {
      await expect(
        navigateAddonReadinessJob(f.task, f.reference, expected, live),
      ).resolves.toBe(f.input.job_id);
      expect(openAddonReadinessControls(f.task)).toBe(f.controls);
    }
    expect(expected).toHaveBeenCalledTimes(2);
    expect(expected).toHaveBeenNthCalledWith(1, f.input.job_id);
    expect(expected).toHaveBeenNthCalledWith(2, f.input.job_id);
    expect(f.task.source).toMatchObject({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.input.job_id,
      issued_version_id: f.entry.target.version_id,
      kind: f.input.kind,
    });
    expect(f.task.edition.human_selected_review_context).toBe(f.input.edition);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(before);
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(f.entry.release.read('staff')).toEqual(financial);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: known final generation withdrawal withholds navigation without consuming the original controls`, async () => {
    const f = await loaded(brand),
      expected = vi.fn(),
      final = capture(expected, (live) => {
        live.generation++;
      });
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, final.live),
    ).rejects.toThrow(/callback/i);
    expect(expected).not.toHaveBeenCalled();
    assertAddonReadinessCurrent(f.task);
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, {
        current: expected,
        generation: 2,
      }),
    ).resolves.toBe(f.input.job_id);
    expect(expected).toHaveBeenCalledTimes(1);
  });

  it(`brand ${brand}: withdrawn confirmation at final capture cannot revive original UNKNOWN controls`, async () => {
    const f = await loaded(brand),
      expected = vi.fn(),
      final = capture(expected, () => {
        f.gate.confirmed = false;
      });
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, final.live),
    ).rejects.toThrow();
    expect(expected).not.toHaveBeenCalled();
    f.gate.confirmed = true;
    expect(() => openAddonReadinessControls(f.task)).toThrow('UNKNOWN');
  });

  it(`brand ${brand}: actual revoked membership cannot restore the observed original view`, async () => {
    const f = await loaded(brand),
      expected = vi.fn();
    await revoke(f);
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow();
    expect(expected).not.toHaveBeenCalled();
    await f.sources.operations.configure(
      f.org,
      'active',
      'synthetic',
      {},
      f.entry.target.actor_id,
    );
    expect(() => openAddonReadinessControls(f.task)).toThrow('UNKNOWN');
  });

  it(`brand ${brand}: literal reference copies preserve exact identity while copied tasks and foreign reports cannot replace it`, async () => {
    const f = await loaded(brand),
      other = await loaded((brand + 1) % 3),
      expected = vi.fn();
    expect(f.org).not.toBe(other.org);
    await expect(
      navigateAddonReadinessJob(f.task, { ...f.reference }, expected, {
        current: expected,
        generation: 0,
      }),
    ).resolves.toBe(f.input.job_id);
    expect(expected).toHaveBeenCalledExactlyOnceWith(f.input.job_id);
    expected.mockClear();
    await expect(
      navigateAddonReadinessJob({ ...f.task }, f.reference, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow('UNKNOWN');
    await expect(
      navigateAddonReadinessJob(f.task, other.reference, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow();
    expect(expected).not.toHaveBeenCalled();
    assertAddonReadinessCurrent(f.task);
  });

  it(`brand ${brand}: canonical estimate revision makes the retained source stale before navigation`, async () => {
    const f = await loaded(brand),
      expected = vi.fn();
    await f.sources.estimates.revise(f.org, f.entry.issued);
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow();
    expect(expected).not.toHaveBeenCalled();
    expect(() => openAddonReadinessControls(f.task)).toThrow('UNKNOWN');
  });
}

it('an accessor live callback is denied without executing its getter or consuming current controls', async () => {
  const f = await loaded(0),
    expected = vi.fn(),
    getter = vi.fn(() => expected),
    live = Object.defineProperty({ generation: 0 }, 'current', {
      enumerable: true,
      get: getter,
    });
  await expect(
    navigateAddonReadinessJob(f.task, f.reference, expected, live as never),
  ).rejects.toThrow('Own primitive review fields required');
  expect(getter).not.toHaveBeenCalled();
  expect(expected).not.toHaveBeenCalled();
  assertAddonReadinessCurrent(f.task);
});

it('a known thrown navigation callback does not invent a permanent one-use claim', async () => {
  const f = await loaded(0),
    failed = vi.fn(() => {
      throw Error('Known local callback error');
    });
  await expect(
    navigateAddonReadinessJob(f.task, f.reference, failed, {
      current: failed,
      generation: 0,
    }),
  ).rejects.toThrow('Known local callback error');
  expect(failed).toHaveBeenCalledTimes(1);
  assertAddonReadinessCurrent(f.task);
  const expected = vi.fn();
  await expect(
    navigateAddonReadinessJob(f.task, f.reference, expected, {
      current: expected,
      generation: 1,
    }),
  ).resolves.toBe(f.input.job_id);
  expect(expected).toHaveBeenCalledTimes(1);
});

it.each(['production', 'remote'] as const)(
  '%s admission cannot invoke navigation from retained local controls',
  async (mode) => {
    const f = await loaded(0),
      expected = vi.fn();
    if (mode === 'production') vi.stubEnv('DEV', false);
    else
      vi.stubGlobal('window', {
        location: { hostname: 'example.invalid', protocol: 'https:' },
      });
    await expect(
      navigateAddonReadinessJob(f.task, f.reference, expected, {
        current: expected,
        generation: 0,
      }),
    ).rejects.toThrow('OFF');
    expect(expected).not.toHaveBeenCalled();
  },
);
