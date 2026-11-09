import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prototypeFixture } from '../program/prototype-fixture';
import { catalogDraftBatch } from '../../src/components/phase3/catalog-draft-batch';
import { customerPreview } from '../../src/domain/estimating/customer-preview';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const f = await prototypeFixture(sampleCompanies[index]);
  const catalog = await f.repo.catalog(f.company.id);
  const form = structuredClone(f.bundle.version.payload);
  form.internal_notes = 'Retain unfinished private notes';
  const rows = catalog
    .slice(0, 2)
    .map((item, i) => ({ id: item.id, quantity: i ? '3' : '2.125' }));
  return {
    ...f,
    catalog,
    form,
    rows,
    prepare: () =>
      catalogDraftBatch(
        f.repo,
        f.company.id,
        f.bundle,
        catalog,
        rows,
        () => form,
      ),
  };
}
it.each([0, 1, 2])(
  'brand %i: prepares and saves multiple catalog quantities through the original draft writer',
  async (index) => {
    const f = await fixture(index);
    const before = structuredClone(f.form);
    const payload = f.prepare();
    expect(f.form).toEqual(before);
    expect(
      (await f.repo.get(f.company.id, f.bundle.estimate.id)).version,
    ).toEqual(f.bundle.version);
    expect(payload.lines.slice(0, before.lines.length)).toEqual(before.lines);
    expect(new Set(payload.lines.map((l) => l.id)).size).toBe(
      payload.lines.length,
    );
    const added = payload.lines.slice(before.lines.length);
    expect(added.map((l) => l.quantity_milli)).toEqual([2125, 3000]);
    added.forEach((line, i) =>
      expect(line).toMatchObject({
        catalog_item_id: f.catalog[i].id,
        unit: f.catalog[i].unit,
        unit_cost_minor: f.catalog[i].unit_cost_minor,
        unit_price_minor: f.catalog[i].unit_price_minor,
        markup_bps: f.catalog[i].markup_bps,
        import_approval_id: null,
      }),
    );
    const saved = await f.repo.save(f.company.id, f.bundle, payload);
    const reopened = await f.repo.get(f.company.id, saved.estimate.id);
    expect(reopened.version.payload).toEqual(payload);
    expect(reopened.version.id).toBe(f.bundle.version.id);
    expect(reopened.version.lock_revision).toBe(
      f.bundle.version.lock_revision + 1,
    );
    expect(reopened.version.payload.internal_notes).toBe(before.internal_notes);
    expect(reopened.version.payload.customer_id).toBe(before.customer_id);
    expect(reopened.version.payload.location_id).toBe(before.location_id);
    expect(JSON.stringify(customerPreview(reopened.version))).not.toMatch(
      /internal_notes|unit_cost_minor|Retain unfinished private notes/,
    );
    await expect(f.repo.save(f.company.id, f.bundle, payload)).rejects.toThrow(
      /changed|immutable/,
    );
    expect(
      (await f.repo.get(f.company.id, saved.estimate.id)).version.payload.lines,
    ).toHaveLength(before.lines.length + 2);
  },
);
it.each(['', '0', '-1', 'NaN', '1.0001'])(
  'denies invalid explicit quantity %s without partial mutation',
  async (quantity) => {
    const f = await fixture();
    const before = structuredClone(f.form);
    f.rows[1].quantity = quantity;
    expect(f.prepare).toThrow();
    expect(f.form).toEqual(before);
    expect(
      (await f.repo.get(f.company.id, f.bundle.estimate.id)).version,
    ).toEqual(f.bundle.version);
  },
);
it('rejects duplicate selections, foreign tenant sources and missing or ambiguous loaded catalog rows', async () => {
  const f = await fixture();
  const run =
    (catalog = f.catalog, rows = f.rows, org = f.company.id) =>
    () =>
      catalogDraftBatch(f.repo, org, f.bundle, catalog, rows, () => f.form);
  expect(run(f.catalog, [f.rows[0], f.rows[0]])).toThrow(/distinct/);
  expect(
    run(
      f.catalog.map((c) => ({ ...c, organization_id: sampleCompanies[1].id })),
    ),
  ).toThrow(/unavailable/);
  expect(run(f.catalog, f.rows, sampleCompanies[1].id)).toThrow(/editable/);
  expect(run([])).toThrow(/unavailable/);
  expect(run([...f.catalog, f.catalog[0]])).toThrow(/unavailable/);
  expect(run(f.catalog.map((c) => ({ ...c, active: false })))).toThrow(
    /unavailable/,
  );
});
it('denies issued and archived views and connected repositories', async () => {
  const f = await fixture();
  const issued = await f.repo.issue(f.company.id, f.bundle);
  expect(() =>
    catalogDraftBatch(
      f.repo,
      f.company.id,
      issued,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).toThrow(/editable/);
  const archived = {
    ...f.bundle,
    estimate: { ...f.bundle.estimate, status: 'archived' as const },
  };
  expect(() =>
    catalogDraftBatch(
      f.repo,
      f.company.id,
      archived,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).toThrow(/editable/);
  Object.defineProperty(f.repo, 'sample', { value: false });
  expect(f.prepare).toThrow(/editable/);
});
it('leaves stale-save and duplicate prevention to the original canonical writer', async () => {
  const f = await fixture();
  const payload = f.prepare();
  const competitor = await f.repo.save(f.company.id, f.bundle, {
    ...f.form,
    internal_notes: 'Newer saved work',
  });
  await expect(f.repo.save(f.company.id, f.bundle, payload)).rejects.toThrow(
    /changed|immutable/,
  );
  expect(await f.repo.get(f.company.id, f.bundle.estimate.id)).toEqual(
    competitor,
  );
});
it('copies the explicitly loaded pricing snapshot, never claims a fresh quote or reads and writes in preparation', async () => {
  const f = await fixture();
  const { id, organization_id: _org, ...item } = f.catalog[0];
  void _org;
  await f.repo.saveCatalog(
    f.company.id,
    { ...item, unit_cost_minor: item.unit_cost_minor + 100 },
    id,
  );
  const read = vi.spyOn(f.repo, 'catalog'),
    get = vi.spyOn(f.repo, 'get'),
    save = vi.spyOn(f.repo, 'save');
  const payload = f.prepare();
  expect(payload.lines.at(-2)?.unit_cost_minor).toBe(
    f.catalog[0].unit_cost_minor,
  );
  expect(read).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it('denies original special-flow bindings synchronously before preparation', async () => {
  const f = await fixture();
  const change = vi
    .spyOn(f.repo, 'customerRevisionOrigin')
    .mockReturnValue({} as never);
  expect(f.prepare).toThrow(/Special revision/);
  change.mockRestore();
  vi.spyOn(f.repo, 'repairOrigin').mockReturnValue({} as never);
  expect(f.prepare).toThrow(/Special revision/);
});
