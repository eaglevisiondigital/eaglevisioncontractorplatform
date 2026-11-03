import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Phase3Repository } from '../src/lib/phase3';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  advancedHandoffKinds,
  type AdvancedHandoffInput,
} from '../src/lib/workflows/advanced-handoffs';
import { AddonTaskContinuity } from '../src/components/workflows/AddonTaskContinuity';
import {
  readAddonTaskContinuity,
  assertAddonTaskContinuityCurrent,
  openAddonTaskControls,
  resumeAddonTaskControls,
  returnAddonTaskContext,
  selectAddonTaskJob,
  reconcileAddonTaskContinuity,
  type AddonTaskInput,
} from '../src/lib/workflows/addon-task-continuity';
import {
  readSourceBoundAddons,
  reviewSourceBoundAddons,
  prepareSourceBoundAddons,
  sourceBoundAddonsState,
  inspectSourceBoundAddons,
  cancelSourceBoundAddons,
  revokeSourceBoundAddons,
} from '../src/lib/workflows/source-bound-addons';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(
  index = 0,
  kind: AdvancedHandoffInput['kind'] = 'offline',
  entryIndex = 0,
) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input: AddonTaskInput = {
      job_id: sources.entries[entryIndex].target.job_id!,
      kind,
      edition: 'property_services',
    };
  return { sources, gate, input };
}
async function taskFixture(
  index = 0,
  kind: AdvancedHandoffInput['kind'] = 'offline',
) {
  const f = await fixture(index, kind),
    task = await readAddonTaskContinuity(f.sources, f.input, f.gate),
    controls = openAddonTaskControls(task),
    read = await readSourceBoundAddons(
      controls.sources,
      controls.selection,
      f.gate,
    ),
    confirmation = {
      confirmed: true,
      reviewed_source_sha256: read.integrity.sha256,
      external_reference: 'task-001',
      review_expires_at_ms: 2000,
    },
    clock = { now_ms: 1000 };
  return { ...f, task, controls, read, confirmation, clock };
}
function digestChange(mode: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (!fired && body.mode === mode) {
      fired = true;
      await change();
    }
    return value;
  });
  return () => expect(fired).toBe(true);
}
for (const index of [0, 1, 2])
  for (const kind of advancedHandoffKinds)
    it(`brand ${index} ${kind} retains exact original control props and original engine evidence across local return/resume without business effects`, async () => {
      const f = await fixture(index, kind),
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
        task = await readAddonTaskContinuity(f.sources, f.input, f.gate),
        controls = openAddonTaskControls(task);
      expect(ids).not.toHaveBeenCalled();
      ids.mockRestore();
      expect(controls.sources).toBe(f.sources);
      expect(task.source).toEqual(controls.selection.reference);
      expect(task.edition).toEqual(controls.selection.edition);
      expect(Object.isFrozen(controls)).toBe(true);
      expect(Object.isFrozen(task.return_context)).toBe(true);
      const read = await readSourceBoundAddons(
          controls.sources,
          controls.selection,
          f.gate,
        ),
        view = await reviewSourceBoundAddons(
          read,
          {
            confirmed: true,
            reviewed_source_sha256: read.integrity.sha256,
            external_reference: 'original-task',
            review_expires_at_ms: 2000,
          },
          { now_ms: 1000 },
        ),
        snapshot = JSON.stringify(view),
        packet = await prepareSourceBoundAddons(read, {
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
      ).toBe(task.source.job_id);
      expect(
        packet.original_handoff.existing_handoff.requirements.review_context
          .edition,
      ).toBe(f.input.edition);
      const digest = vi.spyOn(crypto.subtle, 'digest');
      for (let i = 0; i < 3; i++) {
        expect(returnAddonTaskContext(task)).toBe(task.return_context);
        expect(resumeAddonTaskControls(task)).toBe(controls);
        expect(selectAddonTaskJob(task)).toBe(f.input.job_id);
      }
      expect(digest).not.toHaveBeenCalled();
      expect(sourceBoundAddonsState(read).status).toBe('PREPARED');
      expect(JSON.stringify(view)).toBe(snapshot);
      expect((await inspectSourceBoundAddons(read)).status).toBe('PREPARED');
      expect(task).toMatchObject({
        original_control: 'UNCHANGED_SOURCE_BOUND_ADDONS',
        original_review_status: 'NOT_INFERRED_BY_NAVIGATION_METADATA',
      });
      expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
      expect(f.sources.entries.map((e) => e.release.read('staff'))).toEqual(
        releases,
      );
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    });
for (const kind of advancedHandoffKinds)
  it(`${kind} original UNKNOWN comparison is never reset by local return, resume, fresh task or remount props`, async () => {
    const f = await taskFixture(0, kind),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let fired = false;
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const value = await digest(...args),
          body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
        if (!fired && body.mode === 'LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE') {
          fired = true;
          throw Error('lost original ACK');
        }
        return value;
      });
    await expect(
      reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
    ).rejects.toThrow();
    expect(fired).toBe(true);
    spy.mockRestore();
    expect(returnAddonTaskContext(f.task)).toBe(f.task.return_context);
    expect(resumeAddonTaskControls(f.task)).toBe(f.controls);
    expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
    expect(reconcileAddonTaskContinuity(f.task)).toMatchObject({
      status: 'CURRENT_SOURCE_CONTEXT_ONLY',
      original_review_status: 'OWNED_BY_RETAINED_ORIGINAL_CONTROL',
      operational_ready: false,
    });
    const fresh = await readAddonTaskContinuity(
        f.sources,
        { ...f.input },
        f.gate,
      ),
      props = openAddonTaskControls(fresh),
      read = await readSourceBoundAddons(
        props.sources,
        props.selection,
        f.gate,
      );
    await expect(
      reviewSourceBoundAddons(
        read,
        {
          ...f.confirmation,
          reviewed_source_sha256: read.integrity.sha256,
          external_reference: 'fresh-task-label',
        },
        f.clock,
      ),
    ).rejects.toThrow(/Existing lifecycle/);
  });
