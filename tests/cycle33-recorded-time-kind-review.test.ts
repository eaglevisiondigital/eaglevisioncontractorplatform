import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readCostCoveragePath,
  inspectCostCoverageSource,
  continueCostCoverageSource,
} from '../src/lib/workflows/cost-coverage-path';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);

async function pendingTime(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    org = sources.company.id,
    job = entry.target.job_id!;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-review-owner',
  );
  const raw = sources.estimates.readSyntheticPrototypeSources(entry.target),
    started =
      Math.max(
        ...raw.workforce.entries.map((time) =>
          Date.parse(time.ended_at ?? time.started_at),
        ),
      ) + 86400000,
    id = await sources.estimates.recordTime(org, entry.worker_id, {
      job_id: job,
      overhead_center: null,
      task: 'Exact recorded source continuity',
      kind: 'break_paid',
      started_at: new Date(started).toISOString(),
      ended_at: new Date(started + 900000).toISOString(),
      billable: false,
      corrects_id: null,
    });
  if (typeof id !== 'string') throw Error('Exact native time ID required');
  const read = () => readCostCoveragePath(sources, job, gate);
  return { sources, gate, entry, org, job, id, read, view: await read() };
}

it.each([0, 1, 2])(
  'brand %i: actual time review invalidates the old source and fresh exact kind remains unposted without clearing invoice prerequisites',
  async (brand) => {
    const f = await pendingTime(brand),
      before = inspectCostCoverageSource(f.view, {
        kind: 'time',
        id: f.id,
      });
    await f.sources.estimates.submitTime(f.org, f.id);
    await f.sources.estimates.reviewTime(
      f.org,
      f.id,
      'approved',
      'Explicit synthetic staff time review only',
    );
    expect(() =>
      inspectCostCoverageSource(f.view, { kind: 'time', id: f.id }),
    ).toThrow();
    const current = await f.read(),
      state = f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      row = inspectCostCoverageSource(current, {
        kind: 'time',
        id: f.id,
      });
    expect(row.id).toBe(before.id);
    expect(row.status).toBe('approved');
    expect(row.facts).toContain('Recorded time kind: break_paid');
    expect(row.facts.join(' ')).toContain('UNPOSTED OR UNVERIFIED');
    expect(current.invoice_status).toBe('NO_GO');
    expect(
      current.original.costs.evidence.invoice.requirements.some(
        (requirement) => requirement.status !== 'PASS',
      ),
    ).toBe(true);
    expect(current.operational_ready).toBe(false);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(state);
  },
);
it.each([0, 1, 2])(
  'brand %i: actual owner revocation denies retained time-kind facts and navigation',
  async (brand) => {
    const f = await pendingTime(brand),
      row = inspectCostCoverageSource(f.view, { kind: 'time', id: f.id }),
      callback = vi.fn();
    await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
    expect(() =>
      inspectCostCoverageSource(f.view, { kind: 'time', id: f.id }),
    ).toThrow();
    expect(
      await continueCostCoverageSource(f.view, row, callback, {
        current: callback,
        generation: 0,
      }),
    ).toEqual({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    expect(callback).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i: exact recorded kind does not renew UNKNOWN navigation or imply posting',
  async (brand) => {
    const f = await pendingTime(brand),
      row = inspectCostCoverageSource(f.view, { kind: 'time', id: f.id }),
      state = f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      callback = vi.fn(() => {
        throw Error('Lost original navigation acknowledgment');
      }),
      live = { current: callback, generation: 0 };
    expect(
      (await continueCostCoverageSource(f.view, row, callback, live)).status,
    ).toBe('UNKNOWN');
    expect(
      (await continueCostCoverageSource(f.view, row, callback, live)).status,
    ).toBe('UNKNOWN');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(row.facts).toContain('Recorded time kind: break_paid');
    expect(f.view.invoice_status).toBe('NO_GO');
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(state);
  },
);
it('foreign tenant and same-company other-job time IDs cannot replace an exact original time selection', async () => {
  const first = await pendingTime(0),
    second = await pendingTime(1),
    otherJob = first.sources.entries[0].target.job_id!,
    sibling = await readCostCoveragePath(first.sources, otherJob, first.gate),
    siblingTime = sibling.rows.find((row) => row.kind === 'time')!;
  expect(() =>
    inspectCostCoverageSource(first.view, { kind: 'time', id: second.id }),
  ).toThrow();
  expect(() =>
    inspectCostCoverageSource(first.view, { kind: 'time', id: siblingTime.id }),
  ).toThrow();
  expect(
    inspectCostCoverageSource(first.view, { kind: 'time', id: first.id }).id,
  ).toBe(first.id);
});
it('default-OFF and unadmitted reads never inspect private source or selector getters', async () => {
  const getter = vi.fn(() => {
      throw Error('Private source getter');
    }),
    sources = new Proxy({}, { get: getter }),
    selector = new Proxy({}, { get: getter, getOwnPropertyDescriptor: getter });
  await expect(
    readCostCoveragePath(sources as never, 'unadmitted'),
  ).rejects.toThrow('OFF');
  expect(() =>
    inspectCostCoverageSource({} as never, selector as never),
  ).toThrow('Original cost coverage read required');
  expect(getter).not.toHaveBeenCalled();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([0, 1, 2])(
  'brand %i: selected finance time facts distinguish recorded work, paid break and break before original navigation',
  async (brand) => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareCorrectionPreviewSources(
        sampleCompanies[brand],
        gate,
      ),
      entry = sources.entries[2],
      org = sources.company.id,
      job = entry.target.job_id!,
      initial = sources.estimates.readSyntheticPrototypeSources(entry.target),
      latest = Math.max(
        ...initial.workforce.entries.map((time) =>
          Date.parse(time.ended_at ?? time.started_at),
        ),
      ),
      kinds = ['work', 'break_paid', 'break'] as const,
      ids: string[] = [];
    for (const [index, kind] of kinds.entries()) {
      const started = latest + (index + 1) * 86400000,
        id = await sources.estimates.recordTime(org, entry.worker_id, {
          job_id: job,
          overhead_center: null,
          task: 'Exact recorded finance kind review',
          kind,
          started_at: new Date(started).toISOString(),
          ended_at: new Date(started + 900000).toISOString(),
          billable: false,
          corrects_id: null,
        });
      if (typeof id !== 'string') throw Error('Exact native time ID required');
      ids.push(id);
    }
    const view = await readCostCoveragePath(sources, job, gate),
      before = sources.estimates.readSyntheticPrototypeSources(entry.target);
    for (const [index, kind] of kinds.entries()) {
      const row = inspectCostCoverageSource(view, {
          kind: 'time',
          id: ids[index],
        }),
        native = before.workforce.entries.find((time) => time.id === row.id)!;
      expect(native.kind).toBe(kind);
      expect(row.facts).toContain(`Recorded time kind: ${native.kind}`);
      expect(row.id).toBe(ids[index]);
      expect(row.destination).toBe('field');
      expect(row.facts.join(' ')).toContain('This is not zero-cost proof.');
      expect(view.operational_ready).toBe(false);
    }
    expect(
      sources.estimates.readSyntheticPrototypeSources(entry.target),
    ).toEqual(before);
  },
);
