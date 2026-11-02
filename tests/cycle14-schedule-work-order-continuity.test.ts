import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { type ScheduleProposalRevisionInput } from '../src/lib/workflows/schedule-proposal-revisions';
import { reviewWorkOrderRevision } from '../src/lib/workflows/work-order-revisions';
import {
  beginScheduleWorkOrderContinuity as begin,
  prepareScheduleWorkOrderInstructions as prepare,
  assertScheduleWorkOrderContinuityNow as current,
  reconcileScheduleWorkOrderContinuity as reconcile,
  closeScheduleWorkOrderContinuity as close,
  openScheduleWorkOrderContinuitySource as open,
} from '../src/lib/workflows/schedule-work-order-continuity';
import { ScheduleWorkOrderContinuity } from '../src/components/workflows/ScheduleWorkOrderContinuity';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    e = sources.entries[0];
  const original = {
    week_start: e.day,
    timezone: e.timezone,
    proposal: {
      job_id: e.target.job_id!,
      source_visit_id: e.scheduled_visit_id,
      worker_id: e.worker_id,
      day: e.day,
      start: e.day + 'T09:00',
      end: e.day + 'T11:00',
      hours_start: e.day + 'T08:00',
      hours_end: e.day + 'T16:00',
    },
  };
  const input: ScheduleProposalRevisionInput = {
    original,
    proposed: {
      ...original,
      proposal: {
        ...original.proposal,
        start: e.day + 'T11:00',
        end: e.day + 'T13:00',
      },
    },
    expected_revision: 0,
    expires_at: Date.now() + 30 * 60_000,
  };
  return {
    sources,
    gate,
    input,
    note: {
      instructions:
        'Staff proposes access-path protection; issued scope remains unchanged.',
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const start = (f: Fixture) => begin(f.sources, f.input, f.gate);
it.each([0, 1, 2])(
  'brand %s exact schedule → instruction handoff preserves sources and canonical records',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const handoff = await start(f),
      packet = await prepare(handoff, f.note, f.gate);
    expect(handoff.schedule.revision).toBe(1);
    expect(packet.order.revision).toBe(2);
    expect(packet.predecessor).toEqual({
      revision: 1,
      sha256: handoff.schedule.integrity.sha256,
      source_version: handoff.source_version,
    });
    expect(packet.order.original).toEqual(handoff.schedule.original);
    expect(packet.order.proposed).toEqual(handoff.schedule.proposed);
    expect(packet.order.instructions).toBe(f.note.instructions);
    expect(packet.order.job_id).toBe(handoff.job_id);
    expect(packet.order.customer_id).toBe(handoff.customer_id);
    expect(packet.order.property_id).toBe(handoff.property_id);
    expect(current(packet)).toBe('PREPARED_REVIEW_ONLY');
    expect(current(handoff)).toBe('PREPARED_REVIEW_ONLY');
    expect((await reconcile(packet)).status).toBe('PREPARED_REVIEW_ONLY');
    const detail = await open(packet);
    expect(JSON.stringify(detail)).toContain(handoff.job_id);
    expect(packet.order.durable_receipt).toBe('UNKNOWN');
    expect(packet.order.actual_availability).toBe('UNKNOWN');
    expect(Object.values(packet.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(Object.isFrozen(packet)).toBe(true);
    expect(JSON.stringify(packet)).not.toMatch(
      /unit_cost|supplier|payroll|PRIVATE|@example.invalid/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it('separate instruction confirmation is required without consuming the ready handoff', async () => {
  const f = await fixture(),
    h = await start(f);
  await expect(prepare(h, f.note)).rejects.toThrow();
  expect(current(h)).toBe('READY_FOR_WORK_ORDER');
  await expect(prepare(h, f.note, f.gate)).resolves.toBeTruthy();
});
it('a handoff cannot create duplicate or competing instruction successors', async () => {
  const f = await fixture(),
    h = await start(f);
  const results = await Promise.allSettled([
    prepare(h, f.note, f.gate),
    prepare(h, { instructions: 'Competing staff instruction' }, f.gate),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expect(
    prepare(h, { instructions: 'New note cannot replay' }, f.gate),
  ).rejects.toThrow();
});
it.each(['CANCEL', 'REVOKE'] as const)(
  '%s before instruction handoff is terminal and exactly reconciled',
  async (action) => {
    const f = await fixture(),
      h = await start(f);
    close(h, action);
    expect((await reconcile(h)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
    await expect(open(h)).rejects.toThrow();
    await expect(start(f)).rejects.toThrow();
  },
);
it.each(['CANCEL', 'REVOKE'] as const)(
  '%s after instruction handoff retains successor identity without retry',
  async (action) => {
    const f = await fixture(),
      h = await start(f),
      p = await prepare(h, f.note, f.gate);
    close(p, action);
    expect((await reconcile(h)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    expect((await reconcile(p)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
  },
);
it.each(['ready', 'prepared'])(
  '%s expiration blocks successor actions and retains exact read-only status',
  async (stage) => {
    const f = await fixture(),
      h = await start(f),
      view = stage === 'prepared' ? await prepare(h, f.note, f.gate) : h;
    vi.spyOn(Date, 'now').mockReturnValue(f.input.expires_at);
    expect((await reconcile(view)).status).toBe('EXPIRED');
    await expect(open(view)).rejects.toThrow();
    await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
  },
);
it('a different actual C13 successor supersedes the retained schedule instead of silently substituting', async () => {
  const f = await fixture(),
    h = await start(f);
  await reviewWorkOrderRevision(
    f.sources,
    {
      schedule: { ...structuredClone(f.input), expected_revision: 1 },
      instructions: 'Different explicit review',
    },
    f.gate,
  );
  await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
  expect((await reconcile(h)).status).toBe('UNKNOWN');
});
it.each(['source', 'staff', 'gate', 'clock', 'schedule'] as const)(
  'late %s drift is UNKNOWN, never a fresh successor',
  async (kind) => {
    const f = await fixture(),
      h = await start(f),
      real = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await real(...args);
      if (!changed) {
        changed = true;
        if (kind === 'source') f.sources.entries = [...f.sources.entries];
        if (kind === 'staff')
          vi.spyOn(
            f.sources.operations,
            'syntheticMemberships',
          ).mockReturnValue([]);
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'clock') vi.spyOn(Date, 'now').mockReturnValue(0);
        if (kind === 'schedule')
          f.input.proposed.proposal.end = f.input.original.proposal.end;
      }
      return result;
    });
    await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
    expect((await reconcile(h)).status).toBe('UNKNOWN');
    await expect(
      prepare(
        h,
        { instructions: 'Replacement prohibited' },
        { enabled: true, confirmed: true },
      ),
    ).rejects.toThrow();
  },
);
it('lost acknowledgement retains the pending logical hold and exact reconciliation never calls the writer again', async () => {
  const f = await fixture(),
    h = await start(f),
    real = crypto.subtle.digest.bind(crypto.subtle);
  let thrown = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await real(...args);
    if (!thrown) {
      thrown = true;
      throw Error('Lost local acknowledgement');
    }
    return result;
  });
  await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
  vi.restoreAllMocks();
  const digest = vi.spyOn(crypto.subtle, 'digest');
  expect((await reconcile(h)).status).toBe('UNKNOWN');
  expect(digest).not.toHaveBeenCalled();
  await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
  await expect(start(f)).rejects.toThrow();
});
it('instructions changed during an await permanently hold the handoff', async () => {
  const f = await fixture(),
    h = await start(f),
    real = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const r = await real(...args);
    f.note.instructions = 'Changed during handoff';
    return r;
  });
  await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
  expect((await reconcile(h)).status).toBe('UNKNOWN');
});
it('a lost source read before C13 revision admission permanently closes the original C12 lineage', async () => {
  const f = await fixture(),
    h = await start(f);
  vi.spyOn(f.sources.operations, 'listCustomers').mockRejectedValueOnce(
    Error('Source read acknowledgement lost'),
  );
  await expect(prepare(h, f.note, f.gate)).rejects.toThrow();
  vi.restoreAllMocks();
  expect((await reconcile(h)).status).toBe('UNKNOWN');
  await expect(
    begin(
      f.sources,
      { ...structuredClone(f.input), expected_revision: 1 },
      f.gate,
    ),
  ).rejects.toThrow();
});
it('post-return mutable instruction inputs invalidate the review while the immutable snapshot remains exact', async () => {
  const f = await fixture(),
    h = await start(f),
    p = await prepare(h, f.note, f.gate),
    saved = JSON.stringify(p);
  f.note.instructions = 'Changed after return';
  expect(() => current(p)).toThrow();
  expect((await reconcile(p)).status).toBe('UNKNOWN');
  expect(JSON.stringify(p)).toBe(saved);
});
it('copied retained evidence cannot confer handoff or source authority', async () => {
  const f = await fixture(),
    h = await start(f),
    copy = structuredClone(h);
  await expect(prepare(copy, f.note, f.gate)).rejects.toThrow();
  expect((await reconcile(copy)).status).toBe('UNKNOWN');
  await expect(open(copy)).rejects.toThrow();
});
it.each(['job_id', 'source_visit_id', 'worker_id'] as const)(
  'foreign %s cannot enter the schedule handoff',
  async (key) => {
    const f = await fixture();
    f.input.original.proposal[key] = 'foreign-source';
    f.input.proposed.proposal[key] = 'foreign-source';
    await expect(start(f)).rejects.toThrow();
  },
);
it.each(['', ' ', ' leading', 'x'.repeat(2001)])(
  'invalid instruction text does not consume a ready handoff',
  async (instructions) => {
    const f = await fixture(),
      h = await start(f);
    await expect(prepare(h, { instructions }, f.gate)).rejects.toThrow();
    expect(current(h)).toBe('READY_FOR_WORK_ORDER');
  },
);
it('OFF precedes source or input accessors', async () => {
  const getter = vi.fn(),
    source = Object.defineProperty({}, 'entries', {
      get: getter,
    }) as Fixture['sources'],
    input = Object.defineProperty({}, 'original', {
      get: getter,
    }) as ScheduleProposalRevisionInput;
  await expect(begin(source, input)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(
    renderToStaticMarkup(
      createElement(ScheduleWorkOrderContinuity, { sources: source }),
    ),
  ).toContain('continuity is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:', 'ftp:'])(
  'protocol %s remains off without source access',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'entries', {
        get: getter,
      }) as Fixture['sources'];
    expect(
      renderToStaticMarkup(
        createElement(ScheduleWorkOrderContinuity, { sources, enabled: true }),
      ),
    ).toContain('continuity is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s accessible initial controls carry the selected exact job without repeated selection',
  async (brand) => {
    const f = await fixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(ScheduleWorkOrderContinuity, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.sources.entries[2].target.job_id!,
      }),
    );
    expect(html).toContain('Review continuity schedule proposal');
    expect(html).toContain('Review expiration in minutes');
    expect(html).toContain('Actual availability is UNKNOWN');
    expect(html).not.toMatch(/PRIVATE|supplier|payroll/);
    expect(html).toContain(
      'value="' + f.sources.entries[2].target.job_id + '" selected',
    );
  },
);
