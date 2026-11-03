import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import type { CrewAssignmentInput } from '../src/lib/workflows/crew-assignment-lab';
import {
  beginScheduleWorkOrderContinuity,
  prepareScheduleWorkOrderInstructions,
  assertScheduleWorkOrderContinuityNow,
  reconcileScheduleWorkOrderContinuity,
  closeScheduleWorkOrderContinuity,
  openScheduleWorkOrderContinuitySource,
} from '../src/lib/workflows/schedule-work-order-continuity';
import {
  readFinanceCaseContinuity,
  inspectFinanceCaseSource,
  assertFinanceCaseSelectionCurrent,
  financialCaseSourceItems,
  compareFinanceCaseSelection,
  navigateFinanceCaseSelection,
} from '../src/lib/workflows/finance-case-continuity';
import { openFinancialCaseworkJob } from '../src/lib/workflows/financial-casework';
import {
  readServiceSourceContinuity,
  assertServiceSourceContinuityCurrentNow,
  openServiceSourceReport,
  openServiceSourceFinding,
  inspectServiceSourceContinuity,
  selectServiceSourceJob,
} from '../src/lib/workflows/service-source-continuity';
import {
  readMaintenancePlanningContinuity,
  selectMaintenancePlanningSource,
  prepareMaintenancePlanningContinuity,
  assertMaintenancePlanningContinuityNow,
  reconcileMaintenancePlanningContinuity,
  closeMaintenancePlanningContinuity,
  openMaintenancePlanningContinuitySource,
} from '../src/lib/workflows/maintenance-planning-continuity';
import {
  readVerifiedTaskHandoff,
  inspectVerifiedTaskHandoff,
  assertVerifiedTaskHandoffCurrent,
  navigateVerifiedTaskHandoff,
  reconcileVerifiedTaskHandoff,
} from '../src/lib/workflows/verified-task-handoff';
import {
  readAddonReviewDesk,
  inspectAddonReviewSource,
} from '../src/lib/workflows/addon-review-desk';
import {
  readSourceBoundAddons,
  assertSourceBoundAddonsCurrentNow,
  reviewSourceBoundAddons,
  prepareSourceBoundAddons,
  sourceBoundAddonsState,
  inspectSourceBoundAddons,
  cancelSourceBoundAddons,
  revokeSourceBoundAddons,
  selectSourceBoundAddonJob,
} from '../src/lib/workflows/source-bound-addons';
import type { FollowUpReadinessInput } from '../src/lib/workflows/follow-up-readiness';
import { advancedHandoffKinds } from '../src/lib/workflows/advanced-handoffs';
import { verifyLedger } from '../src/domain/release/types';

