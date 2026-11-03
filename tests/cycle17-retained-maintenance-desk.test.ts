import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import {
  readMaintenancePlanningContinuity,
  selectMaintenancePlanningSource,
  prepareMaintenancePlanningContinuity,
  closeMaintenancePlanningContinuity,
} from '../src/lib/workflows/maintenance-planning-continuity';
import {
  readRetainedMaintenanceDesk as read,
  assertRetainedMaintenanceDeskNow as current,
  filterRetainedMaintenanceDesk as filter,
  reconcileRetainedMaintenanceDesk as reconcile,
  selectRetainedMaintenanceCase as select,
  assertRetainedMaintenanceCaseNow as currentCase,
  openRetainedMaintenanceSection as open,
  navigateRetainedMaintenanceCase as navigate,
} from '../src/lib/workflows/retained-maintenance-desk';
import { RetainedMaintenanceDesk } from '../src/components/workflows/RetainedMaintenanceDesk';
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
        from: '2026-12-28',
        through: '2027-01-25',
        as_of: '2026-12-28T12:00:00.000Z',
        channel: 'email',
      },
      lead_days: 14,
      overdue_days: 7,
      query: '',
      kind: 'all',
      readiness: 'all',
      job_id: sources.entries[2].target.job_id!,
      customer_id: '',
      location_id: '',
      purpose: 'recurring_maintenance',
      channel_state: 'all',
    };
  return { gate, sources, input };
}
it.each([0, 1, 2])(
  'brand %s retains exact occurrence/plan/property/issued breadcrumbs without consent or maintenance writes',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      writers = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.property, 'addVisit'),
      ],
      fetch = vi.spyOn(globalThis, 'fetch'),
      v = await read(f.sources, f.input, f.gate),
      row = v.rows[0],
      c = await select(v, row.key);
    expect(c.row).toBe(row);
    expect(c.breadcrumbs.map((x) => x.id)).toEqual([
      f.sources.company.id,
      row.context.customer_id,
      row.context.location_id,
      row.context.job_id,
      row.plan_reference.id,
      row.key,
    ]);
    expect(row.context.job_id).toBe(f.input.job_id);
    expect(row.source.plan_revision).toBe(row.plan_reference.revision);
    expect(c.current_channel_authority).toBe('UNKNOWN');
    expect(c.purpose_consent).toBe('UNVERIFIED');
    expect(c.suppression).toBe('UNVERIFIED');
    expect(c.enrollment).toBe('UNVERIFIED');
    expect(c.renewal_terms).toBe('UNKNOWN');
    expect(c.send).toBe(false);
    expect(c.recipient).toBeNull();
    expect(c.provider_request).toBeNull();
    expect(c.operational_authority).toBe('BLOCKED');
    expect(c.original_control_handoff).toBe(
      'SAME_JOB_ONLY_RECONFIRM_ORIGINAL_CONTEXT',
    );
    expect(Object.values(v.authority).every((a) => !a)).toBe(true);
    expect(Object.isFrozen(c.breadcrumbs)).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(
      /unit_cost|supplier|payroll|PRIVATE|@example.invalid|555010/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(['controls', 'sources', 'queue'] as const)(
  'opening %s and returning retains exactly the same case and desk',
  async (section) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      c = await select(v, v.rows[0].key),
      snapshot = JSON.stringify(c),
      result = await open(c, section),
      back = await open(c, 'controls');
    expect(result.view).toBe(c);
    expect(result.desk).toBe(v);
    expect(result.section).toBe(section);
    expect(back.view).toBe(c);
    expect(JSON.stringify(c)).toBe(snapshot);
  },
);
it('literal source filters retain exact original counts and reset without re-reading or preparing', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    row = v.rows[0],
    filters = {
      query: row.plan_name.toUpperCase(),
      kind: row.kind,
      channel_state: row.historical_channel_state,
      from: row.recorded_due_on,
      through: row.recorded_due_on,
    },
    result = filter(v, filters);
  expect(
    result.rows.every(
      (r) =>
        r.plan_name.toUpperCase().includes(filters.query) &&
        r.kind === filters.kind &&
        r.recorded_due_on === row.recorded_due_on,
    ),
  ).toBe(true);
  expect(result.matching).toBe(result.rows.length);
  expect(result.count_is_complete).toBe(false);
  expect(filter(v, { ...filters, query: '.*' }).rows).toHaveLength(0);
  expect(
    filter(v, {
      query: '',
      kind: 'all',
      channel_state: 'all',
      from: v.window.from,
      through: v.window.through,
    }).rows,
  ).toEqual(v.rows);
});
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
    renderToStaticMarkup(createElement(RetainedMaintenanceDesk, { sources })),
  ).toContain('desk is off');
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
        createElement(RetainedMaintenanceDesk, { sources, enabled: true }),
      ),
    ).toContain('desk is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each(['job_id', 'customer_id', 'location_id'] as const)(
  'foreign %s selector cannot broaden or replace the desk',
  async (key) => {
    const f = await fixture();
    f.input[key] = 'foreign';
    await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
  },
);
it('same-company wrong property cannot replace the selected job association', async () => {
  const f = await fixture();
  f.input.location_id = f.sources.entries[0].target.location_id;
  await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
});
it.each([1, 2])(
  'company %s cannot reuse another company source selection',
  async (brand) => {
    const a = await fixture(),
      b = await fixture(brand);
    await expect(read(b.sources, a.input, b.gate)).rejects.toThrow();
  },
);
it('copied desk or case does not confer retained source, return or callback authority', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    c = await select(v, v.rows[0].key),
    callback = vi.fn();
  expect(() => current(structuredClone(v))).toThrow();
  expect(() => currentCase(structuredClone(c))).toThrow();
  expect((await reconcile(structuredClone(v))).status).toBe('UNKNOWN');
  await expect(open(structuredClone(c), 'controls')).rejects.toThrow();
  await expect(navigate(structuredClone(c), callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
it.each(['gate', 'source', 'staff', 'purpose', 'channel'] as const)(
  'retained %s drift withdraws controls and navigation without restoring after UNKNOWN',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      c = await select(v, v.rows[0].key),
      saved = JSON.stringify(c),
      callback = vi.fn();
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'source') f.sources.entries = [...f.sources.entries];
    if (kind === 'staff')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'purpose') f.input.purpose = 'marketing';
    if (kind === 'channel') f.input.window.channel = 'sms';
    expect(() => current(v)).toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(open(c, 'controls')).rejects.toThrow();
    await expect(navigate(c, callback)).rejects.toThrow();
    vi.restoreAllMocks();
    f.gate.confirmed = true;
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    expect(JSON.stringify(c)).toBe(saved);
    expect(callback).not.toHaveBeenCalled();
  },
);
it.each(['purpose', 'suppression', 'channel'] as const)(
  'canonical %s change is detected during read-only return',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      c = await select(v, v.rows[0].key),
      original = reminders.readGrowthReminderReview;
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
    await expect(open(c, 'controls')).rejects.toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    vi.restoreAllMocks();
    await expect(open(c, 'sources')).rejects.toThrow();
  },
);
it.each(['gate', 'member', 'input'] as const)(
  'final %s withdrawal after desk hash withholds its result',
  async (kind) => {
    const f = await fixture(),
      original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_RETAINED_MAINTENANCE_DESK')
      ) {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'member')
          vi.spyOn(
            f.sources.operations,
            'syntheticMemberships',
          ).mockReturnValue([]);
        if (kind === 'input') f.input.purpose = 'marketing';
      }
      return result;
    });
    await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
  },
);
it('concurrent same-case navigation invokes exactly one original maintenance callback', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    c = await select(v, v.rows[0].key),
    callback = vi.fn(),
    outcomes = await Promise.allSettled([
      navigate(c, callback),
      navigate(c, callback),
    ]);
  expect(outcomes.map((r) => r.status).sort()).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(callback).toHaveBeenCalledExactlyOnceWith(
    c.row.context.job_id,
    'maintenance',
  );
});
it('a callback that navigates then throws retains desk UNKNOWN and forbids callback or case replay', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.input, f.gate),
    selected = await select(view, view.rows[0].key),
    snapshot = JSON.stringify(selected),
    navigated: string[] = [],
    first = vi.fn((jobId: string) => {
      navigated.push(jobId);
      throw Error('Lost maintenance navigation acknowledgment');
    }),
    second = vi.fn();
  await expect(navigate(selected, first)).rejects.toThrow(
    'Lost maintenance navigation acknowledgment',
  );
  await expect(navigate(selected, second)).rejects.toThrow();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(navigated).toEqual([selected.row.context.job_id]);
  expect((await reconcile(view)).status).toBe('UNKNOWN');
  await expect(select(view, selected.row.key)).rejects.toThrow();
  await expect(open(selected, 'controls')).rejects.toThrow();
  expect(JSON.stringify(selected)).toBe(snapshot);
});
it('revoked original review remains terminal across new desk source/controls navigation', async () => {
  const f = await fixture(),
    original = await readMaintenancePlanningContinuity(
      f.sources,
      f.input,
      f.gate,
    ),
    source = await selectMaintenancePlanningSource(
      original,
      original.rows[0].key,
      f.gate,
    ),
    proposal = {
      proposed_on: source.occurrence.recorded_due_on,
      plan_kind: 'renewal' as const,
    },
    prepared = await prepareMaintenancePlanningContinuity(
      source,
      proposal,
      f.gate,
    );
  closeMaintenancePlanningContinuity(prepared, 'REVOKE');
  const v = await read(f.sources, f.input, f.gate),
    c = await select(v, source.occurrence.key);
  expect(c.captured_original_control_status).toBe('REVOKED_LOCAL_REVIEW');
  expect((await open(c, 'controls')).view).toBe(c);
  await expect(
    prepareMaintenancePlanningContinuity(source, proposal, f.gate),
  ).rejects.toThrow();
  expect(c.send).toBe(false);
});
it.each([0, 1, 2])(
  'brand %s preselects the exact host job in accessible default-blocked desk controls',
  async (brand) => {
    const f = await fixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(RetainedMaintenanceDesk, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
      }),
    );
    expect(html).toContain('value="' + f.input.job_id + '" selected');
    expect(html).toContain('Load retained maintenance desk');
    expect(html).toContain('Maintenance desk purpose');
    expect(html).not.toContain('Inspect retention planning sources');
    expect(html).not.toMatch(/PRIVATE|supplier|unit_cost|payroll/);
  },
);
