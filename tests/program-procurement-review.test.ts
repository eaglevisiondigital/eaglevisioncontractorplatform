import { MAX_ESTIMATE_MINOR } from '../src/domain/estimating/calculation';
import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prototypeFixture } from './program/prototype-fixture';
import { readPrototypeSource } from '../src/lib/program/prototype-source';
import {
  prepareProcurementReview,
  verifyProcurementReview,
  type ProcurementInput,
} from '../src/lib/program/procurement-review';
afterEach(() => vi.restoreAllMocks());
async function fixture(
  company = sampleCompanies[0],
  kind: ProcurementInput['kind'] = 'purchase-review',
) {
  const f = await prototypeFixture(company);
  const catalog = await f.repo.catalog(company.id);
  const item = catalog.find((x) =>
    kind === 'purchase-review'
      ? ['material', 'product'].includes(x.kind)
      : ['labor', 'service'].includes(x.kind),
  )!;
  const payload = structuredClone(f.bundle.version.payload);
  payload.lines[0] = {
    ...payload.lines[0],
    kind: item.kind,
    unit: item.unit,
    catalog_item_id: item.id,
  };
  f.bundle = await f.repo.save(company.id, f.bundle, payload);
  const actor = `${company.id}-estimator`;
  await f.ops.manageMember(company.id, actor, true, 'admin', 'office_manager');
  f.target.actor_id = actor;
  const source = await readPrototypeSource(f.repo, f.target, f.gate);
  return {
    ...f,
    source,
    input: {
      kind,
      selections: [
        {
          line_id: payload.lines[0].id,
          catalog_item_id: item.id,
          quantity_milli: 2500,
          bid_minor: 12345,
        },
      ],
    } as ProcurementInput,
  };
}
it.each(sampleCompanies)(
  '$name prepares immutable existing catalog-bound purchase proposal with no effects',
  async (c) => {
    const f = await fixture(c),
      before = await f.repo.history(c.id, f.target.estimate_id);
    const p = await prepareProcurementReview(f.source, f.input, f.gate);
    expect(p.snapshot.target).toEqual(f.target);
    expect(p.snapshot.selections[0].quantity_basis).toBe('HUMAN_PROPOSAL');
    expect(p.snapshot.selections[0].bid_minor).toBe(12345);
    expect(p.snapshot.supplier_purchase_matching).toBe('UNKNOWN');
    expect(p.snapshot.approval).toBe('BLOCKED');
    expect(Object.values(p.snapshot.authority).every((x) => x === false)).toBe(
      true,
    );
    expect(await verifyProcurementReview(p)).toBe('CURRENT');
    expect(Object.isFrozen(p.snapshot.selections)).toBe(true);
    for (const field of [
      'PRIVATE',
      'internal_notes',
      'unit_cost_minor',
      'unit_price_minor',
      'email',
      'phone',
      'rates',
      'deductions',
    ])
      expect(JSON.stringify(p)).not.toContain(field);
    expect(await f.repo.history(c.id, f.target.estimate_id)).toEqual(before);
    const repeated = await prepareProcurementReview(f.source, f.input, f.gate);
    expect(repeated.id).toBe(p.id);
  },
);
it.each(sampleCompanies)(
  '$name accepts only exact labor scope as subcontractor review',
  async (c) => {
    const f = await fixture(c, 'subcontractor-scope-review');
    const p = await prepareProcurementReview(f.source, f.input, f.gate);
    expect(p.snapshot.kind).toBe('subcontractor-scope-review');
    expect(p.snapshot.selections[0].vendor_identity).toBe('UNVERIFIED');
  },
);
it('default OFF and source clone cannot confer authority', async () => {
  const f = await fixture();
  await expect(prepareProcurementReview(f.source, f.input)).rejects.toThrow(
    'confirmation',
  );
  await expect(
    prepareProcurementReview(structuredClone(f.source), f.input, f.gate),
  ).rejects.toThrow('Unknown');
});
it.each(['line_id', 'catalog_item_id'] as const)(
  'rejects foreign exact %s',
  async (key) => {
    const f = await fixture();
    f.input.selections[0][key] = 'foreign';
    await expect(
      prepareProcurementReview(f.source, f.input, f.gate),
    ).rejects.toThrow('association');
  },
);
it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN])(
  'rejects quantity %s',
  async (quantity) => {
    const f = await fixture();
    f.input.selections[0].quantity_milli = quantity;
    await expect(
      prepareProcurementReview(f.source, f.input, f.gate),
    ).rejects.toThrow('bounded');
  },
);
it('rejects duplicate/accessor/serializer and sparse selection data without executing it', async () => {
  const f = await fixture();
  const getter = vi.fn(() => f.input.selections[0]);
  await expect(
    prepareProcurementReview(
      f.source,
      {
        ...f.input,
        selections: [f.input.selections[0], f.input.selections[0]],
      },
      f.gate,
    ),
  ).rejects.toThrow('unique');
  const sparse = new Array(1);
  await expect(
    prepareProcurementReview(
      f.source,
      { ...f.input, selections: sparse },
      f.gate,
    ),
  ).rejects.toThrow();
  const selected = [f.input.selections[0]];
  Object.defineProperty(selected, '0', { get: getter });
  await expect(
    prepareProcurementReview(
      f.source,
      { ...f.input, selections: selected },
      f.gate,
    ),
  ).rejects.toThrow('Own');
  expect(getter).not.toHaveBeenCalled();
  await expect(
    prepareProcurementReview(
      f.source,
      { ...f.input, toJSON: getter } as ProcurementInput,
      f.gate,
    ),
  ).rejects.toThrow();
});
it('immutable retained evidence becomes stale only after actual saved source drift', async () => {
  const f = await fixture(),
    p = await prepareProcurementReview(f.source, f.input, f.gate),
    old = JSON.stringify(p);
  expect(await verifyProcurementReview({ ...p, sha256: '0'.repeat(64) })).toBe(
    'UNKNOWN',
  );
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    terms: 'Actual source change',
  });
  expect(await verifyProcurementReview(p)).toBe('STALE');
  expect(JSON.stringify(p)).toBe(old);
  await expect(
    prepareProcurementReview(f.source, f.input, f.gate),
  ).rejects.toThrow('Stale');
});
it('withdrawn admission and role revocation deny retained current status', async () => {
  const f = await fixture(),
    p = await prepareProcurementReview(f.source, f.input, f.gate);
  f.gate.confirmed = false;
  expect(await verifyProcurementReview(p)).toBe('UNKNOWN');
  f.gate.confirmed = true;
  await f.ops.manageMember(
    f.company.id,
    f.target.actor_id,
    false,
    'admin',
    'office_manager',
  );
  expect(await verifyProcurementReview(p)).toBe('UNKNOWN');
});
it('actual edit during asynchronous preparation hashing denies output', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let n = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...a) => {
    if (++n === 2)
      await f.repo.save(f.company.id, f.bundle, {
        ...f.bundle.version.payload,
        customer_notes: 'During preparation',
      });
    return digest(...a);
  });
  await expect(
    prepareProcurementReview(f.source, f.input, f.gate),
  ).rejects.toThrow('Stale');
});

