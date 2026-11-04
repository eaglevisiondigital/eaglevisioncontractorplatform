import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import {
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
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    org = all.company.id,
    view = await readVerifiedOwnerBriefing(sources, job, gate),
    issued = view.rows.find((r) => r.source.kind === 'issued')!,
    finance = view.rows.find((r) => r.source.kind === 'finance')!,
    selected: OwnerActionSelection = { key: issued.key, ...issued.source },
    other: OwnerActionSelection = { key: finance.key, ...finance.source };
  const get = vi.fn((_target: OwnerActionSelection, key: PropertyKey) =>
      Reflect.get(other, key),
    ),
    proxy = new Proxy(selected, { get });
  return {
    gate,
    sources,
    entry,
    job,
    org,
    view,
    issued,
    finance,
    selected,
    other,
    get,
    proxy,
  };
}
it.each([0, 1, 2])(
  'brand %i descriptor-selected priority and original inspection cannot be split by raw caller reads',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.view.rows),
      result = await verifyOwnerActionRequirements(f.view, f.proxy);
    expect(result.row).toBe(f.issued);
    expect(result.inspection?.key).toBe(f.selected.key);
    expect(result.inspection?.source).toMatchObject(f.issued.source);
    expect(f.get).not.toHaveBeenCalled();
    expect(result.operational_authority).toBe(false);
    expect(JSON.stringify(f.view.rows)).toBe(before);
  },
);
it.each([0, 1, 2])(
  'brand %i an inspection of a different original priority cannot navigate through a descriptor-preserving proxy',
  async (brand) => {
    const f = await fixture(brand),
      other = await verifyOwnerActionRequirements(f.view, f.other),
      callback = vi.fn(),
      live = { current: callback, generation: 0 },
      result = await continueVerifiedOwnerAction(
        f.view,
        f.proxy,
        other.inspection!,
        true,
        callback,
        live,
      );
    expect(result.status).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
    expect(f.get).not.toHaveBeenCalled();
  },
);
it('changing own-data selection during the awaited native inspection remains stale and cannot renew confirmation', async () => {
  const f = await fixture(),
    selection = { ...f.selected },
    pending = verifyOwnerActionRequirements(f.view, selection);
  Object.assign(selection, f.other);
  await expect(pending).rejects.toThrow();
});
it('foreign descriptor selection cannot borrow this company current inspection through raw property reads', async () => {
  const f = await fixture(),
    foreign = await fixture(1),
    get = vi.fn((_target: OwnerActionSelection, key: PropertyKey) =>
      Reflect.get(f.selected, key),
    ),
    selected = new Proxy({ ...foreign.selected }, { get }),
    result = await verifyOwnerActionRequirements(f.view, selected);
  expect(result.row).toBeNull();
  expect(result.inspection).toBeNull();
  expect(result.can_open_original).toBe(false);
  expect(get).not.toHaveBeenCalled();
});
it('revocation during native verification withholds the original selected facts', async () => {
  const f = await fixture(),
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    ),
    pending = verifyOwnerActionRequirements(f.view, f.selected);
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  await expect(pending).rejects.toThrow();
});
it('the exact selected original navigation remains one-use under competing actions and UNKNOWN ACK', async () => {
  const f = await fixture(),
    verified = await verifyOwnerActionRequirements(f.view, f.selected),
    callback = vi.fn(() => {
      throw Error('Lost original ACK');
    }),
    live = { current: callback, generation: 0 },
    outcomes = await Promise.all([
      continueVerifiedOwnerAction(
        f.view,
        f.selected,
        verified.inspection!,
        true,
        callback,
        live,
      ),
      continueVerifiedOwnerAction(
        f.view,
        f.selected,
        verified.inspection!,
        true,
        callback,
        live,
      ),
    ]);
  expect(outcomes.some((r) => r.status === 'UNKNOWN')).toBe(true);
  expect(callback).toHaveBeenCalledTimes(1);
  await expect(
    readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it('default OFF never reads current owner records', async () => {
  const read = vi.fn(() => {
      throw Error('Private source');
    }),
    sources = Object.defineProperty({}, 'company', { get: read });
  await expect(
    readVerifiedOwnerBriefing(sources as never, 'job'),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
