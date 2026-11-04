import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import {
  filterOwnerActionSources,
  verifyOwnerActionRequirements,
  continueVerifiedOwnerAction,
  compareOwnerActionRefresh,
} from '../src/lib/workflows/owner-action-verification';
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
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    org = all.company.id,
    view = await readVerifiedOwnerBriefing(sources, job, gate);
  return { gate, sources, entry, job, org, view };
}
it.each([0, 1, 2])(
  'brand %i literal filtering retains original authorized row identity, order and ranking',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.view.rows),
      all = filterOwnerActionSources(f.view, { query: '' });
    expect(all.rows).toEqual(f.view.rows);
    expect(all.available).toBe(f.view.rows.length);
    expect(all.matching).toBe(f.view.rows.length);
    expect(all.rows.every((row, index) => row === f.view.rows[index])).toBe(
      true,
    );
    const row = f.view.rows.find((r) => r.source.kind === 'issued')!,
      result = filterOwnerActionSources(f.view, {
        query: row.source.id.toUpperCase(),
      });
    expect(result.rows).toContain(row);
    expect(result.rows.every((r) => f.view.rows.includes(r))).toBe(true);
    expect(result).not.toHaveProperty('selection');
    expect(JSON.stringify(f.view.rows)).toBe(before);
  },
);
it.each([0, 1, 2])(
  'brand %i no match or regex-shaped query never clears the exact original source or infers no work',
  async (brand) => {
    const f = await fixture(brand),
      row = f.view.rows.find((r) => r.source.kind === 'issued')!,
      selection = { key: row.key, ...row.source };
    expect(
      filterOwnerActionSources(f.view, { query: 'literal-no-matching-source' })
        .matching,
    ).toBe(0);
    expect(filterOwnerActionSources(f.view, { query: '.*' }).matching).toBe(0);
    expect(filterOwnerActionSources(f.view, { query: '[a-z]' }).matching).toBe(
      0,
    );
    const verified = await verifyOwnerActionRequirements(f.view, selection);
    expect(verified.can_open_original).toBe(true);
    expect(verified.row).toBe(row);
    expect(verified.operational_authority).toBe(false);
  },
);
it.each([0, 1, 2])(
  'brand %i native source drift denies old filtered rows and fresh rows retain current exact facts',
  async (brand) => {
    const f = await fixture(brand),
      before = filterOwnerActionSources(f.view, { query: 'finance' });
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      f.view.original.costs.material.expense_id!,
      'approved',
      'Explicit native source review',
    );
    expect(() => filterOwnerActionSources(f.view, { query: '' })).toThrow();
    const current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
      now = filterOwnerActionSources(current, { query: 'finance' });
    expect(now.available).toBe(current.rows.length);
    expect(now.rows.every((row) => current.rows.includes(row))).toBe(true);
    const oldFinance = before.rows.find((r) => r.source.kind === 'finance')!,
      newFinance = now.rows.find((r) => r.key === oldFinance.key)!;
    expect(newFinance.facts).not.toEqual(oldFinance.facts);
    expect(newFinance.facts.join(' ')).toContain('NO_GO');
  },
);
it('foreign IDs and text do not resolve other-tenant sources or confer exact-source authorization', async () => {
  const f = await fixture(),
    other = await fixture(1),
    foreign = other.view.rows.find((r) => r.source.kind === 'issued')!;
  expect(
    filterOwnerActionSources(f.view, { query: foreign.source.id }).matching,
  ).toBe(0);
  expect(
    (
      await verifyOwnerActionRequirements(f.view, {
        key: foreign.key,
        ...foreign.source,
      })
    ).can_open_original,
  ).toBe(false);
  expect(() =>
    filterOwnerActionSources({ ...f.view }, { query: '' }),
  ).toThrow();
});
it('revoked reviewer cannot search retained private owner sources', async () => {
  const f = await fixture(),
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() => filterOwnerActionSources(f.view, { query: '' })).toThrow();
});
it.each(['getter', 'extra', 'oversized'] as const)(
  '%s query is denied without executable input evaluation',
  async (mode) => {
    const f = await fixture(),
      getter = vi.fn(() => ''),
      input =
        mode === 'getter'
          ? Object.defineProperty({}, 'query', { get: getter })
          : mode === 'extra'
            ? { query: '', authorize: true }
            : { query: 'x'.repeat(201) };
    expect(() => filterOwnerActionSources(f.view, input as never)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);
it('filtering cannot renew confirmation, old inspection, native custody or an UNKNOWN navigation', async () => {
  const f = await fixture(),
    row = f.view.rows.find((r) => r.source.kind === 'issued')!,
    selected = { key: row.key, ...row.source },
    current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
    refreshed = compareOwnerActionRefresh(f.view, current, selected),
    verified = await verifyOwnerActionRequirements(
      current,
      refreshed.selection!,
    ),
    callback = vi.fn(() => {
      throw Error('Lost original navigation ACK');
    }),
    live = { current: callback, generation: 0 };
  expect(
    filterOwnerActionSources(current, { query: 'no-match' }).matching,
  ).toBe(0);
  expect(
    (
      await continueVerifiedOwnerAction(
        current,
        selected,
        verified.inspection!,
        false,
        callback,
        live,
      )
    ).status,
  ).toBe('WITHHELD_NO_DISPATCH');
  expect(callback).not.toHaveBeenCalled();
  expect(
    (
      await continueVerifiedOwnerAction(
        current,
        selected,
        verified.inspection!,
        true,
        callback,
        live,
      )
    ).status,
  ).toBe('UNKNOWN');
  expect(() => filterOwnerActionSources(current, { query: '' })).toThrow();
  await expect(
    readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  expect(callback).toHaveBeenCalledTimes(1);
});
