import { afterEach, expect, it, vi } from 'vitest';
import { prototypeFixture } from '../program/prototype-fixture';
import { correctCurrentClock } from '../../src/components/phase3/clock-correction-source';

afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const f = await prototypeFixture(),
    initial = await f.repo.workforce(f.company.id),
    worker = initial.workers[0];
  const now = Date.now();
  const id = String(
    await f.repo.recordTime(f.company.id, worker.id, {
      job_id: null,
      overhead_center: 'Administration',
      task: 'Fictional missed clock',
      kind: 'work',
      started_at: new Date(now - 60000).toISOString(),
      ended_at: null,
      corrects_id: null,
      billable: false,
    }),
  );
  const data = await f.repo.workforce(f.company.id),
    end = new Date(now - 1000).toISOString();
  const writer = vi.spyOn(f.repo, 'resolveClock');
  const run = (current = () => true) =>
    correctCurrentClock(
      f.repo,
      f.company.id,
      data,
      id,
      end,
      'Supervisor reviewed this exact original clock',
      current,
    );
  return { ...f, id, data, end, worker, writer, run };
}
it('corrects and reopens the exact original clock once through its existing writer', async () => {
  const f = await fixture();
  await f.run();
  const reopened = await f.repo.workforce(f.company.id);
  expect(reopened.entries.find((e) => e.id === f.id)).toMatchObject({
    ended_at: f.end,
    submitted: true,
  });
  expect(reopened.reviews.filter((r) => r.entry_id === f.id)).toHaveLength(1);
  await expect(f.run()).rejects.toThrow(/source changed/);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('does not correct a replacement clock using the previous displayed entry', async () => {
  const f = await fixture();
  await f.repo.resolveClock(
    f.company.id,
    f.worker.id,
    new Date(Date.now() - 40000).toISOString(),
    'Fixture previous clock closed',
  );
  await f.repo.recordTime(f.company.id, f.worker.id, {
    job_id: null,
    overhead_center: 'Administration',
    task: 'Fictional replacement',
    kind: 'work',
    started_at: new Date(Date.now() - 30000).toISOString(),
    ended_at: null,
    corrects_id: null,
    billable: false,
  });
  f.writer.mockClear();
  const before = await f.repo.workforce(f.company.id);
  await expect(f.run()).rejects.toThrow(/source changed/);
  expect(f.writer).not.toHaveBeenCalled();
  expect(await f.repo.workforce(f.company.id)).toEqual(before);
});
it.each(['revoked', 'foreign', 'closed', 'missing'] as const)(
  'rejects %s current context before the original correction',
  async (mode) => {
    const f = await fixture(),
      changed = structuredClone(f.data);
    if (mode === 'revoked') changed.payroll_admin = false;
    if (mode === 'foreign')
      changed.workers[0].organization_id = crypto.randomUUID();
    if (mode === 'closed')
      changed.entries.find((e) => e.id === f.id)!.ended_at = f.end;
    if (mode === 'missing')
      changed.entries = changed.entries.filter((e) => e.id !== f.id);
    vi.spyOn(f.repo, 'workforce').mockResolvedValue(changed);
    await expect(f.run()).rejects.toThrow();
    expect(f.writer).not.toHaveBeenCalled();
  },
);
it('denies context changes while the current source read awaits', async () => {
  const f = await fixture();
  let current = true;
  vi.spyOn(f.repo, 'workforce').mockImplementation(async () => {
    current = false;
    return f.data;
  });
  await expect(f.run(() => current)).rejects.toThrow(/context changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('does not read or write an already stale or missing displayed entry', async () => {
  const f = await fixture(),
    read = vi.spyOn(f.repo, 'workforce');
  await expect(f.run(() => false)).rejects.toThrow();
  await expect(
    correctCurrentClock(
      f.repo,
      f.company.id,
      f.data,
      crypto.randomUUID(),
      f.end,
      'Review',
      () => true,
    ),
  ).rejects.toThrow(/open clock/);
  expect(read).not.toHaveBeenCalled();
  expect(f.writer).not.toHaveBeenCalled();
});