// Expected identities and state originate in the real OperatingSources repositories.
// No package-specific source fixture, second store or operational authority is used.
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
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0];
  const original: CrewAssignmentInput = {
    week_start: entry.day,
    timezone: entry.timezone,
    proposal: {
      job_id: entry.target.job_id!,
      day: entry.day,
      source_visit_id: entry.scheduled_visit_id,
      worker_id: entry.worker_id,
      start: entry.day + 'T09:00',
      end: entry.day + 'T11:00',
      hours_start: entry.day + 'T08:00',
      hours_end: entry.day + 'T16:00',
    },
  };
  const growth: FollowUpReadinessInput = {
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
    job_id: '',
    customer_id: '',
    location_id: '',
    purpose: 'service_follow_up',
    channel_state: 'all',
  };
  return {
    sources,
    gate,
    entry,
    field: {
      original,
      proposed: {
        ...original,
        proposal: {
          ...original.proposal,
          start: entry.day + 'T12:00',
          end: entry.day + 'T14:00',
        },
      },
      expected_revision: 0,
      expires_at: Date.now() + 60_000,
    },
    finance: { as_of: new Date().toISOString(), input_revision: 1 },
    customer: { job_id: entry.target.job_id! },
    growth,
    intelligence: {
      review_on: entry.day,
      timezone: entry.timezone,
      input_revision: 1,
      ordering: 'EVIDENCE_FIRST' as const,
    },
    advanced: {
      query: '',
      job_id: entry.target.job_id!,
      kind: 'offline' as const,
      edition: 'property_services' as const,
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const instructions = {
  instructions:
    'Staff proposes an access sequence; no issued scope, repair or work authority changes.',
};
const reads = {
  field: (f: Fixture) =>
    beginScheduleWorkOrderContinuity(f.sources, f.field, f.gate),
  finance: (f: Fixture) =>
    readFinanceCaseContinuity(f.sources, f.finance, f.gate),
  customer: (f: Fixture) =>
    readServiceSourceContinuity(f.sources, f.customer, f.gate),
  growth: (f: Fixture) =>
    readMaintenancePlanningContinuity(f.sources, f.growth, f.gate),
  intelligence: (f: Fixture) =>
    readVerifiedTaskHandoff(f.sources, f.intelligence, f.gate),
  advanced: async (f: Fixture) => {
    const desk = await readAddonReviewDesk(f.sources, f.advanced, f.gate),
      selection = await inspectAddonReviewSource(desk, desk.rows[0].reference);
    return readSourceBoundAddons(f.sources, selection, f.gate);
  },
};
const kinds = Object.keys(reads) as (keyof typeof reads)[];
function snapshot(f: Fixture) {
  return JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    sources: f.sources.entries.map((entry) => ({
      canonical: f.sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ),
      release: entry.release.read('staff'),
    })),
  });
}
async function context(f: Fixture) {
  const [field, finance, customer, growth, intelligence, advanced] =
    await Promise.all([
      reads.field(f),
      reads.finance(f),
      reads.customer(f),
      reads.growth(f),
      reads.intelligence(f),
      reads.advanced(f),
    ]);
  const financeDetail = openFinancialCaseworkJob(
      finance,
      f.entry.target.job_id!,
    ),
    item = financialCaseSourceItems(financeDetail).find(
      (s) => s.kind === 'requirement',
    )!,
    financeSelection = inspectFinanceCaseSource(
      finance,
      f.entry.target.job_id!,
      { kind: item.kind, id: item.id },
    ),
    row = growth.rows.find((r) => r.context.job_id === f.entry.target.job_id)!,
    maintenance = await selectMaintenancePlanningSource(
      growth,
      row.key,
      f.gate,
    ),
    task = intelligence.tasks.find(
      (t) => t.job_id === f.entry.target.job_id && t.source.kind === 'report',
    )!,
    handoff = await inspectVerifiedTaskHandoff(intelligence, task.key);
  return {
    field,
    finance,
    financeDetail,
    financeSelection,
    customer,
    growth,
    row,
    maintenance,
    intelligence,
    task,
    handoff,
    advanced,
  };
}
type Context = Awaited<ReturnType<typeof context>>;
function deny(c: Context) {
  [
    () => assertScheduleWorkOrderContinuityNow(c.field),
    () => assertFinanceCaseSelectionCurrent(c.financeSelection),
    () => assertServiceSourceContinuityCurrentNow(c.customer),
    () => assertMaintenancePlanningContinuityNow(c.maintenance),
    () => assertVerifiedTaskHandoffCurrent(c.handoff),
    () => assertSourceBoundAddonsCurrentNow(c.advanced),
  ].forEach((check) => expect(check).toThrow());
}
function pinConfirmation(
  read: Awaited<ReturnType<typeof reads.advanced>>,
  label = 'independent-cycle14',
) {
  return {
    confirmed: true,
    reviewed_source_sha256: read.integrity.sha256,
    external_reference: label,
    review_expires_at_ms: 2000,
  };
}

