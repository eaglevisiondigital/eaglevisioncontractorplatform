import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import {
  prepareTradeEdition,
  inspectTradeEdition,
  tradeEditions,
} from '../src/lib/program/trade-editions';
import { prototypeFixture } from './program/prototype-fixture';
afterEach(() => vi.restoreAllMocks());
async function setup(company = sampleCompanies[0]) {
  const f = await prototypeFixture(company);
  return {
    ...f,
    source: await readPrototypeSource(f.repo, f.target, f.gate),
    reviewGate: { enabled: true, confirmed: true },
  };
}
it.each(sampleCompanies)(
  '$name reuses existing lines/catalog/identity without changing company or financial truth',
  async (company) => {
    const f = await setup(company);
    const before = await f.repo.history(company.id, f.target.estimate_id);
    const originalCompany = structuredClone(company);
    const item = f.source.snapshot.catalog[0];
    const p = await prepareTradeEdition(
      f.source,
      { edition: 'commercial', catalog_item_ids: [item.id] },
      f.reviewGate,
    );
    expect(p.snapshot.target).toEqual(f.target);
    expect(p.snapshot.scope.map((line) => line.id)).toEqual(
      f.bundle.version.payload.lines.map((line) => line.id),
    );
    expect(p.snapshot.catalog_draft_fields[0]).toEqual({
      catalog_item_id: item.id,
      kind: item.kind,
      description: item.description,
      unit: item.unit,
      quantity: 'REQUIRES_EXPLICIT_MEASUREMENT',
      price: 'NOT_PROJECTED',
    });
    expect(
      p.snapshot.checklist.every(
        (section) =>
          section.status === 'NOT_REVIEWED' && section.source_line_ids.length,
      ),
    ).toBe(true);
    expect(Object.values(p.snapshot.authority)).not.toContain(true);
    expect(p.snapshot.licensing).toBe('UNVERIFIED');
    expect(p.snapshot.physical_completion).toBe('UNVERIFIED');
    expect(p.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(p.snapshot.catalog_draft_fields)).toBe(true);
    for (const field of [
      'PRIVATE',
      'unit_cost',
      'unit_price',
      'internal_note',
      'rates',
      'phone',
      'email',
    ])
      expect(JSON.stringify(p)).not.toContain(field);
    await expect(inspectTradeEdition(p)).resolves.toEqual({
      status: 'CURRENT',
      replacement: null,
    });
    expect(await f.repo.history(company.id, f.target.estimate_id)).toEqual(
      before,
    );
    expect(company).toEqual(originalCompany);
  },
);
it.each(tradeEditions)(
  '%s produces distinct useful manual review questions on actual source',
  async (edition) => {
    const f = await setup();
    const p = await prepareTradeEdition(
      f.source,
      { edition, catalog_item_ids: [] },
      f.reviewGate,
    );
    expect(p.snapshot.edition).toBe(edition);
    expect(p.snapshot.checklist).toHaveLength(2);
    expect(p.snapshot.checklist[0].prompt.length).toBeGreaterThan(20);
    expect(p.snapshot.catalog_draft_fields).toEqual([]);
  },
);
it('default OFF/unconfirmed leaves no prepared candidate', async () => {
  const f = await setup();
  const input = { edition: 'roofing' as const, catalog_item_ids: [] };
  await expect(prepareTradeEdition(f.source, input)).rejects.toThrow('enabled');
  await expect(
    prepareTradeEdition(f.source, input, { enabled: true }),
  ).rejects.toThrow('confirmed');
});
it.each(['other', '', 'toString'])(
  'unknown edition %s rejected without company mutation',
  async (edition) => {
    const f = await setup();
    await expect(
      prepareTradeEdition(
        f.source,
        { edition, catalog_item_ids: [] } as never,
        f.reviewGate,
      ),
    ).rejects.toThrow('Known');
  },
);
it('foreign and duplicate catalog IDs cannot become draft fields', async () => {
  const f = await setup();
  const item = f.source.snapshot.catalog[0];
  await expect(
    prepareTradeEdition(
      f.source,
      { edition: 'hvac', catalog_item_ids: ['foreign'] },
      f.reviewGate,
    ),
  ).rejects.toThrow('catalog');
  await expect(
    prepareTradeEdition(
      f.source,
      { edition: 'hvac', catalog_item_ids: [item.id, item.id] },
      f.reviewGate,
    ),
  ).rejects.toThrow('Duplicate');
});
it('accessor/sparse/extra catalog input rejects without executing', async () => {
  const f = await setup();
  const getter = vi.fn(() => f.source.snapshot.catalog[0].id);
  const ids: string[] = [];
  Object.defineProperty(ids, '0', { get: getter, enumerable: true });
  await expect(
    prepareTradeEdition(
      f.source,
      { edition: 'plumbing', catalog_item_ids: ids },
      f.reviewGate,
    ),
  ).rejects.toThrow('primitive');
  expect(getter).not.toHaveBeenCalled();
  await expect(
    prepareTradeEdition(
      f.source,
      { edition: 'plumbing', catalog_item_ids: Array(1) },
      f.reviewGate,
    ),
  ).rejects.toThrow();
});
it('cloned/foreign sources and revoked staff remain denied', async () => {
  const f = await setup();
  await expect(
    prepareTradeEdition(
      structuredClone(f.source),
      { edition: 'electrical', catalog_item_ids: [] },
      f.reviewGate,
    ),
  ).rejects.toThrow('Unknown');
  await expect(
    readPrototypeSource(
      f.repo,
      { ...f.target, organization_id: sampleCompanies[1].id },
      f.gate,
    ),
  ).rejects.toThrow();
  const actor = `${f.company.id}-estimator`;
  await f.ops.manageMember(
    f.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  const adminSource = await readPrototypeSource(
    f.repo,
    { ...f.target, actor_id: actor },
    f.gate,
  );
  await f.ops.manageMember(
    f.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  await expect(
    prepareTradeEdition(
      adminSource,
      { edition: 'electrical', catalog_item_ids: [] },
      f.reviewGate,
    ),
  ).rejects.toThrow();
});
it('concurrent and recaptured same-version preparation cannot replay', async () => {
  const f = await setup();
  const input = { edition: 'roofing' as const, catalog_item_ids: [] };
  const outcomes = await Promise.allSettled([
    prepareTradeEdition(f.source, input, f.reviewGate),
    prepareTradeEdition(f.source, input, f.reviewGate),
  ]);
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  const fresh = await readPrototypeSource(f.repo, f.target, f.gate);
  await expect(prepareTradeEdition(fresh, input, f.reviewGate)).rejects.toThrow(
    'no replay',
  );
});
it('edit preserves old hash and invalidates packet; withdrawal blocks exact read', async () => {
  const f = await setup();
  const p = await prepareTradeEdition(
    f.source,
    { edition: 'remodeling', catalog_item_ids: [] },
    f.reviewGate,
  );
  const old = JSON.stringify(p);
  f.reviewGate.confirmed = false;
  await expect(inspectTradeEdition(p)).rejects.toThrow('confirmed');
  f.reviewGate.confirmed = true;
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    customer_notes: 'Changed',
  });
  await expect(inspectTradeEdition(p)).rejects.toThrow('Stale');
  expect(JSON.stringify(p)).toBe(old);
});
it('source edit during candidate hashing denies output and retains UNKNOWN hold', async () => {
  const f = await setup();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    if (++calls === 2)
      await f.repo.save(f.company.id, f.bundle, {
        ...f.bundle.version.payload,
        terms: 'Changed',
      });
    return digest(...args);
  });
  await expect(
    prepareTradeEdition(
      f.source,
      { edition: 'roofing', catalog_item_ids: [] },
      f.reviewGate,
    ),
  ).rejects.toThrow('Stale');
});

it('a real save after awaited source validation is denied by final synchronous consumer checkpoint', async () => {
  const f = await setup();
  const boundary = await import('../src/lib/program/prototype-source');
  const original = boundary.assertPrototypeSourceCurrent;
  let calls = 0;
  vi.spyOn(boundary, 'assertPrototypeSourceCurrent').mockImplementation(
    async (source) => {
      await original(source);
      if (++calls === 2)
        await f.repo.save(f.company.id, f.bundle, {
          ...f.bundle.version.payload,
          terms: 'Changed after awaited validator',
        });
    },
  );
  await expect(
    prepareTradeEdition(
      f.source,
      { edition: 'roofing', catalog_item_ids: [] },
      f.reviewGate,
    ),
  ).rejects.toThrow('Stale');
});
