import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prototypeFixture } from './program/prototype-fixture';
import {
  readPrototypeSource,
  type PrototypeAdmission,
} from '../src/lib/program/prototype-source';
import {
  prepareTradeEdition,
  inspectTradeEdition,
} from '../src/lib/program/trade-editions';

afterEach(() => vi.restoreAllMocks());
const observations: unknown[] = [];
afterAll(() => {
  mkdirSync('test-results/v1-trade-final-authority', { recursive: true });
  writeFileSync(
    'test-results/v1-trade-final-authority/observations.json',
    JSON.stringify(observations, null, 2) + '\n',
  );
});

async function fixture(brand: number) {
  const f = await prototypeFixture(sampleCompanies[brand], true),
    actor = `${f.company.id}-estimator`;
  await f.ops.manageMember(
    f.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  const target = { ...f.target, actor_id: actor },
    source = await readPrototypeSource(f.repo, target, f.gate),
    input = {
      edition: 'commercial' as const,
      catalog_item_ids: [source.snapshot.catalog[0].id],
    };
  return { ...f, actor, target, source, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function finalGate(onFinal: () => void, at: number) {
  const state = { captures: 0, at };
  const gate = new Proxy<PrototypeAdmission>(
    { enabled: true, confirmed: true },
    {
      getOwnPropertyDescriptor(target, field) {
        if (field === 'confirmed' && ++state.captures === state.at) onFinal();
        return Reflect.getOwnPropertyDescriptor(target, field);
      },
    },
  );
  return { gate, state };
}
function memberActive(f: Fixture) {
  return f.ops
    .syntheticMemberships(f.company.id)
    .find((m) => m.user_id === f.actor)!.active;
}
function observation(
  brand: number,
  phase: string,
  result: PromiseSettledResult<unknown>,
  nativeActive: boolean,
) {
  observations.push({
    brand,
    phase,
    native_member_active: nativeActive,
    outcome: result.status,
    ...(result.status === 'fulfilled'
      ? { returned: result.value }
      : {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        }),
  });
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: final direct trade preparation gate cannot return a packet after actual native admin revocation`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const g = finalGate(() => {
      revoked = f.ops.manageMember(
        f.company.id,
        f.actor,
        false,
        'admin',
        'office_manager',
      );
    }, 4);
    const [result] = await Promise.allSettled([
      prepareTradeEdition(f.source, f.input, g.gate),
    ]);
    expect(g.state.captures).toBe(4);
    expect(revoked).toBeDefined();
    await revoked;
    const active = memberActive(f);
    observation(brand, 'prepare', result, active);
    expect(active).toBe(false);
    expect(result.status).toBe('rejected');
    await f.ops.manageMember(
      f.company.id,
      f.actor,
      true,
      'admin',
      'office_manager',
    );
    const fresh = await readPrototypeSource(f.repo, f.target, f.gate);
    await expect(
      prepareTradeEdition(fresh, f.input, { enabled: true, confirmed: true }),
    ).rejects.toThrow('no replay');
  });

  it(`brand ${brand}: final direct trade inspection gate cannot report CURRENT after actual native admin revocation`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const g = finalGate(() => {
      revoked = f.ops.manageMember(
        f.company.id,
        f.actor,
        false,
        'admin',
        'office_manager',
      );
    }, Infinity);
    const review = await prepareTradeEdition(f.source, f.input, g.gate),
      original = JSON.stringify(review);
    g.state.captures = 0;
    g.state.at = 3;
    const [result] = await Promise.allSettled([inspectTradeEdition(review)]);
    expect(g.state.captures).toBe(3);
    expect(revoked).toBeDefined();
    await revoked;
    const active = memberActive(f);
    observation(brand, 'inspect', result, active);
    expect(active).toBe(false);
    expect(JSON.stringify(review)).toBe(original);
    expect(result.status).toBe('rejected');
  });

  it(`brand ${brand}: unchanged ordinary trade review retains exact issued job and catalog evidence without a business writer`, async () => {
    const f = await fixture(brand),
      gate = { enabled: true, confirmed: true },
      native = f.repo.readSyntheticPrototypeSources(f.target),
      history = await f.repo.history(f.company.id, f.target.estimate_id),
      writers = [
        vi.spyOn(f.repo, 'save'),
        vi.spyOn(f.repo, 'saveCatalog'),
        vi.spyOn(f.repo, 'issue'),
        vi.spyOn(f.repo, 'approveJob'),
        vi.spyOn(f.repo, 'assignJob'),
        vi.spyOn(f.repo, 'recordTime'),
        vi.spyOn(f.ops, 'recordConsent'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      review = await prepareTradeEdition(f.source, f.input, gate);
    expect(review.snapshot.target).toEqual(f.target);
    expect(review.snapshot.source_sha256).toBe(f.source.sha256);
    expect(review.snapshot.scope.map((line) => line.id)).toEqual(
      f.source.snapshot.estimate.lines.map((line) => line.id),
    );
    expect(review.snapshot.catalog_draft_fields[0].catalog_item_id).toBe(
      f.input.catalog_item_ids[0],
    );
    expect(review.snapshot.physical_completion).toBe('UNVERIFIED');
    expect(review.snapshot.licensing).toBe('UNVERIFIED');
    expect(review.snapshot.code_compliance).toBe('UNVERIFIED');
    expect(Object.values(review.snapshot.authority).every((v) => !v)).toBe(
      true,
    );
    expect(Object.isFrozen(review.snapshot.scope)).toBe(true);
    const original = JSON.stringify(review);
    expect(await inspectTradeEdition(review)).toEqual({
      status: 'CURRENT',
      replacement: null,
    });
    gate.confirmed = false;
    await expect(inspectTradeEdition(review)).rejects.toThrow('confirmed');
    expect(JSON.stringify(review)).toBe(original);
    expect(f.repo.readSyntheticPrototypeSources(f.target)).toEqual(native);
    expect(await f.repo.history(f.company.id, f.target.estimate_id)).toEqual(
      history,
    );
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: an actual catalog save during review hashing withholds stale output and preserves the original one-use hold`, async () => {
    const f = await fixture(brand),
      originalDigest = crypto.subtle.digest.bind(crypto.subtle),
      catalog = await f.repo.catalog(f.company.id),
      { id, organization_id, ...item } = catalog.find(
        (row) => row.id === f.input.catalog_item_ids[0],
      )!;
    expect(organization_id).toBe(f.company.id);
    let hashes = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (++hashes === 2)
        await f.repo.saveCatalog(
          f.company.id,
          { ...item, description: item.description + ' exact saved revision' },
          id,
        );
      return originalDigest(...args);
    });
    await expect(
      prepareTradeEdition(f.source, f.input, {
        enabled: true,
        confirmed: true,
      }),
    ).rejects.toThrow('Stale');
    vi.restoreAllMocks();
    expect(
      (await f.repo.catalog(f.company.id)).find((row) => row.id === id),
    ).toMatchObject({
      description: item.description + ' exact saved revision',
    });
    const fresh = await readPrototypeSource(f.repo, f.target, f.gate);
    await expect(
      prepareTradeEdition(fresh, f.input, {
        enabled: true,
        confirmed: true,
      }),
    ).rejects.toThrow('no replay');
  });
}

