import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { readOperatingSelection } from '../src/lib/workflows/operating-selection';
import {
  readDailyWorkContext,
  assertDailyWorkContextNow,
  continueDailyWorkContext,
  reconcileDailyWorkContext,
  readNextDailyWorkContext,
} from '../src/lib/workflows/daily-workbench-runtime';
import {
  readFieldAgenda,
  inspectFieldAgendaJob,
  assertFieldAgendaNow,
  continueFieldAgenda,
} from '../src/lib/workflows/field-agenda';
import {
  readCostInvoiceReview,
  openCostInvoiceReview,
  focusCostInvoiceReview,
  continueCostInvoiceReview,
  assertCostInvoiceReviewCurrent,
} from '../src/lib/workflows/cost-invoice-review';
import {
  readServiceUpdateReview,
  inspectServiceUpdateReport,
  continueServiceUpdateReview,
  assertServiceUpdateCurrent,
} from '../src/lib/workflows/service-update-review';
import {
  readMaintenanceAgenda,
  continueMaintenanceAgenda,
  assertMaintenanceAgendaNow,
} from '../src/lib/workflows/maintenance-agenda';
import {
  readPriorityActions,
  inspectPriorityAction,
  filterPriorityActions,
  continuePriorityAction,
  assertPriorityActionsCurrent,
  priorityOriginalProps,
} from '../src/lib/workflows/priority-actions';
import {
  readOwnerActionDesk,
  assertOwnerActionDeskReviewCurrent,
  openOwnerActionDeskTask,
  assertOwnerActionDeskTaskCurrent,
} from '../src/lib/workflows/owner-action-desk';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import type { DailyWorkbenchProps } from '../src/lib/workflows/daily-workbench-contract';
import { DailyWorkbench } from '../src/components/workflows/DailyWorkbench';
import { FieldAgenda } from '../src/components/workflows/FieldAgenda';
import { CostInvoiceReview } from '../src/components/workflows/CostInvoiceReview';
import { ServiceUpdateReview } from '../src/components/workflows/ServiceUpdateReview';
import { MaintenanceAgenda } from '../src/components/workflows/MaintenanceAgenda';
import { PriorityActions } from '../src/components/workflows/PriorityActions';

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
async function fixture(brand = 0, index = 2) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[index];
  return { gate, sources, entry };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Continue = NonNullable<DailyWorkbenchProps['onContinue']>;
function maintenance(f: Fixture): FollowUpReadinessInput {
  return {
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
    job_id: f.entry.target.job_id!,
    customer_id: '',
    location_id: '',
    purpose: 'recurring_maintenance',
    channel_state: 'all',
  };
}
function snapshot(f: Fixture) {
  return JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    records: f.sources.entries.map((e) => ({
      source: f.sources.estimates.readSyntheticPrototypeSources(e.target),
      staff: e.release.read('staff'),
      customer: e.release.read('customer'),
    })),
  });
}
function observeEffects(f: Fixture) {
  const original = snapshot(f),
    commands = [
      vi.spyOn(f.sources.estimates, 'create'),
      vi.spyOn(f.sources.estimates, 'save'),
      vi.spyOn(f.sources.estimates, 'issue'),
      vi.spyOn(f.sources.estimates, 'approveJob'),
      vi.spyOn(f.sources.estimates, 'assignJob'),
      vi.spyOn(f.sources.estimates, 'recordTime'),
      vi.spyOn(f.sources.estimates, 'submitExpense'),
      vi.spyOn(f.sources.property, 'savePlan'),
      vi.spyOn(f.sources.property, 'saveVisit'),
      vi.spyOn(f.sources.property, 'publish'),
      vi.spyOn(f.sources.operations, 'recordConsent'),
      ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
    ],
    network = vi.spyOn(globalThis, 'fetch'),
    ids = vi.spyOn(crypto, 'randomUUID');
  return () => {
    expect(snapshot(f)).toBe(original);
    commands.forEach((c) => expect(c).not.toHaveBeenCalled());
    expect(network).not.toHaveBeenCalled();
    expect(ids).not.toHaveBeenCalled();
  };
}
const kinds = [
  'root',
  'field',
  'finance',
  'customer',
  'growth',
  'priority',
] as const;
type Kind = (typeof kinds)[number];
/** Independent adapter over public functions only. No private outcome-map reads,
 * fresh identifiers, engine substitution or source implementation monkeypatch. */
