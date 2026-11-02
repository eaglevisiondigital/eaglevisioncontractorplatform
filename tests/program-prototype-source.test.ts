import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
} from '../src/lib/program/prototype-source';
import { prototypeFixture } from './program/prototype-fixture';
afterEach(() => vi.restoreAllMocks());
it.each(sampleCompanies)(
  '$name reads exact existing scope/catalog/job with canonical math and no mutation/private detail',
  async (company) => {
    const f = await prototypeFixture(company, true);
    const before = {
      jobs: await f.repo.jobs(company.id),
      history: await f.repo.history(company.id, f.target.estimate_id),
    };
    const s = await readPrototypeSource(f.repo, f.target, f.gate);
    expect(s.snapshot.target).toEqual(f.target);
    expect(s.snapshot.job?.id).toBe(f.target.job_id);
    expect(s.snapshot.estimate.total_minor).toBe(
      f.bundle.version.calculation.total_minor,
    );
    expect(s.snapshot.catalog.every((c) => typeof c.id === 'string')).toBe(
      true,
    );
    expect(s.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(s.snapshot.estimate.lines)).toBe(true);
    const text = JSON.stringify(s);
    for (const field of [
      'PRIVATE',
      'internal_notes',
      'internal_note',
      'unit_cost_minor',
      'email',
      'phone',
      'rates',
      'deductions',
    ])
      expect(text).not.toContain(field);
    expect(
      Object.values(s.snapshot.authority).filter((v) => v !== 'UNVERIFIED'),
    ).not.toContain(true);
    await expect(assertPrototypeSourceCurrent(s)).resolves.toBeUndefined();
    expect({
      jobs: await f.repo.jobs(company.id),
      history: await f.repo.history(company.id, f.target.estimate_id),
    }).toEqual(before);
  },
);
it('default OFF rejects before source reads or connected access', async () => {
  const f = await prototypeFixture();
  const get = vi.spyOn(f.repo, 'get');
  await expect(readPrototypeSource(f.repo, f.target)).rejects.toThrow(
    'enabled',
  );
  expect(get).not.toHaveBeenCalled();
  const connected = new Phase3Repository(new Operations(false));
  await expect(
    readPrototypeSource(connected, f.target, f.gate),
  ).rejects.toThrow('synthetic');
});
it.each([
  'actor_id',
  'customer_id',
  'location_id',
  'organization_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const)('rejects foreign/missing exact %s', async (field) => {
  const f = await prototypeFixture();
  await expect(
    readPrototypeSource(
      f.repo,
      { ...f.target, [field]: crypto.randomUUID() },
      f.gate,
    ),
  ).rejects.toThrow();
});
it('rejects getter/serializer/symbol review input without executing it', async () => {
  const f = await prototypeFixture();
  const getter = vi.fn(() => true);
  await expect(
    readPrototypeSource(f.repo, f.target, {
      get enabled() {
        return getter();
      },
      confirmed: true,
    }),
  ).rejects.toThrow('primitive');
  expect(getter).not.toHaveBeenCalled();
  await expect(
    readPrototypeSource(
      f.repo,
      { ...f.target, toJSON: getter } as typeof f.target,
      f.gate,
    ),
  ).rejects.toThrow();
  await expect(
    readPrototypeSource(f.repo, { ...f.target, [Symbol('x')]: 1 }, f.gate),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('denies current estimator/field access and revoked administrative review', async () => {
  const f = await prototypeFixture();
  const user = `${f.company.id}-estimator`;
  await expect(
    readPrototypeSource(f.repo, { ...f.target, actor_id: user }, f.gate),
  ).rejects.toThrow('owner/admin');
  await f.ops.manageMember(f.company.id, user, true, 'admin', 'office_manager');
  const s = await readPrototypeSource(
    f.repo,
    { ...f.target, actor_id: user },
    f.gate,
  );
  await f.ops.manageMember(
    f.company.id,
    user,
    false,
    'admin',
    'office_manager',
  );
  await expect(assertPrototypeSourceCurrent(s)).rejects.toThrow('owner/admin');
});
it('retained source denies an edited draft without replacement', async () => {
  const f = await prototypeFixture();
  const s = await readPrototypeSource(f.repo, f.target, f.gate);
  const old = JSON.stringify(s);
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    customer_notes: 'Changed exact draft',
  });
  await expect(assertPrototypeSourceCurrent(s)).rejects.toThrow('Stale');
  expect(JSON.stringify(s)).toBe(old);
});
it('withdrawal during public hashing denies output', async () => {
  const f = await prototypeFixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    f.gate.confirmed = false;
    return digest(...args);
  });
  await expect(readPrototypeSource(f.repo, f.target, f.gate)).rejects.toThrow(
    'confirmed',
  );
});
it.each(['capture', 'reconciliation'])(
  'real save during %s hashing denies stale output',
  async (phase) => {
    const f = await prototypeFixture();
    const source =
      phase === 'reconciliation'
        ? await readPrototypeSource(f.repo, f.target, f.gate)
        : null;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (!changed) {
        changed = true;
        await f.repo.save(f.company.id, f.bundle, {
          ...f.bundle.version.payload,
          terms: 'Changed during public hashing',
        });
      }
      return digest(...args);
    });
    await expect(
      source
        ? assertPrototypeSourceCurrent(source)
        : readPrototypeSource(f.repo, f.target, f.gate),
    ).rejects.toThrow(phase === 'capture' ? 'changed' : 'Stale');
    expect(changed).toBe(true);
  },
);
it('synchronous authoritative capture excludes asynchronous read seams', async () => {
  const f = await prototypeFixture();
  const spies = [
    vi.spyOn(f.repo, 'get'),
    vi.spyOn(f.repo, 'catalog'),
    vi.spyOn(f.repo, 'jobs'),
    vi.spyOn(f.repo, 'workforce'),
  ];
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  await assertPrototypeSourceCurrent(source);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
});
it('direct atomic method rejects malformed input without evaluating accessors', async () => {
  const f = await prototypeFixture();
  const getter = vi.fn(() => f.company.id);
  const input = { ...f.target };
  Object.defineProperty(input, 'organization_id', { get: getter });
  expect(() => f.repo.readSyntheticPrototypeSources(input)).toThrow(
    'primitive',
  );
  expect(getter).not.toHaveBeenCalled();
  for (const invalid of [
    { ...f.target, job_id: undefined },
    { ...f.target, actor_id: '' },
    { ...f.target, organization_id: 'x'.repeat(201) },
    { ...f.target, [Symbol('x')]: 1 },
    { ...f.target, toJSON: getter },
  ])
    expect(() =>
      f.repo.readSyntheticPrototypeSources(invalid as typeof f.target),
    ).toThrow();
  expect(() =>
    new Phase3Repository(new Operations(false)).readSyntheticPrototypeSources(
      f.target,
    ),
  ).toThrow('synthetic');
  expect(() =>
    f.repo.readSyntheticPrototypeSources({
      ...f.target,
      customer_id: 'foreign',
    }),
  ).toThrow();
});
it('a cloned/imported snapshot cannot confer source or access authority', async () => {
  const f = await prototypeFixture();
  const s = await readPrototypeSource(f.repo, f.target, f.gate);
  await expect(
    assertPrototypeSourceCurrent(structuredClone(s)),
  ).rejects.toThrow('Unknown');
  f.gate.enabled = false;
  await expect(assertPrototypeSourceCurrent(s)).rejects.toThrow('enabled');
});
it('an exact existing job from another source is rejected even within the same company', async () => {
  const f = await prototypeFixture();
  const other = (await f.repo.jobs(f.company.id))[0];
  await expect(
    readPrototypeSource(f.repo, { ...f.target, job_id: other.id }, f.gate),
  ).rejects.toThrow('association');
});

it('consumer final synchronous checkpoint denies real source drift after awaited verification', async () => {
  const f = await prototypeFixture();
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  await assertPrototypeSourceCurrent(source);
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    terms: 'Changed before consumer output',
  });
  expect(() => assertPrototypeSourceCurrentNow(source)).toThrow('Stale');
  expect(() =>
    assertPrototypeSourceCurrentNow(structuredClone(source)),
  ).toThrow('Unknown');
});
