import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readDailyActionCenter } from '../src/lib/workflows/daily-action-center';
import * as handoff from '../src/lib/workflows/verified-task-handoff';
import * as navigation from '../src/lib/workflows/operating-navigation';
import { prepareIntelligenceWorkflow } from '../src/lib/workflows/intelligence-workflow';
import {
  readOwnerActionDesk,
  filterOwnerActionDesk,
  openOwnerActionDeskTask,
  assertOwnerActionDeskTaskCurrent,
  returnOwnerActionDeskTask,
  navigateOwnerActionDeskTask,
} from '../src/lib/workflows/owner-action-desk';
import { OwnerActionDesk } from '../src/components/workflows/OwnerActionDesk';

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
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[index], gate),
    sources = { ...all, entries: [all.entries[0]] },
    input = {
      review_on: sources.entries[0].day,
      timezone: sources.entries[0].timezone,
      ordering: 'EVIDENCE_FIRST' as const,
      input_revision: 1,
    };
  return {
    gate,
    all,
    sources,
    input,
    read: () => readOwnerActionDesk(sources, input, gate),
  };
}
async function selected(index = 0) {
  const f = await fixture(index),
    review = await f.read(),
    row = review.tasks.find((t) => t.source.kind === 'report')!,
    task = await openOwnerActionDeskTask(review, row.key, row.job_id!);
  return { ...f, review, row, task };
}
const allFilter = {
  query: '',
  section: 'all',
  job_id: null,
  band: 'all',
} as const;
describe('Cycle17 source-verified owner action desk', () => {
  it.each([
    ...[0, 1, 2].map(
      (index) => ({ index, kind: 'finance', section: 'finance' }) as const,
    ),
    ...(
      [
        ['issued', 'sales'],
        ['visit', 'field'],
        ['report', 'completion'],
      ] as const
    ).map(([kind, section]) => ({ index: 0, kind, section })),
  ])(
    'brand $index combines actual $kind explanation and exact $section destination in one original inspection',
    async ({ index, kind, section }) => {
      const f = await fixture(index),
        before = JSON.stringify({
          release: f.sources.entries[0].release.read('staff'),
          source: f.sources.estimates.readSyntheticPrototypeSources(
            f.sources.entries[0].target,
          ),
          property: f.sources.property.read(f.sources.company.id),
        }),
        command = vi.spyOn(f.sources.entries[0].release, 'command'),
        projection = vi.spyOn(f.sources.estimates, 'projection'),
        review = await f.read(),
        row = review.tasks.find((t) => t.source.kind === kind)!,
        inspect = vi.spyOn(handoff, 'inspectVerifiedTaskHandoff'),
        task = await openOwnerActionDeskTask(review, row.key, row.job_id!);
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(task.anchor).toMatchObject({
        key: row.key,
        job_id: row.job_id,
        source_id: row.source.id,
        source_kind: kind,
        source_version: row.source.version,
        source_revision: row.source.revision,
        target: row.source.target,
        section,
      });
      expect(task.recorded_fact).toBe(row.recorded_fact);
      expect(task.next_review).toBe(row.suggested_human_review);
      expect(task.original_rank).toBe(row.rank);
      expect(task.order_reasons).toEqual(row.order_reasons);
      expect(task.destination).toEqual(row.navigation);
      expect(task.verification.required_checks).toEqual(
        row.verification.required_checks,
      );
      expect(Date.parse(task.expires_at) - Date.parse(task.inspected_at)).toBe(
        handoff.taskHandoffWindowMs,
      );
      expect(returnOwnerActionDeskTask(task)).toMatchObject({
        status: 'CURRENT_EXACT_OWNER_TASK_RETURN',
        anchor: task.anchor,
        replacement: null,
      });
      const callback = vi.fn();
      expect(
        navigateOwnerActionDeskTask(task, callback, row.job_id!).status,
      ).toBe('EXACT_OWNER_TASK_NAVIGATION_REQUESTED');
      expect(callback).toHaveBeenCalledExactlyOnceWith(row.job_id, section);
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(Object.values(review.authority).every((v) => v === false)).toBe(
        true,
      );
      expect(JSON.stringify(task)).not.toMatch(
        /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100|Synthetic planning supplier/,
      );
      expect(
        JSON.stringify({
          release: f.sources.entries[0].release.read('staff'),
          source: f.sources.estimates.readSyntheticPrototypeSources(
            f.sources.entries[0].target,
          ),
          property: f.sources.property.read(f.sources.company.id),
        }),
      ).toBe(before);
      expect(command).not.toHaveBeenCalled();
      expect(projection).not.toHaveBeenCalled();
    },
  );
  it('retains original priority order and literal combined filters without new scores or inspections', async () => {
    const f = await fixture(),
      daily = await readDailyActionCenter(f.sources, f.input, f.gate),
      review = await f.read(),
      row = review.tasks.find((t) => t.source.kind === 'report')!,
      task = await openOwnerActionDeskTask(review, row.key),
      bytes = JSON.stringify(task),
      inspect = vi.spyOn(handoff, 'inspectVerifiedTaskHandoff');
    expect(review.tasks.map((t) => t.key)).toEqual(
      daily.cards.map((c) => c.key),
    );
    const found = filterOwnerActionDesk(review, {
      query: row.source.id,
      section: 'completion',
      job_id: row.job_id,
      band: row.review_band,
    });
    expect(found.tasks.map((t) => t.key)).toContain(row.key);
    expect(
      found.tasks.every(
        (t) => t.job_id === row.job_id && t.review_band === row.review_band,
      ),
    ).toBe(true);
    expect(
      filterOwnerActionDesk(review, { ...allFilter, query: '[literal.*]' })
        .matching,
    ).toBe(0);
    expect(returnOwnerActionDeskTask(task).status).toBe(
      'CURRENT_EXACT_OWNER_TASK_RETURN',
    );
    expect(JSON.stringify(task)).toBe(bytes);
    expect(inspect).not.toHaveBeenCalled();
    expect(() =>
      filterOwnerActionDesk(review, { ...allFilter, query: 'x'.repeat(201) }),
    ).toThrow();
  });
  it('a real existing-engine time segment opens Field with its exact original identity', async () => {
    const f = await fixture(),
      entry = f.sources.entries[0],
      time = await f.sources.estimates.recordTime(
        f.sources.company.id,
        entry.worker_id,
        {
          job_id: entry.target.job_id!,
          overhead_center: null,
          task: 'Explicit TEST recorded segment',
          kind: 'work',
          started_at: entry.day + 'T15:30:00.000Z',
          ended_at: entry.day + 'T16:30:00.000Z',
          billable: false,
          corrects_id: null,
        },
      ),
      review = await f.read(),
      row = review.tasks.find((t) => t.source.id === time)!,
      task = await openOwnerActionDeskTask(review, row.key),
      callback = vi.fn();
    expect(task.anchor.source_id).toBe(time);
    expect(task.anchor.section).toBe('field');
    expect(navigateOwnerActionDeskTask(task, callback).status).toBe(
      'EXACT_OWNER_TASK_NAVIGATION_REQUESTED',
    );
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      entry.target.job_id,
      'field',
    );
  });
  it.each(['expiry', 'rollback', 'invalid-clock'] as const)(
    '%s remains terminal UNKNOWN without a renewed original window',
    async (kind) => {
      const f = await selected(),
        bytes = JSON.stringify(f.task),
        now = Date.now(),
        clock = vi.spyOn(Date, 'now'),
        callback = vi.fn();
      clock.mockReturnValue(
        kind === 'expiry'
          ? Date.parse(f.task.expires_at)
          : kind === 'rollback'
            ? Date.parse(f.task.inspected_at) - 1
            : Number.NaN,
      );
      expect(navigateOwnerActionDeskTask(f.task, callback)).toEqual({
        status: 'UNKNOWN',
        replacement: null,
      });
      expect(callback).not.toHaveBeenCalled();
      clock.mockReturnValue(now);
      expect(returnOwnerActionDeskTask(f.task).status).toBe('UNKNOWN');
      expect(() => assertOwnerActionDeskTaskCurrent(f.task)).toThrow();
      expect(JSON.stringify(f.task)).toBe(bytes);
      await expect(
        openOwnerActionDeskTask(f.review, f.row.key),
      ).rejects.toThrow('already held');
    },
  );
  it.each([
    'member',
    'source',
    'report-version',
    'workflow',
    'input',
    'gate',
    'root',
  ] as const)('withholds %s drift at direct task navigation', async (kind) => {
    const f = await selected(),
      entry = f.sources.entries[0],
      callback = vi.fn();
    if (kind === 'member') {
      const memberships = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) => memberships(org).map((m) => ({ ...m, active: false })),
      );
    }
    if (kind === 'source') {
      const job = f.sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ).job!;
      await f.sources.estimates.projection(f.sources.company.id, job, {
        ...job.projection,
        remaining: {
          ...job.projection.remaining,
          other: job.projection.remaining.other + 1,
        },
      });
    }
    if (kind === 'report-version') {
      const state = f.sources.property.read(f.sources.company.id),
        report = state.reports.find((r) => r.id === f.task.anchor.source_id)!;
      report.version++;
      vi.spyOn(f.sources.property, 'read').mockImplementation(() =>
        structuredClone(state),
      );
    }
    if (kind === 'workflow')
      await prepareIntelligenceWorkflow(
        entry.estimates,
        entry.target,
        { review_on: entry.day, advanced: null },
        f.gate,
      );
    if (kind === 'input') f.input.input_revision++;
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'root') f.sources.entries = [...f.sources.entries];
    expect(navigateOwnerActionDeskTask(f.task, callback).status).toBe(
      'UNKNOWN',
    );
    expect(callback).not.toHaveBeenCalled();
    expect(returnOwnerActionDeskTask(f.task).status).toBe('UNKNOWN');
  });
  it.each(['expiry', 'revocation'] as const)(
    'rechecks %s inside the original final callback before the host sees navigation',
    async (kind) => {
      const f = await selected(),
        original = navigation.navigateOperatingSuggestion,
        callback = vi.fn(),
        clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
      vi.spyOn(navigation, 'navigateOperatingSuggestion').mockImplementation(
        (detail, forward) =>
          original(detail, (job, section) => {
            if (kind === 'expiry')
              clock.mockReturnValue(Date.parse(f.task.expires_at));
            else f.gate.confirmed = false;
            forward(job, section);
          }),
      );
      expect(navigateOwnerActionDeskTask(f.task, callback).status).toBe(
        'UNKNOWN',
      );
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('claims the original task once against duplicate/reentrant host callbacks', async () => {
    const f = await selected();
    let nested: unknown;
    const callback = vi.fn(() => {
      nested = navigateOwnerActionDeskTask(f.task, callback);
    });
    expect(navigateOwnerActionDeskTask(f.task, callback).status).toBe(
      'UNKNOWN',
    );
    expect(nested).toEqual({ status: 'UNKNOWN', replacement: null });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(navigateOwnerActionDeskTask(f.task, callback).status).toBe(
      'UNKNOWN',
    );
  });
  it('lost host acknowledgement stays UNKNOWN and exact read-only return does not replay', async () => {
    const f = await selected(),
      callback = vi.fn(() => {
        throw Error('Lost acknowledgement');
      });
    expect(navigateOwnerActionDeskTask(f.task, callback).status).toBe(
      'UNKNOWN',
    );
    expect(returnOwnerActionDeskTask(f.task).status).toBe('UNKNOWN');
    expect(navigateOwnerActionDeskTask(f.task, callback).status).toBe(
      'UNKNOWN',
    );
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('final-await withdrawal retains the existing source inspection hold with no new read', async () => {
    const f = await fixture(),
      review = await f.read(),
      row = review.tasks[0],
      original = handoff.inspectVerifiedTaskHandoff;
    vi.spyOn(handoff, 'inspectVerifiedTaskHandoff').mockImplementation(
      async (...args) => {
        const result = await original(...args);
        f.gate.confirmed = false;
        return result;
      },
    );
    await expect(openOwnerActionDeskTask(review, row.key)).rejects.toThrow();
    f.gate.confirmed = true;
    vi.restoreAllMocks();
    await expect(openOwnerActionDeskTask(review, row.key)).rejects.toThrow();
    await expect(f.read()).rejects.toThrow();
  });
  it('concurrent/original/fresh or relabelled inspections never reset the source read or task hold', async () => {
    const f = await fixture(),
      review = await f.read(),
      row = review.tasks[0],
      results = await Promise.allSettled([
        openOwnerActionDeskTask(review, row.key),
        handoff.inspectVerifiedTaskHandoff(review, row.key),
      ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(openOwnerActionDeskTask(review, row.key)).rejects.toThrow(
      'already held',
    );
    await expect(
      readOwnerActionDesk(
        { ...f.sources },
        { ...f.input, input_revision: 2, ordering: 'RECORDED_DAY_FIRST' },
        f.gate,
      ),
    ).rejects.toThrow('already held');
  });
  it('validates same-property different-job hints before original inspection and never falls back', async () => {
    const f = await fixture(),
      review = await f.read(),
      entry = f.sources.entries[0],
      other = f.all.entries[3],
      row = review.tasks.find((t) => t.job_id === entry.target.job_id)!;
    expect(entry.target.location_id).toBe(other.target.location_id);
    await expect(
      openOwnerActionDeskTask(review, row.key, other.target.job_id!),
    ).rejects.toThrow();
    await expect(
      openOwnerActionDeskTask(review, row.key, crypto.randomUUID()),
    ).rejects.toThrow();
    const task = await openOwnerActionDeskTask(
        review,
        row.key,
        entry.target.job_id!,
      ),
      callback = vi.fn();
    expect(
      navigateOwnerActionDeskTask(task, callback, other.target.job_id!).status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
    expect(returnOwnerActionDeskTask(task, entry.target.job_id!).status).toBe(
      'UNKNOWN',
    );
  });
  it.each(['foreign', 'property', 'missing-job', 'ambiguous'] as const)(
    'never substitutes %s source records',
    async (kind) => {
      const f = await fixture();
      if (kind === 'foreign') {
        const other = await fixture(1);
        f.sources.entries = [other.sources.entries[0]];
      }
      if (kind === 'property')
        f.sources.entries[0].target.location_id =
          f.all.entries[1].target.location_id;
      if (kind === 'missing-job')
        f.sources.entries[0].target.job_id = crypto.randomUUID();
      if (kind === 'ambiguous')
        f.sources.entries = [...f.sources.entries, f.sources.entries[0]];
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('rejects copied task/destination and arbitrary section or unknown key', async () => {
    const f = await selected(),
      callback = vi.fn(),
      copy = structuredClone(f.task);
    Object.assign(copy.destination, {
      section: 'https://example.invalid',
      status: 'EXACT_LOCAL_REVIEW_TARGET',
    });
    expect(navigateOwnerActionDeskTask(copy, callback).status).toBe('UNKNOWN');
    expect(returnOwnerActionDeskTask(copy).status).toBe('UNKNOWN');
    await expect(
      openOwnerActionDeskTask(f.review, 'unknown-key'),
    ).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
  it.each(['off', 'truthy', 'production', 'remote', 'https'] as const)(
    '%s admission precedes all source getters and mounted controls',
    async (mode) => {
      const getter = vi.fn(() => {
          throw Error('Must not read');
        }),
        poison = {};
      Object.defineProperties(poison, {
        company: { get: getter, enumerable: true },
        toJSON: { value: getter, enumerable: true },
      });
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
        sources = poison as Parameters<typeof readOwnerActionDesk>[0];
      await expect(
        readOwnerActionDesk(
          sources,
          {
            review_on: '',
            timezone: '',
            ordering: 'EVIDENCE_FIRST',
            input_revision: 1,
          },
          { enabled, confirmed: true },
        ),
      ).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(OwnerActionDesk, { sources, enabled }),
        ),
      ).not.toContain('<input');
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['staff', 'inactive'] as const)(
    'denies %s access before private owner priorities',
    async (kind) => {
      const f = await fixture(),
        memberships = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          memberships(org).map((m) => ({
            ...m,
            role: kind === 'staff' ? 'staff' : m.role,
            active: kind !== 'inactive',
          })),
      );
      await expect(f.read()).rejects.toThrow();
      expect(
        renderToStaticMarkup(
          createElement(OwnerActionDesk, { sources: f.sources, enabled: true }),
        ),
      ).not.toContain('<input');
    },
  );
  it.each([0, 1, 2])(
    'brand %i renders clear source confirmation and rejects an unadmitted hint before controls',
    async (index) => {
      const f = await fixture(index),
        html = renderToStaticMarkup(
          createElement(OwnerActionDesk, {
            sources: f.sources,
            enabled: true,
            selectedJobId: f.sources.entries[0].target.job_id!,
          }),
        );
      expect(html).toContain('Owner action desk');
      expect(html).toContain('Read owner action desk');
      expect(html).not.toContain('<pre');
      expect(html).not.toContain('Open original job review');
      expect(
        renderToStaticMarkup(
          createElement(OwnerActionDesk, {
            sources: f.sources,
            enabled: true,
            selectedJobId: crypto.randomUUID(),
          }),
        ),
      ).not.toContain('<input');
    },
  );
});