async function navigation(kind: Kind, f: Fixture) {
  const id = f.entry.target.job_id!;
  let present = true;
  const lease: { current: Continue | undefined; generation: number } = {
    current: undefined,
    generation: 1,
  };
  const withdraw = () => {
    present = false;
    lease.current = undefined;
    lease.generation++;
  };
  const restore = () => {
    present = true;
  };
  switch (kind) {
    case 'root': {
      const v = await readDailyWorkContext(f.sources, id, f.gate);
      return {
        value: v,
        withdraw,
        restore,
        check: () => assertDailyWorkContextNow(v),
        invoke: (callback: Continue) => {
          const fn = () => callback(id, 'field');
          return continueDailyWorkContext(v, 'field', fn, () =>
            present ? fn : undefined,
          );
        },
      };
    }
    case 'field': {
      const v = await readFieldAgenda(f.sources, f.gate);
      return {
        value: v,
        withdraw,
        restore,
        check: () => assertFieldAgendaNow(v),
        invoke: (callback: Continue) =>
          continueFieldAgenda(v, id, callback, () => present),
      };
    }
    case 'finance': {
      const review = await readCostInvoiceReview(
          f.sources,
          { as_of: new Date().toISOString(), input_revision: 1 },
          f.gate,
        ),
        v = openCostInvoiceReview(review, id, id);
      return {
        value: v,
        withdraw,
        restore,
        check: () => assertCostInvoiceReviewCurrent(v, id),
        invoke: (callback: Continue) => {
          const expected = { current: callback, generation: lease.generation };
          lease.current = present ? callback : undefined;
          return Promise.resolve(
            continueCostInvoiceReview(v, 'customer', expected, lease, id),
          );
        },
      };
    }
    case 'customer': {
      const v = await readServiceUpdateReview(
          f.sources,
          { job_id: id, staff_context_confirmed: true },
          f.gate,
        ),
        ref = v.evidence.find(
          (e) => e.reference.report_id === f.entry.report_id,
        )!.reference,
        report = await inspectServiceUpdateReport(v, ref);
      return {
        value: v,
        withdraw,
        restore,
        check: () => assertServiceUpdateCurrent(v),
        invoke: (callback: Continue) => {
          lease.current = present ? callback : undefined;
          return continueServiceUpdateReview(v, report, callback, lease);
        },
      };
    }
    case 'growth': {
      const v = await readMaintenanceAgenda(f.sources, maintenance(f), f.gate),
        row = v.rows.find((r) => r.context.job_id === id)!;
      expect(row).toBeDefined();
      return {
        value: v,
        withdraw,
        restore,
        check: () => assertMaintenanceAgendaNow(v),
        invoke: (callback: Continue) =>
          continueMaintenanceAgenda(v, row.key, callback, () => present),
      };
    }
    case 'priority': {
      const v = await readPriorityActions(f.sources, { job_id: id }, f.gate),
        row = filterPriorityActions(v, {
          area: 'all',
          level: 'all',
          job_id: id,
          query: '',
          band: 'all',
        }).cards.find((r) => r.source.kind === 'report')!,
        task = await inspectPriorityAction(v, row.key);
      return {
        value: v,
        withdraw,
        restore,
        check: () => assertPriorityActionsCurrent(v),
        invoke: (callback: Continue) => {
          lease.current = present ? callback : undefined;
          return continuePriorityAction(v, task, callback, lease);
        },
      };
    }
  }
}

