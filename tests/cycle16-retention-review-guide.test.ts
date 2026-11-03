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
} from '../src/lib/workflows/maintenance-planning-continuity';
import {
  readRetentionReviewGuide as read,
  assertRetentionReviewGuideNow as current,
  filterRetentionReviewGuide as filter,
  inspectRetentionReviewItem as inspect,
  assertRetentionReviewItemNow as currentDetail,
  returnRetentionReviewGuide as back,
  reconcileRetentionReviewGuide as reconcile,
  openRetentionReviewControls as controls,
  navigateRetentionReviewJob as navigate,
  type RetentionReviewFilter,
} from '../src/lib/workflows/retention-review-guide';
import { RetentionReviewGuide } from '../src/components/workflows/RetentionReviewGuide';
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
const allFilters = (
  v: Awaited<ReturnType<typeof read>>,
): RetentionReviewFilter => ({
  query: '',
  kind: 'all',
  channel_state: 'all',
  from: v.window.from,
  through: v.window.through,
});
it.each([0, 1, 2])(
  'brand %s displays exact plan/job/issued/occurrence facts with no enrollment or communication writes',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveMaintenance'),
        vi.spyOn(f.sources.property, 'addVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const v = await read(f.sources, f.input, f.gate);
    expect(v.rows.length).toBeGreaterThan(0);
    expect(
      v.rows.every(
        (r) =>
          r.context.organization_id === f.sources.company.id &&
          r.context.job_id === f.input.job_id,
      ),
    ).toBe(true);
    for (const row of v.rows) {
      const plan = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.id === row.plan_reference.id)!;
      expect(row.plan_reference.revision).toBe(plan.revision);
      expect(row.context.customer_id).toBe(plan.customer_id);
      expect(row.context.location_id).toBe(plan.location_id);
      expect(row.source.plan_id).toBe(plan.id);
      expect(row.current_channel_authority).toBe('UNKNOWN');
      expect(row.purpose_consent).toBe('UNVERIFIED');
      expect(row.suppression).toBe('UNVERIFIED');
      expect(row.enrollment).toBe('UNVERIFIED');
      expect(row.renewal_terms).toBe('UNKNOWN');
      expect(row.communication_authority).toBe('BLOCKED');
    }
    expect(v.selected_job_id).toBe(f.input.job_id);
    expect(v.count_is_complete).toBe(false);
    expect(v.source_atomicity).toBe('CAPTURED_NOT_ATOMIC');
    expect(Object.values(v.authority).every((x) => !x)).toBe(true);
    expect(v.recipient).toBeNull();
    expect(v.provider_request).toBeNull();
    expect(Object.isFrozen(v.rows)).toBe(true);
    expect(v.integrity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(v)).not.toMatch(
      /unit_cost|supplier|payroll|PRIVATE|@example.invalid|555010/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it('combined literal kind/channel/date filters preserve exact row identity and accurate captured counts', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    row = v.rows[0],
    filters = {
      ...allFilters(v),
      query: row.plan_name.toUpperCase(),
      kind: row.kind,
      channel_state: row.historical_channel_state,
      from: row.recorded_due_on,
      through: row.recorded_due_on,
    },
    result = filter(v, filters);
  const expected = v.rows.filter(
    (r) =>
      r.plan_name.toUpperCase().includes(filters.query) &&
      r.kind === filters.kind &&
      r.historical_channel_state === filters.channel_state &&
      r.recorded_due_on === row.recorded_due_on,
  );
  expect(result.rows).toEqual(expected);
  expect(result.matching).toBe(expected.length);
  expect(result.rows[0]).toBe(row);
  expect(result.captured).toBe(v.rows.length);
  expect(result.count_is_complete).toBe(false);
  expect(filter(v, allFilters(v)).rows).toEqual(v.rows);
});
it.each(['.*', '<script>', 'no-such-plan'])(
  'query %s is literal and empty matches do not imply complete history',
  async (query) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      result = filter(v, { ...allFilters(v), query });
    expect(result.rows).toHaveLength(0);
    expect(result.matching).toBe(0);
    expect(result.count_is_complete).toBe(false);
    expect(result.send).toBe(false);
  },
);
it.each([
  'long-query',
  'bad-date',
  'reversed-date',
  'outside-window',
  'bad-kind',
  'bad-channel',
] as const)(
  'invalid %s filter cannot broaden the retained source window',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      input = allFilters(v);
    if (kind === 'long-query') input.query = 'x'.repeat(201);
    if (kind === 'bad-date') input.from = '2027-02-30';
    if (kind === 'reversed-date') input.from = '2027-01-26';
    if (kind === 'outside-window') input.through = '2027-02-01';
    if (kind === 'bad-kind') input.kind = 'unrelated' as typeof input.kind;
    if (kind === 'bad-channel')
      input.channel_state = 'CURRENT_ALLOWED' as typeof input.channel_state;
    expect(() => filter(v, input)).toThrow();
    expect(filter(v, allFilters(v)).matching).toBe(v.rows.length);
  },
);
it('OFF precedes source and filter accessors', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'],
    input = Object.defineProperty({}, 'window', {
      get: getter,
    }) as FollowUpReadinessInput;
  await expect(read(sources, input)).rejects.toThrow();
  expect(
    renderToStaticMarkup(createElement(RetentionReviewGuide, { sources })),
  ).toContain('guide is off');
  expect(getter).not.toHaveBeenCalled();
});
it('accessor filter is rejected without executing a caller getter', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    getter = vi.fn(),
    input = Object.defineProperty(allFilters(v), 'query', { get: getter });
  expect(() => filter(v, input)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:'])(
  'protocol %s stays off without reading sources',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
        ReturnType<typeof fixture>
      >['sources'];
    expect(
      renderToStaticMarkup(
        createElement(RetentionReviewGuide, { sources, enabled: true }),
      ),
    ).toContain('guide is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each(['job_id', 'customer_id', 'location_id'] as const)(
  'foreign %s filter cannot substitute another source',
  async (key) => {
    const f = await fixture();
    f.input[key] = 'foreign';
    await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
  },
);
it('exact occurrence inspection and return retain the same queue and source versions without consuming original preparation', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    row = v.rows[0],
    detail = await inspect(v, row.key);
  expect(detail.row).toBe(row);
  expect(detail.historical_contact_reference).toEqual(
    row.historical_contact_reference,
  );
  expect(detail.original_control_status).toBe('NOT_REVIEWED');
  expect(detail.operational_authority).toBe('BLOCKED');
  expect(await back(detail)).toBe(v);
  expect(await controls(detail)).toBe(row.context.job_id);
  expect((await inspect(v, row.key)).original_control_status).toBe(
    'NOT_REVIEWED',
  );
});
it('copied guide/detail cannot confer inspection, filtering, return or job navigation authority', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    detail = await inspect(v, v.rows[0].key),
    callback = vi.fn();
  expect(() => current(structuredClone(v))).toThrow();
  expect(() => filter(structuredClone(v), allFilters(v))).toThrow();
  await expect(inspect(structuredClone(v), v.rows[0].key)).rejects.toThrow();
  expect(() => currentDetail(structuredClone(detail))).toThrow();
  await expect(back(structuredClone(detail))).rejects.toThrow();
  await expect(navigate(structuredClone(detail), callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
it('foreign occurrence key never chooses a nearest date or another property', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate);
  await expect(inspect(v, 'foreign-key')).rejects.toThrow();
});
it.each(['gate', 'source', 'staff', 'purpose', 'channel', 'job'] as const)(
  'retained %s drift blocks local return and navigation with permanent UNKNOWN',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      detail = await inspect(v, v.rows[0].key),
      saved = JSON.stringify(detail),
      callback = vi.fn();
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'source') f.sources.entries = [...f.sources.entries];
    if (kind === 'staff')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'purpose') f.input.purpose = 'marketing';
    if (kind === 'channel') f.input.window.channel = 'sms';
    if (kind === 'job') f.input.job_id = f.sources.entries[0].target.job_id!;
    expect(() => current(v)).toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(back(detail)).rejects.toThrow();
    await expect(controls(detail)).rejects.toThrow();
    await expect(navigate(detail, callback)).rejects.toThrow();
    vi.restoreAllMocks();
    f.gate.confirmed = true;
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    expect(JSON.stringify(detail)).toBe(saved);
    expect(callback).not.toHaveBeenCalled();
  },
);
it.each(['purpose', 'suppression', 'channel'] as const)(
  'changed canonical %s observations block exact return after await',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      detail = await inspect(v, v.rows[0].key),
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
    await expect(back(detail)).rejects.toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    vi.restoreAllMocks();
    await expect(controls(detail)).rejects.toThrow();
  },
);
it.each(['gate', 'member', 'input'] as const)(
  'final %s withdrawal after guide hash withholds the new projection',
  async (kind) => {
    const f = await fixture(),
      original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_RETENTION_REVIEW_GUIDE')
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
it('exact current job navigation maps only to original maintenance section', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    detail = await inspect(v, v.rows[0].key),
    callback = vi.fn();
  await navigate(detail, callback);
  expect(callback).toHaveBeenCalledExactlyOnceWith(
    detail.row.context.job_id,
    'maintenance',
  );
});
it('original prepared review remains authoritative through guide inspection; no duplicate preparation', async () => {
  const f = await fixture(),
    original = await readMaintenancePlanningContinuity(
      f.sources,
      f.input,
      f.gate,
    ),
    selection = await selectMaintenancePlanningSource(
      original,
      original.rows[0].key,
      f.gate,
    ),
    proposal = {
      proposed_on: selection.occurrence.recorded_due_on,
      plan_kind: 'renewal' as const,
    };
  const prepared = await prepareMaintenancePlanningContinuity(
      selection,
      proposal,
      f.gate,
    ),
    v = await read(f.sources, f.input, f.gate),
    detail = await inspect(v, original.rows[0].key);
  expect(detail.original_control_status).toBe('ACTIVE_LOCAL_REVIEW');
  expect(await controls(detail)).toBe(f.input.job_id);
  await expect(
    prepareMaintenancePlanningContinuity(selection, proposal, f.gate),
  ).rejects.toThrow();
  expect(prepared.operational_authority).toBe('BLOCKED');
});
it.each([0, 1, 2])(
  'brand %s retains exact job hint in accessible default-blocked guide controls',
  async (brand) => {
    const f = await fixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(RetentionReviewGuide, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
      }),
    );
    expect(html).toContain('value="' + f.input.job_id + '" selected');
    expect(html).toContain('Retention requested purpose');
    expect(html).toContain('Retention evidence channel');
    expect(html).toContain('Inspect retention planning sources');
    expect(html).not.toContain('Review maintenance path sources');
    expect(html).not.toMatch(/unit_cost|supplier|payroll|PRIVATE/);
  },
);
it('foreign selected-job hint stays unselected and cannot enable a fallback', async () => {
  const f = await fixture();
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const html = renderToStaticMarkup(
    createElement(RetentionReviewGuide, {
      sources: f.sources,
      enabled: true,
      selectedJobId: 'foreign-job',
    }),
  );
  expect(html).toContain(
    'No exact authorized job selected. No fallback selection.',
  );
  expect(html).toContain(
    '<button disabled="">Inspect retention planning sources',
  );
});
