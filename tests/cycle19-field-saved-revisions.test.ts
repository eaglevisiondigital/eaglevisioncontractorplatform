import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFieldSavedRevision as read,
  compareFieldSavedRevisions as compare,
} from '../src/lib/workflows/field-saved-revisions';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  adoptSavedRevision,
} from '../src/lib/workflows/saved-revision-runtime';
import { FieldSavedRevisions } from '../src/components/workflows/FieldSavedRevisions';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2];
  return {
    sources,
    gate,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
function saveChecklist(f: Awaited<ReturnType<typeof fixture>>) {
  const visit = f.sources.property
    .read(f.org)
    .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
  f.sources.property.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Saved technician checklist review',
    checklist: visit.content.checklist.map((x, i) => ({
      ...x,
      completed: i === 0 ? !x.completed : x.completed,
    })),
  });
  return visit;
}
it.each([0, 1, 2])(
  'brand %s reads exact canonical work order and safe tasks without writes',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.org)),
      writers = [
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.property, 'saveVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch'),
      snapshot = await read(f.sources, f.job, f.gate);
    expect(snapshot.identity).toEqual(f.entry.target);
    expect(snapshot.evidence.source.issued_version_id).toBe(
      f.entry.target.version_id,
    );
    expect(
      snapshot.evidence.visits.some((v) => v.id === f.entry.scheduled_visit_id),
    ).toBe(true);
    expect(Object.isFrozen(snapshot.evidence.tasks)).toBe(true);
    expect(Object.values(snapshot.evidence.authority).every((v) => !v)).toBe(
      true,
    );
    expect(snapshot.evidence.physical_completion).toBe('UNVERIFIED');
    expect(snapshot.evidence.availability).toBe('UNKNOWN');
    expect(snapshot.evidence.task_revision_model).toBe(
      'EXACT_ENTRY_AND_CORRECTION_LINK_ONLY',
    );
    expect(JSON.stringify(snapshot)).not.toMatch(
      /cash_hour|burden_bps|supplier|margin|staff_type|internal_notes|review_reference|PRIVATE|@example/,
    );
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s captures actual saved visit revision, exact checklist changes and explicit adoption',
  async (brand) => {
    const f = await fixture(brand),
      before = await read(f.sources, f.job, f.gate),
      serialized = JSON.stringify(before),
      selection = createSavedRevisionSelection(before),
      visit = saveChecklist(f);
    expect(() => assertSavedRevisionCurrent(before)).toThrow();
    expect(() => assertSavedRevisionAccess(before)).not.toThrow();
    const current = await read(f.sources, f.job, f.gate),
      diff = compare(before, current),
      row = diff.differences.visits.find((v) => v.id === visit.id)!;
    expect(row.state).toBe('MODIFIED');
    expect(row.before!.revision).toBe(visit.revision);
    expect(row.current!.revision).toBe(visit.revision + 1);
    expect(row.current!.checklist[0].id).toBe(row.before!.checklist[0].id);
    expect(row.current!.checklist[0].completed).not.toBe(
      row.before!.checklist[0].completed,
    );
    expect(diff.comparison.changed).toBe(true);
    expect(() =>
      adoptSavedRevision(selection, diff.comparison, 0, false),
    ).toThrow();
    expect(readSavedRevisionSelection(selection).snapshot).toBe(before);
    const adopted = adoptSavedRevision(selection, diff.comparison, 0, true);
    expect(adopted.snapshot).toBe(current);
    expect(adopted.generation).toBe(1);
    expect(JSON.stringify(before)).toBe(serialized);
    expect(() =>
      adoptSavedRevision(selection, diff.comparison, 1, true),
    ).toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %s reports actual correction chain and approved review separately from physical task completion',
  async (brand) => {
    const f = await fixture(brand);
    const originalId = await f.sources.estimates.recordTime(
      f.org,
      f.entry.worker_id,
      {
        job_id: f.job,
        overhead_center: null,
        task: 'Original saved technician task',
        kind: 'work',
        started_at: '2026-12-31T10:00:00Z',
        ended_at: '2026-12-31T11:00:00Z',
        billable: false,
        corrects_id: null,
      },
    );
    const before = await read(f.sources, f.job, f.gate),
      workforce = await f.sources.estimates.workforce(f.org),
      old = workforce.entries.find((e) => e.id === originalId)!;
    const id = await f.sources.estimates.recordTime(f.org, old.worker_id, {
      job_id: f.job,
      overhead_center: null,
      task: 'Saved exact task correction',
      kind: old.kind,
      started_at: old.started_at,
      ended_at: old.ended_at,
      billable: old.billable,
      corrects_id: old.id,
    });
    if (typeof id !== 'string')
      throw Error('Exact saved time-entry ID required');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'PRIVATE reviewer reason excluded',
    );
    const current = await read(f.sources, f.job, f.gate),
      diff = compare(before, current),
      added = diff.differences.tasks.find((r) => r.id === id)!;
    expect(added.state).toBe('ADDED');
    expect(added.current).toMatchObject({
      corrects_id: old.id,
      task: 'Saved exact task correction',
      submitted: true,
      review: 'approved',
    });
    expect(current.evidence.tasks.some((e) => e.id === old.id)).toBe(true);
    expect(current.evidence.physical_completion).toBe('UNVERIFIED');
    expect(JSON.stringify(current)).not.toContain('PRIVATE reviewer');
    expect(diff.differences.tasks.find((r) => r.id === old.id)!.state).toBe(
      'UNCHANGED',
    );
  },
);
it('competing comparisons cannot overwrite an already adopted selection generation', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a);
  saveChecklist(f);
  const b = await read(f.sources, f.job, f.gate),
    one = compare(a, b),
    two = compare(a, b);
  adoptSavedRevision(s, one.comparison, 0, true);
  expect(() => adoptSavedRevision(s, two.comparison, 0, true)).toThrow();
  expect(readSavedRevisionSelection(s).snapshot).toBe(b);
});
it('a later saved change blocks stale comparison adoption without changing old snapshots', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a);
  saveChecklist(f);
  const b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  saveChecklist(f);
  expect(() => adoptSavedRevision(s, diff.comparison, 0, true)).toThrow();
  expect(readSavedRevisionSelection(s).snapshot).toBe(a);
});
it('unchanged exact source reads have unchanged IDs and hashes, not fabricated revision numbers', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  expect(a.sha256).toBe(b.sha256);
  expect(diff.comparison.changed).toBe(false);
  expect(diff.differences.tasks.every((r) => r.state === 'UNCHANGED')).toBe(
    true,
  );
});
it('an added actual draft inspection is an added exact visit, never a completed repair', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    v = f.sources.property.addVisit(f.org, f.entry.plan_id, '2027-02-03'),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  expect(diff.differences.visits.find((r) => r.id === v.id)).toMatchObject({
    state: 'ADDED',
    before: null,
    current: { status: 'draft', revision: 1 },
  });
  expect(diff.differences.physical_completion).toBe('UNVERIFIED');
});
it.each(['foreign-job', '', 'x'.repeat(201)])(
  'invalid selected job %s rejects without fallback',
  async (job) => {
    const f = await fixture();
    await expect(read(f.sources, job, f.gate)).rejects.toThrow();
  },
);
it('foreign canonical repositories cannot substitute a same-looking source', async () => {
  const a = await fixture(0),
    b = await fixture(1),
    original = await read(a.sources, a.job, a.gate),
    foreign = await read(b.sources, b.job, b.gate);
  expect(() => compare(original, foreign)).toThrow();
});
it('another authorized property is not the same comparison source', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    b = await read(f.sources, f.sources.entries[0].target.job_id!, f.gate);
  expect(() => compare(a, b)).toThrow();
});
it('revoked reviewer cannot read saved updates or adopt current evidence', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b),
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() => adoptSavedRevision(s, diff.comparison, 0, true)).toThrow();
  await expect(read(f.sources, f.job, f.gate)).rejects.toThrow();
});
it('source mutation during asynchronous workforce read rejects mixed snapshots', async () => {
  const f = await fixture(),
    original = f.sources.estimates.workforce.bind(f.sources.estimates);
  let changed = false;
  vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(async (org) => {
    const data = await original(org);
    if (!changed) {
      changed = true;
      saveChecklist(f);
    }
    return data;
  });
  await expect(read(f.sources, f.job, f.gate)).rejects.toThrow();
});
it('confirmation withdrawal during source await fails closed', async () => {
  const f = await fixture(),
    original = f.sources.estimates.workforce.bind(f.sources.estimates);
  vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(async (org) => {
    const data = await original(org);
    f.gate.confirmed = false;
    return data;
  });
  await expect(read(f.sources, f.job, f.gate)).rejects.toThrow();
});
it('default OFF rejects before executable source getters or projector reads', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'company', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'];
  await expect(read(sources, 'job')).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('forged snapshots and copied comparisons are not admitted evidence', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  expect(() => compare({ ...a }, b)).toThrow();
  expect(() =>
    adoptSavedRevision(s, { ...diff.comparison }, 0, true),
  ).toThrow();
});
it('default OFF component renders an honest state without source access', () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'company', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'];
  const html = renderToStaticMarkup(
    createElement(FieldSavedRevisions, { sources }),
  );
  expect(html).toContain('review is off');
  expect(getter).not.toHaveBeenCalled();
});
it('adoption does not dispatch, write time, change reports or invoke workflow continuation', async () => {
  const f = await fixture(),
    a = await read(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a);
  saveChecklist(f);
  const b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b),
    before = JSON.stringify(f.sources.property.read(f.org)),
    writers = [
      vi.spyOn(f.sources.estimates, 'recordTime'),
      vi.spyOn(f.sources.estimates, 'assignJob'),
      vi.spyOn(f.sources.property, 'saveVisit'),
      vi.spyOn(f.sources.property, 'publish'),
    ];
  adoptSavedRevision(s, diff.comparison, 0, true);
  expect(JSON.stringify(f.sources.property.read(f.org))).toBe(before);
  expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
});

it('new read-only snapshot adoption cannot clear the original UNKNOWN continuation hold', async () => {
  const { readFieldAgenda, continueFieldAgenda } =
    await import('../src/lib/workflows/field-agenda');
  const f = await fixture(),
    agenda = await readFieldAgenda(f.sources, f.gate),
    failed = vi.fn(() => {
      throw Error('lost local acknowledgment');
    });
  await expect(continueFieldAgenda(agenda, f.job, failed)).rejects.toThrow();
  const a = await read(f.sources, f.job, f.gate),
    selection = createSavedRevisionSelection(a),
    b = await read(f.sources, f.job, f.gate),
    diff = compare(a, b);
  adoptSavedRevision(selection, diff.comparison, 0, true);
  const replacement = await readFieldAgenda(f.sources, f.gate),
    replay = vi.fn();
  await expect(
    continueFieldAgenda(replacement, f.job, replay),
  ).rejects.toThrow();
  expect(failed).toHaveBeenCalledTimes(1);
  expect(replay).not.toHaveBeenCalled();
});