// Two bounded phases preserve one actual canonical environment and original
// retained views per brand. The second never rebuilds or reselects the sources.
// Both phases independently observe every business/network/identity writer.
async function prepareDailyReviewSources(brand: number) {
  const f = await fixture(brand, 0),
    canonicalBefore = snapshot(f),
    end = observeEffects(f),
    id = f.entry.target.job_id!,
    context = await readDailyWorkContext(f.sources, id, f.gate),
    transitions: string[] = [],
    host: Continue = (job, step) => {
      assertDailyWorkContextNow(context);
      expect(job).toBe(id);
      transitions.push(step);
    },
    field = await readFieldAgenda(f.sources, f.gate),
    fieldRow = (await inspectFieldAgendaJob(field, id)).row,
    finance = await readCostInvoiceReview(
      f.sources,
      { as_of: new Date().toISOString(), input_revision: 1 },
      f.gate,
    ),
    financeSelection = openCostInvoiceReview(finance, id, id),
    invoice = focusCostInvoiceReview(
      financeSelection,
      { focus: 'invoice', query: '', status: 'all' },
      id,
    ),
    service = await readServiceUpdateReview(
      f.sources,
      { job_id: id, staff_context_confirmed: true },
      f.gate,
    ),
    report = await inspectServiceUpdateReport(
      service,
      service.evidence.find((e) => e.reference.report_id === f.entry.report_id)!
        .reference,
    ),
    growth = await readMaintenanceAgenda(f.sources, maintenance(f), f.gate),
    occurrence = growth.rows.find((r) => r.context.job_id === id)!,
    priority = await readPriorityActions(f.sources, { job_id: id }, f.gate),
    card = filterPriorityActions(priority, {
      area: 'all',
      level: 'all',
      job_id: id,
      query: '',
      band: 'all',
    }).cards.find((c) => c.source.kind === 'report')!,
    task = await inspectPriorityAction(priority, card.key);
  return {
    f,
    canonicalBefore,
    end,
    id,
    context,
    transitions,
    host,
    field,
    fieldRow,
    financeSelection,
    invoice,
    service,
    report,
    growth,
    occurrence,
    priority,
    task,
  };
}
for (const brand of [0, 1, 2]) {
  let retained:
    Awaited<ReturnType<typeof prepareDailyReviewSources>> | undefined;
  it(`brand ${brand}: five-package source evidence binds one exact canonical daily environment`, async () => {
    retained = await prepareDailyReviewSources(brand);
    const {
      f,
      context,
      fieldRow,
      invoice,
      service,
      report,
      occurrence,
      task,
      growth,
      end,
    } = retained;
    for (const source of [
      fieldRow.source,
      invoice.anchor.target,
      service,
      occurrence.context,
      task.target,
    ]) {
      expect(source.organization_id).toBe(context.organization_id);
      expect(source.customer_id).toBe(context.customer_id);
      expect(source.location_id).toBe(context.location_id);
      expect(source.job_id).toBe(context.job_id);
    }
    expect(fieldRow.source.issued_version_id).toBe(context.issued_version_id);
    expect(invoice.anchor.target.version_id).toBe(context.issued_version_id);
    expect(service.issued_version_id).toBe(context.issued_version_id);
    expect(report.reference.published_version).toBe(f.entry.published_version);
    expect(report.reference.report_id).toBe(f.entry.report_id);
    expect(fieldRow.actual_availability).toBe('UNKNOWN');
    expect(service.physical_completion).toBe('UNKNOWN');
    expect(service.delivery).toBe('NOT_SENT');
    expect(growth.blockers.send).toBe('BLOCKED');
    expect(invoice.invoice.overall).toBe('NO_GO');
    const canonical = f.sources.estimates.readSyntheticPrototypeSources(
      f.entry.target,
    ).bundle.version.calculation;
    expect(invoice.invoice.scope.totals).toEqual({
      subtotal_minor: canonical.subtotal_minor,
      discount_minor: canonical.discount_minor,
      tax_minor: canonical.tax_minor,
      total_minor: canonical.total_minor,
    });
    end();
  });
  it(`brand ${brand}: retained daily sources continue through every review and exact Next without reset`, async () => {
    expect(retained).toBeDefined();
    const {
      f,
      canonicalBefore,
      id,
      context,
      transitions,
      host,
      field,
      financeSelection,
      service,
      report,
      growth,
      occurrence,
      priority,
      task,
    } = retained!;
    expect(snapshot(f)).toBe(canonicalBefore);
    const end = observeEffects(f);
    await continueFieldAgenda(field, id, host);
    const lease = { current: host, generation: 1 };
    expect(
      continueCostInvoiceReview(financeSelection, 'invoice', lease, lease, id)
        .status,
    ).toBe('EXACT_DAILY_FINANCE_CONTINUATION_REQUESTED');
    expect(
      continueCostInvoiceReview(financeSelection, 'customer', lease, lease, id)
        .status,
    ).toBe('EXACT_DAILY_FINANCE_CONTINUATION_REQUESTED');
    await continueServiceUpdateReview(service, report, host, lease);
    await continueMaintenanceAgenda(growth, occurrence.key, host);
    await continuePriorityAction(priority, task, host, lease);
    expect(transitions).toEqual([
      'finance',
      'invoice',
      'customer',
      'maintenance',
      'priorities',
      'customer',
    ]);
    const next = await readNextDailyWorkContext(context),
      ordered = await readOperatingSelection(
        f.sources,
        { query: '', page: 0, page_size: 10 },
        f.gate,
      ),
      index = ordered.rows.findIndex((row) => row.job_id === id);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(next).not.toBeNull();
    expect(next!.job_id).toBe(ordered.rows[index + 1].job_id);
    expect(next!.job_id).not.toBe(id);
    expect(next!.organization_id).toBe(context.organization_id);
    expect(JSON.stringify({ service, report })).not.toMatch(
      /unit_cost_minor|internal_notes|cash_minor|burden_minor|PRIVATE staff|@example|5550100100/,
    );
    end();
    expect(snapshot(f)).toBe(canonicalBefore);
  });
}