// Complete six-workflow cases use finite 90s test headroom. No default/product clock,
// deadline, custody, native wait, assertion or prior test suite is changed.
it.each([0, 1, 2])(
  'brand %i preserves one exact job through six explicit source-bound workflows without business side effects',
  async (brand) => {
    const f = await fixture(brand),
      before = snapshot(f),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'revise'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'projection'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const c = await context(f),
      prepared = await prepareScheduleWorkOrderInstructions(
        c.field,
        { ...instructions },
        f.gate,
      );
    expect(prepared.predecessor.revision).toBe(c.field.schedule.revision);
    expect(prepared.order.revision).toBe(c.field.schedule.revision + 1);
    expect(prepared.order.instructions).toBe(instructions.instructions);
    expect(prepared.order.original).toEqual(c.field.schedule.original);
    expect(prepared.order.proposed).toEqual(c.field.schedule.proposed);
    expect(prepared.order.durable_receipt).toBe('UNKNOWN');
    expect((await openScheduleWorkOrderContinuitySource(prepared)).job_id).toBe(
      f.entry.target.job_id,
    );
    expect((await reconcileScheduleWorkOrderContinuity(prepared)).status).toBe(
      'PREPARED_REVIEW_ONLY',
    );
    expect(c.financeSelection.target).toEqual(f.entry.target);
    expect(c.financeSelection.invoice_readiness).toBe('NO_GO');
    expect(c.financeSelection.item?.amount_minor).toBeNull();
    expect(c.financeDetail.job.financial.invoices).toEqual([]);
    const financeNavigate = vi.fn();
    expect(
      navigateFinanceCaseSelection(c.financeSelection, financeNavigate).status,
    ).toBe('LOCAL_FINANCE_REVIEW_REQUESTED');
    expect(financeNavigate).toHaveBeenCalledExactlyOnceWith(
      f.entry.target.job_id,
      'finance',
    );
    expect(c.customer.customer_safe.scope).toMatchObject({
      job_id: f.entry.target.job_id,
      estimate_id: f.entry.target.estimate_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(c.customer.staff_request.id).toBe(f.entry.intake_request_id);
    expect(c.customer.request_scope_relationship).toBe(
      'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK',
    );
    const documented = c.customer.customer_safe.documentation.find(
      (d) => d.report.reference.report_id === f.entry.report_id,
    )!;
    const report = await openServiceSourceReport(
        c.customer,
        documented.report.reference,
      ),
      finding = await openServiceSourceFinding(
        c.customer,
        report.observations[0].reference,
      );
    expect(report.reference.published_version).toBe(f.entry.published_version);
    expect(finding.finding.reference).toEqual(report.observations[0].reference);
    expect(selectServiceSourceJob(c.customer)).toBe(f.entry.target.job_id);
    expect(
      c.customer.customer_safe.required_proof.every(
        (p) => p.status === 'UNKNOWN',
      ),
    ).toBe(true);
    expect(JSON.stringify(c.customer.customer_safe)).not.toMatch(
      /unit_cost|margin|supplier|worker_id|actor_id|payroll|internal_notes|PRIVATE|@example/,
    );
    const maintenance = await prepareMaintenancePlanningContinuity(
      c.maintenance,
      { proposed_on: c.row.recorded_due_on, plan_kind: 'follow_up' },
      f.gate,
    );
    expect(maintenance.occurrence.context.job_id).toBe(f.entry.target.job_id);
    expect(maintenance.occurrence.plan_reference.id).toBe(f.entry.plan_id);
    expect(maintenance.operational_authority).toBe('BLOCKED');
    expect(maintenance.browser_writer).toBe('NOT_CONNECTED');
    expect(
      (await openMaintenancePlanningContinuitySource(maintenance)).job_id,
    ).toBe(f.entry.target.job_id);
    expect(c.handoff.target).toEqual(f.entry.target);
    expect(c.handoff.selected.source_id).toBe(f.entry.report_id);
    expect(c.handoff.selected.source_version).toBe(f.entry.published_version);
    const navigate = vi.fn();
    expect(navigateVerifiedTaskHandoff(c.handoff, navigate).status).toBe(
      'EXACT_LOCAL_TASK_REVIEW_REQUESTED',
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      f.entry.target.job_id,
      'completion',
    );
    expect(selectSourceBoundAddonJob(c.advanced)).toBe(f.entry.target.job_id);
    expect(c.advanced.source.issued_version_id).toBe(f.entry.target.version_id);
    expect(sourceBoundAddonsState(c.advanced).status).toBe(
      'PINNED_NOT_REVIEWED',
    );
    const reviewed = await reviewSourceBoundAddons(
        c.advanced,
        pinConfirmation(c.advanced),
        { now_ms: 1000 },
      ),
      packet = await prepareSourceBoundAddons(c.advanced, {
        confirmed: true,
        reviewed_lifecycle_sha256: reviewed.integrity.sha256,
      });
    expect(reviewed.comparison.source).toEqual(c.advanced.references.source);
    expect(reviewed.kind).toBe(c.advanced.source.kind);
    expect(
      packet.original_handoff.existing_handoff.requirements.source
        .issued_version_id,
    ).toBe(f.entry.target.version_id);
    expect(packet).toMatchObject({
      imported: false,
      synchronized: false,
      delivery: 'NOT_SENT',
      operational_ready: false,
    });
    expect((await inspectSourceBoundAddons(c.advanced)).status).toBe(
      'PREPARED',
    );
    expect(snapshot(f)).toBe(before);
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    expect(network).not.toHaveBeenCalled();
  },
  90_000,
);

it.each(kinds)(
  '%s rejects OFF admission before source getters',
  async (kind) => {
    const f = await fixture(),
      getter = vi.fn(() => {
        throw Error('source getter executed');
      });
    f.gate.enabled = false;
    f.sources = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources;
    await expect(reads[kind](f)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each(kinds)(
  '%s denies a foreign repository under otherwise current company labels',
  async (kind) => {
    const f = await fixture(),
      foreign = await fixture(1);
    f.sources.property = foreign.sources.property;
    await expect(reads[kind](f)).rejects.toThrow();
  },
);
it.each(kinds)(
  '%s fences the original root across an actual awaited hash',
  async (kind) => {
    const f = await fixture(),
      original = crypto.subtle.digest.bind(crypto.subtle);
    let fired = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await original(...args);
      if (!fired) {
        fired = true;
        f.sources.entries = [...f.sources.entries];
      }
      return value;
    });
    await expect(reads[kind](f)).rejects.toThrow();
    expect(fired).toBe(true);
  },
);
it('revoked current membership invalidates all six retained continuities and every exact navigation callback', async () => {
  const f = await fixture(),
    c = await context(f);
  await f.sources.operations.configure(
    f.sources.company.id,
    'active',
    'starter',
    {},
    f.sources.company.id + '-c14-backup-owner',
  );
  await f.sources.operations.revokeOwner(
    f.sources.company.id,
    f.entry.target.actor_id,
  );
  deny(c);
  const callback = vi.fn();
  expect(
    navigateFinanceCaseSelection(c.financeSelection, callback).status,
  ).toBe('UNKNOWN');
  expect(navigateVerifiedTaskHandoff(c.handoff, callback).status).toBe(
    'UNKNOWN',
  );
  expect(callback).not.toHaveBeenCalled();
  expect(inspectServiceSourceContinuity(c.customer).status).toBe('UNKNOWN');
  expect((await inspectSourceBoundAddons(c.advanced)).status).toBe('UNKNOWN');
}, 90_000);
it('gate withdrawal remains terminal after restoration rather than reviving six old continuities', async () => {
  const f = await fixture(),
    c = await context(f);
  f.gate.confirmed = false;
  deny(c);
  f.gate.confirmed = true;
  deny(c);
}, 90_000);
it('serialized copies cannot replace six opaque original handoff references', async () => {
  const f = await fixture(),
    c = await context(f);
  deny(structuredClone(c));
  expect(
    (await reconcileScheduleWorkOrderContinuity(structuredClone(c.field)))
      .status,
  ).toBe('UNKNOWN');
  expect(
    (await reconcileVerifiedTaskHandoff(structuredClone(c.handoff))).status,
  ).toBe('UNKNOWN');
  expect(assertScheduleWorkOrderContinuityNow(c.field)).toBe(
    'READY_FOR_WORK_ORDER',
  );
}, 90_000);
it.each(['CANCEL', 'REVOKE'] as const)(
  'Field %s preserves the original terminal series across relabelled instructions',
  async (action) => {
    const f = await fixture(),
      view = await reads.field(f),
      prepared = await prepareScheduleWorkOrderInstructions(
        view,
        { ...instructions },
        f.gate,
      );
    closeScheduleWorkOrderContinuity(prepared, action);
    expect((await reconcileScheduleWorkOrderContinuity(prepared)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    await expect(
      prepareScheduleWorkOrderInstructions(
        view,
        { instructions: 'A changed note cannot reopen the handoff.' },
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      beginScheduleWorkOrderContinuity(
        f.sources,
        { ...f.field, expected_revision: 2 },
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it('competing Field successors consume only one predecessor and preserve immutable issued scope', async () => {
  const f = await fixture(),
    view = await reads.field(f),
    before = snapshot(f),
    results = await Promise.allSettled([
      prepareScheduleWorkOrderInstructions(view, { ...instructions }, f.gate),
      prepareScheduleWorkOrderInstructions(
        view,
        { instructions: 'Competing access proposal, no execution.' },
        f.gate,
      ),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(snapshot(f)).toBe(before);
});
it.each(['expiry', 'rollback'] as const)(
  'Field %s is terminal and cannot renew the original reviewed proposal',
  async (kind) => {
    const f = await fixture(),
      view = await reads.field(f),
      real = Date.now();
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(kind === 'expiry' ? f.field.expires_at : real - 1000);
    expect(() => assertScheduleWorkOrderContinuityNow(view)).toThrow();
    clock.mockReturnValue(real);
    await expect(
      prepareScheduleWorkOrderInstructions(view, { ...instructions }, f.gate),
    ).rejects.toThrow();
    expect((await reconcileScheduleWorkOrderContinuity(view)).status).toMatch(
      /UNKNOWN|EXPIRED/,
    );
  },
);
it('same-property customer jobs keep distinct immutable scopes and exact report associations', async () => {
  const f = await fixture(),
    sibling = f.sources.entries[3];
  expect(sibling.target.location_id).toBe(f.entry.target.location_id);
  const a = await reads.customer(f),
    b = await readServiceSourceContinuity(
      f.sources,
      { job_id: sibling.target.job_id! },
      f.gate,
    );
  expect(a.customer_safe.scope.issued_version_id).toBe(
    f.entry.target.version_id,
  );
  expect(b.customer_safe.scope.issued_version_id).toBe(
    sibling.target.version_id,
  );
  expect(a.customer_safe.scope.issued_version_id).not.toBe(
    b.customer_safe.scope.issued_version_id,
  );
  expect(
    b.customer_safe.documentation
      .filter((d) => d.selected_job_association === 'EXACT_RECORDED_JOB_LINK')
      .map((d) => d.report.reference.report_id),
  ).toContain(sibling.report_id);
  const reference =
    a.customer_safe.documentation[0].report.observations[0].reference;
  await expect(
    openServiceSourceFinding(a, {
      ...reference,
      source_index: reference.source_index + 1000,
    }),
  ).rejects.toThrow();
  expect(inspectServiceSourceContinuity(a).status).toBe('UNKNOWN');
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'Growth %s survives another selection, purpose and proposed date',
  async (action) => {
    const f = await fixture(),
      view = await reads.growth(f),
      row = view.rows[0],
      selected = await selectMaintenancePlanningSource(view, row.key, f.gate),
      review = await prepareMaintenancePlanningContinuity(
        selected,
        { proposed_on: row.recorded_due_on, plan_kind: 'follow_up' },
        f.gate,
      );
    closeMaintenancePlanningContinuity(review, action);
    expect((await reconcileMaintenancePlanningContinuity(review)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
    const fresh = await readMaintenancePlanningContinuity(
        f.sources,
        { ...f.growth, purpose: 'marketing' },
        f.gate,
      ),
      other = await selectMaintenancePlanningSource(fresh, row.key, f.gate);
    await expect(
      prepareMaintenancePlanningContinuity(
        other,
        { proposed_on: row.recorded_due_on, plan_kind: 'renewal' },
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it('competing maintenance selections reserve one original occurrence before delegated requirements begin', async () => {
  const f = await fixture(),
    view = await reads.growth(f),
    row = view.rows[0],
    a = await selectMaintenancePlanningSource(view, row.key, f.gate),
    b = await selectMaintenancePlanningSource(view, row.key, f.gate),
    before = snapshot(f),
    results = await Promise.allSettled(
      [a, b].map((s) =>
        prepareMaintenancePlanningContinuity(
          s,
          { proposed_on: row.recorded_due_on, plan_kind: 'follow_up' },
          f.gate,
        ),
      ),
    );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(snapshot(f)).toBe(before);
});
it.each(['expiry', 'rollback'] as const)(
  'a verified task %s cannot refresh or navigate its old source association',
  async (kind) => {
    const f = await fixture(),
      review = await reads.intelligence(f),
      task = review.tasks.find((t) => t.source.kind === 'report')!,
      handoff = await inspectVerifiedTaskHandoff(review, task.key),
      real = Date.now(),
      callback = vi.fn(),
      clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(
          kind === 'expiry'
            ? Date.parse(handoff.expires_at)
            : Date.parse(handoff.inspected_at) - 1,
        );
    expect(navigateVerifiedTaskHandoff(handoff, callback).status).toBe(
      'UNKNOWN',
    );
    clock.mockReturnValue(real);
    expect((await reconcileVerifiedTaskHandoff(handoff)).status).toBe(
      'UNKNOWN',
    );
    await expect(
      inspectVerifiedTaskHandoff(review, task.key),
    ).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  },
);
it.each(['cancel', 'revoke'] as const)(
  'advanced %s stays in the unchanged original lifecycle through a fresh exact pin',
  async (action) => {
    const f = await fixture(),
      read = await reads.advanced(f),
      view = await reviewSourceBoundAddons(read, pinConfirmation(read), {
        now_ms: 1000,
      }),
      confirmation = {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      };
    (action === 'cancel' ? cancelSourceBoundAddons : revokeSourceBoundAddons)(
      read,
      confirmation,
    );
    expect(sourceBoundAddonsState(read).status).toBe(
      action === 'cancel' ? 'CANCELLED' : 'REVOKED',
    );
    const fresh = await reads.advanced(f);
    await expect(
      reviewSourceBoundAddons(
        fresh,
        pinConfirmation(fresh, 'new-label-cannot-reset'),
        { now_ms: 1000 },
      ),
    ).rejects.toThrow();
  },
);
it('advanced exact pin rejects a copied detail or a new root with the same underlying repositories', async () => {
  const f = await fixture(),
    desk = await readAddonReviewDesk(f.sources, f.advanced, f.gate),
    selection = await inspectAddonReviewSource(desk, desk.rows[0].reference);
  await expect(
    readSourceBoundAddons(f.sources, structuredClone(selection), f.gate),
  ).rejects.toThrow();
  await expect(
    readSourceBoundAddons({ ...f.sources }, selection, f.gate),
  ).rejects.toThrow('Same original');
  expect(
    selectSourceBoundAddonJob(
      await readSourceBoundAddons(f.sources, selection, f.gate),
    ),
  ).toBe(f.entry.target.job_id);
});
it.each(advancedHandoffKinds)(
  'advanced %s retains the once-selected job/mode/edition and exact source references',
  async (kind) => {
    const f = await fixture(),
      desk = await readAddonReviewDesk(
        f.sources,
        { ...f.advanced, kind },
        f.gate,
      ),
      selection = await inspectAddonReviewSource(desk, desk.rows[0].reference),
      pin = await readSourceBoundAddons(f.sources, selection, f.gate);
    expect(pin.source).toEqual(selection.reference);
    expect(pin.edition).toEqual(selection.edition);
    expect(pin.references).toEqual(selection.source_references);
    expect(pin.report).toEqual(selection.report);
    expect(pin.operational_ready).toBe(false);
    expect(sourceBoundAddonsState(pin).status).toBe('PINNED_NOT_REVIEWED');
  },
);
it('a canonical financial source drill-down preserves exact invoice/event/posting identity without lending it to a sibling job', async () => {
  const f = await fixture(),
    release = f.entry.release;
  // Actual original-engine, explicitly synthetic TEST commands only.
  await release.command('staff', 'create_contract', {
    offer_id: f.entry.offer_id,
    terms: 'Independent fixture.',
    legal_reference: 'Not genuine approval.',
  });
  const contract = release.read('staff').release_contracts[0];
  await release.command('customer', 'sign_contract', {
    contract_id: contract.id,
    document_hash: contract.document_hash,
    typed_name: 'Synthetic fixture',
    consent: true,
  });
  await release.command('staff', 'create_invoice', {
    contract_id: contract.id,
  });
  const invoice = release.read('staff').release_invoices[0],
    amount = invoice.snapshot.schedule[0].amount_minor;
  await release.command('customer', 'authorize_payment', {
    invoice_id: invoice.id,
    amount_minor: amount,
    consent: true,
  });
  const authorization = release.read('staff').release_authorizations[0];
  await release.command('staff', 'synthetic_capture', {
    invoice_id: invoice.id,
    authorization_id: authorization.id,
    amount_minor: amount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: null,
  });
  f.finance.as_of = new Date().toISOString();
  const source = release.read('staff'),
    before = snapshot(f),
    review = await reads.finance(f),
    detail = openFinancialCaseworkJob(review, f.entry.target.job_id!),
    items = financialCaseSourceItems(detail);
  expect(detail.job.financial.invoices[0].summary?.balance_minor).toBe(
    String(
      verifyLedger(
        invoice,
        source.release_ledger_entries,
        source.release_payment_events,
      ),
    ),
  );
  for (const id of [
    ...source.release_payment_events.map((r) => r.id),
    ...source.release_ledger_entries.map((r) => r.id),
  ]) {
    const item = items.find((r) => r.id === id)!;
    expect(item).toBeDefined();
    const selected = inspectFinanceCaseSource(review, f.entry.target.job_id!, {
      kind: item.kind,
      id,
    });
    expect(selected.status).toBe('EXACT_RECORDED_SOURCE');
    expect(selected.item?.invoice_id).toBe(invoice.id);
    const other = inspectFinanceCaseSource(
      review,
      f.sources.entries[3].target.job_id!,
      { kind: item.kind, id },
    );
    expect(other.status).toBe('UNKNOWN');
    expect(other.item).toBeNull();
    const callback = vi.fn();
    expect(navigateFinanceCaseSelection(other, callback).status).toBe(
      'UNKNOWN',
    );
    expect(callback).not.toHaveBeenCalled();
  }
  expect(snapshot(f)).toBe(before);
});
it('saved canonical revision drift withholds the selected finance source until explicit current reinspection', async () => {
  const f = await fixture(),
    read = await reads.finance(f),
    detail = openFinancialCaseworkJob(read, f.entry.target.job_id!),
    item = financialCaseSourceItems(detail)[0],
    selected = inspectFinanceCaseSource(read, f.entry.target.job_id!, {
      kind: item.kind,
      id: item.id,
    }),
    frozen = JSON.stringify(selected),
    raw = f.sources.estimates.readSyntheticPrototypeSources(
      f.entry.target,
    ).job!;
  await f.sources.estimates.projection(f.sources.company.id, raw, {
    ...raw.projection,
    remaining: {
      ...raw.projection.remaining,
      other: raw.projection.remaining.other + 11,
    },
  });
  const callback = vi.fn();
  expect(navigateFinanceCaseSelection(selected, callback).status).toBe(
    'UNKNOWN',
  );
  const current = await readFinanceCaseContinuity(
    f.sources,
    { ...f.finance, input_revision: 2 },
    f.gate,
  );
  expect(compareFinanceCaseSelection(selected, current).status).toBe(
    'SOURCE_CHANGED_REINSPECTION_REQUIRED',
  );
  expect(JSON.stringify(selected)).toBe(frozen);
  expect(callback).not.toHaveBeenCalled();
});