it('lost original handoff ACK remains exact UNKNOWN after returning and resuming the same controls', async () => {
  const f = await taskFixture(),
    view = await reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
    reached = digestChange('IMMUTABLE_ADVANCED_REVIEW_HANDOFF', () => {
      throw Error('lost handoff ACK');
    });
  await expect(
    prepareSourceBoundAddons(f.read, {
      confirmed: true,
      reviewed_lifecycle_sha256: view.integrity.sha256,
    }),
  ).rejects.toThrow();
  reached();
  expect(returnAddonTaskContext(f.task).job_id).toBe(f.input.job_id);
  expect(resumeAddonTaskControls(f.task)).toBe(f.controls);
  expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
});
it.each(['EXPIRED', 'CANCELLED', 'REVOKED'] as const)(
  'local return preserves original %s state and prevents replacement',
  async (status) => {
    const f = await taskFixture(),
      view = await reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
      confirmation = {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      };
    if (status === 'EXPIRED') f.clock.now_ms = 2000;
    if (status === 'CANCELLED') cancelSourceBoundAddons(f.read, confirmation);
    if (status === 'REVOKED') revokeSourceBoundAddons(f.read, confirmation);
    returnAddonTaskContext(f.task);
    resumeAddonTaskControls(f.task);
    expect(sourceBoundAddonsState(f.read).status).toBe(status);
    const fresh = await readAddonTaskContinuity(
        f.sources,
        { ...f.input },
        f.gate,
      ),
      props = openAddonTaskControls(fresh),
      read = await readSourceBoundAddons(
        props.sources,
        props.selection,
        f.gate,
      );
    await expect(
      reviewSourceBoundAddons(
        read,
        {
          ...f.confirmation,
          reviewed_source_sha256: read.integrity.sha256,
          external_reference: 'replacement',
          review_expires_at_ms: 4000,
        },
        { now_ms: 3000 },
      ),
    ).rejects.toThrow(/Existing lifecycle/);
  },
);
it('concurrent task metadata creates no competing engine store and original review reserves once', async () => {
  const f = await fixture(),
    [a, b] = await Promise.all([
      readAddonTaskContinuity(f.sources, f.input, f.gate),
      readAddonTaskContinuity(f.sources, { ...f.input }, f.gate),
    ]);
  expect(a).toEqual(b);
  const pa = openAddonTaskControls(a),
    pb = openAddonTaskControls(b),
    [ra, rb] = await Promise.all([
      readSourceBoundAddons(pa.sources, pa.selection, f.gate),
      readSourceBoundAddons(pb.sources, pb.selection, f.gate),
    ]),
    result = await Promise.allSettled([
      reviewSourceBoundAddons(
        ra,
        {
          confirmed: true,
          reviewed_source_sha256: ra.integrity.sha256,
          external_reference: 'first',
          review_expires_at_ms: 2000,
        },
        { now_ms: 1000 },
      ),
      reviewSourceBoundAddons(
        rb,
        {
          confirmed: true,
          reviewed_source_sha256: rb.integrity.sha256,
          external_reference: 'second',
          review_expires_at_ms: 2000,
        },
        { now_ms: 1000 },
      ),
    ]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
});
it.each(['job_id', 'kind', 'edition'] as const)(
  'dirty original %s invalidates task return/resume permanently',
  async (key) => {
    const f = await taskFixture();
    Object.assign(f.input, {
      [key]:
        key === 'kind' ? 'voice' : key === 'edition' ? 'roofing' : 'foreign',
    });
    expect(() => returnAddonTaskContext(f.task)).toThrow();
    Object.assign(f.input, {
      job_id: f.task.return_context.job_id,
      kind: f.task.return_context.kind,
      edition: f.task.return_context.edition,
    });
    expect(() => resumeAddonTaskControls(f.task)).toThrow(/UNKNOWN/);
    expect(reconcileAddonTaskContinuity(f.task).status).toBe('UNKNOWN');
  },
);
it.each(['job', 'mode', 'edition', 'getter', 'extra', 'coercion'] as const)(
  'invalid %s input denies before an original attempt',
  async (kind) => {
    const f = await fixture(),
      called = vi.fn(() => ''),
      bad = { ...f.input };
    if (kind === 'job') bad.job_id = 'foreign';
    if (kind === 'mode') Object.assign(bad, { kind: 'unknown-mode' });
    if (kind === 'edition') Object.assign(bad, { edition: 'unknown-edition' });
    if (kind === 'getter')
      Object.defineProperty(bad, 'job_id', { enumerable: true, get: called });
    if (kind === 'extra') Object.assign(bad, { toJSON: called });
    if (kind === 'coercion')
      Object.assign(bad, { job_id: { toString: called } });
    await expect(
      readAddonTaskContinuity(f.sources, bad, f.gate),
    ).rejects.toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it.each([
  'company',
  'member',
  'model',
  'repository',
  'root',
  'gate',
  'saved-source',
  'plan-revision',
] as const)(
  'changed %s source removes controls and retained return',
  async (kind) => {
    const f = await taskFixture(),
      entry = f.sources.entries[0];
    if (kind === 'company')
      await f.sources.operations.configure(
        f.sources.company.id,
        'suspended',
        'starter',
        {},
        entry.target.actor_id,
      );
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
        entry.target.actor_id,
      );
    }
    if (kind === 'model') {
      const model = new CustomerPortalPreviewModel(
        f.sources.company,
        f.sources.property,
      );
      model.admitLocalJourney(entry.target, f.gate);
      entry.customerModel = model;
    }
    if (kind === 'repository')
      f.sources.estimates = new Phase3Repository(f.sources.operations);
    if (kind === 'root') f.sources.entries = [...f.sources.entries];
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'saved-source')
      await f.sources.estimates.revise(f.sources.company.id, entry.issued);
    if (kind === 'plan-revision') {
      const plan = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.id === entry.plan_id)!;
      f.sources.property.savePlan(f.sources.company.id, {
        ...plan,
        name: plan.name + ' changed',
      });
    }
    expect(() => assertAddonTaskContinuityCurrent(f.task)).toThrow();
    expect(() => resumeAddonTaskControls(f.task)).toThrow();
    expect(() => returnAddonTaskContext(f.task)).toThrow();
    expect(() => selectAddonTaskJob(f.task)).toThrow();
  },
);
it.each(['job', 'mode', 'edition', 'gate', 'model', 'member'] as const)(
  'last task hash independently checks %s',
  async (kind) => {
    const f = await fixture(),
      reached = digestChange('LOCAL_RETAINED_ADDON_TASK_CONTEXT', async () => {
        if (kind === 'job') f.input.job_id = 'foreign';
        if (kind === 'mode') f.input.kind = 'voice';
        if (kind === 'edition') f.input.edition = 'roofing';
        if (kind === 'gate') f.gate.enabled = false;
        if (kind === 'model') f.sources.entries[0].customerModel.logout();
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
            f.sources.entries[0].target.actor_id,
          );
        }
      });
    await expect(
      readAddonTaskContinuity(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    reached();
  },
);
it('ambiguous predecessor plan and foreign property never produce a task target', async () => {
  const f = await fixture(),
    read = f.sources.property.read.bind(f.sources.property);
  vi.spyOn(f.sources.property, 'read').mockImplementation((org) => {
    const state = read(org);
    return {
      ...state,
      plans: [
        ...state.plans,
        structuredClone(
          state.plans.find((p) => p.id === f.sources.entries[0].plan_id)!,
        ),
      ],
    };
  });
  await expect(
    readAddonTaskContinuity(f.sources, f.input, f.gate),
  ).rejects.toThrow();
  vi.restoreAllMocks();
  f.sources.entries[0].target.location_id =
    f.sources.entries[1].target.location_id;
  await expect(
    readAddonTaskContinuity(f.sources, f.input, f.gate),
  ).rejects.toThrow();
});
it('same-property jobs retain independent immutable task versions and report identities', async () => {
  const f = await taskFixture(),
    entry = f.sources.entries.find(
      (e) =>
        e.target.location_id === f.task.source.location_id &&
        e.target.job_id !== f.task.source.job_id,
    )!,
    other = await readAddonTaskContinuity(
      f.sources,
      { ...f.input, job_id: entry.target.job_id! },
      f.gate,
    );
  expect(other.source.location_id).toBe(f.task.source.location_id);
  expect(other.source.job_id).not.toBe(f.task.source.job_id);
  expect(other.source.issued_version_id).not.toBe(
    f.task.source.issued_version_id,
  );
  expect(other.report.report_id).not.toBe(f.task.report.report_id);
});
it('copies and source serializers cannot recover original controls', async () => {
  const f = await taskFixture();
  expect(() =>
    openAddonTaskControls(JSON.parse(JSON.stringify(f.task))),
  ).toThrow(/retained/);
  const called = vi.fn(() => '');
  Object.assign(f.sources.entries[0].issued, { toJSON: called });
  await expect(
    readAddonTaskContinuity(f.sources, f.input, f.gate),
  ).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
it('staff task metadata excludes private costs/rates/workforce/notes and other customers', async () => {
  const f = await taskFixture(),
    text = JSON.stringify(f.task);
  for (const term of [
    'PRIVATE',
    'unit_cost_minor',
    'hourly_rate_minor',
    'supplier_cost',
    'internal_notes',
    'payroll',
    'worker_id',
    'actor_id',
    f.sources.entries[0].receipt_id,
    f.sources.entries[1].target.customer_id,
    f.sources.entries[1].report_id,
  ])
    expect(text).not.toContain(term);
  expect(f.task.requirements.length).toBeGreaterThanOrEqual(2);
});
it('default OFF denies before source/input getter or serialization', async () => {
  const called = vi.fn(() => {
      throw Error('must not run');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: called,
    }) as OperatingSources,
    input = Object.defineProperty({}, 'job_id', {
      get: called,
    }) as AddonTaskInput;
  await expect(readAddonTaskContinuity(sources, input)).rejects.toThrow(/OFF/);
  expect(
    renderToStaticMarkup(createElement(AddonTaskContinuity, { sources })),
  ).toContain('Advanced task continuity is off');
  expect(called).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote', 'disabled'] as const)(
  'UI %s admission denies before source access',
  (kind) => {
    vi.stubGlobal('window', {
      location: {
        hostname: kind === 'remote' ? 'example.invalid' : '127.0.0.1',
        protocol: kind === 'https' ? 'https:' : 'http:',
      },
    });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const called = vi.fn(() => {
        throw Error('must not run');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: called,
      }) as OperatingSources;
    expect(
      renderToStaticMarkup(
        createElement(AddonTaskContinuity, {
          sources,
          enabled: kind !== 'disabled',
        }),
      ),
    ).toContain('Advanced task continuity is off');
    expect(called).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i validates/prefills current selected job with no automatic original control or attempt',
  async (index) => {
    const f = await fixture(index);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const job = f.sources.entries[3].target.job_id!,
      html = renderToStaticMarkup(
        createElement(AddonTaskContinuity, {
          sources: f.sources,
          enabled: true,
          selectedJobId: job,
        }),
      );
    expect(html).toContain(`value="${job}" selected`);
    expect(html).toContain('Inspect advanced task source');
    expect(html).not.toContain('aria-label="Pinned advanced workflow"');
    expect(html).not.toContain(f.sources.entries[0].receipt_id);
  },
);
it.each(['foreign', 'empty', 'object'] as const)(
  'UI %s selected-job hint is denied without fallback',
  async (kind) => {
    const f = await fixture();
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const called = vi.fn(() => ''),
      selectedJobId =
        kind === 'object'
          ? ({ toString: called } as unknown as string)
          : kind === 'empty'
            ? ''
            : 'foreign',
      html = renderToStaticMarkup(
        createElement(AddonTaskContinuity, {
          sources: f.sources,
          enabled: true,
          selectedJobId,
        }),
      );
    expect(html).toContain(
      'UNKNOWN — current source or selected job is unavailable',
    );
    expect(html).not.toContain('<select');
    expect(called).not.toHaveBeenCalled();
  },
);
