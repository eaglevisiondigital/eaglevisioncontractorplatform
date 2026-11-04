import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  compareRecordedOwnerActions,
  recordedOwnerActionCards,
} from '../src/lib/workflows/recorded-owner-actions';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readVerifiedOwnerBriefing,
  assertVerifiedOwnerBriefingCurrent,
  compareVerifiedOwnerBriefing,
  assertVerifiedOwnerComparisonCurrent,
  inspectVerifiedOwnerDifference,
  inspectVerifiedOwnerPriority,
  continueVerifiedOwnerPriority,
} from '../src/lib/workflows/verified-owner-briefing';
import { VerifiedOwnerBriefing } from '../src/components/workflows/VerifiedOwnerBriefing';
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
    entry = sources.entries[0];
  return {
    gate,
    sources,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) =>
  readVerifiedOwnerBriefing(f.sources, f.job, f.gate);
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
describe('Cycle23 verified owner briefing retains original ranking and observed differences', () => {
  it.each([0, 1, 2])(
    'case %# brand %i copies original ranks, facts and source identity without authority',
    async (brand) => {
      const f = await fixture(brand),
        view = await read(f),
        cards = recordedOwnerActionCards(view.original.original);
      expect(view.rows.map((r) => r.key)).toEqual(cards.map((c) => c.key));
      expect(view.rows.map((r) => r.rank)).toEqual(cards.map((c) => c.rank));
      expect(
        view.rows.every(
          (r, i) =>
            r.source.id === cards[i].source.id &&
            r.recorded_fact === cards[i].recorded_fact,
        ),
      ).toBe(true);
      expect(view.operational_ready).toBe(false);
      expect(view.meaning).toBe(
        'ORIGINAL_RANKED_CURRENT_STATE_NOT_COMPLETION_OR_AUTHORITY',
      );
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i two explicit unchanged reads preserve exact original comparison statuses',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        current = await read(f),
        comparison = compareVerifiedOwnerBriefing(before, current),
        original = compareRecordedOwnerActions(
          before.original.original,
          current.original.original,
          { query: '', area: 'all', changed_only: false },
        );
      expect(comparison.rows.map((r) => [r.key, r.status])).toEqual(
        original.rows.map((r) => [(r.current ?? r.before)!.key, r.status]),
      );
      expect(comparison.rows.every((r) => r.status === 'UNCHANGED')).toBe(true);
      expect(comparison.rows.map((r) => r.original_rank)).toEqual(
        current.rows.map((r) => r.rank),
      );
      expect(comparison.history).toBe(
        'TWO_EXPLICIT_LOCAL_READS_NOT_DURABLE_BUSINESS_HISTORY',
      );
    },
  );
  it.each([0, 1, 2])(
    'case %# brand %i actual material review invalidates prior facts and explains changed current finance evidence',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        raw = JSON.stringify(before.rows),
        id = before.original.costs.material.expense_id!;
      await confirmCostCorrectionReview(
        before.original.costs,
        {
          expense_id: id,
          decision: 'approved',
          reason: 'Explicit recorded material review.',
        },
        true,
      );
      expect(() => assertVerifiedOwnerBriefingCurrent(before)).toThrow();
      const current = await read(f),
        comparison = compareVerifiedOwnerBriefing(before, current),
        finance = comparison.rows.filter((r) => r.source.kind === 'finance');
      expect(finance.some((r) => r.status === 'CHANGED')).toBe(true);
      expect(
        finance.some((r) => r.facts.some((t) => t.includes('NO_GO'))),
      ).toBe(true);
      expect(
        finance.some((r) =>
          r.facts.some((t) =>
            t.includes(
              `Current job revision: ${current.original.costs.costs.evidence.job_revision}`,
            ),
          ),
        ),
      ).toBe(true);
      expect(JSON.stringify(before.rows)).toBe(raw);
      expect(
        current.original.costs.costs.evidence.facts.cost_coverage,
      ).not.toBe('DECLARED_COSTS_COMPLETE');
    },
  );
  it('changed native visit revision retains removed card as UNKNOWN without key/text substitution', async () => {
    const f = await fixture(),
      before = await read(f),
      old = before.rows.find(
        (r) =>
          r.source.kind === 'visit' &&
          r.source.id === f.entry.scheduled_visit_id,
      )!,
      visit = f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === old.source.id)!;
    f.sources.property.saveVisit(f.org, visit, {
      ...visit.content,
      summary: 'Explicit native visit revision.',
    });
    const current = await read(f),
      comparison = compareVerifiedOwnerBriefing(before, current),
      absent = comparison.rows.find((r) => r.key === old.key)!;
    expect(absent.status).toBe('NOT_PRESENT_IN_CURRENT_READ');
    expect(absent.recorded_state).toBe('NOT_PRESENT_IN_CURRENT_READ_UNKNOWN');
    expect(absent.can_inspect).toBe(false);
    expect(absent.current_fact).toBe(null);
    expect(absent.facts.join(' ')).toContain('not evidence of completion');
    await expect(
      inspectVerifiedOwnerDifference(comparison, old.key),
    ).rejects.toThrow();
    expect(
      comparison.rows.some(
        (r) =>
          r.source.id === old.source.id &&
          r.source.revision === old.source.revision! + 1 &&
          r.can_inspect,
      ),
    ).toBe(true);
  });
  it('new actual publication preserves old immutable published versions and exposes added exact source', async () => {
    const f = await fixture(),
      before = await read(f),
      reports = f.sources.property.read(f.org).reports,
      exercise = await readSavedSourceExercise(f.sources, f.job, f.gate);
    await executeSavedSourceExercise(exercise, 'report-revision', true);
    const current = await read(f),
      comparison = compareVerifiedOwnerBriefing(before, current);
    expect(
      f.sources.property.read(f.org).reports.slice(0, reports.length),
    ).toEqual(reports);
    expect(
      comparison.rows.some(
        (r) => r.source.kind === 'report' && r.status === 'ADDED',
      ),
    ).toBe(true);
    expect(
      comparison.rows
        .filter((r) => r.source.kind === 'report')
        .every((r) =>
          r.facts.some((text) =>
            text.includes('does not establish acceptance'),
          ),
        ),
    ).toBe(true);
  });
  it.each([0, 1, 2])(
    'case %# brand %i inspected exact difference opens original checked destination once',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        current = await read(f),
        comparison = compareVerifiedOwnerBriefing(before, current),
        row = comparison.rows.find((r) => r.can_inspect)!,
        source = await inspectVerifiedOwnerDifference(comparison, row.key),
        callback = vi.fn(),
        live = { current: callback, generation: 0 };
      expect(
        (await continueVerifiedOwnerPriority(current, source, callback, live))
          .status,
      ).toBe('CURRENT_REVIEW_ONLY');
      expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, source.step);
      expect(
        (await continueVerifiedOwnerPriority(current, source, callback, live))
          .status,
      ).toBe('WITHHELD_NO_DISPATCH');
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['revoked', 'property', 'version', 'job', 'gate'] as const)(
    'case %# %s drift removes comparison authority and withholds navigation',
    async (mode) => {
      const f = await fixture(),
        before = await read(f),
        current = await read(f),
        comparison = compareVerifiedOwnerBriefing(before, current),
        source = await inspectVerifiedOwnerDifference(
          comparison,
          comparison.rows.find((r) => r.can_inspect)!.key,
        ),
        callback = vi.fn();
      if (mode === 'revoked') revoke(f);
      if (mode === 'property') f.entry.target.location_id = 'foreign';
      if (mode === 'version') f.entry.target.version_id = 'foreign';
      if (mode === 'job') await forecast(f);
      if (mode === 'gate') f.gate.confirmed = false;
      expect(() => assertVerifiedOwnerComparisonCurrent(comparison)).toThrow();
      expect(
        (
          await continueVerifiedOwnerPriority(current, source, callback, {
            current: callback,
            generation: 0,
          })
        ).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('foreign tenant and different native job comparisons cannot form an alternative source history', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      before = await read(f),
      other = await read(foreign);
    expect(() => compareVerifiedOwnerBriefing(before, other)).toThrow();
    const sibling = await readVerifiedOwnerBriefing(
      f.sources,
      f.sources.entries[1].target.job_id!,
      f.gate,
    );
    expect(() => compareVerifiedOwnerBriefing(before, sibling)).toThrow();
    await expect(
      readVerifiedOwnerBriefing(f.sources, foreign.job, f.gate),
    ).rejects.toThrow();
  });
  it('unknown or copied comparison and inspection identity cannot authorize navigation', async () => {
    const f = await fixture(),
      view = await read(f),
      comparison = compareVerifiedOwnerBriefing(view, view),
      callback = vi.fn();
    expect(() => assertVerifiedOwnerBriefingCurrent({ ...view })).toThrow();
    expect(() =>
      assertVerifiedOwnerComparisonCurrent({ ...comparison }),
    ).toThrow();
    await expect(
      inspectVerifiedOwnerDifference(comparison, 'missing'),
    ).rejects.toThrow();
    const source = await inspectVerifiedOwnerPriority(view, view.rows[0].key);
    expect(
      (
        await continueVerifiedOwnerPriority(view, { ...source }, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('concurrent staff continuations share original attempt custody and invoke at most one callback', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectVerifiedOwnerPriority(view, view.rows[0].key),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    const results = await Promise.all([
      continueVerifiedOwnerPriority(view, source, callback, live),
      continueVerifiedOwnerPriority(view, source, callback, live),
    ]);
    expect(results.map((r) => r.status)).toContain('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('ambiguous callback retains UNKNOWN on fresh source wrapper without replay or invented completion', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectVerifiedOwnerPriority(view, view.rows[0].key),
      callback = vi.fn(() => {
        throw Error('Lost exact acknowledgment');
      });
    expect(
      (
        await continueVerifiedOwnerPriority(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(read(f)).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('callback generation withdrawal is withheld before dispatch and source changes after inspection stay UNKNOWN', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectVerifiedOwnerPriority(view, view.rows[0].key),
      callback = vi.fn();
    expect(
      (
        await continueVerifiedOwnerPriority(view, source, callback, {
          current: undefined,
          generation: 1,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
    await forecast(f);
    expect(
      (
        await continueVerifiedOwnerPriority(view, source, callback, {
          current: callback,
          generation: 2,
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  });
  it('revocation during a pending read rejects source facts', async () => {
    const f = await fixture(),
      pending = read(f);
    f.gate.confirmed = false;
    await expect(pending).rejects.toThrow();
  });
  it('OFF, non-loopback and production admissions never touch hostile source getters', async () => {
    const getter = vi.fn(() => {
        throw Error('No read');
      }),
      sources = Object.defineProperty({}, 'entries', {
        get: getter,
      }) as Fixture['sources'];
    await expect(readVerifiedOwnerBriefing(sources, 'x')).rejects.toThrow();
    vi.stubGlobal('window', {
      location: { hostname: 'example.com', protocol: 'https:' },
    });
    await expect(
      readVerifiedOwnerBriefing(sources, 'x', {
        enabled: true,
        confirmed: true,
      }),
    ).rejects.toThrow();
    vi.stubEnv('DEV', false);
    await expect(
      readVerifiedOwnerBriefing(sources, 'x', {
        enabled: true,
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('default component exposes neither source facts nor customer completion actions', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedOwnerBriefing, {
        sources: {} as Fixture['sources'],
        enabled: false,
      }),
    );
    expect(html).toContain('Verified owner briefing is OFF');
    expect(html).not.toContain('Record completion');
    expect(html).not.toContain('Send message');
    expect(html).not.toContain('staff-cost');
  });
});
