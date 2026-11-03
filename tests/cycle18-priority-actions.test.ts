import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { PriorityActions } from '../src/components/workflows/PriorityActions';
import {
  readPriorityActions,
  assertPriorityActionsCurrent,
  filterPriorityActions,
  inspectPriorityAction,
  priorityOriginalProps,
  priorityContinuationStep,
  continuePriorityAction,
  type PriorityLiveCallback,
} from '../src/lib/workflows/priority-actions';
import {
  readOwnerActionDesk,
  openOwnerActionDeskTask,
  assertOwnerActionDeskTaskCurrent,
} from '../src/lib/workflows/owner-action-desk';
import {
  readAddonTaskDesk,
  openAddonTaskDeskControls,
} from '../src/lib/workflows/addon-task-desk';
import { advancedHandoffKinds } from '../src/lib/workflows/advanced-handoffs';
import {
  readSourceBoundAddons,
  reviewSourceBoundAddons,
  inspectSourceBoundAddons,
} from '../src/lib/workflows/source-bound-addons';
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
const all = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
  band: 'all',
} as const;
async function fixture(brand = 0, index = 0) {
  const gate = { enabled: true, confirmed: true },
    original = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = original.entries[index],
    sources = { ...original, entries: [entry] },
    input = { job_id: entry.target.job_id! };
  return { gate, original, entry, sources, input };
}
async function opened(brand = 0) {
  const f = await fixture(brand),
    review = await readPriorityActions(f.sources, f.input, f.gate),
    row = review.cards.find((c) => c.source.kind === 'report')!,
    task = await inspectPriorityAction(review, row.key);
  return { ...f, review, row, task };
}
function during(change: () => void | Promise<void>) {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (!seen) {
      seen = true;
      await change();
    }
    return result;
  });
  return () => expect(seen).toBe(true);
}
it.each([0, 1, 2])(
  'brand %i uses original deterministic daily priority sources without business/model effects',
  async (brand) => {
    const f = await fixture(brand),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.entry.release, 'command'),
      ],
      ids = vi.spyOn(crypto, 'randomUUID'),
      review = await readPriorityActions(f.sources, f.input, f.gate);
    expect(review.mode).toBe('LOCAL_DAILY_ACTION_CENTER');
    expect(review.organization_id).toBe(f.sources.company.id);
    expect(review.cards.every((c) => c.job_id === f.input.job_id)).toBe(true);
    expect(review.cards.map((c) => c.rank)).toEqual(
      review.cards.map((_, i) => i + 1),
    );
    expect(review.model).toBe('NONE');
    expect(Object.values(review.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(
      priorityOriginalProps(review, f.input.job_id).sources.operations,
    ).toBe(f.sources.operations);
    expect(
      priorityOriginalProps(review, f.input.job_id).sources.entries[0],
    ).toBe(f.entry);
    expect(priorityOriginalProps(review, f.input.job_id)).toBe(
      priorityOriginalProps(review, f.input.job_id),
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i literal source/area/job filters preserve original rank and source identity',
  async (brand) => {
    const f = await opened(brand),
      rows = filterPriorityActions(f.review, {
        ...all,
        query: f.row.source.id,
        area: f.row.area,
      });
    expect(rows.cards.some((c) => c.key === f.row.key)).toBe(true);
    expect(rows.cards.map((c) => c.rank)).toEqual(
      [...rows.cards].map((c) => c.rank).sort((a, b) => a - b),
    );
    expect(
      filterPriorityActions(f.review, { ...all, query: '.*' }).cards,
    ).toEqual([]);
    expect(
      filterPriorityActions(f.review, {
        ...all,
        query: f.row.source.id,
        area: f.row.area === 'field' ? 'finance' : 'field',
      }).cards,
    ).toEqual([]);
  },
);
it.each([0, 1, 2])(
  'brand %i exact report source is retained without a new inspection window',
  async (brand) => {
    const f = await opened(brand),
      bytes = JSON.stringify(f.task);
    expect(f.task.source.id).toBe(f.entry.report_id);
    expect(f.task.source.version).toBe(f.entry.published_version);
    expect(f.task.target.job_id).toBe(f.input.job_id);
    expect(f.task.target.location_id).toBe(f.entry.target.location_id);
    expect(await inspectPriorityAction(f.review, f.row.key)).toBe(f.task);
    expect(JSON.stringify(f.task)).toBe(bytes);
    expect(priorityContinuationStep(f.task)).toBe('customer');
    expect(f.task).not.toHaveProperty('expires_at');
  },
);
it.each([0, 1, 2])(
  'brand %i queue leaves original OwnerActionDesk finite read and fixed deadline available and unchanged',
  async (brand) => {
    const f = await opened(brand),
      props = priorityOriginalProps(f.review, f.input.job_id),
      review = await readOwnerActionDesk(
        props.sources,
        {
          review_on: f.entry.day,
          timezone: f.entry.timezone,
          ordering: 'EVIDENCE_FIRST',
          input_revision: 1,
        },
        f.gate,
      ),
      row = review.tasks.find((t) => t.source.kind === 'report')!,
      task = await openOwnerActionDeskTask(review, row.key, f.input.job_id),
      expires = task.expires_at;
    filterPriorityActions(f.review, all);
    expect(() =>
      assertOwnerActionDeskTaskCurrent(task, f.input.job_id),
    ).not.toThrow();
    expect(task.expires_at).toBe(expires);
    await expect(
      readOwnerActionDesk(
        { ...props.sources },
        {
          review_on: f.entry.day,
          timezone: f.entry.timezone,
          ordering: 'EVIDENCE_FIRST',
          input_revision: 1,
        },
        f.gate,
      ),
    ).rejects.toThrow(/already held/);
  },
);
it.each(advancedHandoffKinds)(
  'original %s mode uses the same canonical job from the exact control-handle subset',
  async (kind) => {
    const brand = advancedHandoffKinds.indexOf(kind) % 3,
      f = await opened(brand),
      props = priorityOriginalProps(f.review, f.input.job_id),
      task = await readAddonTaskDesk(
        props.sources,
        { job_id: props.selectedJobId, kind, edition: 'property_services' },
        f.gate,
      ),
      controls = openAddonTaskDeskControls(task);
    expect(task.source.job_id).toBe(f.input.job_id);
    expect(task.source.kind).toBe(kind);
    expect(task.source.issued_version_id).toBe(f.entry.target.version_id);
    expect(controls.sources.operations).toBe(f.sources.operations);
    expect(controls.selection.operational_ready).toBe(false);
    expect(controls.selection.missing_evidence.provider).toBe('UNKNOWN');
  },
);
it('fresh priority presentation cannot reset original add-on lost-ACK lifecycle hold', async () => {
  const f = await opened(),
    props = priorityOriginalProps(f.review, f.input.job_id),
    addon = await readAddonTaskDesk(
      props.sources,
      { job_id: f.input.job_id, kind: 'offline', edition: 'property_services' },
      f.gate,
    ),
    controls = openAddonTaskDeskControls(addon),
    read = await readSourceBoundAddons(
      controls.sources,
      controls.selection,
      f.gate,
    ),
    original = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (!seen && body.mode === 'LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE') {
      seen = true;
      throw Error('lost original ACK');
    }
    return original(...args);
  });
  await expect(
    reviewSourceBoundAddons(
      read,
      {
        confirmed: true,
        reviewed_source_sha256: read.integrity.sha256,
        external_reference: 'priority-existing-001',
        review_expires_at_ms: 2000,
      },
      { now_ms: 1000 },
    ),
  ).rejects.toThrow();
  expect(seen).toBe(true);
  vi.restoreAllMocks();
  expect((await inspectSourceBoundAddons(read)).status).toBe('UNKNOWN');
  const fresh = await readPriorityActions(
      { ...f.sources },
      { ...f.input },
      f.gate,
    ),
    nextProps = priorityOriginalProps(fresh, f.input.job_id);
  expect(nextProps.sources.operations).toBe(props.sources.operations);
  const nextAddon = await readAddonTaskDesk(
      nextProps.sources,
      {
        job_id: f.input.job_id,
        kind: 'offline',
        edition: 'property_services',
      },
      f.gate,
    ),
    nextControls = openAddonTaskDeskControls(nextAddon),
    next = await readSourceBoundAddons(
      nextControls.sources,
      nextControls.selection,
      f.gate,
    );
  await expect(
    reviewSourceBoundAddons(
      next,
      {
        confirmed: true,
        reviewed_source_sha256: next.integrity.sha256,
        external_reference: 'replacement-label',
        review_expires_at_ms: 4000,
      },
      { now_ms: 1000 },
    ),
  ).rejects.toThrow(/Existing lifecycle/);
});
it.each([0, 1, 2])(
  'brand %i exact source continuation reaches customer review only after final revalidation',
  async (brand) => {
    const f = await opened(brand),
      cb = vi.fn();
    expect(
      await continuePriorityAction(f.review, f.task, cb, {
        current: cb,
        generation: 0,
      }),
    ).toBe(f.input.job_id);
    expect(cb).toHaveBeenCalledExactlyOnceWith(f.input.job_id, 'customer');
  },
);
it.each(['removed', 'replaced', 'restored'] as const)(
  'known callback %s before dispatch leaves original source usable',
  async (kind) => {
    const f = await opened(),
      cb = vi.fn(),
      replacement = vi.fn(),
      live: PriorityLiveCallback = { current: cb, generation: 0 },
      seen = during(() => {
        live.current = kind === 'replaced' ? replacement : undefined;
        live.generation++;
        if (kind === 'restored') {
          live.current = cb;
          live.generation++;
        }
      });
    await expect(
      continuePriorityAction(f.review, f.task, cb, live),
    ).rejects.toThrow(/withdrawn|replaced/);
    seen();
    expect(cb).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(() => assertPriorityActionsCurrent(f.review)).not.toThrow();
  },
);
it.each(['throw', 'reject'] as const)(
  'invoked callback %s holds canonical job UNKNOWN across fresh wrappers',
  async (kind) => {
    const f = await opened(),
      cb = vi.fn(() => {
        if (kind === 'throw') throw Error('lost host ACK');
        return Promise.reject(Error('lost host ACK'));
      }),
      live = { current: cb, generation: 0 };
    await expect(
      continuePriorityAction(f.review, f.task, cb, live),
    ).rejects.toThrow();
    await expect(
      continuePriorityAction(f.review, f.task, cb, live),
    ).rejects.toThrow(/UNKNOWN/);
    await expect(
      readPriorityActions({ ...f.sources }, { ...f.input }, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
    expect(cb).toHaveBeenCalledTimes(1);
  },
);
it.each([
  'member',
  'property',
  'company',
  'callback-replaced',
  'callback-restored',
  'input',
  'root',
] as const)(
  'async invoked callback %s substitution is terminal after final await and restoration',
  async (kind) => {
    const f = await opened(kind === 'member' ? 0 : kind === 'property' ? 1 : 2),
      bytes = JSON.stringify(f.review),
      company = f.sources.company,
      location = f.entry.target.location_id,
      entries = f.sources.entries,
      replacement = vi.fn();
    let restore = async () => {};
    const cb = vi.fn(async () => {
        await Promise.resolve();
        if (kind === 'member') {
          await f.sources.operations.configure(
            company.id,
            'active',
            'starter',
            {},
            company.id + '-backup-owner',
          );
          await f.sources.operations.revokeOwner(
            company.id,
            f.entry.target.actor_id,
          );
          restore = () =>
            f.sources.operations.configure(
              company.id,
              'active',
              'starter',
              {},
              f.entry.target.actor_id,
            );
        }
        if (kind === 'property') {
          f.entry.target.location_id = f.original.entries[1].target.location_id;
          restore = async () => {
            f.entry.target.location_id = location;
          };
        }
        if (kind === 'company') {
          f.sources.company =
            sampleCompanies[(sampleCompanies.indexOf(company) + 1) % 3];
          restore = async () => {
            f.sources.company = company;
          };
        }
        if (kind === 'input') {
          f.input.job_id = 'foreign';
          restore = async () => {
            f.input.job_id = f.entry.target.job_id!;
          };
        }
        if (kind === 'root') {
          f.sources.entries = [...f.sources.entries];
          restore = async () => {
            f.sources.entries = entries;
          };
        }
        if (kind === 'callback-replaced') {
          live.current = replacement;
          live.generation++;
          restore = async () => {
            live.current = cb;
            live.generation++;
          };
        }
        if (kind === 'callback-restored') {
          live.current = undefined;
          live.generation++;
          live.current = cb;
          live.generation++;
        }
      }),
      live: PriorityLiveCallback = { current: cb, generation: 0 };
    await expect(
      continuePriorityAction(f.review, f.task, cb, live),
    ).rejects.toThrow();
    await restore();
    expect(() => assertPriorityActionsCurrent(f.review)).toThrow(/UNKNOWN/);
    await expect(
      readPriorityActions({ ...f.sources }, { ...f.input }, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(JSON.stringify(f.review)).toBe(bytes);
  },
);
it('concurrent activation and duplicate inspection never dispatch twice or replace retained source', async () => {
  const f = await opened(),
    cb = vi.fn(),
    live = { current: cb, generation: 0 },
    results = await Promise.allSettled([
      continuePriorityAction(f.review, f.task, cb, live),
      continuePriorityAction(f.review, f.task, cb, live),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(cb).toHaveBeenCalledTimes(1);
  expect(await inspectPriorityAction(f.review, f.row.key)).toBe(f.task);
});
it.each([
  [0, 'member'],
  [1, 'property'],
  [2, 'company'],
] as const)(
  'brand %i observed %s restoration cannot revive source or new wrapper',
  async (brand, kind) => {
    const f = await opened(brand),
      company = f.sources.company,
      location = f.entry.target.location_id;
    let restore = () => {};
    if (kind === 'member') {
      const spy = vi
        .spyOn(f.sources.operations, 'syntheticMemberships')
        .mockReturnValue([]);
      restore = () => spy.mockRestore();
    }
    if (kind === 'property') {
      f.entry.target.location_id = f.original.entries[1].target.location_id;
      restore = () => {
        f.entry.target.location_id = location;
      };
    }
    if (kind === 'company') {
      f.sources.company = sampleCompanies[(brand + 1) % 3];
      restore = () => {
        f.sources.company = company;
      };
    }
    expect(() => assertPriorityActionsCurrent(f.review)).toThrow();
    restore();
    expect(() => assertPriorityActionsCurrent(f.review)).toThrow(/UNKNOWN/);
    await expect(
      readPriorityActions({ ...f.sources }, { ...f.input }, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
  },
);
it.each([0, 1, 2])(
  'brand %i private fields and unselected customer evidence stay excluded',
  async (brand) => {
    const f = await opened(brand),
      text = JSON.stringify({ review: f.review, task: f.task });
    for (const key of [
      'PRIVATE',
      'hourly_rate_minor',
      'unit_cost_minor',
      'supplier_cost',
      'internal_notes',
      'payroll',
      f.original.entries[1].target.customer_id,
      f.original.entries[1].report_id,
    ])
      expect(text).not.toContain(key);
  },
);
it.each(['hint', 'copy', 'getter', 'serializer', 'foreign-source'] as const)(
  'invalid %s cannot acquire source/control authority or execute hooks',
  async (kind) => {
    const f = await opened(),
      cb = vi.fn();
    if (kind === 'hint')
      await expect(
        readPriorityActions(f.sources, { job_id: 'foreign' }, f.gate),
      ).rejects.toThrow();
    if (kind === 'copy')
      expect(() =>
        priorityOriginalProps(
          JSON.parse(JSON.stringify(f.review)),
          f.input.job_id,
        ),
      ).toThrow();
    if (kind === 'getter')
      expect(() =>
        filterPriorityActions(
          f.review,
          Object.defineProperty({ ...all }, 'query', {
            enumerable: true,
            get: cb,
          }),
        ),
      ).toThrow();
    if (kind === 'serializer')
      await expect(
        readPriorityActions(
          f.sources,
          Object.assign({ ...f.input }, { toJSON: cb }),
          f.gate,
        ),
      ).rejects.toThrow();
    if (kind === 'foreign-source')
      await expect(
        inspectPriorityAction(
          f.review,
          f.original.entries[1].target.job_id! + ':foreign',
        ),
      ).rejects.toThrow();
    expect(cb).not.toHaveBeenCalled();
  },
);
it.each(['default', 'production', 'https', 'host', 'unconfirmed'] as const)(
  '%s OFF rejects domain and React before source getters',
  async (kind) => {
    const cb = vi.fn(),
      sources = Object.defineProperty({}, 'company', {
        get: cb,
      }) as OperatingSources;
    if (kind === 'production') vi.stubEnv('DEV', false);
    if (kind === 'https' || kind === 'host')
      vi.stubGlobal('window', {
        location: {
          hostname: kind === 'host' ? '127.0.0.1.example.invalid' : '127.0.0.1',
          protocol: kind === 'https' ? 'https:' : 'http:',
        },
      });
    await expect(
      readPriorityActions(
        sources,
        { job_id: null },
        {
          enabled: kind !== 'default',
          confirmed: kind !== 'default' && kind !== 'unconfirmed',
        },
      ),
    ).rejects.toThrow(/OFF/);
    if (kind !== 'unconfirmed')
      for (const view of ['priorities', 'advanced'] as const)
        expect(
          renderToStaticMarkup(
            createElement(PriorityActions, {
              sources,
              view,
              enabled: kind !== 'default',
            }),
          ),
        ).toContain('Priority actions are off');
    expect(cb).not.toHaveBeenCalled();
  },
);
it('both shared presentation modes admit exact source hints without automatic review or business commands', async () => {
  const f = await fixture(),
    command = vi.spyOn(f.entry.release, 'command');
  expect(
    renderToStaticMarkup(
      createElement(PriorityActions, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
        view: 'priorities',
      }),
    ),
  ).toContain('Review daily priority sources');
  expect(
    renderToStaticMarkup(
      createElement(PriorityActions, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
        view: 'advanced',
      }),
    ),
  ).toContain('Open advanced task controls');
  expect(
    renderToStaticMarkup(
      createElement(PriorityActions, {
        sources: f.sources,
        enabled: true,
        selectedJobId: 'foreign',
      }),
    ),
  ).toContain('UNKNOWN');
  expect(command).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %i fresh-wrapper deferred callback retains canonical PENDING ownership',
  async (brand) => {
    const f = await opened(brand),
      second = await readPriorityActions(
        { ...f.sources },
        { ...f.input },
        f.gate,
      ),
      task = await inspectPriorityAction(second, f.row.key);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      deferred = new Promise<void>((resolve) => {
        release = resolve;
      }),
      firstCallback = vi.fn(async () => {
        entered();
        await deferred;
      }),
      secondCallback = vi.fn(async () => {}),
      first = continuePriorityAction(f.review, f.task, firstCallback, {
        current: firstCallback,
        generation: 0,
      });
    await started;
    let blocked: PromiseSettledResult<string>[];
    try {
      blocked = await Promise.allSettled([
        continuePriorityAction(second, task, secondCallback, {
          current: secondCallback,
          generation: 0,
        }),
      ]);
      const repeated = await Promise.allSettled([
        continuePriorityAction(second, task, secondCallback, {
          current: secondCallback,
          generation: 0,
        }),
      ]);
      blocked.push(...repeated);
    } finally {
      release();
    }
    await expect(first).resolves.toBe(f.input.job_id);
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();
    expect(
      blocked.every(
        (r) => r.status === 'rejected' && /pending/i.test(String(r.reason)),
      ),
    ).toBe(true);
    expect(() => assertPriorityActionsCurrent(second)).not.toThrow();
    await expect(
      continuePriorityAction(second, task, secondCallback, {
        current: secondCallback,
        generation: 0,
      }),
    ).resolves.toBe(f.input.job_id);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  },
);
it('known pre-dispatch withdrawal releases only its canonical claim for another fresh view', async () => {
  const f = await opened(),
    second = await readPriorityActions(
      { ...f.sources },
      { ...f.input },
      f.gate,
    ),
    task = await inspectPriorityAction(second, f.row.key),
    firstCallback = vi.fn(),
    secondCallback = vi.fn(),
    live: PriorityLiveCallback = { current: firstCallback, generation: 0 },
    seen = during(() => {
      live.current = undefined;
      live.generation++;
    });
  await expect(
    continuePriorityAction(f.review, f.task, firstCallback, live),
  ).rejects.toThrow(/withdrawn|replaced/);
  seen();
  vi.restoreAllMocks();
  expect(firstCallback).not.toHaveBeenCalled();
  await expect(
    continuePriorityAction(second, task, secondCallback, {
      current: secondCallback,
      generation: 0,
    }),
  ).resolves.toBe(f.input.job_id);
  expect(secondCallback).toHaveBeenCalledTimes(1);
});
it('ambiguous deferred callback keeps UNKNOWN after its pending claim releases, including an existing fresh view', async () => {
  const f = await opened(),
    second = await readPriorityActions(
      { ...f.sources },
      { ...f.input },
      f.gate,
    ),
    task = await inspectPriorityAction(second, f.row.key);
  let entered!: () => void, reject!: (error: Error) => void;
  const started = new Promise<void>((resolve) => {
      entered = resolve;
    }),
    deferred = new Promise<void>((_, fail) => {
      reject = fail;
    }),
    firstCallback = vi.fn(async () => {
      entered();
      await deferred;
    }),
    secondCallback = vi.fn(),
    first = continuePriorityAction(f.review, f.task, firstCallback, {
      current: firstCallback,
      generation: 0,
    }),
    observed = Promise.allSettled([first]);
  await started;
  await expect(
    continuePriorityAction(second, task, secondCallback, {
      current: secondCallback,
      generation: 0,
    }),
  ).rejects.toThrow(/pending/i);
  reject(Error('lost deferred callback ACK'));
  expect((await observed)[0].status).toBe('rejected');
  await expect(
    continuePriorityAction(second, task, secondCallback, {
      current: secondCallback,
      generation: 0,
    }),
  ).rejects.toThrow(/UNKNOWN/);
  expect(firstCallback).toHaveBeenCalledTimes(1);
  expect(secondCallback).not.toHaveBeenCalled();
});