it.each([null, 0, MAX_ESTIMATE_MINOR])(
  'accepts explicit bid boundary %s without a new calculation',
  async (bid) => {
    const f = await fixture();
    f.input.selections[0].bid_minor = bid;
    const p = await prepareProcurementReview(f.source, f.input, f.gate);
    expect(p.snapshot.selections[0].bid_minor).toBe(bid);
  },
);
it.each([MAX_ESTIMATE_MINOR + 1, Number.MAX_SAFE_INTEGER, -1, 0.5, NaN])(
  'rejects noncanonical proposed bid %s',
  async (bid) => {
    const f = await fixture();
    f.input.selections[0].bid_minor = bid;
    await expect(
      prepareProcurementReview(f.source, f.input, f.gate),
    ).rejects.toThrow('bounded');
  },
);

it('distinct withdrawn module gate cannot classify source drift as admissible evidence', async () => {
  const f = await fixture(),
    gate = { enabled: true, confirmed: true };
  const p = await prepareProcurementReview(f.source, f.input, gate);
  gate.confirmed = false;
  await f.repo.save(f.company.id, f.bundle, {
    ...f.bundle.version.payload,
    terms: 'Changed source while module confirmation withdrawn',
  });
  expect(await verifyProcurementReview(p)).toBe('UNKNOWN');
});