it('the priority queue leaves original finite owner-control source custody unclaimed and never renews its deadline', async () => {
  const f = await fixture(),
    view = await readPriorityActions(
      f.sources,
      { job_id: f.entry.target.job_id! },
      f.gate,
    ),
    filtered = filterPriorityActions(view, {
      area: 'all',
      level: 'all',
      job_id: f.entry.target.job_id!,
      query: '',
      band: 'all',
    }),
    task = await inspectPriorityAction(
      view,
      filtered.cards.find((r) => r.source.kind === 'report')!.key,
    ),
    props = priorityOriginalProps(view, task.target.job_id!),
    input = {
      review_on: f.entry.day,
      timezone: f.entry.timezone,
      ordering: 'EVIDENCE_FIRST' as const,
      input_revision: 1,
    },
    original = await readOwnerActionDesk(props.sources, input, f.gate);
  expect(props.sources.operations).toBe(f.sources.operations);
  expect(props.sources.estimates).toBe(f.sources.estimates);
  expect(props.sources.property).toBe(f.sources.property);
  expect(props.sources.entries).toEqual([f.entry]);
  assertOwnerActionDeskReviewCurrent(original);
  const originalTask = original.tasks.find(
      (t) => t.job_id === f.entry.target.job_id && t.source.kind === 'report',
    )!,
    controls = await openOwnerActionDeskTask(
      original,
      originalTask.key,
      f.entry.target.job_id!,
    ),
    expiry = controls.expires_at,
    inspectedAt = controls.inspected_at;
  expect(
    await inspectPriorityAction(
      view,
      filtered.cards.find((r) => r.source.kind === 'report')!.key,
    ),
  ).toBe(task);
  assertOwnerActionDeskTaskCurrent(controls, f.entry.target.job_id!);
  expect(controls.expires_at).toBe(expiry);
  expect(controls.inspected_at).toBe(inspectedAt);
  await expect(
    readOwnerActionDesk({ ...props.sources }, input, f.gate),
  ).rejects.toThrow();
  assertPriorityActionsCurrent(view);
});

