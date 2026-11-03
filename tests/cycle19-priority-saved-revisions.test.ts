import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { readDailyActionCenter } from '../src/lib/workflows/daily-action-center';
import {
  readPrioritySavedRevision,
  comparePrioritySavedRevisions,
  filterPrioritySavedRevisions,
  adoptPrioritySavedRevision,
} from '../src/lib/workflows/priority-saved-revisions';
import {
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  assertSavedRevisionCurrent,
} from '../src/lib/workflows/saved-revision-runtime';
import {
  readPriorityActions,
  inspectPriorityAction,
  continuePriorityAction,
} from '../src/lib/workflows/priority-actions';
import { PrioritySavedRevisions } from '../src/components/workflows/PrioritySavedRevisions';
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
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] };
  return {
    gate,
    all,
    entry,
    sources,
    read: () => readPrioritySavedRevision(sources, entry.target.job_id!, gate),
  };
}
async function forecast(f: Awaited<ReturnType<typeof fixture>>, amount = 1700) {
  const job = f.sources.estimates.syntheticJob(
    f.sources.company.id,
    f.entry.target.job_id!,
  )!;
  await f.sources.estimates.projection(f.sources.company.id, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + amount,
    },
  });
}
async function publish(f: Awaited<ReturnType<typeof fixture>>) {
  const repo = f.sources.property,
    org = f.sources.company.id;
  let visit = repo.read(org).visits.find((v) => v.id === f.entry.visit_id)!;
  repo.revise(org, visit);
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.saveVisit(org, visit, {
    ...visit.content,
    summary: visit.content.summary + ' · saved follow-up',
    internal_notes: 'PRIVATE_STAFF_NOTE',
  });
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  repo.submit(org, visit);
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  return repo.publish(org, visit);
}
function during(change: () => void | Promise<void>) {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const r = await original(...args);
    if (!seen) {
      seen = true;
      await change();
    }
    return r;
  });
  return () => expect(seen).toBe(true);
}
const clear = { query: '', area: 'all', changed_only: false };
describe('Cycle19 exact saved priority revision continuity', () => {
  it.each([0, 1, 2])(
    'brand %i actual saved job revision compares before/current and separately adopts presentation',
    async (brand) => {
      const f = await fixture(brand),
        before = await f.read(),
        frozen = JSON.stringify(before),
        selection = createSavedRevisionSelection(before);
      await forecast(f);
      const current = await f.read(),
        c = comparePrioritySavedRevisions(before, current);
      expect(current.evidence.job_revision).toBe(
        before.evidence.job_revision + 1,
      );
      expect(c.comparison.changed).toBe(true);
      expect(c.rows.some((r) => r.status === 'CHANGED')).toBe(true);
      expect(() => assertSavedRevisionCurrent(before)).toThrow();
      expect(readSavedRevisionSelection(selection).snapshot).toBe(before);
      const adopted = adoptPrioritySavedRevision(selection, c, 0, true);
      expect(adopted.snapshot).toBe(current);
      expect(adopted.generation).toBe(1);
      expect(JSON.stringify(before)).toBe(frozen);
      expect(current.evidence.model).toBe('NONE');
      expect(current.operational_ready).toBe(false);
    },
  );
  it.each([0, 1, 2])(
    'brand %i ranks/facts/reasons remain exactly supplied by the existing priority engine',
    async (brand) => {
      const f = await fixture(brand),
        current = await f.read(),
        engine = await readDailyActionCenter(
          f.sources,
          {
            review_on: f.entry.day,
            timezone: f.entry.timezone,
            input_revision: 1,
            ordering: 'EVIDENCE_FIRST',
          },
          f.gate,
        );
      expect(current.evidence.cards.map((c) => c.key)).toEqual(
        engine.cards.map((c) => c.key),
      );
      for (const c of current.evidence.cards) {
        const original = engine.cards.find((e) => e.key === c.key)!;
        expect(c.rank).toBe(original.rank);
        expect(c.recorded_fact).toBe(original.recorded_fact);
        expect(c.suggested_human_review).toBe(original.suggested_human_review);
        expect(c.order_reasons).toEqual(original.order_reasons);
        expect(c.source.version).toBe(original.source.version);
        expect(c.source.source_sha256).toBe(original.source.source_sha256);
        expect(c.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    },
  );
  it.each([0, 1, 2])(
    'brand %i new actual published report retains original ID/version and appears as a distinct source',
    async (brand) => {
      const f = await fixture(brand),
        before = await f.read(),
        report = await publish(f),
        current = await f.read(),
        c = comparePrioritySavedRevisions(before, current),
        row = c.rows.find((r) => r.current?.source.id === report.id)!;
      expect(row.status).toBe('ADDED');
      expect(row.current!.source.version).toBe(report.version);
      expect(
        current.evidence.cards.some(
          (card) =>
            card.source.id === f.entry.report_id &&
            card.source.version === f.entry.published_version,
        ),
      ).toBe(true);
      expect(
        before.evidence.cards.some((card) => card.source.id === report.id),
      ).toBe(false);
      expect(JSON.stringify(current)).not.toContain('PRIVATE_STAFF_NOTE');
    },
  );
  it.each([0, 1, 2])(
    'brand %i actual newly recorded time remains an exact source reference rather than inferred work completion',
    async (brand) => {
      const f = await fixture(brand),
        before = await f.read(),
        worker = (
          await f.sources.estimates.workforce(f.sources.company.id)
        ).workers.find((worker) => worker.id === f.entry.worker_id)!,
        id = await f.sources.estimates.recordTime(
          f.sources.company.id,
          worker.id,
          {
            job_id: f.entry.target.job_id!,
            overhead_center: null,
            task: 'PRIVATE_TASK',
            kind: 'work',
            started_at: f.entry.day + 'T16:00:00Z',
            ended_at: f.entry.day + 'T17:00:00Z',
            billable: true,
            corrects_id: null,
          },
        ),
        current = await f.read(),
        c = comparePrioritySavedRevisions(before, current),
        row = c.rows.find(
          (r) =>
            r.current?.source.kind === 'time' && r.current.source.id === id,
        )!;
      expect(row.status).toBe('ADDED');
      expect(row.current!.source.revision).toBeNull();
      expect(row.current!.authority).toBe('HUMAN_REVIEW_SUGGESTION_ONLY');
      expect(JSON.stringify(current)).not.toContain('PRIVATE_TASK');
    },
  );
  it('unchanged read keeps stable saved card hashes rather than hashing volatile review receipts', async () => {
    const f = await fixture(),
      a = await f.read(),
      b = await f.read(),
      c = comparePrioritySavedRevisions(a, b);
    expect(c.comparison.changed).toBe(false);
    expect(c.rows.every((r) => r.status === 'UNCHANGED')).toBe(true);
    expect(
      filterPrioritySavedRevisions(c, { ...clear, changed_only: true })
        .matching,
    ).toBe(0);
  });
  it('combines original area and literal source search with accurate counts/empty state', async () => {
    const f = await fixture(),
      a = await f.read();
    await forecast(f);
    const c = comparePrioritySavedRevisions(a, await f.read()),
      one = c.rows.find(
        (r) => (r.current ?? r.before)?.source.kind === 'issued',
      )!,
      card = (one.current ?? one.before)!;
    const rows = filterPrioritySavedRevisions(c, {
      ...clear,
      area: 'scope',
      query: card.source.id,
    });
    expect(
      rows.rows.every(
        (r) => (r.current ?? r.before)?.source.id === card.source.id,
      ),
    ).toBe(true);
    expect(rows.available).toBe(c.rows.length);
    expect(
      filterPrioritySavedRevisions(c, { ...clear, query: '[literal.*]' })
        .matching,
    ).toBe(0);
  });
  it.each(['getter', 'extra', 'query', 'area', 'flag'] as const)(
    'invalid %s filter rejects without hooks or alternate areas',
    async (kind) => {
      const f = await fixture(),
        a = await f.read(),
        c = comparePrioritySavedRevisions(a, await f.read()),
        input = { ...clear },
        getter = vi.fn();
      if (kind === 'getter')
        Object.defineProperty(input, 'query', { get: getter });
      if (kind === 'extra') Object.assign(input, { tenant: 'other' });
      if (kind === 'query') input.query = 'x'.repeat(201);
      if (kind === 'area') input.area = 'dispatch';
      if (kind === 'flag') Object.assign(input, { changed_only: 'true' });
      expect(() => filterPrioritySavedRevisions(c, input)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['duplicate', 'competing', 'unconfirmed', 'copy'] as const)(
    'opaque shared CAS blocks %s adoption',
    async (kind) => {
      const f = await fixture(),
        a = await f.read(),
        s = createSavedRevisionSelection(a);
      await forecast(f);
      const b = await f.read(),
        c = comparePrioritySavedRevisions(a, b),
        other = comparePrioritySavedRevisions(a, b);
      if (kind === 'duplicate' || kind === 'competing')
        adoptPrioritySavedRevision(s, c, 0, true);
      expect(() =>
        adoptPrioritySavedRevision(
          s,
          kind === 'competing'
            ? other
            : kind === 'copy'
              ? structuredClone(c)
              : c,
          0,
          kind !== 'unconfirmed',
        ),
      ).toThrow();
      expect(readSavedRevisionSelection(s).generation).toBe(
        kind === 'duplicate' || kind === 'competing' ? 1 : 0,
      );
    },
  );
  it('later canonical save invalidates current comparison without replacing retained original', async () => {
    const f = await fixture(),
      a = await f.read(),
      s = createSavedRevisionSelection(a);
    await forecast(f);
    const c = comparePrioritySavedRevisions(a, await f.read());
    await forecast(f);
    expect(() => adoptPrioritySavedRevision(s, c, 0, true)).toThrow();
    expect(readSavedRevisionSelection(s).snapshot).toBe(a);
  });
  it.each(['member', 'property', 'company', 'source', 'gate'] as const)(
    'async %s replacement rejects mixed saved source snapshots',
    async (kind) => {
      const f = await fixture(),
        hit = during(async () => {
          if (kind === 'member') {
            const own = f.sources.operations.syntheticMemberships.bind(
              f.sources.operations,
            );
            vi.spyOn(
              f.sources.operations,
              'syntheticMemberships',
            ).mockImplementation((org) =>
              own(org).map((m) => ({ ...m, active: false })),
            );
          }
          if (kind === 'property')
            f.entry.target.location_id = f.all.entries[1].target.location_id;
          if (kind === 'company') f.sources.company = sampleCompanies[1];
          if (kind === 'source') await forecast(f);
          if (kind === 'gate') f.gate.confirmed = false;
        });
      await expect(f.read()).rejects.toThrow();
      hit();
    },
  );
  it.each(['revoked', 'foreign', 'property', 'issued'] as const)(
    '%s identity cannot adopt or expose stale recommendations',
    async (kind) => {
      const f = await fixture(),
        a = await f.read(),
        s = createSavedRevisionSelection(a),
        c = comparePrioritySavedRevisions(a, await f.read());
      if (kind === 'revoked') {
        const own = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          own(org).map((m) => ({ ...m, active: false })),
        );
      }
      if (kind === 'foreign') f.sources.company = sampleCompanies[1];
      if (kind === 'property')
        f.entry.target.location_id = f.all.entries[1].target.location_id;
      if (kind === 'issued') f.entry.target.version_id = crypto.randomUUID();
      expect(() => adoptPrioritySavedRevision(s, c, 0, true)).toThrow();
      expect(() => filterPrioritySavedRevisions(c, clear)).toThrow();
    },
  );
  it('same-property sibling jobs, clones and invalid job hints cannot replace exact evidence', async () => {
    const f = await fixture(),
      a = await f.read(),
      sibling = f.all.entries[3];
    expect(sibling.target.location_id).toBe(f.entry.target.location_id);
    const other = await readPrioritySavedRevision(
      f.all,
      sibling.target.job_id!,
      f.gate,
    );
    expect(() => comparePrioritySavedRevisions(a, other)).toThrow();
    expect(() =>
      comparePrioritySavedRevisions(structuredClone(a), a),
    ).toThrow();
    await expect(
      readPrioritySavedRevision(f.sources, crypto.randomUUID(), f.gate),
    ).rejects.toThrow();
  });
  it('read/adopt never invokes original business, model, financial or communication commands', async () => {
    const f = await fixture(),
      a = await f.read(),
      s = createSavedRevisionSelection(a),
      writers = [
        vi.spyOn(f.sources.estimates, 'projection'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.entry.release, 'command'),
      ],
      c = comparePrioritySavedRevisions(a, await f.read());
    adoptPrioritySavedRevision(s, c, 0, true);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(JSON.stringify(c)).not.toMatch(
      /cash_hour_minor|burden_bps|salary_week_minor|payroll|supplier|classification_review_reference/,
    );
  });
  it('read/adopt cannot renew original canonical ambiguous priority continuation', async () => {
    const f = await fixture(),
      original = await readPriorityActions(
        f.sources,
        { job_id: f.entry.target.job_id! },
        f.gate,
      ),
      row = original.cards.find((c) => c.source.kind === 'report')!,
      task = await inspectPriorityAction(original, row.key),
      lost = async () => {
        throw Error('lost ack');
      };
    await expect(
      continuePriorityAction(original, task, lost, {
        current: lost,
        generation: 0,
      }),
    ).rejects.toThrow();
    const a = await f.read(),
      s = createSavedRevisionSelection(a);
    await forecast(f);
    adoptPrioritySavedRevision(
      s,
      comparePrioritySavedRevisions(a, await f.read()),
      0,
      true,
    );
    await expect(
      readPriorityActions(
        { ...f.sources, entries: [f.entry] },
        { job_id: f.entry.target.job_id! },
        f.gate,
      ),
    ).rejects.toThrow('UNKNOWN');
  });
  it.each(['off', 'truthy', 'production', 'remote', 'https'] as const)(
    '%s denies before source hooks and renders no controls',
    async (mode) => {
      const getter = vi.fn(() => {
          throw Error('no source read');
        }),
        poison = {};
      Object.defineProperty(poison, 'company', { get: getter });
      if (mode === 'production') vi.stubEnv('DEV', false);
      if (mode === 'remote')
        vi.stubGlobal('window', {
          location: { hostname: 'example.com', protocol: 'http:' },
        });
      if (mode === 'https')
        vi.stubGlobal('window', {
          location: { hostname: 'localhost', protocol: 'https:' },
        });
      const enabled =
          mode === 'truthy' ? ('true' as unknown as boolean) : mode !== 'off',
        sources = poison as OperatingSources;
      await expect(
        readPrioritySavedRevision(sources, 'job', { enabled, confirmed: true }),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(PrioritySavedRevisions, { sources, enabled }),
        ),
      ).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'brand %i renders exact selected job without auto-reading or invoking callbacks',
    async (brand) => {
      const f = await fixture(brand),
        read = vi.spyOn(f.sources.estimates, 'jobs'),
        callback = vi.fn(),
        html = renderToStaticMarkup(
          createElement(PrioritySavedRevisions, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.entry.target.job_id!,
            onSelectJob: callback,
            onContinue: callback,
          }),
        );
      expect(html).toContain('Read saved priority revision');
      expect(html).toContain(f.entry.target.job_id!);
      expect(html).not.toContain('Shared record search');
      expect(read).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
      expect(
        renderToStaticMarkup(
          createElement(PrioritySavedRevisions, {
            sources: f.sources,
            enabled: true,
            selectedJobId: crypto.randomUUID(),
          }),
        ),
      ).not.toContain('<button');
    },
  );
});
