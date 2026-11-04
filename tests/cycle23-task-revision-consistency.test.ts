import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { reportUuid } from '../src/domain/property/report-page';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  analyzeTaskRevisionGraph,
  readTaskRevisionConsistency,
  inspectTaskRevisionConsistency,
  selectTaskRevisionLineage,
  taskRevisionDestination,
} from '../src/lib/workflows/task-revision-consistency';
import { TaskRevisionConsistency } from '../src/components/workflows/TaskRevisionConsistency';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0, seed = true) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!;
  let id = '';
  if (seed) {
    const result = await sources.estimates.recordTime(org, entry.worker_id, {
      job_id: job,
      overhead_center: null,
      task: 'Actual original task <text>',
      kind: 'work',
      started_at: '2026-10-01T08:00:00Z',
      ended_at: '2026-10-01T09:00:00Z',
      billable: false,
      corrects_id: null,
    });
    if (typeof result !== 'string' || !reportUuid(result))
      throw Error('Native UUID required');
    id = result;
    await sources.estimates.submitTime(org, id);
    await sources.estimates.reviewTime(
      org,
      id,
      'approved',
      'PRIVATE internal review reason',
    );
  }
  return { gate, all, entry, sources, org, job, id };
}
type F = Awaited<ReturnType<typeof fixture>>;
const rows = (f: F) =>
  f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).workforce;
