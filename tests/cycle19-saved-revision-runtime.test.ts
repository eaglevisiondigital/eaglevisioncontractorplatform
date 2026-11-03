import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readSavedRevision,
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  compareSavedRevisions,
  adoptSavedRevision,
} from '../src/lib/workflows/saved-revision-runtime';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!;
  const project = () => {
    const state = sources.property.read(sources.company.id),
      plan = state.plans.find((p) => p.id === entry.plan_id)!;
    return {
      job_id: job,
      plan_id: plan.id,
      plan_revision: plan.revision,
      cadence: plan.cadence,
    };
  };
  return { gate, all, entry, sources, job, project };
}
function revise(f: Awaited<ReturnType<typeof fixture>>) {
  const plan = f.sources.property
    .read(f.sources.company.id)
    .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...plan,
    cadence: plan.cadence === 'monthly' ? 'weekly' : 'monthly',
  });
}
function duringHash(change: () => void) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let hit = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const r = await digest(...args);
    if (!hit) {
      hit = true;
      change();
    }
    return r;
  });
  return () => expect(hit).toBe(true);
}
it.each([0, 1, 2])(
  'brand %i shared read compares actual saved plan changes and adopts one opaque generation',
  async (brand) => {
    const f = await fixture(brand),
      before = await readSavedRevision(
        f.sources,
        f.job,
        'maintenance',
        f.gate,
        f.project,
      ),
      bytes = JSON.stringify(before),
      selection = createSavedRevisionSelection(before);
    revise(f);
    expect(() => assertSavedRevisionCurrent(before)).toThrow();
    expect(() => assertSavedRevisionAccess(before)).not.toThrow();
    const now = await readSavedRevision(
        f.sources,
        f.job,
        'maintenance',
        f.gate,
        f.project,
      ),
      comparison = compareSavedRevisions(before, now);
    expect(comparison.changed).toBe(true);
    expect(now.evidence.plan_revision).toBe(before.evidence.plan_revision + 1);
    expect(() => adoptSavedRevision(selection, comparison, 0, false)).toThrow();
    expect(readSavedRevisionSelection(selection).snapshot).toBe(before);
    const adopted = adoptSavedRevision(selection, comparison, 0, true);
    expect(adopted.snapshot).toBe(now);
    expect(adopted.generation).toBe(1);
    expect(JSON.stringify(before)).toBe(bytes);
    expect(() => adoptSavedRevision(selection, comparison, 1, true)).toThrow();
  },
);
it('copies and freezes only plain evidence and hashes that exact detached snapshot', async () => {
  const f = await fixture(),
    data = { label: 'Original', nested: [{ value: 3 }] },
    view = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      () => data,
    );
  data.nested[0].value = 9;
  data.label = 'Changed';
  expect(view.evidence).toEqual({ label: 'Original', nested: [{ value: 3 }] });
  expect(Object.isFrozen(view.evidence.nested[0])).toBe(true);
  expect(view.sha256).toBe(
    await documentHash({
      kind: 'field',
      identity: view.identity,
      evidence: view.evidence,
    }),
  );
  expect(view.operational_ready).toBe(false);
  expect(view.meaning).toBe('SAVED_SOURCE_READ_ONLY');
});
it.each([
  'getter',
  'toJSON',
  'sparse',
  'cycle',
  'function',
  'nonfinite',
  'prototype',
] as const)(
  'rejects %s evidence before executable serialization',
  async (kind) => {
    const f = await fixture(),
      called = vi.fn(),
      value: Record<string, unknown> = {};
    let data: unknown = value;
    if (kind === 'getter')
      Object.defineProperty(value, 'x', { get: called, enumerable: true });
    if (kind === 'toJSON') value.toJSON = called;
    if (kind === 'sparse') data = new Array(2);
    if (kind === 'cycle') value.self = value;
    if (kind === 'function') value.x = called;
    if (kind === 'nonfinite') value.x = Infinity;
    if (kind === 'prototype') data = new Date();
    await expect(
      readSavedRevision(f.sources, f.job, 'field', f.gate, () => data),
    ).rejects.toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it('OFF denies before source descriptors and projector invocation', async () => {
  const getter = vi.fn(),
    project = vi.fn(),
    source = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources;
  await expect(
    readSavedRevision(source, 'missing', 'field', undefined, project),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(project).not.toHaveBeenCalled();
});
it('async projector currentness is checked after its final wait', async () => {
  const f = await fixture();
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r)),
    read = readSavedRevision(f.sources, f.job, 'field', f.gate, async () => {
      await wait;
      return f.project();
    });
  revise(f);
  release();
  await expect(read).rejects.toThrow();
});
it('source change after the hash cannot return mixed evidence', async () => {
  const f = await fixture(),
    hit = duringHash(() => revise(f));
  await expect(
    readSavedRevision(f.sources, f.job, 'field', f.gate, f.project),
  ).rejects.toThrow();
  hit();
});
it('source access is freshly checked and does not make an old mutable fence current', async () => {
  const f = await fixture(),
    view = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
    );
  revise(f);
  expect(() => assertSavedRevisionAccess(view)).not.toThrow();
  expect(() => assertSavedRevisionCurrent(view)).toThrow();
  expect(view.evidence.plan_revision).toBe(2);
});
it.each(['member', 'property', 'company', 'issued'] as const)(
  'current %s withdrawal rejects source access',
  async (kind) => {
    const f = await fixture(),
      view = await readSavedRevision(
        f.sources,
        f.job,
        'field',
        f.gate,
        f.project,
      );
    if (kind === 'member') {
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
    if (kind === 'property')
      f.entry.target.location_id = f.all.entries[1].target.location_id;
    if (kind === 'company') f.sources.company = sampleCompanies[1];
    if (kind === 'issued') f.entry.target.version_id = crypto.randomUUID();
    expect(() => assertSavedRevisionAccess(view)).toThrow();
    expect(() => assertSavedRevisionCurrent(view)).toThrow();
  },
);
it('post-hash membership withdrawal fails the final source read fence', async () => {
  const f = await fixture(),
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    ),
    hit = duringHash(() => {
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          original(org).filter((m) => m.user_id !== f.entry.target.actor_id),
      );
    });
  await expect(
    readSavedRevision(f.sources, f.job, 'field', f.gate, f.project),
  ).rejects.toThrow();
  hit();
});
it('copied snapshots, comparisons and selections cannot gain retained-object authority', async () => {
  const f = await fixture(),
    view = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
    ),
    selection = createSavedRevisionSelection(view);
  expect(() => assertSavedRevisionAccess({ ...view })).toThrow();
  expect(() => readSavedRevisionSelection({ ...selection })).toThrow();
  const next = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
    ),
    comparison = compareSavedRevisions(view, next);
  expect(comparison.changed).toBe(false);
  expect(() =>
    adoptSavedRevision(selection, { ...comparison }, 0, true),
  ).toThrow();
});
it('different root wrappers and different kinds cannot be compared as the same capture', async () => {
  const f = await fixture(),
    a = await readSavedRevision(f.sources, f.job, 'field', f.gate, f.project),
    b = await readSavedRevision(
      { ...f.sources },
      f.job,
      'field',
      f.gate,
      f.project,
    ),
    c = await readSavedRevision(f.sources, f.job, 'finance', f.gate, f.project);
  expect(() => compareSavedRevisions(a, b)).toThrow();
  expect(() => compareSavedRevisions(a, c)).toThrow();
});
it('competing comparisons cannot adopt the same selection generation twice', async () => {
  const f = await fixture(),
    a = await readSavedRevision(f.sources, f.job, 'field', f.gate, f.project),
    selection = createSavedRevisionSelection(a);
  revise(f);
  const b = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
    ),
    c = await readSavedRevision(f.sources, f.job, 'field', f.gate, f.project),
    first = compareSavedRevisions(a, b),
    second = compareSavedRevisions(a, c);
  adoptSavedRevision(selection, first, 0, true);
  expect(() => adoptSavedRevision(selection, second, 0, true)).toThrow();
  expect(readSavedRevisionSelection(selection).snapshot).toBe(b);
});
it('a stale candidate after comparison cannot adopt', async () => {
  const f = await fixture(),
    a = await readSavedRevision(f.sources, f.job, 'field', f.gate, f.project),
    selection = createSavedRevisionSelection(a);
  revise(f);
  const b = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
    ),
    comparison = compareSavedRevisions(a, b);
  revise(f);
  expect(() => adoptSavedRevision(selection, comparison, 0, true)).toThrow();
  expect(readSavedRevisionSelection(selection).generation).toBe(0);
});
it('sixth synchronous domain fence runs after the final hash and denies withdrawn domain evidence', async () => {
  const f = await fixture();
  let allowed = true;
  const fence = vi.fn(() => {
      if (!allowed) throw Error('Domain source withdrawn');
    }),
    hit = duringHash(() => {
      allowed = false;
    });
  await expect(
    readSavedRevision(f.sources, f.job, 'field', f.gate, f.project, fence),
  ).rejects.toThrow(/Domain source withdrawn/);
  expect(fence).toHaveBeenCalled();
  hit();
});
it('currentness, comparison and adoption rerun the retained synchronous domain fence', async () => {
  const f = await fixture();
  let allowed = true;
  const fence = () => {
    if (!allowed) throw Error('Domain source withdrawn');
  };
  const a = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
      fence,
    ),
    selection = createSavedRevisionSelection(a);
  revise(f);
  const b = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
      fence,
    ),
    comparison = compareSavedRevisions(a, b);
  allowed = false;
  expect(() => assertSavedRevisionAccess(b)).not.toThrow(); // Access is not a domain-currentness assertion.
  expect(() => assertSavedRevisionCurrent(b)).toThrow(/Domain/);
  expect(() => compareSavedRevisions(a, b)).toThrow(/Domain/);
  expect(() => adoptSavedRevision(selection, comparison, 0, true)).toThrow(
    /Domain/,
  );
  expect(readSavedRevisionSelection(selection).generation).toBe(0);
});
it.each(['resolved', 'rejected', 'value'] as const)(
  'sixth fence rejects %s asynchronous/nonvoid acknowledgment without unhandled rejection',
  async (kind) => {
    const f = await fixture(),
      fence = () =>
        kind === 'resolved'
          ? Promise.resolve()
          : kind === 'rejected'
            ? Promise.reject(Error('late rejection'))
            : true;
    await expect(
      readSavedRevision(
        f.sources,
        f.job,
        'field',
        f.gate,
        f.project,
        fence as () => void,
      ),
    ).rejects.toThrow(/Synchronous/);
    await Promise.resolve();
  },
);
it('sixth domain fence cannot change canonical source and return apparent success', async () => {
  const f = await fixture();
  await expect(
    readSavedRevision(f.sources, f.job, 'field', f.gate, f.project, () =>
      revise(f),
    ),
  ).rejects.toThrow();
});
it.each([
  'root-entries',
  'root-gate',
  'entry-target',
  'entry-customer-model',
  'entry-release',
] as const)('fresh access retains exact %s handle pins', async (kind) => {
  const f = await fixture(),
    view = await readSavedRevision(
      f.sources,
      f.job,
      'field',
      f.gate,
      f.project,
    );
  if (kind === 'root-entries') f.sources.entries = [...f.sources.entries];
  if (kind === 'root-gate') f.sources.gate = { ...f.gate };
  if (kind === 'entry-target') f.entry.target = { ...f.entry.target };
  if (kind === 'entry-customer-model')
    f.entry.customerModel = f.all.entries[1].customerModel;
  if (kind === 'entry-release') f.entry.release = f.all.entries[1].release;
  expect(() => assertSavedRevisionAccess(view)).toThrow(/handles|selectors/);
});
