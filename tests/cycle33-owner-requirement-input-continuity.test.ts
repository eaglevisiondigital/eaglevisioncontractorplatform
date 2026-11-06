import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
} from '../src/lib/workflows/verified-owner-briefing';
import {
  checkOwnerActionRequirements,
  verifyOwnerActionRequirements,
  continueVerifiedOwnerAction,
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
async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    org = sources.company.id;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const view = await readVerifiedOwnerBriefing(
      sources,
      entry.target.job_id!,
      gate,
    ),
    row = view.rows.find((r) => r.source.kind === 'issued')!;
  return { gate, sources, entry, org, view, row };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: owner requirements cannot return private source facts after selection capture revokes native access`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined, result: unknown;
    const selection = new Proxy(
      { key: f.row.key, ...f.row.source },
      {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'key' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return descriptor;
        },
      },
    );
    try {
      result = checkOwnerActionRequirements(f.view, selection);
    } catch {
      // A revoked original owner cannot receive retained private requirements.
    }
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => assertVerifiedOwnerBriefingCurrent(f.view)).toThrow();
    expect(result).toBeUndefined();
  });
  it(`brand ${brand}: original confirmation withdrawal during selection capture withholds all requirements`, async () => {
    const f = await fixture(brand);
    let captures = 0;
    const selection = new Proxy(
      { key: f.row.key, ...f.row.source },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'key') {
            captures++;
            f.gate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => checkOwnerActionRequirements(f.view, selection)).toThrow();
    expect(captures).toBeGreaterThan(0);
    expect(() => assertVerifiedOwnerBriefingCurrent(f.view)).toThrow();
  });
  it(`brand ${brand}: ordinary exact selections retain native row identity, requirements and navigation-only limits without writes`, async () => {
    const f = await fixture(brand),
      state = f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      property = f.sources.property.read(f.org),
      getter = vi.fn(() => f.row.key),
      invalid = Object.defineProperty({ ...f.row.source }, 'key', {
        enumerable: true,
        get: getter,
      });
    expect(() =>
      checkOwnerActionRequirements(f.view, invalid as never),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const result = checkOwnerActionRequirements(f.view, {
      version: f.row.source.version,
      revision: f.row.source.revision,
      id: f.row.source.id,
      kind: f.row.source.kind,
      key: f.row.key,
    });
    expect(result).toMatchObject({
      status: 'VERIFIED_ORIGINAL_REVIEW_DESTINATION',
      can_open_original: true,
      authority: 'HUMAN_REVIEW_NAVIGATION_ONLY',
      operational_authority: false,
    });
    expect(result.row).toBe(f.row);
    expect(result.facts).toBe(f.row.facts);
    expect(result.requirements).toEqual(f.row.missing_evidence);
    expect(result.row?.source.id).toBe(f.entry.target.version_id);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(state);
    expect(f.sources.property.read(f.org)).toEqual(property);
  });
  it(`brand ${brand}: actual canonical material review invalidates old requirements until an explicit source read`, async () => {
    const f = await fixture(brand),
      selection = { key: f.row.key, ...f.row.source },
      expense = f.view.original.costs.material.expense_id!;
    await f.sources.estimates.reviewExpense(
      f.org,
      f.entry.target.job_id!,
      expense,
      'approved',
      'Explicit native material source review',
    );
    expect(() => checkOwnerActionRequirements(f.view, selection)).toThrow();
    const fresh = await readVerifiedOwnerBriefing(
        f.sources,
        f.entry.target.job_id!,
        f.gate,
      ),
      row = fresh.rows.find((r) => r.source.kind === 'issued')!,
      result = checkOwnerActionRequirements(fresh, {
        key: row.key,
        ...row.source,
      });
    expect(result.row).toBe(row);
    expect(result.operational_authority).toBe(false);
    expect(fresh.original.costs.costs.evidence.job_revision).toBeGreaterThan(
      f.view.original.costs.costs.evidence.job_revision,
    );
    expect(row.source.id).toBe(f.row.source.id);
  });
  it(`brand ${brand}: another current job's exact selector cannot substitute its requirements into this briefing`, async () => {
    const f = await fixture(brand),
      other = await readVerifiedOwnerBriefing(
        f.sources,
        f.sources.entries[0].target.job_id!,
        f.gate,
      ),
      row = other.rows.find((r) => r.source.kind === 'issued')!,
      result = checkOwnerActionRequirements(f.view, {
        key: row.key,
        ...row.source,
      });
    expect(result.status).toBe('UNKNOWN_SOURCE_MISSING');
    expect(result.row).toBeNull();
    expect(result.requirements).toEqual([]);
    expect(result.can_open_original).toBe(false);
    expect(
      checkOwnerActionRequirements(f.view, { key: f.row.key, ...f.row.source })
        .row,
    ).toBe(f.row);
  });
  it(`brand ${brand}: selection-time native revocation returns UNKNOWN without any original navigation callback`, async () => {
    const f = await fixture(brand),
      plain = { key: f.row.key, ...f.row.source },
      verified = await verifyOwnerActionRequirements(f.view, plain),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    expect(verified.inspection).not.toBeNull();
    let revoked: Promise<void> | undefined;
    const selection = new Proxy(plain, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'key' && !revoked)
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(
      await continueVerifiedOwnerAction(
        f.view,
        selection,
        verified.inspection!,
        true,
        callback,
        live,
      ),
    ).toEqual({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    expect(revoked).toBeDefined();
    await revoked;
    expect(
      await continueVerifiedOwnerAction(
        f.view,
        plain,
        verified.inspection!,
        true,
        callback,
        live,
      ),
    ).toEqual({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    expect(callback).not.toHaveBeenCalled();
  });
}
it('currently authorized foreign-tenant selectors cannot expose another company through the original briefing', async () => {
  const first = await fixture(0),
    second = await fixture(1),
    result = checkOwnerActionRequirements(first.view, {
      key: second.row.key,
      ...second.row.source,
    });
  expect(first.org).not.toBe(second.org);
  expect(result).toMatchObject({
    status: 'UNKNOWN_SOURCE_MISSING',
    row: null,
    requirements: [],
    can_open_original: false,
    operational_authority: false,
  });
  expect(
    checkOwnerActionRequirements(second.view, {
      key: second.row.key,
      ...second.row.source,
    }).row,
  ).toBe(second.row);
});
it('the original admission guard rejects an unadmitted read before caller selectors and default-OFF reads no sources', async () => {
  const getter = vi.fn(() => {
      throw Error('Private selector');
    }),
    selection = new Proxy(
      {},
      { get: getter, getOwnPropertyDescriptor: getter },
    ),
    sources = new Proxy({}, { get: getter });
  expect(() =>
    checkOwnerActionRequirements({} as never, selection as never),
  ).toThrow('Original verified briefing read required');
  await expect(
    readVerifiedOwnerBriefing(sources as never, 'unadmitted'),
  ).rejects.toThrow('OFF');
  expect(getter).not.toHaveBeenCalled();
});
