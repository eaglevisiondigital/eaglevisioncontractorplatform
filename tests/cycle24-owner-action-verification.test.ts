import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readVerifiedOwnerBriefing } from '../src/lib/workflows/verified-owner-briefing';
import { recordedOwnerActionCards } from '../src/lib/workflows/recorded-owner-actions';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  checkOwnerActionRequirements,
  verifyOwnerActionRequirements,
  continueVerifiedOwnerAction,
  type OwnerActionSelection,
} from '../src/lib/workflows/owner-action-verification';
import { OwnerActionVerification } from '../src/components/workflows/OwnerActionVerification';
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
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[0],
    job = entry.target.job_id!,
    org = sources.company.id,
    view = await readVerifiedOwnerBriefing(sources, job, gate);
  return { gate, sources, entry, job, org, view };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function select(f: Fixture, kind?: string): OwnerActionSelection {
  const row = f.view.rows.find(
    (r) =>
      (!kind || r.source.kind === kind) &&
      r.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
  )!;
  return { key: row.key, ...row.source };
}
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
}
async function drift(f: Fixture) {
  const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
  await f.sources.estimates.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 1,
    },
  });
}
describe('Cycle24 exact owner action requirement verification', () => {
  it.each([0, 1, 2])(
    'brand %i verifies exact original requirements without new ranking or authority',
    async (brand) => {
      const f = await fixture(brand),
        selection = select(f),
        cards = recordedOwnerActionCards(f.view.original.original),
        before = JSON.stringify(cards),
        result = await verifyOwnerActionRequirements(f.view, selection),
        row = f.view.rows.find((r) => r.key === selection.key)!;
      expect(result.status).toBe('VERIFIED_ORIGINAL_REVIEW_DESTINATION');
      expect(result.requirements).toEqual(row.missing_evidence);
      expect(result.row).toBe(row);
      expect(result.operational_authority).toBe(false);
      expect(result.inspection?.source).toMatchObject(row.source);
      expect(
        JSON.stringify(recordedOwnerActionCards(f.view.original.original)),
      ).toBe(before);
    },
  );
  it.each([0, 1, 2])(
    'brand %i current source opens only original exact job and task destination once',
    async (brand) => {
      const f = await fixture(brand),
        selection = select(f),
        result = await verifyOwnerActionRequirements(f.view, selection),
        callback = vi.fn(),
        live = { current: callback, generation: 0 };
      expect(result.inspection).not.toBeNull();
      expect(
        (
          await continueVerifiedOwnerAction(
            f.view,
            selection,
            result.inspection!,
            true,
            callback,
            live,
          )
        ).status,
      ).toBe('CURRENT_REVIEW_ONLY');
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        f.job,
        result.inspection!.step,
      );
      expect(
        (
          await continueVerifiedOwnerAction(
            f.view,
            selection,
            result.inspection!,
            true,
            callback,
            live,
          )
        ).status,
      ).toBe('WITHHELD_NO_DISPATCH');
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['kind', 'id', 'revision', 'version'] as const)(
    'mismatched %s is explicit stale selection with no fallback',
    async (field) => {
      const f = await fixture(),
        selection = select(f);
      if (field === 'kind') selection.kind = 'foreign';
      if (field === 'id') selection.id = 'foreign';
      if (field === 'revision')
        selection.revision = (selection.revision ?? 0) + 1;
      if (field === 'version') selection.version = (selection.version ?? 0) + 1;
      const result = await verifyOwnerActionRequirements(f.view, selection);
      expect(result.status).toBe('SOURCE_CHANGED_RESELECT_REQUIRED');
      expect(result.row).toBeNull();
      expect(result.inspection).toBeNull();
      expect(result.can_open_original).toBe(false);
    },
  );
  it('missing original key stays UNKNOWN rather than resolved or matched by source text', async () => {
    const f = await fixture(),
      selection = { ...select(f), key: 'not-present' },
      result = await verifyOwnerActionRequirements(f.view, selection);
    expect(result.status).toBe('UNKNOWN_SOURCE_MISSING');
    expect(result.inspection).toBeNull();
    expect(result.facts.join(' ')).toContain('No completion');
  });
  it('actual native material review stales verified finance action and fresh requirements retain invoice NO_GO', async () => {
    const f = await fixture(),
      selection = select(f, 'finance'),
      before = await verifyOwnerActionRequirements(f.view, selection),
      old = JSON.stringify(before.facts),
      id = f.view.original.costs.material.expense_id!;
    await confirmCostCorrectionReview(
      f.view.original.costs,
      {
        expense_id: id,
        decision: 'approved',
        reason: 'Explicit actual native material review.',
      },
      true,
    );
    expect(() => checkOwnerActionRequirements(f.view, selection)).toThrow();
    const view = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
      currentSelection = select({ ...f, view }, 'finance'),
      current = await verifyOwnerActionRequirements(view, currentSelection);
    expect(current.facts).not.toEqual(before.facts);
    expect(current.facts.join(' ')).toContain('NO_GO');
    expect(JSON.stringify(before.facts)).toBe(old);
    expect(current.operational_authority).toBe(false);
  });
  it('changed native visit revision removes old action key without inferred completion and requires exact new selection', async () => {
    const f = await fixture(),
      selection = select(f, 'visit'),
      visit = f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === selection.id)!;
    f.sources.property.saveVisit(f.org, visit, {
      ...visit.content,
      summary: 'Explicit native visit source revision.',
    });
    const view = await readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
      missing = await verifyOwnerActionRequirements(view, selection);
    expect(missing.status).toBe('UNKNOWN_SOURCE_MISSING');
    expect(missing.inspection).toBeNull();
    const row = view.rows.find((r) => r.source.id === selection.id)!;
    expect(row.source.revision).toBe(selection.revision! + 1);
    const current = await verifyOwnerActionRequirements(view, {
      key: row.key,
      ...row.source,
    });
    expect(current.inspection?.source.revision).toBe(row.source.revision);
  });
  it.each(['job', 'revoked', 'gate', 'property', 'version'] as const)(
    '%s drift between verification and open denies navigation',
    async (mode) => {
      const f = await fixture(),
        selection = select(f),
        result = await verifyOwnerActionRequirements(f.view, selection),
        callback = vi.fn();
      if (mode === 'job') await drift(f);
      if (mode === 'revoked') revoke(f);
      if (mode === 'gate') f.gate.enabled = false;
      if (mode === 'property') f.entry.target.location_id = 'foreign';
      if (mode === 'version') f.entry.target.version_id = 'foreign';
      expect(
        (
          await continueVerifiedOwnerAction(
            f.view,
            selection,
            result.inspection!,
            true,
            callback,
            { current: callback, generation: 0 },
          )
        ).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('foreign company and other job exact selectors disclose no source facts', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      foreignResult = await verifyOwnerActionRequirements(
        f.view,
        select(foreign),
      );
    expect(foreignResult.inspection).toBeNull();
    expect(foreignResult.row).toBeNull();
    const other = await readVerifiedOwnerBriefing(
        f.sources,
        f.sources.entries[1].target.job_id!,
        f.gate,
      ),
      otherSelection = select({ ...f, view: other }),
      result = await verifyOwnerActionRequirements(f.view, otherSelection);
    expect(result.row).toBeNull();
    expect(result.inspection).toBeNull();
  });
  it('unconfirmed and withdrawn live callback cannot navigate', async () => {
    const f = await fixture(),
      selection = select(f),
      result = await verifyOwnerActionRequirements(f.view, selection),
      callback = vi.fn();
    expect(
      (
        await continueVerifiedOwnerAction(
          f.view,
          selection,
          result.inspection!,
          false,
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(
      (
        await continueVerifiedOwnerAction(
          f.view,
          selection,
          result.inspection!,
          true,
          callback,
          { current: undefined, generation: 1 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('copied original handles or inspections cannot create navigation authority', async () => {
    const f = await fixture(),
      selection = select(f),
      result = await verifyOwnerActionRequirements(f.view, selection),
      callback = vi.fn();
    expect(() =>
      checkOwnerActionRequirements({ ...f.view }, selection),
    ).toThrow();
    expect(
      (
        await continueVerifiedOwnerAction(
          f.view,
          selection,
          { ...result.inspection! },
          true,
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('inspection from a different exact priority cannot open the selected task', async () => {
    const f = await fixture(),
      selection = select(f),
      row = f.view.rows.find(
        (r) =>
          r.key !== selection.key && r.state !== 'UNKNOWN_SOURCE_UNAVAILABLE',
      )!,
      other = await verifyOwnerActionRequirements(f.view, {
        key: row.key,
        ...row.source,
      }),
      callback = vi.fn();
    expect(
      (
        await continueVerifiedOwnerAction(
          f.view,
          selection,
          other.inspection!,
          true,
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('concurrent opens share original custody and invoke at most one callback', async () => {
    const f = await fixture(),
      selection = select(f),
      result = await verifyOwnerActionRequirements(f.view, selection),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    const results = await Promise.all([
      continueVerifiedOwnerAction(
        f.view,
        selection,
        result.inspection!,
        true,
        callback,
        live,
      ),
      continueVerifiedOwnerAction(
        f.view,
        selection,
        result.inspection!,
        true,
        callback,
        live,
      ),
    ]);
    expect(results.map((r) => r.status)).toContain('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('lost acknowledgment remains original UNKNOWN across fresh verification with no replay', async () => {
    const f = await fixture(),
      selection = select(f),
      result = await verifyOwnerActionRequirements(f.view, selection),
      callback = vi.fn(() => {
        throw Error('Lost ack');
      });
    expect(
      (
        await continueVerifiedOwnerAction(
          f.view,
          selection,
          result.inspection!,
          true,
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readVerifiedOwnerBriefing(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('source or membership changes during awaited original inspection withhold returned verification', async () => {
    const f = await fixture(),
      pending = verifyOwnerActionRequirements(f.view, select(f));
    revoke(f);
    await expect(pending).rejects.toThrow();
  });
  it('strict selection rejects getters, extra fields and invalid revisions', async () => {
    const f = await fixture(),
      selection = select(f),
      getter = vi.fn(() => selection.key);
    expect(() =>
      checkOwnerActionRequirements(
        f.view,
        Object.defineProperty({ ...selection }, 'key', { get: getter }),
      ),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      checkOwnerActionRequirements(f.view, {
        ...selection,
        execute: true,
      } as never),
    ).toThrow();
    expect(() =>
      checkOwnerActionRequirements(f.view, { ...selection, revision: -1 }),
    ).toThrow();
  });
  it('default OFF component reads no private sources', () => {
    const getter = vi.fn(() => {
        throw Error('No source read');
      }),
      sources = Object.defineProperty({}, 'company', { get: getter }),
      html = renderToStaticMarkup(
        createElement(OwnerActionVerification, {
          sources: sources as never,
          enabled: false,
        }),
      );
    expect(html).toContain('Owner action verification is OFF');
    expect(getter).not.toHaveBeenCalled();
    expect(html).not.toContain('staff-cost');
  });
});
