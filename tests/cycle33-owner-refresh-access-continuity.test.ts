import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readVerifiedOwnerBriefing,
  compareVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
  assertVerifiedOwnerComparisonCurrent,
} from '../src/lib/workflows/verified-owner-briefing';
import { compareOwnerActionRefresh } from '../src/lib/workflows/owner-action-verification';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(brand: number, remainingOwner = false) {
  const gate = { enabled: true, confirmed: true },
    beforeGate = { ...gate },
    currentGate = { ...gate },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    job = entry.target.job_id!;
  if (remainingOwner)
    await sources.operations.configure(
      sources.company.id,
      'active',
      'synthetic',
      {},
      sources.company.id + '-remaining-refresh-owner',
    );
  const before = await readVerifiedOwnerBriefing(sources, job, beforeGate),
    current = await readVerifiedOwnerBriefing(sources, job, currentGate),
    row = before.rows.find((r) => r.source.kind === 'issued')!;
  return {
    gate,
    beforeGate,
    currentGate,
    sources,
    entry,
    job,
    before,
    current,
    row,
  };
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: selection capture cannot withdraw earlier read admission and return its private comparison`, async () => {
    const f = await fixture(brand),
      original = compareVerifiedOwnerBriefing(f.before, f.current);
    let captures = 0;
    const selection = new Proxy(
      { key: f.row.key, ...f.row.source },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'key') {
            captures++;
            f.beforeGate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    let result: ReturnType<typeof compareOwnerActionRefresh> | undefined;
    try {
      result = compareOwnerActionRefresh(f.before, f.current, selection);
    } catch {
      // Both original admissions remain necessary for private comparison output.
    }
    expect(captures).toBe(1);
    expect(f.gate.confirmed).toBe(true);
    expect(f.currentGate.confirmed).toBe(true);
    expect(() => assertVerifiedOwnerBriefingCurrent(f.current)).not.toThrow();
    expect(() => assertVerifiedOwnerComparisonCurrent(original)).toThrow();
    expect(result).toBeUndefined();
  });

  it(`brand ${brand}: ordinary refresh retains exact source context but neither prior verification nor action authority`, async () => {
    const f = await fixture(brand),
      state = f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      property = f.sources.property.read(f.sources.company.id),
      record = vi.spyOn(f.sources.estimates, 'recordTime'),
      material = vi.spyOn(f.sources.estimates, 'reviewExpense'),
      command = vi.spyOn(f.entry.release, 'command'),
      fetcher = vi.spyOn(globalThis, 'fetch'),
      selection = { key: f.row.key, ...f.row.source },
      original = JSON.stringify(f.before),
      result = compareOwnerActionRefresh(f.before, f.current, selection);
    expect(result.status).toBe('UNCHANGED_REVERIFY_REQUIRED');
    expect(result.selection).toEqual(selection);
    expect(result.previous_confirmation_retained).toBe(false);
    expect(result.requires_verification).toBe(true);
    expect(result.operational_authority).toBe(false);
    expect(
      result.comparison.rows.find((r) => r.key === f.row.key)?.source,
    ).toEqual(f.row.source);
    expect(() =>
      assertVerifiedOwnerComparisonCurrent(result.comparison),
    ).not.toThrow();
    expect(JSON.stringify(f.before)).toBe(original);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(state);
    expect(f.sources.property.read(f.sources.company.id)).toEqual(property);
    for (const call of [record, material, command, fetcher])
      expect(call).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: historical mutable cost changes remain comparable under earlier access without renewing approval`, async () => {
    const f = await fixture(brand),
      original = JSON.stringify(f.before);
    await f.sources.estimates.reviewExpense(
      f.sources.company.id,
      f.job,
      f.before.original.costs.material.expense_id!,
      'approved',
      'Explicit native local material review for historical comparison',
    );
    const current = await readVerifiedOwnerBriefing(
      f.sources,
      f.job,
      f.currentGate,
    );
    expect(() => assertVerifiedOwnerBriefingCurrent(f.before)).toThrow();
    const result = compareOwnerActionRefresh(f.before, current, {
      key: f.row.key,
      ...f.row.source,
    });
    expect(result.status).toBe('UNCHANGED_REVERIFY_REQUIRED');
    expect(result.comparison.rows.some((r) => r.status === 'CHANGED')).toBe(
      true,
    );
    expect(() =>
      assertVerifiedOwnerComparisonCurrent(result.comparison),
    ).not.toThrow();
    expect(result.previous_confirmation_retained).toBe(false);
    expect(JSON.stringify(f.before)).toBe(original);
  });

  it(`brand ${brand}: actual native owner revocation during selection capture discloses neither comparison nor renewed authority`, async () => {
    const f = await fixture(brand, true);
    let revoked: Promise<void> | undefined;
    const selection = new Proxy(
      { key: f.row.key, ...f.row.source },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'key' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.sources.company.id,
              f.entry.target.actor_id,
            );
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() =>
      compareOwnerActionRefresh(f.before, f.current, selection),
    ).toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => assertVerifiedOwnerBriefingCurrent(f.current)).toThrow();
  });

  it(`brand ${brand}: current-read confirmation withdrawal during capture still prevents all output`, async () => {
    const f = await fixture(brand);
    const selection = new Proxy(
      { key: f.row.key, ...f.row.source },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'key') f.currentGate.confirmed = false;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() =>
      compareOwnerActionRefresh(f.before, f.current, selection),
    ).toThrow();
    expect(f.beforeGate.confirmed).toBe(true);
    expect(f.gate.confirmed).toBe(true);
  });

  it(`brand ${brand}: earlier admission closed before entry denies before caller selection descriptors`, async () => {
    const f = await fixture(brand),
      capture = vi.fn(),
      selection = new Proxy(
        { key: f.row.key, ...f.row.source },
        {
          getOwnPropertyDescriptor(target, key) {
            capture();
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    f.beforeGate.enabled = false;
    expect(() =>
      compareOwnerActionRefresh(f.before, f.current, selection),
    ).toThrow();
    expect(capture).not.toHaveBeenCalled();
    expect(() => assertVerifiedOwnerBriefingCurrent(f.current)).not.toThrow();
  });

  it(`brand ${brand}: copied handles, another job and another company never substitute for the earlier authorized context`, async () => {
    const f = await fixture(brand),
      selection = { key: f.row.key, ...f.row.source };
    expect(() =>
      compareOwnerActionRefresh({ ...f.before }, f.current, selection),
    ).toThrow();
    expect(() =>
      compareOwnerActionRefresh(f.before, { ...f.current }, selection),
    ).toThrow();
    const otherJob = await readVerifiedOwnerBriefing(
      f.sources,
      f.sources.entries[0].target.job_id!,
      f.currentGate,
    );
    expect(() =>
      compareOwnerActionRefresh(f.before, otherJob, selection),
    ).toThrow();
    const gate = { enabled: true, confirmed: true },
      foreign = await prepareCorrectionPreviewSources(
        sampleCompanies[(brand + 1) % 3],
        gate,
      ),
      foreignView = await readVerifiedOwnerBriefing(
        foreign,
        foreign.entries[2].target.job_id!,
        gate,
      );
    expect(() =>
      compareOwnerActionRefresh(f.before, foreignView, selection),
    ).toThrow();
    expect(() => assertVerifiedOwnerBriefingCurrent(f.current)).not.toThrow();
  });

  it(`brand ${brand}: revised native visit disappearance stays UNKNOWN without source replacement or completion`, async () => {
    const f = await fixture(brand),
      row = f.before.rows.find((r) => r.source.kind === 'visit')!,
      visit = f.sources.property
        .read(f.sources.company.id)
        .visits.find((v) => v.id === row.source.id)!;
    f.sources.property.saveVisit(f.sources.company.id, visit, {
      ...visit.content,
      summary: 'Explicit changed native visit for source continuity review',
    });
    const current = await readVerifiedOwnerBriefing(
        f.sources,
        f.job,
        f.currentGate,
      ),
      result = compareOwnerActionRefresh(f.before, current, {
        key: row.key,
        ...row.source,
      });
    expect(result.status).toBe('UNKNOWN_SOURCE_MISSING');
    expect(result.selection).toBeNull();
    expect(result.previous_confirmation_retained).toBe(false);
    expect(
      result.comparison.rows.find((r) => r.key === row.key)?.recorded_state,
    ).toBe('NOT_PRESENT_IN_CURRENT_READ_UNKNOWN');
    expect(result.operational_authority).toBe(false);
    expect(() =>
      assertVerifiedOwnerComparisonCurrent(result.comparison),
    ).not.toThrow();
  });
}

it('default-OFF original reader denies before accessing any source descriptors', async () => {
  const get = vi.fn(() => {
      throw Error('source must stay untouched');
    }),
    sources = new Proxy({}, { get });
  await expect(
    readVerifiedOwnerBriefing(sources as never, 'unread'),
  ).rejects.toThrow('OFF');
  expect(get).not.toHaveBeenCalled();
});
