import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  prepareSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
  decodeSavedEvidence,
} from '../src/lib/workflows/saved-evidence-runtime';
import { readPrioritySavedRevision } from '../src/lib/workflows/priority-saved-revisions';
import {
  readDailyWorkContext,
  continueDailyWorkContext,
} from '../src/lib/workflows/daily-workbench-runtime';
import {
  recordedPriorityRecipe,
  parseRecordedPriorityEvidence,
  assertRecordedPrioritySource,
  readRecordedPriorityNavigation,
  inspectRecordedPrioritySource,
  continueRecordedPrioritySource,
  assertRecordedPriorityNavigationCurrent,
} from '../src/lib/workflows/recorded-priority-navigation';
import { RecordedPriorityNavigation } from '../src/components/workflows/RecordedPriorityNavigation';
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
    gate,
    all,
    sources,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function read(f: Fixture) {
  return readRecordedPriorityNavigation(f.sources, f.job, f.gate);
}
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
async function rehash(
  text: string,
  edit: (value: Record<string, unknown>) => void,
) {
  const value = JSON.parse(text);
  edit(value.payload);
  const { sha256: _, ...body } = value;
  void _;
  value.sha256 = await documentHash(body);
  return JSON.stringify(value);
}
function during(change: () => void | Promise<void>) {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...a) => {
    const r = await original(...a);
    if (!seen) {
      seen = true;
      await change();
    }
    return r;
  });
  return () => expect(seen).toBe(true);
}
describe('Cycle20 recorded priorities evidence and exact original navigation', () => {
  it.each([0, 1, 2])(
    'brand %i preserves all original ranked cards in a current reopened file',
    async (brand) => {
      const f = await fixture(brand),
        snapshot = await readPrioritySavedRevision(f.sources, f.job, f.gate),
        file = await prepareSavedEvidence(
          f.sources,
          f.job,
          recordedPriorityRecipe,
          f.gate,
        ),
        opened = await openSavedEvidence(
          f.sources,
          f.job,
          recordedPriorityRecipe,
          file.text,
          f.gate,
        );
      expect(opened.envelope.payload).toEqual(snapshot.evidence);
      expect(await reconcileSavedEvidence(opened)).toMatchObject({
        status: 'CURRENT_MATCH',
        authority: false,
        canonical_restore: false,
      });
      expect(file.envelope.payload.model).toBe('NONE');
    },
  );
  it.each([0, 1, 2])(
    'brand %i inspected source continues through both original exact context guards',
    async (brand) => {
      const f = await fixture(brand),
        view = await read(f),
        source = await inspectRecordedPrioritySource(view, view.cards[0].key),
        callback = vi.fn(),
        live = { current: callback, generation: 0 },
        before = JSON.stringify(f.entry.release.read('staff'));
      expect(
        (await continueRecordedPrioritySource(view, source, callback, live))
          .status,
      ).toBe('CURRENT_REVIEW_ONLY');
      expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, source.step);
      expect(JSON.stringify(f.entry.release.read('staff'))).toBe(before);
      expect(
        (await continueRecordedPrioritySource(view, source, callback, live))
          .status,
      ).toBe('WITHHELD_NO_DISPATCH');
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it.each([0, 1, 2])(
    'brand %i current financial save stales the retained historical file without altering it',
    async (brand) => {
      const f = await fixture(brand),
        file = await prepareSavedEvidence(
          f.sources,
          f.job,
          recordedPriorityRecipe,
          f.gate,
        ),
        original = file.text;
      await forecast(f);
      expect(await reconcileSavedEvidence(file)).toMatchObject({
        status: 'STALE_SAVED_EVIDENCE',
      });
      expect(
        (
          await openSavedEvidence(
            f.sources,
            f.job,
            recordedPriorityRecipe,
            original,
            f.gate,
          )
        ).text,
      ).toBe(original);
      expect(
        file.envelope.payload.cards.every(
          (c) => c.authority === 'HUMAN_REVIEW_SUGGESTION_ONLY',
        ),
      ).toBe(true);
    },
  );
  it.each(['finance', 'report', 'visit', 'issued'] as const)(
    'kind %s maps the exact inspected source to an original local tab',
    async (kind) => {
      const f = await fixture(),
        view = await read(f),
        card = view.cards.find((c) => c.source.kind === kind);
      expect(card).toBeDefined();
      const source = await inspectRecordedPrioritySource(view, card!.key),
        callback = vi.fn();
      await continueRecordedPrioritySource(view, source, callback, {
        current: callback,
        generation: 1,
      });
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        f.job,
        {
          finance: 'finance',
          report: 'customer',
          visit: 'field',
          issued: 'priorities',
        }[kind],
      );
      expect(source.source.id).toBe(card!.source.id);
    },
  );
  it('time source uses actual existing time identity and field destination', async () => {
    const f = await fixture(),
      id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'PRIVATE_TASK',
        kind: 'work',
        started_at: `${f.entry.day}T14:00:00.000Z`,
        ended_at: `${f.entry.day}T15:00:00.000Z`,
        billable: true,
        corrects_id: null,
      });
    expect(typeof id).toBe('string');
    const view = await read(f),
      card = view.cards.find(
        (c) => c.source.kind === 'time' && c.source.id === id,
      );
    expect(card).toBeDefined();
    const source = await inspectRecordedPrioritySource(view, card!.key);
    expect(source.step).toBe('field');
  });
  it('uninspected fabricated source cannot navigate', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn();
    expect(
      (
        await continueRecordedPrioritySource(view, { ...source }, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('unknown card and other-job card do not fall back', async () => {
    const f = await fixture(),
      view = await read(f);
    await expect(
      inspectRecordedPrioritySource(view, 'unrecorded'),
    ).rejects.toThrow();
    await expect(
      readRecordedPriorityNavigation(
        f.sources,
        f.all.entries[1].target.job_id!,
        f.gate,
      ),
    ).rejects.toThrow();
  });
  it.each(['revoked', 'wrong-property', 'foreign', 'invalid-job'])(
    'fresh file ownership rejects %s',
    async (mode) => {
      const f = await fixture(),
        file = await prepareSavedEvidence(
          f.sources,
          f.job,
          recordedPriorityRecipe,
          f.gate,
        );
      if (mode === 'revoked') revoke(f);
      if (mode === 'wrong-property')
        f.entry.target.location_id = f.all.entries[1].target.location_id;
      const sources =
        mode === 'foreign' ? (await fixture(1)).sources : f.sources;
      await expect(
        openSavedEvidence(
          sources,
          mode === 'invalid-job' ? 'foreign' : f.job,
          recordedPriorityRecipe,
          file.text,
          f.gate,
        ),
      ).rejects.toThrow();
    },
  );
  it('retained stale view cannot inspect or continue after actual saved changes', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn();
    await forecast(f);
    expect(() => assertRecordedPriorityNavigationCurrent(view)).toThrow();
    expect(
      (
        await continueRecordedPrioritySource(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  });
  it('staff revocation after inspection withholds evidence and navigation', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn();
    revoke(f);
    expect(() => assertRecordedPriorityNavigationCurrent(view)).toThrow();
    expect(
      (
        await continueRecordedPrioritySource(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  });
  it('callback removal before invocation is known withheld with no dispatch', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn();
    expect(
      (
        await continueRecordedPrioritySource(view, source, callback, {
          current: undefined,
          generation: 1,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('callback remove/restore generation drift during await prevents dispatch', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn(),
      live = { current: callback, generation: 0 },
      seen = during(() => {
        live.generation += 2;
      });
    const result = await continueRecordedPrioritySource(
      view,
      source,
      callback,
      live,
    );
    seen();
    expect(result.status).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('async rejection remains UNKNOWN and does not replay through fresh wrappers', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn(async () => {
        throw Error('lost outcome');
      });
    expect(
      (
        await continueRecordedPrioritySource(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readRecordedPriorityNavigation({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('async resolution is observed before successful navigation acknowledgment', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn(async () => {
        await Promise.resolve();
      });
    expect(
      (
        await continueRecordedPrioritySource(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('concurrent same-canonical wrappers invoke at most one callback', async () => {
    const f = await fixture(),
      a = await read(f),
      b = await readRecordedPriorityNavigation({ ...f.sources }, f.job, f.gate),
      one = await inspectRecordedPrioritySource(a, a.cards[0].key),
      two = await inspectRecordedPrioritySource(b, b.cards[0].key);
    let release!: () => void, entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      wait = new Promise<void>((resolve) => {
        release = resolve;
      }),
      callback = vi.fn(async () => {
        entered();
        await wait;
      }),
      first = continueRecordedPrioritySource(a, one, callback, {
        current: callback,
        generation: 0,
      });
    await enteredPromise;
    const second = await continueRecordedPrioritySource(b, two, callback, {
      current: callback,
      generation: 0,
    });
    expect(second.status).toBe('PENDING');
    release();
    expect((await first).status).toBe('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('post-invocation source drift is UNKNOWN across fresh wrappers', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      callback = vi.fn(async () => {
        await forecast(f);
      });
    expect(
      (
        await continueRecordedPrioritySource(view, source, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readRecordedPriorityNavigation({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('preexisting original daily UNKNOWN cannot be renewed by priority reads', async () => {
    const f = await fixture(),
      original = await readDailyWorkContext(f.sources, f.job, f.gate);
    await continueDailyWorkContext(original, 'finance', () => {
      throw Error('original UNKNOWN');
    });
    await expect(read(f)).rejects.toThrow();
  });
  it('post-invocation callback generation drift is UNKNOWN rather than successful', async () => {
    const f = await fixture(),
      view = await read(f),
      source = await inspectRecordedPrioritySource(view, view.cards[0].key),
      live: { current: (() => void) | undefined; generation: number } = {
        current: undefined,
        generation: 0,
      },
      callback = vi.fn(() => {
        live.generation++;
      });
    live.current = callback;
    expect(
      (await continueRecordedPrioritySource(view, source, callback, live))
        .status,
    ).toBe('UNKNOWN');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it.each([
    'staff_notes',
    'unit_cost_minor',
    'worker_rate',
    'model_action',
    'send_authority',
  ])('strict recipe rejects rehashed extra field %s', async (key) => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedPriorityRecipe,
        f.gate,
      ),
      text = await rehash(file.text, (p) => {
        p[key] = 'PRIVATE_SENTINEL';
      });
    await expect(
      decodeSavedEvidence(text, recordedPriorityRecipe),
    ).rejects.toThrow();
  });
  it('rehashed foreign source ID is rejected by actual current source witness', async () => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedPriorityRecipe,
        f.gate,
      ),
      text = await rehash(file.text, (p) => {
        (p.cards as { source: { id: string } }[])[0].source.id =
          crypto.randomUUID();
      });
    await expect(
      openSavedEvidence(f.sources, f.job, recordedPriorityRecipe, text, f.gate),
    ).rejects.toThrow();
  });
  it('source-equivalent forged recommendation is rejected even after recomputing file hash', async () => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedPriorityRecipe,
        f.gate,
      ),
      text = await rehash(file.text, (p) => {
        (
          p.cards as { suggested_human_review: string }[]
        )[0].suggested_human_review = 'Authorize financial execution';
      });
    await expect(
      openSavedEvidence(f.sources, f.job, recordedPriorityRecipe, text, f.gate),
    ).rejects.toThrow();
  });
  it('duplicate card identities and malformed numeric version are rejected', async () => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedPriorityRecipe,
        f.gate,
      ),
      payload = structuredClone(file.envelope.payload);
    payload.cards.push(payload.cards[0]);
    expect(() =>
      parseRecordedPriorityEvidence(payload, file.envelope.identity),
    ).toThrow();
    payload.cards.pop();
    payload.cards[0].source.version = -1;
    expect(() =>
      parseRecordedPriorityEvidence(payload, file.envelope.identity),
    ).toThrow();
  });
  it('file exact issued and property context cannot be substituted', async () => {
    const f = await fixture(),
      snapshot = await readPrioritySavedRevision(f.sources, f.job, f.gate),
      payload = structuredClone(recordedPriorityRecipe.project(snapshot));
    payload.cards[0].source.issued_version.version_id = crypto.randomUUID();
    expect(() => assertRecordedPrioritySource(payload, snapshot)).toThrow();
  });
  it('gate withdrawal during file read prevents payload exposure', async () => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedPriorityRecipe,
        f.gate,
      ),
      seen = during(() => {
        f.gate.confirmed = false;
      });
    await expect(
      openSavedEvidence(
        f.sources,
        f.job,
        recordedPriorityRecipe,
        file.text,
        f.gate,
      ),
    ).rejects.toThrow();
    seen();
  });
  it('OFF is checked before source getters and original readers', async () => {
    let reads = 0;
    const sources = new Proxy({} as OperatingSources, {
      get() {
        reads++;
        throw Error('getter');
      },
    });
    await expect(
      readRecordedPriorityNavigation(sources, 'job'),
    ).rejects.toThrow();
    expect(reads).toBe(0);
    expect(
      renderToStaticMarkup(
        createElement(RecordedPriorityNavigation, { sources }),
      ),
    ).toContain('OFF');
    expect(reads).toBe(0);
  });
  it('portable priority content excludes private source objects and execution authority', async () => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedPriorityRecipe,
        f.gate,
      );
    expect(file.text).not.toMatch(
      /PRIVATE|cash_hour_minor|salary_week_minor|worker_id|unit_cost_minor|supplier|private_notes|dispatch_authority/,
    );
    expect(file.envelope.payload.authority).toBe('READ_ONLY_NO_ACTION_RENEWAL');
  });
});