it('OFF and unconfirmed admission reject before capturing original source or selection data', async () => {
  const f = await fixture(0),
    capture = vi.fn(),
    input = new Proxy(f.input, {
      getOwnPropertyDescriptor(target, key) {
        capture();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    }),
    nativeRead = vi.spyOn(f.repo, 'readSyntheticPrototypeSources');
  await expect(prepareTradeEdition(f.source, input)).rejects.toThrow(
    'confirmed',
  );
  await expect(
    prepareTradeEdition(f.source, input, {
      enabled: true,
      confirmed: false,
    }),
  ).rejects.toThrow('confirmed');
  expect(capture).not.toHaveBeenCalled();
  expect(nativeRead).not.toHaveBeenCalled();
});

it('a source clone has no native authority and cannot consume the original target hold', async () => {
  const f = await fixture(0),
    gate = { enabled: true, confirmed: true };
  await expect(
    prepareTradeEdition(structuredClone(f.source), f.input, gate),
  ).rejects.toThrow('Unknown');
  expect(
    await inspectTradeEdition(
      await prepareTradeEdition(f.source, f.input, gate),
    ),
  ).toEqual({ status: 'CURRENT', replacement: null });
});

it('a genuine other-company catalog identity cannot be grafted into the original issued job', async () => {
  const f = await fixture(0),
    other = await fixture(1),
    gate = { enabled: true, confirmed: true },
    foreignId = other.source.snapshot.catalog[0].id;
  expect(f.source.snapshot.catalog.some((item) => item.id === foreignId)).toBe(
    false,
  );
  await expect(
    prepareTradeEdition(
      f.source,
      { ...f.input, catalog_item_ids: [foreignId] },
      gate,
    ),
  ).rejects.toThrow('catalog');
  const review = await prepareTradeEdition(f.source, f.input, gate);
  expect(review.snapshot.target).toEqual(f.target);
  expect(review.snapshot.catalog_draft_fields[0].catalog_item_id).toBe(
    f.input.catalog_item_ids[0],
  );
});

it('confirmation and catalog accessors are rejected without executing their getters or claiming a target', async () => {
  const f = await fixture(0),
    getter = vi.fn(() => true),
    gate = { enabled: true, confirmed: true };
  Object.defineProperty(gate, 'confirmed', { get: getter, enumerable: true });
  await expect(prepareTradeEdition(f.source, f.input, gate)).rejects.toThrow(
    'Own',
  );
  expect(getter).not.toHaveBeenCalled();
  const ids: string[] = [];
  Object.defineProperty(ids, '0', { get: getter, enumerable: true });
  await expect(
    prepareTradeEdition(
      f.source,
      { ...f.input, catalog_item_ids: ids },
      { enabled: true, confirmed: true },
    ),
  ).rejects.toThrow('primitive');
  expect(getter).not.toHaveBeenCalled();
  await expect(
    prepareTradeEdition(f.source, f.input, {
      enabled: true,
      confirmed: true,
    }),
  ).resolves.toMatchObject({ snapshot: { target: f.target } });
});
