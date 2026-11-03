import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { readCostSavedRevision } from '../src/lib/workflows/cost-saved-revisions';
import {
  prepareSavedEvidence,
  openSavedEvidence,
  reconcileSavedEvidence,
  decodeSavedEvidence,
} from '../src/lib/workflows/saved-evidence-runtime';
import { documentHash } from '../src/domain/release/preview';
import {
  recordedCostRecipe,
  parseRecordedCostEvidence,
  assertRecordedCostSource,
  previewOrganizationLabor,
  confirmOrganizationLabor,
  reconcileOrganizationLabor,
  assertOrganizationLaborAccess,
} from '../src/lib/workflows/recorded-cost-continuity';
import { RecordedCostContinuity } from '../src/components/workflows/RecordedCostContinuity';
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
const period = {
  start: '2026-02-03T00:00:00.000Z',
  end: '2026-02-04T00:00:00.000Z',
};
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
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
async function time(
  f: Fixture,
  which = 0,
  decision: 'approved' | 'rejected' = 'approved',
  corrects: string | null = null,
) {
  const entry = f.sources.entries[which],
    id = await f.sources.estimates.recordTime(f.org, entry.worker_id, {
      job_id: entry.target.job_id!,
      overhead_center: null,
      task: 'PRIVATE_TASK_SENTINEL',
      kind: 'work',
      started_at: '2026-02-03T14:00:00.000Z',
      ended_at: '2026-02-03T15:00:00.000Z',
      billable: true,
      corrects_id: corrects,
    });
  if (typeof id !== 'string') throw Error('Exact time ID');
  await f.sources.estimates.submitTime(f.org, id);
  await f.sources.estimates.reviewTime(
    f.org,
    id,
    decision,
    'PRIVATE_REVIEW_SENTINEL',
  );
  return id;
}
async function preview(f: Fixture) {
  return previewOrganizationLabor(f.sources, f.job, period, f.gate);
}
async function forecast(f: Fixture) {
  const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
  await f.sources.estimates.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 100,
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
  edit: (v: Record<string, unknown>) => void,
) {
  const body = JSON.parse(text);
  edit(body.payload);
  const { sha256: _, ...data } = body;
  void _;
  body.sha256 = await documentHash(data);
  return JSON.stringify(body);
}
describe('Cycle20 recorded cost files and original organization preparation', () => {
  it.each([0, 1, 2])(
    'brand %i complete current file reopen and readonly reconciliation',
    async (brand) => {
      const f = await fixture(brand),
        file = await prepareSavedEvidence(
          f.sources,
          f.job,
          recordedCostRecipe,
          f.gate,
        ),
        opened = await openSavedEvidence(
          f.sources,
          f.job,
          recordedCostRecipe,
          file.text,
          f.gate,
        );
      expect(opened.envelope.payload).toEqual(file.envelope.payload);
      expect(await reconcileSavedEvidence(opened)).toMatchObject({
        status: 'CURRENT_MATCH',
        canonical_restore: false,
        authority: false,
      });
      expect(file.meaning).toBe('HISTORICAL_EVIDENCE_ONLY');
    },
  );
  it.each([0, 1, 2])(
    'brand %i canonical ended time locks once across every organization job',
    async (brand) => {
      const f = await fixture(brand),
        id = await time(f),
        view = await preview(f),
        before = await f.sources.estimates.jobs(f.org),
        out = await confirmOrganizationLabor(view, true);
      expect(view.jobs).toHaveLength(before.length);
      expect(
        view.entries.find((e) => e.id === id)?.included_in_original_preparation,
      ).toBe(true);
      expect(out.status).toBe('LOCKED_INTERNAL_PREPARATION');
      const after = await f.sources.estimates.jobs(f.org);
      expect(
        after.every(
          (j) =>
            j.lock_revision ===
            before.find((b) => b.id === j.id)!.lock_revision + 1,
        ),
      ).toBe(true);
      const own = after.find((j) => j.id === f.job)!;
      expect(
        jobFinancials(own).categories.find((c) => c.category === 'labor')!
          .paid_minor,
      ).toBe(view.jobs.find((j) => j.id === f.job)!.loaded_cost_minor);
      expect(await confirmOrganizationLabor(view, true)).toMatchObject({
        status: 'UNKNOWN',
        replay: 'FORBIDDEN',
      });
      expect(await reconcileOrganizationLabor(view)).toMatchObject({
        status: 'LOCKED',
        exact_period_observed: true,
      });
    },
  );
  it.each([0, 1, 2])(
    'brand %i locked canonical cost changes make retained evidence stale without mutation',
    async (brand) => {
      const f = await fixture(brand);
      await time(f);
      const file = await prepareSavedEvidence(
          f.sources,
          f.job,
          recordedCostRecipe,
          f.gate,
        ),
        text = file.text,
        view = await preview(f);
      await confirmOrganizationLabor(view, true);
      expect(await reconcileSavedEvidence(file)).toMatchObject({
        status: 'STALE_SAVED_EVIDENCE',
      });
      const opened = await openSavedEvidence(
        f.sources,
        f.job,
        recordedCostRecipe,
        text,
        f.gate,
      );
      expect(opened.text).toBe(text);
      expect(
        (await readCostSavedRevision(f.sources, f.job, f.gate)).evidence
          .labor_entry_ids.length,
      ).toBeGreaterThan(0);
    },
  );
  it('no future December preparation or clock bypass', async () => {
    const f = await fixture();
    await expect(
      previewOrganizationLabor(
        f.sources,
        f.job,
        { start: '2026-12-01T00:00:00.000Z', end: '2026-12-31T00:00:00.000Z' },
        f.gate,
      ),
    ).rejects.toThrow();
    expect((await f.sources.estimates.workforce(f.org)).periods).toHaveLength(
      0,
    );
  });
  it.each(['bad', '2026-02-30T00:00:00.000Z', '2026-02-03T00:00:00Z'])(
    'rejects invalid noncanonical period %s',
    async (start) => {
      const f = await fixture();
      await expect(
        previewOrganizationLabor(
          f.sources,
          f.job,
          { ...period, start },
          f.gate,
        ),
      ).rejects.toThrow();
    },
  );
  it('rejects reversed and excessive periods', async () => {
    const f = await fixture();
    await expect(
      previewOrganizationLabor(
        f.sources,
        f.job,
        { start: period.end, end: period.start },
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      previewOrganizationLabor(
        f.sources,
        f.job,
        { start: '2026-01-01T00:00:00.000Z', end: period.end },
        f.gate,
      ),
    ).rejects.toThrow();
  });
  it('no empty period fabricated zero preparation', async () => {
    const f = await fixture();
    await expect(preview(f)).rejects.toThrow('Recorded reviewed time required');
  });
  it('rejected time is not included by original engine or treated as completion', async () => {
    const f = await fixture(),
      id = await time(f, 0, 'rejected'),
      view = await preview(f);
    expect(view.entries.find((e) => e.id === id)).toMatchObject({
      review: 'rejected',
      included_in_original_preparation: false,
    });
    expect(view.financial_execution).toBe(false);
  });
  it('approved correction excludes superseded original but retains truthful canonical partial coverage', async () => {
    const f = await fixture(),
      original = await time(f),
      correction = await time(f, 0, 'approved', original),
      view = await preview(f);
    expect(
      view.entries.find((e) => e.id === original)
        ?.included_in_original_preparation,
    ).toBe(false);
    expect(
      view.entries.find((e) => e.id === correction)
        ?.included_in_original_preparation,
    ).toBe(true);
    expect((await confirmOrganizationLabor(view, true)).status).toBe(
      'LOCKED_INTERNAL_PREPARATION',
    );
    const cost = await readCostSavedRevision(f.sources, f.job, f.gate);
    expect(cost.evidence.facts.cost_coverage).toBe('PARTIAL');
    expect(cost.evidence.facts.missing_evidence.join(' ')).toMatch(
      /unposted|approved/i,
    );
  });
  it('organization scope includes time from another job', async () => {
    const f = await fixture();
    await time(f, 0);
    const id = await time(f, 1),
      view = await preview(f);
    expect(
      view.entries.some(
        (e) => e.id === id && e.job_id === f.sources.entries[1].target.job_id,
      ),
    ).toBe(true);
    expect(
      view.jobs.find((j) => j.id === f.sources.entries[1].target.job_id)!
        .loaded_cost_minor,
    ).toBeGreaterThan(0);
  });
  it('confirmation required and no original mutation before explicit confirmation', async () => {
    const f = await fixture();
    await time(f);
    const spy = vi.spyOn(f.sources.estimates, 'payroll'),
      view = await preview(f);
    expect(spy.mock.calls.every((c) => c[4] === false)).toBe(true);
    expect((await confirmOrganizationLabor(view, false)).status).toBe(
      'UNKNOWN',
    );
    expect((await f.sources.estimates.workforce(f.org)).periods).toHaveLength(
      0,
    );
  });
  it('stale other-job revision blocks organization preparation', async () => {
    const f = await fixture();
    await time(f);
    const view = await preview(f),
      j = f.sources.estimates.syntheticJob(
        f.org,
        f.sources.entries[1].target.job_id!,
      )!;
    await f.sources.estimates.projection(f.org, j, {
      ...j.projection,
      remaining: { ...j.projection.remaining, other: 250 },
    });
    expect((await confirmOrganizationLabor(view, true)).status).toBe('UNKNOWN');
    expect((await f.sources.estimates.workforce(f.org)).periods).toHaveLength(
      0,
    );
  });
  it('concurrent fresh-wrapper confirmation invokes original lock at most once', async () => {
    const f = await fixture();
    await time(f);
    const a = await preview(f),
      b = await previewOrganizationLabor(
        { ...f.sources },
        f.job,
        period,
        f.gate,
      ),
      spy = vi.spyOn(f.sources.estimates, 'payroll');
    const results = await Promise.all([
      confirmOrganizationLabor(a, true),
      confirmOrganizationLabor(b, true),
    ]);
    expect(spy.mock.calls.filter((c) => c[4])).toHaveLength(1);
    expect(results.map((r) => r.status)).toContain('HELD_NO_REPLAY');
  });
  it('lost post-lock acknowledgment stays UNKNOWN across wrappers and overlapping periods', async () => {
    const f = await fixture();
    await time(f);
    const view = await preview(f),
      original = f.sources.estimates.payroll.bind(f.sources.estimates);
    vi.spyOn(f.sources.estimates, 'payroll').mockImplementation(
      async (...a) => {
        const r = await original(...a);
        if (a[4]) throw Error('lost ACK');
        return r;
      },
    );
    expect((await confirmOrganizationLabor(view, true)).status).toBe('UNKNOWN');
    expect(await reconcileOrganizationLabor(view)).toMatchObject({
      status: 'UNKNOWN',
      exact_period_observed: true,
      replay: 'FORBIDDEN',
    });
    await expect(
      previewOrganizationLabor({ ...f.sources }, f.job, period, f.gate),
    ).rejects.toThrow('locked');
  });
  it('lost pre-lock acknowledgment also prevents a second command via fresh wrappers', async () => {
    const f = await fixture();
    await time(f);
    const a = await preview(f),
      b = await previewOrganizationLabor(
        { ...f.sources },
        f.job,
        period,
        f.gate,
      ),
      original = f.sources.estimates.payroll.bind(f.sources.estimates),
      spy = vi
        .spyOn(f.sources.estimates, 'payroll')
        .mockImplementation(async (...args) => {
          if (args[4]) throw Error('unknown invocation');
          return original(...args);
        });
    expect((await confirmOrganizationLabor(a, true)).status).toBe('UNKNOWN');
    expect((await confirmOrganizationLabor(b, true)).status).toBe(
      'HELD_NO_REPLAY',
    );
    expect(spy.mock.calls.filter((c) => c[4])).toHaveLength(1);
  });
  it('withdrawn live confirmation before dispatch invokes no lock', async () => {
    const f = await fixture();
    await time(f);
    const view = await preview(f),
      spy = vi.spyOn(f.sources.estimates, 'payroll');
    expect(
      (await confirmOrganizationLabor(view, true, () => false)).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(spy).not.toHaveBeenCalled();
  });
  it('post-ack staff revocation stays UNKNOWN and withholds retained private preview', async () => {
    const f = await fixture();
    await time(f);
    const view = await preview(f),
      original = f.sources.estimates.payroll.bind(f.sources.estimates);
    vi.spyOn(f.sources.estimates, 'payroll').mockImplementation(
      async (...a) => {
        const r = await original(...a);
        if (a[4]) revoke(f);
        return r;
      },
    );
    expect((await confirmOrganizationLabor(view, true)).status).toBe('UNKNOWN');
    expect(() => assertOrganizationLaborAccess(view)).toThrow();
    expect((await reconcileOrganizationLabor(view)).status).toBe('UNKNOWN');
  });
  it.each(['revoked', 'foreign', 'wrong-property', 'unknown-job'])(
    'file fresh source admission rejects %s',
    async (mode) => {
      const f = await fixture(),
        file = await prepareSavedEvidence(
          f.sources,
          f.job,
          recordedCostRecipe,
          f.gate,
        );
      if (mode === 'revoked') revoke(f);
      if (mode === 'wrong-property')
        f.entry.target.location_id = f.sources.entries[1].target.location_id;
      const sources =
        mode === 'foreign' ? (await fixture(1)).sources : f.sources;
      await expect(
        openSavedEvidence(
          sources,
          mode === 'unknown-job' ? 'unrecorded' : f.job,
          recordedCostRecipe,
          file.text,
          f.gate,
        ),
      ).rejects.toThrow();
    },
  );
  it('stale file preserves exact original bytes and does not revive source actions', async () => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedCostRecipe,
        f.gate,
      );
    await forecast(f);
    expect((await reconcileSavedEvidence(file)).status).toBe(
      'STALE_SAVED_EVIDENCE',
    );
    expect(
      (
        await openSavedEvidence(
          f.sources,
          f.job,
          recordedCostRecipe,
          file.text,
          f.gate,
        )
      ).text,
    ).toBe(file.text);
  });
  it.each([
    'supplier',
    'unit_cost_minor',
    'private_notes',
    'rate_id',
    'financial_execution',
  ])(
    'strict allowlist rejects rehashed private/authority field %s',
    async (key) => {
      const f = await fixture(),
        file = await prepareSavedEvidence(
          f.sources,
          f.job,
          recordedCostRecipe,
          f.gate,
        ),
        text = await rehash(file.text, (p) => {
          p[key] = 'PRIVATE_SENTINEL';
        });
      await expect(
        decodeSavedEvidence(text, recordedCostRecipe),
      ).rejects.toThrow();
    },
  );
  it('rehashed unknown canonical time identity is not authorized by a hash', async () => {
    const f = await fixture();
    await time(f);
    const file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedCostRecipe,
        f.gate,
      ),
      text = await rehash(file.text, (p) => {
        (p.time as { id: string }[])[0].id = crypto.randomUUID();
      });
    await expect(
      openSavedEvidence(f.sources, f.job, recordedCostRecipe, text, f.gate),
    ).rejects.toThrow();
  });
  it('current canonical amount cannot be replaced by self-hashed claims', async () => {
    const f = await fixture(),
      file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedCostRecipe,
        f.gate,
      ),
      text = await rehash(file.text, (p) => {
        (p.facts as { remaining: { other: number } }).remaining.other += 1;
      });
    await expect(
      openSavedEvidence(f.sources, f.job, recordedCostRecipe, text, f.gate),
    ).rejects.toThrow();
  });
  it('source assertion rejects future revision and wrong issued identity', async () => {
    const f = await fixture(),
      snapshot = await readCostSavedRevision(f.sources, f.job, f.gate),
      payload = structuredClone(recordedCostRecipe.project(snapshot));
    payload.job_revision += 1;
    expect(() => assertRecordedCostSource(payload, snapshot)).toThrow();
    payload.job_revision -= 1;
    payload.issued.version_id = crypto.randomUUID();
    expect(() =>
      parseRecordedCostEvidence(payload, snapshot.identity),
    ).toThrow();
  });
  it('files and preview exclude private workforce and supplier internals', async () => {
    const f = await fixture();
    await time(f);
    const file = await prepareSavedEvidence(
        f.sources,
        f.job,
        recordedCostRecipe,
        f.gate,
      ),
      view = await preview(f),
      serialized = JSON.stringify([file.envelope.payload, view]);
    expect(serialized).not.toMatch(
      /PRIVATE_|cash_hour_minor|salary_week_minor|rate_id|worker_id|supplier|unit_cost_minor|burden_bps|review_reference/,
    );
  });
  it('OFF precedes source and period getters', async () => {
    let reads = 0;
    const sources = new Proxy({} as OperatingSources, {
        get() {
          reads++;
          throw Error('getter');
        },
      }),
      input = {
        get start(): string {
          reads++;
          throw Error('getter');
        },
        get end(): string {
          reads++;
          throw Error('getter');
        },
      };
    await expect(
      previewOrganizationLabor(sources, 'job', input),
    ).rejects.toThrow();
    expect(reads).toBe(0);
    const html = renderToStaticMarkup(
      createElement(RecordedCostContinuity, { sources }),
    );
    expect(html).toContain('OFF');
    expect(reads).toBe(0);
  });
  it('no ledger, contract, invoice, payment, message or original issued mutation', async () => {
    const f = await fixture();
    await time(f);
    const original = JSON.stringify(f.entry.issued),
      before = f.sources.entries.map((e) =>
        JSON.stringify(e.release.read('staff')),
      ),
      view = await preview(f);
    await confirmOrganizationLabor(view, true);
    expect(JSON.stringify(f.entry.issued)).toBe(original);
    expect(
      f.sources.entries.map((e) => JSON.stringify(e.release.read('staff'))),
    ).toEqual(before);
  });
  it('overlapping original preparation attempts across fresh wrappers share one canonical hold', async () => {
    const f = await fixture();
    await time(f);
    const a = await preview(f),
      b = await previewOrganizationLabor(
        { ...f.sources },
        f.job,
        { ...period, end: '2026-02-05T00:00:00.000Z' },
        f.gate,
      ),
      original = f.sources.estimates.payroll.bind(f.sources.estimates),
      spy = vi
        .spyOn(f.sources.estimates, 'payroll')
        .mockImplementation(async (...args) => {
          if (args[4]) throw Error('lost invocation acknowledgment');
          return original(...args);
        });
    expect((await confirmOrganizationLabor(a, true)).status).toBe('UNKNOWN');
    expect((await confirmOrganizationLabor(b, true)).status).toBe(
      'HELD_NO_REPLAY',
    );
    expect(spy.mock.calls.filter((c) => c[4])).toHaveLength(1);
  });
  it('unsubmitted period entries prevent even an original preview', async () => {
    const f = await fixture();
    await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
      job_id: f.job,
      overhead_center: null,
      task: 'Incomplete synthetic time',
      kind: 'work',
      started_at: '2026-02-03T14:00:00.000Z',
      ended_at: '2026-02-03T15:00:00.000Z',
      billable: true,
      corrects_id: null,
    });
    await expect(preview(f)).rejects.toThrow();
    expect((await f.sources.estimates.workforce(f.org)).periods).toHaveLength(
      0,
    );
  });
  it('revocation during original preview await withholds private projection', async () => {
    const f = await fixture();
    await time(f);
    const original = f.sources.estimates.payroll.bind(f.sources.estimates);
    vi.spyOn(f.sources.estimates, 'payroll').mockImplementation(
      async (...args) => {
        const result = await original(...args);
        revoke(f);
        return result;
      },
    );
    await expect(preview(f)).rejects.toThrow();
  });
  it('live source withdrawal after invocation is permanently UNKNOWN', async () => {
    const f = await fixture();
    await time(f);
    const view = await preview(f);
    let calls = 0;
    expect(
      (await confirmOrganizationLabor(view, true, () => ++calls < 3)).status,
    ).toBe('UNKNOWN');
    expect((await reconcileOrganizationLabor(view)).status).toBe('UNKNOWN');
    expect((await f.sources.estimates.workforce(f.org)).periods).toHaveLength(
      1,
    );
  });
  it('saved projection mutation during source hashing prevents evidence exposure', async () => {
    const f = await fixture(),
      original = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (!changed) {
        changed = true;
        await forecast(f);
      }
      return result;
    });
    await expect(
      prepareSavedEvidence(f.sources, f.job, recordedCostRecipe, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  });
  it('forged caller preview cannot invoke original preparation', async () => {
    const f = await fixture();
    await time(f);
    const view = await preview(f),
      spy = vi.spyOn(f.sources.estimates, 'payroll');
    expect((await confirmOrganizationLabor({ ...view }, true)).status).toBe(
      'UNKNOWN',
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
