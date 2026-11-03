import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import {
  readMaintenanceAgenda as read,
  assertMaintenanceAgendaNow as current,
  filterMaintenanceAgenda as filter,
  inspectMaintenanceAgendaOccurrence as inspect,
  reconcileMaintenanceAgenda as reconcile,
  continueMaintenanceAgenda as next,
  type MaintenanceAgendaFilter,
} from '../src/lib/workflows/maintenance-agenda';
import { MaintenanceAgenda } from '../src/components/workflows/MaintenanceAgenda';
import * as reminders from '../src/lib/growth-reminders';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    input: FollowUpReadinessInput = {
      window: {
        from: sources.entries[0].day,
        through: '2027-01-25',
        as_of: sources.entries[0].day + 'T12:00:00.000Z',
        channel: 'email',
      },
      lead_days: 14,
      overdue_days: 7,
      query: '',
      kind: 'all',
      readiness: 'all',
      job_id: '',
      customer_id: '',
      location_id: '',
      purpose: 'recurring_maintenance',
      channel_state: 'all',
    };
  return { gate, sources, input };
}
const all: MaintenanceAgendaFilter = {
  query: '',
  kind: 'all',
  channel_state: 'all',
  from: '2026-12-28',
  through: '2027-01-25',
  job_id: '',
  scope: 'all',
};
it.each([0, 1, 2])(
  'brand %s composes actual recurring sources and renewal blockers without messages or business writes',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      writes = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.property, 'addVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch'),
      view = await read(f.sources, f.input, f.gate);
    expect(new Set(view.rows.map((r) => r.context.job_id)).size).toBe(4);
    for (const row of view.rows) {
      const e = f.sources.entries.find(
        (x) => x.target.job_id === row.context.job_id,
      )!;
      expect(row.context).toMatchObject({
        organization_id: f.sources.company.id,
        customer_id: e.target.customer_id,
        location_id: e.target.location_id,
        issued_version_id: e.target.version_id,
      });
      expect(row.plan_reference.id).toBe(e.plan_id);
      expect(row.plan_reference.revision).toBe(row.source.plan_revision);
    }
    expect(view.blockers).toEqual({
      current_channel_authority: 'UNKNOWN',
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
      renewal_terms: 'UNKNOWN',
      send: 'BLOCKED',
    });
    expect(view.renewal_review).toBe('REQUIREMENTS_ONLY_NO_VERIFIED_AGREEMENT');
    expect(view.recipient).toBeNull();
    expect(view.provider_request).toBeNull();
    expect(Object.values(view.authority).every((v) => !v)).toBe(true);
    expect(view.count_is_complete).toBe(false);
    expect(Object.isFrozen(view.rows)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /unit_cost|supplier|payroll|margin|PRIVATE|@example.invalid|555010/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(writes.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s combines exact job/date/kind/source-text/planning filters with accurate captured counts',
  async (brand) => {
    const f = await fixture(brand),
      view = await read(f.sources, f.input, f.gate),
      row = view.rows[0],
      result = filter(view, {
        ...all,
        query: row.plan_name.toUpperCase(),
        kind: row.kind,
        job_id: row.context.job_id,
        from: row.recorded_due_on,
        through: row.recorded_due_on,
        scope: row.staff_planning_eligible
          ? 'planning_eligible'
          : 'needs_review',
      });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(
      result.rows.every(
        (r) =>
          r.context.job_id === row.context.job_id &&
          r.plan_reference.id === row.plan_reference.id &&
          r.recorded_due_on === row.recorded_due_on,
      ),
    ).toBe(true);
    expect(result.matching).toBe(result.rows.length);
    expect(result.captured).toBe(view.rows.length);
    expect(result.send).toBe(false);
    expect(
      filter(view, { ...all, query: '.*literal[missing]' }).rows,
    ).toHaveLength(0);
    expect(filter(view, all).rows).toEqual(view.rows);
  },
);
it('selected job source scope is exact and cannot broaden to another property through filters', async () => {
  const f = await fixture();
  f.input.job_id = f.sources.entries[2].target.job_id!;
  const view = await read(f.sources, f.input, f.gate);
  expect(view.rows.every((r) => r.context.job_id === f.input.job_id)).toBe(
    true,
  );
  expect(filter(view, { ...all, job_id: f.input.job_id }).rows).toEqual(
    view.rows,
  );
  expect(() =>
    filter(view, { ...all, job_id: f.sources.entries[0].target.job_id! }),
  ).toThrow();
});
it.each([
  { from: '2026-02-30' },
  { from: '2027-01-26' },
  { through: '2027-01-26' },
  { scope: 'send_ready' },
  { kind: 'renewal_contract' },
  { job_id: 'foreign-job' },
  { query: 'x'.repeat(201) },
])(
  'invalid scope/filter %j is rejected without replacing source records',
  async (bad) => {
    const f = await fixture(),
      view = await read(f.sources, f.input, f.gate);
    expect(() =>
      filter(view, { ...all, ...bad } as MaintenanceAgendaFilter),
    ).toThrow();
    expect(filter(view, all).rows).toEqual(view.rows);
  },
);
it('OFF precedes source and input getters', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'],
    input = Object.defineProperty({}, 'window', {
      get: getter,
    }) as FollowUpReadinessInput;
  await expect(read(sources, input)).rejects.toThrow();
  expect(
    renderToStaticMarkup(createElement(MaintenanceAgenda, { sources })),
  ).toContain('Maintenance agenda is off');
  expect(getter).not.toHaveBeenCalled();
});
it('admitted component rejects accessor source containers before invoking getters', () => {
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'];
  expect(
    renderToStaticMarkup(
      createElement(MaintenanceAgenda, { sources, enabled: true }),
    ),
  ).toContain('Current authorized maintenance sources unavailable');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:'])(
  'protocol %s remains OFF before source reads',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
        ReturnType<typeof fixture>
      >['sources'];
    expect(
      renderToStaticMarkup(
        createElement(MaintenanceAgenda, { sources, enabled: true }),
      ),
    ).toContain('Maintenance agenda is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it('an invalid selected host job has no available-record fallback', async () => {
  const f = await fixture();
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const html = renderToStaticMarkup(
    createElement(MaintenanceAgenda, {
      sources: f.sources,
      enabled: true,
      selectedJobId: 'foreign-job',
    }),
  );
  expect(html).toContain(
    'No exact authorized job selected. No fallback selection.',
  );
  expect(html).toContain(
    '<button disabled="">Load upcoming maintenance agenda',
  );
});
it.each(['job_id', 'customer_id', 'location_id'] as const)(
  'foreign %s admission cannot replace exact maintenance sources',
  async (selector) => {
    const f = await fixture();
    f.input[selector] = 'foreign';
    await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
  },
);
it.each([1, 2])(
  'company %s cannot reuse another tenant selected maintenance job',
  async (brand) => {
    const a = await fixture(),
      b = await fixture(brand);
    a.input.job_id = a.sources.entries[2].target.job_id!;
    await expect(read(b.sources, a.input, b.gate)).rejects.toThrow();
  },
);
it('same-company wrong-property selection is rejected before queue rows', async () => {
  const f = await fixture();
  f.input.job_id = f.sources.entries[2].target.job_id!;
  f.input.location_id = f.sources.entries[0].target.location_id;
  await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
});
it('a copied agenda or fabricated occurrence cannot inspect or navigate', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.input, f.gate),
    callback = vi.fn();
  expect(() => current(structuredClone(view))).toThrow();
  expect((await reconcile(structuredClone(view))).status).toBe('UNKNOWN');
  await expect(inspect(view, 'fabricated-occurrence')).rejects.toThrow();
  await expect(
    next(structuredClone(view), view.rows[0].key, callback),
  ).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
it.each(['gate', 'member', 'source', 'purpose', 'channel'] as const)(
  'observed %s change is terminal despite restored inputs',
  async (kind) => {
    const f = await fixture(),
      view = await read(f.sources, f.input, f.gate),
      entries = f.sources.entries;
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'member')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'source') f.sources.entries = [...entries];
    if (kind === 'purpose') f.input.purpose = 'marketing';
    if (kind === 'channel') f.input.window.channel = 'sms';
    expect(() => current(view)).toThrow();
    vi.restoreAllMocks();
    f.gate.confirmed = true;
    f.sources.entries = entries;
    f.input.purpose = 'recurring_maintenance';
    f.input.window.channel = 'email';
    expect((await reconcile(view)).status).toBe('UNKNOWN');
    await expect(inspect(view, view.rows[0].key)).rejects.toThrow();
  },
);
it.each(['purpose', 'suppression', 'channel'] as const)(
  'canonical %s evidence drift withdraws continuation and remains UNKNOWN',
  async (kind) => {
    const f = await fixture(),
      view = await read(f.sources, f.input, f.gate),
      original = reminders.readGrowthReminderReview,
      callback = vi.fn();
    vi.spyOn(reminders, 'readGrowthReminderReview').mockImplementation(
      async (...args) => {
        const result = await original(...args);
        if (kind === 'purpose')
          return {
            ...result,
            purpose_consent:
              'CONFLICTING_FIXTURE' as typeof result.purpose_consent,
          };
        if (kind === 'suppression')
          return {
            ...result,
            suppression: 'CONFLICTING_FIXTURE' as typeof result.suppression,
          };
        return {
          ...result,
          consent: {
            ...result.consent,
            observed_channel_state:
              result.consent.observed_channel_state === 'UNKNOWN'
                ? 'RECORDED_DENIED'
                : 'UNKNOWN',
          },
        };
      },
    );
    await expect(next(view, view.rows[0].key, callback)).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
    expect((await reconcile(view)).status).toBe('UNKNOWN');
    vi.restoreAllMocks();
    expect((await reconcile(view)).status).toBe('UNKNOWN');
  },
);
it('gate withdrawal during final agenda hash withholds the result', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_MAINTENANCE_AGENDA')
    )
      f.gate.confirmed = false;
    return result;
  });
  await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
});
it.each([0, 1, 2])(
  'brand %s opens an exact original occurrence and continues its exact job to priorities',
  async (brand) => {
    const f = await fixture(brand),
      view = await read(f.sources, f.input, f.gate),
      row = view.rows[0],
      selected = await inspect(view, row.key),
      callback = vi.fn();
    expect(selected.row).toBe(row);
    expect(selected.row.plan_reference.revision).toBe(row.source.plan_revision);
    expect(selected.send).toBe(false);
    await next(view, row.key, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      row.context.job_id,
      'priorities',
    );
  },
);
it('concurrent sender-free navigation invokes exactly one callback for an exact job', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.input, f.gate),
    row = view.rows[0],
    callback = vi.fn(),
    results = await Promise.allSettled([
      next(view, row.key, callback),
      next(view, row.key, callback),
    ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(callback).toHaveBeenCalledTimes(1);
});
it('known callback withdrawal before invocation is clean no-dispatch', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.input, f.gate),
    row = view.rows[0],
    old = vi.fn(),
    fresh = vi.fn();
  expect(await next(view, row.key, old, () => false)).toMatchObject({
    status: 'WITHDRAWN',
    send: false,
  });
  expect(old).not.toHaveBeenCalled();
  await next(view, row.key, fresh);
  expect(fresh).toHaveBeenCalledExactlyOnceWith(
    row.context.job_id,
    'priorities',
  );
});
it.each(['throw', 'reject'] as const)(
  'invoked %s outcome holds canonical company/job UNKNOWN through fresh wrappers, purpose and occurrence changes',
  async (outcome) => {
    const f = await fixture(),
      view = await read(f.sources, f.input, f.gate),
      row = view.rows[0],
      callback = vi.fn(() => {
        if (outcome === 'throw') throw Error('Lost acknowledgement');
        return Promise.reject(Error('Lost acknowledgement'));
      });
    await expect(next(view, row.key, callback)).rejects.toThrow(
      'Lost acknowledgement',
    );
    const fresh = await read(
        { ...f.sources },
        { ...f.input, purpose: 'service_follow_up' },
        f.gate,
      ),
      replacement = vi.fn(),
      sameJob = fresh.rows.filter(
        (r) => r.context.job_id === row.context.job_id,
      );
    await expect(
      next(fresh, sameJob[sameJob.length - 1].key, replacement),
    ).rejects.toThrow();
    expect((await reconcile(fresh)).status).toBe('UNKNOWN');
    expect(replacement).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
  },
);
it('mutable source getter replacement cannot rebind an ambiguous outcome to another repository', async () => {
  const f = await fixture(),
    wrapper = { ...f.sources },
    view = await read(f.sources, f.input, f.gate),
    row = view.rows[0],
    callback = vi.fn(() => {
      Object.defineProperty(f.sources, 'operations', {
        configurable: true,
        get() {
          throw Error('Lost canonical handle');
        },
      });
      throw Error('Unknown');
    });
  await expect(next(view, row.key, callback)).rejects.toThrow();
  const fresh = await read(wrapper, { ...f.input }, f.gate),
    retry = vi.fn();
  await expect(next(fresh, row.key, retry)).rejects.toThrow();
  expect(retry).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %s awaits a resolved current asynchronous continuation before reporting local success',
  async (brand) => {
    const f = await fixture(brand),
      view = await read(f.sources, f.input, f.gate),
      row = view.rows[0];
    let release!: () => void, started!: () => void;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
      }),
      invoked = new Promise<void>((resolve) => {
        started = resolve;
      }),
      callback = vi.fn(async () => {
        started();
        await pending;
      }),
      settled = vi.fn();
    const attempt = next(view, row.key, callback).then((result) => {
      settled();
      return result;
    });
    await invoked;
    expect(settled).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      row.context.job_id,
      'priorities',
    );
    release();
    expect(await attempt).toMatchObject({
      status: 'LOCAL_NAVIGATION_ONLY',
      send: false,
    });
    expect(settled).toHaveBeenCalledTimes(1);
    expect((await reconcile(view)).status).toBe('CAPTURED_NOT_ATOMIC');
  },
);
it.each(['withdraw', 'replace', 'replace_then_restore'] as const)(
  'asynchronous invoked callback %s before acknowledgment retains canonical UNKNOWN',
  async (change) => {
    const f = await fixture(),
      view = await read(f.sources, f.input, f.gate),
      row = view.rows[0];
    let release!: () => void,
      started!: () => void,
      generation = 0;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
      }),
      invoked = new Promise<void>((resolve) => {
        started = resolve;
      }),
      callback = vi.fn(async () => {
        started();
        await pending;
      });
    let liveCallback: typeof callback | undefined = callback;
    const attempt = next(
      view,
      row.key,
      callback,
      () => generation === 0 && liveCallback === callback,
    );
    await invoked;
    generation++;
    liveCallback = change === 'withdraw' ? undefined : vi.fn();
    if (change === 'replace_then_restore') {
      generation++;
      liveCallback = callback;
    }
    release();
    await expect(attempt).rejects.toThrow('lease changed after invocation');
    expect(callback).toHaveBeenCalledTimes(1);
    const fresh = await read(
        { ...f.sources },
        { ...f.input, purpose: 'service_follow_up' },
        f.gate,
      ),
      retry = vi.fn();
    await expect(next(fresh, row.key, retry)).rejects.toThrow();
    expect((await reconcile(view)).status).toBe('UNKNOWN');
    expect((await reconcile(fresh)).status).toBe('UNKNOWN');
    expect(retry).not.toHaveBeenCalled();
  },
);
it('source change while an invoked asynchronous callback waits cannot report success or retry through a restored wrapper', async () => {
  const f = await fixture(),
    wrapper = { ...f.sources },
    view = await read(f.sources, f.input, f.gate),
    row = view.rows[0],
    originalEntries = f.sources.entries;
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((resolve) => {
      release = resolve;
    }),
    invoked = new Promise<void>((resolve) => {
      started = resolve;
    }),
    callback = vi.fn(async () => {
      started();
      await pending;
    });
  const attempt = next(view, row.key, callback);
  await invoked;
  f.sources.entries = [...originalEntries];
  release();
  await expect(attempt).rejects.toThrow();
  f.sources.entries = originalEntries;
  const fresh = await read(wrapper, { ...f.input }, f.gate),
    retry = vi.fn();
  await expect(next(fresh, row.key, retry)).rejects.toThrow();
  expect((await reconcile(fresh)).status).toBe('UNKNOWN');
  expect(callback).toHaveBeenCalledTimes(1);
  expect(retry).not.toHaveBeenCalled();
});
it('a late rejected asynchronous acknowledgment stays UNKNOWN after purpose and callback restoration', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.input, f.gate),
    row = view.rows[0];
  let reject!: (error: Error) => void, started!: () => void;
  const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    }),
    invoked = new Promise<void>((resolve) => {
      started = resolve;
    }),
    callback = vi.fn(async () => {
      started();
      await pending;
    });
  const attempt = next(view, row.key, callback);
  await invoked;
  reject(Error('Late acknowledgment lost'));
  await expect(attempt).rejects.toThrow('Late acknowledgment lost');
  const fresh = await read(
      { ...f.sources },
      { ...f.input, purpose: 'service_follow_up' },
      f.gate,
    ),
    retry = vi.fn();
  await expect(next(fresh, row.key, retry)).rejects.toThrow();
  expect((await reconcile(fresh)).status).toBe('UNKNOWN');
  expect(retry).not.toHaveBeenCalled();
});
