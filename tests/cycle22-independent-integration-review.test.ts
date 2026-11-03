import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import type { OperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { resolveSavedWorkbenchSelection } from '../src/lib/workflows/saved-workbench-selection';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readTaskCustodyReview,
  inspectTaskCustodyReview,
  taskCustodyDestination,
} from '../src/lib/workflows/task-custody-review';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  readCostCoveragePath,
  assertCostCoveragePathCurrent,
  inspectCostCoverageSource,
  continueCostCoverageSource,
} from '../src/lib/workflows/cost-coverage-path';
import {
  readPropertyServiceContinuity,
  assertPropertyServiceContinuity,
  readPropertyServiceRequirements,
  readPropertyServiceVersionStatus,
  inspectPropertyServiceJob,
  handoffPropertyServiceJob,
  refreshPropertyServiceContinuity,
} from '../src/lib/workflows/property-service-continuity';
import {
  readMaintenancePlanCorrectionReview,
  saveMaintenancePlanCorrectionReview,
} from '../src/lib/workflows/maintenance-plan-correction';
import {
  readMaintenanceRequirementsReview,
  inspectMaintenanceRequirements,
} from '../src/lib/workflows/maintenance-requirements-review';
import {
  readCurrentOwnerPriorities,
  assertCurrentOwnerPriorities,
  inspectCurrentOwnerPriority,
  continueCurrentOwnerPriority,
} from '../src/lib/workflows/current-owner-priorities';
import { recordedOwnerActionCards } from '../src/lib/workflows/recorded-owner-actions';
import { TaskCustodyReview } from '../src/components/workflows/TaskCustodyReview';
import { CostCoveragePath } from '../src/components/workflows/CostCoveragePath';
import { PropertyServiceContinuity } from '../src/components/workflows/PropertyServiceContinuity';
import { MaintenanceRequirementsReview } from '../src/components/workflows/MaintenanceRequirementsReview';
import { CurrentOwnerPriorities } from '../src/components/workflows/CurrentOwnerPriorities';

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0, index = 0) {
  const gate = { enabled: true, confirmed: true };
  const sources = await prepareCorrectionPreviewSources(
    sampleCompanies[brand],
    gate,
  );
  const entry = sources.entries[index];
  return {
    sources,
    gate,
    entry,
    job: entry.target.job_id!,
    org: sources.company.id,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const readers = [
  ['field', readTaskCustodyReview],
  ['finance', readCostCoveragePath],
  ['customer', readPropertyServiceContinuity],
  ['growth', readMaintenanceRequirementsReview],
  ['intelligence', readCurrentOwnerPriorities],
] as const;
const components = [
  ['field', TaskCustodyReview],
  ['finance', CostCoveragePath],
  ['customer', PropertyServiceContinuity],
  ['growth', MaintenanceRequirementsReview],
  ['intelligence', CurrentOwnerPriorities],
] as const;
async function views(f: Fixture) {
  return {
    task: await readTaskCustodyReview(f.sources, f.job, f.gate),
    cost: await readCostCoveragePath(f.sources, f.job, f.gate),
    customer: await readPropertyServiceContinuity(f.sources, f.job, f.gate),
    growth: await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
    owner: await readCurrentOwnerPriorities(f.sources, f.job, f.gate),
  };
}
function revoke(f: Fixture) {
  const memberships = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  return vi
    .spyOn(f.sources.operations, 'syntheticMemberships')
    .mockImplementation((org) =>
      memberships(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
    );
}
function taskInput(t: Awaited<ReturnType<typeof readTaskCorrectionReview>>) {
  return {
    source_entry_id: t.source.source_entry_id,
    task: `${t.source.task}: independent Cycle22 correction`,
    started_at: t.source.started_at,
    ended_at: t.source.ended_at,
    billable: !t.source.billable,
  };
}
function noCustomerPrivateFields(value: unknown) {
  if (Array.isArray(value)) value.forEach(noCustomerPrivateFields);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(
        /^(internal_notes|staff_notes|unit_cost_minor|cost_minor|supplier|payroll|worker_id|actor_id|margin)$/i,
      );
      noCustomerPrivateFields(child);
    }
}

for (const brand of [0, 1, 2]) {
  for (const index of [0, 1, 2, 3]) {
    describe(
      `independent brand ${brand} actual job ${index} native journey`,
      { concurrent: false },
      () => {
        let f: Fixture;
        let originalReports: ReturnType<
          Fixture['sources']['property']['read']
        >['reports'];
        let originalRelease: ReturnType<Fixture['entry']['release']['read']>;
        let before: Awaited<ReturnType<typeof views>>;
        let afterCosts: Awaited<ReturnType<typeof readCostCoveragePath>>;
        let customerSnapshot: string;
        beforeAll(async () => {
          vi.stubGlobal('window', {
            location: { hostname: '127.0.0.1', protocol: 'http:' },
          });
          f = await fixture(brand, index);
          originalReports = f.sources.property.read(f.org).reports;
          originalRelease = f.entry.release.read('staff');
          before = await views(f);
          customerSnapshot = JSON.stringify(before.customer);
        });
        it('preserves originals while canonical task and material corrections feed cost and invoice requirements', async () => {
          expect(
            new Set(f.sources.entries.map((e) => e.target.job_id)).size,
          ).toBe(4);
          expect(f.sources.property.read(f.org).reports).toEqual(
            originalReports,
          );
          expect(f.entry.release.read('staff')).toEqual(originalRelease);
          expect(inspectTaskCustodyReview(before.task).status).toBe(
            'NOT_ATTEMPTED',
          );
          expect(before.cost.original.canonical).toEqual(
            jobFinancials(f.sources.estimates.syntheticJob(f.org, f.job)!),
          );
          expect(before.cost.invoice_status).toBe('NO_GO');
          expect(before.cost.coverage).not.toBe('DECLARED_COSTS_COMPLETE');
          expect(
            before.customer.jobs.every(
              (j) =>
                j.context.customer_id === f.entry.target.customer_id &&
                j.context.location_id === f.entry.target.location_id &&
                j.context.organization_id === f.org,
            ),
          ).toBe(true);
          noCustomerPrivateFields(before.customer);

          const correction = await readTaskCorrectionReview(
            f.sources,
            f.job,
            f.gate,
          );
          const workforceBefore = await f.sources.estimates.workforce(f.org);
          const original = workforceBefore.entries.find(
            (t) => t.id === correction.source.source_entry_id,
          )!;
          await saveTaskCorrectionReview(
            correction,
            taskInput(correction),
            true,
          );
          const task = inspectTaskCustodyReview(
            await readTaskCustodyReview(f.sources, f.job, f.gate),
          );
          const workforceAfter = await f.sources.estimates.workforce(f.org);
          expect(
            workforceAfter.entries.find((t) => t.id === original.id),
          ).toEqual(original);
          expect(
            workforceAfter.entries.filter((t) => t.corrects_id === original.id),
          ).toHaveLength(1);
          expect(task.status).toBe('KNOWN_SAVED');
          expect(task.receipt.source_id).toBe(original.id);
          expect(task.recorded).toMatchObject({
            id: task.receipt.result_id,
            corrects_id: original.id,
            job_id: f.job,
            worker_id: f.entry.worker_id,
          });
          expect(
            task.differences.find((d) => d.field === 'billable')?.comparison,
          ).toBe('CHANGED');
          expect(task.dispatch).toBe(false);
          expect(task.payroll).toBe(false);
          expect(() => taskCustodyDestination(before.task)).toThrow();

          const costs = await readCostCoveragePath(f.sources, f.job, f.gate);
          const expenseId = costs.original.material.expense_id!;
          const beforeCanonical = costs.original.canonical;
          await confirmCostCorrectionReview(
            costs.original,
            {
              expense_id: expenseId,
              decision: 'approved',
              reason: 'Independent exact pending material review',
            },
            true,
          );
          afterCosts = await readCostCoveragePath(f.sources, f.job, f.gate);
          const source = inspectCostCoverageSource(afterCosts, {
            kind: 'material',
            id: expenseId,
          });
          expect(source.status).toBe('approved');
          expect(source.references).toHaveLength(1);
          expect(
            afterCosts.rows.some(
              (r) =>
                r.kind === 'material_review' &&
                r.id === source.references[0] &&
                r.references[0] === expenseId,
            ),
          ).toBe(true);
          expect(afterCosts.original.canonical).toEqual(
            jobFinancials(f.sources.estimates.syntheticJob(f.org, f.job)!),
          );
          expect(
            afterCosts.original.canonical.categories.find(
              (c) => c.category === 'materials',
            )!.committed_remaining_minor -
              beforeCanonical.categories.find(
                (c) => c.category === 'materials',
              )!.committed_remaining_minor,
          ).toBe(2500);
          expect(afterCosts.invoice_status).toBe('NO_GO');
          expect(afterCosts.original.costs.evidence.facts.costs).toBeNull();
          expect(
            afterCosts.rows
              .filter((r) => r.kind === 'invoice_requirement')
              .map((r) => r.status),
          ).toEqual(
            afterCosts.original.costs.evidence.invoice.requirements.map(
              (r) => r.status,
            ),
          );
        });
        it('keeps subsequent plan, published completion and original ranked owner reviews on the same corrected source', async () => {
          expect(afterCosts).toBeDefined();
          const plan = await readMaintenancePlanCorrectionReview(
            f.sources,
            f.job,
            f.gate,
          );
          await saveMaintenancePlanCorrectionReview(
            plan,
            {
              plan_id: plan.source.plan_id,
              revision: plan.source.revision,
              name: 'Independent Cycle22 native plan',
              cadence: 'monthly',
              interval_days: 30,
            },
            true,
          );
          const growth = inspectMaintenanceRequirements(
            await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
          );
          const nativePlan = f.sources.property
            .read(f.org)
            .plans.find((p) => p.id === plan.source.plan_id)!;
          expect(growth.plan.revision).toBe(nativePlan.revision);
          expect(nativePlan.revision).toBe(plan.source.revision + 1);
          expect(growth.requirements).toMatchObject({
            purpose_consent: 'UNVERIFIED',
            suppression: 'UNVERIFIED',
            enrollment: 'UNVERIFIED',
            sender_authority: 'UNVERIFIED',
            source_atomicity: 'CAPTURED_NOT_ATOMIC',
          });
          expect(growth.authority.send).toBe(false);
          expect(growth.provider_request).toBeNull();

          assertPropertyServiceContinuity(before.customer);
          expect(JSON.stringify(before.customer)).toBe(customerSnapshot);
          const completion = await readPropertyServiceRequirements(
            before.customer,
            f.job,
          );
          expect(completion.job.reference.job_id).toBe(f.job);
          expect(completion.interpretation).toMatchObject({
            physical_completion: 'UNVERIFIED',
            customer_acceptance: 'UNVERIFIED',
            warranty: 'UNVERIFIED',
            repair_status: 'NOT_INFERRED',
            delivery: 'NOT_SENT',
            authority: 'DOCUMENTATION_ONLY',
          });
          noCustomerPrivateFields(completion);
          const owner = await readCurrentOwnerPriorities(
            f.sources,
            f.job,
            f.gate,
          );
          const originalCards = recordedOwnerActionCards(owner.original);
          expect(owner.rows.map((r) => [r.key, r.rank, r.source.id])).toEqual(
            originalCards.map((r) => [r.key, r.rank, r.source.id]),
          );
          expect(
            owner.rows
              .find((r) => r.state === 'RECORDED_FINANCE_REQUIREMENTS')
              ?.facts.join(' '),
          ).toContain(
            `Current job revision: ${afterCosts.original.costs.evidence.job_revision}`,
          );
          expect(owner.operational_ready).toBe(false);
          expect(f.sources.property.read(f.org).reports).toEqual(
            originalReports,
          );
          expect(f.entry.release.read('staff')).toEqual(originalRelease);
        });
      },
    );
  }

  it(`independent brand ${brand}: one same-property callback reaches the original checked selection and excludes another property`, async () => {
    const f = await fixture(brand);
    const customer = await readPropertyServiceContinuity(
      f.sources,
      f.job,
      f.gate,
    );
    const same = f.sources.entries.find(
      (e) =>
        e.target.job_id !== f.job &&
        e.target.customer_id === f.entry.target.customer_id &&
        e.target.location_id === f.entry.target.location_id,
    )!;
    const other = f.sources.entries.find(
      (e) => e.target.location_id !== f.entry.target.location_id,
    )!;
    const selected: unknown[] = [];
    const callback = vi.fn(
      (
        id: string,
        section?: Parameters<typeof resolveSavedWorkbenchSelection>[2],
      ) => {
        selected.push(resolveSavedWorkbenchSelection(f.sources, id, section));
      },
    );
    expect(
      handoffPropertyServiceJob(customer, same.target.job_id!, callback, {
        current: callback,
        generation: 0,
      }),
    ).toBe(same.target.job_id);
    expect(selected).toEqual([{ job_id: same.target.job_id, tab: 'customer' }]);
    expect(() =>
      handoffPropertyServiceJob(customer, other.target.job_id!, callback, {
        current: callback,
        generation: 0,
      }),
    ).toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    for (const section of ['__proto__', 'constructor', 'advanced'])
      expect(() =>
        resolveSavedWorkbenchSelection(f.sources, f.job, section as 'field'),
      ).toThrow();
  });

  it(`independent brand ${brand}: revocation denies every retained path and original customer UNKNOWN survives restored membership`, async () => {
    const f = await fixture(brand),
      before = await views(f),
      spy = revoke(f);
    expect(() => inspectTaskCustodyReview(before.task)).toThrow();
    expect(() => assertCostCoveragePathCurrent(before.cost)).toThrow();
    expect(() => assertPropertyServiceContinuity(before.customer)).toThrow();
    expect(() => inspectMaintenanceRequirements(before.growth)).toThrow();
    expect(() => assertCurrentOwnerPriorities(before.owner)).toThrow();
    expect(() =>
      resolveSavedWorkbenchSelection(f.sources, f.job, 'completion'),
    ).toThrow();
    spy.mockRestore();
    await expect(
      readPropertyServiceContinuity(f.sources, f.job, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
    expect(() => assertPropertyServiceContinuity(before.customer)).toThrow(
      /UNKNOWN/,
    );
  });

  it(`independent brand ${brand}: all five readers reject a foreign native job instead of choosing another record`, async () => {
    const f = await fixture(brand),
      foreign = await fixture((brand + 1) % 3);
    for (const [, reader] of readers)
      await expect(reader(f.sources, foreign.job, f.gate)).rejects.toThrow();
    expect(() =>
      resolveSavedWorkbenchSelection(f.sources, foreign.job, 'finance'),
    ).toThrow();
    expect(() =>
      resolveSavedWorkbenchSelection(
        { ...f.sources, operations: foreign.sources.operations },
        f.job,
      ),
    ).toThrow();
  });
}

it('independent concurrency: original task custody owns one append while read-only reviews own no second attempt', async () => {
  const f = await fixture(),
    original = await readTaskCorrectionReview(f.sources, f.job, f.gate);
  const record = vi.spyOn(f.sources.estimates, 'recordTime');
  const results = await Promise.allSettled([
    saveTaskCorrectionReview(original, taskInput(original), true),
    saveTaskCorrectionReview(original, taskInput(original), true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(record).toHaveBeenCalledTimes(1);
  const [a, b] = await Promise.all([
    readTaskCustodyReview(f.sources, f.job, f.gate),
    readTaskCustodyReview(f.sources, f.job, f.gate),
  ]);
  expect(a.evidence.receipt).toEqual(b.evidence.receipt);
  expect(a.evidence.status).toBe('KNOWN_SAVED');
  expect(record).toHaveBeenCalledTimes(1);
});

it('independent uncertainty: lost native review ACK remains UNKNOWN after job handoff and fresh wrappers without replay', async () => {
  const f = await fixture(),
    original = await readTaskCorrectionReview(f.sources, f.job, f.gate);
  const native = f.sources.estimates.reviewTime.bind(f.sources.estimates);
  const lost = vi
    .spyOn(f.sources.estimates, 'reviewTime')
    .mockImplementation(async (...args) => {
      await native(...args);
      throw Error('Independent lost review ACK');
    });
  await expect(
    saveTaskCorrectionReview(original, taskInput(original), true),
  ).rejects.toThrow();
  lost.mockRestore();
  const record = vi.spyOn(f.sources.estimates, 'recordTime');
  expect(resolveSavedWorkbenchSelection(f.sources, f.job, 'field')).toEqual({
    job_id: f.job,
    tab: 'field',
  });
  const current = inspectTaskCustodyReview(
    await readTaskCustodyReview(f.sources, f.job, f.gate),
  );
  expect(current.status).toBe('HELD_UNKNOWN');
  expect(current.receipt.observed).toBe('EXACT_RESULT_OBSERVED');
  expect(current.recorded?.corrects_id).toBe(current.receipt.source_id);
  await expect(
    saveTaskCorrectionReview(
      await readTaskCorrectionReview(f.sources, f.job, f.gate),
      taskInput(original),
      true,
    ),
  ).rejects.toThrow();
  expect(record).not.toHaveBeenCalled();
});

it('independent finance navigation: an ambiguous callback remains under original UNKNOWN across fresh coverage wrappers', async () => {
  const f = await fixture(),
    cost = await readCostCoveragePath(f.sources, f.job, f.gate);
  const callback = vi.fn(async () => {
    throw Error('Independent lost navigation ACK');
  });
  expect(
    (
      await continueCostCoverageSource(cost, cost.rows[0], callback, {
        current: callback,
        generation: 0,
      })
    ).status,
  ).toBe('UNKNOWN');
  await expect(
    readCostCoveragePath({ ...f.sources }, f.job, f.gate),
  ).rejects.toThrow();
  const replacement = vi.fn();
  expect(
    (
      await continueCostCoverageSource(cost, cost.rows[0], replacement, {
        current: replacement,
        generation: 0,
      })
    ).status,
  ).toBe('UNKNOWN');
  expect(callback).toHaveBeenCalledTimes(1);
  expect(replacement).not.toHaveBeenCalled();
});

it('independent owner navigation: current recorded suggestions never recreate an ambiguous original action', async () => {
  const f = await fixture(),
    view = await readCurrentOwnerPriorities(f.sources, f.job, f.gate);
  const row = view.rows.find((r) => r.state !== 'UNKNOWN_SOURCE_UNAVAILABLE')!;
  const source = await inspectCurrentOwnerPriority(view, row.key);
  const callback = vi.fn(async () => {
    throw Error('Independent lost owner navigation ACK');
  });
  expect(
    (
      await continueCurrentOwnerPriority(view, source, callback, {
        current: callback,
        generation: 0,
      })
    ).status,
  ).toBe('UNKNOWN');
  await expect(
    readCurrentOwnerPriorities({ ...f.sources }, f.job, f.gate),
  ).rejects.toThrow();
  const replacement = vi.fn();
  expect(
    (
      await continueCurrentOwnerPriority(view, source, replacement, {
        current: replacement,
        generation: 0,
      })
    ).status,
  ).toBe('UNKNOWN');
  expect(replacement).not.toHaveBeenCalled();
});

it('independent consent withdrawal: actual recorded denial invalidates maintenance facts and changes no published customer document', async () => {
  const f = await fixture();
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    true,
    true,
  );
  const before = await readMaintenanceRequirementsReview(
      f.sources,
      f.job,
      f.gate,
    ),
    service = await readPropertyServiceContinuity(f.sources, f.job, f.gate),
    safe = JSON.stringify(service);
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  expect(() => inspectMaintenanceRequirements(before)).toThrow();
  const denied = inspectMaintenanceRequirements(
    await readMaintenanceRequirementsReview(f.sources, f.job, f.gate),
  );
  expect(denied.recorded_channel.state).toBe('RECORDED_DENIED');
  expect(denied.requirements).toMatchObject({
    purpose_consent: 'UNVERIFIED',
    suppression: 'UNVERIFIED',
    source_atomicity: 'CAPTURED_NOT_ATOMIC',
    sender_authority: 'UNVERIFIED',
  });
  expect(denied.authority.send).toBe(false);
  expect(denied.recipient).toBeNull();
  expect(denied.provider_request).toBeNull();
  expect(JSON.stringify(await refreshPropertyServiceContinuity(service))).toBe(
    safe,
  );
});

it('independent published version continuity: appended native siblings never replace immutable selected version or establish completion', async () => {
  const f = await fixture(),
    view = await readPropertyServiceContinuity(f.sources, f.job, f.gate),
    frozen = JSON.stringify(view);
  const repo = f.sources.property;
  let visit = repo.read(f.org).visits.find((v) => v.id === f.entry.visit_id)!;
  repo.revise(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Independent appended published sibling',
    internal_notes: 'PRIVATE_NEVER_CUSTOMER',
  });
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.submit(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  const published = repo.publish(f.org, visit);
  const current = await refreshPropertyServiceContinuity(view),
    status = readPropertyServiceVersionStatus(current, f.job);
  expect(status).toMatchObject({
    selected_report_id: f.entry.report_id,
    selected_published_version: 1,
    latest_available_sibling_version: 2,
    status: 'OLDER_AVAILABLE_PUBLISHED_VERSION',
    history_completeness: 'UNKNOWN',
    physical_completion: 'UNVERIFIED',
  });
  expect(JSON.stringify(view)).toBe(frozen);
  const exact = inspectPropertyServiceJob(current, f.job).history.reports.find(
    (r) => r.reference.report_id === published.id,
  )!;
  expect(
    readPropertyServiceVersionStatus(current, f.job, exact.reference).status,
  ).toBe('LATEST_IN_LOADED_PUBLISHED_SIBLINGS');
  expect(() =>
    readPropertyServiceVersionStatus(current, f.job, { ...exact.reference }),
  ).toThrow();
  expect(JSON.stringify(current)).not.toContain('PRIVATE_NEVER_CUSTOMER');
  expect(current.request_job_link).toBe(
    'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
  );
  const completion = await readPropertyServiceRequirements(
    current,
    f.job,
    exact.reference,
  );
  expect(completion.interpretation.physical_completion).toBe('UNVERIFIED');
  expect(completion.interpretation.customer_acceptance).toBe('UNVERIFIED');
  noCustomerPrivateFields(completion);
});

it.each(readers)(
  'independent default admission case %#: %s rejects before reading source getters',
  async (_name, reader) => {
    const getter = vi.fn(() => {
      throw Error('Source getter must not run');
    });
    const sources = Object.defineProperty({}, 'operations', {
      get: getter,
    }) as OperatingSources;
    await expect(reader(sources, 'untrusted-id')).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);

it.each(components)(
  'independent production-OFF case %#: %s renders no source controls or getters',
  (_name, Component) => {
    vi.stubEnv('DEV', false);
    const getter = vi.fn(() => {
      throw Error('Production source getter must not run');
    });
    const sources = Object.defineProperty({}, 'operations', {
      get: getter,
    }) as OperatingSources;
    const markup = renderToStaticMarkup(
      createElement(Component, {
        sources,
        enabled: true,
        selectedJobId: 'untrusted-id',
      }),
    );
    if (_name === 'field' || _name === 'growth') expect(markup).toBe('');
    else expect(markup).toContain('OFF');
    expect(markup).not.toContain('<button');
    expect(getter).not.toHaveBeenCalled();
  },
);

it('independent source review: all admitted author bytes are exact and original controls remain the only writers', () => {
  const manifest = JSON.parse(
    readFileSync('docs/program/CYCLE22_SOURCE_MANIFEST.json', 'utf8'),
  ) as { packages: { owned_files: { path: string; sha256: string }[] }[] };
  expect(manifest.packages).toHaveLength(5);
  for (const pack of manifest.packages) {
    expect(pack.owned_files).toHaveLength(5);
    for (const file of pack.owned_files)
      expect(
        createHash('sha256').update(readFileSync(file.path)).digest('hex'),
      ).toBe(file.sha256);
  }
  for (const [file, original] of [
    ['TaskCustodyReview', 'TaskCorrectionReview'],
    ['CostCoveragePath', 'CostCorrectionReview'],
    ['PropertyServiceContinuity', 'PublishedServiceNavigator'],
    ['MaintenanceRequirementsReview', 'MaintenancePlanCorrection'],
    ['CurrentOwnerPriorities', 'RecordedOwnerActions'],
  ]) {
    const source = readFileSync(`src/components/workflows/${file}.tsx`, 'utf8');
    expect(source).toContain(`<${original}`);
  }
  const source = readFileSync(
    'src/components/workflows/OperatingCenterCycleFifteen.tsx',
    'utf8',
  );
  expect(source).toContain(
    'const [requirements, setRequirements] = useState(false)',
  );
  expect(source).toContain('requirements || corrections');
  expect(source).toContain('? prepareCorrectionPreviewSources');
  for (const file of [
    'task-custody-review',
    'cost-coverage-path',
    'property-service-continuity',
    'maintenance-requirements-review',
    'current-owner-priorities',
  ]) {
    const module = readFileSync(`src/lib/workflows/${file}.ts`, 'utf8');
    expect(module).not.toMatch(
      /\b(localStorage|indexedDB|sessionStorage|fetch|restoreCanonical|new Phase3Repository|new PropertyRepository)\b/,
    );
  }
});
