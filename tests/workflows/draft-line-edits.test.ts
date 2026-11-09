import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { calculateEstimate } from '../../src/domain/estimating/calculation';
import { editDraftLines } from '../../src/components/phase3/draft-line-edits';
import { prototypeFixture } from '../program/prototype-fixture';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const f = await prototypeFixture(sampleCompanies[index]);
  const draft = structuredClone(f.bundle.version.payload);
  draft.internal_notes = 'Retain private unfinished work';
  const selected = draft.lines.slice(0, 2).map((l) => l.id);
  return {
    ...f,
    draft,
    selected,
    edit: (action: 'quantity' | 'remove', quantity = '') =>
      editDraftLines(
        f.repo,
        f.company.id,
        f.bundle,
        draft,
        selected,
        action,
        quantity,
      ),
  };
}
it.each([0, 1, 2])(
  'brand %i: edits and removes selected items with original Save/reopen and exact recalculation',
  async (index) => {
    const f = await fixture(index);
    const original = structuredClone(f.draft);
    const edited = f.edit('quantity', '2.125');
    expect(f.draft).toEqual(original);
    expect(edited.lines.map((l) => l.id)).toEqual(
      original.lines.map((l) => l.id),
    );
    expect(edited.lines.slice(0, 2).map((l) => l.quantity_milli)).toEqual([
      2125, 2125,
    ]);
    original.lines.forEach((line, i) =>
      expect(edited.lines[i]).toEqual(
        i < 2 ? { ...line, quantity_milli: 2125 } : line,
      ),
    );
    const saved = await f.repo.save(f.company.id, f.bundle, edited);
    const reopened = await f.repo.get(f.company.id, f.bundle.estimate.id);
    expect(reopened.version.payload).toEqual(edited);
    expect(reopened.version.calculation).toEqual(
      calculateEstimate(
        edited,
        reopened.version.tax_policy_snapshot?.rate_bps ?? 0,
      ),
    );
    expect(reopened.version.calculation.total_minor).not.toBe(
      f.bundle.version.calculation.total_minor,
    );
    expect(reopened.version.id).toBe(f.bundle.version.id);
    const removalIds = index === 2 ? [f.selected[0]] : f.selected;
    const remaining = edited.lines.filter(
      (line) => !removalIds.includes(line.id),
    );
    const removed = editDraftLines(
      f.repo,
      f.company.id,
      saved,
      edited,
      removalIds,
      'remove',
    );
    expect(removed.lines).toEqual(remaining);
    const savedAgain = await f.repo.save(f.company.id, saved, removed);
    const final = await f.repo.get(f.company.id, f.bundle.estimate.id);
    expect(final).toEqual(savedAgain);
    expect(final.version.payload).toEqual({
      ...edited,
      lines: remaining,
    });
    expect(final.version.payload.customer_id).toBe(original.customer_id);
    expect(final.version.payload.location_id).toBe(original.location_id);
    expect(final.version.payload.internal_notes).toBe(original.internal_notes);
    expect(final.version.lock_revision).toBe(
      f.bundle.version.lock_revision + 2,
    );
    expect(final.version.calculation).toEqual(
      calculateEstimate(
        removed,
        final.version.tax_policy_snapshot?.rate_bps ?? 0,
      ),
    );
  },
);
it.each(['', '0', '-1', 'NaN', '1.0001'])(
  'rejects invalid quantity %s without changing any line',
  async (quantity) => {
    const f = await fixture();
    const before = structuredClone(f.draft);
    expect(() => f.edit('quantity', quantity)).toThrow();
    expect(f.draft).toEqual(before);
  },
);
it('rejects empty, duplicate, missing and all-line removal selections atomically', async () => {
  const f = await fixture();
  const run = (ids: string[]) => () =>
    editDraftLines(f.repo, f.company.id, f.bundle, f.draft, ids, 'remove');
  for (const ids of [
    [],
    [f.selected[0], f.selected[0]],
    ['missing'],
    f.draft.lines.map((l) => l.id),
  ])
    expect(run(ids)).toThrow();
  expect(
    (await f.repo.get(f.company.id, f.bundle.estimate.id)).version,
  ).toEqual(f.bundle.version);
});
it.each(['quantity', 'remove'] as const)(
  'never bypasses approved import protection for %s',
  async (action) => {
    const f = await fixture();
    const before = structuredClone(f.draft);
    for (const field of [
      'import_approval_id',
      'material_import_line_ids',
    ] as const) {
      const locked = structuredClone(before);
      if (field === 'import_approval_id')
        locked.lines[0].import_approval_id = crypto.randomUUID();
      else locked.lines[0].material_import_line_ids = [crypto.randomUUID()];
      expect(() =>
        editDraftLines(
          f.repo,
          f.company.id,
          f.bundle,
          locked,
          f.selected,
          action,
          '2',
        ),
      ).toThrow(/import/);
    }
    expect(f.draft).toEqual(before);
  },
);
it('original CAS permits only one concurrent save and preserves newer work', async () => {
  const f = await fixture();
  const payload = f.edit('quantity', '4');
  const results = await Promise.allSettled([
    f.repo.save(f.company.id, f.bundle, payload),
    f.repo.save(f.company.id, f.bundle, payload),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  const current = await f.repo.get(f.company.id, f.bundle.estimate.id);
  expect(current.version.lock_revision).toBe(
    f.bundle.version.lock_revision + 1,
  );
  await expect(f.repo.save(f.company.id, f.bundle, f.draft)).rejects.toThrow(
    /changed|immutable/,
  );
  expect(await f.repo.get(f.company.id, f.bundle.estimate.id)).toEqual(current);
});
it('editing a later draft never replaces the original issued version or job baseline', async () => {
  const f = await prototypeFixture(sampleCompanies[0], true);
  const issued = structuredClone(f.bundle);
  const jobs = await f.repo.jobs(f.company.id);
  expect(() =>
    editDraftLines(
      f.repo,
      f.company.id,
      issued,
      issued.version.payload,
      [issued.version.payload.lines[0].id],
      'remove',
    ),
  ).toThrow(/editable/);
  const revision = await f.repo.revise(f.company.id, issued);
  const payload = editDraftLines(
    f.repo,
    f.company.id,
    revision,
    revision.version.payload,
    [revision.version.payload.lines[0].id],
    'quantity',
    '9',
  );
  await f.repo.save(f.company.id, revision, payload);
  expect(
    (await f.repo.get(f.company.id, issued.estimate.id, issued.version.id))
      .version,
  ).toEqual(issued.version);
  expect(await f.repo.jobs(f.company.id)).toEqual(jobs);
});
it('denies foreign contexts, archived views, connected mode and special revision bindings', async () => {
  const f = await fixture();
  expect(() =>
    editDraftLines(
      f.repo,
      sampleCompanies[1].id,
      f.bundle,
      f.draft,
      f.selected,
      'remove',
    ),
  ).toThrow(/editable/);
  const archived = {
    ...f.bundle,
    estimate: { ...f.bundle.estimate, status: 'archived' as const },
  };
  expect(() =>
    editDraftLines(
      f.repo,
      f.company.id,
      archived,
      f.draft,
      f.selected,
      'remove',
    ),
  ).toThrow(/editable/);
  const special = vi
    .spyOn(f.repo, 'customerRevisionOrigin')
    .mockReturnValue({} as never);
  expect(() => f.edit('remove')).toThrow(/Special/);
  special.mockRestore();
  Object.defineProperty(f.repo, 'sample', { value: false });
  expect(() => f.edit('remove')).toThrow(/editable/);
});
it('retains the native requirement that every alternative has a scope item', async () => {
  const f = await fixture(2);
  const before = structuredClone(f.draft);
  expect(() => f.edit('remove')).toThrow(
    /Each option needs at least one scope item/,
  );
  expect(f.draft).toEqual(before);
});