async function correction(f: F) {
  const review = await readTaskCorrectionReview(f.sources, f.job, f.gate, f.id);
  return {
    review,
    input: {
      source_entry_id: f.id,
      task: 'Explicit corrected task',
      started_at: review.source.started_at,
      ended_at: review.source.ended_at,
      billable: true,
    },
  };
}
it.each([0, 1, 2])(
  'brand %i binds actual original receipt graph to current work order and saved visit revisions',
  async (brand) => {
    const f = await fixture(brand),
      r = await correction(f);
    await saveTaskCorrectionReview(r.review, r.input, true);
    const record = vi.spyOn(f.sources.estimates, 'recordTime'),
      network = vi.spyOn(globalThis, 'fetch'),
      snapshot = await readTaskRevisionConsistency(f.sources, f.job, f.gate),
      d = inspectTaskRevisionConsistency(snapshot);
    expect(d.graph.consistency).toBe('AVAILABLE_LINKS_CONSISTENT');
    expect(d.graph.nodes).toHaveLength(2);
    expect(d.receipt_consistency).toBe('EXACT_RESULT_LINKED');
    expect(d.work_order.source.job_id).toBe(f.job);
    expect(d.work_order.source.issued_version_id).toBe(
      f.entry.target.version_id,
    );
    expect(
      d.work_order.visits.some((v) => v.id === f.entry.scheduled_visit_id),
    ).toBe(true);
    const selected = selectTaskRevisionLineage(snapshot, d.receipt.result_id!);
    expect(selected.nodes).toHaveLength(2);
    expect(selected.receipt_link).toBe('EXACT_RECEIPT_RESULT');
    expect(selected.selected_winner).toBeNull();
    expect(selectTaskRevisionLineage(snapshot, f.id).receipt_link).toBe(
      'EXACT_RECEIPT_SOURCE',
    );
    expect(taskRevisionDestination(snapshot, f.id)).toEqual({
      job_id: f.job,
      step: 'field',
    });
    expect(d.graph.physical_completion).toBe('UNVERIFIED');
    expect(d.replay).toBe('FORBIDDEN');
    expect(record).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  },
);
async function nativeChild(
  f: F,
  source: string,
  start = '2026-10-02T08:00:00Z',
  end = '2026-10-02T09:00:00Z',
) {
  const result = await f.sources.estimates.recordTime(
    f.org,
    f.entry.worker_id,
    {
      job_id: f.job,
      overhead_center: null,
      task: 'Same wording is not provenance',
      kind: 'work',
      started_at: start,
      ended_at: end,
      billable: false,
      corrects_id: source,
    },
  );
  if (typeof result !== 'string') throw Error('Actual native ID required');
  await f.sources.estimates.submitTime(f.org, result);
  await f.sources.estimates.reviewTime(
    f.org,
    result,
    'approved',
    'PRIVATE review',
  );
  return result;
}
it('actual independent native correction chain is linked without attributing it to an absent command receipt', async () => {
  const f = await fixture(),
    child = await nativeChild(f, f.id),
    grandchild = await nativeChild(
      f,
      child,
      '2026-10-03T08:00:00Z',
      '2026-10-03T09:00:00Z',
    ),
    s = await readTaskRevisionConsistency(f.sources, f.job, f.gate),
    d = inspectTaskRevisionConsistency(s),
    selected = selectTaskRevisionLineage(s, child);
  expect(d.receipt_consistency).toBe('NO_COMMAND_RECEIPT');
  expect(selected.receipt_link).toBe('NOT_ATTRIBUTED_TO_RECEIPT');
  expect(selected.nodes.map((n) => n.id)).toEqual([f.id, child, grandchild]);
  expect(selected.nodes[0].successor_ids).toEqual([child]);
  expect(selected.nodes[2].predecessor_id).toBe(child);
});
it('actual competing canonical children require conflict review and never select an effective winner', async () => {
  const f = await fixture(),
    a = await nativeChild(f, f.id),
    b = await nativeChild(
      f,
      f.id,
      '2026-10-03T08:00:00Z',
      '2026-10-03T09:00:00Z',
    ),
    s = await readTaskRevisionConsistency(f.sources, f.job, f.gate),
    selected = selectTaskRevisionLineage(s, f.id);
  expect(inspectTaskRevisionConsistency(s).graph.consistency).toBe(
    'CONFLICT_REVIEW_REQUIRED',
  );
  expect(selected.issues).toContainEqual({
    code: 'COMPETING_CORRECTIONS',
    entry_id: f.id,
    related_ids: [a, b].sort(),
  });
  expect(selected.selected_winner).toBeNull();
});
it('two disconnected exact entries with matching text remain separate selectable graphs', async () => {
  const f = await fixture(),
    id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
      job_id: f.job,
      overhead_center: null,
      task: 'Actual original task <text>',
      kind: 'work',
      started_at: '2026-10-04T08:00:00Z',
      ended_at: '2026-10-04T09:00:00Z',
      billable: false,
      corrects_id: null,
    }),
    s = await readTaskRevisionConsistency(f.sources, f.job, f.gate);
  expect(typeof id).toBe('string');
  expect(selectTaskRevisionLineage(s, f.id).nodes.map((n) => n.id)).toEqual([
    f.id,
  ]);
  expect(() => selectTaskRevisionLineage(s, 'missing')).toThrow();
});
it.each(['cycle', 'dangling', 'foreign-worker', 'foreign-job'] as const)(
  'graph conflict case %# retains exact diagnostic IDs',
  async (kind) => {
    const f = await fixture(),
      original = rows(f).entries.find((t) => t.id === f.id)!,
      a = { ...original, review: 'approved' as const },
      b = { ...a, id: crypto.randomUUID(), corrects_id: a.id };
    if (kind === 'cycle') a.corrects_id = b.id;
    if (kind === 'dangling') b.corrects_id = crypto.randomUUID();
    if (kind === 'foreign-worker') b.worker_id = crypto.randomUUID();
    if (kind === 'foreign-job') b.job_id = crypto.randomUUID();
    const strip = ({ overhead_center: ignored, ...r }: typeof a) => {
        void ignored;
        return r;
      },
      graph = analyzeTaskRevisionGraph([strip(a), strip(b)]);
    expect(graph.consistency).toBe('CONFLICT_REVIEW_REQUIRED');
    expect(
      graph.issues.some(
        (i) =>
          i.code ===
          (kind === 'cycle'
            ? 'CYCLE'
            : kind === 'dangling'
              ? 'MISSING_PREDECESSOR'
              : 'CROSS_SOURCE_PREDECESSOR'),
      ),
    ).toBe(true);
    expect(graph.selected_winner).toBeNull();
  },
);
it('duplicate graph IDs and executable row fields reject without invoking getters', async () => {
  const f = await fixture(),
    s = await readTaskRevisionConsistency(f.sources, f.job, f.gate),
    row = s.evidence.graph.nodes[0],
    plain = Object.fromEntries(
      [
        'id',
        'job_id',
        'worker_id',
        'corrects_id',
        'task',
        'kind',
        'started_at',
        'ended_at',
        'billable',
        'submitted',
        'review',
      ].map((k) => [k, row[k as keyof typeof row]]),
    );
  expect(() => analyzeTaskRevisionGraph([plain, plain])).toThrow();
  const getter = vi.fn();
  Object.defineProperty(plain, 'task', { get: getter });
  expect(() => analyzeTaskRevisionGraph([plain])).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each(['initial', 'final', 'absent'] as const)(
  'ambiguous %s acknowledgment stays held and graph inspection never replays',
  async (mode) => {
    const f = await fixture(),
      r = await correction(f),
      native = f.sources.estimates.recordTime.bind(f.sources.estimates),
      review = f.sources.estimates.reviewTime.bind(f.sources.estimates);
    if (mode === 'final')
      vi.spyOn(f.sources.estimates, 'reviewTime').mockImplementation(
        async (...a) => {
          await review(...a);
          throw Error('Lost review ACK');
        },
      );
    else
      vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
        async (...a) => {
          if (mode === 'initial') await native(...a);
          throw Error('Lost ACK');
        },
      );
    await expect(
      saveTaskCorrectionReview(r.review, r.input, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      s = await readTaskRevisionConsistency(f.sources, f.job, f.gate),
      d = inspectTaskRevisionConsistency(s);
    expect(d.receipt_consistency).toBe('HELD_UNKNOWN');
    expect(d.receipt.state).toBe('UNKNOWN');
    expect(d.replay).toBe('FORBIDDEN');
    if (mode === 'final')
      expect(d.receipt.observed).toBe('EXACT_RESULT_OBSERVED');
    if (mode === 'initial') expect(d.receipt.result_id).toBeNull();
    if (mode === 'absent') expect(d.receipt.observed).toBe('UNAVAILABLE');
    expect(writer).not.toHaveBeenCalled();
    await expect(
      saveTaskCorrectionReview(r.review, r.input, true),
    ).rejects.toThrow();
  },
);
it('concurrent original corrections and graph reads retain one native result and original hold', async () => {
  const f = await fixture(),
    r = await correction(f),
    writer = vi.spyOn(f.sources.estimates, 'recordTime'),
    results = await Promise.allSettled([
      saveTaskCorrectionReview(r.review, r.input, true),
      saveTaskCorrectionReview(r.review, r.input, true),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const [a, b] = await Promise.all([
    readTaskRevisionConsistency(f.sources, f.job, f.gate),
    readTaskRevisionConsistency(f.sources, f.job, f.gate),
  ]);
  expect(a.evidence).toEqual(b.evidence);
  expect(writer).toHaveBeenCalledTimes(1);
});
it('an actual canonical correction stales graph selection and source handoff', async () => {
  const f = await fixture(),
    s = await readTaskRevisionConsistency(f.sources, f.job, f.gate),
    r = await correction(f);
  await saveTaskCorrectionReview(r.review, r.input, true);
  expect(() => inspectTaskRevisionConsistency(s)).toThrow();
  expect(() => taskRevisionDestination(s, f.id)).toThrow();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'job_id',
] as const)('foreign %s cannot retain graph or navigate', async (key) => {
  const f = await fixture(),
    s = await readTaskRevisionConsistency(f.sources, f.job, f.gate);
  f.entry.target[key] = crypto.randomUUID();
  expect(() => selectTaskRevisionLineage(s, f.id)).toThrow();
  expect(() => taskRevisionDestination(s, f.id)).toThrow();
  await expect(
    readTaskRevisionConsistency(f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it.each(['inactive', 'demoted'] as const)(
  'current %s staff loses graph and exact source selection',
  async (mode) => {
    const f = await fixture(),
      actor = f.org + '-estimator';
    await f.sources.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    f.entry.target.actor_id = actor;
    const s = await readTaskRevisionConsistency(f.sources, f.job, f.gate);
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    expect(() => selectTaskRevisionLineage(s, f.id)).toThrow();
  },
);
it.each(['gate', 'property', 'plan'] as const)(
  'new graph final hash detects live %s mutation',
  async (mode) => {
    const f = await fixture(),
      native = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await native(...args);
      if (!changed && new TextDecoder().decode(args[1]).includes('"graph"')) {
        changed = true;
        if (mode === 'gate') f.gate.enabled = false;
        if (mode === 'property')
          f.entry.target.location_id = crypto.randomUUID();
        if (mode === 'plan') {
          const p = f.sources.property
            .read(f.org)
            .plans.find((p) => p.id === f.entry.plan_id)!;
          f.sources.property.savePlan(f.org, {
            ...p,
            name: 'Actual concurrent revision',
          });
        }
      }
      return out;
    });
    await expect(
      readTaskRevisionConsistency(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('same-text other-job task never enters this exact worker/job graph', async () => {
  const f = await fixture(),
    s = await readTaskRevisionConsistency(
      f.all,
      f.all.entries[1].target.job_id!,
      f.gate,
    );
  expect(s.evidence.graph.nodes.some((n) => n.id === f.id)).toBe(false);
  expect(() => selectTaskRevisionLineage(s, f.id)).toThrow();
});
it('projection excludes internal financial/review notes and performs no business mutation', async () => {
  const f = await fixture(),
    before = JSON.stringify(rows(f)),
    s = await readTaskRevisionConsistency(f.sources, f.job, f.gate);
  expect(JSON.stringify(s.evidence)).not.toMatch(
    /PRIVATE|cash_hour|burden|supplier|salary|unit_cost|deduction/,
  );
  expect(JSON.stringify(rows(f))).toBe(before);
  expect(s.evidence.financial).toBe(false);
  expect(s.evidence.dispatch).toBe(false);
});
it('OFF fails before source getters and renders no graph', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readTaskRevisionConsistency(sources, 'untrusted'),
  ).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(TaskRevisionConsistency, {
        sources,
        enabled: false,
        selectedJobId: 'untrusted',
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %i retains original writer and accessible graph read controls',
  async (brand) => {
    const f = await fixture(brand),
      html = renderToStaticMarkup(
        createElement(TaskRevisionConsistency, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      );
    expect(html).toContain('Task revision consistency');
    expect(html).toContain('Read task revision graph');
    expect(html).toContain('Original task correction controls');
    expect(html).toContain('aria-live="polite"');
  },
);
