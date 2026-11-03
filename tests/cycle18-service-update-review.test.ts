import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { ServiceUpdateReview } from '../src/components/workflows/ServiceUpdateReview';
import {
  readServiceUpdateReview,
  assertServiceUpdateCurrent,
  filterServiceUpdateEvidence,
  inspectServiceUpdateReport,
  serviceUpdateOriginalProps,
  continueServiceUpdateReview,
  type ServiceUpdateLiveCallback,
} from '../src/lib/workflows/service-update-review';
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
async function fixture(brand = 0, index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[index],
    input = { job_id: entry.target.job_id!, staff_context_confirmed: true };
  return { gate, sources, entry, input };
}
async function opened(brand = 0, index = 0) {
  const f = await fixture(brand, index),
    view = await readServiceUpdateReview(f.sources, f.input, f.gate),
    reference = view.evidence.find(
      (e) => e.reference.report_id === f.entry.report_id,
    )!.reference,
    report = await inspectServiceUpdateReport(view, reference);
  return { ...f, view, reference, report };
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
  'brand %i reads exact safe summary/issued/report sources with no business effects',
  async (brand) => {
    const f = await fixture(brand),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.property, 'publish'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      ids = vi.spyOn(crypto, 'randomUUID'),
      before = f.sources.property.read(f.sources.company.id),
      v = await readServiceUpdateReview(f.sources, f.input, f.gate);
    expect(v.job_id).toBe(f.input.job_id);
    expect(v.issued_version_id).toBe(f.entry.target.version_id);
    expect(v.location_id).toBe(f.entry.target.location_id);
    expect(v.relationship).toBe('UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT');
    expect(v.physical_completion).toBe('UNKNOWN');
    expect(v.customer_acceptance).toBe('UNKNOWN');
    expect(v.warranty).toBe('UNKNOWN');
    expect(v.delivery).toBe('NOT_SENT');
    expect(v.requirements.every((r) => r.status === 'UNKNOWN')).toBe(true);
    expect(serviceUpdateOriginalProps(v)).toEqual({
      sources: f.sources,
      selectedJobId: f.input.job_id,
    });
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i combines literal text/phase/association filters without changing source',
  async (brand) => {
    const f = await opened(brand),
      e = f.view.evidence[0],
      filter = {
        query: e.reference.report_id,
        phase: e.phase,
        association: e.association,
      };
    expect(filterServiceUpdateEvidence(f.view, filter)).toEqual([e]);
    expect(
      filterServiceUpdateEvidence(f.view, { ...filter, query: '.*' }),
    ).toEqual([]);
    expect(
      filterServiceUpdateEvidence(f.view, {
        ...filter,
        phase: e.phase === 'before' ? 'after' : 'before',
      }),
    ).toEqual([]);
    expect(Object.isFrozen(f.view)).toBe(true);
  },
);
it.each([0, 1, 2])(
  'brand %i exposes exact immutable published version and finding source positions',
  async (brand) => {
    const f = await opened(brand),
      snapshot = JSON.stringify(f.report);
    expect(f.report.reference).toEqual(f.reference);
    expect(f.report.reference.published_version).toBe(
      f.entry.published_version,
    );
    expect(f.report.observations[0].reference.report_id).toBe(
      f.entry.report_id,
    );
    expect(f.report.observations[0].reference.source_index).toBe(0);
    expect(
      JSON.stringify(await inspectServiceUpdateReport(f.view, f.reference)),
    ).toBe(snapshot);
  },
);
it('same-property jobs remain distinct and sibling report associations stay UNKNOWN', async () => {
  const f = await opened(0, 3),
    other = f.view.evidence.find(
      (e) => e.reference.report_id !== f.entry.report_id,
    )!;
  expect(other.association).toBe('UNKNOWN');
  expect(
    (await inspectServiceUpdateReport(f.view, other.reference)).reference
      .report_id,
  ).toBe(other.reference.report_id);
  expect(f.view.job_id).toBe(f.entry.target.job_id);
});
it.each([0, 1, 2])(
  'brand %i safe summary excludes all private and other-customer fields',
  async (brand) => {
    const f = await opened(brand),
      text = JSON.stringify({ view: f.view, report: f.report });
    for (const word of [
      'unit_cost_minor',
      'hourly_rate_minor',
      'internal_notes',
      'payroll',
      'supplier_cost',
      'PRIVATE',
      f.sources.entries[1].target.customer_id,
      f.sources.entries[1].report_id,
    ])
      expect(text).not.toContain(word);
    expect(f.view.authority).toBe('SAFE_STAFF_REVIEW_ONLY');
  },
);
it.each([0, 1, 2])(
  'brand %i continues exact inspected job to maintenance only after reinspection',
  async (brand) => {
    const f = await opened(brand),
      cb = vi.fn();
    expect(
      await continueServiceUpdateReview(f.view, f.report, cb, {
        current: cb,
        generation: 0,
      }),
    ).toBe(f.input.job_id);
    expect(cb).toHaveBeenCalledExactlyOnceWith(f.input.job_id, 'maintenance');
  },
);
it.each(['removed', 'replaced', 'restored'] as const)(
  'callback %s before dispatch remains known cancellation with usable source',
  async (kind) => {
    const f = await opened(),
      cb = vi.fn(),
      other = vi.fn(),
      live: ServiceUpdateLiveCallback = { current: cb, generation: 0 },
      seen = during(() => {
        live.current = kind === 'replaced' ? other : undefined;
        live.generation++;
        if (kind === 'restored') {
          live.current = cb;
          live.generation++;
        }
      });
    await expect(
      continueServiceUpdateReview(f.view, f.report, cb, live),
    ).rejects.toThrow(/withdrawn|replaced/);
    seen();
    expect(cb).not.toHaveBeenCalled();
    expect(other).not.toHaveBeenCalled();
    expect(() => assertServiceUpdateCurrent(f.view)).not.toThrow();
  },
);
it.each(['throw', 'reject'] as const)(
  'callback %s after dispatch permanently denies same canonical job even through fresh wrappers',
  async (kind) => {
    const f = await opened(),
      bytes = JSON.stringify(f.view),
      cb = vi.fn(() => {
        if (kind === 'throw') throw Error('lost host ACK');
        return Promise.reject(Error('lost host ACK'));
      }),
      live = { current: cb, generation: 0 };
    await expect(
      continueServiceUpdateReview(f.view, f.report, cb, live),
    ).rejects.toThrow(/lost host ACK/);
    await expect(
      continueServiceUpdateReview(f.view, f.report, cb, live),
    ).rejects.toThrow(/UNKNOWN/);
    await expect(
      readServiceUpdateReview({ ...f.sources }, { ...f.input }, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.view)).toBe(bytes);
  },
);
it('concurrent activation dispatches only once', async () => {
  const f = await opened(),
    cb = vi.fn(),
    live = { current: cb, generation: 0 },
    results = await Promise.allSettled([
      continueServiceUpdateReview(f.view, f.report, cb, live),
      continueServiceUpdateReview(f.view, f.report, cb, live),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(cb).toHaveBeenCalledTimes(1);
});
it.each(['gate', 'input', 'root', 'member'] as const)(
  'final await rechecks %s before continuation',
  async (kind) => {
    const f = await opened(),
      cb = vi.fn(),
      seen = during(() => {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'input') f.input.staff_context_confirmed = false;
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
        if (kind === 'member')
          vi.spyOn(
            f.sources.operations,
            'syntheticMemberships',
          ).mockReturnValue([]);
      });
    await expect(
      continueServiceUpdateReview(f.view, f.report, cb, {
        current: cb,
        generation: 0,
      }),
    ).rejects.toThrow();
    seen();
    expect(cb).not.toHaveBeenCalled();
  },
);
it.each([
  [0, 'member'],
  [1, 'property'],
  [2, 'company'],
] as const)(
  'brand %i observed %s restore cannot revive canonical summary or fresh same-job wrapper',
  async (brand, kind) => {
    const f = await opened(brand),
      location = f.entry.target.location_id,
      company = f.sources.company;
    let restore = () => {};
    if (kind === 'member') {
      const s = vi
        .spyOn(f.sources.operations, 'syntheticMemberships')
        .mockReturnValue([]);
      restore = () => s.mockRestore();
    }
    if (kind === 'property') {
      f.entry.target.location_id = f.sources.entries[1].target.location_id;
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
    expect(() => assertServiceUpdateCurrent(f.view)).toThrow();
    restore();
    expect(() => assertServiceUpdateCurrent(f.view)).toThrow(/UNKNOWN/);
    await expect(
      readServiceUpdateReview({ ...f.sources }, { ...f.input }, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
  },
);
it.each(['property', 'tenant'] as const)(
  'wrong %s report cannot replace exact visible source',
  async (kind) => {
    const f = await opened(),
      reference = {
        ...f.reference,
        ...(kind === 'tenant'
          ? { organization_id: sampleCompanies[1].id }
          : { location_id: f.sources.entries[1].target.location_id }),
      };
    await expect(inspectServiceUpdateReport(f.view, reference)).rejects.toThrow(
      /Exact/,
    );
  },
);
it.each(['job', 'confirmation', 'getter', 'serializer'] as const)(
  'invalid %s summary input denies without hooks or fallback',
  async (kind) => {
    const f = await fixture(),
      cb = vi.fn(),
      input = { ...f.input };
    if (kind === 'job') input.job_id = 'foreign';
    if (kind === 'confirmation') input.staff_context_confirmed = false;
    if (kind === 'getter')
      Object.defineProperty(input, 'job_id', { enumerable: true, get: cb });
    if (kind === 'serializer') Object.assign(input, { toJSON: cb });
    await expect(
      readServiceUpdateReview(f.sources, input, f.gate),
    ).rejects.toThrow();
    expect(cb).not.toHaveBeenCalled();
  },
);
it('source getter and live callback getter deny without invocation', async () => {
  const f = await opened(),
    cb = vi.fn();
  await expect(
    readServiceUpdateReview(
      Object.defineProperty({ ...f.sources }, 'company', {
        enumerable: true,
        get: cb,
      }),
      f.input,
      f.gate,
    ),
  ).rejects.toThrow();
  await expect(
    continueServiceUpdateReview(
      f.view,
      f.report,
      cb,
      Object.defineProperty({ generation: 0 }, 'current', {
        enumerable: true,
        get: cb,
      }) as ServiceUpdateLiveCallback,
    ),
  ).rejects.toThrow();
  expect(cb).not.toHaveBeenCalled();
});
it.each(['default', 'production', 'https', 'host', 'unconfirmed'] as const)(
  '%s OFF precedes getters and serialization',
  async (kind) => {
    const cb = vi.fn(),
      sources = Object.defineProperty({}, 'company', {
        get: cb,
      }) as OperatingSources;
    if (kind === 'production') vi.stubEnv('DEV', false);
    if (kind === 'https' || kind === 'host')
      vi.stubGlobal('window', {
        location: {
          hostname: kind === 'host' ? 'localhost.example.invalid' : '127.0.0.1',
          protocol: kind === 'https' ? 'https:' : 'http:',
        },
      });
    await expect(
      readServiceUpdateReview(
        sources,
        { job_id: 'x', staff_context_confirmed: true },
        {
          enabled: kind !== 'default',
          confirmed: kind !== 'default' && kind !== 'unconfirmed',
        },
      ),
    ).rejects.toThrow(/OFF/);
    if (kind !== 'unconfirmed')
      expect(
        renderToStaticMarkup(
          createElement(ServiceUpdateReview, {
            sources,
            enabled: kind !== 'default',
          }),
        ),
      ).toContain('Service update review is off');
    expect(cb).not.toHaveBeenCalled();
  },
);
it('copied summary cannot acquire retained source or control authority', async () => {
  const f = await opened();
  expect(() =>
    serviceUpdateOriginalProps(JSON.parse(JSON.stringify(f.view))),
  ).toThrow(/retained/);
});
it('React admits exact hints, displays source context, and never prepares original review on render', async () => {
  const f = await fixture(),
    writer = vi.spyOn(f.entry.release, 'command');
  expect(
    renderToStaticMarkup(
      createElement(ServiceUpdateReview, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
      }),
    ),
  ).toContain('Review service summary');
  expect(
    renderToStaticMarkup(
      createElement(ServiceUpdateReview, {
        sources: f.sources,
        enabled: true,
        selectedJobId: 'foreign',
      }),
    ),
  ).toContain('UNKNOWN');
  expect(writer).not.toHaveBeenCalled();
});
it.each([
  'member',
  'property',
  'company',
  'callback-replaced',
  'callback-restored',
  'input',
  'root',
] as const)(
  'async invoked callback %s drift is terminal after final await and restoration',
  async (kind) => {
    const brand = kind === 'member' ? 0 : kind === 'property' ? 1 : 2,
      f = await opened(brand),
      bytes = JSON.stringify(f.view),
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
          f.entry.target.location_id = f.sources.entries[1].target.location_id;
          restore = async () => {
            f.entry.target.location_id = location;
          };
        }
        if (kind === 'company') {
          f.sources.company = sampleCompanies[(brand + 1) % 3];
          restore = async () => {
            f.sources.company = company;
          };
        }
        if (kind === 'input') {
          f.input.staff_context_confirmed = false;
          restore = async () => {
            f.input.staff_context_confirmed = true;
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
      live: ServiceUpdateLiveCallback = { current: cb, generation: 0 };
    await expect(
      continueServiceUpdateReview(f.view, f.report, cb, live),
    ).rejects.toThrow();
    await restore();
    expect(() => assertServiceUpdateCurrent(f.view)).toThrow(/UNKNOWN/);
    await expect(
      continueServiceUpdateReview(f.view, f.report, cb, live),
    ).rejects.toThrow(/UNKNOWN/);
    await expect(
      readServiceUpdateReview({ ...f.sources }, { ...f.input }, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(JSON.stringify(f.view)).toBe(bytes);
  },
);
it.each([0, 1, 2])(
  'brand %i fresh-wrapper deferred callback retains canonical PENDING ownership',
  async (brand) => {
    const f = await opened(brand),
      second = await readServiceUpdateReview(
        { ...f.sources },
        { ...f.input },
        f.gate,
      ),
      ref = second.evidence.find(
        (e) => e.reference.report_id === f.entry.report_id,
      )!.reference,
      report = await inspectServiceUpdateReport(second, ref);
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
      first = continueServiceUpdateReview(f.view, f.report, firstCallback, {
        current: firstCallback,
        generation: 0,
      });
    await started;
    let blocked: PromiseSettledResult<string>[];
    try {
      blocked = await Promise.allSettled([
        continueServiceUpdateReview(second, report, secondCallback, {
          current: secondCallback,
          generation: 0,
        }),
      ]);
      const repeated = await Promise.allSettled([
        continueServiceUpdateReview(second, report, secondCallback, {
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
    expect(() => assertServiceUpdateCurrent(second)).not.toThrow();
    await expect(
      continueServiceUpdateReview(second, report, secondCallback, {
        current: secondCallback,
        generation: 0,
      }),
    ).resolves.toBe(f.input.job_id);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  },
);
it('known pre-dispatch withdrawal releases only its canonical claim for another fresh view', async () => {
  const f = await opened(),
    second = await readServiceUpdateReview(
      { ...f.sources },
      { ...f.input },
      f.gate,
    ),
    report = await inspectServiceUpdateReport(
      second,
      second.evidence.find((e) => e.reference.report_id === f.entry.report_id)!
        .reference,
    ),
    firstCallback = vi.fn(),
    secondCallback = vi.fn(),
    live: ServiceUpdateLiveCallback = { current: firstCallback, generation: 0 },
    seen = during(() => {
      live.current = undefined;
      live.generation++;
    });
  await expect(
    continueServiceUpdateReview(f.view, f.report, firstCallback, live),
  ).rejects.toThrow(/withdrawn|replaced/);
  seen();
  vi.restoreAllMocks();
  expect(firstCallback).not.toHaveBeenCalled();
  await expect(
    continueServiceUpdateReview(second, report, secondCallback, {
      current: secondCallback,
      generation: 0,
    }),
  ).resolves.toBe(f.input.job_id);
  expect(secondCallback).toHaveBeenCalledTimes(1);
});
it('ambiguous deferred callback keeps UNKNOWN after its pending claim releases, including an existing fresh view', async () => {
  const f = await opened(),
    second = await readServiceUpdateReview(
      { ...f.sources },
      { ...f.input },
      f.gate,
    ),
    report = await inspectServiceUpdateReport(
      second,
      second.evidence.find((e) => e.reference.report_id === f.entry.report_id)!
        .reference,
    );
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
    first = continueServiceUpdateReview(f.view, f.report, firstCallback, {
      current: firstCallback,
      generation: 0,
    }),
    observed = Promise.allSettled([first]);
  await started;
  await expect(
    continueServiceUpdateReview(second, report, secondCallback, {
      current: secondCallback,
      generation: 0,
    }),
  ).rejects.toThrow(/pending/i);
  reject(Error('lost deferred callback ACK'));
  expect((await observed)[0].status).toBe('rejected');
  await expect(
    continueServiceUpdateReview(second, report, secondCallback, {
      current: secondCallback,
      generation: 0,
    }),
  ).rejects.toThrow(/UNKNOWN/);
  expect(firstCallback).toHaveBeenCalledTimes(1);
  expect(secondCallback).not.toHaveBeenCalled();
});
