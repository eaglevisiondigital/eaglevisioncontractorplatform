import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { readOperatingSelection } from '../src/lib/workflows/operating-selection';
import {
  readDailyWorkContext,
  assertDailyWorkContextNow,
  continueDailyWorkContext,
  reconcileDailyWorkContext,
  readNextDailyWorkContext,
} from '../src/lib/workflows/daily-workbench-runtime';
const gate = () => ({ enabled: true, confirmed: true });
afterEach(() => vi.restoreAllMocks());
async function fixture(brand = 0) {
  const g = gate();
  const s = await prepareOperatingSources(sampleCompanies[brand], g);
  const v = await readDailyWorkContext(s, s.entries[0].target.job_id!, g);
  return { s, v, g };
}
for (const brand of [0, 1, 2]) {
  it(`brand${brand}: exact selected context progresses across local review steps with no business effects`, async () => {
    const { s, v } = await fixture(brand),
      before = JSON.stringify(s.property.read(s.company.id)),
      writers = [
        vi.spyOn(s.estimates, 'create'),
        vi.spyOn(s.estimates, 'issue'),
        vi.spyOn(s.estimates, 'approveJob'),
        vi.spyOn(s.property, 'publish'),
        ...s.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      ids = vi.spyOn(crypto, 'randomUUID');
    expect(v.organization_id).toBe(s.company.id);
    expect(v.issued_version_id).toBe(s.entries[0].target.version_id);
    expect(v.customer_id).toBe(s.entries[0].target.customer_id);
    expect(v.location_id).toBe(s.entries[0].target.location_id);
    expect(Object.isFrozen(v)).toBe(true);
    const called = vi.fn();
    for (const step of [
      'field',
      'finance',
      'invoice',
      'customer',
      'maintenance',
      'advanced',
    ] as const)
      expect((await continueDailyWorkContext(v, step, called)).status).toBe(
        'CURRENT_REVIEW_ONLY',
      );
    expect(called).toHaveBeenCalledTimes(6);
    expect(v.operational_ready).toBe(false);
    expect(JSON.stringify(s.property.read(s.company.id))).toBe(before);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
    expect(Object.keys(v).sort()).toEqual(
      [
        'mode',
        'organization_id',
        'customer_id',
        'location_id',
        'job_id',
        'issued_version_id',
        'issued_version_number',
        'customer_label',
        'property_label',
        'job_label',
        'source_sha256',
        'coverage',
        'meaning',
        'operational_ready',
      ].sort(),
    );
  });
  it(`brand${brand}: next job uses exact existing sorted source identity and no inferred complete history`, async () => {
    const { s, g } = await fixture(brand),
      list = await readOperatingSelection(
        s,
        { query: '', page: 0, page_size: 10 },
        g,
      ),
      first = await readDailyWorkContext(s, list.rows[0].job_id, g),
      next = await readNextDailyWorkContext(first);
    expect(next!.job_id).toBe(list.rows[1].job_id);
    expect(next!.organization_id).toBe(s.company.id);
    expect(next!.customer_id).toBe(list.rows[1].customer_id);
    expect(next!.location_id).toBe(list.rows[1].location_id);
    const last = await readDailyWorkContext(s, list.rows.at(-1)!.job_id, g);
    expect(await readNextDailyWorkContext(last)).toBeNull();
  });
  it(`brand${brand}: callback loss is UNKNOWN across new wrappers and source revisions`, async () => {
    const { s, g, v } = await fixture(brand);
    const historical = JSON.stringify(v),
      called = vi.fn(async () => {
        throw Error('lost local ACK');
      });
    expect((await continueDailyWorkContext(v, 'invoice', called)).status).toBe(
      'UNKNOWN',
    );
    const fresh = await readDailyWorkContext({ ...s }, v.job_id, g),
      replay = vi.fn();
    expect(
      (await continueDailyWorkContext(fresh, 'invoice', replay)).status,
    ).toBe('UNKNOWN');
    expect((await reconcileDailyWorkContext(v)).status).toBe('UNKNOWN');
    expect(replay).not.toHaveBeenCalled();
    expect(called).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(v)).toBe(historical);
  });
}
it('observed revoked membership remains terminal after restoration', async () => {
  const { s, v } = await fixture();
  const original = s.operations.syntheticMemberships.bind(s.operations);
  const role = vi
    .spyOn(s.operations, 'syntheticMemberships')
    .mockImplementation((org) =>
      original(org).map((m) => ({ ...m, active: false })),
    );
  expect(() => assertDailyWorkContextNow(v)).toThrow();
  role.mockRestore();
  expect(() => assertDailyWorkContextNow(v)).toThrow();
  expect((await reconcileDailyWorkContext(v)).status).toBe('UNKNOWN');
});
it('same-company wrong property is denied and cannot restore the retained source', async () => {
  const { s, v } = await fixture(1),
    target = s.entries[0].target as { location_id: string },
    old = target.location_id;
  target.location_id = s.entries[1].target.location_id;
  expect(() => assertDailyWorkContextNow(v)).toThrow();
  target.location_id = old;
  expect(() => assertDailyWorkContextNow(v)).toThrow();
});
it('foreign approved company substitution cannot expose the old selected context', async () => {
  const { s, v } = await fixture(2),
    old = s.company;
  s.company = sampleCompanies[0];
  expect(() => assertDailyWorkContextNow(v)).toThrow();
  s.company = old;
  expect(() => assertDailyWorkContextNow(v)).toThrow();
});
it('competing continuations call the host once while the first is pending', async () => {
  const { v } = await fixture();
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const called = vi.fn(() => wait),
    one = continueDailyWorkContext(v, 'finance', called);
  expect((await continueDailyWorkContext(v, 'customer', vi.fn())).status).toBe(
    'PENDING',
  );
  release();
  expect((await one).status).toBe('CURRENT_REVIEW_ONLY');
  expect(called).toHaveBeenCalledTimes(1);
});
it('invoked async callback source withdrawal and restoration is terminal UNKNOWN', async () => {
  const { s, v, g } = await fixture();
  const called = vi.fn(async () => {
    g.confirmed = false;
    await Promise.resolve();
  });
  expect((await continueDailyWorkContext(v, 'field', called)).status).toBe(
    'UNKNOWN',
  );
  g.confirmed = true;
  const fresh = await readDailyWorkContext({ ...s }, v.job_id, g),
    next = vi.fn();
  expect((await continueDailyWorkContext(fresh, 'field', next)).status).toBe(
    'UNKNOWN',
  );
  expect(next).not.toHaveBeenCalled();
});
it('post-invocation callback replacement is UNKNOWN even after it resolves', async () => {
  const { v } = await fixture();
  const replaced = vi.fn();
  let live: unknown;
  const callback = vi.fn(async () => {
    live = replaced;
    await Promise.resolve();
  });
  live = callback;
  expect(
    (await continueDailyWorkContext(v, 'customer', callback, () => live))
      .status,
  ).toBe('UNKNOWN');
  expect(replaced).not.toHaveBeenCalled();
});
it('known withdrawal before callback invocation remains no dispatch and current read only', async () => {
  const { v } = await fixture();
  const callback = vi.fn();
  let live: unknown = undefined;
  expect(
    (await continueDailyWorkContext(v, 'customer', callback, () => live))
      .status,
  ).toBe('WITHHELD_NO_DISPATCH');
  expect(callback).not.toHaveBeenCalled();
  expect((await reconcileDailyWorkContext(v)).status).toBe(
    'CURRENT_REVIEW_ONLY',
  );
  live = callback;
  expect(
    (await continueDailyWorkContext(v, 'customer', callback, () => live))
      .status,
  ).toBe('CURRENT_REVIEW_ONLY');
  expect(callback).toHaveBeenCalledTimes(1);
});
it('default OFF precedes untrusted source and selector getters', async () => {
  const getter = vi.fn(() => {
    throw Error('private getter');
  });
  const s = Object.defineProperty({}, 'company', {
    get: getter,
  }) as OperatingSources;
  await expect(readDailyWorkContext(s, 'x')).rejects.toThrow('Explicit local');
  expect(getter).not.toHaveBeenCalled();
});
it('copied context, missing job and unknown navigation never acquire authority', async () => {
  const { s, v, g } = await fixture();
  expect(() =>
    assertDailyWorkContextNow(JSON.parse(JSON.stringify(v))),
  ).toThrow();
  await expect(readDailyWorkContext(s, 'missing', g)).rejects.toThrow();
  const called = vi.fn();
  expect(
    (await continueDailyWorkContext(v, 'invalid' as 'field', called)).status,
  ).toBe('UNKNOWN');
  expect(called).not.toHaveBeenCalled();
});
