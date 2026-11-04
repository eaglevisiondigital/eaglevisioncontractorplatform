import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import {
  compareOwnerActionRefresh,
  verifyOwnerActionRequirements,
  continueVerifiedOwnerAction,
  type OwnerActionSelection,
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
    org = all.company.id;
  const view = await readVerifiedOwnerBriefing(sources, job, gate);
  return { gate, sources, entry, job, org, view };
}
it.each([0, 1, 2])(
  'brand %i retains exact immutable issued source when only unrelated cost evidence changes',
  async (brand) => {
    const f = await fixture(brand),
      before = f.view.rows.find((row) => row.source.kind === 'issued')!;
    const selection: OwnerActionSelection = {
      key: before.key,
      ...before.source,
    };
    const version = f.sources.estimates.readSyntheticPrototypeSources(
      f.entry.target,
    ).bundle.version;
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      f.view.original.costs.material.expense_id!,
      'approved',
      'Unrelated native material review',
    );
    const current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
      after = current.rows.find((row) => row.key === selection.key)!;
    expect(after.source).toEqual(before.source);
    expect(after.facts).toEqual(before.facts);
    expect(after).toEqual(before);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).bundle
        .version,
    ).toEqual(version);
    const refreshed = compareOwnerActionRefresh(f.view, current, selection);
    expect(
      refreshed.comparison.rows.find((row) => row.key === selection.key)
        ?.status,
    ).toBe('CHANGED');
    expect(refreshed.status).toBe('UNCHANGED_REVERIFY_REQUIRED');
    expect(refreshed.selection).toEqual(selection);
    expect(refreshed.previous_confirmation_retained).toBe(false);
    expect(refreshed.requires_verification).toBe(true);
  },
);

it.each([0, 1, 2])(
  'brand %i selected finance facts change and still clear the exact selection after native review',
  async (brand) => {
    const f = await fixture(brand),
      row = f.view.rows.find((r) => r.source.kind === 'finance')!,
      selection = { key: row.key, ...row.source },
      frozen = JSON.stringify(row);
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      f.view.original.costs.material.expense_id!,
      'approved',
      'Exact native material review',
    );
    const current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
      refreshed = compareOwnerActionRefresh(f.view, current, selection);
    expect(refreshed.status).toBe('SOURCE_CHANGED_RESELECT_REQUIRED');
    expect(refreshed.selection).toBeNull();
    expect(
      current.rows.find((r) => r.key === selection.key)!.facts,
    ).not.toEqual(row.facts);
    expect(JSON.stringify(row)).toBe(frozen);
    expect(refreshed.operational_authority).toBe(false);
  },
);
it.each([0, 1, 2])(
  'brand %i revised original visit key never substitutes a newer source or implies completion',
  async (brand) => {
    const f = await fixture(brand),
      row = f.view.rows.find((r) => r.source.kind === 'visit')!,
      visit = f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === row.source.id)!;
    f.sources.property.saveVisit(f.org, visit, {
      ...visit.content,
      summary: 'Explicit later native record',
    });
    const current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
      refreshed = compareOwnerActionRefresh(f.view, current, {
        key: row.key,
        ...row.source,
      });
    expect(refreshed.status).toBe('UNKNOWN_SOURCE_MISSING');
    expect(refreshed.selection).toBeNull();
    expect(
      refreshed.comparison.rows.find((r) => r.key === row.key)?.recorded_state,
    ).toBe('NOT_PRESENT_IN_CURRENT_READ_UNKNOWN');
    expect(
      current.rows.some(
        (r) =>
          r.source.id === row.source.id &&
          r.source.revision === row.source.revision! + 1,
      ),
    ).toBe(true);
  },
);
it('retaining identical source context cannot reuse an old inspection, confirmation or withdrawn callback', async () => {
  const f = await fixture(),
    row = f.view.rows.find((r) => r.source.kind === 'issued')!,
    selected = { key: row.key, ...row.source },
    old = await verifyOwnerActionRequirements(f.view, selected);
  await f.sources.estimates.reviewExpense(
    f.org,
    f.job,
    f.view.original.costs.material.expense_id!,
    'approved',
    'Unrelated native review',
  );
  const current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
    refreshed = compareOwnerActionRefresh(f.view, current, selected),
    callback = vi.fn(),
    live = { current: callback, generation: 0 };
  expect(refreshed.selection).toEqual(selected);
  expect(refreshed.previous_confirmation_retained).toBe(false);
  expect(
    (
      await continueVerifiedOwnerAction(
        current,
        selected,
        old.inspection!,
        true,
        callback,
        live,
      )
    ).status,
  ).toBe('WITHHELD_NO_DISPATCH');
  const verified = await verifyOwnerActionRequirements(
    current,
    refreshed.selection!,
  );
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
  expect(
    (
      await continueVerifiedOwnerAction(
        current,
        selected,
        verified.inspection!,
        true,
        callback,
        { current: undefined, generation: 1 },
      )
    ).status,
  ).toBe('WITHHELD_NO_DISPATCH');
  expect(callback).not.toHaveBeenCalled();
});
it('revoked or foreign current authority cannot retain otherwise matching source context', async () => {
  const f = await fixture(),
    foreign = await fixture(1),
    row = f.view.rows.find((r) => r.source.kind === 'issued')!,
    selection = { key: row.key, ...row.source },
    current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate);
  expect(() =>
    compareOwnerActionRefresh(f.view, foreign.view, selection),
  ).toThrow();
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() => compareOwnerActionRefresh(f.view, current, selection)).toThrow();
});
it('source comparison never renews UNKNOWN original navigation or creates a replacement receipt', async () => {
  const f = await fixture(),
    row = f.view.rows.find((r) => r.source.kind === 'issued')!,
    selection = { key: row.key, ...row.source },
    current = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
    refreshed = compareOwnerActionRefresh(f.view, current, selection),
    verified = await verifyOwnerActionRequirements(
      current,
      refreshed.selection!,
    ),
    callback = vi.fn(() => {
      throw Error('Lost original acknowledgment');
    });
  expect(
    (
      await continueVerifiedOwnerAction(
        current,
        selection,
        verified.inspection!,
        true,
        callback,
        { current: callback, generation: 0 },
      )
    ).status,
  ).toBe('UNKNOWN');
  await expect(
    readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  expect(() => compareOwnerActionRefresh(f.view, current, selection)).toThrow();
  expect(callback).toHaveBeenCalledTimes(1);
});