for (const kind of kinds) {
  it(`${kind}: observing wrong-property source mutation makes the retained view terminal even after restoration`, async () => {
    const f = await fixture(),
      v = await navigation(kind, f),
      target = f.entry.target as { location_id: string },
      old = target.location_id;
    target.location_id = f.sources.entries[1].target.location_id;
    expect(() => v.check()).toThrow();
    target.location_id = old;
    expect(() => v.check()).toThrow();
  });
  it(`${kind}: observed inactive staff cannot restore a retained current view`, async () => {
    const f = await fixture(1),
      v = await navigation(kind, f),
      original = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      revoke = vi
        .spyOn(f.sources.operations, 'syntheticMemberships')
        .mockImplementation((org) =>
          original(org).map((m) => ({ ...m, active: false })),
        );
    expect(() => v.check()).toThrow();
    revoke.mockRestore();
    expect(() => v.check()).toThrow();
  });
}

for (const kind of kinds) {
  for (const drift of ['callback lease', 'source admission'] as const) {
    it(`${kind}: invoked ${drift} drift is UNKNOWN across fresh same-canonical wrappers without replay`, async () => {
      const f = await fixture(2),
        original = await navigation(kind, f),
        before = JSON.stringify(original.value),
        callback = vi.fn(async () => {
          if (drift === 'callback lease') original.withdraw();
          else f.gate.confirmed = false;
          await Promise.resolve();
        });
      let result: unknown, failure: unknown;
      try {
        result = await original.invoke(callback);
      } catch (error) {
        failure = error;
      }
      if (kind === 'root' || kind === 'finance')
        expect(result).toMatchObject({ status: 'UNKNOWN' });
      else expect(failure).toBeInstanceOf(Error);
      expect(callback).toHaveBeenCalledTimes(1);
      f.gate.confirmed = true;
      original.restore();
      const second = vi.fn();
      let freshFailure: unknown, freshResult: unknown;
      try {
        const fresh = await navigation(kind, {
          ...f,
          sources: { ...f.sources, entries: [...f.sources.entries] },
        });
        freshResult = await fresh.invoke(second);
      } catch (error) {
        freshFailure = error;
      }
      expect(second).not.toHaveBeenCalled();
      if (kind === 'root' || kind === 'finance')
        expect(freshResult).toMatchObject({ status: 'UNKNOWN' });
      else expect(freshFailure).toBeInstanceOf(Error);
      expect(JSON.stringify(original.value)).toBe(before);
    });
  }
  it(`${kind}: known callback withdrawal before invocation preserves exact source review but invokes no host`, async () => {
    const f = await fixture(),
      original = await navigation(kind, f),
      callback = vi.fn();
    original.withdraw();
    try {
      await original.invoke(callback);
    } catch (error) {
      expect(String(error)).toMatch(/withdrawn|replaced/i);
    }
    expect(callback).not.toHaveBeenCalled();
    original.check();
    original.restore();
    await original.invoke(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it(`${kind}: foreign company replacement never revives retained data after restoration`, async () => {
    const f = await fixture(),
      original = await navigation(kind, f),
      company = f.sources.company;
    f.sources.company = sampleCompanies[1];
    expect(() => original.check()).toThrow();
    f.sources.company = company;
    expect(() => original.check()).toThrow();
  });
}

it.each([
  ['Root', DailyWorkbench],
  ['Field', FieldAgenda],
  ['Finance', CostInvoiceReview],
  ['Customer', ServiceUpdateReview],
  ['Growth', MaintenanceAgenda],
  ['Priority', PriorityActions],
] as const)(
  '%s presentation is OFF before untrusted source getters and never exposes a source identity',
  (_name, Component) => {
    const getter = vi.fn(() => {
        throw Error('Untrusted source getter');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources,
      html = renderToStaticMarkup(
        createElement(Component as ComponentType<DailyWorkbenchProps>, {
          sources,
        }),
      );
    expect(getter).not.toHaveBeenCalled();
    expect(html).toMatch(/off|OFF|unavailable|UNKNOWN/);
    expect(html).not.toContain('Untrusted source getter');
  },
);

it('root lost acknowledgment remains UNKNOWN across a fresh source wrapper, exact reconciliation and destination changes', async () => {
  const f = await fixture(),
    context = await readDailyWorkContext(
      f.sources,
      f.entry.target.job_id!,
      f.gate,
    ),
    first = vi.fn(async () => {
      throw Error('Host changed; ACK lost');
    }),
    second = vi.fn();
  expect((await continueDailyWorkContext(context, 'field', first)).status).toBe(
    'UNKNOWN',
  );
  const reread = await readDailyWorkContext(
    { ...f.sources, entries: [...f.sources.entries] },
    context.job_id,
    f.gate,
  );
  expect(
    (await continueDailyWorkContext(reread, 'invoice', second)).status,
  ).toBe('UNKNOWN');
  expect((await reconcileDailyWorkContext(context)).status).toBe('UNKNOWN');
  expect(second).not.toHaveBeenCalled();
  expect(first).toHaveBeenCalledTimes(1);
});

it('root known pre-invocation callback withdrawal is not an ambiguous dispatched outcome', async () => {
  const f = await fixture(),
    context = await readDailyWorkContext(
      f.sources,
      f.entry.target.job_id!,
      f.gate,
    ),
    callback = vi.fn();
  expect(
    (
      await continueDailyWorkContext(
        context,
        'finance',
        callback,
        () => undefined,
      )
    ).status,
  ).toBe('WITHHELD_NO_DISPATCH');
  expect(callback).not.toHaveBeenCalled();
  expect((await reconcileDailyWorkContext(context)).status).toBe(
    'CURRENT_REVIEW_ONLY',
  );
  expect(
    (await continueDailyWorkContext(context, 'finance', callback)).status,
  ).toBe('CURRENT_REVIEW_ONLY');
  expect(callback).toHaveBeenCalledTimes(1);
});

it('root post-invocation source and live callback drift is UNKNOWN rather than a successful saved workflow', async () => {
  const f = await fixture(),
    context = await readDailyWorkContext(
      f.sources,
      f.entry.target.job_id!,
      f.gate,
    );
  let live: unknown;
  const callback = vi.fn(async () => {
    live = undefined;
    f.gate.confirmed = false;
    await Promise.resolve();
  });
  live = callback;
  expect(
    (await continueDailyWorkContext(context, 'customer', callback, () => live))
      .status,
  ).toBe('UNKNOWN');
  f.gate.confirmed = true;
  const fresh = await readDailyWorkContext(
      { ...f.sources },
      context.job_id,
      f.gate,
    ),
    again = vi.fn();
  expect(
    (await continueDailyWorkContext(fresh, 'maintenance', again)).status,
  ).toBe('UNKNOWN');
  expect(again).not.toHaveBeenCalled();
});

for (const kind of kinds) {
  it(`${kind}: competing fresh views of the same canonical job dispatch at most one callback`, async () => {
    const f = await fixture(),
      first = await navigation(kind, f),
      second = await navigation(kind, {
        ...f,
        sources: { ...f.sources, entries: [...f.sources.entries] },
      });
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      }),
      original = vi.fn(() => {
        entered();
        return wait;
      }),
      competing = vi.fn();
    const one = first.invoke(original);
    await started;
    try {
      await second.invoke(competing);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
    release();
    await one;
    expect(original).toHaveBeenCalledTimes(1);
    expect(competing).not.toHaveBeenCalled();
  });
}
