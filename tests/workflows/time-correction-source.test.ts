import { expect, it, vi } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { Phase3Repository } from '../../src/lib/phase3';
import { sampleCompanies } from '../../src/domain/platform';
import { preparePayroll } from '../../src/domain/workforce/payroll';
import { saveCurrentTimeDraft } from '../../src/components/phase3/time-correction-source';
async function fixture() {
  const org = sampleCompanies[0].id,
    repo = new Phase3Repository(new Operations(true));
  await repo.initialize(sampleCompanies[0]);
  const data = await repo.workforce(org),
    original = data.entries.find((e) => e.submitted)!,
    other = data.workers.find((w) => w.id !== original.worker_id)!;
  const draft = {
    job_id: original.job_id,
    overhead_center: original.overhead_center,
    task: 'Fictional audited correction',
    kind: 'work' as const,
    started_at: original.started_at,
    ended_at: new Date(Date.parse(original.started_at) + 3600000).toISOString(),
    billable: original.billable,
    corrects_id: original.id,
  };
  const writer = vi.spyOn(repo, 'recordTime');
  const run = (
    worker = original.worker_id,
    input = draft,
    current = () => true,
    display = data,
  ) => saveCurrentTimeDraft(repo, org, display, worker, input, current);
  return { org, repo, data, original, other, draft, writer, run };
}
it('rejects cross-worker correction without removing the original payroll source', async () => {
  const f = await fixture();
  await expect(f.run(f.other.id)).rejects.toThrow(/same worker/);
  expect(f.writer).not.toHaveBeenCalled();
  const d = await f.repo.workforce(f.org);
  expect(
    preparePayroll(d.workers, d.rates, d.entries, d.reviews, d.policy!).some(
      (r) => r.entry_id === f.original.id,
    ),
  ).toBe(true);
});
it('saves/reopens a same-worker correction and retains immutable original before approved supersession', async () => {
  const f = await fixture(),
    id = String(await f.run());
  let d = await f.repo.workforce(f.org);
  expect(d.entries.find((e) => e.id === id)).toMatchObject({
    ...f.draft,
    worker_id: f.original.worker_id,
    submitted: false,
  });
  expect(d.entries.find((e) => e.id === f.original.id)).toEqual(f.original);
  await f.repo.submitTime(f.org, id);
  await f.repo.reviewTime(
    f.org,
    id,
    'approved',
    'Fictional reviewed correction',
  );
  d = await f.repo.workforce(f.org);
  const rows = preparePayroll(
    d.workers,
    d.rates,
    d.entries,
    d.reviews,
    d.policy!,
  );
  expect(rows.some((r) => r.entry_id === f.original.id)).toBe(false);
  expect(rows.filter((r) => r.entry_id === id)).toHaveLength(1);
});
it.each(['missing', 'unapproved', 'open', 'locked'] as const)(
  'denies %s original correction source',
  async (mode) => {
    const f = await fixture(),
      data = structuredClone(f.data);
    if (mode === 'missing')
      data.entries = data.entries.filter((e) => e.id !== f.original.id);
    if (mode === 'unapproved')
      data.reviews = data.reviews.filter((r) => r.entry_id !== f.original.id);
    if (mode === 'open')
      data.entries.find((e) => e.id === f.original.id)!.ended_at = null;
    if (mode === 'locked')
      data.periods.push({
        id: crypto.randomUUID(),
        starts_at: '2026-10-01T00:00:00Z',
        ends_at: '2026-10-12T00:00:00Z',
        status: 'locked',
        snapshot: null,
      });
    vi.spyOn(f.repo, 'workforce').mockResolvedValue(data);
    await expect(
      f.run(f.original.worker_id, f.draft, () => true, data),
    ).rejects.toThrow();
    expect(f.writer).not.toHaveBeenCalled();
  },
);
it('rejects an existing pending correction rather than creating a replacement', async () => {
  const f = await fixture();
  await f.repo.recordTime(f.org, f.original.worker_id, f.draft);
  const d = await f.repo.workforce(f.org);
  f.writer.mockClear();
  await expect(
    f.run(f.original.worker_id, f.draft, () => true, d),
  ).rejects.toThrow(/already has a correction/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('retains visible non-admin same-worker correction scope without granting new authority', async () => {
  const f = await fixture(),
    data = { ...f.data, payroll_admin: false, review_worker_ids: [] };
  vi.spyOn(f.repo, 'workforce').mockResolvedValue(data);
  await f.run(f.original.worker_id, f.draft, () => true, data);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('rejects role/source change and context loss after the read', async () => {
  const f = await fixture();
  vi.spyOn(f.repo, 'workforce').mockResolvedValue({
    ...f.data,
    payroll_admin: false,
  });
  await expect(f.run()).rejects.toThrow(/source changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('rejects navigation/context changes during a current-source wait', async () => {
  const f = await fixture();
  let current = true;
  vi.spyOn(f.repo, 'workforce').mockImplementation(async () => {
    current = false;
    return f.data;
  });
  await expect(
    f.run(f.original.worker_id, f.draft, () => current),
  ).rejects.toThrow(/context changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('ordinary new manual time remains available without a correction target', async () => {
  const f = await fixture(),
    draft = {
      ...f.draft,
      corrects_id: null,
      started_at: '2026-10-12T13:00:00Z',
      ended_at: '2026-10-12T14:00:00Z',
    };
  const id = String(
    await saveCurrentTimeDraft(
      f.repo,
      f.org,
      f.data,
      f.original.worker_id,
      draft,
      () => true,
    ),
  );
  expect(
    (await f.repo.workforce(f.org)).entries.find((e) => e.id === id),
  ).toMatchObject({ ...draft, submitted: false });
});
it('allows one concurrent correction of the original source even with nonoverlapping replacement times', async () => {
  const f = await fixture(),
    later = {
      ...f.draft,
      started_at: '2026-10-12T13:00:00Z',
      ended_at: '2026-10-12T14:00:00Z',
    };
  const results = await Promise.allSettled([
    f.run(),
    f.run(f.original.worker_id, later),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(f.writer).toHaveBeenCalledTimes(1);
  expect(
    (await f.repo.workforce(f.org)).entries.filter(
      (e) => e.corrects_id === f.original.id,
    ),
  ).toHaveLength(1);
});
it('denies UNKNOWN locked-period evidence instead of treating malformed dates as unlocked', async () => {
  const f = await fixture(),
    data = structuredClone(f.data);
  data.periods.push({
    id: crypto.randomUUID(),
    starts_at: 'invalid',
    ends_at: 'invalid',
    status: 'locked',
    snapshot: null,
  });
  vi.spyOn(f.repo, 'workforce').mockResolvedValue(data);
  await expect(
    f.run(f.original.worker_id, f.draft, () => true, data),
  ).rejects.toThrow(/locked or UNKNOWN/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('retains UNKNOWN after a lost correction acknowledgment across fresh source reads and replacement attempts', async () => {
  const f = await fixture(),
    original = Phase3Repository.prototype.recordTime;
  f.writer.mockImplementation(async (...args) => {
    await original.apply(f.repo, args);
    throw Error('Fictional private transport detail');
  });
  await expect(f.run()).rejects.toThrow(/outcome UNKNOWN/);
  const refreshed = await f.repo.workforce(f.org);
  expect(
    refreshed.entries.filter((e) => e.corrects_id === f.original.id),
  ).toHaveLength(1);
  await expect(
    f.run(
      f.original.worker_id,
      { ...f.draft, task: 'Replacement must not dispatch' },
      () => true,
      refreshed,
    ),
  ).rejects.toThrow(/outcome UNKNOWN/);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('validates correctable draft input before dispatch rather than turning it into an uncertain correction', async () => {
  const f = await fixture();
  await expect(
    f.run(f.original.worker_id, { ...f.draft, task: '' }),
  ).rejects.toThrow(/task/);
  expect(f.writer).not.toHaveBeenCalled();
  await f.run();
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('cannot bypass an UNKNOWN ancestor by approving its recorded child and targeting the new ID', async () => {
  const f = await fixture(),
    raw = Phase3Repository.prototype.recordTime;
  f.writer.mockImplementation(async (...args) => {
    await raw.apply(f.repo, args);
    throw Error('Fictional lost acknowledgment');
  });
  await expect(f.run()).rejects.toThrow(/UNKNOWN/);
  let data = await f.repo.workforce(f.org);
  const child = data.entries.find((e) => e.corrects_id === f.original.id)!;
  await f.repo.submitTime(f.org, child.id);
  await f.repo.reviewTime(
    f.org,
    child.id,
    'approved',
    'Fictional explicit review, not UNKNOWN reconciliation',
  );
  data = await f.repo.workforce(f.org);
  f.writer.mockImplementation((...args) => raw.apply(f.repo, args));
  await expect(
    f.run(
      f.original.worker_id,
      { ...f.draft, corrects_id: child.id },
      () => true,
      data,
    ),
  ).rejects.toThrow(/UNKNOWN/);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('denies zero-duration approved original evidence as UNKNOWN', async () => {
  const f = await fixture(),
    data = structuredClone(f.data);
  data.entries.find((e) => e.id === f.original.id)!.ended_at =
    f.original.started_at;
  vi.spyOn(f.repo, 'workforce').mockResolvedValue(data);
  await expect(
    f.run(f.original.worker_id, f.draft, () => true, data),
  ).rejects.toThrow(/UNKNOWN/);
  expect(f.writer).not.toHaveBeenCalled();
});
it.each(['missing', 'cycle', 'foreign-worker', 'foreign-org'] as const)(
  'denies %s correction ancestry as UNKNOWN',
  async (mode) => {
    const f = await fixture(),
      data = structuredClone(f.data),
      target = data.entries.find((e) => e.id === f.original.id)!;
    const parent = { ...target, id: crypto.randomUUID(), corrects_id: null };
    target.corrects_id = mode === 'cycle' ? target.id : parent.id;
    if (mode !== 'missing' && mode !== 'cycle') {
      if (mode === 'foreign-worker') parent.worker_id = f.other.id;
      if (mode === 'foreign-org')
        Object.assign(parent, { organization_id: sampleCompanies[1].id });
      data.entries.push(parent);
      data.reviews.push({
        entry_id: parent.id,
        decision: 'approved',
        reason: 'Fictional historical evidence',
      });
    }
    vi.spyOn(f.repo, 'workforce').mockResolvedValue(data);
    await expect(
      f.run(f.original.worker_id, f.draft, () => true, data),
    ).rejects.toThrow(/lineage is UNKNOWN/);
    expect(f.writer).not.toHaveBeenCalled();
  },
);
it('preserves a known same-worker approved correction chain when no ancestor is uncertain', async () => {
  const f = await fixture(),
    first = String(await f.run());
  await f.repo.submitTime(f.org, first);
  await f.repo.reviewTime(f.org, first, 'approved', 'Known first correction');
  const data = await f.repo.workforce(f.org);
  const next = String(
    await f.run(
      f.original.worker_id,
      { ...f.draft, corrects_id: first },
      () => true,
      data,
    ),
  );
  expect(next).not.toBe(first);
  expect(
    (await f.repo.workforce(f.org)).entries.find((e) => e.id === next)
      ?.corrects_id,
  ).toBe(first);
});
