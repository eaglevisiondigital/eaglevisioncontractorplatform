import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { AddonTaskDesk } from '../src/components/workflows/AddonTaskDesk';
import {
  readAddonTaskDeskJobs,
  assertAddonTaskDeskJobsCurrent,
  selectAddonTaskDeskJob,
  filterAddonTaskDeskJobs,
  readAddonTaskDesk,
  assertAddonTaskDeskCurrent,
  openAddonTaskDeskControls,
  resumeAddonTaskDeskControls,
  returnAddonTaskDeskContext,
  inspectAddonTaskDeskReference,
  navigateAddonTaskDeskJob,
  addonTaskDeskBreadcrumbs,
  advancedHandoffKinds,
  type AddonTaskInput,
  type AddonTaskDeskCallback,
} from '../src/lib/workflows/addon-task-desk';
import {
  readSourceBoundAddons,
  reviewSourceBoundAddons,
  prepareSourceBoundAddons,
  sourceBoundAddonsState,
  inspectSourceBoundAddons,
  cancelSourceBoundAddons,
  revokeSourceBoundAddons,
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
async function fixture(
  brand = 0,
  kind: AddonTaskInput['kind'] = 'offline',
  entryIndex = 0,
) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[entryIndex],
    input: AddonTaskInput = {
      job_id: entry.target.job_id!,
      kind,
      edition: 'property_services',
    };
  return { gate, sources, entry, input };
}
async function opened(
  brand = 0,
  kind: AddonTaskInput['kind'] = 'offline',
  entryIndex = 0,
) {
  const f = await fixture(brand, kind, entryIndex),
    task = await readAddonTaskDesk(f.sources, f.input, f.gate),
    controls = openAddonTaskDeskControls(task),
    reference = controls.selection.references.find((r) => r.kind === 'report')!,
    record = await inspectAddonTaskDeskReference(task, reference);
  return { ...f, task, controls, reference, record };
}
async function original(brand = 0, kind: AddonTaskInput['kind'] = 'offline') {
  const f = await opened(brand, kind),
    read = await readSourceBoundAddons(
      f.controls.sources,
      f.controls.selection,
      f.gate,
    ),
    confirmation = {
      confirmed: true,
      reviewed_source_sha256: read.integrity.sha256,
      external_reference: 'desk-original-001',
      review_expires_at_ms: 2000,
    },
    clock = { now_ms: 1000 };
  return { ...f, read, confirmation, clock };
}
function during(mode: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (!reached && body.mode === mode) {
      reached = true;
      await change();
    }
    return result;
  });
  return () => expect(reached).toBe(true);
}
for (const brand of [0, 1, 2])
  for (const kind of advancedHandoffKinds)
    it(`brand ${brand} ${kind} retains actual source, requirements, edition and exact reference with no automatic attempt or business effects`, async () => {
      const f = await fixture(brand, kind),
        before = f.sources.property.read(f.sources.company.id),
        releases = f.sources.entries.map((e) => e.release.read('staff')),
        writers = [
          vi.spyOn(f.sources.estimates, 'create'),
          vi.spyOn(f.sources.estimates, 'save'),
          vi.spyOn(f.sources.estimates, 'issue'),
          vi.spyOn(f.sources.estimates, 'approveJob'),
          vi.spyOn(f.sources.estimates, 'assignJob'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
          vi.spyOn(f.sources.property, 'saveVisit'),
          vi.spyOn(f.sources.property, 'publish'),
          ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
        ],
        ids = vi.spyOn(crypto, 'randomUUID'),
        task = await readAddonTaskDesk(f.sources, f.input, f.gate),
        controls = openAddonTaskDeskControls(task),
        reference = controls.selection.references.find(
          (r) => r.kind === 'report',
        )!,
        record = await inspectAddonTaskDeskReference(task, reference);
      expect(controls.sources).toBe(f.sources);
      expect(controls.selection.reference).toBe(task.source);
      expect(task.source).toMatchObject({
        organization_id: f.sources.company.id,
        customer_id: f.entry.target.customer_id,
        location_id: f.entry.target.location_id,
        job_id: f.entry.target.job_id,
        issued_version_id: f.entry.target.version_id,
        kind,
      });
      expect(task.edition.human_selected_review_context).toBe(f.input.edition);
      expect(task.edition.company_industry).toBe(f.sources.company.industry);
      expect(task.edition.company_changed).toBe(false);
      expect(task.requirements.length).toBeGreaterThanOrEqual(2);
      expect(addonTaskDeskBreadcrumbs(task, record).map((c) => c.kind)).toEqual(
        ['job', 'mode', 'edition', 'source', 'record', 'review'],
      );
      expect(
        addonTaskDeskBreadcrumbs(task, record).find((c) => c.kind === 'record')!
          .id,
      ).toBe(f.entry.report_id);
      expect(record.reference).toBe(reference);
      expect(record.reference.id).toBe(f.entry.report_id);
      expect(record.reference.version).toBe(f.entry.published_version);
      expect(controls.selection.operational_ready).toBe(false);
      expect(controls.selection.missing_evidence).toMatchObject({
        provider: 'UNKNOWN',
        authenticated_sync: 'UNKNOWN',
        voice_recognition: 'NONE',
        supplier_bids: 'UNKNOWN',
        accounting_mapping: 'UNKNOWN',
        storm_incident: 'UNKNOWN',
        network_vetting: 'UNKNOWN',
        availability: 'UNKNOWN',
        physical_completion: 'UNKNOWN',
      });
      expect(returnAddonTaskDeskContext(task)).toBe(task.return_context);
      expect(resumeAddonTaskDeskControls(task)).toBe(controls);
      expect(Object.isFrozen(controls)).toBe(true);
      expect(Object.isFrozen(task)).toBe(true);
      expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
      expect(f.sources.entries.map((e) => e.release.read('staff'))).toEqual(
        releases,
      );
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
      expect(ids).not.toHaveBeenCalled();
    });
it.each(advancedHandoffKinds)(
  '%s can explicitly use the unchanged original lifecycle and engine after desk inspection',
  async (kind) => {
    const f = await original(0, kind),
      view = await reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
      snapshot = JSON.stringify(view),
      packet = await prepareSourceBoundAddons(f.read, {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      });
    expect(
      packet.original_handoff.existing_handoff.canonical_reference.engine,
    ).toBe(
      kind === 'trade'
        ? 'EXISTING_TRADE_EDITION_ENGINE'
        : 'EXISTING_OPERATING_ADDON_ENGINE',
    );
    expect(
      packet.original_handoff.existing_handoff.requirements.source.job_id,
    ).toBe(f.task.source.job_id);
    expect(sourceBoundAddonsState(f.read).status).toBe('PREPARED');
    expect(returnAddonTaskDeskContext(f.task)).toBe(f.task.return_context);
    expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
    expect(JSON.stringify(view)).toBe(snapshot);
  },
);
it.each(advancedHandoffKinds)(
  '%s lost original comparison ACK stays UNKNOWN across desk return and fresh original-control reads',
  async (kind) => {
    const f = await original(0, kind),
      reached = during('LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE', () => {
        throw Error('lost original ACK');
      });
    await expect(
      reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
    ).rejects.toThrow();
    reached();
    vi.restoreAllMocks();
    expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
    expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
    expect(returnAddonTaskDeskContext(f.task)).toBe(f.task.return_context);
    const fresh = await readSourceBoundAddons(
      f.controls.sources,
      f.controls.selection,
      f.gate,
    );
    await expect(
      reviewSourceBoundAddons(
        fresh,
        {
          ...f.confirmation,
          reviewed_source_sha256: fresh.integrity.sha256,
          external_reference: 'replacement-label',
        },
        f.clock,
      ),
    ).rejects.toThrow(/Existing lifecycle/);
  },
);
it.each(['EXPIRED', 'CANCELLED', 'REVOKED'] as const)(
  'return never resets original %s or permits a renewed window',
  async (state) => {
    const f = await original(),
      view = await reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
      confirm = {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      };
    if (state === 'EXPIRED') f.clock.now_ms = 2000;
    if (state === 'CANCELLED') cancelSourceBoundAddons(f.read, confirm);
    if (state === 'REVOKED') revokeSourceBoundAddons(f.read, confirm);
    expect(returnAddonTaskDeskContext(f.task)).toBe(f.task.return_context);
    expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
    expect(sourceBoundAddonsState(f.read).status).toBe(state);
    const fresh = await readSourceBoundAddons(
      f.controls.sources,
      f.controls.selection,
      f.gate,
    );
    await expect(
      reviewSourceBoundAddons(
        fresh,
        {
          ...f.confirmation,
          reviewed_source_sha256: fresh.integrity.sha256,
          external_reference: 'renewed-label',
          review_expires_at_ms: 4000,
        },
        { now_ms: 3000 },
      ),
    ).rejects.toThrow(/Existing lifecycle/);
  },
);
it('lost original handoff ACK cannot replay after returning to the same retained control', async () => {
  const f = await original(),
    view = await reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
    reached = during('IMMUTABLE_ADVANCED_REVIEW_HANDOFF', () => {
      throw Error('lost handoff ACK');
    });
  await expect(
    prepareSourceBoundAddons(f.read, {
      confirmed: true,
      reviewed_lifecycle_sha256: view.integrity.sha256,
    }),
  ).rejects.toThrow();
  reached();
  expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
  expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
});
it('two original-control reads for one inspected source still reserve the original lifecycle only once', async () => {
  const f = await opened(),
    [a, b] = await Promise.all([
      readSourceBoundAddons(f.controls.sources, f.controls.selection, f.gate),
      readSourceBoundAddons(f.controls.sources, f.controls.selection, f.gate),
    ]),
    clock = { now_ms: 1000 },
    result = await Promise.allSettled(
      [a, b].map((read, i) =>
        reviewSourceBoundAddons(
          read,
          {
            confirmed: true,
            reviewed_source_sha256: read.integrity.sha256,
            external_reference: `parallel-${i}`,
            review_expires_at_ms: 2000,
          },
          clock,
        ),
      ),
    );
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
});
it.each([0, 1, 2])(
  'brand %i actual job filters intersect literal text/property without broadening source coverage',
  async (brand) => {
    const f = await fixture(brand),
      view = await readAddonTaskDeskJobs(f.sources, f.gate),
      row = view.rows.find((r) => r.job_id === f.input.job_id)!;
    expect(selectAddonTaskDeskJob(view, f.input.job_id)).toBe(f.input.job_id);
    expect(view.available).toBe(4);
    expect(
      filterAddonTaskDeskJobs(view, {
        query: row.job_id,
        location_id: row.location_id,
      }).map((r) => r.job_id),
    ).toEqual([f.input.job_id]);
    expect(
      filterAddonTaskDeskJobs(view, { query: '.*', location_id: '' }),
    ).toEqual([]);
    expect(
      filterAddonTaskDeskJobs(view, {
        query: row.job_id,
        location_id: view.rows.find((r) => r.location_id !== row.location_id)!
          .location_id,
      }),
    ).toEqual([]);
    expect(view.crm_history_completeness).toBe('UNKNOWN');
  },
);
it('same-property jobs retain distinct immutable source and report identities', async () => {
  const f = await opened(0, 'procurement', 3),
    view = await readAddonTaskDeskJobs(f.sources, f.gate),
    rows = filterAddonTaskDeskJobs(view, {
      query: '',
      location_id: f.entry.target.location_id,
    });
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => r.job_id)).size).toBe(2);
  expect(new Set(rows.map((r) => r.issued_version_id)).size).toBe(2);
  expect(f.task.report.report_id).toBe(f.entry.report_id);
  expect(f.task.source.job_id).toBe(f.entry.target.job_id);
});
it.each([0, 1, 2])(
  'brand %i exact job navigation calls only the current callback after the final source await',
  async (brand) => {
    const f = await opened(brand),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    expect(
      await navigateAddonTaskDeskJob(f.task, f.record, callback, live),
    ).toBe(f.input.job_id);
    expect(callback).toHaveBeenCalledExactlyOnceWith(f.input.job_id);
  },
);
it.each(['throw', 'reject'] as const)(
  'host callback %s after dispatch preserves immutable bodies and terminal UNKNOWN across fresh job/mode selection',
  async (kind) => {
    const f = await opened(),
      snapshot = JSON.stringify([f.task, f.record, f.controls.selection]),
      dispatched: string[] = [],
      callback = vi.fn((job: string) => {
        dispatched.push(job);
        if (kind === 'throw') throw Error('host result lost after dispatch');
        return Promise.reject(Error('host result lost after dispatch'));
      }),
      live = { current: callback, generation: 0 };
    await expect(
      navigateAddonTaskDeskJob(f.task, f.record, callback, live),
    ).rejects.toThrow(/lost after dispatch/);
    expect(dispatched).toEqual([f.input.job_id]);
    expect(JSON.stringify([f.task, f.record, f.controls.selection])).toBe(
      snapshot,
    );
    await expect(
      navigateAddonTaskDeskJob(f.task, f.record, callback, live),
    ).rejects.toThrow(/UNKNOWN/);
    expect(() => resumeAddonTaskDeskControls(f.task)).toThrow(/UNKNOWN/);
    await expect(
      readAddonTaskDesk(f.sources, { ...f.input }, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
    await expect(
      readAddonTaskDesk(
        { ...f.sources },
        { ...f.input, kind: 'voice' },
        f.gate,
      ),
    ).rejects.toThrow(/UNKNOWN/);
    expect(callback).toHaveBeenCalledTimes(1);
  },
);
it('two concurrent exact-source host navigations dispatch only one callback', async () => {
  const f = await opened(),
    callback = vi.fn(),
    live = { current: callback, generation: 0 },
    results = await Promise.allSettled([
      navigateAddonTaskDeskJob(f.task, f.record, callback, live),
      navigateAddonTaskDeskJob(f.task, f.record, callback, live),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(callback).toHaveBeenCalledExactlyOnceWith(f.input.job_id);
  expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
});
it('lost exact-reference acknowledgement is terminal for the originating task and same job', async () => {
  const f = await opened(),
    callback = vi.fn(),
    live = { current: callback, generation: 0 },
    reached = during('LOCAL_ADDON_RECORDED_REFERENCE', () => {
      throw Error('lost source ACK');
    });
  await expect(
    navigateAddonTaskDeskJob(f.task, f.record, callback, live),
  ).rejects.toThrow(/lost source ACK/);
  reached();
  vi.restoreAllMocks();
  await expect(
    navigateAddonTaskDeskJob(f.task, f.record, callback, live),
  ).rejects.toThrow(/UNKNOWN/);
  await expect(
    readAddonTaskDesk(f.sources, { ...f.input }, f.gate),
  ).rejects.toThrow(/UNKNOWN/);
  expect(callback).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'brand %i actual other tenant reference cannot enter retained breadcrumbs or controls',
  async (brand) => {
    const f = await opened(brand),
      other = await opened((brand + 1) % 3);
    await expect(
      inspectAddonTaskDeskReference(f.task, other.reference),
    ).rejects.toThrow();
    expect(() => addonTaskDeskBreadcrumbs(f.task, other.record)).toThrow(
      /Exact/,
    );
    expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
  },
);
it.each([0, 1, 2])(
  'brand %i actual other property reference cannot become this exact source',
  async (brand) => {
    const f = await opened(brand),
      otherEntry = f.sources.entries[1],
      other = await readAddonTaskDesk(
        f.sources,
        { ...f.input, job_id: otherEntry.target.job_id! },
        f.gate,
      ),
      controls = openAddonTaskDeskControls(other),
      reference = controls.selection.references.find(
        (r) => r.kind === 'report',
      )!;
    expect(reference.location_id).not.toBe(f.entry.target.location_id);
    await expect(
      inspectAddonTaskDeskReference(f.task, reference),
    ).rejects.toThrow();
    expect(returnAddonTaskDeskContext(f.task)).toBe(f.task.return_context);
  },
);
it.each(['removed', 'replaced', 'restored'] as const)(
  'callback %s during final reference inspection never calls an obsolete or replacement callback',
  async (kind) => {
    const f = await opened(),
      old = vi.fn(),
      replacement = vi.fn(),
      live: {
        current: AddonTaskDeskCallback | undefined;
        generation: number;
      } = { current: old, generation: 0 },
      reached = during('LOCAL_ADDON_RECORDED_REFERENCE', () => {
        live.current = kind === 'removed' ? undefined : replacement;
        live.generation++;
        if (kind === 'restored') {
          live.current = old;
          live.generation++;
        }
      });
    await expect(
      navigateAddonTaskDeskJob(f.task, f.record, old, live),
    ).rejects.toThrow(/withdrawn|replaced/);
    reached();
    expect(old).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
    expect(returnAddonTaskDeskContext(f.task)).toBe(f.task.return_context);
  },
);
it('a callback withdrawn before navigation rejects before reference hashing without discarding original controls', async () => {
  const f = await opened(),
    callback = vi.fn(),
    digest = vi.spyOn(crypto.subtle, 'digest');
  await expect(
    navigateAddonTaskDeskJob(f.task, f.record, callback, {
      current: undefined,
      generation: 0,
    }),
  ).rejects.toThrow(/withdrawn/);
  expect(digest).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
  expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
});
it('a live callback getter is rejected without invocation', async () => {
  const f = await opened(),
    callback = vi.fn(),
    getter = vi.fn(() => callback),
    live = Object.defineProperty({ generation: 0 }, 'current', {
      enumerable: true,
      get: getter,
    });
  await expect(
    navigateAddonTaskDeskJob(
      f.task,
      f.record,
      callback,
      live as { current: AddonTaskDeskCallback; generation: number },
    ),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});
it.each(['gate', 'input', 'root', 'member'] as const)(
  'navigation rechecks %s after its final await before any callback',
  async (kind) => {
    const f = await opened(),
      callback = vi.fn(),
      live = { current: callback, generation: 0 },
      reached = during('LOCAL_ADDON_RECORDED_REFERENCE', async () => {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'input') f.input.edition = 'roofing';
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
        if (kind === 'member') {
          await f.sources.operations.configure(
            f.sources.company.id,
            'active',
            'starter',
            {},
            f.sources.company.id + '-backup-owner',
          );
          await f.sources.operations.revokeOwner(
            f.sources.company.id,
            f.entry.target.actor_id,
          );
        }
      });
    await expect(
      navigateAddonTaskDeskJob(f.task, f.record, callback, live),
    ).rejects.toThrow();
    reached();
    expect(callback).not.toHaveBeenCalled();
  },
);
it.each(['job_id', 'kind', 'edition'] as const)(
  'dirty original %s cannot revive desk/control identity after restoration',
  async (key) => {
    const f = await opened(),
      before = { ...f.input };
    Object.assign(f.input, {
      [key]:
        key === 'kind' ? 'voice' : key === 'edition' ? 'roofing' : 'foreign',
    });
    expect(() => returnAddonTaskDeskContext(f.task)).toThrow();
    Object.assign(f.input, before);
    expect(() => resumeAddonTaskDeskControls(f.task)).toThrow(/UNKNOWN/);
  },
);
it.each([
  'job',
  'mode',
  'edition',
  'getter',
  'serializer',
  'coercion',
] as const)(
  'invalid %s source input cannot enter the original control',
  async (kind) => {
    const f = await fixture(),
      called = vi.fn(() => ''),
      input = { ...f.input };
    if (kind === 'job') input.job_id = 'foreign';
    if (kind === 'mode') Object.assign(input, { kind: 'unknown' });
    if (kind === 'edition') Object.assign(input, { edition: 'unknown' });
    if (kind === 'getter')
      Object.defineProperty(input, 'job_id', { enumerable: true, get: called });
    if (kind === 'serializer') Object.assign(input, { toJSON: called });
    if (kind === 'coercion')
      Object.assign(input, { job_id: { toString: called } });
    await expect(readAddonTaskDesk(f.sources, input, f.gate)).rejects.toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it.each(['input', 'gate', 'source', 'company'] as const)(
  'final original task hash rechecks %s before exposing guide controls',
  async (kind) => {
    const f = await fixture(),
      reached = during('LOCAL_RETAINED_ADDON_TASK_CONTEXT', async () => {
        if (kind === 'input') f.input.kind = 'voice';
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'source')
          await f.sources.estimates.revise(
            f.sources.company.id,
            f.entry.issued,
          );
        if (kind === 'company')
          await f.sources.operations.configure(
            f.sources.company.id,
            'suspended',
            'starter',
            {},
            f.entry.target.actor_id,
          );
      });
    await expect(
      readAddonTaskDesk(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    reached();
  },
);
it.each([0, 1, 2])(
  'brand %i revoked staff cannot inspect retained references or reopen original controls',
  async (brand) => {
    const f = await opened(brand);
    await f.sources.operations.configure(
      f.sources.company.id,
      'active',
      'starter',
      {},
      f.sources.company.id + '-backup-owner',
    );
    await f.sources.operations.revokeOwner(
      f.sources.company.id,
      f.entry.target.actor_id,
    );
    expect(() => assertAddonTaskDeskCurrent(f.task)).toThrow();
    expect(() => openAddonTaskDeskControls(f.task)).toThrow();
    await expect(
      inspectAddonTaskDeskReference(f.task, f.reference),
    ).rejects.toThrow();
  },
);
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'issued_version_id',
  'version',
] as const)(
  'foreign exact reference %s cannot substitute another source',
  async (key) => {
    const f = await opened(),
      reference = { ...f.reference };
    Object.assign(reference, { [key]: key === 'version' ? 99 : 'foreign' });
    await expect(
      inspectAddonTaskDeskReference(f.task, reference),
    ).rejects.toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i task source projection has no customer route, private costs/rates or unrelated customer evidence',
  async (brand) => {
    const f = await opened(brand),
      text = JSON.stringify({ task: f.task, selection: f.controls.selection });
    for (const term of [
      'PRIVATE',
      'unit_cost_minor',
      'hourly_rate_minor',
      'supplier_cost',
      'internal_notes',
      'payroll',
      f.sources.entries[1].target.customer_id,
      f.sources.entries[1].report_id,
    ])
      expect(text).not.toContain(term);
    expect(f.controls.selection.authority).toBe(
      'STAFF_READ_ONLY_NOT_CUSTOMER_PROJECTION',
    );
    expect(() =>
      openAddonTaskDeskControls(JSON.parse(JSON.stringify(f.task))),
    ).toThrow(/retained/);
  },
);
it.each(['query', 'property', 'extra', 'getter'] as const)(
  'invalid %s job filter rejects without source expansion or hooks',
  async (kind) => {
    const f = await fixture(),
      view = await readAddonTaskDeskJobs(f.sources, f.gate),
      called = vi.fn(() => ''),
      input = { query: '', location_id: '' };
    if (kind === 'query') input.query = 'x'.repeat(101);
    if (kind === 'property') input.location_id = 'foreign';
    if (kind === 'extra') Object.assign(input, { toJSON: called });
    if (kind === 'getter')
      Object.defineProperty(input, 'query', { enumerable: true, get: called });
    expect(() => filterAddonTaskDeskJobs(view, input)).toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it.each(['foreign', 'empty', 'coercion', 'copied-view'] as const)(
  'selected job hint %s cannot silently choose a different job',
  async (kind) => {
    const f = await fixture(),
      view = await readAddonTaskDeskJobs(f.sources, f.gate),
      called = vi.fn(() => f.input.job_id);
    if (kind === 'foreign')
      expect(() => selectAddonTaskDeskJob(view, 'foreign')).toThrow();
    if (kind === 'empty')
      expect(() => selectAddonTaskDeskJob(view, '')).toThrow();
    if (kind === 'coercion')
      expect(() =>
        selectAddonTaskDeskJob(view, {
          toString: called,
        } as unknown as string),
      ).toThrow();
    if (kind === 'copied-view')
      expect(() =>
        selectAddonTaskDeskJob(
          JSON.parse(JSON.stringify(view)),
          f.input.job_id,
        ),
      ).toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it('source and reference getters/serializers reject without execution', async () => {
  const f = await opened(),
    called = vi.fn(() => ''),
    sources = Object.defineProperty({ ...f.sources }, 'company', {
      enumerable: true,
      get: called,
    });
  await expect(readAddonTaskDesk(sources, f.input, f.gate)).rejects.toThrow();
  await expect(
    inspectAddonTaskDeskReference(
      f.task,
      Object.defineProperty({ ...f.reference }, 'id', {
        enumerable: true,
        get: called,
      }),
    ),
  ).rejects.toThrow();
  Object.assign(f.entry.issued, { toJSON: called });
  await expect(readAddonTaskDeskJobs(f.sources, f.gate)).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
it.each([
  'default',
  'production',
  'https',
  'foreign-host',
  'unconfirmed',
] as const)(
  '%s OFF admission precedes source getters in domain and React',
  async (kind) => {
    const called = vi.fn(() => {
        throw Error('must not run');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: called,
      }) as OperatingSources;
    if (kind === 'production') vi.stubEnv('DEV', false);
    if (kind === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    if (kind === 'foreign-host')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1.example.invalid', protocol: 'http:' },
      });
    const gate = {
      enabled: kind !== 'default',
      confirmed: kind !== 'unconfirmed' && kind !== 'default',
    };
    await expect(readAddonTaskDeskJobs(sources, gate)).rejects.toThrow(/OFF/);
    await expect(
      readAddonTaskDesk(
        sources,
        { job_id: 'foreign', kind: 'offline', edition: 'property_services' },
        gate,
      ),
    ).rejects.toThrow(/OFF/);
    if (kind !== 'unconfirmed')
      expect(
        renderToStaticMarkup(
          createElement(AddonTaskDesk, {
            sources,
            enabled: kind !== 'default',
          }),
        ),
      ).toContain('Add-on task desk is off');
    expect(called).not.toHaveBeenCalled();
  },
);
it('React exposes loading and invalid hints without automatically running original reviews', async () => {
  const f = await fixture(),
    ids = vi.spyOn(crypto, 'randomUUID'),
    command = vi.spyOn(f.entry.release, 'command');
  expect(
    renderToStaticMarkup(
      createElement(AddonTaskDesk, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
      }),
    ),
  ).toContain('Loading exact add-on task source');
  expect(
    renderToStaticMarkup(
      createElement(AddonTaskDesk, {
        sources: f.sources,
        enabled: true,
        selectedJobId: 'foreign',
      }),
    ),
  ).toContain('UNKNOWN');
  expect(ids).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
});
it('retained job view rejects later root replacement', async () => {
  const f = await fixture(),
    view = await readAddonTaskDeskJobs(f.sources, f.gate);
  f.sources.entries = [...f.sources.entries];
  expect(() => assertAddonTaskDeskJobsCurrent(view)).toThrow();
});

it('removing then restoring the same callback cannot revive a navigation from an earlier callback generation', async () => {
  const f = await opened(),
    callback = vi.fn(),
    live = {
      current: callback as AddonTaskDeskCallback | undefined,
      generation: 0,
    },
    reached = during('LOCAL_ADDON_RECORDED_REFERENCE', () => {
      live.current = undefined;
      live.generation++;
      live.current = callback;
      live.generation++;
    });
  await expect(
    navigateAddonTaskDeskJob(f.task, f.record, callback, live),
  ).rejects.toThrow(/withdrawn|replaced/);
  reached();
  expect(callback).not.toHaveBeenCalled();
  expect(resumeAddonTaskDeskControls(f.task)).toBe(f.controls);
});
