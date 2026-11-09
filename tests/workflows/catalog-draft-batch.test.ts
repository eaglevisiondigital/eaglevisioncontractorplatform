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
  return { ...f, catalog, form, rows };
}
it.each([0, 1, 2])(
  'brand %i: prepares and saves multiple catalog quantities through the original draft writer',
  async (index) => {
    const f = await fixture(index);
    const before = structuredClone(f.form);
    const result = await catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    );
    expect(f.form).toEqual(before);
    expect(
      (await f.repo.get(f.company.id, f.bundle.estimate.id)).version,
    ).toEqual(f.bundle.version);
    expect(result.payload.lines.slice(0, before.lines.length)).toEqual(
      before.lines,
    );
    const added = result.payload.lines.slice(before.lines.length);
    expect(new Set(result.payload.lines.map((l) => l.id)).size).toBe(
      result.payload.lines.length,
    );
    expect(added.map((l) => l.quantity_milli)).toEqual([2125, 3000]);
    added.forEach((line, i) => {
      expect(line).toMatchObject({
        catalog_item_id: f.catalog[i].id,
        unit: f.catalog[i].unit,
        unit_cost_minor: f.catalog[i].unit_cost_minor,
        unit_price_minor: f.catalog[i].unit_price_minor,
        markup_bps: f.catalog[i].markup_bps,
        import_approval_id: null,
      });
    });
    const saved = await f.repo.save(f.company.id, f.bundle, result.payload);
    const reopened = await f.repo.get(f.company.id, saved.estimate.id);
    expect(reopened.version.payload).toEqual(result.payload);
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
    await expect(
      f.repo.save(f.company.id, f.bundle, result.payload),
    ).rejects.toThrow(/changed|immutable/);
    expect(
      (await f.repo.get(f.company.id, saved.estimate.id)).version.payload.lines,
    ).toHaveLength(before.lines.length + 2);
  },
);
it.each(['', '0', '-1', 'NaN', '1.0001'])(
  'denies invalid explicit quantity %s atomically',
  async (quantity) => {
    const f = await fixture();
    const before = structuredClone(f.form);
    f.rows[1].quantity = quantity;
    await expect(
      catalogDraftBatch(
        f.repo,
        f.company.id,
        f.bundle,
        f.catalog,
        f.rows,
        () => f.form,
      ),
    ).rejects.toThrow();
    expect(f.form).toEqual(before);
    expect(
      (await f.repo.get(f.company.id, f.bundle.estimate.id)).version,
    ).toEqual(f.bundle.version);
  },
);
it('rejects duplicate selections and cross-tenant catalog references', async () => {
  const f = await fixture();
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      [f.rows[0], f.rows[0]],
      () => f.form,
    ),
  ).rejects.toThrow(/distinct/);
  const foreign = f.catalog.map((c) => ({
    ...c,
    organization_id: sampleCompanies[1].id,
  }));
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      foreign,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/Catalog/);
  await expect(
    catalogDraftBatch(
      f.repo,
      sampleCompanies[1].id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/editable/);
});
it('rejects changed and inactive catalog evidence without changing the working draft', async () => {
  const f = await fixture();
  const { id, organization_id: _org, ...item } = f.catalog[0];
  void _org;
  await f.repo.saveCatalog(
    f.company.id,
    { ...item, unit_cost_minor: item.unit_cost_minor + 1 },
    id,
  );
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/Catalog source changed/);
  await f.repo.saveCatalog(f.company.id, { ...item, active: false }, id);
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/Catalog source changed/);
});
it('withholds results if the working draft changes during the awaited read', async () => {
  const f = await fixture();
  const read = f.repo.catalog.bind(f.repo);
  vi.spyOn(f.repo, 'catalog').mockImplementation(async (org) => {
    const r = await read(org);
    f.form.project.description = 'Retain newer edits';
    return r;
  });
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/draft changed/);
  expect(f.form.project.description).toBe('Retain newer edits');
});
it('denies revoked estimating access after the catalog read', async () => {
  const f = await fixture();
  const access = await f.ops.companyAccess(f.company.id);
  vi.spyOn(f.ops, 'companyAccess')
    .mockResolvedValueOnce(access)
    .mockResolvedValue({ ...access, estimates: false });
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/access changed/);
});
it('denies stale saved versions, issued drafts and connected repositories', async () => {
  const f = await fixture();
  const saved = await f.repo.save(f.company.id, f.bundle, f.form);
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/draft changed/);
  const issued = await f.repo.issue(f.company.id, saved);
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      issued,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/editable/);
  Object.defineProperty(f.repo, 'sample', { value: false });
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      saved,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/editable/);
});
it.each(['catalog', 'saved'])(
  'denies %s changes during the final awaited permission read',
  async (kind) => {
    const f = await fixture();
    const access = await f.ops.companyAccess(f.company.id);
    let calls = 0;
    vi.spyOn(f.ops, 'companyAccess').mockImplementation(async () => {
      if (++calls === 2) {
        if (kind === 'catalog') {
          const { id, organization_id: _org, ...item } = f.catalog[0];
          void _org;
          await f.repo.saveCatalog(
            f.company.id,
            { ...item, active: false },
            id,
          );
        } else await f.repo.save(f.company.id, f.bundle, f.form);
      }
      return access;
    });
    await expect(
      catalogDraftBatch(
        f.repo,
        f.company.id,
        f.bundle,
        f.catalog,
        f.rows,
        () => f.form,
      ),
    ).rejects.toThrow(/changed|immutable|unavailable/);
  },
);
it('retains a final fence until the immediate editor application', async () => {
  const f = await fixture();
  const result = await catalogDraftBatch(
    f.repo,
    f.company.id,
    f.bundle,
    f.catalog,
    f.rows,
    () => f.form,
  );
  await f.repo.save(f.company.id, f.bundle, f.form);
  expect(() => result.check()).toThrow(/changed|immutable/);
});
it('denies special revision bindings even before metadata has loaded in the UI', async () => {
  const f = await fixture();
  vi.spyOn(f.repo, 'customerRevisionOrigin').mockReturnValue({} as never);
  await expect(
    catalogDraftBatch(
      f.repo,
      f.company.id,
      f.bundle,
      f.catalog,
      f.rows,
      () => f.form,
    ),
  ).rejects.toThrow(/Special revision/);
});
