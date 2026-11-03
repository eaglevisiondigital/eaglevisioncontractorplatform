import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readPrioritySavedRevision } from '../src/lib/workflows/priority-saved-revisions';
import {
  readDailyWorkContext,
  continueDailyWorkContext,
} from '../src/lib/workflows/daily-workbench-runtime';
import {
  readRecordedOwnerActions,
  recordedOwnerActionCards,
  assertRecordedOwnerActionsCurrent,
  assertRecordedOwnerActionsAccess,
  compareRecordedOwnerActions,
  inspectRecordedOwnerAction,
  continueRecordedOwnerAction,
} from '../src/lib/workflows/recorded-owner-actions';
import { RecordedOwnerActions } from '../src/components/workflows/RecordedOwnerActions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] };
  return {
    all,
    sources,
    gate,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) => readRecordedOwnerActions(f.sources, f.job, f.gate);
async function forecast(f: Fixture) {
  const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
  await f.sources.estimates.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 1000,
    },
  });
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
describe('Cycle21 recorded owner actions use original recorded source and navigation engines', () => {
  it('rejects executable admission without evaluating its getter', async () => {
    const getter = vi.fn(() => {
      throw Error('Executable gate');
    });
    const gate = Object.defineProperty({ confirmed: true }, 'enabled', {
      get: getter,
      enumerable: true,
    });
    await expect(
      readRecordedOwnerActions({} as never, 'missing', gate as never),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])(
    'brand %i priorities change from actual reviewed material source state',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        id = await f.sources.estimates.submitExpense(f.org, f.job, {
          purchase_key: 'LOCAL-C21-EXPLAINED',
          supplier: 'Synthetic source',
          reference: 'LOCAL-C21-EXPLAINED',
          category: 'materials',
          kind: 'commitment',
          amount_minor: 700,
          description: 'Actual canonical synthetic internal commitment',
          estimate_line_id: null,
          quantity_milli: null,
          unit: null,
          unit_cost_minor: null,
          document_ids: [],
          material_approval_id: null,
        });
      await f.sources.estimates.reviewExpense(
        f.org,
        f.job,
        id,
        'approved',
        'Explicit synthetic source review',
      );
      const current = await read(f),
        changes = compareRecordedOwnerActions(before, current, {
          query: '',
          area: 'all',
          changed_only: true,
        });
      expect(current.snapshot.evidence.job_revision).toBeGreaterThan(
        before.snapshot.evidence.job_revision,
      );
      expect(changes.matching).toBeGreaterThan(0);
      expect(
        changes.rows.some((row) => row.current?.source.kind === 'finance'),
      ).toBe(true);
    },
  );
  it.each([0, 1, 2])(
    'brand %i actual saved time sources retain exact IDs without implying posted cost',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
          job_id: f.job,
          overhead_center: null,
          task: 'Canonical recorded task',
          kind: 'work',
          started_at: `${f.entry.day}T10:00:00.000Z`,
          ended_at: `${f.entry.day}T11:00:00.000Z`,
          billable: false,
          corrects_id: null,
        });
      if (typeof id !== 'string')
        throw Error('Exact canonical time ID required');
      await f.sources.estimates.submitTime(f.org, id);
      await f.sources.estimates.reviewTime(
        f.org,
        id,
        'approved',
        'Synthetic internal review, unposted',
      );
      const current = await read(f),
        changes = compareRecordedOwnerActions(before, current, {
          query: '',
          area: 'all',
          changed_only: true,
        });
      expect(changes.matching).toBeGreaterThan(0);
      expect(
        current.snapshot.evidence.cards.some(
          (card) =>
            card.source.id === id || card.source.related_ids.includes(id),
        ),
      ).toBe(true);
      expect((await f.sources.estimates.workforce(f.org)).periods).toHaveLength(
        0,
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i retains canonical ranking, identities and explanations',
    async (brand) => {
      const f = await fixture(brand),
        original = await readPrioritySavedRevision(f.sources, f.job, f.gate),
        value = await read(f);
      expect(recordedOwnerActionCards(value)).toEqual(original.evidence.cards);
      expect(value.snapshot.identity).toEqual(original.identity);
      expect(value.model).toBe('NONE');
      expect(value.operational_ready).toBe(false);
      expect(value.meaning).toBe(
        'CURRENT_RECORDED_SOURCES_NOT_AUTHORIZED_ACTIONS',
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i explains actual saved source changes without automatically acting',
    async (brand) => {
      const f = await fixture(brand),
        before = await read(f),
        old = JSON.stringify(before.snapshot),
        callback = vi.fn();
      await forecast(f);
      expect(() => assertRecordedOwnerActionsCurrent(before)).toThrow();
      assertRecordedOwnerActionsAccess(before);
      const current = await read(f),
        rows = compareRecordedOwnerActions(before, current, {
          query: '',
          area: 'all',
          changed_only: false,
        });
      expect(
        rows.rows.some((r) => r.status === 'CHANGED' || r.status === 'ADDED'),
      ).toBe(true);
      expect(JSON.stringify(before.snapshot)).toBe(old);
      expect(callback).not.toHaveBeenCalled();
      expect(current.snapshot.evidence.job_revision).toBeGreaterThan(
        before.snapshot.evidence.job_revision,
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i source inspection opens only exact existing review once',
    async (brand) => {
      const f = await fixture(brand),
        value = await read(f),
        source = await inspectRecordedOwnerAction(
          value,
          value.navigation.cards[0].key,
        ),
        callback = vi.fn(),
        live = { current: callback, generation: 0 };
      expect(
        (await continueRecordedOwnerAction(value, source, callback, live))
          .status,
      ).toBe('CURRENT_REVIEW_ONLY');
      expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, source.step);
      expect(
        (await continueRecordedOwnerAction(value, source, callback, live))
          .status,
      ).toBe('WITHHELD_NO_DISPATCH');
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it('same source re-read shows unchanged original rows and truthful literal empty filters', async () => {
    const f = await fixture(),
      before = await read(f),
      current = await read(f);
    const rows = compareRecordedOwnerActions(before, current, {
      query: '',
      area: 'all',
      changed_only: false,
    });
    expect(rows.rows.every((r) => r.status === 'UNCHANGED')).toBe(true);
    expect(
      compareRecordedOwnerActions(before, current, {
        query: 'not-in-recorded-source',
        area: 'all',
        changed_only: false,
      }).matching,
    ).toBe(0);
    expect(
      compareRecordedOwnerActions(before, current, {
        query: '',
        area: 'all',
        changed_only: true,
      }).matching,
    ).toBe(0);
  });
  it.each([
    { query: 'x'.repeat(201), area: 'all', changed_only: false },
    { query: '', area: 'dispatch', changed_only: false },
  ])('rejects invalid source filter %j', async (input) => {
    const f = await fixture(),
      a = await read(f),
      b = await read(f);
    expect(() => compareRecordedOwnerActions(a, b, input)).toThrow();
  });
  it.each(['revocation', 'property', 'company', 'entry', 'estimate'])(
    'withholds source details after %s change',
    async (mode) => {
      const f = await fixture(),
        value = await read(f);
      if (mode === 'revocation') revoke(f);
      if (mode === 'property')
        f.entry.target.location_id = f.all.entries[1].target.location_id;
      if (mode === 'company')
        f.entry.target.organization_id = sampleCompanies[1].id;
      if (mode === 'entry') f.sources.entries = [{ ...f.entry }];
      if (mode === 'estimate') f.entry.target.version_id = crypto.randomUUID();
      expect(() => recordedOwnerActionCards(value)).toThrow();
      await expect(
        inspectRecordedOwnerAction(value, value.navigation.cards[0].key),
      ).rejects.toThrow();
    },
  );
  it('OFF precedes source and selected-job descriptors', async () => {
    const getter = vi.fn(() => {
      throw Error('source read');
    });
    await expect(
      readRecordedOwnerActions(
        Object.defineProperty({}, 'entries', { get: getter }) as never,
        'foreign',
      ),
    ).rejects.toThrow('OFF');
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['foreign', 'missing'])(
    'fresh %s job never falls back',
    async (mode) => {
      const f = await fixture(),
        other = await fixture(1);
      await expect(
        readRecordedOwnerActions(
          f.sources,
          mode === 'foreign' ? other.job : 'missing',
          f.gate,
        ),
      ).rejects.toThrow();
    },
  );
  it('does not accept a structurally copied view or fake source inspection', async () => {
    const f = await fixture(),
      value = await read(f),
      source = await inspectRecordedOwnerAction(
        value,
        value.navigation.cards[0].key,
      ),
      callback = vi.fn();
    expect(() => assertRecordedOwnerActionsCurrent({ ...value })).toThrow();
    expect(
      (
        await continueRecordedOwnerAction(value, { ...source }, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('unknown and other-job cards never match by text or rank', async () => {
    const f = await fixture(),
      value = await read(f);
    await expect(
      inspectRecordedOwnerAction(value, 'not-recorded'),
    ).rejects.toThrow();
    const other = await readRecordedOwnerActions(
      f.all,
      f.all.entries[1].target.job_id!,
      f.gate,
    );
    await expect(
      inspectRecordedOwnerAction(value, other.navigation.cards[0].key),
    ).rejects.toThrow();
  });
  it('stale after inspection is UNKNOWN without navigation or replay', async () => {
    const f = await fixture(),
      value = await read(f),
      source = await inspectRecordedOwnerAction(
        value,
        value.navigation.cards[0].key,
      ),
      callback = vi.fn();
    await forecast(f);
    expect(
      (
        await continueRecordedOwnerAction(value, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  });
  it('callback removal or generation change is withheld without dispatch', async () => {
    const f = await fixture(),
      value = await read(f),
      source = await inspectRecordedOwnerAction(
        value,
        value.navigation.cards[0].key,
      ),
      callback = vi.fn();
    expect(
      (
        await continueRecordedOwnerAction(value, source, callback, {
          current: undefined,
          generation: 1,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('failed navigation retains original UNKNOWN across fresh wrappers', async () => {
    const f = await fixture(),
      value = await read(f),
      source = await inspectRecordedOwnerAction(
        value,
        value.navigation.cards[0].key,
      ),
      callback = vi.fn(async () => {
        throw Error('lost outcome');
      });
    expect(
      (
        await continueRecordedOwnerAction(value, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readRecordedOwnerActions({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('concurrent original-source wrappers share original navigation custody', async () => {
    const f = await fixture(),
      a = await read(f),
      b = await readRecordedOwnerActions({ ...f.sources }, f.job, f.gate),
      one = await inspectRecordedOwnerAction(a, a.navigation.cards[0].key),
      two = await inspectRecordedOwnerAction(b, b.navigation.cards[0].key);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      wait = new Promise<void>((r) => {
        release = r;
      }),
      callback = vi.fn(async () => {
        entered();
        await wait;
      });
    const first = continueRecordedOwnerAction(a, one, callback, {
      current: callback,
      generation: 0,
    });
    await started;
    expect(
      (
        await continueRecordedOwnerAction(b, two, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('PENDING');
    release();
    expect((await first).status).toBe('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('does not reopen a pre-existing original daily UNKNOWN', async () => {
    const f = await fixture(),
      original = await readDailyWorkContext(f.sources, f.job, f.gate);
    await continueDailyWorkContext(original, 'finance', () => {
      throw Error('lost');
    });
    await expect(read(f)).rejects.toThrow();
  });
  it('comparison rejects foreign original tenant or job', async () => {
    const f = await fixture(),
      value = await read(f),
      other = await read(await fixture(1));
    expect(() =>
      compareRecordedOwnerActions(value, other, {
        query: '',
        area: 'all',
        changed_only: false,
      }),
    ).toThrow();
    const otherJob = await readRecordedOwnerActions(
      f.all,
      f.all.entries[1].target.job_id!,
      f.gate,
    );
    expect(() =>
      compareRecordedOwnerActions(value, otherJob, {
        query: '',
        area: 'all',
        changed_only: false,
      }),
    ).toThrow();
  });
  it('no writes, evidence files, providers, finance execution or model calls on read/compare/inspect', async () => {
    const f = await fixture(),
      submit = vi.spyOn(f.sources.estimates, 'submitExpense'),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense'),
      payroll = vi.spyOn(f.sources.estimates, 'payroll'),
      save = vi.spyOn(f.sources.property, 'saveVisit'),
      fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const value = await read(f),
      current = await read(f);
    compareRecordedOwnerActions(value, current, {
      query: '',
      area: 'all',
      changed_only: false,
    });
    await inspectRecordedOwnerAction(current, current.navigation.cards[0].key);
    expect(submit).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(value)).not.toMatch(
      /unit_cost_minor|staff_notes|worker_rate|payroll_deduction|PRIVATE_SENTINEL/,
    );
  });
  it('default-OFF UI never reads sources and retains clear authority labels', () => {
    const markup = renderToStaticMarkup(
      createElement(RecordedOwnerActions, { sources: {} as never }),
    );
    expect(markup).toContain('Recorded owner actions are OFF');
    expect(markup).toContain('Suggestions');
    expect(markup).not.toContain('Download');
  });
});
