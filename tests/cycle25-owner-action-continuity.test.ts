import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readVerifiedOwnerBriefing,
  compareVerifiedOwnerBriefing,
  assertVerifiedOwnerComparisonCurrent,
} from '../src/lib/workflows/verified-owner-briefing';
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
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[0],
    org = sources.company.id,
    job = entry.target.job_id!;
  const read = () => readVerifiedOwnerBriefing(sources, job, gate);
  return { gate, sources, entry, org, job, read, view: await read() };
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
async function forecast(f: Fixture) {
  const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
  await f.sources.estimates.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 1,
    },
  });
}
describe('Cycle25 original owner action refresh continuity', () => {
  it.each([0, 1, 2])(
    'brand %i exact unchanged selection survives refresh as presentation requiring fresh verification',
    async (brand) => {
      const f = await fixture(brand),
        selection = select(f),
        current = await f.read(),
        beforeRaw = JSON.stringify(f.view.rows),
        nextRaw = JSON.stringify(current.rows);
      const result = compareOwnerActionRefresh(f.view, current, selection);
      expect(result.status).toBe('UNCHANGED_REVERIFY_REQUIRED');
      expect(result.selection).toEqual(selection);
      expect(result.requires_verification).toBe(true);
      expect(result.previous_confirmation_retained).toBe(false);
      expect(result.operational_authority).toBe(false);
      expect(result.comparison.rows).toEqual(
        compareVerifiedOwnerBriefing(f.view, current).rows,
      );
      expect(current.rows.map((r) => r.key)).toEqual(
        f.view.rows.map((r) => r.key),
      );
      expect(JSON.stringify(f.view.rows)).toBe(beforeRaw);
      expect(JSON.stringify(current.rows)).toBe(nextRaw);
      expect(Object.isFrozen(result.selection)).toBe(true);
      expect(result).not.toHaveProperty('inspection');
      const verified = await verifyOwnerActionRequirements(
        current,
        result.selection!,
      );
      expect(verified.row?.order_reasons).toEqual(
        current.rows.find((r) => r.key === selection.key)!.order_reasons,
      );
      expect(verified.operational_authority).toBe(false);
    },
  );
  it.each([0, 1, 2])(
    'brand %i actual recorded cost change clears a same-key selected action without inventing completion',
    async (brand) => {
      const f = await fixture(brand),
        selection = select(f, 'finance'),
        old = await verifyOwnerActionRequirements(f.view, selection),
        frozen = JSON.stringify(old);
      const id = f.view.original.costs.material.expense_id!;
      await f.sources.estimates.reviewExpense(
        f.org,
        f.job,
        id,
        'approved',
        'Original exact review only',
      );
      const current = await f.read(),
        result = compareOwnerActionRefresh(f.view, current, selection);
      expect(current.rows.some((row) => row.key === selection.key)).toBe(true);
      expect(result.status).toBe('SOURCE_CHANGED_RESELECT_REQUIRED');
      expect(result.selection).toBeNull();
      const difference = result.comparison.rows.find(
        (r) => r.key === selection.key,
      )!;
      expect(difference.before_fact).toBe(old.row!.recorded_fact);
      expect(difference.current_fact).toBe(
        current.rows.find((row) => row.key === selection.key)!.recorded_fact,
      );
      // The native provider-evidence summary can remain the same while its exact
      // cost/version facts change. Wording is never proof of source identity.
      expect(difference.before_fact).toBe(difference.current_fact);
      expect(difference.facts).not.toEqual(old.facts);
      expect(difference.facts).toEqual(
        current.rows.find((row) => row.key === selection.key)!.facts,
      );
      expect(difference.status).toBe('CHANGED');
      expect(difference.facts.join(' ')).toContain('NO_GO');
      expect(JSON.stringify(old)).toBe(frozen);
      expect(result.previous_confirmation_retained).toBe(false);
    },
  );
  it.each([0, 1, 2])(
    'brand %i revised visit never substitutes its new source key for the original selection',
    async (brand) => {
      const f = await fixture(brand),
        selection = select(f, 'visit'),
        visit = f.sources.property
          .read(f.org)
          .visits.find((v) => v.id === selection.id)!;
      f.sources.property.saveVisit(f.org, visit, {
        ...visit.content,
        summary: 'Native saved visit revision',
      });
      const current = await f.read(),
        result = compareOwnerActionRefresh(f.view, current, selection),
        absent = result.comparison.rows.find((r) => r.key === selection.key)!;
      expect(result.status).toBe('UNKNOWN_SOURCE_MISSING');
      expect(result.selection).toBeNull();
      expect(absent.current_fact).toBeNull();
      expect(absent.recorded_state).toBe('NOT_PRESENT_IN_CURRENT_READ_UNKNOWN');
      expect(absent.facts.join(' ')).toContain('not evidence of completion');
      expect(
        current.rows.some(
          (r) =>
            r.source.id === selection.id &&
            r.source.revision === selection.revision! + 1,
        ),
      ).toBe(true);
    },
  );
  it('refresh without selection never selects the first or newest available priority', async () => {
    const f = await fixture(),
      current = await f.read(),
      result = compareOwnerActionRefresh(f.view, current);
    expect(result.status).toBe('NO_PREVIOUS_SELECTION');
    expect(result.selection).toBeNull();
    expect(result.comparison.rows).toHaveLength(current.rows.length);
  });
  it.each([
    'key',
    'kind',
    'id',
    'revision',
    'version',
    'extra',
    'getter',
  ] as const)(
    '%s selection substitution is denied without getter execution',
    async (field) => {
      const f = await fixture(),
        current = await f.read(),
        selection = select(f),
        getter = vi.fn(() => selection.key);
      const input =
        field === 'extra'
          ? { ...selection, authorize: true }
          : field === 'getter'
            ? Object.defineProperty({ ...selection }, 'key', { get: getter })
            : {
                ...selection,
                [field]:
                  field === 'revision' || field === 'version'
                    ? (selection[field] ?? 0) + 1
                    : 'foreign',
              };
      expect(() =>
        compareOwnerActionRefresh(f.view, current, input as never),
      ).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['revoked', 'property', 'version', 'gate', 'stale-current'] as const)(
    '%s change cannot expose or retain a comparison or action',
    async (mode) => {
      const f = await fixture(),
        selection = select(f),
        current = await f.read(),
        refreshed = compareOwnerActionRefresh(f.view, current, selection);
      if (mode === 'revoked') revoke(f);
      if (mode === 'property') f.entry.target.location_id = 'foreign';
      if (mode === 'version') f.entry.target.version_id = 'foreign';
      if (mode === 'gate') f.gate.confirmed = false;
      if (mode === 'stale-current') await forecast(f);
      expect(() =>
        assertVerifiedOwnerComparisonCurrent(refreshed.comparison),
      ).toThrow();
      expect(() =>
        compareOwnerActionRefresh(f.view, current, selection),
      ).toThrow();
      await expect(
        verifyOwnerActionRequirements(current, selection),
      ).rejects.toThrow();
    },
  );
  it('foreign tenant and sibling native jobs cannot be compared as continuation of the selected source', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      sibling = await readVerifiedOwnerBriefing(
        f.sources,
        f.sources.entries[1].target.job_id!,
        f.gate,
      );
    expect(() =>
      compareOwnerActionRefresh(f.view, foreign.view, select(f)),
    ).toThrow();
    expect(() =>
      compareOwnerActionRefresh(f.view, sibling, select(f)),
    ).toThrow();
    expect(() =>
      compareOwnerActionRefresh({ ...f.view }, f.view, select(f)),
    ).toThrow();
  });
  it('fresh verification and original live callback are required after refresh', async () => {
    const f = await fixture(),
      selection = select(f),
      current = await f.read(),
      refreshed = compareOwnerActionRefresh(f.view, current, selection),
      verified = await verifyOwnerActionRequirements(
        current,
        refreshed.selection!,
      ),
      callback = vi.fn();
    expect(
      (
        await continueVerifiedOwnerAction(
          current,
          refreshed.selection!,
          verified.inspection!,
          false,
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(
      (
        await continueVerifiedOwnerAction(
          current,
          refreshed.selection!,
          verified.inspection!,
          true,
          callback,
          { current: undefined, generation: 1 },
        )
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
    const live = { current: callback, generation: 2 };
    const outcomes = await Promise.all([
      continueVerifiedOwnerAction(
        current,
        refreshed.selection!,
        verified.inspection!,
        true,
        callback,
        live,
      ),
      continueVerifiedOwnerAction(
        current,
        refreshed.selection!,
        verified.inspection!,
        true,
        callback,
        live,
      ),
    ]);
    expect(outcomes.some((r) => r.status === 'CURRENT_REVIEW_ONLY')).toBe(true);
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      f.job,
      verified.inspection!.step,
    );
  });
  it('refresh cannot renew an UNKNOWN original continuation or clear its exact one-use hold', async () => {
    const f = await fixture(),
      current = await f.read(),
      refreshed = compareOwnerActionRefresh(f.view, current, select(f)),
      verified = await verifyOwnerActionRequirements(
        current,
        refreshed.selection!,
      ),
      callback = vi.fn(() => {
        throw Error('Lost acknowledgment');
      });
    expect(
      (
        await continueVerifiedOwnerAction(
          current,
          refreshed.selection!,
          verified.inspection!,
          true,
          callback,
          { current: callback, generation: 0 },
        )
      ).status,
    ).toBe('UNKNOWN');
    await expect(f.read()).rejects.toThrow();
    expect(() =>
      compareOwnerActionRefresh(f.view, current, refreshed.selection!),
    ).toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
